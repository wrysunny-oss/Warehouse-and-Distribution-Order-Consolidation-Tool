'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { getPresetFilePath, loadProductPreset } = require('./product-preset');
const { TEMPLATE_PATH, readReturnWorkbook, analyzeReturnSummary, buildReturnWorkbook } = require('./services/return-summary-service');

// Read the persisted short name exactly; legacy display fallbacks must not hide missing master data.
async function loadReturnProducts() {
  const filePath = getPresetFilePath();
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
    if (!Array.isArray(data.rows)) throw new Error('商品主数据格式无效，请在配置中心重新保存。');
    return data.rows;
  }
  return (await loadProductPreset()).rows;
}

function registerReturnSummaryIpc({ ipcMain, dialog, getWindow, loadProducts = loadReturnProducts }) {
  require('./return-workflow-ipc').registerReturnWorkflowIpc({ ipcMain, dialog, getWindow, loadProducts });
  let imported = null;
  const getImport = token => {
    if (!imported || imported.token !== token) throw new Error('导入会话已失效，请重新导入预约单。');
    return imported;
  };
  const analyze = async payload => {
    const source = getImport(payload?.token);
    if (!source.types.includes(payload?.type)) throw new Error('请选择导入文件中存在的预约单类型。');
    return analyzeReturnSummary(source.rows, await loadProducts(), payload.type);
  };
  ipcMain.handle('return-summary:import', async (_event, options) => {
    const result = await dialog.showOpenDialog(getWindow(), { title: '导入预约单明细', properties: ['openFile'], filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }] });
    if (result.canceled || !result.filePaths?.length) return null;
    const source = await readReturnWorkbook(result.filePaths[0]);
    if (options?.type && !source.types.includes(options.type)) throw new Error(`导入文件中没有${options.type}。`);
    if (options?.type && source.types.includes(options.type)) source.defaultType = options.type;
    const analysis = analyzeReturnSummary(source.rows, await loadProducts(), source.defaultType);
    imported = { ...source, token: randomUUID() };
    return { token: imported.token, fileName: source.fileName, sheetName: source.sheetName, rowCount: source.rows.length, types: source.types, type: source.defaultType, analysis };
  });
  ipcMain.handle('return-summary:analyze', (_event, payload) => analyze(payload));
  ipcMain.handle('return-summary:export', async (_event, payload) => {
    const beforeSave = await analyze(payload);
    if (!beforeSave.canExport) return { ok: false, analysis: beforeSave, message: '最新商品主数据校验未通过，请处理异常后重新导出。' };
    const title = String(payload?.title ?? '').trim();
    if (!title) throw new Error('请填写导出主标题。');
    const defaultName = `${title.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 120)}.xlsx`;
    const result = await dialog.showSaveDialog(getWindow(), { title: `导出${beforeSave.summaryName}`, defaultPath: defaultName, filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }] });
    if (result.canceled || !result.filePath) return null;
    const target = path.extname(result.filePath).toLowerCase() === '.xlsx' ? result.filePath : `${result.filePath}.xlsx`;
    const source = getImport(payload.token);
    const resolved = value => fs.existsSync(value) ? fs.realpathSync(value).toLowerCase() : path.resolve(value).toLowerCase();
    if ([source.filePath, TEMPLATE_PATH].some(original => resolved(original) === resolved(target))) throw new Error('请选择新的文件名，不能覆盖导入文件或导出模板。');
    // The save dialog can stay open while master data changes. Revalidate once more immediately before writing.
    const analysis = await analyze(payload);
    if (!analysis.canExport) return { ok: false, analysis, message: '商品主数据已变更，校验未通过，请重新核对。' };
    const workbook = await buildReturnWorkbook(analysis, title);
    await workbook.xlsx.writeFile(target);
    return { ok: true, filePath: target, analysis };
  });
}

module.exports = { registerReturnSummaryIpc, loadReturnProducts };
