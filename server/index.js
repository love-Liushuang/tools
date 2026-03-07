const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { handleTextLetter } = require('./services/codecService');
const { unlockPdfHandler } = require('./handlers/unlockPdfHandler');

const app = express();
const PORT = process.env.PORT || 3000;
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60 * 1000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 60);
const apiRateBuckets = new Map();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function isRateLimited(req) {
  const now = Date.now();
  const ip = getClientIp(req);
  const item = apiRateBuckets.get(ip);

  if (!item || now - item.start >= RATE_LIMIT_WINDOW_MS) {
    apiRateBuckets.set(ip, { start: now, count: 1 });
    return false;
  }

  item.count += 1;
  return item.count > RATE_LIMIT_MAX;
}

function sweepRateBuckets() {
  const now = Date.now();
  for (const [ip, item] of apiRateBuckets.entries()) {
    if (now - item.start >= RATE_LIMIT_WINDOW_MS) {
      apiRateBuckets.delete(ip);
    }
  }
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'toolbox-api', time: new Date().toISOString() });
});

app.post('/api/tools/text-stats', (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text : '';
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  const chars = text.length;
  const lines = text ? text.split(/\r?\n/).length : 0;

  res.json({ words, chars, lines });
});

app.post('/api/text-letter', async (req, res) => {
  sweepRateBuckets();
  if (isRateLimited(req)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ ok: false, error: '请求过于频繁，请稍后再试' });
  }

  try {
    const result = await handleTextLetter(req.body);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || '请求失败' });
  }
});

app.post('/api/unlock-pdf', async (req, res) => {
  sweepRateBuckets();
  if (isRateLimited(req)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ ok: false, error: '请求过于频繁，请稍后再试' });
  }
  await unlockPdfHandler(req, res);
});

const distPath = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));

  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
