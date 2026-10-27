'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { TEMPLATE_PATH, buildReturnWorkbook } = require('./services/return-summary-service');
const service = require('./services/return-workflow-service');
const text = value => String(value ?? '').trim();
const safeName = value => text(value).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/[. ]+$/, '').slice(0, 110) || '退货汇总';

function registerReturnWorkflowIpc({ ipcMain, dialog, getWindow, loadProducts }) {
  const imports = new Map(), protectedPaths = new Set([TEMPLATE_PATH]);
  let selection = null, followup = null, summary = null, preview = null, revision = 0, queue = Promise.resolve();
  const handle = (name, fn) => ipcMain.handle(`return-workflow:${name}`, (_event, payload = {}) => {
    const result = queue.then(() => fn(payload));
    queue = result.catch(() => {});
    return result;
  });
  const snapshot = () => ({ selection, followup: followup && { ...followup, issues: service.followupIssues(followup.rows), metrics: service.metrics(followup.rows, '数量（包）') },
    summary: summary && { ...summary, stale: summary.fromRevision != null && summary.fromRevision !== followup?.revision, analysis: service.analyzeAddresses(summary.rows, summary.statuses) } });
  const need = stage => { const value = ({ selection, followup, summary })[stage]; if (!value) throw new Error('请先导入该步骤的数据。'); return value; };
  const assertReplace = (stage, replace) => {
    const occupied = stage === 'selection' ? selection || followup || summary : stage === 'followup' ? followup || summary : summary;
    if (occupied && !replace) throw new Error('该步骤或下游已有数据，请确认替换后再继续。');
  };
  const importedSheet = payload => {
    const workbook = imports.get(payload.workbookToken), sheet = workbook?.sheets.find(sheet => sheet.id === payload.sheetId);
    if (!sheet) throw new Error('文件选择会话已失效，请重新导入。');
    if (sheet.duplicates.length) throw new Error(`工作表存在重复表头：${sheet.duplicates.join('、')}`);
    return { workbook, sheet };
  };
  const refreshProducts = async () => {
    if (!followup) return;
    const rows = service.rematchFollowupRows(followup.rows, await loadProducts());
    if (rows.some((row, i) => row['产品明细'] !== followup.rows[i]['产品明细'] || row._matchIssue !== followup.rows[i]._matchIssue || JSON.stringify(row._aliases) !== JSON.stringify(followup.rows[i]._aliases))) followup = { ...followup, rows, revision: ++revision };
  };
  const checkSourceProtection = target => {
    const resolved = value => fs.existsSync(value) ? fs.realpathSync(value).toLowerCase() : path.resolve(value).toLowerCase();
    if ([...protectedPaths].some(source => resolved(source) === resolved(target))) throw new Error('不能覆盖导入文件或模板，请使用新的文件名。');
  };
  const saveWorkbook = async (workbook, defaultName) => {
    const result = await dialog.showSaveDialog(getWindow(), { title: '导出退货处理结果', defaultPath: `${safeName(defaultName)}.xlsx`, filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }] });
    if (result.canceled || !result.filePath) return null;
    const target = path.extname(result.filePath).toLowerCase() === '.xlsx' ? result.filePath : `${result.filePath}.xlsx`;
    checkSourceProtection(target);
    await workbook.xlsx.writeFile(target);
    return { ok: true, filePath: target };
  };

  handle('open', async ({ stage }) => {
    if (!['selection', 'followup', 'summary', 'paper'].includes(stage)) throw new Error('步骤无效。');
    const result = await dialog.showOpenDialog(getWindow(), { title: stage === 'paper' ? '导入纸质识别后的跟进信息表' : '选择退货处理工作簿', properties: ['openFile'], filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }] });
    if (result.canceled || !result.filePaths?.length) return null;
    const workbook = await service.inspectReturnWorkbook(result.filePaths[0]);
    const token = randomUUID();
    workbook.sheets.forEach(sheet => { sheet.rows = sheet.rows.map(row => ({ ...row, _id: `${token}:${row._id}` })); });
    imports.set(token, workbook); protectedPaths.add(workbook.filePath);
    return { workbookToken: token, fileName: workbook.fileName, sheets: workbook.sheets.map(sheet => ({ id: sheet.id, name: sheet.name, rowCount: sheet.rows.length, missing: service.missingHeaders(sheet.headers, stage), duplicates: sheet.duplicates })) };
  });
  handle('load', async payload => {
    if (!['selection', 'followup', 'summary'].includes(payload.stage)) throw new Error('步骤无效。');
    const { workbook, sheet } = importedSheet(payload);
    const missing = service.missingHeaders(sheet.headers, payload.stage);
    if (missing.length) throw new Error(`所选工作表缺少字段：${missing.join('、')}`);
    if (!sheet.rows.length) throw new Error('所选工作表没有明细记录。');
    assertReplace(payload.stage, payload.replace);
    const sourceName = `${workbook.fileName} · ${sheet.name}`;
    if (payload.stage === 'selection') { selection = { headers: sheet.headers, rows: sheet.rows, sourceName }; followup = null; summary = null; }
    if (payload.stage === 'followup') { followup = { headers: service.FOLLOWUP_HEADERS, rows: service.createFollowupRows(sheet.rows, await loadProducts()), sourceName, revision: ++revision }; summary = null; }
    if (payload.stage === 'summary') summary = { headers: service.FOLLOWUP_HEADERS, rows: sheet.rows, sourceName, statuses: ['已完成'], fromRevision: null };
    preview = null;
    return snapshot();
  });
  handle('convert', async payload => {
    if (payload.from === 'selection') {
      const source = need('selection'), rows = service.selectRawRows(source, payload);
      assertReplace('followup', payload.replace);
      followup = { headers: service.FOLLOWUP_HEADERS, rows: service.createFollowupRows(rows, await loadProducts()), sourceName: '第一步已选明细', revision: ++revision };
      summary = null;
    } else if (payload.from === 'followup') {
      need('followup'); await refreshProducts();
      if (!followup.rows.length || service.followupIssues(followup.rows).length) throw new Error('请先处理第二步的商品匹配和数据问题。');
      assertReplace('summary', payload.replace);
      summary = { headers: service.FOLLOWUP_HEADERS, rows: followup.rows.map(row => ({ ...row })), sourceName: '第二步退货办理跟进表', statuses: ['已完成'], fromRevision: followup.revision };
    } else throw new Error('转换步骤无效。');
    preview = null;
    return snapshot();
  });
  handle('edit', payload => {
    const source = need('followup');
    followup = { ...source, rows: service.applyFollowupPatches(source.rows, payload.patches), revision: ++revision };
    return snapshot();
  });
  handle('rematch', async () => { need('followup'); await refreshProducts(); return snapshot(); });
  handle('preview-paper', payload => {
    const source = need('followup'), { sheet } = importedSheet(payload), missing = service.missingHeaders(sheet.headers, 'paper');
    if (missing.length) throw new Error(`所选工作表缺少字段：${missing.join('、')}`);
    preview = { ...service.previewFollowupImport(source.rows, sheet.rows), token: randomUUID(), revision: source.revision };
    return preview;
  });
  handle('apply-paper', payload => {
    const source = need('followup');
    if (!preview || preview.token !== payload.previewToken || preview.revision !== source.revision) throw new Error('跟进表已变化，请重新预览导入信息。');
    const patches = service.resolveFollowupImport(preview, payload.choices, payload.ignoreUnmatched);
    if (!preview.changes.length) throw new Error('没有可写入的跟进信息。');
    followup = { ...source, rows: service.applyFollowupPatches(source.rows, patches), revision: ++revision };
    preview = null;
    return snapshot();
  });
  handle('analyze', payload => {
    need('summary');
    if (!Array.isArray(payload.statuses) || payload.statuses.some(status => typeof status !== 'string')) throw new Error('状态筛选无效。');
    summary = { ...summary, statuses: payload.statuses };
    return snapshot();
  });
  handle('template', () => saveWorkbook(service.buildTableWorkbook(service.PAPER_HEADERS, [], '跟进信息导入模板'), '退货跟进信息导入模板'));
  handle('export', async payload => {
    if (payload.stage === 'selection') {
      const source = need('selection'), rows = service.selectRawRows(source, payload);
      return saveWorkbook(service.buildTableWorkbook(source.headers, rows, '未申报退货明细'), '未申报退货明细');
    }
    if (payload.stage === 'followup') {
      need('followup'); await refreshProducts();
      if (!followup.rows.length || service.followupIssues(followup.rows).length) throw new Error('请先处理跟进表的匹配和数据问题。');
      return saveWorkbook(service.buildTableWorkbook(service.FOLLOWUP_HEADERS, followup.rows, '退货办理跟进表'), '退货办理跟进表');
    }
    if (payload.stage !== 'summary') throw new Error('导出步骤无效。');
    const source = need('summary');
    if (source.fromRevision != null) await refreshProducts();
    if (source.fromRevision != null && source.fromRevision !== followup?.revision) throw new Error('第二步数据已更新，请重新生成第三步后导出。');
    const analysis = service.analyzeAddresses(source.rows, source.statuses);
    if (!analysis.canExport) throw new Error('没有可导出的地址分组，或分组中仍有数据问题。');
    const titles = payload.titles || {};
    if (analysis.groups.some(group => group.address in titles && !text(titles[group.address]))) throw new Error('请填写各地址的导出主标题。');
    const result = await dialog.showOpenDialog(getWindow(), { title: '选择各地址汇总文件的保存目录', properties: ['openDirectory', 'createDirectory'] });
    if (result.canceled || !result.filePaths?.length) return null;
    const directory = result.filePaths[0];
    // Build all workbooks before writing; validation/template errors must not leave a half-written batch.
    const files = [];
    for (const group of analysis.groups) {
      const title = Object.hasOwn(titles, group.address) ? titles[group.address] : group.analysis.defaultTitle;
      const workbook = await buildReturnWorkbook(group.analysis, title);
      files.push({ address: group.address, title, buffer: await workbook.xlsx.writeBuffer(), quantity: group.analysis.totalPackages });
    }
    const written = [];
    try {
      for (const file of files) {
        let suffix = 1;
        while (true) {
          const target = path.join(directory, `${safeName(file.title)}${suffix === 1 ? '' : `-${suffix}`}.xlsx`);
          if (fs.existsSync(target)) { suffix++; continue; }
          try {
            checkSourceProtection(target);
            await fs.promises.writeFile(target, file.buffer, { flag: 'wx' });
            written.push({ address: file.address, filePath: target, quantity: file.quantity });
            break;
          } catch (error) { if (error.code === 'EEXIST') suffix++; else throw error; }
        }
      }
    } catch (error) { return { ok: false, files: written, message: `保存未全部完成：${error.message}；已生成 ${written.length} 个文件，请核对后重试。` }; }
    return { ok: true, files: written };
  });
}

module.exports = { registerReturnWorkflowIpc };
