'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const ExcelJS = require('exceljs');
const { analyzeInventoryUpdate, writeInventoryUpdate } = require('../src/inventory-update');

async function makeWorkbook(filePath, rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('数据');
  rows.forEach((row) => sheet.addRow(row));
  await workbook.xlsx.writeFile(filePath);
}

test('按仓库和货品更新良品可用，零值有效且未匹配行保留', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-update-'));
  const table3Path = path.join(directory, '旧表三.xlsx');
  const inventoryPath = path.join(directory, '实时库存.xlsx');
  const outputPath = path.join(directory, '已更新.xlsx');
  await makeWorkbook(table3Path, [
    ['仓库名称', '货品名称', '良品可用', '实际订单安排'],
    ['甲仓', '大米', 10, 2],
    ['乙仓', '大米', 20, 3],
    ['乙仓 汇总', '', '', { formula: 'SUM(D2:D3)', result: 5 }]
  ]);
  await makeWorkbook(inventoryPath, [
    ['仓库名称', '货品名称', '良品可用'],
    ['甲仓', '大米', 0],
    ['丙仓', '大米', 99]
  ]);

  const analysis = await analyzeInventoryUpdate(table3Path, inventoryPath);
  assert.equal(analysis.matchedRows, 1);
  assert.equal(analysis.changedRows, 1);
  assert.equal(analysis.preservedRows, 1);
  assert.equal(analysis.ignoredInventoryRows, 1);
  assert.equal(analysis.canExport, true);

  await writeInventoryUpdate(table3Path, inventoryPath, outputPath);
  const output = new ExcelJS.Workbook();
  await output.xlsx.readFile(outputPath);
  const sheet = output.getWorksheet('数据');
  assert.equal(sheet.getCell('C2').value, 0);
  assert.equal(sheet.getCell('C3').value, 20);
  assert.equal(sheet.getCell('D2').value, 2);
  assert.deepEqual(sheet.getCell('D4').value, { formula: 'SUM(D2:D3)', result: 5 });
});

test('实时库存重复组合按行合计', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-update-sum-'));
  const table3Path = path.join(directory, '旧表三.xlsx');
  const inventoryPath = path.join(directory, '实时库存.xlsx');
  await makeWorkbook(table3Path, [
    ['仓库名称', '货品名称', '良品可用'],
    ['甲仓', '大米', 1]
  ]);
  await makeWorkbook(inventoryPath, [
    ['仓库名称', '货品名称', '良品可用'],
    ['甲仓', '大米', 2],
    ['甲仓', '大米', 3]
  ]);
  const analysis = await analyzeInventoryUpdate(table3Path, inventoryPath);
  assert.equal(analysis.updates[0].newValue, 5);
  assert.equal(analysis.duplicateInventoryGroups, 1);
});

test('多份库存文件可合并不同仓库，重叠仓库货品会阻止导出', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-update-multi-'));
  const table3Path = path.join(directory, '旧表三.xlsx');
  const firstPath = path.join(directory, '甲仓.xlsx');
  const secondPath = path.join(directory, '乙仓.xlsx');
  const conflictPath = path.join(directory, '甲仓重复.xlsx');
  await makeWorkbook(table3Path, [
    ['仓库名称', '货品名称', '良品可用'],
    ['甲仓', '大米', 1],
    ['乙仓', '大米', 1]
  ]);
  await makeWorkbook(firstPath, [['仓库名称', '货品名称', '良品可用'], ['甲仓', '大米', 2]]);
  await makeWorkbook(secondPath, [['仓库名称', '货品名称', '良品可用'], ['乙仓', '大米', 3]]);
  await makeWorkbook(conflictPath, [['仓库名称', '货品名称', '良品可用'], ['甲仓', '大米', 4]]);

  const valid = await analyzeInventoryUpdate(table3Path, [firstPath, secondPath]);
  assert.equal(valid.inventoryFileCount, 2);
  assert.equal(valid.matchedRows, 2);
  assert.equal(valid.canExport, true);

  const conflict = await analyzeInventoryUpdate(table3Path, [firstPath, conflictPath]);
  assert.equal(conflict.canExport, false);
  assert.match(conflict.errors[0], /同时出现在/);
});

test('在途明细按仓库货品汇总剩余数量并在表三末列生成仓库合计', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-transit-'));
  const table3Path = path.join(directory, '旧表三.xlsx');
  const inventoryPath = path.join(directory, '实时库存.xlsx');
  const transitPath = path.join(directory, '在途明细.xlsx');
  const outputPath = path.join(directory, '已更新.xlsx');
  await makeWorkbook(table3Path, [
    ['仓库名称', '货品名称', '良品可用', '实际订单安排'],
    ['甲仓', '大米', 10, 2],
    ['甲仓', '面粉', 20, 3],
    ['甲仓 汇总', '', '', { formula: 'SUM(D2:D3)', result: 5 }]
  ]);
  await makeWorkbook(inventoryPath, [
    ['仓库名称', '货品名称', '良品可用'],
    ['甲仓', '大米', 8],
    ['甲仓', '面粉', 20]
  ]);
  await makeWorkbook(transitPath, [
    ['仓库名称', '货品名称', '剩余数量'],
    ['甲仓', '大米', 4],
    ['甲仓', '大米', 6],
    ['乙仓', '大米', 99]
  ]);

  const analysis = await analyzeInventoryUpdate(table3Path, inventoryPath, transitPath);
  assert.equal(analysis.matchedTransitRows, 1);
  assert.equal(analysis.transitTotal, 10);
  assert.equal(analysis.duplicateTransitGroups, 1);
  assert.equal(analysis.ignoredTransitRows, 1);

  await writeInventoryUpdate(table3Path, inventoryPath, outputPath, transitPath);
  const output = new ExcelJS.Workbook();
  await output.xlsx.readFile(outputPath);
  const sheet = output.getWorksheet('数据');
  assert.equal(sheet.getCell('E1').value, '在途订单');
  assert.equal(sheet.getCell('E2').value, 10);
  assert.equal(sheet.getCell('E3').value, 0);
  assert.deepEqual(sheet.getCell('E4').value, { formula: 'SUM(E2:E3)', result: 10 });
});

test('不导入实时库存时，仅凭在途明细也可以生成', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'transit-only-'));
  const table3Path = path.join(directory, '旧表三.xlsx');
  const transitPath = path.join(directory, '在途明细.xlsx');
  const outputPath = path.join(directory, '已更新.xlsx');
  await makeWorkbook(table3Path, [
    ['仓库名称', '货品名称', '良品可用'],
    ['甲仓', '大米', 10],
    ['甲仓 汇总', '', '']
  ]);
  await makeWorkbook(transitPath, [
    ['仓库名称', '货品名称', '剩余数量'],
    ['甲仓', '大米', 7]
  ]);

  const analysis = await analyzeInventoryUpdate(table3Path, [], transitPath);
  assert.equal(analysis.matchedRows, 0);
  assert.equal(analysis.matchedTransitRows, 1);
  assert.equal(analysis.canExport, true);
  await writeInventoryUpdate(table3Path, [], outputPath, transitPath);

  const output = new ExcelJS.Workbook();
  await output.xlsx.readFile(outputPath);
  const sheet = output.getWorksheet('数据');
  assert.equal(sheet.getCell('C2').value, 10);
  assert.equal(sheet.getCell('D1').value, '在途订单');
  assert.equal(sheet.getCell('D2').value, 7);
});

test('在途文件未出现的仓库保留原有在途结果', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'transit-preserve-'));
  const table3Path = path.join(directory, '旧表三.xlsx');
  const transitPath = path.join(directory, '在途明细.xlsx');
  const outputPath = path.join(directory, '已更新.xlsx');
  await makeWorkbook(table3Path, [
    ['仓库名称', '货品名称', '良品可用', '在途订单'],
    ['甲仓', '大米', 10, 5],
    ['甲仓', '面粉', 20, 6],
    ['甲仓 汇总', '', '', { formula: 'SUM(D2:D3)', result: 11 }],
    ['乙仓', '大米', 30, 9],
    ['乙仓 汇总', '', '', { formula: 'SUM(D5:D5)', result: 9 }]
  ]);
  await makeWorkbook(transitPath, [
    ['仓库名称', '货品名称', '剩余数量'],
    ['甲仓', '大米', 7]
  ]);

  const analysis = await analyzeInventoryUpdate(table3Path, [], transitPath);
  assert.deepEqual(analysis.preservedTransitWarehouses, ['乙仓']);
  await writeInventoryUpdate(table3Path, [], outputPath, transitPath);

  const output = new ExcelJS.Workbook();
  await output.xlsx.readFile(outputPath);
  const sheet = output.getWorksheet('数据');
  assert.equal(sheet.getCell('D2').value, 7);
  assert.equal(sheet.getCell('D3').value, 0);
  assert.deepEqual(sheet.getCell('D4').value, { formula: 'SUM(D2:D3)', result: 7 });
  assert.equal(sheet.getCell('D5').value, 9);
  assert.deepEqual(sheet.getCell('D6').value, { formula: 'SUM(D5:D5)', result: 9 });
});

test('用户提供的旧表三和实时库存样例可精确更新嘉定仓', async (t) => {
  const table3Path = path.join(__dirname, '..', 'src', 'templates', '稻花翁-汇总最终.xlsx');
  const inventoryPath = path.join(__dirname, '..', 'src', 'templates', '实时库存_2026-09-29.xlsx');
  if (!fs.existsSync(table3Path) || !fs.existsSync(inventoryPath)) return t.skip('工作区未提供库存更新样例');
  const analysis = await analyzeInventoryUpdate(table3Path, inventoryPath);
  assert.equal(analysis.targetRows, 176);
  assert.equal(analysis.inventoryRows, 24);
  assert.equal(analysis.matchedRows, 11);
  assert.equal(analysis.changedRows, 11);
  assert.equal(analysis.preservedRows, 165);
  assert.equal(analysis.ignoredInventoryRows, 13);
  assert.deepEqual(analysis.updatedWarehouses, ['华东嘉定直营商超仓']);
  assert.equal(analysis.canExport, true);
});

test('用户提供的在途样例汇总为表三末列', async (t) => {
  const table3Path = path.join(__dirname, '..', 'src', 'templates', '稻花翁-汇总最终.xlsx');
  const inventoryPath = path.join(__dirname, '..', 'src', 'templates', '实时库存_2026-09-29.xlsx');
  const transitPath = path.join(__dirname, '..', 'src', 'templates', '库存在途明细_2026-09-29.xlsx');
  if (![table3Path, inventoryPath, transitPath].every(fs.existsSync)) return t.skip('工作区未提供库存和在途样例');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-transit-real-'));
  const outputPath = path.join(directory, '已更新.xlsx');
  const analysis = await writeInventoryUpdate(table3Path, inventoryPath, outputPath, transitPath);
  assert.equal(analysis.transitRows, 45);
  assert.equal(analysis.matchedTransitRows, 11);
  assert.equal(analysis.ignoredTransitRows, 23);
  assert.equal(analysis.duplicateTransitGroups, 6);
  assert.equal(analysis.transitTotal, 2519);

  const output = new ExcelJS.Workbook();
  await output.xlsx.readFile(outputPath);
  const sheet = output.getWorksheet('稻花翁');
  assert.equal(sheet.getCell('T1').value, '在途订单');
  assert.equal(sheet.getCell('T2').value, 0);
  assert.equal(sheet.getCell('T188').value, 299);
  assert.deepEqual(sheet.getCell('T193').value, { formula: 'SUM(T182:T192)', result: 2519 });
});
