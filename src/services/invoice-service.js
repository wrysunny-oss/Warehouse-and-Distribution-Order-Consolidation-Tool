'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  DEFAULT_INVOICE_CONFIG,
  readStoredInvoiceConfig,
  parseReconciliationFiles,
  calculateInvoiceSummary,
  exportInvoiceNotificationWorkbook,
  formatTodayDate
} = require('../invoice-summary');
const { loadProductPreset } = require('../product-preset');

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
 * 执行开票通知单业务
 */
async function processInvoiceTask({
  reconciliationFilePaths,
  config = {},
  selectedFeeTypes,
  selectedInvoiceDirs,
  outputDir
}) {
  const validFiles = (Array.isArray(reconciliationFilePaths) ? reconciliationFilePaths : [reconciliationFilePaths])
    .filter((p) => p && fs.existsSync(p));

  if (!validFiles.length) {
    throw new Error('未提供有效的天猫超市对账单文件');
  }

  if (!outputDir) {
    outputDir = path.dirname(validFiles[0]);
  }
  fs.mkdirSync(outputDir, { recursive: true });

  const parsed = await parseReconciliationFiles(validFiles);
  if (!parsed.rows || !parsed.rows.length) {
    throw new Error('对账单中未解析到有效明细流水');
  }

  const preset = await loadProductPreset();
  const summary = calculateInvoiceSummary(parsed.rows, {
    selectedFeeTypes: selectedFeeTypes || parsed.availableFeeTypes,
    selectedInvoiceDirs: selectedInvoiceDirs || parsed.availableInvoiceDirs,
    presetRows: preset.rows
  });

  if (!summary.items || !summary.items.length) {
    throw new Error('筛选计算后没有可开票的商品项目');
  }

  const storedConfig = readStoredInvoiceConfig();
  const finalConfig = {
    ...DEFAULT_INVOICE_CONFIG,
    ...storedConfig,
    ...config,
    date: config.date || formatTodayDate()
  };

  const outName = `开票通知单_${finalConfig.date}.xlsx`;
  const targetOutputPath = availableFilePath(outputDir, outName);

  await exportInvoiceNotificationWorkbook({
    items: summary.items,
    config: finalConfig,
    outputPath: targetOutputPath
  });

  const totalAmount = typeof summary.totalAmount === 'number' ? summary.totalAmount : 0;
  const summaryText = `开票通知单生成成功！共计 ${summary.items.length} 种商品，开票总金额为 ¥${totalAmount.toFixed(2)}。`;

  return {
    success: true,
    filePath: targetOutputPath,
    fileName: path.basename(targetOutputPath),
    itemCount: summary.items.length,
    totalAmount,
    summaryText
  };
}

module.exports = {
  processInvoiceTask
};
