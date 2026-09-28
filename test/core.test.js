'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregate, parseSpec, parseBoxSpec, validateTable, suggestWarehouse } = require('../src/core');

const inventory = [
  {
    '物理仓名称': '华东杭州直营商超仓', '货品名称': '测试大米5kg×1袋', '品牌名称': '测试品牌', '货品状态': '正常',
    '在库良品库存件数': 100, '在库良品非锁定库存件数': 100, '在库良品非销售锁定库存件数': 3,
    '高库龄件数': 2, '高周转件数': 4, '最近1天出库件数': 5, '最近7天出库件数': 20,
    '最近14天出库件数': 35, '最近30天出库件数': 70
  },
  {
    '物理仓名称': '华东杭州直营商超仓', '货品名称': '另一款10kg', '品牌名称': '测试品牌', '货品状态': '正常',
    '在库良品库存件数': 8, '在库良品非锁定库存件数': 8, '在库良品非销售锁定库存件数': 0
  }
];

const orders = [{
  '物理仓名称': '菜鸟杭州前置仓', '货品名称': '测试大米5kg×1袋', '品牌名称': '测试品牌', __systemOrder: 200
}];

test('库存模式生成仓库和货品笛卡尔明细，订单为零', () => {
  const result = aggregate({ table2Rows: inventory, brand: '测试品牌' });
  assert.equal(result.stats.warehouseCount, 1);
  assert.equal(result.stats.productCount, 2);
  assert.equal(result.rows.length, 2);
  assert.equal(result.stats.systemOrders, 0);
  assert.equal(result.rows[0].actualOrder, 0);
});

test('完整模式按映射汇总订单并计算吨重', () => {
  const result = aggregate({
    table2Rows: inventory, table1Rows: orders, brand: '测试品牌',
    mapping: { '菜鸟杭州前置仓': '华东杭州直营商超仓' }
  });
  const row = result.rows.find((item) => item.product === '测试大米5kg×1袋');
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
test('表一重复仓库商品逐行保留，采购数量不合并', () => {
  const stock = [{
    '物理仓名称': '华东测试直营商超仓', '货品名称': '测试商品10kg', '品牌名称': '测试品牌', '货品状态': '正常',
    '在库良品库存件数': 0, '在库良品非锁定库存件数': 0,
    '最近1天出库件数': 0, '最近7天出库件数': 0, '最近30天出库件数': 30
  }];
  const purchase = [
    { '仓库名称': '华东测试直营商超仓', '货品名称': '测试商品10kg', '品牌名称': '测试品牌', '采购数量': 10, '箱规': 5 },
    { '仓库名称': '华东测试直营商超仓', '货品名称': '测试商品10kg', '品牌名称': '测试品牌', '采购数量': 10, '箱规': 5 }
  ];
  const result = aggregate({ table2Rows: stock, table1Rows: purchase, brand: '测试品牌' });
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.rows.map((row) => row.systemOrder), [10, 10]);
  assert.deepEqual(result.rows.map((row) => row.actualOrder), [10, 10]);
  assert.equal(result.stats.systemOrders, 20);
  assert.notEqual(result.rows[0].id, result.rows[1].id);
  assert.equal(result.rows[0].boxSpec, 5);
});

test('安排状态始终留空，实际重量仍正常计算', () => {
  const makeResult = (out30, purchase) => aggregate({
    table2Rows: [{
      '物理仓名称': '华东测试直营商超仓', '货品名称': '测试商品10kg', '品牌名称': '测试品牌',
      '在库良品库存件数': 0, '在库良品非锁定库存件数': 0,
      '最近1天出库件数': 0, '最近7天出库件数': 0, '最近30天出库件数': out30
    }],
    table1Rows: [{ '仓库名称': '华东测试直营商超仓', '货品名称': '测试商品10kg', '品牌名称': '测试品牌', '采购数量': purchase, '箱规': 1 }],
    brand: '测试品牌'
  });
  assert.equal(makeResult(1250, 600).summaries[0].actualWeight, 5);
  assert.equal(makeResult(1250, 600).summaries[0].arrangement, '');
  assert.equal(makeResult(3750, 1600).summaries[0].actualWeight, 15);
  assert.equal(makeResult(3750, 1600).summaries[0].arrangement, '');
  assert.equal(makeResult(1352.5, 600).summaries[0].actualWeight, 5.41);
  assert.equal(makeResult(1352.5, 600).summaries[0].arrangement, '');
});

test('完整模式只生成表一实际出现的仓库商品组合', () => {
  const stock = ['华东甲直营商超仓', '华东乙直营商超仓'].map((warehouse) => ({
    '物理仓名称': warehouse, '货品名称': '测试商品5kg', '品牌名称': '测试品牌',
    '在库良品库存件数': 0, '在库良品非锁定库存件数': 0,
    '最近1天出库件数': 10, '最近7天出库件数': 70, '最近30天出库件数': 300
  }));
  const purchase = [{ '仓库名称': '华东甲直营商超仓', '货品名称': '测试商品5kg', '品牌名称': '测试品牌', '采购数量': 100, '箱规': 1 }];
  const result = aggregate({ table2Rows: stock, table1Rows: purchase, brand: '测试品牌' });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].warehouse, '华东甲直营商超仓');
  assert.equal(result.rows[0].product, '测试商品5kg');
  assert.equal(result.rows[0].arrangement, '');
  assert.equal(result.stats.warehouseCount, 1);
});
test('仓库汇总的实际订单安排使用明细原始合计', () => {
  const result = aggregate({
    table2Rows: [{
      '物理仓名称': '华东测试直营商超仓', '货品名称': '测试商品10kg', '品牌名称': '测试品牌',
      '在库良品库存件数': 0, '最近1天出库件数': 0, '最近7天出库件数': 0, '最近30天出库件数': 795
    }],
    table1Rows: [{
      '仓库名称': '华东测试直营商超仓', '货品名称': '测试商品10kg', '品牌名称': '测试品牌',
      '采购数量': 400, '箱规': 1
    }],
    brand: '测试品牌'
  });
  assert.equal(result.rows[0].actualOrder, 318);
  assert.equal(result.summaries[0].actualOrder, 318);
});