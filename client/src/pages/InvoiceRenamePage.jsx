import { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import ToolPageShell from '../components/ToolPageShell';
import { useToast } from '../components/ToastProvider';
import {
  buildRenamedFileName,
  buildRulePreview,
  DEFAULT_SEPARATOR,
  ensureUniqueFileName,
  formatExtractedFieldList,
  INVOICE_RULE_FIELDS,
  DEFAULT_INVOICE_TYPE,
  createDefaultRuleProfile
} from '../lib/invoicePdf';
import InvoiceRuleSettingsModal from '../components/InvoiceRuleSettingsModal';
import './InvoiceRenamePage.css';

const DEFAULT_RULE_FIELDS = ['invoiceNumber', 'issueDate', 'buyerName', 'sellerName', 'totalAmount'];
const STATUS_LABEL_MAP = {
  pending: '待重命名',
  processing: '处理中',
  success: '已完成',
  error: '失败'
};

function prettyBytes(bytes) {
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

function sleepToYield() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function isPdfFile(file) {
  if (!file) {
    return false;
  }
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
}

function createQueueItems(fileList) {
  const seed = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return Array.from(fileList || []).map((file, index) => ({
    id: `${seed}-${index}`,
    file,
    status: 'pending',
    renamedName: '',
    invoiceData: null,
    error: ''
  }));
}

function createArchiveName() {
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
  return `发票重命名文件_${stamp}.zip`;
}

function StepItem({ active, done, index, label }) {
  return (
    <div className={active ? 'invoice-step is-active' : done ? 'invoice-step is-done' : 'invoice-step'}>
      <span className="invoice-step-index">{index}</span>
      <strong>{label}</strong>
    </div>
  );
}

function InvoiceRenamePage() {
  const inputRef = useRef(null);
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [ruleFields, setRuleFields] = useState(DEFAULT_RULE_FIELDS);
  const [showRuleSettings, setShowRuleSettings] = useState(false);
  const [activeProfile, setActiveProfile] = useState(null);
  const [separator, setSeparator] = useState(DEFAULT_SEPARATOR);
  const [isDragging, setIsDragging] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [downloadName, setDownloadName] = useState('');
  const [downloadCount, setDownloadCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);

  useEffect(() => {
    if (!downloadUrl) {
      return undefined;
    }
    return () => {
      URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  const totalSize = useMemo(
    () => items.reduce((sum, item) => sum + item.file.size, 0),
    [items]
  );
  const successCount = items.filter((item) => item.status === 'success').length;
  const itemErrorCount = items.filter((item) => item.status === 'error').length;
  const activeStep = downloadUrl || isRenaming ? 3 : items.length ? 2 : 1;
  const previewName = useMemo(() => {
    if (activeProfile) return buildRulePreview(activeProfile.invoiceTypeKey, activeProfile);
    return buildRulePreview(ruleFields, separator);
  }, [activeProfile, ruleFields, separator]);

  useEffect(() => {
    setActiveProfile(createDefaultRuleProfile(DEFAULT_INVOICE_TYPE));
  }, []);

  const resetDownloadState = () => {
    setDownloadUrl('');
    setDownloadName('');
    setDownloadCount(0);
    setFailedCount(0);
  };

  const patchItem = (id, patch) => {
    setItems((prev) =>
      prev.map((item) => (
        item.id === id
          ? { ...item, ...patch }
          : item
      ))
    );
  };

  const handleAddFiles = (fileList) => {
    if (isRenaming) {
      return;
    }

    const files = Array.from(fileList || []);
    const pdfFiles = files.filter(isPdfFile);

    if (!pdfFiles.length) {
      setError('请上传 PDF 电子发票文件。');
      return;
    }

    const nextItems = createQueueItems(pdfFiles);
    setItems((prev) => [...prev, ...nextItems]);
    resetDownloadState();
    setError('');

    const skippedCount = files.length - pdfFiles.length;
    if (skippedCount > 0) {
      setStatusText(`已添加 ${pdfFiles.length} 个 PDF，已忽略 ${skippedCount} 个非 PDF 文件。`);
    } else {
      setStatusText(`已添加 ${pdfFiles.length} 个 PDF 发票文件。`);
    }
  };

  const handleRemove = (id) => {
    if (isRenaming) {
      return;
    }

    setItems((prev) => prev.filter((item) => item.id !== id));
    resetDownloadState();
  };

  const handleClear = () => {
    if (isRenaming) {
      return;
    }

    setItems([]);
    setError('');
    setStatusText('');
    resetDownloadState();
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  // ruleFields kept as a lightweight fallback; primary config stored in `activeProfile` via modal

  const handleRename = async () => {
    if (!items.length) {
      setError('请先上传至少一个 PDF 发票文件。');
      return;
    }

    if (!ruleFields.length) {
      setError('请至少保留一个重命名字段。');
      return;
    }

    setIsRenaming(true);
    setError('');
    resetDownloadState();
    setStatusText(`开始解析，共 ${items.length} 个文件。`);
    setItems((prev) => prev.map((item) => ({
      ...item,
      status: 'pending',
      renamedName: '',
      error: ''
    })));

    const queue = items.map((item) => ({
      id: item.id,
      file: item.file,
      invoiceData: item.invoiceData
    }));
    const zip = new JSZip();
    const usedNames = new Set();
    let successTotal = 0;
    let failureTotal = 0;

    try {
      setStatusText('正在加载 PDF 解析引擎...');
      const { extractInvoiceFromPdf } = await import('../lib/invoicePdfParser');

      for (let index = 0; index < queue.length; index += 1) {
        const current = queue[index];
        let invoiceData = current.invoiceData;

        patchItem(current.id, {
          status: 'processing',
          renamedName: '',
          error: ''
        });
        setStatusText(`正在解析 ${index + 1}/${queue.length}: ${current.file.name}`);

          try {
          if (!invoiceData) {
            invoiceData = await extractInvoiceFromPdf(current.file);
          }

          const profileToUse = activeProfile || {
            invoiceTypeKey: DEFAULT_INVOICE_TYPE,
            separator,
            showSequence: false,
            showFieldLabel: false,
            items: (ruleFields || DEFAULT_RULE_FIELDS).map((key) => ({ key, enabled: true, dateMode: 'year-month-day', customText: '' }))
          };

          const renamedName = ensureUniqueFileName(
            buildRenamedFileName(current.file.name, invoiceData, profileToUse, index + 1),
            usedNames
          );

          zip.file(renamedName, current.file);
          successTotal += 1;
          patchItem(current.id, {
            status: 'success',
            renamedName,
            invoiceData,
            error: ''
          });
        } catch (renameError) {
          failureTotal += 1;
          patchItem(current.id, {
            status: 'error',
            renamedName: '',
            invoiceData: invoiceData || null,
            error: renameError.message || '解析失败'
          });
        }

        await sleepToYield();
      }

      if (successTotal === 0) {
        setFailedCount(failureTotal);
        setError('没有生成可下载的重命名结果，请检查失败原因后重试。');
        setStatusText('');
        return;
      }

      setStatusText(`正在打包 ${successTotal} 个重命名文件...`);
      const archiveBlob = await zip.generateAsync(
        {
          type: 'blob',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 }
        },
        (metadata) => {
          const progress = Math.round(metadata.percent);
          setStatusText(`正在打包 ${successTotal} 个重命名文件... ${progress}%`);
        }
      );

      const nextDownloadUrl = URL.createObjectURL(archiveBlob);
      setDownloadUrl(nextDownloadUrl);
      setDownloadName(createArchiveName());
      setDownloadCount(successTotal);
      setFailedCount(failureTotal);
      setStatusText(
        failureTotal > 0
          ? `处理完成：成功 ${successTotal} 个，失败 ${failureTotal} 个。`
          : `处理完成：共重命名 ${successTotal} 个发票文件。`
      );
      toast.success(`重命名完成，可下载 ${successTotal} 个发票文件。`);
    } catch (runtimeError) {
      setError(runtimeError.message || '重命名失败，请稍后重试。');
      setStatusText('');
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDownload = () => {
    if (!downloadUrl) {
      return;
    }
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = downloadName || createArchiveName();
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <ToolPageShell
      title="PDF 电子发票批量重命名"
      desc="本地完成 PDF 发票解析、批量重命名和 ZIP 打包下载，不上传服务器。"
    >
      <div className="invoice-tool">
        <section className="invoice-hero">
          <div>
            <span className="invoice-badge">本地处理</span>
            <h2>批量上传 PDF 发票，按字段一键重命名</h2>
            <p>
              支持按开票日期、开票金额、发票号码、销售方名称自由组合命名规则，
              生成后的文件会在浏览器内直接打包下载。
            </p>
            <ul className="invoice-points">
              <li>发票文件仅在本地。</li>
              <li>适合标准可提取文本的 PDF 电子发票，扫描件和加密 PDF 可能无法识别。</li>
            </ul>
          </div>
          <div className="invoice-summary-grid">
            <div className="invoice-summary-card">
              <span>已添加文件</span>
              <strong>{items.length}</strong>
            </div>
            <div className="invoice-summary-card">
              <span>文件总大小</span>
              <strong>{prettyBytes(totalSize)}</strong>
            </div>
            <div className="invoice-summary-card">
              <span>成功重命名</span>
              <strong>{successCount}</strong>
            </div>
            <div className="invoice-summary-card">
              <span>识别失败</span>
              <strong>{itemErrorCount}</strong>
            </div>
          </div>
        </section>

        <section className="invoice-steps" aria-label="处理步骤">
          <StepItem index="1" label="上传 PDF 发票" active={activeStep === 1} done={activeStep > 1} />
          <StepItem index="2" label="设置命名方式" active={activeStep === 2} done={activeStep > 2} />
          <StepItem index="3" label="下载重命名发票" active={activeStep === 3} done={Boolean(downloadUrl)} />
        </section>

        <div className="invoice-grid">
          <section className="invoice-panel">
            <div className="invoice-panel-head">
              <div>
                <h3>1. 上传 PDF 发票</h3>
                <p>支持点击选择或拖拽批量上传，文件始终保留在本地浏览器处理。</p>
              </div>
              <div className="invoice-panel-actions">
                <button
                  className="invoice-btn invoice-btn-secondary"
                  type="button"
                  disabled={isRenaming}
                  onClick={() => inputRef.current?.click()}
                >
                  添加文件
                </button>
                <button
                  className="invoice-btn invoice-btn-ghost"
                  type="button"
                  disabled={isRenaming || !items.length}
                  onClick={handleClear}
                >
                  清空列表
                </button>
              </div>
            </div>

            <input
              ref={inputRef}
              className="invoice-hidden-input"
              type="file"
              accept="application/pdf,.pdf"
              multiple
              onChange={(event) => {
                handleAddFiles(event.target.files);
                event.target.value = '';
              }}
            />

            <button
              className={isDragging ? 'invoice-dropzone is-dragging' : 'invoice-dropzone'}
              type="button"
              disabled={isRenaming}
              onClick={() => inputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                if (!isRenaming) {
                  setIsDragging(true);
                }
              }}
              onDragOver={(event) => {
                event.preventDefault();
                if (!isRenaming) {
                  setIsDragging(true);
                }
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                if (event.currentTarget.contains(event.relatedTarget)) {
                  return;
                }
                setIsDragging(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                handleAddFiles(event.dataTransfer.files);
              }}
            >
              <span className="invoice-dropzone-icon">PDF</span>
              <strong>点击或拖拽选择 PDF 发票文件</strong>
              <p>支持多选和多次添加，推荐上传原始电子发票 PDF。</p>
            </button>
          </section>

          <section className="invoice-panel">
            <div className="invoice-panel-head">
              <div>
                <h3>2. 设置重命名规则</h3>
                <p>命名规则请在弹窗中配置，页面仅展示命名预览。</p>
              </div>
              <div className="invoice-panel-actions">
                <button
                  className="invoice-btn invoice-btn-ghost"
                  type="button"
                  disabled={isRenaming}
                  onClick={() => {
                    setShowRuleSettings(true);
                  }}
                >
                  高级设置
                </button>
              </div>
            </div>

            <div className="invoice-preview-box">
              <span>命名预览</span>
              <strong>{previewName}</strong>
            </div>
          </section>
        </div>

        <section className="invoice-panel">
          <div className="invoice-action-bar">
            <div>
              <h3>3. 开始重命名</h3>
              <p>点击后会在浏览器中逐个解析发票字段，并生成本地 ZIP 下载包。</p>
            </div>
            <div className="invoice-action-buttons">
              <button
                className="invoice-btn invoice-btn-primary"
                type="button"
                disabled={isRenaming || !items.length}
                onClick={handleRename}
              >
                {isRenaming ? '处理中...' : `开始重命名（共 ${items.length} 张）`}
              </button>
              <button
                className="invoice-btn invoice-btn-secondary"
                type="button"
                disabled={!downloadUrl}
                onClick={handleDownload}
              >
                下载重命名发票
              </button>
            </div>
          </div>

          {statusText ? <p className="status-text">{statusText}</p> : null}
          {error ? <p className="error">{error}</p> : null}

          {downloadUrl ? (
            <div className="invoice-result-card">
              <div>
                <span className="invoice-result-badge">完成</span>
                <h4>重命名发票文件已准备好</h4>
                <p>
                  本次成功重命名 {downloadCount} 张发票
                  {failedCount > 0 ? `，另有 ${failedCount} 张识别失败` : ''}。
                </p>
              </div>
              <button className="invoice-btn invoice-btn-primary" type="button" onClick={handleDownload}>
                下载 ZIP 文件
              </button>
            </div>
          ) : null}
        </section>

        <section className="invoice-panel">
          <div className="invoice-panel-head">
            <div>
              <h3>发票列表</h3>
              <p>识别完成后会展示提取到的字段与最终文件名，失败项会给出原因。</p>
            </div>
          </div>

          {!items.length ? (
            <div className="invoice-empty">还没有添加发票文件，先上传 PDF 后再开始重命名。</div>
          ) : (
            <div className="invoice-file-list">
              {items.map((item, index) => {
                const extractedFields = formatExtractedFieldList(item.invoiceData);
                const statusClass = item.status === 'error'
                  ? 'invoice-status-badge is-error'
                  : item.status === 'success'
                    ? 'invoice-status-badge is-success'
                    : item.status === 'processing'
                      ? 'invoice-status-badge is-processing'
                      : 'invoice-status-badge';

                return (
                  <article className="invoice-file-card" key={item.id}>
                    <div className="invoice-file-card-head">
                      <div>
                        <span className="invoice-file-index">#{index + 1}</span>
                        <h4 title={item.file.name}>{item.file.name}</h4>
                      </div>
                      <div className="invoice-file-card-actions">
                        <span className={statusClass}>{STATUS_LABEL_MAP[item.status]}</span>
                        <button
                          className="invoice-mini-btn is-danger"
                          type="button"
                          disabled={isRenaming}
                          onClick={() => handleRemove(item.id)}
                        >
                          删除
                        </button>
                      </div>
                    </div>

                    <div className="invoice-file-meta">
                      <span>{prettyBytes(item.file.size)}</span>
                      <span>{item.file.type || 'PDF 文件'}</span>
                    </div>

                    {extractedFields.length ? (
                      <div className="invoice-field-chips">
                        {extractedFields.map((field) => (
                          <span className="invoice-field-chip" key={`${item.id}-${field.key}`}>
                            {field.label}：{field.value}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="invoice-muted">尚未解析字段，点击“开始重命名”后生成。</p>
                    )}

                    {item.renamedName ? (
                      <p className="invoice-renamed-name">新文件名：{item.renamedName}</p>
                    ) : null}
                    {item.error ? <p className="error invoice-item-error">{item.error}</p> : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
      {showRuleSettings && (
        <InvoiceRuleSettingsModal
          invoiceTypeKey={activeProfile?.invoiceTypeKey || DEFAULT_INVOICE_TYPE}
          initialProfile={activeProfile}
          onSave={(normalized) => {
            setActiveProfile(normalized);
            setSeparator(normalized.separator ?? DEFAULT_SEPARATOR);
            setShowRuleSettings(false);
          }}
          onCancel={() => setShowRuleSettings(false)}
        />
      )}
    </ToolPageShell>
  );
}

export default InvoiceRenamePage;
