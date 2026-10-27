'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { extractDetailSnapshot, mergeDetailSnapshot, readCardPrice, isRiceProductTitle } = require('../src/services/competitor-detail-extractor');
const { extractSpec, extractPackaging, extractRiceVariety, normalizeCompetitorItems } = require('../src/services/competitor-service');

test('标题否定词、多规格和非大米商品不再误判', () => {
  assert.equal(extractPackaging('当季新米10斤 非真空包装'), '非真空包装');
  assert.equal(extractRiceVariety('非五常长粒香大米'), '长粒香 粳米');
  assert.equal(extractSpec('五常大米2斤/5斤/10斤'), '未识别');
  assert.equal(extractSpec('大米10斤5kg'), '5kg');
  for (const title of ['米桶密封家用', '色选米50斤饲料喂鸡鸭狗猪大米', '钓鱼打窝大米']) assert.equal(isRiceProductTitle(title), false);
  assert.equal(isRiceProductTitle('五常大米10斤新米'), true);
});

test('搜索卡片优先组合整数小数，不把优惠券金额当成商品价', () => {
  const fraction = { innerText: '.86' };
  const integer = { innerText: '24', parentElement: { querySelector: () => fraction } };
  const card = { querySelectorAll: selector => selector.includes('priceInt') ? [integer] : [{ innerText: '省2元券' }] };
  assert.equal(readCardPrice(card), 24.86);
  assert.equal(readCardPrice({ querySelectorAll: selector => selector.includes('priceInt') ? [] : [{ innerText: '满20减2元' }] }), null);
});

function snapshotFixture({ requestedSku = 'selected', negative = true } = {}) {
  const node = innerText => ({ innerText, getClientRects: () => [1] });
  const product = {
    item: { itemId: '123', title: '五常大米新米', sellCount: '1万+人付款' },
    skuBase: { props: [{ pid: 'weight', values: [{ vid: '5', name: '5kg 真空包装' }, { vid: '1', name: '1kg试吃' }] }], skus: [{ skuId: 'selected', propPath: 'weight:5' }, { skuId: 'trial', propPath: 'weight:1' }] },
    skuCore: { sku2info: { selected: { price: { priceText: '42.80' }, originalPrice: { priceText: '59.90' } }, trial: { price: { priceText: '1.00' } } } },
    props: { groupProps: [{ 基本信息: [{ 净含量: '5kg' }, { 包装方式: '真空包装' }] }] }
  };
  const context = {
    window: { __INITIAL_DATA__: { data: product, recommend: { ...product, skuCore: { sku2info: { selected: { price: { priceText: '0.01' } } } } } } },
    URL, location: { href: 'https://detail.tmall.com/item.htm?id=123&skuId=' + requestedSku },
    getComputedStyle: () => ({ visibility: 'visible' }),
    document: { querySelectorAll(selector) {
      if (selector.includes('delivery')) return [node('包邮 48小时内发货')];
      if (selector.includes('tm-rate-fulltxt')) return [node(negative ? '收到时包装破损，漏气还有碎米，不好吃' : '新米很香很好吃，包装完整，配送及时')];
      return [];
    } }
  };
  return vm.runInNewContext(`(${extractDetailSnapshot.toString()})({ itemId: '123', skuId: '${requestedSku}' })`, context);
}

test('详情读取匹配链接SKU，保留标价、物流、属性和真实负面评价', () => {
  const snapshot = snapshotFixture();
  assert.equal(snapshot.finalPrice, 42.8);
  assert.equal(snapshot.originalPrice, 59.9);
  assert.equal(snapshot.skuName, '5kg 真空包装');
  assert.equal(snapshot.matchedSku, true);
  assert.equal(snapshot.freeShipping, true);
  assert.equal(snapshot.shippingTime, '48小时内发货');
  assert.match(snapshot.negativeReviews, /包装破损/);
  const merged = mergeDetailSnapshot({ itemId: '123', skuId: 'selected', title: '米', finalPrice: 2 }, snapshot, { reviewAttempted: true });
  const [normalized] = normalizeCompetitorItems([merged]);
  assert.equal(normalized.finalPrice, 42.8);
  assert.equal(normalized.spec, '5kg');
  assert.equal(normalized.packaging, '真空包装');
  assert.equal(normalized.freeShipping, '包运费');
  assert.equal(normalized.detailStatus, '详情已读取');
  assert.equal(normalized.skuId, 'selected');
  assert.match(normalized.priceBasis, /对应 SKU/);
  assert.equal(normalized.isRealReview, true);
});

test('评价已读但无负面反馈，不回填好评为差评；SKU不匹配不使用起售价计算单价', async () => {
  const positive = snapshotFixture({ negative: false });
  assert.equal(positive.negativeReviews, '');
  assert.match(positive.reviewStatus, /未发现负面/);
  const unknown = snapshotFixture({ requestedSku: 'missing' });
  assert.equal(unknown.finalPrice, undefined);
  const merged = mergeDetailSnapshot({ itemId: '123', skuId: 'missing', title: '米5kg', finalPrice: 2, spec: '5kg' }, unknown);
  assert.equal(merged.spec, '未识别');
  assert.match(merged.detailMessage, /SKU 未匹配/);
  const { unitPrice } = await import('../src/shared/competitor-analysis.mjs');
  assert.equal(unitPrice(merged), null);
  assert.equal(mergeDetailSnapshot({ title: '米' }, { __tf_error: '脚本异常' }).detailStatus, '详情失败');
});

function modernSnapshot(product, skuId) {
  return vm.runInNewContext(`(${extractDetailSnapshot.toString()})(${JSON.stringify({ itemId: product.item.itemId, skuId })})`, {
    window: { __ICE_APP_CONTEXT__: { loaderData: { home: { data: { res: product } } } } },
    URL, location: { href: `https://detail.tmall.com/item.htm?id=${product.item.itemId}` },
    document: { querySelectorAll: () => [] }, getComputedStyle: () => ({ visibility: 'visible' })
  });
}

test('真实页面结构：对应SKU的优惠前31.08元与优惠后24.86元分别入列', () => {
  const product = require('./fixtures/tmall-modern-rice-0.json');
  const snapshot = modernSnapshot(product, '6303377450106');
  assert.equal(snapshot.originalPrice, 31.08);
  assert.equal(snapshot.finalPrice, 24.86);
  assert.equal(snapshot.reviewCount, 2);
  const merged = mergeDetailSnapshot({ title: product.item.title, skuId: '6303377450106' }, snapshot, { reviewAttempted: true });
  assert.equal(merged.spec, '5kg');
  assert.equal(merged.packaging, '包装（未细分）');
  assert.equal(merged.freeShipping, true);
  assert.equal(extractRiceVariety('五常大米', '5kg'), '五常米 粳米');
});

test('真实页面结构：读取现代参数、物流与好评样本；遮挡价不能成为2元或优惠前价', async () => {
  const product = require('./fixtures/tmall-modern-rice-1.json');
  const snapshot = modernSnapshot(product, '6029134068613');
  assert.equal(snapshot.originalPrice, 38.28);
  assert.equal(snapshot.finalPrice, null);
  assert.match(snapshot.priceBasis, /被遮挡/);
  assert.equal(snapshot.shippingTime, '预计明天发货，后天送达');
  assert.equal(snapshot.freeShipping, true);
  assert.equal(snapshot.reviewCount, 2);
  assert.equal(snapshot.negativeReviews, '');
  const [merged] = normalizeCompetitorItems([mergeDetailSnapshot({ title: product.item.title, finalPrice: 2 }, snapshot, { reviewAttempted: true })]);
  assert.equal(merged.finalPrice, null);
  assert.equal(merged.packaging, '包装（未细分）');
  assert.equal(merged.reviewCount, 2);
  const { summarize } = await import('../src/shared/competitor-analysis.mjs');
  assert.equal(summarize([merged]).collectedReviews, 1);
  assert.equal(summarize([merged]).negativeReviewProducts, 0);
});

test('真实页面结构：对应2.5kg SKU优先于标题10斤及商品属性5kg', () => {
  const product = require('./fixtures/tmall-modern-rice-2.json');
  const snapshot = modernSnapshot(product, '6203322622941');
  const merged = mergeDetailSnapshot({ title: product.item.title, skuId: '6203322622941', spec: '5kg' }, snapshot, { reviewAttempted: true });
  assert.equal(merged.spec, '2.5kg');
  assert.equal(merged.packaging, '真空包装');
  assert.equal(merged.originalPrice, 21.9);
  assert.equal(merged.reviewCount, 2);
  assert.equal(merged.shippingTime, '预计明天发货，超24小时必赔');
});

test('真实好评中的“没有其他破损问题”不误标为差评；混合反馈保留实际问题', () => {
  const product = structuredClone(require('./fixtures/tmall-modern-rice-0.json'));
  product.componentsVO.rateVO.group.items = [
    { content: '大米晶体透亮饱满新鲜干净卫生没有其他破损问题缺点诚信商家实实在在非常满意放心购买商品与商家描述相符全五星好评' },
    { content: '包装裹得特别结实，完全没漏洒破损的情况。米饭香气很足，口感软糯' }
  ];
  assert.equal(modernSnapshot(product, '6303377450106').negativeReviews, '');
  product.componentsVO.rateVO.group.items = [{ content: '包装没有破损，但是煮出来不好吃，还有很多碎米' }];
  assert.match(modernSnapshot(product, '6303377450106').negativeReviews, /不好吃/);
});
