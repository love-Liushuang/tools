import { useEffect, useMemo, useRef, useState } from 'react';
import ToolPageShell from '../components/ToolPageShell';
import {
  convertVideoFileToAnimatedImage,
  ensureFFmpegLoaded,
//   FFMPEG_ASSET_CONFIG,
  terminateFFmpeg
} from '../lib/videoGif/ffmpegClient';

const DEFAULT_SETTINGS = {
  fps: 8,
  width: 320,
  startTime: 0,
  clipDuration: 4
};

const MAX_CLIP_DURATION = 20;
const MAX_OUTPUT_WIDTH = 720;
const MAX_LOG_LINES = 24;
const DEFAULT_OUTPUT_FORMAT = 'webp';
const DEFAULT_WEBP_QUALITY = 75;
const PARAMETER_PRESETS = [
  { key: 'size', label: '体积优先', fps: 8, width: 320, clipDuration: 3 },
  { key: 'balanced', label: '平衡', fps: 10, width: 400, clipDuration: 4 },
  { key: 'quality', label: '清晰优先', fps: 12, width: 480, clipDuration: 6 }
];
const OUTPUT_OPTIONS = [
  { key: 'webp', label: 'Animated WebP', desc: '更适合网页，通常比 GIF 更小' },
  { key: 'gif', label: 'GIF', desc: '兼容性更广，但通常更大' }
];

function prettyBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function prettySeconds(value) {
  return `${Number(value || 0).toFixed(1)}s`;
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function formatProgress(progress) {
  const ratio = clampNumber(progress, 0, 1, 0);
  return `${Math.round(ratio * 100)}%`;
}

function getErrorMessage(error) {
  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (error && typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }

  return '动图生成失败。';
}

function describeSizeRatio(resultSize, sourceSize) {
  if (!sourceSize || !resultSize) {
    return '无法比较';
  }

  const ratio = resultSize / sourceSize;
  if (ratio >= 1) {
    return `约为原视频的 ${ratio.toFixed(1)} 倍`;
  }

  return `约为原视频的 ${(ratio * 100).toFixed(0)}%`;
}

function normalizeSecondsForField(value) {
  const safeValue = Math.max(0.2, Number(value) || DEFAULT_SETTINGS.clipDuration);
  return Number(safeValue.toFixed(1));
}

function getDefaultClipDurationForFormat(format, duration) {
  const safeDuration = Math.max(0.2, Number(duration) || DEFAULT_SETTINGS.clipDuration);
  if (format === 'webp') {
    return normalizeSecondsForField(safeDuration);
  }

  return normalizeSecondsForField(Math.min(DEFAULT_SETTINGS.clipDuration, safeDuration));
}

function normalizeIntegerInput(value, min, max, fallback) {
  if (value === '') {
    return '';
  }

  return Math.round(clampNumber(value, min, max, fallback));
}

function normalizeDecimalInput(value, min, max, fallback, digits = 1) {
  if (value === '') {
    return '';
  }

  return Number(clampNumber(value, min, max, fallback).toFixed(digits));
}

function getStageProgressRange(stage) {
  if (stage.includes('下载 FFmpeg Core')) {
    return [0.02, 0.1];
  }

  if (stage.includes('下载 FFmpeg WebAssembly')) {
    return [0.1, 0.32];
  }

  if (stage.includes('初始化 FFmpeg')) {
    return [0.32, 0.4];
  }

  if (stage.includes('调色板')) {
    return [0.4, 0.62];
  }

  if (stage.includes('合成 GIF')) {
    return [0.62, 0.95];
  }

  if (stage.includes('Animated WebP')) {
    return [0.4, 0.95];
  }

  return [0, 1];
}

function VideoToGifPage() {
  const inputRef = useRef(null);
  const progressHandlerRef = useRef(null);
  const logHandlerRef = useRef(null);
  const stageRef = useRef('等待开始');
  const stageProgressRangeRef = useRef([0, 1]);
  const jobTokenRef = useRef(0);
  const clipDurationCustomizedRef = useRef(false);
  const clipDurationMemoryRef = useRef({
    gif: DEFAULT_SETTINGS.clipDuration,
    webp: DEFAULT_SETTINGS.clipDuration
  });
  const prevOutputFormatRef = useRef(DEFAULT_OUTPUT_FORMAT);

  const [file, setFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [metadata, setMetadata] = useState(null);
  const [fps, setFps] = useState(DEFAULT_SETTINGS.fps);
  const [width, setWidth] = useState(DEFAULT_SETTINGS.width);
  const [startTime, setStartTime] = useState(DEFAULT_SETTINGS.startTime);
  const [clipDuration, setClipDuration] = useState(DEFAULT_SETTINGS.clipDuration);
  const [outputFormat, setOutputFormat] = useState(DEFAULT_OUTPUT_FORMAT);
  const [webpQuality, setWebpQuality] = useState(DEFAULT_WEBP_QUALITY);
  const [engineReady, setEngineReady] = useState(false);
  const [engineLoading, setEngineLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [logLines, setLogLines] = useState([]);
  const clipDurationLimit = metadata && outputFormat === 'webp'
    ? Math.max(MAX_CLIP_DURATION, metadata.duration)
    : MAX_CLIP_DURATION;
  const clipRuleLabel = outputFormat === 'webp'
    ? '默认全长'
    : `${MAX_CLIP_DURATION}s 上限`;

  const applyPreset = (preset) => {
    clipDurationCustomizedRef.current = true;
    const nextClipDuration = normalizeSecondsForField(
      Math.min(preset.clipDuration, Math.max(0.2, metadata?.duration || preset.clipDuration))
    );
    clipDurationMemoryRef.current[outputFormat] = nextClipDuration;
    setFps(preset.fps);
    setWidth(Math.min(preset.width, metadata?.width || preset.width));
    setClipDuration(nextClipDuration);
  };

  useEffect(() => {
    if (!file) {
      setVideoUrl('');
      return undefined;
    }

    const nextUrl = URL.createObjectURL(file);
    setVideoUrl(nextUrl);

    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [file]);

  useEffect(() => {
    let cancelled = false;

    setEngineLoading(true);
    ensureFFmpegLoaded()
      .then(() => {
        if (cancelled) {
          return;
        }
        setEngineReady(true);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setEngineReady(false);
      })
      .finally(() => {
        if (cancelled) {
          return;
        }
        setEngineLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      jobTokenRef.current += 1;
      progressHandlerRef.current = null;
      logHandlerRef.current = null;
      void terminateFFmpeg();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (result?.url) {
        URL.revokeObjectURL(result.url);
      }
    };
  }, [result]);

  useEffect(() => {
    if (!metadata) {
      return;
    }

    const defaultGifDuration = getDefaultClipDurationForFormat('gif', metadata.duration);
    const defaultWebpDuration = getDefaultClipDurationForFormat('webp', metadata.duration);

    if (!clipDurationCustomizedRef.current) {
      clipDurationMemoryRef.current = {
        gif: defaultGifDuration,
        webp: defaultWebpDuration
      };
      setClipDuration(outputFormat === 'webp' ? defaultWebpDuration : defaultGifDuration);
      prevOutputFormatRef.current = outputFormat;
      return;
    }

    if (prevOutputFormatRef.current !== outputFormat) {
      const nextClipDuration = outputFormat === 'webp'
        ? normalizeSecondsForField(clipDurationMemoryRef.current.webp || defaultWebpDuration)
        : normalizeSecondsForField(Math.min(
            clipDurationMemoryRef.current.gif || defaultGifDuration,
            MAX_CLIP_DURATION,
            metadata.duration || MAX_CLIP_DURATION
          ));

      clipDurationMemoryRef.current[outputFormat] = nextClipDuration;
      setClipDuration(nextClipDuration);
      prevOutputFormatRef.current = outputFormat;
      return;
    }

    if (outputFormat === 'gif' && Number(clipDuration) > MAX_CLIP_DURATION) {
      const nextClipDuration = normalizeSecondsForField(
        Math.min(MAX_CLIP_DURATION, metadata.duration || MAX_CLIP_DURATION)
      );
      clipDurationMemoryRef.current.gif = nextClipDuration;
      setClipDuration(nextClipDuration);
    }
  }, [clipDuration, metadata, outputFormat]);

  const summaryList = useMemo(() => {
    if (!metadata) {
      return [];
    }

    return [
      { label: '视频时长', value: prettySeconds(metadata.duration) },
      { label: '原始尺寸', value: `${metadata.width} × ${metadata.height}` },
      { label: '当前片段', value: `${prettySeconds(Number(startTime))} - ${prettySeconds(Number(startTime) + Number(clipDuration))}` },
      { label: '输出尺寸', value: `${Number(width)}px` }
    ];
  }, [clipDuration, metadata, startTime, width]);

  const clearResult = () => {
    setResult((current) => {
      if (current?.url) {
        URL.revokeObjectURL(current.url);
      }
      return null;
    });
  };

  const updateStageProgress = (stage, rawProgress = 0) => {
    const [start, end] = getStageProgressRange(stage);
    stageRef.current = stage;
    stageProgressRangeRef.current = [start, end];

    const normalized = clampNumber(rawProgress, 0, 1, 0);
    const mappedProgress = start + (end - start) * normalized;

    setProgress((current) => Math.max(current, mappedProgress));
    setStatusText(`${stage} ${formatProgress(mappedProgress)}`);
  };

  const handleFileSelect = (nextFile) => {
    clearResult();
    setError('');
    setStatusText('');
    setProgress(0);
    setLogLines([]);
    setFile(nextFile || null);
    setMetadata(null);
    setStartTime(DEFAULT_SETTINGS.startTime);
    clipDurationCustomizedRef.current = false;
    clipDurationMemoryRef.current = {
      gif: DEFAULT_SETTINGS.clipDuration,
      webp: DEFAULT_SETTINGS.clipDuration
    };
    prevOutputFormatRef.current = DEFAULT_OUTPUT_FORMAT;
    setClipDuration(DEFAULT_SETTINGS.clipDuration);
    setWidth(DEFAULT_SETTINGS.width);
    setOutputFormat(DEFAULT_OUTPUT_FORMAT);
    setWebpQuality(DEFAULT_WEBP_QUALITY);

    if (!nextFile) {
      return;
    }

    setStatusText(`已选择视频：${nextFile.name}`);
  };

  const onFileChange = (event) => {
    const nextFile = event.target.files?.[0] || null;
    handleFileSelect(nextFile);
  };

  const handleReset = async () => {
    if (inputRef.current) {
      inputRef.current.value = '';
    }

    clearResult();
    setFile(null);
    setMetadata(null);
    setError('');
    setStatusText('');
    setProgress(0);
    setLogLines([]);
    clipDurationCustomizedRef.current = false;
    clipDurationMemoryRef.current = {
      gif: DEFAULT_SETTINGS.clipDuration,
      webp: DEFAULT_SETTINGS.clipDuration
    };
    prevOutputFormatRef.current = DEFAULT_OUTPUT_FORMAT;
    setOutputFormat(DEFAULT_OUTPUT_FORMAT);
    setWebpQuality(DEFAULT_WEBP_QUALITY);

    if (busy) {
      jobTokenRef.current += 1;
      await terminateFFmpeg();
      progressHandlerRef.current = null;
      setBusy(false);
      setEngineReady(false);
      setEngineLoading(false);
    }
  };

  const ensureProgressBinding = async () => {
    const ffmpeg = await ensureFFmpegLoaded({
      onAssetStageChange: (message) => {
        updateStageProgress(message, 0);
      },
      onAssetProgress: (nextProgress) => {
        const [start, end] = stageProgressRangeRef.current;
        const mappedProgress = start + (end - start) * clampNumber(nextProgress, 0, 1, 0);
        setProgress((current) => Math.max(current, mappedProgress));
        setStatusText(`${stageRef.current} ${formatProgress(mappedProgress)}`);
      }
    });

    if (!progressHandlerRef.current) {
      progressHandlerRef.current = ({ progress: nextProgress }) => {
        const [start, end] = stageProgressRangeRef.current;
        const normalized = clampNumber(nextProgress, 0, 1, 0);
        const mappedProgress = start + (end - start) * normalized;
        setProgress((current) => Math.max(current, mappedProgress));
        setStatusText(`${stageRef.current} ${formatProgress(mappedProgress)}`);
      };
    }

    ffmpeg.off('progress', progressHandlerRef.current);
    ffmpeg.on('progress', progressHandlerRef.current);

    if (!logHandlerRef.current) {
      logHandlerRef.current = ({ type, message }) => {
        const text = String(message || '').trim();
        if (!text) {
          return;
        }

        const line = type === 'stderr' ? text : `[${type}] ${text}`;
        setLogLines((current) => {
          if (current[current.length - 1] === line) {
            return current;
          }

          const next = [...current, line];
          return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next;
        });
      };
    }

    ffmpeg.off('log', logHandlerRef.current);
    ffmpeg.on('log', logHandlerRef.current);

    return ffmpeg;
  };

  const handleConvert = async () => {
    if (!file) {
      setError('请先选择一个视频文件。');
      return;
    }

    const safeFps = Math.round(clampNumber(fps, 1, 20, DEFAULT_SETTINGS.fps));
    const safeWidth = Math.round(clampNumber(width, 80, MAX_OUTPUT_WIDTH, DEFAULT_SETTINGS.width));
    const safeStart = clampNumber(startTime, 0, 3600, DEFAULT_SETTINGS.startTime);
    const safeDuration = clampNumber(
      clipDuration,
      0.2,
      clipDurationLimit,
      getDefaultClipDurationForFormat(outputFormat, metadata?.duration)
    );
    const safeWebpQuality = Math.round(clampNumber(webpQuality, 20, 100, DEFAULT_WEBP_QUALITY));
    const jobToken = jobTokenRef.current + 1;
    jobTokenRef.current = jobToken;

    if (metadata && safeStart >= metadata.duration) {
      setError('开始时间不能大于或等于视频总时长。');
      return;
    }

    if (metadata && safeStart + safeDuration > metadata.duration + 0.05) {
      setError('截取时长超出视频范围，请缩短片段时长或调整开始时间。');
      return;
    }

    clearResult();
    setBusy(true);
    setError('');
    setProgress(0);
    setLogLines([]);
    updateStageProgress('正在准备转换任务...', 0);

    try {
      await ensureProgressBinding();
      if (jobToken !== jobTokenRef.current) {
        return;
      }
      setEngineReady(true);
      setProgress((current) => Math.max(current, 0.4));

      updateStageProgress(outputFormat === 'webp' ? '正在编码 Animated WebP...' : '正在生成 GIF 调色板...', 0);
      const converted = await convertVideoFileToAnimatedImage({
        file,
        startTime: safeStart,
        duration: safeDuration,
        fps: safeFps,
        width: safeWidth,
        outputFormat,
        webpQuality: safeWebpQuality,
        onStageChange: (message) => {
          updateStageProgress(message, 0);
        }
      });
      if (jobToken !== jobTokenRef.current) {
        return;
      }

      const outputUrl = URL.createObjectURL(converted.blob);
      setResult({
        url: outputUrl,
        name: converted.outputName,
        size: converted.blob.size,
        sourceSize: file.size,
        fps: safeFps,
        width: safeWidth,
        duration: safeDuration,
        outputFormat: converted.outputFormat,
        mimeType: converted.mimeType,
        webpQuality: safeWebpQuality
      });
      setProgress(1);
      setStatusText(`${converted.outputFormat === 'webp' ? 'Animated WebP' : 'GIF'} 生成完成，可以直接预览和下载。`);
    } catch (err) {
      if (jobToken === jobTokenRef.current) {
        setError(getErrorMessage(err));
        setStatusText('');
      }
    } finally {
      if (jobToken === jobTokenRef.current) {
        setBusy(false);
      }
    }
  };

  return (
    <ToolPageShell
      title="视频转 GIF / WebP"
      desc="视频文件仅在浏览器本地读取和转换，浏览器内输出 GIF 或 Animated WebP，不上传原视频。"
    >
      <div className="video-gif-shell">
        <div className="video-gif-hero">
          <div>
            <div className="emoji-kicker">Local Video Tool</div>
            <h2>视频转动图</h2>
            <p>
              原始视频不会上传服务器。
              推荐优先输出 Animated WebP。
            </p>
          </div>

          <div className="emoji-stats-grid">
            <div className="emoji-stat-card">
              <span>核心来源</span>
              <strong>{engineReady ? '已加载' : engineLoading ? '加载中' : '官方 jsDelivr'}</strong>
            </div>
            <div className="emoji-stat-card">
              <span>片段规则</span>
              <strong>{clipRuleLabel}</strong>
            </div>
            <div className="emoji-stat-card">
              <span>最大宽度</span>
              <strong>{MAX_OUTPUT_WIDTH}px</strong>
            </div>
            <div className="emoji-stat-card">
              <span>处理模式</span>
              <strong>浏览器</strong>
            </div>
          </div>
        </div>

        <div className="video-gif-layout">
          <section className="video-gif-panel">
            <div className="video-gif-panel-head">
              <div>
                <h3>上传视频</h3>
                <p>支持本地选择，建议优先使用 MP4 / WebM / MOV。</p>
              </div>
            </div>

            <label className="video-gif-dropzone">
              <input
                ref={inputRef}
                type="file"
                accept="video/*"
                onChange={onFileChange}
                disabled={busy}
              />
              <strong>{file ? file.name : '点击选择一个视频文件'}</strong>
              <span>{file ? `${prettyBytes(file.size)} · 本地处理` : '不会上传到服务器'}</span>
            </label>

            {videoUrl ? (
              <div className="video-gif-preview-card">
                <video
                  className="video-gif-preview"
                  src={videoUrl}
                  controls
                  preload="metadata"
                  onLoadedMetadata={(event) => {
                    const current = event.currentTarget;
                    const nextMetadata = {
                      duration: current.duration || 0,
                      width: current.videoWidth || 0,
                      height: current.videoHeight || 0
                    };
                    setMetadata(nextMetadata);
                    setClipDuration(getDefaultClipDurationForFormat(outputFormat, nextMetadata.duration));
                    setWidth(Math.min(DEFAULT_SETTINGS.width, nextMetadata.width || DEFAULT_SETTINGS.width));
                  }}
                />

                {summaryList.length ? (
                  <div className="video-gif-summary-grid">
                    {summaryList.map((item) => (
                      <div key={item.label} className="video-gif-summary-item">
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="video-gif-panel">
            <div className="video-gif-panel-head">
              <div>
                <h3>输出设置</h3>
                <p>先截取短片段，再输出动图；WebP 更适合控体积。</p>
              </div>
            </div>

            <div className="video-gif-format-row">
              {OUTPUT_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={`video-gif-format-button${outputFormat === option.key ? ' is-active' : ''}`}
                  onClick={() => setOutputFormat(option.key)}
                  disabled={busy}
                >
                  <strong>{option.label}</strong>
                  <span>{option.desc}</span>
                </button>
              ))}
            </div>

            <div className="video-gif-form-grid">
              <label className="field-block">
                <span>开始时间（秒）</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  disabled={busy}
                />
              </label>

              <label className="field-block">
                <span>片段时长（秒）</span>
                <input
                  type="number"
                  min="0.2"
                  max={clipDurationLimit}
                  step="0.1"
                  value={clipDuration}
                  onChange={(event) => {
                    clipDurationCustomizedRef.current = true;
                    const nextClipDuration = normalizeDecimalInput(
                      event.target.value,
                      0.2,
                      clipDurationLimit,
                      getDefaultClipDurationForFormat(outputFormat, metadata?.duration)
                    );
                    clipDurationMemoryRef.current[outputFormat] = nextClipDuration;
                    setClipDuration(nextClipDuration);
                  }}
                  onBlur={() => {
                    setClipDuration((current) => {
                      const nextClipDuration = normalizeDecimalInput(
                        current,
                        0.2,
                        clipDurationLimit,
                        getDefaultClipDurationForFormat(outputFormat, metadata?.duration)
                      );
                      clipDurationMemoryRef.current[outputFormat] = nextClipDuration;
                      return nextClipDuration;
                    });
                  }}
                  disabled={busy}
                />
              </label>

              <label className="field-block">
                <span>输出宽度（px）</span>
                <input
                  type="number"
                  min="80"
                  max={MAX_OUTPUT_WIDTH}
                  step="10"
                  value={width}
                  onChange={(event) => setWidth(
                    normalizeIntegerInput(event.target.value, 80, MAX_OUTPUT_WIDTH, DEFAULT_SETTINGS.width)
                  )}
                  onBlur={() => setWidth((current) => normalizeIntegerInput(
                    current,
                    80,
                    MAX_OUTPUT_WIDTH,
                    DEFAULT_SETTINGS.width
                  ))}
                  disabled={busy}
                />
              </label>

              <label className="field-block">
                <span>帧率（FPS）</span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  step="1"
                  value={fps}
                  onChange={(event) => setFps(event.target.value)}
                  disabled={busy}
                />
              </label>

              {outputFormat === 'webp' ? (
                <label className="field-block">
                  <span>WebP 质量</span>
                  <input
                    type="number"
                    min="20"
                    max="100"
                    step="1"
                    value={webpQuality}
                    onChange={(event) => setWebpQuality(event.target.value)}
                    disabled={busy}
                  />
                </label>
              ) : null}
            </div>

            <div className="video-gif-preset-row">
              {PARAMETER_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  className="btn-ghost"
                  onClick={() => applyPreset(preset)}
                  disabled={busy}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="video-gif-action-row">
              <button type="button" className="primary" onClick={handleConvert} disabled={busy}>
                {busy ? '转换中...' : '开始转换'}
              </button>
              <button type="button" className="btn-ghost" onClick={handleReset} disabled={busy && !file}>
                重置
              </button>
            </div>

            <div className="video-gif-note-list">
              <p>Animated WebP 通常比 GIF 小很多，更适合网页展示；GIF 主要是兼容性更强。</p>
              <p>想控体积，优先降低片段时长、输出宽度和 FPS；一般先试 `WebP + 320px + 8 FPS + 3s`。</p>
              {/* <p>核心文件路径：`{FFMPEG_ASSET_CONFIG.coreURL}`</p>
              <p>WASM 文件路径：`{FFMPEG_ASSET_CONFIG.wasmURL}`</p>
              <p>后续如果要切到网盘直链，只需要修改这一组地址。</p> */}
            </div>

            {statusText ? (
              <div className="video-gif-status-card">
                <div className="video-gif-progress-head">
                  <strong>{statusText}</strong>
                  <span>{formatProgress(progress)}</span>
                </div>
                <div className="video-gif-progress-bar">
                  <span style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
              </div>
            ) : null}

            {error ? <p className="error">{error}</p> : null}

            {/* {logLines.length ? (
              <div className="video-gif-log-card">
                <div className="video-gif-panel-head">
                  <div>
                    <h3>转换日志</h3>
                    <p>保留最近一段 FFmpeg 输出，便于排查具体失败原因。</p>
                  </div>
                </div>
                <pre>{logLines.join('\n')}</pre>
              </div>
            ) : null} */}
          </section>
        </div>

        {result ? (
          <section className="video-gif-result-card">
            <div className="video-gif-panel-head">
              <div>
                <h3>{result.outputFormat === 'webp' ? 'Animated WebP 结果' : 'GIF 结果'}</h3>
                <p>已经在浏览器本地生成，可以直接下载。</p>
              </div>
              <a className="ghost-btn" href={result.url} download={result.name} type={result.mimeType}>
                下载 {result.outputFormat === 'webp' ? 'WebP' : 'GIF'}
              </a>
            </div>

            <div className="video-gif-result-layout">
              <div className="video-gif-result-preview">
                <img src={result.url} alt={result.name} />
              </div>

              <div className="video-gif-summary-grid">
                <div className="video-gif-summary-item">
                  <span>文件名</span>
                  <strong>{result.name}</strong>
                </div>
                <div className="video-gif-summary-item">
                  <span>输出大小</span>
                  <strong>{prettyBytes(result.size)}</strong>
                </div>
                <div className="video-gif-summary-item">
                  <span>输出格式</span>
                  <strong>{result.outputFormat === 'webp' ? 'Animated WebP' : 'GIF'}</strong>
                </div>
                <div className="video-gif-summary-item">
                  <span>相对原视频</span>
                  <strong>{describeSizeRatio(result.size, result.sourceSize)}</strong>
                </div>
                <div className="video-gif-summary-item">
                  <span>片段时长</span>
                  <strong>{prettySeconds(result.duration)}</strong>
                </div>
                <div className="video-gif-summary-item">
                  <span>参数</span>
                  <strong>{result.width}px · {result.fps} FPS</strong>
                </div>
                {result.outputFormat === 'webp' ? (
                  <div className="video-gif-summary-item">
                    <span>WebP 质量</span>
                    <strong>{result.webpQuality}</strong>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </ToolPageShell>
  );
}

export default VideoToGifPage;
