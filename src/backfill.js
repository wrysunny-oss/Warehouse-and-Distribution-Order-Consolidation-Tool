'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { cleanText, numberValue } = require('./core');

const BACKFILL_META_SHEET = '__回填任务';
const BACKFILL_CHUNK_SIZE = 30000;

function cellValue(cell) {
  const value = cell.value;
  if (value && typeof value === 'object') {
    if ('result' in value) return value.result ?? '';
    if ('text' in value) return value.text ?? '';
    if ('richText' in value) return value.richText.map((item) => item.text).join('');
  }
  if (value instanceof Date) return value.toISOString();
  return value ?? '';
}

function actualOrderCellValue(cell) {
  const value = cell.value;
  if (value && typeof value === 'object' && 'formula' in value && (value.result === undefined || value.result === null || value.result === '')) {
    return 0;
  }
  return cellValue(cell);
}

function headerMap(worksheet) {
  const headers = new Map();
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
    const header = cleanText(cell.text || cellValue(cell));
    if (header) headers.set(header, column);
  });
  return headers;
}

function worksheetHasHeaders(worksheet, names) {
  const headers = headerMap(worksheet);
  return names.every((name) => headers.has(name));
}

function safeFilePart(value) {
  return cleanText(value).replace(/[\\/:*?"<>|]/g, '_') || '未命名';
}

function availableFilePath(directory, fileName) {
  const extension = path.extname(fileName);
  const base = path.basename(fileName, extension);
  let candidate = path.join(directory, fileName);
  let index = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(directory, `${base}-${index}${extension}`);
    index += 1;
  }
  return candidate;
}

function groupKey(warehouse, product) {
  return `${cleanText(warehouse)}\u0000${cleanText(product).toLowerCase()}`;
}

function parseActualOrder(value) {
  const raw = cleanText(value);
  if (!raw) return { valid: false, value: 0, reason: '实际订单安排为空' };
  const parsed = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    return { valid: false, value: 0, reason: '实际订单安排必须是大于等于 0 的整数' };
  }
  return { valid: true, value: parsed, reason: '' };
}

function allocateSequentially(sourceRows, actualOrder, purchaseField) {
  let remaining = numberValue(actualOrder);
  const allocations = [];
  let capacity = 0;

  for (const source of sourceRows || []) {
    const purchase = Math.max(0, numberValue(source[purchaseField]));
    capacity += purchase;
    const confirmed = Math.min(purchase, remaining);
    allocations.push({ source, confirmed });
    remaining -= confirmed;
  }

  return {
    allocations,
    capacity,
    actualOrder: numberValue(actualOrder),
    unallocated: Math.max(0, remaining),
    valid: remaining <= 0
  };
}

function planBackfill({ sourceRows = [], returnedRows = [], brand = '', purchaseField = '采购数量' }) {
  const selectedBrand = cleanText(brand);
  const sourceGroups = new Map();
  const sourceWarehouses = new Set();

  for (const source of sourceRows) {
    const warehouse = cleanText(source.warehouse);
    const product = cleanText(source.product);
    if (!warehouse || !product) continue;
    if (selectedBrand && cleanText(source.brand) !== selectedBrand) continue;
    const key = groupKey(warehouse, product);
    if (!sourceGroups.has(key)) sourceGroups.set(key, []);
    sourceGroups.get(key).push(source);
    sourceWarehouses.add(warehouse);
  }

  const returnedGroups = new Map();
  const errors = [];
  for (const row of returnedRows) {
    const warehouse = cleanText(row.warehouse);
    const product = cleanText(row.product);
    if (!warehouse || !product) continue;
    const parsed = parseActualOrder(row.actualOrder);
    if (!parsed.valid) {
      errors.push({ warehouse, product, message: parsed.reason });
      continue;
    }
    const key = groupKey(warehouse, product);
    if (returnedGroups.has(key)) {
      errors.push({ warehouse, product, message: '回传表三中存在重复的仓库和货品组合' });
      continue;
    }
    returnedGroups.set(key, { warehouse, product, actualOrder: parsed.value });
  }

  const allocations = new Map();
  const warehouseStats = new Map();
  const ensureWarehouse = (warehouse) => {
    if (!warehouseStats.has(warehouse)) {
      warehouseStats.set(warehouse, { warehouse, groupCount: 0, detailCount: 0, actualTotal: 0, errors: [] });
    }
    return warehouseStats.get(warehouse);
  };

  for (const error of errors) ensureWarehouse(error.warehouse || '未识别仓库').errors.push(error.message + (error.product ? `：${error.product}` : ''));

  for (const item of returnedGroups.values()) {
    const stat = ensureWarehouse(item.warehouse);
    stat.groupCount += 1;
    stat.actualTotal += item.actualOrder;
    const rows = sourceGroups.get(groupKey(item.warehouse, item.product)) || [];
    if (!rows.length) {
      if (item.actualOrder > 0) stat.errors.push(`货品未在订单原表中找到：${item.product}`);
      continue;
    }
    const result = allocateSequentially(rows, item.actualOrder, purchaseField);
    stat.detailCount += rows.length;
    if (!result.valid) {
      stat.errors.push(`${item.product} 超出采购数量 ${result.unallocated} 件`);
      continue;
    }
    result.allocations.forEach(({ source, confirmed }) => allocations.set(source.rowNumber, confirmed));
  }

  for (const warehouse of sourceWarehouses) ensureWarehouse(warehouse);
  const warehouses = [...warehouseStats.values()]
    .filter((item) => item.groupCount > 0 || item.errors.length > 0)
    .map((item) => ({ ...item, ready: item.groupCount > 0 && item.errors.length === 0 }))
    .sort((a, b) => a.warehouse.localeCompare(b.warehouse, 'zh-CN'));

  return {
    allocations,
    warehouses,
    readyWarehouses: warehouses.filter((item) => item.ready).map((item) => item.warehouse),
    errorCount: warehouses.reduce((sum, item) => sum + item.errors.length, 0)
  };
}

function addBackfillTask(workbook, payload) {
  const sourcePath = cleanText(payload.sourceOrderFilePath);
  if (!sourcePath || !fs.existsSync(sourcePath)) return null;
  const sourceBuffer = fs.readFileSync(sourcePath);
  const taskId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const meta = workbook.addWorksheet(BACKFILL_META_SHEET);
  meta.state = 'veryHidden';
  meta.addRow(['仓配订单回填任务', '请勿删除或修改此工作表']);
  meta.addRow(['任务编号', taskId]);
  meta.addRow(['创建时间', new Date().toISOString()]);
  meta.addRow(['品牌', cleanText(payload.brand)]);
  meta.addRow(['订单原表文件名', path.basename(sourcePath)]);
  meta.addRow(['订单原表工作表', cleanText(payload.sourceOrderSheetName)]);
  meta.addRow(['采购数量字段', cleanText(payload.sourceOrderHeader) || '采购数量']);
  meta.addRow(['数据编码', 'base64']);
  const encoded = sourceBuffer.toString('base64');
  for (let index = 0; index < encoded.length; index += BACKFILL_CHUNK_SIZE) {
    meta.addRow([Math.floor(index / BACKFILL_CHUNK_SIZE) + 1, encoded.slice(index, index + BACKFILL_CHUNK_SIZE)]);
  }
  return { taskId, sourceFileName: path.basename(sourcePath) };
}

function readBackfillTask(workbook) {
  const meta = workbook.getWorksheet(BACKFILL_META_SHEET);
  if (!meta) throw new Error('这份表三没有回填任务信息，请选择由当前版本工具导出的表三。');
  const values = {};
  for (let rowNumber = 2; rowNumber <= 8; rowNumber += 1) {
    values[cleanText(cellValue(meta.getCell(rowNumber, 1)))] = cleanText(cellValue(meta.getCell(rowNumber, 2)));
  }
  const chunks = [];
  for (let rowNumber = 9; rowNumber <= meta.rowCount; rowNumber += 1) {
    const chunk = String(cellValue(meta.getCell(rowNumber, 2)) || '');
    if (chunk) chunks.push(chunk);
  }
  if (!values['任务编号'] || !chunks.length) throw new Error('表三中的回填任务信息不完整，无法恢复订单原表。');
  return {
    taskId: values['任务编号'],
    createdAt: values['创建时间'],
    brand: values['品牌'],
    sourceFileName: values['订单原表文件名'] || '订单原表.xlsx',
    sourceSheetName: values['订单原表工作表'],
    purchaseField: values['采购数量字段'] || '采购数量',
    sourceBuffer: Buffer.from(chunks.join(''), 'base64')
  };
}

function returnedTableRows(worksheet) {
  const headers = headerMap(worksheet);
  const warehouseColumn = headers.get('仓库名称');
  const productColumn = headers.get('货品名称');
  const actualColumn = headers.get('实际订单安排');
  const rows = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const warehouse = cleanText(cellValue(worksheet.getCell(rowNumber, warehouseColumn)));
    const product = cleanText(cellValue(worksheet.getCell(rowNumber, productColumn)));
    if (!product || /\s汇总$/.test(warehouse)) continue;
    rows.push({ warehouse, product, actualOrder: actualOrderCellValue(worksheet.getCell(rowNumber, actualColumn)) });
  }
  return rows;
}

function returnedTableBrand(worksheet) {
  const headers = headerMap(worksheet);
  const brandColumn = headers.get('品牌名称');
  if (!brandColumn) return '';
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const brand = cleanText(cellValue(worksheet.getCell(rowNumber, brandColumn)));
    if (brand) return brand;
  }
  return '';
}

function sourceOrderRows(worksheet, task) {
  const headers = headerMap(worksheet);
  const warehouseColumn = headers.get('仓库名称') || headers.get('物理仓名称');
  const productColumn = headers.get('货品名称');
  const brandColumn = headers.get('品牌名称');
  const purchaseColumn = headers.get(task.purchaseField);
  const confirmColumn = headers.get('供应商确认数量');
  if (!warehouseColumn || !productColumn || !purchaseColumn || !confirmColumn) {
    throw new Error('订单原表缺少仓库名称、货品名称、采购数量或供应商确认数量字段。');
  }
  const rows = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const warehouse = cleanText(cellValue(worksheet.getCell(rowNumber, warehouseColumn)));
    const product = cleanText(cellValue(worksheet.getCell(rowNumber, productColumn)));
    if (!warehouse || !product) continue;
    rows.push({
      rowNumber,
      warehouse,
      product,
      brand: brandColumn ? cleanText(cellValue(worksheet.getCell(rowNumber, brandColumn))) : '',
      [task.purchaseField]: cellValue(worksheet.getCell(rowNumber, purchaseColumn))
    });
  }
  return { rows, columns: { warehouseColumn, confirmColumn } };
}

async function analyzeBackfillFile(filePath, externalSourcePath = '') {
  const returnedWorkbook = new ExcelJS.Workbook();
  await returnedWorkbook.xlsx.readFile(filePath);
  const returnedSheet = returnedWorkbook.worksheets.find((sheet) => sheet.name !== BACKFILL_META_SHEET && worksheetHasHeaders(sheet, ['仓库名称', '货品名称', '实际订单安排']));
  if (!returnedSheet) throw new Error('没有找到包含“仓库名称、货品名称、实际订单安排”的表三工作表。');

  const hasEmbeddedTask = Boolean(returnedWorkbook.getWorksheet(BACKFILL_META_SHEET));
  if (!hasEmbeddedTask && !externalSourcePath) {
    return {
      needsExternalSource: true,
      legacy: true,
      returnedSheetName: returnedSheet.name,
      brand: returnedTableBrand(returnedSheet)
    };
  }

  let task;
  if (hasEmbeddedTask) {
    task = readBackfillTask(returnedWorkbook);
  } else {
    if (!fs.existsSync(externalSourcePath)) throw new Error('订单原表不存在，请重新选择文件。');
    const sourceBuffer = fs.readFileSync(externalSourcePath);
    const sourceWorkbook = new ExcelJS.Workbook();
    await sourceWorkbook.xlsx.load(sourceBuffer);
    const sourceSheet = sourceWorkbook.worksheets.find((sheet) => worksheetHasHeaders(sheet, ['货品名称', '采购数量', '供应商确认数量']));
    if (!sourceSheet) throw new Error('订单原表缺少货品名称、采购数量或供应商确认数量字段。');
    task = {
      taskId: '旧版表三',
      createdAt: '',
      brand: returnedTableBrand(returnedSheet),
      sourceFileName: path.basename(externalSourcePath),
      sourceSheetName: sourceSheet.name,
      purchaseField: '采购数量',
      sourceBuffer,
      legacy: true,
      externalSourcePath
    };
  }

  const sourceWorkbook = new ExcelJS.Workbook();
  await sourceWorkbook.xlsx.load(task.sourceBuffer);
  const sourceSheet = sourceWorkbook.getWorksheet(task.sourceSheetName) || sourceWorkbook.worksheets.find((sheet) => worksheetHasHeaders(sheet, ['货品名称', '供应商确认数量']));
  if (!sourceSheet) throw new Error('回填任务中的订单原表工作表已经损坏或无法识别。');
  const source = sourceOrderRows(sourceSheet, task);
  const plan = planBackfill({ sourceRows: source.rows, returnedRows: returnedTableRows(returnedSheet), brand: task.brand, purchaseField: task.purchaseField });
  return { task, plan, sourceWorkbook, sourceSheet, source, legacy: Boolean(task.legacy), needsExternalSource: false };
}

async function writeBackfillFiles(filePath, directory, externalSourcePath = '') {
  const analysis = await analyzeBackfillFile(filePath, externalSourcePath);
  if (analysis.needsExternalSource) throw new Error('旧版表三需要同时选择对应的订单原表。');
  const files = [];
  for (const warehouse of analysis.plan.readyWarehouses) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(analysis.task.sourceBuffer);
    const sheet = workbook.getWorksheet(analysis.task.sourceSheetName) || workbook.worksheets.find((item) => worksheetHasHeaders(item, ['货品名称', '供应商确认数量']));
    const source = sourceOrderRows(sheet, analysis.task);
    for (const [rowNumber, confirmed] of analysis.plan.allocations) sheet.getCell(rowNumber, source.columns.confirmColumn).value = confirmed;
    for (let rowNumber = sheet.rowCount; rowNumber >= 2; rowNumber -= 1) {
      const rowWarehouse = cleanText(cellValue(sheet.getCell(rowNumber, source.columns.warehouseColumn)));
      if (rowWarehouse !== warehouse) sheet.spliceRows(rowNumber, 1);
    }
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: sheet.rowCount, column: sheet.columnCount } };
    workbook.calcProperties.fullCalcOnLoad = true;
    workbook.calcProperties.forceFullCalc = true;
    const outputPath = availableFilePath(directory, `${safeFilePart(warehouse)}-补货单.xlsx`);
    await workbook.xlsx.writeFile(outputPath);
    files.push({ warehouse, filePath: outputPath, detailRows: Math.max(0, sheet.rowCount - 1) });
  }
  return { files, skipped: analysis.plan.warehouses.filter((item) => !item.ready) };
}

module.exports = {
  BACKFILL_META_SHEET,
  groupKey,
  parseActualOrder,
  actualOrderCellValue,
  allocateSequentially,
  planBackfill,
  addBackfillTask,
  readBackfillTask,
  analyzeBackfillFile,
  writeBackfillFiles
};
