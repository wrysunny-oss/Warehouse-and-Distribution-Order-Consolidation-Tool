'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { cleanText } = require('../core');
const { validateDeliveryTable, analyzeDeliveryData, buildDeliveryExports } = require('../delivery-note');
const { loadProductPreset } = require('../product-preset');

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

function sheetPayload(worksheet) {
  const headers = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
    headers[column - 1] = cleanText(cell.text || cellValue(cell));
  });
  const rows = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const item = {};
    let hasValue = false;
    headers.forEach((header, index) => {
      if (!header) return;
      const value = cellValue(row.getCell(index + 1));
      if (value !== '' && value !== null && value !== undefined) hasValue = true;
      item[header] = value;
    });
    if (hasValue) rows.push(item);
  }
  return { sheetName: worksheet.name, headers, rows };
}

async function readDeliveryRows(filePath, type = 'receipt') {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const candidates = workbook.worksheets.map(sheetPayload);
  const selected = candidates.find((candidate) => validateDeliveryTable(candidate, type).valid);
  if (!selected) {
    // 降级使用第一个 sheet
    return candidates[0]?.rows || [];
  }
  return selected.rows;
}

/**
 * 执行送货单生成业务
 */
async function processDeliveryTask({
  receiptFilePath,
  productFilePath,
  brands,
  warehouses,
  supplierName = '湖北国宝桥米有限公司',
  shelfLife = 360,
  contact = '仓储物流部',
  splitByWarehouse = false,
  outputDir
}) {
  if (!receiptFilePath || !fs.existsSync(receiptFilePath)) {
    throw new Error('送货单/入库单文件不存在');
  }
  if (!outputDir) {
    outputDir = path.dirname(receiptFilePath);
  }
  fs.mkdirSync(outputDir, { recursive: true });

  const receiptRows = await readDeliveryRows(receiptFilePath, 'receipt');
  if (!receiptRows.length) {
    throw new Error('送货单文件中未解析到有效明细行');
  }

  let productRows = [];
  if (productFilePath && fs.existsSync(productFilePath)) {
    productRows = await readDeliveryRows(productFilePath, 'product');
  } else {
    // 自动加载系统全局商品预设
    const preset = await loadProductPreset();
    productRows = preset.rows || [];
  }

  const analysis = analyzeDeliveryData({ productRows, receiptRows });

  // 默认使用所有可用品牌
  const targetBrands = (Array.isArray(brands) && brands.length)
    ? brands
    : analysis.brands.map((b) => (typeof b === 'object' ? b.name : b)).filter(Boolean);
  if (!targetBrands.length) {
    throw new Error('未在明细中识别到有效品牌，请检查送货单格式');
  }

  // 默认包含所有出现的仓库
  const targetWarehouses = (Array.isArray(warehouses) && warehouses.length)
    ? warehouses
    : [...new Set(receiptRows.map((r) => cleanText(r['仓库名称'])).filter(Boolean))];

  const filteredReceiptRows = receiptRows.filter((row) =>
    targetWarehouses.includes(cleanText(row['仓库名称']))
  );

  const templatePath = path.join(__dirname, '..', 'templates', 'DeliveryNote.xlsx');
  const builds = await buildDeliveryExports({
    templatePath,
    productRows,
    receiptRows: filteredReceiptRows,
    brands: targetBrands,
    warehouses: targetWarehouses,
    shelfLife,
    contact,
    supplierName,
    splitByWarehouse: Boolean(splitByWarehouse)
  });

  if (!builds.length) {
    throw new Error('没有符合条件的明细可以导出');
  }

  const generatedFiles = [];
  for (const build of builds) {
    const warehouseSuffix = splitByWarehouse && build.warehouse ? '-' + safeFilePart(build.warehouse) : '';
    const outName = 'DeliveryNote-' + safeFilePart(build.brand) + warehouseSuffix + '.xlsx';
    const filePath = availableFilePath(outputDir, outName);
    await build.workbook.xlsx.writeFile(filePath);
    generatedFiles.push({
      brand: build.brand,
      warehouse: build.warehouse || '',
      filePath,
      fileName: path.basename(filePath),
      warehouseCount: build.warehouseCount,
      detailRows: build.totalRows,
      fractionalBoxes: build.fractionalBoxes
    });
  }

  const totalDetailRows = generatedFiles.reduce((acc, f) => acc + (f.detailRows || 0), 0);
  const summaryText = `成功生成 ${generatedFiles.length} 份送货单文件，共覆盖 ${targetBrands.join('、')}，涉及 ${targetWarehouses.length} 个仓库，合计 ${totalDetailRows} 行明细。`;

  return {
    success: true,
    files: generatedFiles,
    summaryText
  };
}

module.exports = {
  processDeliveryTask,
  readDeliveryRows
};
