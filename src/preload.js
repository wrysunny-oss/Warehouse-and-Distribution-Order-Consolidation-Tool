'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('excelTool', {
  openExcel: (type) => ipcRenderer.invoke('excel:open', type),
  exportExcel: (payload) => ipcRenderer.invoke('excel:export', payload),
  openBackfillExcel: () => ipcRenderer.invoke('excel:backfill-open'),
  exportBackfill: (payload) => ipcRenderer.invoke('excel:backfill-export', payload),
  analyze: (payload) => ipcRenderer.invoke('summary:analyze', payload),
  compute: (payload) => ipcRenderer.invoke('summary:compute', payload),
  openInventoryUpdateExcel: (type) => ipcRenderer.invoke('inventory-update:open', type),
  analyzeInventoryUpdate: (payload) => ipcRenderer.invoke('inventory-update:analyze', payload),
  exportInventoryUpdate: (payload) => ipcRenderer.invoke('inventory-update:export', payload),
  openDeliveryExcel: (type) => ipcRenderer.invoke('delivery:open', type),
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
  saveInvoiceConfig: (config) => ipcRenderer.invoke('invoice:save-config', config)
});
