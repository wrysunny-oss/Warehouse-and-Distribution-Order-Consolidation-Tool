// Run with the project's Electron binary; exercises the built renderer offline.
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { getMockTaoFactoryRiceTop20 } = require('../src/services/competitor-service');
const { extractDetailSnapshot, readCardPrice } = require('../src/services/competitor-detail-extractor');
app.setPath('userData', path.join(__dirname, '../test-output/competitor-smoke-profile'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1440, height: 1000, webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, offscreen: true } });
  const errors = [];
  win.webContents.on('console-message', (_event, level, message) => { if (level === 3) errors.push(message); });
  const run = code => win.webContents.executeJavaScript(code, true);
  const pause = () => new Promise(r => setTimeout(r, 100));
  const choose = async (label, text) => {
    await run(`(() => { const el = document.querySelector('[aria-label="${label}"]'); el.focus(); el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); })()`);
    await pause();
    assert.ok(await run(`document.querySelector('[role="listbox"]') !== null`), 'Select must open a Radix listbox');
    await run(`(() => { const option = Array.from(document.querySelectorAll('[role="option"]')).find(el => el.textContent === ${JSON.stringify(text)}); if (!option) throw new Error('Missing option'); option.focus(); option.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
    await pause();
    assert.ok(await run(`document.querySelector('[aria-label="${label}"]').textContent.includes(${JSON.stringify(text)})`));
  };
  try {
    const fixture = `<!doctype html><html><body>
      <script>window.__INITIAL_DATA__={data:{item:{itemId:'123',title:'五常大米5kg'},skuBase:{props:[{pid:'weight',values:[{vid:'5',name:'5kg 真空包装'}]}],skus:[{skuId:'selected',propPath:'weight:5'}]},skuCore:{sku2info:{selected:{price:{priceText:'24.86'},originalPrice:{priceText:'39.90'}}}},props:{groupProps:[{基本信息:[{净含量:'5kg'},{包装方式:'真空包装'}]}]}}};</script>
      <div class="card"><span class="price">满20减2元</span><div><span class="priceInt">24</span><span class="priceFloat">.86</span></div></div>
      <div class="delivery">包邮，48小时内发货</div>
      <p class="review-content">收到时包装破损漏气，碎米很多不好吃</p>
      <p class="review-content">米饭很香很好吃，包装完整配送及时</p>
    </body></html>`;
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(fixture));
    const detail = await run(`(() => { try { return (${extractDetailSnapshot.toString()})({itemId:'123',skuId:'selected'}); } catch(error) { return {error:error.message}; } })()`);
    assert.equal(detail.finalPrice, 24.86);
    assert.equal(detail.originalPrice, 39.9);
    assert.equal(detail.freeShipping, true);
    assert.equal(detail.shippingTime, '48小时内发货');
    assert.ok(detail.negativeReviews.includes('包装破损'));
    assert.ok(!detail.negativeReviews.includes('米饭很香'));
    assert.equal(await run(`(${readCardPrice.toString()})(document.querySelector('.card'))`), 24.86);
    await win.loadFile(path.join(__dirname, '../src/renderer/dist/index.html'));
    await run(`new Promise((resolve, reject) => { const r=indexedDB.open('competitor-analysis',1);r.onupgradeneeded=()=>r.result.createObjectStore('cache');r.onsuccess=()=>{const db=r.result,t=db.transaction('cache','readwrite');t.objectStore('cache').clear();t.oncomplete=()=>{db.close();resolve()};t.onerror=()=>reject(t.error)};r.onerror=()=>reject(r.error)})`);
    await run(`localStorage.setItem('competitor_items', ${JSON.stringify(JSON.stringify(getMockTaoFactoryRiceTop20()))})`);
    await win.reload();
    await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    await run(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('市场与竞品')).click()`);
    await new Promise(r => setTimeout(r, 350));
    assert.ok(await run(`document.querySelector('#competitorView') !== null`));
    assert.ok(await run(`document.querySelector('#competitorView').textContent.includes('显示 20 / 20 款')`));
    assert.ok(await run(`document.querySelector('#competitorView').textContent.includes('仅供演示')`));
    assert.equal(await run(`document.querySelectorAll('#competitorView select, #competitorView input[type="checkbox"]').length`), 0);
    await run(`document.querySelector('#competitorTableScroll').scrollIntoView({ block: 'end' })`);
    await pause();
    await run(`document.querySelector('#competitorView').scrollTop = document.querySelector('#competitorView').scrollHeight`);
    for (let attempt = 0; attempt < 40; attempt++) {
      if (await run(`Boolean(document.querySelector('#competitorTableScroll [data-orientation="horizontal"] > div'))`)) break;
      await pause();
    }
    assert.ok(await run(`Boolean(document.querySelector('#competitorTableScroll [data-orientation="horizontal"] > div'))`), 'Radix must finish measuring the horizontal scrollbar');
    const geometry = await run(`(() => {
      const root = document.querySelector('#competitorTableScroll');
      const viewport = root.querySelector('[data-radix-scroll-area-viewport]');
      const bar = root.querySelector('[data-orientation="horizontal"]');
      const thumb = bar.firstElementChild.getBoundingClientRect();
      const main = document.querySelector('#competitorView');
      return { overflow: viewport.scrollWidth - viewport.clientWidth, x: Math.round(thumb.x + thumb.width / 2), y: Math.round(thumb.y + thumb.height / 2), barBottom: bar.getBoundingClientRect().bottom, rootBottom: root.getBoundingClientRect().bottom, windowHeight: innerHeight, mainScrollTop: main.scrollTop, mainHeight: main.clientHeight, mainScrollHeight: main.scrollHeight };
    })()`);
    assert.ok(geometry.overflow > 0, 'Table must overflow horizontally');
    assert.ok(geometry.y < geometry.windowHeight, 'Scrollbar must be inside the visible window');
    assert.ok(Math.abs(geometry.barBottom - geometry.rootBottom) < 3, 'Horizontal scrollbar must stay at container bottom');
    win.webContents.sendInputEvent({ type: 'mouseMove', x: geometry.x, y: geometry.y });
    win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, x: geometry.x, y: geometry.y });
    win.webContents.sendInputEvent({ type: 'mouseMove', x: geometry.x + 600, y: geometry.y });
    win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: geometry.x + 600, y: geometry.y });
    await pause();
    assert.ok(await run(`document.querySelector('#competitorTableScroll [data-radix-scroll-area-viewport]').scrollLeft > 0`), 'Dragging the horizontal thumb must move the table');
    assert.ok(await run(`(() => { const root = document.querySelector('#competitorTableScroll'); const viewport = root.querySelector('[data-radix-scroll-area-viewport]').getBoundingClientRect(); return root.querySelector('th:last-child').getBoundingClientRect().right <= viewport.right + 2; })()`), 'Dragging to the right must expose the final column');
    fs.writeFileSync(path.join(__dirname, '../test-output/competitor-horizontal.png'), (await win.webContents.capturePage()).toPNG());
    await run(`document.querySelector('#competitorTableScroll [data-radix-scroll-area-viewport]').scrollLeft = 0; document.querySelector('#competitorView').scrollTop = 0`);
    await pause();
    fs.writeFileSync(path.join(__dirname, '../test-output/competitor-desktop.png'), (await win.webContents.capturePage()).toPNG());
    await choose('排序方式', '元/kg：低到高');
    await choose('评价来源筛选', '有采集评价');
    await new Promise(r => setTimeout(r, 100));
    assert.ok(await run(`document.querySelector('#competitorView').textContent.includes('没有符合筛选条件的商品')`));
    await run(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === '重置筛选').click()`);
    await new Promise(r => setTimeout(r, 100));
    await run(`document.querySelector('button[title="清空当前数据"]').click()`);
    await new Promise(r => setTimeout(r, 100));
    await run(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(b => b.textContent === '清空列表').click()`);
    await new Promise(r => setTimeout(r, 100));
    assert.ok(await run(`document.querySelector('#competitorView').textContent.includes('显示 0 / 0 款')`));
    await run(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('撤销上次')).click()`);
    await new Promise(r => setTimeout(r, 100));
    assert.ok(await run(`document.querySelector('#competitorView').textContent.includes('显示 20 / 20 款')`));
    win.setSize(1024, 768);
    await new Promise(r => setTimeout(r, 150));
    fs.writeFileSync(path.join(__dirname, '../test-output/competitor-compact.png'), (await win.webContents.capturePage()).toPNG());
    win.setSize(1440, 1000);
    await pause();
    for (const label of ['补货与库存协同', '发运履约中心', '财务结算对账']) {
      await run(`Array.from(document.querySelectorAll('nav button')).find(b => b.textContent.includes(${JSON.stringify(label)})).click()`);
      await pause();
      assert.equal(await run(`document.querySelectorAll('select, input[type="checkbox"]').length`), 0, `${label} must use shared shadcn controls`);
    }
    await run(`Array.from(document.querySelectorAll('aside button')).find(b => b.textContent.includes('主数据与配置中心')).click()`);
    await pause();
    await run(`(() => { const tab = Array.from(document.querySelectorAll('[role="tab"]')).find(t => t.textContent.includes('仓库与统计预设')); tab.focus(); tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); tab.click(); })()`);
    await pause();
    await run(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(b => b.textContent.includes('新增仓库')).click()`);
    await pause();
    const beforeCheck = await run(`document.querySelector('[role="dialog"] [role="checkbox"]').getAttribute('data-state')`);
    await run(`document.querySelector('[role="dialog"] [role="checkbox"]').click()`);
    await pause();
    assert.notEqual(await run(`document.querySelector('[role="dialog"] [role="checkbox"]').getAttribute('data-state')`), beforeCheck, 'Warehouse shadcn checkbox must update controlled state');
    assert.equal(await run(`document.querySelectorAll('[role="dialog"] select, [role="dialog"] input[type="checkbox"]').length`), 0);
    await run(`document.querySelector('[role="dialog"] button .sr-only')?.closest('button').click()`);
    await pause();
    // Exercise the renderer's new manual verification gate without visiting a
    // real store or generating a real security challenge.
    await run(`void (window.excelTool = {
      onCompetitorCrawlProgress: callback => { window.smokeCrawlProgress = callback; return () => {}; },
      startCompetitorCrawl: options => new Promise(resolve => {
        window.smokeCrawlOptions = options;
        window.smokeCrawlResolve = resolve;
        window.smokeCrawlProgress({ stage: 'waiting_ready', message: '请完成验证后手动开始采集' });
      }),
      continueCompetitorCrawl: async () => {
        window.smokeCrawlContinued = true;
        window.smokeCrawlResolve([{ title: '验证后的商品', itemId: 'review-product', skuId: 'selected', finalPrice: 20, spec: '5kg', reviewScope: 'all', reviewListExhausted: true, reviewCount: 55, reviewStatus: '可见评价列表已读完：已读55条', reviews: Array.from({length:55},(_,index)=>({id:String(index),content:'评价全文第'+(index+1)+'条',appendContent:index===54?'追加评价内容':'',date:'2026-10-18',sku:'5kg'})) }]);
        return { ok: true };
      }
    })`);
    await run(`Array.from(document.querySelectorAll('nav button')).find(b => b.textContent.includes('市场与竞品')).click()`);
    await pause();
    await run(`document.querySelector('#startModeBBrowserCrawlBtn').click()`);
    await pause();
    await run(`document.querySelector('#confirmStartCrawlBtn').click()`);
    await pause();
    assert.ok(await run(`Array.from(document.querySelectorAll('[role="dialog"] button')).some(b => b.textContent.includes('我已完成验证，开始采集'))`));
    assert.equal(await run(`Boolean(window.smokeCrawlContinued)`), false);
    fs.writeFileSync(path.join(__dirname, '../test-output/competitor-verification-wait.png'), (await win.webContents.capturePage()).toPNG());
    await run(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(b => b.textContent.includes('我已完成验证，开始采集')).click()`);
    await pause();
    assert.equal(await run(`window.smokeCrawlContinued`), true);
    assert.ok(await run(`document.querySelector('#competitorView').textContent.includes('验证后的商品')`));
    await run(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === '补采当前列表详情').click()`);
    await pause();
    await run(`document.querySelector('#confirmStartCrawlBtn').click()`);
    await pause();
    assert.equal(await run(`window.smokeCrawlOptions.seedItems.length`), 1);
    await run(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(b => b.textContent.includes('我已完成验证，开始采集')).click()`);
    await pause();
    await run(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('查看评价（55条）')).click()`);
    await pause();
    assert.equal(await run(`document.querySelectorAll('[role="dialog"] article').length`), 50);
    await run(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(b=>b.textContent==='下一页').click()`);
    await pause();
    assert.equal(await run(`document.querySelectorAll('[role="dialog"] article').length`), 5);
    assert.ok(await run(`document.querySelector('[role="dialog"]').textContent.includes('追加评价内容')`));
    await run(`(() => { const input=document.querySelector('[aria-label="搜索全部评价内容"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'全文第55条');input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await pause();
    assert.equal(await run(`document.querySelectorAll('[role="dialog"] article').length`), 1);
    await new Promise(resolve => setTimeout(resolve, 400));
    fs.writeFileSync(path.join(__dirname, '../test-output/competitor-all-reviews-dialog.png'), (await win.webContents.capturePage()).toPNG());
    await run(`document.querySelector('[role="dialog"] button .sr-only')?.closest('button').click()`);
    await pause();
    const cachedCount = await run(`new Promise(resolve=>{const r=indexedDB.open('competitor-analysis',1);r.onsuccess=()=>{const db=r.result,t=db.transaction('cache','readonly'),q=t.objectStore('cache').get('items');t.oncomplete=()=>{db.close();resolve(q.result?.[0]?.reviews?.length)}}})`);
    assert.equal(cachedCount,55,'Full review text must be persisted in IndexedDB');
    await win.reload();
    await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    await pause();
    await run(`Array.from(document.querySelectorAll('nav button')).find(b=>b.textContent.includes('市场与竞品')).click()`);
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.ok(await run(`document.querySelector('#competitorView').textContent.includes('查看评价（55条）')`), 'Reload must restore full review collection');
    assert.equal(errors.length, 0, 'Renderer must not log errors');
    console.log(JSON.stringify({ ok: true, checks: ['real browser detail extraction fixture', 'render', 'sample notice', 'horizontal scrollbar drag', 'shadcn select keyboard interaction', 'sort', 'review filter', 'reset', 'clear', 'undo', 'workflow navigation', 'warehouse shadcn checkbox', 'manual crawl verification gate', 'existing list detail enrichment'], errors }));
  } catch (error) {
    console.error(error);
    console.error('Renderer errors:', errors);
    app.exit(1);
  } finally { win.destroy(); app.quit(); }
});
