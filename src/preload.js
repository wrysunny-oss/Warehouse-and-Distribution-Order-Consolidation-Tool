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
  exportDelivery: (payload) => ipcRenderer.invoke('delivery:export', payload)
});

