import { useEffect, useRef, useState } from 'react';
import ToolPageShell from '../components/ToolPageShell';
import {
  createMp3OutputName,
  createTaggedMp3Blob,
  decryptNcmFile,
  getNcmMetadata
} from '../lib/ncm';
import {
  convertAudioFileToMp3,
  terminateFFmpeg
} from '../lib/videoGif/ffmpegSingleClient';

const STATUS_LABELS = {
  pending: '待转换',
  decrypting: '解密中',
  transcoding: '转码中',
  done: '已完成',
  error: '失败'
};
const BITRATE_OPTIONS = [320, 256, 192, 128];

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(milliseconds) {
  if (!milliseconds) return '';
  const totalSeconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function createQueueItems(fileList) {
  const salt = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return Array.from(fileList || [])
    .filter((file) => file.name.toLowerCase().endsWith('.ncm'))
    .map((file, index) => ({
      id: `${salt}-${index}`,
      file,
      status: 'pending',
      progress: 0,
      error: '',
      result: null
    }));
}

function makeUniqueZipName(name, usedNames) {
  if (!usedNames.has(name)) {
    usedNames.add(name);
    return name;
  }
  const base = name.replace(/\.mp3$/i, '');
  let index = 2;
  while (usedNames.has(`${base}-${index}.mp3`)) {
    index += 1;
  }
  const nextName = `${base}-${index}.mp3`;
  usedNames.add(nextName);
  return nextName;
}

function NcmToMp3Page() {
  const inputRef = useRef(null);
  const abortRef = useRef(false);
  const itemsRef = useRef([]);
  const [items, setItems] = useState([]);
  const [bitrate, setBitrate] = useState(320);
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [packing, setPacking] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');

  const doneCount = items.filter((item) => item.status === 'done').length;
  const failedCount = items.filter((item) => item.status === 'error').length;
  const activeItem = items.find((item) => ['decrypting', 'transcoding'].includes(item.status));
  const totalSize = items.reduce((sum, item) => sum + item.file.size, 0);
  const overallProgress = items.length
    ? Math.round(items.reduce((sum, item) => sum + item.progress, 0) / items.length)
    : 0;

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => () => {
    itemsRef.current.forEach((item) => {
      if (item.result?.url) URL.revokeObjectURL(item.result.url);
    });
    terminateFFmpeg();
  }, []);

  const patchItem = (id, patch) => {
    setItems((prev) => prev.map((item) => (
      item.id === id ? { ...item, ...patch } : item
    )));
  };

  const addFiles = (fileList) => {
    if (processing) return;
    const files = Array.from(fileList || []);
    const nextItems = createQueueItems(files);
    if (!nextItems.length) {
      setError('请选择扩展名为 .ncm 的文件。');
      return;
    }
    setItems((prev) => [...prev, ...nextItems]);
    setError(files.length === nextItems.length ? '' : '已忽略不是 .ncm 格式的文件。');
    setStatusText(`已加入 ${nextItems.length} 个 NCM 文件。`);
  };

  const handleInputChange = (event) => {
    addFiles(event.target.files);
    event.target.value = '';
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    addFiles(event.dataTransfer.files);
  };

  const handleStart = async () => {
    if (!items.length) {
      setError('请先选择至少一个 NCM 文件。');
      return;
    }

    items.forEach((item) => {
      if (item.result?.url) URL.revokeObjectURL(item.result.url);
    });
    const queue = items.map((item) => ({ id: item.id, file: item.file }));
    abortRef.current = false;
    setProcessing(true);
    setError('');
    setStatusText(`开始转换，共 ${queue.length} 个文件。`);
    setItems((prev) => prev.map((item) => ({
      ...item,
      status: 'pending',
      progress: 0,
      error: '',
      result: null
    })));

    let successTotal = 0;
    let errorTotal = 0;
    let aborted = false;

    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      if (abortRef.current) {
        aborted = true;
        break;
      }

      patchItem(current.id, { status: 'decrypting', progress: 2 });
      setStatusText(`正在解密 ${index + 1}/${queue.length}：${current.file.name}`);

      try {
        const decoded = await decryptNcmFile(current.file, {
          shouldAbort: () => abortRef.current,
          onProgress: (progress) => {
            patchItem(current.id, {
              status: 'decrypting',
              progress: Math.round(5 + progress * 60)
            });
          }
        });

        if (abortRef.current) {
          aborted = true;
          break;
        }
        if (decoded.format === 'unknown') {
          throw new Error('无法识别 NCM 内部的音频格式。');
        }

        let mp3Bytes = decoded.audio;
        let conversionMode = '无损解密直出';
        if (decoded.format !== 'mp3') {
          conversionMode = `${decoded.format.toUpperCase()} 转码`;
          patchItem(current.id, { status: 'transcoding', progress: 66 });
          setStatusText(`正在转码 ${index + 1}/${queue.length}：${current.file.name}`);
          mp3Bytes = await convertAudioFileToMp3({
            audio: decoded.audio,
            inputFormat: decoded.format,
            bitrate,
            onStageChange: (stage) => setStatusText(`${current.file.name}：${stage}`),
            onProgress: (progress) => patchItem(current.id, {
              status: 'transcoding',
              progress: Math.round(66 + Math.max(0, Math.min(1, progress)) * 30)
            })
          });
        }

        if (abortRef.current) {
          aborted = true;
          break;
        }
        const blob = createTaggedMp3Blob(mp3Bytes, decoded.metadata, decoded.cover);
        const outputName = createMp3OutputName(current.file.name, decoded.metadata);
        const url = URL.createObjectURL(blob);
        successTotal += 1;
        patchItem(current.id, {
          status: 'done',
          progress: 100,
          result: {
            blob,
            url,
            outputName,
            outputSize: blob.size,
            conversionMode,
            sourceFormat: decoded.format,
            metadata: getNcmMetadata(decoded.metadata)
          }
        });
      } catch (conversionError) {
        if (abortRef.current || conversionError?.code === 'NCM_ABORTED') {
          aborted = true;
          patchItem(current.id, { status: 'pending', progress: 0, error: '' });
          break;
        }
        errorTotal += 1;
        patchItem(current.id, {
          status: 'error',
          progress: 100,
          error: conversionError?.message || 'NCM 转 MP3 失败。'
        });
      }
    }

    abortRef.current = false;
    setProcessing(false);
    if (aborted) {
      setStatusText(`转换已停止，已完成 ${successTotal} 个文件。`);
    } else if (errorTotal) {
      setStatusText(`转换完成：成功 ${successTotal} 个，失败 ${errorTotal} 个。`);
    } else {
      setStatusText(`转换完成：共 ${successTotal} 个文件。`);
    }
  };

  const handleStop = () => {
    abortRef.current = true;
    setStatusText('正在停止当前任务...');
    terminateFFmpeg();
  };

  const handleClear = () => {
    if (processing || packing) return;
    items.forEach((item) => {
      if (item.result?.url) URL.revokeObjectURL(item.result.url);
    });
    setItems([]);
    setStatusText('');
    setError('');
  };

  const handleRemove = (id) => {
    if (processing || packing) return;
    setItems((prev) => prev.filter((item) => {
      if (item.id === id && item.result?.url) URL.revokeObjectURL(item.result.url);
      return item.id !== id;
    }));
  };

  const handleDownloadAll = async () => {
    const readyItems = items.filter((item) => item.result?.blob);
    if (!readyItems.length) {
      setError('暂无可下载的 MP3 文件。');
      return;
    }

    setPacking(true);
    setError('');
    setStatusText('正在打包 MP3 文件...');
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const usedNames = new Set();
      readyItems.forEach((item) => {
        zip.file(makeUniqueZipName(item.result.outputName, usedNames), item.result.blob);
      });
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ncm-to-mp3-${Date.now()}.zip`;
      link.click();
      URL.revokeObjectURL(url);
      setStatusText(`已打包下载 ${readyItems.length} 个 MP3 文件。`);
    } catch (packingError) {
      setError(packingError?.message || '打包下载失败，请逐个下载。');
    } finally {
      setPacking(false);
    }
  };

  return (
    <ToolPageShell
      title="NCM 转 MP3"
      desc="在浏览器本地批量解密网易云音乐 NCM 文件，转换为通用 MP3，不上传文件。"
    >
      <div className="ncm-tool">
        <div className="ncm-hero">
          <div>
            <span className="ncm-badge">Pure Local</span>
            <h2>选择 NCM，转换并下载 MP3</h2>
            <p>MP3 源直接无损导出；FLAC、AAC 或 OGG 源在本地转码，并尽量保留歌曲名、歌手、专辑与封面。</p>
            <div className="ncm-hero-points">
              <span>纯本地处理</span>
              <span>支持批量</span>
              <span>自动写入标签</span>
            </div>
          </div>
          <div className="ncm-hero-stats">
            <div><span>文件数</span><strong>{items.length}</strong></div>
            <div><span>总大小</span><strong>{formatBytes(totalSize)}</strong></div>
            <div><span>已完成</span><strong>{doneCount}</strong></div>
          </div>
        </div>

        <input
          ref={inputRef}
          className="hidden"
          type="file"
          accept=".ncm,application/octet-stream"
          multiple
          onChange={handleInputChange}
        />

        <div className="ncm-workflow-grid">
          <div
            className={`ncm-dropzone ${isDragging ? 'is-dragging' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => !processing && inputRef.current?.click()}
            onKeyDown={(event) => {
              if ((event.key === 'Enter' || event.key === ' ') && !processing) {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              if (!processing) setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              event.preventDefault();
              if (!event.currentTarget.contains(event.relatedTarget)) setIsDragging(false);
            }}
            onDrop={handleDrop}
          >
            <span className="ncm-dropzone-icon">NCM</span>
            <h3>点击选择文件，或将 NCM 拖到这里</h3>
            <p>可多选、可重复追加。文件只在当前浏览器中读取，不会发送到服务器。</p>
          </div>

          <div className="ncm-control-card">
            <div className="ncm-options">
              <label className="field-block">
                <span>转码比特率</span>
                <select
                  value={bitrate}
                  onChange={(event) => setBitrate(Number(event.target.value))}
                  disabled={processing}
                >
                  {BITRATE_OPTIONS.map((value) => (
                    <option key={value} value={value}>{value} kbps</option>
                  ))}
                </select>
              </label>
              <p>仅用于内部不是 MP3 的文件；MP3 源不会重新编码。</p>
            </div>

            <div className="actions ncm-actions">
              <button type="button" className="btn-ghost" onClick={() => inputRef.current?.click()} disabled={processing}>
                选择 NCM
              </button>
              <button type="button" className="primary" onClick={handleStart} disabled={!items.length || processing}>
                开始转换
              </button>
              <button type="button" className="btn-ghost" onClick={handleDownloadAll} disabled={!doneCount || processing || packing}>
                {packing ? '正在打包...' : '下载全部 ZIP'}
              </button>
              <button type="button" className="btn-ghost" onClick={handleStop} disabled={!processing}>
                停止转换
              </button>
              <button type="button" onClick={handleClear} disabled={!items.length || processing || packing}>
                清空队列
              </button>
            </div>
          </div>

          <div className="ncm-progress-card">
            <div className="ncm-progress-head">
              <div>
                <strong>批量进度</strong>
                <p>{activeItem ? `当前文件：${activeItem.file.name}` : '转换结果会保留在当前页面，可逐个下载或打包下载。'}</p>
              </div>
              <span>{overallProgress}%</span>
            </div>
            <div className="ncm-progress-track"><span style={{ width: `${overallProgress}%` }} /></div>
            <div className="ncm-summary-grid">
              <div><span>总文件</span><strong>{items.length}</strong></div>
              <div><span>已完成</span><strong>{doneCount}</strong></div>
              <div><span>失败</span><strong>{failedCount}</strong></div>
              <div><span>文件上传</span><strong>0</strong></div>
            </div>
          </div>
        </div>

        {statusText ? <p className="status-text">{statusText}</p> : null}
        {error ? <p className="error">{error}</p> : null}

        {items.length ? (
          <div className="ncm-result-list">
              {items.map((item, index) => {
                const metadata = item.result?.metadata;
                const detail = metadata
                  ? [metadata.artist, metadata.album, formatDuration(metadata.duration)].filter(Boolean).join(' · ')
                  : '';
                return (
                  <article key={item.id} className={`ncm-result-card is-${item.status}`}>
                    <div className="ncm-result-head">
                      <div>
                        <span className="ncm-result-index">#{index + 1}</span>
                        <h3>{metadata?.title || item.file.name}</h3>
                        <p>{detail || `${formatBytes(item.file.size)} · NCM 文件`}</p>
                      </div>
                      <span className={`ncm-status-badge is-${item.status}`}>{STATUS_LABELS[item.status]}</span>
                    </div>
                    <div className="ncm-item-progress">
                      <div><span>{item.status === 'error' ? '处理失败' : '文件进度'}</span><span>{item.progress}%</span></div>
                      <div className="ncm-track"><span style={{ width: `${item.progress}%` }} /></div>
                    </div>
                    {item.result ? (
                      <div className="ncm-output">
                        <audio controls preload="metadata" src={item.result.url} />
                        <p>{item.result.outputName} · {formatBytes(item.result.outputSize)} · {item.result.conversionMode}</p>
                      </div>
                    ) : null}
                    {item.error ? <p className="ncm-item-error">{item.error}</p> : null}
                    <div className="ncm-card-actions">
                      {item.result ? (
                        <a className="primary" href={item.result.url} download={item.result.outputName}>下载 MP3</a>
                      ) : null}
                      <button type="button" className="btn-ghost" onClick={() => handleRemove(item.id)} disabled={processing || packing}>
                        移除
                      </button>
                    </div>
                  </article>
                );
              })}
          </div>
        ) : null}

        <div className="info-section">
          <h3>使用说明</h3>
          <ul>
            <li><strong>本地处理：</strong>NCM、封面和 MP3 均不会上传服务器。</li>
            <li><strong>质量策略：</strong>MP3 源直接解密，不重新编码；其他音频格式按所选比特率转为 MP3。</li>
            <li><strong>版权提示：</strong>请仅转换你有权使用的文件，并遵守当地法律及相关平台条款。</li>
          </ul>
        </div>
      </div>
    </ToolPageShell>
  );
}

export default NcmToMp3Page;
