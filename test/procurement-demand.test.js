'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const ExcelJS = require('exceljs');
const {
  suggestFactory,
  addDays,
  loadProductCatalog,
  matchProduct,
  extractDemandItems,
  buildDemandWorkbook
} = require('../src/procurement-demand');

test('大区米厂预设自动推导', () => {
  assert.equal(suggestFactory('华东嘉定直营商超仓'), '宏禾米厂');
  assert.equal(suggestFactory('华南东莞直营商超仓'), '腾三龙米厂');
  assert.equal(suggestFactory('华西猫超重庆RDC仓'), '正点米厂');
  assert.equal(suggestFactory('华中武汉直营商超仓'), '青龙米厂');
  assert.equal(suggestFactory('华北北京仓'), '京山工厂');
});

test('日期计算联动+1天', () => {
  assert.equal(addDays('2026-09-26', 1), '2026-09-27');
  assert.equal(addDays('2026-09-30', 1), '2026-10-01');
});

test('商品字典加载与简称、条码精准匹配', async () => {
  const catalog = await loadProductCatalog(path.join(__dirname, '..', 'src', 'templates', 'product.xlsx'));
  assert.ok(catalog.size > 0);

  const matched = matchProduct(catalog, '国宝桥米稻花翁精选丝苗米南方籼米5KG真空粒粒分明当季新米10斤');
  assert.ok(matched);
  assert.equal(matched.barcode, '6911006001394');
  assert.equal(matched.shortName, '稻花翁精选丝苗米5kg');
  assert.equal(matched.spec, 5);
  assert.equal(matched.brand, '稻花翁');
});

test('过滤需求量为0的商品并按仓库组装明细与汇总', async (t) => {
  const catalog = await loadProductCatalog(path.join(__dirname, '..', 'src', 'templates', 'product.xlsx'));
  const rows = [
    { warehouse: '华东嘉定直营商超仓', product: '国宝桥米稻花翁精选丝苗米南方籼米5KG真空粒粒分明当季新米10斤', actualOrder: 564 },
    { warehouse: '华东嘉定直营商超仓', product: '国宝桥米稻花翁大米油粘米5kg大米2023新米南方籼米10斤 5kg×1袋', actualOrder: 0 },
    { warehouse: '华东嘉定直营商超仓', product: '国宝桥米稻花翁丝苗米10kg湖北长粒大米20斤南方籼米 10kg×1袋', actualOrder: 20 },
    { warehouse: '华西猫超重庆RDC仓', product: '国宝桥米稻花翁泰玉京香大米5kg籼米南方大米5kg籼米南方大米 5kg×1袋', actualOrder: 25 }
  ];

  const warehouseConfigs = {
    '华东嘉定直营商超仓': { factory: '宏禾米厂', pickupDate: '2026-09-26', inboundDate: '2026-09-27' },
    '华西猫超重庆RDC仓': { factory: '正点米厂', pickupDate: '2026-09-26', inboundDate: '2026-09-27' }
  };

  const items = extractDemandItems({ rows, catalog, warehouseConfigs });
  assert.equal(items.length, 3); // actualOrder=0 被过滤
  assert.equal(items[0].productName, '稻花翁精选丝苗米5kg');
  assert.equal(items[0].quantity, 564);
  assert.equal(items[0].weight, 2.82);
  assert.equal(items[0].factory, '宏禾米厂');

  // 构建 Excel 并检验公式与行数
  const workbook = await buildDemandWorkbook({ items, title: '国宝 采购需求一览表2026年' });
  const sheet = workbook.getWorksheet('采购需求一览表');
  assert.ok(sheet);
  assert.equal(sheet.getCell('A1').value, '国宝 采购需求一览表2026年');
  assert.equal(sheet.getCell('A2').value, '*需求平台/仓*');
  assert.equal(sheet.getCell('B2').value, '条形码');

  // 嘉定仓 2条明细 + 1条汇总，重庆仓 1条明细 + 1条汇总 -> 总计 2(表头) + 3 + 2 = 7行
  assert.equal(sheet.rowCount, 7);
  assert.equal(sheet.getCell('A5').value, '华东嘉定直营商超仓 汇总');
  assert.deepEqual(sheet.getCell('E5').value, { formula: 'SUM(E3:E4)', result: 584 });
  assert.equal(sheet.getCell('A7').value, '华西猫超重庆RDC仓 汇总');
});

test('解析用户输入的 ReceiptNote 并提取品牌与分组实际发货量', async () => {
  const { parseReceiptNoteForDemand } = require('../src/procurement-demand');
  const samplePath = path.join(
    'C:', 'Users', 'Administrator', '.gemini', 'antigravity', 'brain',
    'f6d68e29-cd33-4d10-8816-e360cd1b3139', 'scratch', 'input_table_sample.csv'
  );
  const result = await parseReceiptNoteForDemand(samplePath);
  assert.ok(result.rows.length > 0);
  assert.ok(result.brands.includes('稻花翁'));
  assert.ok(result.brands.includes('国宝桥米'));

  const wuhan = result.rows.filter((r) => r.warehouse.includes('武汉'));
  assert.ok(wuhan.length > 0);
  const oilRice = wuhan.find((r) => r.product.includes('油粘米'));
  assert.ok(oilRice);
  assert.equal(oilRice.actualOrder, 160); // 10 + 80 + 20 + 50
});

test('procurement:get-config 配置推导与仓库预设工厂匹配完整性', async () => {
  const { cleanText, numberValue, parseSpec } = require('../src/core');
  const { loadWarehousePreset, matchWarehouseFactory } = require('../src/warehouse-preset');
  const { loadProductPreset } = require('../src/product-preset');
  const { loadProductCatalog, matchProduct } = require('../src/procurement-demand');

  const rows = [
    { '仓库名称': '华中南昌直营商超仓', '商品实际发货数量': 120, '条形码': '6911006001394', '品牌名称': '稻花翁' },
    { '仓库名称': '华东杭州直营商超仓', '实际订单安排': '80', '规格': 10, '品牌名称': '国宝桥米' }
  ];

  const warehousePreset = await loadWarehousePreset();
  const productPreset = await loadProductPreset();
  const catalog = await loadProductCatalog(productPreset.rows);
  const warehouseMap = new Map();
  for (const r of rows) {
    const wh = cleanText(r.warehouse || r['仓库名称']);
    const qty = numberValue(r.actualOrder ?? r['实际订单安排'] ?? r.demandQuantity ?? r['需求数量'] ?? r['商品实际发货数量']);
    if (!wh || qty <= 0) continue;

    const rawBarcode = cleanText(r.barcode || r['条形码'] || r['条码']);
    const rawProductName = cleanText(r.product || r['货品名称']);
    const matched = matchProduct(catalog, rawProductName, rawBarcode);
    const spec = (matched && typeof matched.spec === 'number' && matched.spec > 0)
      ? matched.spec
      : (numberValue(r.spec || r['规格'] || r['规格kg']) || (parseSpec(rawProductName)?.spec || 0));

    const inboundDate = cleanText(r.inboundDate || r['预约入库时间'] || '');
    const brand = cleanText(r.brand || r['品牌名称']);
    if (!warehouseMap.has(wh)) {
      warehouseMap.set(wh, {
        warehouse: wh,
        products: new Set(),
        itemCount: 0,
        totalQty: 0,
        estimatedWeight: 0,
        factory: matchWarehouseFactory(wh, warehousePreset.rows, brand),
        inboundDate
      });
    }
    const stat = warehouseMap.get(wh);
    const prodKey = rawBarcode || matched?.barcode || rawProductName;
    if (prodKey) stat.products.add(prodKey);
    stat.itemCount = stat.products.size || (stat.itemCount + 1);
    stat.totalQty += qty;
    stat.estimatedWeight += Math.round(((qty * spec) / 1000) * 10000) / 10000;
  }

  assert.equal(warehouseMap.size, 2);
  const nanchang = warehouseMap.get('华中南昌直营商超仓');
  assert.equal(nanchang.factory, '宏禾米厂');
  assert.equal(nanchang.totalQty, 120);
  assert.equal(nanchang.estimatedWeight, 0.6); // 自动匹配到条码 6911006001394 -> 5kg

  const hangzhou = warehouseMap.get('华东杭州直营商超仓');
  assert.equal(hangzhou.factory, '宏禾米厂');
  assert.equal(hangzhou.totalQty, 80);
  assert.equal(hangzhou.estimatedWeight, 0.8);
});

test('extractDemandItems 能够自动合并同仓同商品的多个批次数量', async () => {
  const { loadProductCatalog, extractDemandItems } = require('../src/procurement-demand');
  const catalog = await loadProductCatalog(path.join(__dirname, '..', 'src', 'templates', 'product.xlsx'));
  const rows = [
    { '仓库名称': '华东嘉兴直营商超A仓', '货品名称': '国宝桥米稻花翁大米油粘米5kg大米2023新米南方籼米10斤 5kg×1袋', '条形码': '6911006000236', '商品实际发货数量': 20 },
    { '仓库名称': '华东嘉兴直营商超A仓', '货品名称': '国宝桥米稻花翁大米油粘米5kg大米2023新米南方籼米10斤 5kg×1袋', '条形码': '6911006000236', '商品实际发货数量': 35 },
    { '仓库名称': '华东嘉兴直营商超A仓', '货品名称': '国宝桥米稻花翁精选丝苗米南方籼米10KG粒粒分明当季新米20斤', '条形码': '6911006001417', '商品实际发货数量': 15 }
  ];

  const items = extractDemandItems({ rows, catalog });
  assert.equal(items.length, 2); // 3行合并为2个商品
  const oilRice = items.find((i) => i.barcode === '6911006000236');
  assert.ok(oilRice);
  assert.equal(oilRice.quantity, 55); // 20 + 35
  assert.equal(oilRice.weight, 0.275); // 55 * 5 / 1000
});

test('商品多条形码（带#号）在匹配和导出需求表时完整保留', async () => {
  const { loadProductCatalog, extractDemandItems, matchProduct } = require('../src/procurement-demand');
  const catalog = await loadProductCatalog(path.join(__dirname, '..', 'src', 'templates', 'product.xlsx'));

  // 1. 通过任一单条码命中多条码主数据
  const matched1 = matchProduct(catalog, null, '6911006000441');
  assert.ok(matched1);
  assert.equal(matched1.barcode, '6911006000441#691100600427');

  const matched2 = matchProduct(catalog, null, '691100600427');
  assert.ok(matched2);
  assert.equal(matched2.barcode, '6911006000441#691100600427');

  const matched3 = matchProduct(catalog, null, '6911006008034');
  assert.ok(matched3);
  assert.equal(matched3.barcode, '6911006008034#6911006000335');

  // 2. 输入表中仅有单个条码，导出需求项应恢复为完整的多条码字符串
  const rows = [
    { '仓库名称': '华中武汉直营商超仓', '货品名称': '国宝桥米大米稻花翁金泰南白兰香米10kg*1袋籼米新鲜大米 10kg×1袋', '条形码': '6911006000441', '商品实际发货数量': 70 },
    { '仓库名称': '华中武汉直营商超仓', '货品名称': '国宝桥米京山桥米2.5kg小规格大米5斤 2.5kg×1袋', '条形码': '6911006008034', '商品实际发货数量': 50 }
  ];

  const items = extractDemandItems({ rows, catalog });
  assert.equal(items.length, 2);
  assert.equal(items[0].barcode, '6911006000441#691100600427');
  assert.equal(items[1].barcode, '6911006008034#6911006000335');
});


