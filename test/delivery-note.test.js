'use strict';

const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const {
  validateDeliveryTable,
  analyzeDeliveryData,
  productKey,
  buildDeliveryWorkbooks,
  buildDeliveryExports
} = require('../src/delivery-note');

function cellValue(cell) {
  const value = cell.value;
  if (value && typeof value === 'object') {
    if ('result' in value) return value.result ?? '';
    if ('text' in value) return value.text ?? '';
  }
  return value ?? '';
}

async function readRows(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  const headers = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => { headers[column - 1] = String(cell.text || cellValue(cell)).trim(); });
  const rows = [];
  for (let rowNumber = 2; rowNumber <= sheet.actualRowCount; rowNumber += 1) {
    const row = {};
    headers.forEach((header, index) => { if (header) row[header] = cellValue(sheet.getCell(rowNumber, index + 1)); });
    rows.push(row);
  }
  return { headers, rows };
}

test('DeliveryNote字段校验识别两类输入表', () => {
  assert.equal(validateDeliveryTable({ headers: ['货品名称（带空格）', '条码', '品牌名称', '订单简称'] }, 'product').valid, true);
  assert.equal(validateDeliveryTable({ headers: ['LBX号'] }, 'receipt').valid, false);
});

test('真实product与ReceiptNote全部商品可匹配并收集品牌', async (t) => {
  const productPath = path.join(__dirname, '..', 'product.xlsx');
  const receiptPath = path.join(__dirname, '..', 'ReceiptNote.xlsx');
  if (!fs.existsSync(productPath) || !fs.existsSync(receiptPath)) return t.skip('工作区未提供真实样例文件');
  const product = await readRows(productPath);
  const receipt = await readRows(receiptPath);
  const result = analyzeDeliveryData({ productRows: product.rows, receiptRows: receipt.rows });
  assert.equal(result.stats.receiptRows, 87);
  assert.equal(result.stats.matchedRows, 87);
  assert.equal(result.stats.unmatchedRows, 0);
  assert.deepEqual(new Set(result.brands.map((item) => item.name)), new Set(['国宝桥米', '稻花翁']));
  assert.equal(result.warehouses.length, 6);
  assert.ok(result.warehouses.every((item) => item.brands.length > 0));
});

test('工作簿按仓库建表、合并相同物流宝单号并标红小数箱数', async () => {
  const productRows = [{
    '货品名称（带空格）': '测试商品 5kg', '条码': '6900000000001', '品牌名称': '测试品牌', '订单简称': '测试商品5kg'
  }];
  const base = {
    'LBX号': 'LBX001', '供应商编码': 'SUP001', '仓库名称': '华中测试直营仓', '预约入库时间': '2026-10-01',
    '货品名称': '测试商品 5kg', '条形码': '6900000000001', '品牌名称': '测试品牌', '采购规格(箱规数)': 2
  };
  const receiptRows = [
    { ...base, '商品实际发货数量': 3 },
    { ...base, '商品实际发货数量': 4 }
  ];
  const key = productKey(productRows[0]);
  const builds = await buildDeliveryWorkbooks({
    templatePath: path.join(__dirname, '..', 'src', 'templates', 'DeliveryNote.xlsx'),
    productRows, receiptRows, brands: ['测试品牌'], productionDates: { [key]: '2026-09-28' },
    shelfLife: '360', contact: '17700001111', supplierName: '测试供应商'
  });
  assert.equal(builds.length, 1);
  assert.equal(builds[0].warehouseCount, 1);
  assert.equal(builds[0].fractionalBoxes, 1);
  const buffer = await builds[0].workbook.xlsx.writeBuffer();
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(buffer);
  const sheet = reopened.getWorksheet('华中测试直营仓');
  assert.ok(sheet);
  assert.equal(sheet.getCell('A1').value, '商家送货清单-华中测试直营仓');
  assert.equal(sheet.getCell('A2').value, '供应商名称：测试供应商 商家编码：SUP001');
  assert.equal(sheet.getCell('A4').border.left.style, 'thin');
  assert.equal(sheet.getCell('A4').border.right.style, 'thin');
  assert.equal(sheet.getCell('A4').border.top.style, 'thin');
  assert.equal(sheet.getCell('A4').border.bottom.style, 'thin');
  assert.equal(sheet.getCell('B5').isMerged, true);
  assert.equal(sheet.getCell('B5').master.address, 'B4');
  assert.equal(sheet.getCell('G4').value, 1.5);
  assert.equal(sheet.getCell('G4').fill.fgColor.argb, 'FFFFD7D5');
  assert.equal(sheet.getCell('I4').value, '360天');
  assert.equal(sheet.getCell('J4').value, '17700001111');
});
test('分析阶段按品牌报告小数箱和无效数量', () => {
  const productRows = [
    { '货品名称（带空格）': '甲商品', '条码': '1001', '品牌名称': '甲品牌', '订单简称': '甲商品' },
    { '货品名称（带空格）': '乙商品', '条码': '2001', '品牌名称': '乙品牌', '订单简称': '乙商品' }
  ];
  const common = { 'LBX号': 'LBX', '供应商编码': 'SUP', '仓库名称': '测试仓', '预约入库时间': '2026-10-01' };
  const receiptRows = [
    { ...common, '货品名称': '甲商品', '条形码': '1001', '品牌名称': '甲品牌', '商品实际发货数量': 3, '采购规格(箱规数)': 2 },
    { ...common, '货品名称': '乙商品', '条形码': '2001', '品牌名称': '乙品牌', '商品实际发货数量': '', '采购规格(箱规数)': 2 }
  ];
  const result = analyzeDeliveryData({ productRows, receiptRows });
  assert.equal(result.fractionalRows.length, 1);
  assert.equal(result.fractionalRows[0].brand, '甲品牌');
  assert.equal(result.dataIssues.length, 1);
  assert.equal(result.dataIssues[0].brand, '乙品牌');
  assert.equal(result.dataIssues[0].type, 'packages');
});

test('空物流宝单号不合并且无效数量阻止生成', async () => {
  const productRows = [{ '货品名称（带空格）': '测试商品', '条码': '3001', '品牌名称': '测试品牌', '订单简称': '测试商品' }];
  const base = {
    'LBX号': '', '供应商编码': 'SUP', '仓库名称': '测试仓', '预约入库时间': '2026-10-01',
    '货品名称': '测试商品', '条形码': '3001', '品牌名称': '测试品牌', '采购规格(箱规数)': 2
  };
  const options = {
    templatePath: path.join(__dirname, '..', 'src', 'templates', 'DeliveryNote.xlsx'),
    productRows, brands: ['测试品牌'], productionDates: { [productKey(productRows[0])]: '2026-09-28' },
    shelfLife: '360', contact: '17700001111', supplierName: '测试供应商'
  };
  const builds = await buildDeliveryWorkbooks({ ...options, receiptRows: [{ ...base, '商品实际发货数量': 2 }, { ...base, '商品实际发货数量': 4 }] });
  const sheet = builds[0].workbook.getWorksheet('测试仓');
  assert.equal(sheet.getCell('B4').isMerged, false);
  assert.equal(sheet.getCell('B5').isMerged, false);
  await assert.rejects(
    buildDeliveryWorkbooks({ ...options, receiptRows: [{ ...base, '商品实际发货数量': '不是数字' }] }),
    /实际发货数量无效/
  );
});
test('按仓库拆分为独立工作簿', async () => {
  const productRows = [{ '货品名称（带空格）': '测试商品', '条码': '4001', '品牌名称': '测试品牌', '订单简称': '测试商品' }];
  const common = {
    'LBX号': 'LBX', '供应商编码': 'SUP', '预约入库时间': '2026-10-01',
    '货品名称': '测试商品', '条形码': '4001', '品牌名称': '测试品牌',
    '商品实际发货数量': 2, '采购规格(箱规数)': 1
  };
  const builds = await buildDeliveryExports({
    templatePath: path.join(__dirname, '..', 'src', 'templates', 'DeliveryNote.xlsx'),
    productRows,
    receiptRows: [{ ...common, '仓库名称': '仓库甲' }, { ...common, '仓库名称': '仓库乙' }],
    brands: ['测试品牌'],
    productionDates: { [productKey(productRows[0])]: '2026-09-28' },
    shelfLife: '360',
    contact: '17771571056',
    supplierName: '测试供应商',
    splitByWarehouse: true
  });
  assert.equal(builds.length, 2);
  assert.deepEqual(new Set(builds.map((item) => item.warehouse)), new Set(['仓库甲', '仓库乙']));
  assert.ok(builds.every((item) => item.workbook.worksheets.length === 1));
});
test('生产日期为空时仍可生成', async () => {
  const productRows = [{ '货品名称（带空格）': '测试商品', '条码': '5001', '品牌名称': '测试品牌', '订单简称': '测试商品' }];
  const receiptRows = [{
    'LBX号': 'LBX', '供应商编码': 'SUP', '仓库名称': '测试仓', '预约入库时间': '2026-10-01',
    '货品名称': '测试商品', '条形码': '5001', '品牌名称': '测试品牌', '商品实际发货数量': 2, '采购规格(箱规数)': 1
  }];
  const builds = await buildDeliveryWorkbooks({
    templatePath: path.join(__dirname, '..', 'src', 'templates', 'DeliveryNote.xlsx'),
    productRows, receiptRows, brands: ['测试品牌'], productionDates: {},
    shelfLife: '360', contact: '17771571056', supplierName: '测试供应商'
  });
  assert.equal(builds[0].workbook.getWorksheet('测试仓').getCell('H4').value, '');
});
