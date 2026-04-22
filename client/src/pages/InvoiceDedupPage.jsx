import { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import ToolPageShell from '../components/ToolPageShell';
import { useToast } from '../components/ToastProvider';
import { buildDedupResult } from '../lib/invoiceDedup';
import { ensureUniqueFileName } from '../lib/invoicePdf';
import {
  createInvoiceArchiveName,
  createInvoiceQueueItems,
  isPdfFile,
  parseInvoiceFileQueue,
  prettyBytes,
  triggerObjectUrlDownload
} from '../lib/invoicePdfBatch';
import './InvoiceRenamePage.css';
import './InvoiceDedupPage.css';

const STATUS_LABEL_MAP = {
  pending: '待统计',
  analyzing: '统计中',
  kept: '已保留',
  keptWeak: '保留（信息不足）',
  duplicate: '重复',
  error: '失败'
};

function getTotalAmountValue(invoiceData) {
  return String(invoiceData?.totalAmount || invoiceData?.invoiceAmount || invoiceData?.amount || '').trim();
}

function StepItem({ active, done, index, label }) {
  return (
    <div className={active ? 'invoice-step is-active' : done ? 'invoice-step is-done' : 'invoice-step'}>
      <span className="invoice-step-index">{index}</span>
      <strong>{label}</strong>
    </div>
  );
}

function InvoiceDedupPage() {
  const inputRef = useRef(null);
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [downloadName, setDownloadName] = useState('');

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
  const parsedCount = items.filter((item) => Boolean(item.invoiceData)).length;
  const duplicateCount = items.filter((item) => item.status === 'duplicate').length;
  const keptCount = items.filter((item) => item.status === 'kept' || item.status === 'keptWeak').length;
  const itemErrorCount = items.filter((item) => item.status === 'error').length;
  const hasProcessedResult = items.some((item) => item.invoiceData || item.error);
  const activeStep = downloadUrl || isRunning || hasProcessedResult ? 3 : items.length ? 2 : 1;

  const resetDownloadState = () => {
    setDownloadUrl('');
    setDownloadName('');
  };

  const patchItem = (id, patch) => {
    setItems((prev) => prev.map((item) => (
      item.id === id
        ? { ...item, ...patch }
        : item
    )));
  };

  const handleAddFiles = (fileList) => {
    if (isRunning) {
      return;
    }

    const files = Array.from(fileList || []);
    const pdfFiles = files.filter(isPdfFile);

    if (!pdfFiles.length) {
      setError('请上传 PDF 电子发票文件。');
      return;
    }

    const nextItems = createInvoiceQueueItems(pdfFiles, () => ({
      dedupBasis: '',
      dedupSummary: '',
      dedupReason: ''
    }));

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
    if (isRunning) {
      return;
    }

    setItems((prev) => prev.filter((item) => item.id !== id));
    resetDownloadState();
  };

  const handleClear = () => {
    if (isRunning) {
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

  const handleStartDedup = async () => {
    if (!items.length) {
      setError('请先上传至少一个 PDF 发票文件。');
      return;
    }

    setIsRunning(true);
    setError('');
    resetDownloadState();
    setStatusText(`开始统计，共 ${items.length} 个文件。`);
    setItems((prev) => prev.map((item) => ({
      ...item,
      status: 'pending',
      error: '',
      dedupBasis: '',
      dedupSummary: '',
      dedupReason: ''
    })));

    const queue = items.map((item) => ({
      id: item.id,
      file: item.file,
      invoiceData: item.invoiceData
    }));

    try {
      const { results, successTotal, failureTotal } = await parseInvoiceFileQueue(queue, {
        forceReparse: true,
        onEngineLoading() {
          setStatusText('正在加载 PDF 解析引擎...');
        },
        onItemStart({ current, index, total }) {
          patchItem(current.id, {
            status: 'analyzing',
            error: '',
            dedupBasis: '',
            dedupSummary: '',
            dedupReason: ''
          });
          setStatusText(`正在识别 ${index + 1}/${total}: ${current.file.name}`);
        },
        onItemSuccess({ current }) {
          patchItem(current.id, {
            status: 'analyzing',
            invoiceData: current.invoiceData,
            error: ''
          });
        },
        onItemError({ current, error: parseError }) {
          patchItem(current.id, {
            status: 'error',
            invoiceData: current.invoiceData || null,
            error: parseError.message || '解析失败'
          });
        }
      });

      if (successTotal === 0) {
        setError('没有识别到可用于去重的发票字段，请检查失败原因后重试。');
        setStatusText('');
        return;
      }

      setStatusText('正在执行去重统计...');
      const dedupResult = buildDedupResult(results);
      const resultMap = new Map(dedupResult.rows.map((item) => [item.id, item]));

      setItems((prev) => prev.map((item) => {
        const matched = resultMap.get(item.id);
        return matched
          ? {
            ...item,
            status: matched.status,
            invoiceData: matched.invoiceData,
            error: '',
            dedupBasis: matched.dedupBasis,
            dedupSummary: matched.dedupSummary,
            dedupReason: matched.dedupReason
          }
          : item;
      }));

      const zip = new JSZip();
      const usedNames = new Set();
      dedupResult.keptRows.forEach((item) => {
        const entryName = ensureUniqueFileName(item.file.name, usedNames);
        zip.file(entryName, item.file);
      });

      setStatusText(`正在打包去重后 ${dedupResult.keptRows.length} 个发票文件...`);
      const archiveBlob = await zip.generateAsync(
        {
          type: 'blob',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 }
        },
        (metadata) => {
          const progress = Math.round(metadata.percent);
          setStatusText(`正在打包去重后 ${dedupResult.keptRows.length} 个发票文件... ${progress}%`);
        }
      );

      const nextDownloadUrl = URL.createObjectURL(archiveBlob);
      setDownloadUrl(nextDownloadUrl);
      setDownloadName(createInvoiceArchiveName('发票去重结果'));
      setStatusText(
        failureTotal > 0
          ? `处理完成：成功识别 ${successTotal} 张，失败 ${failureTotal} 张，重复 ${dedupResult.rows.filter((item) => item.status === 'duplicate').length} 张，去重后保留 ${dedupResult.keptRows.length} 张。`
          : `处理完成：共识别 ${successTotal} 张，重复 ${dedupResult.rows.filter((item) => item.status === 'duplicate').length} 张，去重后保留 ${dedupResult.keptRows.length} 张。`
      );
      toast.success(`去重完成，已保留 ${dedupResult.keptRows.length} 张发票，可直接下载。`);
    } catch (runtimeError) {
      setError(runtimeError.message || '发票去重失败，请稍后重试。');
      setStatusText('');
    } finally {
      setIsRunning(false);
    }
  };

  const handleDownload = () => {
    triggerObjectUrlDownload(downloadUrl, downloadName || createInvoiceArchiveName('发票去重结果'));
  };

  return (
    <ToolPageShell
      title="PDF 电子发票批量去重"
      desc="本地批量识别 PDF 发票并做重复统计，展示去重结果表格，并打包下载去重后的发票文件。"
    >
      <div className="invoice-tool">
        <section className="invoice-hero">
          <div>
            <span className="invoice-badge">本地处理</span>
            <h2>批量上传 PDF 发票，一键统计重复并保留唯一文件</h2>
            <p>
              适合整理重复保存、重复下载或重复归档的电子发票。
              去重统计完成后，会保留唯一发票并生成去重后的 ZIP 下载包。
            </p>
            <ul className="invoice-points">
              <li>发票文件仅在本地浏览器内处理，不上传服务器。</li>
              <li>优先按强标识去重，识别字段不足时默认保留，不会冒进删票。</li>
              <li>支持批量表格查看每张发票的识别和去重结果。</li>
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
              <span>识别成功</span>
              <strong>{parsedCount}</strong>
            </div>
            <div className="invoice-summary-card">
              <span>重复发票</span>
              <strong>{duplicateCount}</strong>
            </div>
          </div>
        </section>

        <section className="invoice-steps" aria-label="处理步骤">
          <StepItem index="1" label="上传 PDF 发票" active={activeStep === 1} done={activeStep > 1} />
          <StepItem index="2" label="查看去重规则" active={activeStep === 2} done={activeStep > 2} />
          <StepItem index="3" label="开始统计并下载" active={activeStep === 3} done={Boolean(downloadUrl)} />
        </section>

        <div className="invoice-grid">
          <section className="invoice-panel">
            <div className="invoice-panel-head">
              <div>
                <h3>1. 上传 PDF 发票</h3>
                <p>支持点击选择或拖拽批量上传，原始文件始终保留在本地浏览器处理。</p>
              </div>
              <div className="invoice-panel-actions">
                <button
                  className="invoice-btn invoice-btn-secondary"
                  type="button"
                  disabled={isRunning}
                  onClick={() => inputRef.current?.click()}
                >
                  添加文件
                </button>
                <button
                  className="invoice-btn invoice-btn-ghost"
                  type="button"
                  disabled={isRunning || !items.length}
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
              disabled={isRunning}
              onClick={() => inputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                if (!isRunning) {
                  setIsDragging(true);
                }
              }}
              onDragOver={(event) => {
                event.preventDefault();
                if (!isRunning) {
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
                <h3>2. 去重规则</h3>
                <p>默认采取保守去重策略，优先使用稳定字段，避免误删有效发票。</p>
              </div>
            </div>

            <div className="invoice-preview-box">
              <span>去重优先级</span>
              <strong>发票代码 + 发票号码</strong>
            </div>
            <ul className="invoice-dedup-rule-list">
              <li>优先使用“发票代码 + 发票号码”判定重复。</li>
              <li>缺少发票代码时，回退使用“发票号码 + 开票日期 + 价税合计”。</li>
              <li>如果核心字段仍不足，会标记为“保留（信息不足）”，不会自动剔除。</li>
            </ul>
          </section>

          <section className="invoice-panel">
            <div className="invoice-action-bar">
              <div>
                <h3>3. 开始统计</h3>
                <p>点击后会逐个识别发票字段、执行去重统计，并生成去重后的 ZIP 下载包。</p>
              </div>
              <div className="invoice-action-buttons">
                <button
                  className="invoice-btn invoice-btn-identify"
                  type="button"
                  disabled={isRunning || !items.length}
                  onClick={handleStartDedup}
                >
                  {isRunning ? '统计中...' : `开始统计（共 ${items.length} 张）`}
                </button>
                <button
                  className="invoice-btn invoice-btn-secondary"
                  type="button"
                  disabled={isRunning || !downloadUrl}
                  onClick={handleDownload}
                >
                  下载去重后发票
                </button>
              </div>
            </div>

            {statusText ? <p className="status-text">{statusText}</p> : null}
            {error ? <p className="error">{error}</p> : null}
          </section>
        </div>

        <section className="invoice-panel">
          <div className="invoice-panel-head">
            <div>
              <h3>去重统计结果</h3>
              <p>表格会展示每张发票的识别情况、去重依据和最终处理结果。</p>
            </div>
          </div>

          {!items.length ? (
            <div className="invoice-empty">还没有添加发票文件，先上传 PDF 后再开始统计去重。</div>
          ) : (
            <>
              <div className="invoice-amount-summary-grid">
                <div className="invoice-amount-summary-card">
                  <span>识别成功</span>
                  <strong>{parsedCount}</strong>
                </div>
                <div className="invoice-amount-summary-card">
                  <span>重复发票</span>
                  <strong>{duplicateCount}</strong>
                </div>
                <div className="invoice-amount-summary-card">
                  <span>去重后保留</span>
                  <strong>{keptCount}</strong>
                </div>
                <div className="invoice-amount-summary-card">
                  <span>处理失败</span>
                  <strong>{itemErrorCount}</strong>
                </div>
              </div>

              <div className="invoice-amount-table-wrap">
                <table className="invoice-amount-table invoice-dedup-table">
                  <thead>
                    <tr>
                      <th scope="col">发票文件</th>
                      <th scope="col">发票号码</th>
                      <th scope="col">开票日期</th>
                      <th scope="col">销售方</th>
                      <th scope="col">价税合计</th>
                      <th scope="col">去重依据</th>
                      <th scope="col">处理结果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const statusClass = item.status === 'duplicate'
                        ? 'invoice-dedup-status-text is-duplicate'
                        : item.status === 'kept'
                          ? 'invoice-dedup-status-text is-keep'
                          : item.status === 'keptWeak'
                            ? 'invoice-dedup-status-text is-weak'
                            : item.status === 'error'
                              ? 'invoice-dedup-status-text is-error'
                              : 'invoice-dedup-status-text';

                      return (
                        <tr key={`dedup-${item.id}`}>
                          <td>
                            <div className="invoice-dedup-file">
                              <strong title={item.file.name}>{item.file.name}</strong>
                              <span>{prettyBytes(item.file.size)}</span>
                            </div>
                          </td>
                          <td>{item.invoiceData?.invoiceNumber || '--'}</td>
                          <td>{item.invoiceData?.issueDate || '--'}</td>
                          <td>{item.invoiceData?.sellerName || '--'}</td>
                          <td>{getTotalAmountValue(item.invoiceData) || '--'}</td>
                          <td>
                            <div className="invoice-dedup-basis">
                              <strong>{item.dedupBasis || '--'}</strong>
                              <span>{item.dedupSummary || '--'}</span>
                            </div>
                          </td>
                          <td>
                            <div className={statusClass}>
                              <strong>{STATUS_LABEL_MAP[item.status] || '待统计'}</strong>
                              <span>{item.error || item.dedupReason || '--'}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </ToolPageShell>
  );
}

export default InvoiceDedupPage;
