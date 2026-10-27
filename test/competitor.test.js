'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ExcelJS = require('exceljs');

const {
  extractRiceVariety,
  extractSpec,
  extractPackaging,
  extractShippingTime,
  formatSales,
  processPositioning,
  normalizeCompetitorItems,
  deduceRiceNegativeReviews,
  extractPriceFromText,
  getMockTaoFactoryRiceTop20,
  startLocalCompetitorReceiver,
  stopLocalCompetitorReceiver
} = require('../src/services/competitor-service');

const {
  fetchImageBuffer,
  exportCompetitorAnalysisExcel
} = require('../src/services/competitor-excel-service');

test('竞品分析属性解析：米种、规格、包装与时效智能提取', () => {
  // 1. 米种识别测试
  assert.equal(extractRiceVariety('【淘工厂直营】东北五常大米 稻花香米 5kg', ''), '五常米 粳米');
  assert.equal(extractRiceVariety('黑龙江长粒香大米 现磨新米', ''), '长粒香 粳米');
  assert.equal(extractRiceVariety('东北秋田小町 寿司米', ''), '秋田小町 粳米');
  assert.equal(extractRiceVariety('广东软边丝苗米 煲仔饭专用', ''), '丝苗米 籼米');
  assert.equal(extractRiceVariety('东北优质珍珠米', ''), '珍珠米 粳米');
  assert.equal(extractRiceVariety('原生态天然富硒米', ''), '富硒米 粳米');
  assert.equal(extractRiceVariety('进口原装泰国香米', ''), '香米 籼米');

  // 2. 规格识别与换算测试
  assert.equal(extractSpec('五常大米 5kg 双层装', ''), '5kg');
  assert.equal(extractSpec('东北大米 2.5kg 真空装', ''), '2.5kg');
  assert.equal(extractSpec('东北大米 10斤装', ''), '5kg'); // 10斤 = 5kg
  assert.equal(extractSpec('东北大米 5斤装', ''), '2.5kg'); // 5斤 = 2.5kg
  assert.equal(extractSpec('试吃小包装 500g', ''), '500g');
  assert.equal(extractSpec('大包装 1000g', ''), '1kg');

  // 3. 包装类型识别测试
  assert.equal(extractPackaging('五常大米 真空双层保鲜装', ''), '真空包装');
  assert.equal(extractPackaging('东北大米 双层编织袋耐磨装', ''), '双层编织袋');
  assert.equal(extractPackaging('大米 2.5kg 自立袋包装', ''), '自立袋');
  assert.equal(extractPackaging('大米 普通编织袋 5kg', ''), '编织袋');

  // 4. 发货时效识别
  assert.equal(extractShippingTime('付款后24小时内发货'), '24小时内');
  assert.equal(extractShippingTime('48小时内发货'), '48小时内');
  assert.equal(extractShippingTime('次日达配送'), '次日达/24小时内');
});

test('款式定位与同链接多 SKU 聚合判定：准确区分引流款与主推款', () => {
  const items = [
    {
      itemId: 'LINK_001',
      title: '东北五常大米 稻花香2号',
      spec: '1kg',
      finalPrice: 0.8,
      sales: '3w+人付款'
    },
    {
      itemId: 'LINK_001',
      title: '东北五常大米 稻花香2号',
      spec: '2.5kg',
      finalPrice: 6.47,
      sales: '3w+人付款'
    },
    {
      itemId: 'LINK_002',
      title: '东北秋田小町大米 5kg',
      spec: '5kg',
      finalPrice: 24.8,
      sales: '1.5w+人付款'
    }
  ];

  const processed = processPositioning(items);
  assert.equal(processed.length, 3);

  // 同链接多 SKU 测试
  assert.equal(processed[0].isSameLink, true);
  assert.equal(processed[1].isSameLink, true);
  assert.equal(processed[2].isSameLink, false);

  // 价格最低小规格应判定为引流款
  assert.equal(processed[0].remark, '引流款');
  assert.equal(processed[1].remark, '主推款');
  assert.equal(processed[2].remark, '主推款');
});

test('Top 20 示例数据完整性与规范性校验', () => {
  const mockData = getMockTaoFactoryRiceTop20();
  assert.equal(mockData.length, 20);

  // 必须具有全部12列核心属性
  mockData.forEach((item, index) => {
    assert.equal(item.rank, index + 1);
    assert.ok(item.variety, '必须包含米种');
    assert.ok(item.spec, '必须包含规格');
    assert.ok(item.packaging, '必须包含包装类型');
    assert.ok(typeof item.originalPrice === 'number' && item.originalPrice > 0, '标价必须为正数');
    assert.ok(typeof item.finalPrice === 'number' && item.finalPrice > 0, '券后价必须为正数');
    assert.ok(item.freeShipping, '必须包含是否包邮');
    assert.ok(item.shippingTime, '必须包含发货时效');
    assert.ok(item.title, '必须包含标题');
    assert.ok(item.sales, '必须包含销量');
    assert.ok(item.negativeReviews, '必须包含高频差评');
    assert.ok(item.remark, '必须包含款式备注');
  });

  // 第一款与第二款应为同一个链接的多 SKU (引流款与主推款)
  assert.equal(mockData[0].itemId, mockData[1].itemId);
  assert.equal(mockData[0].isSameLink, true);
  assert.equal(mockData[0].remark, '引流款');
  assert.equal(mockData[1].remark, '主推款');

  // 必须包含真实买家评价标识与生动的真实买家引言
  assert.equal(mockData[0].isRealReview, false);
  assert.equal(mockData[0].source, 'sample');
  assert.ok(mockData[0].negativeReviews.includes('【示例评价】'));
});

test('本地 HTTP 接收服务启动与停止生命周期', async () => {
  const testPort = 41237;
  const res = await startLocalCompetitorReceiver({ port: testPort });
  assert.equal(res.status, 'running');
  assert.equal(res.port, testPort);

  const stopRes = stopLocalCompetitorReceiver();
  assert.equal(stopRes.status, 'stopped');
});

test('Excel 高保真导出验证：版式、列定义、行高与图片嵌入韧性', async () => {
  const testOutputDir = path.join(__dirname, '..', 'test-output');
  if (!fs.existsSync(testOutputDir)) {
    fs.mkdirSync(testOutputDir, { recursive: true });
  }

  const outputPath = path.join(testOutputDir, 'test_competitor_export.xlsx');
  const mockData = getMockTaoFactoryRiceTop20().slice(0, 5); // 取前5款测试

  const res = await exportCompetitorAnalysisExcel(mockData, outputPath);
  assert.equal(res.ok, true);
  assert.ok(fs.existsSync(outputPath), 'Excel 文件必须成功生成');

  // 重新读取并验证 Excel 结构
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(outputPath);
  const sheet = workbook.getWorksheet('淘工厂大米Top20竞品分析');
  assert.ok(sheet, '必须包含指定名称的工作表');

  // 验证表头
  const expectedHeaders = [
    '排名', '米种', '规格', '包装类型', '前台标价', '券后到手价',
    '是否包邮', '发货时效', '主图+标题', '销量', '高频差评', '备注',
    '总重量(kg)', '元/kg(不含运费)', '评价来源', '数据类型'
  ];
  const actualHeaders = [];
  sheet.getRow(1).eachCell((cell) => {
    actualHeaders.push(cell.value);
  });
  assert.deepEqual(actualHeaders, expectedHeaders);

  // 验证行高设置 (第一行为32，数据行应为76)
  assert.equal(sheet.getRow(1).height, 32);
  assert.equal(sheet.getRow(2).height, 76);

  // 验证券后到手价格式化与加粗
  const finalPriceCell = sheet.getRow(2).getCell(6);
  assert.equal(finalPriceCell.font.bold, true);

  assert.equal(sheet.getCell('M2').value, 1);
  assert.equal(sheet.getCell('N2').value.formula, 'F2/M2');
  assert.equal(sheet.getCell('N2').value.result, 0.8);
  assert.equal(sheet.getCell('O2').value, '示例评价');
  assert.ok(workbook.getWorksheet('分析概览'));
  assert.ok(workbook.getWorksheet('采集明细'));

  // 清理测试产物
  try {
    fs.unlinkSync(outputPath);
  } catch {}
});

test('模式 B 内置自动化浏览器采集服务：启动、进度回调、停止与字段归一化测试', async () => {
  const {
    startBrowserCrawler,
    stopBrowserCrawler,
    isCrawlerActive
  } = require('../src/services/competitor-crawler-service');

  const progressLogs = [];
  const rawCrawled = await startBrowserCrawler({
    keyword: '淘工厂 大米',
    limit: 20,
    mock: true,
    onProgress: (p) => progressLogs.push(p)
  });

  assert.equal(rawCrawled.length, 20);
  assert.ok(progressLogs.length >= 4, '应触发 started, scrolling, extracting, completed 各阶段进度');
  assert.equal(progressLogs[progressLogs.length - 1].stage, 'completed');

  // 对模式 B 采集结果做属性归一化测试
  const normalized = normalizeCompetitorItems(rawCrawled);
  assert.equal(normalized.length, 20);
  assert.equal(normalized[0].rank, 1);
  assert.equal(normalized[0].remark, '引流款');
  assert.ok(normalized[0].variety.includes('大米') || normalized[0].variety.includes('五常'));
  assert.ok(normalized[0].spec);
  // 前 5 款已抓取真实买家差评
  assert.equal(normalized[0].isRealReview, false);
  assert.equal(normalized[0].source, 'sample');
  assert.ok(normalized[0].negativeReviews.includes('【真实买家】'));

  // 停止与活跃状态校验
  assert.equal(isCrawlerActive(), false);
  stopBrowserCrawler();
  assert.equal(isCrawlerActive(), false);
});

test('本地 HTTP 接收服务支持 /push-review 商详页单款真实评价实时同步', async () => {
  let receivedData = null;
  let receivedMeta = null;

  const res = await startLocalCompetitorReceiver({
    port: 41238,
    onDataReceived: (items, meta) => {
      receivedData = items;
      receivedMeta = meta;
    }
  });
  assert.equal(res.status, 'running');

  // 模拟从商详页 POST /push-review
  const response = await fetch('http://127.0.0.1:41238/push-review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      itemId: 'TF_RICE_001',
      title: '东北五常大米 试吃装1kg',
      negativeReviews: '【真实买家】“收到时米袋漏气破损了”',
      isRealReview: true
    })
  });

  const json = await response.json();
  assert.equal(json.ok, true);
  assert.equal(receivedMeta?.isSingleReviewUpdate, true);
  assert.equal(receivedData?.[0]?.itemId, 'TF_RICE_001');
  assert.equal(receivedData?.[0]?.negativeReviews, '【真实买家】“收到时米袋漏气破损了”');

  stopLocalCompetitorReceiver();
});

test('缺失信息保持未知，不推导价格、销量、物流和差评', () => {
  const [item] = normalizeCompetitorItems({ title: '待补充商品' });
  assert.equal(item.finalPrice, null);
  assert.equal(item.originalPrice, null);
  assert.equal(item.sales, '未采集');
  assert.equal(item.spec, '未识别');
  assert.equal(item.freeShipping, '未采集');
  assert.equal(item.shippingTime, '未采集');
  assert.equal(item.negativeReviews, '');
  assert.equal(item.isRealReview, false);
  assert.equal(item.remark, '待判断');
});

test('油猴全文同步允许纯好评和空差评，保存全部评价及追评，不注入买家身份', async () => {
  let received;
  await startLocalCompetitorReceiver({ port: 41240, onDataReceived(items) { received = items[0]; } });
  try {
    const response = await fetch('http://127.0.0.1:41240/push-review', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: 'positive-product', negativeReviews: '', reviewScope: 'all', reviewListExhausted: true, reviews: [
        { id: '1', content: '好', userNick: 'private' }, { id: '2', content: '很香很好吃', appendContent: '还会回购' }
      ] })
    });
    const result = await response.json();
    assert.equal(result.ok, true);
    assert.equal(result.supportsFullReviews, true);
    assert.equal(result.reviewCount, 2);
    assert.equal(received.reviews.length, 2);
    assert.equal(received.negativeReviews, '');
    assert.equal(received.isRealReview, false);
    assert.equal(received.reviewComplete, true);
    assert.equal(received.reviews[1].appendContent, '还会回购');
    assert.equal(JSON.stringify(received).includes('private'), false);
  } finally { stopLocalCompetitorReceiver(); }
});

test('价格解析、包邮字符串与原始价格保真', () => {
  for (const [input, expected] of [['¥59.9', 59.9], ['￥24.80', 24.8], ['¥ 39 .90', 39.9], ['券后49.9元', 49.9], ['19.90', 19.9], [-5, 0], ['-5', 0], [Infinity, 0], ['销量500', 0]]) {
    assert.equal(extractPriceFromText(input), expected);
  }
  const [item] = normalizeCompetitorItems([{ title: '大米', finalPrice: '¥19.90', originalPrice: 18, freeShipping: 'false' }]);
  assert.equal(item.finalPrice, 19.9);
  assert.equal(item.originalPrice, 18, '不得把原始标价改成推导价格');
  assert.equal(item.freeShipping, '不包邮');
});

test('输入容错、SKU 优先、多包装总重与同链接识别', () => {
  assert.equal(extractSpec('大米 10kg', '500g'), '500g');
  assert.equal(extractSpec('大米 500g×4袋'), '2kg');
  assert.equal(extractSpec('大米 2袋×2.5kg'), '2.5kg'); // 未标明每袋关系不猜测
  assert.equal(extractSpec('大米 2×2.5kg'), '5kg');
  assert.deepEqual(normalizeCompetitorItems([null, 5, {}, []]), []);
  assert.equal(normalizeCompetitorItems({ data: [{ title: '米' }] }).length, 1);
  assert.throws(() => normalizeCompetitorItems({ data: {} }), /数组/);
  const items = normalizeCompetitorItems([
    { title: '同前缀商品一' }, { title: '同前缀商品一' },
    { title: '米', link: 'https://item.taobao.com/item.htm?id=123&spm=a', finalPrice: 20 },
    { title: '米', link: 'https://item.taobao.com/item.htm?spm=b&id=123', finalPrice: 30 }
  ]);
  assert.equal(items[0].isSameLink, false);
  assert.equal(items[2].isSameLink, true);
});

test('比价排序、缺失值置底、筛选与评价统计口径一致', async () => {
  const { weightKg, unitPrice, salesNumber, selectItems, summarize } = await import('../src/shared/competitor-analysis.mjs');
  assert.equal(weightKg('500g×4袋'), 2);
  assert.equal(weightKg('10斤'), 5);
  assert.equal(weightKg('5KG'), 5);
  assert.equal(weightKg('未识别'), null);
  assert.equal(unitPrice({ spec: '500g×4袋', finalPrice: 20 }), 10);
  assert.equal(salesNumber('已售1.5万+件'), 15000);
  assert.equal(salesNumber('3w+人付款'), 30000);
  assert.equal(salesNumber('未采集'), null);
  const items = [
    { title: '低价米', spec: '1kg', finalPrice: 10, rank: 2, sales: '2万', negativeReviews: '漏气、漏气', isRealReview: true },
    { title: '大袋米', spec: '5kg', finalPrice: 20, rank: 1, sales: '9000', negativeReviews: '碎米', isRealReview: true, source: 'sample' },
    { title: '未知米', finalPrice: null, negativeReviews: '漏气', reviewSource: 'manual' }
  ];
  assert.deepEqual(selectItems(items, { sort: 'unit-asc' }).map(i => i.title), ['大袋米', '低价米', '未知米']);
  assert.equal(selectItems(items, { sort: 'price-desc' }).at(-1).title, '未知米');
  assert.equal(selectItems(items, { review: 'collected' }).length, 1);
  assert.equal(selectItems(items, { min: '15', max: '30' }).length, 1);
  const metrics = summarize(items);
  assert.equal(metrics.medianUnit, '7.00');
  assert.equal(metrics.missingPrices, 1);
  assert.equal(metrics.collectedReviews, 1);
  assert.deepEqual(metrics.topNegativeTopics, [{ tag: '漏气', count: 1 }]);
  assert.equal(summarize([]).avgPrice, '—');
  assert.equal(summarize([]).uniqueLinks, 0);
});
