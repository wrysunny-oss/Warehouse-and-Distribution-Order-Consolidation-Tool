'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { cleanText, numberValue } = require('./core');

// 默认费用大类到财务科目的映射关系
const DEFAULT_FEE_CATEGORY_REMARKS = {
  '推广服务费': '电商市场推广费',
  '客服服务费': '售后费用',
  '供应链管理服务费': '售后费用',
  '集货仓物流费': '电商物流费',
  '技术服务费': '电商运营费',
  '物流服务费': '电商物流费'
};

// 预设推荐的大类展现排序
const DEFAULT_CATEGORY_ORDER = [
  '推广服务费',
  '客服服务费',
  '供应链管理服务费',
  '集货仓物流费',
  '技术服务费',
  '物流服务费'
];

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
 * 格式化日期为 YYYY-MM-DD
 */
function formatDateOnly(val) {
  if (!val) return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(val).trim();
  const match = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) {
    return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
  }
  return s.slice(0, 10);
}

/**
 * 从对账单号推算账单生成日期（天猫规则 S20260901... -> 2026-09-01）
 */
function extractBillGenDate(billNo, fallbackDate) {
  if (billNo) {
    const m = String(billNo).match(/^[A-Za-z]?(\d{4})(\d{2})(\d{2})/);
    if (m) {
      return `${m[1]}-${m[2]}-${m[3]}`;
    }
  }
  return formatDateOnly(fallbackDate);
}

/**
 * 读取开票流水单据文件（支持 .xlsx 与 .csv）
 */
async function parsePlatformFeeFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }

  const ext = path.extname(filePath).toLowerCase();
  const rawRows = [];

  if (ext === '.csv') {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) {
      throw new Error(`CSV 文件为空: ${path.basename(filePath)}`);
    }

    const parseCsvLine = (line) => {
      const result = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          if (inQuotes && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (c === ',' && !inQuotes) {
          result.push(cur.trim());
          cur = '';
        } else {
          cur += c;
        }
      }
      result.push(cur.trim());
      return result;
    };

    const header = parseCsvLine(lines[0]);
    const colIndex = {
      flowNo: header.indexOf('待开票流水主单号'),
      billNo: header.indexOf('对账单号'),
      seller: header.indexOf('销方'),
      buyer: header.indexOf('购方'),
      feeCode: header.indexOf('费用项编码'),
      feeItemName: header.indexOf('费用项名称'),
      invoiceContent: header.indexOf('开票内容'),
      taxCode: header.indexOf('税收分类编码'),
      date: header.indexOf('日期'),
      currency: header.indexOf('币种'),
      amount: header.indexOf('开票金额'),
      pendingAmount: header.indexOf('待开票金额'),
      invoicedAmount: header.indexOf('已开票金额'),
      applyDate: header.indexOf('申请日期'),
      status: header.indexOf('开票状态'),
      category: header.indexOf('发票分类')
    };

    if (colIndex.feeItemName === -1 || colIndex.invoiceContent === -1 || colIndex.amount === -1) {
      throw new Error(`CSV 文件缺少必要列（需要包含：费用项名称、开票内容、开票金额）`);
    }

    for (let i = 1; i < lines.length; i++) {
      const parts = parseCsvLine(lines[i]);
      const feeItemName = parts[colIndex.feeItemName] || '';
      const invoiceContent = parts[colIndex.invoiceContent] || '';
      const amount = parseFloat(parts[colIndex.amount]) || 0;
      if (!feeItemName && !invoiceContent && amount === 0) continue;

      rawRows.push({
        flowNo: colIndex.flowNo !== -1 ? parts[colIndex.flowNo] || '' : '',
        billNo: colIndex.billNo !== -1 ? parts[colIndex.billNo] || '' : '',
        seller: colIndex.seller !== -1 ? parts[colIndex.seller] || '' : '',
        buyer: colIndex.buyer !== -1 ? parts[colIndex.buyer] || '' : '',
        feeCode: colIndex.feeCode !== -1 ? parts[colIndex.feeCode] || '' : '',
        feeItemName,
        invoiceContent,
        taxCode: colIndex.taxCode !== -1 ? parts[colIndex.taxCode] || '' : '',
        date: colIndex.date !== -1 ? parts[colIndex.date] || '' : '',
        currency: colIndex.currency !== -1 ? parts[colIndex.currency] || 'CNY' : 'CNY',
        amount: Math.round(amount * 100) / 100,
        pendingAmount: colIndex.pendingAmount !== -1 ? parseFloat(parts[colIndex.pendingAmount]) || 0 : 0,
        invoicedAmount: colIndex.invoicedAmount !== -1 ? parseFloat(parts[colIndex.invoicedAmount]) || 0 : 0,
        applyDate: colIndex.applyDate !== -1 ? parts[colIndex.applyDate] || '' : '',
        status: colIndex.status !== -1 ? parts[colIndex.status] || '' : '',
        category: colIndex.category !== -1 ? parts[colIndex.category] || '' : ''
      });
    }
  } else {
    // 读取 Excel
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error(`Excel 文件中没有工作表: ${path.basename(filePath)}`);
    }

    const headers = [];
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
      headers[col] = cleanText(cellValue(cell));
    });

    const colIndex = {
      flowNo: headers.indexOf('待开票流水主单号'),
      billNo: headers.indexOf('对账单号'),
      seller: headers.indexOf('销方'),
      buyer: headers.indexOf('购方'),
      feeCode: headers.indexOf('费用项编码'),
      feeItemName: headers.indexOf('费用项名称'),
      invoiceContent: headers.indexOf('开票内容'),
      taxCode: headers.indexOf('税收分类编码'),
      date: headers.indexOf('日期'),
      currency: headers.indexOf('币种'),
      amount: headers.indexOf('开票金额'),
      pendingAmount: headers.indexOf('待开票金额'),
      invoicedAmount: headers.indexOf('已开票金额'),
      applyDate: headers.indexOf('申请日期'),
      status: headers.indexOf('开票状态'),
      category: headers.indexOf('发票分类')
    };

    if (colIndex.feeItemName === -1 || colIndex.invoiceContent === -1 || colIndex.amount === -1) {
      throw new Error(`文件 [${path.basename(filePath)}] 缺少必要列（需要包含：费用项名称、开票内容、开票金额）`);
    }

    for (let r = 2; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      const feeItemName = cleanText(cellValue(row.getCell(colIndex.feeItemName)));
      const invoiceContent = cleanText(cellValue(row.getCell(colIndex.invoiceContent)));
      const amount = numberValue(cellValue(row.getCell(colIndex.amount)));
      if (!feeItemName && !invoiceContent && amount === 0) continue;

      const flowNo = colIndex.flowNo !== -1 ? cleanText(cellValue(row.getCell(colIndex.flowNo))) : '';
      const billNo = colIndex.billNo !== -1 ? cleanText(cellValue(row.getCell(colIndex.billNo))) : '';
      const seller = colIndex.seller !== -1 ? cleanText(cellValue(row.getCell(colIndex.seller))) : '';
      const buyer = colIndex.buyer !== -1 ? cleanText(cellValue(row.getCell(colIndex.buyer))) : '';
      const feeCode = colIndex.feeCode !== -1 ? cleanText(cellValue(row.getCell(colIndex.feeCode))) : '';
      const taxCode = colIndex.taxCode !== -1 ? cleanText(cellValue(row.getCell(colIndex.taxCode))) : '';
      const rawDate = colIndex.date !== -1 ? row.getCell(colIndex.date).value : '';
      const dateStr = rawDate instanceof Date ? formatDateOnly(rawDate) : cleanText(cellValue(row.getCell(colIndex.date)));
      const currency = colIndex.currency !== -1 ? cleanText(cellValue(row.getCell(colIndex.currency))) : 'CNY';

      rawRows.push({
        flowNo,
        billNo,
        seller,
        buyer,
        feeCode,
        feeItemName,
        invoiceContent,
        taxCode,
        date: dateStr,
        currency: currency || 'CNY',
        amount: Math.round(amount * 100) / 100,
        pendingAmount: colIndex.pendingAmount !== -1 ? numberValue(cellValue(row.getCell(colIndex.pendingAmount))) : 0,
        invoicedAmount: colIndex.invoicedAmount !== -1 ? numberValue(cellValue(row.getCell(colIndex.invoicedAmount))) : 0,
        applyDate: colIndex.applyDate !== -1 ? cleanText(cellValue(row.getCell(colIndex.applyDate))) : '',
        status: colIndex.status !== -1 ? cleanText(cellValue(row.getCell(colIndex.status))) : '',
        category: colIndex.category !== -1 ? cleanText(cellValue(row.getCell(colIndex.category))) : ''
      });
    }
  }

  // 提取默认信息
  let defaultSeller = '';
  let defaultBuyerShort = '国宝';
  let minDate = '';
  let maxDate = '';

  for (const r of rawRows) {
    if (!defaultSeller && r.seller) defaultSeller = r.seller;
    if (r.buyer) {
      if (r.buyer.includes('国宝')) defaultBuyerShort = '国宝';
      else if (r.buyer.includes('稻花翁')) defaultBuyerShort = '稻花翁';
      else if (r.buyer.length <= 6) defaultBuyerShort = r.buyer;
    }
    const d = formatDateOnly(r.date);
    if (d) {
      if (!minDate || d < minDate) minDate = d;
      if (!maxDate || d > maxDate) maxDate = d;
    }
  }

  // 推算账单周期文字
  let defaultPeriodText = '';
  if (minDate && maxDate) {
    const minP = minDate.split('-');
    const maxP = maxDate.split('-');
    if (minP.length === 3 && maxP.length === 3) {
      defaultPeriodText = `${minP[0]}.${parseInt(minP[1], 10)}.${parseInt(minP[2], 10)}-${maxP[0]}.${parseInt(maxP[1], 10)}.${parseInt(maxP[2], 10)}`;
    } else {
      defaultPeriodText = `${minDate}~${maxDate}`;
    }
  }

  return {
    filePath,
    fileName: path.basename(filePath),
    rowCount: rawRows.length,
    defaultSeller: defaultSeller || '浙江天猫供应链管理有限公司',
    defaultBuyerShort,
    defaultPeriodText,
    minDate,
    maxDate,
    rows: rawRows
  };
}

/**
 * 汇总计算平台费用数据
 * @param {Array} rows 原始流水
 * @param {Object} options 配置项 (buyerShortName, sellerName, periodText, categoryRemarks)
 */
function calculatePlatformFeeSummary(rows, options = {}) {
  const {
    buyerShortName = '国宝',
    sellerName = '浙江天猫供应链管理有限公司',
    periodText = '',
    categoryRemarks = {}
  } = options;

  const remarkMap = {
    ...DEFAULT_FEE_CATEGORY_REMARKS,
    ...categoryRemarks
  };

  // 1. 分组：大类 (invoiceContent) -> 细项 (feeItemName) -> sum(amount)
  const groupMap = new Map();

  for (const r of rows) {
    const content = r.invoiceContent || '未分类';
    const feeName = r.feeItemName || '未命名费用项';
    const amount = Number(r.amount) || 0;

    if (!groupMap.has(content)) {
      groupMap.set(content, new Map());
    }
    const itemMap = groupMap.get(content);
    const prev = itemMap.get(feeName) || 0;
    itemMap.set(feeName, Math.round((prev + amount) * 100) / 100);
  }

  // 2. 构造大类列表并排序
  const categories = [];
  for (const [content, itemMap] of groupMap.entries()) {
    const items = [];
    let subtotal = 0;
    for (const [feeName, amt] of itemMap.entries()) {
      items.push({
        feeItemName: feeName,
        amount: amt
      });
      subtotal += amt;
    }

    // 细项按费用项名称自然排序
    items.sort((a, b) => a.feeItemName.localeCompare(b.feeItemName, 'zh-Hans-CN'));

    categories.push({
      invoiceContent: content,
      items,
      subtotal: Math.round(subtotal * 100) / 100,
      remark: remarkMap[content] || ''
    });
  }

  // 大类排序（根据预设顺序排在前面，其余排后面）
  categories.sort((a, b) => {
    let idxA = DEFAULT_CATEGORY_ORDER.indexOf(a.invoiceContent);
    let idxB = DEFAULT_CATEGORY_ORDER.indexOf(b.invoiceContent);
    if (idxA === -1) idxA = 999;
    if (idxB === -1) idxB = 999;
    if (idxA !== idxB) return idxA - idxB;
    return a.invoiceContent.localeCompare(b.invoiceContent, 'zh-Hans-CN');
  });

  // 赋予序号
  let totalAmount = 0;
  categories.forEach((cat, idx) => {
    cat.index = idx + 1;
    totalAmount += cat.subtotal;
  });
  totalAmount = Math.round(totalAmount * 100) / 100;

  // 3. 构建用于明细打印的数据
  const detailRows = rows.map(r => ({
    flowNo: r.flowNo,
    billNo: r.billNo,
    billGenDate: extractBillGenDate(r.billNo, r.date),
    feeItemName: r.feeItemName,
    invoiceContent: r.invoiceContent,
    docDate: formatDateOnly(r.date),
    amount: r.amount
  }));

  // 明细按对账单号、流水单号排序
  detailRows.sort((a, b) => {
    if (a.billNo !== b.billNo) return a.billNo.localeCompare(b.billNo);
    return a.flowNo.localeCompare(b.flowNo);
  });

  return {
    buyerShortName,
    sellerName,
    periodText,
    totalAmount,
    categories,
    categoryCount: categories.length,
    rowCount: rows.length,
    detailRows,
    categoryRemarks: remarkMap
  };
}

/**
 * 导出平台费用核销汇总 Excel
 */
async function exportPlatformFeeExcel(summaryResult, targetPath, rawRows = []) {
  const {
    buyerShortName,
    sellerName,
    periodText,
    totalAmount,
    categories,
    detailRows
  } = summaryResult;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = '仓配订单汇总工具';
  workbook.lastModifiedBy = '仓配订单汇总工具';
  workbook.created = new Date();
  workbook.modified = new Date();

  // 边框通用样式
  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FF000000' } },
    left: { style: 'thin', color: { argb: 'FF000000' } },
    bottom: { style: 'thin', color: { argb: 'FF000000' } },
    right: { style: 'thin', color: { argb: 'FF000000' } }
  };

  // ==========================================
  // SHEET 1: 1. 费用汇总表
  // ==========================================
  const ws1 = workbook.addWorksheet('1. 费用汇总表');
  ws1.columns = [
    { key: 'index', width: 8 },
    { key: 'invoiceContent', width: 22 },
    { key: 'feeItemName', width: 28 },
    { key: 'amount', width: 18 },
    { key: 'remark', width: 20 }
  ];

  // 行 1: 大标题
  const titleText = `${buyerShortName} 猫超平台费用明细（账单时间：${periodText || '全周期'}）\n（${sellerName}）`;
  const row1 = ws1.getRow(1);
  row1.height = 43;
  for (let c = 1; c <= 5; c++) {
    const cell = row1.getCell(c);
    cell.value = titleText;
    cell.font = { name: '宋体', size: 12, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
  }
  ws1.mergeCells('A1:E1');

  // 行 2: 表头
  const row2 = ws1.getRow(2);
  row2.height = 30;
  const headers1 = ['序号', '开票内容', '费用项名称', '开票金额', '备注'];
  headers1.forEach((h, i) => {
    const cell = row2.getCell(i + 1);
    cell.value = h;
    cell.font = { name: '宋体', size: 11, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF2F2F2' }
    };
  });

  let curRowIdx = 3;
  for (const cat of categories) {
    const startRow = curRowIdx;
    for (const item of cat.items) {
      const r = ws1.getRow(curRowIdx);
      r.height = 20;

      // 序号
      const cellA = r.getCell(1);
      cellA.value = cat.index;
      cellA.font = { name: '宋体', size: 11 };
      cellA.alignment = { horizontal: 'center', vertical: 'middle' };
      cellA.border = thinBorder;

      // 开票内容
      const cellB = r.getCell(2);
      cellB.value = cat.invoiceContent;
      cellB.font = { name: '宋体', size: 11 };
      cellB.alignment = { horizontal: 'center', vertical: 'middle' };
      cellB.border = thinBorder;

      // 费用项名称
      const cellC = r.getCell(3);
      cellC.value = item.feeItemName;
      cellC.font = { name: '宋体', size: 11 };
      cellC.alignment = { horizontal: 'left', vertical: 'middle' };
      cellC.border = thinBorder;

      // 开票金额
      const cellD = r.getCell(4);
      cellD.value = item.amount;
      cellD.numFmt = '#,##0.00';
      cellD.font = { name: '宋体', size: 11 };
      cellD.alignment = { horizontal: 'center', vertical: 'middle' };
      cellD.border = thinBorder;

      // 备注（明细为空）
      const cellE = r.getCell(5);
      cellE.value = '';
      cellE.border = thinBorder;

      curRowIdx++;
    }

    // 大类小计行
    const subtotalRow = ws1.getRow(curRowIdx);
    subtotalRow.height = 20;

    const subCellA = subtotalRow.getCell(1);
    subCellA.value = cat.index;
    subCellA.font = { name: '宋体', size: 11 };
    subCellA.alignment = { horizontal: 'center', vertical: 'middle' };
    subCellA.border = thinBorder;

    const subCellB = subtotalRow.getCell(2);
    subCellB.value = `${cat.invoiceContent} 汇总`;
    subCellB.font = { name: '宋体', size: 11, bold: true };
    subCellB.alignment = { horizontal: 'center', vertical: 'middle' };
    subCellB.border = thinBorder;

    const subCellC = subtotalRow.getCell(3);
    subCellC.value = '';
    subCellC.border = thinBorder;

    const subCellD = subtotalRow.getCell(4);
    // 使用 SUBTOTAL 公式（9 表示 SUM，自动忽略包含的其他 SUBTOTAL，完美兼容总计）
    subCellD.value = {
      formula: `SUBTOTAL(9,D${startRow}:D${curRowIdx - 1})`,
      result: cat.subtotal
    };
    subCellD.numFmt = '#,##0.00';
    subCellD.font = { name: '宋体', size: 11, bold: true };
    subCellD.alignment = { horizontal: 'center', vertical: 'middle' };
    subCellD.border = thinBorder;

    const subCellE = subtotalRow.getCell(5);
    subCellE.value = cat.remark || '';
    subCellE.font = { name: '宋体', size: 11, bold: true };
    subCellE.alignment = { horizontal: 'center', vertical: 'middle' };
    subCellE.border = thinBorder;

    // 合并序号 A列 (包括小计行)
    if (curRowIdx > startRow) {
      ws1.mergeCells(`A${startRow}:A${curRowIdx}`);
    }
    // 合并开票内容 B列 (仅明细行，不包括小计行)
    if (curRowIdx - 1 > startRow) {
      ws1.mergeCells(`B${startRow}:B${curRowIdx - 1}`);
    }

    curRowIdx++;
  }

  // 最后一行: 总计行
  const totalRow = ws1.getRow(curRowIdx);
  totalRow.height = 20;

  const totA = totalRow.getCell(1);
  totA.value = '';
  totA.border = thinBorder;

  const totB = totalRow.getCell(2);
  totB.value = '总计';
  totB.font = { name: '宋体', size: 11, bold: true };
  totB.alignment = { horizontal: 'center', vertical: 'middle' };
  totB.border = thinBorder;

  const totC = totalRow.getCell(3);
  totC.value = '';
  totC.border = thinBorder;

  const totD = totalRow.getCell(4);
  totD.value = {
    formula: `SUBTOTAL(9,D3:D${curRowIdx - 1})`,
    result: totalAmount
  };
  totD.numFmt = '#,##0.00';
  totD.font = { name: '宋体', size: 11, bold: true };
  totD.alignment = { horizontal: 'center', vertical: 'middle' };
  totD.border = thinBorder;

  const totE = totalRow.getCell(5);
  totE.value = '';
  totE.border = thinBorder;


  // ==========================================
  // SHEET 2: 2. 费用明细打印
  // ==========================================
  const ws2 = workbook.addWorksheet('2. 费用明细打印');
  ws2.columns = [
    { key: 'flowNo', width: 24 },
    { key: 'billNo', width: 23 },
    { key: 'billGenDate', width: 17 },
    { key: 'feeItemName', width: 28 },
    { key: 'invoiceContent', width: 18 },
    { key: 'docDate', width: 17 },
    { key: 'amount', width: 16 }
  ];

  // 行 1: 标题
  const ws2Row1 = ws2.getRow(1);
  ws2Row1.height = 43;
  for (let c = 1; c <= 7; c++) {
    const cell = ws2Row1.getCell(c);
    cell.value = titleText;
    cell.font = { name: '宋体', size: 12, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
  }
  ws2.mergeCells('A1:G1');

  // 行 2: 表头
  const ws2Row2 = ws2.getRow(2);
  ws2Row2.height = 30;
  const headers2 = ['待开票流水主单号', '对账单号', '账单生成时间', '费用项名称', '开票内容', '单据日期', '开票金额'];
  headers2.forEach((h, i) => {
    const cell = ws2Row2.getCell(i + 1);
    cell.value = h;
    cell.font = { name: '宋体', size: 11, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF2F2F2' }
    };
  });

  let ws2CurRow = 3;
  for (const d of (detailRows || [])) {
    const r = ws2.getRow(ws2CurRow);
    r.height = 20;

    const c1 = r.getCell(1);
    c1.value = d.flowNo;
    c1.alignment = { horizontal: 'center', vertical: 'middle' };
    c1.border = thinBorder;

    const c2 = r.getCell(2);
    c2.value = d.billNo;
    c2.alignment = { horizontal: 'center', vertical: 'middle' };
    c2.border = thinBorder;

    const c3 = r.getCell(3);
    c3.value = d.billGenDate;
    c3.alignment = { horizontal: 'center', vertical: 'middle' };
    c3.border = thinBorder;

    const c4 = r.getCell(4);
    c4.value = d.feeItemName;
    c4.alignment = { horizontal: 'left', vertical: 'middle' };
    c4.border = thinBorder;

    const c5 = r.getCell(5);
    c5.value = d.invoiceContent;
    c5.alignment = { horizontal: 'center', vertical: 'middle' };
    c5.border = thinBorder;

    const c6 = r.getCell(6);
    c6.value = d.docDate;
    c6.alignment = { horizontal: 'center', vertical: 'middle' };
    c6.border = thinBorder;

    const c7 = r.getCell(7);
    c7.value = d.amount;
    c7.numFmt = '#,##0.00';
    c7.alignment = { horizontal: 'center', vertical: 'middle' };
    c7.border = thinBorder;

    ws2CurRow++;
  }

  // 明细末尾合计行
  const ws2TotRow = ws2.getRow(ws2CurRow);
  ws2TotRow.height = 20;
  for (let c = 1; c <= 7; c++) {
    const cell = ws2TotRow.getCell(c);
    cell.border = thinBorder;
  }
  const ws2LabelCell = ws2TotRow.getCell(4);
  ws2LabelCell.value = '合计';
  ws2LabelCell.font = { name: '宋体', size: 11, bold: true };
  ws2LabelCell.alignment = { horizontal: 'center', vertical: 'middle' };

  const ws2ValCell = ws2TotRow.getCell(7);
  ws2ValCell.value = {
    formula: `SUM(G3:G${ws2CurRow - 1})`,
    result: totalAmount
  };
  ws2ValCell.numFmt = '#,##0.00';
  ws2ValCell.font = { name: '宋体', size: 11, bold: true };
  ws2ValCell.alignment = { horizontal: 'center', vertical: 'middle' };


  // ==========================================
  // SHEET 3: 开票流水单据列表 (原始数据备份)
  // ==========================================
  if (Array.isArray(rawRows) && rawRows.length > 0) {
    const ws3 = workbook.addWorksheet('开票流水单据列表');
    const rawHeaders = [
      '待开票流水主单号', '对账单号', '销方', '购方', '费用项编码', '费用项名称',
      '开票内容', '税收分类编码', '日期', '币种', '开票金额', '待开票金额',
      '已开票金额', '申请日期', '开票状态', '发票分类'
    ];
    ws3.addRow(rawHeaders);
    const rHead = ws3.getRow(1);
    rHead.font = { bold: true };

    for (const r of rawRows) {
      ws3.addRow([
        r.flowNo, r.billNo, r.seller, r.buyer, r.feeCode, r.feeItemName,
        r.invoiceContent, r.taxCode, r.date, r.currency, r.amount, r.pendingAmount,
        r.invoicedAmount, r.applyDate, r.status, r.category
      ]);
    }
  }

  await workbook.xlsx.writeFile(targetPath);
  return {
    filePath: targetPath,
    totalAmount
  };
}

module.exports = {
  DEFAULT_FEE_CATEGORY_REMARKS,
  DEFAULT_CATEGORY_ORDER,
  parsePlatformFeeFile,
  calculatePlatformFeeSummary,
  exportPlatformFeeExcel
};
