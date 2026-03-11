import { useMemo, useState } from 'react';
import ToolPageShell from '../components/ToolPageShell';

function sanitizeSvg(text) {
  return String(text || '').replace(/^\uFEFF/, '').trim();
}

function toBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64Utf8(base64Text) {
  const binary = atob(base64Text);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function copyTextToClipboard(text) {
  const content = String(text || '');
  if (!content) {
    return;
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(content);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = content;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function downloadText(filename, text, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([String(text || '')], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'output.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function stripDataUriPrefix(text) {
  const value = String(text || '').trim();
  const match = value.match(/^data:image\/svg\+xml(;charset=[^;,]+)?;base64,(.*)$/i);
  return match ? match[2] : value;
}

function buildSnippets(dataUri) {
  const safeUri = String(dataUri || '');
  return {
    css: `background-image: url("${safeUri}");`,
    html: `<img src="${safeUri}" alt="svg" />`
  };
}

function SvgBase64Page() {
  const [svgText, setSvgText] = useState('');
  const [outputKind, setOutputKind] = useState('dataUri');
  const [result, setResult] = useState(null);
  const [notice, setNotice] = useState('');
  const [noticeIsError, setNoticeIsError] = useState(false);

  const [decodeInput, setDecodeInput] = useState('');
  const [decodedSvg, setDecodedSvg] = useState('');

  const setInfo = (msg) => {
    setNotice(msg || '');
    setNoticeIsError(false);
  };

  const setError = (msg) => {
    setNotice(msg || '');
    setNoticeIsError(true);
  };

  const outputText = useMemo(() => {
    if (!result) {
      return '';
    }
    if (outputKind === 'base64') {
      return result.base64;
    }
    if (outputKind === 'css') {
      return result.css;
    }
    if (outputKind === 'html') {
      return result.html;
    }
    return result.dataUri;
  }, [outputKind, result]);

  const handleLoadFile = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      setSvgText(text);
      setResult(null);
      setNotice('');
    } catch (err) {
      setError('读取 SVG 文件失败。');
    } finally {
      event.target.value = '';
    }
  };

  const handleConvert = () => {
    const text = sanitizeSvg(svgText);
    if (!text) {
      setError('请输入或导入 SVG 内容。');
      setResult(null);
      return;
    }

    const base64 = toBase64Utf8(text);
    const dataUri = `data:image/svg+xml;base64,${base64}`;
    const snippets = buildSnippets(dataUri);

    setResult({
      base64,
      dataUri,
      css: snippets.css,
      html: snippets.html
    });

    if (!/<svg[\s>]/i.test(text)) {
      setInfo('已转换 Base64（注意：输入中未检测到 <svg> 标签）。');
    } else {
      setInfo('转换完成。');
    }
  };

  const handleCopy = async () => {
    try {
      await copyTextToClipboard(outputText);
      setInfo('已复制输出内容。');
    } catch (err) {
      setError('复制失败，请检查浏览器权限。');
    }
  };

  const handleDownload = () => {
    if (!outputText) {
      setError('没有可下载的输出内容。');
      return;
    }
    const ext = outputKind === 'base64' ? 'txt' : outputKind;
    downloadText(`svg-base64.${ext}`, outputText);
    setInfo('已开始下载。');
  };

  const handleClear = () => {
    setSvgText('');
    setResult(null);
    setNotice('');
  };

  const handleDecode = () => {
    const raw = String(decodeInput || '').trim();
    if (!raw) {
      setError('请输入 Base64 或 data:image/svg+xml;base64,...');
      setDecodedSvg('');
      return;
    }

    try {
      const base64 = stripDataUriPrefix(raw);
      const svg = fromBase64Utf8(base64);
      setDecodedSvg(svg);
      setInfo('解码完成。');
    } catch (err) {
      setDecodedSvg('');
      setError('解码失败，请确认输入为合法 Base64 或 Data URI。');
    }
  };

  return (
    <ToolPageShell title="在线 SVG 转 Base64" desc="将 SVG 转为 Base64 / Data URI，并支持预览、复制与下载。">
      <div className="svg-toolbar">
        <label className="field-block">
          <span>导入 SVG 文件</span>
          <input type="file" accept="image/svg+xml,.svg" onChange={handleLoadFile} />
        </label>
        <label className="field-block">
          <span>输出类型</span>
          <select value={outputKind} onChange={(e) => setOutputKind(e.target.value)}>
            <option value="dataUri">Data URI</option>
            <option value="base64">Base64</option>
            <option value="css">CSS</option>
            <option value="html">HTML</option>
          </select>
        </label>
      </div>

      <div className="svg-io-grid">
        <div>
          <label className="field-label" htmlFor="svg-input">
            SVG 内容
          </label>
          <textarea
            id="svg-input"
            className="mono-textarea"
            placeholder="<svg ...>...</svg>"
            rows={12}
            value={svgText}
            onChange={(e) => setSvgText(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="svg-output">
            输出
          </label>
          <textarea
            id="svg-output"
            className="mono-textarea"
            placeholder="点击“转换”后生成输出"
            readOnly
            rows={12}
            value={outputText}
          />
        </div>
      </div>

      <div className="actions">
        <button type="button" onClick={handleConvert}>
          转换
        </button>
        <button type="button" onClick={handleCopy} disabled={!outputText}>
          复制输出
        </button>
        <button type="button" onClick={handleDownload} disabled={!outputText}>
          下载输出
        </button>
        <button type="button" onClick={handleClear}>
          清空
        </button>
      </div>

      {notice ? <p className={noticeIsError ? 'error' : 'status-text'}>{notice}</p> : null}

      {result ? (
        <div className="svg-preview">
          <div className="svg-preview-head">
            <p className="svg-preview-title">预览</p>
            <p className="svg-preview-meta">
              Base64 长度：{result.base64.length.toLocaleString()} 字符
            </p>
          </div>
          <div className="svg-preview-box">
            <img src={result.dataUri} alt="svg preview" />
          </div>
        </div>
      ) : (
        <p className="status-text">输入 SVG 后点击“转换”。</p>
      )}

      <details className="svg-decode">
        <summary>Base64 解码为 SVG（可选）</summary>
        <div className="svg-decode-body">
          <label className="field-label" htmlFor="svg-decode-input">
            Base64 或 Data URI
          </label>
          <textarea
            id="svg-decode-input"
            className="mono-textarea"
            rows={6}
            value={decodeInput}
            onChange={(e) => setDecodeInput(e.target.value)}
            placeholder="粘贴 Base64 或 data:image/svg+xml;base64,..."
          />
          <div className="actions">
            <button type="button" onClick={handleDecode}>
              解码
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  await copyTextToClipboard(decodedSvg);
                  setInfo('已复制 SVG 内容。');
                } catch (err) {
                  setError('复制失败，请检查浏览器权限。');
                }
              }}
              disabled={!decodedSvg}
            >
              复制 SVG
            </button>
          </div>
          <label className="field-label" htmlFor="svg-decoded">
            解码结果（SVG）
          </label>
          <textarea
            id="svg-decoded"
            className="mono-textarea"
            rows={8}
            readOnly
            value={decodedSvg}
            placeholder="这里显示解码后的 SVG"
          />
        </div>
      </details>
    </ToolPageShell>
  );
}

export default SvgBase64Page;

