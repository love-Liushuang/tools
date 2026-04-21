import { useEffect, useMemo, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import ToolPageShell from '../components/ToolPageShell';
import { useToast } from '../components/ToastProvider';
import './BeadPatternPage.css';
import { DEFAULT_PALETTE_KEY } from '../lib/beadPalettes';
import {
  baseName,
  buildPatternModel,
  clampNumber,
  createBoardCanvas,
  createPatternOverviewCanvas,
  createPatternThumbnailDataUrl,
  downloadCanvas,
  drawPatternToContext,
  floodFillCodes,
  formatDateTime,
  getPreparedPalette,
  loadPatternHistory,
  restorePatternFromHistory,
  savePatternHistoryEntry,
  deletePatternHistoryEntry,
  sortMaterialList
} from '../lib/beadUtils';

const MIN_GRID_WIDTH = 10;
const MAX_GRID_WIDTH = 200;
const MAX_UNDO_STEPS = 60;
const AUTO_SAVE_DELAY = 700;

const EDIT_TOOLS = [
  { key: 'paint', label: '画笔' },
  { key: 'erase', label: '橡皮' },
  { key: 'picker', label: '吸管' },
  { key: 'fill', label: '填充' }
];

function safePatternName(value, fallback = '拼豆图纸') {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return fallback;
  }
  return normalized.replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '-');
}

function makePatternFileStem(pattern, source) {
  return safePatternName(pattern?.name || source?.baseFileName || '拼豆图纸');
}

function describeProgress(progress) {
  if (!progress) {
    return '';
  }
  return `${Math.max(1, Math.round((progress.ratio || 0) * 100))}% · ${progress.label || '处理中…'}`;
}

function choosePreferredCode(pattern) {
  const materials = sortMaterialList(pattern);
  if (materials.length) {
    return materials[0].code;
  }
  const palette = getPreparedPalette(pattern?.brandKey || DEFAULT_PALETTE_KEY);
  return palette.colors[0]?.code || null;
}

function makePatternFromExisting(existing, nextCodes, overrides = {}) {
  return buildPatternModel({
    codes: nextCodes,
    width: overrides.width ?? existing.width,
    height: overrides.height ?? existing.height,
    brandKey: overrides.brandKey ?? existing.brandKey,
    name: overrides.name ?? existing.name,
    historyId: overrides.historyId ?? existing.historyId,
    createdAt: overrides.createdAt ?? existing.createdAt
  });
}

function waitForImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片读取失败，请更换文件后重试。'));
    image.src = url;
  });
}

async function readLocalImage(file) {
  const previewUrl = URL.createObjectURL(file);
  try {
    const image = await waitForImage(previewUrl);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('当前浏览器不支持 Canvas 2D。');
    }
    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return {
      fileName: file.name,
      baseFileName: baseName(file.name),
      width: image.naturalWidth,
      height: image.naturalHeight,
      previewUrl,
      pixels: new Uint8ClampedArray(imageData.data)
    };
  } catch (error) {
    URL.revokeObjectURL(previewUrl);
    throw error;
  }
}

function getCellFromPointer(event, canvas, pattern, cellSize) {
  if (!canvas || !pattern) {
    return null;
  }
  const rect = canvas.getBoundingClientRect();
  const relativeX = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const relativeY = ((event.clientY - rect.top) / rect.height) * canvas.height;
  const x = Math.floor(relativeX / cellSize);
  const y = Math.floor(relativeY / cellSize);
  if (x < 0 || y < 0 || x >= pattern.width || y >= pattern.height) {
    return null;
  }
  return {
    x,
    y,
    index: y * pattern.width + x
  };
}

function addPdfPage(doc, canvas) {
  const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait';
  doc.addPage([canvas.width, canvas.height], orientation);
  doc.addImage(canvas, 'PNG', 0, 0, canvas.width, canvas.height, undefined, 'FAST');
}

function BeadPatternPage() {
  const toast = useToast();
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const workerRef = useRef(null);
  const patternRef = useRef(null);
  const activeJobRef = useRef(null);
  const strokeRef = useRef({
    active: false,
    snapshot: null,
    changed: false,
    lastIndex: -1,
    pointerId: null
  });

  const [source, setSource] = useState(null);
  const [historyItems, setHistoryItems] = useState(() => loadPatternHistory());
  const [pattern, setPattern] = useState(null);
  const [patternName, setPatternName] = useState('');
  const [brandKey, setBrandKey] = useState(DEFAULT_PALETTE_KEY);
  const [gridWidth, setGridWidth] = useState(72);
  const [maxColors, setMaxColors] = useState(0);
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [saturation, setSaturation] = useState(0);
  const [removeBackground, setRemoveBackground] = useState(false);
  const [showCodes, setShowCodes] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showBoardLines, setShowBoardLines] = useState(true);
  const [hideBackground, setHideBackground] = useState(false);
  const [zoom, setZoom] = useState(16);
  const [tool, setTool] = useState('paint');
  const [selectedCode, setSelectedCode] = useState(null);
  const [hoverCell, setHoverCell] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(null);
  const [errorText, setErrorText] = useState('');
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  const currentPalette = useMemo(
    () => getPreparedPalette(pattern?.brandKey || brandKey),
    [pattern?.brandKey, brandKey]
  );
  const generationPalette = useMemo(() => getPreparedPalette(brandKey), [brandKey]);
  const materials = useMemo(() => sortMaterialList(pattern), [pattern]);

  useEffect(() => {
    patternRef.current = pattern;
  }, [pattern]);

  useEffect(() => {
    const worker = new Worker(new URL('../workers/beadConverterWorker.js', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (event) => {
      const payload = event.data || {};
      const activeJob = activeJobRef.current;
      if (!activeJob || payload.jobId !== activeJob.jobId) {
        return;
      }

      if (payload.type === 'progress') {
        setProgress({
          ratio: payload.ratio || 0,
          label: payload.label || '处理中…'
        });
        return;
      }

      if (payload.type === 'error') {
        setGenerating(false);
        setProgress(null);
        setErrorText(payload.message || '拼豆图纸生成失败。');
        toast.error(payload.message || '拼豆图纸生成失败。');
        activeJobRef.current = null;
        return;
      }

      if (payload.type === 'result') {
        const result = payload.result;
        const nextPattern = buildPatternModel({
          codes: result.codes,
          width: result.width,
          height: result.height,
          brandKey: result.brandKey,
          name: activeJob.name
        });
        setPattern(nextPattern);
        setPatternName(nextPattern.name);
        setSelectedCode(choosePreferredCode(nextPattern));
        setUndoStack([]);
        setRedoStack([]);
        setHoverCell(null);
        setGenerating(false);
        setProgress(null);
        setErrorText('');
        activeJobRef.current = null;
        toast.success(`已生成 ${result.width} × ${result.height} 图纸。`);
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [toast]);

  useEffect(() => {
    return () => {
      if (source?.previewUrl) {
        URL.revokeObjectURL(source.previewUrl);
      }
    };
  }, [source?.previewUrl]);

  useEffect(() => {
    const palette = getPreparedPalette(pattern?.brandKey || brandKey);
    if (selectedCode && palette.colorMap.has(selectedCode)) {
      return;
    }
    const nextCode = pattern ? choosePreferredCode(pattern) : palette.colors[0]?.code || null;
    setSelectedCode(nextCode);
  }, [brandKey, pattern, selectedCode]);

  useEffect(() => {
    if (!pattern) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      const previewDataUrl = createPatternThumbnailDataUrl(pattern);
      const next = savePatternHistoryEntry(pattern, previewDataUrl);
      setHistoryItems(next);
    }, AUTO_SAVE_DELAY);

    return () => window.clearTimeout(timer);
  }, [pattern]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pattern) {
      return;
    }
    const cellSize = Math.max(8, zoom);
    canvas.width = pattern.width * cellSize;
    canvas.height = pattern.height * cellSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawCanvasPattern(ctx, pattern, cellSize, {
      showCodes,
      showGrid,
      showBoardLines,
      hideBackground
    });

    if (hoverCell) {
      ctx.save();
      ctx.lineWidth = Math.max(1.5, cellSize * 0.14);
      ctx.strokeStyle = 'rgba(255, 123, 0, 0.92)';
      ctx.strokeRect(
        hoverCell.x * cellSize + 1,
        hoverCell.y * cellSize + 1,
        Math.max(1, cellSize - 2),
        Math.max(1, cellSize - 2)
      );
      ctx.restore();
    }
  }, [pattern, zoom, showCodes, showGrid, showBoardLines, hideBackground, hoverCell]);

  const hoverInfo = useMemo(() => {
    if (!pattern || !hoverCell) {
      return null;
    }
    const code = pattern.codes[hoverCell.index];
    const color = code ? currentPalette.colorMap.get(code) : null;
    return {
      ...hoverCell,
      code,
      color
    };
  }, [currentPalette.colorMap, hoverCell, pattern]);

  const selectedColor = selectedCode ? currentPalette.colorMap.get(selectedCode) : null;

  const persistPattern = (notify = false) => {
    if (!patternRef.current) {
      return;
    }
    const previewDataUrl = createPatternThumbnailDataUrl(patternRef.current);
    const next = savePatternHistoryEntry(patternRef.current, previewDataUrl);
    setHistoryItems(next);
    if (notify) {
      toast.success('已保存到本地历史。');
    }
  };

  const setNextPattern = (nextPattern, options = {}) => {
    patternRef.current = nextPattern;
    setPattern(nextPattern);
    if (options.syncName !== false) {
      setPatternName(nextPattern.name || '');
    }
    if (options.syncSelectedCode !== false) {
      setSelectedCode(choosePreferredCode(nextPattern));
    }
  };

  const replacePatternCodes = (nextCodes) => {
    const current = patternRef.current;
    if (!current) {
      return false;
    }
    const nextPattern = makePatternFromExisting(current, nextCodes, {
      name: patternName || current.name
    });
    setNextPattern(nextPattern, { syncName: false, syncSelectedCode: false });
    return true;
  };

  const pushUndoSnapshot = (snapshot) => {
    if (!snapshot) {
      return;
    }
    setUndoStack((prev) => [...prev.slice(-(MAX_UNDO_STEPS - 1)), snapshot.slice()]);
    setRedoStack([]);
  };

  const applyCodeAtIndex = (index, nextCode) => {
    const current = patternRef.current;
    if (!current || index < 0 || index >= current.codes.length) {
      return false;
    }
    const normalizedCode = nextCode || null;
    if ((current.codes[index] || null) === normalizedCode) {
      return false;
    }
    const nextCodes = current.codes.slice();
    nextCodes[index] = normalizedCode;
    return replacePatternCodes(nextCodes);
  };

  const handleUpload = async (file) => {
    if (!file) {
      return;
    }
    try {
      const nextSource = await readLocalImage(file);
      setSource((prev) => {
        if (prev?.previewUrl) {
          URL.revokeObjectURL(prev.previewUrl);
        }
        return nextSource;
      });
      setPattern(null);
      patternRef.current = null;
      setPatternName(nextSource.baseFileName || '拼豆图纸');
      setUndoStack([]);
      setRedoStack([]);
      setHoverCell(null);
      setErrorText('');
      toast.success(`已载入 ${file.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '图片读取失败。';
      setErrorText(message);
      toast.error(message);
    }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    await handleUpload(file);
    event.target.value = '';
  };

  const handleGenerate = () => {
    if (!source) {
      toast.error('请先选择一张本地图片。');
      return;
    }
    if (!workerRef.current) {
      toast.error('转换线程初始化失败，请刷新页面后重试。');
      return;
    }

    const name = safePatternName(patternName, source.baseFileName || '拼豆图纸');
    const safeGridWidth = clampNumber(gridWidth, MIN_GRID_WIDTH, MAX_GRID_WIDTH, 72);
    const safeMaxColors = clampNumber(maxColors, 0, generationPalette.colors.length, 0);

    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    activeJobRef.current = {
      jobId,
      name
    };

    setPatternName(name);
    setGenerating(true);
    setProgress({
      ratio: 0.01,
      label: '准备开始…'
    });
    setErrorText('');

    workerRef.current.postMessage({
      type: 'convert',
      jobId,
      pixels: source.pixels,
      sourceWidth: source.width,
      sourceHeight: source.height,
      options: {
        brandKey,
        gridWidth: safeGridWidth,
        maxColors: safeMaxColors,
        brightness,
        contrast,
        saturation,
        removeBackground
      }
    });
  };

  const handleNameChange = (value) => {
    setPatternName(value);
    setPattern((prev) => {
      if (!prev) {
        return prev;
      }
      const next = {
        ...prev,
        name: value
      };
      patternRef.current = next;
      return next;
    });
  };

  const handleUndo = () => {
    const current = patternRef.current;
    const previous = undoStack[undoStack.length - 1];
    if (!current || !previous) {
      return;
    }
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev.slice(-(MAX_UNDO_STEPS - 1)), current.codes.slice()]);
    replacePatternCodes(previous);
  };

  const handleRedo = () => {
    const current = patternRef.current;
    const nextCodes = redoStack[redoStack.length - 1];
    if (!current || !nextCodes) {
      return;
    }
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev.slice(-(MAX_UNDO_STEPS - 1)), current.codes.slice()]);
    replacePatternCodes(nextCodes);
  };

  const finishStroke = () => {
    const state = strokeRef.current;
    if (state.active && state.changed && state.snapshot) {
      pushUndoSnapshot(state.snapshot);
    }
    strokeRef.current = {
      active: false,
      snapshot: null,
      changed: false,
      lastIndex: -1,
      pointerId: null
    };
  };

  const handleCanvasPointerDown = (event) => {
    if (event.button !== 0) {
      return;
    }
    const current = patternRef.current;
    const canvas = canvasRef.current;
    if (!current || !canvas) {
      return;
    }
    const cell = getCellFromPointer(event, canvas, current, zoom);
    if (!cell) {
      return;
    }

    if (tool === 'picker') {
      const code = current.codes[cell.index] || null;
      if (code) {
        setSelectedCode(code);
        toast.success(`已选中 ${code}`);
      }
      return;
    }

    if (tool === 'fill') {
      const nextCode = selectedCode || null;
      const nextCodes = floodFillCodes(current.codes, current.width, current.height, cell.index, nextCode);
      if (nextCodes.join('|') === current.codes.join('|')) {
        return;
      }
      pushUndoSnapshot(current.codes);
      replacePatternCodes(nextCodes);
      return;
    }

    const nextCode = tool === 'erase' ? null : selectedCode;
    if (tool === 'paint' && !nextCode) {
      toast.error('请先从色卡里选一个颜色。');
      return;
    }

    strokeRef.current = {
      active: true,
      snapshot: current.codes.slice(),
      changed: false,
      lastIndex: -1,
      pointerId: event.pointerId
    };

    canvas.setPointerCapture(event.pointerId);
    const changed = applyCodeAtIndex(cell.index, nextCode);
    strokeRef.current.changed = changed;
    strokeRef.current.lastIndex = cell.index;
    setHoverCell(cell);
  };

  const handleCanvasPointerMove = (event) => {
    const current = patternRef.current;
    const canvas = canvasRef.current;
    if (!current || !canvas) {
      return;
    }
    const cell = getCellFromPointer(event, canvas, current, zoom);
    setHoverCell(cell);
    if (!cell || !strokeRef.current.active) {
      return;
    }
    if (strokeRef.current.lastIndex === cell.index) {
      return;
    }
    const nextCode = tool === 'erase' ? null : selectedCode;
    if (tool === 'paint' && !nextCode) {
      return;
    }
    const changed = applyCodeAtIndex(cell.index, nextCode);
    strokeRef.current.changed = strokeRef.current.changed || changed;
    strokeRef.current.lastIndex = cell.index;
  };

  const handleCanvasPointerUp = () => {
    finishStroke();
  };

  const handleCanvasPointerCancel = () => {
    finishStroke();
  };

  const handleCanvasPointerLeave = () => {
    setHoverCell(null);
    if (!strokeRef.current.active) {
      return;
    }
    finishStroke();
  };

  const handleExportPng = () => {
    if (!patternRef.current) {
      return;
    }
    const canvas = createPatternOverviewCanvas(patternRef.current, {
      showCodes,
      showGrid,
      showBoardLines,
      hideBackground
    });
    downloadCanvas(canvas, `${makePatternFileStem(patternRef.current, source)}.png`);
    toast.success('PNG 已导出。');
  };

  const handleExportPdf = () => {
    const current = patternRef.current;
    if (!current) {
      return;
    }

    const overviewCanvas = createPatternOverviewCanvas(current, {
      showCodes,
      showGrid,
      showBoardLines,
      hideBackground
    });
    const overviewOrientation = overviewCanvas.width >= overviewCanvas.height ? 'landscape' : 'portrait';
    const doc = new jsPDF({
      orientation: overviewOrientation,
      unit: 'px',
      format: [overviewCanvas.width, overviewCanvas.height],
      hotfixes: ['px_scaling']
    });

    doc.addImage(overviewCanvas, 'PNG', 0, 0, overviewCanvas.width, overviewCanvas.height, undefined, 'FAST');

    const boardSize = currentPalette.boardSize || 29;
    for (let startY = 0; startY < current.height; startY += boardSize) {
      for (let startX = 0; startX < current.width; startX += boardSize) {
        const boardCanvas = createBoardCanvas(current, startX, startY, {
          showCodes: true,
          hideBackground
        });
        addPdfPage(doc, boardCanvas);
      }
    }

    doc.save(`${makePatternFileStem(current, source)}.pdf`);
    toast.success('PDF 已导出。');
  };

  const handleRestoreHistory = (entry) => {
    const restored = restorePatternFromHistory(entry);
    if (!restored) {
      toast.error('历史记录恢复失败。');
      return;
    }
    setPattern(restored);
    patternRef.current = restored;
    setPatternName(restored.name || '');
    setBrandKey(restored.brandKey);
    setSelectedCode(choosePreferredCode(restored));
    setUndoStack([]);
    setRedoStack([]);
    setHoverCell(null);
    setErrorText('');
    toast.success('已恢复历史图纸。');
  };

  const handleDeleteHistory = (historyId) => {
    const next = deletePatternHistoryEntry(historyId);
    setHistoryItems(next);
    toast.success('已删除历史记录。');
  };

  const handleHistoryDragOver = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragActive(true);
  };

  const handleHistoryDragLeave = (event) => {
    event.preventDefault();
    setDragActive(false);
  };

  const handleHistoryDrop = async (event) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    await handleUpload(file);
  };

  return (
    <ToolPageShell
      title="拼豆图纸生成器"
      desc="纯前端生成、编辑与导出拼豆图纸，图片不会上传服务器。内置 MARD / Perler / Hama 固定色卡。"
    >
      <div className="bead-page">
        <section className="bead-panel">
          <div
            className={dragActive ? 'bead-dropzone is-active' : 'bead-dropzone'}
            onDragEnter={handleHistoryDragOver}
            onDragLeave={handleHistoryDragLeave}
            onDragOver={handleHistoryDragOver}
            onDrop={handleHistoryDrop}
          >
            <div>
              <h2>1. 上传本地图</h2>
              <p>支持点击选择或拖拽图片。生成、编辑、导出都在浏览器本地完成。</p>
            </div>
            <div className="bead-dropzone-actions">
              <button type="button" className="bead-primary-btn" onClick={() => fileInputRef.current?.click()}>
                选择图片
              </button>
              <input
                ref={fileInputRef}
                className="bead-hidden-input"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
              />
              {source ? (
                <span className="bead-source-meta">
                  {source.fileName} · {source.width} × {source.height}
                </span>
              ) : (
                <span className="bead-source-meta">建议上传清晰、边界明显的图片。</span>
              )}
            </div>
          </div>

          <div className="bead-controls-grid">
            <label className="bead-field">
              <span>图纸名称</span>
              <input
                value={patternName}
                onChange={(event) => handleNameChange(event.target.value)}
                placeholder="例如：皮卡丘头像"
                type="text"
              />
            </label>

            <label className="bead-field">
              <span>生成色卡</span>
              <select value={brandKey} onChange={(event) => setBrandKey(event.target.value)}>
                {Object.values({
                  mard: getPreparedPalette('mard'),
                  perler: getPreparedPalette('perler'),
                  hama: getPreparedPalette('hama')
                }).map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.name} · {item.colors.length} 色
                  </option>
                ))}
              </select>
            </label>

            <label className="bead-field">
              <span>网格宽度</span>
              <div className="bead-inline-input">
                <input
                  value={gridWidth}
                  min={MIN_GRID_WIDTH}
                  max={MAX_GRID_WIDTH}
                  onChange={(event) => setGridWidth(clampNumber(event.target.value, MIN_GRID_WIDTH, MAX_GRID_WIDTH, 72))}
                  type="range"
                />
                <input
                  value={gridWidth}
                  min={MIN_GRID_WIDTH}
                  max={MAX_GRID_WIDTH}
                  onChange={(event) => setGridWidth(clampNumber(event.target.value, MIN_GRID_WIDTH, MAX_GRID_WIDTH, 72))}
                  type="number"
                />
              </div>
            </label>

            <label className="bead-field">
              <span>最大颜色数（0 为不限）</span>
              <input
                value={maxColors}
                min={0}
                max={generationPalette.colors.length}
                onChange={(event) => setMaxColors(clampNumber(event.target.value, 0, generationPalette.colors.length, 0))}
                type="number"
              />
            </label>
          </div>

          <div className="bead-slider-grid">
            <label className="bead-field">
              <span>亮度 {brightness}</span>
              <input
                value={brightness}
                min={-100}
                max={100}
                onChange={(event) => setBrightness(clampNumber(event.target.value, -100, 100, 0))}
                type="range"
              />
            </label>
            <label className="bead-field">
              <span>对比度 {contrast}</span>
              <input
                value={contrast}
                min={-100}
                max={100}
                onChange={(event) => setContrast(clampNumber(event.target.value, -100, 100, 0))}
                type="range"
              />
            </label>
            <label className="bead-field">
              <span>饱和度 {saturation}</span>
              <input
                value={saturation}
                min={-100}
                max={100}
                onChange={(event) => setSaturation(clampNumber(event.target.value, -100, 100, 0))}
                type="range"
              />
            </label>
            <label className="bead-check">
              <input
                checked={removeBackground}
                onChange={(event) => setRemoveBackground(event.target.checked)}
                type="checkbox"
              />
              <span>尝试去除四角背景色</span>
            </label>
          </div>

          <div className="bead-toolbar">
            <button className="bead-primary-btn" disabled={!source || generating} onClick={handleGenerate} type="button">
              {generating ? '生成中…' : '2. 生成图纸'}
            </button>
            <button className="bead-secondary-btn" disabled={!pattern} onClick={() => persistPattern(true)} type="button">
              保存草稿
            </button>
            <button className="bead-secondary-btn" disabled={!pattern} onClick={handleExportPng} type="button">
              导出 PNG
            </button>
            <button className="bead-secondary-btn" disabled={!pattern} onClick={handleExportPdf} type="button">
              导出 PDF
            </button>
          </div>

          {progress ? (
            <div className="bead-status">
              <div className="bead-progress-bar">
                <span style={{ width: `${Math.max(6, Math.round((progress.ratio || 0) * 100))}%` }} />
              </div>
              <p>{describeProgress(progress)}</p>
            </div>
          ) : null}

          {errorText ? <p className="bead-error">{errorText}</p> : null}

          <div className="bead-preview-strip">
            <div className="bead-source-preview">
              <h3>原图预览</h3>
              {source ? (
                <img alt={source.fileName} src={source.previewUrl} />
              ) : (
                <div className="bead-empty-box">等待上传图片</div>
              )}
            </div>

            <div className="bead-stats-grid">
              <article className="bead-stat-card">
                <span>当前色卡</span>
                <strong>{currentPalette.name}</strong>
                <small>{currentPalette.colors.length} 个固定编号颜色</small>
              </article>
              <article className="bead-stat-card">
                <span>当前图纸</span>
                <strong>{pattern ? `${pattern.width} × ${pattern.height}` : '-'}</strong>
                <small>自动按原图比例缩放高度</small>
              </article>
              <article className="bead-stat-card">
                <span>总颗数</span>
                <strong>{pattern ? pattern.totalBeads : '-'}</strong>
                <small>隐藏背景不影响统计</small>
              </article>
              <article className="bead-stat-card">
                <span>使用颜色</span>
                <strong>{pattern ? pattern.uniqueColors : '-'}</strong>
                <small>支持手动编辑继续微调</small>
              </article>
            </div>
          </div>
        </section>

        <section className="bead-workspace">
          <div className="bead-panel bead-editor-panel">
            <div className="bead-editor-head">
              <div>
                <h2>3. 编辑与检查</h2>
                <p>支持画笔、橡皮、吸管、填充、撤销重做和局部放大。</p>
              </div>
              <div className="bead-toolbar bead-toolbar-compact">
                {EDIT_TOOLS.map((item) => (
                  <button
                    key={item.key}
                    className={tool === item.key ? 'bead-tool-btn is-active' : 'bead-tool-btn'}
                    onClick={() => setTool(item.key)}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
                <button className="bead-secondary-btn" disabled={!undoStack.length} onClick={handleUndo} type="button">
                  撤销
                </button>
                <button className="bead-secondary-btn" disabled={!redoStack.length} onClick={handleRedo} type="button">
                  重做
                </button>
              </div>
            </div>

            <div className="bead-preview-options">
              <label className="bead-check">
                <input checked={showCodes} onChange={(event) => setShowCodes(event.target.checked)} type="checkbox" />
                <span>显示编号</span>
              </label>
              <label className="bead-check">
                <input checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} type="checkbox" />
                <span>显示网格</span>
              </label>
              <label className="bead-check">
                <input
                  checked={showBoardLines}
                  onChange={(event) => setShowBoardLines(event.target.checked)}
                  type="checkbox"
                />
                <span>显示 29×29 板线</span>
              </label>
              <label className="bead-check">
                <input
                  checked={hideBackground}
                  onChange={(event) => setHideBackground(event.target.checked)}
                  type="checkbox"
                />
                <span>预览隐藏背景色</span>
              </label>
              <label className="bead-field bead-zoom-field">
                <span>缩放 {zoom}px</span>
                <input value={zoom} min={8} max={28} onChange={(event) => setZoom(clampNumber(event.target.value, 8, 28, 16))} type="range" />
              </label>
            </div>

            <div className="bead-selected-color">
              <span>当前颜色</span>
              {selectedColor ? (
                <strong>
                  <i style={{ background: selectedColor.hex }} />
                  {selectedColor.code} · {selectedColor.name}
                </strong>
              ) : (
                <strong>未选择</strong>
              )}
            </div>

            <div className="bead-canvas-shell">
              {pattern ? (
                <canvas
                  ref={canvasRef}
                  className="bead-canvas"
                  onPointerCancel={handleCanvasPointerCancel}
                  onPointerDown={handleCanvasPointerDown}
                  onPointerLeave={handleCanvasPointerLeave}
                  onPointerMove={handleCanvasPointerMove}
                  onPointerUp={handleCanvasPointerUp}
                />
              ) : (
                <div className="bead-empty-box bead-empty-editor">生成后在这里编辑图纸</div>
              )}
            </div>

            <div className="bead-hover-meta">
              {hoverInfo ? (
                <span>
                  X {hoverInfo.x + 1} · Y {hoverInfo.y + 1}
                  {hoverInfo.code ? ` · ${hoverInfo.code} ${hoverInfo.color?.name || ''}` : ' · 空白'}
                </span>
              ) : (
                <span>把鼠标移到图纸上可查看坐标和编号。</span>
              )}
            </div>
          </div>

          <aside className="bead-side-column">
            <section className="bead-panel">
              <div className="bead-side-head">
                <div>
                  <h2>4. 色卡与材料</h2>
                  <p>{currentPalette.name} 固定编号色卡，点击即可切换当前画笔颜色。</p>
                </div>
                <span className="bead-side-pill">{currentPalette.colors.length} 色</span>
              </div>

              <div className="bead-palette-grid">
                {currentPalette.colors.map((color) => {
                  const count = pattern?.colorCounts?.[color.code] || 0;
                  return (
                    <button
                      key={color.code}
                      className={selectedCode === color.code ? 'bead-palette-swatch is-active' : 'bead-palette-swatch'}
                      onClick={() => {
                        setSelectedCode(color.code);
                        setTool('paint');
                      }}
                      type="button"
                    >
                      <span className="bead-palette-dot" style={{ background: color.hex }} />
                      <strong>{color.code}</strong>
                      <small>{color.name}</small>
                      <em>{count ? `${count} 颗` : '未使用'}</em>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="bead-panel">
              <div className="bead-side-head">
                <div>
                  <h2>材料清单</h2>
                  <p>导出 PNG/PDF 时会同步带上总览和清单。</p>
                </div>
                <span className="bead-side-pill">{materials.length} 项</span>
              </div>

              {materials.length ? (
                <div className="bead-material-list">
                  {materials.map((item) => (
                    <button
                      key={item.code}
                      className={selectedCode === item.code ? 'bead-material-item is-active' : 'bead-material-item'}
                      onClick={() => {
                        setSelectedCode(item.code);
                        setTool('paint');
                      }}
                      type="button"
                    >
                      <span className="bead-material-chip" style={{ background: item.color.hex }} />
                      <strong>{item.code}</strong>
                      <span>{item.color.name}</span>
                      <em>{item.count} 颗</em>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="bead-empty-box bead-empty-side">生成图纸后显示材料清单</div>
              )}
            </section>

            <section className="bead-panel">
              <div className="bead-side-head">
                <div>
                  <h2>本地历史</h2>
                  <p>自动缓存最近 8 个图案，不走服务器。</p>
                </div>
                <span className="bead-side-pill">{historyItems.length} 条</span>
              </div>

              {historyItems.length ? (
                <div className="bead-history-list">
                  {historyItems.map((entry) => (
                    <article key={entry.historyId} className="bead-history-card">
                      {entry.previewDataUrl ? (
                        <img alt={entry.name || '历史图案'} src={entry.previewDataUrl} />
                      ) : (
                        <div className="bead-history-thumb bead-empty-box">无预览</div>
                      )}
                      <div className="bead-history-body">
                        <strong>{entry.name || '未命名图纸'}</strong>
                        <span>
                          {entry.width} × {entry.height} · {entry.uniqueColors} 色
                        </span>
                        <small>{formatDateTime(entry.updatedAt)}</small>
                      </div>
                      <div className="bead-history-actions">
                        <button className="bead-secondary-btn" onClick={() => handleRestoreHistory(entry)} type="button">
                          恢复
                        </button>
                        <button
                          className="bead-danger-btn"
                          onClick={() => handleDeleteHistory(entry.historyId)}
                          type="button"
                        >
                          删除
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="bead-empty-box bead-empty-side">生成或编辑后会自动出现在这里</div>
              )}
            </section>
          </aside>
        </section>
      </div>
    </ToolPageShell>
  );
}

function drawCanvasPattern(ctx, pattern, cellSize, options) {
  return drawPatternToContext(ctx, pattern, {
    cellSize,
    showCodes: options.showCodes,
    showGrid: options.showGrid,
    showBoardLines: options.showBoardLines,
    hideBackground: options.hideBackground
  });
}

export default BeadPatternPage;
