function getTotalAmountValue(invoiceData) {
  return String(invoiceData?.totalAmount || invoiceData?.invoiceAmount || invoiceData?.amount || '').trim();
}

function cleanIdentityValue(value) {
  return String(value || '').trim();
}

export function buildDedupIdentity(invoiceData) {
  const invoiceTypeKey = cleanIdentityValue(invoiceData?.invoiceTypeKey);
  const invoiceCode = cleanIdentityValue(invoiceData?.invoiceCode);
  const invoiceNumber = cleanIdentityValue(invoiceData?.invoiceNumber);
  const issueDate = cleanIdentityValue(invoiceData?.issueDate);
  const totalAmount = getTotalAmountValue(invoiceData);
  const sellerTaxId = cleanIdentityValue(invoiceData?.sellerTaxId);
  const buyerTaxId = cleanIdentityValue(invoiceData?.buyerTaxId);
  const departureTime = cleanIdentityValue(invoiceData?.departureTime);
  const departureStation = cleanIdentityValue(invoiceData?.departureStation);
  const arrivalStation = cleanIdentityValue(invoiceData?.arrivalStation);
  const trainPassengerIdNumber = cleanIdentityValue(invoiceData?.trainPassengerIdNumber);

  if (invoiceTypeKey === 'train') {
    if (departureTime && departureStation && arrivalStation && trainPassengerIdNumber) {
      return {
        key: `train-trip:${departureTime}|${departureStation}|${arrivalStation}|${trainPassengerIdNumber}`,
        basis: '发车时间 + 始发站 + 终点站 + 乘车人身份证号',
        summary: `${departureTime} / ${departureStation} / ${arrivalStation} / ${trainPassengerIdNumber}`
      };
    }

    return {
      key: '',
      basis: '信息不足，按保留处理',
      summary: '未识别到稳定的火车票去重主键'
    };
  }

  if (invoiceCode && invoiceNumber) {
    return {
      key: `code-number:${invoiceCode}|${invoiceNumber}`,
      basis: '发票代码 + 发票号码',
      summary: `${invoiceCode} / ${invoiceNumber}`
    };
  }

  if (invoiceNumber && issueDate && totalAmount) {
    return {
      key: `number-date-total:${invoiceNumber}|${issueDate}|${totalAmount}`,
      basis: '发票号码 + 开票日期 + 价税合计',
      summary: `${invoiceNumber} / ${issueDate} / ${totalAmount}`
    };
  }

  if (sellerTaxId && buyerTaxId && issueDate && totalAmount) {
    return {
      key: `tax-date-total:${sellerTaxId}|${buyerTaxId}|${issueDate}|${totalAmount}`,
      basis: '销方税号 + 购方税号 + 开票日期 + 价税合计',
      summary: `${sellerTaxId} / ${buyerTaxId}`
    };
  }

  return {
    key: '',
    basis: '信息不足，按保留处理',
    summary: '未识别到稳定的去重主键'
  };
}

export function buildDedupResult(parsedItems) {
  const groupedMap = new Map();
  const resultMap = new Map();

  parsedItems.forEach((item, index) => {
    const identity = buildDedupIdentity(item.invoiceData);
    const enrichedItem = {
      ...item,
      order: index + 1,
      dedupKey: identity.key,
      dedupBasis: identity.basis,
      dedupSummary: identity.summary
    };

    if (!identity.key) {
      resultMap.set(item.id, {
        ...enrichedItem,
        status: 'keptWeak',
        dedupReason: '当前识别字段不足，已按保留处理，不会自动删除。'
      });
      return;
    }

    if (!groupedMap.has(identity.key)) {
      groupedMap.set(identity.key, []);
    }
    groupedMap.get(identity.key).push(enrichedItem);
  });

  groupedMap.forEach((group) => {
    const keeper = group[0];
    const duplicates = group.slice(1);

    resultMap.set(keeper.id, {
      ...keeper,
      status: 'kept',
      dedupReason: duplicates.length
        ? `保留首个文件，已识别 ${duplicates.length} 个重复文件。`
        : '未发现重复。'
    });

    duplicates.forEach((item) => {
      resultMap.set(item.id, {
        ...item,
        status: 'duplicate',
        dedupReason: `与第 ${keeper.order} 个文件重复。`
      });
    });
  });

  const rows = parsedItems.map((item) => resultMap.get(item.id));
  const keptRows = rows.filter((item) => item.status === 'kept' || item.status === 'keptWeak');

  return {
    rows,
    keptRows
  };
}

export function buildAmountMatchResult(parsedItems) {
  const groupedMap = new Map();
  const resultMap = new Map();

  parsedItems.forEach((item, index) => {
    const totalAmount = getTotalAmountValue(item.invoiceData);
    const enrichedItem = {
      ...item,
      order: index + 1,
      amountMatchKey: totalAmount ? `amount:${totalAmount}` : '',
      amountMatchBasis: totalAmount ? '价税合计一致' : '未识别到价税合计',
      amountMatchSummary: totalAmount || '未识别到价税合计'
    };

    if (!totalAmount) {
      resultMap.set(item.id, {
        ...enrichedItem,
        amountMatchStatus: '',
        amountMatchReason: ''
      });
      return;
    }

    if (!groupedMap.has(totalAmount)) {
      groupedMap.set(totalAmount, []);
    }
    groupedMap.get(totalAmount).push(enrichedItem);
  });

  groupedMap.forEach((group) => {
    group.forEach((item) => {
      resultMap.set(item.id, {
        ...item,
        amountMatchStatus: group.length > 1 ? 'sameAmount' : '',
        amountMatchReason: group.length > 1
          ? `与 ${group.length - 1} 张发票价税合计一致，请留意是否存在重开或重复报销。`
          : ''
      });
    });
  });

  return parsedItems.map((item) => resultMap.get(item.id) || {
    ...item,
    amountMatchStatus: '',
    amountMatchReason: '',
    amountMatchBasis: '',
    amountMatchSummary: ''
  });
}

export function getLedgerDuplicateLabel(status) {
  if (status === 'duplicate') {
    return '重复';
  }
  if (status === 'keptWeak') {
    return '信息不足';
  }
  if (status === 'kept') {
    return '唯一';
  }
  return '';
}

export function getLedgerAmountMatchLabel(status) {
  if (status === 'sameAmount') {
    return '金额一致';
  }
  return '';
}
