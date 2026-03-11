import { useEffect, useMemo, useRef, useState } from 'react';
import ToolPageShell from '../components/ToolPageShell';

function clampNumber(value, { min, max, fallback }) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, num));
}

function escapeXmlAttr(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function parseViewBox(text) {
  const parts = String(text || '')
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((item) => Number(item));

  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return null;
  }
  const [x, y, width, height] = parts;
  if (width <= 0 || height <= 0) {
    return null;
  }
  return { x, y, width, height, text: `${x} ${y} ${width} ${height}` };
}

function extractPathsFromInput(rawText) {
  const raw = String(rawText || '').replace(/^\uFEFF/, '').trim();
  if (!raw) {
    return { paths: [], source: 'empty' };
  }

  const extractDByRegex = (text) => {
    const ds = [];
    const re = /d\s*=\s*("([^"]*)"|'([^']*)')/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
      const d = (m[2] || m[3] || '').trim();
      if (d) {
        ds.push(d);
      }
    }
    return ds;
  };

  const looksLikeXml = raw.includes('<') && raw.includes('>');
  if (looksLikeXml) {
    const wrapped = /<svg[\s>]/i.test(raw)
      ? raw
      : `<svg xmlns="http://www.w3.org/2000/svg">${raw}</svg>`;
    try {
      const doc = new DOMParser().parseFromString(wrapped, 'image/svg+xml');
      const parserErrors = doc.getElementsByTagName('parsererror');
      if (!parserErrors.length) {
        const ds = Array.from(doc.getElementsByTagName('path'))
          .map((el) => (el.getAttribute('d') || '').trim())
          .filter(Boolean);
        if (ds.length) {
          return { paths: ds, source: 'xml' };
        }
      }
    } catch (err) {
      // fall through
    }

    const ds = extractDByRegex(raw);
    if (ds.length) {
      return { paths: ds, source: 'attr' };
    }
  }

  const lines = raw.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean);
  const ds = [];
  lines.forEach((line) => {
    const match = line.match(/d\s*=\s*("([^"]*)"|'([^']*)')/i);
    if (match) {
      const d = (match[2] || match[3] || '').trim();
      if (d) {
        ds.push(d);
      }
      return;
    }
    ds.push(line);
  });

  return { paths: ds, source: 'text' };
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

function formatNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return '';
  }
  const abs = Math.abs(num);
  const digits = abs >= 1000 ? 0 : abs >= 100 ? 1 : 2;
  return num.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

function SvgPathPage() {
  const [input, setInput] = useState('M10 10 L90 10 L90 90 L10 90 Z');
  const [paths, setPaths] = useState([]);
  const [sourceKind, setSourceKind] = useState('');

  const [stroke, setStroke] = useState('#1c78dc');
  const [fillEnabled, setFillEnabled] = useState(false);
  const [fill, setFill] = useState('#0b1f33');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [paddingPercent, setPaddingPercent] = useState(10);
  const [autoFit, setAutoFit] = useState(true);
  const [viewBoxManual, setViewBoxManual] = useState('0 0 100 100');
  const [viewBoxAuto, setViewBoxAuto] = useState('0 0 100 100');
  const [showGrid, setShowGrid] = useState(true);
  const [showBBox, setShowBBox] = useState(false);

  const [notice, setNotice] = useState('');
  const [noticeIsError, setNoticeIsError] = useState(false);

  const [bbox, setBbox] = useState(null);
  const [totalLength, setTotalLength] = useState(null);

  const groupRef = useRef(null);

  const setInfo = (msg) => {
    setNotice(msg || '');
    setNoticeIsError(false);
  };

  const setError = (msg) => {
    setNotice(msg || '');
    setNoticeIsError(true);
  };

  const activeViewBoxText = autoFit ? viewBoxAuto : viewBoxManual;
  const activeViewBox = useMemo(() => parseViewBox(activeViewBoxText), [activeViewBoxText]);

  const svgMarkup = useMemo(() => {
    if (!paths.length) {
      return '';
    }
    const viewBox = activeViewBox ? activeViewBox.text : '0 0 100 100';
    const fillValue = fillEnabled ? fill : 'none';
    const strokeValue = stroke || 'none';
    const strokeValueAttr = escapeXmlAttr(strokeValue);
    const fillValueAttr = escapeXmlAttr(fillValue);
    const pathLines = paths.map((d) => {
      const dAttr = escapeXmlAttr(d);
      return `  <path d="${dAttr}" fill="${fillValueAttr}" stroke="${strokeValueAttr}" stroke-width="${strokeWidth}" />`;
    });
    return [
      '<svg xmlns="http://www.w3.org/2000/svg"',
      `  viewBox="${escapeXmlAttr(viewBox)}">`,
      ...pathLines,
      '</svg>'
    ].join('\n');
  }, [activeViewBox, fill, fillEnabled, paths, stroke, strokeWidth]);

  const handlePreview = () => {
    const parsed = extractPathsFromInput(input);
    if (!parsed.paths.length) {
      setPaths([]);
      setSourceKind('');
      setBbox(null);
      setTotalLength(null);
      setError('未解析到 path 数据。请粘贴 path 的 d（可多行）或 <path d="...">。');
      return;
    }

    setPaths(parsed.paths);
    setSourceKind(parsed.source);
    setInfo(`已解析 ${parsed.paths.length} 条 path。`);
  };

  const handleClear = () => {
    setInput('');
    setPaths([]);
    setSourceKind('');
    setBbox(null);
    setTotalLength(null);
    setNotice('');
  };

  useEffect(() => {
    if (!autoFit) {
      setBbox(null);
      return;
    }
    if (!paths.length) {
      setViewBoxAuto('0 0 100 100');
      setViewBoxManual('0 0 100 100');
      setBbox(null);
      return;
    }
    if (!groupRef.current) {
      return;
    }

    try {
      const nextBox = groupRef.current.getBBox();
      if (![nextBox.x, nextBox.y, nextBox.width, nextBox.height].every(Number.isFinite)) {
        throw new Error('BBox 不可用');
      }

      const maxSide = Math.max(nextBox.width, nextBox.height);
      const percent = clampNumber(paddingPercent, { min: 0, max: 60, fallback: 10 });
      const pad = Math.max(2, (maxSide || 1) * (percent / 100));

      const x = nextBox.x - pad;
      const y = nextBox.y - pad;
      const width = Math.max(1, nextBox.width + pad * 2);
      const height = Math.max(1, nextBox.height + pad * 2);
      const viewBoxText = `${formatNumber(x)} ${formatNumber(y)} ${formatNumber(width)} ${formatNumber(height)}`;

      setBbox({ x: nextBox.x, y: nextBox.y, width: nextBox.width, height: nextBox.height });
      setViewBoxAuto(viewBoxText);
      setViewBoxManual(viewBoxText);
    } catch (err) {
      setBbox(null);
      setViewBoxAuto('0 0 100 100');
      setViewBoxManual('0 0 100 100');
      setError('无法计算 viewBox：请检查 path 是否有效。');
    }
  }, [autoFit, paddingPercent, paths]);

  useEffect(() => {
    if (!paths.length || !groupRef.current) {
      setTotalLength(null);
      return;
    }
    const pathEls = Array.from(groupRef.current.querySelectorAll('path'));
    let total = 0;
    let okCount = 0;
    pathEls.forEach((el) => {
      if (!el || typeof el.getTotalLength !== 'function') {
        return;
      }
      try {
        total += el.getTotalLength();
        okCount += 1;
      } catch (err) {
        // ignore invalid path
      }
    });
    if (!okCount) {
      setTotalLength(null);
      return;
    }
    setTotalLength(total);
  }, [paths]);

  const viewBoxHint = useMemo(() => {
    if (!activeViewBox) {
      return 'viewBox 格式：minX minY width height';
    }
    return `viewBox：${activeViewBox.text}`;
  }, [activeViewBox]);

  const viewBoxRect = useMemo(() => {
    if (!activeViewBox) {
      return null;
    }
    return {
      x: activeViewBox.x,
      y: activeViewBox.y,
      width: activeViewBox.width,
      height: activeViewBox.height
    };
  }, [activeViewBox]);

  const fillValue = fillEnabled ? fill : 'none';

  return (
    <ToolPageShell title="在线 SVG Path 预览" desc="粘贴 path 的 d 或 <path>，自动计算 viewBox 并预览。">
      <div className="svgpath-grid">
        <div>
          <label className="field-label" htmlFor="svgpath-input">
            Path / SVG 输入
          </label>
          <textarea
            id="svgpath-input"
            className="mono-textarea"
            rows={12}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`支持：
1) 直接粘贴 d（可多行）
2) 粘贴 <path d="..." />
3) 粘贴完整 <svg>...</svg>`}
          />

          <div className="svgpath-toolbar">
            <label className="field-block">
              <span>Stroke</span>
              <input
                type="text"
                value={stroke}
                onChange={(e) => setStroke(e.target.value)}
                placeholder="#1c78dc"
              />
            </label>
            <label className="field-block">
              <span>Stroke Width</span>
              <input
                type="number"
                min={0}
                max={50}
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(clampNumber(e.target.value, { min: 0, max: 50, fallback: 2 }))}
              />
            </label>

            <label className="field-block">
              <span>Auto Fit Padding (%)</span>
              <input
                type="number"
                min={0}
                max={60}
                value={paddingPercent}
                onChange={(e) =>
                  setPaddingPercent(clampNumber(e.target.value, { min: 0, max: 60, fallback: 10 }))
                }
                disabled={!autoFit}
              />
            </label>
          </div>

          <div className="check-row svgpath-options">
            <label className="check-label">
              <input type="checkbox" checked={autoFit} onChange={(e) => setAutoFit(e.target.checked)} />
              <span>自动计算 viewBox</span>
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={fillEnabled}
                onChange={(e) => setFillEnabled(e.target.checked)}
              />
              <span>填充</span>
            </label>
            <label className={fillEnabled ? 'check-label' : 'check-label hidden'}>
              <input type="text" value={fill} onChange={(e) => setFill(e.target.value)} placeholder="#0b1f33" />
              <span>Fill</span>
            </label>
            <label className="check-label">
              <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
              <span>网格</span>
            </label>
            <label className="check-label">
              <input type="checkbox" checked={showBBox} onChange={(e) => setShowBBox(e.target.checked)} />
              <span>BBox</span>
            </label>
          </div>

          <label className="field-label" htmlFor="svgpath-viewbox">
            viewBox
          </label>
          <input
            id="svgpath-viewbox"
            type="text"
            value={activeViewBoxText}
            onChange={(e) => setViewBoxManual(e.target.value)}
            disabled={autoFit}
            placeholder="0 0 100 100"
          />
          <p className="svgpath-hint">{viewBoxHint}</p>

          <div className="actions">
            <button type="button" onClick={handlePreview}>
              预览
            </button>
            <button type="button" onClick={handleClear}>
              清空
            </button>
            <button
              type="button"
              disabled={!svgMarkup}
              onClick={async () => {
                try {
                  await copyTextToClipboard(svgMarkup);
                  setInfo('已复制 SVG 代码。');
                } catch (err) {
                  setError('复制失败，请检查浏览器权限。');
                }
              }}
            >
              复制 SVG
            </button>
            <button
              type="button"
              disabled={!svgMarkup}
              onClick={() => {
                downloadText('svg-path.svg', svgMarkup, 'image/svg+xml;charset=utf-8');
                setInfo('已开始下载 SVG。');
              }}
            >
              下载 SVG
            </button>
          </div>

          {notice ? <p className={noticeIsError ? 'error' : 'status-text'}>{notice}</p> : null}
          {paths.length ? (
            <p className="svgpath-meta">
              {sourceKind ? `来源：${sourceKind}，` : ''}
              路径数：{paths.length}
              {totalLength !== null ? `，总长度：${formatNumber(totalLength)}` : ''}
              {bbox ? `，BBox：${formatNumber(bbox.width)} x ${formatNumber(bbox.height)}` : ''}
            </p>
          ) : null}
        </div>

        <div className="svgpath-preview">
          <div className="svgpath-preview-head">
            <p className="svgpath-preview-title">预览</p>
            <p className="svgpath-preview-meta">{paths.length ? '实时渲染' : '等待输入'}</p>
          </div>
          <div className="svgpath-canvas">
            <svg
              viewBox={activeViewBox ? activeViewBox.text : '0 0 100 100'}
              width="100%"
              height="360"
              preserveAspectRatio="xMidYMid meet"
              aria-label="svg path preview"
              role="img"
            >
              {showGrid && viewBoxRect ? (
                <>
                  <defs>
                    <pattern id="svgpath-grid" width="10" height="10" patternUnits="userSpaceOnUse">
                      <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#e6eef8" strokeWidth="1" />
                    </pattern>
                  </defs>
                  <rect
                    x={viewBoxRect.x}
                    y={viewBoxRect.y}
                    width={viewBoxRect.width}
                    height={viewBoxRect.height}
                    fill="url(#svgpath-grid)"
                  />
                </>
              ) : null}

              {showBBox && bbox ? (
                <rect
                  x={bbox.x}
                  y={bbox.y}
                  width={bbox.width}
                  height={bbox.height}
                  fill="none"
                  stroke="#ff8a3d"
                  strokeWidth="1"
                  strokeDasharray="4 3"
                />
              ) : null}

              <g ref={groupRef}>
                {paths.map((d, idx) => (
                  <path
                    // eslint-disable-next-line react/no-array-index-key
                    key={`${idx}-${d.slice(0, 12)}`}
                    d={d}
                    fill={fillValue}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
            </svg>
          </div>

          <details className="svgpath-panel" open>
            <summary>生成 SVG 代码</summary>
            <div className="svgpath-panel-body">
              <textarea className="mono-textarea" rows={10} readOnly value={svgMarkup} placeholder="点击预览后生成" />
              <div className="actions">
                <button
                  type="button"
                  disabled={!svgMarkup}
                  onClick={async () => {
                    try {
                      await copyTextToClipboard(svgMarkup);
                      setInfo('已复制 SVG 代码。');
                    } catch (err) {
                      setError('复制失败，请检查浏览器权限。');
                    }
                  }}
                >
                  复制
                </button>
                <button
                  type="button"
                  disabled={!svgMarkup}
                  onClick={() => downloadText('svg-path.svg', svgMarkup, 'image/svg+xml;charset=utf-8')}
                >
                  下载
                </button>
              </div>
            </div>
          </details>
        </div>
      </div>
    </ToolPageShell>
  );
}

export default SvgPathPage;
