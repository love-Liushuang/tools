(function () {
  const MEDIA_SOURCE = 'boxtools-video-download-extension';
  const TOOL_BRIDGE_SOURCE = 'boxtools-video-download-page';
  const TOOL_BRIDGE_RESPONSE_SOURCE = 'boxtools-video-download-extension-bridge';
  const MEDIA_PATTERN = /https?:\/\/[^\s"'<>\\]+?\.(?:m3u8|m3u|mp4|webm|mov|m4v|m4s|mkv|avi|flv|ts|3gp)(?:\?[^\s"'<>\\]*)?/ig;
  const RELATIVE_MEDIA_PATTERN = /(?:\/|\.\.\/|\.\/)[^\s"'<>\\]+?\.(?:m3u8|m3u|mp4|webm|mov|m4v|m4s|mkv|avi|flv|ts|3gp)(?:\?[^\s"'<>\\]*)?/ig;

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

  function classifyKind(url, audioUrl = '') {
    if (audioUrl) {
      return 'dash';
    }

    if (/\.m3u8(?:$|\?)/i.test(url) || /\.m3u(?:$|\?)/i.test(url)) {
      return 'hls';
    }

    if (/\.(mp4|webm|mov|m4v|m4s|mkv|avi|flv|ts|3gp)(?:$|\?)/i.test(url)) {
      return 'file';
    }

    return 'unknown';
  }

  function pushEntry(map, rawUrl, sourceType, note, patch = {}) {
    const url = normalizeUrl(rawUrl, location.href);
    const audioUrl = normalizeUrl(patch.audioUrl, location.href);
    const kind = patch.kind || classifyKind(url, audioUrl);

    if (!url || kind === 'unknown') {
      return;
    }

    if (!audioUrl && /-302(?:16|32|80)\.m4s(?:$|\?)/i.test(url)) {
      return;
    }

    const key = `${kind}|${url}|${audioUrl || ''}`;
    if (map.has(key)) {
      return;
    }

    map.set(key, {
      url,
      audioUrl,
      kind,
      label: patch.label || '',
      note,
      sourceType,
      metaText: patch.metaText || '',
      downloadName: patch.downloadName || '',
      qualityLabel: patch.qualityLabel || ''
    });
  }

  function collectScriptMatches(map, text, sourceType, note) {
    if (typeof text !== 'string' || !text.trim()) {
      return;
    }

    MEDIA_PATTERN.lastIndex = 0;
    RELATIVE_MEDIA_PATTERN.lastIndex = 0;

    let match = MEDIA_PATTERN.exec(text);
    while (match) {
      pushEntry(map, match[0], sourceType, note);
      match = MEDIA_PATTERN.exec(text);
    }

    match = RELATIVE_MEDIA_PATTERN.exec(text);
    while (match) {
      pushEntry(map, match[0], sourceType, note);
      match = RELATIVE_MEDIA_PATTERN.exec(text);
    }
  }

  function collectPageEntries() {
    const map = new Map();

    document.querySelectorAll('video').forEach((node) => {
      pushEntry(map, node.currentSrc || node.src, 'video tag', '来自页面 <video>');
      Array.from(node.querySelectorAll('source[src]')).forEach((sourceNode) => {
        pushEntry(map, sourceNode.src || sourceNode.getAttribute('src'), 'source tag', '来自页面 <source>');
      });
    });

    document.querySelectorAll('source[src]').forEach((node) => {
      pushEntry(map, node.src || node.getAttribute('src'), 'source tag', '来自页面 <source>');
    });

    document.querySelectorAll('meta[property="og:video"], meta[property="og:video:url"], meta[property="og:video:secure_url"], meta[name="twitter:player:stream"], meta[itemprop="contentUrl"]').forEach((node) => {
      pushEntry(map, node.getAttribute('content'), 'meta tag', '来自页面元数据');
    });

    document.querySelectorAll('a[href]').forEach((node) => {
      pushEntry(map, node.href || node.getAttribute('href'), 'anchor tag', '来自页面链接');
    });

    if (window.performance && performance.getEntriesByType) {
      performance.getEntriesByType('resource').forEach((entry) => {
        pushEntry(map, entry.name, 'performance resource', '来自资源时间线');
      });
    }

    Array.from(document.scripts).forEach((node) => {
      collectScriptMatches(map, node.textContent || '', 'script', '来自脚本文本');
    });

    return Array.from(map.values());
  }

  async function sendEntries(items) {
    if (!items.length) {
      return;
    }

    try {
      await chrome.runtime.sendMessage({
        type: 'merge-entries',
        pageUrl: location.href,
        title: document.title || '',
        items
      });
    } catch (error) {
      // Ignore extension runtime disconnects during dev reload.
    }
  }

  function respondToToolBridge(requestId, body) {
    if (!requestId) {
      return;
    }

    window.postMessage(
      {
        source: TOOL_BRIDGE_RESPONSE_SOURCE,
        requestId,
        ...body
      },
      location.origin
    );
  }

  function relayRuntimeMessage(message, requestId) {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          respondToToolBridge(requestId, {
            ok: false,
            error: chrome.runtime.lastError.message || '插件通信失败。'
          });
          return;
        }

        respondToToolBridge(requestId, response || {
          ok: false,
          error: '插件未返回结果。'
        });
      });
    } catch (error) {
      respondToToolBridge(requestId, {
        ok: false,
        error: error?.message || '插件通信失败。'
      });
    }
  }

  async function collectAndSend() {
    await sendEntries(collectPageEntries());
  }

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (event.source !== window || !data || data.source !== MEDIA_SOURCE || data.name !== 'captureEntries') {
      if (event.source !== window || !data || data.source !== TOOL_BRIDGE_SOURCE) {
        return;
      }

      const requestId = data.requestId;

      if (data.name === 'detect-extension') {
        respondToToolBridge(requestId, { ok: true });
        return;
      }

      if (data.name === 'get-latest-capture') {
        relayRuntimeMessage({ type: 'get-latest-capture' }, requestId);
        return;
      }

      if (data.name === 'rescan-latest-capture') {
        relayRuntimeMessage({ type: 'rescan-latest-capture' }, requestId);
        return;
      }

      if (data.name === 'download-entry-for-tab') {
        relayRuntimeMessage({
          type: 'download-entry-for-tab',
          tabId: data.payload?.tabId,
          entry: data.payload?.entry
        }, requestId);
      }

      return;
    }

    sendEntries(Array.isArray(data.body?.items) ? data.body.items : []);
  });

  document.addEventListener('play', () => {
    collectAndSend();
  }, true);

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'rescan-page-media') {
      return false;
    }

    collectAndSend()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || '页面重扫失败。' }));
    return true;
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      collectAndSend();
      window.setTimeout(collectAndSend, 1200);
    }, { once: true });
  } else {
    collectAndSend();
    window.setTimeout(collectAndSend, 1200);
  }
})();
