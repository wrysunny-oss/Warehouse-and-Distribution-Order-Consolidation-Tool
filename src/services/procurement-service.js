'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { cleanText, numberValue } = require('../core');
const {
  formatDate,
  addDays,
  loadProductCatalog,
  matchProduct,
  extractDemandItems,
  buildDemandWorkbook,
  parseReceiptNoteForDemand,
  parseTable3ForDemand
} = require('../procurement-demand');
const { loadProductPreset } = require('../product-preset');
const { loadWarehousePreset, matchWarehouseFactory } = require('../warehouse-preset');

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

/**
 * 执行采购需求表推导业务
 */
async function processProcurementTask({
  inputFilePath,
  title,
  outputDir
}) {
  if (!inputFilePath || !fs.existsSync(inputFilePath)) {
    throw new Error('采购需求数据源文件不存在');
  }
  if (!outputDir) {
    outputDir = path.dirname(inputFilePath);
  }
  fs.mkdirSync(outputDir, { recursive: true });

  // 1. 尝试解析为 ReceiptNote，若不符合则尝试解析为表三
  let parsed;
  try {
    parsed = await parseReceiptNoteForDemand(inputFilePath);
  } catch (err) {
    try {
      parsed = await parseTable3ForDemand(inputFilePath);
    } catch {
      throw new Error(`无法识别此文件格式：${err.message}`);
    }
  }

  const rows = parsed?.rows || [];
  if (!rows.length) {
    throw new Error('未在文件中解析到有效的采购明细行');
  }

  // 2. 加载仓库预设和商品预设
  const warehousePreset = await loadWarehousePreset();
  const productPreset = await loadProductPreset();
  const catalog = await loadProductCatalog(productPreset.rows);

  // 3. 构建默认仓库米厂与日期配置
  const warehouseConfigs = {};
  const today = formatDate(new Date());
  const defaultPickup = addDays(today, 1);
  const defaultInbound = addDays(defaultPickup, 1);

  for (const r of rows) {
    const wh = cleanText(r.warehouse || r['仓库名称']);
    const brand = cleanText(r.brand || r['品牌名称']);
    if (!wh || warehouseConfigs[wh]) continue;

    const matchedFactory = matchWarehouseFactory(wh, warehousePreset.rows, brand);
    const rowInboundDate = cleanText(r.inboundDate || r['预约入库时间'] || '');
    const inboundDate = rowInboundDate || defaultInbound;
    const pickupDate = rowInboundDate ? addDays(rowInboundDate, -1) : defaultPickup;

    warehouseConfigs[wh] = {
      factory: matchedFactory,
      pickupDate,
      inboundDate
    };
  }

  // 4. 提取需求项并校验
  const items = extractDemandItems({ rows, catalog, warehouseConfigs });
  if (!items.length) {
    throw new Error('经过商品匹配与过滤后，没有需求数量大于 0 的商品明细可供导出');
  }

  // 5. 生成 Excel
  const resolvedTitle = cleanText(title) || `国宝 采购需求一览表${new Date().getFullYear()}年`;
  const defaultFileName = `${resolvedTitle.replace(/[\\/*?:\[\]]/g, '_')}.xlsx`;
  const targetOutputPath = availableFilePath(outputDir, defaultFileName);

  const workbook = await buildDemandWorkbook({ items, title: resolvedTitle });
  await workbook.xlsx.writeFile(targetOutputPath);

  const warehouseCount = new Set(items.map((i) => i.warehouse)).size;
  const totalQty = items.reduce((sum, item) => sum + (numberValue(item.quantity) || 0), 0);

  const summaryText = `采购需求表已生成！共汇总 ${warehouseCount} 个仓库、${items.length} 条需求明细，合计需求件数 ${totalQty}。`;

  return {
    success: true,
    filePath: targetOutputPath,
    fileName: path.basename(targetOutputPath),
    warehouseCount,
    itemCount: items.length,
    totalQty,
    summaryText
  };
}

module.exports = {
  processProcurementTask
};
