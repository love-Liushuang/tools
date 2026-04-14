export const INVOICE_RULE_FIELDS = [
  { key: 'issueDate', label: '开票日期', placeholder: '2024-07-09' },
  { key: 'amount', label: '开票金额', placeholder: '699.00' },
  { key: 'invoiceNumber', label: '发票号码', placeholder: '24952000000010211653' },
  { key: 'sellerName', label: '销售方名称', placeholder: '某某科技有限公司' }
];

const FIELD_LABEL_MAP = INVOICE_RULE_FIELDS.reduce((result, item) => {
  result[item.key] = item.label;
  return result;
}, {});

function cleanFieldValue(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeFileNamePart(value) {
  return String(value || '')
    .replace(/[\\/:"*?<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '')
    .trim();
}

function splitBaseName(filename) {
  const match = String(filename || '').match(/^(.*?)(\.[^.]+)?$/);
  return {
    base: match?.[1] || 'invoice',
    ext: match?.[2] || '.pdf'
  };
}

export function buildRulePreview(ruleFields, separator) {
  const joiner = separator ?? '_';
  const previewParts = ruleFields
    .map((fieldKey) => INVOICE_RULE_FIELDS.find((item) => item.key === fieldKey))
    .filter(Boolean)
    .map((item) => item.placeholder);

  if (!previewParts.length) {
    return 'invoice.pdf';
  }

  return `${previewParts.join(joiner)}.pdf`;
}

export function buildRenamedFileName(sourceName, invoiceData, ruleFields, separator) {
  const missingLabels = [];
  const parts = ruleFields
    .map((fieldKey) => {
      const value = sanitizeFileNamePart(invoiceData?.[fieldKey] || '');
      if (!value) {
        missingLabels.push(FIELD_LABEL_MAP[fieldKey] || fieldKey);
      }
      return value;
    })
    .filter(Boolean);

  if (!parts.length) {
    throw new Error('请至少保留一个重命名字段。');
  }

  if (missingLabels.length) {
    throw new Error(`缺少字段：${missingLabels.join('、')}`);
  }

  const { ext } = splitBaseName(sourceName);
  return `${parts.join(separator ?? '_')}${ext || '.pdf'}`;
}

export function ensureUniqueFileName(filename, usedNames) {
  const { base, ext } = splitBaseName(filename);
  let candidate = `${base}${ext || '.pdf'}`;
  let suffix = 2;

  while (usedNames.has(candidate)) {
    candidate = `${base}_${suffix}${ext || '.pdf'}`;
    suffix += 1;
  }

  usedNames.add(candidate);
  return candidate;
}

export function formatExtractedFieldList(invoiceData) {
  return INVOICE_RULE_FIELDS
    .map((field) => ({
      key: field.key,
      label: field.label,
      value: cleanFieldValue(invoiceData?.[field.key] || '')
    }))
    .filter((field) => field.value);
}
