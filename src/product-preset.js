'use strict';

const path = require('node:path');
const fs = require('node:fs');
const ExcelJS = require('exceljs');
const { cleanText, numberValue } = require('./core');
const { validateDeliveryTable, cleanCode } = require('./delivery-note');

const PRODUCT_HEADERS = [
  '序号',
  '货品名称（带空格）',
  '条码',
  '品牌名称',
  '备注',
  '规格kg',
  '采购规格(箱规数)',
  '订单简称',
  '企业微信申报订单简称'
];

function getPresetFilePath(customDir) {
  if (customDir) return path.join(customDir, 'product-preset.json');
  try {
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') {
      return path.join(app.getPath('userData'), 'product-preset.json');
    }
  } catch {
    // Fallback if electron not available (e.g. unit tests or standalone bot)
  }
  if (process.env.APPDATA) {
    const candidate = path.join(process.env.APPDATA, 'excel-warehouse-summary', 'product-preset.json');
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(__dirname, '..', 'product-preset.json');
}

function getDefaultTemplatePath() {
  return path.join(__dirname, 'templates', 'product.xlsx');
}

function cellValue(cell) {
  const value = cell.value;
  if (value && typeof value === 'object') {
    if ('result' in value) return value.result ?? '';
    if ('text' in value) return value.text ?? '';
  }
  return value ?? '';
}

async function readProductRowsFromWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('工作簿中没有有效的工作表。');

  const headers = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = cleanText(cell.text || cellValue(cell));
  });

  const validation = validateDeliveryTable({ headers }, 'product');
  if (!validation.valid) {
    throw new Error(`缺少必要的商品主数据字段：${validation.missing.join('、')}`);
  }

  const rows = [];
  for (let r = 2; r <= worksheet.rowCount; r++) {
    const row = {};
    let hasValue = false;
    headers.forEach((h, idx) => {
      if (!h) return;
      const val = cellValue(worksheet.getRow(r).getCell(idx + 1));
      if (val !== '' && val !== null && val !== undefined) hasValue = true;
      row[h] = val;
    });

    if (hasValue && (row['条码'] || row['货品名称（带空格）'] || row['订单简称'])) {
      rows.push(sanitizeProductRow(row, rows.length + 1));
    }
  }
  return { headers, rows };
}

function sanitizeProductRow(row, index = 1) {
  const fullName = cleanText(row['货品名称（带空格）'] || row['货品名称']);
  const barcode = cleanText(row['条码'] || row['条形码']);
  const brand = cleanText(row['品牌名称']);
  // Preserve an explicitly blank short name so strict workflows can report missing master data.
  const shortName = cleanText(Object.hasOwn(row, '订单简称') ? row['订单简称'] : (row['企业微信申报订单简称'] || fullName));
  const spec = numberValue(row['规格kg'] || row['规格']) || 0;
  const boxSpec = numberValue(row['采购规格(箱规数)'] || row['采购规格'] || row['箱规']) || 1;
  const note = cleanText(row['备注']);
  const wechatShort = cleanText(row['企业微信申报订单简称'] || shortName);

  return {
    '序号': index,
    '货品名称（带空格）': fullName,
    '条码': barcode,
    '品牌名称': brand,
    '备注': note,
    '规格kg': spec,
    '采购规格(箱规数)': boxSpec,
    '订单简称': shortName,
    '企业微信申报订单简称': wechatShort
  };
}

async function loadProductPreset(customDir) {
  const filePath = getPresetFilePath(customDir);
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      if (Array.isArray(data.rows)) {
        return {
          rows: data.rows.map((r, i) => sanitizeProductRow(r, i + 1)),
          headers: PRODUCT_HEADERS,
          source: 'preset',
          updatedAt: data.updatedAt || null
        };
      }
    } catch {
      // If parsing fails, fall back to reading template
    }
  }

  // Fallback to default template
  const defaultPath = getDefaultTemplatePath();
  const { rows } = await readProductRowsFromWorkbook(defaultPath);
  await saveProductPreset(rows, customDir);
  return {
    rows,
    headers: PRODUCT_HEADERS,
    source: 'default',
    updatedAt: new Date().toISOString()
  };
}

async function saveProductPreset(rows, customDir) {
  const filePath = getPresetFilePath(customDir);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const sanitized = rows.map((r, i) => sanitizeProductRow(r, i + 1));
  const payload = {
    updatedAt: new Date().toISOString(),
    count: sanitized.length,
    rows: sanitized
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return { ok: true, count: sanitized.length, rows: sanitized };
}

async function resetProductPreset(customDir) {
  const defaultPath = getDefaultTemplatePath();
  const { rows } = await readProductRowsFromWorkbook(defaultPath);
  await saveProductPreset(rows, customDir);
  return { ok: true, count: rows.length, rows };
}

async function importProductPreset(filePath, customDir) {
  const { rows } = await readProductRowsFromWorkbook(filePath);
  await saveProductPreset(rows, customDir);
  return { ok: true, count: rows.length, rows, fileName: path.basename(filePath) };
}

module.exports = {
  PRODUCT_HEADERS,
  getPresetFilePath,
  getDefaultTemplatePath,
  readProductRowsFromWorkbook,
  sanitizeProductRow,
  loadProductPreset,
  saveProductPreset,
  resetProductPreset,
  importProductPreset
};
