'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeReview, createReviewAccumulator, parseReviewResponse, collectAllReviews } = require('../src/services/competitor-review-service');

test('全部评价保留短评、好评和追评，按评价ID去重并排除买家身份', () => {
  const accumulator = createReviewAccumulator();
  accumulator.add([{ id: '1', feedback: '好', userNick: 'private', headPicUrl: 'private', feedbackDate: '2026-10-18', skuMap: { 重量: '5kg' } }]);
  accumulator.add([{ id: '1', feedback: '好', appendedFeed: { appendedFeedback: '第二次买了，还是很好吃' } }, { id: '2', feedback: '好' }]);
  const result = accumulator.result({ complete: true });
  assert.equal(result.reviewCount, 2);
  assert.equal(result.reviews[0].appendContent, '第二次买了，还是很好吃');
  assert.equal(result.reviews[0].date, '2026-10-18');
  assert.equal(result.reviews[0].sku, '5kg');
  assert.equal(result.reviewComplete, true);
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.equal(normalizeReview({ feedback: '此用户没有填写评价' }), null);
});

test('读完可见列表时仍注明平台折叠，不能冒充全量覆盖', () => {
  const result = createReviewAccumulator().result({ complete: true, foldedCount: 380, total: '1000+' });
  assert.equal(result.reviewComplete, false);
  assert.equal(result.reviewListExhausted, true);
  assert.match(result.reviewStatus, /折叠380条/);
  assert.equal(parseReviewResponse({ rateList: [], hasNext: 'false', totalFuzzy: '1000+', foldCount: '380' }).end, true);
});

function harness({ missingPage = false, cancelled = false } = {}) {
  let listener, page = 0, closed = false, clock = 0;
  const advances = [];
  const record = number => ({ api: '/h5/mtop.taobao.rate.detaillist.get/6.0/', itemId: '123', capturedAt: Date.now(), ret: ['SUCCESS::调用成功'], page: number, reviewAll: true,
    data: { rateList: [{ id: String(number), feedback: number === 2 ? '味道很好' : '好' }], hasNext: number < 3 ? 'true' : 'false', total: '3' } });
  return {
    options: {
      itemId: '123', collector: { onRecord(fn) { listener = fn; return () => { closed = true; }; }, async flush() {} },
      pacing: { pageIntervalMs: 0, batchRestMs: 0 },
      async execute(script) {
        const action = JSON.parse(script.slice(script.lastIndexOf(')(') + 2, -1)).action;
        if (action === 'open') { page = 1; listener(record(1)); }
        if (action === 'advance') { advances.push(clock); page++; if (!(missingPage && page === 2)) listener(record(page)); }
        return { opened: page > 0, rows: [{ content: '预览不能重复计数' }], loading: false };
      },
      async click() {}, async waitForVerification() { return true; }, isCancelled: () => cancelled || page > 3,
      now: () => clock, async pause(ms) { clock += ms; }
    },
    advances,
    get closed() { return closed; }
  };
}

test('翻页到结束且覆盖连续页后完成，未限制为前两条或仅负面反馈', async () => {
  const h = harness();
  const result = await collectAllReviews(h.options);
  assert.equal(result.reviewCount, 3);
  assert.equal(result.reviewComplete, true);
  assert.equal(result.negativeReviews, '');
  assert.equal(h.closed, true);
});

test('缺页或用户终止时保留已读内容，不能标为全部读完', async () => {
  const result = await collectAllReviews(harness({ missingPage: true }).options);
  assert.equal(result.reviewComplete, false);
  assert.equal(result.reviewCount, 1, 'Missing response must not trigger repeated advances');
  const canceled = harness({ cancelled: true });
  assert.equal((await collectAllReviews(canceled.options)).reviewComplete, false);
  assert.equal(canceled.closed, true);
});

test('默认翻页间隔至少10秒，批次休息期间不触发下一页', async () => {
  const h = harness();
  delete h.options.pacing;
  const result = await collectAllReviews(h.options);
  assert.equal(result.reviewCount, 3);
  assert.ok(h.advances[0] >= 10000);
  assert.ok(h.advances[1] - h.advances[0] >= 10000);
  const rested = harness();
  rested.options.pacing = { batchSize: 1 };
  await collectAllReviews(rested.options);
  assert.ok(rested.advances[0] >= 60000);
  assert.ok(rested.advances[1] - rested.advances[0] >= 60000);
});

test('平台限流响应立即停止，不重试、不关闭拒绝提示，保存已读评价', async () => {
  const h = harness();
  const execute = h.options.execute;
  let listener;
  const subscribe = h.options.collector.onRecord;
  h.options.collector.onRecord = fn => subscribe(record => {
    listener = fn;
    fn(record.page === 2 ? { ...record, ret: ['FAIL_SYS_TRAFFIC_LIMIT::访问频繁'] } : record);
  });
  const actions = [];
  h.options.execute = async script => { actions.push(JSON.parse(script.slice(script.lastIndexOf(')(') + 2, -1)).action); return execute(script); };
  const result = await collectAllReviews(h.options);
  assert.equal(result.reviewRateLimited, true);
  assert.equal(result.reviewCount, 1);
  assert.equal(h.advances.length, 1);
  assert.equal(actions.includes('close'), false);
  assert.equal(result.reviewComplete, false);
  assert.match(result.reviewStatus, /限制访问/);
  assert.equal(typeof listener, 'function');
});

test('页面访问拒绝抛出后结束并保留之前读到的评价', async () => {
  const h = harness();
  let checks = 0;
  h.options.waitForVerification = async () => {
    if (++checks === 3) { const error = new Error('访问被拒绝'); error.code = 'COMPETITOR_RATE_LIMITED'; throw error; }
    return true;
  };
  const result = await collectAllReviews(h.options);
  assert.equal(result.reviewRateLimited, true);
  assert.equal(result.reviewCount, 1);
  assert.equal(h.advances.length, 0);
});
