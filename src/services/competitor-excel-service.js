'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');

/**
 * 带有超时控制的轻量图片下载器
 */
async function fetchImageBuffer(url, timeoutMs = 4500) {
  if (!url || typeof url !== 'string') return null;
  let targetUrl = url.trim();
  if (targetUrl.startsWith('//')) targetUrl = 'https:' + targetUrl;
  if (!targetUrl.startsWith('http')) return null;
  let timeout;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    });
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 生成 1x1 透明/白色备用占位图片 Buffer (PNG)
 */
function createFallbackImageBuffer() {
  // 最小合法 1x1 灰色点 PNG Buffer
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    'base64'
  );
}

/**
 * 导出与用户目标格式完全一致的竞品分析 Excel
 */
async function exportCompetitorAnalysisExcel(items = [], outputPath) {
  const { weightKg, unitPrice, reviewKind, summarize } = await import('../shared/competitor-analysis.mjs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '仓配订单汇总工具 - 市场竞品洞察';
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const sheet = workbook.addWorksheet('淘工厂大米Top20竞品分析', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  // 表头定义
  const headers = [
    '排名', '米种', '规格', '包装类型', '前台标价', '券后到手价', 
    '是否包邮', '发货时效', '主图+标题', '销量', '高频差评', '备注',
    '总重量(kg)', '元/kg(不含运费)', '评价来源', '数据类型'
  ];
  sheet.addRow(headers);

  // 列宽配置
  const widths = [8, 14, 12, 14, 12, 14, 12, 14, 46, 14, 30, 16, 14, 20, 14, 14];
  sheet.columns.forEach((column, index) => {
    column.width = widths[index] || 15;
  });

  // 表头样式 (参考用户截图的淡绿底色或深灰底色)
  const headerRow = sheet.getRow(1);
  headerRow.height = 32;
  headerRow.font = { bold: true, color: { argb: 'FF1C352D' }, size: 11 };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE2EEEA' }
  };

  // 批量并发拉取前 20 张商品主图
  const imageBuffers = await Promise.all(
    items.map(item => fetchImageBuffer(item.imageUrl))
  );

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const rowIndex = i + 2;

    const row = sheet.addRow([
      item.rank ?? (i + 1),
      item.variety || '',
      item.spec || '',
      item.packaging || '',
      item.originalPrice ? Number(item.originalPrice) : '',
      item.finalPrice ? Number(item.finalPrice) : '',
      item.freeShipping || '未采集',
      item.shippingTime || '未采集',
      item.title || '',
      item.sales || '',
      item.negativeReviews || '',
      item.remark || (item.isSameLink ? '同一个链接' : ''),
      weightKg(item.spec),
      unitPrice(item) == null ? '' : { formula: `F${rowIndex}/M${rowIndex}`, result: unitPrice(item) },
      reviewKind(item),
      item.source === 'sample' ? '示例（非实测）' : '导入 / 采集'
    ]);

    row.height = 76; // 为主图缩略图留出充足高度

    // 单元格对齐与边框配置
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE6ECE9' } },
        bottom: { style: 'thin', color: { argb: 'FFE6ECE9' } },
        left: { style: 'thin', color: { argb: 'FFE6ECE9' } },
        right: { style: 'thin', color: { argb: 'FFE6ECE9' } }
      };

      // 文本类默认居中，标题与差评靠左换行
      if (colNumber === 9) { // 主图+标题
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 9 };
        if (item.link) {
          cell.value = {
            text: item.title,
            hyperlink: item.link,
            tooltip: '点击直达淘宝原宝贝页面'
          };
          cell.font = { color: { argb: 'FF0D5239' }, underline: false };
        }
      } else if (colNumber === 11) { // 高频差评
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }

      // 价格列数字格式化
      if ([5, 6, 13, 14].includes(colNumber)) {
        cell.numFmt = '0.00';
      }
    });

    // 券后到手价字体加粗标绿
    const finalPriceCell = row.getCell(6);
    finalPriceCell.font = { bold: true, color: { argb: 'FF15803D' }, size: 11 };

    // 插入主图 (放在第 9 列即 I 列左侧)
    const imgBuf = imageBuffers[i] || createFallbackImageBuffer();
    try {
      const ext = !imageBuffers[i] || imgBuf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'png' : 'jpeg';
      const imageId = workbook.addImage({
        buffer: imgBuf,
        extension: ext
      });

      sheet.addImage(imageId, {
        tl: { col: 8.08, row: rowIndex - 0.92 },
        ext: { width: 62, height: 62 },
        editAs: 'oneCell'
      });
    } catch (err) {
      console.warn(`[CompetitorExcel] 插入图片失败（行 ${rowIndex}）:`, err.message);
    }
  }

  // 开启自动筛选
  sheet.autoFilter = { from: 'A1', to: `P${sheet.rowCount}` };

  const metrics = summarize(items);
  const summary = workbook.addWorksheet('分析概览');
  summary.columns = [{ width: 28 }, { width: 70 }];
  summary.addRows([
    ['指标', '导出范围统计'],
    ['商品数 / 独立链接', `${metrics.totalCount} / ${metrics.uniqueLinks}`],
    ['已知到手均价（元）', metrics.avgPrice],
    ['已知最低到手价（元）', metrics.minPrice],
    ['每公斤单价中位数（元/kg）', metrics.medianUnit],
    ['可比价商品数', metrics.comparableCount],
    ['缺少价格商品数', metrics.missingPrices],
    ['含采集评价商品数', metrics.collectedReviews],
    ['已读样本含负面反馈商品数', metrics.negativeReviewProducts],
    ['示例商品数', metrics.sampleCount],
    ['统计口径', '统计当前导出范围；缺失值不补估；单价不含运费；评价主题不含示例、人工记录与待核实内容。'],
    ['款式定位', '按同链接价差及到手价作初步判断，仅供参考；利润款需人工结合成本判断。']
  ]);
  summary.getRow(1).font = { bold: true, color: { argb: 'FF1C352D' } };
  summary.getRow(1).fill = headerRow.fill;
  summary.eachRow(row => { row.alignment = { vertical: 'middle', wrapText: true }; row.height = 32; });
  summary.getRow(10).height = 48;

  const collection = workbook.addWorksheet('采集明细');
  collection.addRow(['排名', '商品标题', '链接', 'SKU ID', '详情状态', '价格口径', '评价状态', '采集说明', '采集时间（UTC）']);
  collection.columns = [8, 45, 42, 24, 16, 36, 38, 80, 28].map(width => ({ width }));
  for (const item of items) collection.addRow([
    item.rank, item.title, item.link || '', item.skuId || '', item.detailStatus || '未记录详情补采',
    item.priceBasis || '来源未记录，价格需核实', item.reviewStatus || reviewKind(item), item.detailMessage || '', item.collectedAt || ''
  ]);
  collection.views = [{ state: 'frozen', ySplit: 1 }];
  collection.autoFilter = { from: 'A1', to: `I${collection.rowCount}` };
  collection.getRow(1).font = headerRow.font;
  collection.getRow(1).fill = headerRow.fill;
  collection.eachRow(row => { row.alignment = { vertical: 'middle', wrapText: true }; row.height = 48; });

  const reviewsSheet = workbook.addWorksheet('全部评价');
  reviewsSheet.columns = [8, 42, 22, 24, 80, 65, 38, 22, 18].map(width => ({ width }));
  reviewsSheet.addRow(['商品排名', '商品标题', '商品 ID', '评价 ID', '评价全文', '追评', '购买规格', '评价时间', '采集完整性']);
  for (const item of items) for (const review of item.reviews || []) {
    reviewsSheet.addRow([item.rank, item.title, item.itemId || '', review.id || '', review.content || '', review.appendContent || '', review.sku || '', review.date || '', item.reviewStatus || (item.reviewComplete ? '全部评价列表已读完' : '部分评价，未读完')]);
  }
  reviewsSheet.views = [{ state: 'frozen', ySplit: 1 }];
  reviewsSheet.autoFilter = { from: 'A1', to: `I${reviewsSheet.rowCount}` };
  reviewsSheet.getRow(1).font = headerRow.font;
  reviewsSheet.getRow(1).fill = headerRow.fill;
  reviewsSheet.eachRow(row => { row.alignment = { vertical: 'middle', wrapText: true }; row.height = 64; });
  await workbook.xlsx.writeFile(outputPath);
  return { ok: true, filePath: outputPath, rowCount: items.length };
}

module.exports = {
  fetchImageBuffer,
  exportCompetitorAnalysisExcel
};
