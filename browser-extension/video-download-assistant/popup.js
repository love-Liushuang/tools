const messageNode = document.getElementById('message');
const pageTitleNode = document.getElementById('pageTitle');
const entryCountNode = document.getElementById('entryCount');
const entryListNode = document.getElementById('entryList');
const emptyStateNode = document.getElementById('emptyState');
const refreshButton = document.getElementById('refreshButton');
const openToolButton = document.getElementById('openToolButton');
const copyPayloadButton = document.getElementById('copyPayloadButton');
const clearButton = document.getElementById('clearButton');

let currentPayload = null;

function setMessage(text) {
  messageNode.textContent = text || '';
}

function getEntryKindLabel(kind) {
  if (kind === 'dash') {
    return 'DASH';
  }

  if (kind === 'hls') {
    return 'HLS';
  }

  if (kind === 'file') {
    return '直链';
  }

  return '候选';
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    return false;
  }
}

function createEntryCard(entry) {
  const card = document.createElement('div');
  card.className = 'entry-card';

  const head = document.createElement('div');
  head.className = 'entry-head';

  const titleBlock = document.createElement('div');
  const title = document.createElement('h3');
  title.textContent = entry.label || '未命名候选';
  titleBlock.appendChild(title);

  const tag = document.createElement('span');
  tag.className = `entry-tag is-${entry.kind}`;
  tag.textContent = getEntryKindLabel(entry.kind);

  head.appendChild(titleBlock);
  head.appendChild(tag);
  card.appendChild(head);

  const url = document.createElement('p');
  url.className = 'entry-url';
  url.textContent = entry.url;
  card.appendChild(url);

  if (entry.metaText) {
    const meta = document.createElement('p');
    meta.className = 'entry-meta';
    meta.textContent = entry.metaText;
    card.appendChild(meta);
  }

  if (entry.note) {
    const note = document.createElement('p');
    note.className = 'entry-note';
    note.textContent = entry.note;
    card.appendChild(note);
  }

  const actions = document.createElement('div');
  actions.className = 'entry-actions';

  if (entry.kind !== 'dash') {
    const downloadButton = document.createElement('button');
    downloadButton.type = 'button';
    downloadButton.textContent = '尝试下载';
    downloadButton.addEventListener('click', async () => {
      const response = await chrome.runtime.sendMessage({
        type: 'download-entry',
        entry
      });
      if (!response?.ok) {
        setMessage(response?.error || '下载启动失败。');
        return;
      }

      setMessage(
        response.mode === 'source-page'
          ? '已优先按来源页上下文触发下载；若未弹出下载，可再复制链接或用网站工具页继续处理。'
          : '已触发浏览器下载。'
      );
    });
    actions.appendChild(downloadButton);
  }

  const copyUrlButton = document.createElement('button');
  copyUrlButton.type = 'button';
  copyUrlButton.className = 'ghost-button';
  copyUrlButton.textContent = '复制视频链接';
  copyUrlButton.addEventListener('click', async () => {
    const ok = await copyText(entry.url);
    setMessage(ok ? '视频链接已复制。' : '复制失败，请手动复制。');
  });
  actions.appendChild(copyUrlButton);

  if (entry.audioUrl) {
    const copyAudioButton = document.createElement('button');
    copyAudioButton.type = 'button';
    copyAudioButton.className = 'ghost-button';
    copyAudioButton.textContent = '复制音频链接';
    copyAudioButton.addEventListener('click', async () => {
      const ok = await copyText(entry.audioUrl);
      setMessage(ok ? '音频链接已复制。' : '复制失败，请手动复制。');
    });
    actions.appendChild(copyAudioButton);
  }

  card.appendChild(actions);
  return card;
}

function renderPayload(payload) {
  currentPayload = payload;
  const entries = Array.isArray(payload?.items) ? payload.items : [];
  pageTitleNode.textContent = payload?.title || payload?.pageUrl || '当前标签页';
  entryCountNode.textContent = String(entries.length);
  entryListNode.innerHTML = '';
  emptyStateNode.hidden = entries.length > 0;

  entries.forEach((entry) => {
    entryListNode.appendChild(createEntryCard(entry));
  });
}

async function loadPayload() {
  const response = await chrome.runtime.sendMessage({
    type: 'get-active-tab-capture'
  });

  if (!response?.ok) {
    setMessage(response?.error || '读取当前标签页失败。');
    renderPayload({ items: [] });
    return;
  }

  renderPayload(response.payload);
}

refreshButton.addEventListener('click', async () => {
  setMessage('正在刷新当前标签页的候选地址...');
  const rescanResponse = await chrome.runtime.sendMessage({
    type: 'rescan-active-tab'
  });

  if (!rescanResponse?.ok) {
    setMessage(rescanResponse?.error || '重扫失败。');
  }

  await loadPayload();
  setMessage('已刷新当前标签页的候选地址。');
});

openToolButton.addEventListener('click', async () => {
  const payload = currentPayload || { version: 1, source: 'browser-extension', items: [] };
  const response = await chrome.runtime.sendMessage({
    type: 'open-tool-page-with-payload',
    payload
  });

  setMessage(
    response?.ok
      ? '已打开网站工具页，并自动带入当前捕获结果。'
      : response?.error || '打开网站工具页失败。'
  );
});

copyPayloadButton.addEventListener('click', async () => {
  const text = JSON.stringify(currentPayload || { version: 1, source: 'browser-extension', items: [] }, null, 2);
  const ok = await copyText(text);
  setMessage(ok ? '导出 JSON 已复制，可直接粘贴到网站的视频下载工具。' : '复制失败，请手动复制。');
});

clearButton.addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({
    type: 'clear-active-tab-capture'
  });

  if (!response?.ok) {
    setMessage(response?.error || '清空失败。');
    return;
  }

  await loadPayload();
  setMessage('当前标签页结果已清空。');
});

loadPayload().catch((error) => {
  setMessage(error?.message || '初始化失败。');
});
