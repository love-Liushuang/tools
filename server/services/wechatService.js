const fetch = require('node-fetch');
const { URL } = require('url');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const pLimit = require('p-limit').default;

const REQUEST_TIMEOUT_MS = 15000;
const CACHE_TTL = 1000 * 60 * 10;

// 🚀 并发控制
const limit = pLimit(3); // 同时最多3个任务
const PUPPETEER_LIMIT = pLimit(2); // puppeteer最多2个

const DEFAULT_HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36',
    Referer: 'https://mp.weixin.qq.com/'
};

// 缓存
const cache = new Map();

function buildUrl (value) {
    if (!value) throw new Error('请输入链接');

    let url = value.trim();
    if (!url.startsWith('http')) url = 'https://' + url;

    const u = new URL(url);

    if (!u.hostname.endsWith('mp.weixin.qq.com')) {
        throw new Error('仅支持公众号文章');
    }

    return u.toString();
}

async function fetchHTML (url) {
    const res = await fetch(url, { headers: DEFAULT_HEADERS });
    if (!res.ok) throw new Error('请求失败');
    return res.text();
}

function parseHTML (html) {
    const $ = cheerio.load(html);

    return {
        cover:
            $('meta[property="og:image"]').attr('content') ||
            $('meta[name="twitter:image"]').attr('content'),

        title:
            $('meta[property="og:title"]').attr('content') ||
            '',

        author: $('#js_name').text().trim()
    };
}
function parseSquareCover(html) {
  if (!html) return null;
  // 匹配 cdn_url_1_1 分享出来的正方形图
  const match = html.match(/cdn_url_1_1:\s*JsDecode\(['"]([^'"]+)['"]\)/);
  return match ? match[1] : null;
}
// 🚀 Puppeteer池（限流）
async function runPuppeteer (url) {
    return PUPPETEER_LIMIT(async () => {
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox']
        });
        try {
            const page = await browser.newPage();
            await page.goto(url, { waitUntil: 'networkidle2' });
            return await page.evaluate(() => {
                const html = document.documentElement.innerHTML;
                const squareMatch = html.match(/cdn_url_1_1:\s*JsDecode\(['"]([^'"]+)['"]\)/);
                return {
                    cover: document.querySelector('meta[property="og:image"]')?.content,
                    title: document.querySelector('meta[property="og:title"]')?.content,
                    author: document.querySelector('#js_name')?.innerText,
                    squareCover: squareMatch ? squareMatch[1] : null
                };
            });
        } finally {
            await browser.close();
        }
    });
}

// 🚀 主函数（带限流）
async function fetchWechatCover (targetUrl) {
    return limit(async () => {
        const url = buildUrl(targetUrl);

        // ✅ 缓存
        const cached = cache.get(url);
        if (cached && Date.now() - cached.time < CACHE_TTL) {
            return cached.data;
        }

        let result;

        try {
            const html = await fetchHTML(url);
            // 原有解析
            result = parseHTML(html);
            // ⭐ 新增：正方形图
            const squareCover = parseSquareCover(html);
            result.squareCover = squareCover;
            if (!result.cover) throw new Error('cheerio失败');
        } catch {
            result = await runPuppeteer(url);
            if (!result.cover) throw new Error('解析失败');
        }

        const data = {
            ok: true,
            url,
            cover: result.cover,
            title: result.title || '',
            author: result.author || '',
            squareCover: result.squareCover || ''
        };

        cache.set(url, { time: Date.now(), data });

        return data;
    });
}

module.exports = { fetchWechatCover };