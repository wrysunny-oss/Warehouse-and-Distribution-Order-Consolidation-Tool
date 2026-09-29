'use strict';

const ExcelJS = require('exceljs');

const PRODUCT_REQUIRED = ['货品名称（带空格）', '条码', '品牌名称', '订单简称'];
const RECEIPT_REQUIRED = [
  'LBX号', '供应商编码', '仓库名称', '预约入库时间', '货品名称', '条形码', '品牌名称',
  '商品实际发货数量', '采购规格(箱规数)'
];

function clean(value) {
  return String(value ?? '').trim();
}

function requiredNumber(value) {
  const text = clean(value);
  if (!text) return Number.NaN;
  const number = Number(text);
  return Number.isFinite(number) ? number : Number.NaN;
}

function cleanCode(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  return clean(value).replace(/\.0+$/, '');
}

function validateDeliveryTable(payload, type) {
  const required = type === 'product' ? PRODUCT_REQUIRED : RECEIPT_REQUIRED;
  const headers = payload?.headers || [];
  const missing = required.filter((field) => !headers.includes(field));
  return { valid: missing.length === 0, missing };
}

function productKey(row) {
  const brand = clean(row['品牌名称']);
  const primaryBarcode = cleanCode(clean(row['条码']).split('#')[0]);
  return `${brand}\u0000${primaryBarcode}`;
}

function buildProductIndex(productRows = []) {
  const byBarcode = new Map();
  const products = [];
  const barcodeConflicts = [];
  for (const row of productRows) {
    const brand = clean(row['品牌名称']);
    const barcodes = clean(row['条码']).split('#').map(cleanCode).filter(Boolean);
    if (!brand || !barcodes.length) continue;
    const product = {
      key: productKey(row),
      brand,
      barcode: barcodes[0],
      barcodes,
      name: clean(row['订单简称']) || clean(row['企业微信申报订单简称']) || clean(row['货品名称（带空格）']),
      sourceName: clean(row['货品名称（带空格）'])
    };
    products.push(product);
    for (const barcode of barcodes) {
      if (byBarcode.has(barcode) && byBarcode.get(barcode).key !== product.key) {
        barcodeConflicts.push({ barcode, products: [byBarcode.get(barcode).name, product.name], brands: [...new Set([byBarcode.get(barcode).brand, product.brand])] });
      } else {
        byBarcode.set(barcode, product);
      }
    }
  }
  return { byBarcode, products, barcodeConflicts };
}

function analyzeDeliveryData({ productRows = [], receiptRows = [] }) {
  const { byBarcode, products, barcodeConflicts } = buildProductIndex(productRows);
  const brandMap = new Map();
  for (const product of products) {
    if (!brandMap.has(product.brand)) brandMap.set(product.brand, { name: product.brand, productCount: 0, rowCount: 0, warehouseCount: 0 });
    brandMap.get(product.brand).productCount += 1;
  }

  const used = new Map();
  const warehousesByBrand = new Map();
  const warehouseMap = new Map();
  const unmatched = [];
  const dataIssues = [];
  const fractionalRows = [];
  for (let index = 0; index < receiptRows.length; index += 1) {
    const row = receiptRows[index];
    const barcode = cleanCode(row['条形码']);
    const warehouse = clean(row['仓库名称']);
    const product = byBarcode.get(barcode);
    if (!product) {
      unmatched.push({ index, barcode, brand: clean(row['品牌名称']), warehouse, name: clean(row['货品名称']) });
      continue;
    }
    const boxSpec = requiredNumber(row['采购规格(箱规数)']);
    const packages = requiredNumber(row['商品实际发货数量']);
    if (!Number.isFinite(boxSpec) || boxSpec <= 0) {
      dataIssues.push({ index, brand: product.brand, warehouse, barcode, type: 'boxSpec', value: row['采购规格(箱规数)'] });
    } else if (!Number.isFinite(packages) || packages < 0) {
      dataIssues.push({ index, brand: product.brand, warehouse, barcode, type: 'packages', value: row['商品实际发货数量'] });
    } else if (Math.abs(packages / boxSpec - Math.round(packages / boxSpec)) > 1e-9) {
      fractionalRows.push({ index, brand: product.brand, warehouse, barcode, boxes: packages / boxSpec });
    }
    if (!used.has(product.key)) used.set(product.key, { ...product, rowCount: 0, warehouses: new Set() });
    const entry = used.get(product.key);
    entry.rowCount += 1;
    entry.warehouses.add(warehouse);
    if (!warehousesByBrand.has(product.brand)) warehousesByBrand.set(product.brand, new Set());
    warehousesByBrand.get(product.brand).add(warehouse);
    if (warehouse) {
      if (!warehouseMap.has(warehouse)) warehouseMap.set(warehouse, { name: warehouse, rowCount: 0, brandRows: new Map() });
      const warehouseEntry = warehouseMap.get(warehouse);
      warehouseEntry.rowCount += 1;
      warehouseEntry.brandRows.set(product.brand, (warehouseEntry.brandRows.get(product.brand) || 0) + 1);
    }
    if (!brandMap.has(product.brand)) brandMap.set(product.brand, { name: product.brand, productCount: 0, rowCount: 0, warehouseCount: 0 });
    brandMap.get(product.brand).rowCount += 1;
  }

  for (const [brand, value] of brandMap) value.warehouseCount = warehousesByBrand.get(brand)?.size || 0;
  const usedProducts = [...used.values()].map((item) => ({ ...item, warehouses: [...item.warehouses].filter(Boolean) }))
    .sort((a, b) => a.brand.localeCompare(b.brand, 'zh-CN') || a.name.localeCompare(b.name, 'zh-CN'));
  const brands = [...brandMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  const warehouses = [...warehouseMap.values()].map((item) => ({
    name: item.name,
    rowCount: item.rowCount,
    brands: [...item.brandRows].map(([name, rowCount]) => ({ name, rowCount }))
  })).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  return {
    brands,
    warehouses,
    products: usedProducts,
    unmatched,
    barcodeConflicts,
    dataIssues,
    fractionalRows,
    stats: {
      productRows: productRows.length,
      receiptRows: receiptRows.length,
      matchedRows: receiptRows.length - unmatched.length,
      unmatchedRows: unmatched.length,
      usedProducts: usedProducts.length,
      warehouses: new Set(usedProducts.flatMap((item) => item.warehouses)).size,
      fractionalBoxes: fractionalRows.length
    }
  };
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value.getTime());
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(Date.UTC(1899, 11, 30) + value * 86400000);
  }
  const match = clean(value).match(/^(\d{4})[-\/]?(\d{1,2})[-\/]?(\d{1,2})/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function safeSheetName(name, existing = new Set()) {
  const base = clean(name).replace(/[\\/*?:\[\]]/g, '_').slice(0, 31) || '送货单';
  let candidate = base;
  let index = 2;
  while (existing.has(candidate)) {
    const suffix = `-${index}`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    index += 1;
  }
  existing.add(candidate);
  return candidate;
}

function normalizeShelfLife(value) {
  const text = clean(value);
  if (!text) return '';
  return /天$/.test(text) ? text : `${text}天`;
}

function cloneStyle(value) {
  return value ? JSON.parse(JSON.stringify(value)) : {};
}

function copyTemplateStructure(target, source) {
  target.pageSetup = cloneStyle(source.pageSetup);
  target.properties = cloneStyle(source.properties);
  target.views = cloneStyle(source.views);
  for (let column = 1; column <= 10; column += 1) {
    const sourceColumn = source.getColumn(column);
    const targetColumn = target.getColumn(column);
    targetColumn.width = sourceColumn.width;
    targetColumn.hidden = sourceColumn.hidden;
    targetColumn.style = cloneStyle(sourceColumn.style);
  }
  for (let rowNumber = 1; rowNumber <= 4; rowNumber += 1) {
    const sourceRow = source.getRow(rowNumber);
    const targetRow = target.getRow(rowNumber);
    targetRow.height = sourceRow.height;
    for (let column = 1; column <= 10; column += 1) {
      const sourceCell = sourceRow.getCell(column);
      const targetCell = targetRow.getCell(column);
      targetCell.style = cloneStyle(sourceCell.style);
    }
  }
  target.mergeCells('A1:J1');
  target.mergeCells('A2:J2');
}

function applyDataStyle(targetRow, templateRow) {
  targetRow.height = templateRow.height;
  for (let column = 1; column <= 10; column += 1) {
    targetRow.getCell(column).style = cloneStyle(templateRow.getCell(column).style);
  }
}

function groupLinesByWarehouse(receiptRows, productIndex, selectedBrand) {
  const warehouses = new Map();
  for (let index = 0; index < receiptRows.length; index += 1) {
    const source = receiptRows[index];
    const product = productIndex.get(cleanCode(source['条形码']));
    if (!product || product.brand !== selectedBrand) continue;
    const warehouse = clean(source['仓库名称']);
    if (!warehouse) continue;
    if (!warehouses.has(warehouse)) warehouses.set(warehouse, []);
    warehouses.get(warehouse).push({ source, product, sourceIndex: index });
  }

  for (const [warehouse, lines] of warehouses) {
    const groups = new Map();
    for (const line of lines) {
      const lbx = clean(line.source['LBX号']);
      const groupKey = lbx || ('__empty_' + line.sourceIndex);
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey).push(line);
    }
    warehouses.set(warehouse, [...groups.values()].flat());
  }
  return warehouses;
}

async function buildDeliveryWorkbooks({
  templatePath,
  productRows = [],
  receiptRows = [],
  brands = [],
  productionDates = {},
  shelfLife = '',
  contact = '',
  supplierName = '湖北国宝桥米有限公司'
}) {
  const { byBarcode } = buildProductIndex(productRows);
  const templateWorkbook = new ExcelJS.Workbook();
  await templateWorkbook.xlsx.readFile(templatePath);
  const templateSheet = templateWorkbook.worksheets[0];
  if (!templateSheet) throw new Error('DeliveryNote 模板中没有工作表。');

  const results = [];
  for (const brand of brands) {
    const warehouses = groupLinesByWarehouse(receiptRows, byBarcode, brand);
    if (!warehouses.size) continue;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = '仓配订单汇总工具';
    workbook.created = new Date();
    const existingNames = new Set();
    let totalRows = 0;
    let fractionalBoxes = 0;

    for (const [warehouse, lines] of warehouses) {
      const sheet = workbook.addWorksheet(safeSheetName(warehouse, existingNames));
      copyTemplateStructure(sheet, templateSheet);
      const supplierCode = clean(lines[0]?.source['供应商编码']);
      sheet.getCell('A1').value = `商家送货清单-${warehouse}`;
      sheet.getCell('A2').value = `供应商名称：${clean(supplierName)} 商家编码：${supplierCode}`;
      const headers = ['送货日期', '物流宝单号', '商品条码', '商品名称', '规格', '包数', '箱数', '生产日期或生产批号', '保质期', '联系方式'];
      headers.forEach((header, index) => { sheet.getCell(3, index + 1).value = header; });

      const mergeRuns = [];
      let currentLbx = null;
      let runStart = 4;
      lines.forEach((line, lineIndex) => {
        const rowNumber = lineIndex + 4;
        const row = sheet.getRow(rowNumber);
        const source = line.source;
        const boxSpec = requiredNumber(source['采购规格(箱规数)']);
        const packages = requiredNumber(source['商品实际发货数量']);
        if (!Number.isFinite(boxSpec) || boxSpec <= 0) throw new Error(`第 ${line.sourceIndex + 2} 条 ReceiptNote 明细的箱规无效。`);
        if (!Number.isFinite(packages) || packages < 0) throw new Error(`第 ${line.sourceIndex + 2} 条 ReceiptNote 明细的实际发货数量无效。`);
        const boxes = packages / boxSpec;
        const isFractional = Math.abs(boxes - Math.round(boxes)) > 1e-9;
        const deliveryDate = parseDate(source['预约入库时间']) || parseDate(source['期望到货时间']);
        const productionDate = parseDate(productionDates[line.product.key]);
        const lbx = clean(source['LBX号']);
        const barcode = cleanCode(source['条形码']);
        row.values = [deliveryDate || '', lbx, barcode, line.product.name, boxSpec, packages, boxes, productionDate || '', normalizeShelfLife(shelfLife), clean(contact)];
        applyDataStyle(row, templateSheet.getRow(4));
        row.getCell(1).numFmt = 'yyyy-mm-dd';
        row.getCell(3).numFmt = '@';
        row.getCell(8).numFmt = 'yyyy-mm-dd';
        row.getCell(10).numFmt = '@';
        if (isFractional) {
          row.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD7D5' } };
          row.getCell(7).font = { ...cloneStyle(row.getCell(7).font), color: { argb: 'FF9F1D1D' }, bold: true };
          fractionalBoxes += 1;
        }
        if (currentLbx === null) {
          currentLbx = lbx;
          runStart = rowNumber;
        } else if (lbx !== currentLbx) {
          if (currentLbx && rowNumber - 1 > runStart) mergeRuns.push([runStart, rowNumber - 1]);
          currentLbx = lbx;
          runStart = rowNumber;
        }
      });
      const lastRow = lines.length + 3;
      if (currentLbx && lastRow > runStart) mergeRuns.push([runStart, lastRow]);
      for (const [start, end] of mergeRuns) {
        sheet.mergeCells(start, 2, end, 2);
        sheet.getCell(start, 2).alignment = { ...cloneStyle(sheet.getCell(start, 2).alignment), vertical: 'middle', horizontal: 'center', wrapText: true };
      }
      sheet.pageSetup.printArea = `A1:J${Math.max(3, lastRow)}`;
      sheet.pageSetup.fitToPage = true;
      sheet.pageSetup.fitToWidth = 1;
      sheet.pageSetup.fitToHeight = 1;
      totalRows += lines.length;
    }
    results.push({ brand, workbook, totalRows, warehouseCount: warehouses.size, fractionalBoxes });
  }
  return results;
}

async function buildDeliveryExports(options) {
  if (!options.splitByWarehouse) return buildDeliveryWorkbooks(options);
  const productIndex = buildProductIndex(options.productRows || []).byBarcode;
  const receiptRows = options.receiptRows || [];
  const results = [];
  for (const brand of options.brands || []) {
    const brandRows = receiptRows.filter((row) => productIndex.get(cleanCode(row['条形码']))?.brand === brand);
    const warehouses = [...new Set(brandRows.map((row) => clean(row['仓库名称'])).filter(Boolean))];
    for (const warehouse of warehouses) {
      const warehouseRows = brandRows.filter((row) => clean(row['仓库名称']) === warehouse);
      const [build] = await buildDeliveryWorkbooks({ ...options, receiptRows: warehouseRows, brands: [brand], splitByWarehouse: false });
      if (build) results.push({ ...build, warehouse });
    }
  }
  return results;
}
module.exports = {
  PRODUCT_REQUIRED,
  RECEIPT_REQUIRED,
  clean,
  cleanCode,
  validateDeliveryTable,
  productKey,
  buildProductIndex,
  analyzeDeliveryData,
  parseDate,
  safeSheetName,
  buildDeliveryWorkbooks,
  buildDeliveryExports
};