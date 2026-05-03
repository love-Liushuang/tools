import { useEffect, useMemo, useRef, useState } from 'react';
import ToolPageShell from '../components/ToolPageShell';

const IMAGE_TYPE_OPTIONS = [
  { key: 'image/jpeg', label: 'jpg', ext: 'jpg' },
  { key: 'image/jpeg-jpeg', label: 'jpeg', ext: 'jpeg', mime: 'image/jpeg' },
  { key: 'image/png', label: 'png', ext: 'png' },
  { key: 'image/webp', label: 'webp', ext: 'webp' }
];

const HORIZONTAL_ALIGN_OPTIONS = [
  { key: '1', label: '左对齐' },
  { key: '2', label: '居中对齐' },
  { key: '3', label: '右对齐' }
];

const VERTICAL_ALIGN_OPTIONS = [
  { key: '1', label: '顶端对齐' },
  { key: '2', label: '居中对齐' },
  { key: '3', label: '底端对齐' }
];

const FONT_OPTIONS = [
  { key: 'Microsoft YaHei', label: '微软雅黑' },
  { key: 'SimSun', label: '宋体' },
  { key: 'NSimSun', label: '新宋体' },
  { key: 'KaiTi', label: '楷体' },
  { key: 'SimHei', label: '黑体' },
  { key: 'YouYuan', label: '幼圆' },
  { key: 'LiSu', label: '隶书' },
  { key: 'Times New Roman', label: 'Times New Roman' },
  { key: 'Arial', label: 'Arial' },
  { key: 'Verdana', label: 'Verdana' }
];

const DEFAULT_FORM = {
  text: '文字生成图片\n支持多行文本排版',
  imageType: 'image/png',
  width: '800',
  height: '800',
  horizontalAlign: '2',
  horizontalPadding: '10',
  verticalAlign: '2',
  verticalPadding: '10',
  fontName: 'Microsoft YaHei',
  fontSize: '30',
  lineHeight: '35',
  backColor: '#FFFFFF',
  foreColor: '#000000'
};

const TEXT_RENDER_SAFE_PADDING = 1;

function normalizeImageTypeKey(value) {
  return IMAGE_TYPE_OPTIONS.some((item) => item.key === value) ? value : DEFAULT_FORM.imageType;
}

function getImageTypeConfig(imageTypeKey) {
  const matched = IMAGE_TYPE_OPTIONS.find((item) => item.key === imageTypeKey);
  if (!matched) {
    return { mime: 'image/png', ext: 'png', label: 'png' };
  }
  return {
    mime: matched.mime || (matched.key === 'image/jpeg-jpeg' ? 'image/jpeg' : matched.key),
    ext: matched.ext,
    label: matched.label
  };
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function normalizePadding(value, fallback) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function normalizeColorValue(value, fallback = '#000000') {
  const text = String(value || '').trim();
  if (!text) {
    return fallback;
  }
  const probe = document.createElement('span');
  probe.style.color = '';
  probe.style.color = text;
  return probe.style.color ? text : fallback;
}

function getValidatedColor(value, fieldLabel, fallback) {
  const text = String(value || '').trim();
  if (!text) {
    return fallback;
  }
  const normalized = normalizeColorValue(text, '');
  if (!normalized) {
    throw new Error(`${fieldLabel}格式无效，请输入合法的十六进制或 CSS 颜色。`);
  }
  return text;
}

function colorInputValue(value, fallback) {
  const normalized = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(normalized)) {
    return normalized;
  }
  return fallback;
}

function wrapTextToLines(ctx, text, maxWidth) {
  const lines = [];
  const paragraphs = String(text || '').replace(/\r\n/g, '\n').split('\n');

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const content = paragraph || '';
    if (!content) {
      lines.push('');
      return;
    }

    let current = '';
    for (const char of content) {
      const next = current + char;
      if (current && ctx.measureText(next).width > maxWidth) {
        lines.push(current);
        current = char;
      } else {
        current = next;
      }
    }

    lines.push(current || '');

    if (paragraphIndex < paragraphs.length - 1 && paragraph === '') {
      lines.push('');
    }
  });

  return lines.length ? lines : [''];
}

function measureLineBounds(ctx, line, fontSize) {
  const metrics = ctx.measureText(line || '国');
  const ascent = Number.isFinite(metrics.actualBoundingBoxAscent) && metrics.actualBoundingBoxAscent > 0
    ? metrics.actualBoundingBoxAscent
    : Number.isFinite(metrics.fontBoundingBoxAscent) && metrics.fontBoundingBoxAscent > 0
      ? metrics.fontBoundingBoxAscent
      : fontSize * 0.8;
  const descent = Number.isFinite(metrics.actualBoundingBoxDescent) && metrics.actualBoundingBoxDescent > 0
    ? metrics.actualBoundingBoxDescent
    : Number.isFinite(metrics.fontBoundingBoxDescent) && metrics.fontBoundingBoxDescent > 0
      ? metrics.fontBoundingBoxDescent
      : fontSize * 0.2;

  return { ascent, descent };
}

function getTextBlockBounds(lineMetrics, lineHeight) {
  let top = 0;
  let bottom = 0;

  lineMetrics.forEach((metrics, index) => {
    const baseline = index * lineHeight;
    top = Math.min(top, baseline - metrics.ascent - TEXT_RENDER_SAFE_PADDING);
    bottom = Math.max(bottom, baseline + metrics.descent + TEXT_RENDER_SAFE_PADDING);
  });

  return {
    top,
    height: Math.max(0, bottom - top)
  };
}

function drawTextImage(options) {
  const width = normalizePositiveInt(options.width, 800);
  const height = normalizePositiveInt(options.height, 800);
  const fontSize = normalizePositiveInt(options.fontSize, 30);
  const lineHeight = normalizePositiveInt(options.lineHeight, 35);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('当前浏览器不支持 Canvas 2D。');
  }

  const backColor = getValidatedColor(options.backColor, '背景颜色', '#FFFFFF');
  const foreColor = getValidatedColor(options.foreColor, '文字颜色', '#000000');
  const safeText = String(options.text || '').trim();
  if (!safeText) {
    throw new Error('请输入需要生成图片的文本。');
  }

  ctx.fillStyle = backColor;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = foreColor;
  ctx.font = `${fontSize}px ${options.fontName || DEFAULT_FORM.fontName}`;
  ctx.textBaseline = 'alphabetic';

  const horizontalAlign = String(options.horizontalAlign || '2');
  const verticalAlign = String(options.verticalAlign || '2');
  const horizontalPadding = horizontalAlign === '2' ? 0 : normalizePadding(options.horizontalPadding, 10);
  const verticalPadding = verticalAlign === '2' ? 0 : normalizePadding(options.verticalPadding, 10);
  const contentWidth = Math.max(1, width - (horizontalAlign === '2' ? 0 : horizontalPadding * 2));
  const lines = wrapTextToLines(ctx, safeText, contentWidth);
  const lineMetrics = lines.map((line) => measureLineBounds(ctx, line, fontSize));
  const textBlockBounds = getTextBlockBounds(lineMetrics, lineHeight);
  const textBlockHeight = textBlockBounds.height;

  let blockTopY = verticalPadding;
  if (verticalAlign === '2') {
    blockTopY = Math.max(0, (height - textBlockHeight) / 2);
  }
  if (verticalAlign === '3') {
    blockTopY = Math.max(0, height - textBlockHeight - verticalPadding);
  }

  ctx.textAlign = horizontalAlign === '1' ? 'left' : horizontalAlign === '3' ? 'right' : 'center';
  const firstBaselineY = blockTopY - textBlockBounds.top;

  lines.forEach((line, index) => {
    const x = horizontalAlign === '1'
      ? horizontalPadding
      : horizontalAlign === '3'
        ? width - horizontalPadding
        : width / 2;
    const y = firstBaselineY + index * lineHeight;
    ctx.fillText(line, x, y);
  });

  return {
    canvas,
    width,
    height,
    lineCount: lines.length,
    fontSize,
    lineHeight,
    backColor,
    foreColor
  };
}

function TextToImagePage() {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const latestUrlRef = useRef('');

  useEffect(() => {
    return () => {
      if (latestUrlRef.current) {
        URL.revokeObjectURL(latestUrlRef.current);
      }
    };
  }, []);

  const imageTypeConfig = useMemo(
    () => getImageTypeConfig(normalizeImageTypeKey(form.imageType)),
    [form.imageType]
  );

  const horizontalPaddingLabel = form.horizontalAlign === '1' ? '左边距' : form.horizontalAlign === '3' ? '右边距' : '边距';
  const verticalPaddingLabel = form.verticalAlign === '1' ? '上边距' : form.verticalAlign === '3' ? '下边距' : '边距';

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const syncColorFromPicker = (key, value) => {
    updateField(key, value);
  };

  const applyResult = async () => {
    const rendered = drawTextImage(form);
    const blob = await new Promise((resolve, reject) => {
      rendered.canvas.toBlob(
        (nextBlob) => {
          if (!nextBlob) {
            reject(new Error('生成图片失败，请稍后重试。'));
            return;
          }
          resolve(nextBlob);
        },
        imageTypeConfig.mime,
        imageTypeConfig.mime === 'image/png' ? undefined : 1
      );
    });

    if (latestUrlRef.current) {
      URL.revokeObjectURL(latestUrlRef.current);
    }

    const url = URL.createObjectURL(blob);
    latestUrlRef.current = url;
    setResult({
      url,
      width: rendered.width,
      height: rendered.height,
      lineCount: rendered.lineCount,
      name: `text-to-image.${imageTypeConfig.ext}`
    });
    setStatusText(`生成完成：${rendered.width} x ${rendered.height}，共 ${rendered.lineCount} 行。`);
    setError('');
  };

  const handleGenerate = async () => {
    try {
      setError('');
      setStatusText('正在生成图片...');
      await applyResult();
    } catch (runtimeError) {
      setStatusText('');
      setError(runtimeError.message || '生成图片失败，请稍后重试。');
    }
  };

  const handleDownload = () => {
    if (!result?.url) {
      setError('请先生成图片。');
      return;
    }

    const link = document.createElement('a');
    link.href = result.url;
    link.download = result.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleClear = () => {
    if (latestUrlRef.current) {
      URL.revokeObjectURL(latestUrlRef.current);
      latestUrlRef.current = '';
    }
    setForm({ ...DEFAULT_FORM });
    setResult(null);
    setStatusText('');
    setError('');
  };

  return (
    <ToolPageShell
      title="文字生成图片"
      desc="将单行或多行文本生成图片，支持图片类型、宽高、对齐、边距、字体、字号、行高和前景/背景色。"
    >
      <div className="text-image-layout">
        <label className="field-block text-image-textarea">
          <span>输入文本</span>
          <textarea
            rows={8}
            value={form.text}
            placeholder="请输入需要生成图片的文本"
            onChange={(event) => updateField('text', event.target.value)}
          />
        </label>

        <div className="text-image-form-grid">
          <label className="field-block">
            <span>图片类型</span>
            <select
              value={normalizeImageTypeKey(form.imageType)}
              onChange={(event) => updateField('imageType', event.target.value)}
            >
              {IMAGE_TYPE_OPTIONS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field-block">
            <span>宽度</span>
            <input
              type="number"
              min={1}
              value={form.width}
              onChange={(event) => updateField('width', event.target.value)}
            />
          </label>

          <label className="field-block">
            <span>高度</span>
            <input
              type="number"
              min={1}
              value={form.height}
              onChange={(event) => updateField('height', event.target.value)}
            />
          </label>

          <label className="field-block">
            <span>水平方向</span>
            <select
              value={form.horizontalAlign}
              onChange={(event) => updateField('horizontalAlign', event.target.value)}
            >
              {HORIZONTAL_ALIGN_OPTIONS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field-block">
            <span>{horizontalPaddingLabel}</span>
            <input
              type="number"
              min={0}
              value={form.horizontalAlign === '2' ? '' : form.horizontalPadding}
              onChange={(event) => updateField('horizontalPadding', event.target.value)}
              disabled={form.horizontalAlign === '2'}
              placeholder={form.horizontalAlign === '2' ? '居中时无需设置' : '10'}
            />
          </label>

          <label className="field-block">
            <span>垂直方向</span>
            <select
              value={form.verticalAlign}
              onChange={(event) => updateField('verticalAlign', event.target.value)}
            >
              {VERTICAL_ALIGN_OPTIONS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field-block">
            <span>{verticalPaddingLabel}</span>
            <input
              type="number"
              min={0}
              value={form.verticalAlign === '2' ? '' : form.verticalPadding}
              onChange={(event) => updateField('verticalPadding', event.target.value)}
              disabled={form.verticalAlign === '2'}
              placeholder={form.verticalAlign === '2' ? '居中时无需设置' : '10'}
            />
          </label>

          <label className="field-block">
            <span>字体</span>
            <select value={form.fontName} onChange={(event) => updateField('fontName', event.target.value)}>
              {FONT_OPTIONS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field-block">
            <span>文字大小</span>
            <input
              type="number"
              min={1}
              value={form.fontSize}
              onChange={(event) => updateField('fontSize', event.target.value)}
            />
          </label>

          <label className="field-block">
            <span>行高</span>
            <input
              type="number"
              min={1}
              value={form.lineHeight}
              onChange={(event) => updateField('lineHeight', event.target.value)}
            />
          </label>
        </div>

        <div className="text-image-color-grid">
          <label className="field-block">
            <span>背景颜色</span>
            <div className="text-image-color-row">
              <input
                type="text"
                value={form.backColor}
                placeholder="十六进制颜色代码"
                onChange={(event) => updateField('backColor', event.target.value)}
              />
              <input
                type="color"
                value={colorInputValue(form.backColor, '#ffffff')}
                onChange={(event) => syncColorFromPicker('backColor', event.target.value)}
              />
            </div>
          </label>

          <label className="field-block">
            <span>文字颜色</span>
            <div className="text-image-color-row">
              <input
                type="text"
                value={form.foreColor}
                placeholder="十六进制颜色代码"
                onChange={(event) => updateField('foreColor', event.target.value)}
              />
              <input
                type="color"
                value={colorInputValue(form.foreColor, '#000000')}
                onChange={(event) => syncColorFromPicker('foreColor', event.target.value)}
              />
            </div>
          </label>
        </div>

        <div className="actions">
          <button type="button" className="primary" onClick={handleGenerate}>
            生成图片
          </button>
          <button type="button" onClick={handleDownload}>
            下载图片
          </button>
          <button type="button" onClick={handleClear}>
            清空
          </button>
        </div>

        {statusText ? <p className="status-text">{statusText}</p> : null}
        {error ? <p className="error">{error}</p> : null}

        <p className="file-summary">
          默认参数参考示例站：{DEFAULT_FORM.width} x {DEFAULT_FORM.height}、字号 {DEFAULT_FORM.fontSize}px、行高 {DEFAULT_FORM.lineHeight}px。
        </p>

        <div className="text-image-preview-card">
          <div className="text-image-preview-meta">
            <strong>预览结果</strong>
            {result ? <span>{result.width} x {result.height} · {result.name}</span> : <span>点击“生成图片”后显示预览</span>}
          </div>
          <div className="text-image-preview-stage">
            {result ? (
              <img src={result.url} alt="文字生成图片预览" />
            ) : (
              <p className="status-text">点击“生成图片”后展示预览。</p>
            )}
          </div>
        </div>
      </div>
    </ToolPageShell>
  );
}

export default TextToImagePage;
