const DIRECT_VIDEO_EXTENSIONS = [
  '.mp4',
  '.webm',
  '.mov',
  '.m4v',
  '.m4s',
  '.mkv',
  '.avi',
  '.flv',
  '.ts',
  '.3gp'
];

const PLAYLIST_EXTENSIONS = [
  '.m3u8',
  '.m3u'
];

const MEDIA_EXTENSION_PATTERN = '(?:m3u8|m3u|mp4|webm|mov|m4v|m4s|mkv|avi|flv|ts|3gp)';
const ABSOLUTE_MEDIA_URL_RE = new RegExp(
  `https?:\\\\/\\\\/[^\\s"'<>\\\\]+?\\.${MEDIA_EXTENSION_PATTERN}(?:\\?[^\\s"'<>\\\\]*)?`,
  'ig'
);
const RELATIVE_MEDIA_URL_RE = new RegExp(
  `(?:\\/|\\.\\.\\/|\\.\\/)[^\\s"'<>\\\\]+?\\.${MEDIA_EXTENSION_PATTERN}(?:\\?[^\\s"'<>\\\\]*)?`,
  'ig'
);
const MEDIA_URL_FIELD_RE = /(url|uri|src|source|play|stream|content|download|file|baseurl|base_url|backupurl|backup_url)$/i;
const MEDIA_CONTEXT_FIELD_RE = /(video|audio|stream|play|source|media|dash|hls|content|download|file|baseurl|base_url)/i;
const AUDIO_FIELD_RE = /audio/i;

function uniqueUrls(urls) {
  const result = [];
  const seen = new Set();

  urls.forEach((url) => {
    if (!url || seen.has(url)) {
      return;
    }

    seen.add(url);
    result.push(url);
  });

  return result;
}

function normalizeUrl(value, baseUrl) {
  if (typeof value !== 'string' || !value.trim()) {
    return '';
  }

  try {
    const url = baseUrl ? new URL(value, baseUrl) : new URL(value);
    if (!/^https?:$/i.test(url.protocol)) {
      return '';
    }
    return url.toString();
  } catch (error) {
    return '';
  }
}

function getPathExtension(value) {
  try {
    const pathname = new URL(value).pathname.toLowerCase();
    const match = pathname.match(/(\.[a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : '';
  } catch (error) {
    return '';
  }
}

function getDefaultLabel(url) {
  try {
    const parsed = new URL(url);
    const tail = parsed.pathname.split('/').filter(Boolean).pop();
    if (!tail) {
      return parsed.hostname;
    }
    return decodeURIComponent(tail);
  } catch (error) {
    return 'video';
  }
}

function classifyUrlKind(url, mimeType = '') {
  const safeMimeType = String(mimeType || '').toLowerCase();
  const extension = getPathExtension(url);

  if (
    PLAYLIST_EXTENSIONS.includes(extension) ||
    safeMimeType.includes('mpegurl') ||
    safeMimeType.includes('application/vnd.apple.mpegurl') ||
    safeMimeType.includes('application/x-mpegurl')
  ) {
    return 'hls';
  }

  if (DIRECT_VIDEO_EXTENSIONS.includes(extension) || safeMimeType.startsWith('video/')) {
    return 'file';
  }

  return 'unknown';
}

function normalizeEntryKind(kind, url, mimeType = '', audioUrl = '') {
  if (kind === 'dash' || audioUrl) {
    return 'dash';
  }

  return kind || classifyUrlKind(url, mimeType);
}

function dedupeEntries(entries) {
  const map = new Map();

  entries.forEach((entry, index) => {
    if (!entry || !entry.url) {
      return;
    }

    const existing = map.get(entry.url);
    const nextEntry = {
      id: entry.id || `${index}-${Math.random().toString(36).slice(2, 7)}`,
      url: entry.url,
      kind: normalizeEntryKind(entry.kind, entry.url, entry.mimeType, entry.audioUrl),
      label: entry.label || getDefaultLabel(entry.url),
      note: entry.note || '',
      sourceType: entry.sourceType || 'unknown',
      mimeType: entry.mimeType || '',
      metaText: entry.metaText || '',
      pageTitle: entry.pageTitle || '',
      fromCapture: Boolean(entry.fromCapture),
      audioUrl: entry.audioUrl || '',
      ext: entry.ext || '',
      downloadName: entry.downloadName || '',
      qualityLabel: entry.qualityLabel || ''
    };

    if (!existing) {
      map.set(entry.url, nextEntry);
      return;
    }

    if (!existing.note && nextEntry.note) {
      existing.note = nextEntry.note;
    }

    if (!existing.metaText && nextEntry.metaText) {
      existing.metaText = nextEntry.metaText;
    }

    if (existing.sourceType !== nextEntry.sourceType && nextEntry.sourceType) {
      existing.sourceType = `${existing.sourceType} + ${nextEntry.sourceType}`;
    }

    if (existing.kind === 'unknown' && nextEntry.kind !== 'unknown') {
      existing.kind = nextEntry.kind;
    }

    if (existing.kind !== 'dash' && nextEntry.kind === 'dash') {
      existing.kind = 'dash';
    }

    if (!existing.audioUrl && nextEntry.audioUrl) {
      existing.audioUrl = nextEntry.audioUrl;
    }

    if (!existing.ext && nextEntry.ext) {
      existing.ext = nextEntry.ext;
    }

    if (!existing.downloadName && nextEntry.downloadName) {
      existing.downloadName = nextEntry.downloadName;
    }

    if (!existing.qualityLabel && nextEntry.qualityLabel) {
      existing.qualityLabel = nextEntry.qualityLabel;
    }
  });

  return Array.from(map.values());
}

function pushEntry(entries, candidateUrl, baseUrl, patch = {}) {
  const nextUrl = normalizeUrl(candidateUrl, baseUrl);
  if (!nextUrl) {
    return;
  }

  entries.push({
    url: nextUrl,
    kind: patch.kind || classifyUrlKind(nextUrl, patch.mimeType),
    label: patch.label || getDefaultLabel(nextUrl),
    note: patch.note || '',
    sourceType: patch.sourceType || 'page',
    mimeType: patch.mimeType || '',
    metaText: patch.metaText || '',
    pageTitle: patch.pageTitle || ''
  });
}

function extractUrlsFromValue(value, baseUrl, depth = 0) {
  if (!value || depth > 2) {
    return [];
  }

  if (typeof value === 'string') {
    const url = normalizeUrl(value, baseUrl);
    if (!url || classifyUrlKind(url) === 'unknown') {
      return [];
    }

    return [url];
  }

  if (Array.isArray(value)) {
    return uniqueUrls(
      value.flatMap((item) => extractUrlsFromValue(item, baseUrl, depth + 1))
    );
  }

  if (typeof value !== 'object') {
    return [];
  }

  const urls = [];
  Object.entries(value).forEach(([key, nestedValue]) => {
    if (typeof nestedValue === 'string' && MEDIA_URL_FIELD_RE.test(key)) {
      urls.push(...extractUrlsFromValue(nestedValue, baseUrl, depth + 1));
      return;
    }

    if (Array.isArray(nestedValue) && MEDIA_CONTEXT_FIELD_RE.test(key)) {
      urls.push(...extractUrlsFromValue(nestedValue, baseUrl, depth + 1));
      return;
    }

    if (nestedValue && typeof nestedValue === 'object' && MEDIA_CONTEXT_FIELD_RE.test(key)) {
      urls.push(...extractUrlsFromValue(nestedValue, baseUrl, depth + 1));
    }
  });

  return uniqueUrls(urls);
}

function collectDashEntriesFromRecord(value, baseUrl, entries, sourceType = 'json') {
  if (!value || typeof value !== 'object') {
    return;
  }

  const videoUrls = [];
  const audioUrls = [];

  Object.entries(value).forEach(([key, nestedValue]) => {
    const urls = extractUrlsFromValue(nestedValue, baseUrl);
    if (!urls.length) {
      return;
    }

    if (AUDIO_FIELD_RE.test(key)) {
      audioUrls.push(...urls);
      return;
    }

    if (MEDIA_CONTEXT_FIELD_RE.test(key)) {
      videoUrls.push(...urls);
    }
  });

  const dedupedVideos = uniqueUrls(videoUrls);
  const dedupedAudios = uniqueUrls(audioUrls);
  if (!dedupedVideos.length || !dedupedAudios.length) {
    return;
  }

  dedupedVideos.slice(0, 6).forEach((videoUrl, index) => {
    entries.push({
      url: videoUrl,
      audioUrl: dedupedAudios[0],
      kind: 'dash',
      label: `DASH 视频 ${index + 1}`,
      sourceType,
      note: '来自页面内 JSON 音视频信息'
    });
  });
}

function collectFromObject(value, baseUrl, entries, sourceType = 'json') {
  if (!value) {
    return;
  }

  if (typeof value === 'string') {
    const url = normalizeUrl(value, baseUrl);
    if (url && classifyUrlKind(url) !== 'unknown') {
      pushEntry(entries, url, baseUrl, {
        sourceType,
        note: '来自页面内 JSON 数据'
      });
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectFromObject(item, baseUrl, entries, sourceType));
    return;
  }

  if (typeof value !== 'object') {
    return;
  }

  collectDashEntriesFromRecord(value, baseUrl, entries, sourceType);

  Object.entries(value).forEach(([key, nestedValue]) => {
    if (typeof nestedValue === 'string') {
      const loweredKey = key.toLowerCase();
      if (
        loweredKey.includes('video') ||
        loweredKey.includes('audio') ||
        loweredKey.includes('stream') ||
        loweredKey.includes('play') ||
        loweredKey.includes('contenturl') ||
        loweredKey.includes('download') ||
        loweredKey.includes('url') ||
        loweredKey.includes('src') ||
        loweredKey.includes('baseurl') ||
        loweredKey.includes('base_url')
      ) {
        const url = normalizeUrl(nestedValue, baseUrl);
        if (url && classifyUrlKind(url) !== 'unknown') {
          pushEntry(entries, url, baseUrl, {
            sourceType,
            note: `来自 JSON 字段 ${key}`
          });
        }
      }
    }
    collectFromObject(nestedValue, baseUrl, entries, sourceType);
  });
}

function extractUrlsByRegex(text, baseUrl, entries, sourceType) {
  if (typeof text !== 'string' || !text.trim()) {
    return;
  }

  ABSOLUTE_MEDIA_URL_RE.lastIndex = 0;
  RELATIVE_MEDIA_URL_RE.lastIndex = 0;

  let match = ABSOLUTE_MEDIA_URL_RE.exec(text);
  while (match) {
    pushEntry(entries, match[0], baseUrl, {
      sourceType,
      note: '通过页面文本正则提取'
    });
    match = ABSOLUTE_MEDIA_URL_RE.exec(text);
  }

  match = RELATIVE_MEDIA_URL_RE.exec(text);
  while (match) {
    pushEntry(entries, match[0], baseUrl, {
      sourceType,
      note: '通过页面文本正则提取'
    });
    match = RELATIVE_MEDIA_URL_RE.exec(text);
  }
}

function extractFromHtml(html, pageUrl) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const entries = [];
  const title = doc.querySelector('meta[property="og:title"]')?.getAttribute('content')
    || doc.title
    || '';

  doc.querySelectorAll('video').forEach((node) => {
    const currentSrc = node.currentSrc || node.getAttribute('src');
    if (currentSrc) {
      pushEntry(entries, currentSrc, pageUrl, {
        sourceType: 'video tag',
        note: '来自页面内 <video> 标签',
        pageTitle: title
      });
    }
  });

  doc.querySelectorAll('source[src]').forEach((node) => {
    pushEntry(entries, node.getAttribute('src'), pageUrl, {
      sourceType: 'source tag',
      mimeType: node.getAttribute('type') || '',
      note: '来自页面内 <source> 标签',
      pageTitle: title
    });
  });

  doc.querySelectorAll(
    'meta[property="og:video"], meta[property="og:video:url"], meta[property="og:video:secure_url"], meta[name="twitter:player:stream"], meta[itemprop="contentUrl"]'
  ).forEach((node) => {
    const content = node.getAttribute('content');
    if (content) {
      pushEntry(entries, content, pageUrl, {
        sourceType: 'meta tag',
        note: '来自页面 meta 标签',
        pageTitle: title
      });
    }
  });

  doc.querySelectorAll('a[href]').forEach((node) => {
    const href = node.getAttribute('href');
    const url = normalizeUrl(href, pageUrl);
    if (!url || classifyUrlKind(url) === 'unknown') {
      return;
    }
    pushEntry(entries, url, pageUrl, {
      sourceType: 'anchor tag',
      note: '来自页面内链接',
      pageTitle: title
    });
  });

  doc.querySelectorAll('script[type="application/ld+json"]').forEach((node) => {
    const text = node.textContent || '';
    if (!text.trim()) {
      return;
    }

    try {
      const data = JSON.parse(text);
      collectFromObject(data, pageUrl, entries, 'json-ld');
    } catch (error) {
      extractUrlsByRegex(text, pageUrl, entries, 'json-ld');
    }
  });

  doc.querySelectorAll('script').forEach((node) => {
    const text = node.textContent || '';
    if (!text.trim()) {
      return;
    }
    extractUrlsByRegex(text, pageUrl, entries, 'script');
  });

  extractUrlsByRegex(html, pageUrl, entries, 'html');

  return {
    title,
    entries: dedupeEntries(entries)
  };
}

function extractFromJsonText(text, pageUrl) {
  const entries = [];

  try {
    const data = JSON.parse(text);
    collectFromObject(data, pageUrl, entries, 'json response');
  } catch (error) {
    extractUrlsByRegex(text, pageUrl, entries, 'json response');
  }

  return {
    title: '',
    entries: dedupeEntries(entries)
  };
}

function parseAttributeList(text) {
  const attributes = {};
  const pattern = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/ig;
  let match = pattern.exec(text);

  while (match) {
    const key = match[1];
    const rawValue = match[2] || '';
    attributes[key] = rawValue.replace(/^"|"$/g, '');
    match = pattern.exec(text);
  }

  return attributes;
}

function parseM3u8Manifest(manifestText, manifestUrl) {
  const rawLines = String(manifestText || '').split(/\r?\n/);
  const lines = rawLines.map((line) => line.trim()).filter(Boolean);
  const variants = [];
  const segments = [];
  const warnings = [];
  let totalDuration = 0;
  let targetDuration = 0;
  let encryptionMethod = '';
  let hasMap = false;
  let hasByteRange = false;
  let pendingSegmentDuration = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const attrs = parseAttributeList(line.slice('#EXT-X-STREAM-INF:'.length));
      let nextIndex = index + 1;
      while (nextIndex < lines.length && lines[nextIndex].startsWith('#')) {
        nextIndex += 1;
      }

      if (nextIndex < lines.length) {
        const nextUrl = normalizeUrl(lines[nextIndex], manifestUrl);
        if (nextUrl) {
          const metaParts = [];
          if (attrs.RESOLUTION) {
            metaParts.push(attrs.RESOLUTION);
          }
          if (attrs.BANDWIDTH) {
            metaParts.push(`${Math.round(Number(attrs.BANDWIDTH) / 1000)} kbps`);
          }
          variants.push({
            id: `variant-${variants.length + 1}`,
            url: nextUrl,
            kind: 'hls',
            label: attrs.NAME || attrs.RESOLUTION || `清晰度 ${variants.length + 1}`,
            sourceType: 'hls master',
            note: '来自 HLS 主播放列表',
            metaText: metaParts.join(' · '),
            codecs: attrs.CODECS || '',
            resolution: attrs.RESOLUTION || '',
            bandwidth: Number(attrs.BANDWIDTH) || 0
          });
        }
      }
      continue;
    }

    if (line.startsWith('#EXTINF:')) {
      const matched = line.match(/^#EXTINF:([\d.]+)/i);
      pendingSegmentDuration = matched ? Number(matched[1]) || 0 : 0;
      continue;
    }

    if (line.startsWith('#EXT-X-TARGETDURATION:')) {
      targetDuration = Number(line.slice('#EXT-X-TARGETDURATION:'.length)) || 0;
      continue;
    }

    if (line.startsWith('#EXT-X-KEY:')) {
      const attrs = parseAttributeList(line.slice('#EXT-X-KEY:'.length));
      encryptionMethod = attrs.METHOD || '';
      continue;
    }

    if (line.startsWith('#EXT-X-MAP:')) {
      hasMap = true;
      continue;
    }

    if (line.startsWith('#EXT-X-BYTERANGE:')) {
      hasByteRange = true;
      continue;
    }

    if (line.startsWith('#')) {
      continue;
    }

    const segmentUrl = normalizeUrl(line, manifestUrl);
    if (!segmentUrl) {
      continue;
    }

    segments.push({
      id: `segment-${segments.length + 1}`,
      url: segmentUrl,
      duration: pendingSegmentDuration
    });
    totalDuration += pendingSegmentDuration;
    pendingSegmentDuration = 0;
  }

  const isMaster = variants.length > 0;
  const segmentFormats = new Set(
    segments.map((segment) => {
      const extension = getPathExtension(segment.url);
      if (extension === '.ts') {
        return 'ts';
      }
      if (extension === '.m4s' || extension === '.mp4') {
        return 'fmp4';
      }
      return extension || 'unknown';
    })
  );
  const isEncrypted = Boolean(encryptionMethod && encryptionMethod.toUpperCase() !== 'NONE');
  const supportsBrowserMerge = !isMaster
    && !isEncrypted
    && !hasMap
    && !hasByteRange
    && segments.length > 0
    && segments.length <= 240
    && segmentFormats.size === 1
    && segmentFormats.has('ts');

  if (isEncrypted) {
    warnings.push(`播放列表包含 ${encryptionMethod} 加密，前端无法直接合并下载。`);
  }
  if (hasMap) {
    warnings.push('检测到 fMP4 初始化片段，当前仅支持 TS 分片合并。');
  }
  if (hasByteRange) {
    warnings.push('检测到 Byte-Range 分片，当前未实现浏览器端合并。');
  }
  if (!isMaster && segments.length > 240) {
    warnings.push('分片数量过多，浏览器端合并内存开销较大，已禁用前端合并。');
  }
  if (!isMaster && segmentFormats.size > 1) {
    warnings.push('分片格式不一致，当前不建议在浏览器内直接合并。');
  }

  return {
    manifestUrl,
    manifestText,
    isMaster,
    isMedia: !isMaster,
    variants: dedupeEntries(variants),
    segments,
    totalDuration,
    targetDuration,
    isEncrypted,
    encryptionMethod,
    hasMap,
    hasByteRange,
    supportsBrowserMerge,
    warnings
  };
}

function buildDirectAnalysis(url, options = {}) {
  const entry = {
    url,
    kind: classifyUrlKind(url, options.mimeType),
    label: options.label || getDefaultLabel(url),
    note: options.note || '看起来是可直接访问的视频文件或播放清单。',
    sourceType: options.sourceType || 'input',
    mimeType: options.mimeType || '',
    metaText: options.metaText || ''
  };

  return {
    kind: 'direct',
    inputUrl: url,
    finalUrl: url,
    title: options.title || '',
    entries: dedupeEntries([entry]),
    warnings: options.warnings || [],
    manifest: options.manifest || null,
    source: options.source || 'input'
  };
}

function buildCapturedAnalysis(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('抓取结果格式错误。');
  }

  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const pageUrl = normalizeUrl(payload.pageUrl) || '';
  const entries = dedupeEntries(
    rawItems.map((item, index) => {
      const nextUrl = normalizeUrl(item?.url, pageUrl);
      const nextAudioUrl = normalizeUrl(item?.audioUrl, pageUrl);
      if (!nextUrl) {
        return null;
      }
      return {
        id: `capture-${index + 1}`,
        url: nextUrl,
        kind: normalizeEntryKind(item?.kind, nextUrl, item?.mimeType, nextAudioUrl),
        label: item.label || getDefaultLabel(nextUrl),
        note: item.note || '来自源页面上下文抓取',
        sourceType: item.source || item.sourceType || 'capture',
        metaText: item.metaText || '',
        mimeType: item.mimeType || '',
        pageTitle: payload.title || '',
        fromCapture: true,
        audioUrl: nextAudioUrl,
        ext: item.ext || '',
        downloadName: item.downloadName || '',
        qualityLabel: item.qualityLabel || ''
      };
    }).filter(Boolean)
  );

  const source = payload.source || 'capture';
  const warnings = entries.length
    ? [
        source === 'browser-extension'
          ? '这些链接来自浏览器插件在源页面和网络请求里的本地捕获，不经过本站服务器。下载是否成功仍取决于目标站鉴权、跨域和签名策略。'
          : '这些链接来自源页面自身环境，不经过本站服务器，但下载仍可能受目标站鉴权或跨域限制。'
      ]
    : ['未从抓取结果中识别出可处理的视频地址。'];

  return {
    kind: 'captured',
    inputUrl: pageUrl,
    finalUrl: pageUrl,
    title: payload.title || '',
    sourceTabId: Number.isInteger(payload.sourceTabId) ? payload.sourceTabId : null,
    entries,
    warnings,
    manifest: null,
    source
  };
}

export async function analyzeVideoUrl(input) {
  const normalizedInput = normalizeUrl(input);
  if (!normalizedInput) {
    throw new Error('请输入有效的 http:// 或 https:// 视频地址。');
  }

  if (classifyUrlKind(normalizedInput) === 'file') {
    return buildDirectAnalysis(normalizedInput, {
      note: '这是直接视频文件链接，优先尝试浏览器直连下载。'
    });
  }

  if (classifyUrlKind(normalizedInput) === 'hls') {
    const response = await fetch(normalizedInput, {
      method: 'GET',
      redirect: 'follow'
    });
    if (!response.ok) {
      throw new Error(`播放清单请求失败：HTTP ${response.status}`);
    }

    const manifestText = await response.text();
    const manifest = parseM3u8Manifest(manifestText, response.url || normalizedInput);
    return {
      kind: 'manifest',
      inputUrl: normalizedInput,
      finalUrl: response.url || normalizedInput,
      title: '',
      entries: manifest.isMaster
        ? manifest.variants
        : [{
            id: 'playlist-self',
            url: manifest.manifestUrl,
            kind: 'hls',
            label: getDefaultLabel(manifest.manifestUrl),
            note: '当前为 HLS 媒体播放列表。',
            sourceType: 'hls media',
            metaText: `${manifest.segments.length} 个分片`
          }],
      warnings: manifest.warnings,
      manifest,
      source: 'input'
    };
  }

  try {
    const response = await fetch(normalizedInput, {
      method: 'GET',
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`页面请求失败：HTTP ${response.status}`);
    }

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const finalUrl = response.url || normalizedInput;

    if (classifyUrlKind(finalUrl, contentType) === 'file') {
      return buildDirectAnalysis(finalUrl, {
        mimeType: contentType,
        note: '目标地址直接返回了视频文件流。',
        source: 'fetch'
      });
    }

    if (classifyUrlKind(finalUrl, contentType) === 'hls') {
      const manifestText = await response.text();
      const manifest = parseM3u8Manifest(manifestText, finalUrl);
      return {
        kind: 'manifest',
        inputUrl: normalizedInput,
        finalUrl,
        title: '',
        entries: manifest.isMaster
          ? manifest.variants
          : [{
              id: 'playlist-self',
              url: manifest.manifestUrl,
              kind: 'hls',
              label: getDefaultLabel(manifest.manifestUrl),
              note: '当前为 HLS 媒体播放列表。',
              sourceType: 'hls media',
              metaText: `${manifest.segments.length} 个分片`
            }],
        warnings: manifest.warnings,
        manifest,
        source: 'fetch'
      };
    }

    const bodyText = await response.text();
    const extracted = contentType.includes('json')
      ? extractFromJsonText(bodyText, finalUrl)
      : extractFromHtml(bodyText, finalUrl);
    const warnings = [];
    if (!extracted.entries.length) {
      warnings.push('页面可读，但未在 HTML 中发现可直接访问的视频地址。');
    }

    return {
      kind: 'page',
      inputUrl: normalizedInput,
      finalUrl,
      title: extracted.title,
      entries: extracted.entries,
      warnings,
      manifest: null,
      source: 'fetch'
    };
  } catch (error) {
    return {
      kind: 'page',
      inputUrl: normalizedInput,
      finalUrl: normalizedInput,
      title: '',
      entries: [],
      warnings: [
        '浏览器无法直接读取这个页面，常见原因是目标站未开启 CORS、需要登录态、带有签名校验或启用了 DRM。',
        '如果这是普通网页地址，请到原网页里运行下方抓取脚本，再把抓取结果粘回本页继续分析。'
      ],
      manifest: null,
      source: 'blocked',
      blockedReason: error?.message || '跨域读取失败'
    };
  }
}

export function parseCapturedPayload(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('请先粘贴抓取结果 JSON。');
  }

  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw new Error('抓取结果必须是 JSON 格式。');
  }

  return buildCapturedAnalysis(payload);
}

export function downloadTextFile(text, filename, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function getSuggestedFilename(url, fallback = 'video') {
  const label = getDefaultLabel(url) || fallback;
  const extension = getPathExtension(url);
  const baseName = label
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w\u4e00-\u9fa5.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || fallback;

  return `${baseName}${extension || '.mp4'}`;
}

function escapeJavaScriptString(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

export function getSourcePageDownloadSnippet(url, filename = '') {
  const safeUrl = escapeJavaScriptString(url);
  const safeFilename = escapeJavaScriptString(filename);

  return String.raw`(() => {
  const downloadUrl = '${safeUrl}';
  const filename = '${safeFilename}';
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  if (filename) {
    link.setAttribute('download', filename);
  }
  link.style.display = 'none';
  (document.body || document.documentElement).appendChild(link);
  link.click();
  link.remove();
})();`;
}

export function getVideoCaptureSnippet() {
  return String.raw`(() => {
  const mediaPattern = /https?:\/\/[^\s"'<>\\]+?\.(?:m3u8|m3u|mp4|webm|mov|m4v|m4s|mkv|avi|flv|ts|3gp)(?:\?[^\s"'<>\\]*)?/ig;
  const relativePattern = /(?:\/|\.\.\/|\.\/)[^\s"'<>\\]+?\.(?:m3u8|m3u|mp4|webm|mov|m4v|m4s|mkv|avi|flv|ts|3gp)(?:\?[^\s"'<>\\]*)?/ig;
  const windowKeyPattern = /(video|audio|play|player|stream|media|dash|hls|source|state|data|info)/i;
  const commonGlobalKeys = ['__NEXT_DATA__', '__NUXT__', '__INITIAL_STATE__', '__INITIAL_DATA__', '__playinfo__', '__PLAYER_CONFIG__', 'ytInitialPlayerResponse'];
  const seen = new Map();
  const visited = new WeakSet();
  const toAbs = (value) => {
    if (!value || typeof value !== 'string') return '';
    try {
      const url = new URL(value, location.href);
      if (!/^https?:$/i.test(url.protocol)) return '';
      return url.toString();
    } catch (error) {
      return '';
    }
  };
  const classify = (url) => {
    if (/\.m3u8(?:$|\?)/i.test(url) || /\.m3u(?:$|\?)/i.test(url)) return 'hls';
    if (/\.(mp4|webm|mov|m4v|mkv|avi|flv|ts|3gp)(?:$|\?)/i.test(url)) return 'file';
    return 'unknown';
  };
  const push = (value, source, note) => {
    const url = toAbs(value);
    if (!url || classify(url) === 'unknown') return;
    if (!seen.has(url)) {
      seen.set(url, {
        url,
        kind: classify(url),
        source,
        note
      });
    }
  };
  const pushDash = (videoUrl, audioUrl, source, note) => {
    const url = toAbs(videoUrl);
    const audio = toAbs(audioUrl);
    if (!url || !audio) return;
    const key = 'dash|' + url + '|' + audio;
    if (!seen.has(key)) {
      seen.set(key, {
        url,
        audioUrl: audio,
        kind: 'dash',
        source,
        note
      });
    }
  };
  const collectTextMatches = (text, source, note) => {
    if (!text || typeof text !== 'string') return;
    mediaPattern.lastIndex = 0;
    relativePattern.lastIndex = 0;
    let match = mediaPattern.exec(text);
    while (match) {
      push(match[0], source, note);
      match = mediaPattern.exec(text);
    }
    match = relativePattern.exec(text);
    while (match) {
      push(match[0], source, note);
      match = relativePattern.exec(text);
    }
  };
  const visitValue = (value, source, note, depth = 0) => {
    if (!value || depth > 3) return;
    if (typeof value === 'string') {
      collectTextMatches(value, source, note);
      return;
    }
    if (typeof value !== 'object') return;
    if (visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      value.slice(0, 24).forEach((item) => visitValue(item, source, note, depth + 1));
      return;
    }
    const videoUrls = [];
    const audioUrls = [];
    Object.entries(value).forEach(([key, nestedValue]) => {
      const loweredKey = String(key || '').toLowerCase();
      if (typeof nestedValue === 'string') {
        const nextUrl = toAbs(nestedValue);
        if (nextUrl && /(url|src|source|play|stream|content|download|file|baseurl|base_url)/i.test(loweredKey)) {
          if (/audio/i.test(loweredKey)) {
            audioUrls.push(nextUrl);
          } else {
            videoUrls.push(nextUrl);
          }
          push(nextUrl, source + ':' + key, note + ' (' + key + ')');
          return;
        }
        collectTextMatches(nestedValue, source + ':' + key, note + ' (' + key + ')');
        return;
      }
      if (nestedValue && typeof nestedValue === 'object' && /(video|audio|media|dash|hls|play|stream|source|data)/i.test(loweredKey)) {
        visitValue(nestedValue, source + ':' + key, note + ' (' + key + ')', depth + 1);
        return;
      }
      if (Array.isArray(nestedValue)) {
        nestedValue.slice(0, 16).forEach((item) => visitValue(item, source + ':' + key, note + ' (' + key + ')', depth + 1));
      }
    });
    if (videoUrls.length && audioUrls.length) {
      videoUrls.slice(0, 4).forEach((videoUrl, index) => {
        pushDash(videoUrl, audioUrls[0], source, note + ' (DASH ' + (index + 1) + ')');
      });
    }
  };
  document.querySelectorAll('video').forEach((node) => {
    push(node.currentSrc || node.src, 'video tag', '来自页面 <video>');
    Array.from(node.querySelectorAll('source[src]')).forEach((sourceNode) => {
      push(sourceNode.src || sourceNode.getAttribute('src'), 'source tag', '来自页面 <source>');
    });
  });
  document.querySelectorAll('source[src]').forEach((node) => {
    push(node.src || node.getAttribute('src'), 'source tag', '来自页面 <source>');
  });
  document.querySelectorAll('a[href]').forEach((node) => {
    push(node.href || node.getAttribute('href'), 'anchor tag', '来自页面链接');
  });
  document.querySelectorAll('[data-src],[data-url],[data-playurl],[data-video-url],[data-hls]').forEach((node) => {
    Array.from(node.attributes || []).forEach((attr) => {
      if (/^data-(?:src|url|playurl|video-url|hls)$/i.test(attr.name)) {
        push(attr.value, 'data attribute', '来自页面 data-* 属性');
      }
    });
  });
  if (window.performance && performance.getEntriesByType) {
    performance.getEntriesByType('resource').forEach((entry) => {
      push(entry.name, 'performance resource', '来自资源时间线');
    });
  }
  document.querySelectorAll('script[type="application/ld+json"]').forEach((node) => {
    const text = node.textContent || '';
    mediaPattern.lastIndex = 0;
    relativePattern.lastIndex = 0;
    let match = mediaPattern.exec(text);
    while (match) {
      push(match[0], 'json-ld', '来自 JSON-LD');
      match = mediaPattern.exec(text);
    }
    match = relativePattern.exec(text);
    while (match) {
      push(match[0], 'json-ld', '来自 JSON-LD');
      match = relativePattern.exec(text);
    }
  });
  Array.from(document.scripts).forEach((node) => {
    const text = node.textContent || '';
    if (!text) return;
    collectTextMatches(text, 'script', '来自脚本文本');
  });
  commonGlobalKeys.forEach((key) => {
    try {
      if (key in window) {
        visitValue(window[key], 'global', '来自 window.' + key);
      }
    } catch (error) {
      // ignore cross-origin getter errors
    }
  });
  Object.keys(window).filter((key) => windowKeyPattern.test(key)).slice(0, 20).forEach((key) => {
    if (commonGlobalKeys.includes(key)) return;
    try {
      visitValue(window[key], 'window object', '来自 window.' + key);
    } catch (error) {
      // ignore access errors
    }
  });
  const payload = {
    version: 1,
    pageUrl: location.href,
    title: document.title || '',
    generatedAt: new Date().toISOString(),
    items: Array.from(seen.values())
  };
  const text = JSON.stringify(payload, null, 2);
  const finish = () => {
    console.log('Video capture payload:');
    console.log(text);
    alert('已生成抓取结果，若浏览器未自动复制，请到控制台复制 JSON。共发现 ' + payload.items.length + ' 个候选链接。');
  };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(finish).catch(finish);
  } else {
    finish();
  }
  return payload;
})();`;
}
