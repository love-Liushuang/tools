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
        text,
        compact: compactText(text)
      };
    })
    .filter((line) => line.compact);
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

function parseSellerName(lines, fullText) {
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

    const result = {
      issueDate: parseIssueDate(lines, fullText),
      amount: parseAmount(lines, fullText),
      invoiceNumber: parseInvoiceNumber(lines, fullText),
      sellerName: parseSellerName(lines, fullText)
    };

    if (!Object.values(result).some(Boolean)) {
      throw new Error('未识别到发票字段，当前仅支持可提取文本的 PDF 电子发票。');
    }

    return result;
  } catch (error) {
    if (error?.name === 'PasswordException') {
      throw new Error('PDF 已加密，当前纯前端版本暂不支持解析加密发票。');
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
