'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { buildUserscript } = require('../scripts/build-tampermonkey.cjs');
const { installBrowserReviewObserver } = require('../src/services/competitor-browser-review-observer');

test('生成的独立油猴脚本与共享评价引擎保持一致且无Node依赖', () => {
  const source = buildUserscript();
  assert.equal(fs.readFileSync('scripts/tampermonkey/taobao_factory_crawler.js', 'utf8').replace(/\r\n/g, '\n'), source);
  assert.match(source, /@version\s+2\.1\.0/);
  assert.match(source, /@grant\s+unsafeWindow/);
  assert.doesNotMatch(source, /module\.exports|require\(/);
  assert.doesNotMatch(source, /暂无明显差评标签|多数买家反馈满意/);
  new vm.Script(source);
});

test('油猴被动监听JSONP与fetch，按商品和页号识别；恢复原函数且不改写站点响应', async () => {
  let mutations;
  const originalObserver = global.MutationObserver, originalDocument = global.document;
  global.MutationObserver = class { constructor(callback) { mutations = callback; } observe() {} disconnect() {} };
  global.document = { documentElement: {} };
  try {
    const records = [];
    const response = { clone: () => ({ text: async () => JSON.stringify({ ret: ['SUCCESS::调用成功'], data: { rateList: [{ id: 'f', feedback: '好' }], hasNext: 'false' } }) }) };
    const originalFetch = async () => response;
    let callbackCount = 0;
    const originalCallback = () => { callbackCount++; return 'original-result'; };
    const page = { location: { href: 'https://detail.tmall.com/item.htm?id=123' }, fetch: originalFetch, mtopjsonp1: originalCallback };
    const observer = installBrowserReviewObserver(page);
    observer.onRecord(record => records.push(record));
    const url = 'https://h5api.m.tmall.com/h5/mtop.taobao.rate.detaillist.get/6.0/?callback=mtopjsonp1&data=' + encodeURIComponent(JSON.stringify({ auctionNumId: '123', pageNo: 2, rateType: '-8' }));
    mutations([{ addedNodes: [{ nodeType: 1, tagName: 'SCRIPT', src: url }] }]);
    assert.equal(page.mtopjsonp1({ ret: ['SUCCESS::调用成功'], data: { rateList: [{ id: 'a', feedback: '好吃' }] } }), 'original-result');
    assert.equal(callbackCount, 1);
    assert.equal(records[0].itemId, '123');
    assert.equal(records[0].page, 2);
    assert.equal(records[0].reviewAll, true);
    assert.equal(await page.fetch(url), response);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    assert.equal(records.length, 2);
    observer.close();
    assert.equal(page.fetch, originalFetch);
    assert.equal(page.mtopjsonp1, originalCallback);
  } finally {
    global.MutationObserver = originalObserver; global.document = originalDocument;
  }
});
