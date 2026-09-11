// 用法：node scripts/check-airline-invoice.mjs /path/to/airline.pdf
// 原始 PDF 仅在内存中读取，不写入仓库或输出旅客信息。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../client/node_modules/vite/dist/node/index.js';
import { getDocument, GlobalWorkerOptions } from '../client/node_modules/pdfjs-dist/legacy/build/pdf.mjs';

const samplePath = process.argv[2];
if (!samplePath) throw new Error('请提供可提取文本的航空电子行程单 PDF 路径。');
const root = fileURLToPath(new URL('../client', import.meta.url));
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
try {
  const parser = await server.ssrLoadModule('/src/lib/invoicePdfParser.js');
  const airline = await server.ssrLoadModule('/src/lib/airlineInvoice.js');
  const rules = await server.ssrLoadModule('/src/lib/invoicePdf.js');
  const ledger = await server.ssrLoadModule('/src/lib/invoiceLedger.js');
  const dedup = await server.ssrLoadModule('/src/lib/invoiceDedup.js');
  GlobalWorkerOptions.workerSrc = path.join(root, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
  const bytes = fs.readFileSync(samplePath);
  const result = await parser.extractInvoiceFromPdf({ arrayBuffer: async () => Uint8Array.from(bytes).buffer });
  assert.equal(result.invoiceTypeKey, 'airline');
  assert.equal(result.invoiceNumber.length, 20);
  assert.ok(result.electronicTicketNumber);
  assert.ok(result.flightSegments.length);
  assert.ok(result.buyerTaxId);
  const profile = rules.createDefaultRuleProfile('airline');
  const filename = rules.buildRenamedFileName('sample.pdf', result, profile, 1);
  assert.ok(filename.includes(result.totalAmount));
  assert.deepEqual(profile.items.filter((item) => item.enabled).map((item) => item.key), ['invoiceNumber', 'flightDate', 'buyerName', 'sellerName', 'totalAmount']);
  assert.equal(filename, `${result.invoiceNumber}+${result.flightDate}+${result.buyerName}+${result.sellerName}+${result.totalAmount}.pdf`);
  assert.ok(!filename.includes(result.airlinePassengerIdNumber));
  assert.deepEqual(rules.createDefaultRuleProfile('standard').items.filter((item) => item.enabled).map((item) => item.key), rules.DEFAULT_SELECTED_FIELDS);
  assert.ok(rules.createDefaultRuleProfile('train').items.find((item) => item.key === 'ticketPrice').enabled);
  assert.equal(airline.isAirlineInvoice('电子发票（铁路电子客票）'), false);
  assert.equal(airline.isAirlineInvoice('增值税电子普通发票'), false);
  const train = { invoiceTypeKey: 'train', departureTime: '2026-08-04 08:00', departureStation: '甲站', arrivalStation: '乙站', trainPassengerIdNumber: '110101********123X' };
  assert.ok(dedup.buildDedupIdentity(train).key.startsWith('train-trip:'));
  assert.equal(dedup.buildDedupIdentity({ invoiceCode: '001', invoiceNumber: '002' }).key, 'code-number:001|002');
  assert.ok(dedup.buildDedupIdentity(result).key.includes(result.invoiceNumber));
  const rows = ledger.buildInvoiceLedgerRows([{ file: { name: 'sample.pdf', size: bytes.length }, invoiceData: result, status: 'analyzed' }]);
  const columns = ledger.createDefaultLedgerFieldSelection('airline');
  const blob = await ledger.createInvoiceLedgerBlob(rows, columns);
  const ExcelJS = (await import('../client/node_modules/exceljs/dist/exceljs.min.js')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await blob.arrayBuffer());
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.getRow(2).getCell(columns.indexOf('invoiceNumber') + 1).value, result.invoiceNumber);
  assert.equal(sheet.getRow(2).getCell(columns.indexOf('electronicTicketNumber') + 1).value, result.electronicTicketNumber);
  assert.equal(String(sheet.getRow(2).getCell(columns.indexOf('totalAmount') + 1).value), result.totalAmount);

  const pdf = await getDocument({ data: Uint8Array.from(bytes) }).promise;
  const content = await (await pdf.getPage(1)).getTextContent();
  const lines = [{ pageNumber: 1, segments: content.items.map((item) => ({ text: item.str, x: item.transform[4], y: item.transform[5], width: item.width })) }];
  assert.deepEqual(airline.parseAirlineInvoice(lines), result);
  const changed = structuredClone(lines);
  const totalCell = changed[0].segments.find((item) => item.text.replace(/\s+/g, '') === `CNY${result.totalAmount}`);
  assert.ok(totalCell);
  totalCell.text = `CNY${(Number(result.totalAmount) + 1).toFixed(2)}`;
  assert.throws(() => airline.parseAirlineInvoice(changed), /金额明细与合计不一致/);
  const missing = structuredClone(lines);
  missing[0].segments = missing[0].segments.filter((item) => item.text.trim() !== result.invoiceNumber);
  assert.throws(() => airline.parseAirlineInvoice(missing), /关键字段识别不完整/);
  // 复制航班行生成第二航段，金额仍应只保留一份。
  const multi = structuredClone(lines);
  const stopRows = multi[0].segments.filter((item) => /^[自至][:：]/.test(item.text.trim())).sort((a, b) => b.y - a.y);
  const carrierX = multi[0].segments.find((item) => item.text === '承运人').x;
  const hop = stopRows[0].y - stopRows[1].y;
  multi[0].segments.push(...lines[0].segments.filter((item) => item.x >= carrierX && Math.abs(item.y - stopRows[0].y) < 4).map((item) => ({ ...item, y: item.y - hop })));
  multi[0].segments.push({ text: '测试机场', x: stopRows[2].x + stopRows[2].width + 2, y: stopRows[2].y, width: 40 });
  const multiResult = airline.parseAirlineInvoice(multi);
  assert.equal(multiResult.flightSegments.length, 2);
  assert.equal(multiResult.totalAmount, result.totalAmount);
  await pdf.destroy();
  console.log('通过：真实 PDF 解析、命名、Excel 回读、金额异常、字段缺失、多航段及普通发票/火车票规则回归。');
} finally {
  await server.close();
}
