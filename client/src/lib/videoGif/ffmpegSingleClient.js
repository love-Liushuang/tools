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
