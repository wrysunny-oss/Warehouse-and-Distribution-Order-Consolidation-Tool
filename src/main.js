'use strict';

const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const ExcelJS = require('exceljs');
const { cleanText, orderHeader, validateTable, getBrands, collectMappingRows, aggregate } = require('./core');
const { detailFormulaValues, summaryFormulaValues } = require('./excel-formulas');

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
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (smokeTest) {
    mainWindow.webContents.once('did-finish-load', async () => {
      const result = await mainWindow.webContents.executeJavaScript("({ title: document.title, hasImport: Boolean(document.getElementById('table2Btn')), hasExport: Boolean(document.getElementById('exportBtn')) })");
      console.log('SMOKE_TEST', JSON.stringify(result));
      if (process.env.EXCEL_TOOL_SMOKE_SCREENSHOT === '1') {
        const image = await mainWindow.webContents.capturePage();
        fs.writeFileSync(path.join(process.cwd(), 'smoke-test.png'), image.toPNG());
      }
      app.quit();
    });
  }
}

ipcMain.handle('excel:open', async (_event, type) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: type === 'table1' ? '选择表一（订单数据）' : '选择表二（库存数据）',
    properties: ['openFile'],
    filters: [{ name: 'Excel 工作簿', extensions: ['xlsx', 'xlsm'] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return readWorkbook(result.filePaths[0], type);
});

ipcMain.handle('summary:analyze', (_event, payload) => {
  const brands = getBrands(payload.table2Rows || []);
  const inventory = aggregate({ table2Rows: payload.table2Rows || [], brand: payload.brand || brands[0] || '' });
  const mappingRows = collectMappingRows(payload.table1Rows || [], payload.brand || brands[0] || '', inventory.warehouses, payload.mapping || {});
  return { brands, warehouses: inventory.warehouses, mappingRows };
});

ipcMain.handle('summary:compute', (_event, payload) => aggregate(payload));
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
  await workbook.xlsx.writeFile(result.filePath);
  return result.filePath;
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });




