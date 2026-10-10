'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const ExcelJS = require('exceljs');

const {
  DEFAULT_INVOICE_CONFIG,
  formatTodayDate,
  readReconciliationWorkbook,
  parseReconciliationFiles,
  matchProductWithPreset,
  calculateInvoiceSummary,
  exportInvoiceNotificationWorkbook
} = require('../src/invoice-summary');
const { loadProductPreset } = require('../src/product-preset');

const SAMPLE_RECONCILIATION = path.join(__dirname, '..', 'src', 'templates', '2026.8.1-2026.8.10--HDB202608012026081035131200823-280102(1).xlsx');

test('对账单文件读取与字段提取', async () => {
  assert.equal(DEFAULT_INVOICE_CONFIG.applicant, '丁锐杰', '默认申请人已更新为丁锐杰');
  assert.ok(fs.existsSync(SAMPLE_RECONCILIATION), '样本对账单文件存在');
  const result = await readReconciliationWorkbook(SAMPLE_RECONCILIATION);
  assert.ok(result.rowCount > 0, '成功解析行数');
  assert.ok(result.billNos.length > 0, '提取到对账单号');
  assert.ok(result.timeRange.length > 0, '提取到业务时间跨度');

  const firstRow = result.rows[0];
  assert.ok(firstRow.backendName, '包含后端商品名称');
  assert.ok(typeof firstRow.qty === 'number', '包含商品数量');
  assert.ok(typeof firstRow.taxAmount === 'number', '包含含税金额');
});

test('多文件解析与可用费用类型、发票方向提取', async () => {
  const result = await parseReconciliationFiles([SAMPLE_RECONCILIATION]);
  assert.equal(result.files.length, 1);
  assert.ok(result.availableFeeTypes.includes('货款'));
  assert.ok(result.availableFeeTypes.includes('88VIP用户权益折扣'));
  assert.ok(result.availableInvoiceDirs.includes('供应商开票(进项票)'));
  assert.ok(result.allBillNos.includes('HDB202608012026081035131200823'));
});

test('商品与商品预设表精准匹配与排序规则', async () => {
  const { rows: presetRows } = await loadProductPreset();
  assert.ok(presetRows.length >= 25, '商品预设包含至少25种商品');

  // 测试完全匹配与简称映射
  const match1 = matchProductWithPreset('国宝桥米稻花翁精选丝苗米南方籼米5KG真空粒粒分明当季新米10斤', presetRows);
  assert.equal(match1.matched, true);
  assert.equal(match1.shortName, '稻花翁精选丝苗米5kg');
  assert.equal(match1.spec, '5kg');

  const match2 = matchProductWithPreset('国宝桥米京山桥米10kg南方籼米长粒大米新米', presetRows);
  assert.equal(match2.matched, true);
  assert.equal(match2.shortName, '国宝桥米京山桥米10kg');
  assert.equal(match2.spec, '10kg');

  // 测试未知商品兜底
  const unknown = matchProductWithPreset('某种未录入预设的大米优质米15kg家庭装', presetRows);
  assert.equal(unknown.matched, false);
  assert.equal(unknown.shortName, '某种未录入预设的大米优质米15kg家庭装');
  assert.equal(unknown.spec, '15kg');
});

test('根据费用类型和发票方向筛选计算商品开票汇总', async () => {
  const { rows: reconRows } = await readReconciliationWorkbook(SAMPLE_RECONCILIATION);
  const { rows: presetRows } = await loadProductPreset();

  // 1. 筛选全部费用类型
  const summaryAll = calculateInvoiceSummary(reconRows, {
    selectedFeeTypes: ['货款', '88VIP用户权益折扣', '特殊商品折扣', '价保补差'],
    selectedInvoiceDirs: ['供应商开票(进项票)'],
    presetRows
  });

  assert.equal(summaryAll.productCount, 18);
  assert.equal(summaryAll.totalQty, 263);
  assert.equal(summaryAll.totalAmount, 7371.80);

  // 2. 仅筛选货款
  const summaryPaymentOnly = calculateInvoiceSummary(reconRows, {
    selectedFeeTypes: ['货款'],
    selectedInvoiceDirs: ['供应商开票(进项票)'],
    presetRows
  });

  assert.equal(summaryPaymentOnly.productCount, 18);
  assert.equal(summaryPaymentOnly.totalQty, 137);
  assert.equal(summaryPaymentOnly.totalAmount, 7666.10);
});

test('导出开票通知单 Excel 并校验版式、公式与开票信息', async () => {
  const { rows: reconRows } = await readReconciliationWorkbook(SAMPLE_RECONCILIATION);
  const { rows: presetRows } = await loadProductPreset();
  const summary = calculateInvoiceSummary(reconRows, {
    selectedFeeTypes: ['货款', '88VIP用户权益折扣', '特殊商品折扣', '价保补差'],
    selectedInvoiceDirs: ['供应商开票(进项票)'],
    presetRows
  });

  const tmpDir = os.tmpdir();
  const testOutputPath = path.join(tmpDir, `test-invoice-${Date.now()}.xlsx`);

  try {
    await exportInvoiceNotificationWorkbook({
      items: summary.items,
      config: {
        applicant: '测试员刘雯',
        date: '2026-9-10',
        platform: '国宝猫超'
      },
      outputPath: testOutputPath
    });

    assert.ok(fs.existsSync(testOutputPath), '成功生成导出 Excel 文件');

    // 读取并验证导出文件内容
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(testOutputPath);
    const ws = wb.worksheets[0];

    // 验证标题
    assert.equal(ws.getCell('B1').value, '开 票 通 知 单');
    assert.equal(ws.getCell('B2').value, '开票通知时间：');
    assert.equal(ws.getCell('C2').value, '2026-9-10');
    assert.equal(ws.getCell('E2').value, '申请人：测试员刘雯');
    assert.equal(ws.getCell('B4').value, '一、 开票内容');

    // 验证表头
    assert.equal(ws.getCell('B5').value, '商品名称');
    assert.equal(ws.getCell('D5').value, '数   量（袋）');
    assert.equal(ws.getCell('E5').value, '单价\n（元）');
    assert.equal(ws.getCell('F5').value, '金   额\n（元）');

    // 验证第一条商品数据
    const firstItem = summary.items[0];
    assert.equal(ws.getCell('B6').value, firstItem.shortName);
    assert.equal(ws.getCell('D6').value, firstItem.qty);
    assert.equal(ws.getCell('F6').value, firstItem.amount);
    // 单价必须是公式
    assert.equal(ws.getCell('E6').value.formula, 'F6/D6');

    // 验证合计行
    const totalRowIdx = 6 + summary.items.length;
    assert.equal(ws.getCell(`B${totalRowIdx}`).value, '合计');
    assert.equal(ws.getCell(`D${totalRowIdx}`).value.formula, `SUM(D6:D${totalRowIdx - 1})`);
    assert.equal(ws.getCell(`F${totalRowIdx}`).value.formula, `SUM(F6:F${totalRowIdx - 1})`);

    // 验证开票资料与邮寄地址存在
    let foundInvoiceInfo = false;
    let foundMailRecipient = false;
    for (let r = totalRowIdx + 1; r <= ws.rowCount; r++) {
      const val = ws.getRow(r).getCell(2).value;
      if (val === '二、开票资料：') foundInvoiceInfo = true;
      if (val === '收件人') foundMailRecipient = true;
    }
    assert.ok(foundInvoiceInfo, '包含二、开票资料');
    assert.ok(foundMailRecipient, '包含三、发票邮寄地址');
  } finally {
    if (fs.existsSync(testOutputPath)) {
      try { fs.unlinkSync(testOutputPath); } catch {}
    }
  }
});
