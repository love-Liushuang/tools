export const DEFAULT_INVOICE_TYPE = 'standard';

export const DATE_MODE_OPTIONS = [
  { key: 'year', label: '取年' },
  { key: 'year-month', label: '取年月' },
  { key: 'year-month-day', label: '取年月日' }
];

export const SEPARATOR_OPTIONS = [
  { key: '_', label: '_' },
  { key: '-', label: '-' },
  { key: '+', label: '+' },
  { key: ' ', label: '空格' },
  { key: '', label: '无' }
];

export const DEFAULT_SEPARATOR = '+';

export const INVOICE_FIELD_MAP = {
  invoiceTypeName: {
    key: 'invoiceTypeName',
    label: '发票类型',
    kind: 'text',
    sample: '普票'
  },
  invoiceCode: {
    key: 'invoiceCode',
    label: '发票代码',
    kind: 'text',
    sample: '2832200450'
  },
  invoiceNumber: {
    key: 'invoiceNumber',
    label: '发票号码',
    kind: 'text',
    sample: '231420000000037815'
  },
  issueDate: {
    key: 'issueDate',
    label: '开票日期',
    kind: 'date',
    sample: '2025年05月01日',
    defaultDateMode: 'year-month-day'
  },
  buyerName: {
    key: 'buyerName',
    label: '购买方名称',
    kind: 'text',
    sample: '深圳市XX科技有限公司'
  },
  buyerTaxId: {
    key: 'buyerTaxId',
    label: '购买方税号',
    kind: 'text',
    sample: '9171X581MXXK0TB4XA'
  },
  sellerName: {
    key: 'sellerName',
    label: '销售方名称',
    kind: 'text',
    sample: '广州市XXX科技有限公司'
  },
  sellerTaxId: {
    key: 'sellerTaxId',
    label: '销售方税号',
    kind: 'text',
    sample: '8271X5T1M9XK0TD4XX'
  },
  invoiceAmount: {
    key: 'invoiceAmount',
    label: '发票金额',
    kind: 'amount',
    sample: '49.50'
  },
  taxAmount: {
    key: 'taxAmount',
    label: '发票税额',
    kind: 'amount',
    sample: '0.50'
  },
  totalAmount: {
    key: 'totalAmount',
    label: '价税合计',
    kind: 'amount',
    sample: '50.00'
  },
  totalAmountUpper: {
    key: 'totalAmountUpper',
    label: '价税合计大写',
    kind: 'text',
    sample: '伍拾圆整'
  },
  projectName: {
    key: 'projectName',
    label: '项目名称',
    kind: 'text',
    sample: '*信息技术服务*软件服务费'
  },
  remarks: {
    key: 'remarks',
    label: '备注',
    kind: 'text',
    sample: '订单号：SD15D54ADA126E'
  },
  payee: {
    key: 'payee',
    label: '收款人',
    kind: 'text',
    sample: '王小二'
  },
  reviewer: {
    key: 'reviewer',
    label: '复核人',
    kind: 'text',
    sample: '李小三'
  },
  issuer: {
    key: 'issuer',
    label: '开票人',
    kind: 'text',
    sample: '张小四'
  },
  departureStation: {
    key: 'departureStation',
    label: '始发站',
    kind: 'text',
    sample: '广州南站'
  },
  arrivalStation: {
    key: 'arrivalStation',
    label: '终点站',
    kind: 'text',
    sample: '北京北站'
  },
  departureTime: {
    key: 'departureTime',
    label: '发车时间',
    kind: 'datetime',
    sample: '2025年05月01日'
  },
  seatNumber: {
    key: 'seatNumber',
    label: '坐位号',
    kind: 'text',
    sample: '04车11A号(二等座)'
  },
  ticketPrice: {
    key: 'ticketPrice',
    label: '票价',
    kind: 'amount',
    sample: '800.00'
  },
  trainPassengerName: {
    key: 'trainPassengerName',
    label: '乘车人姓名',
    kind: 'text',
    sample: '李白'
  },
  trainPassengerIdNumber: {
    key: 'trainPassengerIdNumber',
    label: '乘车人身份证号',
    kind: 'text',
    sample: '41270119******0533'
  },
  customContent: {
    key: 'customContent',
    label: '自定义内容',
    kind: 'custom',
    sample: '请填写自定义内容'
  }
};

export const INVOICE_TYPE_MAP = {
  standard: {
    key: 'standard',
    label: '常规发票',
    fields: [
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
      'remarks',
      'payee',
      'reviewer',
      'issuer',
      'customContent'
    ]
  },
  train: {
    key: 'train',
    label: '火车发票',
    fields: [
      'invoiceNumber',
      'issueDate',
      'departureStation',
      'arrivalStation',
      'departureTime',
      'seatNumber',
      'ticketPrice',
      'trainPassengerName',
      'trainPassengerIdNumber',
      'customContent'
    ]
  }
};

export const INVOICE_TYPES = Object.values(INVOICE_TYPE_MAP);

export const INVOICE_RULE_FIELDS = Object.values(INVOICE_FIELD_MAP).map((f) => ({ key: f.key, label: f.label }));

// Default selected fields for initial rule profile (standard invoice)
export const DEFAULT_SELECTED_FIELDS = [
  'invoiceNumber',
  'issueDate',
  'buyerName',
  'sellerName',
  'totalAmount'
];

const FIELD_LABEL_MAP = Object.values(INVOICE_FIELD_MAP).reduce((result, field) => {
  result[field.key] = field.label;
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

function normalizeDateInput(value) {
  const text = cleanFieldValue(value);
  if (!text) {
    return null;
  }

  const datetimeMatch = text.match(
    /(\d{4})[年./-]?(\d{1,2})[月./-]?(\d{1,2})[日\sT]*([0-2]?\d):([0-5]\d)/
  );
  if (datetimeMatch) {
    return {
      year: datetimeMatch[1],
      month: datetimeMatch[2].padStart(2, '0'),
      day: datetimeMatch[3].padStart(2, '0'),
      hour: datetimeMatch[4].padStart(2, '0'),
      minute: datetimeMatch[5].padStart(2, '0')
    };
  }

  const digitsOnly = text.replace(/[^\d]/g, '');
  if (digitsOnly.length >= 8) {
    return {
      year: digitsOnly.slice(0, 4),
      month: digitsOnly.slice(4, 6),
      day: digitsOnly.slice(6, 8)
    };
  }

  const dateMatch = text.match(/(\d{4})[年./-]?(\d{1,2})[月./-]?(\d{1,2})/);
  if (dateMatch) {
    return {
      year: dateMatch[1],
      month: dateMatch[2].padStart(2, '0'),
      day: dateMatch[3].padStart(2, '0')
    };
  }

  const monthMatch = text.match(/(\d{4})[年./-]?(\d{1,2})/);
  if (monthMatch) {
    return {
      year: monthMatch[1],
      month: monthMatch[2].padStart(2, '0')
    };
  }

  const yearMatch = text.match(/(\d{4})/);
  if (yearMatch) {
    return {
      year: yearMatch[1]
    };
  }

  return null;
}

function formatDateValue(value, dateMode) {
  const normalized = normalizeDateInput(value);
  if (!normalized || !normalized.year) {
    return cleanFieldValue(value);
  }

  if (dateMode === 'year') {
    return `${normalized.year}年`;
  }

  if (dateMode === 'year-month') {
    return normalized.month ? `${normalized.year}年${normalized.month}月` : `${normalized.year}年`;
  }

  return normalized.month && normalized.day
    ? `${normalized.year}年${normalized.month}月${normalized.day}日`
    : normalized.month
      ? `${normalized.year}年${normalized.month}月`
      : `${normalized.year}年`;
}

function getFieldMeta(fieldKey) {
  return INVOICE_FIELD_MAP[fieldKey] || { key: fieldKey, label: fieldKey, kind: 'text', sample: fieldKey };
}

export function getInvoiceFieldMeta(fieldKey) {
  return getFieldMeta(fieldKey);
}

export function getInvoiceFieldLabel(fieldKey) {
  return getFieldMeta(fieldKey).label;
}

function getInvoiceTypeNameValue(invoiceTypeKey, meta) {
  const sampleValue = cleanFieldValue(meta?.sample || '');
  if (sampleValue) {
    return sampleValue;
  }

  const typeLabel = invoiceTypeKey && INVOICE_TYPE_MAP[invoiceTypeKey]
    ? INVOICE_TYPE_MAP[invoiceTypeKey].label
    : '';

  return cleanFieldValue(typeLabel);
}

function formatRuleItemValue(item, invoiceData, options = {}) {
  const meta = getFieldMeta(item.key);
  const rawValue = item.key === 'customContent'
    ? item.customText || ''
    : invoiceData?.[item.key] || '';

  if (!rawValue) {
    // special-case: keep preview and final filename consistent for invoice type text
    if (item.key === 'invoiceTypeName') {
      const fallback = getInvoiceTypeNameValue(options?.invoiceTypeKey, meta);
      if (!fallback) return '';
      return options && options.showFieldLabel ? `${meta.label}${fallback}` : fallback;
    }

    return '';
  }

  const value = meta.kind === 'date'
    ? formatDateValue(rawValue, item.dateMode || meta.defaultDateMode || 'year-month-day')
    : cleanFieldValue(rawValue);

  if (!value) {
    return '';
  }

  if (options.showFieldLabel) {
    return `${meta.label}${value}`;
  }

  return value;
}

function buildSequencePart(sequenceNumber) {
  if (!Number.isFinite(sequenceNumber) || sequenceNumber <= 0) {
    return '';
  }
  return String(sequenceNumber);
}

function getPreviewValue(item, options = {}) {
  const meta = getFieldMeta(item.key);
  if (item.key === 'customContent') {
    return item.customText || meta.sample;
  }
  const sample = item.key === 'invoiceTypeName'
    ? getInvoiceTypeNameValue(options?.invoiceTypeKey, meta) || meta.label
    : meta.sample || meta.label;
  const value = meta.kind === 'date'
    ? formatDateValue(sample, item.dateMode || meta.defaultDateMode || 'year-month-day')
    : sample;

  if (options.showFieldLabel) {
    return `${meta.label}${value}`;
  }

  return value;
}

function joinFileNameParts(parts, separator) {
  const joiner = separator ?? DEFAULT_SEPARATOR;
  return parts.filter(Boolean).join(joiner);
}

export function createDefaultRuleProfile(invoiceTypeKey) {
  const invoiceType = INVOICE_TYPE_MAP[invoiceTypeKey] || INVOICE_TYPE_MAP[DEFAULT_INVOICE_TYPE];
  return {
    invoiceTypeKey: invoiceType.key,
    separator: DEFAULT_SEPARATOR,
    showSequence: false,
    showFieldLabel: false,
    items: invoiceType.fields.map((fieldKey) => {
      const meta = getFieldMeta(fieldKey);
      // For standard invoice use DEFAULT_SELECTED_FIELDS, otherwise enable by default
      const enabledDefault = invoiceType.key === DEFAULT_INVOICE_TYPE
        ? DEFAULT_SELECTED_FIELDS.includes(fieldKey)
        : (fieldKey !== 'customContent');
      return {
        key: fieldKey,
        enabled: enabledDefault,
        dateMode: meta.defaultDateMode || 'year-month-day',
        customText: ''
      };
    })
  };
}

export function createDefaultRuleProfiles() {
  return INVOICE_TYPES.reduce((result, type) => {
    result[type.key] = createDefaultRuleProfile(type.key);
    return result;
  }, {});
}

export function cloneRuleProfiles(profiles) {
  return JSON.parse(JSON.stringify(profiles || {}));
}

export function getRuleProfile(profileMap, invoiceTypeKey) {
  return profileMap?.[invoiceTypeKey] || createDefaultRuleProfile(invoiceTypeKey);
}

export function getEnabledRuleItems(profile) {
  return (profile?.items || []).filter((item) => item.enabled);
}

function buildRulePreviewForProfile(invoiceTypeKey, profile) {
  const activeProfile = getRuleProfile({ [invoiceTypeKey]: profile }, invoiceTypeKey);
  const parts = [];

  if (activeProfile.showSequence) {
    parts.push('1');
  }

  getEnabledRuleItems(activeProfile).forEach((item) => {
    const value = getPreviewValue(item, {
      showFieldLabel: activeProfile.showFieldLabel,
      invoiceTypeKey: activeProfile.invoiceTypeKey
    });
    if (value) {
      parts.push(value);
    }
  });

  if (!parts.length) {
    return 'invoice.pdf';
  }

  return `${joinFileNameParts(parts, activeProfile.separator)}.pdf`;
}

// Backwards-compatible wrapper for buildRulePreview.
// Supports two signatures:
//  - buildRulePreview(ruleFieldsArray, separatorString) -> string
//  - buildRulePreview(invoiceTypeKey, profileObject) -> string
export function buildRulePreview(arg1, arg2) {
  // legacy usage: (ruleFieldsArray, separator)
  if (Array.isArray(arg1)) {
    const ruleFields = arg1;
    const separator = arg2 ?? DEFAULT_SEPARATOR;
    const profile = {
      invoiceTypeKey: DEFAULT_INVOICE_TYPE,
      separator,
      showSequence: false,
      showFieldLabel: false,
      items: ruleFields.map((key) => {
        const meta = getFieldMeta(key);
        return {
          key,
          enabled: true,
          dateMode: meta.defaultDateMode || 'year-month-day',
          customText: ''
        };
      })
    };
    return buildRulePreviewForProfile(DEFAULT_INVOICE_TYPE, profile);
  }

  // modern usage: (invoiceTypeKey, profile)
  return buildRulePreviewForProfile(arg1, arg2);
}

function buildRenamedFileNameDetailed(sourceName, invoiceData, profile, sequenceNumber) {
  const missingFields = [];
  const parts = [];
  const sequencePart = profile?.showSequence ? buildSequencePart(sequenceNumber) : '';

  if (sequencePart) {
    parts.push(sequencePart);
  }

  let dataPartCount = 0;
  getEnabledRuleItems(profile).forEach((item) => {
    const value = sanitizeFileNamePart(
      formatRuleItemValue(item, invoiceData, { showFieldLabel: profile?.showFieldLabel, invoiceTypeKey: profile?.invoiceTypeKey })
    );

    if (value) {
      parts.push(value);
      dataPartCount += 1;
      return;
    }

    if (item.key !== 'customContent' || item.customText) {
      missingFields.push(FIELD_LABEL_MAP[item.key] || item.key);
    }
  });

  if (!dataPartCount) {
    throw new Error('未识别到可用于命名的字段，请调整规则或更换可识别的 PDF 发票。');
  }

  const { ext } = splitBaseName(sourceName);
  return {
    filename: `${joinFileNameParts(parts, profile?.separator)}${ext || '.pdf'}`,
    missingFields
  };
}

// Backwards-compatible wrapper for buildRenamedFileName.
// Legacy signature: (sourceName, invoiceData, ruleFieldsArray, separatorString)
// New signature: (sourceName, invoiceData, profileObject, sequenceNumber?) -> returns filename string
export function buildRenamedFileName(sourceName, invoiceData, profileOrFields, separatorOrSequence) {
  // legacy: profileOrFields is an array of field keys
  if (Array.isArray(profileOrFields)) {
    const ruleFields = profileOrFields;
    const separator = typeof separatorOrSequence === 'string' ? separatorOrSequence : DEFAULT_SEPARATOR;
    const profile = {
      invoiceTypeKey: DEFAULT_INVOICE_TYPE,
      separator,
      showSequence: false,
      showFieldLabel: false,
      items: ruleFields.map((key) => {
        const meta = getFieldMeta(key);
        return {
          key,
          enabled: true,
          dateMode: meta.defaultDateMode || 'year-month-day',
          customText: ''
        };
      })
    };
    const result = buildRenamedFileNameDetailed(sourceName, invoiceData, profile);
    return result.filename;
  }

  // modern usage: profileOrFields is a profile object
  const sequenceNumber = typeof separatorOrSequence === 'number' ? separatorOrSequence : undefined;
  const result = buildRenamedFileNameDetailed(sourceName, invoiceData, profileOrFields, sequenceNumber);
  return result.filename || result;
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

export function formatExtractedFieldList(invoiceData, invoiceTypeKey) {
  const orderedKeys = invoiceTypeKey && INVOICE_TYPE_MAP[invoiceTypeKey]
    ? INVOICE_TYPE_MAP[invoiceTypeKey].fields
    : Object.keys(INVOICE_FIELD_MAP);

  return orderedKeys
    .map((fieldKey) => {
      const meta = getFieldMeta(fieldKey);
      return {
        key: fieldKey,
        label: meta.label,
        value: cleanFieldValue(invoiceData?.[fieldKey] || '')
      };
    })
    .filter((field) => field.value);
}

export function formatInvoiceFieldValue(fieldKey, invoiceData, options = {}) {
  if (!fieldKey) {
    return '';
  }

  const meta = getFieldMeta(fieldKey);
  const showFieldLabel = !!options.showFieldLabel;
  const invoiceTypeKey = options.invoiceTypeKey || DEFAULT_INVOICE_TYPE;
  const dateMode = options.dateMode || meta.defaultDateMode || 'year-month-day';
  const rawValue = invoiceData?.[fieldKey] || '';

  let value = '';

  if (fieldKey === 'invoiceTypeName') {
    value = cleanFieldValue(rawValue) || getInvoiceTypeNameValue(invoiceTypeKey, meta);
  } else if (meta.kind === 'date' && rawValue) {
    value = formatDateValue(rawValue, dateMode);
  } else {
    value = cleanFieldValue(rawValue);
  }

  if (!value) {
    return '';
  }

  return showFieldLabel ? `${meta.label}${value}` : value;
}

export function getPreviewLength(invoiceTypeKey, profile) {
  return buildRulePreview(invoiceTypeKey, profile).length;
}

// UI helper exports and validation
export const RULE_SETTINGS = {
  dateModeOptions: DATE_MODE_OPTIONS,
  separatorOptions: SEPARATOR_OPTIONS,
  defaultSeparator: DEFAULT_SEPARATOR,
  defaultDateMode: 'year-month-day',
  toggles: {
    showSequence: { key: 'showSequence', label: '显示序号', default: false },
    showFieldLabel: { key: 'showFieldLabel', label: '显示字段标签', default: false }
  }
};

export function getFieldsForInvoiceType(invoiceTypeKey) {
  const invoiceType = INVOICE_TYPE_MAP[invoiceTypeKey] || INVOICE_TYPE_MAP[DEFAULT_INVOICE_TYPE];
  return invoiceType.fields.map((fieldKey) => {
    const meta = getFieldMeta(fieldKey);
    return {
      key: meta.key,
      label: meta.label,
      kind: meta.kind,
      sample: meta.sample,
      defaultDateMode: meta.defaultDateMode || null
    };
  });
}

export function getAvailableRuleSettings(invoiceTypeKey) {
  return {
    invoiceTypeKey: invoiceTypeKey || DEFAULT_INVOICE_TYPE,
    fields: getFieldsForInvoiceType(invoiceTypeKey),
    dateModeOptions: DATE_MODE_OPTIONS,
    separatorOptions: SEPARATOR_OPTIONS,
    toggles: {
      showSequence: false,
      showFieldLabel: false
    }
  };
}

export function validateAndNormalizeProfile(profile, invoiceTypeKey) {
  const invoiceType = INVOICE_TYPE_MAP[invoiceTypeKey] || INVOICE_TYPE_MAP[DEFAULT_INVOICE_TYPE];
  const defaultProfile = createDefaultRuleProfile(invoiceType.key);

  if (!profile || typeof profile !== 'object') {
    return defaultProfile;
  }

  const normalized = {
    invoiceTypeKey: invoiceType.key,
    separator: SEPARATOR_OPTIONS.some((o) => o.key === profile.separator) ? profile.separator : defaultProfile.separator,
    showSequence: !!profile.showSequence,
    showFieldLabel: !!profile.showFieldLabel,
    items: []
  };

  const itemsMap = (profile.items || []).reduce((acc, item) => {
    if (item && item.key) acc[item.key] = item;
    return acc;
  }, {});

  invoiceType.fields.forEach((fieldKey) => {
    const meta = getFieldMeta(fieldKey);
    const raw = itemsMap[fieldKey] || {};
    normalized.items.push({
      key: fieldKey,
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : (fieldKey !== 'customContent'),
      dateMode: raw.dateMode || meta.defaultDateMode || 'year-month-day',
      customText: String(raw.customText || '')
    });
  });

  if (!normalized.items.find((i) => i.key === 'customContent')) {
    normalized.items.push({
      key: 'customContent',
      enabled: false,
      dateMode: 'year-month-day',
      customText: ''
    });
  }

  return normalized;
}

export const SAMPLE_INVOICE_DATA = INVOICE_TYPES.reduce((map, type) => {
  const data = {};
  (type.fields || []).forEach((key) => {
    data[key] = INVOICE_FIELD_MAP[key]?.sample || '';
  });
  map[type.key] = data;
  return map;
}, {});

export function getSampleInvoiceData(invoiceTypeKey) {
  return SAMPLE_INVOICE_DATA[invoiceTypeKey] || SAMPLE_INVOICE_DATA[DEFAULT_INVOICE_TYPE];
}
