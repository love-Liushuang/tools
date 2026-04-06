import {
  ensureFFmpegClassWorkerURL,
  revokeFFmpegClassWorkerURL
} from './ffmpegClassWorker';
import { createFFmpegClient } from './createFFmpegClient';

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

function assertMultiThreadEnvironment() {
  if (typeof window !== 'undefined' && !window.crossOriginIsolated) {
    throw new Error('当前页面未启用跨源隔离，无法启动多线程 FFmpeg。请直接刷新当前工具页后重试。');
  }
}

const ffmpegClient = createFFmpegClient({
  assetConfig: [
    {
      key: 'coreURL',
      urls: FFMPEG_ASSET_CONFIG.coreURLs,
      mimeType: 'text/javascript',
      assetName: 'Core 脚本',
      stageLabel: '正在下载 Core 脚本...',
      fallbackStageLabel: 'Core 主源较慢，正在切换备用源...'
    },
    {
      key: 'workerURL',
      urls: FFMPEG_ASSET_CONFIG.workerURLs,
      mimeType: 'text/javascript',
      assetName: 'Worker',
      stageLabel: '正在下载 Worker...',
      fallbackStageLabel: 'Worker 主源较慢，正在切换备用源...'
    },
    {
      key: 'wasmURL',
      urls: FFMPEG_ASSET_CONFIG.wasmURLs,
      mimeType: 'application/wasm',
      assetName: 'WebAssembly',
      stageLabel: '正在下载 WebAssembly...',
      fallbackStageLabel: 'WebAssembly 主源较慢，正在切换备用源...'
    }
  ],
  assertEnvironment: assertMultiThreadEnvironment,
  getExtraBlobAssetConfig: () => ({
    classWorkerURL: ensureFFmpegClassWorkerURL()
  }),
  onRevokeBlobAssets: revokeFFmpegClassWorkerURL
});

export const ensureFFmpegLoaded = ffmpegClient.ensureFFmpegLoaded;
export const terminateFFmpeg = ffmpegClient.terminateFFmpeg;
export const convertVideoFileToAnimatedImage = ffmpegClient.convertVideoFileToAnimatedImage;
