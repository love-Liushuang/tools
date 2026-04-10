(function () {
  const MEDIA_SOURCE = 'boxtools-video-download-extension';
  const QUALITY_LABELS = {
    6: '240P 极速',
    16: '360P 流畅',
    32: '480P 清晰',
    64: '720P 高清',
    74: '720P60 高帧率',
    80: '1080P 高清',
    112: '1080P+ 高码率',
    116: '1080P60 高帧率',
    120: '4K 超清',
    125: 'HDR 真彩色'
  };
  const CODEC_PRIORITY = {
    avc1: 5,
    avc: 5,
    h264: 5,
    h265: 4,
    hevc: 4,
    hev1: 4,
    hvc1: 4,
    vp9: 3,
    vp8: 3,
    av01: 2
  };

  let lastPlayinfoHash = '';

  function postItems(items, title) {
    if (!Array.isArray(items) || !items.length) {
      return;
    }

    window.postMessage({
      source: MEDIA_SOURCE,
      name: 'captureEntries',
      body: {
        pageUrl: location.href,
        title: title || document.title || '',
        items
      }
    }, '*');
  }

  function getBaseTitle() {
    return String(document.title || 'Bilibili 视频')
      .replace(/\s*[-|｜]\s*哔哩哔哩.*$/i, '')
      .trim() || 'Bilibili 视频';
  }

  function normalizeFormatLabel(qualityId, supportFormats) {
    const matched = Array.isArray(supportFormats)
      ? supportFormats.find((item) => item?.quality === qualityId)
      : null;

    if (matched?.new_description) {
      return matched.new_description.trim();
    }

    if (matched?.display_desc) {
      return matched.display_desc.trim();
    }

    return QUALITY_LABELS[qualityId] || `${qualityId}P`;
  }

  function getCodecPriority(videoItem) {
    const codecString = String(videoItem?.codecs || '').toLowerCase();
    const parts = codecString.split(/[.,]/).map((part) => part.trim()).filter(Boolean);
    for (const part of parts) {
      if (CODEC_PRIORITY[part]) {
        return CODEC_PRIORITY[part];
      }
    }
    return 0;
  }

  function getBestAudioUrl(audioList) {
    if (!Array.isArray(audioList) || !audioList.length) {
      return '';
    }

    const preferred = audioList.find((item) => item?.id === 30280)
      || audioList.find((item) => item?.id === 30232)
      || audioList[0];

    return preferred?.baseUrl || preferred?.base_url || '';
  }

  function normalizeDashPayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    if (payload.code === 0 && payload.data?.dash) {
      return payload.data;
    }

    if (payload.dash && typeof payload.dash === 'object') {
      return payload;
    }

    const data = payload.data ?? payload.result;
    const videoInfo = data?.video_info;

    if (payload.code === 0 && videoInfo?.dash) {
      return {
        dash: videoInfo.dash,
        support_formats: videoInfo.support_formats,
        quality: videoInfo.quality,
        timelength: videoInfo.timelength
      };
    }

    return null;
  }

  function normalizeDurlPayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    if (payload.code === 0 && Array.isArray(payload.data?.durl) && payload.data.durl.length) {
      return payload.data;
    }

    const data = payload.data ?? payload.result;
    const videoInfo = data?.video_info;
    if (videoInfo?.durls?.length) {
      return {
        durl: videoInfo.durls,
        quality: videoInfo.quality,
        timelength: videoInfo.timelength,
        support_formats: videoInfo.support_formats
      };
    }

    return null;
  }

  function buildDashItems(dashPayload) {
    const dash = dashPayload?.dash;
    const videos = Array.isArray(dash?.video) ? dash.video : [];
    const audioUrl = getBestAudioUrl(dash?.audio);
    if (!videos.length || !audioUrl) {
      return [];
    }

    const bestVideoByQuality = new Map();
    videos.forEach((video) => {
      const url = video?.baseUrl || video?.base_url;
      if (!url) {
        return;
      }

      const existing = bestVideoByQuality.get(video.id);
      if (!existing || getCodecPriority(video) > getCodecPriority(existing)) {
        bestVideoByQuality.set(video.id, video);
      }
    });

    const baseTitle = getBaseTitle();
    const supportFormats = dashPayload.support_formats;
    const items = Array.from(bestVideoByQuality.values()).map((video) => {
      const qualityLabel = normalizeFormatLabel(video.id, supportFormats);
      const codec = String(video.codecs || '').trim();
      const metaParts = [qualityLabel];
      if (codec) {
        metaParts.push(codec);
      }

      return {
        url: video.baseUrl || video.base_url,
        audioUrl,
        kind: 'dash',
        label: `${baseTitle} · ${qualityLabel}`,
        note: '来自 Bilibili 播放信息（DASH 音视频分离）',
        sourceType: 'bilibili playinfo',
        metaText: metaParts.join(' · '),
        qualityId: video.id,
        qualityLabel,
        downloadName: `${baseTitle}-${qualityLabel}.mp4`
      };
    });

    return items.sort((left, right) => {
      const qualityOrder = [125, 120, 116, 112, 80, 74, 64, 32, 16, 6];
      const leftRank = qualityOrder.indexOf(left.qualityId);
      const rightRank = qualityOrder.indexOf(right.qualityId);
      return (leftRank >= 0 ? leftRank : 999) - (rightRank >= 0 ? rightRank : 999);
    });
  }

  function buildDurlItems(durlPayload) {
    const durlList = Array.isArray(durlPayload?.durl) ? durlPayload.durl : [];
    if (!durlList.length) {
      return [];
    }

    const first = durlList[0];
    const url = first?.url || first?.backup_url?.[0];
    if (!url) {
      return [];
    }

    const qualityLabel = normalizeFormatLabel(durlPayload.quality, durlPayload.support_formats);
    const baseTitle = getBaseTitle();
    return [{
      url,
      kind: 'file',
      label: `${baseTitle} · ${qualityLabel}`,
      note: '来自 Bilibili 直出播放地址',
      sourceType: 'bilibili playurl',
      metaText: qualityLabel,
      qualityLabel,
      downloadName: `${baseTitle}-${qualityLabel}.flv`
    }];
  }

  function handlePayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return;
    }

    const hash = JSON.stringify(payload).slice(0, 4000);
    if (hash && hash === lastPlayinfoHash) {
      return;
    }
    lastPlayinfoHash = hash;

    const dashPayload = normalizeDashPayload(payload);
    if (dashPayload) {
      postItems(buildDashItems(dashPayload), getBaseTitle());
    }

    const durlPayload = normalizeDurlPayload(payload);
    if (durlPayload) {
      postItems(buildDurlItems(durlPayload), getBaseTitle());
    }
  }

  function tryParseText(text) {
    if (typeof text !== 'string' || !text.trim()) {
      return;
    }

    try {
      const payload = JSON.parse(text);
      handlePayload(payload);
    } catch (error) {
      // Ignore non JSON responses.
    }
  }

  function attachPlayinfoHook() {
    let currentValue = window.__playinfo__;
    if (currentValue && typeof currentValue === 'object') {
      handlePayload(currentValue);
    }

    try {
      Object.defineProperty(window, '__playinfo__', {
        configurable: true,
        enumerable: true,
        get() {
          return currentValue;
        },
        set(nextValue) {
          currentValue = nextValue;
          if (nextValue && typeof nextValue === 'object') {
            handlePayload(nextValue);
          }
        }
      });
    } catch (error) {
      // Ignore descriptor failures on hardened pages.
    }

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const nextValue = window.__playinfo__;
      if (nextValue && typeof nextValue === 'object') {
        handlePayload(nextValue);
      }
      if (attempts >= 30) {
        window.clearInterval(timer);
      }
    }, 300);
  }

  function shouldInspectUrl(url) {
    return typeof url === 'string' && (
      url.includes('api.bilibili.com') && (
        url.includes('playurl')
        || url.includes('/x/player/wbi/v2')
        || url.includes('/pgc/player/web/playurl')
      )
    );
  }

  function getResponseText(xhr) {
    if (typeof xhr.responseText === 'string' && xhr.responseText) {
      return xhr.responseText;
    }

    if (typeof xhr.response === 'string' && xhr.response) {
      return xhr.response;
    }

    if (xhr.response instanceof ArrayBuffer) {
      try {
        return new TextDecoder('utf-8').decode(xhr.response);
      } catch (error) {
        return '';
      }
    }

    return '';
  }

  function attachNetworkHooks() {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
      this.__boxtoolsUrl = String(url || '');
      return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function patchedSend(...args) {
      const requestUrl = this.__boxtoolsUrl || '';
      if (shouldInspectUrl(requestUrl)) {
        this.addEventListener('load', () => {
          tryParseText(getResponseText(this));
        });
      }
      return originalSend.apply(this, args);
    };

    const originalFetch = window.fetch;
    window.fetch = async function patchedFetch(input, init) {
      const requestUrl = typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : String(input || '');

      const response = await originalFetch.call(this, input, init);
      if (shouldInspectUrl(requestUrl)) {
        response.clone().text().then((text) => {
          tryParseText(text);
        }).catch(() => {});
      }
      return response;
    };
  }

  attachPlayinfoHook();
  attachNetworkHooks();
})();
