import { useEffect, useState } from 'react';
import ToolPageShell from '../components/ToolPageShell';
import {
  analyzeVideoUrl,
  downloadTextFile,
  getSourcePageDownloadSnippet,
  getSuggestedFilename,
  getVideoCaptureSnippet,
  parseCapturedPayload
} from '../lib/videoDownload/analyzer';
import {
  mergeDashStreamsToMp4,
  mergeHlsToMp4,
  saveMergedVideo,
  terminateFFmpeg
} from '../lib/videoDownload/hlsDownloader';
import { requestVideoDownloadExtension } from '../lib/videoDownload/extensionBridge';

const CAPTURE_SNIPPET = getVideoCaptureSnippet();
const EXTENSION_IMPORT_STORAGE_KEY = 'boxtoolsVideoDownloadImport';
const EXTENSION_IMPORT_MESSAGE_SOURCE = 'boxtools-video-download-extension';

function formatSeconds(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return '-';
  }

  if (value < 60) {
    return `${value.toFixed(1)} 秒`;
  }

  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${minutes} 分 ${seconds} 秒`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '-';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getAnalysisSourceLabel(source) {
  if (source === 'browser-extension') {
    return '浏览器插件';
  }

  if (source === 'capture') {
    return '页面内抓取结果';
  }

  if (source === 'blocked') {
    return '浏览器跨域受限';
  }

  if (source === 'fetch') {
    return '浏览器直接抓取';
  }

  return '输入地址';
}

function getEntryKindLabel(kind) {
  if (kind === 'dash') {
    return 'DASH 音视频';
  }

  if (kind === 'file') {
    return '直链视频';
  }

  if (kind === 'hls') {
    return 'HLS 清单';
  }

  return '待确认';
}

function isExtensionMissingError(error) {
  return /未检测到视频下载插件|插件通信失败|当前环境不支持插件通信/i.test(String(error?.message || error || ''));
}

async function copyText(text) {
  if (!text) {
    return false;
  }

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      // Fall back below.
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.remove();
    return ok;
  } catch (error) {
    return false;
  }
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function triggerDirectNavigation(url, filename) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || '';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function VideoDownloadPage() {
  const [inputUrl, setInputUrl] = useState('');
  const [capturedText, setCapturedText] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [extensionBusy, setExtensionBusy] = useState(false);
  const [extensionReady, setExtensionReady] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [mergeState, setMergeState] = useState({
    busy: false,
    stage: '',
    progress: 0,
    error: '',
    result: null
  });

  useEffect(() => {
    return () => {
      terminateFFmpeg();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    requestVideoDownloadExtension('detect-extension', {}, 700)
      .then(() => {
        if (!cancelled) {
          setExtensionReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setExtensionReady(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const resetRuntimeState = () => {
    setMessage('');
    setError('');
    setMergeState({
      busy: false,
      stage: '',
      progress: 0,
      error: '',
      result: null
    });
  };

  const applyImportedAnalysis = (payloadLike, successMessage) => {
    resetRuntimeState();

    try {
      const nextText = typeof payloadLike === 'string'
        ? payloadLike
        : JSON.stringify(payloadLike, null, 2);
      const nextAnalysis = parseCapturedPayload(nextText);
      setCapturedText(nextText);
      setAnalysis(nextAnalysis);
      if (nextAnalysis.source === 'browser-extension') {
        setExtensionReady(true);
      }
      setPreviewUrl(nextAnalysis.entries.find((entry) => entry.kind === 'file')?.url || '');
      setMessage(
        nextAnalysis.entries.length
          ? successMessage || `已导入抓取结果，共 ${nextAnalysis.entries.length} 个候选地址。`
          : '已导入抓取结果，但没有识别出可处理的视频地址。'
      );
      if (nextAnalysis.inputUrl) {
        setInputUrl(nextAnalysis.inputUrl);
      }
    } catch (runtimeError) {
      setAnalysis(null);
      setPreviewUrl('');
      setError(runtimeError.message || '抓取结果导入失败。');
    }
  };

  useEffect(() => {
    const importText = sessionStorage.getItem(EXTENSION_IMPORT_STORAGE_KEY);
    if (importText) {
      sessionStorage.removeItem(EXTENSION_IMPORT_STORAGE_KEY);
      applyImportedAnalysis(importText, '已接收插件结果，共享到当前工具页。');
    }

    const handleExtensionImport = (event) => {
      if (event.source !== window) {
        return;
      }

      if (event.data?.source !== EXTENSION_IMPORT_MESSAGE_SOURCE || event.data?.name !== 'importCapturedPayload') {
        return;
      }

      if (!event.data.payload) {
        return;
      }

      applyImportedAnalysis(event.data.payload, '已接收插件结果，共享到当前工具页。');
    };

    window.addEventListener('message', handleExtensionImport);
    return () => {
      window.removeEventListener('message', handleExtensionImport);
    };
  }, []);

  const handleAnalyze = async (urlOverride) => {
    const nextUrl = String(urlOverride || inputUrl || '').trim();
    if (!nextUrl) {
      setError('请输入需要分析的视频地址或页面地址。');
      return;
    }

    setLoading(true);
    resetRuntimeState();

    try {
      const nextAnalysis = await analyzeVideoUrl(nextUrl);
      setAnalysis(nextAnalysis);
      setPreviewUrl(nextAnalysis.entries.find((entry) => entry.kind === 'file')?.url || '');
      setMessage(
        nextAnalysis.entries.length
          ? `分析完成，找到 ${nextAnalysis.entries.length} 个候选地址。`
          : '分析完成，但没有找到可直接处理的视频地址。'
      );
      if (urlOverride) {
        setInputUrl(nextUrl);
      }
    } catch (runtimeError) {
      setAnalysis(null);
      setPreviewUrl('');
      setError(runtimeError.message || '解析失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  const clearAll = () => {
    setInputUrl('');
    setCapturedText('');
    setAnalysis(null);
    setPreviewUrl('');
    resetRuntimeState();
  };

  const handleImportCaptured = () => {
    applyImportedAnalysis(capturedText);
  };

  const handleCopy = async (text, successMessage) => {
    const ok = await copyText(text);
    setMessage(ok ? successMessage : '复制失败，请手动复制。');
  };

  const handleImportLatestExtensionCapture = async (shouldRescan = false) => {
    setExtensionBusy(true);
    setError('');
    setMessage(shouldRescan ? '正在让插件重扫最近视频页...' : '正在读取插件最近捕获结果...');

    try {
      const response = await requestVideoDownloadExtension(
        shouldRescan ? 'rescan-latest-capture' : 'get-latest-capture',
        {},
        shouldRescan ? 3000 : 1500
      );
      setExtensionReady(true);
      applyImportedAnalysis(
        response.payload,
        shouldRescan
          ? '插件已重扫最近视频页，并导入最新结果。'
          : '已从插件导入最近捕获结果。'
      );
    } catch (runtimeError) {
      if (isExtensionMissingError(runtimeError)) {
        setExtensionReady(false);
      }
      setMessage('');
      setError(runtimeError.message || '插件导入失败。');
    } finally {
      setExtensionBusy(false);
    }
  };

  const handleExtensionDownload = async (entry) => {
    if (!analysis?.sourceTabId || !entry?.url) {
      return;
    }

    setError('');
    setMessage('正在请求插件回到来源页触发下载...');

    try {
      const response = await requestVideoDownloadExtension(
        'download-entry-for-tab',
        {
          tabId: analysis.sourceTabId,
          entry
        },
        4000
      );
      setExtensionReady(true);
      setMessage(
        response.mode === 'source-page'
          ? '插件已在来源页上下文里触发下载，防盗链页面成功率会更高。'
          : '来源页触发失败，插件已回退到浏览器下载。'
      );
    } catch (runtimeError) {
      if (isExtensionMissingError(runtimeError)) {
        setExtensionReady(false);
      }
      setError(runtimeError.message || '插件下载失败。');
    }
  };

  const handleDirectDownload = async (entry) => {
    if (!entry?.url) {
      return;
    }

    setError('');
    setMessage('正在尝试浏览器端直接下载...');

    try {
      const response = await fetch(entry.url, {
        method: 'GET',
        redirect: 'follow'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const blob = await response.blob();
      triggerBlobDownload(
        blob,
        entry.downloadName || getSuggestedFilename(response.url || entry.url, 'video')
      );
      setMessage('浏览器转存成功，已开始下载。');
    } catch (runtimeError) {
      triggerDirectNavigation(entry.url, entry.downloadName || getSuggestedFilename(entry.url, 'video'));
      setMessage('目标站不允许跨域读取，已切换为浏览器直连方式。若未自动下载，请在新标签页中保存视频。');
    }
  };

  const handleOpen = (url) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadManifest = () => {
    if (!analysis?.manifest?.manifestText) {
      return;
    }

    const filename = getSuggestedFilename(analysis.manifest.manifestUrl, 'playlist').replace(/\.[^.]+$/, '.m3u8');
    downloadTextFile(
      analysis.manifest.manifestText,
      filename,
      'application/vnd.apple.mpegurl;charset=utf-8'
    );
    setMessage('已导出 m3u8 播放清单文件。');
  };

  const handleMergePlaylist = async () => {
    if (!analysis?.manifest?.isMedia) {
      return;
    }

    setError('');
    setMessage('');
    setMergeState({
      busy: true,
      stage: '准备浏览器端合并...',
      progress: 0,
      error: '',
      result: null
    });

    try {
      const result = await mergeHlsToMp4({
        manifest: analysis.manifest,
        fileBaseName: analysis.title || getSuggestedFilename(analysis.manifest.manifestUrl, 'video').replace(/\.[^.]+$/, ''),
        onStageChange: (stage) => {
          setMergeState((prev) => ({
            ...prev,
            stage
          }));
        },
        onProgress: (progress) => {
          setMergeState((prev) => ({
            ...prev,
            progress
          }));
        }
      });

      setMergeState({
        busy: false,
        stage: '浏览器端合并完成',
        progress: 1,
        error: '',
        result
      });
      saveMergedVideo(result);
      setMessage('HLS 分片已在浏览器内合并完成，并已开始下载 MP4。');
    } catch (runtimeError) {
      setMergeState({
        busy: false,
        stage: '',
        progress: 0,
        error: runtimeError.message || '浏览器端合并失败。',
        result: null
      });
    }
  };

  const handleMergeDash = async (entry) => {
    if (!entry?.url || !entry?.audioUrl) {
      return;
    }

    setError('');
    setMessage('');
    setMergeState({
      busy: true,
      stage: '准备浏览器端封装...',
      progress: 0,
      error: '',
      result: null
    });

    try {
      const result = await mergeDashStreamsToMp4({
        entry,
        fileBaseName: entry.downloadName
          || analysis?.title
          || getSuggestedFilename(entry.url, 'video').replace(/\.[^.]+$/, ''),
        onStageChange: (stage) => {
          setMergeState((prev) => ({
            ...prev,
            stage
          }));
        },
        onProgress: (progress) => {
          setMergeState((prev) => ({
            ...prev,
            progress
          }));
        }
      });

      setMergeState({
        busy: false,
        stage: '浏览器端封装完成',
        progress: 1,
        error: '',
        result
      });
      saveMergedVideo(result);
      setMessage('DASH 音视频已在浏览器内封装完成，并已开始下载 MP4。');
    } catch (runtimeError) {
      setMergeState({
        busy: false,
        stage: '',
        progress: 0,
        error: runtimeError.message || '浏览器端封装失败。',
        result: null
      });
    }
  };

  return (
    <ToolPageShell
      title="视频链接下载（前端优先）"
      desc="尽量在浏览器本地完成视频地址解析、HLS 清单分析和下载，不走本站服务器的上传/下载流量。"
    >
      <div className="video-download-layout">
        <section className="video-download-panel">
          <div className="video-download-panel-head">
            <div>
              <h3>地址解析</h3>
              <p>适合直接视频地址、m3u8 地址，或允许浏览器跨域读取的普通网页地址。</p>
            </div>
            <span className="video-download-pill">Browser First</span>
          </div>

          <label className="field-label" htmlFor="video-download-url">
            视频链接或页面链接
          </label>
          <input
            id="video-download-url"
            type="text"
            placeholder="https://example.com/video.mp4 或 https://example.com/post/123"
            value={inputUrl}
            onChange={(event) => setInputUrl(event.target.value)}
          />

          <div className="actions">
            <button type="button" onClick={() => handleAnalyze()} disabled={loading}>
              {loading ? '解析中...' : '开始分析'}
            </button>
            <button type="button" className="btn-ghost" onClick={clearAll} disabled={loading}>
              清空
            </button>
          </div>

          <div className="video-download-note-list">
            <p>本站不接收视频上传，也不代理视频下载流量。</p>
            <p>能直下的核心前提是目标资源能被用户浏览器直接访问。</p>
            <p>跨域、登录态、签名、防盗链、DRM 这几类限制，纯网页端无法稳定绕过。</p>
          </div>
        </section>

        <section className="video-download-panel">
          <div className="video-download-panel-head">
            <div>
              <h3>页面内抓取</h3>
              <p>当普通网页地址无法跨域读取时，到源页面自身上下文里抓取候选视频地址，再粘回这里继续处理。</p>
            </div>
            <span className="video-download-pill is-warm">No Server Relay</span>
          </div>

          <ol className="video-download-step-list">
            <li>打开目标网页，按 `F12` 进入开发者工具。</li>
            <li>切到 `Console`，粘贴下方脚本并回车运行。</li>
            <li>脚本会尝试复制抓取结果 JSON。</li>
            <li>回到本页，把 JSON 粘贴到下方文本框，点击“导入抓取结果”。</li>
          </ol>

          <div className="actions">
            <button
              type="button"
              onClick={() => handleCopy(CAPTURE_SNIPPET, '抓取脚本已复制。')}
            >
              复制抓取脚本
            </button>
          </div>

          <label className="field-label" htmlFor="video-download-script">
            抓取脚本
          </label>
          <textarea
            id="video-download-script"
            className="mono-textarea video-download-code"
            value={CAPTURE_SNIPPET}
            readOnly
            rows={10}
          />

          <label className="field-label" htmlFor="video-download-capture">
            粘贴抓取结果 JSON
          </label>
          <textarea
            id="video-download-capture"
            className="mono-textarea"
            value={capturedText}
            onChange={(event) => setCapturedText(event.target.value)}
            placeholder='{"version":1,"pageUrl":"https://example.com","items":[...]}'
            rows={8}
          />

          <div className="actions">
            <button type="button" onClick={handleImportCaptured}>
              导入抓取结果
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setCapturedText('')}
            >
              清空抓取 JSON
            </button>
          </div>
        </section>

        <section className="video-download-panel">
          <div className="video-download-panel-head">
            <div>
              <h3>插件增强模式</h3>
              <p>适合 Bilibili、微信公众号、登录态页面和带签名校验的站点。插件在目标页面自身环境与浏览器网络层本地捕获候选地址，再导回本页继续下载或合并。</p>
            </div>
            <span className="video-download-pill">Extension Assist</span>
          </div>

          <ol className="video-download-step-list">
            <li>在仓库里的本地插件源码目录加载扩展程序。</li>
            <li>打开目标视频页，必要时先点一下播放，让目标站真正发起媒体请求。</li>
            <li>插件弹窗里可以直接“打开网站工具页”，自动带入结果；也可以继续复制 JSON 手动导入。</li>
            <li>导入后即可继续分析、预览、直下或在浏览器里本地封装 MP4。</li>
          </ol>

          <div className="video-download-note-list">
            <p>这条链路不走本站服务器，也不依赖第三方解析接口。</p>
            <p>Bilibili 会优先导出 DASH 音视频地址，本页可继续在浏览器里本地封装为 MP4。</p>
            <p>微信公众号这类页面通常依赖页面内真实播放请求，插件模式比纯网页分析更稳。</p>
            <p>插件下载会优先尝试沿用来源页上下文触发，防盗链页面成功率会比普通直下更高。</p>
            <p>{extensionReady ? '已检测到本地插件，可直接从这里导入最近捕获结果。' : '如果已加载本地插件，可以直接从这里导入最近捕获结果，无需手动复制 JSON。'}</p>
          </div>

          <div className="actions">
            <button
              type="button"
              onClick={() => handleImportLatestExtensionCapture(false)}
              disabled={extensionBusy}
            >
              {extensionBusy ? '处理中...' : '导入插件最近结果'}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => handleImportLatestExtensionCapture(true)}
              disabled={extensionBusy}
            >
              {extensionBusy ? '处理中...' : '让插件重扫并导入'}
            </button>
          </div>
        </section>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="tool-message">{message}</p> : null}

      {analysis ? (
        <div className="video-download-results-shell">
          <div className="video-download-summary-grid">
            <div className="video-download-summary-item">
              <span>来源</span>
              <strong>{getAnalysisSourceLabel(analysis.source)}</strong>
            </div>
            <div className="video-download-summary-item">
              <span>候选地址</span>
              <strong>{analysis.entries.length}</strong>
            </div>
            <div className="video-download-summary-item">
              <span>页面标题</span>
              <strong>{analysis.title || '-'}</strong>
            </div>
            <div className="video-download-summary-item">
              <span>最终地址</span>
              <strong>{analysis.finalUrl || '-'}</strong>
            </div>
          </div>

          {analysis.blockedReason ? (
            <p className="video-download-muted">受限原因：{analysis.blockedReason}</p>
          ) : null}

          {analysis.warnings?.length ? (
            <div className="video-download-warning-list">
              {analysis.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}

          {analysis.manifest ? (
            <div className="video-download-manifest-card">
              <div className="video-download-panel-head">
                <div>
                  <h3>播放清单详情</h3>
                  <p>
                    {analysis.manifest.isMaster
                      ? '当前地址是 HLS 主播放列表，可继续分析不同清晰度。'
                      : '当前地址是 HLS 媒体播放列表，可尝试导出清单或在浏览器端合并 MP4。'}
                  </p>
                </div>
                <span className="video-download-pill">
                  {analysis.manifest.isMaster ? 'Master Playlist' : 'Media Playlist'}
                </span>
              </div>

              <div className="video-download-summary-grid">
                <div className="video-download-summary-item">
                  <span>分片数</span>
                  <strong>{analysis.manifest.segments.length || '-'}</strong>
                </div>
                <div className="video-download-summary-item">
                  <span>总时长</span>
                  <strong>{formatSeconds(analysis.manifest.totalDuration)}</strong>
                </div>
                <div className="video-download-summary-item">
                  <span>加密状态</span>
                  <strong>{analysis.manifest.isEncrypted ? analysis.manifest.encryptionMethod || '已加密' : '未加密'}</strong>
                </div>
                <div className="video-download-summary-item">
                  <span>浏览器端 MP4 合并</span>
                  <strong>{analysis.manifest.supportsBrowserMerge ? '可尝试' : '当前不支持'}</strong>
                </div>
              </div>

              <div className="actions">
                <button type="button" className="btn-ghost" onClick={handleDownloadManifest}>
                  下载 m3u8 文件
                </button>
                {analysis.manifest.isMedia ? (
                  <button
                    type="button"
                    onClick={handleMergePlaylist}
                    disabled={!analysis.manifest.supportsBrowserMerge || mergeState.busy}
                  >
                    {mergeState.busy ? '合并中...' : '前端合并为 MP4'}
                  </button>
                ) : null}
              </div>

              {mergeState.busy ? (
                <div className="video-download-progress-card">
                  <div className="video-download-progress-head">
                    <strong>{mergeState.stage || '处理中...'}</strong>
                    <span>{Math.round((mergeState.progress || 0) * 100)}%</span>
                  </div>
                  <div className="video-download-progress-bar">
                    <span style={{ width: `${Math.round((mergeState.progress || 0) * 100)}%` }} />
                  </div>
                </div>
              ) : null}

              {mergeState.error ? <p className="error">{mergeState.error}</p> : null}

              {mergeState.result ? (
                <div className="video-download-merge-result">
                  <p>输出文件：{mergeState.result.filename}</p>
                  <p>文件大小：{formatBytes(mergeState.result.size)}</p>
                  <div className="actions">
                    <button type="button" onClick={() => saveMergedVideo(mergeState.result)}>
                      再次下载 MP4
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {previewUrl ? (
            <div className="video-download-preview-card">
              <div className="video-download-panel-head">
                <div>
                  <h3>视频预览</h3>
                  <p>仅用于快速确认候选链接是否正确，播放能力取决于浏览器与目标站策略。</p>
                </div>
                <span className="video-download-pill">Preview</span>
              </div>
              <video className="video-download-preview" src={previewUrl} controls playsInline />
            </div>
          ) : null}

          {analysis.entries.length ? (
            <div className="video-download-result-list">
              {analysis.entries.map((entry) => (
                <div className="video-download-result-card" key={entry.id}>
                  <div className="video-download-result-head">
                    <div>
                      <h3>{entry.label}</h3>
                      <p>{entry.url}</p>
                    </div>
                    <span className={`video-download-kind is-${entry.kind}`}>
                      {getEntryKindLabel(entry.kind)}
                    </span>
                  </div>

                  {entry.metaText ? <p className="video-download-result-meta">{entry.metaText}</p> : null}
                  {entry.note ? <p className="video-download-result-note">{entry.note}</p> : null}

                  <div className="actions">
                    {entry.kind === 'file' ? (
                      <button type="button" onClick={() => handleDirectDownload(entry)}>
                        尝试下载
                      </button>
                    ) : entry.kind === 'dash' ? (
                      <button type="button" onClick={() => handleMergeDash(entry)} disabled={mergeState.busy}>
                        {mergeState.busy ? '封装中...' : '本地封装为 MP4'}
                      </button>
                    ) : (
                      <button type="button" onClick={() => handleAnalyze(entry.url)}>
                        继续解析
                      </button>
                    )}

                    {entry.kind === 'file' ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => setPreviewUrl(entry.url)}
                      >
                        设为预览
                      </button>
                    ) : null}

                    {entry.kind !== 'dash' && analysis.source === 'browser-extension' && analysis.sourceTabId ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => handleExtensionDownload(entry)}
                      >
                        插件来源页下载
                      </button>
                    ) : null}

                    {entry.kind !== 'dash' ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => handleCopy(
                          getSourcePageDownloadSnippet(
                            entry.url,
                            entry.downloadName || getSuggestedFilename(entry.url, 'video')
                          ),
                          '来源页下载脚本已复制。回到原页面 Console 运行即可。'
                        )}
                      >
                        复制来源页下载脚本
                      </button>
                    ) : null}

                    {entry.kind === 'dash' && entry.audioUrl ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => handleCopy(entry.audioUrl, '音频链接已复制。')}
                      >
                        复制音频链接
                      </button>
                    ) : null}

                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => handleOpen(entry.url)}
                    >
                      打开原链接
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => handleCopy(entry.url, '链接已复制。')}
                    >
                      复制链接
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </ToolPageShell>
  );
}

export default VideoDownloadPage;
