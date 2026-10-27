'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const service = require('../src/services/daily-outbound-service');
const { registerDailyOutboundIpc } = require('../src/daily-outbound-ipc');
const samplePath = service.TEMPLATE_PATH;
function fixture(patches = [{}]) {
  return { dates: ['2026-10-25'], rows: patches.map((patch, i) => ({ id: `r${i + 2}`, rowNumber: i + 2, date: '2026-10-25', name: '桥米5kg', sku: String(i + 1), status: '上柜', issues: [], metrics: Object.fromEntries(service.REQUIRED_HEADERS.filter(h => !['时间', '商品名称', 'SKU', '上下柜状态'].includes(h)).map(h => [h, /现货库存/.test(h) ? 9 : 2])), ...patch })) };
}
const choose = analysis => Object.fromEntries(analysis.conflicts.map(conflict => [conflict.name, conflict.candidates.find(candidate => candidate.stock > 0)?.sku || conflict.candidates[0].sku]));

test('spec inference handles kg, jin, grams, matching units and ambiguous or missing weights', () => {
  for (const [name, expected] of [['大米20斤', 10], ['大米5KG', 5], ['小包装300g', 0.3], ['大米300克', 0.3], ['大米2.5公斤', 2.5], ['大米10斤5kg', 5], ['大米10斤10kg', null], ['没有规格', null], ['大米0kg', null]]) assert.equal(service.inferSpec(name), expected, name);
});

test('status/date scope, duplicate names flagged without SKU summation, keep and rename resolutions', () => {
  const source = fixture([{}, { sku: '0002', metrics: Object.fromEntries(service.REQUIRED_HEADERS.filter(h => !['时间', '商品名称', 'SKU', '上下柜状态'].includes(h)).map(h => [h, 100])) }, { status: '下柜', name: '下柜品10kg' }]);
  let result = service.analyzeDailyOutbound(source);
  assert.equal(result.matchedCount, 2); assert.equal(result.conflicts.length, 1); assert.equal(result.products.length, 2); assert.equal(result.canExport, false);
  assert.deepEqual(result.products.map(row => row.sku), ['1', '0002']);
  result = service.analyzeDailyOutbound(source, { edits: { choices: { '桥米5kg': '1' } } });
  assert.equal(result.canExport, true); assert.equal(result.products.length, 1); assert.equal(result.excluded.length, 1); assert.equal(result.totals.nationalStock, 9, 'Excluded SKU inventory must not merge');
  result = service.analyzeDailyOutbound(source, { edits: { names: { r3: '另一款桥米5kg' } } });
  assert.equal(result.conflicts.length, 0); assert.equal(result.products.length, 2); assert.equal(result.canExport, true);
  assert.equal(service.analyzeDailyOutbound(source, { status: '下柜' }).products.length, 1);
  assert.equal(service.analyzeDailyOutbound(source, { status: '全部' }).matchedCount, 3);
  const multi = fixture([{}, { date: '2026-10-26', sku: '1' }]); multi.dates.push('2026-10-26');
  assert.equal(service.analyzeDailyOutbound(multi).canExport, false, 'Multiple dates require selection');
  assert.equal(service.analyzeDailyOutbound(multi, { date: '2026-10-25' }).matchedCount, 1);
});

test('quantities default to zero for all warehouses, updates use tonnes, invalid inputs block export', () => {
  const source = fixture(); let result = service.analyzeDailyOutbound(source);
  for (const value of Object.values(result.products[0].warehouses)) { assert.equal(value.quantity, 0); assert.equal(value.weight, 0); assert.equal(value.suggested, -1); }
  result = service.analyzeDailyOutbound(source, { edits: { specs: { r2: '0.3' }, quantities: { r2: { 上海: '1', 广州城市: 20 } } } });
  assert.equal(result.products[0].warehouses['上海'].weight, 0.0003); assert.equal(result.totals.warehouses['广州城市'].weight, 0.006);
  for (const value of ['', ' ', -1, '2.1', 'abc', Infinity, true]) assert.equal(service.analyzeDailyOutbound(source, { edits: { quantities: { r2: { 上海: value } } } }).canExport, false, `quantity ${String(value)}`);
  for (const spec of ['', 0, -1, 'abc']) assert.equal(service.analyzeDailyOutbound(source, { edits: { specs: { r2: spec } } }).canExport, false);
  assert.equal(service.analyzeDailyOutbound(fixture([{ name: '没有规格' }])).canExport, false);
  assert.equal(service.analyzeDailyOutbound(fixture([{ name: '没有规格' }]), { edits: { specs: { r2: 5 } } }).canExport, true);
});

test('real source: 186 records, 42 listed records and two exact SKU conflicts; resolution gives 40 products', async () => {
  const source = await service.readDailyOutbound(samplePath); const initial = service.analyzeDailyOutbound(source);
  assert.equal(source.rows.length, 186); assert.deepEqual(source.dates, ['2026-10-25']); assert.equal(initial.matchedCount, 42); assert.equal(initial.conflicts.length, 2); assert.equal(initial.issues.length, 0);
  assert.deepEqual(initial.conflicts.map(conflict => conflict.candidates.map(item => item.sku).sort()).sort(), [['100268552721', '100436342408'], ['100289715511', '100437211078']].sort());
  const fixed = service.analyzeDailyOutbound(source, { edits: { choices: choose(initial) } });
  assert.equal(fixed.products.length, 40); assert.equal(fixed.canExport, true); assert.equal(fixed.totals.nationalOut7, 24554); assert.equal(fixed.totals.nationalStock, 88288);
  assert.equal(fixed.products.find(row => row.sku === '100280162897').spec, 0.3);
  assert.equal(fixed.products.some(row => ['200704895129', '200726926589'].includes(row.sku)), false);
});

test('single-sheet 70-column export retains cached formulas, text SKU, zero defaults and dynamic totals beyond template rows', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'daily-export-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const source = fixture(Array.from({ length: 65 }, (_, i) => ({ name: `产品${i}300g`, sku: `00${i}` })));
  const analysis = service.analyzeDailyOutbound(source, { edits: { quantities: { r2: { 上海: 1, 广州城市: 10 } } } });
  const file = path.join(dir, 'output.xlsx'), output = await service.buildDailyOutboundWorkbook(analysis); await output.xlsx.writeFile(file);
  const read = new ExcelJS.Workbook(); await read.xlsx.readFile(file); const sheet = read.worksheets[0];
  assert.equal(read.worksheets.length, 1); assert.equal(sheet.columnCount, 70); assert.equal(sheet.rowCount, 67);
  assert.equal(sheet.getCell('C2').value, '000'); assert.equal(sheet.getCell('C2').type, ExcelJS.ValueType.String);
  assert.deepEqual(sheet.getCell('H2').value, { formula: 'F2*4-G2', result: -1 });
  assert.deepEqual(sheet.getCell('J2').value, { formula: '$B2*I2/1000', result: 0.0003 });
  assert.equal(sheet.getCell('BQ2').value, 10); assert.deepEqual(sheet.getCell('BR2').value, { formula: '$B2*BQ2/1000', result: 0.003 });
  assert.deepEqual(sheet.getCell('I67').value, { formula: 'SUM(I2:I66)', result: 1 });
  assert.deepEqual(sheet.getCell('J67').value, { formula: 'SUM(J2:J66)', result: 0.0003 });
  assert.deepEqual(sheet.getCell('BR67').value, { formula: 'SUM(BR2:BR66)', result: 0.003 });
  assert.equal(sheet.getCell('C67').value, null); assert.equal(sheet.getCell('B67').value, null);
  assert.equal(sheet.pageSetup.printArea, 'A1:BR67'); assert.equal(sheet.views[0].xSplit, 3);
  const template = new ExcelJS.Workbook(); await template.xlsx.readFile(samplePath);
  assert.deepEqual(sheet.getCell('A2').font, template.worksheets[2].getCell('A2').font || template.worksheets[2].getCell('B2').font);
  const zero = await service.buildDailyOutboundWorkbook(service.analyzeDailyOutbound(fixture())); const bytes = await zero.xlsx.writeBuffer(); const z = new ExcelJS.Workbook(); await z.xlsx.load(bytes);
  for (let i = 0; i < 13; i++) { assert.equal(z.worksheets[0].getCell(2, 9 + i * 5).value, 0); assert.equal(z.worksheets[0].getCell(2, 10 + i * 5).result, 0); }
});

test('first sheet headers, nonnumeric source metrics, blank pivot values and edited-date scope', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'daily-import-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const w = new ExcelJS.Workbook(), sheet = w.addWorksheet('first'); w.addWorksheet('ignore');
  sheet.addRow(service.REQUIRED_HEADERS);
  const values = Object.fromEntries(service.REQUIRED_HEADERS.map(header => [header, '']));
  Object.assign(values, { 时间: '2026-10-25', 商品名称: '测试5kg', SKU: '00001', 上下柜状态: '上柜', 全国现货库存: 'bad' });
  sheet.addRow(service.REQUIRED_HEADERS.map(header => values[header]));
  const file = path.join(dir, 'input.xlsx'); await w.xlsx.writeFile(file);
  let source = await service.readDailyOutbound(file), analysis = service.analyzeDailyOutbound(source);
  assert.equal(source.rows.length, 1); assert.equal(analysis.canExport, false); assert.match(analysis.issues[0].reason, /全国现货库存/);
  sheet.getCell(2, service.REQUIRED_HEADERS.indexOf('全国现货库存') + 1).value = 0; await w.xlsx.writeFile(file);
  source = await service.readDailyOutbound(file); analysis = service.analyzeDailyOutbound(source); assert.equal(analysis.canExport, true); assert.equal(analysis.products[0].warehouses['上海'].stock, 0);
  sheet.getCell('A1').value = 'wrong'; await w.xlsx.writeFile(file); await assert.rejects(service.readDailyOutbound(file), /缺少字段/);
});

test('IPC import cancellation preserves session, export independently validates edits, cancel and original-file protection', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'daily-ipc-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const handlers = new Map(); let openCanceled = false, saveCanceled = false, target = path.join(dir, 'export.xlsx');
  registerDailyOutboundIpc({ ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) }, getWindow: () => null, dialog: { showOpenDialog: async () => ({ canceled: openCanceled, filePaths: [samplePath] }), showSaveDialog: async () => ({ canceled: saveCanceled, filePath: target }) } });
  const call = (action, payload) => handlers.get(`daily-outbound:${action}`)(null, payload);
  const imported = await call('import'), payload = { token: imported.token, date: imported.analysis.date, status: '上柜', edits: { choices: choose(imported.analysis) } };
  assert.equal((await call('export', { ...payload, edits: {} })).ok, false);
  assert.equal((await call('analyze', payload)).canExport, true);
  saveCanceled = true; assert.equal(await call('export', payload), null); saveCanceled = false;
  target = samplePath; await assert.rejects(call('export', payload), /不能覆盖/);
  target = path.join(dir, 'export.xlsx'); assert.equal((await call('export', payload)).ok, true); assert.ok((await fs.stat(target)).size > 0);
  openCanceled = true; assert.equal(await call('import'), null); assert.equal((await call('analyze', payload)).canExport, true);
  await assert.rejects(call('analyze', { ...payload, token: 'untrusted' }), /会话已失效/);
  const forged = { ...payload, analysis: { canExport: true }, edits: { ...payload.edits, quantities: { [imported.analysis.products[0].id]: { 上海: -1 } } } };
  assert.equal((await call('export', forged)).ok, false);
});
