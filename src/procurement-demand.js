'use strict';

const path = require('node:path');
const ExcelJS = require('exceljs');
const { cleanText, numberValue, parseSpec } = require('./core');

const DEFAULT_FACTORIES = [
  { region: '华东', factory: '宏禾米厂' },
  { region: '华南', factory: '腾三龙米厂' },
  { region: '华西', factory: '正点米厂' },
  { region: '华中', factory: '青龙米厂' }
];

const PRESET_FACTORIES = ['宏禾米厂', '腾三龙米厂', '正点米厂', '青龙米厂', '京山工厂'];

function suggestFactory(warehouse) {
  const clean = cleanText(warehouse);
  for (const item of DEFAULT_FACTORIES) {
    if (clean.startsWith(item.region)) return item.factory;
  }
  return '京山工厂';
}

function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(dateStr, days = 1) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

function normalizeKey(str) {
  return cleanText(str).replace(/\s+/g, '').toLowerCase();
}

function buildProductCatalogFromRows(rows = []) {
  const catalog = new Map();
  for (const row of rows) {
    const fullName = cleanText(row['货品名称（带空格）'] || row['货品名称']);
    const barcode = cleanText(row['条码'] || row['条形码']);
    const brand = cleanText(row['品牌名称']);
    const spec = numberValue(row['规格kg'] || row['规格']) || (fullName ? parseSpec(fullName).spec : 0);
    const shortName = cleanText(row['订单简称'] || row['企业微信申报订单简称'] || fullName);

    if (!fullName && !barcode) continue;
    const primaryBarcode = barcode.split('#')[0].trim();
    const item = {
      fullName,
      barcode,
      primaryBarcode,
      allBarcodes: barcode,
      brand,
      spec,
      shortName: shortName || fullName
    };

    if (fullName) catalog.set(normalizeKey(fullName), item);
    if (shortName) catalog.set(normalizeKey(shortName), item);
    if (barcode) {
      barcode.split('#').forEach((b) => {
        const cb = b.trim();
        if (cb) catalog.set(normalizeKey(cb), item);
      });
    }
  }
  return catalog;
}

async function loadProductCatalog(templatePathOrRows) {
  if (Array.isArray(templatePathOrRows)) {
    return buildProductCatalogFromRows(templatePathOrRows);
  }
  const targetPath = templatePathOrRows || path.join(__dirname, 'templates', 'product.xlsx');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(targetPath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return new Map();

  const headers = new Map();
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    const text = cleanText(cell.text || cell.value);
    if (text) headers.set(text, col);
  });

  const nameCol = headers.get('货品名称（带空格）') || headers.get('货品名称');
  const barcodeCol = headers.get('条码') || headers.get('条形码');
  const brandCol = headers.get('品牌名称');
  const specCol = headers.get('规格kg') || headers.get('规格');
  const shortNameCol = headers.get('订单简称') || headers.get('企业微信申报订单简称');

  const rows = [];
  for (let r = 2; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const fullName = cleanText(row.getCell(nameCol).text || row.getCell(nameCol).value);
    const barcode = cleanText(row.getCell(barcodeCol).text || row.getCell(barcodeCol).value);
    const brand = cleanText(row.getCell(brandCol).text || row.getCell(brandCol).value);
    const spec = numberValue(row.getCell(specCol).value);
    const shortName = cleanText(row.getCell(shortNameCol).text || row.getCell(shortNameCol).value);

    if (!fullName && !barcode) continue;
    rows.push({
      '货品名称（带空格）': fullName,
      '条码': barcode,
      '品牌名称': brand,
      '规格kg': spec,
      '订单简称': shortName
    });
  }
  return buildProductCatalogFromRows(rows);
}

function matchProduct(catalog, productName, barcode) {
  if (!catalog) return null;
  if (barcode) {
    const bKey = normalizeKey(barcode);
    if (catalog.has(bKey)) return catalog.get(bKey);
  }
  if (!productName) return null;
  const key = normalizeKey(productName);
  if (catalog.has(key)) return catalog.get(key);

  for (const [k, item] of catalog.entries()) {
    if (key.includes(k) || k.includes(key)) return item;
  }
  return null;
}

function extractDemandItems({ rows = [], catalog = new Map(), warehouseConfigs = {} }) {
  const map = new Map();
  for (const row of rows) {
    const qty = Math.round(numberValue(row.actualOrder ?? row['实际订单安排'] ?? row.demandQuantity ?? row['需求数量'] ?? row['商品实际发货数量']));
    if (qty <= 0) continue;

    const warehouse = cleanText(row.warehouse || row['仓库名称']);
    const rawProductName = cleanText(row.product || row['货品名称']);
    if (!warehouse || !rawProductName) continue;

    const rawBarcode = cleanText(row.barcode || row['条形码'] || row['条码']);
    const matched = matchProduct(catalog, rawProductName, rawBarcode);
    const config = warehouseConfigs[warehouse] || {};
    const spec = (matched && typeof matched.spec === 'number' && matched.spec > 0)
      ? matched.spec
      : (numberValue(row.spec || row['规格'] || row['规格kg']) || (parseSpec(rawProductName)?.spec || 0));
    const barcode = matched?.barcode || matched?.allBarcodes || rawBarcode || '';
    const shortName = matched?.shortName || rawProductName;
    const brand = matched?.brand || cleanText(row.brand || row['品牌名称'] || row['备注']);
    const factory = config.factory || suggestFactory(warehouse);
    const pickupDate = config.pickupDate || '';
    const inboundDate = config.inboundDate || cleanText(row.inboundDate || row['预约入库时间'] || (pickupDate ? addDays(pickupDate, 1) : ''));

    const key = `${warehouse}\u0000${barcode || shortName}`;
    if (!map.has(key)) {
      map.set(key, {
        warehouse,
        barcode,
        productName: shortName,
        rawProductName,
        spec,
        quantity: 0,
        weight: 0,
        brand,
        factory,
        pickupDate,
        inboundDate
      });
    }
    const item = map.get(key);
    item.quantity += qty;
    if (!item.inboundDate && inboundDate) item.inboundDate = inboundDate;
    if (!item.pickupDate && pickupDate) item.pickupDate = pickupDate;
    if (!item.brand && brand) item.brand = brand;
  }

  for (const item of map.values()) {
    item.weight = Math.round(((item.quantity * item.spec) / 1000) * 10000) / 10000;
  }

  return [...map.values()];
}

async function buildDemandWorkbook({
  items = [],
  title = '',
  year = new Date().getFullYear()
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '仓配订单汇总工具';
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.calcProperties.forceFullCalc = true;

  const sheetTitle = title || `国宝 采购需求一览表${year}年`;
  const sheet = workbook.addWorksheet('采购需求一览表', {
    views: [{ state: 'frozen', ySplit: 2 }]
  });

  // 标题行
  sheet.mergeCells('A1:J1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = sheetTitle;
  titleCell.font = { name: 'Microsoft YaHei', size: 14, bold: true, color: { argb: 'FF18211E' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 36;

  // 表头行
  const headers = [
    '*需求平台/仓*',
    '条形码',
    '*商品名称*',
    '*规格*\n（kg）',
    '*需求数量*',
    '*总重量*',
    '备注',
    '*发货地址*\n(京山/外采）',
    '提货时间',
    '入仓时间'
  ];
  sheet.addRow(headers);
  const headerRow = sheet.getRow(2);
  headerRow.height = 32;
  headerRow.font = { name: 'Microsoft YaHei', bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF244F45' } };

  const widths = [26, 26, 32, 12, 14, 14, 14, 22, 16, 16];
  sheet.columns.forEach((column, index) => {
    column.width = widths[index];
  });

  // 按仓库分组
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.warehouse)) groups.set(item.warehouse, []);
    groups.get(item.warehouse).push(item);
  }

  const borderStyle = {
    top: { style: 'thin', color: { argb: 'FFD9E0DC' } },
    bottom: { style: 'thin', color: { argb: 'FFD9E0DC' } },
    left: { style: 'thin', color: { argb: 'FFD9E0DC' } },
    right: { style: 'thin', color: { argb: 'FFD9E0DC' } }
  };

  for (const [warehouse, list] of groups) {
    const startRow = sheet.rowCount + 1;
    let whTotalQty = 0;
    let whTotalWeight = 0;

    for (const item of list) {
      whTotalQty += item.quantity;
      whTotalWeight += item.weight;

      const detailRow = sheet.addRow([
        item.warehouse,
        String(item.barcode || ''),
        item.productName,
        item.spec,
        item.quantity,
        '',
        item.brand,
        item.factory,
        item.pickupDate,
        item.inboundDate
      ]);

      const n = detailRow.number;
      detailRow.getCell(6).value = { formula: `E${n}*D${n}/1000`, result: item.weight };
      detailRow.getCell(2).numFmt = '@'; // 文本格式保存条形码
      detailRow.getCell(5).numFmt = '#,##0';
      detailRow.getCell(6).numFmt = '0.0000';
      detailRow.height = 24;
      detailRow.alignment = { vertical: 'middle' };
      detailRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
      detailRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
      detailRow.getCell(4).alignment = { vertical: 'middle', horizontal: 'right' };
      detailRow.getCell(5).alignment = { vertical: 'middle', horizontal: 'right' };
      detailRow.getCell(6).alignment = { vertical: 'middle', horizontal: 'right' };
      detailRow.getCell(9).alignment = { vertical: 'middle', horizontal: 'center' };
      detailRow.getCell(10).alignment = { vertical: 'middle', horizontal: 'center' };

      detailRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = borderStyle;
        cell.font = { name: 'Microsoft YaHei', size: 10 };
      });
    }

    const endRow = sheet.rowCount;
    // 仓库汇总行
    const summaryRow = sheet.addRow([
      `${warehouse} 汇总`,
      '',
      '',
      '',
      { formula: `SUM(E${startRow}:E${endRow})`, result: whTotalQty },
      { formula: `SUM(F${startRow}:F${endRow})`, result: Math.round(whTotalWeight * 10000) / 10000 },
      '',
      '',
      '',
      ''
    ]);

    summaryRow.height = 25;
    summaryRow.font = { name: 'Microsoft YaHei', bold: true, color: { argb: 'FF18372F' }, size: 10 };
    summaryRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4EEE9' } };
    summaryRow.alignment = { vertical: 'middle' };
    summaryRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    summaryRow.getCell(5).alignment = { vertical: 'middle', horizontal: 'right' };
    summaryRow.getCell(6).alignment = { vertical: 'middle', horizontal: 'right' };
    summaryRow.getCell(5).numFmt = '#,##0';
    summaryRow.getCell(6).numFmt = '0.0000';

    summaryRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFB9D5CB' } },
        bottom: { style: 'medium', color: { argb: 'FF245F50' } },
        left: { style: 'thin', color: { argb: 'FFD9E0DC' } },
        right: { style: 'thin', color: { argb: 'FFD9E0DC' } }
      };
    });
  }

  return workbook;
}

async function parseReceiptNoteForDemand(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const rows = [];
  const brands = new Set();

  if (ext === '.csv') {
    const fs = require('node:fs');
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split(/\r?\n/).filter(Boolean);
    if (!lines.length) throw new Error('CSV 文件内容为空。');
    const headers = lines[0].split(',').map((h) => cleanText(h));
    const whCol = headers.findIndex((h) => h === '仓库名称' || h === '物理仓名称');
    const prodCol = headers.findIndex((h) => h === '货品名称');
    const barcodeCol = headers.findIndex((h) => h === '条形码' || h === '条码');
    const brandCol = headers.findIndex((h) => h === '品牌名称');
    const qtyCol = headers.findIndex((h) => h.includes('商品实际发货数量') || h === '发货数量');
    const dateCol = headers.findIndex((h) => h.includes('预约入库时间') || h.includes('期望到货时间'));

    if (whCol === -1 || qtyCol === -1) {
      throw new Error('未识别到包含“仓库名称”和“商品实际发货数量”的入库单/发货单格式。');
    }

    const groups = new Map();
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      const warehouse = cleanText(parts[whCol]);
      const product = prodCol !== -1 ? cleanText(parts[prodCol]) : '';
      const barcode = barcodeCol !== -1 ? cleanText(parts[barcodeCol]) : '';
      const brand = brandCol !== -1 ? cleanText(parts[brandCol]) : '';
      const qty = numberValue(parts[qtyCol]);
      let inboundDate = '';
      if (dateCol !== -1 && parts[dateCol]) {
        inboundDate = cleanText(parts[dateCol]).split(' ')[0];
      }

      if (!warehouse || qty <= 0) continue;
      if (brand) brands.add(brand);

      const key = `${warehouse}\u0000${barcode || product}`;
      if (!groups.has(key)) {
        groups.set(key, { warehouse, product, barcode, brand, actualOrder: 0, inboundDate });
      }
      const item = groups.get(key);
      item.actualOrder += qty;
      if (!item.inboundDate && inboundDate) item.inboundDate = inboundDate;
      if (!item.brand && brand) item.brand = brand;
    }
    return { rows: [...groups.values()], brands: [...brands], fileName: path.basename(filePath) };
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets.find((sheet) => {
    const map = new Map();
    sheet.getRow(1).eachCell({ includeEmpty: true }, (c, col) => map.set(cleanText(c.text || c.value), col));
    return (map.has('仓库名称') || map.has('物理仓名称')) && (map.has('商品实际发货数量') || map.has('发货数量'));
  }) || workbook.worksheets[0];

  if (!worksheet) throw new Error('未识别到有效的入库单/发货单工作表。');

  const headers = new Map();
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (c, col) => {
    const text = cleanText(c.text || c.value);
    if (text) headers.set(text, col);
  });

  const whCol = headers.get('仓库名称') || headers.get('物理仓名称');
  const prodCol = headers.get('货品名称');
  const barcodeCol = headers.get('条形码') || headers.get('条码');
  const brandCol = headers.get('品牌名称');
  const qtyCol = headers.get('商品实际发货数量') || headers.get('发货数量');
  const dateCol = headers.get('预约入库时间') || headers.get('期望到货时间');

  if (!whCol || !qtyCol) {
    throw new Error('未识别到包含“仓库名称”和“商品实际发货数量”的入库单/发货单格式。');
  }

  const groups = new Map();
  for (let r = 2; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const warehouse = cleanText(row.getCell(whCol).text || row.getCell(whCol).value);
    const product = prodCol ? cleanText(row.getCell(prodCol).text || row.getCell(prodCol).value) : '';
    const barcode = barcodeCol ? cleanText(row.getCell(barcodeCol).text || row.getCell(barcodeCol).value) : '';
    const brand = brandCol ? cleanText(row.getCell(brandCol).text || row.getCell(brandCol).value) : '';
    const qty = numberValue(row.getCell(qtyCol).value);

    let inboundDate = '';
    if (dateCol) {
      const dateVal = row.getCell(dateCol).value;
      if (dateVal instanceof Date) {
        inboundDate = formatDate(dateVal);
      } else if (dateVal) {
        inboundDate = cleanText(dateVal).split(' ')[0];
      }
    }

    if (!warehouse || qty <= 0) continue;
    if (brand) brands.add(brand);

    const key = `${warehouse}\u0000${barcode || product}`;
    if (!groups.has(key)) {
      groups.set(key, { warehouse, product, barcode, brand, actualOrder: 0, inboundDate });
    }
    const item = groups.get(key);
    item.actualOrder += qty;
    if (!item.inboundDate && inboundDate) item.inboundDate = inboundDate;
    if (!item.brand && brand) item.brand = brand;
  }

  return { rows: [...groups.values()], brands: [...brands], fileName: path.basename(filePath) };
}

async function parseTable3ForDemand(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets.find(
    (s) => !s.name.startsWith('__') && s.getRow(1).getCell(1).text.includes('仓库')
  ) || workbook.worksheets[0];

  if (!sheet) throw new Error('未能识别到有效的表三工作表。');

  const headers = new Map();
  sheet.getRow(1).eachCell({ includeEmpty: true }, (c, col) => {
    const text = cleanText(c.text || c.value);
    if (text) headers.set(text, col);
  });

  const whCol = headers.get('仓库名称');
  const prodCol = headers.get('货品名称');
  const brandCol = headers.get('品牌名称');
  const specCol = headers.get('规格');
  const actCol = headers.get('实际订单安排');

  if (!whCol || !prodCol || !actCol) {
    throw new Error('表三缺少仓库名称、货品名称或实际订单安排列。');
  }

  const rows = [];
  const brands = new Set();
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const wh = cleanText(row.getCell(whCol).text || row.getCell(whCol).value);
    const prod = cleanText(row.getCell(prodCol).text || row.getCell(prodCol).value);
    if (!prod || wh.endsWith('汇总')) continue;

    const valCell = row.getCell(actCol);
    let val = valCell.value;
    if (val && typeof val === 'object' && 'result' in val) val = val.result;
    const actualOrder = numberValue(val);
    const brand = brandCol ? cleanText(row.getCell(brandCol).text || row.getCell(brandCol).value) : '';
    if (brand) brands.add(brand);

    if (actualOrder > 0) {
      rows.push({
        warehouse: wh,
        product: prod,
        brand,
        spec: specCol ? numberValue(row.getCell(specCol).value) : 0,
        actualOrder
      });
    }
  }
  return { rows, brands: [...brands], fileName: path.basename(filePath) };
}

module.exports = {
  DEFAULT_FACTORIES,
  PRESET_FACTORIES,
  suggestFactory,
  formatDate,
  addDays,
  buildProductCatalogFromRows,
  loadProductCatalog,
  matchProduct,
  extractDemandItems,
  buildDemandWorkbook,
  parseReceiptNoteForDemand,
  parseTable3ForDemand
};
