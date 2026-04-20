import { getLedgerDuplicateLabel } from './invoiceDedup';
import { formatInvoiceFieldValue, getInvoiceFieldLabel } from './invoicePdf';

const LEDGER_META_FIELDS = [
  { key: 'sequence', label: '序号' },
  { key: 'fileName', label: '文件名' },
  { key: 'fileSize', label: '文件大小' },
  { key: 'exportTime', label: '导出时间' },
  { key: 'duplicateStatus', label: '是否重复' },
  { key: 'duplicateBasis', label: '重复依据' },
  { key: 'duplicateReason', label: '重复说明' },
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
  const XLSX = await import('xlsx');
  const { activeFields, headerRow, bodyRows } = buildInvoiceLedgerSheetData(rows, selectedFieldKeys);
  const worksheet = XLSX.utils.aoa_to_sheet([headerRow, ...bodyRows]);

  worksheet['!cols'] = activeFields.map((field) => {
    if (field.key === 'fileName' || field.key === 'remarks' || field.key === 'projectName' || field.key === 'duplicateReason') {
      return { wch: 34 };
    }
    if (field.key === 'buyerName' || field.key === 'sellerName') {
      return { wch: 24 };
    }
    if (field.key === 'duplicateBasis') {
      return { wch: 24 };
    }
    if (field.key === 'exportTime') {
      return { wch: 20 };
    }
    if (field.key === 'error') {
      return { wch: 28 };
    }
    return { wch: 16 };
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '发票台账');
  const arrayBuffer = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array'
  });
  return new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}
