const { readRawBody, parseMultipart, MAX_MULTIPART_BYTES } = require('../middleware/bodyParser');
const {
  isLikelyPdf,
  buildUnlockedFileName,
  unlockPdfBuffer
} = require('../services/pdfService');

async function unlockPdfHandler(req, res) {
  let password = '';

  try {
    const rawBody = await readRawBody(req, MAX_MULTIPART_BYTES);
    const { fields, files } = parseMultipart(req, rawBody);
    const pdfFile = files.file;
    password = (fields.password || '').trim();

    if (!pdfFile || !pdfFile.buffer || pdfFile.buffer.length === 0) {
      throw new Error('请先上传 PDF 文件');
    }
    if (!isLikelyPdf(pdfFile.buffer)) {
      throw new Error('仅支持 PDF 文件');
    }
    if (password.length > 256) {
      throw new Error('密码长度不能超过 256');
    }

    const unlockedBuffer = await unlockPdfBuffer(pdfFile.buffer, password);
    const downloadName = buildUnlockedFileName(pdfFile.filename);
    const encodedName = encodeURIComponent(downloadName);

    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${downloadName}"; filename*=UTF-8''${encodedName}`,
      'Cache-Control': 'no-store'
    });
    res.end(unlockedBuffer);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      res.status(500).json({
        ok: false,
        code: 'QPDF_MISSING',
        error: '服务器未安装 qpdf，无法解密。请联系管理员安装 qpdf。'
      });
      return;
    }

    const stderr = (err && err.stderr ? String(err.stderr) : '').toLowerCase();
    const passwordError = stderr.includes('invalid password') || stderr.includes('password is incorrect');

    if (passwordError && !password) {
      res.status(401).json({ ok: false, code: 'NEED_PASSWORD', error: '该 PDF 已加密，请输入密码后继续' });
      return;
    }
    if (passwordError && password) {
      res.status(400).json({ ok: false, code: 'INVALID_PASSWORD', error: '密码错误，请重新输入' });
      return;
    }
    if (stderr.includes('encrypted')) {
      res.status(400).json({ ok: false, code: 'ENCRYPTED_PDF', error: 'PDF 仍受保护，请输入正确密码后再试' });
      return;
    }

    res.status(400).json({ ok: false, code: 'UNLOCK_FAILED', error: err.message || 'PDF 解密失败' });
  }
}

module.exports = {
  unlockPdfHandler
};
