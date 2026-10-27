'use strict';

const path = require('node:path');
const ExcelJS = require('exceljs');

const RETURN_TYPE = '退供出库预约单';
const INBOUND_TYPE = '普通直入预约单';
const HEADERS = ['预约单类型', '预约日期', '履行单号', '货品条码', '货品名称', '品牌名称', '总件数'];
const TEMPLATE_PATH = path.join(__dirname, '../templates/国宝产品 退货到京山国宝米厂319包 明细.xlsx');
const text = value => String(value ?? '').trim();
const collator = new Intl.Collator('zh-CN', { numeric: true });
const aliases = value => [...new Set(text(value).split('#').map(s => s.trim().replace(/\.0$/, '')).filter(Boolean))];

function cellValue(cell) {
  const value = cell.value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value && typeof value === 'object') {
    if ('result' in value) return value.result ?? '';
    if ('richText' in value) return value.richText.map(part => part.text).join('');
    return value.text ?? '';
  }
  return value ?? '';
}

async function readReturnWorkbook(filePath) {
  if (path.extname(filePath).toLowerCase() !== '.xlsx') throw new Error('仅支持单个 .xlsx 文件。');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('文件中没有工作表。');
  const headers = [];
  sheet.getRow(1).eachCell((cell, col) => { headers[col - 1] = text(cellValue(cell)); });
  const missing = HEADERS.filter(header => !headers.includes(header));
  if (missing.length) throw new Error(`首个工作表缺少字段：${missing.join('、')}`);
  if (HEADERS.some(header => headers.filter(h => h === header).length !== 1)) throw new Error('必需字段存在重复表头，请检查导入文件。');
  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const item = { rowNumber };
    headers.forEach((header, col) => { if (header) item[header] = cellValue(row.getCell(col + 1)); });
    if (headers.some(header => header && text(item[header]) !== '')) rows.push(item);
  });
  const types = [...new Set(rows.map(row => text(row['预约单类型'])).filter(Boolean))].sort(collator.compare);
  return { filePath, fileName: path.basename(filePath), sheetName: sheet.name, rows, types,
    defaultType: types.includes(RETURN_TYPE) ? RETURN_TYPE : (types[0] || RETURN_TYPE) };
}

function quantityValue(value) {
  if (!['string', 'number'].includes(typeof value) || text(value) === '') return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function dateValue(value) {
  if (value instanceof Date) value = value.toISOString().slice(0, 10);
  if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 2958466) {
    value = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000).toISOString().slice(0, 10);
  }
  const match = text(value).match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日)?(?:[ T].*)?$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month) || date.getUTCDate() !== Number(day)) return null;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function analyzeReturnSummary(rows, productRows, type = RETURN_TYPE) {
  const index = new Map();
  productRows.forEach((product, id) => {
    aliases(product['条码']).forEach(code => {
      if (!index.has(code)) index.set(code, new Map());
      index.get(code).set(id, product);
    });
  });
  const selected = rows.filter(row => text(row['预约单类型']) === type);
  const excluded = [], issues = [], products = new Map(), orders = new Map(), dates = [];
  let total = 0, includedCount = 0, excludedPackages = 0, excludedInvalidQuantityCount = 0;
  selected.forEach(row => {
    const quantity = quantityValue(row['总件数']);
    const base = { rowNumber: row.rowNumber, barcode: text(row['货品条码']), productName: text(row['货品名称']),
      brand: text(row['品牌名称']), date: text(row['预约日期']), orderNumber: text(row['履行单号']), rawQuantity: row['总件数'], quantity };
    const missing = ['预约日期', '履行单号'].filter(header => text(row[header]) === '');
    if (quantity === null) issues.push({ ...base, kind: 'quantity', reason: '总件数必须为非负整数（不可为空）' });
    if (missing.length) {
      excluded.push({ ...base, reason: `缺少${missing.join('、')}` });
      if (quantity !== null) excludedPackages += quantity;
      else excludedInvalidQuantityCount++;
      return;
    }
    includedCount++;
    const date = dateValue(row['预约日期']);
    if (!date) issues.push({ ...base, kind: 'date', reason: '预约日期格式无效' });
    else dates.push(date);
    const candidates = new Map();
    aliases(row['货品条码']).forEach(code => index.get(code)?.forEach((product, id) => candidates.set(id, product)));
    let id, name, matchIssue;
    if (!candidates.size) matchIssue = '未匹配商品';
    else if (candidates.size > 1) matchIssue = '条码匹配冲突';
    else {
      const entry = [...candidates][0];
      id = entry[0];
      name = text(entry[1]['订单简称']);
      if (!name) matchIssue = '订单简称缺失';
    }
    if (matchIssue) {
      issues.push({ ...base, kind: 'match', reason: matchIssue,
        candidates: [...candidates.values()].map(product => `${text(product['订单简称']) || '无简称'}（${text(product['条码'])}）`) });
      id = `unresolved:${base.barcode}:${base.productName}`;
      name = `${matchIssue}：${base.productName || base.barcode || '空条码'}`;
    }
    if (quantity === null) return;
    total += quantity;
    if (!products.has(id)) products.set(id, { id, name, barcode: base.barcode, quantity: 0, unresolved: Boolean(matchIssue) });
    products.get(id).quantity += quantity;
    const orderKey = JSON.stringify([date || base.date, base.orderNumber]);
    if (!orders.has(orderKey)) orders.set(orderKey, { date: date || base.date, orderNumber: base.orderNumber, quantity: 0 });
    orders.get(orderKey).quantity += quantity;
  });
  const productSummary = [...products.values()].sort((a, b) => collator.compare(a.name, b.name)).map((item, i) => ({ ...item, number: i + 1 }));
  const orderSummary = [...orders.values()].sort((a, b) => a.date.localeCompare(b.date) || collator.compare(a.orderNumber, b.orderNumber)).map((item, i) => ({ ...item, number: i + 1 }));
  const productTotal = productSummary.reduce((sum, item) => sum + item.quantity, 0);
  const orderTotal = orderSummary.reduce((sum, item) => sum + item.quantity, 0);
  const totalsMatch = Number.isSafeInteger(total) && productTotal === orderTotal && productTotal === total;
  dates.sort();
  const dateRange = dates.length ? { start: dates[0], end: dates.at(-1) } : null;
  const inbound = type === INBOUND_TYPE;
  const titlePrefix = inbound ? '国宝产品 入库明细' : '国宝产品 退货到京山国宝米厂 明细';
  const defaultTitle = titlePrefix + (dateRange ? `（${inbound ? '预约日期' : '退供单日期'}${dateRange.start.replaceAll('-', '.')}-${dateRange.end.replaceAll('-', '.')}）` : '');
  const canExport = [RETURN_TYPE, INBOUND_TYPE].includes(type) && includedCount > 0 && productSummary.length > 0 && issues.length === 0 && totalsMatch;
  return { type, summaryName: inbound ? '入库汇总' : '退货汇总', orderHeader: inbound ? '履行单号' : '退供单号',
    productSummary, orderSummary, excluded, issues, matchIssues: issues.filter(issue => issue.kind === 'match'),
    selectedCount: selected.length, includedCount, excludedPackages, excludedInvalidQuantityCount,
    totalPackages: total, productTotal, orderTotal, totalsMatch, dateRange, defaultTitle, canExport };
}

async function buildReturnWorkbook(analysis, title, templatePath = TEMPLATE_PATH) {
  if (!analysis?.canExport || !analysis.totalsMatch) throw new Error('汇总未通过校验，请先处理异常并重新匹配。');
  if (!text(title)) throw new Error('请填写导出主标题。');
  const template = new ExcelJS.Workbook();
  await template.xlsx.readFile(templatePath);
  const source = template.worksheets[0];
  const workbook = new ExcelJS.Workbook();
  workbook.calcProperties.fullCalcOnLoad = true;
  const sheet = workbook.addWorksheet(analysis.summaryName);
  const clone = value => JSON.parse(JSON.stringify(value));
  sheet.properties = clone(source.properties);
  sheet.columns = Array.from({ length: 8 }, (_, i) => ({ width: source.getColumn(i + 1).width ?? source.properties.defaultColWidth }));
  const lastRow = Math.max(analysis.productSummary.length, analysis.orderSummary.length) + 3;
  sheet.pageSetup = { ...clone(source.pageSetup), fitToPage: true, fitToWidth: 1, fitToHeight: 0, printArea: `A1:H${lastRow}`, printTitlesRow: '1:2' };
  sheet.views = [{ state: 'normal', showGridLines: false }];
  for (let row = 1; row <= 2; row++) {
    sheet.getRow(row).height = source.getRow(row).height;
    for (let col = 1; col <= 8; col++) sheet.getCell(row, col).style = clone(source.getCell(row, col).style);
  }
  sheet.mergeCells('A1:H1');
  sheet.getCell('A1').value = text(title);
  sheet.getRow(2).values = ['序号', '产品明细', '数量（包）', null, '序号', '预约日期', analysis.orderHeader, '数量（包）'];
  // Each block has its own total row, independent of the other block's length.
  const blocks = [
    { items: analysis.productSummary, cols: [1, 2, 3], totalSource: 20, labelCol: 2, sumCol: 3, sumLetter: 'C', values: item => [item.number, item.name, item.quantity] },
    { items: analysis.orderSummary, cols: [5, 6, 7, 8], totalSource: 38, labelCol: 6, sumCol: 8, sumLetter: 'H', values: item => [item.number, item.date.replaceAll('-', '/'), item.orderNumber, item.quantity] },
  ];
  for (const block of blocks) {
    block.items.forEach((item, i) => {
      const row = i + 3, values = block.values(item);
      sheet.getRow(row).height = source.getRow(3).height || 20;
      block.cols.forEach((col, j) => {
        const cell = sheet.getCell(row, col);
        cell.style = clone(source.getCell(3, col).style);
        cell.value = values[j];
      });
    });
    const totalRow = block.items.length + 3;
    sheet.getRow(totalRow).height = source.getRow(3).height || 20;
    block.cols.forEach(col => { sheet.getCell(totalRow, col).style = clone(source.getCell(block.totalSource, col).style); });
    sheet.getCell(totalRow, block.labelCol).value = '总计';
    sheet.getCell(totalRow, block.sumCol).value = { formula: `SUM(${block.sumLetter}3:${block.sumLetter}${totalRow - 1})`, result: analysis.totalPackages };
  }
  return workbook;
}

module.exports = { RETURN_TYPE, INBOUND_TYPE, HEADERS, TEMPLATE_PATH, readReturnWorkbook, analyzeReturnSummary, buildReturnWorkbook, quantityValue, dateValue };
