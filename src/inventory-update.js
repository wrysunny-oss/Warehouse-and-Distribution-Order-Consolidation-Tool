'use strict';

const ExcelJS = require('exceljs');
const path = require('node:path');

const REQUIRED_HEADERS = ['仓库名称', '货品名称', '良品可用'];
const TRANSIT_REQUIRED_HEADERS = ['仓库名称', '货品名称', '剩余数量'];

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function cellValue(cell) {
  const value = cell?.value;
  if (value && typeof value === 'object') {
    if ('result' in value) return value.result ?? '';
    if ('text' in value) return value.text ?? '';
    if ('richText' in value) return value.richText.map((item) => item.text).join('');
  }
  return value ?? '';
}

function headerMap(worksheet) {
  const headers = new Map();
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
    const header = cleanText(cell.text || cellValue(cell));
    if (header) headers.set(header, column);
  });
  return headers;
}

function findDataSheet(workbook, requiredHeaders = REQUIRED_HEADERS) {
  return workbook.worksheets.find((worksheet) => {
    const headers = headerMap(worksheet);
    return requiredHeaders.every((header) => headers.has(header));
  });
}

function rowKey(warehouse, product) {
  return `${cleanText(warehouse)}\u0000${cleanText(product)}`;
}

function isSummaryRow(warehouse, product) {
  return !cleanText(product) && /汇总$/.test(cleanText(warehouse));
}

function readTargetRows(worksheet) {
  const headers = headerMap(worksheet);
  const rows = [];
  const keyRows = new Map();
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const warehouse = cleanText(cellValue(worksheet.getCell(rowNumber, headers.get('仓库名称'))));
    const product = cleanText(cellValue(worksheet.getCell(rowNumber, headers.get('货品名称'))));
    if ((!warehouse && !product) || isSummaryRow(warehouse, product)) continue;
    if (!warehouse || !product) continue;
    const key = rowKey(warehouse, product);
    const row = {
      rowNumber,
      key,
      warehouse,
      product,
      oldValue: cellValue(worksheet.getCell(rowNumber, headers.get('良品可用')))
    };
    rows.push(row);
    if (!keyRows.has(key)) keyRows.set(key, []);
    keyRows.get(key).push(rowNumber);
  }
  return { rows, keyRows, availableColumn: headers.get('良品可用') };
}

function readInventoryRows(worksheet, targetKeys) {
  const headers = headerMap(worksheet);
  const values = new Map();
  const sourceRows = new Map();
  const errors = [];
  let dataRows = 0;
  let ignoredRows = 0;
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const warehouse = cleanText(cellValue(worksheet.getCell(rowNumber, headers.get('仓库名称'))));
    const product = cleanText(cellValue(worksheet.getCell(rowNumber, headers.get('货品名称'))));
    const raw = cellValue(worksheet.getCell(rowNumber, headers.get('良品可用')));
    if (!warehouse && !product && cleanText(raw) === '') continue;
    dataRows += 1;
    if (!warehouse || !product) {
      errors.push(`实时库存第 ${rowNumber} 行缺少仓库名称或货品名称`);
      continue;
    }
    const key = rowKey(warehouse, product);
    if (!targetKeys.has(key)) {
      ignoredRows += 1;
      continue;
    }
    const value = Number(raw);
    if (cleanText(raw) === '' || !Number.isFinite(value) || value < 0) {
      errors.push(`实时库存第 ${rowNumber} 行“良品可用”必须是大于等于 0 的数字`);
      continue;
    }
    values.set(key, (values.get(key) || 0) + value);
    if (!sourceRows.has(key)) sourceRows.set(key, []);
    sourceRows.get(key).push(rowNumber);
  }
  return { values, sourceRows, errors, dataRows, ignoredRows };
}

function readTransitRows(worksheet, targetKeys) {
  const headers = headerMap(worksheet);
  const values = new Map();
  const sourceRows = new Map();
  const errors = [];
  const warehouses = new Set();
  let dataRows = 0;
  let ignoredRows = 0;
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const warehouse = cleanText(cellValue(worksheet.getCell(rowNumber, headers.get('仓库名称'))));
    const product = cleanText(cellValue(worksheet.getCell(rowNumber, headers.get('货品名称'))));
    const raw = cellValue(worksheet.getCell(rowNumber, headers.get('剩余数量')));
    if (!warehouse && !product && cleanText(raw) === '') continue;
    dataRows += 1;
    if (!warehouse || !product) {
      errors.push(`在途明细第 ${rowNumber} 行缺少仓库名称或货品名称`);
      continue;
    }
    warehouses.add(warehouse);
    const key = rowKey(warehouse, product);
    if (!targetKeys.has(key)) {
      ignoredRows += 1;
      continue;
    }
    const value = Number(raw);
    if (cleanText(raw) === '' || !Number.isFinite(value) || value < 0) {
      errors.push(`在途明细第 ${rowNumber} 行“剩余数量”必须是大于等于 0 的数字`);
      continue;
    }
    values.set(key, (values.get(key) || 0) + value);
    if (!sourceRows.has(key)) sourceRows.set(key, []);
    sourceRows.get(key).push(rowNumber);
  }
  return { values, sourceRows, errors, dataRows, ignoredRows, warehouses };
}

async function loadWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  return workbook;
}

async function inspectWorkbook(filePath, type) {
  const workbook = await loadWorkbook(filePath);
  const isTransit = type === 'transit';
  const worksheet = findDataSheet(workbook, isTransit ? TRANSIT_REQUIRED_HEADERS : REQUIRED_HEADERS);
  if (!worksheet) {
    const label = type === 'table3' ? '旧表三' : isTransit ? '在途明细' : '实时库存';
    const fields = isTransit ? '仓库名称、货品名称、剩余数量' : '仓库名称、货品名称、良品可用';
    throw new Error(`${label}中没有找到包含“${fields}”的工作表。`);
  }
  const rowCount = isTransit
    ? Math.max(0, worksheet.rowCount - 1)
    : readTargetRows(worksheet).rows.length;
  return {
    filePath,
    sheetName: worksheet.name,
    rowCount
  };
}

async function analyzeInventoryUpdate(table3Path, inventoryPaths, transitPath = '') {
  const uniqueInventoryPaths = [...new Set((Array.isArray(inventoryPaths) ? inventoryPaths : [inventoryPaths]).filter(Boolean))];
  if (!uniqueInventoryPaths.length && !transitPath) throw new Error('实时库存和库存在途明细请至少选择一种。');
  const [table3Workbook, ...inventoryWorkbooks] = await Promise.all([
    loadWorkbook(table3Path),
    ...uniqueInventoryPaths.map(loadWorkbook)
  ]);
  const table3Sheet = findDataSheet(table3Workbook);
  if (!table3Sheet) throw new Error('旧表三中没有找到包含“仓库名称、货品名称、良品可用”的工作表。');

  const target = readTargetRows(table3Sheet);
  if (!target.rows.length) throw new Error('旧表三中没有可更新的商品明细。');
  const duplicateTargets = [...target.keyRows.entries()].filter(([, rows]) => rows.length > 1);
  const targetKeys = new Set(target.keyRows.keys());
  const combinedValues = new Map();
  const combinedSourceRows = new Map();
  const sourceByKey = new Map();
  const inventorySheets = [];
  const errors = [];
  let inventoryRows = 0;
  let ignoredInventoryRows = 0;
  let duplicateInventoryGroups = 0;
  inventoryWorkbooks.forEach((workbook, index) => {
    const sourceName = path.basename(uniqueInventoryPaths[index]);
    const worksheet = findDataSheet(workbook);
    if (!worksheet) {
      errors.push(`${sourceName} 中没有找到包含“仓库名称、货品名称、良品可用”的工作表`);
      return;
    }
    inventorySheets.push({ fileName: sourceName, sheetName: worksheet.name });
    const inventory = readInventoryRows(worksheet, targetKeys);
    inventoryRows += inventory.dataRows;
    ignoredInventoryRows += inventory.ignoredRows;
    duplicateInventoryGroups += [...inventory.sourceRows.values()].filter((rows) => rows.length > 1).length;
    inventory.errors.forEach((message) => errors.push(`${sourceName}：${message}`));
    inventory.values.forEach((value, key) => {
      if (combinedValues.has(key)) {
        const [warehouse, product] = key.split('\u0000');
        errors.push(`“${warehouse} / ${product}”同时出现在 ${sourceByKey.get(key)} 和 ${sourceName}，请只保留一份库存来源`);
        return;
      }
      combinedValues.set(key, value);
      combinedSourceRows.set(key, inventory.sourceRows.get(key) || []);
      sourceByKey.set(key, sourceName);
    });
  });
  duplicateTargets.forEach(([key, rows]) => {
    const [warehouse, product] = key.split('\u0000');
    errors.push(`旧表三中“${warehouse} / ${product}”重复出现在第 ${rows.join('、')} 行`);
  });

  let transit = { values: new Map(), sourceRows: new Map(), errors: [], dataRows: 0, ignoredRows: 0, warehouses: new Set() };
  let transitSheetName = '';
  if (transitPath) {
    const transitWorkbook = await loadWorkbook(transitPath);
    const transitSheet = findDataSheet(transitWorkbook, TRANSIT_REQUIRED_HEADERS);
    if (!transitSheet) {
      errors.push(`${path.basename(transitPath)} 中没有找到包含“仓库名称、货品名称、剩余数量”的工作表`);
    } else {
      transitSheetName = transitSheet.name;
      transit = readTransitRows(transitSheet, targetKeys);
      transit.errors.forEach((message) => errors.push(`${path.basename(transitPath)}：${message}`));
    }
  }

  const updates = [];
  const preserved = [];
  for (const row of target.rows) {
    if (!combinedValues.has(row.key)) {
      preserved.push(row);
      continue;
    }
    const newValue = combinedValues.get(row.key);
    const oldNumber = Number(row.oldValue);
    updates.push({
      rowNumber: row.rowNumber,
      warehouse: row.warehouse,
      product: row.product,
      oldValue: Number.isFinite(oldNumber) ? oldNumber : row.oldValue,
      newValue,
      difference: Number.isFinite(oldNumber) ? newValue - oldNumber : null,
      sourceFileName: sourceByKey.get(row.key),
      sourceRows: combinedSourceRows.get(row.key) || []
    });
  }

  const changedRows = updates.filter((row) => Number(row.oldValue) !== row.newValue).length;
  const transitUpdates = target.rows.filter((row) => transit.values.has(row.key)).map((row) => ({
    rowNumber: row.rowNumber,
    warehouse: row.warehouse,
    product: row.product,
    value: transit.values.get(row.key),
    sourceRows: transit.sourceRows.get(row.key) || []
  }));
  const inventoryUpdateByRow = new Map(updates.map((row) => [row.rowNumber, row]));
  const transitByRow = new Map(transitUpdates.map((row) => [row.rowNumber, row]));
  const targetWarehouses = [...new Set(target.rows.map((row) => row.warehouse))];
  const hasExistingTransitColumn = headerMap(table3Sheet).has('在途订单');
  const previewRows = target.rows.filter((row) => inventoryUpdateByRow.has(row.rowNumber) || transitByRow.has(row.rowNumber)).map((row) => {
    const inventoryUpdate = inventoryUpdateByRow.get(row.rowNumber);
    const oldNumber = Number(row.oldValue);
    return {
      rowNumber: row.rowNumber,
      warehouse: row.warehouse,
      product: row.product,
      oldValue: Number.isFinite(oldNumber) ? oldNumber : row.oldValue,
      newValue: inventoryUpdate ? inventoryUpdate.newValue : (Number.isFinite(oldNumber) ? oldNumber : row.oldValue),
      difference: inventoryUpdate ? inventoryUpdate.difference : 0,
      inventoryMatched: Boolean(inventoryUpdate),
      transitValue: transitByRow.get(row.rowNumber)?.value || 0
    };
  });
  return {
    table3SheetName: table3Sheet.name,
    inventorySheets,
    inventoryFileCount: uniqueInventoryPaths.length,
    targetRows: target.rows.length,
    inventoryRows,
    matchedRows: updates.length,
    changedRows,
    unchangedRows: updates.length - changedRows,
    preservedRows: preserved.length,
    ignoredInventoryRows,
    duplicateInventoryGroups,
    updatedWarehouses: [...new Set(updates.map((row) => row.warehouse))],
    hasTransit: Boolean(transitPath),
    transitFileName: transitPath ? path.basename(transitPath) : '',
    transitSheetName,
    transitRows: transit.dataRows,
    matchedTransitRows: transitUpdates.length,
    ignoredTransitRows: transit.ignoredRows,
    duplicateTransitGroups: [...transit.sourceRows.values()].filter((rows) => rows.length > 1).length,
    transitTotal: transitUpdates.reduce((sum, row) => sum + row.value, 0),
    transitWarehouses: [...new Set(transitUpdates.map((row) => row.warehouse))],
    sourceTransitWarehouses: [...transit.warehouses],
    hasExistingTransitColumn,
    preservedTransitWarehouses: hasExistingTransitColumn
      ? targetWarehouses.filter((warehouse) => !transit.warehouses.has(warehouse))
      : [],
    errors,
    canExport: (updates.length > 0 || transitUpdates.length > 0) && errors.length === 0,
    updates,
    transitUpdates,
    previewRows
  };
}

function copyCellStyle(source, target) {
  target.style = JSON.parse(JSON.stringify(source.style || {}));
}

async function writeInventoryUpdate(table3Path, inventoryPaths, outputPath, transitPath = '') {
  const analysis = await analyzeInventoryUpdate(table3Path, inventoryPaths, transitPath);
  if (!analysis.canExport) {
    if (analysis.errors.length) throw new Error(analysis.errors.join('；'));
    throw new Error('所选数据中没有匹配的仓库和货品，未生成文件。');
  }
  const workbook = await loadWorkbook(table3Path);
  const worksheet = findDataSheet(workbook);
  const availableColumn = headerMap(worksheet).get('良品可用');
  analysis.updates.forEach((update) => {
    worksheet.getCell(update.rowNumber, availableColumn).value = update.newValue;
  });
  if (analysis.hasTransit) {
    const headers = headerMap(worksheet);
    const existingTransitColumn = headers.get('在途订单');
    const transitColumn = existingTransitColumn || worksheet.columnCount + 1;
    const headerCell = worksheet.getCell(1, transitColumn);
    if (transitColumn > 1) copyCellStyle(worksheet.getCell(1, transitColumn - 1), headerCell);
    headerCell.value = '在途订单';
    worksheet.getColumn(transitColumn).width = 14;

    const transitByRow = new Map(analysis.transitUpdates.map((row) => [row.rowNumber, row.value]));
    const sourceWarehouses = new Set(analysis.sourceTransitWarehouses);
    const target = readTargetRows(worksheet);
    target.rows.forEach((row) => {
      const cell = worksheet.getCell(row.rowNumber, transitColumn);
      if (existingTransitColumn && !sourceWarehouses.has(row.warehouse)) return;
      if (transitColumn > 1) copyCellStyle(worksheet.getCell(row.rowNumber, transitColumn - 1), cell);
      cell.value = transitByRow.get(row.rowNumber) || 0;
    });

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const warehouse = cleanText(cellValue(worksheet.getCell(rowNumber, 1)));
      const product = cleanText(cellValue(worksheet.getCell(rowNumber, 2)));
      if (!isSummaryRow(warehouse, product)) continue;
      const warehouseName = warehouse.replace(/\s*汇总$/, '');
      if (existingTransitColumn && !sourceWarehouses.has(warehouseName)) continue;
      const warehouseRows = target.rows.filter((row) => row.warehouse === warehouseName);
      const cell = worksheet.getCell(rowNumber, transitColumn);
      if (transitColumn > 1) copyCellStyle(worksheet.getCell(rowNumber, transitColumn - 1), cell);
      if (!warehouseRows.length) {
        cell.value = 0;
        continue;
      }
      const start = Math.min(...warehouseRows.map((row) => row.rowNumber));
      const end = Math.max(...warehouseRows.map((row) => row.rowNumber));
      const result = warehouseRows.reduce((sum, row) => sum + (transitByRow.get(row.rowNumber) || 0), 0);
      const letter = worksheet.getColumn(transitColumn).letter;
      cell.value = { formula: `SUM(${letter}${start}:${letter}${end})`, result };
    }
    const lastColumn = worksheet.getColumn(transitColumn).letter;
    worksheet.autoFilter = { from: 'A1', to: `${lastColumn}${worksheet.rowCount}` };
  }
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.calcProperties.forceFullCalc = true;
  await workbook.xlsx.writeFile(outputPath);
  return analysis;
}

module.exports = {
  analyzeInventoryUpdate,
  inspectWorkbook,
  writeInventoryUpdate
};
