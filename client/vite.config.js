import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const MULTI_THREAD_TOOL_PATH = '/tools/video-to-gif';

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

export default defineConfig({
  plugins: [react(), isolateVideoToolPlugin()],
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
