function sleepToYield() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

export function prettyBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function isPdfFile(file) {
  if (!file) {
    return false;
  }
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
}

export function createInvoiceQueueItems(fileList, createExtra) {
  const seed = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const getExtra = typeof createExtra === 'function' ? createExtra : () => ({});

  return Array.from(fileList || []).map((file, index) => ({
    id: `${seed}-${index}`,
    file,
    status: 'pending',
    invoiceData: null,
    error: '',
    ...getExtra(file, index)
  }));
}

export function createInvoiceArchiveName(prefix = '发票处理文件') {
  return createInvoiceTimestampedName(prefix, 'zip');
}

export function createInvoiceTimestampedName(prefix = '发票处理文件', extension = 'zip') {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '_',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join('');
  const ext = String(extension || '').replace(/^\.+/, '');
  return `${prefix}_${stamp}${ext ? `.${ext}` : ''}`;
}

export async function parseInvoiceFileQueue(queue, options = {}) {
  const {
    onEngineLoading,
    onItemStart,
    onItemSuccess,
    onItemError,
    forceReparse = false
  } = options;

  onEngineLoading?.();
  const { extractInvoiceFromPdf } = await import('./invoicePdfParser');
  const results = [];
  let successTotal = 0;
  let failureTotal = 0;
  const total = queue.length;

  for (let index = 0; index < total; index += 1) {
    const current = queue[index];
    let invoiceData = forceReparse ? null : current.invoiceData;

    onItemStart?.({ current, index, total });

    try {
      if (!invoiceData) {
        invoiceData = await extractInvoiceFromPdf(current.file);
      }

      const parsedItem = {
        ...current,
        invoiceData
      };

      successTotal += 1;
      results.push(parsedItem);
      onItemSuccess?.({ current: parsedItem, index, total });
    } catch (error) {
      failureTotal += 1;
      onItemError?.({
        current: {
          ...current,
          invoiceData: invoiceData || null
        },
        index,
        total,
        error
      });
    }

    await sleepToYield();
  }

  return {
    results,
    successTotal,
    failureTotal
  };
}

export function triggerObjectUrlDownload(downloadUrl, downloadName) {
  if (!downloadUrl) {
    return;
  }

  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = downloadName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
