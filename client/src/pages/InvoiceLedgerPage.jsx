import { useEffect, useMemo, useRef, useState } from 'react';
import ToolPageShell from '../components/ToolPageShell';
import { useToast } from '../components/ToastProvider';
import InvoiceLedgerFieldsModal from '../components/InvoiceLedgerFieldsModal';
import { DEFAULT_INVOICE_TYPE } from '../lib/invoicePdf';
import { buildAmountMatchResult, buildDedupResult } from '../lib/invoiceDedup';
import {
  buildInvoiceLedgerRows,
  createInvoiceLedgerBlob,
  createDefaultLedgerFieldSelectionMap,
  getInvoiceLedgerCellValue,
  getInvoiceLedgerFieldOptions,
  isLedgerMetaField,
  normalizeLedgerFieldSelection,
  normalizeLedgerFieldSelectionMap
} from '../lib/invoiceLedger';
import {
  createInvoiceQueueItems,
  createInvoiceTimestampedName,
  isPdfFile,
  parseInvoiceFileQueue,
  prettyBytes,
  triggerObjectUrlDownload
} from '../lib/invoicePdfBatch';
import './InvoiceRenamePage.css';
import './InvoiceDedupPage.css';

const STATUS_LABEL_MAP = {
  pending: '待识别',
  analyzing: '识别中',
  analyzed: '已识别',
  exported: '已导出',
  error: '失败'
};

const MIXED_INVOICE_TYPE_MESSAGE = '检测到普通发票和火车票混合上传，请分开操作。';

function collectRecognizedInvoiceTypes(items) {
  return Array.from(new Set(
    (items || [])
      .map((item) => item?.invoiceData?.invoiceTypeKey)
      .filter(Boolean)
  ));
}

function hasMixedInvoiceTypes(items) {
  const recognizedTypes = collectRecognizedInvoiceTypes(items);
  return recognizedTypes.includes('train') && recognizedTypes.includes('standard');
}

function StepItem({ active, done, index, label }) {
  return (
    <div className={active ? 'invoice-step is-active' : done ? 'invoice-step is-done' : 'invoice-step'}>
      <span className="invoice-step-index">{index}</span>
      <strong>{label}</strong>
    </div>
  );
}

function InvoiceLedgerPage() {
  const inputRef = useRef(null);
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [downloadName, setDownloadName] = useState('');
  const [activeInvoiceTypeKey, setActiveInvoiceTypeKey] = useState(DEFAULT_INVOICE_TYPE);
  const [fieldSelectionMap, setFieldSelectionMap] = useState(() => createDefaultLedgerFieldSelectionMap());
  const [showFieldSettings, setShowFieldSettings] = useState(false);
  const [exportedAt, setExportedAt] = useState('');
  const [enableAmountMatchReview, setEnableAmountMatchReview] = useState(true);

  useEffect(() => {
    if (!downloadUrl) {
      return undefined;
    }

    return () => {
      URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  const selectedFieldKeys = useMemo(
    () => normalizeLedgerFieldSelection(fieldSelectionMap?.[activeInvoiceTypeKey], activeInvoiceTypeKey),
    [activeInvoiceTypeKey, fieldSelectionMap]
  );
  const fieldOptions = useMemo(
    () => getInvoiceLedgerFieldOptions(activeInvoiceTypeKey),
    [activeInvoiceTypeKey]
  );
  const fieldOptionMap = useMemo(
    () => new Map(fieldOptions.map((field) => [field.key, field])),
    [fieldOptions]
  );
  const selectedFields = useMemo(
    () => selectedFieldKeys.map((key) => fieldOptionMap.get(key)).filter(Boolean),
    [fieldOptionMap, selectedFieldKeys]
  );

  const totalSize = useMemo(
    () => items.reduce((sum, item) => sum + item.file.size, 0),
    [items]
  );
  const parsedCount = items.filter((item) => Boolean(item.invoiceData)).length;
  const duplicateCount = items.filter((item) => item.duplicateStatus === 'duplicate').length;
  const amountMatchCount = items.filter((item) => item.amountMatchStatus === 'sameAmount').length;
  const itemErrorCount = items.filter((item) => item.status === 'error').length;
  const hasProcessedResult = items.some((item) => item.invoiceData || item.error);
  const activeStep = downloadUrl || isRunning || hasProcessedResult ? 3 : items.length ? 2 : 1;
  const ledgerRows = useMemo(
    () => buildInvoiceLedgerRows(items, STATUS_LABEL_MAP, { exportTime: exportedAt }),
    [items, exportedAt]
  );

  function resetDownloadState() {
    setDownloadUrl('');
    setDownloadName('');
    setExportedAt('');
  }

  function patchItem(id, patch) {
    setItems((prev) => prev.map((item) => (
      item.id === id
        ? { ...item, ...patch }
        : item
    )));
  }

  function handleAddFiles(fileList) {
    if (isRunning) {
      return;
    }

    const files = Array.from(fileList || []);
    const pdfFiles = files.filter(isPdfFile);

    if (!pdfFiles.length) {
      setError('请上传 PDF 电子发票文件。');
      return;
    }

    const nextItems = createInvoiceQueueItems(pdfFiles);
    setItems((prev) => [...prev, ...nextItems]);
    resetDownloadState();
    setError('');

    const skippedCount = files.length - pdfFiles.length;
    if (skippedCount > 0) {
      setStatusText(`已添加 ${pdfFiles.length} 个 PDF，已忽略 ${skippedCount} 个非 PDF 文件。`);
    } else {
      setStatusText(`已添加 ${pdfFiles.length} 个 PDF 发票文件。`);
    }
  }

  function handleRemove(id) {
    if (isRunning) {
      return;
    }

    setItems((prev) => prev.filter((item) => item.id !== id));
    resetDownloadState();
  }

  function handleClear() {
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
  }

  async function handleExportLedger() {
    if (!items.length) {
      setError('请先上传至少一个 PDF 发票文件。');
      return;
    }

    if (!selectedFieldKeys.length) {
      setError('请至少选择一列导出字段。');
      return;
    }

    setIsRunning(true);
    setError('');
    resetDownloadState();
    setStatusText(`开始识别，共 ${items.length} 个文件。`);
    setItems((prev) => prev.map((item) => ({
      ...item,
      status: 'pending',
      error: ''
    })));

    const queue = items.map((item) => ({
      id: item.id,
      file: item.file,
      invoiceData: item.invoiceData
    }));
    const runtimeMap = new Map(items.map((item) => [item.id, {
      ...item,
      status: 'pending',
      error: ''
    }]));

    try {
      const { results, successTotal, failureTotal } = await parseInvoiceFileQueue(queue, {
        onEngineLoading() {
          setStatusText('正在加载 PDF 解析引擎...');
        },
        onItemStart({ current, index, total }) {
          runtimeMap.set(current.id, {
            ...runtimeMap.get(current.id),
            status: 'analyzing',
            error: ''
          });
          patchItem(current.id, {
            status: 'analyzing',
            error: ''
          });
          setStatusText(`正在识别 ${index + 1}/${total}: ${current.file.name}`);
        },
        onItemSuccess({ current }) {
          const nextItem = {
            ...runtimeMap.get(current.id),
            status: 'analyzed',
            invoiceData: current.invoiceData,
            error: ''
          };
          runtimeMap.set(current.id, nextItem);
          patchItem(current.id, {
            status: 'analyzed',
            invoiceData: current.invoiceData,
            error: ''
          });
        },
        onItemError({ current, error: parseError }) {
          const nextItem = {
            ...runtimeMap.get(current.id),
            status: 'error',
            invoiceData: current.invoiceData || null,
            error: parseError.message || '解析失败'
          };
          runtimeMap.set(current.id, nextItem);
          patchItem(current.id, {
            status: 'error',
            invoiceData: current.invoiceData || null,
            error: parseError.message || '解析失败'
          });
        }
      });

      if (successTotal === 0) {
        setError('没有识别到可导出的发票字段，请检查失败原因后重试。');
        setStatusText('');
        return;
      }

      if (hasMixedInvoiceTypes(results)) {
        setError(MIXED_INVOICE_TYPE_MESSAGE);
        setStatusText('');
        toast.error(MIXED_INVOICE_TYPE_MESSAGE);
        return;
      }

      const recognizedTypeKey = collectRecognizedInvoiceTypes(results)[0] || activeInvoiceTypeKey;
      const exportFieldKeys = normalizeLedgerFieldSelection(fieldSelectionMap?.[recognizedTypeKey], recognizedTypeKey);
      if (!exportFieldKeys.length) {
        setError('请至少选择一列导出字段。');
        setStatusText('');
        return;
      }
      setActiveInvoiceTypeKey(recognizedTypeKey);

      const parsedIdSet = new Set(results.map((item) => item.id));
      results.forEach((item) => {
        runtimeMap.set(item.id, {
          ...runtimeMap.get(item.id),
          status: 'exported',
          invoiceData: item.invoiceData,
          error: ''
        });
      });

      const finalItems = items.map((item) => {
        if (!parsedIdSet.has(item.id) && runtimeMap.has(item.id)) {
          return runtimeMap.get(item.id);
        }
        return runtimeMap.get(item.id) || item;
      });
      const dedupResult = buildDedupResult(
        finalItems
          .filter((item) => item.invoiceData)
          .map((item) => ({
            id: item.id,
            file: item.file,
            invoiceData: item.invoiceData
          }))
      );
      const amountMatchResult = enableAmountMatchReview
        ? buildAmountMatchResult(
          finalItems
            .filter((item) => item.invoiceData)
            .map((item) => ({
              id: item.id,
              file: item.file,
              invoiceData: item.invoiceData
            }))
        )
        : [];
      const dedupMap = new Map(dedupResult.rows.map((item) => [item.id, item]));
      const amountMatchMap = new Map(amountMatchResult.map((item) => [item.id, item]));
      const finalItemsWithDedup = finalItems.map((item) => {
        const dedupItem = dedupMap.get(item.id);
        const amountMatchItem = amountMatchMap.get(item.id);
        return dedupItem
          ? {
            ...item,
            duplicateStatus: dedupItem.status,
            dedupBasis: dedupItem.dedupBasis,
            dedupSummary: dedupItem.dedupSummary,
            dedupReason: dedupItem.dedupReason,
            amountMatchStatus: amountMatchItem?.amountMatchStatus || '',
            amountMatchBasis: amountMatchItem?.amountMatchBasis || '',
            amountMatchSummary: amountMatchItem?.amountMatchSummary || '',
            amountMatchReason: amountMatchItem?.amountMatchReason || ''
          }
          : {
            ...item,
            duplicateStatus: '',
            dedupBasis: '',
            dedupSummary: '',
            dedupReason: '',
            amountMatchStatus: amountMatchItem?.amountMatchStatus || '',
            amountMatchBasis: amountMatchItem?.amountMatchBasis || '',
            amountMatchSummary: amountMatchItem?.amountMatchSummary || '',
            amountMatchReason: amountMatchItem?.amountMatchReason || ''
          };
      });

      setItems(finalItemsWithDedup);

      setStatusText('正在生成 Excel 台账...');
      const exportTime = new Date().toISOString();
      setExportedAt(exportTime);
      const ledgerBlob = await createInvoiceLedgerBlob(
        buildInvoiceLedgerRows(finalItemsWithDedup, STATUS_LABEL_MAP, { exportTime }),
        exportFieldKeys
      );
      const nextDownloadUrl = URL.createObjectURL(ledgerBlob);

      setDownloadUrl(nextDownloadUrl);
      setDownloadName(createInvoiceTimestampedName('发票台账', 'xlsx'));
      setStatusText(
        failureTotal > 0
          ? `处理完成：成功识别 ${successTotal} 张，失败 ${failureTotal} 张，标记重复 ${dedupResult.rows.filter((item) => item.status === 'duplicate').length} 张${enableAmountMatchReview ? `，金额一致提醒 ${amountMatchResult.filter((item) => item.amountMatchStatus === 'sameAmount').length} 张` : ''}，已生成 Excel 台账。`
          : `处理完成：共识别 ${successTotal} 张发票，标记重复 ${dedupResult.rows.filter((item) => item.status === 'duplicate').length} 张${enableAmountMatchReview ? `，金额一致提醒 ${amountMatchResult.filter((item) => item.amountMatchStatus === 'sameAmount').length} 张` : ''}，已生成 Excel 台账。`
      );
      toast.success(`台账导出完成，已生成 ${successTotal} 张发票的 Excel 文件。`);
    } catch (runtimeError) {
      setError(runtimeError.message || '发票台账导出失败，请稍后重试。');
      setStatusText('');
    } finally {
      setIsRunning(false);
    }
  }

  function handleDownload() {
    triggerObjectUrlDownload(downloadUrl, downloadName || createInvoiceTimestampedName('发票台账', 'xlsx'));
  }

  return (
    <ToolPageShell
      title="PDF 电子发票台账导出"
      desc="本地批量识别 PDF 发票，按所选字段生成 Excel 台账，适合整理报销、归档和对账数据。"
    >
      <div className="invoice-tool">
        <section className="invoice-hero">
          <div>
            <span className="invoice-badge">本地处理</span>
            <h2>批量上传 PDF 发票，一键识别并导出 Excel 台账</h2>
            <p>
              适合做报销清单、财务归档和发票信息汇总。
              识别完成后可按所选字段导出 Excel，并在页面先预览台账列内容。
            </p>
            <ul className="invoice-points">
              <li>发票文件仅在本地浏览器内处理，不上传服务器。</li>
              <li>导出列支持自由勾选，并可在弹窗内拖拽调整顺序。</li>
              <li>默认标记标准重复，并可开启“金额一致提醒”辅助排查重开或重复报销。</li>
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
              <span>重复标记</span>
              <strong>{duplicateCount}</strong>
            </div>
            <div className="invoice-summary-card">
              <span>金额一致提醒</span>
              <strong>{enableAmountMatchReview ? amountMatchCount : '--'}</strong>
            </div>
          </div>
        </section>

        <section className="invoice-steps" aria-label="处理步骤">
          <StepItem index="1" label="上传 PDF 发票" active={activeStep === 1} done={activeStep > 1} />
          <StepItem index="2" label="设置导出字段" active={activeStep === 2} done={activeStep > 2} />
          <StepItem index="3" label="导出 Excel 台账" active={activeStep === 3} done={Boolean(downloadUrl)} />
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
                <h3>2. 设置导出字段</h3>
                <p>可按发票类型分别配置导出字段，并可选择是否开启金额一致提醒。</p>
              </div>
              <div className="invoice-panel-actions">
                <button
                  className="invoice-btn invoice-btn-ghost"
                  type="button"
                  disabled={isRunning}
                  onClick={() => setShowFieldSettings(true)}
                >
                  高级设置
                </button>
              </div>
            </div>

            <div className="invoice-preview-box">
              <span>当前发票类型</span>
              <strong>{activeInvoiceTypeKey === 'train' ? '火车发票' : '常规发票'}</strong>
            </div>

            <div className="invoice-preview-box">
              <span>导出列预览</span>
              <strong>{selectedFields.map((field) => field.label).join(' / ')}</strong>
            </div>

            <div className="invoice-preview-box">
              <span>提醒策略</span>
              <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <input type="checkbox" checked readOnly />
                  <span>
                    <strong style={{ display: 'block' }}>标准重复标记</strong>
                    <span style={{ color: '#6b829a', fontSize: 13 }}>
                      {activeInvoiceTypeKey === 'train'
                        ? '火车票优先按发车时间、始发站、终点站、乘车人身份证号判定重复。'
                        : '按发票代码、号码、日期、价税合计等稳定字段判定真重复。'}
                    </span>
                  </span>
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <input
                    type="checkbox"
                    checked={enableAmountMatchReview}
                    disabled={isRunning}
                    onChange={(event) => setEnableAmountMatchReview(event.target.checked)}
                  />
                  <span>
                    <strong style={{ display: 'block' }}>金额一致提醒</strong>
                    <span style={{ color: '#6b829a', fontSize: 13 }}>仅按价税合计一致做弱提醒，适合排查重开发票，不会直接当成真重复。</span>
                  </span>
                </label>
              </div>
            </div>
          </section>

          <section className="invoice-panel">
            <div className="invoice-action-bar">
              <div>
                <h3>3. 开始导出</h3>
                <p>点击后会逐个识别发票字段，并按当前所选列生成本地 Excel 台账。</p>
              </div>
              <div className="invoice-action-buttons">
                <button
                  className="invoice-btn invoice-btn-identify"
                  type="button"
                  disabled={isRunning || !items.length}
                  onClick={handleExportLedger}
                >
                  {isRunning ? '导出中...' : `识别并导出（共 ${items.length} 张）`}
                </button>
                <button
                  className="invoice-btn invoice-btn-secondary"
                  type="button"
                  disabled={isRunning || !downloadUrl}
                  onClick={handleDownload}
                >
                  下载 Excel 台账
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
              <h3>台账预览</h3>
              <p>表格会按当前导出列顺序展示，生成 Excel 后与下载结果保持一致。</p>
            </div>
          </div>

          {!items.length ? (
            <div className="invoice-empty">还没有添加发票文件，先上传 PDF 后再生成台账。</div>
          ) : (
            <div className="invoice-amount-table-wrap">
              <table className="invoice-amount-table invoice-ledger-table">
                <thead>
                  <tr>
                    {selectedFields.map((field) => (
                      <th
                        key={field.key}
                        scope="col"
                        className={field.key === 'projectName' || field.key === 'remarks' || field.key === 'duplicateReason' ? 'invoice-ledger-col-wide' : ''}
                      >
                        {field.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ledgerRows.map((row) => (
                    <tr
                      key={`ledger-${row.sequence}-${row.fileName}`}
                      className={
                        row.duplicateStatus === '重复'
                          ? 'invoice-ledger-row is-duplicate'
                          : row.amountMatchStatus === '金额一致'
                            ? 'invoice-ledger-row is-amount-match'
                          : row.duplicateStatus === '信息不足'
                            ? 'invoice-ledger-row is-weak'
                            : 'invoice-ledger-row'
                      }
                    >
                      {selectedFields.map((field) => (
                        <td
                          key={`${row.sequence}-${field.key}`}
                          className={field.key === 'projectName' || field.key === 'remarks' || field.key === 'duplicateReason' ? 'invoice-ledger-col-wide' : ''}
                        >
                          {getInvoiceLedgerCellValue(field.key, row) || '--'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="invoice-panel">
          <div className="invoice-panel-head">
            <div>
              <h3>发票列表</h3>
              <p>识别完成后会展示每个文件的状态，失败项会保留原因，便于重新处理。</p>
            </div>
          </div>

          {!items.length ? (
            <div className="invoice-empty">还没有添加发票文件，先上传 PDF 后再开始处理。</div>
          ) : (
            <div className="invoice-file-list">
              {items.map((item, index) => {
                const statusClass = item.status === 'error'
                  ? 'invoice-status-badge is-error'
                  : item.status === 'exported'
                    ? 'invoice-status-badge is-success'
                    : item.status === 'analyzed'
                      ? 'invoice-status-badge is-identified'
                      : item.status === 'analyzing'
                        ? 'invoice-status-badge is-processing'
                        : 'invoice-status-badge';

                return (
                  <article className="invoice-file-card" key={item.id}>
                    <div className="invoice-file-card-head">
                      <div className="invoice-file-card-head-left">
                        <span className="invoice-file-index">#{index + 1}</span>
                        <h4 title={item.file.name}>{item.file.name}</h4>
                      </div>
                      <div className="invoice-file-card-actions">
                        <span className={statusClass}>{STATUS_LABEL_MAP[item.status] || '待识别'}</span>
                        <button
                          className="invoice-mini-btn is-danger"
                          type="button"
                          disabled={isRunning}
                          onClick={() => handleRemove(item.id)}
                        >
                          删除
                        </button>
                      </div>
                    </div>

                    <div className="invoice-file-meta">
                      <span>{prettyBytes(item.file.size)}</span>
                      <span>{item.file.type || 'PDF 文件'}</span>
                      {item.duplicateStatus ? <span>{item.duplicateStatus === 'duplicate' ? '重复' : item.duplicateStatus === 'keptWeak' ? '信息不足' : '唯一'}</span> : null}
                      {item.amountMatchStatus === 'sameAmount' ? <span>金额一致</span> : null}
                    </div>

                    {item.invoiceData ? (
                      <div className="invoice-field-chips">
                        {selectedFields
                          .filter((field) => !isLedgerMetaField(field.key))
                          .map((field) => {
                            const value = item.invoiceData?.[field.key];
                            return value ? (
                              <span className="invoice-field-chip" key={`${item.id}-${field.key}`}>
                                {field.label}：{value}
                              </span>
                            ) : null;
                          })}
                      </div>
                    ) : (
                      <p className="invoice-muted">尚未解析字段，点击“识别并导出”后会自动生成台账。</p>
                    )}

                    {item.error ? <p className="error invoice-item-error">{item.error}</p> : null}
                    {!item.error && item.duplicateStatus ? (
                      <p className="invoice-muted">
                        {item.dedupBasis
                          ? `${item.duplicateStatus === 'duplicate' ? '重复' : item.duplicateStatus === 'keptWeak' ? '信息不足' : '唯一'}：${item.dedupBasis}`
                          : item.duplicateStatus === 'duplicate' ? '重复' : item.duplicateStatus === 'keptWeak' ? '信息不足' : '唯一'}
                      </p>
                    ) : null}
                    {!item.error && item.dedupReason ? <p className="invoice-muted">{item.dedupReason}</p> : null}
                    {!item.error && item.amountMatchStatus === 'sameAmount' ? (
                      <p className="invoice-muted">
                        金额一致提醒：{item.amountMatchBasis || '价税合计一致'}
                        {item.amountMatchSummary ? `（${item.amountMatchSummary}）` : ''}
                        {item.amountMatchReason ? `，${item.amountMatchReason}` : ''}
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
      {showFieldSettings ? (
        <InvoiceLedgerFieldsModal
          initialInvoiceTypeKey={activeInvoiceTypeKey}
          initialSelectionMap={fieldSelectionMap}
          onSave={({ invoiceTypeKey, selectionMap }) => {
            setActiveInvoiceTypeKey(invoiceTypeKey);
            setFieldSelectionMap(normalizeLedgerFieldSelectionMap(selectionMap));
            setShowFieldSettings(false);
          }}
          onCancel={() => setShowFieldSettings(false)}
        />
      ) : null}
    </ToolPageShell>
  );
}

export default InvoiceLedgerPage;
