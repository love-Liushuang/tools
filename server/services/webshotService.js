const fs = require('fs');
const dns = require('dns').promises;
const path = require('path');

const DEFAULT_BROWSER_CACHE_DIR = path.resolve(__dirname, '..', '..', '.cache', 'puppeteer');
if (!process.env.PUPPETEER_CACHE_DIR) {
  process.env.PUPPETEER_CACHE_DIR = DEFAULT_BROWSER_CACHE_DIR;
}

const puppeteer = require('puppeteer');
const { Browser, install } = require('@puppeteer/browsers');
const { PUPPETEER_REVISIONS } = require('puppeteer-core/lib/cjs/puppeteer/revisions.js');
const sharp = require('sharp');

const DEFAULT_VIEWPORT = {
  width: 1366,
  height: 768,
  deviceScaleFactor: 2
};

const DEFAULT_TIMEOUT_MS = Number(process.env.WEBSHOT_TIMEOUT_MS || 30000);
const DEFAULT_WAIT_MS = Number(process.env.WEBSHOT_WAIT_MS || 1000);
const MAX_WAIT_MS = 10000;
const MAX_SCALE = 3;
const MAX_WIDTH = 2560;
const MAX_HEIGHT = 1440;
const MAX_OUTPUT_HEIGHT = Number(process.env.WEBSHOT_MAX_HEIGHT || 60000);
const SCROLL_DELAY_MS = Number(process.env.WEBSHOT_SCROLL_DELAY_MS || 350);
const SCROLL_STEP_RATIO = 0.9;

const UA_STRING =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const CHROME_BUILD_ID = PUPPETEER_REVISIONS.chrome;

let browserPromise;
let browserInstallPromise;

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUrl(input) {
  if (!input) {
    throw new Error('请输入有效的网页地址');
  }
  let url;
  try {
    url = new URL(input.trim());
  } catch (err) {
    throw new Error('网址格式不正确，请以 http/https 开头');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('仅支持 http/https 协议');
  }
  return url;
}

function isPrivateIpv4(address) {
  const parts = address.split('.').map((item) => Number(item));
  if (parts.length !== 4 || parts.some((num) => Number.isNaN(num))) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateIpv6(address) {
  const lower = address.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('fe80')) return true;
  return false;
}

async function assertPublicHost(url) {
  const hostname = url.hostname;
  const lowered = hostname.toLowerCase();
  if (lowered === 'localhost') {
    throw new Error('不允许访问本地地址');
  }
  const isIpv4 = /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
  if (isIpv4 && isPrivateIpv4(hostname)) {
    throw new Error('不允许访问内网地址');
  }
  const isIpv6 = hostname.includes(':');
  if (isIpv6 && isPrivateIpv6(hostname)) {
    throw new Error('不允许访问内网地址');
  }
  if (!isIpv4 && !isIpv6) {
    const records = await dns.lookup(hostname, { all: true });
    for (const record of records) {
      if (record.family === 4 && isPrivateIpv4(record.address)) {
        throw new Error('不允许访问内网地址');
      }
      if (record.family === 6 && isPrivateIpv6(record.address)) {
        throw new Error('不允许访问内网地址');
      }
    }
  }
}

function getBrowserCacheDir() {
  return path.resolve(process.env.PUPPETEER_CACHE_DIR || DEFAULT_BROWSER_CACHE_DIR);
}

function getConfiguredBrowserPath() {
  const candidate =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    process.env.CHROME_PATH ||
    process.env.GOOGLE_CHROME_BIN;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : '';
}

function createBrowserSetupError(message, cause) {
  const details = cause && cause.message ? ` 原始错误：${cause.message}` : '';
  return new Error(
    `${message}。请先在项目根目录执行 \`npm run install:chrome\` 下载 Chrome，当前缓存目录为 ${getBrowserCacheDir()}。` +
      '如果服务器已经安装了系统 Chrome，也可以设置环境变量 PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable。' +
      details
  );
}

function getBundledExecutablePath() {
  try {
    return puppeteer.executablePath();
  } catch {
    return '';
  }
}

async function installBundledBrowser() {
  const cacheDir = getBrowserCacheDir();
  fs.mkdirSync(cacheDir, { recursive: true });

  try {
    const installed = await install({
      browser: Browser.CHROME,
      buildId: CHROME_BUILD_ID,
      cacheDir
    });
    return installed.executablePath;
  } catch (err) {
    throw createBrowserSetupError(`自动下载 Chrome ${CHROME_BUILD_ID} 失败`, err);
  }
}

async function resolveBrowserExecutablePath() {
  const configuredPath = getConfiguredBrowserPath();
  if (configuredPath) {
    if (!fs.existsSync(configuredPath)) {
      throw createBrowserSetupError(`配置的 Chrome 路径不存在：${configuredPath}`);
    }
    return configuredPath;
  }

  const bundledPath = getBundledExecutablePath();
  if (bundledPath && fs.existsSync(bundledPath)) {
    return bundledPath;
  }

  if (process.env.WEBSHOT_AUTO_INSTALL_BROWSER === '0') {
    throw createBrowserSetupError(`未找到 Puppeteer 需要的 Chrome ${CHROME_BUILD_ID}`);
  }

  if (!browserInstallPromise) {
    browserInstallPromise = installBundledBrowser().finally(() => {
      browserInstallPromise = null;
    });
  }

  return browserInstallPromise;
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      const executablePath = await resolveBrowserExecutablePath();
      return puppeteer.launch({
        executablePath,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    })().catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

async function preparePage(page) {
  await page.addStyleTag({
    content: [
      '* { scroll-behavior: auto !important; animation: none !important; transition: none !important; }',
      '* { scroll-snap-type: none !important; scroll-snap-align: none !important; }',
      'html, body { overflow: auto !important; }'
    ].join('\n')
  });

  await page.evaluate(() => {
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

    document.documentElement.style.overflow = 'auto';
    document.body.style.overflow = 'auto';

    document.querySelectorAll('img[loading="lazy"]').forEach((img) => {
      img.setAttribute('loading', 'eager');
    });

    document.querySelectorAll('video[preload="none"]').forEach((video) => {
      video.setAttribute('preload', 'auto');
    });

    const elements = Array.from(document.querySelectorAll('*'));
    elements.forEach((el) => {
      const style = window.getComputedStyle(el);
      if (style.position !== 'fixed' && style.position !== 'sticky') {
        return;
      }

      if (style.display === 'none' || style.visibility === 'hidden') {
        return;
      }

      const opacity = Number.parseFloat(style.opacity || '1');
      if (Number.isFinite(opacity) && opacity === 0) {
        return;
      }

      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) {
        return;
      }

      const fillsViewport = rect.width >= viewportWidth * 0.9 && rect.height >= viewportHeight * 0.85;
      const isScrollableContainer = el.scrollHeight > el.clientHeight + 120;

      if (fillsViewport && isScrollableContainer) {
        return;
      }

      el.setAttribute('data-webshot-overlay', 'true');
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('visibility', 'hidden', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
    });
  });
}

async function getCaptureViewport(page, target, viewportHeight) {
  if (!target) {
    return { top: 0, visibleHeight: viewportHeight };
  }

  return page.evaluate(
    (el, fallbackHeight) => {
      const root = document.scrollingElement || document.documentElement || document.body;
      if (el === root || el === document.documentElement || el === document.body) {
        return {
          top: 0,
          visibleHeight: Math.min(window.innerHeight || fallbackHeight, fallbackHeight)
        };
      }

      const viewportHeight = window.innerHeight || fallbackHeight;
      const rect = el.getBoundingClientRect();
      const top = Math.max(0, Math.min(viewportHeight, rect.top));
      const bottom = Math.max(top, Math.min(viewportHeight, rect.bottom));
      return {
        top,
        visibleHeight: Math.max(1, Math.min(bottom - top, el.clientHeight || fallbackHeight, fallbackHeight))
      };
    },
    target,
    viewportHeight
  );
}

async function captureViewportSlice(page, viewport, captureTop, offsetDelta, clipHeight) {
  const buffer = await page.screenshot({
    type: 'png',
    captureBeyondViewport: false
  });
  const meta = await sharp(buffer).metadata();
  const width = meta.width || Math.round(viewport.width * viewport.deviceScaleFactor);
  const height = meta.height || Math.round(viewport.height * viewport.deviceScaleFactor);
  const cropTop = Math.max(
    0,
    Math.round((captureTop + Math.max(0, offsetDelta)) * viewport.deviceScaleFactor)
  );
  const safeTop = Math.min(cropTop, Math.max(0, height - 1));
  const safeHeight = Math.max(
    1,
    Math.min(Math.round(clipHeight * viewport.deviceScaleFactor), height - safeTop)
  );

  if (safeTop === 0 && safeHeight === height) {
    return buffer;
  }

  return sharp(buffer)
    .extract({
      left: 0,
      top: safeTop,
      width,
      height: safeHeight
    })
    .png()
    .toBuffer();
}

async function resolveScrollTarget(page) {
  const handle = await page.evaluateHandle(() => {
    const root = document.scrollingElement || document.documentElement || document.body;
    if (root && root.scrollHeight > root.clientHeight + 120) {
      return root;
    }
    const candidates = [];
    const nodes = Array.from(document.querySelectorAll('*'));
    nodes.forEach((el) => {
      const style = window.getComputedStyle(el);
      if (!['auto', 'scroll'].includes(style.overflowY)) {
        return;
      }
      if (el.scrollHeight <= el.clientHeight + 120) {
        return;
      }
      candidates.push(el);
    });
    let best = candidates[0] || document.body;
    let bestHeight = best ? best.scrollHeight : 0;
    candidates.forEach((el) => {
      if (el.scrollHeight > bestHeight) {
        best = el;
        bestHeight = el.scrollHeight;
      }
    });
    return best || document.body;
  });
  const element = handle.asElement();
  if (!element) {
    await handle.dispose();
    return null;
  }
  return element;
}

async function getScrollMetrics(page, target, viewportHeight) {
  if (!target) {
    return page.evaluate((fallbackHeight) => {
      const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight || fallbackHeight;
      const clientHeight = window.innerHeight || document.documentElement.clientHeight || fallbackHeight;
      return { scrollHeight, clientHeight, scrollTop: window.pageYOffset || 0 };
    }, viewportHeight);
  }
  return page.evaluate(
    (el, fallbackHeight) => {
      const scrollHeight = el.scrollHeight || document.documentElement.scrollHeight || document.body.scrollHeight || fallbackHeight;
      const clientHeight = el.clientHeight || window.innerHeight || fallbackHeight;
      const scrollTop = el.scrollTop || window.pageYOffset || 0;
      return { scrollHeight, clientHeight, scrollTop };
    },
    target,
    viewportHeight
  );
}

async function scrollToOffset(page, target, offset) {
  if (!target) {
    return page.evaluate((y) => {
      window.scrollTo(0, y);
      return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    }, offset);
  }
  return page.evaluate(
    (el, y) => {
      el.scrollTop = y;
      if (el === document.scrollingElement || el === document.documentElement || el === document.body) {
        window.scrollTo(0, y);
      }
      return el.scrollTop || window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    },
    target,
    offset
  );
}

async function ensureScrollableTarget(page, target, viewportHeight) {
  const metrics = await getScrollMetrics(page, target, viewportHeight);
  if (metrics.scrollHeight <= metrics.clientHeight + 4) {
    return null;
  }
  const testOffset = Math.min(metrics.clientHeight, metrics.scrollHeight - metrics.clientHeight);
  if (testOffset <= 0) {
    return null;
  }
  const actual = await scrollToOffset(page, target, testOffset);
  await sleep(150);
  await scrollToOffset(page, target, 0);
  if (actual < Math.max(2, testOffset - 2)) {
    return null;
  }
  return target;
}

async function warmupScroll(page, viewportHeight, target) {
  let lastHeight = 0;
  for (let round = 0; round < 3; round += 1) {
    const metrics = await getScrollMetrics(page, target, viewportHeight);
    const scrollHeight = metrics.scrollHeight;
    const clientHeight = metrics.clientHeight || viewportHeight;
    if (scrollHeight === lastHeight) {
      break;
    }
    lastHeight = scrollHeight;
    const step = Math.max(200, Math.floor(clientHeight * SCROLL_STEP_RATIO));
    for (let offset = 0; offset < scrollHeight; offset += step) {
      await scrollToOffset(page, target, offset);
      await sleep(SCROLL_DELAY_MS);
    }
    await sleep(300);
  }
  await scrollToOffset(page, target, 0);
  await sleep(200);
  const finalMetrics = await getScrollMetrics(page, target, viewportHeight);
  return lastHeight || finalMetrics.scrollHeight;
}

async function captureFullPagePng(page, viewport, waitMs) {
  await preparePage(page);
  if (waitMs > 0) {
    await sleep(waitMs);
  }

  let scrollTarget = await resolveScrollTarget(page);
  if (scrollTarget) {
    const verified = await ensureScrollableTarget(page, scrollTarget, viewport.height);
    if (!verified) {
      await scrollTarget.dispose();
      scrollTarget = null;
    } else {
      scrollTarget = verified;
    }
  }
  try {
    const totalHeight = await warmupScroll(page, viewport.height, scrollTarget);
    const metrics = await getScrollMetrics(page, scrollTarget, viewport.height);
    const captureViewport = await getCaptureViewport(page, scrollTarget, viewport.height);
    const visibleHeight = Math.max(
      1,
      Math.min(captureViewport.visibleHeight || metrics.clientHeight || viewport.height, viewport.height)
    );
    const pixelHeight = Math.ceil(totalHeight * viewport.deviceScaleFactor);
    if (pixelHeight > MAX_OUTPUT_HEIGHT) {
      throw new Error('页面过长，建议选择 PDF 或降低清晰度倍率');
    }

    const slices = [];
    let offset = 0;
    while (offset < totalHeight) {
      const clipHeight = Math.min(visibleHeight, totalHeight - offset);
      const actualOffset = await scrollToOffset(page, scrollTarget, offset);
      await sleep(SCROLL_DELAY_MS);
      const currentViewport = await getCaptureViewport(page, scrollTarget, viewport.height);
      const buffer = await captureViewportSlice(
        page,
        viewport,
        currentViewport.top || 0,
        offset - actualOffset,
        clipHeight
      );
      slices.push(buffer);
      offset += clipHeight;
    }

    const metaList = await Promise.all(slices.map((buffer) => sharp(buffer).metadata()));
    const outputWidth = Math.max(...metaList.map((meta) => meta.width || 0));
    const outputHeight = metaList.reduce((sum, meta) => sum + (meta.height || 0), 0);

    let currentTop = 0;
    const composites = slices.map((buffer, index) => {
      const height = metaList[index].height || 0;
      const entry = { input: buffer, top: currentTop, left: 0 };
      currentTop += height;
      return entry;
    });

    return sharp({
      create: {
        width: outputWidth,
        height: outputHeight,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
      .composite(composites)
      .png()
      .toBuffer();
  } finally {
    if (scrollTarget) {
      await scrollTarget.dispose();
    }
  }
}

async function captureWebshot(options) {
  const safeUrl = normalizeUrl(options.url);
  await assertPublicHost(safeUrl);

  const width = Math.round(clampNumber(options.width, 320, MAX_WIDTH, DEFAULT_VIEWPORT.width));
  const height = Math.round(clampNumber(options.height, 480, MAX_HEIGHT, DEFAULT_VIEWPORT.height));
  const scale = clampNumber(options.scale, 1, MAX_SCALE, DEFAULT_VIEWPORT.deviceScaleFactor);
  const waitMs = clampNumber(options.waitMs, 0, MAX_WAIT_MS, DEFAULT_WAIT_MS);
  const format = options.format === 'pdf' ? 'pdf' : 'png';
  const fullPage = options.fullPage !== false;
  const deviceMode = options.deviceMode === 'mobile' ? 'mobile' : options.deviceMode === 'desktop' ? 'desktop' : 'auto';
  const isMobile = deviceMode === 'mobile' ? true : deviceMode === 'desktop' ? false : Boolean(options.mobile) || width <= 500;
  const navigationTimeout = Math.max(DEFAULT_TIMEOUT_MS, 60000);

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setUserAgent(isMobile ? MOBILE_UA : UA_STRING);
    const viewport = { width, height, deviceScaleFactor: scale, isMobile, hasTouch: isMobile };
    await page.setViewport(viewport);
    await page.setBypassCSP(true);
    await page.emulateMediaType('screen');
    page.setDefaultNavigationTimeout(navigationTimeout);

    await page.goto(safeUrl.toString(), {
      waitUntil: 'domcontentloaded',
      timeout: navigationTimeout
    });
    await page.waitForNetworkIdle({
      idleTime: 1000,
      timeout: Math.min(navigationTimeout, 10000)
    }).catch(() => {});

    if (format === 'pdf') {
      const buffer = await page.pdf({
        printBackground: true,
        preferCSSPageSize: true
      });
      return {
        buffer,
        contentType: 'application/pdf',
        ext: 'pdf',
        filename: `webshot-${Date.now()}.pdf`
      };
    }

    const buffer = fullPage ? await captureFullPagePng(page, viewport, waitMs) : await page.screenshot({ type: 'png' });

    return {
      buffer,
      contentType: 'image/png',
      ext: 'png',
      filename: `webshot-${Date.now()}.png`
    };
  } finally {
    await page.close();
  }
}

module.exports = {
  captureWebshot
};
