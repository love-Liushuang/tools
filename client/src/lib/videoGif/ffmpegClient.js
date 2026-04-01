import {
  ensureFFmpegClassWorkerURL,
  revokeFFmpegClassWorkerURL
} from './ffmpegClassWorker';

export const FFMPEG_ASSET_CONFIG = {
  coreURLs: [
    'https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.10/dist/esm/ffmpeg-core.js',
    'https://unpkg.com/@ffmpeg/core-mt@0.12.10/dist/esm/ffmpeg-core.js'
  ],
  wasmURLs: [
    'https://unpkg.com/@ffmpeg/core-mt@0.12.10/dist/esm/ffmpeg-core.wasm'
  ],
  workerURLs: [
    'https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.10/dist/esm/ffmpeg-core.worker.js',
    'https://unpkg.com/@ffmpeg/core-mt@0.12.10/dist/esm/ffmpeg-core.worker.js'
  ]
};

let ffmpegInstance = null;
let ffmpegLoadPromise = null;
let ffmpegBlobAssetConfig = null;
let ffmpegBlobAssetPromise = null;
let ffmpegLoadState = {
  stage: '',
  progress: 0
};

const ffmpegStageObservers = new Set();
const ffmpegProgressObservers = new Set();

function sanitizeBaseName(filename) {
  return String(filename || 'video')
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w\u4e00-\u9fa5.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'video';
}

function inferExtension(file) {
  const matched = String(file?.name || '').match(/(\.[a-z0-9]+)$/i);
  return matched ? matched[1].toLowerCase() : '.mp4';
}

function formatTimeArg(value) {
  return Number(value || 0).toFixed(3);
}

async function getFFmpegModule() {
  return import('@ffmpeg/ffmpeg');
}

function resetFFmpegLoadState() {
  ffmpegLoadState = {
    stage: '',
    progress: 0
  };
}

function publishFFmpegStage(stage, progress = 0) {
  ffmpegLoadState = {
    stage,
    progress
  };

  ffmpegStageObservers.forEach((observer) => {
    observer(stage);
  });

  ffmpegProgressObservers.forEach((observer) => {
    observer(progress);
  });
}

function publishFFmpegProgress(progress) {
  ffmpegLoadState = {
    ...ffmpegLoadState,
    progress
  };

  ffmpegProgressObservers.forEach((observer) => {
    observer(progress);
  });
}

function subscribeFFmpegLoad(options = {}) {
  const stageObserver = typeof options.onAssetStageChange === 'function'
    ? options.onAssetStageChange
    : null;
  const progressObserver = typeof options.onAssetProgress === 'function'
    ? options.onAssetProgress
    : null;

  if (stageObserver) {
    ffmpegStageObservers.add(stageObserver);
  }

  if (progressObserver) {
    ffmpegProgressObservers.add(progressObserver);
  }

  if (ffmpegLoadState.stage) {
    stageObserver?.(ffmpegLoadState.stage);
    progressObserver?.(ffmpegLoadState.progress);
  }

  return () => {
    if (stageObserver) {
      ffmpegStageObservers.delete(stageObserver);
    }

    if (progressObserver) {
      ffmpegProgressObservers.delete(progressObserver);
    }
  };
}

function assertMultiThreadEnvironment() {
  if (typeof window !== 'undefined' && !window.crossOriginIsolated) {
    throw new Error('当前页面未启用跨源隔离，无法启动多线程 FFmpeg。请直接刷新当前工具页后重试。');
  }
}

async function toBlobURL(url, mimeType, onProgress) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`核心文件加载失败：${url}`);
    }

    const total = Number(response.headers.get('content-length')) || 0;

    if (!response.body) {
      const buffer = await response.arrayBuffer();
      onProgress?.(1);
      return URL.createObjectURL(new Blob([buffer], { type: mimeType }));
    }

    const reader = response.body.getReader();
    const chunks = [];
    let loaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (value) {
        chunks.push(value);
        loaded += value.byteLength;
        if (total > 0) {
          onProgress?.(loaded / total);
        }
      }
    }

    if (total <= 0) {
      onProgress?.(1);
    }

    const buffer = new Uint8Array(loaded);
    let offset = 0;
    chunks.forEach((chunk) => {
      buffer.set(chunk, offset);
      offset += chunk.byteLength;
    });

    return URL.createObjectURL(new Blob([buffer], { type: mimeType }));
  } catch (error) {
    throw error;
  }
}

async function toBlobURLWithFallback(urls, mimeType, onProgress, {
  onFallbackAttempt,
  assetName
} = {}) {
  const errors = [];

  for (let index = 0; index < urls.length; index += 1) {
    const url = urls[index];
    try {
      if (index > 0) {
        onFallbackAttempt?.(url, index);
      }
      return await toBlobURL(url, mimeType, onProgress);
    } catch (error) {
      errors.push(error?.message || String(error));
      onProgress?.(0);
    }
  }

  throw new Error(`${assetName || '资源'} 加载失败：${errors.join('；')}`);
}

async function ensureFFmpegBlobAssets({ onAssetStageChange, onAssetProgress } = {}) {
  if (ffmpegBlobAssetConfig) {
    return ffmpegBlobAssetConfig;
  }

  if (!ffmpegBlobAssetPromise) {
    ffmpegBlobAssetPromise = (async () => {
      publishFFmpegStage('正在下载 Core 脚本...');
      const coreURL = await toBlobURLWithFallback(
        FFMPEG_ASSET_CONFIG.coreURLs,
        'text/javascript',
        (progress) => publishFFmpegProgress(progress),
        {
          assetName: 'Core 脚本',
          onFallbackAttempt: () => {
            publishFFmpegStage('Core 主源较慢，正在切换备用源...');
          }
        }
      );

      publishFFmpegStage('正在下载 Worker...');
      const workerURL = await toBlobURLWithFallback(
        FFMPEG_ASSET_CONFIG.workerURLs,
        'text/javascript',
        (progress) => publishFFmpegProgress(progress),
        {
          assetName: 'Worker',
          onFallbackAttempt: () => {
            publishFFmpegStage('Worker 主源较慢，正在切换备用源...');
          }
        }
      );

      publishFFmpegStage('正在下载 WebAssembly...');
      const wasmURL = await toBlobURLWithFallback(
        FFMPEG_ASSET_CONFIG.wasmURLs,
        'application/wasm',
        (progress) => publishFFmpegProgress(progress),
        {
          assetName: 'WebAssembly',
          onFallbackAttempt: () => {
            publishFFmpegStage('WebAssembly 主源较慢，正在切换备用源...');
          }
        }
      );
      const classWorkerURL = ensureFFmpegClassWorkerURL();

      publishFFmpegProgress(1);
      ffmpegBlobAssetConfig = { coreURL, wasmURL, workerURL, classWorkerURL };
      return ffmpegBlobAssetConfig;
    })().catch((error) => {
      ffmpegBlobAssetPromise = null;
      ffmpegBlobAssetConfig = null;
      throw error;
    });
  }

  return ffmpegBlobAssetPromise;
}

function revokeFFmpegBlobAssets() {
  if (ffmpegBlobAssetConfig) {
    URL.revokeObjectURL(ffmpegBlobAssetConfig.coreURL);
    URL.revokeObjectURL(ffmpegBlobAssetConfig.wasmURL);
    URL.revokeObjectURL(ffmpegBlobAssetConfig.workerURL);
  }

  revokeFFmpegClassWorkerURL();
  ffmpegBlobAssetConfig = null;
  ffmpegBlobAssetPromise = null;
}

export async function ensureFFmpegLoaded(options = {}) {
  if (ffmpegInstance?.loaded) {
    return ffmpegInstance;
  }

  const unsubscribe = subscribeFFmpegLoad(options);

  try {
    if (!ffmpegLoadPromise) {
      resetFFmpegLoadState();
      ffmpegLoadPromise = (async () => {
        assertMultiThreadEnvironment();
        const { FFmpeg } = await getFFmpegModule();
        const blobAssetConfig = await ensureFFmpegBlobAssets();
        publishFFmpegStage('正在初始化 引擎...');
        const ffmpeg = new FFmpeg();
        await ffmpeg.load(blobAssetConfig);
        publishFFmpegProgress(1);
        ffmpegInstance = ffmpeg;
        return ffmpeg;
      })().catch((error) => {
        ffmpegLoadPromise = null;
        ffmpegInstance = null;
        revokeFFmpegBlobAssets();
        resetFFmpegLoadState();
        throw error;
      });
    }

    return await ffmpegLoadPromise;
  } finally {
    unsubscribe();
  }
}

async function safeDelete(ffmpeg, path) {
  if (!path) {
    return;
  }

  try {
    await ffmpeg.deleteFile(path);
  } catch (error) {
    // Ignore missing files left from partial runs.
  }
}

export async function terminateFFmpeg() {
  if (ffmpegInstance) {
    ffmpegInstance.terminate();
  }
  ffmpegInstance = null;
  ffmpegLoadPromise = null;
  revokeFFmpegBlobAssets();
  resetFFmpegLoadState();
}

export async function convertVideoFileToAnimatedImage({
  file,
  startTime,
  duration,
  fps,
  width,
  outputFormat = 'gif',
  webpQuality = 75,
  loop = 0,
  onStageChange
}) {
  const ffmpeg = await ensureFFmpegLoaded();
  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const inputName = `${jobId}-input${inferExtension(file)}`;
  const paletteName = `${jobId}-palette.png`;
  const normalizedFormat = outputFormat === 'webp' ? 'webp' : 'gif';
  const outputFsName = `${jobId}-output.${normalizedFormat}`;
  const outputName = `${sanitizeBaseName(file?.name)}.${normalizedFormat}`;

  const paletteFilter = `fps=${fps},scale=${width}:-1:flags=bicubic,palettegen=max_colors=128:stats_mode=diff`;
  const gifFilter = `fps=${fps},scale=${width}:-1:flags=bicubic[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`;
  const webpFilter = `fps=${fps},scale=${width}:-2:flags=bicubic`;

  await ffmpeg.writeFile(inputName, new Uint8Array(await file.arrayBuffer()));

  try {
    let code = 0;

    if (normalizedFormat === 'gif') {
      onStageChange?.('正在生成 GIF 调色板...');
      code = await ffmpeg.exec([
        '-ss', formatTimeArg(startTime),
        '-t', formatTimeArg(duration),
        '-i', inputName,
        '-vf', paletteFilter,
        paletteName
      ]);

      if (code !== 0) {
        throw new Error('调色板生成失败，请缩短时长或降低输出宽度后重试。');
      }

      onStageChange?.('正在合成 GIF...');
      code = await ffmpeg.exec([
        '-ss', formatTimeArg(startTime),
        '-t', formatTimeArg(duration),
        '-i', inputName,
        '-i', paletteName,
        '-lavfi', gifFilter,
        '-loop', String(loop),
        outputFsName
      ]);

      if (code !== 0) {
        throw new Error('GIF 生成失败，请尝试降低 FPS 或缩短片段时长。');
      }
    } else {
      onStageChange?.('正在编码 Animated WebP...');
      code = await ffmpeg.exec([
        '-ss', formatTimeArg(startTime),
        '-t', formatTimeArg(duration),
        '-i', inputName,
        '-vf', webpFilter,
        '-an',
        '-c:v', 'libwebp',
        '-lossless', '0',
        '-compression_level', '6',
        '-q:v', String(webpQuality),
        '-preset', 'picture',
        '-loop', String(loop),
        '-vsync', '0',
        outputFsName
      ]);

      if (code !== 0) {
        throw new Error('Animated WebP 生成失败，请尝试降低质量、FPS 或缩短片段时长。');
      }
    }

    const data = await ffmpeg.readFile(outputFsName);
    if (!(data instanceof Uint8Array)) {
      throw new Error('输出文件读取失败，请重试。');
    }

    return {
      outputName,
      outputFormat: normalizedFormat,
      mimeType: normalizedFormat === 'webp' ? 'image/webp' : 'image/gif',
      blob: new Blob([data], { type: normalizedFormat === 'webp' ? 'image/webp' : 'image/gif' })
    };
  } finally {
    await safeDelete(ffmpeg, inputName);
    if (normalizedFormat === 'gif') {
      await safeDelete(ffmpeg, paletteName);
    }
    await safeDelete(ffmpeg, outputFsName);
  }
}
