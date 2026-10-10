'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const {
  loadProductPreset,
  saveProductPreset,
  resetProductPreset,
  sanitizeProductRow
} = require('../src/product-preset');
const { analyzeDeliveryData } = require('../src/delivery-note');
const { buildProductCatalogFromRows, extractDemandItems } = require('../src/procurement-demand');

test('商品主数据预设：首次加载能正确读取内置模板', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preset-test-'));
  try {
    const preset = await loadProductPreset(tempDir);
    assert.equal(preset.source, 'default');
    assert.ok(preset.rows.length >= 20);
    const first = preset.rows[0];
    assert.ok(first['品牌名称']);
    assert.ok(first['条码']);
    assert.ok(first['订单简称']);
    assert.ok(first['规格kg'] > 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('商品主数据预设：支持新增商品与删除商品并持久化保存', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preset-crud-'));
  try {
    const preset = await loadProductPreset(tempDir);
    const initialCount = preset.rows.length;

    // Add a new product
    const newProduct = sanitizeProductRow({
      '货品名称（带空格）': '国宝桥米 尊享丝苗米 10kg',
      '条码': '6999999999999',
      '品牌名称': '国宝桥米',
      '订单简称': '尊享丝苗米10kg',
      '规格kg': 10,
      '采购规格(箱规数)': 1,
      '备注': '新品'
    }, initialCount + 1);

    const updatedRows = [...preset.rows, newProduct];
    const saveRes = await saveProductPreset(updatedRows, tempDir);
    assert.equal(saveRes.count, initialCount + 1);

    // Reload from file
    const reloaded = await loadProductPreset(tempDir);
    assert.equal(reloaded.source, 'preset');
    assert.equal(reloaded.rows.length, initialCount + 1);
    const found = reloaded.rows.find((r) => r['条码'] === '6999999999999');
    assert.ok(found);
    assert.equal(found['订单简称'], '尊享丝苗米10kg');
    assert.equal(found['规格kg'], 10);

    // Delete the product
    const afterDelete = reloaded.rows.filter((r) => r['条码'] !== '6999999999999');
    await saveProductPreset(afterDelete, tempDir);

    const reloadedAfterDelete = await loadProductPreset(tempDir);
    assert.equal(reloadedAfterDelete.rows.length, initialCount);
    assert.equal(reloadedAfterDelete.rows.find((r) => r['条码'] === '6999999999999'), undefined);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('商品主数据预设：与送货单分析及采购需求表提取无缝联动', async () => {
  const customRows = [
    sanitizeProductRow({
      '货品名称（带空格）': '国宝桥米 优质香米 5kg',
      '条码': '6911000000001',
      '品牌名称': '国宝桥米',
      '订单简称': '优质香米5kg',
      '规格kg': 5,
      '采购规格(箱规数)': 4
    }, 1)
  ];

  // 1. Delivery Note analysis with preset row
  const receiptRows = [
    {
      'LBX号': 'LBX1001',
      '供应商编码': 'SUP888',
      '仓库名称': '华东嘉兴直营商超A仓',
      '预约入库时间': '2026-10-15',
      '货品名称': '国宝桥米 优质香米 5kg',
      '条形码': '6911000000001',
      '品牌名称': '国宝桥米',
      '商品实际发货数量': 20,
      '采购规格(箱规数)': 4
    }
  ];

  const deliveryAnalysis = analyzeDeliveryData({ productRows: customRows, receiptRows });
  assert.equal(deliveryAnalysis.stats.matchedRows, 1);
  assert.equal(deliveryAnalysis.stats.unmatchedRows, 0);
  assert.equal(deliveryAnalysis.brands[0].name, '国宝桥米');

  // 2. Procurement demand item extraction from the same receipt row
  const catalog = buildProductCatalogFromRows(customRows);
  const demandItems = extractDemandItems({
    rows: receiptRows,
    catalog,
    warehouseConfigs: {
      '华东嘉兴直营商超A仓': { factory: '宏禾米厂' }
    }
  });

  assert.equal(demandItems.length, 1);
  assert.equal(demandItems[0].warehouse, '华东嘉兴直营商超A仓');
  assert.equal(demandItems[0].productName, '优质香米5kg');
  assert.equal(demandItems[0].barcode, '6911000000001');
  assert.equal(demandItems[0].quantity, 20);
  assert.equal(demandItems[0].spec, 5);
  assert.equal(demandItems[0].weight, 0.1); // 20 * 5 / 1000 = 0.1 吨
  assert.equal(demandItems[0].factory, '宏禾米厂');
});

test('商品主数据预设：支持恢复默认预设', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preset-reset-'));
  try {
    // Save empty rows to simulate altered state
    await saveProductPreset([], tempDir);
    const emptyState = await loadProductPreset(tempDir);
    assert.equal(emptyState.rows.length, 0);

    // Reset
    const res = await resetProductPreset(tempDir);
    assert.ok(res.count >= 20);

    const restored = await loadProductPreset(tempDir);
    assert.ok(restored.rows.length >= 20);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
