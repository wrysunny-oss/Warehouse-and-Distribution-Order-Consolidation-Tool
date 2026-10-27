'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('excelTool', {
  importDailyOutbound: () => ipcRenderer.invoke('daily-outbound:import'),
  analyzeDailyOutbound: (payload) => ipcRenderer.invoke('daily-outbound:analyze', payload),
  exportDailyOutbound: (payload) => ipcRenderer.invoke('daily-outbound:export', payload),
  importReturnSummary: (options) => ipcRenderer.invoke('return-summary:import', options),
  openReturnStage: (payload) => ipcRenderer.invoke('return-workflow:open', payload),
  loadReturnStage: (payload) => ipcRenderer.invoke('return-workflow:load', payload),
  convertReturnStage: (payload) => ipcRenderer.invoke('return-workflow:convert', payload),
  updateReturnFollowup: (payload) => ipcRenderer.invoke('return-workflow:edit', payload),
  rematchReturnFollowup: () => ipcRenderer.invoke('return-workflow:rematch'),
  previewReturnFollowupImport: (payload) => ipcRenderer.invoke('return-workflow:preview-paper', payload),
  applyReturnFollowupImport: (payload) => ipcRenderer.invoke('return-workflow:apply-paper', payload),
  analyzeReturnAddresses: (payload) => ipcRenderer.invoke('return-workflow:analyze', payload),
  exportReturnStage: (payload) => ipcRenderer.invoke('return-workflow:export', payload),
  exportReturnFollowupTemplate: () => ipcRenderer.invoke('return-workflow:template'),
  analyzeReturnSummary: (payload) => ipcRenderer.invoke('return-summary:analyze', payload),
  exportReturnSummary: (payload) => ipcRenderer.invoke('return-summary:export', payload),
  openExcel: (type, directPath) => ipcRenderer.invoke('excel:open', type, directPath),
  exportExcel: (payload) => ipcRenderer.invoke('excel:export', payload),
  openBackfillExcel: () => ipcRenderer.invoke('excel:backfill-open'),
  exportBackfill: (payload) => ipcRenderer.invoke('excel:backfill-export', payload),
  analyze: (payload) => ipcRenderer.invoke('summary:analyze', payload),
  compute: (payload) => ipcRenderer.invoke('summary:compute', payload),
  openInventoryUpdateExcel: (type, directPaths) => ipcRenderer.invoke('inventory-update:open', type, directPaths),
  analyzeInventoryUpdate: (payload) => ipcRenderer.invoke('inventory-update:analyze', payload),
  exportInventoryUpdate: (payload) => ipcRenderer.invoke('inventory-update:export', payload),
  openDeliveryExcel: (type, directPath) => ipcRenderer.invoke('delivery:open', type, directPath),
  analyzeDelivery: (payload) => ipcRenderer.invoke('delivery:analyze', payload),
  exportDelivery: (payload) => ipcRenderer.invoke('delivery:export', payload),
  getProcurementConfig: (payload) => ipcRenderer.invoke('procurement:get-config', payload),
  importProcurementFile: (type) => ipcRenderer.invoke('procurement:import-file', type),
  exportProcurementDemand: (payload) => ipcRenderer.invoke('procurement:export', payload),
  getProductPreset: () => ipcRenderer.invoke('product:get-preset'),
  saveProductPreset: (rows) => ipcRenderer.invoke('product:save-preset', rows),
  resetProductPreset: () => ipcRenderer.invoke('product:reset-preset'),
  importProductPreset: () => ipcRenderer.invoke('product:import-preset'),
  getWarehousePreset: () => ipcRenderer.invoke('warehouse:get-preset'),
  saveWarehousePreset: (rows) => ipcRenderer.invoke('warehouse:save-preset', rows),
  resetWarehousePreset: () => ipcRenderer.invoke('warehouse:reset-preset'),
  importWarehousePreset: () => ipcRenderer.invoke('warehouse:import-preset'),
  openInvoiceFiles: () => ipcRenderer.invoke('invoice:open-files'),
  parseInvoiceFiles: (filePaths) => ipcRenderer.invoke('invoice:parse-files', filePaths),
  calculateInvoice: (payload) => ipcRenderer.invoke('invoice:calculate', payload),
  exportInvoice: (payload) => ipcRenderer.invoke('invoice:export', payload),
  getInvoiceConfig: () => ipcRenderer.invoke('invoice:get-config'),
  saveInvoiceConfig: (config) => ipcRenderer.invoke('invoice:save-config', config),
  openPlatformFeeFile: () => ipcRenderer.invoke('platform-fee:open-file'),
  parsePlatformFeeFile: (filePath) => ipcRenderer.invoke('platform-fee:parse-file', filePath),
  calculatePlatformFee: (payload) => ipcRenderer.invoke('platform-fee:calculate', payload),
  exportPlatformFee: (payload) => ipcRenderer.invoke('platform-fee:export', payload),
  getPlatformFeeConfig: () => ipcRenderer.invoke('platform-fee:get-config'),
  savePlatformFeeConfig: (config) => ipcRenderer.invoke('platform-fee:save-config', config),
  getCompetitorSample: () => ipcRenderer.invoke('competitor:get-sample'),
  parseCompetitorData: (rawData) => ipcRenderer.invoke('competitor:parse-data', rawData),
  startCompetitorReceiver: (options) => ipcRenderer.invoke('competitor:start-receiver', options),
  stopCompetitorReceiver: () => ipcRenderer.invoke('competitor:stop-receiver'),
  exportCompetitorExcel: (payload) => ipcRenderer.invoke('competitor:export-excel', payload),
  importCompetitorFile: () => ipcRenderer.invoke('competitor:import-file'),
  startCompetitorCrawl: (options) => ipcRenderer.invoke('competitor:start-browser-crawl', options),
  stopCompetitorCrawl: () => ipcRenderer.invoke('competitor:stop-browser-crawl'),
  continueCompetitorCrawl: () => ipcRenderer.invoke('competitor:continue-browser-crawl'),
  getTampermonkeyScript: () => ipcRenderer.invoke('competitor:get-tampermonkey-script'),
  onCompetitorCrawlProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on('competitor:crawl-progress', handler);
    return () => ipcRenderer.removeListener('competitor:crawl-progress', handler);
  },
  onCompetitorDataReceived: (callback) => {
    const handler = (_event, items, meta) => callback(items, meta);
    ipcRenderer.on('competitor:data-received', handler);
    return () => ipcRenderer.removeListener('competitor:data-received', handler);
  }
});

