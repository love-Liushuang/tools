export const FFMPEG_ASSET_CONFIG = {
  coreURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js',
  wasmURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm'
};

let ffmpegInstance = null;
let ffmpegLoadPromise = null;
let ffmpegBlobAssetConfig = null;
let ffmpegBlobAssetPromise = null;

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

async function toBlobURL(url, mimeType, onProgress) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`FFmpeg 核心文件加载失败：${url}`);
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
}

async function ensureFFmpegBlobAssets({ onAssetStageChange, onAssetProgress } = {}) {
  if (ffmpegBlobAssetConfig) {
    return ffmpegBlobAssetConfig;
  }

  if (!ffmpegBlobAssetPromise) {
    ffmpegBlobAssetPromise = (async () => {
      onAssetStageChange?.('正在下载 FFmpeg Core 脚本...');
      const coreURL = await toBlobURL(
        FFMPEG_ASSET_CONFIG.coreURL,
        'text/javascript',
        (progress) => onAssetProgress?.(progress * 0.15)
      );

      onAssetStageChange?.('正在下载 FFmpeg WebAssembly...');
      const wasmURL = await toBlobURL(
        FFMPEG_ASSET_CONFIG.wasmURL,
        'application/wasm',
        (progress) => onAssetProgress?.(0.15 + progress * 0.85)
      );

      onAssetProgress?.(1);
      ffmpegBlobAssetConfig = { coreURL, wasmURL };
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
  }

  ffmpegBlobAssetConfig = null;
  ffmpegBlobAssetPromise = null;
}

export async function ensureFFmpegLoaded(options = {}) {
  if (ffmpegInstance?.loaded) {
    return ffmpegInstance;
  }

  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = (async () => {
      const { FFmpeg } = await getFFmpegModule();
      const blobAssetConfig = await ensureFFmpegBlobAssets(options);
      options.onAssetStageChange?.('正在初始化 FFmpeg 引擎...');
      const ffmpeg = new FFmpeg();
      await ffmpeg.load(blobAssetConfig);
      options.onAssetProgress?.(1);
      ffmpegInstance = ffmpeg;
      return ffmpeg;
    })().catch((error) => {
      ffmpegLoadPromise = null;
      ffmpegInstance = null;
      revokeFFmpegBlobAssets();
      throw error;
    });
  }

  return ffmpegLoadPromise;
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
