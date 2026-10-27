'use strict';
// Persistent, task-scoped live browser. Keeps the authenticated window alive
// while the extractor is repaired, rather than requiring login for each probe.
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createProductResponseCollector } = require('../src/services/competitor-response-collector');
const { detectVerification } = require('../src/services/crawler-verification');
const out = path.join(__dirname, '../test-output/live-competitor');
fs.mkdirSync(out, { recursive: true });
app.setPath('userData', path.join(__dirname, '../test-output/competitor-live-profile'));
app.disableHardwareAcceleration();
const safeData = value => {
  if (Array.isArray(value)) return value.slice(0, 250).map(safeData);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/cookie|token|password|sign$|buyer|seller|user|account|nick|avatar|address|phone|mobile/i.test(key)).map(([key, v]) => [key, safeData(v)]));
};
app.whenReady().then(async () => {
  const items = JSON.parse(fs.readFileSync(path.join(__dirname, '../竞品补采数据_2026-10-18.json'), 'utf8')).items;
  let index = 0, busy = false, commandId = '', captured = false;
  const targets = new Map();
  const attach = win => {
    const collector = createProductResponseCollector(win.webContents);
    targets.set(win, collector);
    win.webContents.on('did-create-window', attach);
    win.on('page-title-updated', event => event.preventDefault());
    win.setTitle('竞品采集诊断（保留窗口）：请在此登录，不是 Chrome/Edge');
    collector.onRecord(record => {
      if (record.itemId !== items[index].itemId) return;
      const name = record.api.replace(/[^a-z0-9.]/gi, '_');
      fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(safeData(record), null, 2));
    });
  };
  const win = new BrowserWindow({ title: '竞品采集诊断（保留窗口）', width: 1220, height: 860, show: true,
    webPreferences: { session: session.fromPartition('persist:taobao_crawler'), nodeIntegration: false, contextIsolation: false } });
  attach(win); win.show(); win.focus();
  win.loadURL(items[index].link).catch(error => console.log(error.code));
  const capture = async target => {
    const modulePath = require.resolve('../src/services/competitor-detail-extractor');
    delete require.cache[modulePath];
    const { extractDetailSnapshot } = require(modulePath);
    const collector = targets.get(target); await collector.flush();
    const records = collector.forItem(items[index].itemId);
    const args = { itemId: items[index].itemId, skuId: items[index].skuId,
      responseData: records.filter(r => r.ret.some(ret => ret.startsWith('SUCCESS'))).map(r => r.data) };
    const snapshot = await target.webContents.executeJavaScript(`(${extractDetailSnapshot.toString()})(${JSON.stringify(args)})`);
    const initial = await target.webContents.executeJavaScript('JSON.stringify(window.__ICE_APP_CONTEXT__ || {})');
    fs.writeFileSync(path.join(out, 'ssr-product.json'), JSON.stringify(safeData(JSON.parse(initial)), null, 2));
    const dom = await target.webContents.executeJavaScript(`({parameters:[...document.querySelectorAll('div,span,li')].filter(e=>e.children.length<2 && /^(包装方式|净含量|产品名称|大米种类|产地)$/.test((e.innerText||'').trim())).slice(0,25).map(e=>({cls:e.className,parentClass:e.parentElement.className,text:e.parentElement.innerText,grandClass:e.parentElement.parentElement.className,grandText:e.parentElement.parentElement.innerText.slice(0,300)})),reviewLeaves:[...document.querySelectorAll('div,span,p')].filter(e=>e.children.length<2 && /content|comment|rate|review/i.test(e.className||'') && !/user|nick|avatar/i.test(e.className||'') && (e.innerText||'').length>15 && (e.innerText||'').length<400).slice(0,40).map(e=>({cls:e.className,text:e.innerText})),buttons:[...document.querySelectorAll('div,span,button,a')].filter(e=>e.children.length<2 && /^(查看全部评价|用户评价|参数信息|差评|中差评|全部)$/.test((e.innerText||'').trim())).slice(0,30).map(e=>({cls:e.className,text:e.innerText}))})`);
    fs.writeFileSync(path.join(out, 'actual-dom.json'), JSON.stringify(dom, null, 2));
    fs.writeFileSync(path.join(out, `verified-item-${index}.json`), JSON.stringify({ itemId: items[index].itemId, snapshot, responses: records.map(r => ({ api: r.api, ret: r.ret, keys: Object.keys(r.data || {}) })) }, null, 2));
    console.log('CAPTURED', index, JSON.stringify(snapshot));
  };
  const timer = setInterval(async () => {
    if (busy) return; busy = true;
    try {
      let selected;
      const states = [];
      for (const target of targets.keys()) {
        if (target.isDestroyed()) continue;
        try {
          const info = await target.webContents.executeJavaScript(`({state:(${detectVerification.toString()})(),host:location.host,title:document.title})`);
          states.push(info);
          if (info.state.ready && !info.state.blocked && /^(detail\.tmall\.com|detail\.taobao\.com|item\.taobao\.com)$/.test(info.host)) selected = target;
        } catch {}
      }
      fs.writeFileSync(path.join(out, 'live-state.json'), JSON.stringify({ states }, null, 2));
      if (!selected) return;
      let command;
      try { command = JSON.parse(fs.readFileSync(path.join(out, 'command.json'), 'utf8')); } catch {}
      if (command && command.id !== commandId) {
        commandId = command.id;
        if (command.action === 'close') {
          clearInterval(timer); for (const c of targets.values()) c.close();
          await session.fromPartition('persist:taobao_crawler').cookies.flushStore();
          for (const target of targets.keys()) if (!target.isDestroyed()) target.destroy();
          app.quit(); return;
        }
        if (command.action === 'all-reviews') {
          const reviewModule = require.resolve('../src/services/competitor-review-service');
          delete require.cache[reviewModule];
          const { collectAllReviews } = require(reviewModule);
          const result = await collectAllReviews({
            itemId: items[index].itemId, collector: targets.get(selected),
            execute: script => selected.webContents.executeJavaScript(script, true),
            click: async point => {
              selected.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
              selected.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
            },
            waitForVerification: async () => {
              while (!selected.isDestroyed()) {
                const state = await selected.webContents.executeJavaScript(`(${detectVerification.toString()})()`);
                if (state.ready && !state.blocked) return true;
                console.log('REVIEW_VERIFICATION_REQUIRED');
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
              return false;
            },
            isCancelled: () => selected.isDestroyed(),
            onProgress: progress => console.log('REVIEW_PROGRESS', JSON.stringify(progress))
          });
          fs.writeFileSync(path.join(out, `all-reviews-${index}.json`), JSON.stringify(result, null, 2));
          console.log('ALL_REVIEWS_RESULT', result.reviewStatus);
        }
        if (command.action === 'navigate' && Number.isInteger(command.index) && items[command.index]) {
          index = command.index; captured = false; await selected.loadURL(items[index].link); return;
        }
        if (command.action === 'review-probe') {
          const point = await selected.webContents.executeJavaScript(`(() => { const el=document.querySelector('[class*="ShowButton--"]'); if(!el)return null;el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; })()`);
          if (point) {
            selected.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
            selected.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
            await new Promise(resolve => setTimeout(resolve, 3500));
          }
        }
        if (command.action === 'inspect' || command.action === 'review-probe') {
          const inspection = await selected.webContents.executeJavaScript(`({ frames:[...document.querySelectorAll('iframe')].map(e=>({title:e.title,id:e.id,host:(()=>{try{return new URL(e.src).host}catch{return ''}})(),cls:e.className})), leaves:[...document.querySelectorAll('div,span,p,button,a')].filter(e=>e.children.length===0&&e.getClientRects().length&&/rate|comment|review|pagination|next|dialog|drawer|content/i.test(e.className||'')&&!/user|nick|avatar|address/i.test(e.className||'')).slice(-180).map(e=>({cls:e.className,text:(e.innerText||'').slice(0,500),parent:e.parentElement.className})),scripts:[...document.scripts].map(s=>s.src).filter(Boolean)})`);
          fs.writeFileSync(path.join(out, 'review-inspection.json'), JSON.stringify(inspection, null, 2));
        }
        if (command.action === 'parameters' || command.action === 'reviews') {
          const label = command.action === 'parameters' ? '参数信息' : '查看全部评价';
          const clicked = await selected.webContents.executeJavaScript(`(() => { const el=[...document.querySelectorAll('div,span,button,a')].find(e=>e.children.length<2 && (e.innerText||'').trim()===${JSON.stringify(label)}); if(el){el.scrollIntoView({block:'center'});el.click();return true;}return false;})()`);
          console.log('CLICK', label, clicked);
          await new Promise(resolve => setTimeout(resolve, 2200));
        }
        await capture(selected); captured = true;
      } else if (!captured) {
        await new Promise(resolve => setTimeout(resolve, 8000)); await capture(selected); captured = true;
      }
    } catch (error) { console.log('DIAGNOSTIC_ERROR', error.message); }
    finally { busy = false; }
  }, 1500);
  app.on('window-all-closed', () => { clearInterval(timer); app.quit(); });
});
