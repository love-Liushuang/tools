// 可选参数：真实航空行程单 PDF 路径。测试不保存票据原文及旅客信息。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from '../client/node_modules/vite/dist/node/index.js';
import { GlobalWorkerOptions } from '../client/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import ExcelJS from '../client/node_modules/exceljs/dist/exceljs.min.js';
import JSZip from '../client/node_modules/jszip/lib/index.js';

// 生成带自包含 Unicode 映射的文本 PDF，使用虚构票据验证完整 PDF.js 链路。
function makePdf(lines) {
  const text = lines.map(([x, y, value]) => `BT /F1 10 Tf 1 0 0 1 ${x} ${y} Tm <${[...value].map((c) => c.charCodeAt(0).toString(16).padStart(4, '0')).join('')}> Tj ET`).join('\n');
  const cmap = '/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Adobe-Identity-UCS def /CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange 1 beginbfrange <0000> <FFFF> <0000> endbfrange endcmap CMapName currentdict /CMap defineresource pop end end';
  const stream = (value) => `<< /Length ${Buffer.byteLength(value)} >>\nstream\n${value}\nendstream`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 650 400] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>', '<< /Type /Font /Subtype /Type0 /BaseFont /TestFont /Encoding /Identity-H /DescendantFonts [5 0 R] /ToUnicode 6 0 R >>', '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /TestFont /FontDescriptor 8 0 R /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /DW 600 >>', stream(cmap), stream(text), '<< /Type /FontDescriptor /FontName /TestFont /Flags 4 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >>'];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
const root = fileURLToPath(new URL('../client', import.meta.url));
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
try {
  const mixed = await server.ssrLoadModule('/src/lib/mixedInvoice.js');
  const rules = await server.ssrLoadModule('/src/lib/invoicePdf.js');
  const ledger = await server.ssrLoadModule('/src/lib/invoiceLedger.js');
  const parser = await server.ssrLoadModule('/src/lib/invoicePdfParser.js');
  const registry = await server.ssrLoadModule('/src/data/tools.js');
  GlobalWorkerOptions.workerSrc = `${root}/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs`;
  const file = (name, bytes = Buffer.from('test'), relativePath = name) => ({ name, webkitRelativePath: relativePath, size: bytes.length, arrayBuffer: async () => Uint8Array.from(bytes).buffer });
  const base = { invoiceTypeKey: 'standard', invoiceNumber: '00123456789012345678', issueDate: '2026-08-12', buyerName: '测试购买公司', sellerName: '测试销售公司', totalAmount: '10.10', currency: 'CNY' };
  const train = { ...base, invoiceTypeKey: 'train', ticketPrice: '20.20', totalAmount: '20.20', departureTime: '2026-08-04 08:00', departureStation: '甲站', arrivalStation: '乙站', trainPassengerIdNumber: '110101********123X' };
  let airline = { ...base, invoiceTypeKey: 'airline', totalAmount: '1370.00', flightDate: '2026-08-04', airlinePassengerName: '测试旅客' };
  if (process.argv[2]) airline = await parser.extractInvoiceFromPdf(file('airline.pdf', fs.readFileSync(process.argv[2])), { strict: true });
  const items = mixed.annotateMixedInvoices([
    { id: 's1', file: file('same.pdf', undefined, 'folder/a/same.pdf'), invoiceData: base },
    { id: 's2', file: file('same.pdf', undefined, 'folder/b/same.pdf'), invoiceData: { ...base } },
    { id: 't', file: file('train.pdf'), invoiceData: train },
    { id: 'a', file: file('airline.pdf'), invoiceData: airline },
    { id: 'e', file: file('bad.pdf'), error: '未识别到发票' }
  ]);
  assert.equal(items[1].duplicateStatus, 'duplicate');
  assert.notEqual(items[2].duplicateStatus, 'duplicate');
  const summary = mixed.summarizeMixedInvoices(items);
  const total = summary.find((row) => row.type === 'all');
  assert.equal(total.count, 4);
  assert.equal(total.duplicateCount, 1);
  assert.equal(total.totalCents, 1010 * 2 + 2020 + mixed.invoiceAmountCents(airline));
  assert.equal(total.keptCents, total.totalCents - 1010);
  assert.equal(mixed.invoiceAmountCents({ ...base, totalAmount: '-1.01' }), -101);
  assert.equal(mixed.invoiceAmountCents({ ...base, totalAmount: '0.00' }), 0);
  assert.throws(() => mixed.invoiceAmountCents({ ...base, totalAmount: '' }), /金额/);
  const twoCurrencies = mixed.annotateMixedInvoices([...items, { id: 'usd', file: file('usd.pdf'), invoiceData: { ...base, currency: 'USD' } }]);
  assert.notEqual(twoCurrencies.at(-1).duplicateStatus, 'duplicate');
  assert.equal(mixed.summarizeMixedInvoices(twoCurrencies).filter((row) => row.type === 'all').length, 2);
  assert.equal(mixed.validateMixedInvoice(base, '电子发票 价税合计 USD10.10').currency, 'USD');
  assert.throws(() => mixed.validateMixedInvoice(base, '随便一个文档'), /关键字段|原文件|票据|发票/);
  assert.throws(() => mixed.validateMixedInvoice(base, '电子发票 价税合计 CNY10.10 USD20.20'), /币种/);
  const sameAmounts = mixed.annotateMixedInvoices([{ id: 'x', file: file('x.pdf'), invoiceData: base }, { id: 'y', file: file('y.pdf'), invoiceData: { ...base, invoiceNumber: 'different' } }]);
  assert.equal(sameAmounts[1].amountMatchStatus, 'sameAmount');
  assert.notEqual(sameAmounts[1].duplicateStatus, 'duplicate');

  const profiles = rules.createDefaultRuleProfiles();
  const plan = mixed.buildMixedRenamePlan(items, profiles);
  assert.equal(plan.length, 4);
  assert.equal(new Set(plan.map((item) => item.renamedName)).size, 4);
  assert.ok(plan.every((item) => !item.renamedName.includes('/')));
  assert.equal(mixed.buildMixedRenamePlan(items, profiles, true).length, 3);
  const archive = await JSZip.loadAsync(await (await mixed.createMixedInvoiceZip(plan)).arrayBuffer());
  assert.equal(Object.keys(archive.files).length, 4);
  assert.ok(Object.values(archive.files).every((entry) => !entry.dir));
  assert.equal(await archive.file(plan[0].renamedName).async('string'), 'test');

  const blob = await mixed.createMixedInvoiceLedger(items, ledger.createDefaultLedgerFieldSelectionMap());
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await blob.arrayBuffer());
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['汇总', '普通发票', '火车票', '飞机票', '未成功处理']);
  assert.equal(workbook.getWorksheet('普通发票').rowCount, 3);
  assert.equal(workbook.getWorksheet('未成功处理').getRow(2).getCell(3).value, '未识别到发票');
  const standardSheet = workbook.getWorksheet('普通发票');
  const numberCol = standardSheet.getRow(1).values.indexOf('发票号码');
  assert.equal(standardSheet.getRow(2).getCell(numberCol).value, base.invoiceNumber);
  assert.equal(workbook.getWorksheet('汇总').getRow(5).getCell(4).value, total.totalCents / 100);
  const empty = new ExcelJS.Workbook();
  await empty.xlsx.load(await (await mixed.createMixedInvoiceLedger([items.at(-1)], ledger.createDefaultLedgerFieldSelectionMap())).arrayBuffer());
  assert.equal(empty.worksheets.length, 5);
  assert.equal(empty.getWorksheet('飞机票').rowCount, 1);
  for (const kind of ['invoice-pdf-rename', 'invoice-ledger-export']) {
    assert.ok(registry.featuredToolIds.includes(`${kind}-mixed`));
    for (const type of Object.keys(mixed.MIXED_INVOICE_TYPES)) {
      assert.ok(!registry.featuredToolIds.includes(`${kind}-${type}`));
      assert.ok(registry.tools.find((tool) => tool.id === `${kind}-${type}`));
    }
  }
  const standardPdf = makePdf([[180, 370, '增值税电子普通发票'], [20, 340, '发票号码:00123456789012345678'], [400, 320, '开票日期:2026年08月12日'], [20, 80, '价税合计(小写)￥10.10']]);
  const parsedStandard = await parser.extractInvoiceFromPdf(file('standard.pdf', standardPdf), { strict: true });
  assert.equal(parsedStandard.invoiceTypeKey, 'standard');
  assert.equal(parsedStandard.totalAmount, '10.10');
  const trainPdf = makePdf([[200, 375, '铁路电子客票'], [20, 345, '00123456789012345678'], [430, 345, '2026年08月12日'], [30, 290, '北京站'], [285, 290, 'G123'], [420, 290, '上海站'], [20, 248, '2026年08月04日08:00'], [20, 210, '20.20'], [20, 165, '110101********123X'], [200, 165, '测试旅客']]);
  const parsedTrain = await parser.extractInvoiceFromPdf(file('train.pdf', trainPdf), { strict: true });
  assert.equal(parsedTrain.invoiceTypeKey, 'train');
  assert.equal(parsedTrain.ticketPrice, '20.20');
  await assert.rejects(() => parser.extractInvoiceFromPdf(file('other.pdf', makePdf([[20, 300, '项目进度报告'] ])), { strict: true }), /关键字段|发票/);
  console.log('通过：三类解析、严格校验、分类/分币种汇总、重复与同额提醒、ZIP 同名和根目录、五表 Excel 回读、全失败导出及首页入口。');
} finally { await server.close(); }
