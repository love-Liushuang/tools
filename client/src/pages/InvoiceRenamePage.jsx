import { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import ToolPageShell from '../components/ToolPageShell';
import { useToast } from '../components/ToastProvider';
import { buildAmountMatchResult, buildDedupResult } from '../lib/invoiceDedup';
import {
  buildRenamedFileName,
  buildRulePreview,
  DEFAULT_SEPARATOR,
  ensureUniqueFileName,
  formatExtractedFieldList,
  DEFAULT_INVOICE_TYPE,
  createDefaultRuleProfile
} from '../lib/invoicePdf';
import {
  createInvoiceArchiveName,
  createInvoiceQueueItems,
  isPdfFile,
  parseInvoiceFileQueue,
  prettyBytes,
  triggerObjectUrlDownload
} from '../lib/invoicePdfBatch';
import InvoiceRuleSettingsModal from '../components/InvoiceRuleSettingsModal';
import './InvoiceRenamePage.css';

const DEFAULT_RULE_FIELDS = ['invoiceNumber', 'issueDate', 'buyerName', 'sellerName', 'totalAmount'];
const STATUS_LABEL_MAP = {
  pending: '待处理',
  analyzing: '识别中',
  analyzed: '已识别',
  renaming: '重命名中',
  renamed: '已重命名',
  error: '失败'
};

function parseAmountNumber(value) {
  const numeric = Number(String(value || '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
}

function formatAmountNumber(value) {
  return Number.isFinite(value) ? value.toFixed(2) : '--';
}

function getInvoiceAmountValue(invoiceData) {
  return invoiceData?.invoiceAmount || invoiceData?.amount || '';
}

function isTrainInvoiceType(invoiceTypeKey) {
  return invoiceTypeKey === 'train';
}

function shouldUseTrainAmountTable(items) {
  const recognizedTypes = (items || [])
    .map((item) => item?.invoiceData?.invoiceTypeKey)
    .filter(Boolean);

  return recognizedTypes.length > 0 && recognizedTypes.every(isTrainInvoiceType);
}

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

const MIXED_INVOICE_TYPE_MESSAGE = '检测到普通发票和火车票混合上传，请分开操作。';

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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [downloadName, setDownloadName] = useState('');
  const [enableAmountMatchReview, setEnableAmountMatchReview] = useState(true);

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
  const isBusy = isAnalyzing || isRenaming;
  const recognizedFileCount = items.filter((item) => Boolean(item.invoiceData)).length;
  const itemErrorCount = items.filter((item) => item.status === 'error').length;
  const duplicateCount = items.filter((item) => item.duplicateStatus === 'duplicate').length;
  const amountMatchCount = items.filter((item) => item.amountMatchStatus === 'sameAmount').length;
  const hasProcessedResult = items.some((item) => item.invoiceData || item.error);
  const activeStep = downloadUrl || isBusy || hasProcessedResult ? 3 : items.length ? 2 : 1;
  const isTrainMode = useMemo(() => shouldUseTrainAmountTable(items), [items]);
  const previewName = useMemo(() => {
    if (activeProfile) return buildRulePreview(activeProfile.invoiceTypeKey, activeProfile);
    return buildRulePreview(ruleFields, separator);
  }, [activeProfile, ruleFields, separator]);
  const amountSummary = useMemo(() => {
    const rows = items.map((item, index) => {
      const invoiceAmount = parseAmountNumber(getInvoiceAmountValue(item.invoiceData));
      const taxAmount = parseAmountNumber(item.invoiceData?.taxAmount);
      const totalAmount = parseAmountNumber(item.invoiceData?.totalAmount);
      const ticketPrice = parseAmountNumber(item.invoiceData?.ticketPrice || getInvoiceAmountValue(item.invoiceData));
      return {
        id: item.id,
        index: index + 1,
        fileName: item.file.name,
        invoiceNumber: item.invoiceData?.invoiceNumber || '',
        issueDate: item.invoiceData?.issueDate || '',
        invoiceAmount,
        taxAmount,
        totalAmount,
        ticketPrice,
        hasAnyAmount: invoiceAmount !== null || taxAmount !== null || totalAmount !== null,
        duplicateStatus: item.duplicateStatus || '',
        dedupBasis: item.dedupBasis || '',
        dedupReason: item.dedupReason || '',
        amountMatchStatus: item.amountMatchStatus || '',
        amountMatchBasis: item.amountMatchBasis || '',
        amountMatchReason: item.amountMatchReason || '',
        status: item.status,
        error: item.error
      };
    });

    return rows.reduce((result, row) => {
      result.rows.push(row);
      if (row.hasAnyAmount) {
        result.recognizedCount += 1;
      }
      if (row.invoiceAmount !== null) {
        result.invoiceAmountTotal += row.invoiceAmount;
      }
      if (row.taxAmount !== null) {
        result.taxAmountTotal += row.taxAmount;
      }
      if (row.totalAmount !== null) {
        result.totalAmountTotal += row.totalAmount;
      }
      if (row.ticketPrice !== null) {
        result.ticketPriceTotal += row.ticketPrice;
      }
      return result;
    }, {
      rows: [],
      recognizedCount: 0,
      invoiceAmountTotal: 0,
      taxAmountTotal: 0,
      totalAmountTotal: 0,
      ticketPriceTotal: 0
    });
  }, [items]);

  useEffect(() => {
    setActiveProfile(createDefaultRuleProfile(DEFAULT_INVOICE_TYPE));
  }, []);

  const resetDownloadState = () => {
    setDownloadUrl('');
    setDownloadName('');
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

  const applyReminderResults = (sourceItems) => {
    const parsedItems = (sourceItems || []).filter((item) => item.invoiceData).map((item) => ({
      id: item.id,
      file: item.file,
      invoiceData: item.invoiceData
    }));
    const dedupResult = buildDedupResult(parsedItems);
    const amountMatchResult = enableAmountMatchReview ? buildAmountMatchResult(parsedItems) : [];
    const dedupMap = new Map(dedupResult.rows.map((item) => [item.id, item]));
    const amountMatchMap = new Map(amountMatchResult.map((item) => [item.id, item]));

    return (sourceItems || []).map((item) => {
      const dedupItem = dedupMap.get(item.id);
      const amountMatchItem = amountMatchMap.get(item.id);

      return {
        ...item,
        duplicateStatus: dedupItem?.status || '',
        dedupBasis: dedupItem?.dedupBasis || '',
        dedupSummary: dedupItem?.dedupSummary || '',
        dedupReason: dedupItem?.dedupReason || '',
        amountMatchStatus: amountMatchItem?.amountMatchStatus || '',
        amountMatchBasis: amountMatchItem?.amountMatchBasis || '',
        amountMatchSummary: amountMatchItem?.amountMatchSummary || '',
        amountMatchReason: amountMatchItem?.amountMatchReason || ''
      };
    });
  };

  const handleAddFiles = (fileList) => {
    if (isBusy) {
      return;
    }

    const files = Array.from(fileList || []);
    const pdfFiles = files.filter(isPdfFile);

    if (!pdfFiles.length) {
      setError('请上传 PDF 电子发票文件。');
      return;
    }

    const nextItems = createInvoiceQueueItems(pdfFiles, () => ({
      renamedName: ''
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
    if (isBusy) {
      return;
    }

    setItems((prev) => prev.filter((item) => item.id !== id));
    resetDownloadState();
  };

  const handleClear = () => {
    if (isBusy) {
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

  const parseInvoices = async (queue, progressPrefix, statusConfig = {}) => {
    const processingStatus = statusConfig.processingStatus || 'analyzing';
    const successStatus = statusConfig.successStatus || 'analyzed';
    const { results, successTotal, failureTotal } = await parseInvoiceFileQueue(queue, {
      onEngineLoading() {
        setStatusText('正在加载 PDF 解析引擎...');
      },
      onItemStart({ current, index, total }) {
        patchItem(current.id, {
          status: processingStatus,
          error: ''
        });
        setStatusText(`${progressPrefix} ${index + 1}/${total}: ${current.file.name}`);
      },
      onItemSuccess({ current }) {
        patchItem(current.id, {
          status: current.renamedName && successStatus === 'analyzed' ? 'renamed' : successStatus,
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

    return {
      parsedResults: results,
      successTotal,
      failureTotal
    };
  };

  const handleAnalyzeAmounts = async () => {
    if (!items.length) {
      setError('请先上传至少一个 PDF 发票文件。');
      return;
    }

    setIsAnalyzing(true);
    setError('');
    setStatusText(`开始识别金额，共 ${items.length} 个文件。`);
    setItems((prev) => prev.map((item) => ({
      ...item,
      status: 'pending',
      error: ''
    })));

    const queue = items.map((item) => ({
      id: item.id,
      file: item.file,
      invoiceData: item.invoiceData,
      renamedName: item.renamedName
    }));

    try {
      const { parsedResults, successTotal, failureTotal } = await parseInvoices(queue, '正在识别金额', {
        processingStatus: 'analyzing',
        successStatus: 'analyzed'
      });

      if (successTotal === 0) {
        setError('没有识别到可汇总的发票金额，请检查失败原因后重试。');
        setStatusText('');
        return;
      }

      if (hasMixedInvoiceTypes(parsedResults)) {
        setError(MIXED_INVOICE_TYPE_MESSAGE);
        setStatusText('');
        toast.error(MIXED_INVOICE_TYPE_MESSAGE);
        return;
      }

      setItems((prev) => applyReminderResults(prev));

      setStatusText(
        failureTotal > 0
          ? `金额识别完成：成功 ${successTotal} 张，失败 ${failureTotal} 张，标记重复 ${buildDedupResult(parsedResults).rows.filter((item) => item.status === 'duplicate').length} 张${enableAmountMatchReview ? `，金额一致提醒 ${buildAmountMatchResult(parsedResults).filter((item) => item.amountMatchStatus === 'sameAmount').length} 张` : ''}。`
          : `金额识别完成：共识别 ${successTotal} 张发票，标记重复 ${buildDedupResult(parsedResults).rows.filter((item) => item.status === 'duplicate').length} 张${enableAmountMatchReview ? `，金额一致提醒 ${buildAmountMatchResult(parsedResults).filter((item) => item.amountMatchStatus === 'sameAmount').length} 张` : ''}。`
      );
      toast.success(`金额识别完成，已更新 ${successTotal} 张发票的汇总结果。`);
    } catch (runtimeError) {
      setError(runtimeError.message || '金额识别失败，请稍后重试。');
      setStatusText('');
    } finally {
      setIsAnalyzing(false);
    }
  };

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
      invoiceData: item.invoiceData,
      renamedName: ''
    }));
    const zip = new JSZip();
    const usedNames = new Set();
    let successTotal = 0;
    let failureTotal = 0;

    try {
      const { parsedResults, failureTotal: parseFailureTotal } = await parseInvoices(queue, '正在解析发票', {
        processingStatus: 'analyzing',
        successStatus: 'analyzed'
      });
      failureTotal = parseFailureTotal;

      if (parsedResults.length > 0 && hasMixedInvoiceTypes(parsedResults)) {
        setError(MIXED_INVOICE_TYPE_MESSAGE);
        setStatusText('');
        toast.error(MIXED_INVOICE_TYPE_MESSAGE);
        return;
      }

      setItems((prev) => applyReminderResults(prev));

      for (let index = 0; index < parsedResults.length; index += 1) {
        const current = parsedResults[index];
        patchItem(current.id, {
          status: 'renaming',
          renamedName: '',
          error: ''
        });
        setStatusText(`正在生成文件名 ${index + 1}/${parsedResults.length}: ${current.file.name}`);

        try {
          const profileToUse = activeProfile || {
            invoiceTypeKey: DEFAULT_INVOICE_TYPE,
            separator,
            showSequence: false,
            showFieldLabel: false,
            items: (ruleFields || DEFAULT_RULE_FIELDS).map((key) => ({ key, enabled: true, dateMode: 'year-month-day', customText: '' }))
          };

          const renamedName = ensureUniqueFileName(
            buildRenamedFileName(current.file.name, current.invoiceData, profileToUse, index + 1),
            usedNames
          );

          zip.file(renamedName, current.file);
          successTotal += 1;
          patchItem(current.id, {
            status: 'renamed',
            renamedName,
            invoiceData: current.invoiceData,
            error: ''
          });
        } catch (renameError) {
          failureTotal += 1;
          patchItem(current.id, {
            status: 'error',
            renamedName: '',
            invoiceData: current.invoiceData || null,
            error: renameError.message || '解析失败'
          });
        }

      }

      if (successTotal === 0) {
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
      setDownloadName(createInvoiceArchiveName('发票重命名文件'));
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
    triggerObjectUrlDownload(downloadUrl, downloadName || createInvoiceArchiveName('发票重命名文件'));
  };

  return (
    <ToolPageShell
      title="PDF 电子发票批量重命名与金额汇总"
      desc="本地完成 PDF 发票解析、金额汇总、批量重命名和 ZIP 打包下载。"
    >
      <div className="invoice-tool">
        <section className="invoice-hero">
          <div>
            <span className="invoice-badge">本地处理</span>
            <h2>批量上传 PDF 发票，一键汇总金额并重命名</h2>
            <p>
              支持先整理每张发票的发票金额、发票税额、价税合计，再按开票日期、
              金额、发票号码、销售方名称等字段自由组合命名并打包下载。
            </p>
            <ul className="invoice-points">
              <li>发票文件仅在本地。</li>
              <li>适合标准可提取文本的 PDF 电子发票，扫描件和加密 PDF 可能无法识别。</li>
              <li>支持批量汇总多张发票的发票金额、税额和价税合计。</li>
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
              <span>已识别文件</span>
              <strong>{recognizedFileCount}</strong>
            </div>
            <div className="invoice-summary-card">
              <span>处理失败</span>
              <strong>{itemErrorCount}</strong>
            </div>
          </div>
        </section>

        <section className="invoice-steps" aria-label="处理步骤">
          <StepItem index="1" label="上传 PDF 发票" active={activeStep === 1} done={activeStep > 1} />
          <StepItem index="2" label="设置命名方式" active={activeStep === 2} done={activeStep > 2} />
          <StepItem index="3" label="识别金额并下载结果" active={activeStep === 3} done={Boolean(downloadUrl)} />
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
                  disabled={isBusy}
                  onClick={() => inputRef.current?.click()}
                >
                  添加文件
                </button>
                <button
                  className="invoice-btn invoice-btn-ghost"
                  type="button"
                  disabled={isBusy || !items.length}
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
              disabled={isBusy}
              onClick={() => inputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                if (!isBusy) {
                  setIsDragging(true);
                }
              }}
              onDragOver={(event) => {
                event.preventDefault();
                if (!isBusy) {
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
                  disabled={isBusy}
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

            <div className="invoice-preview-box">
              <span>提醒策略</span>
              <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <input type="checkbox" checked readOnly />
                  <span>
                    <strong style={{ display: 'block' }}>标准重复标记</strong>
                    <span style={{ color: '#6b829a', fontSize: 13 }}>
                      {isTrainMode
                        ? '火车票优先按发车时间、始发站、终点站、乘车人身份证号判定重复。'
                        : '按发票代码、号码、日期、价税合计等稳定字段判定真重复。'}
                    </span>
                  </span>
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <input
                    type="checkbox"
                    checked={enableAmountMatchReview}
                    disabled={isBusy}
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
                <h3>3. 识别金额或重命名</h3>
                <p>可以先识别金额汇总，再按当前命名规则生成本地 ZIP 下载包。</p>
              </div>
              <div className="invoice-action-buttons">
              <button
                className="invoice-btn invoice-btn-ghost invoice-btn-identify"
                type="button"
                disabled={isBusy || !items.length}
                onClick={handleAnalyzeAmounts}
              >
                  {isAnalyzing ? '识别中...' : `识别金额汇总（共 ${items.length} 张）`}
                </button>
                <button
                  className="invoice-btn invoice-btn-primary"
                  type="button"
                  disabled={isBusy || !items.length}
                  onClick={handleRename}
                >
                  {isRenaming ? '重命名中...' : `开始重命名（共 ${items.length} 张）`}
                </button>
                <button
                  className="invoice-btn invoice-btn-secondary"
                  type="button"
                  disabled={isBusy || !downloadUrl}
                  onClick={handleDownload}
                >
                  下载重命名发票
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
              <h3>金额汇总</h3>
              <p>逐张展示发票金额、发票税额和价税合计，并自动汇总当前已上传发票的金额。</p>
            </div>
          </div>

          {!items.length ? (
            <div className="invoice-empty">还没有添加发票文件，先上传 PDF 后再识别金额汇总。</div>
          ) : (
            <>
              <div className="invoice-amount-summary-grid">
                <div className="invoice-amount-summary-card">
                  <span>已识别发票</span>
                  <strong>{amountSummary.recognizedCount}</strong>
                </div>
                <div className="invoice-amount-summary-card">
                  <span>重复标记</span>
                  <strong>{duplicateCount}</strong>
                </div>
                <div className="invoice-amount-summary-card">
                  <span>金额一致提醒</span>
                  <strong>{enableAmountMatchReview ? amountMatchCount : '--'}</strong>
                </div>
                {isTrainMode ? (
                  <div className="invoice-amount-summary-card">
                    <span>票价合计</span>
                    <strong>{amountSummary.recognizedCount ? formatAmountNumber(amountSummary.ticketPriceTotal) : '--'}</strong>
                  </div>
                ) : (
                  <>
                    <div className="invoice-amount-summary-card">
                      <span>发票金额合计</span>
                      <strong>{amountSummary.recognizedCount ? formatAmountNumber(amountSummary.invoiceAmountTotal) : '--'}</strong>
                    </div>
                    <div className="invoice-amount-summary-card">
                      <span>发票税额合计</span>
                      <strong>{amountSummary.recognizedCount ? formatAmountNumber(amountSummary.taxAmountTotal) : '--'}</strong>
                    </div>
                    <div className="invoice-amount-summary-card">
                      <span>价税合计</span>
                      <strong>{amountSummary.recognizedCount ? formatAmountNumber(amountSummary.totalAmountTotal) : '--'}</strong>
                    </div>
                  </>
                )}
              </div>

              <div className="invoice-amount-table-wrap">
                <table className="invoice-amount-table">
                  <thead>
                    <tr>
                      <th scope="col">发票文件</th>
                      <th scope="col">发票号码</th>
                      {isTrainMode ? (
                        <th scope="col">票价</th>
                      ) : (
                        <>
                          <th scope="col">发票金额</th>
                          <th scope="col">发票税额</th>
                          <th scope="col">价税合计</th>
                        </>
                      )}
                      <th scope="col">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {amountSummary.rows.map((row) => (
                      <tr
                        key={`amount-${row.id}`}
                        className={
                          row.duplicateStatus === 'duplicate'
                            ? 'invoice-ledger-row is-duplicate'
                            : enableAmountMatchReview && row.amountMatchStatus === 'sameAmount'
                              ? 'invoice-ledger-row is-amount-match'
                              : row.duplicateStatus === 'keptWeak'
                                ? 'invoice-ledger-row is-weak'
                                : ''
                        }
                      >
                        <td>
                          <div className="invoice-amount-file">
                            <strong title={row.fileName}>{row.fileName}</strong>
                            <span>{row.issueDate || '待识别开票日期'}</span>
                          </div>
                        </td>
                        <td>{row.invoiceNumber || '--'}</td>
                        {isTrainMode ? (
                          <td className="is-number">{formatAmountNumber(row.ticketPrice)}</td>
                        ) : (
                          <>
                            <td className="is-number">{formatAmountNumber(row.invoiceAmount)}</td>
                            <td className="is-number">{formatAmountNumber(row.taxAmount)}</td>
                            <td className="is-number">{formatAmountNumber(row.totalAmount)}</td>
                          </>
                        )}
                        <td>
                          {row.error ? (
                            <span className="invoice-amount-status-text is-error">{row.error}</span>
                          ) : (
                            <span
                              className={
                                row.status === 'renamed'
                                  ? 'invoice-amount-status-text is-success'
                                  : row.duplicateStatus === 'duplicate'
                                    ? 'invoice-amount-status-text is-error'
                                    : enableAmountMatchReview && row.amountMatchStatus === 'sameAmount'
                                      ? 'invoice-amount-status-text is-identified'
                                  : row.status === 'analyzed'
                                    ? 'invoice-amount-status-text is-identified'
                                    : 'invoice-amount-status-text'
                              }
                            >
                              {row.hasAnyAmount
                                ? row.duplicateStatus === 'duplicate'
                                  ? '重复'
                                  : enableAmountMatchReview && row.amountMatchStatus === 'sameAmount'
                                    ? '金额一致'
                                    : STATUS_LABEL_MAP[row.status] || '已识别'
                                : '待识别'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="2">合计</td>
                      {isTrainMode ? (
                        <td className="is-number">{amountSummary.recognizedCount ? formatAmountNumber(amountSummary.ticketPriceTotal) : '--'}</td>
                      ) : (
                        <>
                          <td className="is-number">{amountSummary.recognizedCount ? formatAmountNumber(amountSummary.invoiceAmountTotal) : '--'}</td>
                          <td className="is-number">{amountSummary.recognizedCount ? formatAmountNumber(amountSummary.taxAmountTotal) : '--'}</td>
                          <td className="is-number">{amountSummary.recognizedCount ? formatAmountNumber(amountSummary.totalAmountTotal) : '--'}</td>
                        </>
                      )}
                      <td>{amountSummary.recognizedCount ? `${amountSummary.recognizedCount} 张` : '--'}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </section>

        <section className="invoice-panel">
          <div className="invoice-panel-head">
            <div>
              <h3>发票列表</h3>
              <p>识别完成后会展示提取到的字段与最终文件名，失败项会给出原因。</p>
            </div>
          </div>

          {!items.length ? (
            <div className="invoice-empty">还没有添加发票文件，先上传 PDF 后再开始处理。</div>
          ) : (
            <div className="invoice-file-list">
              {items.map((item, index) => {
                const extractedFields = formatExtractedFieldList(item.invoiceData, item.invoiceData?.invoiceTypeKey);
                const statusClass = item.status === 'error'
                  ? 'invoice-status-badge is-error'
                  : item.status === 'renamed'
                    ? 'invoice-status-badge is-success'
                    : item.status === 'analyzed'
                      ? 'invoice-status-badge is-identified'
                      : item.status === 'analyzing' || item.status === 'renaming'
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
                        <span className={statusClass}>{STATUS_LABEL_MAP[item.status]}</span>
                        <button
                          className="invoice-mini-btn is-danger"
                          type="button"
                          disabled={isBusy}
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
                      {enableAmountMatchReview && item.amountMatchStatus === 'sameAmount' ? <span>金额一致</span> : null}
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
                      <p className="invoice-muted">尚未解析字段，可先点击“识别金额汇总”或直接开始重命名。</p>
                    )}

                    {item.renamedName ? (
                      <p className="invoice-renamed-name">新文件名：{item.renamedName}</p>
                    ) : null}
                    {item.error ? <p className="error invoice-item-error">{item.error}</p> : null}
                    {!item.error && item.duplicateStatus ? (
                      <p className="invoice-muted">
                        {item.dedupBasis
                          ? `${item.duplicateStatus === 'duplicate' ? '重复' : item.duplicateStatus === 'keptWeak' ? '信息不足' : '唯一'}：${item.dedupBasis}`
                          : item.duplicateStatus === 'duplicate' ? '重复' : item.duplicateStatus === 'keptWeak' ? '信息不足' : '唯一'}
                      </p>
                    ) : null}
                    {!item.error && item.dedupReason ? <p className="invoice-muted">{item.dedupReason}</p> : null}
                    {!item.error && enableAmountMatchReview && item.amountMatchStatus === 'sameAmount' ? (
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
