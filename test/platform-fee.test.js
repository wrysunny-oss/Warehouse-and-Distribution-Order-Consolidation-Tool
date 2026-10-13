'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ExcelJS = require('exceljs');

const {
  parsePlatformFeeFile,
  calculatePlatformFeeSummary,
  exportPlatformFeeExcel,
  DEFAULT_FEE_CATEGORY_REMARKS
} = require('../src/platform-fee');

test('平台费用核销：解析真实模板中开票流水并准确汇总', async () => {
  const templatePath = path.join(__dirname, '../src/templates/2026.9.22 核销国宝费用发票1张-金额61058.05元.xlsx');
  assert.ok(fs.existsSync(templatePath), '测试模板文件应存在');

  const parsed = await parsePlatformFeeFile(templatePath);
  assert.equal(parsed.rowCount, 38, '应正确提取 38 行流水单据');
  assert.equal(parsed.defaultBuyerShort, '国宝', '默认商家简称应为国宝');
  assert.equal(parsed.defaultSeller, '浙江天猫供应链管理有限公司');

  const summary = calculatePlatformFeeSummary(parsed.rows, {
    buyerShortName: '国宝',
    sellerName: parsed.defaultSeller,
    periodText: '2026.8.11-2026.9.1'
  });

  assert.equal(summary.totalAmount, 61058.05, '费用总金额应为 61058.05 元');
  assert.equal(summary.categories.length, 6, '应聚合为 6 个大类');

  // 验证各大类小计
  const catMap = Object.fromEntries(summary.categories.map(c => [c.invoiceContent, c]));
  
  // 推广服务费
  assert.ok(catMap['推广服务费'], '应包含推广服务费');
  assert.equal(catMap['推广服务费'].subtotal, 38385.85);
  assert.equal(catMap['推广服务费'].remark, '电商市场推广费');
  assert.equal(catMap['推广服务费'].items.length, 10);

  // 客服服务费
  assert.ok(catMap['客服服务费']);
  assert.equal(catMap['客服服务费'].subtotal, 2763.14);
  assert.equal(catMap['客服服务费'].remark, '售后费用');
  assert.equal(catMap['客服服务费'].items.length, 3);

  // 供应链管理服务费
  assert.ok(catMap['供应链管理服务费']);
  assert.equal(catMap['供应链管理服务费'].subtotal, 7446.19);
  assert.equal(catMap['供应链管理服务费'].remark, '售后费用');

  // 集货仓物流费
  assert.ok(catMap['集货仓物流费']);
  assert.equal(catMap['集货仓物流费'].subtotal, 9020.37);
  assert.equal(catMap['集货仓物流费'].remark, '电商物流费');

  // 技术服务费
  assert.ok(catMap['技术服务费']);
  assert.equal(catMap['技术服务费'].subtotal, 555.00);
  assert.equal(catMap['技术服务费'].remark, '电商运营费');

  // 物流服务费
  assert.ok(catMap['物流服务费']);
  assert.equal(catMap['物流服务费'].subtotal, 2887.50);
  assert.equal(catMap['物流服务费'].remark, '电商物流费');

  // 导出验证
  const tmpExportPath = path.join(os.tmpdir(), `test-fee-export-${Date.now()}.xlsx`);
  try {
    await exportPlatformFeeExcel(summary, tmpExportPath, parsed.rows);
    assert.ok(fs.existsSync(tmpExportPath), '导出的 Excel 文件应存在');

    // 重新读回导出的 Excel 并验证 Sheet 结构和单元格
    const verifyWb = new ExcelJS.Workbook();
    await verifyWb.xlsx.readFile(tmpExportPath);

    assert.equal(verifyWb.worksheets.length, 3, '应生成 3 个工作表');
    const wsSummary = verifyWb.getWorksheet('1. 费用汇总表');
    const wsDetail = verifyWb.getWorksheet('2. 费用明细打印');
    const wsRaw = verifyWb.getWorksheet('开票流水单据列表');

    assert.ok(wsSummary, '汇总表工作表应存在');
    assert.ok(wsDetail, '明细打印工作表应存在');
    assert.ok(wsRaw, '原始流水备份工作表应存在');

    // 验证标题与合并
    const titleCell = wsSummary.getCell('A1');
    assert.ok(String(titleCell.value).includes('国宝 猫超平台费用明细'));
    assert.ok(String(titleCell.value).includes('2026.8.11-2026.9.1'));
    assert.ok(wsSummary.model.merges.includes('A1:E1'), '大标题应合并 A1:E1');

    // 验证推广服务费汇总行（第 13 行）
    const promoSubtotalRow = wsSummary.getRow(13);
    assert.equal(promoSubtotalRow.getCell(2).value, '推广服务费 汇总');
    assert.equal(promoSubtotalRow.getCell(4).result, 38385.85);
    assert.equal(promoSubtotalRow.getCell(5).value, '电商市场推广费');

    // 验证总计行（最后一行，第 27 行）
    const totalRow = wsSummary.getRow(27);
    assert.equal(totalRow.getCell(2).value, '总计');
    assert.equal(totalRow.getCell(4).result, 61058.05);

    // 验证明细表行数与合计
    assert.equal(wsDetail.rowCount, 41, '明细表应包含标题、表头、38条数据行和1条合计行');
    const detailTotalRow = wsDetail.getRow(41);
    assert.equal(detailTotalRow.getCell(4).value, '合计');
    assert.equal(detailTotalRow.getCell(7).result, 61058.05);
  } finally {
    if (fs.existsSync(tmpExportPath)) fs.unlinkSync(tmpExportPath);
  }
});

test('平台费用核销：支持 CSV 文件导入与自定义科目映射', async () => {
  const csvContent = `待开票流水主单号,对账单号,销方,购方,费用项编码,费用项名称,开票内容,税收分类编码,日期,币种,开票金额,待开票金额,已开票金额,申请日期,开票状态,发票分类
AF1001,S20260901001,浙江天猫供应链管理有限公司,湖北国宝桥米有限公司寄售,1030579,用户权益推广服务费,推广服务费,3079900000000000000,2026-09-01 12:00:00,CNY,100.50,100.50,0,,未提交,服务
AF1002,S20260901001,浙江天猫供应链管理有限公司,湖北国宝桥米有限公司寄售,1030579,用户权益推广服务费,推广服务费,3079900000000000000,2026-09-02 12:00:00,CNY,200.25,200.25,0,,未提交,服务
AF1003,S20260901001,浙江天猫供应链管理有限公司,湖北国宝桥米有限公司寄售,9999999,新代运营费,代运营服务费,3079900000000000000,2026-09-03 12:00:00,CNY,500.00,500.00,0,,未提交,服务
`;

  const tmpCsvPath = path.join(os.tmpdir(), `test-fee-input-${Date.now()}.csv`);
  fs.writeFileSync(tmpCsvPath, csvContent, 'utf-8');

  try {
    const parsed = await parsePlatformFeeFile(tmpCsvPath);
    assert.equal(parsed.rowCount, 3);
    assert.equal(parsed.defaultBuyerShort, '国宝');

    const summary = calculatePlatformFeeSummary(parsed.rows, {
      buyerShortName: '国宝',
      sellerName: '浙江天猫供应链管理有限公司',
      categoryRemarks: {
        '代运营服务费': '专项运营费'
      }
    });

    assert.equal(summary.totalAmount, 800.75);
    const promoCat = summary.categories.find(c => c.invoiceContent === '推广服务费');
    assert.ok(promoCat);
    assert.equal(promoCat.subtotal, 300.75);
    assert.equal(promoCat.remark, '电商市场推广费');

    const opsCat = summary.categories.find(c => c.invoiceContent === '代运营服务费');
    assert.ok(opsCat);
    assert.equal(opsCat.subtotal, 500.00);
    assert.equal(opsCat.remark, '专项运营费');
  } finally {
    if (fs.existsSync(tmpCsvPath)) fs.unlinkSync(tmpCsvPath);
  }
});
