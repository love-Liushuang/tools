import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import icon1 from '../assets/unlock-pdf/icon1.jpg';
import icon2 from '../assets/unlock-pdf/icon2.jpg';
import icon3 from '../assets/unlock-pdf/icon3.jpg';
import icon4 from '../assets/unlock-pdf/icon4.jpg';
import pdfFileImage from '../assets/unlock-pdf/PDF_file.webp';
import gonghuiLogo from '../assets/gonghui_logo.webp';
import PageNotice from '../components/PageNotice';
import './UnlockPdfPage.css';

function countCjkChars(text) {
  if (!text) {
    return 0;
  }
  const matches = text.match(/[\u3400-\u9FFF]/g);
  return matches ? matches.length : 0;
}

function tryDecodeUtf8FromLatin1(text) {
  if (!text) {
    return text;
  }
  try {
    const bytes = Uint8Array.from(text, (ch) => ch.charCodeAt(0) & 0xff);
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!decoded || decoded === text || decoded.includes('\uFFFD')) {
      return text;
    }
    return decoded;
  } catch (err) {
    return text;
  }
}

function normalizeFileName(name) {
  let result = (name || '').trim();
  if (!result) {
    return '';
  }

  if (/%[0-9A-Fa-f]{2}/.test(result)) {
    try {
      result = decodeURIComponent(result);
    } catch (err) {
      // ignore
    }
  }

  const decoded = tryDecodeUtf8FromLatin1(result);
  if (countCjkChars(decoded) > countCjkChars(result)) {
    result = decoded;
  }

  return result;
}

function ensurePdfExtension(name) {
  if (!name) {
    return 'unlocked.pdf';
  }
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
}

function getDownloadName(sourceFileName, contentDisposition) {
  const fromSource = normalizeFileName(sourceFileName);
  if (fromSource) {
    return ensurePdfExtension(fromSource);
  }

  if (!contentDisposition) {
    return 'unlocked.pdf';
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match && utf8Match[1]) {
    return ensurePdfExtension(normalizeFileName(utf8Match[1]));
  }

  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (plainMatch && plainMatch[1]) {
    return ensurePdfExtension(normalizeFileName(plainMatch[1]));
  }

  return 'unlocked.pdf';
}

function UnlockPdfPage() {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('error');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const DEFAULT_FAVICON = '/favicon.ico';
    const head = document.head;

    let iconEl = document.querySelector('link[rel="icon"]');
    if (!iconEl) {
      iconEl = document.createElement('link');
      iconEl.setAttribute('rel', 'icon');
      head.appendChild(iconEl);
    }

    let shortcutEl = document.querySelector('link[rel="shortcut icon"]');
    if (!shortcutEl) {
      shortcutEl = document.createElement('link');
      shortcutEl.setAttribute('rel', 'shortcut icon');
      head.appendChild(shortcutEl);
    }

    const previousIcon = {
      href: iconEl.getAttribute('href') || DEFAULT_FAVICON,
      type: iconEl.getAttribute('type')
    };
    const previousShortcut = {
      href: shortcutEl.getAttribute('href') || previousIcon.href || DEFAULT_FAVICON,
      type: shortcutEl.getAttribute('type')
    };

    iconEl.setAttribute('type', 'image/webp');
    iconEl.setAttribute('href', gonghuiLogo);
    shortcutEl.setAttribute('type', 'image/webp');
    shortcutEl.setAttribute('href', gonghuiLogo);

    return () => {
      iconEl.setAttribute('href', previousIcon.href || DEFAULT_FAVICON);
      if (previousIcon.type) {
        iconEl.setAttribute('type', previousIcon.type);
      } else {
        iconEl.removeAttribute('type');
      }

      shortcutEl.setAttribute('href', previousShortcut.href || previousIcon.href || DEFAULT_FAVICON);
      if (previousShortcut.type) {
        shortcutEl.setAttribute('type', previousShortcut.type);
      } else {
        shortcutEl.removeAttribute('type');
      }
    };
  }, []);

  const setInfo = (msg) => {
    setMessage(msg || '');
    setMessageType('info');
  };

  const setError = (msg) => {
    setMessage(msg || '');
    setMessageType('error');
  };

  const setSuccess = (msg) => {
    setMessage(msg || '');
    setMessageType('success');
  };

  const callUnlock = async (inputFile, password) => {
    const formData = new FormData();
    formData.append('file', inputFile, inputFile.name);
    formData.append('password', password || '');

    const response = await fetch('/api/unlock-pdf', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      let detail = { error: 'PDF 去限制失败', code: 'UNLOCK_FAILED' };
      try {
        detail = await response.json();
      } catch (err) {
        // ignore
      }
      const e = new Error(detail.error || 'PDF 去限制失败');
      e.code = detail.code || 'UNLOCK_FAILED';
      throw e;
    }

    return response;
  };

  const getSelectedFile = () => {
    if (file) {
      return file;
    }
    const fallback = inputRef.current && inputRef.current.files && inputRef.current.files[0];
    if (fallback) {
      setFile(fallback);
      return fallback;
    }
    return null;
  };

  const runUnlock = async () => {
    const selectedFile = getSelectedFile();
    if (!selectedFile) {
      throw new Error('请先选择一个 PDF 文件');
    }

    let password = '';
    while (true) {
      try {
        if (password) {
          setInfo('正在使用密码解密，请稍候...');
        }
        const response = await callUnlock(selectedFile, password);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = getDownloadName(selectedFile.name, response.headers.get('content-disposition'));
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setSuccess('解密完成，已开始下载。');
        return;
      } catch (err) {
        if (err.code !== 'NEED_PASSWORD' && err.code !== 'INVALID_PASSWORD') {
          throw err;
        }

        const tip = err.code === 'INVALID_PASSWORD'
          ? '密码错误，请重新输入 PDF 打开密码（点击取消可终止）。'
          : '该 PDF 需要打开密码，请输入后继续（点击取消可终止）。';
        const input = window.prompt(tip, '');

        if (input === null) {
          const cancelError = new Error('已取消解密。');
          cancelError.code = 'PASSWORD_CANCELLED';
          throw cancelError;
        }

        if (!input) {
          setError('请输入密码后继续。');
          continue;
        }
        password = input;
      }
    }
  };

  const handleUnlock = async () => {
    setLoading(true);
    setError('');
    try {
      await runUnlock();
    } catch (err) {
      if (err.code === 'PASSWORD_CANCELLED') {
        setInfo(err.message || '已取消解密。');
      } else {
        setError(err.message || '去限制失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const messageClass = [
    'error',
    messageType === 'info' ? 'is-info' : '',
    messageType === 'success' ? 'is-success' : ''
  ].filter(Boolean).join(' ');

  return (
    <main className="tool-page unlock-page">
      <div className="unlock-header">
        <h1>PDF 解密 1.1.0</h1>
        <Link className="ghost-btn" to="/">
          返回首页
        </Link>
      </div>
      <PageNotice />

      <div className="inputFileWrap">
        <div className="eUwonh icon-wrap" style={{ width: 24, height: 24 }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M13 12v-2h1v2h2v1h-2v2h-1v-2h-2v-1zm5 8H6V4H5v17h13zm1 0v2H4V3h2V1h10l5 5v14zM7 2v17h13V6l-4-4zm9 0 4 4h-4z" />
          </svg>
        </div>
        <label htmlFor="pdfFile">{file ? file.name : '选择文件'}</label>
        <input
          id="pdfFile"
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => {
            const next = e.target.files && e.target.files[0] ? e.target.files[0] : null;
            setFile(next);
            setError('');
          }}
        />
      </div>

      <div className="button-row">
        <button className="primary" onClick={handleUnlock} disabled={loading} type="button">
          {loading ? '处理中...' : '开始'}
        </button>
        <button
          className="clear"
          disabled={loading}
          onClick={() => {
            setFile(null);
            if (inputRef.current) {
              inputRef.current.value = '';
            }
            setError('');
          }}
          type="button"
        >
          清空
        </button>
      </div>

      <div className={messageClass}>{message}</div>

      <div className="cardInfoWrap cardInfo_1">
        <p className="cardInfo_left">
          单次上传最大 30MB，无水印 - 这款易于使用且免费的在线密码移除工具可为您移除恼人的 PDF 密码。
        </p>
        <ul className="cardInfo_right">
          <li className="cardInfo_right_item">
            <div className="cZpMHP">
              <div className="eUwonh icon-wrap" style={{ width: 24, height: 24 }}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18m-1.591-6.85 5.728-5.727a.9.9 0 0 1 1.272 1.272l-6.293 6.294a1 1 0 0 1-1.414 0L6.59 12.877a.9.9 0 0 1 1.272-1.272z" />
                </svg>
              </div>
            </div>
            无需注册或安装即可解锁 PDF
          </li>
          <li className="cardInfo_right_item">
            <div className="cZpMHP">
              <div className="eUwonh icon-wrap" style={{ width: 24, height: 24 }}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18m-1.591-6.85 5.728-5.727a.9.9 0 0 1 1.272 1.272l-6.293 6.294a1 1 0 0 1-1.414 0L6.59 12.877a.9.9 0 0 1 1.272-1.272z" />
                </svg>
              </div>
            </div>
            在几秒钟内从文档中移除 PDF 密码保护
          </li>
          <li className="cardInfo_right_item">
            <div className="cZpMHP">
              <div className="eUwonh icon-wrap" style={{ width: 24, height: 24 }}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18m-1.591-6.85 5.728-5.727a.9.9 0 0 1 1.272 1.272l-6.293 6.294a1 1 0 0 1-1.414 0L6.59 12.877a.9.9 0 0 1 1.272-1.272z" />
                </svg>
              </div>
            </div>
            TLS 加密以确保文件的安全处理
          </li>
        </ul>
      </div>

      <div className="cardInfoWrap cardInfo_2">
        <div className="cardInfo_2_item">
          <img alt="" src={icon1} loading="lazy" width="48" height="48" />
          <div className="cardInfo_title">如何移除PDF密码</div>
          <div className="cardInfo_info">首先上传以密码加密的PDF文件。如果您的文件没有被高度加密，它将在数秒钟内解密并供您下载。</div>
        </div>
        <div className="cardInfo_2_item">
          <img alt="" src={icon2} loading="lazy" width="48" height="48" />
          <div className="cardInfo_title">安全地处理您的信息</div>
          <div className="cardInfo_info">在上传文件时，我们采用安全的连接模式传送文件数据。服务器临时文件会在处理完成后立即清理。</div>
        </div>
        <div className="cardInfo_2_item">
          <img alt="" src={icon3} loading="lazy" width="48" height="48" />
          <div className="cardInfo_title">适用于任何您喜爱的平台</div>
          <div className="cardInfo_info">适用于所有操作系统，包括Mac、Windows及Linux。</div>
        </div>
        <div className="cardInfo_2_item">
          <img alt="" src={icon4} loading="lazy" width="48" height="48" />
          <div className="cardInfo_title">轻松在线移除PDF密码</div>
          <div className="cardInfo_info">只需上传文件，即可移除PDF的密码。并立即自动下载解密后的PDF文件！</div>
        </div>
      </div>

      <div className="cardInfoWrap cardInfo_3">
        <img alt="" src={pdfFileImage} loading="lazy" width="240" height="180" />
        <div>
          <div className="cardInfo_h2">如何解密 PDF：</div>
          <ol className="cardInfo_right">
            <li className="cardInfo_right_item">将加密的 PDF 文件导入至我们的解密工具。</li>
            <li className="cardInfo_right_item">输入密码以解密 PDF。</li>
            <li className="cardInfo_right_item">准备就绪后，自动下载解密的 PDF，完成！</li>
          </ol>
        </div>
      </div>
    </main>
  );
}

export default UnlockPdfPage;
