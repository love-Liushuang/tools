const fetch = require('node-fetch');

const REQUEST_TIMEOUT_MS = Number(process.env.HOT_REQUEST_TIMEOUT_MS || 10000);
const MAX_HISTORY = Number(process.env.HOT_HISTORY_SIZE || 12);

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9'
};

const PLATFORM_CONFIG = {
  weibo: {
    label: '微博热搜',
    ttl: 2 * 60 * 1000
  },
  zhihu: {
    label: '知乎热榜',
    ttl: 5 * 60 * 1000
  },
  douyin: {
    label: '抖音热点',
    ttl: 5 * 60 * 1000
  },
  baidu: {
    label: '百度热搜',
    ttl: 3 * 60 * 1000
  },
  bilibili: {
    label: 'B站热门',
    ttl: 5 * 60 * 1000
  }
};

const cache = new Map();
const inflight = new Map();
const history = new Map();

function formatError(err) {
  if (!err) {
    return '';
  }
  if (typeof err === 'string') {
    return err;
  }
  return err.message || '未知错误';
}

function parseHotText(text) {
  const value = String(text || '').trim();
  if (!value) {
    return null;
  }
  const match = value.match(/([\d.]+)/);
  if (!match) {
    return null;
  }
  const num = Number(match[1]);
  if (!Number.isFinite(num)) {
    return null;
  }
  if (value.includes('亿')) {
    return Math.round(num * 100000000);
  }
  if (value.includes('万')) {
    return Math.round(num * 10000);
  }
  return Math.round(num);
}

function normalizeHot(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return null;
  }
  return num;
}

function buildItemKey(platform, title, url) {
  const base = `${platform}:${String(title || url || '').trim().toLowerCase()}`;
  if (!base.trim()) {
    return `${platform}:${Math.random().toString(36).slice(2, 10)}`;
  }
  const hash = Buffer.from(base).toString('base64').replace(/=+$/g, '').slice(0, 14);
  return `${platform}:${hash}`;
}

function makeItem(platform, payload) {
  const key = buildItemKey(platform, payload.title, payload.url);
  return {
    id: key.replace(':', '-'),
    key,
    platform,
    platformLabel: PLATFORM_CONFIG[platform].label,
    title: payload.title || '',
    url: payload.url || '',
    summary: payload.summary || '',
    hot: normalizeHot(payload.hot),
    rank: Number.isFinite(payload.rank) ? payload.rank : null,
    cover: payload.cover || '',
    tag: payload.tag || ''
  };
}

function uniqueByKey(items) {
  const map = new Map();
  items.forEach((item) => {
    if (!item || !item.key) {
      return;
    }
    if (!map.has(item.key)) {
      map.set(item.key, item);
    }
  });
  return Array.from(map.values());
}

function uniqueByTitle(items) {
  const map = new Map();
  items.forEach((item) => {
    if (!item || !item.title) {
      return;
    }
    const key = String(item.title).trim().toLowerCase();
    if (!key) {
      return;
    }
    if (!map.has(key)) {
      map.set(key, item);
    }
  });
  return Array.from(map.values());
}

function toTrendScore(item) {
  if (Number.isFinite(item.hot)) {
    return item.hot;
  }
  if (Number.isFinite(item.rank)) {
    return Math.max(1, 200 - item.rank);
  }
  return 0;
}

function updateHistory(platform, items) {
  if (!history.has(platform)) {
    history.set(platform, new Map());
  }
  const map = history.get(platform);
  const now = Date.now();
  items.forEach((item) => {
    const list = map.get(item.key) || [];
    list.push({ ts: now, score: toTrendScore(item) });
    while (list.length > MAX_HISTORY) {
      list.shift();
    }
    map.set(item.key, list);
  });
}

function attachTrend(platform, items) {
  const map = history.get(platform);
  if (!map) {
    return items;
  }
  return items.map((item) => {
    const list = map.get(item.key) || [];
    return { ...item, trend: list.map((entry) => entry.score) };
  });
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url, options = {}) {
  const res = await fetchWithTimeout(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`请求失败 ${res.status}: ${text.slice(0, 120)}`);
  }
  return res.json();
}

async function fetchText(url, options = {}) {
  const res = await fetchWithTimeout(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`请求失败 ${res.status}: ${text.slice(0, 120)}`);
  }
  return res.text();
}

async function fetchWeibo() {
  const json = await fetchJson('https://weibo.com/ajax/side/hotSearch', {
    headers: {
      ...DEFAULT_HEADERS,
      Referer: 'https://weibo.com/'
    }
  });
  const list = (json.data && json.data.realtime) || [];
  return list
    .filter((item) => item && item.word)
    .map((item, index) =>
      makeItem('weibo', {
        title: item.note || item.word,
        url: `https://s.weibo.com/weibo?q=${encodeURIComponent(item.word)}`,
        hot: item.num,
        rank: Number.isFinite(item.realpos) ? item.realpos : index + 1,
        tag: item.label_name || item.icon_desc || ''
      })
    );
}

function normalizeZhihuUrl(target) {
  if (!target) {
    return '';
  }
  if (target.type === 'question' && target.id) {
    return `https://www.zhihu.com/question/${target.id}`;
  }
  if (target.type === 'article' && target.id) {
    return `https://zhuanlan.zhihu.com/p/${target.id}`;
  }
  return target.url || '';
}

async function fetchZhihu() {
  const json = await fetchJson('https://api.zhihu.com/topstory/hot-list?limit=50', {
    headers: {
      ...DEFAULT_HEADERS,
      Referer: 'https://www.zhihu.com/hot'
    }
  });
  const list = json.data || [];
  return list
    .filter((item) => item && item.target)
    .map((item, index) =>
      makeItem('zhihu', {
        title: item.target.title,
        url: normalizeZhihuUrl(item.target),
        summary: item.target.excerpt || item.target.detail_text || '',
        hot: parseHotText(item.detail_text),
        rank: index + 1,
        tag: item.trend || ''
      })
    );
}

async function fetchDouyin() {
  const json = await fetchJson('https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/', {
    headers: {
      ...DEFAULT_HEADERS,
      Referer: 'https://www.douyin.com/hot'
    }
  });
  const list = json.word_list || [];
  return list
    .filter((item) => item && item.word)
    .map((item, index) =>
      makeItem('douyin', {
        title: item.word,
        url: `https://www.douyin.com/search/${encodeURIComponent(item.word)}`,
        hot: item.hot_value,
        rank: Number.isFinite(item.position) ? item.position : index + 1,
        tag: item.label || ''
      })
    );
}

function extractBaiduData(html) {
  const match = html.match(/<!--s-data:([\s\S]*?)-->/);
  if (!match || !match[1]) {
    throw new Error('百度热搜数据解析失败');
  }
  return JSON.parse(match[1]);
}

async function fetchBaidu() {
  const html = await fetchText('https://top.baidu.com/board?platform=pc&tab=realtime', {
    headers: {
      ...DEFAULT_HEADERS,
      Referer: 'https://top.baidu.com/'
    }
  });
  const data = extractBaiduData(html);
  const cards = (data.data && data.data.cards) || [];
  const hotCard = cards.find((card) => card.component === 'hotList');
  const list = (hotCard && hotCard.content) || [];
  return list
    .filter((item) => item && (item.word || item.query))
    .map((item, index) =>
      makeItem('baidu', {
        title: item.word || item.query,
        url: item.url || item.rawUrl || '',
        summary: item.desc || '',
        hot: parseHotText(item.hotScore),
        rank: Number.isFinite(item.index) ? item.index + 1 : index + 1,
        cover: item.img || ''
      })
    );
}

async function fetchBilibili() {
  const json = await fetchJson('https://api.bilibili.com/x/web-interface/popular?ps=50&pn=1', {
    headers: {
      ...DEFAULT_HEADERS,
      Referer: 'https://www.bilibili.com/'
    }
  });
  const list = (json.data && json.data.list) || [];
  return list
    .filter((item) => item && item.title)
    .map((item, index) =>
      makeItem('bilibili', {
        title: item.title,
        url: item.short_link_v2 || item.short_link || (item.bvid ? `https://www.bilibili.com/video/${item.bvid}` : ''),
        summary: item.desc || '',
        hot: item.stat && item.stat.view ? item.stat.view : null,
        rank: index + 1,
        cover: item.pic || ''
      })
    );
}

const FETCHERS = {
  weibo: fetchWeibo,
  zhihu: fetchZhihu,
  douyin: fetchDouyin,
  baidu: fetchBaidu,
  bilibili: fetchBilibili
};

function isExpired(entry, ttl) {
  if (!entry || !entry.updatedAt) {
    return true;
  }
  return Date.now() - entry.updatedAt > ttl;
}

async function getPlatformData(platform, force) {
  const config = PLATFORM_CONFIG[platform];
  if (!config) {
    throw new Error(`未知平台: ${platform}`);
  }

  const cached = cache.get(platform);
  if (!force && cached && !isExpired(cached, config.ttl)) {
    return cached;
  }

  if (inflight.has(platform)) {
    return inflight.get(platform);
  }

  const task = (async () => {
    try {
      const items = await FETCHERS[platform]();
      updateHistory(platform, items);
      const next = {
        ok: true,
        platform,
        label: config.label,
        updatedAt: Date.now(),
        items: attachTrend(platform, items),
        error: ''
      };
      cache.set(platform, next);
      return next;
    } catch (err) {
      const fallback = cached
        ? { ...cached, ok: false, error: formatError(err) }
        : {
            ok: false,
            platform,
            label: config.label,
            updatedAt: Date.now(),
            items: [],
            error: formatError(err)
          };
      cache.set(platform, fallback);
      return fallback;
    } finally {
      inflight.delete(platform);
    }
  })();

  inflight.set(platform, task);
  return task;
}

function normalizePlatforms(input) {
  if (!input || input === 'all') {
    return Object.keys(PLATFORM_CONFIG);
  }
  if (Array.isArray(input)) {
    return input.filter((key) => PLATFORM_CONFIG[key]);
  }
  return String(input)
    .split(',')
    .map((item) => item.trim())
    .filter((item) => PLATFORM_CONFIG[item]);
}

async function getHotData(options = {}) {
  const force = Boolean(options.force);
  const platformKeys = normalizePlatforms(options.platform);
  const resultList = await Promise.all(platformKeys.map((key) => getPlatformData(key, force)));

  const platforms = {};
  let items = [];
  resultList.forEach((entry) => {
    platforms[entry.platform] = {
      ok: entry.ok,
      label: entry.label,
      updatedAt: entry.updatedAt,
      error: entry.error,
      count: entry.items.length
    };
    items = items.concat(entry.items);
  });

  const deduped = uniqueByTitle(uniqueByKey(items));

  return {
    platforms,
    items: deduped,
    generatedAt: Date.now()
  };
}

module.exports = {
  getHotData,
  PLATFORM_CONFIG
};
