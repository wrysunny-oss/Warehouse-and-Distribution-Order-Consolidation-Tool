'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregate, parseSpec, parseBoxSpec, validateTable, suggestWarehouse, productCatalogForBrand, FIXED_PRODUCTS } = require('../src/core');

const PRODUCT_5KG = FIXED_PRODUCTS[2];
const PRODUCT_10KG = FIXED_PRODUCTS[1];

const inventory = [
  {
    '物理仓名称': '华东杭州直营商超仓', '货品名称': PRODUCT_5KG, '品牌名称': '测试品牌', '货品状态': '正常',
    '在库良品库存件数': 100, '在库良品非锁定库存件数': 100, '在库良品非销售锁定库存件数': 3,
    '高库龄件数': 2, '高周转件数': 4, '最近1天出库件数': 5, '最近7天出库件数': 20,
    '最近14天出库件数': 35, '最近30天出库件数': 70
  },
  {
    '物理仓名称': '华东杭州直营商超仓', '货品名称': PRODUCT_10KG, '品牌名称': '测试品牌', '货品状态': '正常',
    '在库良品库存件数': 8, '在库良品非锁定库存件数': 8, '在库良品非销售锁定库存件数': 0
  }
];

const orders = [{
  '物理仓名称': '菜鸟杭州前置仓', '货品名称': PRODUCT_5KG, '品牌名称': '测试品牌', __systemOrder: 200
}];

test('库存模式生成仓库和货品笛卡尔明细，订单为零', () => {
  const result = aggregate({ table2Rows: inventory, brand: '测试品牌' });
  assert.equal(result.stats.warehouseCount, 1);
  assert.equal(result.stats.productCount, 2);
  assert.equal(result.rows.length, 2);
  assert.equal(result.stats.systemOrders, 0);
  assert.equal(result.rows[0].actualOrder, 0);
});

test('仅表二模式按库存和销量生成实际订单安排', () => {
  const result = aggregate({
    table2Rows: [{
      '物理仓名称': '华东测试直营商超仓', '货品名称': PRODUCT_5KG, '品牌名称': '测试品牌',
      '在库良品库存件数': 0, '在库良品非锁定库存件数': 0,
      '最近1天出库件数': 0, '最近7天出库件数': 0, '最近30天出库件数': 100
    }],
    brand: '测试品牌'
  });
  assert.equal(result.rows[0].systemOrder, 0);
  assert.equal(result.rows[0].hasOrderLimit, false);
  assert.equal(result.rows[0].actualOrder, 40);
  assert.equal(result.rows[0].actualWeight, 0.2);
  assert.equal(result.summaries[0].actualOrder, 40);
});

test('完整模式按映射汇总订单并计算吨重', () => {
  const result = aggregate({
    table2Rows: inventory, table1Rows: orders, brand: '测试品牌',
    mapping: { '菜鸟杭州前置仓': '华东杭州直营商超仓' }
  });
  const row = result.rows.find((item) => item.product === PRODUCT_5KG);
  assert.equal(row.systemOrder, 200);
  assert.equal(row.weight, 1);
  assert.equal(row.availableGood, 100);
  assert.equal(row.warehouse, '菜鸟杭州前置仓');
  assert.equal(result.stats.unresolvedOrders, 0);
});

test('未映射订单进入警告，不静默计入错误仓库', () => {
  const result = aggregate({ table2Rows: inventory, table1Rows: orders, brand: '测试品牌', mapping: {} });
  assert.equal(result.stats.unresolvedOrders, 0, '同城名称应自动匹配杭州仓');
  const unmatched = aggregate({
    table2Rows: inventory,
    table1Rows: [{ ...orders[0], '物理仓名称': '菜鸟潮州前置仓' }],
    brand: '测试品牌', mapping: {}
  });
  assert.equal(unmatched.stats.unresolvedOrders, 200);
  assert.equal(unmatched.stats.systemOrders, 0);
});

test('规格与箱规解析兼容模板特殊商品', () => {
  assert.equal(parseSpec('测试大米5kg×1袋'), 5);
  assert.equal(parseBoxSpec('测试大米5kg×6袋'), 6);
  assert.equal(parseBoxSpec('国宝桥米稻花翁泰玉京香大米5kg籼米南方大米5kg籼米南方大米 5kg×1袋'), 5);
});

test('字段校验支持动态日期订单列', () => {
  assert.equal(validateTable({ headers: ['物理仓名称', '货品名称', '品牌名称', '9.23系统订单'] }, 'table1').valid, true);
  assert.equal(validateTable({ headers: ['仓库名称', '货品名称', '品牌名称', '采购数量'] }, 'table1').valid, true);
  assert.equal(validateTable({ headers: ['物理仓名称'] }, 'table1').valid, false);
});

test('城市名称只在唯一匹配时自动映射', () => {
  assert.equal(suggestWarehouse('菜鸟成都双流猫超前置仓', ['华西成都直营商超仓', '华东杭州直营商超仓']), '华西成都直营商超仓');
  assert.equal(suggestWarehouse('菜鸟潮州前置仓', ['华南广州直营商超A仓']), '');
});
test('表一重复仓库商品合并为一行并累加采购数量', () => {
  const stock = [{
    '物理仓名称': '华东测试直营商超仓', '货品名称': PRODUCT_10KG, '品牌名称': '测试品牌', '货品状态': '正常',
    '在库良品库存件数': 0, '在库良品非锁定库存件数': 0,
    '最近1天出库件数': 0, '最近7天出库件数': 0, '最近30天出库件数': 30
  }];
  const purchase = [
    { '仓库名称': '华东测试直营商超仓', '货品名称': PRODUCT_10KG, '品牌名称': '测试品牌', '采购数量': 10, '箱规': 5 },
    { '仓库名称': '华东测试直营商超仓', '货品名称': PRODUCT_10KG, '品牌名称': '测试品牌', '采购数量': 10, '箱规': 5 }
  ];
  const result = aggregate({ table2Rows: stock, table1Rows: purchase, brand: '测试品牌' });
  assert.equal(result.rows.length, 1);
  const mergedRow = result.rows.find((row) => row.product === PRODUCT_10KG);
  assert.equal(mergedRow.systemOrder, 20);
  assert.equal(result.stats.systemOrders, 20);
  assert.equal(mergedRow.boxSpec, 5);
});


test('安排状态始终留空，实际重量仍正常计算', () => {
  const makeResult = (out30, purchase) => aggregate({
    table2Rows: [{
      '物理仓名称': '华东测试直营商超仓', '货品名称': PRODUCT_10KG, '品牌名称': '测试品牌',
      '在库良品库存件数': 0, '在库良品非锁定库存件数': 0,
      '最近1天出库件数': 0, '最近7天出库件数': 0, '最近30天出库件数': out30
    }],
    table1Rows: [{ '仓库名称': '华东测试直营商超仓', '货品名称': PRODUCT_10KG, '品牌名称': '测试品牌', '采购数量': purchase, '箱规': 1 }],
    brand: '测试品牌'
  });
  assert.equal(makeResult(1250, 600).summaries[0].actualWeight, 5);
  assert.equal(makeResult(1250, 600).summaries[0].arrangement, '');
  assert.equal(makeResult(3750, 1600).summaries[0].actualWeight, 15);
  assert.equal(makeResult(3750, 1600).summaries[0].arrangement, '');
  assert.equal(makeResult(1352.5, 600).summaries[0].actualWeight, 5.41);
  assert.equal(makeResult(1352.5, 600).summaries[0].arrangement, '');
});

test('完整模式为每个表一仓库生成相同商品种类', () => {
  const warehouses = ['华东甲直营商超仓', '华东乙直营商超仓'];
  const products = [FIXED_PRODUCTS[0], FIXED_PRODUCTS[1]];
  const stock = warehouses.flatMap((warehouse) => products.map((product) => ({
    '物理仓名称': warehouse, '货品名称': product, '品牌名称': '测试品牌',
    '在库良品库存件数': 0, '在库良品非锁定库存件数': 0,
    '最近1天出库件数': 10, '最近7天出库件数': 70, '最近30天出库件数': 300
  })));
  const purchase = [
    { '仓库名称': warehouses[0], '货品名称': products[0], '品牌名称': '测试品牌', '采购数量': 100, '箱规': 1 },
    { '仓库名称': warehouses[1], '货品名称': products[1], '品牌名称': '测试品牌', '采购数量': 60, '箱规': 1 }
  ];
  const result = aggregate({ table2Rows: stock, table1Rows: purchase, brand: '测试品牌' });
  assert.equal(result.rows.length, 4);
  assert.equal(result.stats.warehouseCount, 2);
  for (const warehouse of warehouses) {
    const warehouseRows = result.rows.filter((row) => row.warehouse === warehouse);
    assert.deepEqual(warehouseRows.map((row) => row.product), products);
  }
  assert.equal(result.rows.find((row) => row.warehouse === warehouses[0] && row.product === products[1]).systemOrder, 0);
  assert.equal(result.rows.find((row) => row.warehouse === warehouses[1] && row.product === products[0]).systemOrder, 0);
});


test('仓库汇总的实际订单安排使用明细原始合计', () => {
  const result = aggregate({
    table2Rows: [{
      '物理仓名称': '华东测试直营商超仓', '货品名称': PRODUCT_10KG, '品牌名称': '测试品牌',
      '在库良品库存件数': 0, '最近1天出库件数': 0, '最近7天出库件数': 0, '最近30天出库件数': 795
    }],
    table1Rows: [{
      '仓库名称': '华东测试直营商超仓', '货品名称': PRODUCT_10KG, '品牌名称': '测试品牌',
      '采购数量': 400, '箱规': 1
    }],
    brand: '测试品牌'
  });
  assert.equal(result.rows.find((row) => row.product === PRODUCT_10KG).actualOrder, 318);
  assert.equal(result.summaries[0].actualOrder, 318);
});

test('自定义商品清单按指定顺序输出，并为缺少订单的商品补零', () => {
  const warehouse = '华东测试直营商超仓';
  const customProduct = '自定义商品3kg';
  const configuredProducts = [PRODUCT_10KG, PRODUCT_5KG, customProduct];
  const result = aggregate({
    table2Rows: inventory,
    table1Rows: [{
      '仓库名称': warehouse, '货品名称': PRODUCT_5KG, '品牌名称': '测试品牌',
      '采购数量': 20, '箱规': 1
    }],
    brand: '测试品牌',
    mapping: { [warehouse]: '华东杭州直营商超仓' },
    configuredProducts
  });
  assert.deepEqual(result.rows.map((row) => row.product), configuredProducts);
  assert.equal(result.rows.find((row) => row.product === PRODUCT_5KG).systemOrder, 20);
  assert.equal(result.rows.find((row) => row.product === PRODUCT_10KG).systemOrder, 0);
  assert.equal(result.rows.find((row) => row.product === customProduct).systemOrder, 0);
});

test('默认商品清单优先从表一按首次出现顺序去重，没有表一时回退表二', () => {
  const table1Rows = [
    { '品牌名称': '甲', '货品名称': '商品B' },
    { '品牌名称': '甲', '货品名称': '商品A' },
    { '品牌名称': '甲', '货品名称': ' 商品B ' },
    { '品牌名称': '乙', '货品名称': '其他商品' }
  ];
  const table2Rows = [
    { '品牌名称': '甲', '货品名称': '库存商品C' },
    { '品牌名称': '甲', '货品名称': '库存商品D' }
  ];
  assert.deepEqual(productCatalogForBrand({ table1Rows, table2Rows, brand: '甲' }), ['商品B', '商品A']);
  assert.deepEqual(productCatalogForBrand({ table1Rows: [], table2Rows, brand: '甲' }), ['库存商品C', '库存商品D']);
});

test('自定义统计仓库按全局预设输出，并支持过滤与缺单补零', () => {
  const configuredWarehouses = [
    '华东杭州直营商超仓',
    '华南广州直营商超A仓',
    '华西成都直营商超仓'
  ];
  const result = aggregate({
    table2Rows: inventory,
    table1Rows: [
      { '仓库名称': '华东杭州直营商超仓', '货品名称': PRODUCT_5KG, '品牌名称': '测试品牌', '采购数量': 50, '箱规': 1 },
      { '仓库名称': '未纳入统计的测试仓', '货品名称': PRODUCT_5KG, '品牌名称': '测试品牌', '采购数量': 30, '箱规': 1 }
    ],
    brand: '测试品牌',
    configuredWarehouses
  });
  assert.equal(result.stats.warehouseCount, 3);
  assert.deepEqual(result.warehouses, configuredWarehouses);
  assert.equal(result.stats.unresolvedOrders, 30); // 未纳入统计的仓作为未映射/未解析订单统计
  const hzRow = result.rows.find((r) => r.warehouse === '华东杭州直营商超仓' && r.product === PRODUCT_5KG);
  assert.equal(hzRow.systemOrder, 50);
  const gzRow = result.rows.find((r) => r.warehouse === '华南广州直营商超A仓' && r.product === PRODUCT_5KG);
  assert.equal(gzRow.systemOrder, 0); // 预设仓库缺单自动补零
});

test('自定义统计仓库支持传入对象数组并根据inStats/参与统计进行过滤', () => {
  const configuredObjects = [
    { warehouseName: '华东杭州直营商超仓', inStats: true },
    { warehouseName: '华东合肥直营商超仓', inStats: false },
    { warehouseName: '华南广州直营商超A仓', '参与统计': true }
  ];
  const result = aggregate({
    table2Rows: inventory,
    table1Rows: [],
    brand: '测试品牌',
    configuredWarehouses: configuredObjects
  });
  assert.equal(result.stats.warehouseCount, 2);
  assert.deepEqual(result.warehouses, ['华东杭州直营商超仓', '华南广州直营商超A仓']);
});

test('国宝桥米品牌采用集货模式：仅统计武汉直营商超仓与武汉直营集货仓，集货仓汇总其余所有仓数据', () => {
  const gbProduct = '国宝桥米大米5kg';
  const gbInventory = [
    {
      '物理仓名称': '华中武汉直营商超仓', '货品名称': gbProduct, '品牌名称': '国宝桥米', '货品状态': '正常',
      '在库良品库存件数': 40, '在库良品非锁定库存件数': 40, '最近30天出库件数': 50
    },
    {
      '物理仓名称': '华东杭州直营商超仓', '货品名称': gbProduct, '品牌名称': '国宝桥米', '货品状态': '正常',
      '在库良品库存件数': 20, '在库良品非锁定库存件数': 20, '最近30天出库件数': 30
    },
    {
      '物理仓名称': '华南广州直营商超A仓', '货品名称': gbProduct, '品牌名称': '国宝桥米', '货品状态': '正常',
      '在库良品库存件数': 10, '在库良品非锁定库存件数': 10, '最近30天出库件数': 20
    },
    {
      '物理仓名称': '华中武汉直营集货仓', '货品名称': gbProduct, '品牌名称': '国宝桥米', '货品状态': '正常',
      '在库良品库存件数': 5, '在库良品非锁定库存件数': 5, '最近30天出库件数': 0
    }
  ];

  const gbOrders = [
    { '仓库名称': '华中武汉直营商超仓', '货品名称': gbProduct, '品牌名称': '国宝桥米', '采购数量': 60, '箱规': 1 },
    { '仓库名称': '华东杭州直营商超仓', '货品名称': gbProduct, '品牌名称': '国宝桥米', '采购数量': 35, '箱规': 1 },
    { '仓库名称': '华南广州直营商超A仓', '货品名称': gbProduct, '品牌名称': '国宝桥米', '采购数量': 25, '箱规': 1 }
  ];

  const result = aggregate({
    table2Rows: gbInventory,
    table1Rows: gbOrders,
    brand: '国宝桥米'
  });

  assert.equal(result.isHubMode, true);
  assert.equal(result.stats.warehouseCount, 2);
  assert.deepEqual(result.warehouses, ['华中武汉直营商超仓', '华中武汉直营集货仓']);

  // 武汉商超仓：自身的订单 60，良品库存 40，出库 50
  const scRow = result.rows.find((r) => r.warehouse === '华中武汉直营商超仓');
  assert.ok(scRow);
  assert.equal(scRow.systemOrder, 60);
  assert.equal(scRow.availableGood, 40);
  assert.equal(scRow.out30, 50);

  // 武汉集货仓：其余所有仓之和（订单 35 + 25 = 60，良品库存 20 + 10 + 5 = 35，出库 30 + 20 + 0 = 50）
  const jhRow = result.rows.find((r) => r.warehouse === '华中武汉直营集货仓');
  assert.ok(jhRow);
  assert.equal(jhRow.systemOrder, 60);
  assert.equal(jhRow.availableGood, 35);
  assert.equal(jhRow.out30, 50);
});