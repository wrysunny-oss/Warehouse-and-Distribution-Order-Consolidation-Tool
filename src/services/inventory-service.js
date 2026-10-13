'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { analyzeInventoryUpdate, writeInventoryUpdate } = require('../inventory-update');

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
 * 执行库存更新业务
 */
async function processInventoryTask({
  table3FilePath,
  inventoryFilePaths = [],
  transitFilePath,
  outputDir
}) {
  if (!table3FilePath || !fs.existsSync(table3FilePath)) {
    throw new Error('旧表三文件不存在，请提供有效的表三 Excel 文件');
  }
  const validInventories = (Array.isArray(inventoryFilePaths) ? inventoryFilePaths : [inventoryFilePaths])
    .filter((p) => p && fs.existsSync(p));

  const validTransit = transitFilePath && fs.existsSync(transitFilePath) ? transitFilePath : undefined;

  if (!validInventories.length && !validTransit) {
    throw new Error('实时库存文件与在途明细文件请至少提供一种');
  }

  if (!outputDir) {
    outputDir = path.dirname(table3FilePath);
  }
  fs.mkdirSync(outputDir, { recursive: true });

  const ext = path.extname(table3FilePath) || '.xlsx';
  const baseName = path.basename(table3FilePath, ext);
  const tag = validTransit ? '库存及在途已更新' : '良品可用已更新';
  const outFileName = `${baseName}-${tag}${ext}`;
  const targetOutputPath = availableFilePath(outputDir, outFileName);

  const analysis = await writeInventoryUpdate(
    table3FilePath,
    validInventories,
    targetOutputPath,
    validTransit
  );

  const summaryParts = [];
  summaryParts.push(`已成功更新表三良品可用数据（匹配成功 ${analysis.matchedRows} 项，变更写入 ${analysis.changedRows} 项）`);
  if (analysis.hasTransit) {
    summaryParts.push(`已自动追加在途明细汇总列（涉及 ${analysis.updatedWarehouses?.length || 0} 个仓库）`);
  }
  if (analysis.preservedRows > 0) {
    summaryParts.push(`注意：有 ${analysis.preservedRows} 项未在实时库存中找到对应货品，已保留原值`);
  }

  return {
    success: true,
    filePath: targetOutputPath,
    fileName: path.basename(targetOutputPath),
    analysis: {
      ...analysis,
      matchedCount: analysis.matchedRows
    },
    summaryText: summaryParts.join('；') + '。'
  };
}

module.exports = {
  processInventoryTask
};
