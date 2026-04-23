import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import cMapGbUrl from 'pdfjs-dist/cmaps/UniGB-UCS2-H.bcmap?url';
import { TRAIN_STATION_PINYIN_MAP } from './trainStationPinyinMap';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const COMPANY_HINT_RE = /(公司|集团|中心|银行|学校|大学|医院|事务所|研究院|研究所|工作室|俱乐部|酒店|科技|传媒|文化|贸易|商贸|服务|餐饮|药房|门诊|协会|委员会|出版社|超市|商店|门店|工厂|分公司|有限)/;
const SELLER_SECTION_RE = /销售方(?:信息)?/;
const NEXT_FIELD_RE = /(?:纳税人识别号|地址、电话|地址电话|开户地址及账号|开户行及账号|账号|电话|备注|项目名称|服务名称|密码区|收款人|复核|开票人|购买方|销售方)/;
const DATE_VALUE_RE = /((?:19|20)\d{2}(?:年|[./-])\d{1,2}(?:月|[./-])\d{1,2}日?|(?:19|20)\d{6})/;
const NAME_FIELD_STOP_RE = /(?:纳税人识别号|地址、电话|地址电话|地址|电话|开户地址及账号|开户地址|开户行及账号|开户行|账号|备注|项目名称|服务名称|密码区|收款人|复核|开票人|购买方|销售方|名称[:：]?|$)/;
const PARTY_NAME_NOISE_RE = /^(?:项目名称|规格型号|单位|数量|单价|金额|税额|税率|征收率|校验码|机器编号|收款人|复核|开票人|备注|购买方|销售方|购买方信息|销售方信息|电子发票|普通发票)$/;
const TRAIN_NO_RE = /\b([CGDKTZYSLP]\d{1,4})\b/i;

function getAssetBaseUrl(assetUrl) {
  return String(assetUrl || '').replace(/[^/]+(?:\?.*)?$/, '');
}

function getPdfCMapUrl() {
  if (import.meta.env.DEV) {
    return getAssetBaseUrl(cMapGbUrl);
  }

  return `${import.meta.env.BASE_URL}pdfjs/cmaps/`;
}

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

function normalizeStationName(value) {
  const text = cleanFieldValue(value)
    .replace(/^[^\u4E00-\u9FA5A-Za-z]+/, '')
    .replace(/[^\u4E00-\u9FA5A-Za-z]+$/g, '');
  if (!text) {
    return '';
  }
  if (/^[A-Za-z][A-Za-z\s-]{1,40}$/.test(text)) {
    return text.replace(/\s+/g, '');
  }
  return text.replace(/\s+/g, '');
}

function normalizeTrainStationPinyin(value) {
  return normalizeStationName(value)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/zhan$/i, '')
    .replace(/station$/i, '');
}

function getPageLines(lines, pageNumber = 1) {
  return (lines || []).filter((line) => line.pageNumber === pageNumber);
}

function getLineBounds(line) {
  const segments = line?.segments || [];
  if (!segments.length) {
    return {
      minX: 0,
      maxX: 0,
      minY: line?.y || 0,
      maxY: line?.y || 0
    };
  }

  const xs = segments.map((segment) => segment.x);
  const ys = segments.map((segment) => segment.y);
  const ends = segments.map((segment) => (
    segment.x + Math.max(segment.width, segment.height * normalizePdfText(segment.text).length * 0.55)
  ));

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...ends),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
}

function isLineInRect(line, rect = {}) {
  const bounds = getLineBounds(line);
  if (rect.minX !== undefined && bounds.maxX < rect.minX) {
    return false;
  }
  if (rect.maxX !== undefined && bounds.minX > rect.maxX) {
    return false;
  }
  if (rect.minY !== undefined && bounds.maxY < rect.minY) {
    return false;
  }
  if (rect.maxY !== undefined && bounds.minY > rect.maxY) {
    return false;
  }
  return true;
}

function getLinesInRect(lines, rect = {}) {
  return (lines || []).filter((line) => isLineInRect(line, rect));
}

function getSegmentsInRect(lines, rect = {}) {
  return (lines || []).flatMap((line) => (line?.segments || []))
    .filter((segment) => {
      const value = normalizePdfText(segment.text);
      if (!value) {
        return false;
      }

      const endX = segment.x + Math.max(segment.width, segment.height * value.length * 0.55);
      if (rect.minX !== undefined && endX < rect.minX) {
        return false;
      }
      if (rect.maxX !== undefined && segment.x > rect.maxX) {
        return false;
      }
      if (rect.minY !== undefined && segment.y < rect.minY) {
        return false;
      }
      if (rect.maxY !== undefined && segment.y > rect.maxY) {
        return false;
      }
      return true;
    });
}

function buildLinesFromSegments(segments) {
  const ordered = [...segments].sort((left, right) => {
    if (Math.abs(right.y - left.y) > 2.5) {
      return right.y - left.y;
    }
    return left.x - right.x;
  });
  const lines = [];

  ordered.forEach((segment) => {
    const previousLine = lines[lines.length - 1];
    const tolerance = Math.max(2.8, segment.height * 0.45);
    if (previousLine && Math.abs(previousLine.y - segment.y) <= tolerance) {
      previousLine.segments.push(segment);
      previousLine.y = Math.max(previousLine.y, segment.y);
      return;
    }

    lines.push({
      y: segment.y,
      segments: [segment]
    });
  });

  return lines
    .map((line) => cleanFieldValue(joinTextSegments(line.segments)))
    .filter(Boolean);
}

function pickTrainStation(lines, rect = {}) {
  const candidates = buildLinesFromSegments(getSegmentsInRect(lines, rect))
    .map((line) => normalizeStationName(line))
    .filter(Boolean)
    .filter((value) => !TRAIN_NO_RE.test(value))
    .filter((value) => !/\d{4}|\d{1,2}:\d{2}|12306|95306/.test(value))
    .filter((value) => value.length >= 2);

  if (!candidates.length) {
    return '';
  }

  const chineseCandidate = candidates.find((value) => /[\u4E00-\u9FA5]/.test(value));
  if (chineseCandidate) {
    return /站$/.test(chineseCandidate) ? chineseCandidate : `${chineseCandidate}站`;
  }

  const latinCandidate = candidates.find((value) => /^[A-Za-z][A-Za-z\s-]{1,40}$/.test(value));
  if (latinCandidate) {
    const normalizedPinyin = normalizeTrainStationPinyin(latinCandidate);
    const mappedName = TRAIN_STATION_PINYIN_MAP[normalizedPinyin] || '';
    if (mappedName) {
      return /站$/.test(mappedName) ? mappedName : `${mappedName}站`;
    }
    return latinCandidate.replace(/\s+/g, '');
  }

  const fallback = candidates[0];
  return /[\u4E00-\u9FA5]/.test(fallback) && !/站$/.test(fallback)
    ? `${fallback}站`
    : fallback;
}

function pickTextFromRect(lines, rect = {}, options = {}) {
  const {
    accept,
    reject
  } = options;

  const candidates = buildLinesFromSegments(getSegmentsInRect(lines, rect))
    .filter(Boolean)
    .filter((value) => (typeof accept === 'function' ? accept(value) : true))
    .filter((value) => (typeof reject === 'function' ? !reject(value) : true));

  return candidates[0] || '';
}

function detectTrainInvoice(lines, fullText) {
  const firstPageLines = getPageLines(lines, 1);
  const compactFullText = compactText(fullText);
  const hasTrainServiceHint = /12306/.test(fullText) && /95306/.test(fullText);
  const hasRailwayTicketTitle = /铁路电子客票|电子客票|仅供报销使用/.test(compactFullText);
  const hasTrainNumber = firstPageLines.some((line) => TRAIN_NO_RE.test(line.compact));
  const hasPassengerId = firstPageLines.some((line) => /\d{6,18}\*{2,}\d{2,4}/.test(line.compact));
  const hasTicketPrice = firstPageLines.some((line) => /\d+\.\d{2}/.test(line.compact));
  const hasTopIssueDate = firstPageLines.some((line) => (
    isLineInRect(line, { minX: 420, minY: 320 }) && /(?:19|20)\d{2}.*\d{1,2}.*\d{1,2}/.test(line.compact)
  ));

  return (hasRailwayTicketTitle && hasPassengerId && hasTicketPrice)
    || (hasTrainServiceHint && hasTrainNumber && hasPassengerId)
    || (hasTrainNumber && hasPassengerId && hasTicketPrice && hasTopIssueDate);
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

function cleanPartyName(value) {
  return cleanFieldValue(value)
    .replace(/^(购买方名称|销售方名称|购买方信息|销售方信息|名称)[:：]?/, '')
    .replace(NEXT_FIELD_RE, '')
    .replace(/[\\/:"*?<>|]/g, ' ')
    .replace(/\s+/g, '')
    .replace(/^[^\u4E00-\u9FA5A-Za-z0-9()（）·&-]+/, '')
    .replace(/[^\u4E00-\u9FA5A-Za-z0-9()（）·&-]+$/, '')
    .trim();
}

function isNoisePartyName(value) {
  const text = cleanPartyName(value);
  if (!text) {
    return true;
  }
  return PARTY_NAME_NOISE_RE.test(text);
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

function looksLikePersonName(value) {
  const text = cleanPartyName(value);
  if (!text || isNoisePartyName(text)) {
    return false;
  }

  if (/^[\u4E00-\u9FA5]{2,8}$/.test(text)) {
    return true;
  }

  if (/^[A-Za-z][A-Za-z\s·]{1,30}$/.test(text)) {
    return true;
  }

  return false;
}

function looksLikePartyName(value, options = {}) {
  const text = cleanPartyName(value);
  if (!text || isNoisePartyName(text)) {
    return false;
  }

  if (looksLikeCompanyName(text)) {
    return true;
  }

  if (options.allowPerson && looksLikePersonName(text)) {
    return true;
  }

  return false;
}

function extractNamedFieldCandidates(text, options = {}) {
  const normalized = compactText(text);
  if (!normalized) {
    return [];
  }

  const fieldLabel = options.fieldLabel || '名称';
  const allowPerson = !!options.allowPerson;
  const stopPattern = options.stopPattern || NAME_FIELD_STOP_RE.source;
  const regex = new RegExp(`${fieldLabel}[:：]?(.+?)(?=${stopPattern})`, 'g');

  return Array.from(normalized.matchAll(regex), (match) => cleanPartyName(match[1]))
    .filter((value) => looksLikePartyName(value, { allowPerson }));
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
      result.buyerName = extractNamedFieldCandidates(leftCompact, { allowPerson: true })[0] || '';
    }

    if (!result.sellerName && /名称/.test(rightCompact)) {
      const sellerCandidates = extractNamedFieldCandidates(rightCompact);
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
      const names = extractNamedFieldCandidates(line.compact, {
        allowPerson: true,
        stopPattern: '(?:[购销买售]?名称[:：]?|统一社会信用代码|纳税人识别号|地址、电话|地址电话|开户地址及账号|开户地址|开户行及账号|开户行|账号|备注|收款人|复核|开票人|$)'
      });

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

    const explicitBuyerName = extractNamedFieldCandidates(buyerWindowText, { allowPerson: true })[0] || '';
    if (explicitBuyerName) {
      return explicitBuyerName;
    }

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
      const explicitBuyerName = extractNamedFieldCandidates(pre, { allowPerson: true })[0] || '';
      if (explicitBuyerName) {
        return explicitBuyerName;
      }
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

function parseProjectName(lines) {
  const headerIndex = lines.findIndex((line) => /项目名称/.test(line.compact) && /规格型号|单位|数量|金额|税额/.test(line.compact));

  if (headerIndex < 0) {
    return '';
  }

  const headerLine = lines[headerIndex];
  const projectRightLimit = (headerLine?.segments || [])
    .filter((segment) => /规格型号|单位/.test(normalizePdfText(segment.text)))
    .map((segment) => segment.x)
    .sort((left, right) => left - right)[0];
  const collected = [];

  for (let index = headerIndex + 1; index < Math.min(lines.length, headerIndex + 10); index += 1) {
    const line = lines[index];
    const projectSegments = projectRightLimit
      ? (line?.segments || []).filter((segment) => segment.x < projectRightLimit - 4)
      : (line?.segments || []);
    const text = cleanFieldValue(joinTextSegments(projectSegments));
    const compact = compactText(text);

    if (!compact) {
      if (collected.length) {
        break;
      }
      continue;
    }

    if (/^(合计|价税合计|备注|订单号|收款人|复核|开票人)/.test(compact)) {
      break;
    }

    if (/项目名称|规格型号|单位|数量|单价|金额|税额|税率|征收率/.test(compact)) {
      continue;
    }

    if (!/[\u4E00-\u9FA5A-Za-z]/.test(compact)) {
      if (collected.length) {
        break;
      }
      continue;
    }

    if (collected.includes(text)) {
      break;
    }

    collected.push(text);

    if (collected.length >= 2) {
      break;
    }
  }

  return collected.join(' ');
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

function parseTrainIssueDate(lines) {
  const firstPageLines = getPageLines(lines, 1);
  const topRightText = pickTextFromRect(firstPageLines, { minX: 420, minY: 320, maxY: 360 }, {
    accept: (value) => /(?:19|20)\d{2}.*\d{1,2}.*\d{1,2}/.test(compactText(value))
  });
  return normalizeDateValue(topRightText);
}

function parseTrainInvoiceNumber(lines, fullText) {
  const firstPageLines = getPageLines(lines, 1);
  const topLeftText = pickTextFromRect(firstPageLines, { maxX: 240, minY: 320, maxY: 360 }, {
    accept: (value) => /\d{10,24}/.test(value)
  });
  const fromTopLeft = topLeftText.match(/(\d{10,24})/);
  if (fromTopLeft?.[1]) {
    return fromTopLeft[1];
  }
  return parseInvoiceNumber(lines, fullText);
}

function parseTrainTicketPrice(lines) {
  const firstPageLines = getPageLines(lines, 1);
  const priceText = pickTextFromRect(firstPageLines, { maxX: 180, minY: 190, maxY: 235 }, {
    accept: (value) => /\d+\.\d{2}/.test(value)
  });
  const priceMatch = priceText.match(/(\d+(?:\.\d{2})?)/);
  return normalizeAmountValue(priceMatch?.[1] || '');
}

function parseTrainDepartureTime(lines) {
  const firstPageLines = getPageLines(lines, 1);
  const scheduleText = getLinesInRect(firstPageLines, { minY: 238, maxY: 268 })
    .map((line) => line.compact)
    .join('');
  if (!scheduleText) {
    return '';
  }

  const dateMatch = scheduleText.match(/((?:19|20)\d{2}(?:年|[./-])?\d{1,2}(?:月|[./-])?\d{1,2}日?)/);
  const timeMatch = scheduleText.match(/(\d{1,2}:\d{2})/);
  const dateValue = normalizeDateValue(dateMatch?.[1] || '');
  if (dateValue && timeMatch?.[1]) {
    return `${dateValue} ${timeMatch[1]}`;
  }
  return dateValue || timeMatch?.[1] || '';
}

function parseTrainSeatNumber(lines) {
  const firstPageLines = getPageLines(lines, 1);
  const scheduleText = getLinesInRect(firstPageLines, { minY: 230, maxY: 270 })
    .map((line) => line.compact)
    .join('');
  if (!scheduleText) {
    return '';
  }

  const coachSeatMatch = scheduleText.match(/(\d{1,2}车\d{1,3}[A-Z]?号?)/i)
    || scheduleText.match(/(?:\d{1,2}:\d{2})(\d{1,2})(\d{1,3}[A-Z])(?:号)?/i)
    || scheduleText.match(/(\d{1,2})\D{0,3}(\d{1,3}[A-Z])(?:号)?/i);

  let seatValue = '';
  if (coachSeatMatch?.[1] && coachSeatMatch?.[2]) {
    seatValue = `${coachSeatMatch[1]}车${coachSeatMatch[2]}号`;
  } else if (coachSeatMatch?.[1]) {
    seatValue = coachSeatMatch[1].endsWith('号') ? coachSeatMatch[1] : `${coachSeatMatch[1]}号`;
  }

  const seatClassText = pickTextFromRect(firstPageLines, { minX: 330, maxX: 470, minY: 220, maxY: 270 }, {
    accept: (value) => /座|卧|商务|一等|二等|无座/.test(value)
  });

  if (seatValue && seatClassText) {
    return `${seatValue}(${seatClassText})`;
  }

  return seatValue || seatClassText || '';
}

function parseTrainPassengerIdNumber(lines) {
  const firstPageLines = getPageLines(lines, 1);
  const passengerIdText = pickTextFromRect(firstPageLines, { maxX: 180, minY: 140, maxY: 185 }, {
    accept: (value) => /\d{6,18}\*{2,}\d{2,4}/.test(value)
  });
  const passengerIdMatch = passengerIdText.match(/(\d{6,18}\*{2,}\d{2,4})/);
  return passengerIdMatch?.[1] || '';
}

function parseTrainPassengerName(lines) {
  const firstPageLines = getPageLines(lines, 1);
  return pickTextFromRect(firstPageLines, { minX: 180, maxX: 420, minY: 140, maxY: 185 }, {
    accept: (value) => /[\u4E00-\u9FA5A-Za-z]/.test(value) && !/\d/.test(value) && value.length <= 24,
    reject: (value) => /12306|95306/.test(value)
  });
}

function parseTrainBuyerName(lines) {
  const firstPageLines = getPageLines(lines, 1);
  const bottomText = getLinesInRect(firstPageLines, { minY: 40, maxY: 90 })
    .map((line) => line.compact)
    .join('');
  const buyerMatch = bottomText.match(/购买方名称[:：]?(.+?)(?=统一社会信用代码|$)/);
  return cleanPartyName(buyerMatch?.[1] || '');
}

function parseTrainBuyerTaxId(lines) {
  const firstPageLines = getPageLines(lines, 1);
  const bottomText = getLinesInRect(firstPageLines, { minY: 40, maxY: 90 })
    .map((line) => line.compact)
    .join('');
  const taxMatch = bottomText.match(/(?:统一社会信用代码|纳税人识别号)[:：]?([A-Z0-9]{10,30})/i);
  return cleanFieldValue(taxMatch?.[1] || '');
}

function parseTrainInvoice(lines, fullText) {
  const firstPageLines = getPageLines(lines, 1);
  const ticketPrice = parseTrainTicketPrice(lines);
  const departureStation = pickTrainStation(firstPageLines, { maxX: 250, minY: 255, maxY: 315 });
  const arrivalStation = pickTrainStation(firstPageLines, { minX: 380, maxX: 560, minY: 255, maxY: 315 });
  const departureTime = parseTrainDepartureTime(lines);
  const seatNumber = parseTrainSeatNumber(lines);
  const passengerName = parseTrainPassengerName(lines);
  const passengerIdNumber = parseTrainPassengerIdNumber(lines);
  const buyerName = parseTrainBuyerName(lines);
  const buyerTaxId = parseTrainBuyerTaxId(lines);

  return {
    invoiceTypeKey: 'train',
    invoiceTypeName: '铁路电子客票',
    issueDate: parseTrainIssueDate(lines) || parseIssueDate(lines, fullText),
    amount: ticketPrice,
    invoiceAmount: ticketPrice,
    invoiceNumber: parseTrainInvoiceNumber(lines, fullText),
    invoiceCode: '',
    sellerName: '',
    buyerName: buyerName || parseBuyerName(lines, fullText),
    buyerTaxId: buyerTaxId || parseBuyerTaxId(lines, fullText),
    sellerTaxId: '',
    taxAmount: '',
    totalAmount: ticketPrice,
    totalAmountUpper: '',
    projectName: '',
    remarks: '',
    payee: '',
    reviewer: '',
    issuer: '',
    departureStation,
    arrivalStation,
    departureTime,
    seatNumber,
    ticketPrice,
    trainPassengerName: passengerName,
    trainPassengerIdNumber: passengerIdNumber
  };
}

export async function extractInvoiceFromPdf(file) {
  const buffer = await file.arrayBuffer();
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    cMapUrl: getPdfCMapUrl(),
    cMapPacked: true
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

    if (detectTrainInvoice(lines, fullText)) {
      const trainResult = parseTrainInvoice(lines, fullText);
      if (Object.values(trainResult).some(Boolean)) {
        return trainResult;
      }
    }

    const parsedAmount = parseAmount(lines, fullText);
    const parsedTotalAmount = parseTotalAmount(lines, fullText);
    const parsedInvoiceAmount = parseInvoiceAmount(lines, fullText) || parsedAmount;
    const parsedInvoiceNumber = parseInvoiceNumber(lines, fullText);
    const invoiceNumberIndex = parsedInvoiceNumber ? lines.findIndex((l) => (l.compact || '').includes(parsedInvoiceNumber)) : -1;
    const parsedTaxAmount = parseTaxAmount(lines, fullText, parsedInvoiceAmount || parsedTotalAmount, invoiceNumberIndex >= 0 ? invoiceNumberIndex : undefined);
    const result = {
      invoiceTypeKey: 'standard',
      invoiceTypeName: '常规发票',
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
      projectName: parseProjectName(lines),
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
