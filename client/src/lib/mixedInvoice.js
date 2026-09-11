import { buildDedupResult } from './invoiceDedup';
import { buildRenamedFileName, ensureUniqueFileName } from './invoicePdf';
import { buildInvoiceLedgerRows, getInvoiceLedgerCellValue, getInvoiceLedgerFieldOptions, normalizeLedgerFieldSelection } from './invoiceLedger';

export const MIXED_INVOICE_TYPES = { standard: '普通发票', train: '火车票', airline: '飞机票' };

export function invoiceAmountCents(data) {
  const value = String(data?.invoiceTypeKey === 'train' ? data.ticketPrice : data?.totalAmount ?? '').trim();
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(value)) throw new Error('未可靠识别票据合计金额，请核对原文件。');
  const cents = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(cents)) throw new Error('票据金额超出可处理范围。');
  return cents;
}

// 仅混合模式调用，分类工具继续使用原解析行为。
export function validateMixedInvoice(data, fullText) {
  const text = fullText.replace(/\s+/g, '');
  if (!MIXED_INVOICE_TYPES[data.invoiceTypeKey] || !/^\d{8,24}$/.test(data.invoiceNumber || '') || !data.issueDate) {
    throw new Error('票据关键字段不完整：需要发票号码、日期及合计。');
  }
  if (data.invoiceTypeKey === 'standard' && (!/(?:电子|普通|专用|增值税).*发票/.test(text) || !/价税合计|小写/.test(text))) {
    throw new Error('未识别到支持的发票标题，请上传普通发票、火车票或飞机票 PDF。');
  }
  if (data.invoiceTypeKey === 'train' && (!data.departureStation || !data.arrivalStation || !data.trainPassengerName)) {
    throw new Error('火车票行程或乘车人信息不完整，请核对原文件。');
  }
  const numbers = new Set(Array.from(text.matchAll(/发票号码[:：]?(\d{8,24})/g), (match) => match[1]));
  if (numbers.size > 1) throw new Error('一个 PDF 中检测到多张发票，请按单张票据拆分后上传。');
  invoiceAmountCents(data);
  const currencies = new Set(Array.from(text.matchAll(/\b(CNY|RMB|USD|EUR|GBP|HKD|JPY|AUD|CAD)\b/gi), (match) => match[1].toUpperCase().replace('RMB', 'CNY')));
  // 中文及金额与代码之间通常没有空格，补充紧邻金额的币种写法。
  for (const match of text.matchAll(/(CNY|RMB|USD|EUR|GBP|HKD|JPY|AUD|CAD)(?=[¥￥\d.-])/gi)) currencies.add(match[1].toUpperCase().replace('RMB', 'CNY'));
  if (/美元|\$/.test(text)) currencies.add('USD');
  if (/欧元|€/.test(text)) currencies.add('EUR');
  if (/英镑|£/.test(text)) currencies.add('GBP');
  if (currencies.size > 1) throw new Error('票面存在多个币种，请核对金额币种后单独处理。');
  return { ...data, currency: [...currencies][0] || 'CNY' };
}

export function annotateMixedInvoices(items) {
  const groups = new Map();
  const output = new Map();
  for (const item of items.filter((item) => item.invoiceData && !item.error)) {
    const key = `${item.invoiceData.invoiceTypeKey}:${item.invoiceData.currency || 'CNY'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  for (const group of groups.values()) {
    const rows = buildDedupResult(group).rows;
    const keepers = new Map(rows.filter((row) => row.status === 'kept').map((row) => [row.dedupKey, row.file.webkitRelativePath || row.file.name]));
    for (const row of rows) output.set(row.id, {
      duplicateStatus: row.status, dedupBasis: row.dedupBasis,
      dedupReason: row.status === 'duplicate' ? `与 ${keepers.get(row.dedupKey)} 重复。` : row.dedupReason
    });
  }
  const amounts = new Map();
  for (const item of items.filter((item) => item.invoiceData && !item.error)) {
    const key = `${item.invoiceData.currency || 'CNY'}:${invoiceAmountCents(item.invoiceData)}`;
    if (!amounts.has(key)) amounts.set(key, []);
    amounts.get(key).push(item.id);
  }
  const matches = new Set([...amounts.values()].filter((ids) => ids.length > 1).flat());
  return items.map((item) => ({ ...item, duplicateStatus: '', dedupReason: '', ...output.get(item.id), amountMatchStatus: matches.has(item.id) ? 'sameAmount' : '' }));
}

export function summarizeMixedInvoices(items) {
  const success = items.filter((item) => item.invoiceData && !item.error);
  const currencies = [...new Set(success.map((item) => item.invoiceData.currency || 'CNY'))];
  if (!currencies.length) currencies.push('CNY');
  const rows = [];
  for (const currency of currencies) {
    for (const [type, label] of [...Object.entries(MIXED_INVOICE_TYPES), ['all', '总计']]) {
      const group = success.filter((item) => (item.invoiceData.currency || 'CNY') === currency && (type === 'all' || item.invoiceData.invoiceTypeKey === type));
      const totalCents = group.reduce((sum, item) => sum + invoiceAmountCents(item.invoiceData), 0);
      const keptCents = group.filter((item) => item.duplicateStatus !== 'duplicate').reduce((sum, item) => sum + invoiceAmountCents(item.invoiceData), 0);
      if (!Number.isSafeInteger(totalCents) || !Number.isSafeInteger(keptCents)) throw new Error('汇总金额超出可处理范围。');
      rows.push({ type, label, currency, count: group.length, duplicateCount: group.filter((item) => item.duplicateStatus === 'duplicate').length, totalCents, keptCents });
    }
  }
  return rows;
}

export function buildMixedRenamePlan(items, profiles, excludeDuplicates = false) {
  const used = new Set();
  return items.filter((item) => item.invoiceData && !item.error && (!excludeDuplicates || item.duplicateStatus !== 'duplicate'))
    .map((item, index) => {
      const profile = profiles[item.invoiceData.invoiceTypeKey];
      if (!profile?.items.some((field) => field.enabled)) throw new Error('请为每种票据至少选择一个命名字段。');
      return { ...item, renamedName: ensureUniqueFileName(buildRenamedFileName(item.file.name, item.invoiceData, profile, index + 1), used) };
    });
}

export async function createMixedInvoiceZip(plan, onProgress) {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  for (const item of plan) zip.file(item.renamedName, await item.file.arrayBuffer());
  return zip.generateAsync({ type: 'blob' }, onProgress);
}

export async function createMixedInvoiceLedger(items, selectionMap) {
  const ExcelJS = (await import('exceljs/dist/exceljs.min.js')).default;
  const workbook = new ExcelJS.Workbook();
  const exportTime = new Date().toISOString();
  const addSheet = (name, headers, rows) => {
    const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = headers.map((header) => ({ header, width: /路径|名称|原因/.test(header) ? 40 : 22 }));
    sheet.addRows(rows);
    sheet.eachRow((row, index) => {
      row.eachCell((cell) => {
        cell.alignment = { vertical: 'top', wrapText: true };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2EAF3' } } };
        if (index === 1) {
          cell.font = { bold: true, color: { argb: 'FF35536B' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF3FC' } };
        }
      });
    });
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: headers.length } };
    return sheet;
  };
  const summary = addSheet('汇总', ['票据类型', '币种', '成功识别数量', '全部金额', '重复数量', '排除重复后金额', '未成功处理数量', '导出时间'],
    summarizeMixedInvoices(items).map((row) => [row.label, row.currency, row.count, row.totalCents / 100, row.duplicateCount, row.keptCents / 100, '', exportTime]));
  summary.addRow(['处理情况', '', items.filter((item) => item.invoiceData && !item.error).length, '', '', '', items.filter((item) => !item.invoiceData || item.error).length, exportTime]);
  for (const col of [4, 6]) summary.getColumn(col).numFmt = '0.00';
  for (const [type, label] of Object.entries(MIXED_INVOICE_TYPES)) {
    const group = items.filter((item) => item.invoiceData?.invoiceTypeKey === type && !item.error);
    const fields = [...new Set([
      'fileName', ...normalizeLedgerFieldSelection(selectionMap[type], type),
      'duplicateStatus', 'duplicateReason', 'amountMatchStatus'
    ])];
    const fieldOptions = new Map(getInvoiceLedgerFieldOptions(type).map((field) => [field.key, field.label]));
    const rows = buildInvoiceLedgerRows(group, {}, { exportTime });
    const sheet = addSheet(label, ['原相对路径', '币种', ...fields.map((key) => fieldOptions.get(key)), '汇总金额'],
      rows.map((row, index) => [
        group[index].file.webkitRelativePath || group[index].file.name,
        group[index].invoiceData.currency || 'CNY',
        ...fields.map((key) => getInvoiceLedgerCellValue(key, row)),
        invoiceAmountCents(group[index].invoiceData) / 100
      ]));
    sheet.getColumn(fields.length + 3).numFmt = '0.00';
  }
  addSheet('未成功处理', ['原文件名', '原相对路径', '失败原因'], items.filter((item) => !item.invoiceData || item.error).map((item) => [item.file.name, item.file.webkitRelativePath || item.file.name, item.error || '尚未处理或已取消']));
  return new Blob([await workbook.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
