const TOOL_BRIDGE_SOURCE = 'boxtools-video-download-page';
const TOOL_BRIDGE_RESPONSE_SOURCE = 'boxtools-video-download-extension-bridge';

export function requestVideoDownloadExtension(name, payload = {}, timeoutMs = 1500) {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('当前环境不支持插件通信。'));
  }

  return new Promise((resolve, reject) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let settled = false;

    const cleanup = () => {
      window.removeEventListener('message', handleMessage);
      window.clearTimeout(timer);
    };

    const finish = (callback, value) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      callback(value);
    };

    const handleMessage = (event) => {
      if (event.source !== window) {
        return;
      }

      const data = event.data;
      if (data?.source !== TOOL_BRIDGE_RESPONSE_SOURCE || data?.requestId !== requestId) {
        return;
      }

      if (data.ok) {
        finish(resolve, data);
        return;
      }

      finish(reject, new Error(data.error || '插件返回失败。'));
    };

    const timer = window.setTimeout(() => {
      finish(reject, new Error('未检测到视频下载插件，请先加载本地扩展后再试。'));
    }, timeoutMs);

    window.addEventListener('message', handleMessage);
    window.postMessage(
      {
        source: TOOL_BRIDGE_SOURCE,
        requestId,
        name,
        payload
      },
      window.location.origin
    );
  });
}
