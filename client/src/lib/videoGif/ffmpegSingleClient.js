import {
  ensureFFmpegClassWorkerURL,
  revokeFFmpegClassWorkerURL
} from './ffmpegClassWorker';
import { createFFmpegClient } from './createFFmpegClient';

export const FFMPEG_SINGLE_ASSET_CONFIG = {
  coreURLs: [
    'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js',
    'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js'
  ],
  wasmURLs: [
    'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm',
    'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm'
  ]
};

const ffmpegSingleClient = createFFmpegClient({
  assetConfig: [
    {
      key: 'coreURL',
      urls: FFMPEG_SINGLE_ASSET_CONFIG.coreURLs,
      mimeType: 'text/javascript',
      assetName: 'Core 脚本',
      stageLabel: '正在下载 Core 脚本...',
      fallbackStageLabel: 'Core 主源较慢，正在切换备用源...'
    },
    {
      key: 'wasmURL',
      urls: FFMPEG_SINGLE_ASSET_CONFIG.wasmURLs,
      mimeType: 'application/wasm',
      assetName: 'WebAssembly',
      stageLabel: '正在下载 WebAssembly...',
      fallbackStageLabel: 'WebAssembly 主源较慢，正在切换备用源...'
    }
  ],
  getExtraBlobAssetConfig: () => ({
    classWorkerURL: ensureFFmpegClassWorkerURL()
  }),
  onRevokeBlobAssets: revokeFFmpegClassWorkerURL
});

export const ensureFFmpegLoaded = ffmpegSingleClient.ensureFFmpegLoaded;
export const terminateFFmpeg = ffmpegSingleClient.terminateFFmpeg;
export const convertVideoFileToAnimatedImage = ffmpegSingleClient.convertVideoFileToAnimatedImage;

async function safeDelete(ffmpeg, path) {
  try {
    await ffmpeg.deleteFile(path);
  } catch (error) {
    // A failed conversion may not have created every temporary file.
  }
}

/**
 * Reuse the existing single-thread FFmpeg runtime for decoded NCM audio that
 * is not already MP3. MP3 sources bypass this path to avoid quality loss.
 */
export async function convertAudioFileToMp3({
  audio,
  inputFormat,
  bitrate = 320,
  onStageChange,
  onProgress
}) {
  const ffmpeg = await ensureFFmpegLoaded({
    onAssetStageChange: onStageChange,
    onAssetProgress: onProgress
  });
  const jobId = `ncm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const safeFormat = ['flac', 'aac', 'ogg'].includes(inputFormat) ? inputFormat : 'audio';
  const inputName = `${jobId}-input.${safeFormat}`;
  const outputName = `${jobId}-output.mp3`;
  const progressHandler = ({ progress }) => onProgress?.(progress);

  ffmpeg.on('progress', progressHandler);
  await ffmpeg.writeFile(inputName, audio);

  try {
    onStageChange?.(`正在将 ${inputFormat.toUpperCase()} 转码为 MP3...`);
    const code = await ffmpeg.exec([
      '-i', inputName,
      '-vn',
      '-map_metadata', '-1',
      '-c:a', 'libmp3lame',
      '-b:a', `${bitrate}k`,
      '-id3v2_version', '3',
      outputName
    ]);
    if (code !== 0) {
      throw new Error('音频转码失败，请确认文件完整后重试。');
    }

    const output = await ffmpeg.readFile(outputName);
    if (!(output instanceof Uint8Array)) {
      throw new Error('MP3 输出读取失败，请重试。');
    }
    return output;
  } finally {
    ffmpeg.off('progress', progressHandler);
    await safeDelete(ffmpeg, inputName);
    await safeDelete(ffmpeg, outputName);
  }
}
