'use strict';

const path = require('node:path');
const fs = require('node:fs');
const ExcelJS = require('exceljs');
const { cleanText, numberValue } = require('./core');
const { loadProductPreset } = require('./product-preset');

const DEFAULT_INVOICE_CONFIG = {
  applicant: '丁锐杰',
  date: '', // 留空则默认当前日期 YYYY-M-D
  platform: '国宝猫超',
  warehouse: '',
  invoiceType: '专用发票',
  companyTitle: '浙江昊超网络科技有限公司',
  taxId: '91330110MA2GK1DN85',
  address: '杭州市余杭区五常街道文一西路969号3幢5层551室',
  phone: '0571-85022088',
  bank: '招商银行股份有限公司杭州高新支行',
  account: '571913080610506',
  mailRecipient: '武汉营销中心1293737582@qq.com'
};

function getInvoiceConfigPath(customDir) {
  if (customDir) return path.join(customDir, 'invoice-config.json');
  try {
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') {
      return path.join(app.getPath('userData'), 'invoice-config.json');
    }
  } catch {}
  if (process.env.APPDATA) {
    const candidate = path.join(process.env.APPDATA, 'excel-warehouse-summary', 'invoice-config.json');
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(__dirname, '..', 'invoice-config.json');
}

function readStoredInvoiceConfig(customDir) {
  const cfgPath = getInvoiceConfigPath(customDir);
  if (fs.existsSync(cfgPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      return { ...DEFAULT_INVOICE_CONFIG, ...data };
    } catch {}
  }
  return { ...DEFAULT_INVOICE_CONFIG };
}

function writeStoredInvoiceConfig(config, customDir) {
  const cfgPath = getInvoiceConfigPath(customDir);
  try {
    fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
    fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function formatTodayDate() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function cellValue(cell) {
  if (!cell) return '';
  const value = cell.value;
  if (value && typeof value === 'object') {
    if ('result' in value) return value.result ?? '';
    if ('text' in value) return value.text ?? '';
  }
  return value ?? '';
}

/**
 * 读取单个猫超对账单 Excel 文件
 */
async function readReconciliationWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error(`文件 [${path.basename(filePath)}] 中没有有效工作表`);
  }

  // 提取表头
  const headers = [];
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = cleanText(cellValue(cell));
  });

  // 定位必要列索引
  const colIndex = {
    billNo: headers.indexOf('对账单号'),
    docType: headers.indexOf('业务单据类型'),
    feeType: headers.indexOf('费用类型'),
    invoiceDir: headers.indexOf('发票方向'),
    taxAmount: headers.indexOf('含税金额'),
    untaxAmount: headers.indexOf('未税金额'),
    tax: headers.indexOf('税额'),
    taxRate: headers.indexOf('税率'),
    backendCode: headers.indexOf('后端商品编码'),
    backendName: headers.indexOf('后端商品名称'),
    frontendCode: headers.indexOf('前端商品编码'),
    frontendName: headers.indexOf('前端商品名称'),
    unit: headers.indexOf('存储单位'),
    qty: headers.indexOf('商品数量'),
    taxPrice: headers.indexOf('含税单价'),
    untaxPrice: headers.indexOf('未税单价'),
    bizTime: headers.indexOf('业务时间'),
    billTime: headers.indexOf('账单生成时间'),
    storeName: headers.indexOf('门店名称')
  };

  if (colIndex.backendName === -1 || colIndex.qty === -1 || colIndex.taxAmount === -1) {
    throw new Error(`文件 [${path.basename(filePath)}] 缺少必要的对账字段（需要包含：后端商品名称、商品数量、含税金额）`);
  }

  const rows = [];
  const billNos = new Set();
  let minBizTime = null;
  let maxBizTime = null;

  for (let r = 2; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const backendName = cleanText(cellValue(row.getCell(colIndex.backendName)));
    if (!backendName) continue;

    const billNo = colIndex.billNo !== -1 ? cleanText(cellValue(row.getCell(colIndex.billNo))) : '';
    if (billNo) billNos.add(billNo);

    const docType = colIndex.docType !== -1 ? cleanText(cellValue(row.getCell(colIndex.docType))) : '';
    const feeType = colIndex.feeType !== -1 ? cleanText(cellValue(row.getCell(colIndex.feeType))) : '';
    const invoiceDir = colIndex.invoiceDir !== -1 ? cleanText(cellValue(row.getCell(colIndex.invoiceDir))) : '';
    const qty = numberValue(cellValue(row.getCell(colIndex.qty)));
    const taxAmount = numberValue(cellValue(row.getCell(colIndex.taxAmount)));
    const untaxAmount = colIndex.untaxAmount !== -1 ? numberValue(cellValue(row.getCell(colIndex.untaxAmount))) : 0;
    const tax = colIndex.tax !== -1 ? numberValue(cellValue(row.getCell(colIndex.tax))) : 0;
    const backendCode = colIndex.backendCode !== -1 ? cleanText(cellValue(row.getCell(colIndex.backendCode))) : '';
    const taxPrice = colIndex.taxPrice !== -1 ? numberValue(cellValue(row.getCell(colIndex.taxPrice))) : 0;
    const bizTime = colIndex.bizTime !== -1 ? cleanText(cellValue(row.getCell(colIndex.bizTime))) : '';

    if (bizTime) {
      if (!minBizTime || bizTime < minBizTime) minBizTime = bizTime;
      if (!maxBizTime || bizTime > maxBizTime) maxBizTime = bizTime;
    }

    rows.push({
      billNo,
      docType,
      feeType,
      invoiceDir,
      backendCode,
      backendName,
      qty,
      taxAmount,
      untaxAmount,
      tax,
      taxPrice,
      bizTime,
      sourceFile: path.basename(filePath)
    });
  }

  return {
    filePath,
    fileName: path.basename(filePath),
    rowCount: rows.length,
    billNos: Array.from(billNos),
    timeRange: minBizTime && maxBizTime ? `${minBizTime.slice(0, 10)} ~ ${maxBizTime.slice(0, 10)}` : '',
    rows
  };
}

/**
 * 批量读取多个对账单并聚合所有原始数据与可用筛选条件
 */
async function parseReconciliationFiles(filePaths) {
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    return {
      files: [],
      rows: [],
      rawRows: [],
      availableFeeTypes: [],
      availableInvoiceDirs: [],
      availableDocTypes: [],
      allBillNos: []
    };
  }

  const files = [];
  const allRows = [];
  const feeTypeSet = new Set();
  const invoiceDirSet = new Set();
  const docTypeSet = new Set();
  const billNoSet = new Set();

  for (const fp of filePaths) {
    const fileRes = await readReconciliationWorkbook(fp);
    files.push({
      filePath: fileRes.filePath,
      fileName: fileRes.fileName,
      path: fileRes.filePath,
      name: fileRes.fileName,
      rowCount: fileRes.rowCount,
      billNos: fileRes.billNos,
      timeRange: fileRes.timeRange
    });
    for (const b of fileRes.billNos) billNoSet.add(b);
    for (const r of fileRes.rows) {
      allRows.push(r);
      if (r.feeType) feeTypeSet.add(r.feeType);
      if (r.invoiceDir) invoiceDirSet.add(r.invoiceDir);
      if (r.docType) docTypeSet.add(r.docType);
    }
  }

  return {
    files,
    rows: allRows,
    rawRows: allRows,
    availableFeeTypes: Array.from(feeTypeSet),
    availableInvoiceDirs: Array.from(invoiceDirSet),
    availableDocTypes: Array.from(docTypeSet),
    allBillNos: Array.from(billNoSet)
  };
}

/**
 * 根据商品预设匹配后端商品名称
 */
function matchProductWithPreset(backendName, presetRows = []) {
  const raw = cleanText(backendName);
  if (!raw) {
    return { matched: false, shortName: '', spec: '', orderIdx: 99999, preset: null };
  }

  const noSpaceRaw = raw.replace(/\s+/g, '');

  // 1. 精确全名匹配（忽略首尾空格）
  let found = presetRows.find(p => cleanText(p['货品名称（带空格）']) === raw);
  if (found) {
    return {
      matched: true,
      shortName: cleanText(found['订单简称'] || raw),
      spec: found['规格kg'] ? `${found['规格kg']}kg` : '',
      orderIdx: numberValue(found['序号']) || 9999,
      preset: found
    };
  }

  // 2. 紧凑匹配（去掉所有内部空格对比）
  found = presetRows.find(p => cleanText(p['货品名称（带空格）']).replace(/\s+/g, '') === noSpaceRaw);
  if (found) {
    return {
      matched: true,
      shortName: cleanText(found['订单简称'] || raw),
      spec: found['规格kg'] ? `${found['规格kg']}kg` : '',
      orderIdx: numberValue(found['序号']) || 9999,
      preset: found
    };
  }

  // 3. 包含订单简称匹配
  found = presetRows.find(p => {
    const s = cleanText(p['订单简称']);
    return s && raw.includes(s);
  });
  if (found) {
    return {
      matched: true,
      shortName: cleanText(found['订单简称']),
      spec: found['规格kg'] ? `${found['规格kg']}kg` : '',
      orderIdx: numberValue(found['序号']) || 9999,
      preset: found
    };
  }

  // 4. 互含模糊匹配
  found = presetRows.find(p => {
    const fn = cleanText(p['货品名称（带空格）']).replace(/\s+/g, '');
    return fn && (noSpaceRaw.includes(fn) || fn.includes(noSpaceRaw));
  });
  if (found) {
    return {
      matched: true,
      shortName: cleanText(found['订单简称'] || raw),
      spec: found['规格kg'] ? `${found['规格kg']}kg` : '',
      orderIdx: numberValue(found['序号']) || 9999,
      preset: found
    };
  }

  // 未匹配到预设，兜底提取常见规格（如 10kg, 5kg, 25kg, 2.5kg）
  let fallbackSpec = '';
  const specMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:kg|KG|公斤)/);
  if (specMatch) {
    fallbackSpec = `${specMatch[1]}kg`;
  }

  return {
    matched: false,
    shortName: raw,
    spec: fallbackSpec,
    orderIdx: 99990,
    preset: null
  };
}

/**
 * 核心汇总计算：费用类型筛选只作用于数量，发票方向筛选只作用于金额
 */
function calculateInvoiceSummary(rows = [], { selectedFeeTypes, selectedInvoiceDirs, presetRows = [] } = {}) {
  const feeTypeFilter = Array.isArray(selectedFeeTypes) ? new Set(selectedFeeTypes) : null;
  const invoiceDirFilter = Array.isArray(selectedInvoiceDirs) ? new Set(selectedInvoiceDirs) : null;

  const aggMap = new Map();
  const billNos = new Set();
  let matchedRowCount = 0;
  let totalFilteredQty = 0;
  let totalFilteredAmount = 0;

  for (const r of rows) {
    if (r.billNo) billNos.add(r.billNo);

    // 费用类型筛选只作用于数量，发票方向筛选只作用于金额
    const matchQty = feeTypeFilter ? feeTypeFilter.has(r.feeType) : true;
    const matchAmount = invoiceDirFilter ? invoiceDirFilter.has(r.invoiceDir) : true;

    // 两者都不满足则跳过
    if (!matchQty && !matchAmount) continue;

    matchedRowCount++;
    const match = matchProductWithPreset(r.backendName, presetRows);
    const key = match.shortName;

    if (!aggMap.has(key)) {
      aggMap.set(key, {
        shortName: match.shortName,
        spec: match.spec,
        orderIdx: match.orderIdx,
        matched: match.matched,
        rawNames: new Set([r.backendName]),
        qty: 0,
        amount: 0,
        detailCount: 0
      });
    }

    const item = aggMap.get(key);
    if (matchQty) {
      item.qty += r.qty;
      totalFilteredQty += r.qty;
    }
    if (matchAmount) {
      item.amount += r.taxAmount;
      totalFilteredAmount += r.taxAmount;
    }
    item.detailCount++;
    item.rawNames.add(r.backendName);
  }

  // 排序与过滤无结算项（数量非0 或 金额绝对值>=0.005）
  const items = Array.from(aggMap.values())
    .filter(item => item.qty !== 0 || Math.abs(item.amount) >= 0.005)
    .sort((a, b) => {
      if (a.orderIdx !== b.orderIdx) return a.orderIdx - b.orderIdx;
      return a.shortName.localeCompare(b.shortName, 'zh-CN');
    })
    .map(item => {
      // 保留2位小数计算金额
      const finalAmount = Math.round(item.amount * 100) / 100;
      const finalQty = Math.round(item.qty); // 大米袋数常规为整数
      const unitPrice = finalQty !== 0 ? finalAmount / finalQty : 0;
      return {
        shortName: item.shortName,
        productName: item.shortName, // 兼容组件属性名
        spec: item.spec,
        qty: finalQty,
        amount: finalAmount,
        taxIncludedAmount: finalAmount, // 兼容组件属性名
        unitPrice: Number(unitPrice.toFixed(4)),
        matched: item.matched,
        isPresetMatched: item.matched, // 兼容组件属性名
        detailCount: item.detailCount,
        remark: `来源 ${item.detailCount} 行`,
        rawNames: Array.from(item.rawNames)
      };
    });

  const finalTotalAmount = Math.round(totalFilteredAmount * 100) / 100;
  const finalTotalQty = Math.round(totalFilteredQty);

  return {
    items,
    totalQty: finalTotalQty,
    totalAmount: finalTotalAmount,
    matchedRowCount,
    rowCount: matchedRowCount,
    productCount: items.length,
    billCount: billNos.size
  };
}

/**
 * 导出标准的《开 票 通 知 单》Excel 工作簿
 */
async function exportInvoiceNotificationWorkbook({ items = [], config = {}, outputPath }) {
  const mergedConfig = { ...DEFAULT_INVOICE_CONFIG, ...config };
  if (!mergedConfig.date) {
    mergedConfig.date = formatTodayDate();
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sheet1', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0
    }
  });

  // 设置列宽（B 列至 G 列对应列 2 ~ 7）
  worksheet.getColumn(1).width = 4;   // A 列留白
  worksheet.getColumn(2).width = 32;  // B: 商品名称
  worksheet.getColumn(3).width = 12;  // C: 规格（袋）
  worksheet.getColumn(4).width = 14;  // D: 数量（袋）
  worksheet.getColumn(5).width = 16;  // E: 单价（元）
  worksheet.getColumn(6).width = 18;  // F: 金额（元）
  worksheet.getColumn(7).width = 14;  // G: 备注

  const thinBorder = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' }
  };

  // Row 1: 标题
  worksheet.mergeCells('B1:G1');
  const titleCell = worksheet.getCell('B1');
  titleCell.value = '开 票 通 知 单';
  titleCell.font = { name: '微软雅黑', size: 16, bold: true };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 42;

  // Row 2: 开票通知时间与申请人
  worksheet.getCell('B2').value = '开票通知时间：';
  worksheet.getCell('B2').font = { name: '微软雅黑', size: 14 };
  worksheet.getCell('B2').alignment = { horizontal: 'center', vertical: 'middle' };

  worksheet.getCell('C2').value = String(mergedConfig.date);
  worksheet.getCell('C2').font = { name: '微软雅黑', size: 14 };
  worksheet.getCell('C2').alignment = { horizontal: 'left', vertical: 'middle' };
  worksheet.getCell('C2').numFmt = '@';

  worksheet.getCell('E2').value = `申请人：${mergedConfig.applicant}`;
  worksheet.getCell('E2').font = { name: '微软雅黑', size: 14 };
  worksheet.getCell('E2').alignment = { horizontal: 'left', vertical: 'middle' };
  worksheet.getRow(2).height = 28;

  // Row 3: 空行
  worksheet.getRow(3).height = 14;

  // Row 4: 一、 开票内容
  worksheet.getCell('B4').value = '一、 开票内容';
  worksheet.getCell('B4').font = { name: '微软雅黑', size: 14, bold: true };
  worksheet.getCell('B4').alignment = { horizontal: 'left', vertical: 'middle' };
  worksheet.getRow(4).height = 26;

  // Row 5: 表头
  const headers = ['商品名称', '规   格\n（袋）', '数   量（袋）', '单价\n（元）', '金   额\n（元）', '备注'];
  headers.forEach((h, idx) => {
    const col = idx + 2;
    const cell = worksheet.getRow(5).getCell(col);
    cell.value = h;
    cell.font = { name: '微软雅黑', size: 12, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
  });
  worksheet.getRow(5).height = 36;

  // Row 6 ~ (5 + N): 商品明细行
  let currentRow = 6;
  const startDataRow = 6;

  for (const item of items) {
    const row = worksheet.getRow(currentRow);
    row.height = 24;

    // B: 商品名称
    const bCell = row.getCell(2);
    bCell.value = item.shortName;
    bCell.font = { name: '微软雅黑', size: 11 };
    bCell.alignment = { horizontal: 'center', vertical: 'middle' };
    bCell.border = thinBorder;

    // C: 规格
    const cCell = row.getCell(3);
    cCell.value = item.spec || '';
    cCell.font = { name: '微软雅黑', size: 12 };
    cCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cCell.border = thinBorder;

    // D: 数量
    const dCell = row.getCell(4);
    dCell.value = item.qty;
    dCell.font = { name: '微软雅黑', size: 12 };
    dCell.alignment = { horizontal: 'center', vertical: 'middle' };
    dCell.border = thinBorder;
    dCell.numFmt = '#,##0';

    // E: 单价公式 = F{row} / D{row}（数量非零时使用公式，零时置0避免#DIV/0!）
    const eCell = row.getCell(5);
    if (item.qty !== 0) {
      eCell.value = {
        formula: `F${currentRow}/D${currentRow}`,
        result: item.unitPrice
      };
    } else {
      eCell.value = 0;
    }
    eCell.font = { name: '微软雅黑', size: 12 };
    eCell.alignment = { horizontal: 'center', vertical: 'middle' };
    eCell.border = thinBorder;
    eCell.numFmt = '0.00_ ';

    // F: 金额
    const fCell = row.getCell(6);
    fCell.value = item.amount;
    fCell.font = { name: '微软雅黑', size: 12 };
    fCell.alignment = { horizontal: 'center', vertical: 'middle' };
    fCell.border = thinBorder;
    fCell.numFmt = '0.00_ ';

    // G: 备注
    const gCell = row.getCell(7);
    gCell.value = '';
    gCell.font = { name: '微软雅黑', size: 11 };
    gCell.alignment = { horizontal: 'center', vertical: 'middle' };
    gCell.border = thinBorder;

    currentRow++;
  }

  const endDataRow = currentRow - 1;

  // 合计行
  const totalRow = worksheet.getRow(currentRow);
  totalRow.height = 26;

  totalRow.getCell(2).value = '合计';
  totalRow.getCell(2).font = { name: '微软雅黑', size: 11, bold: true };
  totalRow.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
  totalRow.getCell(2).border = thinBorder;

  totalRow.getCell(3).value = '';
  totalRow.getCell(3).border = thinBorder;

  // 数量合计公式
  const totalQtyCell = totalRow.getCell(4);
  totalQtyCell.value = {
    formula: `SUM(D${startDataRow}:D${endDataRow})`,
    result: items.reduce((s, x) => s + x.qty, 0)
  };
  totalQtyCell.font = { name: '微软雅黑', size: 11, bold: true };
  totalQtyCell.alignment = { horizontal: 'center', vertical: 'middle' };
  totalQtyCell.border = thinBorder;
  totalQtyCell.numFmt = '#,##0';

  totalRow.getCell(5).value = '';
  totalRow.getCell(5).border = thinBorder;

  // 金额合计公式
  const totalAmountCell = totalRow.getCell(6);
  totalAmountCell.value = {
    formula: `SUM(F${startDataRow}:F${endDataRow})`,
    result: Math.round(items.reduce((s, x) => s + x.amount, 0) * 100) / 100
  };
  totalAmountCell.font = { name: '微软雅黑', size: 11, bold: true };
  totalAmountCell.alignment = { horizontal: 'center', vertical: 'middle' };
  totalAmountCell.border = thinBorder;
  totalAmountCell.numFmt = '0.00_ ';

  totalRow.getCell(7).value = '';
  totalRow.getCell(7).border = thinBorder;

  currentRow++;

  // 注释行
  const platformRow = worksheet.getRow(currentRow);
  platformRow.getCell(2).value = `注：销售平台：${mergedConfig.platform}`;
  platformRow.getCell(2).font = { name: '微软雅黑', size: 12 };
  platformRow.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
  platformRow.height = 22;
  currentRow++;

  const warehouseRow = worksheet.getRow(currentRow);
  warehouseRow.getCell(2).value = `发货仓库：${mergedConfig.warehouse || ''}`;
  warehouseRow.getCell(2).font = { name: '微软雅黑', size: 12 };
  warehouseRow.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
  warehouseRow.height = 22;
  currentRow += 2; // 空一行

  // 二、开票资料：
  worksheet.mergeCells(`B${currentRow}:C${currentRow}`);
  const infoHeaderCell = worksheet.getCell(`B${currentRow}`);
  infoHeaderCell.value = '二、开票资料：';
  infoHeaderCell.font = { name: '微软雅黑', size: 14, bold: true };
  infoHeaderCell.alignment = { horizontal: 'left', vertical: 'middle' };
  worksheet.getRow(currentRow).height = 26;
  currentRow++;

  const invoiceDataRows = [
    { label: '发票种类', value: mergedConfig.invoiceType },
    { label: '发票抬头', value: mergedConfig.companyTitle },
    { label: '税号', value: mergedConfig.taxId },
    { label: '地址', value: mergedConfig.address },
    { label: '电话', value: mergedConfig.phone },
    { label: '开户银行', value: mergedConfig.bank },
    { label: '账号', value: mergedConfig.account }
  ];

  for (const info of invoiceDataRows) {
    const row = worksheet.getRow(currentRow);
    row.height = 24;

    const lblCell = row.getCell(2);
    lblCell.value = info.label;
    lblCell.font = { name: '微软雅黑', size: 12 };
    lblCell.alignment = { horizontal: 'center', vertical: 'middle' };
    lblCell.border = thinBorder;

    worksheet.mergeCells(`C${currentRow}:G${currentRow}`);
    const valCell = row.getCell(3);
    valCell.value = info.value;
    valCell.font = { name: '微软雅黑', size: 12 };
    valCell.alignment = { horizontal: info.label === '发票种类' ? 'center' : 'left', vertical: 'middle' };

    // 填充合并单元格边框
    for (let c = 3; c <= 7; c++) {
      row.getCell(c).border = thinBorder;
    }
    currentRow++;
  }

  currentRow++; // 空一行

  // 三、发票邮寄地址：
  worksheet.mergeCells(`B${currentRow}:C${currentRow}`);
  const mailHeaderCell = worksheet.getCell(`B${currentRow}`);
  mailHeaderCell.value = '三、发票邮寄地址：';
  mailHeaderCell.font = { name: '微软雅黑', size: 14, bold: true };
  mailHeaderCell.alignment = { horizontal: 'left', vertical: 'middle' };
  worksheet.getRow(currentRow).height = 26;
  currentRow++;

  const mailRow = worksheet.getRow(currentRow);
  mailRow.height = 24;

  const mailLbl = mailRow.getCell(2);
  mailLbl.value = '收件人';
  mailLbl.font = { name: '微软雅黑', size: 12 };
  mailLbl.alignment = { horizontal: 'center', vertical: 'middle' };
  mailLbl.border = thinBorder;

  worksheet.mergeCells(`C${currentRow}:G${currentRow}`);
  const mailVal = mailRow.getCell(3);
  mailVal.value = mergedConfig.mailRecipient;
  mailVal.font = { name: '微软雅黑', size: 12 };
  mailVal.alignment = { horizontal: 'left', vertical: 'middle' };
  for (let c = 3; c <= 7; c++) {
    mailRow.getCell(c).border = thinBorder;
  }

  await workbook.xlsx.writeFile(outputPath);
  return { ok: true, outputPath, itemCount: items.length };
}

module.exports = {
  DEFAULT_INVOICE_CONFIG,
  getInvoiceConfigPath,
  readStoredInvoiceConfig,
  writeStoredInvoiceConfig,
  formatTodayDate,
  readReconciliationWorkbook,
  parseReconciliationFiles,
  matchProductWithPreset,
  calculateInvoiceSummary,
  exportInvoiceNotificationWorkbook
};
