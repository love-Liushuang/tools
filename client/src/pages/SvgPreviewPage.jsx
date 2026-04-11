import { useEffect, useMemo, useState } from 'react';
import { copyText } from '../lib/tool';
import ToolPageShell from '../components/ToolPageShell';

const DEFAULT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <rect width="160" height="160" fill="#eef5fc"/>
  <circle cx="80" cy="80" r="54" fill="#1c78dc" opacity="0.15"/>
  <path d="M50 82 L72 104 L112 56" fill="none" stroke="#1c78dc" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

function sanitizeSvg(text) {
  return String(text || '').replace(/^\uFEFF/, '').trim();
}

function downloadText(filename, text, mime = 'image/svg+xml;charset=utf-8') {
  const blob = new Blob([String(text || '')], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'image.svg';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function parseSvgMeta(svgText) {
  const text = sanitizeSvg(svgText);
  if (!text) {
    return { ok: false, error: '请输入 SVG 代码。' };
  }
  if (!text.includes('<svg')) {
    return { ok: false, error: '未检测到 <svg> 根节点，请粘贴完整 SVG。' };
  }

  try {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const parserError = doc.getElementsByTagName('parsererror');
    if (parserError && parserError.length) {
      return { ok: false, error: 'SVG 解析失败，请检查代码是否完整。' };
    }

    const svgEl = doc.getElementsByTagName('svg')[0];
    if (!svgEl) {
      return { ok: false, error: '未找到 <svg> 根节点。' };
    }

    return {
      ok: true,
      width: (svgEl.getAttribute('width') || '').trim(),
      height: (svgEl.getAttribute('height') || '').trim(),
      viewBox: (svgEl.getAttribute('viewBox') || '').trim()
    };
  } catch (err) {
    return { ok: false, error: 'SVG 解析失败，请检查代码。' };
  }
}

function SvgPreviewPage() {
  const [svgText, setSvgText] = useState(DEFAULT_SVG);
  const [previewUrl, setPreviewUrl] = useState('');
  const [imgError, setImgError] = useState('');

  const [showBorder, setShowBorder] = useState(true);
  const [background, setBackground] = useState('checker');
  const [notice, setNotice] = useState('');
  const [noticeIsError, setNoticeIsError] = useState(false);

  const setInfo = (msg) => {
    setNotice(msg || '');
    setNoticeIsError(false);
  };

  const setError = (msg) => {
    setNotice(msg || '');
    setNoticeIsError(true);
  };

  const meta = useMemo(() => parseSvgMeta(svgText), [svgText]);

  useEffect(() => {
    const text = sanitizeSvg(svgText);
    setImgError('');
    if (!text) {
      setPreviewUrl('');
      return;
    }
    const blob = new Blob([text], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [svgText]);

  const handleLoadFile = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      setSvgText(text);
      setNotice('');
    } catch (err) {
      setError('读取 SVG 文件失败。');
    } finally {
      event.target.value = '';
    }
  };

  const bgClass =
    background === 'dark' ? 'svgprev-bg-dark' : background === 'white' ? 'svgprev-bg-white' : 'svgprev-bg-checker';

  return (
    <ToolPageShell title="在线 SVG 图片预览" desc="粘贴或导入 SVG 代码，实时预览并支持下载（预览红框不写入文件）。">
      <div className="svg-toolbar">
        <label className="field-block">
          <span>导入 SVG 文件</span>
          <input type="file" accept="image/svg+xml,.svg" onChange={handleLoadFile} />
        </label>
        <label className="field-block">
          <span>预览背景</span>
          <select value={background} onChange={(e) => setBackground(e.target.value)}>
            <option value="checker">棋盘格</option>
            <option value="white">白色</option>
            <option value="dark">深色</option>
          </select>
        </label>
      </div>

      <div className="check-row svgprev-options">
        <label className="check-label">
          <input type="checkbox" checked={showBorder} onChange={(e) => setShowBorder(e.target.checked)} />
          <span>显示红色边框</span>
        </label>
      </div>

      <div className="svgprev-grid">
        <div>
          <label className="field-label" htmlFor="svg-preview-input">
            SVG 代码
          </label>
          <textarea
            id="svg-preview-input"
            className="mono-textarea"
            rows={14}
            value={svgText}
            onChange={(e) => setSvgText(e.target.value)}
            placeholder="<svg ...>...</svg>"
          />
          <div className="actions">
            <button
              type="button"
              onClick={async () => {
                const ok = await copyText(svgText);
                if (ok) {
                    setInfo('已复制 SVG 代码。');
                } else {
                    setError('复制失败，请检查浏览器权限。');
                }
              }}
              disabled={!sanitizeSvg(svgText)}
            >
              复制代码
            </button>
            <button
              type="button"
              onClick={() => {
                downloadText('preview.svg', sanitizeSvg(svgText));
                setInfo('已开始下载 SVG。');
              }}
              disabled={!sanitizeSvg(svgText)}
            >
              下载 SVG
            </button>
            <button
              type="button"
              onClick={() => {
                setSvgText(DEFAULT_SVG);
                setNotice('');
              }}
            >
              还原示例
            </button>
            <button
              type="button"
              onClick={() => {
                setSvgText('');
                setPreviewUrl('');
                setImgError('');
                setNotice('');
              }}
            >
              清空
            </button>
          </div>

          {notice ? <p className={noticeIsError ? 'error' : 'status-text'}>{notice}</p> : null}
          {!meta.ok ? <p className="error">{meta.error}</p> : null}
          {meta.ok ? (
            <p className="svgprev-meta">
              {meta.width ? `width=${meta.width}` : 'width=auto'}，{meta.height ? `height=${meta.height}` : 'height=auto'}
              {meta.viewBox ? `，viewBox="${meta.viewBox}"` : ''}
            </p>
          ) : null}
        </div>

        <div className="svgprev-preview">
          <div className="svgprev-preview-head">
            <p className="svgprev-preview-title">预览</p>
            <p className="svgprev-preview-meta">{previewUrl ? '实时渲染' : '等待输入'}</p>
          </div>
          <div className={`svgprev-canvas ${bgClass}`}>
            {previewUrl ? (
              <img
                className={showBorder ? 'svgprev-img svgprev-img-border' : 'svgprev-img'}
                src={previewUrl}
                alt="svg preview"
                onError={() => setImgError('SVG 无法渲染，请检查代码。')}
              />
            ) : (
              <p className="status-text">粘贴 SVG 代码后显示预览。</p>
            )}
          </div>
          {imgError ? <p className="error">{imgError}</p> : null}
        </div>
      </div>
    </ToolPageShell>
  );
}

export default SvgPreviewPage;

