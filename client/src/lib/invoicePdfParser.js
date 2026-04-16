import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const COMPANY_HINT_RE = /(公司|集团|中心|银行|学校|大学|医院|事务所|研究院|研究所|工作室|俱乐部|酒店|科技|传媒|文化|贸易|商贸|服务|餐饮|药房|门诊|协会|委员会|出版社|超市|商店|门店|工厂|分公司|有限)/;
const SELLER_SECTION_RE = /销售方(?:信息)?/;
const NEXT_FIELD_RE = /(?:纳税人识别号|地址、电话|地址电话|开户地址及账号|开户行及账号|账号|电话|备注|项目名称|服务名称|密码区|收款人|复核|开票人|购买方|销售方)/;
const DATE_VALUE_RE = /((?:19|20)\d{2}(?:年|[./-])\d{1,2}(?:月|[./-])\d{1,2}日?|\d{8})/;
const NAME_FIELD_STOP_RE = /(?:纳税人识别号|地址、电话|地址电话|地址|电话|开户地址及账号|开户地址|开户行及账号|开户行|账号|备注|项目名称|服务名称|密码区|收款人|复核|开票人|购买方|销售方|名称[:：]?|$)/;

function normalizePdfText(text) {
  return String(text || '')
    .replace(/\u0000/g, '')
    .replace(/[﹣－–—]/g, '-')
    .replace(/[：﹕]/g, ':')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactText(text) {
  return normalizePdfText(text).replace(/\s+/g, '');
}

function normalizeDateValue(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) {
    return '';
  }

  const digitsOnly = value.replace(/[^\d]/g, '');
  if (digitsOnly.length === 8) {
    const year = digitsOnly.slice(0, 4);
    const month = digitsOnly.slice(4, 6);
    const day = digitsOnly.slice(6, 8);
    return `${year}-${month}-${day}`;
  }

  const match = value.match(/(\d{4})[年./-]?(\d{1,2})[月./-]?(\d{1,2})/);
  if (!match) {
    return '';
  }

  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function normalizeAmountValue(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) {
    return '';
  }

  const numeric = Number(value.replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(numeric)) {
    return '';
  }

  return numeric.toFixed(2);
}

function cleanFieldValue(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanCompanyName(value) {
  return cleanFieldValue(value)
    .replace(/^(销售方名称|销售方信息|销方名称|名称)[:：]?/, '')
    .replace(NEXT_FIELD_RE, '')
    .replace(/[\\/:"*?<>|]/g, ' ')
    .replace(/\s+/g, '')
    .replace(/^[^\u4E00-\u9FA5A-Za-z0-9(（]+/, '')
    .replace(/[^\u4E00-\u9FA5A-Za-z0-9)）]+$/, '')
    .trim();
}

function looksLikeCompanyName(value) {
  if (!value || value.length < 4) {
    return false;
  }
  if (/^(个人|个人消费者|个人用户|客户|客户名称)$/.test(value)) {
    return false;
  }
  if (COMPANY_HINT_RE.test(value)) {
    return true;
  }
  return /^[\u4E00-\u9FA5A-Za-z0-9()（）·&-]{4,40}$/.test(value);
}

function extractNameCandidates(text) {
  const normalized = compactText(text);
  if (!normalized) {
    return [];
  }

  const results = [];
  const regex = /名称[:：]?(.+?)(?=纳税人识别号|地址、电话|地址电话|地址|电话|开户地址及账号|开户地址|开户行及账号|开户行|账号|备注|项目名称|服务名称|密码区|收款人|复核|开票人|购买方|销售方|名称[:：]?|$)/g;

  for (const match of normalized.matchAll(regex)) {
    const value = cleanCompanyName(match[1]);
    if (value) {
      results.push(value);
    }
  }

  return results;
}

function extractCompanyPhrases(text) {
  const normalized = compactText(text);
  if (!normalized) {
    return [];
  }

  const results = [];
  const companyRegex = /[\u4E00-\u9FA5A-Za-z0-9()（）·&-]{2,50}(?:公司|集团|中心|银行|学校|大学|医院|事务所|研究院|研究所|工作室|俱乐部|酒店|科技|传媒|文化|贸易|商贸|服务|餐饮|药房|门诊|协会|委员会|出版社|超市|商店|门店|工厂|分公司|有限公司|有限责任公司)/g;

  for (const match of normalized.matchAll(companyRegex)) {
    const value = cleanCompanyName(match[0]);
    if (value) {
      results.push(value);
    }
  }

  return results;
}

function pickBestCompanyCandidate(candidates) {
  const unique = [];
  const seen = new Set();

  candidates.forEach((candidate) => {
    const value = cleanCompanyName(candidate);
    if (!value || seen.has(value) || !looksLikeCompanyName(value)) {
      return;
    }
    seen.add(value);
    unique.push(value);
  });

  if (!unique.length) {
    return '';
  }

  const hintMatches = unique.filter((item) => COMPANY_HINT_RE.test(item));
  if (hintMatches.length) {
    return hintMatches[hintMatches.length - 1];
  }

  return unique[unique.length - 1];
}

function collectUniqueCompanyCandidates(candidates) {
  const result = [];
  const seen = new Set();

  candidates.forEach((candidate) => {
    const value = cleanCompanyName(candidate);
    if (!value || seen.has(value) || !looksLikeCompanyName(value)) {
      return;
    }
    seen.add(value);
    result.push(value);
  });

  return result;
}

function collectCompanyCandidatesInOrder(text) {
  return collectUniqueCompanyCandidates([
    ...extractNameCandidates(text),
    ...extractCompanyPhrases(text)
  ]);
}

function collectSellerNameCandidates(text) {
  const normalized = compactText(text);
  if (!normalized) {
    return [];
  }

  const results = [
    ...extractNameCandidates(normalized),
    ...extractCompanyPhrases(normalized)
  ];

  const sellerMatch = normalized.match(/销售方(?:信息)?([\s\S]{0,180})/);
  if (sellerMatch?.[1]) {
    results.push(...extractNameCandidates(sellerMatch[1]));
    results.push(...extractCompanyPhrases(sellerMatch[1]));
  }

  const sellerNameMatch = normalized.match(new RegExp(`销售方(?:信息)?名称[:：]?(.+?)(?=${NAME_FIELD_STOP_RE.source})`));
  if (sellerNameMatch?.[1]) {
    results.push(cleanCompanyName(sellerNameMatch[1]));
  }

  return results;
}

function joinTextSegments(segments) {
  const ordered = [...segments].sort((left, right) => left.x - right.x);
  let text = '';
  let previousEnd = null;

  ordered.forEach((segment) => {
    const value = normalizePdfText(segment.text);
    if (!value) {
      return;
    }

    if (previousEnd !== null) {
      const gap = segment.x - previousEnd;
      if (gap > Math.max(6, segment.height * 0.8)) {
        text += ' ';
      }
    }

    text += value;
    previousEnd = segment.x + Math.max(segment.width, segment.height * value.length * 0.55);
  });

  return text.trim();
}

function buildTextLines(items, pageNumber) {
  const segments = (items || [])
    .map((item) => ({
      pageNumber,
      text: item.str || '',
      x: item.transform?.[4] || 0,
      y: item.transform?.[5] || 0,
      width: Number(item.width) || 0,
      height: Math.abs(Number(item.height) || Number(item.transform?.[0]) || Number(item.transform?.[3]) || 12)
    }))
    .filter((item) => normalizePdfText(item.text))
    .sort((left, right) => {
      if (Math.abs(right.y - left.y) > 2.5) {
        return right.y - left.y;
      }
      return left.x - right.x;
    });

  const lines = [];

  segments.forEach((segment) => {
    const previousLine = lines[lines.length - 1];
    const tolerance = Math.max(2.8, segment.height * 0.45);
    if (previousLine && Math.abs(previousLine.y - segment.y) <= tolerance) {
      previousLine.segments.push(segment);
      previousLine.y = Math.max(previousLine.y, segment.y);
      return;
    }

    lines.push({
      pageNumber,
      y: segment.y,
      segments: [segment]
    });
  });

  return lines
    .map((line) => {
      const text = joinTextSegments(line.segments);
      return {
        pageNumber: line.pageNumber,
        y: line.y,
        segments: [...line.segments],
        text,
        compact: compactText(text)
      };
    })
    .filter((line) => line.compact);
}

function getColumnSplitX(lines) {
  const maxX = lines.reduce((currentMax, line) => {
    const lineMax = (line?.segments || []).reduce((segmentMax, segment) => {
      const value = normalizePdfText(segment.text);
      if (!value) {
        return segmentMax;
      }

      const endX = segment.x + Math.max(segment.width, segment.height * value.length * 0.55);
      return Math.max(segmentMax, endX);
    }, 0);

    return Math.max(currentMax, lineMax);
  }, 0);

  return maxX > 0 ? maxX / 2 : 300;
}

function splitLineByColumns(line, splitX) {
  const leftSegments = [];
  const rightSegments = [];

  (line?.segments || []).forEach((segment) => {
    if (segment.x < splitX) {
      leftSegments.push(segment);
      return;
    }

    rightSegments.push(segment);
  });

  const leftText = joinTextSegments(leftSegments);
  const rightText = joinTextSegments(rightSegments);

  return {
    leftText,
    rightText,
    leftCompact: compactText(leftText),
    rightCompact: compactText(rightText)
  };
}

function extractTaxIdCandidates(text) {
  const normalized = compactText(text);
  if (!normalized) {
    return [];
  }

  return Array.from(
    normalized.matchAll(/(?:统一社会信用代码\/)?(?:纳税人识别号|纳税人识别码|税号)[:：]?([A-Z0-9\*\-]{6,30})/gi),
    (match) => cleanFieldValue(match[1])
  ).filter(Boolean);
}

function extractMoneyCandidates(text) {
  return Array.from(
    compactText(text).matchAll(/[¥￥]?(-?(?:[0-9]{1,3}(?:,[0-9]{3})*|[0-9]+)\.\d{1,2})/g),
    (match) => normalizeAmountValue(match[1])
  ).filter(Boolean);
}

function parseStructuredPartyFields(lines) {
  const result = {
    buyerName: '',
    buyerTaxId: '',
    sellerName: '',
    sellerTaxId: ''
  };
  const splitX = getColumnSplitX(lines);

  lines.forEach((line) => {
    const { leftCompact, rightCompact } = splitLineByColumns(line, splitX);

    if (!result.buyerName && /名称/.test(leftCompact)) {
      result.buyerName = collectCompanyCandidatesInOrder(leftCompact)[0] || '';
    }

    if (!result.sellerName && /名称/.test(rightCompact)) {
      const sellerCandidates = collectCompanyCandidatesInOrder(rightCompact);
      result.sellerName = sellerCandidates[sellerCandidates.length - 1] || '';
    }

    if (!result.buyerTaxId && /(统一社会信用代码|纳税人识别号|税号)/.test(leftCompact)) {
      result.buyerTaxId = extractTaxIdCandidates(leftCompact)[0] || '';
    }

    if (!result.sellerTaxId && /(统一社会信用代码|纳税人识别号|税号)/.test(rightCompact)) {
      const sellerTaxIds = extractTaxIdCandidates(rightCompact);
      result.sellerTaxId = sellerTaxIds[sellerTaxIds.length - 1] || '';
    }
  });

  if (!result.buyerName || !result.sellerName) {
    for (const line of lines) {
      const names = Array.from(
        line.compact.matchAll(/名称[:：]?(.+?)(?=(?:[购销买售]?名称[:：]?|统一社会信用代码|纳税人识别号|地址、电话|地址电话|开户地址及账号|开户地址|开户行及账号|开户行|账号|备注|收款人|复核|开票人|$))/g),
        (match) => cleanCompanyName(match[1])
      ).filter(looksLikeCompanyName);

      if (names.length >= 2) {
        result.buyerName = result.buyerName || names[0];
        result.sellerName = result.sellerName || names[names.length - 1];
        break;
      }
    }
  }

  if (!result.buyerTaxId || !result.sellerTaxId) {
    for (const line of lines) {
      const taxIds = extractTaxIdCandidates(line.compact);
      if (taxIds.length >= 2) {
        result.buyerTaxId = result.buyerTaxId || taxIds[0];
        result.sellerTaxId = result.sellerTaxId || taxIds[taxIds.length - 1];
        break;
      }
    }
  }

  return result;
}

function parseStructuredAmountFields(lines) {
  const result = {
    invoiceAmount: '',
    taxAmount: '',
    totalAmount: '',
    totalAmountUpper: ''
  };

  lines.forEach((line) => {
    const compact = line.compact || '';
    if (!compact) {
      return;
    }

    if ((!result.invoiceAmount || !result.taxAmount) && /合计/.test(compact)) {
      const amounts = extractMoneyCandidates(compact);
      if (amounts.length >= 2) {
        result.invoiceAmount = result.invoiceAmount || amounts[0];
        result.taxAmount = result.taxAmount || amounts[1];
      }
    }

    if (!result.totalAmount && /价税合计/.test(compact)) {
      const totalMatch = compact.match(/(?:\(小写\)|小写[:：]?|小写\))[¥￥]?(-?[0-9,]+(?:\.\d{1,2})?)/)
        || compact.match(/价税合计(?:\(小写\))?[:：]?[¥￥]?(-?[0-9,]+(?:\.\d{1,2})?)/);
      if (totalMatch?.[1]) {
        result.totalAmount = normalizeAmountValue(totalMatch[1]);
      }
    }

    if (!result.totalAmountUpper && /价税合计/.test(compact)) {
      const upperMatch = compact.match(
        /价税合计(?:\(大写\))?([零壹贰叁肆伍陆柒捌玖拾佰仟万亿圆元角分整正负欠]+)(?=(?:\(小写\)|小写|$))/
      );
      if (upperMatch?.[1]) {
        result.totalAmountUpper = upperMatch[1];
      }
    }
  });

  if (!result.totalAmount && result.invoiceAmount && result.taxAmount) {
    const total = Number(result.invoiceAmount) + Number(result.taxAmount);
    if (Number.isFinite(total)) {
      result.totalAmount = total.toFixed(2);
    }
  }

  return result;
}

function getWindowText(lines, index, span = 2) {
  return Array.from({ length: span + 1 }, (_, offset) => lines[index + offset]?.compact || '').join('');
}

function findFirstMatch(lines, matcher) {
  for (let index = 0; index < lines.length; index += 1) {
    const value = matcher(lines[index], index);
    if (value) {
      return value;
    }
  }
  return '';
}

function parseIssueDate(lines, fullText) {
  const fromLines = findFirstMatch(lines, (_line, index) => {
    const windowText = getWindowText(lines, index, 1);
    const match = windowText.match(new RegExp(`开票日期[:：]?${DATE_VALUE_RE.source}`));
    if (match) {
      return normalizeDateValue(match[1]);
    }

    const fallback = windowText.match(new RegExp(`日期[:：]?${DATE_VALUE_RE.source}`));
    if (fallback) {
      return normalizeDateValue(fallback[1]);
    }

    return '';
  });

  if (fromLines) {
    return fromLines;
  }

  const globalMatch = fullText.match(DATE_VALUE_RE);
  return normalizeDateValue(globalMatch?.[1] || '');
}

function parseInvoiceNumber(lines, fullText) {
  const fromLines = findFirstMatch(lines, (_line, index) => {
    const windowText = getWindowText(lines, index, 1);
    const match = windowText.match(/发票号码[:：]?([A-Za-z0-9]{6,20})/);
    if (match) {
      return match[1];
    }

    const loose = windowText.match(/发票号[:：]?([A-Za-z0-9]{6,20})/);
    if (loose) {
      return loose[1];
    }

    return '';
  });

  if (fromLines) {
    return fromLines;
  }

  const globalMatch = fullText.match(/发票号码[:：]?([A-Za-z0-9]{6,20})/);
  return globalMatch?.[1] || '';
}

function parseAmount(lines, fullText) {
  const structured = parseStructuredAmountFields(lines);
  if (structured.totalAmount) {
    return structured.totalAmount;
  }

  const priorityPatterns = [
    /价税合计(?:\(小写\))?[:：]?[¥￥]?(-?[0-9,]+(?:\.\d{1,2})?)/,
    /\(小写\)[:：]?[¥￥]?(-?[0-9,]+(?:\.\d{1,2})?)/,
    /小写[:：]?[¥￥]?(-?[0-9,]+(?:\.\d{1,2})?)/
  ];

  const fromLines = findFirstMatch(lines, (_line, index) => {
    const windowText = getWindowText(lines, index, 2);
    for (const pattern of priorityPatterns) {
      const match = windowText.match(pattern);
      if (match) {
        return normalizeAmountValue(match[1]);
      }
    }
    return '';
  });

  if (fromLines) {
    return fromLines;
  }

  const moneyMatches = Array.from(
    fullText.matchAll(/-?(?:[0-9]{1,3}(?:,[0-9]{3})*|[0-9]+)\.\d{2}/g),
    (item) => normalizeAmountValue(item[0])
  ).filter(Boolean);

  if (!moneyMatches.length) {
    return '';
  }

  return moneyMatches
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
    .sort((left, right) => right - left)
    .map((item) => item.toFixed(2))[0] || '';
}

function parseTotalAmount(lines, fullText, allowRecursion = true) {
  const structured = parseStructuredAmountFields(lines);
  if (structured.totalAmount) {
    return structured.totalAmount;
  }

  // 价税合计 = 金额 + 税额
  const totalPatterns = [
    /价税合计(?:\(小写\))?[:：]?[¥￥]?(-?[0-9,]+(?:\.\d{1,2})?)/,
    /价税合计[:：]?[¥￥]?(-?[0-9,]+(?:\.\d{1,2})?)/,
    /(?:金额|税额)[:：]?\s*[¥￥]?\s*(-?[0-9,]+(?:\.\d{1,2})?)\s*[¥￥]?\s*(-?[0-9,]+(?:\.\d{1,2})?)/
  ];

  const fromLines = findFirstMatch(lines, (_line, index) => {
    const windowText = getWindowText(lines, index, 2);
    for (const pattern of totalPatterns) {
      const match = windowText.match(pattern);
      if (match) {
        // 第一个匹配通常是价税合计
        return normalizeAmountValue(match[1]);
      }
    }
    return '';
  });

  if (fromLines) {
    return fromLines;
  }

  // Fallback: 识别金额和税额，然后相加（避免无限递归）
  let amount = '';
  if (allowRecursion) {
    amount = parseInvoiceAmount(lines, fullText, false);
  }
  const tax = parseTaxAmount(lines, fullText, amount);
  if (amount && tax) {
    const total = Number(amount) + Number(tax);
    return total.toFixed(2);
  }

  // Fallback: 取最大的金额
  const moneyMatches = Array.from(
    fullText.matchAll(/-?(?:[0-9]{1,3}(?:,[0-9]{3})*|[0-9]+)\.\d{2}/g),
    (item) => normalizeAmountValue(item[0])
  ).filter(Boolean).map(Number).filter(Number.isFinite).sort((a, b) => b - a);

  return moneyMatches[0]?.toFixed(2) || '';
}

function parseTotalAmountUpper(lines, fullText) {
  const structured = parseStructuredAmountFields(lines);
  if (structured.totalAmountUpper) {
    return structured.totalAmountUpper;
  }

  // 价税合计大写
  const upperPatterns = [
    /价税合计大写[:：]([^0-9]{2,50})/,
    /价税合计(?:\(大写\))?([零壹贰叁肆伍陆柒捌玖拾佰仟万亿圆元角分整正负欠]+)/i,
    /大写[:：]?([零壹贰叁肆伍陆柒捌玖拾佰仟万亿圆角分]+)/i,
    /金额大写[:：]?([零壹贰叁肆伍陆柒捌玖拾佰仟万亿圆角分]+)/i
  ];

  const fromLines = findFirstMatch(lines, (_line, index) => {
    const windowText = getWindowText(lines, index, 2);
    for (const pattern of upperPatterns) {
      const match = windowText.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return '';
  });

  if (fromLines) {
    return fromLines;
  }

  // 全局搜索
  for (const pattern of upperPatterns) {
    const m = fullText.match(pattern);
    if (m && m[1]) {
      return m[1].trim();
    }
  }

  return '';
}

// 新增：解析发票金额（不含税）
function parseInvoiceAmount(lines, fullText, allowRecursion = true) {
  const structured = parseStructuredAmountFields(lines);
  if (structured.invoiceAmount) {
    return structured.invoiceAmount;
  }

  const amountPatterns = [
    /金额(?:\(不含税\))?[:：]?[¥￥]?(-?[0-9,]+(?:\.\d{1,2})?)/,
    /金额[:：]?[¥￥]?(-?[0-9,]+(?:\.\d{1,2})?)/,
    /不含税[:：]?[¥￥]?(-?[0-9,]+(?:\.\d{1,2})?)/,
    /(?:金额)[:：]?\s*[¥￥]?\s*(-?[0-9,]+(?:\.\d{1,2})?)\s*/
  ];

  const fromLines = findFirstMatch(lines, (_line, index) => {
    const windowText = getWindowText(lines, index, 2);
    for (const pattern of amountPatterns) {
      const match = windowText.match(pattern);
      if (match) {
        return normalizeAmountValue(match[1]);
      }
    }
    return '';
  });

  if (fromLines) {
    return fromLines;
  }

  // Fallback: 如果知道价税合计和税额，可以计算金额（避免循环调用）
  if (allowRecursion) {
    const total = parseTotalAmount(lines, fullText, false);
    const tax = parseTaxAmount(lines, fullText, total);
    if (total && tax) {
      const amount = Number(total) - Number(tax);
      if (amount > 0) {
        return amount.toFixed(2);
      }
    }
  }

  // 最后兜底：从文本中挑选合理的金额值（若存在多个，通常认为金额位于次大值）
  const moneyMatches = Array.from(fullText.matchAll(/-?(?:[0-9]{1,3}(?:,[0-9]{3})*|[0-9]+)\.\d{2}/g), (item) => normalizeAmountValue(item[0])).filter(Boolean).map(Number);
  if (!moneyMatches.length) return '';
  if (moneyMatches.length >= 2) {
    const sorted = moneyMatches.sort((a, b) => b - a);
    return sorted[1].toFixed(2);
  }
  return moneyMatches[0].toFixed(2) || '';
}

function parseInvoiceCode(lines, fullText) {
  const fromLines = findFirstMatch(lines, (_line, index) => {
    const windowText = getWindowText(lines, index, 1);
    const match = windowText.match(/发票代码[:：]?\s*([0-9A-Za-z\-]{6,20})/);
    if (match) return match[1];
    const loose = windowText.match(/代码[:：]?\s*([0-9A-Za-z\-]{6,20})/);
    if (loose) return loose[1];
    return '';
  });

  if (fromLines) return fromLines;

  const globalMatch = fullText.match(/发票代码[:：]?\s*([0-9A-Za-z\-]{6,20})/);
  return globalMatch?.[1] || '';
}

function parseBuyerName(lines, fullText, anchorIndex) {
  const structured = parseStructuredPartyFields(lines);
  if (structured.buyerName) {
    return structured.buyerName;
  }

  // If an anchor index (e.g. index of invoice number) is provided,
  // prefer candidates located near that index to avoid picking repeated blocks.
  if (typeof anchorIndex === 'number' && Number.isFinite(anchorIndex)) {
    const start = Math.max(0, anchorIndex - 8);
    const end = Math.min(lines.length - 1, anchorIndex + 8);
    const windowText = Array.from({ length: end - start + 1 }, (_, i) => lines[start + i]?.compact || '').join('');
    const buyerCandidates = collectCompanyCandidatesInOrder(windowText);
    const candidate = buyerCandidates[0] || '';
    if (candidate) return candidate;
  }

  const buyerSectionIndex = lines.findIndex((line) => /购买方(?:信息)?/.test(line.compact));
  if (buyerSectionIndex >= 0) {
    const buyerWindowText = Array.from(
      { length: Math.min(12, lines.length - buyerSectionIndex) },
      (_, offset) => lines[buyerSectionIndex + offset]?.compact || ''
    ).join('');

    const candidate = pickBestCompanyCandidate([
      ...extractNameCandidates(buyerWindowText),
      ...extractCompanyPhrases(buyerWindowText)
    ]);
    if (candidate) return candidate;
  }

  const normalizedFullText = fullText.replace(/\n/g, '');
  // Try to use buyer tax id proximity to locate the buyer name more reliably
  const buyerTax = parseBuyerTaxId(lines, fullText);
  if (buyerTax) {
    const idx = normalizedFullText.indexOf(buyerTax);
    if (idx >= 0) {
      const pre = normalizedFullText.slice(Math.max(0, idx - 200), idx);
      const cand = pickBestCompanyCandidate([
        ...extractNameCandidates(pre),
        ...extractCompanyPhrases(pre)
      ]);
      if (cand) return cand;
    }
  }

  const fullCandidate = pickBestCompanyCandidate([
    ...extractNameCandidates(normalizedFullText),
    ...extractCompanyPhrases(normalizedFullText)
  ]);
  return fullCandidate || '';
}

function parseTaxIdForRole(lines, fullText, roleKeyword, anchorIndex) {
  const structured = parseStructuredPartyFields(lines);
  const structuredValue = roleKeyword === '销售方' ? structured.sellerTaxId : structured.buyerTaxId;
  if (structuredValue) {
    return structuredValue;
  }

  // Prefer finding a tax id near the provided anchor index (if any)
  const taxPattern = /(?:纳税人识别号|纳税人识别码|税号)[:：]?\s*([A-Z0-9\*\-]{6,30})/i;

  if (typeof anchorIndex === 'number' && Number.isFinite(anchorIndex)) {
    const start = Math.max(0, anchorIndex - 8);
    const end = Math.min(lines.length - 1, anchorIndex + 8);
    const windowText = Array.from({ length: end - start + 1 }, (_, i) => lines[start + i]?.compact || '').join('');
    const taxIds = extractTaxIdCandidates(windowText);
    if (taxIds.length) {
      return roleKeyword === '销售方' ? taxIds[taxIds.length - 1] : taxIds[0];
    }
  }

  // Try to find a tax id near the role (购买方/销售方) first
  const roleIndex = lines.findIndex((line) => new RegExp(`${roleKeyword}(?:信息)?`).test(line.compact));
  if (roleIndex >= 0) {
    const windowText = Array.from({ length: Math.min(12, lines.length - roleIndex) }, (_, offset) => lines[roleIndex + offset]?.compact || '').join('');
    const m = windowText.match(taxPattern);
    if (m) return m[1];
  }

  // fallback: global search for tax id near role keyword
  const globalMatch = fullText.match(new RegExp(`${roleKeyword}(?:信息)?[\s\S]{0,120}(?:纳税人识别号|税号|纳税人识别码)[:：]?([A-Z0-9\*\-]{6,30})`, 'i'));
  if (globalMatch) return globalMatch[1];

  // final fallback: any tax id occurrence
  const any = fullText.match(taxPattern);
  return any?.[1] || '';
}

function parseBuyerTaxId(lines, fullText, anchorIndex) {
  return parseTaxIdForRole(lines, fullText, '购买方', anchorIndex);
}

function parseSellerTaxId(lines, fullText, anchorIndex) {
  return parseTaxIdForRole(lines, fullText, '销售方', anchorIndex);
}

// 使用税号定位公司名（更可靠）
// 为避免正则问题，暂时简化实现
function findCompanyNameByTaxId(fullText, taxId, roleKeyword) {
  if (!taxId || !fullText) return '';

  // 在税号前面200字符内搜索公司名
  const idx = fullText.indexOf(taxId);
  if (idx < 0) return '';

  const pre = fullText.slice(Math.max(0, idx - 200), idx);
  const candidates = extractCompanyPhrases(pre);
  if (candidates.length) {
    return candidates[candidates.length - 1];
  }

  return '';
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseSimpleLabel(lines, fullText, labelRegex) {
  const fromLines = findFirstMatch(lines, (_line, index) => {
    const windowText = getWindowText(lines, index, 1);
    const m = windowText.match(labelRegex);
    if (m) return m[1] || '';
    return '';
  });
  if (fromLines) return fromLines;
  const globalMatch = fullText.match(labelRegex);
  return globalMatch?.[1] || '';
}

function parsePayee(lines, fullText) {
  return parseSimpleLabel(lines, fullText, /收款人[:：]?\s*([\u4E00-\u9FA5A-Za-z0-9()（）·&\-\s]{2,80})/);
}

function parseReviewer(lines, fullText) {
  return parseSimpleLabel(lines, fullText, /复核(?:人)?[:：]?\s*([\u4E00-\u9FA5A-Za-z0-9()（）·&\-\s]{2,80})/);
}

function parseRemarks(lines, fullText) {
  const remarkPatterns = [
    /备注[:：]\s*([^\n]{2,200})/,
    /备注栏[:：]\s*([^\n]{2,200})/,
    /备注项[:：]\s*([^\n]{2,200})/,
    /(订单号[:：][^\n]{4,200})/
  ];

  const fromLines = findFirstMatch(lines, (_line, index) => {
    const windowText = getWindowText(lines, index, 2);
    for (const pattern of remarkPatterns) {
      const match = windowText.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return '';
  });

  if (fromLines) {
    return fromLines;
  }

  // 全局搜索
  for (const pattern of remarkPatterns) {
    const m = fullText.match(pattern);
    if (m && m[1]) {
      return m[1].trim();
    }
  }

  return '';
}

function parseIssuer(lines, fullText) {
  // Match explicit issuer labels first so "开票日期" won't be mistaken for "开票人".
  const issuerPatterns = [
    /开票人[:：]?\s*([\u4E00-\u9FA5A-Za-z0-9()（）·&\-\s]{2,80})/,
    /开票员[:：]?\s*([\u4E00-\u9FA5A-Za-z0-9()（）·&\-\s]{2,80})/
  ];

  for (const pattern of issuerPatterns) {
    const val = parseSimpleLabel(lines, fullText, pattern);
    if (!val) {
      continue;
    }

    const maybeDate = val.match(/\d{4}[年./-]?\d{1,2}/);
    if (/(日期|年|月|日)/.test(val) || maybeDate) {
      continue;
    }

    return val;
  }

  return '';
}

function parseTaxAmount(lines, fullText, invoiceAmount, anchorIndex) {
  const structured = parseStructuredAmountFields(lines);
  if (structured.taxAmount) {
    return structured.taxAmount;
  }

  const taxPatterns = [/税额[:：]?[¥￥]?(-?[0-9,]+(?:\.\d{1,2})?)/, /税额\(小写\)[:：]?[¥￥]?(-?[0-9,]+(?:\.\d{1,2})?)/];
  // if anchorIndex provided, try to locate explicit tax amount near anchor first
  if (typeof anchorIndex === 'number' && Number.isFinite(anchorIndex)) {
    const start = Math.max(0, anchorIndex - 6);
    const end = Math.min(lines.length - 1, anchorIndex + 6);
    const windowText = Array.from({ length: end - start + 1 }, (_, i) => lines[start + i]?.compact || '').join('');
    for (const pattern of taxPatterns) {
      const m = windowText.match(pattern);
      if (m) return normalizeAmountValue(m[1]);
    }
  }

  const fromLines = findFirstMatch(lines, (_line, index) => {
    const windowText = getWindowText(lines, index, 2);
    for (const pattern of taxPatterns) {
      const match = windowText.match(pattern);
      if (match) return normalizeAmountValue(match[1]);
    }
    return '';
  });
  if (fromLines) return fromLines;

  // fallback: choose a money value that is plausibly the tax amount
  const moneyMatches = Array.from(fullText.matchAll(/-?(?:[0-9]{1,3}(?:,[0-9]{3})*|[0-9]+)\.\d{2}/g), (item) => normalizeAmountValue(item[0])).filter(Boolean).map(Number);
  if (!moneyMatches.length) return '';

  // if invoiceAmount is known, prefer a value less than invoiceAmount (largest such value)
  const invoiceNum = Number(String(invoiceAmount || '').replace(/[^0-9.-]/g, ''));
  if (Number.isFinite(invoiceNum)) {
    const candidates = moneyMatches.filter((n) => n < invoiceNum && n > 0).sort((a, b) => b - a);
    if (candidates.length) {
      return candidates[0].toFixed(2);
    }
  }

  // otherwise pick the smallest positive value (likely the tax)
  const positives = moneyMatches.filter((n) => n > 0).sort((a, b) => a - b);
  if (positives.length) return positives[0].toFixed(2);

  return '';
}

function parseSellerName(lines, fullText, anchorIndex) {
  const structured = parseStructuredPartyFields(lines);
  if (structured.sellerName) {
    return structured.sellerName;
  }

  // If anchor index provided, try to find seller name near that anchor first
  if (typeof anchorIndex === 'number' && Number.isFinite(anchorIndex)) {
    const start = Math.max(0, anchorIndex - 8);
    const end = Math.min(lines.length - 1, anchorIndex + 8);
    const windowText = Array.from({ length: end - start + 1 }, (_, i) => lines[start + i]?.compact || '').join('');
    const sellerCandidates = collectCompanyCandidatesInOrder(windowText);
    const cand = sellerCandidates[sellerCandidates.length - 1] || '';
    if (cand) return cand;
  }

  const sellerSectionIndex = lines.findIndex((line) => SELLER_SECTION_RE.test(line.compact));

  if (sellerSectionIndex >= 0) {
    const sellerWindowText = Array.from(
      { length: Math.min(12, lines.length - sellerSectionIndex) },
      (_, offset) => lines[sellerSectionIndex + offset]?.compact || ''
    ).join('');

    const sellerWindowName = pickBestCompanyCandidate(collectSellerNameCandidates(sellerWindowText));
    if (sellerWindowName) {
      return sellerWindowName;
    }
  }

  const normalizedFullText = fullText.replace(/\n/g, '');
  const sellerFullTextName = pickBestCompanyCandidate(collectSellerNameCandidates(normalizedFullText));
  if (sellerFullTextName) {
    return sellerFullTextName;
  }

  if (sellerSectionIndex >= 0) {
    for (let index = sellerSectionIndex; index < Math.min(lines.length, sellerSectionIndex + 10); index += 1) {
      const lineName = pickBestCompanyCandidate(collectSellerNameCandidates(getWindowText(lines, index, 1)));
      if (lineName) {
        return lineName;
      }
    }
  }

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const name = pickBestCompanyCandidate(collectSellerNameCandidates(lines[index].compact));
    if (name) {
      return name;
    }
  }

  return '';
}

export async function extractInvoiceFromPdf(file) {
  const buffer = await file.arrayBuffer();
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false
  });

  try {
    const pdf = await loadingTask.promise;
    const lines = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      lines.push(...buildTextLines(content.items, pageNumber));
      page.cleanup();
    }

    const fullText = lines.map((line) => line.compact).join('\n');
    if (!fullText) {
      throw new Error('未识别到文本内容，可能是扫描件、图片版 PDF 或受保护文件。');
    }

    const parsedAmount = parseAmount(lines, fullText);
    const parsedTotalAmount = parseTotalAmount(lines, fullText);
    const parsedInvoiceAmount = parseInvoiceAmount(lines, fullText) || parsedAmount;
    const parsedInvoiceNumber = parseInvoiceNumber(lines, fullText);
    const invoiceNumberIndex = parsedInvoiceNumber ? lines.findIndex((l) => (l.compact || '').includes(parsedInvoiceNumber)) : -1;
    const parsedTaxAmount = parseTaxAmount(lines, fullText, parsedInvoiceAmount || parsedTotalAmount, invoiceNumberIndex >= 0 ? invoiceNumberIndex : undefined);
    const result = {
      issueDate: parseIssueDate(lines, fullText),
      amount: parsedInvoiceAmount,
      invoiceAmount: parsedInvoiceAmount,
      invoiceNumber: parsedInvoiceNumber,
      invoiceCode: parseInvoiceCode(lines, fullText),
      sellerName: parseSellerName(lines, fullText, invoiceNumberIndex >= 0 ? invoiceNumberIndex : undefined),
      buyerName: parseBuyerName(lines, fullText, invoiceNumberIndex >= 0 ? invoiceNumberIndex : undefined),
      buyerTaxId: parseBuyerTaxId(lines, fullText, invoiceNumberIndex >= 0 ? invoiceNumberIndex : undefined),
      sellerTaxId: parseSellerTaxId(lines, fullText, invoiceNumberIndex >= 0 ? invoiceNumberIndex : undefined),
      taxAmount: parsedTaxAmount,
      totalAmount: parsedTotalAmount,
      totalAmountUpper: parseTotalAmountUpper(lines, fullText),
      remarks: parseRemarks(lines, fullText),
      payee: parsePayee(lines, fullText),
      reviewer: parseReviewer(lines, fullText),
      issuer: parseIssuer(lines, fullText)
    };

    if (!Object.values(result).some(Boolean)) {
      throw new Error('未识别到发票字段，当前仅支持可提取文本的 PDF 电子发票。');
    }

    return result;
  } catch (error) {
    if (error?.name === 'PasswordException') {
      throw new Error('PDF 已加密，当前版本暂不支持解析加密发票。');
    }
    throw error;
  } finally {
    try {
      await loadingTask.destroy();
    } catch (error) {
      // ignore destroy errors
    }
  }
}
