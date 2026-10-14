'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * 智能读取工作簿表头（支持 xlsx / csv，扫描前 8 行以穿透标题大字/合并单元格）
 */
async function inspectFirstRowHeaders(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);

  if (ext === '.csv') {
    const content = fs.readFileSync(filePath, 'utf8');
    const firstLine = content.split(/\r?\n/).find((line) => line.trim().length > 0) || '';
    const headers = firstLine.split(',').map((item) => cleanText(item.replace(/^["']|["']$/g, '')));
    return { sheetName: 'CSV', headers, allHeaders: headers, fileName };
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return { sheetName: '', headers: [], allHeaders: [], fileName };
  }

  let bestHeaders = [];
  const allHeadersSet = new Set();

  const maxRow = Math.min(worksheet.rowCount || 10, 8);
  for (let r = 1; r <= maxRow; r++) {
    const row = worksheet.getRow(r);
    const rowHeaders = [];
    row.eachCell({ includeEmpty: false }, (cell) => {
      let val = cell.value;
      if (val && typeof val === 'object') {
        if ('result' in val) val = val.result;
        else if ('text' in val) val = val.text;
        else if ('richText' in val) val = val.richText.map((t) => t.text).join('');
      }
      const text = cleanText(val);
      if (text && text.length < 50) {
        rowHeaders.push(text);
        allHeadersSet.add(text);
      }
    });

    if (rowHeaders.length > bestHeaders.length) {
      bestHeaders = rowHeaders;
    }
  }

  return {
    sheetName: worksheet.name || '',
    headers: bestHeaders,
    allHeaders: Array.from(allHeadersSet),
    fileName
  };
}

/**
 * 根据表头与文件名、工作表特征精确判断文件类型
 */
function classifyHeaders(headers, allHeaders = [], fileName = '', sheetName = '') {
  const mergedTokens = [...(Array.isArray(headers) ? headers : []), ...(Array.isArray(allHeaders) ? allHeaders : [])];
  const contextStr = `${fileName} ${sheetName} ${mergedTokens.join(' ')}`.toLowerCase();
  const has = (keyword) => mergedTokens.some((h) => h.includes(keyword)) || contextStr.includes(keyword.toLowerCase());
  const hasExact = (name) => mergedTokens.includes(name);

  // 1. 开票通知单 / 对账单核心特征（必须包含独有的发票方向）
  if (has('发票方向')) {
    return {
      type: 'reconciliation',
      name: '天猫超市对账单 / 开票通知单',
      description: '包含发票方向与对账流水，用于开票通知单拆分汇总',
      confidence: 0.98
    };
  }

  // 2. 平台费用核销（具有待开票流水、费用项、费用明细、核销流水等特征，优先于通用发票识别）
  if (
    contextStr.includes('开票流水') ||
    contextStr.includes('核销') ||
    contextStr.includes('平台费用') ||
    has('待开票流水') ||
    has('核销流水') ||
    has('费用项') ||
    has('费用明细') ||
    has('扣款明细') ||
    has('扣款流水') ||
    (has('结算金额') && has('账单编号'))
  ) {
    return {
      type: 'platform-fee',
      name: '平台费用流水表',
      description: '包含平台费用流水账单，用于费用核销汇总计算',
      confidence: 0.98
    };
  }

  // 3. 开票通知单 / 对账单通用特征
  if (
    contextStr.includes('对账') ||
    contextStr.includes('专用发票') ||
    contextStr.includes('开票通知') ||
    (has('对账单') && (has('金额') || has('费用') || has('结算'))) ||
    (has('费用类型') && has('发票'))
  ) {
    return {
      type: 'reconciliation',
      name: '天猫超市对账单 / 开票通知单',
      description: '包含发票流水或对账明细，用于开票通知单拆分汇总',
      confidence: 0.95
    };
  }

  // 3. 入库明细 / ReceiptNote（必须先于在途判断，因为也包含到货时间/数量）
  if (
    contextStr.includes('receiptnote') ||
    contextStr.includes('入库明细') ||
    has('到货单号') ||
    has('入库单号') ||
    has('商品实际发货数量') ||
    (has('采购规格(箱规数)') && has('发货数量'))
  ) {
    return {
      type: 'receipt-note',
      name: 'ReceiptNote / 入库明细表',
      description: '包含发货单号/LBX号、仓库、发货数量、箱规等，用于送货单或采购需求推导',
      confidence: 0.96
    };
  }

  // 4. 采购需求表
  if (
    contextStr.includes('采购需求') ||
    has('需求平台') ||
    has('需求平台/仓') ||
    has('*需求平台/仓*') ||
    ((has('需求数量') || has('*需求数量*')) && has('条形码'))
  ) {
    return {
      type: 'procurement',
      name: '采购需求表',
      description: '包含需求平台/仓、需求数量等，用于大区采购需求汇总',
      confidence: 0.95
    };
  }

  // 5. 表三（汇总表 / 旧表三）
  if (
    contextStr.includes('表三') ||
    contextStr.includes('汇总') ||
    hasExact('实际订单安排') ||
    hasExact('安排状态') ||
    hasExact('最近1天出库件数') ||
    (has('良品可用') && has('在库良品非锁定库存件数'))
  ) {
    return {
      type: 'table3',
      name: '表三（汇总表/旧表三）',
      description: '已生成的表三格式，包含良品可用、出库件数、实际订单安排等',
      confidence: 0.98
    };
  }

  // 6. 实时库存表（必须在送货单前判断）
  if (
    contextStr.includes('实时库存') ||
    ((has('良品可用') || has('在库良品库存件数') || has('库存总件数') || has('在库件数')) &&
      (has('物理仓') || has('仓库') || has('仓库名称')))
  ) {
    return {
      type: 'realtime-inventory',
      name: '实时库存表',
      description: '从仓储系统导出的最新良品可用/在库件数数据',
      confidence: 0.95
    };
  }

  // 7. 库存在途明细
  if (
    contextStr.includes('在途') ||
    has('调拨在途库存件数') ||
    has('采购在途库存件数') ||
    (has('预计到仓时间') && (has('剩余数量') || has('仓储订单（lbx单）') || has('仓库code'))) ||
    ((has('待收货') || has('计划数量')) && (has('货品') || has('仓库') || has('仓储订单')))
  ) {
    return {
      type: 'in-transit',
      name: '库存在途明细表',
      description: '包含各仓各货品的在途/预计到仓数量明细',
      confidence: 0.94
    };
  }

  // 8. 送货单 / 订单数据 (表一)
  if (
    contextStr.includes('deliverynote') ||
    contextStr.includes('送货单') ||
    contextStr.includes('送货清单') ||
    contextStr.includes('分页导出') ||
    (has('送货日期') && has('物流宝单号')) ||
    ((has('物理仓名称') || has('仓库名称') || has('商家送货清单')) &&
      (has('采购数量') || has('系统订单') || has('订单数量') || has('商品条码')))
  ) {
    return {
      type: 'delivery-note',
      name: '送货单 / 订单数据表',
      description: '包含物理仓、货品、采购数量或送货明细，用于汇总各仓订单',
      confidence: 0.95
    };
  }

  // 9. 商品主数据 / product 商品表
  if (
    contextStr.includes('product') ||
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
  const info = await inspectFirstRowHeaders(filePath);
  const classification = classifyHeaders(info.headers, info.allHeaders, info.fileName, info.sheetName);
  return {
    filePath,
    ...info,
    ...classification
  };
}

module.exports = {
  cleanText,
  inspectFirstRowHeaders,
  classifyHeaders,
  sniffExcelFile
};
