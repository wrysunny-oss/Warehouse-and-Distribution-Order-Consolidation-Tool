'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const ExcelJS = require('exceljs');

const { sniffExcelFile, classifyHeaders } = require('../src/services/sniffer-service');
const { processDeliveryTask } = require('../src/services/delivery-service');
const { processInventoryTask } = require('../src/services/inventory-service');
const { processProcurementTask } = require('../src/services/procurement-service');
const { processInvoiceTask } = require('../src/services/invoice-service');
const { processPlatformFeeTask } = require('../src/services/platform-fee-service');

const templatesDir = path.join(__dirname, '..', 'src', 'templates');

test('嗅探服务：基于表头准确识别常见文件类型', () => {
  const deliveryHeaders = ['物理仓名称', '货品名称', '品牌名称', '采购数量'];
  assert.equal(classifyHeaders(deliveryHeaders).type, 'delivery-note');

  const productHeaders = ['货品名称', '净重', '箱规', '条形码'];
  assert.equal(classifyHeaders(productHeaders).type, 'product-catalog');

  const table3Headers = ['仓库名称', '货品名称', '品牌名称', '良品可用', '在库良品非锁定库存件数', '实际订单安排'];
  assert.equal(classifyHeaders(table3Headers).type, 'table3');

  const inventoryHeaders = ['仓库名称', '货品名称', '良品可用'];
  assert.equal(classifyHeaders(inventoryHeaders).type, 'realtime-inventory');

  const transitHeaders = ['仓库名称', '货品名称', '在途数量'];
  assert.equal(classifyHeaders(transitHeaders).type, 'in-transit');

  const invoiceHeaders = ['对账单编号', '费用类型', '发票方向', '开票流水号'];
  assert.equal(classifyHeaders(invoiceHeaders).type, 'reconciliation');

  const feeHeaders = ['费用明细', '核销流水', '账单编号'];
  assert.equal(classifyHeaders(feeHeaders).type, 'platform-fee');
});

test('送货单服务：从真实 ReceiptNote 生成送货单', async () => {
  const receiptPath = path.join(templatesDir, 'ReceiptNote.xlsx');
  const productPath = path.join(templatesDir, 'product.xlsx');
  if (!fs.existsSync(receiptPath) || !fs.existsSync(productPath)) return;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-service-test-'));
  try {
    const result = await processDeliveryTask({
      receiptFilePath: receiptPath,
      productFilePath: productPath,
      outputDir: tempDir
    });
    assert.equal(result.success, true);
    assert.ok(result.files.length > 0);
    assert.ok(fs.existsSync(result.files[0].filePath));

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(result.files[0].filePath);
    const sheet = wb.worksheets[0];
    assert.equal(sheet.getCell('J4').value, '17771571056');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('采购需求服务：从 ReceiptNote 推导采购需求 Excel', async () => {
  const receiptPath = path.join(templatesDir, 'ReceiptNote.xlsx');
  if (!fs.existsSync(receiptPath)) return;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'procurement-service-test-'));
  try {
    const result = await processProcurementTask({
      inputFilePath: receiptPath,
      title: '测试采购需求表',
      outputDir: tempDir
    });
    assert.equal(result.success, true);
    assert.ok(fs.existsSync(result.filePath));
    assert.ok(result.warehouseCount > 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('库存更新服务：更新表三良品可用数据', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-service-test-'));
  try {
    const table3Path = path.join(tempDir, '旧表三.xlsx');
    const inventoryPath = path.join(tempDir, '实时库存.xlsx');

    const wb1 = new ExcelJS.Workbook();
    const ws1 = wb1.addWorksheet('数据');
    ws1.addRow(['仓库名称', '货品名称', '良品可用', '实际订单安排']);
    ws1.addRow(['武汉仓', '香米5kg', 10, 2]);
    ws1.addRow(['广州仓', '香米5kg', 20, 3]);
    await wb1.xlsx.writeFile(table3Path);

    const wb2 = new ExcelJS.Workbook();
    const ws2 = wb2.addWorksheet('Sheet1');
    ws2.addRow(['仓库名称', '货品名称', '良品可用']);
    ws2.addRow(['武汉仓', '香米5kg', 50]);
    await wb2.xlsx.writeFile(inventoryPath);

    const result = await processInventoryTask({
      table3FilePath: table3Path,
      inventoryFilePaths: [inventoryPath],
      outputDir: tempDir
    });
    assert.equal(result.success, true);
    assert.ok(fs.existsSync(result.filePath));
    assert.equal(result.analysis.matchedCount, 1);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('平台费用服务：计算并导出费用核销表', async () => {
  const files = fs.readdirSync(templatesDir);
  const feeFileName = files.find((f) => f.includes('核销') || f.includes('开票流水'));
  if (!feeFileName) return;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-fee-service-test-'));
  try {
    const result = await processPlatformFeeTask({
      feeFilePath: path.join(templatesDir, feeFileName),
      outputDir: tempDir
    });
    assert.equal(result.success, true);
    assert.ok(fs.existsSync(result.filePath));
    assert.ok(result.recordCount > 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('开票通知单服务：从对账单生成开票通知单 Excel', async () => {
  const reconPath = path.join(templatesDir, '2026.8.1-2026.8.10--HDB202608012026081035131200823-280102(1).xlsx');
  if (!fs.existsSync(reconPath)) return;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'invoice-service-test-'));
  try {
    const result = await processInvoiceTask({
      reconciliationFilePaths: [reconPath],
      outputDir: tempDir
    });
    assert.equal(result.success, true);
    assert.ok(fs.existsSync(result.filePath));
    assert.ok(result.itemCount > 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
