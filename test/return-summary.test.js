'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { RETURN_TYPE, INBOUND_TYPE, HEADERS, TEMPLATE_PATH, readReturnWorkbook, analyzeReturnSummary, buildReturnWorkbook } = require('../src/services/return-summary-service');
const { registerReturnSummaryIpc } = require('../src/return-summary-ipc');
const { sanitizeProductRow } = require('../src/product-preset');
const samplePath = path.join(__dirname, '../src/templates/EXPORT_APPOINT_ORDER_BY_ITEM_1792646417317110493998.xlsx');
const master = [{ '条码': '111#222', '订单简称': '桥米', '品牌名称': '国宝' }];
const row = (patch = {}) => ({ rowNumber: 2, '预约单类型': RETURN_TYPE, '预约日期': '2026-10-01', '履行单号': 'LBX001', '货品条码': '111', '货品名称': '桥米5kg', '品牌名称': '国宝', '总件数': '3', '总箱数': 50, '箱规': 10, '预约单状态': '已预约', ...patch });

test('types, direct package quantities, aliases, zero values, independent date/order keys and Chinese ordering', () => {
  const rows = [row(), row({ rowNumber: 3, '货品条码': 'other#222', '总件数': '0' }), row({ rowNumber: 4, '预约日期': '2026/10/2', '总件数': 4 }), row({ rowNumber: 5, '货品条码': '333', '总件数': 2 }), row({ '预约单类型': INBOUND_TYPE, '总件数': 25 })];
  const products = [...master, { '条码': '333', '订单简称': '大米' }];
  const result = analyzeReturnSummary(rows, products);
  assert.equal(result.totalPackages, 9);
  assert.equal(result.includedCount, 4);
  assert.equal(result.orderSummary.length, 2, 'same order number on different dates stays separate');
  assert.deepEqual(result.orderSummary.map(r => r.quantity), [5, 4]);
  assert.deepEqual(result.productSummary.map(p => p.name), ['大米', '桥米']);
  assert.equal(result.productTotal, result.orderTotal);
  assert.equal(result.canExport, true);
  const inbound = analyzeReturnSummary(rows, products, INBOUND_TYPE);
  assert.equal(inbound.totalPackages, 25);
  assert.equal(inbound.summaryName, '入库汇总');
  assert.equal(inbound.orderHeader, '履行单号');
  const zero = analyzeReturnSummary([row({ '总件数': 0 })], master);
  assert.equal(zero.canExport, true);
  assert.equal(zero.productSummary[0].quantity, 0);
});

test('missing required values are excluded with source row and packages; invalid quantities and dates block export', () => {
  const result = analyzeReturnSummary([row(), row({ rowNumber: 3, '预约日期': '', '总件数': 2 }), row({ rowNumber: 4, '履行单号': '', '总件数': 4 })], master);
  assert.equal(result.excludedPackages, 6);
  assert.deepEqual(result.excluded.map(r => r.rowNumber), [3, 4]);
  assert.equal(result.includedCount, 1);
  assert.equal(result.totalPackages, 3);
  assert.equal(result.canExport, true);
  for (const value of ['', ' ', null, undefined, -1, 0.1, 'abc', Infinity, true, Number.MAX_SAFE_INTEGER + 1]) {
    const invalid = analyzeReturnSummary([row({ '总件数': value })], master);
    assert.equal(invalid.canExport, false, String(value));
    assert.ok(invalid.issues.some(issue => issue.kind === 'quantity'));
  }
  assert.equal(analyzeReturnSummary([row({ '预约日期': '2026-02-30' })], master).canExport, false);
  assert.equal(analyzeReturnSummary([], master).canExport, false);
  assert.equal(analyzeReturnSummary([row({ '总件数': Number.MAX_SAFE_INTEGER }), row()], master).canExport, false, 'unsafe aggregate blocks export');
});

test('unmatched, blank short names and ambiguous aliases retain quantity and block until corrected', () => {
  const source = [row()];
  for (const products of [[], [{ '条码': '111', '订单简称': '' }], [...master, { '条码': '111', '订单简称': '第二商品' }]]) {
    const result = analyzeReturnSummary(source, products);
    assert.equal(result.totalPackages, 3);
    assert.equal(result.productTotal, 3);
    assert.equal(result.orderTotal, 3);
    assert.equal(result.matchIssues.length, 1);
    assert.equal(result.canExport, false);
  }
  assert.equal(analyzeReturnSummary(source, master).canExport, true);
  assert.equal(sanitizeProductRow({ '条码': '111', '订单简称': '', '货品名称（带空格）': '完整名称' })['订单简称'], '');
});

test('real input first sheet: all statuses retained, default 550 rows / 2440 packages, inbound 152272', async () => {
  const source = await readReturnWorkbook(samplePath);
  const products = require('../product-preset.json').rows;
  assert.equal(source.defaultType, RETURN_TYPE);
  const result = analyzeReturnSummary(source.rows, products);
  assert.equal(source.rows.length, 2693);
  assert.equal(result.selectedCount, 558);
  assert.equal(result.includedCount, 550);
  assert.equal(result.totalPackages, 2440);
  assert.equal(result.excluded.length, 8);
  assert.equal(result.excludedPackages, 10);
  assert.deepEqual([...new Set(result.matchIssues.map(issue => issue.barcode))].sort(), ['6911006000892', '6911006999523']);
  const fixed = [...products, ...[...new Set(result.matchIssues.map(issue => issue.barcode))].map(code => ({ '条码': code, '订单简称': `测试商品${code}` }))];
  const rematched = analyzeReturnSummary(source.rows, fixed);
  assert.equal(rematched.canExport, true);
  assert.equal(rematched.productTotal, rematched.orderTotal);
  const inbound = analyzeReturnSummary(source.rows, fixed, INBOUND_TYPE);
  assert.equal(inbound.includedCount, 2135);
  assert.equal(inbound.totalPackages, 152272);
  assert.equal(inbound.canExport, true);
});

test('XLSX header mapping ignores position, only first sheet; missing headers rejected', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'returns-import-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('first');
  const headers = [...HEADERS].reverse();
  sheet.addRow(headers); sheet.addRow(headers.map(header => row()[header]));
  workbook.addWorksheet('ignore').addRow(['not a valid sheet']);
  const file = path.join(dir, 'input.xlsx'); await workbook.xlsx.writeFile(file);
  const source = await readReturnWorkbook(file);
  assert.equal(source.rows[0]['总件数'], '3');
  assert.equal(source.rows[0].rowNumber, 2);
  assert.equal(analyzeReturnSummary(source.rows, master).canExport, true);
  sheet.getCell('A1').value = '错误字段'; await workbook.xlsx.writeFile(file);
  await assert.rejects(readReturnWorkbook(file), /缺少字段/);
});

test('single sheet export expands both blocks, preserves template styles and caches independent SUM formulas', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'returns-export-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const products = Array.from({ length: 45 }, (_, i) => ({ '条码': `P${i}`, '订单简称': `商品${i}` }));
  const rows = Array.from({ length: 80 }, (_, i) => row({ rowNumber: i + 2, '货品条码': `P${i % 45}`, '履行单号': `LBX${String(i).padStart(3, '0')}`, '总件数': i }));
  const template = new ExcelJS.Workbook(); await template.xlsx.readFile(TEMPLATE_PATH);
  for (const type of [RETURN_TYPE, INBOUND_TYPE]) {
    const analysis = analyzeReturnSummary(rows.map(r => ({ ...r, '预约单类型': type })), products, type);
    const output = await buildReturnWorkbook(analysis, analysis.defaultTitle);
    const file = path.join(dir, `${analysis.summaryName}.xlsx`); await output.xlsx.writeFile(file);
    const readback = new ExcelJS.Workbook(); await readback.xlsx.readFile(file);
    assert.equal(readback.worksheets.length, 1);
    const sheet = readback.worksheets[0], original = template.worksheets[0];
    assert.equal(sheet.name, analysis.summaryName);
    assert.equal(sheet.getCell('G2').value, type === RETURN_TYPE ? '退供单号' : '履行单号');
    assert.deepEqual(sheet.model.merges, ['A1:H1']);
    assert.equal(sheet.getCell('D3').value, null);
    assert.deepEqual(sheet.getCell('C48').value, { formula: 'SUM(C3:C47)', result: 3160 });
    assert.deepEqual(sheet.getCell('H83').value, { formula: 'SUM(H3:H82)', result: 3160 });
    assert.equal(sheet.getCell('A47').value, 45);
    assert.equal(sheet.getCell('E82').value, 80);
    assert.equal(sheet.getCell('H82').value, 79);
    assert.deepEqual(sheet.getCell('B3').font, original.getCell('B3').font);
    assert.deepEqual(sheet.getCell('B3').border, original.getCell('B3').border);
    assert.deepEqual(sheet.getCell('B48').style, original.getCell('B20').style);
    assert.deepEqual(sheet.getCell('A1').style, original.getCell('A1').style);
    for (const col of [1, 2, 3, 5, 6, 7, 8]) assert.equal(sheet.getColumn(col).width ?? sheet.properties.defaultColWidth, original.getColumn(col).width ?? original.properties.defaultColWidth);
    assert.equal(sheet.getRow(3).height, 20);
    assert.equal(sheet.pageSetup.printArea, 'A1:H83');
    assert.equal(sheet.pageSetup.fitToWidth, 1);
    assert.equal(sheet.pageSetup.fitToHeight, 0);
  }
  await assert.rejects(buildReturnWorkbook(analyzeReturnSummary([], master), '空结果'), /校验/);
});

test('IPC keeps trusted import snapshot, revalidates latest master, handles cancellation and protects originals', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'returns-ipc-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const input = path.join(dir, 'source.xlsx');
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet('明细');
  sheet.addRow(HEADERS); sheet.addRow(HEADERS.map(header => row()[header])); await workbook.xlsx.writeFile(input);
  const handlers = new Map(); let products = master, openCanceled = false, saveCanceled = false, target = path.join(dir, 'output.xlsx'), onSave;
  registerReturnSummaryIpc({ ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, getWindow: () => null, loadProducts: async () => products,
    dialog: { showOpenDialog: async () => ({ canceled: openCanceled, filePaths: [input] }), showSaveDialog: async () => { onSave?.(); return { canceled: saveCanceled, filePath: target }; } } });
  const call = (name, payload) => handlers.get(`return-summary:${name}`)(null, payload);
  const imported = await call('import');
  const payload = { token: imported.token, type: RETURN_TYPE, title: '测试退货汇总', rows: [row({ '总件数': 999 })] };
  assert.equal((await call('analyze', payload)).totalPackages, 3);
  products = []; assert.equal((await call('export', payload)).ok, false);
  products = master; saveCanceled = true; assert.equal(await call('export', payload), null);
  saveCanceled = false; target = input; await assert.rejects(call('export', payload), /不能覆盖/);
  target = path.join(dir, 'output.xlsx'); onSave = () => { products = []; };
  assert.equal((await call('export', payload)).ok, false, 'revalidate after save dialog');
  products = master; onSave = null; assert.equal((await call('export', payload)).ok, true);
  assert.ok((await fs.stat(target)).size > 0);
  openCanceled = true; assert.equal(await call('import'), null);
  assert.equal((await call('analyze', payload)).canExport, true, 'cancel preserves current import');
  await assert.rejects(call('analyze', { ...payload, token: 'renderer-invented' }), /失效/);
});
