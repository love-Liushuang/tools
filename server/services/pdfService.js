const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

function execFileAsync(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function isLikelyPdf(buffer) {
  return buffer && buffer.length > 4 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

function buildUnlockedFileName(filename) {
  const fallback = 'unlocked.pdf';
  if (!filename) {
    return fallback;
  }
  const base = path.basename(filename).replace(/[/\\?%*:|"<>]/g, '_');
  const withoutExt = base.replace(/\.pdf$/i, '');
  const normalized = (withoutExt || 'document').slice(0, 60);
  return `${normalized}-unlocked.pdf`;
}

async function removeDirSafe(dirPath) {
  if (!dirPath) {
    return;
  }

  const fsp = fs.promises;
  try {
    if (typeof fsp.rm === 'function') {
      await fsp.rm(dirPath, { recursive: true, force: true });
      return;
    }
    if (typeof fsp.rmdir === 'function') {
      await fsp.rmdir(dirPath, { recursive: true });
    }
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return;
    }
    throw err;
  }
}

async function unlockPdfBuffer(pdfBuffer, password) {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), '131417tools-'));
  const inputPath = path.join(tmpDir, 'input.pdf');
  const outputPath = path.join(tmpDir, 'output.pdf');

  try {
    await fs.promises.writeFile(inputPath, pdfBuffer);
    const args = [`--password=${password || ''}`, '--decrypt', inputPath, outputPath];
    await execFileAsync('qpdf', args);
    return await fs.promises.readFile(outputPath);
  } finally {
    await removeDirSafe(tmpDir);
  }
}

module.exports = {
  isLikelyPdf,
  buildUnlockedFileName,
  unlockPdfBuffer
};
