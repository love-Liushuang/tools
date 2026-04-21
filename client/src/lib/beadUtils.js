import { BEAD_PALETTES, DEFAULT_BOARD_SIZE, DEFAULT_PALETTE_KEY } from './beadPalettes';

export const HISTORY_STORAGE_KEY = 'pindou-history-v1';
export const HISTORY_LIMIT = 8;

const preparedPaletteCache = new Map();

function createFallbackId() {
  return `pindou-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createPatternId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return createFallbackId();
}

export function clampNumber(value, min, max, fallback = min) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

export function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '未知时间';
  }
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function baseName(filename = '') {
  return filename.replace(/\.[^.]+$/, '') || '未命名图案';
}

export function hexToRgb(hex) {
  const normalized = String(hex || '').trim();
  const match = normalized.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) {
    return [255, 255, 255];
  }
  return [
    parseInt(match[1], 16),
    parseInt(match[2], 16),
    parseInt(match[3], 16)
  ];
}

function srgbToLinear(channel) {
  const value = channel / 255;
  return value > 0.04045
    ? ((value + 0.055) / 1.055) ** 2.4
    : value / 12.92;
}

export function rgbToLab(rgb) {
  const [r, g, b] = rgb;
  const rr = srgbToLinear(r);
  const gg = srgbToLinear(g);
  const bb = srgbToLinear(b);

  let x = (rr * 0.4124564 + gg * 0.3575761 + bb * 0.1804375) / 0.95047;
  let y = rr * 0.2126729 + gg * 0.7151522 + bb * 0.072175;
  let z = (rr * 0.0193339 + gg * 0.119192 + bb * 0.9503041) / 1.08883;

  const transform = (value) => (
    value > 0.008856
      ? Math.cbrt(value)
      : 7.787 * value + (16 / 116)
  );

  x = transform(x);
  y = transform(y);
  z = transform(z);

  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function getPreparedPalette(brandKey = DEFAULT_PALETTE_KEY) {
  const cacheKey = BEAD_PALETTES[brandKey] ? brandKey : DEFAULT_PALETTE_KEY;
  if (preparedPaletteCache.has(cacheKey)) {
    return preparedPaletteCache.get(cacheKey);
  }

  const brand = BEAD_PALETTES[cacheKey] || BEAD_PALETTES[DEFAULT_PALETTE_KEY];
  const colors = brand.colors.map((color) => {
    const rgb = hexToRgb(color.hex);
    return {
      ...color,
      rgb,
      lab: rgbToLab(rgb)
    };
  });
  const colorMap = new Map(colors.map((color) => [color.code, color]));
  const prepared = {
    ...brand,
    key: cacheKey,
    boardSize: brand.boardSize || DEFAULT_BOARD_SIZE,
    colors,
    colorMap
  };
  preparedPaletteCache.set(cacheKey, prepared);
  return prepared;
}

export function cloneCodes(codes) {
  return Array.isArray(codes) ? codes.slice() : [];
}

export function detectBackgroundCode(codes, width, height) {
  if (!Array.isArray(codes) || !codes.length || !width || !height) {
    return null;
  }

  const counts = new Map();
  const pushCode = (code) => {
    if (!code) {
      return;
    }
    counts.set(code, (counts.get(code) || 0) + 1);
  };

  for (let x = 0; x < width; x += 1) {
    pushCode(codes[x]);
    pushCode(codes[(height - 1) * width + x]);
  }

  for (let y = 1; y < height - 1; y += 1) {
    pushCode(codes[y * width]);
    pushCode(codes[y * width + (width - 1)]);
  }

  let bestCode = null;
  let bestCount = 0;
  counts.forEach((count, code) => {
    if (count > bestCount) {
      bestCode = code;
      bestCount = count;
    }
  });

  return bestCode;
}

export function buildPatternModel({
  codes,
  width,
  height,
  brandKey = DEFAULT_PALETTE_KEY,
  name = '',
  historyId = null,
  createdAt = null,
  updatedAt = null,
  bgCode = null
}) {
  const palette = getPreparedPalette(brandKey);
  const safeCodes = cloneCodes(codes);
  const colorCounts = {};
  let totalBeads = 0;

  safeCodes.forEach((code) => {
    if (!code || !palette.colorMap.has(code)) {
      return;
    }
    colorCounts[code] = (colorCounts[code] || 0) + 1;
    totalBeads += 1;
  });

  return {
    historyId: historyId || createPatternId(),
    name: String(name || '').trim(),
    brandKey: palette.key,
    width,
    height,
    codes: safeCodes,
    createdAt: createdAt || Date.now(),
    updatedAt: updatedAt || Date.now(),
    colorCounts,
    totalBeads,
    uniqueColors: Object.keys(colorCounts).length,
    bgCode: bgCode || detectBackgroundCode(safeCodes, width, height)
  };
}

export function sortMaterialList(pattern) {
  if (!pattern) {
    return [];
  }

  const palette = getPreparedPalette(pattern.brandKey);
  const normalizeCode = (code = '') => {
    const match = String(code).match(/^([A-Z]+)(\d+)$/i);
    if (!match) {
      return [code, 0];
    }
    return [match[1], Number.parseInt(match[2], 10)];
  };

  return Object.entries(pattern.colorCounts || {})
    .map(([code, count]) => ({
      code,
      count,
      color: palette.colorMap.get(code) || null
    }))
    .filter((item) => item.color)
    .sort((left, right) => {
      const [leftPrefix, leftNumber] = normalizeCode(left.code);
      const [rightPrefix, rightNumber] = normalizeCode(right.code);
      if (leftPrefix !== rightPrefix) {
        return leftPrefix.localeCompare(rightPrefix);
      }
      return leftNumber - rightNumber;
    });
}

function getColorBrightness(rgb) {
  return (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
}

function drawBead(ctx, x, y, size, color) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, Math.max(2, size / 2 - 1), 0, Math.PI * 2);
  ctx.fillStyle = color.hex;
  ctx.fill();
  ctx.lineWidth = Math.max(0.5, size * 0.05);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + size * 0.36, y + size * 0.34, Math.max(1.4, size * 0.12), 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.fill();
  ctx.restore();
}

export function drawPatternToContext(ctx, pattern, options = {}) {
  if (!pattern) {
    return null;
  }

  const palette = getPreparedPalette(pattern.brandKey);
  const {
    offsetX = 0,
    offsetY = 0,
    cellSize = 16,
    showCodes = false,
    showGrid = true,
    showBoardLines = true,
    hideBackground = false,
    boardSize = palette.boardSize || DEFAULT_BOARD_SIZE
  } = options;

  for (let y = 0; y < pattern.height; y += 1) {
    for (let x = 0; x < pattern.width; x += 1) {
      const code = pattern.codes[y * pattern.width + x];
      if (!code) {
        continue;
      }
      if (hideBackground && pattern.bgCode && code === pattern.bgCode) {
        continue;
      }

      const color = palette.colorMap.get(code);
      if (!color) {
        continue;
      }

      const px = offsetX + x * cellSize;
      const py = offsetY + y * cellSize;
      drawBead(ctx, px, py, cellSize, color);

      if (showCodes && cellSize >= 14) {
        ctx.save();
        ctx.fillStyle = getColorBrightness(color.rgb) > 150 ? '#17212b' : '#ffffff';
        ctx.font = `600 ${Math.min(12, Math.max(7, cellSize * 0.42))}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(code, px + cellSize / 2, py + cellSize / 2);
        ctx.restore();
      }
    }
  }

  if (showGrid) {
    ctx.save();
    ctx.strokeStyle = 'rgba(29, 52, 77, 0.12)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= pattern.width; x += 1) {
      const px = offsetX + x * cellSize;
      ctx.beginPath();
      ctx.moveTo(px, offsetY);
      ctx.lineTo(px, offsetY + pattern.height * cellSize);
      ctx.stroke();
    }
    for (let y = 0; y <= pattern.height; y += 1) {
      const py = offsetY + y * cellSize;
      ctx.beginPath();
      ctx.moveTo(offsetX, py);
      ctx.lineTo(offsetX + pattern.width * cellSize, py);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (showBoardLines && boardSize > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 123, 0, 0.42)';
    ctx.lineWidth = Math.max(1.5, cellSize * 0.08);
    for (let x = boardSize; x < pattern.width; x += boardSize) {
      const px = offsetX + x * cellSize;
      ctx.beginPath();
      ctx.moveTo(px, offsetY);
      ctx.lineTo(px, offsetY + pattern.height * cellSize);
      ctx.stroke();
    }
    for (let y = boardSize; y < pattern.height; y += boardSize) {
      const py = offsetY + y * cellSize;
      ctx.beginPath();
      ctx.moveTo(offsetX, py);
      ctx.lineTo(offsetX + pattern.width * cellSize, py);
      ctx.stroke();
    }
    ctx.restore();
  }

  return {
    palette,
    width: pattern.width * cellSize,
    height: pattern.height * cellSize
  };
}

function drawAxisLabels(ctx, pattern, offsetX, offsetY, cellSize) {
  ctx.save();
  ctx.fillStyle = '#53687c';
  ctx.font = `500 ${Math.min(12, Math.max(8, cellSize * 0.34))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  for (let x = 0; x < pattern.width; x += 1) {
    ctx.fillText(String(x + 1), offsetX + x * cellSize + cellSize / 2, offsetY - 6);
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let y = 0; y < pattern.height; y += 1) {
    ctx.fillText(String(y + 1), offsetX - 6, offsetY + y * cellSize + cellSize / 2);
  }
  ctx.restore();
}

function chooseOverviewCellSize(pattern) {
  const maxSide = Math.max(pattern.width, pattern.height);
  if (maxSide >= 120) {
    return 16;
  }
  if (maxSide >= 90) {
    return 20;
  }
  if (maxSide >= 60) {
    return 24;
  }
  return 28;
}

export function createPatternOverviewCanvas(pattern, options = {}) {
  const palette = getPreparedPalette(pattern.brandKey);
  const materials = sortMaterialList(pattern);
  const title = options.title || pattern.name || '拼豆图纸';
  const cellSize = options.cellSize || chooseOverviewCellSize(pattern);
  const axis = 34;
  const headerHeight = 66;
  const legendItemWidth = 156;
  const legendCols = Math.max(1, Math.min(4, Math.floor((pattern.width * cellSize) / legendItemWidth) || 1));
  const legendRows = Math.ceil(materials.length / legendCols);
  const legendHeight = materials.length ? 24 + legendRows * 30 : 0;
  const patternWidth = pattern.width * cellSize;
  const patternHeight = pattern.height * cellSize;
  const canvasWidth = Math.max(patternWidth + axis * 2 + 24, legendCols * legendItemWidth + 32);
  const canvasHeight = headerHeight + axis + patternHeight + axis + legendHeight + 28;
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = '#14263a';
  ctx.font = '700 24px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(title, 16, 16);
  ctx.font = '500 13px sans-serif';
  ctx.fillStyle = '#4f657a';
  ctx.fillText(
    `${pattern.width} × ${pattern.height} · ${pattern.uniqueColors} 色 · ${pattern.totalBeads} 颗 · ${palette.name}`,
    16,
    46
  );

  const offsetX = axis;
  const offsetY = headerHeight;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(offsetX, offsetY, patternWidth, patternHeight);
  drawPatternToContext(ctx, pattern, {
    offsetX,
    offsetY,
    cellSize,
    showCodes: options.showCodes,
    showGrid: options.showGrid,
    showBoardLines: options.showBoardLines,
    hideBackground: options.hideBackground
  });
  drawAxisLabels(ctx, pattern, offsetX, offsetY, cellSize);

  if (materials.length) {
    const legendTop = offsetY + patternHeight + axis;
    ctx.fillStyle = '#17283c';
    ctx.font = '700 16px sans-serif';
    ctx.fillText('材料清单', 16, legendTop);

    materials.forEach((item, index) => {
      const column = index % legendCols;
      const row = Math.floor(index / legendCols);
      const left = 16 + column * legendItemWidth;
      const top = legendTop + 24 + row * 30;
      ctx.fillStyle = item.color.hex;
      ctx.fillRect(left, top, 18, 18);
      ctx.strokeStyle = 'rgba(23, 40, 60, 0.15)';
      ctx.lineWidth = 1;
      ctx.strokeRect(left, top, 18, 18);

      ctx.fillStyle = '#17283c';
      ctx.font = '600 12px monospace';
      ctx.textBaseline = 'top';
      ctx.fillText(item.code, left + 24, top);
      ctx.font = '500 11px sans-serif';
      ctx.fillStyle = '#5d7086';
      ctx.fillText(`${item.color.name} · ${item.count} 颗`, left + 24, top + 2);
    });
  }

  return canvas;
}

export function createBoardCanvas(pattern, startX, startY, options = {}) {
  const palette = getPreparedPalette(pattern.brandKey);
  const boardSize = options.boardSize || palette.boardSize || DEFAULT_BOARD_SIZE;
  const width = Math.max(0, Math.min(boardSize, pattern.width - startX));
  const height = Math.max(0, Math.min(boardSize, pattern.height - startY));
  const cellSize = options.cellSize || 22;
  const axis = 30;
  const canvas = document.createElement('canvas');
  canvas.width = axis + width * cellSize + 12;
  canvas.height = axis + height * cellSize + 12;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(axis, axis, width * cellSize, height * cellSize);

  const subPattern = {
    ...pattern,
    width,
    height,
    codes: Array.from({ length: width * height }, (_, index) => {
      const x = index % width;
      const y = Math.floor(index / width);
      return pattern.codes[(startY + y) * pattern.width + (startX + x)];
    }),
    bgCode: pattern.bgCode
  };

  drawPatternToContext(ctx, subPattern, {
    offsetX: axis,
    offsetY: axis,
    cellSize,
    showCodes: options.showCodes !== false,
    showGrid: true,
    showBoardLines: false,
    hideBackground: options.hideBackground
  });
  drawAxisLabels(ctx, subPattern, axis, axis, cellSize);

  return canvas;
}

export function createPatternThumbnailDataUrl(pattern, options = {}) {
  if (!pattern) {
    return '';
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const size = 140;
  const cellSize = Math.max(
    2,
    Math.floor((size - 16) / Math.max(pattern.width, pattern.height))
  );
  canvas.width = pattern.width * cellSize + 16;
  canvas.height = pattern.height * cellSize + 16;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawPatternToContext(ctx, pattern, {
    offsetX: 8,
    offsetY: 8,
    cellSize,
    showCodes: false,
    showGrid: false,
    showBoardLines: false,
    hideBackground: options.hideBackground
  });
  return canvas.toDataURL('image/png', 0.82);
}

export function downloadCanvas(canvas, filename) {
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = filename;
  link.click();
}

export function floodFillCodes(codes, width, height, startIndex, nextCode) {
  if (!Array.isArray(codes) || startIndex < 0 || startIndex >= codes.length) {
    return cloneCodes(codes);
  }

  const targetCode = codes[startIndex] || null;
  const replacement = nextCode || null;
  if (targetCode === replacement) {
    return cloneCodes(codes);
  }

  const nextCodes = cloneCodes(codes);
  const queue = [startIndex];
  const visited = new Uint8Array(nextCodes.length);

  while (queue.length) {
    const index = queue.pop();
    if (visited[index]) {
      continue;
    }
    visited[index] = 1;
    if ((nextCodes[index] || null) !== targetCode) {
      continue;
    }

    nextCodes[index] = replacement;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) {
      queue.push(index - 1);
    }
    if (x < width - 1) {
      queue.push(index + 1);
    }
    if (y > 0) {
      queue.push(index - width);
    }
    if (y < height - 1) {
      queue.push(index + width);
    }
  }

  return nextCodes;
}

function getSafeHistoryStorage() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  return window.localStorage;
}

export function loadPatternHistory() {
  const storage = getSafeHistoryStorage();
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry) => (
      entry
      && typeof entry.historyId === 'string'
      && Array.isArray(entry.codes)
      && Number.isFinite(entry.width)
      && Number.isFinite(entry.height)
      && typeof entry.brandKey === 'string'
    ));
  } catch (error) {
    return [];
  }
}

export function savePatternHistoryEntry(pattern, previewDataUrl = '') {
  const storage = getSafeHistoryStorage();
  if (!storage || !pattern) {
    return [];
  }

  const existing = loadPatternHistory();
  const now = Date.now();
  const historyId = pattern.historyId || createPatternId();
  const current = existing.find((entry) => entry.historyId === historyId);
  const nextEntry = {
    historyId,
    name: pattern.name || '',
    brandKey: pattern.brandKey,
    width: pattern.width,
    height: pattern.height,
    codes: cloneCodes(pattern.codes),
    bgCode: pattern.bgCode || null,
    colorCounts: { ...(pattern.colorCounts || {}) },
    totalBeads: pattern.totalBeads || 0,
    uniqueColors: pattern.uniqueColors || 0,
    previewDataUrl: previewDataUrl || current?.previewDataUrl || '',
    createdAt: current?.createdAt || pattern.createdAt || now,
    updatedAt: now
  };

  const next = [nextEntry, ...existing.filter((entry) => entry.historyId !== historyId)]
    .slice(0, HISTORY_LIMIT);
  storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function deletePatternHistoryEntry(historyId) {
  const storage = getSafeHistoryStorage();
  if (!storage) {
    return [];
  }
  const next = loadPatternHistory().filter((entry) => entry.historyId !== historyId);
  storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function restorePatternFromHistory(entry) {
  if (!entry) {
    return null;
  }
  return buildPatternModel({
    codes: entry.codes,
    width: entry.width,
    height: entry.height,
    brandKey: entry.brandKey,
    name: entry.name,
    historyId: entry.historyId,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    bgCode: entry.bgCode
  });
}
