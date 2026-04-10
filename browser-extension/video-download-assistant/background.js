const MEDIA_SOURCE = 'boxtools-video-download-extension';
const DIRECT_VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.m4v', '.m4s', '.mkv', '.avi', '.flv', '.ts', '.3gp'];
const PLAYLIST_EXTENSIONS = ['.m3u8', '.m3u'];
const TOOL_PAGE_URLS = [
  'http://localhost:5173/tools/video-download',
  'http://127.0.0.1:5173/tools/video-download',
  'https://tools.131417.net/tools/video-download'
];

const pendingRequests = new Map();
const mediaByTab = new Map();

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

function sanitizeFileBaseName(value) {
  return String(value || 'video')
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w\u4e00-\u9fa5.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'video';
}

function getDefaultLabel(url) {
  try {
    const parsed = new URL(url);
    const tail = parsed.pathname.split('/').filter(Boolean).pop();
    return tail ? decodeURIComponent(tail) : parsed.hostname;
  } catch (error) {
    return 'video';
  }
}

function getHeaderValue(headers, name) {
  if (!Array.isArray(headers)) {
    return '';
  }

  const target = String(name || '').toLowerCase();
  const item = headers.find((header) => String(header.name || '').toLowerCase() === target);
  return item?.value || '';
}

function classifyEntryKind(url, mimeType = '', audioUrl = '') {
  if (audioUrl) {
    return 'dash';
  }

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

  if (
    DIRECT_VIDEO_EXTENSIONS.includes(extension) ||
    safeMimeType.startsWith('video/') ||
    safeMimeType.includes('application/octet-stream')
  ) {
    return 'file';
  }

  return 'unknown';
}

function getTabState(tabId) {
  if (!mediaByTab.has(tabId)) {
    mediaByTab.set(tabId, {
      pageUrl: '',
      title: '',
      items: [],
      updatedAt: 0
    });
  }

  return mediaByTab.get(tabId);
}

function resetTabState(tabId, nextPageUrl = '', nextTitle = '') {
  mediaByTab.set(tabId, {
    pageUrl: nextPageUrl,
    title: nextTitle,
    items: [],
    updatedAt: Date.now()
  });
}

function mergeItems(tabId, items, pageMeta = {}) {
  if (!Number.isInteger(tabId) || tabId < 0 || !Array.isArray(items) || !items.length) {
    return;
  }

  const state = getTabState(tabId);
  if (pageMeta.pageUrl) {
    state.pageUrl = pageMeta.pageUrl;
  }
  if (pageMeta.title) {
    state.title = pageMeta.title;
  }

  const map = new Map(
    state.items.map((item) => [`${item.kind}|${item.url}|${item.audioUrl || ''}`, item])
  );

  items.forEach((item, index) => {
    const url = normalizeUrl(item.url, state.pageUrl);
    const audioUrl = normalizeUrl(item.audioUrl, state.pageUrl);
    if (!url) {
      return;
    }

    const mimeType = item.mimeType || '';
    const kind = classifyEntryKind(url, mimeType, audioUrl);
    if (kind === 'unknown' && item.kind !== 'unknown') {
      return;
    }

    const mergedItem = {
      id: item.id || `${tabId}-${Date.now()}-${index}`,
      url,
      audioUrl,
      kind: item.kind || kind,
      label: item.label || getDefaultLabel(url),
      note: item.note || '',
      sourceType: item.sourceType || 'extension',
      mimeType,
      metaText: item.metaText || '',
      ext: item.ext || getPathExtension(url).replace(/^\./, ''),
      downloadName: item.downloadName || '',
      qualityLabel: item.qualityLabel || ''
    };

    const mapKey = `${mergedItem.kind}|${mergedItem.url}|${mergedItem.audioUrl || ''}`;
    const existing = map.get(mapKey);
    if (!existing) {
      map.set(mapKey, mergedItem);
      return;
    }

    if (!existing.note && mergedItem.note) {
      existing.note = mergedItem.note;
    }
    if (!existing.metaText && mergedItem.metaText) {
      existing.metaText = mergedItem.metaText;
    }
    if (!existing.audioUrl && mergedItem.audioUrl) {
      existing.audioUrl = mergedItem.audioUrl;
    }
    if (!existing.downloadName && mergedItem.downloadName) {
      existing.downloadName = mergedItem.downloadName;
    }
  });

  state.items = Array.from(map.values());
  state.updatedAt = Date.now();
}

function buildCapturedPayload(tabId) {
  const state = getTabState(tabId);
  return {
    version: 1,
    source: 'browser-extension',
    pageUrl: state.pageUrl || '',
    title: state.title || '',
    generatedAt: new Date().toISOString(),
    items: state.items
  };
}

function buildNetworkEntry(record) {
  const url = normalizeUrl(record.url);
  if (!url) {
    return null;
  }

  if (/-302(?:16|32|80)\.m4s(?:$|\?)/i.test(url)) {
    return null;
  }

  const mimeType = getHeaderValue(record.responseHeaders, 'content-type').toLowerCase();
  const kind = classifyEntryKind(url, mimeType);
  if (kind === 'unknown') {
    return null;
  }

  const size = getHeaderValue(record.responseHeaders, 'content-length');
  const metaParts = [];
  if (size && Number.isFinite(Number(size))) {
    const mb = Number(size) / (1024 * 1024);
    metaParts.push(mb >= 1 ? `${mb.toFixed(2)} MB` : `${(Number(size) / 1024).toFixed(1)} KB`);
  }

  return {
    url,
    kind,
    label: getDefaultLabel(url),
    note: '来自浏览器网络请求捕获',
    sourceType: 'network',
    mimeType,
    metaText: metaParts.join(' · ')
  };
}

function getSuggestedDownloadName(entry) {
  if (entry.downloadName) {
    return entry.downloadName;
  }

  const extension = getPathExtension(entry.url) || '.mp4';
  return `${sanitizeFileBaseName(entry.label || getDefaultLabel(entry.url))}${extension}`;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });
  return tab || null;
}

function getToolPagePriority(url = '') {
  if (url.startsWith('http://localhost:5173/tools/video-download')) {
    return 0;
  }

  if (url.startsWith('http://127.0.0.1:5173/tools/video-download')) {
    return 1;
  }

  if (url.startsWith('https://tools.131417.net/tools/video-download')) {
    return 2;
  }

  return 99;
}

function waitForTabComplete(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || '读取标签页状态失败。'));
        return;
      }

      if (tab?.status === 'complete') {
        resolve(tab);
        return;
      }

      const handleUpdated = (updatedTabId, changeInfo, updatedTab) => {
        if (updatedTabId !== tabId || changeInfo.status !== 'complete') {
          return;
        }

        chrome.tabs.onUpdated.removeListener(handleUpdated);
        chrome.tabs.onRemoved.removeListener(handleRemoved);
        resolve(updatedTab);
      };

      const handleRemoved = (removedTabId) => {
        if (removedTabId !== tabId) {
          return;
        }

        chrome.tabs.onUpdated.removeListener(handleUpdated);
        chrome.tabs.onRemoved.removeListener(handleRemoved);
        reject(new Error('目标标签页已关闭。'));
      };

      chrome.tabs.onUpdated.addListener(handleUpdated);
      chrome.tabs.onRemoved.addListener(handleRemoved);
    });
  });
}

async function getOrCreateToolPageTab() {
  const tabs = await chrome.tabs.query({
    url: TOOL_PAGE_URLS.map((url) => `${url}*`)
  });

  const sorted = tabs
    .filter((tab) => Number.isInteger(tab.id))
    .sort((left, right) => getToolPagePriority(left.url) - getToolPagePriority(right.url));

  if (sorted.length) {
    const tab = sorted[0];
    await chrome.tabs.update(tab.id, { active: true });
    return waitForTabComplete(tab.id);
  }

  const createdTab = await chrome.tabs.create({
    url: TOOL_PAGE_URLS[2],
    active: true
  });

  if (!createdTab?.id) {
    throw new Error('打开网站工具页失败。');
  }

  return waitForTabComplete(createdTab.id);
}

async function deliverPayloadToToolPage(tabId, payload) {
  const injected = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (nextPayload, mediaSource) => {
      try {
        const storageKey = 'boxtoolsVideoDownloadImport';
        sessionStorage.setItem(storageKey, JSON.stringify(nextPayload));
        window.postMessage(
          {
            source: mediaSource,
            name: 'importCapturedPayload',
            payload: nextPayload
          },
          window.location.origin
        );
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: error?.message || '写入工具页导入数据失败。'
        };
      }
    },
    args: [payload, MEDIA_SOURCE]
  });

  const result = injected?.[0]?.result;
  if (!result?.ok) {
    throw new Error(result?.error || '工具页导入失败。');
  }
}

async function triggerSourcePageDownload(tabId, entry) {
  const injected = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (downloadUrl, filename) => {
      try {
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.target = '_blank';
        if (filename) {
          link.setAttribute('download', filename);
        }
        link.style.display = 'none';
        (document.body || document.documentElement).appendChild(link);
        link.click();
        link.remove();
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: error?.message || '来源页触发下载失败。'
        };
      }
    },
    args: [entry.url, getSuggestedDownloadName(entry)]
  });

  const result = injected?.[0]?.result;
  if (!result?.ok) {
    throw new Error(result?.error || '来源页触发下载失败。');
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  mediaByTab.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (typeof changeInfo.url === 'string') {
    resetTabState(tabId, changeInfo.url, tab?.title || '');
    return;
  }

  if (changeInfo.status === 'complete' && mediaByTab.has(tabId)) {
    const state = getTabState(tabId);
    state.pageUrl = tab?.url || state.pageUrl;
    state.title = tab?.title || state.title;
  }
});

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0) {
      return;
    }

    pendingRequests.set(details.requestId, {
      tabId: details.tabId,
      url: details.url,
      type: details.type,
      initiator: details.initiator || details.documentUrl || ''
    });
  },
  { urls: ['<all_urls>'] }
);

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0) {
      return;
    }

    const record = pendingRequests.get(details.requestId) || {
      tabId: details.tabId,
      url: details.url
    };

    record.responseHeaders = details.responseHeaders || [];
    pendingRequests.set(details.requestId, record);
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.tabId < 0) {
      pendingRequests.delete(details.requestId);
      return;
    }

    const record = pendingRequests.get(details.requestId) || {
      tabId: details.tabId,
      url: details.url
    };

    const entry = buildNetworkEntry(record);
    if (entry) {
      mergeItems(details.tabId, [entry]);
    }

    pendingRequests.delete(details.requestId);
  },
  { urls: ['<all_urls>'] }
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    pendingRequests.delete(details.requestId);
  },
  { urls: ['<all_urls>'] }
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') {
    return false;
  }

  if (message.type === 'merge-entries') {
    const tabId = sender.tab?.id;
    if (Number.isInteger(tabId) && tabId >= 0) {
      mergeItems(tabId, Array.isArray(message.items) ? message.items : [], {
        pageUrl: message.pageUrl || sender.tab?.url || '',
        title: message.title || sender.tab?.title || ''
      });
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'get-active-tab-capture') {
    getActiveTab()
      .then((tab) => {
        if (!tab?.id) {
          sendResponse({ ok: false, error: '未找到当前标签页。' });
          return;
        }

        const state = getTabState(tab.id);
        state.pageUrl = tab.url || state.pageUrl;
        state.title = tab.title || state.title;
        sendResponse({
          ok: true,
          payload: buildCapturedPayload(tab.id)
        });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error?.message || '读取标签页失败。' });
      });
    return true;
  }

  if (message.type === 'clear-active-tab-capture') {
    getActiveTab()
      .then((tab) => {
        if (tab?.id) {
          resetTabState(tab.id, tab.url || '', tab.title || '');
        }
        sendResponse({ ok: true });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error?.message || '清空失败。' });
      });
    return true;
  }

  if (message.type === 'rescan-active-tab') {
    getActiveTab()
      .then((tab) => {
        if (!tab?.id) {
          throw new Error('未找到当前标签页。');
        }

        return chrome.tabs.sendMessage(tab.id, {
          type: 'rescan-page-media'
        });
      })
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error?.message || '触发重扫失败。' });
      });
    return true;
  }

  if (message.type === 'download-entry') {
    const entry = message.entry;
    if (!entry?.url) {
      sendResponse({ ok: false, error: '下载地址缺失。' });
      return false;
    }

    getActiveTab()
      .then(async (tab) => {
        if (!tab?.id) {
          throw new Error('未找到当前标签页。');
        }

        try {
          await triggerSourcePageDownload(tab.id, entry);
          sendResponse({
            ok: true,
            mode: 'source-page'
          });
          return;
        } catch (pageError) {
          chrome.downloads.download({
            url: entry.url,
            filename: getSuggestedDownloadName(entry),
            saveAs: true
          }, (downloadId) => {
            if (chrome.runtime.lastError) {
              sendResponse({
                ok: false,
                error: chrome.runtime.lastError.message || pageError?.message || '下载启动失败。'
              });
              return;
            }

            sendResponse({
              ok: true,
              mode: 'browser-downloads',
              downloadId
            });
          });
        }
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error?.message || '下载启动失败。' });
      });
    return true;
  }

  if (message.type === 'open-tool-page-with-payload') {
    const payload = message.payload;
    if (!payload || typeof payload !== 'object') {
      sendResponse({ ok: false, error: '导入数据为空。' });
      return false;
    }

    getOrCreateToolPageTab()
      .then(async (tab) => {
        if (!tab?.id) {
          throw new Error('打开网站工具页失败。');
        }

        await deliverPayloadToToolPage(tab.id, payload);
        sendResponse({
          ok: true,
          url: tab.url || TOOL_PAGE_URLS[2]
        });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error?.message || '自动导入失败。' });
      });
    return true;
  }

  return false;
});
