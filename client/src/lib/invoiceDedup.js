function getTotalAmountValue(invoiceData) {
  return String(invoiceData?.totalAmount || invoiceData?.invoiceAmount || invoiceData?.amount || '').trim();
}

function cleanIdentityValue(value) {
  return String(value || '').trim();
}

export function buildDedupIdentity(invoiceData) {
  const invoiceCode = cleanIdentityValue(invoiceData?.invoiceCode);
  const invoiceNumber = cleanIdentityValue(invoiceData?.invoiceNumber);
  const issueDate = cleanIdentityValue(invoiceData?.issueDate);
  const totalAmount = getTotalAmountValue(invoiceData);
  const sellerTaxId = cleanIdentityValue(invoiceData?.sellerTaxId);
  const buyerTaxId = cleanIdentityValue(invoiceData?.buyerTaxId);

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
