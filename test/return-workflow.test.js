'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const ExcelJS = require('exceljs');
const service = require('../src/services/return-workflow-service');
const { registerReturnWorkflowIpc } = require('../src/return-workflow-ipc');
const { HEADERS, RETURN_TYPE } = require('../src/services/return-summary-service');
const samplePath = path.join(__dirname, '../src/templates/国宝截止到2026.10.22，未申报的退货明细(1).xlsx');
const products = [{ '条码': '111#222', '订单简称': '桥米5kg' }, { '条码': '333', '订单简称': '桥米10kg' }];
const raw = (id, patch = {}) => ({ _id: id, _sourceRow: Number(id) + 2, '预约单类型': RETURN_TYPE, '预约单状态': '已完成', '预约日期': '2026-10-01', '履行单号': 'LBX1', '货品条码': '111', '货品名称': '国宝桥米', '品牌名称': '国宝', '总件数': 3, '总箱数': 50, '箱规': 10, ...patch });
const followup = (id, patch = {}) => ({ _id: id, _sourceRow: Number(id) + 2, _barcode: '111', '预约单状态': '已完成', '预约日期': '2026-10-01', '履行单号': 'LBX1', '产品明细': '桥米5kg', '数量（包）': 3, '退回地址': '京山国宝米厂', ...patch });

test('manual selection keeps individual rows of the same order; default completed, aliases and package quantities', () => {
  const rows = [raw('0'), raw('1', { '货品条码': '222', '总件数': 0 }), raw('2', { '预约单状态': '已预约' })];
  const selected = service.selectRawRows({ rows }, { selectedIds: ['1', '2'] });
  assert.deepEqual(selected.map(row => row._id), ['1']);
  const generated = service.createFollowupRows(selected, products);
  assert.equal(generated.length, 1); assert.equal(generated[0]['数量（包）'], 0); assert.equal(generated[0]['产品明细'], '桥米5kg');
  assert.equal(generated[0]['退回地址'], ''); assert.equal(service.followupIssues(generated).length, 0);
  for (const value of ['', -1, 0.5, 'abc']) assert.throws(() => service.selectRawRows({ rows: [raw('0', { '总件数': value })] }, { selectedIds: ['0'] }), /数量/);
  assert.throws(() => service.selectRawRows({ rows }, { selectedIds: [] }), /勾选/);
  assert.throws(() => service.selectRawRows({ rows }, { selectedIds: ['fake'] }), /无效/);
});

test('follow-up rematch fixes missing master data without losing manually entered fields', () => {
  let rows = service.createFollowupRows([raw('0')], []);
  assert.match(service.followupIssues(rows)[0].reason, /未匹配/);
  rows = service.applyFollowupPatches(rows, [{ id: '0', values: { '退回地址': '京山国宝米厂', '快递单号': '00123', '备注': '纸质录入' } }]);
  rows = service.rematchFollowupRows(rows, products);
  assert.equal(service.followupIssues(rows).length, 0); assert.equal(rows[0]['快递单号'], '00123'); assert.equal(rows[0]['备注'], '纸质录入');
  const conflict = service.createFollowupRows([raw('0')], [...products, { '条码': '111', '订单简称': '冲突品' }]);
  assert.match(service.followupIssues(conflict)[0].reason, /冲突/);
  const missingName = service.createFollowupRows([raw('0')], [{ '条码': '111', '订单简称': '' }]);
  assert.match(service.followupIssues(missingName)[0].reason, /简称缺失/);
  assert.throws(() => service.applyFollowupPatches(rows, [{ id: '0', values: { '数量（包）': 100 } }]), /仅允许/);
});

test('paper import matches whole orders or specific products, preserves blanks, and requires conflict/unmatched review', () => {
  const rows = [followup('0', { _aliases: ['111', '222'], '快递名称': '中通' }), followup('1', { _barcode: '333', '产品明细': '桥米10kg' }), followup('2', { '履行单号': 'LBX2' })];
  const imported = [
    { _sourceRow: 2, '履行单号': 'LBX1', '快递名称': '德邦', '快递单号': '123', '退回地址': '' },
    { _sourceRow: 3, '履行单号': 'LBX1', '货品条码': '222', '退供原因': '破损' },
    { _sourceRow: 4, '履行单号': 'LBX1', '产品明细': '桥米10kg', '退供状态': '一级残' },
    { _sourceRow: 5, '履行单号': 'missing', '快递名称': '中通' },
  ];
  const preview = service.previewFollowupImport(rows, imported);
  assert.equal(preview.affectedCount, 2); assert.equal(preview.conflictCount, 1); assert.equal(preview.unmatched.length, 1);
  assert.throws(() => service.resolveFollowupImport(preview), /未匹配/);
  assert.throws(() => service.resolveFollowupImport(preview, {}, true), /所有冲突/);
  const conflict = preview.changes.find(change => change.conflict);
  const updated = service.applyFollowupPatches(rows, service.resolveFollowupImport(preview, { [conflict.key]: 'keep' }, true));
  assert.equal(updated[0]['快递名称'], '中通'); assert.equal(updated[1]['快递名称'], '德邦');
  assert.equal(updated[0]['退回地址'], '京山国宝米厂'); assert.equal(updated[0]['退供原因'], '破损');
  assert.equal(updated[1]['退供原因'], undefined); assert.equal(updated[1]['退供状态'], '一级残');
  assert.equal(updated[2]['快递名称'], undefined);
  const contradictory = service.previewFollowupImport(rows, [{ '履行单号': 'LBX2', '快递单号': 'A' }, { '履行单号': 'LBX2', '快递单号': 'B' }]);
  assert.equal(contradictory.conflictCount, 1);
  const replaced = service.applyFollowupPatches(rows, service.resolveFollowupImport(contradictory, { [contradictory.changes[0].key]: '1' }));
  assert.equal(replaced[2]['快递单号'], 'B');
});

test('address summaries retain zero, split dates, exclude blank/discard and block invalid eligible data', () => {
  const rows = [followup('0'), followup('1', { '预约日期': '2026-10-02', '数量（包）': 0 }), followup('2', { '退回地址': '正点米厂', '数量（包）': 5 }), followup('3', { '退回地址': '', '数量（包）': 7 }), followup('4', { '退回地址': '弃货', '数量（包）': 1 }), followup('5', { '预约单状态': '已预约', '数量（包）': 10 })];
  const analysis = service.analyzeAddresses(rows);
  assert.equal(analysis.selected.quantity, 16); assert.equal(analysis.groups.length, 2); assert.equal(analysis.pending.quantity, 7); assert.equal(analysis.discarded.quantity, 1); assert.equal(analysis.canExport, true);
  const group = analysis.groups.find(group => group.address === '京山国宝米厂');
  assert.equal(group.analysis.orderSummary.length, 2); assert.equal(group.analysis.totalPackages, 3);
  assert.match(group.analysis.defaultTitle, /退货到京山国宝米厂/);
  assert.equal(service.analyzeAddresses([], ['已完成']).canExport, false);
  for (const patch of [{ '数量（包）': '' }, { '产品明细': '' }, { '预约日期': '2026-02-30' }, { '履行单号': '' }]) assert.equal(service.analyzeAddresses([followup('0', patch)]).canExport, false);
  assert.equal(service.analyzeAddresses([followup('0'), followup('1', { '退回地址': '', '数量（包）': '' })]).canExport, true, 'pending records do not block valid addresses');
});

test('real three-sheet workbook: independent sheet detection and completed/address totals', async () => {
  const source = await service.inspectReturnWorkbook(samplePath);
  assert.equal(source.sheets.length, 3); assert.equal(source.sheets[0].rows.length, 2693); assert.equal(source.sheets[1].rows.length, 279);
  assert.deepEqual(service.missingHeaders(source.sheets[2].headers, 'summary'), []);
  assert.ok(service.missingHeaders(source.sheets[0].headers, 'summary').length > 0);
  const analysis = service.analyzeAddresses(source.sheets[2].rows);
  assert.equal(analysis.selected.count, 218); assert.equal(analysis.selected.quantity, 1325);
  assert.equal(analysis.pending.count, 75); assert.equal(analysis.pending.quantity, 476);
  assert.deepEqual(analysis.groups.map(group => [group.address, group.quantity]), [['京山国宝米厂', 786], ['正点米厂', 63]]);
  assert.equal(analysis.canExport, true);
  const all = service.analyzeAddresses(source.sheets[2].rows, ['已完成', '已预约']);
  assert.equal(all.discarded.quantity, 1); assert.equal(all.selected.quantity, 1741);
});

test('independent IPC stages, intermediate round trips, replace guards, stale protection, template and safe batch outputs', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'return-workflow-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const input = path.join(dir, 'raw.xlsx');
  const rawRows = [raw('0'), raw('1', { '货品条码': '333', '总件数': 5 }), raw('2', { '预约单状态': '已预约', '总件数': 100 })];
  await service.buildTableWorkbook([...HEADERS, '预约单状态', '物流仓名称'], rawRows, '原始明细').xlsx.writeFile(input);
  let openPath = input, savePath = path.join(dir, 'step2.xlsx'), canceled = false, master = products;
  const handlers = new Map();
  const setup = () => {
    handlers.clear();
    registerReturnWorkflowIpc({ ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) }, getWindow: () => null, loadProducts: async () => master,
      dialog: { showOpenDialog: async (_window, options) => ({ canceled, filePaths: [options.properties.includes('openDirectory') ? dir : openPath] }), showSaveDialog: async () => ({ canceled, filePath: savePath }) } });
  };
  const call = (action, payload) => handlers.get(`return-workflow:${action}`)(null, payload);
  const load = async (stage, sheetId = '0') => { const file = await call('open', { stage }); return call('load', { stage, workbookToken: file.workbookToken, sheetId }); };
  setup(); let state = await load('selection');
  const selection = { selectedIds: state.selection.rows.slice(0, 2).map(row => row._id), statuses: ['已完成'], type: RETURN_TYPE };
  canceled = true; assert.equal(await call('export', { stage: 'selection', ...selection }), null); canceled = false;
  savePath = input; await assert.rejects(call('export', { stage: 'selection', ...selection }), /不能覆盖/);
  savePath = path.join(dir, 'step2.xlsx'); await call('export', { stage: 'selection', ...selection });
  const step2 = await service.inspectReturnWorkbook(savePath); assert.equal(step2.sheets.length, 1); assert.equal(step2.sheets[0].rows.length, 2);
  state = await call('convert', { from: 'selection', ...selection }); assert.equal(state.followup.metrics.quantity, 8);
  await assert.rejects(call('convert', { from: 'selection', ...selection }), /确认替换/);
  const ids = state.followup.rows.map(row => row._id);
  state = await call('edit', { patches: ids.map((id, i) => ({ id, values: { '退回地址': i ? '正点米厂' : '京山国宝米厂', '快递名称': '中通', '快递单号': '00123' } })) });
  state = await call('convert', { from: 'followup' }); assert.equal(state.summary.analysis.groups.length, 2);
  state = await call('edit', { patches: [{ id: ids[0], values: { '备注': '更新' } }] }); assert.equal(state.summary.stale, true);
  await assert.rejects(call('export', { stage: 'summary' }), /重新生成/);
  state = await call('convert', { from: 'followup', replace: true });
  canceled = true; assert.equal(await call('export', { stage: 'summary' }), null); canceled = false;
  const batch = await call('export', { stage: 'summary' }); assert.equal(batch.ok, true); assert.equal(batch.files.length, 2);
  const again = await call('export', { stage: 'summary' }); assert.notEqual(again.files[0].filePath, batch.files[0].filePath);
  for (const file of batch.files) {
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(file.filePath);
    assert.equal(workbook.worksheets.length, 1); assert.match(workbook.worksheets[0].getCell('A1').text, new RegExp(file.address));
    assert.equal(workbook.worksheets[0].getCell('C4').value.result, file.quantity);
  }
  savePath = path.join(dir, 'step3.xlsx'); await call('export', { stage: 'followup' });
  const step3 = await service.inspectReturnWorkbook(savePath); assert.deepEqual(step3.sheets[0].headers, service.FOLLOWUP_HEADERS);
  setup(); openPath = path.join(dir, 'step2.xlsx'); state = await load('followup'); assert.equal(state.selection, null); assert.equal(state.followup.metrics.quantity, 8);
  setup(); openPath = path.join(dir, 'step3.xlsx'); state = await load('summary'); assert.equal(state.followup, null); assert.equal(state.summary.analysis.canExport, true);
  savePath = path.join(dir, 'template.xlsx'); await call('template'); const template = await service.inspectReturnWorkbook(savePath); assert.deepEqual(template.sheets[0].headers, service.PAPER_HEADERS);
  // A later master update must block a linked summary without altering the imported direct-summary path.
  master = []; assert.equal((await call('export', { stage: 'summary' })).ok, true);
});

test('paper IPC preview becomes stale after manual edits and cannot be replayed', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'return-paper-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const input = path.join(dir, 'raw.xlsx'), paper = path.join(dir, 'paper.xlsx');
  await service.buildTableWorkbook([...HEADERS, '预约单状态'], [raw('0')], '明细').xlsx.writeFile(input);
  await service.buildTableWorkbook(service.PAPER_HEADERS, [{ '履行单号': 'LBX1', '快递单号': '123' }], '跟进').xlsx.writeFile(paper);
  const handlers = new Map(); let openPath = input;
  registerReturnWorkflowIpc({ ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) }, getWindow: () => null, loadProducts: async () => products, dialog: { showOpenDialog: async () => ({ filePaths: [openPath] }) } });
  const call = (action, payload) => handlers.get(`return-workflow:${action}`)(null, payload);
  let file = await call('open', { stage: 'followup' }); const state = await call('load', { stage: 'followup', workbookToken: file.workbookToken, sheetId: '0' });
  openPath = paper; file = await call('open', { stage: 'paper' }); const preview = await call('preview-paper', { workbookToken: file.workbookToken, sheetId: '0' });
  await call('edit', { patches: [{ id: state.followup.rows[0]._id, values: { '备注': '已编辑' } }] });
  await assert.rejects(call('apply-paper', { previewToken: preview.token }), /已变化/);
  const fresh = await call('preview-paper', { workbookToken: file.workbookToken, sheetId: '0' });
  const applied = await call('apply-paper', { previewToken: fresh.token }); assert.equal(applied.followup.rows[0]['快递单号'], '123');
  await assert.rejects(call('apply-paper', { previewToken: fresh.token }), /已变化/);
});
