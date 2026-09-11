import { useEffect, useRef, useState } from 'react';
import ToolPageShell from '../components/ToolPageShell';
import { useToast } from '../components/ToastProvider';
import InvoiceRuleSettingsModal from '../components/InvoiceRuleSettingsModal';
import InvoiceLedgerFieldsModal from '../components/InvoiceLedgerFieldsModal';
import { createDefaultRuleProfiles, buildRulePreview } from '../lib/invoicePdf';
import { createDefaultLedgerFieldSelectionMap, getInvoiceLedgerFieldOptions } from '../lib/invoiceLedger';
import { createInvoiceQueueItems, isPdfFile, createInvoiceTimestampedName, triggerObjectUrlDownload } from '../lib/invoicePdfBatch';
import { MIXED_INVOICE_TYPES, annotateMixedInvoices, summarizeMixedInvoices, invoiceAmountCents, buildMixedRenamePlan, createMixedInvoiceZip, createMixedInvoiceLedger } from '../lib/mixedInvoice';
import './InvoiceRenamePage.css';
import './InvoiceDedupPage.css';
import './MixedInvoicePage.css';

function MixedInvoicePage({ mode = 'rename' }) {
  const isLedger = mode === 'ledger';
  const title = isLedger ? '台账导出（混合票据）' : '批量重命名与金额汇总（混合票据）';
  const toast = useToast();
  const fileInput = useRef(null);
  const folderInput = useRef(null);
  const cancelled = useRef(false);
  const mounted = useRef(true);
  const busyRef = useRef(false);
  const [items, setItems] = useState([]);
  const [profiles, setProfiles] = useState(createDefaultRuleProfiles);
  const [fields, setFields] = useState(createDefaultLedgerFieldSelectionMap);
  const [activeType, setActiveType] = useState('standard');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [download, setDownload] = useState(null);
  const [excludeDuplicates, setExcludeDuplicates] = useState(false);
  const [filter, setFilter] = useState('all');
  const summary = summarizeMixedInvoices(items);
  const recognized = items.filter((item) => item.invoiceData && !item.error).length;
  const failed = items.filter((item) => item.error).length;
  const duplicates = items.filter((item) => item.duplicateStatus === 'duplicate').length;
  const visibleItems = items.filter((item) => filter === 'all' || (filter === 'failed' ? item.error : item.invoiceData?.invoiceTypeKey === filter));

  useEffect(() => () => { if (download) URL.revokeObjectURL(download.url); }, [download]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancelled.current = true; };
  }, []);

  function addFiles(fileList) {
    if (busyRef.current) return;
    const incoming = Array.from(fileList || []);
    const pdfs = incoming.filter(isPdfFile);
    const skipped = incoming.length - pdfs.length;
    setItems((previous) => annotateMixedInvoices([...previous, ...createInvoiceQueueItems(pdfs)]));
    setDownload(null);
    setError(pdfs.length ? '' : '没有找到 PDF 文件。');
    setStatus(`已添加 ${pdfs.length} 个 PDF，跳过 ${skipped} 个非 PDF 文件。`);
  }

  function removeItem(id) {
    if (busyRef.current) return;
    setItems((previous) => annotateMixedInvoices(previous.filter((item) => item.id !== id)));
    setDownload(null);
  }

  async function run(action) {
    if (busyRef.current) return;
    if (!items.length) { setError('请先选择文件夹或 PDF 文件。'); return; }
    busyRef.current = true;
    cancelled.current = false;
    setBusy(true);
    setStage('parse');
    setError('');
    setDownload(null);
    const runtime = items.map((item) => ({ ...item, renamedName: '', error: '', status: 'pending' }));
    setItems(runtime.map((item) => ({ ...item })));
    try {
      setStatus('正在加载 PDF 解析引擎…');
      const { extractInvoiceFromPdf } = await import('../lib/invoicePdfParser');
      for (let index = 0; index < runtime.length; index += 1) {
        if (cancelled.current) break;
        const item = runtime[index];
        setStatus(`正在识别 ${index + 1}/${runtime.length}：${item.file.name}`);
        item.status = 'processing';
        try {
          item.invoiceData = item.invoiceData || await extractInvoiceFromPdf(item.file, { strict: true });
          item.status = 'analyzed';
        } catch (parseError) {
          item.invoiceData = null;
          item.status = 'error';
          item.error = parseError.message || '解析失败，请核对 PDF。';
        }
        if (mounted.current) setItems(runtime.map((row) => ({ ...row })));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (!mounted.current) return;
      for (const item of runtime) {
        if (item.status === 'pending') {
          item.invoiceData = null;
          item.error = '已取消，尚未处理';
          item.status = 'error';
        }
      }
      const result = annotateMixedInvoices(runtime);
      setItems(result);
      const successes = result.filter((item) => item.invoiceData && !item.error).length;
      const failures = result.length - successes;
      if (cancelled.current) {
        setStatus('已取消，保留已识别结果。可再次处理以继续。');
        return;
      }
      if (action === 'analyze') {
        setStatus(`识别完成：成功 ${successes} 个，未成功 ${failures} 个。`);
        return;
      }
      setStage('export');
      let blob;
      if (action === 'ledger') {
        setStatus('正在生成汇总、分类明细和未成功处理工作表…');
        blob = await createMixedInvoiceLedger(result, fields);
      } else {
        const plan = buildMixedRenamePlan(result, profiles, excludeDuplicates);
        if (!plan.length) throw new Error('没有可下载的成功票据，请检查处理结果。');
        const names = new Map(plan.map((item) => [item.id, item.renamedName]));
        setItems(result.map((item) => ({ ...item, renamedName: names.get(item.id) || '' })));
        blob = await createMixedInvoiceZip(plan, (progress) => {
          if (mounted.current) setStatus(`正在生成 ZIP：${Math.round(progress.percent)}%`);
        });
      }
      if (!mounted.current) return;
      setDownload({ url: URL.createObjectURL(blob), name: createInvoiceTimestampedName(isLedger ? '混合票据台账' : '混合票据重命名', isLedger ? 'xlsx' : 'zip') });
      setStatus(`处理完成：成功识别 ${successes} 个，未成功 ${failures} 个。${isLedger ? '已生成五个工作表。' : '重命名文件已放在 ZIP 根目录。'}`);
      toast.success('处理完成，可以下载结果。');
    } catch (runtimeError) {
      if (mounted.current) { setError(runtimeError.message || '处理失败。'); setStatus(''); }
    } finally {
      busyRef.current = false;
      if (mounted.current) { setBusy(false); setStage(''); }
    }
  }

  return (
    <ToolPageShell title={title} desc="普通发票、火车票和飞机票统一上传，自动识别类型，全程在浏览器本地处理。">
      <div className="invoice-tool mixed-invoice">
        <section className="invoice-hero">
          <div>
            <span className="invoice-badge">本地处理</span>
            <h2>一个文件夹，整理三类票据</h2>
            <p>{isLedger ? '一份 Excel 包含汇总、普通发票、火车票、飞机票和未成功处理五个工作表。' : '每类票据使用自己的命名规则，所有成功文件统一打包到一个 ZIP 中。'}</p>
            <ul className="invoice-points">
              <li>选择文件夹时包含子文件夹，仅处理 PDF。</li>
              <li>每个 PDF 对应一张票据；扫描件和加密文件会列出失败原因。</li>
              <li>普通发票取价税合计，火车票取票价，飞机票取合计；不同币种分别汇总。</li>
            </ul>
          </div>
          <div className="invoice-summary-grid">
            {[[items.length, '已添加文件'], [recognized, '已识别票据'], [duplicates, '重复票据'], [failed, '未成功处理']].map(([value, label]) => (
              <div className="invoice-summary-card" key={label}><span>{label}</span><strong>{value}</strong></div>
            ))}
          </div>
        </section>

        <div className="invoice-grid">
          <section className="invoice-panel">
            <div className="invoice-panel-head"><div><h3>1. 上传票据</h3><p>可多次添加文件夹或文件。</p></div></div>
            <div className="invoice-panel-actions">
              <button className="invoice-btn invoice-btn-primary" disabled={busy} onClick={() => folderInput.current?.click()}>选择文件夹</button>
              <button className="invoice-btn invoice-btn-secondary" disabled={busy} onClick={() => fileInput.current?.click()}>选择 PDF 文件</button>
              <button className="invoice-btn invoice-btn-ghost" disabled={busy || !items.length} onClick={() => { setItems([]); setDownload(null); setError(''); setStatus(''); }}>清空列表</button>
            </div>
            <input ref={fileInput} className="invoice-hidden-input" type="file" accept=".pdf,application/pdf" multiple disabled={busy} onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />
            <input ref={folderInput} className="invoice-hidden-input" type="file" webkitdirectory="" directory="" multiple disabled={busy} onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />
            <div className="invoice-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }}>
              <strong>也可以拖入多个 PDF 文件</strong><p>上传整个文件夹请使用“选择文件夹”。</p>
            </div>
          </section>
          <section className="invoice-panel">
            <div className="invoice-panel-head"><div><h3>2. {isLedger ? '分类台账字段' : '分类命名规则'}</h3><p>分别设置三类票据，识别后自动应用。</p></div></div>
            <div className="invoice-panel-actions" role="group" aria-label="选择票据类型">
              {Object.entries(MIXED_INVOICE_TYPES).map(([type, label]) => <button key={type} className={`invoice-btn ${activeType === type ? 'invoice-btn-primary' : 'invoice-btn-ghost'}`} disabled={busy} aria-pressed={activeType === type} onClick={() => setActiveType(type)}>{label}</button>)}
            </div>
            <div className="invoice-preview-box"><span>{MIXED_INVOICE_TYPES[activeType]}{isLedger ? '字段预览' : '命名预览'}</span><strong style={{ overflowWrap: 'anywhere' }}>{isLedger ? fields[activeType].map((key) => getInvoiceLedgerFieldOptions(activeType).find((field) => field.key === key)?.label).filter(Boolean).join(' / ') : buildRulePreview(activeType, profiles[activeType])}</strong></div>
            <button className="invoice-btn invoice-btn-secondary" disabled={busy} onClick={() => setSettingsOpen(true)}>{isLedger ? '设置导出字段' : '设置命名规则'}</button>
            {!isLedger && <label style={{ display: 'block', marginTop: 12 }}><input type="checkbox" disabled={busy} checked={excludeDuplicates} onChange={(event) => { setExcludeDuplicates(event.target.checked); setDownload(null); }} /> ZIP 中排除已确认重复的票据</label>}
            <p className="invoice-muted">金额一致仅作提醒，不会自动判重。信息不足的票据保留，重复项在列表和台账中标注。</p>
          </section>

          <section className="invoice-panel">
            <div className="invoice-action-bar"><h3>3. 识别并下载</h3><div className="invoice-action-buttons">
              <button className="invoice-btn invoice-btn-secondary" disabled={busy || !items.length} onClick={() => run('analyze')}>识别金额汇总</button>
              <button className="invoice-btn invoice-btn-primary" disabled={busy || !items.length} onClick={() => run(isLedger ? 'ledger' : 'rename')}>{isLedger ? '生成 Excel 台账' : '批量重命名并打包'}</button>
              {busy && stage === 'parse' && <button className="invoice-btn invoice-btn-ghost" onClick={() => { cancelled.current = true; setStatus('将在当前文件识别完成后停止…'); }}>取消处理</button>}
              {download && <button className="invoice-btn invoice-btn-secondary" onClick={() => triggerObjectUrlDownload(download.url, download.name)}>下载{isLedger ? ' Excel' : ' ZIP'}</button>}
            </div></div>
            <p role="status" aria-live="polite">{status}</p>{error && <p className="error" role="alert">{error}</p>}
          </section>
        </div>

        <section className="invoice-panel">
          <div className="invoice-panel-head"><div><h3>金额汇总</h3><p>失败文件不计入金额。排除重复后的金额仍包含信息不足、按保留处理的票据。</p></div></div>
          <div className="invoice-amount-table-wrap"><table className="invoice-amount-table"><thead><tr>{['类型', '币种', '成功数量', '全部金额', '重复数量', '排除重复后金额'].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>
            {summary.map((row) => <tr key={`${row.currency}-${row.type}`}><td>{row.label}</td><td>{row.currency}</td><td>{row.count}</td><td>{(row.totalCents / 100).toFixed(2)}</td><td>{row.duplicateCount}</td><td>{(row.keptCents / 100).toFixed(2)}</td></tr>)}
          </tbody></table></div>
        </section>

        <section className="invoice-panel">
          <div className="invoice-panel-head"><h3>票据列表</h3><label>筛选 <select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">全部</option>{Object.entries(MIXED_INVOICE_TYPES).map(([type, label]) => <option key={type} value={type}>{label}</option>)}<option value="failed">未成功处理</option></select></label></div>
          {!visibleItems.length ? <p className="invoice-empty">暂无票据。</p> : <div className="invoice-file-list">{visibleItems.map((item) => <article className="invoice-file-card" key={item.id}>
            <div className="invoice-file-card-head"><strong style={{ overflowWrap: 'anywhere' }}>{item.file.webkitRelativePath || item.file.name}</strong><button className="invoice-mini-btn is-danger" disabled={busy} onClick={() => removeItem(item.id)}>移除</button></div>
            {item.invoiceData && !item.error && <div className="invoice-field-chips"><span className="invoice-field-chip">{MIXED_INVOICE_TYPES[item.invoiceData.invoiceTypeKey]}</span><span className="invoice-field-chip">发票号码：{item.invoiceData.invoiceNumber}</span><span className="invoice-field-chip">金额：{(invoiceAmountCents(item.invoiceData) / 100).toFixed(2)} {item.invoiceData.currency}</span></div>}
            {item.renamedName && <p className="invoice-renamed-name">新文件名：{item.renamedName}</p>}
            {item.error ? <p className="error">{item.error}</p> : <p className="invoice-muted">{item.dedupReason || (item.status === 'analyzed' ? '已识别' : '待识别')}{item.amountMatchStatus ? ' 金额一致，仅提醒。' : ''}</p>}
          </article>)}</div>}
        </section>
      </div>
      {settingsOpen && (isLedger ? <InvoiceLedgerFieldsModal fixedInvoiceTypeKey={activeType} initialSelectionMap={fields} onCancel={() => setSettingsOpen(false)} onSave={({ selectionMap }) => { setFields(selectionMap); setSettingsOpen(false); setDownload(null); }} /> : <InvoiceRuleSettingsModal fixedInvoiceTypeKey={activeType} initialProfile={profiles[activeType]} onCancel={() => setSettingsOpen(false)} onSave={(profile) => { setProfiles((previous) => ({ ...previous, [activeType]: profile })); setSettingsOpen(false); setDownload(null); }} />)}
    </ToolPageShell>
  );
}

export default MixedInvoicePage;
