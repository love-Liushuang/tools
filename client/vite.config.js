import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const MULTI_THREAD_TOOL_PATH = '/tools/video-to-gif';
const ADSENSE_BLOCK_RE = /\s*<!-- adsense:start -->[\s\S]*?<!-- adsense:end -->/gi;

function shouldIsolateVideoTool(reqUrl = '') {
  const pathname = reqUrl.split('?')[0];
  return pathname === MULTI_THREAD_TOOL_PATH || pathname === `${MULTI_THREAD_TOOL_PATH}/`;
}

function setIsolationHeaders(res) {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
}

function isolateVideoToolPlugin() {
  const attachHeaders = (req, res, next) => {
    if (shouldIsolateVideoTool(req.url || '')) {
      setIsolationHeaders(res);
    }
    next();
  };

  return {
    name: 'isolate-video-to-gif',
    configureServer(server) {
      server.middlewares.use(attachHeaders);
    },
    configurePreviewServer(server) {
      server.middlewares.use(attachHeaders);
    }
  };
}

function skipAdsenseInDevPlugin() {
  return {
    name: 'skip-adsense-in-dev',
    transformIndexHtml(html, context) {
      if (!context.server) {
        return html;
      }

      return html.replace(ADSENSE_BLOCK_RE, '');
    }
  };
}

function copyPdfjsCMapsPlugin() {
  const sourceDir = path.resolve(__dirname, 'node_modules', 'pdfjs-dist', 'cmaps');

  return {
    name: 'copy-pdfjs-cmaps',
    closeBundle() {
      if (!fs.existsSync(sourceDir)) {
        return;
      }

      const targetDir = path.resolve(__dirname, 'dist', 'pdfjs', 'cmaps');
      fs.mkdirSync(targetDir, { recursive: true });
      fs.cpSync(sourceDir, targetDir, { recursive: true });
    }
  };
}

export default defineConfig({
  plugins: [react(), skipAdsenseInDevPlugin(), isolateVideoToolPlugin(), copyPdfjsCMapsPlugin()],
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg']
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});
