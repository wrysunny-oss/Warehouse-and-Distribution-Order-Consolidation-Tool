'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  DEFAULT_FEE_CATEGORY_REMARKS,
  readStoredPlatformFeeConfig,
  parsePlatformFeeFile,
  calculatePlatformFeeSummary,
  exportPlatformFeeExcel
} = require('../platform-fee');

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
 * 执行平台费用核销业务
 */
async function processPlatformFeeTask({
  feeFilePath,
  categoryRemarks,
  buyerShortName,
  sellerName,
  periodText,
  outputDir
}) {
  if (!feeFilePath || !fs.existsSync(feeFilePath)) {
    throw new Error('平台费用流水账单文件不存在');
  }

  if (!outputDir) {
    outputDir = path.dirname(feeFilePath);
  }
  fs.mkdirSync(outputDir, { recursive: true });

  const parsed = await parsePlatformFeeFile(feeFilePath);
  if (!parsed.rows || !parsed.rows.length) {
    throw new Error('未在账单文件中提取到有效的流水明细记录');
  }

  const storedConfig = readStoredPlatformFeeConfig();
  const activeCategoryRemarks = categoryRemarks || storedConfig?.categoryRemarks || DEFAULT_FEE_CATEGORY_REMARKS;

  const summaryResult = calculatePlatformFeeSummary(parsed.rows, {
    buyerShortName: buyerShortName || parsed.defaultBuyerShort || '国宝',
    sellerName: sellerName || parsed.defaultSeller || '浙江天猫供应链管理有限公司',
    periodText: periodText || parsed.defaultPeriodText || '',
    categoryRemarks: activeCategoryRemarks
  });

  const ext = path.extname(feeFilePath) || '.xlsx';
  const baseName = path.basename(feeFilePath, ext);
  const outName = `${baseName}-费用核销汇总.xlsx`;
  const targetOutputPath = availableFilePath(outputDir, outName);

  await exportPlatformFeeExcel(summaryResult, targetOutputPath, parsed.rows);

  const totalRecords = parsed.rows.length;
  const summaryText = `平台费用核销计算完成！共解析 ${totalRecords} 笔流水，合计金额 ¥${summaryResult.totalAmount.toFixed(2)}，涉及 ${summaryResult.categories.length} 个费用大类。`;

  return {
    success: true,
    filePath: targetOutputPath,
    fileName: path.basename(targetOutputPath),
    grandTotal: summaryResult.totalAmount,
    recordCount: totalRecords,
    summaryText
  };
}

module.exports = {
  processPlatformFeeTask
};
