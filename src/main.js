'use strict';

const { app, BrowserWindow, dialog, ipcMain } = require('electron');

app.disableHardwareAcceleration();
const path = require('node:path');
const fs = require('node:fs');
const ExcelJS = require('exceljs');
const { cleanText, numberValue, parseSpec, orderHeader, validateTable, getBrands, collectMappingRows, aggregate } = require('./core');
const { detailFormulaValues, summaryFormulaValues } = require('./excel-formulas');
const { validateDeliveryTable, analyzeDeliveryData, buildProductIndex, cleanCode, buildDeliveryExports } = require('./delivery-note');
const { addBackfillTask, analyzeBackfillFile, writeBackfillFiles } = require('./backfill');
const { analyzeInventoryUpdate, inspectWorkbook, writeInventoryUpdate } = require('./inventory-update');
const {
  PRESET_FACTORIES,
  suggestFactory,
  formatDate,
  addDays,
  loadProductCatalog,
  matchProduct,
  extractDemandItems,
  buildDemandWorkbook,
  parseReceiptNoteForDemand,
  parseTable3ForDemand
} = require('./procurement-demand');
const {
  loadProductPreset,
  saveProductPreset,
  resetProductPreset,
  importProductPreset
} = require('./product-preset');
const {
  loadWarehousePreset,
  saveWarehousePreset,
  resetWarehousePreset,
  importWarehousePresetFromFile,
  matchWarehouseFactory
} = require('./warehouse-preset');
const {
  DEFAULT_INVOICE_CONFIG,
  parseReconciliationFiles,
  calculateInvoiceSummary,
  exportInvoiceNotificationWorkbook,
  formatTodayDate
} = require('./invoice-summary');
const {
  DEFAULT_FEE_CATEGORY_REMARKS,
  parsePlatformFeeFile,
  calculatePlatformFeeSummary,
  exportPlatformFeeExcel
} = require('./platform-fee');

let mainWindow;
const smokeTest = process.env.EXCEL_TOOL_SMOKE_TEST === '1';

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

async function readWorkbook(filePath, type) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const candidates = workbook.worksheets.map(sheetPayload);
  const selected = candidates.find((candidate) => validateTable(candidate, type).valid);
  if (!selected) {
    const validation = validateTable(candidates[0] || { headers: [] }, type);
    throw new Error(`没有找到符合${type === 'table1' ? '表一' : '表二'}格式的工作表。缺少字段：${validation.missing.join('、')}`);
  }
  if (type === 'table1') {
    const systemOrderHeader = orderHeader(selected.headers);
    selected.rows = selected.rows.map((row) => ({ ...row, __systemOrder: row[systemOrderHeader] }));
    selected.orderHeader = systemOrderHeader;
    selected.resultOrderHeader = systemOrderHeader === '采购数量' ? '系统订单' : systemOrderHeader;
  }
  selected.filePath = filePath;
  selected.fileName = path.basename(filePath);
  return selected;
}

async function readDeliveryWorkbook(filePath, type) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const candidates = workbook.worksheets.map(sheetPayload);
  const selected = candidates.find((candidate) => validateDeliveryTable(candidate, type).valid);
  if (!selected) {
    const validation = validateDeliveryTable(candidates[0] || { headers: [] }, type);
    const label = type === 'product' ? 'product 商品表' : 'ReceiptNote 入库明细';
    throw new Error(`没有找到符合 ${label} 格式的工作表。缺少字段：${validation.missing.join('、')}`);
  }
  selected.filePath = filePath;
  selected.fileName = path.basename(filePath);
  return selected;
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#f3f5f3',
    autoHideMenuBar: true,
    show: !smokeTest,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.webContents.on('console-message', (e, level, message, line, sourceId) => { console.log('RENDERER_CONSOLE:', message, 'line:', line ?? e?.lineNumber, 'source:', sourceId ?? e?.sourceId); });
  const distIndex = path.join(__dirname, 'renderer', 'dist', 'index.html');
  if (fs.existsSync(distIndex)) {
    mainWindow.loadFile(distIndex);
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  }
  if (smokeTest) {
    mainWindow.webContents.once('did-finish-load', async () => {
      const targetView = process.env.EXCEL_TOOL_SMOKE_VIEW || 'summary';
      const smokeWidth = Number(process.env.EXCEL_TOOL_SMOKE_WIDTH || 0);
      await new Promise((resolve) => setTimeout(resolve, 350));
      await mainWindow.webContents.executeJavaScript(`(() => {
        if ('${targetView}' === 'delivery' || '${targetView}' === 'preset' || '${targetView}' === 'whPreset') document.getElementById('deliveryTab')?.click();
        if ('${targetView}' === 'inventory') document.getElementById('inventoryTab')?.click();
        if ('${targetView}' === 'invoice') document.getElementById('invoiceTab')?.click();
      })()`);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await mainWindow.webContents.executeJavaScript(`(() => {
        if ('${targetView}' === 'preset') document.getElementById('manageProductPresetBtn')?.click();
        if ('${targetView}' === 'whPreset') document.getElementById('manageWarehousePresetBtn')?.click();
      })()`);
      await new Promise((resolve) => setTimeout(resolve, 200));
      const result = await mainWindow.webContents.executeJavaScript(`(() => {
        const el = document.getElementById('productPresetDialog');
        const rect = el ? el.getBoundingClientRect() : null;
        const style = el ? window.getComputedStyle(el) : null;
        return {
          title: document.title,
          presetVisible: Boolean(el),
          rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
          display: style?.display,
          opacity: style?.opacity,
          zIndex: style?.zIndex,
          parent: el?.parentElement?.tagName
        };
      })()`);
      console.log('SMOKE_TEST', JSON.stringify(result));
      if (process.env.EXCEL_TOOL_SMOKE_SCREENSHOT === '1') {
        await new Promise((resolve) => setTimeout(resolve, 180));
        const image = await mainWindow.webContents.capturePage();
        const screenshotPath = process.env.EXCEL_TOOL_SMOKE_SCREENSHOT_PATH || path.join(process.cwd(), 'smoke-test.png');
        fs.writeFileSync(screenshotPath, image.toPNG());
      }
      app.quit();
    });
  }
}

ipcMain.handle('excel:open', async (_event, type, directFilePath) => {
  if (directFilePath && fs.existsSync(directFilePath)) {
    return readWorkbook(directFilePath, type);
  }
  if (process.env.EXCEL_TOOL_SMOKE_TEMPLATE2 && type === 'table2') {
    return readWorkbook(process.env.EXCEL_TOOL_SMOKE_TEMPLATE2, 'table2');
  }
  if (process.env.EXCEL_TOOL_SMOKE_TEMPLATE1 && type === 'table1') {
    return readWorkbook(process.env.EXCEL_TOOL_SMOKE_TEMPLATE1, 'table1');
  }
  const result = await dialog.showOpenDialog(mainWindow, {
    title: type === 'table1' ? '选择表一（订单数据）' : '选择表二（库存数据）',
    properties: ['openFile'],
    filters: [{ name: 'Excel 工作簿', extensions: ['xlsx', 'xlsm'] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return readWorkbook(result.filePaths[0], type);
});

ipcMain.handle('delivery:open', async (_event, type, directFilePath) => {
  const isProduct = type === 'product';
  if (directFilePath && fs.existsSync(directFilePath)) {
    return readDeliveryWorkbook(directFilePath, isProduct ? 'product' : 'receipt');
  }
  const result = await dialog.showOpenDialog(mainWindow, {
    title: isProduct ? '选择 product 商品表' : '选择 ReceiptNote 入库明细',
    properties: ['openFile'],
    filters: [{ name: 'Excel 工作簿', extensions: ['xlsx', 'xlsm'] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return readDeliveryWorkbook(result.filePaths[0], isProduct ? 'product' : 'receipt');
});

ipcMain.handle('delivery:analyze', (_event, payload) => {
  const productRows = payload?.productRows || (Array.isArray(payload?.product) ? payload.product : payload?.product?.rows) || [];
  const receiptRows = payload?.receiptRows || payload?.receipt?.rows || [];
  return analyzeDeliveryData({ productRows, receiptRows });
});

ipcMain.handle('delivery:export', async (_event, payload) => {
  const selectedBrands = [...new Set((payload?.brands || payload?.selectedBrands || []).map(cleanText).filter(Boolean))];
  if (!selectedBrands.length) throw new Error('请至少选择一个品牌。');
  if (!cleanText(payload.supplierName)) throw new Error('请填写供应商名称。');
  const shelfLife = Number(cleanText(payload.shelfLife));
  if (!Number.isInteger(shelfLife) || shelfLife <= 0) throw new Error('保质期必须填写正整数天数。');
  if (!cleanText(payload.contact)) throw new Error('请填写联系方式。');

  const selectedWarehouses = [...new Set((payload?.warehouses || payload?.selectedWarehouses || []).map(cleanText).filter(Boolean))];
  if (!selectedWarehouses.length) throw new Error('请至少选择一个仓库。');
  const allReceiptRows = payload?.receiptRows || payload?.receipt?.rows || [];
  const selectedReceiptRows = allReceiptRows.filter((row) => selectedWarehouses.includes(cleanText(row['仓库名称'])));
  const productRows = payload?.productRows || (Array.isArray(payload?.product) ? payload.product : payload?.product?.rows) || [];
  const analysis = analyzeDeliveryData({ productRows, receiptRows: selectedReceiptRows });
  const selectedBarcodes = new Set(selectedReceiptRows.map((row) => cleanCode(row['条形码'])));
  const selectedConflicts = analysis.barcodeConflicts.filter((item) => selectedBarcodes.has(item.barcode) && (item.brands || []).some((brand) => selectedBrands.includes(brand)));
  if (selectedConflicts.length) throw new Error(`选中品牌中有 ${selectedConflicts.length} 个条码对应多个商品，请先修复。`);
  const unmatched = analysis.unmatched.filter((item) => selectedBrands.includes(item.brand));
  if (unmatched.length) throw new Error(`选中品牌中有 ${unmatched.length} 条商品无法匹配 product 表，请先补充商品主数据。`);
  const deliveryProductIndex = buildProductIndex(payload.productRows || []).byBarcode;
  const invalidBoxRows = selectedReceiptRows.filter((row) => {
    const product = deliveryProductIndex.get(cleanCode(row['条形码']));
    const raw = cleanText(row['采购规格(箱规数)']);
    const value = Number(raw);
    return product && selectedBrands.includes(product.brand) && (!raw || !Number.isFinite(value) || value <= 0);
  });
  if (invalidBoxRows.length) throw new Error(`选中品牌中有 ${invalidBoxRows.length} 条明细的箱规为空、非数字或小于等于 0。`);
  const invalidPackageRows = selectedReceiptRows.filter((row) => {
    const product = deliveryProductIndex.get(cleanCode(row['条形码']));
    const raw = cleanText(row['商品实际发货数量']);
    const value = Number(raw);
    return product && selectedBrands.includes(product.brand) && (!raw || !Number.isFinite(value) || value < 0);
  });
  if (invalidPackageRows.length) throw new Error(`选中品牌中有 ${invalidPackageRows.length} 条明细的实际发货数量为空、非数字或小于 0。`);

  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 DeliveryNote 保存文件夹',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const directory = result.filePaths[0];
  const receiptRows = selectedReceiptRows;
  const buildOptions = {
    templatePath: path.join(__dirname, 'templates', 'DeliveryNote.xlsx'),
    productRows: payload.productRows || [],
    productionDates: payload.productionDates || {},
    shelfLife: payload.shelfLife,
    contact: payload.contact,
    supplierName: payload.supplierName
  };
  const builds = await buildDeliveryExports({ ...buildOptions, receiptRows, brands: selectedBrands, splitByWarehouse: Boolean(payload.splitByWarehouse) });
  if (!builds.length) throw new Error('选中的品牌在 ReceiptNote 中没有可生成的明细。');

  const files = [];
  for (const build of builds) {
    const warehouseSuffix = payload.splitByWarehouse && build.warehouse ? '-' + safeFilePart(build.warehouse) : '';
    const filePath = availableFilePath(directory, 'DeliveryNote-' + safeFilePart(build.brand) + warehouseSuffix + '.xlsx');
    await build.workbook.xlsx.writeFile(filePath);
    files.push({
      brand: build.brand,
      warehouse: build.warehouse || '',
      filePath,
      warehouseCount: build.warehouseCount,
      detailRows: build.totalRows,
      fractionalBoxes: build.fractionalBoxes
    });
  }
  return { directory, files, splitByWarehouse: Boolean(payload.splitByWarehouse) };
});
ipcMain.handle('summary:analyze', (_event, payload) => {
  const brands = getBrands(payload.table2Rows || []);
  const inventory = aggregate({ table2Rows: payload.table2Rows || [], brand: payload.brand || brands[0] || '' });
  const mappingRows = collectMappingRows(payload.table1Rows || [], payload.brand || brands[0] || '', inventory.warehouses, payload.mapping || {});
  return { brands, warehouses: inventory.warehouses, mappingRows };
});

ipcMain.handle('summary:compute', (_event, payload) => aggregate(payload));
ipcMain.handle('inventory-update:open', async (_event, type, directPaths) => {
  const isTable3 = type === 'table3';
  const isTransit = type === 'transit';
  let targetPaths = [];
  if (directPaths) {
    targetPaths = (Array.isArray(directPaths) ? directPaths : [directPaths]).filter((p) => p && fs.existsSync(p));
  }
  if (!targetPaths.length) {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: isTable3 ? '选择需要更新的旧表三' : isTransit ? '选择库存在途明细' : '选择实时库存表',
      properties: isTable3 || isTransit ? ['openFile'] : ['openFile', 'multiSelections'],
      filters: [{ name: 'Excel 工作簿', extensions: ['xlsx', 'xlsm'] }]
    });
    if (result.canceled || !result.filePaths.length) return null;
    targetPaths = result.filePaths;
  }
  const files = await Promise.all(targetPaths.map(async (filePath) => ({
    ...(await inspectWorkbook(filePath, isTable3 ? 'table3' : isTransit ? 'transit' : 'inventory')),
    fileName: path.basename(filePath)
  })));
  return isTable3 || isTransit ? files[0] : files;
});
function extractInventoryPayloadPaths(payload) {
  const table3Path = cleanText(payload?.table3Path || payload?.table3?.filePath || (typeof payload?.table3 === 'string' ? payload.table3 : ''));
  const rawInventories = payload?.inventoryPaths || payload?.inventories || [];
  const inventoryPaths = [...new Set(
    (Array.isArray(rawInventories) ? rawInventories : [rawInventories])
      .map((item) => cleanText(item?.filePath || item))
      .filter(Boolean)
  )];
  const transitPath = cleanText(payload?.transitPath || payload?.transit?.filePath || (typeof payload?.transit === 'string' ? payload.transit : ''));
  return { table3Path, inventoryPaths, transitPath };
}

ipcMain.handle('inventory-update:analyze', async (_event, payload) => {
  const { table3Path, inventoryPaths, transitPath } = extractInventoryPayloadPaths(payload);
  if (!table3Path || !fs.existsSync(table3Path)) throw new Error('旧表三不存在，请重新选择文件。');
  if (!inventoryPaths.length && !transitPath) throw new Error('实时库存和库存在途明细请至少选择一种。');
  if (inventoryPaths.some((filePath) => !fs.existsSync(filePath))) throw new Error('部分实时库存表不存在，请重新选择文件。');
  if (transitPath && !fs.existsSync(transitPath)) throw new Error('库存在途明细不存在，请重新选择文件。');
  return analyzeInventoryUpdate(table3Path, inventoryPaths, transitPath);
});

ipcMain.handle('inventory-update:export', async (_event, payload) => {
  const { table3Path, inventoryPaths, transitPath } = extractInventoryPayloadPaths(payload);
  if (!table3Path || !fs.existsSync(table3Path)) throw new Error('旧表三不存在，请重新选择文件。');
  if (!inventoryPaths.length && !transitPath) throw new Error('实时库存和库存在途明细请至少选择一种。');
  if (inventoryPaths.some((filePath) => !fs.existsSync(filePath))) throw new Error('部分实时库存表不存在，请重新选择文件。');
  if (transitPath && !fs.existsSync(transitPath)) throw new Error('库存在途明细不存在，请重新选择文件。');
  const extension = path.extname(table3Path) || '.xlsx';
  const baseName = path.basename(table3Path, extension);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: transitPath ? '导出已更新库存和在途订单的表三' : '导出已更新良品可用的表三',
    defaultPath: `${baseName}-${transitPath ? '库存及在途已更新' : '良品可用已更新'}${extension}`,
    filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
  });
  if (result.canceled || !result.filePath) return null;
  const analysis = await writeInventoryUpdate(table3Path, inventoryPaths, result.filePath, transitPath);
  return { filePath: result.filePath, ...analysis };
});
ipcMain.handle('excel:backfill-open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择已修改实际订单安排的表三',
    properties: ['openFile'],
    filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  let sourceFilePath = '';
  let analysis = await analyzeBackfillFile(filePath);
  if (analysis.needsExternalSource) {
    const sourceResult = await dialog.showOpenDialog(mainWindow, {
      title: '旧版表三：选择对应的订单原表',
      properties: ['openFile'],
      filters: [{ name: 'Excel 工作簿', extensions: ['xlsx', 'xlsm'] }]
    });
    if (sourceResult.canceled || !sourceResult.filePaths[0]) return null;
    sourceFilePath = sourceResult.filePaths[0];
    analysis = await analyzeBackfillFile(filePath, sourceFilePath);
  }
  return {
    filePath,
    fileName: path.basename(filePath),
    sourceFilePath,
    legacy: analysis.legacy,
    taskId: analysis.task.taskId,
    createdAt: analysis.task.createdAt,
    brand: analysis.task.brand,
    sourceFileName: analysis.task.sourceFileName,
    warehouses: analysis.plan.warehouses,
    readyWarehouseCount: analysis.plan.readyWarehouses.length,
    errorCount: analysis.plan.errorCount
  };
});
ipcMain.handle('excel:backfill-export', async (_event, payload) => {
  const filePath = cleanText(payload?.filePath);
  const sourceFilePath = cleanText(payload?.sourceFilePath);
  if (!filePath || !fs.existsSync(filePath)) throw new Error('回传表三不存在，请重新选择文件。');
  if (sourceFilePath && !fs.existsSync(sourceFilePath)) throw new Error('订单原表不存在，请重新选择文件。');
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择分仓补货单保存文件夹',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const directory = result.filePaths[0];
  const output = await writeBackfillFiles(filePath, directory, sourceFilePath);
  if (!output.files.length) throw new Error('没有通过校验的仓库可以导出，请先修正表三中的异常数量。');
  return { directory, ...output };
});
ipcMain.handle('excel:export', async (_event, payload) => {
  const safeBrand = cleanText(payload.brand || '汇总').replace(/[\\/*?:\[\]]/g, '_').slice(0, 31) || '汇总';
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出表三',
    defaultPath: `${safeBrand}-汇总.xlsx`,
    filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
  });
  if (result.canceled || !result.filePath) return null;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = '仓配订单汇总工具';
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.calcProperties.forceFullCalc = true;
  const sheet = workbook.addWorksheet(safeBrand, { views: [{ state: 'frozen', ySplit: 1 }] });
  const headers = [
    '仓库名称', '货品名称', '品牌名称', '货品状态', '规格', '箱规', '高库龄件数', '高周转件数',
    '良品可用', '在库良品非锁定库存件数', '最近1天出库件数', '最近7天出库件数', '最近14天出库件数',
    '最近30天出库件数', payload.orderHeader || '系统订单', '重量', '实际订单安排', '实际重量', '安排状态'
  ];
  sheet.addRow(headers);
  const widths = [28, 64, 14, 12, 10, 10, 13, 13, 13, 20, 15, 15, 16, 16, 15, 12, 16, 12, 24];
  sheet.columns.forEach((column, index) => { column.width = widths[index]; });
  const headerRow = sheet.getRow(1);
  headerRow.height = 32;
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF244F45' } };

  let cursor = 0;
  for (const summary of payload.summaries) {
    const detailStartRow = sheet.rowCount + 1;
    while (cursor < payload.rows.length && payload.rows[cursor].warehouse === summary.warehouse) {
      const row = payload.rows[cursor];
      const excelRow = sheet.addRow([
        row.warehouse, row.product, row.brand, row.status, row.spec, row.boxSpec, row.aged, row.turnover,
        row.availableGood, row.nonLocked, row.out1, row.out7, row.out14, row.out30, row.systemOrder,
        row.weight, row.actualOrder, row.actualWeight, row.arrangement
      ]);
      const formulas = detailFormulaValues(excelRow.number, row);
      excelRow.getCell(16).value = formulas.weight;
      excelRow.getCell(17).value = formulas.actualOrder;
      excelRow.getCell(18).value = formulas.actualWeight;
      excelRow.alignment = { vertical: 'middle' };
      excelRow.getCell(2).alignment = { vertical: 'middle', wrapText: true };
      cursor += 1;
    }
    const detailEndRow = sheet.rowCount;
    const subtotal = sheet.addRow([
      `${summary.warehouse} 汇总`, '', '', '', '', '', '', '', '', '', '', '', '', '',
      summary.systemOrder, summary.weight, summary.actualOrder, summary.actualWeight, summary.arrangement
    ]);
    if (detailEndRow >= detailStartRow) {
      const formulas = summaryFormulaValues(detailStartRow, detailEndRow, summary);
      subtotal.getCell(15).value = formulas.systemOrder;
      subtotal.getCell(16).value = formulas.weight;
      subtotal.getCell(17).value = formulas.actualOrder;
      subtotal.getCell(18).value = formulas.actualWeight;
    }
    subtotal.font = { bold: true, color: { argb: 'FF18372F' } };
    subtotal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4EEE9' } };
  }
  sheet.autoFilter = { from: 'A1', to: `S${sheet.rowCount}` };
  sheet.getColumn(16).numFmt = '0.0000';
  sheet.getColumn(18).numFmt = '0.0000';
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.height = 23;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFD9E0DC' } } };
    });
  });
  const backfillTask = addBackfillTask(workbook, payload);
  await workbook.xlsx.writeFile(result.filePath);
  return { filePath: result.filePath, backfillTask };
});

ipcMain.handle('procurement:get-config', async (_event, payload) => {
  const rows = payload?.rows || [];
  const warehousePreset = await loadWarehousePreset();
  const productPreset = await loadProductPreset();
  const catalog = await loadProductCatalog(productPreset.rows);
  const warehouseMap = new Map();
  for (const r of rows) {
    const wh = cleanText(r.warehouse || r['仓库名称']);
    const qty = numberValue(r.actualOrder ?? r['实际订单安排'] ?? r.demandQuantity ?? r['需求数量'] ?? r['商品实际发货数量']);
    if (!wh || qty <= 0) continue;

    const rawBarcode = cleanText(r.barcode || r['条形码'] || r['条码']);
    const rawProductName = cleanText(r.product || r['货品名称']);
    const matched = matchProduct(catalog, rawProductName, rawBarcode);
    const spec = (matched && typeof matched.spec === 'number' && matched.spec > 0)
      ? matched.spec
      : (numberValue(r.spec || r['规格'] || r['规格kg']) || (parseSpec(rawProductName)?.spec || 0));

    const inboundDate = cleanText(r.inboundDate || r['预约入库时间'] || '');
    const brand = cleanText(r.brand || r['品牌名称']);
    if (!warehouseMap.has(wh)) {
      warehouseMap.set(wh, {
        warehouse: wh,
        products: new Set(),
        itemCount: 0,
        totalQty: 0,
        estimatedWeight: 0,
        factory: matchWarehouseFactory(wh, warehousePreset.rows, brand),
        inboundDate
      });
    }
    const stat = warehouseMap.get(wh);
    const prodKey = matched?.barcode || rawBarcode || rawProductName;
    if (prodKey) stat.products.add(prodKey);
    stat.itemCount = stat.products.size || (stat.itemCount + 1);
    stat.totalQty += qty;
    stat.estimatedWeight += Math.round(((qty * spec) / 1000) * 10000) / 10000;
    if (!stat.inboundDate && inboundDate) stat.inboundDate = inboundDate;
  }

  const today = formatDate(new Date());
  const defaultPickup = addDays(today, 1);
  const defaultInbound = addDays(defaultPickup, 1);

  const warehouses = [...warehouseMap.values()].map((item) => ({
    ...item,
    pickupDate: item.inboundDate ? addDays(item.inboundDate, -1) : defaultPickup,
    inboundDate: item.inboundDate || defaultInbound
  })).sort((a, b) => a.warehouse.localeCompare(b.warehouse, 'zh-CN'));

  const factoryList = [...new Set([
    '宏禾米厂', '腾三龙米厂', '正点米厂', '青龙米厂', '京山工厂',
    ...warehousePreset.rows.map((r) => r.factory).filter(Boolean)
  ])];

  return {
    warehouses,
    presetFactories: factoryList,
    defaultPickupDate: defaultPickup,
    defaultInboundDate: defaultInbound,
    defaultTitle: `国宝 采购需求一览表${new Date().getFullYear()}年`
  };
});

ipcMain.handle('procurement:import-file', async (_event, type) => {
  const isReceipt = type === 'receipt';
  const result = await dialog.showOpenDialog(mainWindow, {
    title: isReceipt ? '选择入库单/发货单明细文件' : '选择已确认的表三文件',
    properties: ['openFile'],
    filters: [
      { name: 'Excel / CSV 文件', extensions: ['xlsx', 'xlsm', 'csv'] }
    ]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const parsed = isReceipt
    ? await parseReceiptNoteForDemand(filePath)
    : await parseTable3ForDemand(filePath);
  return { filePath, ...parsed };
});

ipcMain.handle('procurement:export', async (_event, payload) => {
  const rows = payload?.rows || [];
  const warehouseConfigs = payload?.warehouseConfigs || {};
  const title = cleanText(payload?.title) || `国宝 采购需求一览表${new Date().getFullYear()}年`;
  const defaultFileName = `${title.replace(/[\\/*?:\[\]]/g, '_')}.xlsx`;

  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出采购需求一览表',
    defaultPath: defaultFileName,
    filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
  });
  if (result.canceled || !result.filePath) return null;

  let catalog;
  if (Array.isArray(payload?.productRows) && payload.productRows.length) {
    catalog = await loadProductCatalog(payload.productRows);
  } else {
    const preset = await loadProductPreset();
    catalog = await loadProductCatalog(preset.rows);
  }

  const items = extractDemandItems({ rows, catalog, warehouseConfigs });
  if (!items.length) throw new Error('没有需求数量大于 0 的明细可供导出。');

  const workbook = await buildDemandWorkbook({ items, title });
  await workbook.xlsx.writeFile(result.filePath);

  const warehouseCount = new Set(items.map((i) => i.warehouse)).size;
  return { filePath: result.filePath, warehouseCount, itemCount: items.length };
});

ipcMain.handle('product:get-preset', async () => loadProductPreset());
ipcMain.handle('product:save-preset', async (_event, rows) => saveProductPreset(rows));
ipcMain.handle('product:reset-preset', async () => resetProductPreset());
ipcMain.handle('product:import-preset', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择商品主数据文件（将覆盖全局预设）',
    properties: ['openFile'],
    filters: [
      { name: 'Excel 工作簿', extensions: ['xlsx', 'xlsm', 'xls'] }
    ]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return importProductPreset(result.filePaths[0]);
});
ipcMain.handle('warehouse:get-preset', async () => loadWarehousePreset());
ipcMain.handle('warehouse:save-preset', async (_event, rows) => saveWarehousePreset(rows));
ipcMain.handle('warehouse:reset-preset', async () => resetWarehousePreset());
ipcMain.handle('warehouse:import-preset', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择仓库米厂对应表文件（Excel / CSV 将覆盖全局预设）',
    properties: ['openFile'],
    filters: [
      { name: 'Excel / CSV 文件', extensions: ['xlsx', 'xlsm', 'xls', 'csv'] }
    ]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return importWarehousePresetFromFile(result.filePaths[0]);
});

function getInvoiceConfigPath() {
  try {
    return path.join(app.getPath('userData'), 'invoice-config.json');
  } catch {
    return path.join(__dirname, '..', 'invoice-config.json');
  }
}

function readStoredInvoiceConfig() {
  const cfgPath = getInvoiceConfigPath();
  if (fs.existsSync(cfgPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      return { ...DEFAULT_INVOICE_CONFIG, ...data };
    } catch {}
  }
  return { ...DEFAULT_INVOICE_CONFIG };
}

function writeStoredInvoiceConfig(config) {
  const cfgPath = getInvoiceConfigPath();
  try {
    fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
    fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

ipcMain.handle('invoice:open-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择天猫超市对账单文件（支持多选）',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Excel 工作簿', extensions: ['xlsx', 'xlsm', 'xls'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths;
});

ipcMain.handle('invoice:parse-files', async (_event, filePaths) => {
  return parseReconciliationFiles(filePaths);
});

ipcMain.handle('invoice:calculate', async (_event, payload) => {
  const rows = payload?.rows || [];
  const selectedFeeTypes = payload?.selectedFeeTypes;
  const selectedInvoiceDirs = payload?.selectedInvoiceDirs;
  const preset = await loadProductPreset();
  return calculateInvoiceSummary(rows, {
    selectedFeeTypes,
    selectedInvoiceDirs,
    presetRows: preset.rows
  });
});

ipcMain.handle('invoice:export', async (_event, payload) => {
  const items = payload?.items || [];
  const config = payload?.config || {};
  const defaultFileName = cleanText(payload?.defaultFileName) || `开票通知单_${config.date || formatTodayDate()}.xlsx`;

  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出开票通知单',
    defaultPath: defaultFileName,
    filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
  });
  if (result.canceled || !result.filePath) return null;

  await exportInvoiceNotificationWorkbook({
    items,
    config,
    outputPath: result.filePath
  });

  return { ok: true, filePath: result.filePath, itemCount: items.length };
});

ipcMain.handle('invoice:get-config', async () => {
  return readStoredInvoiceConfig();
});

ipcMain.handle('invoice:save-config', async (_event, config) => {
  return writeStoredInvoiceConfig(config);
});

function getPlatformFeeConfigPath() {
  try {
    return path.join(app.getPath('userData'), 'platform-fee-config.json');
  } catch {
    return path.join(__dirname, '..', 'platform-fee-config.json');
  }
}

function readStoredPlatformFeeConfig() {
  const cfgPath = getPlatformFeeConfigPath();
  if (fs.existsSync(cfgPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      return { categoryRemarks: DEFAULT_FEE_CATEGORY_REMARKS, ...data };
    } catch {}
  }
  return { categoryRemarks: DEFAULT_FEE_CATEGORY_REMARKS };
}

function writeStoredPlatformFeeConfig(config) {
  const cfgPath = getPlatformFeeConfigPath();
  try {
    fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
    fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

ipcMain.handle('platform-fee:open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择开票流水单据列表（Excel 或 CSV）',
    properties: ['openFile'],
    filters: [
      { name: 'Excel / CSV 文件', extensions: ['xlsx', 'xlsm', 'xls', 'csv'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('platform-fee:parse-file', async (_event, filePath) => {
  return parsePlatformFeeFile(filePath);
});

ipcMain.handle('platform-fee:calculate', async (_event, payload) => {
  const rows = payload?.rows || [];
  const options = payload?.options || {};
  return calculatePlatformFeeSummary(rows, options);
});

ipcMain.handle('platform-fee:export', async (_event, payload) => {
  const summaryResult = payload?.summaryResult;
  const rawRows = payload?.rawRows || [];
  const defaultFileName = cleanText(payload?.defaultFileName) ||
    `${summaryResult?.buyerShortName || '国宝'} 猫超平台费用明细_${summaryResult?.periodText || formatTodayDate()}.xlsx`;

  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出天猫平台费用明细汇总与核销表',
    defaultPath: defaultFileName,
    filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
  });
  if (result.canceled || !result.filePath) return null;

  await exportPlatformFeeExcel(summaryResult, result.filePath, rawRows);
  return { ok: true, filePath: result.filePath, totalAmount: summaryResult.totalAmount };
});

ipcMain.handle('platform-fee:get-config', async () => {
  return readStoredPlatformFeeConfig();
});

ipcMain.handle('platform-fee:save-config', async (_event, config) => {
  return writeStoredPlatformFeeConfig(config);
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });




