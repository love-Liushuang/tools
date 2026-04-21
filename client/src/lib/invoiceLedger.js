import { getLedgerAmountMatchLabel, getLedgerDuplicateLabel } from './invoiceDedup';
import { formatInvoiceFieldValue, getInvoiceFieldLabel } from './invoicePdf';

const LEDGER_META_FIELDS = [
  { key: 'sequence', label: '序号' },
  { key: 'fileName', label: '文件名' },
  { key: 'fileSize', label: '文件大小' },
  { key: 'exportTime', label: '导出时间' },
  { key: 'duplicateStatus', label: '是否重复' },
  { key: 'duplicateBasis', label: '重复依据' },
  { key: 'duplicateReason', label: '重复说明' },
  { key: 'amountMatchStatus', label: '金额提醒' },
  { key: 'amountMatchBasis', label: '金额提醒依据' },
  { key: 'amountMatchReason', label: '金额提醒说明' },
  { key: 'statusText', label: '处理状态' },
  { key: 'error', label: '失败原因' }
];

const LEDGER_INVOICE_FIELD_KEYS = [
  'invoiceTypeName',
  'invoiceCode',
  'invoiceNumber',
  'issueDate',
  'buyerName',
  'buyerTaxId',
  'sellerName',
  'sellerTaxId',
  'invoiceAmount',
  'taxAmount',
  'totalAmount',
  'totalAmountUpper',
  'projectName',
  'remarks',
  'payee',
  'reviewer',
  'issuer'
];

export const DEFAULT_LEDGER_FIELD_KEYS = [
  'sequence',
  'invoiceNumber',
  'issueDate',
  'buyerName',
  'totalAmount',
  'duplicateStatus',
  'duplicateBasis',
  'projectName',
  'remarks',
  'exportTime'
];

export function getInvoiceLedgerFieldOptions() {
  return [
    ...LEDGER_META_FIELDS,
    ...LEDGER_INVOICE_FIELD_KEYS.map((key) => ({
      key,
      label: getInvoiceFieldLabel(key)
    }))
  ];
}

function formatFileSize(size) {
  const bytes = Number(size) || 0;
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatExportTime(value) {
  if (!value) {
    return '';
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function buildInvoiceLedgerRows(items, statusLabelMap = {}, options = {}) {
  const exportTime = formatExportTime(options.exportTime);
  return (items || []).map((item, index) => ({
    sequence: index + 1,
    fileName: item.file?.name || '',
    fileSize: formatFileSize(item.file?.size),
    exportTime,
    duplicateStatus: getLedgerDuplicateLabel(item.duplicateStatus),
    duplicateBasis: item.dedupBasis || '',
    duplicateReason: item.dedupReason || '',
    amountMatchStatus: getLedgerAmountMatchLabel(item.amountMatchStatus),
    amountMatchBasis: item.amountMatchBasis || '',
    amountMatchReason: item.amountMatchReason || '',
    statusText: statusLabelMap[item.status] || item.status || '',
    error: item.error || '',
    invoiceData: item.invoiceData || {}
  }));
}

export function getInvoiceLedgerCellValue(fieldKey, row) {
  switch (fieldKey) {
    case 'sequence':
      return row.sequence;
    case 'fileName':
      return row.fileName;
    case 'fileSize':
      return row.fileSize;
    case 'exportTime':
      return row.exportTime;
    case 'duplicateStatus':
      return row.duplicateStatus;
    case 'duplicateBasis':
      return row.duplicateBasis;
    case 'duplicateReason':
      return row.duplicateReason;
    case 'amountMatchStatus':
      return row.amountMatchStatus;
    case 'amountMatchBasis':
      return row.amountMatchBasis;
    case 'amountMatchReason':
      return row.amountMatchReason;
    case 'statusText':
      return row.statusText;
    case 'error':
      return row.error;
    default:
      return formatInvoiceFieldValue(fieldKey, row.invoiceData, {
        invoiceTypeKey: 'standard'
      });
  }
}

function buildInvoiceLedgerSheetData(rows, selectedFieldKeys) {
  const fieldOptionMap = new Map(
    getInvoiceLedgerFieldOptions().map((field) => [field.key, field])
  );
  const activeFields = (selectedFieldKeys || [])
    .map((fieldKey) => fieldOptionMap.get(fieldKey))
    .filter(Boolean);
  const headerRow = activeFields.map((field) => field.label);
  const bodyRows = rows.map((row) => activeFields.map((field) => getInvoiceLedgerCellValue(field.key, row)));
  return {
    activeFields,
    headerRow,
    bodyRows
  };
}

export async function createInvoiceLedgerBlob(rows, selectedFieldKeys) {
  const { activeFields, headerRow, bodyRows } = buildInvoiceLedgerSheetData(rows, selectedFieldKeys);
  const ExcelJSImport = await import('exceljs/dist/exceljs.min.js');
  const ExcelJS = ExcelJSImport.default || ExcelJSImport;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('发票台账', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  const BORDER_STYLE = {
    top: { style: 'thin', color: { argb: 'FFE2EAF3' } },
    left: { style: 'thin', color: { argb: 'FFE2EAF3' } },
    bottom: { style: 'thin', color: { argb: 'FFE2EAF3' } },
    right: { style: 'thin', color: { argb: 'FFE2EAF3' } }
  };
  const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F8FC' } };
  const DUPLICATE_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0EE' } };
  const AMOUNT_MATCH_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7E8' } };
  const WEAK_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFAEF' } };

  worksheet.columns = activeFields.map((field) => ({
    header: field.label,
    key: field.key,
    width: (
      field.key === 'fileName'
      || field.key === 'remarks'
      || field.key === 'projectName'
      || field.key === 'duplicateReason'
      || field.key === 'amountMatchReason'
    )
      ? 34
      : (field.key === 'buyerName' || field.key === 'sellerName')
        ? 24
        : field.key === 'duplicateBasis'
          ? 24
          : field.key === 'amountMatchBasis'
            ? 18
            : field.key === 'exportTime'
              ? 20
              : field.key === 'error'
                ? 28
                : 16
  }));

  const header = worksheet.getRow(1);
  header.values = headerRow;
  header.height = 24;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF35536B' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.fill = HEADER_FILL;
    cell.border = BORDER_STYLE;
  });

  bodyRows.forEach((values, index) => {
    const row = worksheet.addRow(values);
    const sourceRow = rows[index];
    const fill = sourceRow?.duplicateStatus === '重复'
      ? DUPLICATE_FILL
      : sourceRow?.amountMatchStatus === '金额一致'
        ? AMOUNT_MATCH_FILL
        : sourceRow?.duplicateStatus === '信息不足'
          ? WEAK_FILL
          : null;

    row.eachCell((cell) => {
      cell.alignment = {
        vertical: 'top',
        horizontal: 'left',
        wrapText: false
      };
      cell.border = BORDER_STYLE;
      if (fill) {
        cell.fill = fill;
      }
    });
  });

  if (activeFields.length) {
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, worksheet.rowCount), column: activeFields.length }
    };
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}
