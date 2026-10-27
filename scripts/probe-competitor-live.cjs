// Loads one real product in the SAME partition used by Mode B. Credentials and
// request headers are never logged. Login/captcha are always completed manually.
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { extractDetailSnapshot } = require('../src/services/competitor-detail-extractor');
const { detectVerification } = require('../src/services/crawler-verification');
const { createProductResponseCollector } = require('../src/services/competitor-response-collector');
app.setPath('userData', path.join(app.getPath('appData'), 'excel-warehouse-summary'));
app.disableHardwareAcceleration();
const output = path.join(__dirname, '../test-output/live-competitor');
fs.mkdirSync(output, { recursive: true });
const sanitize = value => {
  if (Array.isArray(value)) return value.slice(0, 200).map(sanitize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/cookie|token|password|sign$|buyer|seller|user|account|nick|avatar|address|phone|mobile/i.test(key)).map(([key, v]) => [key, sanitize(v)]));
};
app.whenReady().then(async () => {
  const interactive = process.argv.includes('--interactive');
  const windows = new Map(), captured = [];
  const attach = win => {
    const collector = createProductResponseCollector(win.webContents);
    windows.set(win, collector);
    collector.onRecord(record => {
      const entry = { api: record.api, itemId: record.itemId, ret: record.ret, keys: Object.keys(record.data || {}) };
      captured.push(entry);
      fs.writeFileSync(path.join(output, `response-${captured.length}.json`), JSON.stringify(sanitize({ path: record.api, payload: { ret: record.ret, data: record.data } }), null, 2));
      console.log('RESPONSE', JSON.stringify(entry));
    });
    win.webContents.on('did-create-window', child => attach(child));
    win.on('page-title-updated', event => event.preventDefault());
    win.setTitle('竞品采集诊断 · 请在此窗口登录（独立于 Chrome/Edge）');
  };
  const win = new BrowserWindow({ show: interactive, title: '竞品采集诊断 · 请在此窗口登录', width: 1220, height: 860,
    webPreferences: { session: session.fromPartition('persist:taobao_crawler'), contextIsolation: false, nodeIntegration: false } });
  attach(win);
  if (interactive) { win.show(); win.focus(); }
  const item = JSON.parse(fs.readFileSync(path.join(__dirname, '../竞品补采数据_2026-10-18.json'), 'utf8')).items[0];
  console.log('diagnostic ready');
  try {
    win.loadURL(item.link).catch(error => console.log('navigation:', error.code));
    const deadline = Date.now() + (interactive ? 10 * 60 * 1000 : 30000);
    let selected, state;
    while (Date.now() < deadline && [...windows.keys()].some(window => !window.isDestroyed())) {
      const states = [];
      for (const target of windows.keys()) {
        if (target.isDestroyed() || !target.webContents.getURL()) continue;
        try {
          const info = await target.webContents.executeJavaScript(`({state:(${detectVerification.toString()})(),host:location.host,title:document.title})`);
          states.push({ ...info, id: target.id });
          if (info.state.ready && !info.state.blocked && /^(detail\.tmall\.com|detail\.taobao\.com|item\.taobao\.com)$/.test(info.host)) { selected = target; state = info.state; }
        } catch {}
      }
      fs.writeFileSync(path.join(output, 'live-state.json'), JSON.stringify({ states, responses: captured }, null, 2));
      if (selected) break;
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    if (!selected) { console.log('NO_AUTHENTICATED_PRODUCT_PAGE'); return; }
    await new Promise(resolve => setTimeout(resolve, 10000));
    const collector = windows.get(selected);
    await collector.flush();
    const records = collector.forItem(item.itemId);
    const responseData = records.filter(r => r.ret.some(ret => ret.startsWith('SUCCESS'))).map(r => r.data);
    const snapshot = await selected.webContents.executeJavaScript(`(${extractDetailSnapshot.toString()})(${JSON.stringify({ itemId: item.itemId, skuId: item.skuId, responseData })})`);
    const initial = await selected.webContents.executeJavaScript('JSON.stringify(window.__ICE_APP_CONTEXT__ || {})');
    fs.writeFileSync(path.join(output, 'ssr-product.json'), JSON.stringify(sanitize(JSON.parse(initial)), null, 2));
    const nodes = await selected.webContents.executeJavaScript(`({parameters:[...document.querySelectorAll('div,span,li')].filter(e=>e.children.length<2 && /^(包装方式|净含量|产品名称|大米种类|产地)$/.test((e.innerText||'').trim())).slice(0,25).map(e=>({cls:e.className,parentClass:e.parentElement.className,text:e.parentElement.innerText,grandClass:e.parentElement.parentElement.className,grandText:e.parentElement.parentElement.innerText.slice(0,300)})), reviewLeaves:[...document.querySelectorAll('div,span,p')].filter(e=>e.children.length<2 && /content|comment|rate|review/i.test(e.className||'') && !/user|nick|avatar/i.test(e.className||'') && (e.innerText||'').length>15 && (e.innerText||'').length<400).slice(0,30).map(e=>({cls:e.className,text:e.innerText})),buttons:[...document.querySelectorAll('div,span,button,a')].filter(e=>e.children.length<2 && /^(查看全部评价|用户评价|参数信息|差评|中差评|全部)$/.test((e.innerText||'').trim())).slice(0,20).map(e=>({cls:e.className,text:e.innerText}))})`);
    fs.writeFileSync(path.join(output, 'actual-dom.json'), JSON.stringify(nodes, null, 2));
    const structure = await selected.webContents.executeJavaScript(`({ title:document.title, host:location.host, globals:Object.keys(window).filter(k=>/initial|ice|detail|global.*data/i.test(k)).slice(0,50), snippets:[...document.querySelectorAll('div,span,li,dt,dd')].filter(e=>e.children.length<2 && /发货|包装方式|净含量|暂无评价|用户评价|商品评价|全部评价|参数/.test(e.innerText||'') && (e.innerText||'').length<120).slice(0,70).map(e=>({tag:e.tagName,cls:e.className,text:e.innerText})) })`);
    const probe = { state, snapshot, structure, responses: captured };
    fs.writeFileSync(path.join(output, 'probe.json'), JSON.stringify(probe, null, 2));
    console.log(JSON.stringify(probe, null, 2));
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { for (const [target, collector] of windows) { collector.close(); if (!target.isDestroyed()) target.destroy(); } app.quit(); }
});
