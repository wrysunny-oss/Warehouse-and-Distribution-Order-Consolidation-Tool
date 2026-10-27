'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { detectVerification, createContinueGate } = require('../src/services/crawler-verification');

test('安全验证检测忽略采集提示、隐藏滑块和普通评价文字，识别可见跨域验证框', () => {
  const visible = { getClientRects: () => [1], src: 'https://verify.example/captcha' };
  let bannerText = '请拖动下方滑块完成验证';
  const context = {
    location: { href: 'https://s.taobao.com/search' },
    getComputedStyle: el => ({ display: el.hidden ? 'none' : 'block', visibility: 'visible' }),
    document: {
      readyState: 'complete', title: '商品搜索', body: { innerText: bannerText + '\n扫码防伪验证延迟，大米口感一般' },
      getElementById: () => ({ innerText: bannerText }),
      querySelectorAll: selector => selector === 'iframe' ? [] : [{ ...visible, hidden: true }]
    }
  };
  const inspect = () => vm.runInNewContext(`(${detectVerification.toString()})()`, context);
  assert.equal(inspect().blocked, false);
  context.document.querySelectorAll = selector => selector === 'iframe' ? [visible] : [];
  assert.equal(inspect().captcha, true);
  context.document.querySelectorAll = () => [];
  context.location.href = 'https://login.taobao.com/member/login.jhtml';
  assert.equal(inspect().login, true);
});

test('手动继续门在确认前保持等待，支持取消和幂等继续', async () => {
  const gate = createContinueGate();
  let finished = false;
  gate.promise.then(() => { finished = true; });
  await Promise.resolve();
  assert.equal(finished, false);
  gate.resume(); gate.resume();
  assert.equal(await gate.promise, true);
  const canceled = createContinueGate();
  canceled.cancel(); canceled.resume();
  assert.equal(await canceled.promise, false);
});

test('识别截图中的“亲，访问被拒绝”，忽略采集面板和买家评价中的引用', () => {
  const denial = { innerText: '亲，访问被拒绝', getClientRects: () => [1], closest: () => null };
  const context = { location: { href: 'https://detail.tmall.com/item.htm?id=123' },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    document: { title: '商品详情', readyState: 'complete', body: { innerText: '' }, getElementById: () => null,
      querySelectorAll: selector => selector === 'div, span, p, [role="dialog"]' ? [denial] : [] } };
  const inspect = () => vm.runInNewContext(`(${detectVerification.toString()})()`, context);
  assert.equal(inspect().restricted, true);
  denial.closest = () => ({});
  assert.equal(inspect().restricted, false);
  denial.closest = () => null;
  context.document.getElementById = () => ({ contains: () => true });
  assert.equal(inspect().restricted, false);
});

function harness() {
  let now = 0, status = { ready: true, blocked: false }, intervals = new Map(), nextId = 0;
  let window, extractionCount = 0, onNavigate = () => {};
  const scriptErrors = [];
  const progress = [];
  class Window extends EventEmitter {
    constructor() {
      super(); window = this; this.destroyed = false; this.urls = [];
      this.webContents = new EventEmitter();
      this.webContents.getURL = () => this.urls.at(-1);
      this.webContents.executeJavaScript = async code => {
        try { new vm.Script(code); } catch (error) { scriptErrors.push(error.message); }
        if (code.includes('function detectVerification')) return status;
        if (code.includes('function extractDetailSnapshot')) {
          assert.ok(code.includes('return (function extractDetailSnapshot'), 'Page results must actually be returned from the execution wrapper');
          return { finalPrice: 20, attributes: ['净含量：5kg'], shippingTime: '48小时内', reviewStatus: '页面未展示评价' };
        }
        if (code.includes('return { isManual, count: items.length, items }')) {
          extractionCount++;
          return { count: 5, items: Array.from({ length: 5 }, (_, i) => ({ title: '大米', itemId: String(i), link: 'https://item.taobao.com/item.htm?id=' + i })) };
        }
        return undefined;
      };
    }
    loadURL(url) { this.urls.push(url); onNavigate(url); queueMicrotask(() => this.webContents.emit('did-finish-load')); return Promise.resolve(); }
    isDestroyed() { return this.destroyed; }
    show() {} focus() {}
    close() { this.destroyed = true; this.emit('closed'); }
  }
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services/competitor-crawler-service.js'), 'utf8'), {
    module, exports: module.exports, console, process: { env: {} },
    require: name => name === 'electron' ? { BrowserWindow: Window, session: { fromPartition: () => ({ setUserAgent() {}, webRequest: { onBeforeSendHeaders() {}, onHeadersReceived() {} } }) } }
      : require(path.join('../src/services', name)),
    URL,
    Date: { now: () => now },
    setInterval: callback => { const id = ++nextId; intervals.set(id, callback); return id; },
    clearInterval: id => intervals.delete(id),
    setTimeout: callback => { queueMicrotask(callback); return 1; }
  });
  return {
    api: module.exports, progress, scriptErrors,
    get win() { return window; }, get extracted() { return extractionCount; },
    setStatus(value) { status = value; }, advance(ms) { now += ms; },
    onNavigate(callback) { onNavigate = callback; },
    async settle() { for (let i = 0; i < 30; i++) await Promise.resolve(); },
    async tick() { for (const callback of [...intervals.values()]) await callback(); },
    async start(options = {}) { return module.exports.startBrowserCrawler({ limit: 5, deepReviewLimit: 0, ...options, onProgress: p => progress.push(p) }); }
  };
}

test('采集在用户确认前不滚动；滑块等待超过原180秒也不结束；刷新不会叠加循环', async () => {
  const h = harness();
  const result = h.start();
  await h.settle();
  assert.equal(h.progress.at(-1).stage, 'waiting_ready');
  await h.tick(); assert.equal(h.extracted, 0);
  h.api.continueBrowserCrawler(); await h.settle();
  h.setStatus({ ready: true, blocked: true, captcha: true });
  await h.tick(); h.advance(600000); await h.tick();
  assert.equal(h.progress.at(-1).stage, 'captcha_needed');
  assert.equal(h.progress.at(-1).seconds, 600);
  assert.equal(h.extracted, 0); assert.equal(h.win.destroyed, false);
  // Simulate a verification redirect/reload; only one polling loop may extract.
  h.setStatus({ ready: true, blocked: false });
  h.win.webContents.emit('did-finish-load'); await h.settle();
  await h.tick(); await h.settle();
  assert.equal((await result).length, 5);
  assert.equal(h.extracted, 1);
  assert.deepEqual(h.scriptErrors, [], 'All injected browser scripts must compile');
});

test('当前列表补采直接打开原链接，不重新搜索，也不丢弃原有商品', async () => {
  const h = harness();
  const link = 'https://detail.tmall.com/item.htm?id=123&skuId=selected';
  const result = h.start({ seedItems: [{ itemId: '123', skuId: 'selected', title: '五常大米5kg', link }], deepReviewLimit: 0 });
  await h.settle();
  assert.equal(h.win.urls[0], link);
  h.api.continueBrowserCrawler(); await h.settle(); await h.tick();
  const items = await result;
  assert.equal(items.length, 1);
  assert.equal(items[0].itemId, '123');
  assert.equal(h.extracted, 0, 'Seeded items must not invoke search card extraction');
  assert.deepEqual(h.scriptErrors, []);
});

test('等待用户确认期间终止采集会结束任务，不遗留未完成的继续门', async () => {
  const h = harness(); const result = h.start();
  const rejected = assert.rejects(result, /任务中断/);
  await h.settle(); h.api.stopBrowserCrawler();
  await rejected;
  assert.equal(h.api.continueBrowserCrawler().ok, false);
});

test('详情页出现滑块时保持当前页面等待，验证完成前不返回完成或关闭窗口', async () => {
  const h = harness(); const result = h.start({ deepReviewLimit: 1 });
  await h.settle(); h.api.continueBrowserCrawler(); await h.settle();
  h.onNavigate(() => { if (h.win.urls.length === 2) h.setStatus({ ready: true, blocked: true, captcha: true }); });
  const tick = h.tick(); await h.settle();
  assert.equal(h.progress.at(-1).stage, 'captcha_needed');
  assert.equal(h.win.urls.length, 2);
  assert.equal(h.win.destroyed, false);
  assert.ok(!h.progress.some(p => p.stage === 'completed'));
  h.setStatus({ ready: true, blocked: false });
  await tick;
  assert.equal((await result).length, 5);
  assert.equal(h.progress.at(-1).stage, 'completed');
});

test('某款详情访问被拒绝后停止整轮，不继续打开下一款商品', async () => {
  const h = harness();
  const result = h.start({ deepReviewLimit: 0, seedItems: [1, 2, 3].map(id => ({ itemId: String(id), title: '大米5kg', link: `https://detail.tmall.com/item.htm?id=${id}` })) });
  await h.settle(); h.api.continueBrowserCrawler(); await h.settle();
  h.onNavigate(() => { if (h.win.urls.length === 2) h.setStatus({ ready: true, blocked: true, restricted: true }); });
  await h.tick();
  const items = await result;
  assert.equal(h.win.urls.length, 2);
  assert.equal(items[1].reviewRateLimited, true);
  assert.equal(h.progress.at(-1).stage, 'rate_limited');
  assert.equal(h.win.destroyed, false);
});
