import { useMemo, useRef, useState } from 'react';
import { copyText } from '../lib/tool';
import ToolPageShell from '../components/ToolPageShell';

const utf8Decoder = new TextDecoder('utf-8');
const latin1Decoder = new TextDecoder('iso-8859-1');

function bytesToString(value) {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (!(value instanceof Uint8Array)) {
    return '';
  }
  const utf8 = utf8Decoder.decode(value);
  if (utf8 && !utf8.includes('\uFFFD')) {
    return utf8;
  }
  return latin1Decoder.decode(value);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '';
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

function bufferToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

function decodeTorrent(buffer) {
  const bytes = new Uint8Array(buffer);
  let infoStart = null;
  let infoEnd = null;

  const decodeString = (start) => {
    let cursor = start;
    let length = 0;
    while (cursor < bytes.length && bytes[cursor] !== 0x3a) {
      const digit = bytes[cursor] - 48;
      if (digit < 0 || digit > 9) {
        throw new Error('种子格式错误：字符串长度非法');
      }
      length = length * 10 + digit;
      cursor += 1;
    }
    if (bytes[cursor] !== 0x3a) {
      throw new Error('种子格式错误：字符串长度缺少分隔符');
    }
    const valueStart = cursor + 1;
    const valueEnd = valueStart + length;
    if (valueEnd > bytes.length) {
      throw new Error('种子格式错误：字符串长度越界');
    }
    return { value: bytes.slice(valueStart, valueEnd), nextIndex: valueEnd };
  };

  const decodeInt = (start) => {
    let cursor = start + 1;
    let end = cursor;
    while (end < bytes.length && bytes[end] !== 0x65) {
      end += 1;
    }
    if (end >= bytes.length) {
      throw new Error('种子格式错误：整数缺少结束符');
    }
    const numText = utf8Decoder.decode(bytes.slice(cursor, end));
    const value = Number.parseInt(numText, 10);
    if (!Number.isFinite(value)) {
      throw new Error('种子格式错误：整数解析失败');
    }
    return { value, nextIndex: end + 1 };
  };

  const decodeList = (start) => {
    const list = [];
    let cursor = start + 1;
    while (cursor < bytes.length && bytes[cursor] !== 0x65) {
      const item = decodeAt(cursor);
      list.push(item.value);
      cursor = item.nextIndex;
    }
    if (bytes[cursor] !== 0x65) {
      throw new Error('种子格式错误：列表缺少结束符');
    }
    return { value: list, nextIndex: cursor + 1 };
  };

  const decodeDict = (start) => {
    const dict = {};
    let cursor = start + 1;
    while (cursor < bytes.length && bytes[cursor] !== 0x65) {
      const keyInfo = decodeString(cursor);
      const key = utf8Decoder.decode(keyInfo.value);
      cursor = keyInfo.nextIndex;
      const valueStart = cursor;
      const valueInfo = decodeAt(cursor);
      cursor = valueInfo.nextIndex;
      dict[key] = valueInfo.value;
      if (key === 'info' && infoStart === null) {
        infoStart = valueStart;
        infoEnd = valueInfo.nextIndex;
      }
    }
    if (bytes[cursor] !== 0x65) {
      throw new Error('种子格式错误：字典缺少结束符');
    }
    return { value: dict, nextIndex: cursor + 1 };
  };

  const decodeAt = (start) => {
    const byte = bytes[start];
    if (byte === 0x69) {
      return decodeInt(start);
    }
    if (byte === 0x6c) {
      return decodeList(start);
    }
    if (byte === 0x64) {
      return decodeDict(start);
    }
    if (byte >= 0x30 && byte <= 0x39) {
      return decodeString(start);
    }
    throw new Error('种子格式错误：无法识别的类型');
  };

  const root = decodeAt(0);
  if (infoStart === null || infoEnd === null) {
    throw new Error('种子缺少 info 字段');
  }
  return { data: root.value, infoSlice: bytes.slice(infoStart, infoEnd) };
}

function extractTrackers(data) {
  const trackers = [];
  if (data && Array.isArray(data['announce-list'])) {
    data['announce-list'].forEach((tier) => {
      if (!Array.isArray(tier)) {
        return;
      }
      tier.forEach((item) => {
        const value = bytesToString(item);
        if (value) {
          trackers.push(value);
        }
      });
    });
  } else if (data && data.announce) {
    const value = bytesToString(data.announce);
    if (value) {
      trackers.push(value);
    }
  }
  return Array.from(new Set(trackers));
}

function getInfoName(info) {
  if (!info) {
    return '';
  }
  const utf8Name = info['name.utf-8'];
  if (utf8Name) {
    return bytesToString(utf8Name);
  }
  return bytesToString(info.name);
}

function getInfoSize(info) {
  if (!info) {
    return null;
  }
  if (Number.isFinite(info.length)) {
    return info.length;
  }
  if (Array.isArray(info.files)) {
    return info.files.reduce((sum, file) => {
      if (file && Number.isFinite(file.length)) {
        return sum + file.length;
      }
      return sum;
    }, 0);
  }
  return null;
}

function getFilesCount(info) {
  if (info && Array.isArray(info.files)) {
    return info.files.length;
  }
  return 1;
}

async function sha1Hex(bytes) {
  if (!crypto || !crypto.subtle) {
    throw new Error('当前环境不支持 Web Crypto，无法计算磁力哈希');
  }
  const hash = await crypto.subtle.digest('SHA-1', bytes);
  return bufferToHex(hash);
}

function buildMagnet(hash, name, size, trackers) {
  let link = `magnet:?xt=urn:btih:${hash}`;
  if (name) {
    link += `&dn=${encodeURIComponent(name)}`;
  }
  if (Number.isFinite(size) && size > 0) {
    link += `&xl=${size}`;
  }
  trackers.forEach((tracker) => {
    link += `&tr=${encodeURIComponent(tracker)}`;
  });
  return link;
}

function TorrentMagnetPage() {
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [includeTrackers, setIncludeTrackers] = useState(true);
  const [results, setResults] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const previewFiles = useMemo(() => files.slice(0, 6), [files]);
  const remainingCount = files.length - previewFiles.length;

  const handleFileChange = (event) => {
    const list = Array.from(event.target.files || []);
    setFiles(list);
    setResults([]);
    setError('');
    setMessage('');
  };

  const clearAll = () => {
    setFiles([]);
    setResults([]);
    setError('');
    setMessage('');
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const handleConvert = async () => {
    if (!files.length) {
      setError('请先选择至少一个 torrent 文件。');
      return;
    }

    setProcessing(true);
    setError('');
    setMessage('开始解析种子，请稍候...');

    const nextResults = [];
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      try {
        const buffer = await file.arrayBuffer();
        const { data, infoSlice } = decodeTorrent(buffer);
        const info = data.info;
        const hash = await sha1Hex(infoSlice);
        const name = getInfoName(info) || file.name.replace(/\.torrent$/i, '');
        const size = getInfoSize(info);
        const trackers = includeTrackers ? extractTrackers(data) : [];
        const magnet = buildMagnet(hash, name, size, trackers);
        const filesCount = getFilesCount(info);
        const metaParts = [];
        if (size) {
          metaParts.push(`总大小 ${formatBytes(size)}`);
        }
        if (filesCount > 1) {
          metaParts.push(`${filesCount} 个文件`);
        }
        if (trackers.length) {
          metaParts.push(`${trackers.length} 个 tracker`);
        }
        nextResults.push({
          id: `${file.name}-${file.lastModified}-${i}`,
          fileName: file.name,
          displayName: name,
          hash,
          magnet,
          size,
          trackersCount: trackers.length,
          metaText: metaParts.join(' · ')
        });
      } catch (err) {
        nextResults.push({
          id: `${file.name}-${file.lastModified}-${i}`,
          fileName: file.name,
          displayName: file.name,
          error: err.message || '解析失败，请检查种子文件'
        });
      }
      setMessage(`已完成 ${i + 1}/${files.length}`);
    }

    setResults(nextResults);
    setProcessing(false);
    setMessage(`解析完成，共 ${nextResults.length} 个结果。`);
  };

  const handleCopy = async (text, successMessage) => {
    if (!text) {
      return;
    }
    const ok = await copyText(text);
    setMessage(ok ? successMessage : '复制失败，请手动复制。');
  };

  const handleCopyAll = async () => {
    const magnets = results
      .filter((item) => !item.error && item.magnet)
      .map((item) => item.magnet)
      .join('\n');
    if (!magnets) {
      setMessage('没有可复制的磁力链接。');
      return;
    }
    await handleCopy(magnets, '已复制全部磁力链接。');
  };

  return (
    <ToolPageShell
      title="Torrent 转磁力链接"
      desc="批量解析 .torrent 文件，本地生成磁力链接，文件不会上传服务器。"
    >
      <div className="upload-box">
        <label className="field-label" htmlFor="torrentFile">
          选择种子文件
        </label>
        <input
          id="torrentFile"
          ref={inputRef}
          type="file"
          accept=".torrent,application/x-bittorrent"
          multiple
          onChange={handleFileChange}
        />
        <p className="file-count">
          {files.length ? `已选择 ${files.length} 个文件` : '支持批量选择多个 .torrent 文件。'}
        </p>
        {previewFiles.length ? (
          <div className="file-list">
            {previewFiles.map((file) => (
              <div className="file-item" key={`${file.name}-${file.lastModified}`}>
                <span>{file.name}</span>
                <span className="file-meta">{formatBytes(file.size)}</span>
              </div>
            ))}
            {remainingCount > 0 ? (
              <div className="file-meta">还有 {remainingCount} 个文件未展示。</div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="check-row">
        <label className="check-label">
          <input
            type="checkbox"
            checked={includeTrackers}
            onChange={(event) => setIncludeTrackers(event.target.checked)}
          />
          生成时附带 tracker（如果种子内包含）
        </label>
      </div>

      <div className="actions">
        <button type="button" onClick={handleConvert} disabled={processing}>
          {processing ? '解析中...' : '开始转换'}
        </button>
        <button type="button" className="btn-ghost" onClick={clearAll} disabled={processing}>
          清空
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={handleCopyAll}
          disabled={!results.length}
        >
          复制全部磁力链接
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="tool-message">{message}</p> : null}

      {results.length ? (
        <div className="torrent-result-list">
          {results.map((item) => (
            <div className="torrent-result-item" key={item.id}>
              <div className="torrent-result-head">
                <div>
                  <h3>{item.displayName}</h3>
                  <p className="torrent-result-sub">{item.fileName}</p>
                </div>
                {item.metaText ? <span className="torrent-result-meta">{item.metaText}</span> : null}
              </div>

              {item.error ? (
                <p className="error">{item.error}</p>
              ) : (
                <>
                  <div className="torrent-result-row">
                    <span className="torrent-result-label">磁力链接</span>
                    <div className="torrent-result-code">{item.magnet}</div>
                  </div>
                  <div className="torrent-result-row">
                    <span className="torrent-result-label">InfoHash</span>
                    <div className="torrent-result-code">{item.hash}</div>
                  </div>
                  <div className="torrent-result-actions">
                    <button
                      type="button"
                      onClick={() => handleCopy(item.magnet, '磁力链接已复制。')}
                    >
                      复制磁力链接
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => handleCopy(item.hash, 'InfoHash 已复制。')}
                    >
                      复制哈希
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </ToolPageShell>
  );
}

export default TorrentMagnetPage;
