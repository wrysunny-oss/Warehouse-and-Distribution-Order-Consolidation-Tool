'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const service = require('./services/daily-outbound-service');

function registerDailyOutboundIpc({ ipcMain, dialog, getWindow }) {
  let source = null, token = null, queue = Promise.resolve();
  const handle = (name, fn) => ipcMain.handle(`daily-outbound:${name}`, (_event, payload = {}) => { const result = queue.then(() => fn(payload)); queue = result.catch(() => {}); return result; });
  const analyze = payload => { if (!source || token !== payload.token) throw new Error('导入会话已失效，请重新导入。'); return service.analyzeDailyOutbound(source, payload); };
  handle('import', async () => {
    const result = await dialog.showOpenDialog(getWindow(), { title: '导入日出库明细（读取子表1）', properties: ['openFile'], filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }] });
    if (result.canceled || !result.filePaths?.length) return null;
    const imported = await service.readDailyOutbound(result.filePaths[0]);
    const analysis = service.analyzeDailyOutbound(imported);
    source = imported; token = randomUUID();
    return { token, fileName: source.fileName, sheetName: source.sheetName, sourceCount: source.rows.length, dates: source.dates, analysis };
  });
  handle('analyze', payload => analyze(payload));
  handle('export', async payload => {
    const analysis = analyze(payload);
    if (!analysis.canExport) return { ok: false, analysis, message: '请先处理同名多SKU冲突、规格和数量问题。' };
    const result = await dialog.showSaveDialog(getWindow(), { title: '导出日出库补货计划', defaultPath: `日出库补货计划_${analysis.date}_${analysis.status}.xlsx`, filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }] });
    if (result.canceled || !result.filePath) return null;
    const target = path.extname(result.filePath).toLowerCase() === '.xlsx' ? result.filePath : `${result.filePath}.xlsx`;
    const resolved = value => fs.existsSync(value) ? fs.realpathSync(value).toLowerCase() : path.resolve(value).toLowerCase();
    if ([source.filePath, service.TEMPLATE_PATH].some(file => resolved(file) === resolved(target))) throw new Error('不能覆盖导入文件或模板，请选择新的文件名。');
    const workbook = await service.buildDailyOutboundWorkbook(analyze(payload));
    await workbook.xlsx.writeFile(target);
    return { ok: true, filePath: target, analysis };
  });
}
module.exports = { registerDailyOutboundIpc };
