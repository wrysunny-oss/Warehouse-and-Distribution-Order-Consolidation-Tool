'use strict';

const path = require('node:path');
const ExcelJS = require('exceljs');
const { dateValue } = require('./return-summary-service');
const { warehouses: WAREHOUSES } = require('../shared/daily-outbound.json');
const TEMPLATE_PATH = path.join(__dirname, '../templates/日出库-20261025-全部-全部-RDC-横版-离线-66777f8965cfe4de.xlsx');
const clean = value => String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
const compare = new Intl.Collator('zh-CN', { numeric: true }).compare;
const metricHeaders = ['全国近7日出库商品件数', '全国现货库存', ...WAREHOUSES.flatMap(warehouse => [`${warehouse}近7日出库商品件数`, `${warehouse}现货库存`])];
const REQUIRED_HEADERS = ['时间', '商品名称', 'SKU', '上下柜状态', ...metricHeaders];

function numeric(value, blankZero = false) {
  if (value == null || (typeof value === 'string' && !value.trim())) return blankZero ? 0 : null;
  if (!['number', 'string'].includes(typeof value)) return null;
  const result = Number(typeof value === 'string' ? value.replace(/,/g, '') : value);
  return Number.isFinite(result) && Math.abs(result) <= Number.MAX_SAFE_INTEGER ? result : null;
}
function amount(value) { const result = numeric(value); return Number.isSafeInteger(result) && result >= 0 ? result : null; }
const round = value => Number(value.toFixed(9));

function inferSpec(name) {
  const values = [...clean(name).matchAll(/(\d+(?:\.\d+)?)\s*(kg|千克|公斤|斤|g|克)(?![a-z])/gi)].map(match => Number(match[1]) * (match[2] === '斤' ? 0.5 : /^(g|克)$/i.test(match[2]) ? 0.001 : 1));
  const unique = [...new Set(values.map(round))];
  return unique.length === 1 && unique[0] > 0 ? unique[0] : null;
}
function valueOf(cell) {
  const value = cell.value;
  if (value instanceof Date) return value;
  if (value && typeof value === 'object') return 'result' in value ? value.result : value.richText ? value.richText.map(part => part.text).join('') : value.text ?? '';
  return value ?? '';
}

async function readDailyOutbound(filePath) {
  if (path.extname(filePath).toLowerCase() !== '.xlsx') throw new Error('仅支持单个 .xlsx 文件。');
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0]; if (!sheet) throw new Error('文件没有工作表。');
  const headers = [];
  sheet.getRow(1).eachCell((cell, col) => { headers[col - 1] = clean(valueOf(cell)); });
  const missing = REQUIRED_HEADERS.filter(header => !headers.includes(header));
  if (missing.length) throw new Error(`子表1缺少字段：${missing.join('、')}`);
  if (REQUIRED_HEADERS.some(header => headers.filter(value => value === header).length !== 1)) throw new Error('子表1存在重复必需表头。');
  const columns = new Map(headers.map((header, i) => [header, i + 1]));
  const rows = [];
  sheet.eachRow((row, number) => {
    if (number === 1) return;
    const get = header => valueOf(row.getCell(columns.get(header)));
    if (!REQUIRED_HEADERS.some(header => clean(get(header)))) return;
    const issues = [];
    const skuRaw = get('SKU'), sku = clean(skuRaw);
    if (!sku) issues.push('SKU为空');
    if (typeof skuRaw === 'number' && !Number.isSafeInteger(skuRaw)) issues.push('SKU数值不精确，请在原表改为文本');
    const date = dateValue(get('时间'));
    if (!date) issues.push('报告日期无效');
    const metrics = {};
    metricHeaders.forEach(header => {
      const value = numeric(get(header), true);
      if (value === null) issues.push(`${header}不是有效数字`);
      metrics[header] = value;
    });
    rows.push({ id: `r${number}`, rowNumber: number, date, name: clean(get('商品名称')), sku, status: clean(get('上下柜状态')), metrics, issues });
  });
  if (!rows.length) throw new Error('子表1没有商品明细。');
  // Invalid dates cannot be hidden by the date selector.
  const badDate = rows.find(row => !row.date);
  if (badDate) throw new Error(`源表第${badDate.rowNumber}行报告日期无效，请修正后重新导入。`);
  return { filePath, fileName: path.basename(filePath), sheetName: sheet.name, rows, dates: [...new Set(rows.map(row => row.date))].sort() };
}

function checkEdits(source, edits) {
  const input = edits || {};
  if (typeof input !== 'object' || Array.isArray(input)) throw new Error('编辑数据格式无效。');
  const result = {};
  for (const field of ['names', 'specs', 'quantities', 'choices']) {
    const value = input[field] ?? {};
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('编辑数据格式无效。');
    result[field] = value;
  }
  const ids = new Set(source.rows.map(row => row.id));
  for (const field of ['names', 'specs', 'quantities']) if (Object.keys(result[field]).some(id => !ids.has(id))) throw new Error('编辑记录已失效，请重新导入。');
  return result;
}

function analyzeDailyOutbound(source, { date = source.dates.length === 1 ? source.dates[0] : '', status = '上柜', edits } = {}) {
  if (date && !source.dates.includes(date)) throw new Error('请选择文件中存在的报告日期。');
  if (!['上柜', '下柜', '全部'].includes(status)) throw new Error('上下柜状态无效。');
  const changes = checkEdits(source, edits);
  const active = source.rows.filter(row => row.date === date && (status === '全部' || row.status === status)).map(row => ({ ...row, name: Object.hasOwn(changes.names, row.id) ? clean(changes.names[row.id]) : row.name }));
  const groups = new Map(), conflicts = [], excluded = [], products = [], issues = [];
  active.forEach(row => { const key = row.name; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); });
  for (const [name, rows] of groups) {
    const skus = [...new Set(rows.map(row => row.sku))];
    let selected = rows;
    if (skus.length > 1) {
      const chosen = Object.hasOwn(changes.choices, name) && skus.includes(changes.choices[name]) ? changes.choices[name] : '';
      conflicts.push({ name, resolved: Boolean(chosen), chosen, candidates: skus.map(sku => {
        const matching = rows.filter(row => row.sku === sku);
        return { sku, ids: matching.map(row => row.id), rowNumbers: matching.map(row => row.rowNumber), out7: matching.reduce((sum, row) => sum + (row.metrics['全国近7日出库商品件数'] ?? 0), 0), stock: matching.reduce((sum, row) => sum + (row.metrics['全国现货库存'] ?? 0), 0) };
      }) });
      if (chosen) { selected = rows.filter(row => row.sku === chosen); excluded.push(...rows.filter(row => row.sku !== chosen).map(row => ({ ...row, reason: `同名冲突：已保留SKU ${chosen}` }))); }
    }
    // Unresolved SKU groups stay separate in the preview, never summed into a fictitious SKU.
    for (const sku of [...new Set(selected.map(row => row.sku))]) {
      const matching = selected.filter(row => row.sku === sku), id = matching[0].id;
      const metrics = Object.fromEntries(metricHeaders.map(header => [header, matching.every(row => row.metrics[header] !== null) ? matching.reduce((sum, row) => sum + row.metrics[header], 0) : null]));
      const spec = Object.hasOwn(changes.specs, id) ? numeric(changes.specs[id]) : inferSpec(name);
      const rowIssues = matching.flatMap(row => row.issues.map(reason => `源表第${row.rowNumber}行：${reason}`));
      if (!name) rowIssues.push('商品名称为空');
      if (!(spec > 0)) rowIssues.push('规格未识别或无效，请填写正数kg规格');
      const values = changes.quantities[id] ?? {};
      if (typeof values !== 'object' || values === null || Array.isArray(values) || Object.keys(values).some(warehouse => !WAREHOUSES.includes(warehouse))) throw new Error('仓库补货编辑格式无效。');
      const warehouses = {};
      for (const warehouse of WAREHOUSES) {
        const out7 = metrics[`${warehouse}近7日出库商品件数`], stock = metrics[`${warehouse}现货库存`];
        const qty = amount(Object.hasOwn(values, warehouse) ? values[warehouse] : 0);
        if (qty === null) rowIssues.push(`${warehouse}补货数量必须为非负整数，不可为空`);
        const weight = spec > 0 && qty !== null ? round(spec * qty / 1000) : null;
        if (weight !== null && !Number.isFinite(weight)) rowIssues.push(`${warehouse}重量超出有效范围`);
        warehouses[warehouse] = { out7, stock, suggested: out7 !== null && stock !== null ? out7 * 4 - stock : null, quantity: qty, weight };
      }
      for (const [header, value] of Object.entries(metrics)) if (value !== null && Math.abs(value) > Number.MAX_SAFE_INTEGER) rowIssues.push(`${header}累计超出安全范围`);
      const product = { id, ids: matching.map(row => row.id), name, sku, spec, nationalOut7: metrics['全国近7日出库商品件数'], nationalStock: metrics['全国现货库存'], warehouses, conflict: skus.length > 1 && (!changes.choices[name] || !skus.includes(changes.choices[name])), issues: [...new Set(rowIssues)] };
      products.push(product);
      issues.push(...product.issues.map(reason => ({ id, name, sku, reason })));
    }
  }
  products.sort((a, b) => compare(a.name, b.name) || compare(a.sku, b.sku));
  const sum = values => round(values.reduce((total, value) => total + (value ?? 0), 0));
  const totals = { nationalOut7: sum(products.map(row => row.nationalOut7)), nationalStock: sum(products.map(row => row.nationalStock)), warehouses: {} };
  WAREHOUSES.forEach(warehouse => {
    totals.warehouses[warehouse] = Object.fromEntries(['out7', 'stock', 'suggested', 'quantity', 'weight'].map(key => [key, sum(products.map(row => row.warehouses[warehouse][key]))]));
  });
  if ([totals.nationalOut7, totals.nationalStock, ...Object.values(totals.warehouses).flatMap(value => Object.values(value))].some(value => !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)) issues.push({ reason: '累计结果超出有效范围' });
  return { date, status, matchedCount: active.length, products, conflicts, excluded, issues, totals, warehouses: WAREHOUSES,
    canExport: Boolean(date) && products.length > 0 && !issues.length && conflicts.every(conflict => conflict.resolved) };
}

async function buildDailyOutboundWorkbook(analysis, templatePath = TEMPLATE_PATH) {
  if (!analysis.canExport) throw new Error('请先处理SKU冲突和数据问题，再导出。');
  const template = new ExcelJS.Workbook(); await template.xlsx.readFile(templatePath);
  const original = template.worksheets[2]; if (!original) throw new Error('导出模板缺少子表3。');
  const workbook = new ExcelJS.Workbook();
  workbook.model = { ...workbook.model, themes: template.model.themes };
  const sheet = workbook.addWorksheet('日出库补货计划');
  workbook.calcProperties.fullCalcOnLoad = true;
  const headers = ['商品名称', '规格（kg）', 'SKU', '全国近7日出库商品件数', '全国现货库存', ...WAREHOUSES.flatMap(warehouse => [`${warehouse}近7日出库商品件数`, `${warehouse}现货库存`, `${warehouse}建议补货`, `${warehouse}补货数量`, `${warehouse}重量（吨）`])];
  const clone = value => JSON.parse(JSON.stringify(value));
  const styleColumn = col => col <= 5 ? col : 6 + ((col - 6) % 5);
  sheet.columns = headers.map((header, i) => ({ header, width: i === 0 ? 55 : i === 2 ? 24 : i < 5 ? 18 : 17 }));
  sheet.getRow(1).height = 48;
  const defaultFont = original.getCell('B2').font || { name: '宋体', size: 11 };
  headers.forEach((_, i) => { const cell = sheet.getCell(1, i + 1); cell.style = clone(original.getCell(1, styleColumn(i + 1)).style); cell.font = clone(cell.font || defaultFont); cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; });
  analysis.products.forEach((product, i) => {
    const r = i + 2, row = sheet.getRow(r);
    row.height = Math.max(original.getRow(2).height || 20, 24);
    row.values = [product.name, product.spec, product.sku, product.nationalOut7, product.nationalStock];
    for (let c = 1; c <= headers.length; c++) {
      const cell = row.getCell(c); cell.style = clone(original.getCell(2, styleColumn(c)).style);
      cell.font = clone(cell.font || defaultFont);
      cell.border = { left: { style: 'thin' }, right: { style: 'thin' }, top: { style: 'thin' }, bottom: { style: 'thin' } };
      cell.numFmt = c === 3 ? '@' : c > 5 && (c - 6) % 5 === 4 ? '0.0000##' : 'General';
      if (c === 1) cell.alignment = { vertical: 'middle', wrapText: true };
    }
    WAREHOUSES.forEach((warehouse, index) => {
      const c = 6 + index * 5, value = product.warehouses[warehouse];
      row.getCell(c).value = value.out7; row.getCell(c + 1).value = value.stock;
      row.getCell(c + 2).value = { formula: `${sheet.getColumn(c).letter}${r}*4-${sheet.getColumn(c + 1).letter}${r}`, result: value.suggested };
      row.getCell(c + 3).value = value.quantity;
      row.getCell(c + 4).value = { formula: `$B${r}*${sheet.getColumn(c + 3).letter}${r}/1000`, result: value.weight };
    });
  });
  const totalRow = analysis.products.length + 2;
  sheet.getRow(totalRow).height = 26; sheet.getCell(totalRow, 1).value = '总计';
  const values = [null, null, null, analysis.totals.nationalOut7, analysis.totals.nationalStock, ...WAREHOUSES.flatMap(warehouse => { const value = analysis.totals.warehouses[warehouse]; return [value.out7, value.stock, value.suggested, value.quantity, value.weight]; })];
  for (let c = 1; c <= headers.length; c++) {
    const cell = sheet.getCell(totalRow, c); cell.style = clone(sheet.getCell(2, c).style);
    cell.font = { ...cell.font, bold: true }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
    if (c >= 4) cell.value = { formula: `SUM(${sheet.getColumn(c).letter}2:${sheet.getColumn(c).letter}${totalRow - 1})`, result: values[c - 1] };
  }
  sheet.views = [{ state: 'frozen', xSplit: 3, ySplit: 1 }];
  sheet.autoFilter = `A1:BR${totalRow - 1}`;
  // Keep this wide planning sheet readable across printed pages instead of shrinking 70 columns onto one page.
  sheet.pageSetup = { ...clone(original.pageSetup), orientation: 'landscape', paperSize: 9, fitToPage: false, scale: 70, printArea: `A1:BR${totalRow}`, printTitlesRow: '1:1', printTitlesColumn: 'A:C' };
  return workbook;
}

module.exports = { WAREHOUSES, REQUIRED_HEADERS, TEMPLATE_PATH, inferSpec, numeric, amount, readDailyOutbound, analyzeDailyOutbound, buildDailyOutboundWorkbook };
