'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const {
  parseActualOrder,
  actualOrderCellValue,
  allocateSequentially,
  planBackfill,
  addBackfillTask,
  analyzeBackfillFile,
  writeBackfillFiles
} = require('../src/backfill');

test('按订单原表行顺序依次分配且不超过采购数量', () => {
  const rows = [
    { rowNumber: 2, '采购数量': 139 },
    { rowNumber: 10, '采购数量': 99 },
    { rowNumber: 23, '采购数量': 193 }
  ];
  const result = allocateSequentially(rows, 200, '采购数量');
  assert.equal(result.valid, true);
  assert.deepEqual(result.allocations.map((item) => item.confirmed), [139, 61, 0]);
});

test('实际订单超过采购总量时保留未分配数量并判定失败', () => {
  const rows = [{ '采购数量': 20 }, { '采购数量': 30 }];
  const result = allocateSequentially(rows, 70, '采购数量');
  assert.equal(result.valid, false);
  assert.equal(result.capacity, 50);
  assert.equal(result.unallocated, 20);
});

test('实际订单只接受大于等于零的整数', () => {
  assert.deepEqual(parseActualOrder(0), { valid: true, value: 0, reason: '' });
  assert.deepEqual(allocateSequentially([{ '采购数量': 20 }, { '采购数量': 30 }], 0, '采购数量').allocations.map((item) => item.confirmed), [0, 0]);
  assert.equal(parseActualOrder('12.5').valid, false);
  assert.equal(parseActualOrder('-1').valid, false);
  assert.equal(parseActualOrder('').valid, false);
});

test('没有缓存结果的实际订单公式按零读取', () => {
  assert.equal(actualOrderCellValue({ value: { formula: 'MIN(A1,B1)' } }), 0);
  assert.equal(actualOrderCellValue({ value: { formula: 'MIN(A1,B1)', result: 30 } }), 30);
  assert.equal(actualOrderCellValue({ value: 0 }), 0);
  assert.equal(actualOrderCellValue({ value: '' }), '');
});

test('按仓库和货品生成分配计划并隔离异常仓库', () => {
  const sourceRows = [
    { rowNumber: 2, warehouse: '杭州仓', product: '商品A', brand: '甲', '采购数量': 80 },
    { rowNumber: 3, warehouse: '杭州仓', product: '商品A', brand: '甲', '采购数量': 40 },
    { rowNumber: 4, warehouse: '武汉仓', product: '商品B', brand: '甲', '采购数量': 30 }
  ];
  const returnedRows = [
    { warehouse: '杭州仓', product: '商品A', actualOrder: 100 },
    { warehouse: '武汉仓', product: '商品B', actualOrder: 50 }
  ];
  const plan = planBackfill({ sourceRows, returnedRows, brand: '甲', purchaseField: '采购数量' });
  assert.deepEqual(plan.readyWarehouses, ['杭州仓']);
  assert.equal(plan.allocations.get(2), 80);
  assert.equal(plan.allocations.get(3), 20);
  assert.equal(plan.allocations.has(4), false);
  assert.match(plan.warehouses.find((item) => item.warehouse === '武汉仓').errors[0], /超出采购数量 20 件/);
});

test('表三携带原表快照并按仓库生成回填文件', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'excel-backfill-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const sourcePath = path.join(directory, '订单原表.xlsx');
  const sourceWorkbook = new ExcelJS.Workbook();
  const sourceSheet = sourceWorkbook.addWorksheet('PO明细');
  sourceSheet.addRow(['采购单编号', '仓库名称', '货品名称', '品牌名称', '采购数量', '供应商确认数量']);
  sourceSheet.addRow(['A001', '杭州仓', '商品A', '甲', 80, 0]);
  sourceSheet.addRow(['A002', '杭州仓', '商品A', '甲', 40, 0]);
  sourceSheet.addRow(['B001', '武汉仓', '商品B', '甲', 30, 0]);
  await sourceWorkbook.xlsx.writeFile(sourcePath);

  const returnedPath = path.join(directory, '修改后表三.xlsx');
  const returnedWorkbook = new ExcelJS.Workbook();
  const returnedSheet = returnedWorkbook.addWorksheet('甲');
  returnedSheet.addRow(['仓库名称', '货品名称', '实际订单安排']);
  returnedSheet.addRow(['杭州仓', '商品A', 100]);
  returnedSheet.addRow(['杭州仓 汇总', '', 100]);
  const task = addBackfillTask(returnedWorkbook, {
    sourceOrderFilePath: sourcePath,
    sourceOrderSheetName: 'PO明细',
    sourceOrderHeader: '采购数量',
    brand: '甲'
  });
  assert.ok(task.taskId);
  await returnedWorkbook.xlsx.writeFile(returnedPath);

  const preview = await analyzeBackfillFile(returnedPath);
  assert.deepEqual(preview.plan.readyWarehouses, ['杭州仓']);
  const output = await writeBackfillFiles(returnedPath, directory);
  assert.equal(output.files.length, 1);

  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.readFile(output.files[0].filePath);
  const sheet = reopened.getWorksheet('PO明细');
  assert.equal(sheet.rowCount, 3);
  assert.deepEqual([sheet.getCell('F2').value, sheet.getCell('F3').value], [80, 20]);
  assert.deepEqual([sheet.getCell('B2').value, sheet.getCell('B3').value], ['杭州仓', '杭州仓']);
});

test('旧版表三没有隐藏任务时可补选订单原表完成回填', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-backfill-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const sourcePath = path.join(directory, '订单原表.xlsx');
  const sourceWorkbook = new ExcelJS.Workbook();
  const sourceSheet = sourceWorkbook.addWorksheet('PO明细');
  sourceSheet.addRow(['采购单编号', '仓库名称', '货品名称', '品牌名称', '采购数量', '供应商确认数量']);
  sourceSheet.addRow(['A001', '杭州仓', '商品A', '甲', 60, 0]);
  sourceSheet.addRow(['A002', '杭州仓', '商品A', '甲', 40, 0]);
  await sourceWorkbook.xlsx.writeFile(sourcePath);

  const returnedPath = path.join(directory, '旧版表三.xlsx');
  const returnedWorkbook = new ExcelJS.Workbook();
  const returnedSheet = returnedWorkbook.addWorksheet('甲');
  returnedSheet.addRow(['仓库名称', '货品名称', '品牌名称', '实际订单安排']);
  returnedSheet.addRow(['杭州仓', '商品A', '甲', 75]);
  returnedSheet.addRow(['杭州仓 汇总', '', '', 75]);
  await returnedWorkbook.xlsx.writeFile(returnedPath);

  const firstPass = await analyzeBackfillFile(returnedPath);
  assert.equal(firstPass.needsExternalSource, true);
  assert.equal(firstPass.legacy, true);

  const preview = await analyzeBackfillFile(returnedPath, sourcePath);
  assert.equal(preview.legacy, true);
  assert.deepEqual(preview.plan.readyWarehouses, ['杭州仓']);
  const output = await writeBackfillFiles(returnedPath, directory, sourcePath);
  assert.equal(output.files.length, 1);

  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.readFile(output.files[0].filePath);
  const sheet = reopened.getWorksheet('PO明细');
  assert.deepEqual([sheet.getCell('F2').value, sheet.getCell('F3').value], [60, 15]);
});

test('用户提供的补货单样例可以作为订单原表完成回填', async (t) => {
  const samplePath = path.join(__dirname, '..', '2026.9.29 华南江门直营商超仓 补货单.xlsx');
  if (!fs.existsSync(samplePath)) return t.skip('工作区未提供用户补货单样例');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sample-backfill-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const source = new ExcelJS.Workbook();
  await source.xlsx.readFile(samplePath);
  const sheet = source.worksheets[0];
  const headers = new Map();
  sheet.getRow(1).eachCell((cell, column) => headers.set(String(cell.value).trim(), column));
  const groups = new Map();
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const warehouse = String(sheet.getCell(rowNumber, headers.get('仓库名称')).value || '').trim();
    const product = String(sheet.getCell(rowNumber, headers.get('货品名称')).value || '').trim();
    const brand = String(sheet.getCell(rowNumber, headers.get('品牌名称')).value || '').trim();
    const key = `${warehouse}\u0000${product}`;
    const current = groups.get(key) || { warehouse, product, brand, actualOrder: 0 };
    current.actualOrder += Number(sheet.getCell(rowNumber, headers.get('供应商确认数量')).value) || 0;
    groups.set(key, current);
  }

  const returned = new ExcelJS.Workbook();
  const returnedSheet = returned.addWorksheet('稻花翁');
  returnedSheet.addRow(['仓库名称', '货品名称', '实际订单安排']);
  groups.forEach((item) => returnedSheet.addRow([item.warehouse, item.product, item.actualOrder]));
  addBackfillTask(returned, {
    sourceOrderFilePath: samplePath,
    sourceOrderSheetName: sheet.name,
    sourceOrderHeader: '采购数量',
    brand: '稻花翁'
  });
  const returnedPath = path.join(directory, '样例回传表三.xlsx');
  await returned.xlsx.writeFile(returnedPath);

  const preview = await analyzeBackfillFile(returnedPath);
  assert.equal(preview.plan.errorCount, 0);
  assert.equal(preview.plan.readyWarehouses.length, 1);
  const output = await writeBackfillFiles(returnedPath, directory);
  assert.equal(output.files.length, 1);
});

test('用户提供的公式表三可将无缓存结果识别为零', async (t) => {
  const returnedPath = path.join(__dirname, '..', 'src', 'templates', '稻花翁-汇总.xlsx');
  if (!fs.existsSync(returnedPath)) return t.skip('工作区未提供用户公式表三');
  const preview = await analyzeBackfillFile(returnedPath);
  assert.equal(preview.plan.errorCount, 0);
  assert.equal(preview.plan.readyWarehouses.length, 16);
});
