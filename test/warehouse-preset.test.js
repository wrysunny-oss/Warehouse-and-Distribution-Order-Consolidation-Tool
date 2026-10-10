'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const {
  DEFAULT_WAREHOUSE_PRESETS,
  loadWarehousePreset,
  saveWarehousePreset,
  resetWarehousePreset,
  matchWarehouseFactory,
  importWarehousePresetFromFile,
  sanitizeWarehouseRow
} = require('../src/warehouse-preset');

test('仓库米厂预设：首次加载包含用户指定的21个仓库对应关系', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wh-preset-test-'));
  try {
    const preset = await loadWarehousePreset(tempDir);
    assert.equal(preset.rows.length, 21);
    
    // Check specific user mappings
    const nanchang = preset.rows.find((r) => r.warehouseName === '华中南昌直营商超仓');
    assert.ok(nanchang);
    assert.equal(nanchang.factory, '宏禾米厂'); // Special rule from table

    const jiaxing = preset.rows.find((r) => r.warehouseName === '华东嘉兴直营商超A仓');
    assert.ok(jiaxing);
    assert.equal(jiaxing.factory, '宏禾米厂');

    const chongqing = preset.rows.find((r) => r.warehouseName === '华西猫超重庆RDC仓');
    assert.ok(chongqing);
    assert.equal(chongqing.factory, '正点米厂');

    const guangzhou = preset.rows.find((r) => r.warehouseName === '华南广州直营商超A仓');
    assert.ok(guangzhou);
    assert.equal(guangzhou.factory, '腾三龙米厂');

    const wuhan = preset.rows.find((r) => r.warehouseName === '华中武汉直营商超仓');
    assert.ok(wuhan);
    assert.equal(wuhan.factory, '青龙米厂');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('仓库米厂推荐：matchWarehouseFactory支持精准匹配与特殊品牌规则', () => {
  const rows = DEFAULT_WAREHOUSE_PRESETS.map((r, i) => sanitizeWarehouseRow(r, i + 1));

  // 精准匹配
  assert.equal(matchWarehouseFactory('华中南昌直营商超仓', rows), '宏禾米厂');
  assert.equal(matchWarehouseFactory('华东嘉兴直营商超A仓', rows), '宏禾米厂');
  assert.equal(matchWarehouseFactory('华南广州直营商超A仓', rows), '腾三龙米厂');
  assert.equal(matchWarehouseFactory('华西猫超重庆RDC仓', rows), '正点米厂');

  // 武汉国宝桥米退到京山国宝米厂规则
  assert.equal(matchWarehouseFactory('华中武汉直营商超仓', rows, '稻花翁'), '青龙米厂');
  assert.equal(matchWarehouseFactory('华中武汉直营商超仓', rows, '国宝桥米'), '青龙米厂'); // 表格中写的是青龙
  assert.equal(matchWarehouseFactory('华中武汉未知仓', rows, '国宝桥米'), '京山工厂'); // 兜底华中回退京山
});

test('仓库米厂预设：支持新增、修改与删除持久化', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wh-crud-'));
  try {
    const preset = await loadWarehousePreset(tempDir);
    const initialCount = preset.rows.length;

    // 新增
    const newWh = sanitizeWarehouseRow({
      region: '华北仓',
      warehouseCode: 'PEK101',
      warehouseName: '华北北京直营商超仓',
      logicCode: '',
      logicName: '北京商超逻辑1仓',
      factory: '宏禾米厂',
      note: '新建华北'
    }, initialCount + 1);

    await saveWarehousePreset([...preset.rows, newWh], tempDir);

    const reloaded = await loadWarehousePreset(tempDir);
    assert.equal(reloaded.rows.length, initialCount + 1);
    const found = reloaded.rows.find((r) => r.warehouseName === '华北北京直营商超仓');
    assert.ok(found);
    assert.equal(found.factory, '宏禾米厂');

    // 删除
    const filtered = reloaded.rows.filter((r) => r.warehouseName !== '华北北京直营商超仓');
    await saveWarehousePreset(filtered, tempDir);

    const reloadedAfterDel = await loadWarehousePreset(tempDir);
    assert.equal(reloadedAfterDel.rows.length, initialCount);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('仓库米厂预设：支持导入CSV覆盖与重置默认', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wh-import-'));
  try {
    const csvContent = `序号,区域,仓库编码,仓库名称,逻辑仓编码,逻辑仓名称,米厂,备注
1,华东仓,HGH101,华东杭州直营商超仓,LHGH001,杭州商超逻辑1仓,宏禾,
2,华南仓,DGM105,华南东莞直营商超仓,LDGM001,东莞商超逻辑1仓,腾三龙,`;

    const csvPath = path.join(tempDir, 'test-wh.csv');
    fs.writeFileSync(csvPath, csvContent, 'utf8');

    const res = await importWarehousePresetFromFile(csvPath, tempDir);
    assert.equal(res.count, 2);

    const imported = await loadWarehousePreset(tempDir);
    assert.equal(imported.rows.length, 2);
    assert.equal(imported.rows[0].warehouseName, '华东杭州直营商超仓');
    assert.equal(imported.rows[0].factory, '宏禾米厂');

    // 重置
    const resetRes = await resetWarehousePreset(tempDir);
    assert.equal(resetRes.count, 21);

    const restored = await loadWarehousePreset(tempDir);
    assert.equal(restored.rows.length, 21);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
