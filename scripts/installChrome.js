const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const cacheDir = path.join(projectRoot, '.cache', 'puppeteer');
const cli = path.join(projectRoot, 'node_modules', 'puppeteer', 'lib', 'cjs', 'puppeteer', 'node', 'cli.js');

const result = spawnSync(process.execPath, [cli, 'browsers', 'install', 'chrome'], {
  stdio: 'inherit',
  cwd: projectRoot,
  env: {
    ...process.env,
    PUPPETEER_CACHE_DIR: cacheDir
  }
});

if (result.error) {
  console.error(result.error.message || 'Chrome 安装失败');
  process.exit(1);
}

process.exit(result.status || 0);
