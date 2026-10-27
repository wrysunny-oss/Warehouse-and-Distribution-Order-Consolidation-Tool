'use strict';
const { app, BrowserWindow } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { startLocalCompetitorReceiver, stopLocalCompetitorReceiver } = require('../src/services/competitor-service');
app.setPath('userData', path.join(__dirname, '../test-output/userscript-smoke-profile'));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  let received, metadata, server, win;
  const limited = process.argv.includes('--limited');
  try {
    await startLocalCompetitorReceiver({ port: 41239, onDataReceived(items, meta) { received = items[0]; metadata = meta; } });
    let fixture = `<!doctype html><meta charset="utf-8"><style>body{height:1000px}#drawer{display:none;position:fixed;top:50px;left:20px;width:600px;height:400px;background:white;z-index:10}.comments--fixture{height:200px;overflow-y:scroll}.Comment--fixture{min-height:150px}</style>
      <h1>测试大米5kg</h1><div class="ShowButton--fixture" onclick="openReviews()">查看全部评价</div>
      <div id="drawer" class="Drawer--fixture"><div class="closeWrap--fixture" onclick="document.getElementById('drawer').style.display='none'">关闭</div><div class="Comments--fixture"><div class="expressionWrap--fixture"><div class="imprItem--fixture isSelected">全部</div></div><div class="titleWrapper--fixture">用户评价·6</div><div class="comments--fixture"></div><div class="foldInfoContent--fixture">已折叠2条对你帮助不大的评价</div></div></div>
      <script>
      window.unsafeWindow=window;window.GM_registerMenuCommand=()=>{};window.GM_setClipboard=value=>window.backup=value;window.GM_notification=()=>{};
      window.GM_xmlhttpRequest=options=>fetch(options.url,{method:options.method,headers:options.headers,body:options.data}).then(async response=>options.onload({status:response.status,responseText:await response.text()})).catch(options.onerror);
      let page=0,pending=false;window.originalCallbacks=0;
      function publishPage(number){if(pending)return;pending=true;const name='mtopjsonp'+number;
      window[name]=envelope=>{window.originalCallbacks++;page=number;pending=false;for(const review of envelope.data.rateList){const row=document.createElement('div');row.className='Comment--fixture';const wrapper=document.createElement('div');wrapper.className='contentWrapper--fixture';const content=document.createElement('div');content.className='content--fixture';content.textContent=review.feedback;wrapper.appendChild(content);row.appendChild(wrapper);document.querySelector('.comments--fixture').appendChild(row)}};
      const script=document.createElement('script');script.type='application/json';script.src='https://h5api.m.tmall.com/h5/mtop.taobao.rate.detaillist.get/6.0/?callback='+name+'&data='+encodeURIComponent(JSON.stringify({auctionNumId:'123',pageNo:number,rateType:'-8'}));document.head.appendChild(script);
      setTimeout(()=>window[name]({ret:['SUCCESS::调用成功'],data:{rateList:[{id:number+'a',feedback:'味道很好第'+number+'条',feedbackDate:'2026-10-18',userNick:'must-not-sync'},{id:number+'b',feedback:number===2?'包装破损漏气':'好吃第'+number+'条',appendedFeed:number===3?{appendedFeedback:'追评：依然好吃'}:null}],hasNext:String(number<3),total:'6',foldCount:'2'}}),30)}
      function openReviews(){document.getElementById('drawer').style.display='block';page=0;document.querySelector('.comments--fixture').replaceChildren();publishPage(1)}
      document.querySelector('.comments--fixture').addEventListener('scroll',()=>{if(page>0&&page<3)publishPage(page+1)});
      </script>`;
    if (limited) fixture = fixture.replace("ret:['SUCCESS::调用成功'],data:{rateList:", "ret:number===2?['FAIL_SYS_TRAFFIC_LIMIT::访问受限']:['SUCCESS::调用成功'],data:{rateList:");
    server = http.createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fixture); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    win = new BrowserWindow({ show: false, width: 1220, height: 900, webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, offscreen: true } });
    await win.loadURL(`http://127.0.0.1:${server.address().port}/detail.tmall.com/item.htm?id=123`);
    const source = fs.readFileSync(path.join(__dirname, 'tampermonkey/taobao_factory_crawler.js'), 'utf8').replace('http://127.0.0.1:41235/push-review', 'http://127.0.0.1:41239/push-review');
    await win.webContents.executeJavaScript(source);
    await win.webContents.executeJavaScript(`document.getElementById('tf-btn-extract-detail').click()`);
    const deadline = Date.now() + 45000;
    while (!received && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
    assert.ok(received, 'Full review update must reach the real desktop HTTP receiver');
    assert.equal(received.reviewCount, limited ? 2 : 6);
    assert.equal(received.reviews.length, limited ? 2 : 6);
    assert.equal(received.reviewListExhausted, !limited);
    assert.equal(received.reviewComplete, false);
    assert.equal(received.reviewExcludedCount, 2);
    if (!limited) assert.equal(received.reviews.at(-1).appendContent, '追评：依然好吃');
    assert.equal(received.negativeReviews, limited ? '' : '包装破损漏气');
    assert.equal(received.reviewRateLimited, limited);
    assert.equal(JSON.stringify(received).includes('must-not-sync'), false);
    assert.equal(metadata.isSingleReviewUpdate, true);
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(await win.webContents.executeJavaScript('window.originalCallbacks'), limited ? 2 : 3);
    assert.equal(await win.webContents.executeJavaScript(`document.getElementById('tf-status-badge').innerText`), limited ? '访问受限，已保存' : '同步成功');
    console.log(JSON.stringify({ ok: true, checks: ['standalone generated userscript', 'JSONP passive observation', 'three review pages', 'all sentiments and appended feedback', 'real desktop HTTP sync', 'folded review disclosure', 'buyer identity excluded'] }));
  } catch (error) { console.error(error); app.exitCode = 1; }
  finally { if (win && !win.isDestroyed()) win.destroy(); server?.close(); stopLocalCompetitorReceiver(); app.quit(); }
});
