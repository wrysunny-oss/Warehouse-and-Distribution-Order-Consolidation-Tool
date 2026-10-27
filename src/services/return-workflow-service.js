'use strict';

const path = require('node:path');
const ExcelJS = require('exceljs');
const { RETURN_TYPE, HEADERS, quantityValue, dateValue, analyzeReturnSummary } = require('./return-summary-service');
const { FOLLOWUP_HEADERS, EDITABLE_FIELDS, PAPER_HEADERS } = require('../shared/return-workflow.json');
const text = value => String(value ?? '').trim();
const compare = new Intl.Collator('zh-CN', { numeric: true }).compare;
const aliases = value => [...new Set(text(value).split('#').map(code => code.trim().replace(/\.0$/, '')).filter(Boolean))];
const RAW_REQUIRED = [...HEADERS, '预约单状态'];
const SUMMARY_REQUIRED = ['预约单状态', '预约日期', '履行单号', '产品明细', '数量（包）', '退回地址'];

function cellValue(cell) {
  let value = cell.value;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    value = 'result' in value ? value.result : value.richText ? value.richText.map(part => part.text).join('') : value.text;
  }
  return value instanceof Date ? value.toISOString().slice(0, 10) : value ?? '';
}

function missingHeaders(headers, stage) {
  const required = stage === 'paper' ? ['履行单号'] : stage === 'summary' ? SUMMARY_REQUIRED : RAW_REQUIRED;
  const missing = required.filter(header => !headers.includes(header));
  if (stage === 'paper' && !EDITABLE_FIELDS.some(field => headers.includes(field))) missing.push('至少一个跟进字段');
  return missing;
}

async function inspectReturnWorkbook(filePath) {
  if (path.extname(filePath).toLowerCase() !== '.xlsx') throw new Error('仅支持单个 .xlsx 文件。');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheets = workbook.worksheets.map((sheet, index) => {
    const headers = [];
    sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => { headers[col - 1] = text(cellValue(cell)); });
    const duplicates = headers.filter((header, i) => header && headers.indexOf(header) !== i);
    const rows = [];
    sheet.eachRow((row, number) => {
      if (number === 1) return;
      const item = { _id: `${index}:${number}`, _sourceRow: number };
      headers.forEach((header, col) => { if (header) item[header] = cellValue(row.getCell(col + 1)); });
      if (headers.some(header => header && text(item[header]))) rows.push(item);
    });
    return { id: String(index), name: sheet.name, headers, rows, duplicates };
  });
  if (!sheets.length) throw new Error('文件中没有工作表。');
  return { filePath, fileName: path.basename(filePath), sheets };
}

function rowIssues(row, quantityHeader = '总件数') {
  const issues = [];
  if (quantityValue(row[quantityHeader]) === null) issues.push('数量必须为非负整数，不可为空');
  if (!dateValue(row['预约日期'])) issues.push(text(row['预约日期']) ? '预约日期无效' : '缺少预约日期');
  if (!text(row['履行单号'])) issues.push('缺少履行单号');
  return issues;
}

function metrics(rows, quantityHeader) {
  let quantity = 0, invalidQuantityCount = 0;
  rows.forEach(row => {
    const value = quantityValue(row[quantityHeader]);
    if (value === null) invalidQuantityCount++;
    else quantity += value;
  });
  return { count: rows.length, quantity, invalidQuantityCount, safeTotal: Number.isSafeInteger(quantity) };
}

function selectRawRows(source, { selectedIds = [], statuses = ['已完成'], type = RETURN_TYPE } = {}) {
  const ids = new Set(selectedIds);
  if (ids.size !== selectedIds.length || selectedIds.some(id => !source.rows.some(row => row._id === id))) throw new Error('选择记录无效，请重新选择。');
  const rows = source.rows.filter(row => ids.has(row._id) && text(row['预约单类型']) === type && statuses.includes(text(row['预约单状态'])));
  if (!rows.length) throw new Error('请先勾选本次处理的明细。');
  const invalid = rows.flatMap(row => rowIssues(row).map(reason => `源表第${row._sourceRow}行：${reason}`));
  if (!metrics(rows, '总件数').safeTotal) invalid.push('累计数量超出安全整数范围');
  if (invalid.length) throw new Error(invalid.slice(0, 5).join('；'));
  return rows;
}

function productMatcher(products) {
  const index = new Map();
  products.forEach((product, id) => aliases(product['条码']).forEach(code => {
    if (!index.has(code)) index.set(code, new Map());
    index.get(code).set(id, product);
  }));
  return barcode => {
    const matches = new Map();
    aliases(barcode).forEach(code => index.get(code)?.forEach((product, id) => matches.set(id, product)));
    if (!matches.size) return { name: '', issue: '未匹配商品' };
    if (matches.size > 1) return { name: '', issue: '条码匹配冲突' };
    const product = [...matches.values()][0], name = text(product['订单简称']);
    return { name, aliases: aliases(product['条码']), issue: name ? '' : '订单简称缺失' };
  };
}

function createFollowupRows(rows, products) {
  const match = productMatcher(products);
  return rows.map(row => {
    const product = match(row['货品条码']);
    const item = Object.fromEntries(FOLLOWUP_HEADERS.map(header => [header, row[header] ?? '']));
    return { ...item, _id: row._id, _sourceRow: row._sourceRow, _barcode: text(row['货品条码']),
      _aliases: product.aliases || aliases(row['货品条码']), _matchIssue: product.issue, _typeIssue: text(row['预约单类型']) !== RETURN_TYPE ? '第二步仅接收退供出库预约单，请在第一步筛选类型' : '',
      '产品明细': product.name, '数量（包）': row['总件数'] };
  });
}

function followupIssues(rows) {
  const issues = rows.flatMap(row => [
    ...rowIssues(row, '数量（包）'), row._matchIssue, row._typeIssue,
    !text(row['产品明细']) && !row._matchIssue ? '产品明细为空' : '',
  ].filter(Boolean).map(reason => ({ id: row._id, rowNumber: row._sourceRow, orderNumber: text(row['履行单号']), barcode: row._barcode || '', reason })));
  if (!metrics(rows, '数量（包）').safeTotal) issues.push({ reason: '累计数量超出安全整数范围' });
  return issues;
}

function rematchFollowupRows(rows, products) {
  const match = productMatcher(products);
  return rows.map(row => {
    const product = match(row._barcode);
    return { ...row, '产品明细': product.name, _aliases: product.aliases || aliases(row._barcode), _matchIssue: product.issue };
  });
}

function applyFollowupPatches(rows, patches) {
  if (!Array.isArray(patches)) throw new Error('跟进更新格式无效。');
  const map = new Map(rows.map(row => [row._id, row]));
  patches.forEach(patch => {
    if (!map.has(patch.id)) throw new Error('待更新明细不存在，请重新导入。');
    if (!patch.values || Object.keys(patch.values).some(field => !EDITABLE_FIELDS.includes(field))) throw new Error('仅允许修改跟进字段。');
    map.set(patch.id, { ...map.get(patch.id), ...Object.fromEntries(Object.entries(patch.values).map(([field, value]) => [field, text(value)])) });
  });
  return rows.map(row => map.get(row._id));
}

function previewFollowupImport(rows, importedRows) {
  const updates = new Map(), unmatched = [];
  importedRows.forEach(source => {
    const order = text(source['履行单号']);
    const codes = aliases(source['货品条码'] || source['条码']);
    const name = text(source['产品明细']), fullName = text(source['货品名称']);
    const values = EDITABLE_FIELDS.filter(field => text(source[field])).map(field => [field, text(source[field])]);
    if (!values.length) return;
    const matches = rows.filter(row => order && text(row['履行单号']) === order
      && (!codes.length || (row._aliases || aliases(row._barcode)).some(code => codes.includes(code)))
      && (!name || text(row['产品明细']) === name) && (!fullName || text(row['货品名称']) === fullName));
    if (!matches.length) { unmatched.push({ rowNumber: source._sourceRow, orderNumber: order, reason: order ? '找不到匹配的单号或货品' : '缺少履行单号' }); return; }
    matches.forEach(row => values.forEach(([field, value]) => {
      const key = JSON.stringify([row._id, field]);
      if (!updates.has(key)) updates.set(key, { key, id: row._id, orderNumber: order, productName: row['产品明细'] || row['货品名称'], field, existing: text(row[field]), values: [], sourceRows: [] });
      const update = updates.get(key);
      if (!update.values.includes(value)) update.values.push(value);
      if (!update.sourceRows.includes(source._sourceRow)) update.sourceRows.push(source._sourceRow);
    }));
  });
  const changes = [...updates.values()].map(update => ({ ...update, conflict: update.values.length > 1 || Boolean(update.existing && update.values.some(value => value !== update.existing)) }));
  return { changes, unmatched, affectedCount: new Set(changes.map(change => change.id)).size, conflictCount: changes.filter(change => change.conflict).length };
}

function resolveFollowupImport(preview, choices = {}, ignoreUnmatched = false) {
  if (preview.unmatched.length && !ignoreUnmatched) throw new Error('请先核对并确认忽略未匹配记录。');
  const patches = new Map();
  preview.changes.forEach(change => {
    let value = change.values[0];
    if (change.conflict) {
      const choice = choices[change.key];
      if (choice === 'keep') return;
      if (!/^\d+$/.test(String(choice)) || !change.values[Number(choice)]) throw new Error('请逐项处理所有冲突。');
      value = change.values[Number(choice)];
    }
    if (!patches.has(change.id)) patches.set(change.id, { id: change.id, values: {} });
    patches.get(change.id).values[change.field] = value;
  });
  return [...patches.values()];
}

function analyzeAddresses(rows, statuses = ['已完成']) {
  const selected = rows.filter(row => statuses.includes(text(row['预约单状态'])));
  const pending = selected.filter(row => !text(row['退回地址']));
  const discarded = selected.filter(row => text(row['退回地址']) === '弃货');
  const groups = new Map();
  selected.filter(row => text(row['退回地址']) && text(row['退回地址']) !== '弃货').forEach(row => {
    const address = text(row['退回地址']);
    if (!groups.has(address)) groups.set(address, []);
    groups.get(address).push(row);
  });
  const analyses = [...groups].sort(([a], [b]) => compare(a, b)).map(([address, items]) => {
    const names = [...new Set(items.map(row => text(row['产品明细'])))];
    const products = names.map((name, i) => ({ '条码': `product-${i}`, '订单简称': name }));
    const normalized = items.map(row => ({ rowNumber: row._sourceRow, '预约单类型': RETURN_TYPE, '预约日期': row['预约日期'], '履行单号': row['履行单号'], '货品条码': `product-${names.indexOf(text(row['产品明细']))}`, '货品名称': row['产品明细'], '总件数': row['数量（包）'] }));
    const analysis = analyzeReturnSummary(normalized, products);
    // Summary imports carry their own product names; generated follow-up rows retain unresolved master issues.
    const issues = followupIssues(items);
    analysis.issues = issues;
    analysis.canExport = items.length > 0 && issues.length === 0 && analysis.totalsMatch;
    analysis.defaultTitle = `国宝产品 退货到${address} 明细` + (analysis.dateRange ? `（退供单日期${analysis.dateRange.start.replaceAll('-', '.')}-${analysis.dateRange.end.replaceAll('-', '.')}）` : '');
    return { address, analysis, ...metrics(items, '数量（包）') };
  });
  return { selected: metrics(selected, '数量（包）'), pending: { ...metrics(pending, '数量（包）'), rows: pending }, discarded: { ...metrics(discarded, '数量（包）'), rows: discarded }, groups: analyses,
    canExport: analyses.length > 0 && analyses.every(group => group.analysis.canExport) };
}

function buildTableWorkbook(headers, rows, name) {
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet(name);
  sheet.columns = headers.map(header => ({ header, key: header, width: /名称|货品|产品明细|备注|原因/.test(header) ? 42 : /单号|编号|条码/.test(header) ? 30 : 20 }));
  rows.forEach(row => sheet.addRow(headers.map(header => row[header] ?? '')));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: headers.length } };
  sheet.eachRow((row, i) => {
    row.height = i === 1 ? 30 : 24;
    row.eachCell({ includeEmpty: true }, cell => {
      cell.font = { name: '宋体', size: 11, bold: i === 1 };
      cell.alignment = { vertical: 'middle', wrapText: i === 1 };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE4E4E7' } } };
      if (i === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F4F5' } };
    });
  });
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1' };
  return workbook;
}

module.exports = { FOLLOWUP_HEADERS, EDITABLE_FIELDS, PAPER_HEADERS, missingHeaders, inspectReturnWorkbook, rowIssues, metrics, selectRawRows, createFollowupRows, followupIssues, rematchFollowupRows, applyFollowupPatches, previewFollowupImport, resolveFollowupImport, analyzeAddresses, buildTableWorkbook };
