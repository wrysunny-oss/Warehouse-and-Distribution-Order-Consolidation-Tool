// Offline desktop check using the real preload, IPC handlers and sample workbooks.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const service = require('../src/services/return-workflow-service');
const { registerReturnSummaryIpc } = require('../src/return-summary-ipc');
const root = path.join(__dirname, '..'), output = path.join(root, 'test-output/return-workflow-smoke');
fs.mkdirSync(output, { recursive: true });
const destination = fs.mkdtempSync(path.join(output, 'exports-'));
app.setPath('userData', path.join(output, 'profile'));
app.disableHardwareAcceleration();
const sample = path.join(root, 'src/templates/国宝截止到2026.10.22，未申报的退货明细(1).xlsx');
let openPath = sample, cancel = true, win, latest, savePath = path.join(destination, '未申报明细.xlsx');
const products = [...require('../product-preset.json').rows, ...['6911006000892', '6911006999523'].map(code => ({ '条码': code, '订单简称': `测试商品${code}` }))];
registerReturnSummaryIpc({ ipcMain: { handle: (channel, fn) => ipcMain.handle(channel, async (event, payload) => { const result = await fn(event, payload); if (result?.selection !== undefined && result?.summary !== undefined) latest = result; return result; }) }, getWindow: () => win, loadProducts: async () => products,
  dialog: { showOpenDialog: async (_window, options) => ({ canceled: options.properties.includes('openDirectory') ? cancel : false, filePaths: [options.properties.includes('openDirectory') ? destination : openPath] }), showSaveDialog: async () => ({ canceled: false, filePath: savePath }) } });
ipcMain.handle('product:get-preset', () => ({ rows: products }));
ipcMain.handle('warehouse:get-preset', () => ({ rows: [] }));
ipcMain.handle('invoice:get-config', () => ({}));
app.whenReady().then(async () => {
  win = new BrowserWindow({ show: false, width: 1440, height: 1000, webPreferences: { preload: path.join(root, 'src/preload.js'), contextIsolation: true, sandbox: true, offscreen: true, backgroundThrottling: false } });
  const errors = [];
  win.webContents.on('console-message', (_event, level, message) => { if (level === 3) errors.push(message); });
  const run = code => win.webContents.executeJavaScript(code, true);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms || 120));
  const wait = async code => { for (let i = 0; i < 100; i++) { if (await run(code)) return; await pause(); } throw new Error(`Timed out: ${code}`); };
  const idle = () => wait(`document.querySelector('#returnWorkflowView')?.getAttribute('aria-busy')==='false'`);
  const click = async selector => { await run(`document.querySelector(${JSON.stringify(selector)}).click()`); await pause(); };
  const buttonText = async (scope, content) => { await run(`Array.from(document.querySelectorAll(${JSON.stringify(scope + ' button')})).find(b=>b.textContent.includes(${JSON.stringify(content)})).click()`); await pause(); };
  const tab = async (scope, content) => {
    await run(`(() => {const el=Array.from(document.querySelectorAll(${JSON.stringify(scope + ' [role="tab"]')})).find(t=>t.textContent.includes(${JSON.stringify(content)}));el.focus();el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));el.click();})()`); await pause();
  };
  const input = async (selector, value) => { await run(`(() => {const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`); await pause(); };
  const choose = async (selector, content) => {
    await run(`(() => {const el=document.querySelector(${JSON.stringify(selector)});el.focus();el.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));})()`); await pause();
    await run(`(() => {const el=Array.from(document.querySelectorAll('[role="option"]')).find(e=>e.textContent.includes(${JSON.stringify(content)}));if(!el)throw new Error('Missing option');el.focus();el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})()`); await pause();
  };
  const importStage = async () => { await click('#returnStageImport'); await idle(); await wait(`!!document.querySelector('#returnLoadSheet')`); await click('#returnLoadSheet'); await idle(); };
  try {
    await win.loadFile(path.join(root, 'src/renderer/dist/index.html')); await pause(250);
    await buttonText('nav', '退货汇总');
    // Direct import at step 3 must not need either previous step.
    await tab('#returnWorkflowView', '3. 按地址汇总'); await importStage();
    assert.equal(latest.selection, null); assert.equal(latest.followup, null);
    assert.equal(latest.summary.analysis.selected.count, 218); assert.equal(latest.summary.analysis.selected.quantity, 1325);
    await click('[aria-label="只看已预约"]'); await idle(); assert.equal(latest.summary.analysis.selected.count, 61); assert.equal(latest.summary.analysis.selected.quantity, 416);
    await click('[aria-label="全部状态"]'); await idle(); assert.equal(latest.summary.analysis.selected.count, 279);
    await click('[aria-label="只看已完成"]'); await idle(); assert.equal(latest.summary.analysis.selected.count, 218);
    await click('[aria-label="只看已完成"]'); await idle(); assert.equal(latest.summary.analysis.selected.count, 218, 'Clicking active status must not empty the filter');
    assert.ok(await run(`document.querySelector('#returnWorkflowView').textContent.includes('476 包')`));
    assert.equal(await run(`document.querySelector('#returnStageExport').disabled`), false);
    await choose('#returnAddress', '正点米厂'); assert.ok(await run(`document.querySelector('#returnWorkflowView').textContent.includes('63 包')`));
    await choose('#returnAddress', '京山国宝米厂');
    await run(`document.querySelector('#returnAddressScroll').scrollIntoView({block:'end'})`); await pause();
    await wait(`!!document.querySelector('#returnAddressScroll [data-orientation="horizontal"]>div')`);
    const geometry = await run(`(() => {const r=document.querySelector('#returnAddressScroll'),v=r.querySelector('[data-radix-scroll-area-viewport]'),t=r.querySelector('[data-orientation="horizontal"]>div').getBoundingClientRect();return {overflow:v.scrollWidth-v.clientWidth,x:Math.round(t.x+t.width/2),y:Math.round(t.y+t.height/2)}})()`);
    assert.ok(geometry.overflow > 0);
    for (const event of [{ type: 'mouseMove' }, { type: 'mouseDown', button: 'left', clickCount: 1 }, { type: 'mouseMove', x: 1400 }, { type: 'mouseUp', x: 1400, button: 'left', clickCount: 1 }]) win.webContents.sendInputEvent({ x: geometry.x, y: geometry.y, ...event });
    await pause(); assert.ok(await run(`document.querySelector('#returnAddressScroll [data-radix-scroll-area-viewport]').scrollLeft>0`));
    assert.ok(await run(`(() => {const r=document.querySelector('#returnAddressScroll');return r.querySelector('th:last-child').getBoundingClientRect().right <= r.querySelector('[data-radix-scroll-area-viewport]').getBoundingClientRect().right+2})()`));
    fs.writeFileSync(path.join(output, 'horizontal.png'), (await win.webContents.capturePage()).toPNG());
    await run(`document.querySelector('#returnAddressScroll [data-radix-scroll-area-viewport]').scrollLeft=0;document.querySelector('#returnWorkflowView').scrollTop=0`); await pause();
    fs.writeFileSync(path.join(output, 'summary.png'), (await win.webContents.capturePage()).toPNG());
    await click('#returnStageExport'); await idle(); assert.equal(fs.readdirSync(destination).length, 0, 'cancel must write nothing');
    cancel = false; await click('#returnStageExport'); await idle(); assert.equal(fs.readdirSync(destination).filter(name => name.endsWith('.xlsx')).length, 2);
    // Import step 1, confirm replacement, and choose only two individual rows.
    await tab('#returnWorkflowView', '1. 选择明细'); await importStage();
    assert.ok(await run(`!!document.querySelector('#returnConfirmReplace')`));
    await buttonText('[role="dialog"]', '取消'); await click('#returnLoadSheet'); await click('#returnConfirmReplace'); await idle();
    assert.equal(latest.summary, null);
    assert.ok(await run(`document.querySelector('#returnWorkflowView').textContent.includes('490 行')`));
    await click('[aria-label="只看已预约"]'); assert.ok(await run(`document.querySelector('#returnWorkflowView').textContent.includes('60 行')`));
    await click('[aria-label="全部状态"]'); assert.ok(await run(`document.querySelector('#returnWorkflowView').textContent.includes('558 行')`));
    await click('[aria-label="只看已完成"]'); assert.ok(await run(`document.querySelector('#returnWorkflowView').textContent.includes('490 行')`));
    await run(`const boxes=document.querySelectorAll('#returnDataScroll tbody [role="checkbox"]');boxes[0].click()`); await pause();
    await run(`document.querySelectorAll('#returnDataScroll tbody [role="checkbox"]')[1].click()`); await pause();
    await click('#returnStageExport'); await idle(); assert.ok(fs.existsSync(savePath));
    await click('#returnToFollowup'); await idle(); assert.equal(latest.followup.rows.length, 2); assert.equal(latest.followup.issues.length, 0);
    await click('#returnDataScroll thead [role="checkbox"]'); await click('#returnBatchEdit');
    await input('[id="returnBatch-退回地址"]', '京山国宝米厂'); await input('[id="returnBatch-快递名称"]', '中通快递'); await click('#returnApplyBatch'); await idle();
    assert.ok(latest.followup.rows.every(row => row['退回地址'] === '京山国宝米厂'));
    const first = latest.followup.rows[0];
    await input(`input[aria-label="快递单号 源表第${first._sourceRow}行"]`, '001234'); await click('#returnSaveFollowup'); await idle();
    assert.equal(latest.followup.rows[0]['快递单号'], '001234');
    // Paper import must expose conflicts and unmatched rows before enabling apply.
    const paper = path.join(destination, 'paper.xlsx');
    await service.buildTableWorkbook(service.PAPER_HEADERS, [{ '履行单号': first['履行单号'], '退回地址': '纸质核对米厂' }, { '履行单号': 'missing-order', '备注': '未匹配' }], '照片识别结果').xlsx.writeFile(paper);
    openPath = paper; await click('#returnPaperImport'); await idle(); await click('#returnLoadSheet'); await idle();
    assert.equal(await run(`document.querySelector('#returnApplyPaper').disabled`), true);
    const conflictLabels = await run(`Array.from(document.querySelectorAll('#returnPaperPreview [role="combobox"]')).map(el=>el.getAttribute('aria-label'))`);
    assert.ok(conflictLabels.length > 0);
    for (const label of conflictLabels) await choose(`[aria-label="${label}"]`, '使用：纸质核对米厂');
    await click('#returnIgnoreUnmatched'); await click('#returnApplyPaper'); await idle();
    assert.ok(latest.followup.rows.some(row => row['退回地址'] === '纸质核对米厂'));
    savePath = path.join(destination, '跟进表.xlsx'); await click('#returnStageExport'); await idle();
    await click('#returnToSummary'); await idle(); assert.equal(latest.summary.analysis.canExport, true);
    await tab('#returnWorkflowView', '2. 维护跟进');
    await input(`input[aria-label="备注 源表第${first._sourceRow}行"]`, '新增备注'); await click('#returnSaveFollowup'); await idle();
    await tab('#returnWorkflowView', '3. 按地址汇总'); assert.ok(await run(`document.querySelector('#returnStageExport').disabled`));
    // Directly importing step 2 works without replacing the first step; it selects the correct sheet in a full workbook.
    openPath = sample; await tab('#returnWorkflowView', '2. 维护跟进'); await click('#returnStageImport'); await idle();
    assert.ok(await run(`document.querySelector('#returnImportSheet').textContent.includes('未申报')`));
    await click('#returnLoadSheet'); await click('#returnConfirmReplace'); await idle(); assert.equal(latest.followup.rows.length, 279);
    await buttonText('nav', '发运履约中心'); await buttonText('nav', '退货汇总');
    assert.ok(await run(`document.querySelector('#returnWorkflowView').textContent.includes('279 行')`));
    // Ordinary inbound retains the old independent workflow and chooses the inbound type automatically.
    await tab('#returnToolView', '普通直入入库汇总'); await click('#returnImport'); await wait(`document.querySelector('#returnType')?.textContent.includes('普通直入预约单')`);
    assert.ok(await run(`document.querySelector('#returnSummaryView').textContent.includes('152,272 包')`));
    assert.equal(await run(`document.querySelectorAll('#returnToolView select,#returnToolView input[type="checkbox"]').length`), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: independent stages, completed defaults, partial row selection, worksheet selection, batch/inline edits, paper conflicts, stale/replace guards, cancellation, horizontal drag, address export, navigation and inbound compatibility');
    console.log(`Artifacts: ${destination}`); app.exit(0);
  } catch (error) {
    fs.writeFileSync(path.join(output, 'failure.png'), (await win.webContents.capturePage()).toPNG());
    console.error(error.stack); console.error(errors); app.exit(1);
  }
});
