import { BEAD_PALETTES, DEFAULT_PALETTE_KEY } from '../lib/beadPalettes';

const paletteCache = new Map();

function hexToRgb(hex) {
  const match = String(hex || '').match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
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

function rgbToLab(rgb) {
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

function deltaE76(left, right) {
  return Math.sqrt(
    (left[0] - right[0]) ** 2
    + (left[1] - right[1]) ** 2
    + (left[2] - right[2]) ** 2
  );
}

function deltaE2000(left, right) {
  const [l1, a1, b1] = left;
  const [l2, a2, b2] = right;
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const avgC = (c1 + c2) / 2;
  const pow25To7 = 6103515625;
  const g = 0.5 * (1 - Math.sqrt((avgC ** 7) / ((avgC ** 7) + pow25To7)));
  const a1p = (1 + g) * a1;
  const a2p = (1 + g) * a2;
  const c1p = Math.hypot(a1p, b1);
  const c2p = Math.hypot(a2p, b2);
  const avgCp = (c1p + c2p) / 2;
  const h1p = (Math.atan2(b1, a1p) * 180 / Math.PI + 360) % 360;
  const h2p = (Math.atan2(b2, a2p) * 180 / Math.PI + 360) % 360;

  const deltaLp = l2 - l1;
  const deltaCp = c2p - c1p;

  let deltaHpDegrees = 0;
  if (c1p * c2p !== 0) {
    deltaHpDegrees = h2p - h1p;
    if (deltaHpDegrees > 180) {
      deltaHpDegrees -= 360;
    } else if (deltaHpDegrees < -180) {
      deltaHpDegrees += 360;
    }
  }

  const deltaHp = 2 * Math.sqrt(c1p * c2p) * Math.sin((deltaHpDegrees * Math.PI / 180) / 2);
  const avgLp = (l1 + l2) / 2;

  let avgHp = h1p + h2p;
  if (c1p * c2p === 0) {
    avgHp = h1p + h2p;
  } else if (Math.abs(h1p - h2p) > 180) {
    avgHp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  } else {
    avgHp = (h1p + h2p) / 2;
  }

  const avgHpRad = avgHp * Math.PI / 180;
  const t = 1
    - 0.17 * Math.cos(avgHpRad - Math.PI / 6)
    + 0.24 * Math.cos(2 * avgHpRad)
    + 0.32 * Math.cos(3 * avgHpRad + Math.PI / 30)
    - 0.2 * Math.cos(4 * avgHpRad - 63 * Math.PI / 180);

  const deltaTheta = 30 * Math.exp(-(((avgHp - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt((avgCp ** 7) / ((avgCp ** 7) + pow25To7));
  const sl = 1 + (0.015 * ((avgLp - 50) ** 2)) / Math.sqrt(20 + ((avgLp - 50) ** 2));
  const sc = 1 + 0.045 * avgCp;
  const sh = 1 + 0.015 * avgCp * t;
  const rt = -Math.sin(2 * deltaTheta * Math.PI / 180) * rc;
  const lTerm = deltaLp / sl;
  const cTerm = deltaCp / sc;
  const hTerm = deltaHp / sh;

  return Math.sqrt(
    lTerm * lTerm
    + cTerm * cTerm
    + hTerm * hTerm
    + rt * cTerm * hTerm
  );
}

function getPreparedPalette(brandKey = DEFAULT_PALETTE_KEY) {
  const key = BEAD_PALETTES[brandKey] ? brandKey : DEFAULT_PALETTE_KEY;
  if (paletteCache.has(key)) {
    return paletteCache.get(key);
  }

  const brand = BEAD_PALETTES[key] || BEAD_PALETTES[DEFAULT_PALETTE_KEY];
  const colors = brand.colors.map((color) => {
    const rgb = hexToRgb(color.hex);
    return {
      ...color,
      rgb,
      lab: rgbToLab(rgb)
    };
  });
  const prepared = {
    ...brand,
    key,
    colors
  };
  paletteCache.set(key, prepared);
  return prepared;
}

function postProgress(jobId, ratio, label) {
  self.postMessage({
    type: 'progress',
    jobId,
    ratio,
    label
  });
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function applyAdjustments(pixels, brightness, contrast, saturation) {
  if (!brightness && !contrast && !saturation) {
    return pixels;
  }

  const next = new Uint8ClampedArray(pixels);
  const brightnessOffset = (brightness / 100) * 255;
  const contrastFactor = (contrast + 100) / 100;
  const saturationFactor = 1 + (saturation / 100);

  for (let index = 0; index < next.length; index += 4) {
    if (next[index + 3] < 10) {
      continue;
    }

    let red = next[index];
    let green = next[index + 1];
    let blue = next[index + 2];

    if (brightness) {
      red += brightnessOffset;
      green += brightnessOffset;
      blue += brightnessOffset;
    }

    if (contrast) {
      red = red * contrastFactor + 128 * (1 - contrastFactor);
      green = green * contrastFactor + 128 * (1 - contrastFactor);
      blue = blue * contrastFactor + 128 * (1 - contrastFactor);
    }

    if (saturation) {
      const gray = 0.299 * red + 0.587 * green + 0.114 * blue;
      red = gray + (red - gray) * saturationFactor;
      green = gray + (green - gray) * saturationFactor;
      blue = gray + (blue - gray) * saturationFactor;
    }

    next[index] = clampByte(red);
    next[index + 1] = clampByte(green);
    next[index + 2] = clampByte(blue);
  }

  return next;
}

function getCornerReferenceColors(pixels, width, height) {
  const sampleSize = Math.max(4, Math.min(12, Math.floor(Math.min(width, height) * 0.05)));
  const samples = [
    [0, 0],
    [Math.max(0, width - sampleSize), 0],
    [0, Math.max(0, height - sampleSize)],
    [Math.max(0, width - sampleSize), Math.max(0, height - sampleSize)]
  ];

  return samples.map(([startX, startY]) => {
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    for (let y = startY; y < Math.min(height, startY + sampleSize); y += 1) {
      for (let x = startX; x < Math.min(width, startX + sampleSize); x += 1) {
        const index = (y * width + x) * 4;
        const alpha = pixels[index + 3];
        if (alpha < 12) {
          continue;
        }
        red += pixels[index];
        green += pixels[index + 1];
        blue += pixels[index + 2];
        count += 1;
      }
    }
    return count
      ? [Math.round(red / count), Math.round(green / count), Math.round(blue / count)]
      : null;
  }).filter(Boolean);
}

function colorDistance(rgb, references) {
  let best = Infinity;
  for (const reference of references) {
    const distance = Math.sqrt(
      (rgb[0] - reference[0]) ** 2
      + (rgb[1] - reference[1]) ** 2
      + (rgb[2] - reference[2]) ** 2
    );
    if (distance < best) {
      best = distance;
    }
  }
  return best;
}

function removeBackground(pixels, width, height) {
  const references = getCornerReferenceColors(pixels, width, height);
  if (!references.length) {
    return pixels;
  }

  const next = new Uint8ClampedArray(pixels);
  const visited = new Uint8Array(width * height);
  const queue = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1]
  ];
  const threshold = 38;

  while (queue.length) {
    const [x, y] = queue.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) {
      continue;
    }
    const flatIndex = y * width + x;
    if (visited[flatIndex]) {
      continue;
    }
    visited[flatIndex] = 1;

    const index = flatIndex * 4;
    const alpha = next[index + 3];
    if (alpha < 12) {
      continue;
    }

    const rgb = [next[index], next[index + 1], next[index + 2]];
    if (colorDistance(rgb, references) > threshold) {
      continue;
    }

    next[index + 3] = 0;
    queue.push([x + 1, y]);
    queue.push([x - 1, y]);
    queue.push([x, y + 1]);
    queue.push([x, y - 1]);
  }

  return next;
}

function matteToWhite(red, green, blue, alpha) {
  const normalizedAlpha = alpha / 255;
  return [
    Math.round(red * normalizedAlpha + 255 * (1 - normalizedAlpha)),
    Math.round(green * normalizedAlpha + 255 * (1 - normalizedAlpha)),
    Math.round(blue * normalizedAlpha + 255 * (1 - normalizedAlpha))
  ];
}

function sampleCellRepresentative(pixels, width, height, gridWidth, gridHeight, cellX, cellY) {
  const x0 = (cellX * width) / gridWidth;
  const x1 = ((cellX + 1) * width) / gridWidth;
  const y0 = (cellY * height) / gridHeight;
  const y1 = ((cellY + 1) * height) / gridHeight;
  const span = Math.max(x1 - x0, y1 - y0);
  const sampleGrid = span >= 12 ? 6 : span >= 8 ? 5 : span >= 4 ? 4 : 3;
  let red = 0;
  let green = 0;
  let blue = 0;
  let alphaWeight = 0;

  for (let sampleY = 0; sampleY < sampleGrid; sampleY += 1) {
    const py = Math.min(height - 1, Math.max(0, Math.floor(y0 + (sampleY + 0.5) * (y1 - y0) / sampleGrid)));
    for (let sampleX = 0; sampleX < sampleGrid; sampleX += 1) {
      const px = Math.min(width - 1, Math.max(0, Math.floor(x0 + (sampleX + 0.5) * (x1 - x0) / sampleGrid)));
      const index = (py * width + px) * 4;
      const alpha = pixels[index + 3];
      if (alpha < 10) {
        continue;
      }
      const dx = (sampleX + 0.5) / sampleGrid - 0.5;
      const dy = (sampleY + 0.5) / sampleGrid - 0.5;
      const centerWeight = Math.max(0.25, 1 - Math.hypot(dx, dy) / 0.70710678);
      const [sampleRed, sampleGreen, sampleBlue] = matteToWhite(
        pixels[index],
        pixels[index + 1],
        pixels[index + 2],
        alpha
      );
      red += sampleRed * centerWeight;
      green += sampleGreen * centerWeight;
      blue += sampleBlue * centerWeight;
      alphaWeight += centerWeight;
    }
  }

  if (!alphaWeight) {
    return null;
  }

  return [
    Math.round(red / alphaWeight),
    Math.round(green / alphaWeight),
    Math.round(blue / alphaWeight)
  ];
}

function packRgb(rgb) {
  return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
}

function unpackRgb(packed) {
  return [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255];
}

function clusterRepresentativeColors(samples) {
  const leaderMap = new Map();
  const leaders = [];
  samples.forEach((packed, key) => {
    let bestLeader = null;
    let bestDistance = 8;
    for (const leader of leaders) {
      const distance = deltaE76(samples.get(key), leader.lab);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestLeader = leader;
      }
    }
    if (bestLeader) {
      leaderMap.set(packed, bestLeader.packed);
      return;
    }
    leaders.push({ packed, lab: samples.get(key) });
    leaderMap.set(packed, packed);
  });
  return leaderMap;
}

function findNearestColor(rgb, palette, cache) {
  const packed = packRgb(rgb);
  if (cache.has(packed)) {
    return cache.get(packed);
  }

  const lab = rgbToLab(rgb);
  let best = palette.colors[0];
  let bestDistance = Infinity;
  for (const color of palette.colors) {
    const distance = deltaE2000(lab, color.lab);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = color;
    }
  }
  cache.set(packed, best);
  return best;
}

function reduceColors(codes, palette, colorCounts, maxColors) {
  const entries = Object.entries(colorCounts);
  if (!maxColors || entries.length <= maxColors) {
    return { codes, colorCounts };
  }

  const colorInfo = entries
    .map(([code, count]) => ({
      code,
      count,
      color: palette.colors.find((item) => item.code === code)
    }))
    .filter((item) => item.color)
    .sort((left, right) => right.count - left.count);

  const selected = [colorInfo.shift()];
  while (selected.length < maxColors && colorInfo.length) {
    let bestIndex = 0;
    let bestScore = -1;

    colorInfo.forEach((candidate, index) => {
      let minDistance = Infinity;
      selected.forEach((existing) => {
        const distance = deltaE2000(candidate.color.lab, existing.color.lab);
        if (distance < minDistance) {
          minDistance = distance;
        }
      });
      const score = minDistance * Math.sqrt(candidate.count);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    selected.push(colorInfo.splice(bestIndex, 1)[0]);
  }

  const keep = new Set(selected.map((item) => item.code));
  const keptColors = palette.colors.filter((color) => keep.has(color.code));
  const nearestCache = new Map();
  const nextCodes = codes.map((code) => {
    if (!code || keep.has(code)) {
      return code;
    }
    const color = palette.colors.find((item) => item.code === code);
    if (!color) {
      return code;
    }
    return findNearestColor(color.rgb, { colors: keptColors }, nearestCache).code;
  });

  const nextCounts = {};
  nextCodes.forEach((code) => {
    if (!code) {
      return;
    }
    nextCounts[code] = (nextCounts[code] || 0) + 1;
  });

  return {
    codes: nextCodes,
    colorCounts: nextCounts
  };
}

function detectBackgroundCode(codes, width, height) {
  const counts = new Map();
  const push = (code) => {
    if (!code) {
      return;
    }
    counts.set(code, (counts.get(code) || 0) + 1);
  };

  for (let x = 0; x < width; x += 1) {
    push(codes[x]);
    push(codes[(height - 1) * width + x]);
  }
  for (let y = 1; y < height - 1; y += 1) {
    push(codes[y * width]);
    push(codes[y * width + (width - 1)]);
  }

  let bestCode = null;
  let bestCount = 0;
  counts.forEach((count, code) => {
    if (count > bestCount) {
      bestCount = count;
      bestCode = code;
    }
  });
  return bestCode;
}

function buildResult(codes, width, height, brandKey, colorCounts) {
  const totalBeads = Object.values(colorCounts).reduce((sum, count) => sum + count, 0);
  return {
    width,
    height,
    brandKey,
    codes,
    colorCounts,
    totalBeads,
    uniqueColors: Object.keys(colorCounts).length,
    bgCode: detectBackgroundCode(codes, width, height)
  };
}

function convertPattern(jobId, payload) {
  const {
    pixels,
    sourceWidth,
    sourceHeight,
    options
  } = payload;

  const palette = getPreparedPalette(options.brandKey);
  let workingPixels = new Uint8ClampedArray(pixels);
  postProgress(jobId, 0.08, '读取图片中…');

  if (options.removeBackground) {
    workingPixels = removeBackground(workingPixels, sourceWidth, sourceHeight);
    postProgress(jobId, 0.18, '已执行背景去除');
  }

  workingPixels = applyAdjustments(
    workingPixels,
    options.brightness,
    options.contrast,
    options.saturation
  );
  postProgress(jobId, 0.28, '已完成图像调整');

  const gridWidth = Math.max(10, Math.min(200, Math.round(options.gridWidth || 64)));
  const gridHeight = Math.max(1, Math.round((sourceHeight / sourceWidth) * gridWidth));
  const totalCells = gridWidth * gridHeight;
  const representativeColors = new Array(totalCells).fill(null);
  const uniqueSamples = new Map();

  for (let y = 0; y < gridHeight; y += 1) {
    for (let x = 0; x < gridWidth; x += 1) {
      const color = sampleCellRepresentative(
        workingPixels,
        sourceWidth,
        sourceHeight,
        gridWidth,
        gridHeight,
        x,
        y
      );
      const index = y * gridWidth + x;
      representativeColors[index] = color;
      if (color) {
        uniqueSamples.set(packRgb(color), rgbToLab(color));
      }
    }
    if (gridHeight > 6 && y % Math.max(1, Math.floor(gridHeight / 6)) === 0) {
      postProgress(jobId, 0.28 + (y / gridHeight) * 0.24, '正在抽样网格…');
    }
  }

  const leaderMap = clusterRepresentativeColors(uniqueSamples);
  const nearestCache = new Map();
  const codes = new Array(totalCells).fill(null);
  const colorCounts = {};

  for (let index = 0; index < representativeColors.length; index += 1) {
    const color = representativeColors[index];
    if (!color) {
      continue;
    }
    const packed = packRgb(color);
    const leader = leaderMap.get(packed) || packed;
    const nearest = findNearestColor(unpackRgb(leader), palette, nearestCache);
    codes[index] = nearest.code;
    colorCounts[nearest.code] = (colorCounts[nearest.code] || 0) + 1;
  }

  postProgress(jobId, 0.72, '正在匹配色卡…');

  const reduced = reduceColors(codes, palette, colorCounts, options.maxColors || 0);
  postProgress(jobId, 0.88, '正在整理结果…');

  return buildResult(
    reduced.codes,
    gridWidth,
    gridHeight,
    palette.key,
    reduced.colorCounts
  );
}

self.onmessage = (event) => {
  const { type, jobId } = event.data || {};
  if (type !== 'convert') {
    return;
  }

  try {
    const result = convertPattern(jobId, event.data);
    self.postMessage({
      type: 'result',
      jobId,
      result
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      jobId,
      message: error instanceof Error ? error.message : '拼豆图案生成失败'
    });
  }
};
