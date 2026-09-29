'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('excelTool', {
  openExcel: (type) => ipcRenderer.invoke('excel:open', type),
  exportExcel: (payload) => ipcRenderer.invoke('excel:export', payload),
  analyze: (payload) => ipcRenderer.invoke('summary:analyze', payload),
  compute: (payload) => ipcRenderer.invoke('summary:compute', payload),
  openDeliveryExcel: (type) => ipcRenderer.invoke('delivery:open', type),
  analyzeDelivery: (payload) => ipcRenderer.invoke('delivery:analyze', payload),
  exportDelivery: (payload) => ipcRenderer.invoke('delivery:export', payload)
});

