import { useRef, useState } from 'react';
import SparkMD5 from 'spark-md5';
import ToolPageShell from '../components/ToolPageShell';

const CHUNK_SIZE = 4 * 1024 * 1024;
const EMPTY_FILE_MD5 = 'd41d8cd98f00b204e9800998ecf8427e';
const STATUS_LABELS = {
  pending: '待计算',
  hashing: '计算中',
  done: '已完成',
  error: '失败'
};

function formatBytes(bytes) {
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

function formatFileType(file) {
  if (file.type) {
    return file.type;
  }
  const parts = file.name.split('.');
  if (parts.length > 1) {
    return `${parts.pop().toUpperCase()} 文件`;
  }
  return '未知类型';
}

function sleepToYield() {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}

function createAbortError() {
  const error = new Error('计算已停止');
  error.code = 'HASH_ABORTED';
  return error;
}

async function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'readonly');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function createQueueItems(fileList) {
  const salt = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return Array.from(fileList || []).map((file, index) => ({
    id: `${salt}-${index}`,
    file,
    status: 'pending',
    progress: 0,
    md5: '',
    error: ''
  }));
}

async function hashFileInChunks(file, onProgress, shouldAbort) {
  if (file.size === 0) {
    onProgress(100);
    return EMPTY_FILE_MD5;
  }

  const spark = new SparkMD5.ArrayBuffer();
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    if (shouldAbort()) {
      throw createAbortError();
    }

    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(file.size, start + CHUNK_SIZE);
    const chunk = await file.slice(start, end).arrayBuffer();

    if (shouldAbort()) {
      throw createAbortError();
    }

    spark.append(chunk);
    onProgress(Math.round(((chunkIndex + 1) / totalChunks) * 100));

    if (chunkIndex < totalChunks - 1) {
      await sleepToYield();
    }
  }

  return spark.end();
}

function Md5Page() {
  const inputRef = useRef(null);
  const abortRef = useRef(false);
  const [items, setItems] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isHashing, setIsHashing] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');

  const doneCount = items.filter((item) => item.status === 'done').length;
  const errorCount = items.filter((item) => item.status === 'error').length;
  const pendingCount = items.filter((item) => item.status === 'pending').length;
  const activeItem = items.find((item) => item.status === 'hashing');
  const totalSize = items.reduce((sum, item) => sum + item.file.size, 0);
  const overallProgress = items.length
    ? Math.round(
      items.reduce(
        (sum, item) => sum + (item.status === 'done' || item.status === 'error' ? 100 : item.progress),
        0
      ) / items.length
    )
    : 0;

  const patchItem = (id, patch) => {
    setItems((prev) =>
      prev.map((item) => (
        item.id === id
          ? { ...item, ...patch }
          : item
      ))
    );
  };

  const handleAddFiles = (fileList) => {
    const nextItems = createQueueItems(fileList);
    if (!nextItems.length || isHashing) {
      return;
    }

    setItems((prev) => [...prev, ...nextItems]);
    setError('');
    setStatusText(`已加入 ${nextItems.length} 个文件。`);
  };

  const handleInputChange = (event) => {
    handleAddFiles(event.target.files);
    event.target.value = '';
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    handleAddFiles(event.dataTransfer.files);
  };

  const handleStartHash = async () => {
    if (!items.length) {
      setError('请先选择至少一个本地文件。');
      return;
    }

    const queue = items.map((item) => ({ id: item.id, file: item.file, name: item.file.name }));

    abortRef.current = false;
    setError('');
    setStatusText(`开始计算，共 ${queue.length} 个文件。`);
    setIsHashing(true);
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        status: 'pending',
        progress: 0,
        md5: '',
        error: ''
      }))
    );

    let successCount = 0;
    let failedCount = 0;
    let aborted = false;

    try {
      for (const item of queue) {
        if (abortRef.current) {
          aborted = true;
          break;
        }

        patchItem(item.id, {
          status: 'hashing',
          progress: 0,
          md5: '',
          error: ''
        });

        try {
          const md5 = await hashFileInChunks(
            item.file,
            (progress) => {
              patchItem(item.id, { status: 'hashing', progress });
              setStatusText(`计算中 ${successCount + failedCount + 1}/${queue.length}: ${item.name} (${progress}%)`);
            },
            () => abortRef.current
          );

          successCount += 1;
          patchItem(item.id, {
            status: 'done',
            progress: 100,
            md5
          });
        } catch (e) {
          if (e && e.code === 'HASH_ABORTED') {
            aborted = true;
            patchItem(item.id, {
              status: 'pending',
              progress: 0,
              md5: '',
              error: ''
            });
            setStatusText(`已停止计算，保留 ${successCount} 个已完成结果。`);
            break;
          }

          failedCount += 1;
          patchItem(item.id, {
            status: 'error',
            progress: 100,
            error: e.message || 'MD5 计算失败'
          });
        }
      }
    } finally {
      abortRef.current = false;
      setIsHashing(false);
    }

    if (!aborted) {
      if (failedCount > 0) {
        setStatusText(`计算完成：成功 ${successCount} 个，失败 ${failedCount} 个。`);
      } else if (successCount > 0) {
        setStatusText(`计算完成：共 ${successCount} 个文件。`);
      }
    }
  };

  const handleStop = () => {
    abortRef.current = true;
    setStatusText('正在停止，等待当前分块处理完成...');
  };

  const handleClear = () => {
    if (isHashing) {
      return;
    }
    setItems([]);
    setError('');
    setStatusText('');
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const handleRemove = (id) => {
    if (isHashing) {
      return;
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleCopyOne = async (item) => {
    if (!item.md5) {
      return;
    }
    try {
      await copyText(item.md5);
      setError('');
      setStatusText(`已复制 ${item.file.name} 的 MD5。`);
    } catch (e) {
      setError('复制失败，请手动复制结果。');
    }
  };

  const handleCopyAll = async () => {
    const readyItems = items.filter((item) => item.status === 'done' && item.md5);
    if (!readyItems.length) {
      setError('暂无可复制的 MD5 结果。');
      return;
    }

    try {
      const text = readyItems
        .map((item) => `${item.md5}  ${item.file.name}`)
        .join('\n');
      await copyText(text);
      setError('');
      setStatusText(`已复制 ${readyItems.length} 条 MD5 结果。`);
    } catch (e) {
      setError('复制全部结果失败，请稍后重试。');
    }
  };

  return (
    <ToolPageShell
      title="文件 MD5 批量计算"
      desc="浏览器本地分块计算文件 MD5，不上传文件，不经过服务器。"
    >
      <div className="md5-tool">
        <div className="md5-hero">
          <div>
            <div className="md5-badge">Pure Local</div>
            <h2>拖入多个文件，直接在本地批量计算 MD5</h2>
            <p>
              支持多文件队列、分块读取、大文件计算和一键复制结果，整个过程都在本地完成。
            </p>
            <div className="md5-hero-points">
              <span>批量多选</span>
              <span>拖拽上传</span>
              <span>分块读取</span>
              <span>结果可复制</span>
            </div>
          </div>

          <div className="md5-hero-stats">
            <div className="md5-stat-card">
              <span className="md5-stat-label">当前队列</span>
              <strong className="md5-stat-value">{items.length}</strong>
            </div>
            <div className="md5-stat-card">
              <span className="md5-stat-label">累计大小</span>
              <strong className="md5-stat-value">{formatBytes(totalSize)}</strong>
            </div>
            <div className="md5-stat-card">
              <span className="md5-stat-label">已完成</span>
              <strong className="md5-stat-value">{doneCount}</strong>
            </div>
          </div>
        </div>

        <input
          ref={inputRef}
          className="hidden"
          type="file"
          multiple
          onChange={handleInputChange}
        />

        <div
          className={`md5-dropzone ${isDragging ? 'is-dragging' : ''}`}
          onClick={() => {
            if (!isHashing && inputRef.current) {
              inputRef.current.click();
            }
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            if (!isHashing) {
              setIsDragging(true);
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            if (!isHashing) {
              setIsDragging(true);
            }
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            if (event.currentTarget.contains(event.relatedTarget)) {
              return;
            }
            setIsDragging(false);
          }}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if ((event.key === 'Enter' || event.key === ' ') && !isHashing && inputRef.current) {
              event.preventDefault();
              inputRef.current.click();
            }
          }}
        >
          <div className="md5-dropzone-icon">MD5</div>
          <h3>点击选择文件，或把文件拖到这里</h3>
          <p>支持一次加入多个文件。文件仅在当前浏览器中读取和计算，不会上传到服务器。</p>
          <strong>{isHashing ? '计算中，暂不接受新的文件。' : '可多选，可重复追加到队列。'}</strong>
        </div>

        <div className="actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => inputRef.current && inputRef.current.click()}
            disabled={isHashing}
          >
            选择文件
          </button>
          <button
            type="button"
            className="primary"
            onClick={handleStartHash}
            disabled={!items.length || isHashing}
          >
            开始计算
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={handleCopyAll}
            disabled={!doneCount}
          >
            复制全部结果
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={handleStop}
            disabled={!isHashing}
          >
            停止计算
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={!items.length || isHashing}
          >
            清空队列
          </button>
        </div>

        {statusText && <p className="status-text">{statusText}</p>}
        {error && <p className="error">{error}</p>}

        {!!items.length && (
          <>
            <div className="md5-progress-card">
              <div className="md5-progress-head">
                <div>
                  <div className="md5-progress-title">批量进度</div>
                  <p className="md5-progress-meta">
                    {activeItem
                      ? `当前文件：${activeItem.file.name}`
                      : doneCount
                        ? '可以复制已完成文件的 MD5 结果。'
                        : '已加入文件，等待开始计算。'}
                  </p>
                </div>
                <div className="md5-progress-value">{overallProgress}%</div>
              </div>

              <div className="md5-progress-track">
                <span style={{ width: `${overallProgress}%` }} />
              </div>

              <div className="md5-summary-grid">
                <div className="md5-summary-card">
                  <span>待计算</span>
                  <strong>{pendingCount}</strong>
                </div>
                <div className="md5-summary-card">
                  <span>成功</span>
                  <strong>{doneCount}</strong>
                </div>
                <div className="md5-summary-card">
                  <span>失败</span>
                  <strong>{errorCount}</strong>
                </div>
                <div className="md5-summary-card">
                  <span>本地模式</span>
                  <strong>100%</strong>
                </div>
              </div>
            </div>

            <div className="md5-result-list">
              {items.map((item, index) => (
                <article
                  key={item.id}
                  className={`md5-result-card is-${item.status}`}
                >
                  <div className="md5-result-head">
                    <div>
                      <span className="md5-result-index">#{index + 1}</span>
                      <h3 className="md5-result-title">{item.file.name}</h3>
                      <p className="md5-result-meta">
                        {formatBytes(item.file.size)} · {formatFileType(item.file)}
                      </p>
                    </div>
                    <span className={`md5-status-badge is-${item.status}`}>
                      {STATUS_LABELS[item.status]}
                    </span>
                  </div>

                  <div className="md5-item-progress">
                    <div className="md5-item-progress-row">
                      <span>{item.status === 'error' ? '处理失败' : '文件进度'}</span>
                      <span>{item.status === 'done' ? '100%' : `${item.progress}%`}</span>
                    </div>
                    <div className="md5-track">
                      <span style={{ width: `${item.status === 'done' ? 100 : item.progress}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="md5-hash-label">MD5 结果</div>
                    <div className={`md5-hash-box ${item.md5 ? '' : 'is-empty'}`}>
                      {item.md5 || '等待计算'}
                    </div>
                  </div>

                  {item.error && (
                    <p className="md5-item-error">{item.error}</p>
                  )}

                  <div className="md5-card-actions">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => handleCopyOne(item)}
                      disabled={!item.md5}
                    >
                      复制 MD5
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => handleRemove(item.id)}
                      disabled={isHashing}
                    >
                      移除
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        <div className="info-section">
          <h3>关于本工具</h3>
          <ul>
            <li><strong>纯本地：</strong>文件只在浏览器内读取和计算，不上传、不走服务器。</li>
            <li><strong>批量处理：</strong>支持一次选择多个文件，按队列顺序逐个计算。</li>
            <li><strong>适合校验：</strong>可用于下载包、镜像、压缩包和安装文件的完整性核对。</li>
            <li><strong>注意：</strong>MD5 适合完整性校验，不适合高安全场景下的密码或签名用途。</li>
          </ul>
        </div>
      </div>
    </ToolPageShell>
  );
}

export default Md5Page;
