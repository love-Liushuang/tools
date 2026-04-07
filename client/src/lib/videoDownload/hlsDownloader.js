import { ensureFFmpegLoaded, terminateFFmpeg } from '../videoGif/ffmpegSingleClient';

function getPathExtension(value) {
  try {
    const pathname = new URL(value).pathname.toLowerCase();
    const match = pathname.match(/(\.[a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : '';
  } catch (error) {
    return '';
  }
}

function sanitizeFileBaseName(value) {
  return String(value || 'video')
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w\u4e00-\u9fa5.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'video';
}

async function safeDelete(ffmpeg, path) {
  if (!path) {
    return;
  }

  try {
    await ffmpeg.deleteFile(path);
  } catch (error) {
    // Ignore cleanup failures for partial jobs.
  }
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function mergeHlsToMp4({
  manifest,
  fileBaseName,
  onStageChange,
  onProgress
}) {
  if (!manifest || !manifest.isMedia) {
    throw new Error('当前链接不是可合并的媒体播放列表。');
  }

  if (!manifest.supportsBrowserMerge) {
    throw new Error('这个播放列表当前不支持浏览器端合并。');
  }

  const ffmpeg = await ensureFFmpegLoaded({
    onAssetStageChange: (stage) => onStageChange?.(stage),
    onAssetProgress: (progress) => onProgress?.(Math.max(0, Math.min(0.22, progress * 0.22)))
  });

  const jobId = `hls-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const segmentFiles = [];
  const concatFileName = `${jobId}-concat.txt`;
  const outputName = `${jobId}-output.mp4`;
  const downloadName = `${sanitizeFileBaseName(fileBaseName)}.mp4`;

  try {
    onStageChange?.('正在抓取 HLS 分片...');
    for (let index = 0; index < manifest.segments.length; index += 1) {
      const segment = manifest.segments[index];
      const response = await fetch(segment.url, {
        method: 'GET',
        redirect: 'follow'
      });

      if (!response.ok) {
        throw new Error(`分片抓取失败：HTTP ${response.status} (${segment.url})`);
      }

      const extension = getPathExtension(segment.url) || '.ts';
      const segmentFileName = `${jobId}-seg-${String(index + 1).padStart(4, '0')}${extension}`;
      const bytes = new Uint8Array(await response.arrayBuffer());
      await ffmpeg.writeFile(segmentFileName, bytes);
      segmentFiles.push(segmentFileName);

      onProgress?.(0.22 + ((index + 1) / manifest.segments.length) * 0.48);
    }

    const concatText = segmentFiles
      .map((fileName) => `file '${fileName}'`)
      .join('\n');
    await ffmpeg.writeFile(concatFileName, new TextEncoder().encode(concatText));

    onStageChange?.('正在浏览器内合并 MP4...');
    let exitCode = await ffmpeg.exec([
      '-f', 'concat',
      '-safe', '0',
      '-i', concatFileName,
      '-c', 'copy',
      '-bsf:a', 'aac_adtstoasc',
      outputName
    ]);

    if (exitCode !== 0) {
      exitCode = await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', concatFileName,
        '-c', 'copy',
        outputName
      ]);
    }

    if (exitCode !== 0) {
      throw new Error('FFmpeg 合并失败，可能是分片格式不兼容或包含额外加密。');
    }

    onProgress?.(0.96);
    onStageChange?.('正在生成下载文件...');
    const outputData = await ffmpeg.readFile(outputName);
    if (!(outputData instanceof Uint8Array)) {
      throw new Error('输出文件读取失败。');
    }

    const blob = new Blob([outputData], { type: 'video/mp4' });
    onProgress?.(1);
    return {
      blob,
      filename: downloadName,
      size: blob.size
    };
  } finally {
    await safeDelete(ffmpeg, concatFileName);
    await safeDelete(ffmpeg, outputName);
    for (const fileName of segmentFiles) {
      await safeDelete(ffmpeg, fileName);
    }
  }
}

export function saveMergedVideo(result) {
  if (!result?.blob || !result?.filename) {
    return;
  }
  triggerDownload(result.blob, result.filename);
}

export { terminateFFmpeg };
