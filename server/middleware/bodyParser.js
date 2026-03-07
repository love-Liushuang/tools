const MAX_JSON_BODY_BYTES = 2 * 1024 * 1024;
const MAX_MULTIPART_BYTES = 30 * 1024 * 1024;

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > MAX_JSON_BODY_BYTES) {
        reject(new Error('请求体过大'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

function readRawBody(req, maxBytes = MAX_MULTIPART_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('上传文件过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks, total));
    });

    req.on('error', reject);
  });
}

function parseMultipart(req, bodyBuffer) {
  const contentType = req.headers['content-type'];
  if (!contentType || !contentType.includes('multipart/form-data')) {
    throw new Error('请求类型必须是 multipart/form-data');
  }

  const match = contentType.match(/boundary=([^;]+)/i);
  if (!match || !match[1]) {
    throw new Error('缺少 multipart boundary');
  }

  const boundary = match[1].trim().replace(/^"|"$/g, '');
  const raw = bodyBuffer.toString('latin1');
  const parts = raw.split(`--${boundary}`);
  const fields = {};
  const files = {};

  for (let part of parts) {
    if (!part || part === '--\r\n' || part === '--') {
      continue;
    }

    if (part.startsWith('\r\n')) {
      part = part.slice(2);
    }
    if (part.endsWith('\r\n')) {
      part = part.slice(0, -2);
    }
    if (part.endsWith('--')) {
      part = part.slice(0, -2);
    }

    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd < 0) {
      continue;
    }

    const headerText = part.slice(0, headerEnd);
    let contentText = part.slice(headerEnd + 4);
    if (contentText.endsWith('\r\n')) {
      contentText = contentText.slice(0, -2);
    }

    const dispositionMatch = headerText.match(/content-disposition:\s*form-data;([^\r\n]+)/i);
    if (!dispositionMatch) {
      continue;
    }

    const disposition = dispositionMatch[1];
    const nameMatch = disposition.match(/name="([^"]+)"/i);
    if (!nameMatch) {
      continue;
    }
    const fieldName = nameMatch[1];
    const filenameMatch = disposition.match(/filename="([^"]*)"/i);
    const contentTypeMatch = headerText.match(/content-type:\s*([^\r\n]+)/i);

    if (filenameMatch && filenameMatch[1] !== '') {
      files[fieldName] = {
        filename: filenameMatch[1],
        contentType: contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream',
        buffer: Buffer.from(contentText, 'latin1')
      };
    } else {
      fields[fieldName] = Buffer.from(contentText, 'latin1').toString('utf8');
    }
  }

  return { fields, files };
}

module.exports = {
  MAX_MULTIPART_BYTES,
  readJsonBody,
  readRawBody,
  parseMultipart
};
