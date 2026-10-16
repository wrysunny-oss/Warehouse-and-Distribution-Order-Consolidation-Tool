import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { ReplenishHubView } from '@/components/views/ReplenishHubView';
import { DeliveryView } from '@/components/views/DeliveryView';
import { InvoiceView } from '@/components/views/InvoiceView';

import { MasterDataDialog } from '@/components/dialogs/MasterDataDialog';
import { BackfillDialog } from '@/components/dialogs/BackfillDialog';
import { DemandDialog } from '@/components/dialogs/DemandDialog';

import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function normalizeProductNames(values) {
  const seen = new Set();
  const products = [];
  for (const value of values || []) {
    const product = String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const token = product.toLowerCase();
    if (!product || seen.has(token)) continue;
    seen.add(token);
    products.push(product);
  }
  return products;
}

export function App() {
  const [workflow, setWorkflow] = useState('replenish');
  const [masterDataOpen, setMasterDataOpen] = useState(false);
  const [masterDataTab, setMasterDataTab] = useState('products');
  const [pipedFromSummary, setPipedFromSummary] = useState(false);

  // ==================== SUMMARY STATE ====================
  const [table1, setTable1] = useState(null);
  const [table2, setTable2] = useState(null);
  const [brands, setBrands] = useState([]);
  const [brand, setBrand] = useState('');
  const [mapping, setMapping] = useState(() => loadJson('warehouseMapping', {}));
  const [productCatalogs, setProductCatalogs] = useState(() => loadJson('summaryProductCatalogs', {}));
  const [actualOrders, setActualOrders] = useState({});
  const [warehouseStatus, setWarehouseStatus] = useState({});
  const [result, setResult] = useState(null);
  const [mappingRows, setMappingRows] = useState([]);
  const [summaryNotice, setSummaryNotice] = useState(null);

  // Summary Dialogs
  const [mappingOpen, setMappingOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [backfillPreview, setBackfillPreview] = useState(null);
  const [demandOpen, setDemandOpen] = useState(false);
  const [demandData, setDemandData] = useState({});

  // ==================== INVENTORY STATE ====================
  const [inventoryState, setInventoryState] = useState({
    table3: null,
    inventories: [],
    transit: null,
    analysis: null,
  });
  const [inventoryNotice, setInventoryNotice] = useState(null);

  // ==================== DELIVERY STATE ====================
  const [productPresets, setProductPresets] = useState([]);
  const [warehousePresets, setWarehousePresets] = useState([]);
  const [deliveryState, setDeliveryState] = useState({
    receipt: null,
    analysis: null,
    selectedBrands: new Set(),
    selectedWarehouses: new Set(),
    productionDates: {},
    supplierName: localStorage.getItem('deliverySupplierName') || '湖北国宝桥米有限公司',
    shelfLife: '360',
    contact: '17771571056',
    splitByWarehouse: false,
  });
  const [deliveryNotice, setDeliveryNotice] = useState(null);
  const [productPresetOpen, setProductPresetOpen] = useState(false);
  const [warehousePresetOpen, setWarehousePresetOpen] = useState(false);

  // ==================== INVOICE STATE ====================
  const [invoiceState, setInvoiceState] = useState({
    files: [],
    filePaths: [],
    rawRows: [],
    availableFeeTypes: [],
    availableInvoiceDirs: [],
    selectedFeeTypes: new Set(),
    selectedInvoiceDirs: new Set(),
    summaryResult: null,
    config: {
      applicant: (() => {
        const saved = localStorage.getItem('invoiceApplicant');
        return !saved || saved === '刘雯' ? '丁锐杰' : saved;
      })(),
      date: '',
      platform: '国宝猫超',
      warehouse: '',
      invoiceType: '专用发票',
      companyTitle: '浙江昊超网络科技有限公司',
      taxId: '91330110MA2GK1DN85',
      address: '杭州市余杭区五常街道文一西路969号3幢5层551室',
      phone: '0571-85022088',
      bank: '招商银行股份有限公司杭州高新支行',
      account: '571913080610506',
      mailRecipient: '武汉营销中心1293737582@qq.com',
    },
  });
  const [invoiceNotice, setInvoiceNotice] = useState(null);
  const [invoiceConfigOpen, setInvoiceConfigOpen] = useState(false);

  // ==================== INITIALIZATION ====================
  useEffect(() => {
    async function initGlobals() {
      if (!window.excelTool) return;
      try {
        const prod = await window.excelTool.getProductPreset();
        if (prod?.rows) setProductPresets(prod.rows);
      } catch (err) {
        console.error('Failed to load product presets:', err);
      }

      try {
        const wh = await window.excelTool.getWarehousePreset();
        if (wh?.rows) setWarehousePresets(wh.rows);
      } catch (err) {
        console.error('Failed to load warehouse presets:', err);
      }

      try {
        const invCfg = await window.excelTool.getInvoiceConfig();
        if (invCfg) {
          setInvoiceState((prev) => ({
            ...prev,
            config: { ...prev.config, ...invCfg },
          }));
        }
      } catch (err) {
        console.error('Failed to load invoice config:', err);
      }
    }
    initGlobals();
  }, []);

  // ==================== SUMMARY METHODS ====================
  const recomputeSummary = useCallback(
    async (
      t1 = table1,
      t2 = table2,
      currentBrand = brand,
      currentMapping = mapping,
      currentOrders = actualOrders,
      currentStatus = warehouseStatus,
      currentWhPresets = warehousePresets
    ) => {
      if (!t2 || !currentBrand || !window.excelTool) {
        setResult(null);
        return;
      }
      setSummaryNotice(null);
      try {
        let mRows = [];
        if (t1 && t2) {
          const analyzed = await window.excelTool.analyze({
            table1Rows: t1.rows,
            table2Rows: t2.rows,
            brand: currentBrand,
            mapping: currentMapping,
          });
          mRows = analyzed.mappingRows || [];
          setMappingRows(mRows);
        }

        const statsWarehouses = (currentWhPresets || [])
          .filter((w) => w.inStats !== false && w['参与统计'] !== false)
          .map((w) => w.warehouseName || w['仓库名称'] || w.warehouse)
          .filter(Boolean);

        const res = await window.excelTool.compute({
          table2Rows: t2.rows,
          table1Rows: t1?.rows || [],
          brand: currentBrand,
          mapping: currentMapping,
          actualOrders: currentOrders,
          warehouseStatus: currentStatus,
          configuredProducts: productCatalogs[currentBrand] || [],
          configuredWarehouses: statsWarehouses,
        });
        setResult(res);

        if (res.stats.unresolvedOrders > 0) {
          const unresolved = mRows.filter((r) => r.orders && !currentMapping[r.source]).length;
          setSummaryNotice({
            type: 'warning',
            message: `还有 ${unresolved} 个有订单的仓库未映射或未纳入统计，共 ${res.stats.unresolvedOrders} 件订单暂未计入表三。`,
          });
        }
      } catch (err) {
        setSummaryNotice({
          type: 'error',
          message: err.message || '计算汇总失败',
        });
      }
    },
    [table1, table2, brand, mapping, actualOrders, warehouseStatus, productCatalogs, warehousePresets]
  );

  const handleImportTable2 = async (directPath) => {
    try {
      const payload = await window.excelTool.openExcel('table2', typeof directPath === 'string' ? directPath : undefined);
      if (!payload) return;
      setTable2(payload);

      const analyzed = await window.excelTool.analyze({
        table2Rows: payload.rows,
        brand: '',
      });
      const bList = analyzed.brands || [];
      setBrands(bList);

      const defaultBrand = bList.includes('稻花翁') ? '稻花翁' : bList[0] || '';
      setBrand(defaultBrand);
      setActualOrders({});
      setWarehouseStatus({});

      toast.success('表二（库存数据）导入成功');
      await recomputeSummary(table1, payload, defaultBrand, mapping, {}, {});
    } catch (err) {
      toast.error(err.message || '导入表二失败');
      setSummaryNotice({ type: 'error', message: err.message });
    }
  };

  const handleImportTable1 = async (directPath) => {
    try {
      const payload = await window.excelTool.openExcel('table1', typeof directPath === 'string' ? directPath : undefined);
      if (!payload) return;
      setTable1(payload);
      toast.success('表一（订单数据）导入成功');
      await recomputeSummary(payload, table2, brand, mapping, actualOrders, warehouseStatus);
    } catch (err) {
      toast.error(err.message || '导入表一失败');
      setSummaryNotice({ type: 'error', message: err.message });
    }
  };

  const handleBrandChange = async (newBrand) => {
    setBrand(newBrand);
    setActualOrders({});
    setWarehouseStatus({});
    await recomputeSummary(table1, table2, newBrand, mapping, {}, {});
  };

  const handleActualOrderChange = (rowId, val) => {
    const nextOrders = { ...actualOrders, [rowId]: Math.max(0, Number(val) || 0) };
    setActualOrders(nextOrders);
    recomputeSummary(table1, table2, brand, mapping, nextOrders, warehouseStatus);
  };

  const handleWarehouseStatusChange = (warehouse, val) => {
    const nextStatus = { ...warehouseStatus, [warehouse]: val };
    setWarehouseStatus(nextStatus);
    recomputeSummary(table1, table2, brand, mapping, actualOrders, nextStatus);
  };

  const handleSaveMapping = async (draft) => {
    setMapping(draft);
    saveJson('warehouseMapping', draft);
    toast.success('已保存仓库映射');
    await recomputeSummary(table1, table2, brand, draft, actualOrders, warehouseStatus);
  };

  const handleSaveCatalog = async (targetBrand, text) => {
    const products = normalizeProductNames(text.split(/\r?\n/));
    const nextCatalogs = { ...productCatalogs, [targetBrand]: products };
    setProductCatalogs(nextCatalogs);
    saveJson('summaryProductCatalogs', nextCatalogs);
    setActualOrders({});
    setWarehouseStatus({});
    toast.success(`已保存 ${targetBrand} 的商品清单`);
    await recomputeSummary(table1, table2, targetBrand, mapping, {}, {});
  };

  const handleRestoreCatalog = async (targetBrand) => {
    const nextCatalogs = { ...productCatalogs };
    delete nextCatalogs[targetBrand];
    setProductCatalogs(nextCatalogs);
    saveJson('summaryProductCatalogs', nextCatalogs);
    setActualOrders({});
    setWarehouseStatus({});
    toast.success(`已恢复 ${targetBrand} 的默认商品清单`);
    await recomputeSummary(table1, table2, targetBrand, mapping, {}, {});
  };

  const handleExportSummary = async () => {
    if (!result) return;
    try {
      const exported = await window.excelTool.exportExcel({
        ...result,
        brand,
        orderHeader: table1?.resultOrderHeader || '系统订单',
        sourceOrderFilePath: table1?.filePath || '',
        sourceOrderSheetName: table1?.sheetName || '',
        sourceOrderHeader: table1?.orderHeader || '采购数量',
      });
      if (exported) {
        toast.success(`表三已导出：${exported.filePath}`);
        const fileName = (exported.filePath || '').split(/[/\\]/).pop() || '表三.xlsx';
        const nextTable3 = { fileName, filePath: exported.filePath };
        setPipedFromSummary(true);
        setInventoryState((prev) => {
          const next = { ...prev, table3: nextTable3 };
          if (next.inventories?.length > 0 || next.transit) {
            runInventoryAnalysis(nextTable3, next.inventories, next.transit);
          }
          return next;
        });
      }
    } catch (err) {
      toast.error(err.message || '导出表三失败');
    }
  };

  const handlePipeToInventory = () => {
    if (!result?.rows?.length) {
      toast.error('请先导入表二并完成需求汇总计算');
      return;
    }
    setPipedFromSummary(true);
    toast.success('已切换至步骤二：如已导出表三可直接挂接，或在此导入实时库存');
  };

  const handleClearPipedTable3 = () => {
    setPipedFromSummary(false);
    setInventoryState((prev) => ({ ...prev, table3: null, analysis: null }));
    toast.info('已重置基准表三，可手动上传其他表三文件');
  };

  const handleOpenSummaryDemand = async () => {
    try {
      const rows = result?.rows || [];
      const config = await window.excelTool.getProcurementConfig({ rows });
      setDemandData({
        rows,
        warehouses: config.warehouses || [],
        presetFactories: config.presetFactories || [],
        defaultPickupDate: config.defaultPickupDate || '',
        warehouseConfigs: (config.warehouses || []).reduce((acc, w) => {
          acc[w.warehouse] = {
            factory: w.factory,
            pickupDate: w.pickupDate || config.defaultPickupDate,
            inboundDate: w.inboundDate || '',
          };
          return acc;
        }, {}),
      });
      setDemandOpen(true);
    } catch (err) {
      toast.error(err.message || '打开采购需求表配置失败');
    }
  };

  const handleOpenBackfill = async () => {
    try {
      const preview = await window.excelTool.openBackfillExcel();
      if (!preview) return;
      setBackfillPreview(preview);
      setBackfillOpen(true);
    } catch (err) {
      toast.error(err.message || '打开回填表三失败');
    }
  };

  const handleConfirmBackfill = async () => {
    if (!backfillPreview) return;
    try {
      const res = await window.excelTool.exportBackfill({
        filePath: backfillPreview.filePath,
        sourceFilePath: backfillPreview.sourceFilePath || '',
      });
      if (res) {
        setBackfillOpen(false);
        toast.success(`已成功生成 ${res.files.length} 个分仓补货单`);
      }
    } catch (err) {
      toast.error(err.message || '生成分仓文件失败');
    }
  };

  const handleConfirmDemand = async ({ title, warehouseConfigs, rows }) => {
    try {
      const res = await window.excelTool.exportProcurementDemand({
        rows,
        warehouseConfigs,
        title,
      });
      if (res) {
        setDemandOpen(false);
        toast.success(`《${title}》已成功导出（覆盖 ${res.warehouseCount} 个仓库）`);
      }
    } catch (err) {
      toast.error(err.message || '导出采购需求表失败');
    }
  };

  const handleImportDemandFile = async (type) => {
    try {
      const res = await window.excelTool.importProcurementFile(type);
      if (!res) return;
      const config = await window.excelTool.getProcurementConfig({ rows: res.rows });
      setDemandData({
        rows: res.rows,
        warehouses: config.warehouses || [],
        presetFactories: config.presetFactories || [],
        defaultPickupDate: config.defaultPickupDate || '',
        warehouseConfigs: (config.warehouses || []).reduce((acc, w) => {
          acc[w.warehouse] = {
            factory: w.factory,
            pickupDate: w.pickupDate || config.defaultPickupDate,
            inboundDate: w.inboundDate || '',
          };
          return acc;
        }, {}),
      });
      toast.success(`已导入文件：${res.fileName}`);
    } catch (err) {
      toast.error(err.message || '导入文件失败');
    }
  };

  // ==================== INVENTORY METHODS ====================
  const runInventoryAnalysis = async (t3, invs, tr) => {
    if (!t3 || (invs.length === 0 && !tr)) {
      setInventoryState((prev) => ({ ...prev, analysis: null }));
      return;
    }
    setInventoryNotice(null);
    try {
      const analysis = await window.excelTool.analyzeInventoryUpdate({
        table3Path: t3?.filePath,
        inventoryPaths: (invs || []).map((file) => file.filePath),
        transitPath: tr?.filePath || '',
      });
      setInventoryState((prev) => ({ ...prev, analysis }));
    } catch (err) {
      setInventoryNotice({ type: 'error', message: err.message });
      toast.error(err.message || '分析库存更新失败');
    }
  };

  const handleImportInventoryTable3 = async (directPath) => {
    try {
      const res = await window.excelTool.openInventoryUpdateExcel('table3', typeof directPath === 'string' ? directPath : undefined);
      if (!res) return;
      const next = { ...inventoryState, table3: res };
      setInventoryState(next);
      toast.success('旧表三导入成功');
      await runInventoryAnalysis(res, next.inventories, next.transit);
    } catch (err) {
      toast.error(err.message || '导入旧表三失败');
    }
  };

  const handleImportLiveInventory = async (directPaths) => {
    try {
      const validPaths = Array.isArray(directPaths)
        ? directPaths.filter((p) => typeof p === 'string')
        : typeof directPaths === 'string'
        ? [directPaths]
        : undefined;

      const res = await window.excelTool.openInventoryUpdateExcel(
        'live',
        validPaths && validPaths.length > 0 ? validPaths : undefined
      );
      if (!res) return;
      const files = Array.isArray(res) ? res : [res];
      const next = { ...inventoryState, inventories: files };
      setInventoryState(next);
      toast.success(`已导入 ${files.length} 个实时库存文件`);
      await runInventoryAnalysis(next.table3, files, next.transit);
    } catch (err) {
      toast.error(err.message || '导入实时库存失败');
    }
  };

  const handleImportTransit = async (directPath) => {
    try {
      const res = await window.excelTool.openInventoryUpdateExcel('transit', typeof directPath === 'string' ? directPath : undefined);
      if (!res) return;
      const next = { ...inventoryState, transit: res };
      setInventoryState(next);
      toast.success('库存在途明细导入成功');
      await runInventoryAnalysis(next.table3, next.inventories, res);
    } catch (err) {
      toast.error(err.message || '导入在途明细失败');
    }
  };

  const handleExportInventory = async () => {
    try {
      const res = await window.excelTool.exportInventoryUpdate({
        table3Path: inventoryState.table3?.filePath,
        inventoryPaths: (inventoryState.inventories || []).map((file) => file.filePath),
        transitPath: inventoryState.transit?.filePath || '',
      });
      if (res) {
        toast.success(`已成功导出更新表三：${res.filePath}`);
      }
    } catch (err) {
      toast.error(err.message || '导出更新表三失败');
    }
  };

  // ==================== DELIVERY METHODS ====================
  const runDeliveryAnalysis = useCallback(
    async (receiptFile, presetRows = productPresets) => {
      if (!receiptFile || !window.excelTool) return;
      setDeliveryNotice(null);
      try {
        const analysis = await window.excelTool.analyzeDelivery({
          product: presetRows,
          receipt: receiptFile,
        });
        setDeliveryState((prev) => ({
          ...prev,
          receipt: receiptFile,
          analysis,
          selectedBrands: new Set(
            (analysis.brands || [])
              .filter((b) => (b.rowCount ?? b.productCount ?? 0) > 0 || typeof b === 'string')
              .map((b) => (typeof b === 'string' ? b : b.name))
          ),
          selectedWarehouses: new Set(
            (analysis.warehouses || [])
              .filter((w) => (w.rowCount ?? 0) > 0 || typeof w === 'string')
              .map((w) => (typeof w === 'string' ? w : w.name))
          ),
        }));
      } catch (err) {
        setDeliveryNotice({ type: 'error', message: err.message });
        toast.error(err.message || '分析送货单数据失败');
      }
    },
    [productPresets]
  );

  const handleImportReceipt = async (directPath) => {
    try {
      const res = await window.excelTool.openDeliveryExcel('receipt', typeof directPath === 'string' ? directPath : undefined);
      if (!res) return;
      toast.success('ReceiptNote 入库明细导入成功');
      await runDeliveryAnalysis(res);
    } catch (err) {
      toast.error(err.message || '导入入库明细失败');
    }
  };

  const handleToggleDeliveryBrand = (b) => {
    setDeliveryState((prev) => {
      const next = new Set(prev.selectedBrands);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      return { ...prev, selectedBrands: next };
    });
  };

  const handleSelectAllDeliveryBrands = (allBrands = []) => {
    const next = new Set(allBrands.map((b) => (typeof b === 'string' ? b : b.name)));
    setDeliveryState((prev) => ({ ...prev, selectedBrands: next }));
  };

  const handleClearDeliveryBrands = () => {
    setDeliveryState((prev) => ({ ...prev, selectedBrands: new Set() }));
  };

  const handleToggleDeliveryWarehouse = (wh) => {
    setDeliveryState((prev) => {
      const next = new Set(prev.selectedWarehouses);
      if (next.has(wh)) next.delete(wh);
      else next.add(wh);
      return { ...prev, selectedWarehouses: next };
    });
  };

  const handleSelectAllDeliveryWarehouses = (allWarehouses = []) => {
    const next = new Set(allWarehouses.map((w) => (typeof w === 'string' ? w : w.name)));
    setDeliveryState((prev) => ({ ...prev, selectedWarehouses: next }));
  };

  const handleClearDeliveryWarehouses = () => {
    setDeliveryState((prev) => ({ ...prev, selectedWarehouses: new Set() }));
  };

  const handleUpdateDeliveryConfig = (field, val) => {
    if (field === 'supplierName') {
      localStorage.setItem('deliverySupplierName', val);
    }
    setDeliveryState((prev) => ({ ...prev, [field]: val }));
  };

  const handleApplyProductionDate = (keys, dateVal) => {
    setDeliveryState((prev) => {
      const dates = { ...prev.productionDates };
      keys.forEach((k) => {
        if (dateVal) dates[k] = dateVal;
        else delete dates[k];
      });
      return { ...prev, productionDates: dates };
    });
    if (dateVal) {
      toast.success(`已为 ${keys.length} 个商品设置生产日期`);
    } else {
      toast.success(`已清除 ${keys.length} 个商品的生产日期`);
    }
  };

  const handleExportDelivery = async () => {
    try {
      const res = await window.excelTool.exportDelivery({
        product: productPresets,
        productRows: productPresets,
        receipt: deliveryState.receipt,
        receiptRows: deliveryState.receipt?.rows,
        selectedBrands: Array.from(deliveryState.selectedBrands),
        selectedWarehouses: Array.from(deliveryState.selectedWarehouses),
        productionDates: deliveryState.productionDates,
        supplierName: deliveryState.supplierName,
        shelfLife: deliveryState.shelfLife,
        contact: deliveryState.contact,
        splitByWarehouse: deliveryState.splitByWarehouse,
      });
      if (res) {
        toast.success(`送货单生成成功，已保存至：${res.filePath || res.directory}`);
      }
    } catch (err) {
      toast.error(err.message || '生成送货单失败');
    }
  };

  const handleDeliveryDemand = async () => {
    try {
      if (!deliveryState.receipt || !deliveryState.analysis) {
        toast.error('请先导入 ReceiptNote 入库明细。');
        return;
      }
      const selectedBrands = deliveryState.selectedBrands;
      const selectedWarehouses = deliveryState.selectedWarehouses;
      const selectedReceiptRows = (deliveryState.receipt.rows || []).filter((r) =>
        selectedWarehouses.has(String(r['仓库名称'] || '').trim()) &&
        selectedBrands.has(String(r['品牌名称'] || '').trim())
      );
      if (!selectedReceiptRows.length) {
        toast.error('请至少选择一个包含有效明细的品牌与仓库。');
        return;
      }
      const config = await window.excelTool.getProcurementConfig({ rows: selectedReceiptRows });
      setDemandData({
        rows: selectedReceiptRows,
        warehouses: config.warehouses || [],
        presetFactories: config.presetFactories || [],
        defaultPickupDate: config.defaultPickupDate || '',
        warehouseConfigs: (config.warehouses || []).reduce((acc, w) => {
          acc[w.warehouse] = {
            factory: w.factory,
            pickupDate: w.pickupDate || config.defaultPickupDate,
            inboundDate: w.inboundDate || '',
          };
          return acc;
        }, {}),
      });
      setDemandOpen(true);
    } catch (err) {
      toast.error(err.message || '获取采购需求配置失败');
    }
  };

  // Presets Handlers
  const handleSaveProductPresets = async (rows) => {
    try {
      await window.excelTool.saveProductPreset(rows);
      setProductPresets(rows);
      toast.success('商品主数据已更新');
      if (deliveryState.receipt) {
        await runDeliveryAnalysis(deliveryState.receipt, rows);
      }
    } catch (err) {
      toast.error(err.message || '保存商品预设失败');
    }
  };

  const handleResetProductPresets = async () => {
    try {
      const res = await window.excelTool.resetProductPreset();
      if (res?.rows) {
        setProductPresets(res.rows);
        toast.success('已恢复默认商品主数据');
        if (deliveryState.receipt) {
          await runDeliveryAnalysis(deliveryState.receipt, res.rows);
        }
      }
    } catch (err) {
      toast.error(err.message || '重置商品预设失败');
    }
  };

  const handleImportProductPresetExcel = async () => {
    try {
      const res = await window.excelTool.importProductPreset();
      if (res?.rows) {
        setProductPresets(res.rows);
        toast.success(`已成功导入 ${res.rows.length} 个商品主数据`);
        if (deliveryState.receipt) {
          await runDeliveryAnalysis(deliveryState.receipt, res.rows);
        }
      }
    } catch (err) {
      toast.error(err.message || '导入商品预设失败');
    }
  };

  const handleSaveWarehousePresets = async (rows) => {
    try {
      await window.excelTool.saveWarehousePreset(rows);
      setWarehousePresets(rows);
      toast.success('仓库预设已更新');
      await recomputeSummary(table1, table2, brand, mapping, actualOrders, warehouseStatus, rows);
    } catch (err) {
      toast.error(err.message || '保存仓库预设失败');
    }
  };

  const handleResetWarehousePresets = async () => {
    try {
      const res = await window.excelTool.resetWarehousePreset();
      if (res?.rows) {
        setWarehousePresets(res.rows);
        toast.success('已恢复默认仓库预设');
        await recomputeSummary(table1, table2, brand, mapping, actualOrders, warehouseStatus, res.rows);
      }
    } catch (err) {
      toast.error(err.message || '重置仓库预设失败');
    }
  };

  const handleImportWarehousePresetExcel = async () => {
    try {
      const res = await window.excelTool.importWarehousePreset();
      if (res?.rows) {
        setWarehousePresets(res.rows);
        toast.success(`已成功导入 ${res.rows.length} 个仓库对应关系`);
        await recomputeSummary(table1, table2, brand, mapping, actualOrders, warehouseStatus, res.rows);
      }
    } catch (err) {
      toast.error(err.message || '导入仓库预设失败');
    }
  };

  // ==================== INVOICE METHODS ====================
  const runInvoiceCalculation = useCallback(
    async (rows, selectedFee, selectedDir) => {
      if (!rows.length || !window.excelTool) return;
      setInvoiceNotice(null);
      try {
        const summary = await window.excelTool.calculateInvoice({
          rows,
          selectedFeeTypes: Array.from(selectedFee),
          selectedInvoiceDirs: Array.from(selectedDir),
        });
        setInvoiceState((prev) => ({
          ...prev,
          summaryResult: summary,
        }));
      } catch (err) {
        setInvoiceNotice({ type: 'error', message: err.message });
        toast.error(err.message || '开票计算失败');
      }
    },
    []
  );

  const handleSelectInvoiceFiles = async (droppedPaths) => {
    try {
      let newPaths = [];
      const validPaths = Array.isArray(droppedPaths)
        ? droppedPaths.filter((p) => typeof p === 'string')
        : typeof droppedPaths === 'string'
        ? [droppedPaths]
        : null;

      if (validPaths && validPaths.length > 0) {
        newPaths = validPaths;
      } else {
        newPaths = await window.excelTool.openInvoiceFiles();
      }
      if (!newPaths || !newPaths.length) return;

      const mergedPaths = Array.from(new Set([...invoiceState.filePaths, ...newPaths]));
      const parsed = await window.excelTool.parseInvoiceFiles(mergedPaths);
      const rows = parsed.rows || parsed.rawRows || [];

      const feeSet = new Set(parsed.availableFeeTypes || []);
      const dirSet = new Set(parsed.availableInvoiceDirs || []);

      const next = {
        ...invoiceState,
        filePaths: mergedPaths,
        files: parsed.files || [],
        rawRows: rows,
        availableFeeTypes: parsed.availableFeeTypes || [],
        availableInvoiceDirs: parsed.availableInvoiceDirs || [],
        selectedFeeTypes: feeSet,
        selectedInvoiceDirs: dirSet,
        config: {
          ...invoiceState.config,
          date: parsed.defaultDate || invoiceState.config.date,
        },
      };
      setInvoiceState(next);
      toast.success(`已解析 ${parsed.files?.length || 0} 个对账单`);
      await runInvoiceCalculation(rows, feeSet, dirSet);
    } catch (err) {
      toast.error(err.message || '读取对账单失败');
    }
  };

  const handleSelectGoodsFeeOnly = () => {
    const goods = invoiceState.availableFeeTypes.filter((t) => t === '货款');
    const next = new Set(goods.length ? goods : invoiceState.availableFeeTypes.slice(0, 1));
    setInvoiceState((prev) => ({ ...prev, selectedFeeTypes: next }));
    runInvoiceCalculation(invoiceState.rawRows, next, invoiceState.selectedInvoiceDirs);
    toast.success('已切换为仅计算货款数量');
  };

  const handleSelectAllFeeTypes = () => {
    const next = new Set(invoiceState.availableFeeTypes);
    setInvoiceState((prev) => ({ ...prev, selectedFeeTypes: next }));
    runInvoiceCalculation(invoiceState.rawRows, next, invoiceState.selectedInvoiceDirs);
  };

  const handleClearFeeTypes = () => {
    const next = new Set();
    setInvoiceState((prev) => ({ ...prev, selectedFeeTypes: next }));
    runInvoiceCalculation(invoiceState.rawRows, next, invoiceState.selectedInvoiceDirs);
  };

  const handleSelectIncomingInvoiceOnly = () => {
    const incoming = invoiceState.availableInvoiceDirs.filter((d) => d.includes('进项') || d.includes('开票'));
    const next = new Set(incoming.length ? incoming : invoiceState.availableInvoiceDirs.slice(0, 1));
    setInvoiceState((prev) => ({ ...prev, selectedInvoiceDirs: next }));
    runInvoiceCalculation(invoiceState.rawRows, invoiceState.selectedFeeTypes, next);
    toast.success('已切换为仅计算进项票金额');
  };

  const handleSelectAllInvoiceDirs = () => {
    const next = new Set(invoiceState.availableInvoiceDirs);
    setInvoiceState((prev) => ({ ...prev, selectedInvoiceDirs: next }));
    runInvoiceCalculation(invoiceState.rawRows, invoiceState.selectedFeeTypes, next);
  };

  const handleRemoveInvoiceFile = async (filePathToRemove) => {
    const nextPaths = invoiceState.filePaths.filter((p) => p !== filePathToRemove);
    if (!nextPaths.length) {
      handleClearInvoiceFiles();
      return;
    }
    try {
      const parsed = await window.excelTool.parseInvoiceFiles(nextPaths);
      const rows = parsed.rows || parsed.rawRows || [];
      const feeSet = new Set(
        Array.from(invoiceState.selectedFeeTypes).filter((t) => (parsed.availableFeeTypes || []).includes(t))
      );
      if (!feeSet.size) {
        (parsed.availableFeeTypes || []).forEach((t) => feeSet.add(t));
      }
      const dirSet = new Set(
        Array.from(invoiceState.selectedInvoiceDirs).filter((d) => (parsed.availableInvoiceDirs || []).includes(d))
      );
      if (!dirSet.size) {
        (parsed.availableInvoiceDirs || []).forEach((d) => dirSet.add(d));
      }
      const next = {
        ...invoiceState,
        filePaths: nextPaths,
        files: parsed.files || [],
        rawRows: rows,
        availableFeeTypes: parsed.availableFeeTypes || [],
        availableInvoiceDirs: parsed.availableInvoiceDirs || [],
        selectedFeeTypes: feeSet,
        selectedInvoiceDirs: dirSet,
      };
      setInvoiceState(next);
      await runInvoiceCalculation(rows, feeSet, dirSet);
    } catch (err) {
      toast.error(err.message || '更新对账单失败');
    }
  };

  const handleClearInvoiceFiles = () => {
    setInvoiceState((prev) => ({
      ...prev,
      files: [],
      filePaths: [],
      rawRows: [],
      availableFeeTypes: [],
      availableInvoiceDirs: [],
      selectedFeeTypes: new Set(),
      selectedInvoiceDirs: new Set(),
      summaryResult: null,
    }));
  };

  const handleToggleFeeType = (type) => {
    const next = new Set(invoiceState.selectedFeeTypes);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    setInvoiceState((prev) => ({ ...prev, selectedFeeTypes: next }));
    runInvoiceCalculation(invoiceState.rawRows, next, invoiceState.selectedInvoiceDirs);
  };

  const handleToggleInvoiceDir = (dir) => {
    const next = new Set(invoiceState.selectedInvoiceDirs);
    if (next.has(dir)) next.delete(dir);
    else next.add(dir);
    setInvoiceState((prev) => ({ ...prev, selectedInvoiceDirs: next }));
    runInvoiceCalculation(invoiceState.rawRows, invoiceState.selectedFeeTypes, next);
  };

  const handleUpdateInvoiceConfig = (field, val) => {
    if (field === 'applicant') {
      localStorage.setItem('invoiceApplicant', val);
    }
    setInvoiceState((prev) => ({
      ...prev,
      config: { ...prev.config, [field]: val },
    }));
  };

  const handleSaveInvoiceConfig = async (cfg) => {
    try {
      await window.excelTool.saveInvoiceConfig(cfg);
      setInvoiceState((prev) => ({ ...prev, config: cfg }));
      toast.success('开票资料已保存');
    } catch (err) {
      toast.error(err.message || '保存开票资料失败');
    }
  };

  const handleResetInvoiceConfig = async () => {
    try {
      const cfg = await window.excelTool.getInvoiceConfig();
      if (cfg) {
        setInvoiceState((prev) => ({ ...prev, config: cfg }));
        toast.success('已恢复默认开票资料');
      }
    } catch (err) {
      toast.error(err.message || '恢复默认开票资料失败');
    }
  };

  const handleExportInvoice = async () => {
    if (!invoiceState.summaryResult?.items?.length) return;
    try {
      const res = await window.excelTool.exportInvoice({
        items: invoiceState.summaryResult.items,
        config: invoiceState.config,
      });
      if (res?.ok) {
        toast.success(`开票通知单已导出：${res.filePath}`);
      }
    } catch (err) {
      toast.error(err.message || '导出开票通知单失败');
    }
  };

  // Top action labels & badges
  const summaryModeText = useMemo(() => {
    if (!table2) return '等待导入表二';
    if (table1) {
      const unresolved = mappingRows.filter((r) => r.orders && !mapping[r.source]).length;
      return unresolved ? `完整模式 · ${unresolved} 待处理` : '完整订单模式';
    }
    return '库存模式';
  }, [table2, table1, mappingRows, mapping]);

  const inventoryModeText = useMemo(() => {
    if (!inventoryState.table3) return '等待导入旧表三';
    if (inventoryState.inventories.length === 0 && !inventoryState.transit) {
      return '等待实时库存或在途明细';
    }
    if (inventoryState.analysis?.errors?.length) {
      return `${inventoryState.analysis.errors.length} 个问题待处理`;
    }
    if (inventoryState.analysis) {
      return `${inventoryState.analysis.matchedRows || 0} 条库存 · ${inventoryState.analysis.matchedTransitRows || 0} 条在途`;
    }
    return '已就绪可导出';
  }, [inventoryState]);

  const deliveryModeText = useMemo(() => {
    if (!deliveryState.receipt) return '等待导入入库明细';
    return `已就绪 (${deliveryState.selectedBrands.size} 品牌 · ${deliveryState.selectedWarehouses.size} 仓)`;
  }, [deliveryState]);

  const invoiceModeText = useMemo(() => {
    if (invoiceState.files.length === 0) return '等待导入对账单';
    return `已就绪 (${invoiceState.summaryResult?.items?.length || 0} 项商品)`;
  }, [invoiceState]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-50 flex text-slate-900 select-none">
      {/* 1. Left Enterprise Sidebar */}
      <Sidebar
        workflow={workflow}
        onWorkflowChange={setWorkflow}
        replenishReady={Boolean(result?.rows?.length || inventoryState.analysis?.canExport)}
        deliveryReady={Boolean(deliveryState.receipt && deliveryState.selectedBrands.size > 0 && deliveryState.selectedWarehouses.size > 0)}
        invoiceReady={Boolean(invoiceState.summaryResult?.items?.length)}
        onOpenMasterData={() => {
          setMasterDataTab('products');
          setMasterDataOpen(true);
        }}
        masterDataCount={productPresets.length + warehousePresets.length}
      />

      {/* 2. Main Workspace */}
      <div className="flex-1 min-h-0 flex flex-col min-w-0 overflow-hidden bg-slate-50">
        <Header
          workflow={workflow}
          // Replenish
          summaryModeText={summaryModeText}
          summaryCanExport={Boolean(result?.rows?.length)}
          onSummaryExport={handleExportSummary}
          onSummaryDemand={handleOpenSummaryDemand}
          onSummaryBackfill={handleOpenBackfill}
          // Delivery
          deliveryModeText={deliveryModeText}
          deliveryCanDemand={Boolean(deliveryState.receipt && deliveryState.selectedBrands.size > 0 && deliveryState.selectedWarehouses.size > 0)}
          deliveryCanExport={Boolean(deliveryState.receipt && deliveryState.selectedBrands.size > 0 && deliveryState.selectedWarehouses.size > 0)}
          onDeliveryDemand={handleDeliveryDemand}
          onDeliveryExport={handleExportDelivery}
          // Invoice
          invoiceModeText={invoiceModeText}
          invoiceCanExport={Boolean(invoiceState.summaryResult?.items?.length)}
          onInvoiceExport={handleExportInvoice}
          onOpenMasterData={() => {
            setMasterDataTab('invoice');
            setMasterDataOpen(true);
          }}
        />

        {/* View Areas */}
        <div className="flex-1 min-h-0 flex flex-col min-w-0 overflow-hidden">
          {workflow === 'replenish' && (
            <ReplenishHubView
              // Step 1 props
              table2={table2}
              table1={table1}
              onImportTable2={handleImportTable2}
              onImportTable1={handleImportTable1}
              brands={brands}
              selectedBrand={brand}
              onBrandChange={handleBrandChange}
              mappingCount={mappingRows.filter((r) => r.orders && !mapping[r.source]).length}
              statsWarehouseCount={warehousePresets.filter((w) => w.inStats !== false && w['参与统计'] !== false).length}
              isHubMode={Boolean(result?.isHubMode)}
              productCatalogCount={(productCatalogs[brand] || []).length}
              onOpenMapping={() => {
                setMasterDataTab('mappings');
                setMasterDataOpen(true);
              }}
              onOpenWarehousePreset={() => {
                setMasterDataTab('warehouses');
                setMasterDataOpen(true);
              }}
              onOpenProductCatalog={() => {
                setMasterDataTab('catalog');
                setMasterDataOpen(true);
              }}
              summaryNotice={summaryNotice}
              result={result}
              onActualOrderChange={handleActualOrderChange}
              onWarehouseStatusChange={handleWarehouseStatusChange}
              onSummaryExport={handleExportSummary}
              onSummaryDemand={handleOpenSummaryDemand}
              onSummaryBackfill={handleOpenBackfill}

              // Step 2 props
              inventoryState={inventoryState}
              onImportTable3={handleImportInventoryTable3}
              onImportLiveInventory={handleImportLiveInventory}
              onImportTransit={handleImportTransit}
              onExportInventory={handleExportInventory}
              inventoryNotice={inventoryNotice}
              pipedFromSummary={pipedFromSummary}
              onPipeToInventory={handlePipeToInventory}
              onClearPipedTable3={handleClearPipedTable3}
            />
          )}

          {workflow === 'delivery' && (
            <DeliveryView
              deliveryState={deliveryState}
              productPresets={productPresets}
              productPresetCount={productPresets.length}
              warehousePresetCount={warehousePresets.length}
              onOpenProductPreset={() => {
                setMasterDataTab('products');
                setMasterDataOpen(true);
              }}
              onOpenWarehousePreset={() => {
                setMasterDataTab('warehouses');
                setMasterDataOpen(true);
              }}
              onImportProductPreset={handleImportProductPresetExcel}
              onImportWarehousePreset={handleImportWarehousePresetExcel}
              onImportReceipt={handleImportReceipt}
              onToggleBrand={handleToggleDeliveryBrand}
              onSelectAllBrands={handleSelectAllDeliveryBrands}
              onClearBrands={handleClearDeliveryBrands}
              onToggleWarehouse={handleToggleDeliveryWarehouse}
              onSelectAllWarehouses={handleSelectAllDeliveryWarehouses}
              onClearWarehouses={handleClearDeliveryWarehouses}
              onUpdateDeliveryConfig={handleUpdateDeliveryConfig}
              onApplyProductionDate={handleApplyProductionDate}
              notice={deliveryNotice}
            />
          )}

          {workflow === 'invoice' && (
            <InvoiceView
              invoiceState={invoiceState}
              onSelectInvoiceFiles={handleSelectInvoiceFiles}
              onRemoveInvoiceFile={handleRemoveInvoiceFile}
              onClearInvoiceFiles={handleClearInvoiceFiles}
              onToggleFeeType={handleToggleFeeType}
              onSelectGoodsFeeOnly={handleSelectGoodsFeeOnly}
              onSelectAllFeeTypes={handleSelectAllFeeTypes}
              onClearFeeTypes={handleClearFeeTypes}
              onToggleInvoiceDir={handleToggleInvoiceDir}
              onSelectIncomingInvoiceOnly={handleSelectIncomingInvoiceOnly}
              onSelectAllInvoiceDirs={handleSelectAllInvoiceDirs}
              onUpdateConfig={handleUpdateInvoiceConfig}
              notice={invoiceNotice}
            />
          )}
        </div>
      </div>

      {/* Unified Master Data & Presets Center */}
      <MasterDataDialog
        open={masterDataOpen}
        onOpenChange={setMasterDataOpen}
        activeTab={masterDataTab}
        // Product
        productPresets={productPresets}
        onSaveProductPresets={handleSaveProductPresets}
        onResetProductPresets={handleResetProductPresets}
        onImportProductPresetExcel={handleImportProductPresetExcel}
        // Warehouse
        warehousePresets={warehousePresets}
        onSaveWarehousePresets={handleSaveWarehousePresets}
        onResetWarehousePresets={handleResetWarehousePresets}
        onImportWarehousePresetExcel={handleImportWarehousePresetExcel}
        // Mapping
        mappingRows={mappingRows}
        directWarehouses={result?.warehouses || []}
        warehouseMapping={mapping}
        onSaveMapping={handleSaveMapping}
        // Catalog
        currentBrand={brand}
        brandCatalogs={productCatalogs}
        onSaveCatalog={handleSaveCatalog}
        onRestoreCatalog={handleRestoreCatalog}
        // Invoice
        invoiceConfig={invoiceState.config}
        onSaveInvoiceConfig={handleSaveInvoiceConfig}
        onResetInvoiceConfig={handleResetInvoiceConfig}
      />

      {/* Popups for tasks */}
      <BackfillDialog
        open={backfillOpen}
        onOpenChange={setBackfillOpen}
        preview={backfillPreview}
        onConfirmBackfill={handleConfirmBackfill}
      />

      <DemandDialog
        open={demandOpen}
        onOpenChange={setDemandOpen}
        demandData={demandData}
        onImportFile={handleImportDemandFile}
        onOpenWarehousePreset={() => {
          setMasterDataTab('warehouses');
          setMasterDataOpen(true);
        }}
        onConfirmDemand={handleConfirmDemand}
      />

      {/* Modern Sonner Toast */}
      <Toaster />
    </div>
  );
}
