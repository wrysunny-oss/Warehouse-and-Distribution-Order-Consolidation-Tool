'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * 快速读取工作簿首行表头（支持 xlsx / csv）
 */
async function inspectFirstRowHeaders(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }
  const ext = path.extname(filePath).toLowerCase();
  
  if (ext === '.csv') {
    const content = fs.readFileSync(filePath, 'utf8');
    const firstLine = content.split(/\r?\n/).find((line) => line.trim().length > 0) || '';
    const headers = firstLine.split(',').map((item) => cleanText(item.replace(/^["']|["']$/g, '')));
    return { sheetName: 'CSV', headers };
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return { sheetName: '', headers: [] };
  }

  const headers = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    let val = cell.value;
    if (val && typeof val === 'object') {
      if ('result' in val) val = val.result;
      else if ('text' in val) val = val.text;
      else if ('richText' in val) val = val.richText.map((t) => t.text).join('');
    }
    headers[colNumber - 1] = cleanText(val);
  });

  return { sheetName: worksheet.name, headers: headers.filter(Boolean) };
}

/**
 * 根据表头特征判断文件类型
 */
function classifyHeaders(headers) {
  const headerSet = new Set(headers.map((h) => cleanText(h)));
  const has = (keyword) => headers.some((h) => h.includes(keyword));
  const hasExact = (name) => headerSet.has(name);

  // 1. 平台费用核销（具有待开票流水主单号、费用项名称/编码、费用明细、核销流水等特征）
  if (
    has('待开票流水') ||
    has('核销流水') ||
    has('费用项名称') ||
    has('费用项编码') ||
    has('费用明细') ||
    (has('结算金额') && has('账单编号'))
  ) {
    return {
      type: 'platform-fee',
      name: '平台费用流水表',
      description: '包含平台费用流水账单，用于费用核销汇总计算',
      confidence: 0.95
    };
  }

  // 2. 开票通知单 / 对账单（必须包含发票方向或包含对账单/费用类型/开票流水）
  if (has('发票方向') || (has('对账单') && has('费用类型')) || (has('费用类型') && has('开票流水'))) {
    return {
      type: 'reconciliation',
      name: '天猫超市对账单',
      description: '包含费用类型、发票方向等字段，用于开票通知单汇总',
      confidence: 0.95
    };
  }

  // 3. 表三（汇总表 / 旧表三）
  if (
    hasExact('良品可用') &&
    (hasExact('在库良品非锁定库存件数') || hasExact('最近1天出库件数') || hasExact('实际订单安排') || hasExact('安排状态'))
  ) {
    return {
      type: 'table3',
      name: '表三（汇总表/旧表三）',
      description: '已生成的表三格式，包含良品可用、出库件数、实际订单安排等',
      confidence: 0.98
    };
  }

  // 4. 库存在途明细
  if ((has('在途') || has('待收货')) && (has('货品') || has('商品') || has('物理仓') || has('仓库'))) {
    return {
      type: 'in-transit',
      name: '库存在途明细表',
      description: '包含各仓各货品的在途数量明细',
      confidence: 0.92
    };
  }

  // 5. 实时库存表
  if (
    (has('良品可用') || has('在库良品库存件数') || has('库存总件数')) &&
    (has('物理仓') || has('仓库')) &&
    !hasExact('实际订单安排')
  ) {
    return {
      type: 'realtime-inventory',
      name: '实时库存表',
      description: '从仓储系统导出的最新良品可用/在库件数数据',
      confidence: 0.94
    };
  }

  // 6. 入库明细 / ReceiptNote
  if (
    (has('到货单号') || has('入库单号') || has('交货单号') || has('采购单') || has('发货单号') || has('LBX号')) &&
    (has('商品实际发货数量') || has('发货数量') || has('收货数量') || has('采购规格(箱规数)'))
  ) {
    return {
      type: 'receipt-note',
      name: 'ReceiptNote / 入库明细表',
      description: '包含发货单号/LBX号、仓库、发货数量、箱规等，用于送货单或采购需求推导',
      confidence: 0.96
    };
  }

  // 7. 送货单 / 订单数据 (表一)
  if (
    (has('物理仓名称') || has('仓库名称')) &&
    (has('采购数量') || has('系统订单') || has('订单数量')) &&
    (has('货品名称') || has('品牌名称'))
  ) {
    return {
      type: 'delivery-note',
      name: '送货单 / 订单数据表',
      description: '包含物理仓、货品、采购数量等，用于汇总各仓订单',
      confidence: 0.95
    };
  }

  // 8. 商品主数据 / product 商品表
  if (
    has('订单简称') ||
    (has('货品名称') && !has('发货数量') && !has('采购数量') && (has('净重') || has('箱规') || has('条码') || has('条形码') || has('外包装代码')))
  ) {
    return {
      type: 'product-catalog',
      name: 'product 商品主数据表',
      description: '包含货品规格、净重、箱规、条码、订单简称等基础档案',
      confidence: 0.9
    };
  }

  return {
    type: 'unknown',
    name: '未知表格格式',
    description: `无法自动匹配特征，识别到的表头字段：${headers.slice(0, 6).join('、')}`,
    confidence: 0.1
  };
}

/**
 * 自动嗅探 Excel / CSV 文件
 */
async function sniffExcelFile(filePath) {
  const { sheetName, headers } = await inspectFirstRowHeaders(filePath);
  const classification = classifyHeaders(headers);
  return {
    filePath,
    fileName: path.basename(filePath),
    sheetName,
    headers,
    ...classification
  };
}

module.exports = {
  inspectFirstRowHeaders,
  classifyHeaders,
  sniffExcelFile
};
