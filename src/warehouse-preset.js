'use strict';

const path = require('node:path');
const fs = require('node:fs');
const ExcelJS = require('exceljs');
const { cleanText } = require('./core');

const DEFAULT_WAREHOUSE_PRESETS = [
  { id: 1, region: '华东仓', warehouseCode: 'HGH101', warehouseName: '华东杭州直营商超仓', logicCode: 'LHGH001', logicName: '杭州商超逻辑1仓', factory: '宏禾米厂', note: '', inStats: true },
  { id: 2, region: '华东仓', warehouseCode: 'HFE101', warehouseName: '华东合肥直营商超仓', logicCode: 'LHFE001', logicName: '合肥商超逻辑1仓', factory: '宏禾米厂', note: '', inStats: true },
  { id: 3, region: '华东仓', warehouseCode: 'ALOG-0001', warehouseName: '华东嘉定直营商超仓', logicCode: 'LSHA001', logicName: '上海商超逻辑1仓', factory: '宏禾米厂', note: '', inStats: true },
  { id: 4, region: '华东仓', warehouseCode: 'STORE_12005465', warehouseName: '华东嘉兴直营商超A仓', logicCode: 'LJIX001', logicName: '嘉兴商超逻辑1仓', factory: '宏禾米厂', note: '', inStats: true },
  { id: 5, region: '华东仓', warehouseCode: 'STORE_757914', warehouseName: '华东金义直营商超仓', logicCode: 'LJHA001', logicName: '金华商超逻辑1仓', factory: '宏禾米厂', note: '', inStats: true },
  { id: 6, region: '华东仓', warehouseCode: 'NKG101', warehouseName: '华东南京直营商超仓', logicCode: 'LNKG001', logicName: '南京商超逻辑1仓', factory: '宏禾米厂', note: '', inStats: true },
  { id: 7, region: '华东仓', warehouseCode: 'WUX101', warehouseName: '华东无锡直营商超仓', logicCode: 'LWUX001', logicName: '无锡商超逻辑1仓', factory: '宏禾米厂', note: '', inStats: true },
  { id: 8, region: '华东仓', warehouseCode: 'PIH101', warehouseName: '华东嘉兴返退中心仓', logicCode: 'LJIX008', logicName: '嘉兴商超逻辑8仓', factory: '宏禾米厂', note: '华东区域退货仓', inStats: false },
  { id: 9, region: '华南仓', warehouseCode: 'DGM105', warehouseName: '华南东莞直营商超仓', logicCode: 'LDGM001', logicName: '东莞商超逻辑1仓', factory: '腾三龙米厂', note: '', inStats: true },
  { id: 10, region: '华南仓', warehouseCode: 'ALOG-0002', warehouseName: '华南广州直营商超A仓', logicCode: 'LCAN001', logicName: '广州商超逻辑1仓', factory: '腾三龙米厂', note: '', inStats: true },
  { id: 11, region: '华南仓', warehouseCode: 'HUZ101', warehouseName: '华南惠阳直营商超仓', logicCode: 'LHUZ001', logicName: '惠州商超逻辑1仓', factory: '腾三龙米厂', note: '', inStats: true },
  { id: 12, region: '华南仓', warehouseCode: 'JIM101', warehouseName: '华南江门直营商超仓', logicCode: 'LJIM001', logicName: '江门商超逻辑1仓', factory: '腾三龙米厂', note: '', inStats: true },
  { id: 13, region: '华南仓', warehouseCode: 'HYA101', warehouseName: '华南惠阳返退中心仓', logicCode: 'LHUZ002', logicName: '惠州商超逻辑2仓', factory: '腾三龙米厂', note: '华南区域退货仓', inStats: false },
  { id: 14, region: '西南仓', warehouseCode: 'CTU101', warehouseName: '华西成都直营商超仓', logicCode: 'LCTU001', logicName: '成都商超逻辑1仓', factory: '正点米厂', note: '', inStats: true },
  { id: 15, region: '西南仓', warehouseCode: 'LW_TTCKG0001', warehouseName: '华西猫超重庆RDC仓', logicCode: 'LW_TTCKG0001_LG', logicName: '重庆RDC仓_逻辑仓', factory: '正点米厂', note: '', inStats: true },
  { id: 16, region: '西南仓', warehouseCode: 'CTU108', warehouseName: '华西成都返退中心仓', logicCode: 'LCTU004', logicName: '成都商超逻辑4仓', factory: '正点米厂', note: '西南区域退货仓', inStats: false },
  { id: 17, region: '华中仓', warehouseCode: 'KHN101', warehouseName: '华中南昌直营商超仓', logicCode: 'LKHN001', logicName: '南昌商超逻辑1仓', factory: '宏禾米厂', note: '', inStats: true },
  { id: 18, region: '华中仓', warehouseCode: 'STORE_1228938', warehouseName: '华中武汉直营商超仓', logicCode: 'LWUH001', logicName: '武汉商超逻辑1仓', factory: '青龙米厂', note: '', inStats: true },
  { id: 19, region: '华中仓', warehouseCode: 'CSX101', warehouseName: '华中长沙直营商超仓', logicCode: 'LCSX001', logicName: '长沙商超逻辑1仓', factory: '青龙米厂', note: '', inStats: true },
  { id: 20, region: '华中仓', warehouseCode: 'WUH106', warehouseName: '华中武汉返退中心仓', logicCode: 'LWUH006', logicName: '武汉商超逻辑6仓', factory: '青龙米厂', note: '华中区域退货仓', inStats: false },
  { id: 21, region: '华中仓', warehouseCode: 'WHKC0001', warehouseName: '华中武汉直营集货仓', logicCode: 'LWUH002', logicName: '华中武汉直营集货仓', factory: '青龙米厂', note: '', inStats: false }
];

function normalizeFactory(name) {
  const clean = cleanText(name);
  if (!clean) return '';
  if (clean.includes('宏禾')) return '宏禾米厂';
  if (clean.includes('腾三龙')) return '腾三龙米厂';
  if (clean.includes('正点')) return '正点米厂';
  if (clean.includes('青龙')) return '青龙米厂';
  if (clean.includes('京山') || clean.includes('国宝')) return '京山工厂';
  return clean.endsWith('米厂') || clean.endsWith('工厂') ? clean : `${clean}米厂`;
}

function getWarehousePresetFilePath(customDir) {
  if (customDir) return path.join(customDir, 'warehouse-preset.json');
  try {
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') {
      return path.join(app.getPath('userData'), 'warehouse-preset.json');
    }
  } catch {
    // Fallback in tests
  }
  return path.join(__dirname, '..', 'warehouse-preset.json');
}

function sanitizeWarehouseRow(row, index = 1) {
  const region = cleanText(row.region || row['区域']);
  const warehouseCode = cleanText(row.warehouseCode || row['仓库编码']);
  const warehouseName = cleanText(row.warehouseName || row['仓库名称'] || row['物理仓名称']);
  const logicCode = cleanText(row.logicCode || row['逻辑仓编码']);
  const logicName = cleanText(row.logicName || row['逻辑仓名称']);
  const rawFactory = cleanText(row.factory || row['米厂'] || row['发货地址']);
  const factory = normalizeFactory(rawFactory);
  const note = cleanText(row.note || row['备注']);

  let inStats;
  if (row.inStats !== undefined) {
    inStats = Boolean(row.inStats);
  } else if (row['参与统计'] !== undefined) {
    inStats = Boolean(row['参与统计']);
  } else {
    const isSpecial = note.includes('退货') || warehouseName.includes('返退') || warehouseName.includes('集货');
    inStats = !isSpecial;
  }

  return {
    id: index,
    region,
    warehouseCode,
    warehouseName,
    logicCode,
    logicName,
    factory,
    note,
    inStats,
    '区域': region,
    '仓库编码': warehouseCode,
    '仓库名称': warehouseName,
    '逻辑仓名称': logicName,
    '发货米厂': factory,
    '备注': note,
    '参与统计': inStats
  };
}

async function loadWarehousePreset(customDir) {
  const filePath = getWarehousePresetFilePath(customDir);
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      if (Array.isArray(data.rows)) {
        return {
          rows: data.rows.map((r, i) => sanitizeWarehouseRow(r, i + 1)),
          source: 'preset',
          updatedAt: data.updatedAt || null
        };
      }
    } catch {
      // Fall through to default
    }
  }

  // Fallback to default presets
  const rows = DEFAULT_WAREHOUSE_PRESETS.map((r, i) => sanitizeWarehouseRow(r, i + 1));
  await saveWarehousePreset(rows, customDir);
  return {
    rows,
    source: 'default',
    updatedAt: new Date().toISOString()
  };
}

async function saveWarehousePreset(rows, customDir) {
  const filePath = getWarehousePresetFilePath(customDir);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const sanitized = rows.map((r, i) => sanitizeWarehouseRow(r, i + 1));
  const payload = {
    updatedAt: new Date().toISOString(),
    count: sanitized.length,
    rows: sanitized
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return { ok: true, count: sanitized.length, rows: sanitized };
}

async function resetWarehousePreset(customDir) {
  const rows = DEFAULT_WAREHOUSE_PRESETS.map((r, i) => sanitizeWarehouseRow(r, i + 1));
  await saveWarehousePreset(rows, customDir);
  return { ok: true, count: rows.length, rows };
}

async function importWarehousePresetFromFile(filePath, customDir) {
  const ext = path.extname(filePath).toLowerCase();
  const rows = [];

  if (ext === '.csv') {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) throw new Error('CSV 文件为空。');

    let headerIdx = -1;
    let headers = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('仓库名称') || lines[i].includes('米厂')) {
        headerIdx = i;
        headers = lines[i].split(',').map(cleanText);
        break;
      }
    }
    if (headerIdx === -1) throw new Error('未在 CSV 中找到包含“仓库名称”或“米厂”的表头。');

    const whCol = headers.findIndex((h) => h.includes('仓库名称') || h.includes('物理仓'));
    const facCol = headers.findIndex((h) => h.includes('米厂') || h.includes('发货地址'));
    const regCol = headers.findIndex((h) => h.includes('区域'));
    const codeCol = headers.findIndex((h) => h.includes('仓库编码'));
    const logicCodeCol = headers.findIndex((h) => h.includes('逻辑仓编码'));
    const logicNameCol = headers.findIndex((h) => h.includes('逻辑仓名称'));
    const noteCol = headers.findIndex((h) => h.includes('备注'));

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map(cleanText);
      const whName = parts[whCol] || '';
      if (!whName || whName.includes('序号') || whName.includes('物理仓名称')) continue;

      rows.push(sanitizeWarehouseRow({
        region: regCol >= 0 ? parts[regCol] : '',
        warehouseCode: codeCol >= 0 ? parts[codeCol] : '',
        warehouseName: whName,
        logicCode: logicCodeCol >= 0 ? parts[logicCodeCol] : '',
        logicName: logicNameCol >= 0 ? parts[logicNameCol] : '',
        factory: facCol >= 0 ? parts[facCol] : '',
        note: noteCol >= 0 ? parts[noteCol] : ''
      }, rows.length + 1));
    }
  } else {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error('工作簿中没有有效工作表。');

    let headerRow = null;
    let headers = new Map();
    for (let r = 1; r <= Math.min(10, worksheet.rowCount); r++) {
      const row = worksheet.getRow(r);
      const rowHeaders = new Map();
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        const val = cleanText(cell.text || cell.value);
        if (val) rowHeaders.set(val, col);
      });
      if (rowHeaders.has('仓库名称') || rowHeaders.has('米厂') || rowHeaders.has('物理仓名称')) {
        headerRow = r;
        headers = rowHeaders;
        break;
      }
    }

    if (!headerRow) throw new Error('未在 Excel 中找到包含“仓库名称”或“米厂”的表头。');

    const whCol = headers.get('仓库名称') || headers.get('物理仓名称');
    const facCol = headers.get('米厂') || headers.get('发货地址');
    const regCol = headers.get('区域');
    const codeCol = headers.get('仓库编码');
    const logicCodeCol = headers.get('逻辑仓编码');
    const logicNameCol = headers.get('逻辑仓名称');
    const noteCol = headers.get('备注');

    for (let r = headerRow + 1; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      const whName = cleanText(row.getCell(whCol).text || row.getCell(whCol).value);
      if (!whName || whName.includes('序号') || whName.includes('物理仓名称')) continue;

      rows.push(sanitizeWarehouseRow({
        region: regCol ? cleanText(row.getCell(regCol).text || row.getCell(regCol).value) : '',
        warehouseCode: codeCol ? cleanText(row.getCell(codeCol).text || row.getCell(codeCol).value) : '',
        warehouseName: whName,
        logicCode: logicCodeCol ? cleanText(row.getCell(logicCodeCol).text || row.getCell(logicCodeCol).value) : '',
        logicName: logicNameCol ? cleanText(row.getCell(logicNameCol).text || row.getCell(logicNameCol).value) : '',
        factory: facCol ? cleanText(row.getCell(facCol).text || row.getCell(facCol).value) : '',
        note: noteCol ? cleanText(row.getCell(noteCol).text || row.getCell(noteCol).value) : ''
      }, rows.length + 1));
    }
  }

  if (!rows.length) throw new Error('未在导入的文件中识别到有效仓库行。');
  await saveWarehousePreset(rows, customDir);
  return { ok: true, count: rows.length, rows, fileName: path.basename(filePath) };
}

function matchWarehouseFactory(warehouseName, presetRows = [], brand = '') {
  const targetWh = cleanText(warehouseName);
  if (!targetWh) return '京山工厂';

  // 1. Exact match on warehouseName
  for (const r of presetRows) {
    if (r.warehouseName && r.warehouseName === targetWh) {
      if (r.factory) return r.factory;
    }
  }

  // 2. Partial match on warehouseName or code
  for (const r of presetRows) {
    if (r.warehouseName && (targetWh.includes(r.warehouseName) || r.warehouseName.includes(targetWh))) {
      if (r.factory) return r.factory;
    }
    if (r.warehouseCode && targetWh.includes(r.warehouseCode)) {
      if (r.factory) return r.factory;
    }
  }

  // 3. Fallback based on region keyword
  if (targetWh.includes('华东') || targetWh.includes('杭州') || targetWh.includes('嘉兴') || targetWh.includes('合肥') || targetWh.includes('南京') || targetWh.includes('无锡') || targetWh.includes('金义')) return '宏禾米厂';
  if (targetWh.includes('华南') || targetWh.includes('广州') || targetWh.includes('东莞') || targetWh.includes('惠阳') || targetWh.includes('江门')) return '腾三龙米厂';
  if (targetWh.includes('华西') || targetWh.includes('西南') || targetWh.includes('成都') || targetWh.includes('重庆')) return '正点米厂';
  if (targetWh.includes('华中') || targetWh.includes('武汉') || targetWh.includes('长沙')) {
    if (cleanText(brand).includes('国宝')) return '京山工厂';
    return '青龙米厂';
  }
  return '京山工厂';
}

module.exports = {
  DEFAULT_WAREHOUSE_PRESETS,
  normalizeFactory,
  getWarehousePresetFilePath,
  sanitizeWarehouseRow,
  loadWarehousePreset,
  saveWarehousePreset,
  resetWarehousePreset,
  importWarehousePresetFromFile,
  matchWarehouseFactory
};
