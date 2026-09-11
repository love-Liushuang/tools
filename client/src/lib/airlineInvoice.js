// 航空行程单使用表头定位列，保留整张票据金额及各航段信息。
const compact = (value) => String(value || '').replace(/\s+/g, '').replace(/：/g, ':');
const date = (value) => {
  const match = value.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : '';
};

export function isAirlineInvoice(text) {
  return compact(text).includes('航空运输电子客票行程单');
}

export function parseAirlineInvoice(lines) {
  const segments = lines.filter((line) => line.pageNumber === 1).flatMap((line) => line.segments).filter((item) => compact(item.text));
  const anchor = (label) => segments.find((item) => compact(item.text).replace(/:$/, '') === label);
  const read = (left, right, top, bottom) => segments
    .filter((item) => item.x >= left && item.x < right && item.y < top && item.y > bottom)
    .sort((a, b) => Math.abs(a.y - b.y) > 3 ? b.y - a.y : a.x - b.x)
    .map((item) => compact(item.text)).join('');
  const beside = (label, nextLabel) => {
    const start = anchor(label);
    const end = nextLabel ? anchor(nextLabel) : null;
    return start ? read(start.x + 1, end?.x ?? Infinity, start.y + 4, start.y - 4) : '';
  };
  const below = (label, nextLabel, depth = 25) => {
    const start = anchor(label);
    const end = anchor(nextLabel);
    return start ? read(start.x - 2, end?.x ?? Infinity, start.y - 4, start.y - depth) : '';
  };
  const money = (value) => {
    const match = value.match(/^(?:CNY|[¥￥])?(-?\d+(?:,\d{3})*\.\d{2})$/);
    return match ? Number(match[1].replace(/,/g, '')).toFixed(2) : '';
  };
  const result = {
    invoiceTypeKey: 'airline', invoiceTypeName: '航空运输电子客票行程单',
    invoiceNumber: beside('发票号码'),
    electronicTicketNumber: beside('电子客票号码', '验证码'),
    issueDate: date(beside('填开日期')),
    sellerName: beside('填开单位', '填开日期'),
    buyerName: beside('购买方名称', '统一社会信用代码/纳税人识别号'),
    buyerTaxId: beside('统一社会信用代码/纳税人识别号'),
    airlinePassengerName: below('旅客姓名', '有效身份证件号码'),
    airlinePassengerIdNumber: below('有效身份证件号码', '签注'),
    remarks: below('签注', ''),
    ticketPrice: money(below('票价', '燃油附加费')),
    fuelSurcharge: money(below('燃油附加费', '增值税税率')),
    taxRate: below('增值税税率', '增值税税额'),
    taxAmount: money(below('增值税税额', '民航发展基金')),
    aviationFund: money(below('民航发展基金', '其他税费')),
    otherTaxes: money(below('其他税费', '合计')),
    totalAmount: money(below('合计', '')),
    insuranceAmount: money(beside('保险费')),
    invoiceStatus: beside('开票状态'),
    travelType: beside('国内国际标识', '开票状态'),
    salesOutlet: beside('销售网点代号', '填开单位'),
    verificationCode: beside('验证码', '提示信息')
  };
  const carrier = anchor('承运人');
  const price = anchor('票价');
  const stops = segments.filter((item) => /^[自至]:/.test(compact(item.text)))
    .sort((a, b) => b.y - a.y)
    .map((item) => ({ y: item.y, name: read(item.x + item.width - 1, carrier?.x ?? 0, item.y + 4, item.y - 4) }))
    .filter((item) => item.name);
  result.flightSegments = [];
  for (let index = 0; index < stops.length - 1; index += 1) {
    const stop = stops[index];
    const cell = (label, nextLabel) => read((anchor(label)?.x ?? Infinity) - 4,
      (anchor(nextLabel)?.x ?? Infinity) - 4, stop.y + 5, stop.y - 5);
    if (!carrier || !price || stop.y <= price.y) continue;
    const flightDateText = cell('日期', '时间');
    // 日期可能比表头略向左延伸，因此以座位等级列之后作为日期左边界。
    const departureDate = date(read((anchor('座位等级')?.x ?? 0) + 25,
      (anchor('时间')?.x ?? Infinity) - 4, stop.y + 5, stop.y - 5)) || date(flightDateText);
    result.flightSegments.push({
      departureAirport: stop.name, arrivalAirport: stops[index + 1].name,
      carrier: cell('承运人', '航班号'), flightNumber: cell('航班号', '座位等级'),
      cabinClass: cell('座位等级', '日期').replace(/20\d{2}.*$/, ''),
      flightDate: departureDate,
      flightTime: cell('时间', '客票级别/客票类别'),
      fareBasis: cell('客票级别/客票类别', '客票生效日期有效截止日期免费行李'),
      freeBaggage: read(anchor('客票生效日期有效截止日期免费行李')?.x ?? Infinity, Infinity, stop.y + 5, stop.y - 5).match(/\d+(?:K|PC)$/i)?.[0] || ''
    });
  }
  for (const key of ['departureAirport', 'arrivalAirport', 'carrier', 'flightNumber', 'cabinClass', 'flightDate', 'flightTime', 'fareBasis', 'freeBaggage']) {
    result[key] = result.flightSegments.map((segment) => segment[key]).join(' / ');
  }
  const components = ['ticketPrice', 'fuelSurcharge', 'taxAmount', 'aviationFund', 'otherTaxes'];
  if (!/^\d{20}$/.test(result.invoiceNumber) || !result.issueDate || !result.totalAmount || !result.flightSegments.length
    || !result.airlinePassengerName || result.flightSegments.some((segment) => !segment.flightNumber || !segment.flightDate)) {
    throw new Error('飞机票关键字段识别不完整，请核对票据版式、发票号码、填开日期、航段及合计。');
  }
  if (components.some((key) => result[key] === '')) throw new Error('飞机票金额明细识别不完整，请核对原文件。');
  const cents = (value) => Math.round(Number(value) * 100);
  if (components.reduce((sum, key) => sum + cents(result[key]), 0) !== cents(result.totalAmount)) {
    throw new Error('飞机票金额明细与合计不一致，请核对原文件。');
  }
  // 展示票价和税额各自的票面值，汇总总额始终取合计。
  result.invoiceAmount = result.ticketPrice;
  result.amount = result.ticketPrice;
  return result;
}
