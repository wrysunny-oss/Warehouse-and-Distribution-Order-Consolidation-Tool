import React, { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Truck, 
  Upload, 
  Settings2, 
  Calendar, 
  Search, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Database,
  Building2,
  FileSpreadsheet,
  Layers,
  Sparkles
} from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import { useFileDrop } from '@/lib/use-file-drop';

function clean(value) {
  return String(value ?? '').trim();
}

function cleanCode(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  return clean(value).replace(/\.0+$/, '');
}

export function DeliveryView({
  deliveryState,
  productPresets = [],
  productPresetCount = 0,
  warehousePresetCount = 0,
  onOpenProductPreset,
  onOpenWarehousePreset,
  onImportProductPreset,
  onImportWarehousePreset,
  onImportReceipt,
  onToggleBrand,
  onSelectAllBrands,
  onClearBrands,
  onToggleWarehouse,
  onSelectAllWarehouses,
  onClearWarehouses,
  onUpdateDeliveryConfig,
  onApplyProductionDate,
  notice,
}) {
  const {
    receipt,
    analysis,
    selectedBrands = new Set(),
    selectedWarehouses = new Set(),
    productionDates = {},
    supplierName,
    shelfLife,
    contact,
    splitByWarehouse,
  } = deliveryState;

  const [productSearch, setProductSearch] = useState('');
  const [selectedProductKeys, setSelectedProductKeys] = useState(new Set());
  const [batchDate, setBatchDate] = useState('');
  const [previewTab, setPreviewTab] = useState('products'); // 'products' | 'deliveryRows'
  const [rowSearch, setRowSearch] = useState('');

  const dropReceiptProps = useFileDrop({
    onFilesDropped: (paths) => {
      if (paths.length > 0) onImportReceipt(paths[0]);
    },
  });

  const setDateToday = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setBatchDate(`${yyyy}-${mm}-${dd}`);
  };

  const setDateTomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setBatchDate(`${yyyy}-${mm}-${dd}`);
  };

  const isReady = Boolean(receipt && analysis);

  // Available brands and warehouses extracted from analysis
  const availableBrands = analysis?.brands || [];
  const availableWarehouses = analysis?.warehouses || [];

  // Filter products by brand and warehouse
  const allProducts = useMemo(() => {
    if (!analysis?.products) return [];
    return analysis.products.filter(
      (p) =>
        selectedBrands.has(p.brand) &&
        p.warehouses?.some((wh) => selectedWarehouses.has(wh))
    );
  }, [analysis, selectedBrands, selectedWarehouses]);

  // Search filtered products
  const visibleProducts = useMemo(() => {
    if (!productSearch.trim()) return allProducts;
    const q = productSearch.trim().toLowerCase();
    return allProducts.filter(
      (p) =>
        (p.name || p.shortName || '').toLowerCase().includes(q) ||
        (p.barcode || '').toLowerCase().includes(q) ||
        (p.sourceName || p.fullName || '').toLowerCase().includes(q)
    );
  }, [allProducts, productSearch]);

  const getProductKey = (p) => p.key || p.barcode || p.name || p.shortName;
  const getProductDate = (p) => {
    if (!p) return '';
    return (
      (p.key && productionDates[p.key]) ||
      (p.barcode && productionDates[p.barcode]) ||
      productionDates[getProductKey(p)] ||
      ''
    );
  };

  const datedCount = useMemo(() => {
    return allProducts.filter((p) => Boolean(getProductDate(p))).length;
  }, [allProducts, productionDates]);

  const summaryText = useMemo(() => {
    if (!analysis) return '尚未分析数据';
    if (analysis.stats) {
      return `${analysis.stats.productRows || 0} 个商品 · ${analysis.stats.receiptRows || 0} 条明细 · ${analysis.stats.warehouses || 0} 个仓库`;
    }
    return analysis.summaryText || '已分析数据';
  }, [analysis]);

  const allVisibleSelected =
    visibleProducts.length > 0 &&
    visibleProducts.every((p) => selectedProductKeys.has(getProductKey(p)));

  const handleSelectVisible = () => {
    const next = new Set(selectedProductKeys);
    visibleProducts.forEach((p) => next.add(getProductKey(p)));
    setSelectedProductKeys(next);
  };

  const handleToggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      const next = new Set(selectedProductKeys);
      visibleProducts.forEach((p) => next.delete(getProductKey(p)));
      setSelectedProductKeys(next);
    } else {
      const next = new Set(selectedProductKeys);
      visibleProducts.forEach((p) => next.add(getProductKey(p)));
      setSelectedProductKeys(next);
    }
  };

  const handleClearSelection = () => {
    setSelectedProductKeys(new Set());
  };

  const handleToggleProduct = (key) => {
    const next = new Set(selectedProductKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedProductKeys(next);
  };

  const handleApplyDate = () => {
    if (selectedProductKeys.size === 0) return;
    onApplyProductionDate(Array.from(selectedProductKeys), batchDate);
    setSelectedProductKeys(new Set());
  };

  const handleSetSingleDate = (key, dateStr) => {
    onApplyProductionDate([key], dateStr);
  };

  // Build product index for delivery rows preview
  const deliveryProductMap = useMemo(() => {
    const map = new Map();
    (productPresets || []).forEach((row) => {
      const barcodes = clean(row['条码']).split('#').map(cleanCode).filter(Boolean);
      const name = clean(row['订单简称']) || clean(row['企业微信申报订单简称']) || clean(row['货品名称（带空格）']);
      const brand = clean(row['品牌名称']);
      barcodes.forEach((b) => map.set(b, { name, brand, row }));
    });
    return map;
  }, [productPresets]);

  // Full DeliveryNote row preview
  const deliveryPreviewRows = useMemo(() => {
    const rows = deliveryState.receipt?.rows || [];
    if (!rows.length) return [];
    return rows
      .filter((r) => {
        const wh = clean(r['仓库名称']);
        const barcode = cleanCode(r['条形码']);
        const prod = deliveryProductMap.get(barcode);
        const brand = prod?.brand || clean(r['品牌名称']);
        return selectedWarehouses.has(wh) && selectedBrands.has(brand);
      })
      .map((r, idx) => {
        const barcode = cleanCode(r['条形码']);
        const prod = deliveryProductMap.get(barcode);
        const name = prod?.name || clean(r['货品名称']);
        const brand = prod?.brand || clean(r['品牌名称']);
        const boxSpec = Number(clean(r['采购规格(箱规数)'])) || 1;
        const packages = Number(clean(r['商品实际发货数量'])) || 0;
        const boxes = packages / boxSpec;
        const isFractional = Math.abs(boxes - Math.round(boxes)) > 1e-9;
        const dateKey = `${brand}\u0000${barcode}`;
        const prodDate = productionDates[dateKey] || productionDates[barcode] || '';
        return {
          id: idx,
          deliveryDate: clean(r['预约入库时间']) || clean(r['期望到货时间']) || '-',
          lbx: clean(r['LBX号']) || '-',
          warehouse: clean(r['仓库名称']) || '-',
          barcode,
          name,
          brand,
          boxSpec,
          packages,
          boxes: Number.isFinite(boxes) ? (isFractional ? boxes.toFixed(2) : String(boxes)) : '-',
          isFractional,
          productionDate: prodDate,
          shelfLife: deliveryState.shelfLife ? `${clean(deliveryState.shelfLife)}天` : '',
        };
      });
  }, [deliveryState.receipt, selectedWarehouses, selectedBrands, deliveryProductMap, productionDates, deliveryState.shelfLife]);

  const filteredDeliveryPreviewRows = useMemo(() => {
    if (!rowSearch.trim()) return deliveryPreviewRows;
    const q = rowSearch.trim().toLowerCase();
    return deliveryPreviewRows.filter(
      (r) =>
        r.warehouse.toLowerCase().includes(q) ||
        r.lbx.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.barcode.includes(q) ||
        r.brand.toLowerCase().includes(q)
    );
  }, [deliveryPreviewRows, rowSearch]);

  const fractionalCount = useMemo(() => {
    return deliveryPreviewRows.filter((r) => r.isFractional).length;
  }, [deliveryPreviewRows]);

  return (
    <main id="deliveryView" className="flex-1 min-h-0 p-4 sm:p-5 flex flex-col gap-3.5 select-none overflow-y-auto">
      {/* Compact Intro & Readiness */}
      <section className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-slate-200/90 bg-white shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-zinc-100 text-zinc-800">
            <Truck className="size-4" />
          </div>
          <div>
            <h2 className="text-xs font-semibold text-slate-900">生成送货单与采购需求</h2>
            <p className="text-[11px] text-slate-500">
              基于商品主数据和入库明细，一键生成送货单，或导出工厂采购需求一览表。
            </p>
          </div>
        </div>

        <div id="deliveryReadiness">
          {isReady ? (
            <Badge variant="success" className="gap-1.5 py-0.5 px-2.5 text-xs">
              <CheckCircle2 className="size-3.5" data-icon="inline-start" />
              已就绪，可生成送货单
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1.5 py-0.5 px-2.5 text-xs">
              <Clock className="size-3.5 text-slate-400" data-icon="inline-start" />
              等待入库明细
            </Badge>
          )}
        </div>
      </section>

      {/* 3 Slots: 2 Presets + 1 ReceiptNote */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3" aria-label="送货单数据导入">
        {/* Preset 1: Product Master Data */}
        <Card id="productSlot" className="p-3 bg-white flex flex-col justify-between border-slate-200/90 shadow-xs">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <Badge variant="outline" className="text-[10px] px-1 py-0 bg-slate-50 font-medium">全局预设</Badge>
                <strong className="text-xs font-semibold text-slate-900">商品主数据表</strong>
              </div>
              <p id="productMeta" className="text-[11px] text-zinc-400">已预设 {productPresetCount} 个商品条码与简称</p>
            </div>
            <Database className="h-4 w-4 text-zinc-400 shrink-0" />
          </div>
          <div className="flex items-center gap-2 pt-1.5 border-t border-zinc-100">
            <Button id="manageProductPresetBtn" variant="outline" size="sm" onClick={onOpenProductPreset} className="text-xs h-7 flex-1">管理主数据</Button>
            <Button id="importProductPresetBtn" variant="ghost" size="sm" onClick={onImportProductPreset} className="text-xs h-7 text-zinc-500">重新导入</Button>
          </div>
        </Card>

        {/* Preset 2: Warehouse Factory Data */}
        <Card id="warehousePresetSlot" className="p-3 bg-white flex flex-col justify-between border-slate-200/90 shadow-xs">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <Badge variant="outline" className="text-[10px] px-1 py-0 bg-slate-50 font-medium">全局预设</Badge>
                <strong className="text-xs font-semibold text-zinc-900">仓库与米厂对应表</strong>
              </div>
              <p id="warehousePresetMeta" className="text-[11px] text-zinc-400">已预设 {warehousePresetCount} 个仓库米厂关系</p>
            </div>
            <Building2 className="h-4 w-4 text-zinc-400 shrink-0" />
          </div>
          <div className="flex items-center gap-2 pt-1.5 border-t border-zinc-100">
            <Button id="manageWarehousePresetBtn" variant="outline" size="sm" onClick={onOpenWarehousePreset} className="text-xs h-7 flex-1">管理主数据</Button>
            <Button id="importWarehousePresetBtn" variant="ghost" size="sm" onClick={onImportWarehousePreset} className="text-xs h-7 text-zinc-500">重新导入</Button>
          </div>
        </Card>

        {/* Slot 3: ReceiptNote */}
        <Card
          id="receiptSlot"
          {...dropReceiptProps}
          className={`flex items-center justify-between p-3 transition-all ${
            dropReceiptProps.isDragging
              ? 'border-2 border-dashed border-zinc-950 bg-zinc-100/90 shadow-sm'
              : receipt
              ? 'border-zinc-400/80 bg-zinc-50/50'
              : 'bg-white hover:border-zinc-300'
          }`}
        >
          <div className="min-w-0 pr-2">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Badge variant={receipt ? 'success' : 'default'} className="text-[10px] px-1 py-0">必需</Badge>
              <strong className="text-xs font-semibold text-zinc-900 truncate">ReceiptNote · 入库明细</strong>
            </div>
            <p id="receiptMeta" className="text-[11px] text-zinc-400 truncate" title={receipt ? receipt.fileName : '支持拖拽 Excel 到此处'}>
              {dropReceiptProps.isDragging ? '释放以导入入库明细' : receipt ? receipt.fileName : '支持拖拽 Excel 到此处'}
            </p>
          </div>
          <Button id="receiptBtn" variant={receipt ? 'outline' : 'secondary'} size="sm" onClick={() => onImportReceipt()} className="h-8 shrink-0">
            <Upload className="h-3.5 w-3.5 mr-1" />
            {receipt ? '重新选择' : '选择文件'}
          </Button>
        </Card>
      </section>

      {/* Notice alert */}
      {notice && (
        <section
          id="deliveryNotice"
          role="status"
          className={`flex items-center gap-2.5 p-3 rounded-lg text-xs font-medium border ${
            notice.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-zinc-100 border-zinc-300 text-zinc-900'
          }`}
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{notice.message}</span>
        </section>
      )}

      {/* Brand & Warehouse Filter Settings */}
      <section className="rounded-xl border border-zinc-200/80 bg-white p-3.5 shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
          <div>
            <h2 className="text-xs font-semibold text-zinc-900">品牌与全局配置</h2>
            <p className="text-[11px] text-zinc-400">每个品牌单独生成一个 Excel；供应商名称会自动保存在本机。</p>
          </div>
          <span id="deliverySourceSummary" className="text-xs text-zinc-500 font-mono">
            {summaryText}
          </span>
        </div>

        {/* Brand & Warehouse Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Brands */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-medium text-zinc-600">生成品牌</span>
              {availableBrands.length > 0 && (
                <div className="flex items-center gap-1 text-[11px]">
                  <Button variant="ghost" size="unstyled" type="button" onClick={() => onSelectAllBrands && onSelectAllBrands(availableBrands)} className="text-zinc-500 hover:text-zinc-900 cursor-pointer">全选</Button>
                  <span className="text-zinc-300">|</span>
                  <Button variant="ghost" size="unstyled" type="button" onClick={() => onClearBrands && onClearBrands()} className="text-zinc-500 hover:text-zinc-900 cursor-pointer">清空</Button>
                </div>
              )}
            </div>
            <div id="deliveryBrands" className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
              {availableBrands.length === 0 ? (
                <span className="text-xs text-zinc-400">导入两份文件后显示品牌</span>
              ) : (
                availableBrands.map((b) => {
                  const brandName = typeof b === 'string' ? b : b.name;
                  const isSelected = selectedBrands.has(brandName);
                  const count = typeof b === 'object' ? (b.rowCount ?? b.productCount) : null;
                  return (
                    <Button variant="ghost" size="unstyled"
                      key={brandName}
                      type="button"
                      onClick={() => onToggleBrand(brandName)}
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-medium border transition-colors cursor-pointer ${
                        isSelected ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                      }`}
                    >
                      <span>{brandName}</span>
                      {count !== null && <span className="text-[10px] opacity-70 tabular-nums">({count})</span>}
                    </Button>
                  );
                })
              )}
            </div>
          </div>

          {/* Warehouses */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-medium text-zinc-600">生成仓库</span>
              {availableWarehouses.length > 0 && (
                <div className="flex items-center gap-1 text-[11px]">
                  <Button variant="ghost" size="unstyled" type="button" onClick={() => onSelectAllWarehouses && onSelectAllWarehouses(availableWarehouses)} className="text-zinc-500 hover:text-zinc-900 cursor-pointer">全选</Button>
                  <span className="text-zinc-300">|</span>
                  <Button variant="ghost" size="unstyled" type="button" onClick={() => onClearWarehouses && onClearWarehouses()} className="text-zinc-500 hover:text-zinc-900 cursor-pointer">清空</Button>
                </div>
              )}
            </div>
            <div id="deliveryWarehouses" className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
              {availableWarehouses.length === 0 ? (
                <span className="text-xs text-zinc-400">导入两份文件后显示仓库</span>
              ) : (
                availableWarehouses.map((wh) => {
                  const whName = typeof wh === 'string' ? wh : wh.name;
                  const isSelected = selectedWarehouses.has(whName);
                  const count = typeof wh === 'object' ? wh.rowCount : null;
                  return (
                    <Button variant="ghost" size="unstyled"
                      key={whName}
                      type="button"
                      onClick={() => onToggleWarehouse(whName)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition-colors cursor-pointer ${
                        isSelected ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                      }`}
                    >
                      <span>{whName}</span>
                      {count !== null && <span className="text-[10px] opacity-70 tabular-nums">({count})</span>}
                    </Button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Inputs & Options row */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-2 border-t border-zinc-100 items-end">
          <div>
            <label className="text-[11px] font-medium text-zinc-600 block mb-1">供应商名称</label>
            <Input id="supplierNameInput" value={supplierName} onChange={(e) => onUpdateDeliveryConfig('supplierName', e.target.value)} className="h-7 text-xs bg-zinc-50/50" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-zinc-600 block mb-1">保质期（天）</label>
            <Input id="shelfLifeInput" type="number" min="1" value={shelfLife} onChange={(e) => onUpdateDeliveryConfig('shelfLife', e.target.value)} className="h-7 text-xs bg-zinc-50/50" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-zinc-600 block mb-1">联系方式</label>
            <Input id="contactInput" value={contact} onChange={(e) => onUpdateDeliveryConfig('contact', e.target.value)} className="h-7 text-xs bg-zinc-50/50" />
          </div>
          <div className="pb-1">
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-xs text-zinc-700">
              <Checkbox id="splitByWarehouseInput" checked={splitByWarehouse} onCheckedChange={(checked) => onUpdateDeliveryConfig('splitByWarehouse', Boolean(checked))} />
              <span className="font-medium text-xs">按仓库拆分为独立 Excel</span>
            </label>
          </div>
        </div>
      </section>

      {/* Product Production Date & Delivery Preview Workspace */}
      <section className="rounded-xl border border-zinc-200/80 bg-white overflow-hidden shadow-xs flex flex-col min-h-[360px]">
        {/* Header & Tabs */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3.5 border-b border-zinc-100 gap-3 bg-zinc-50/40">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-zinc-900">送货单明细与生产日期预览</h2>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono bg-white border-zinc-200">
                {previewTab === 'products' ? `商品数: ${allProducts.length}` : `送货明细: ${deliveryPreviewRows.length} 行`}
              </Badge>
              {fractionalCount > 0 && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                  {fractionalCount} 个小数箱
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {previewTab === 'products'
                ? '生产日期选填；可搜索商品并批量设置日期，也可在行内快捷设为今日。'
                : '基于当前所选品牌与仓库，实时预览生成送货单的完整明细行与箱数折算。'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* View Mode Tabs */}
            <div className="flex items-center gap-1 bg-zinc-100 p-0.5 rounded-lg border border-zinc-200">
              <Button variant="ghost" size="unstyled"
                type="button"
                onClick={() => setPreviewTab('products')}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5",
                  previewTab === 'products' ? "bg-white text-zinc-900 shadow-xs font-semibold" : "text-zinc-500 hover:text-zinc-900"
                )}
              >
                <Calendar className="size-3.5" />
                <span>商品与生产日期 ({allProducts.length})</span>
              </Button>
              <Button variant="ghost" size="unstyled"
                type="button"
                onClick={() => setPreviewTab('deliveryRows')}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5",
                  previewTab === 'deliveryRows' ? "bg-white text-zinc-900 shadow-xs font-semibold" : "text-zinc-500 hover:text-zinc-900"
                )}
              >
                <FileSpreadsheet className="size-3.5" />
                <span>送货单导出预览 ({deliveryPreviewRows.length})</span>
              </Button>
            </div>

            {previewTab === 'products' && (
              <div className="flex items-center gap-1 text-xs text-zinc-500 pl-2 border-l border-zinc-200">
                <span>已填写:</span>
                <strong id="datedProductCount" className="font-semibold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-800 font-mono text-[11px]">
                  {datedCount} / {allProducts.length}
                </strong>
              </div>
            )}
          </div>
        </div>

        {/* Tab 1: Products and Production Date Config */}
        {previewTab === 'products' && (
          <>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-zinc-50/60 border-b border-zinc-100">
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                <Input
                  id="deliveryProductSearch"
                  placeholder="搜索商品简称或条码..."
                  disabled={!isReady}
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="h-8 pl-8 text-xs bg-white"
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  id="selectVisibleProductsBtn"
                  variant="outline"
                  size="sm"
                  disabled={visibleProducts.length === 0}
                  onClick={handleSelectVisible}
                  className="text-xs h-8"
                >
                  选择筛选结果 ({visibleProducts.length})
                </Button>
                <Button
                  id="clearProductSelectionBtn"
                  variant="ghost"
                  size="sm"
                  disabled={selectedProductKeys.size === 0}
                  onClick={handleClearSelection}
                  className="text-xs h-8 text-zinc-500"
                >
                  清空选择
                </Button>

                <div className="flex items-center gap-1.5 pl-2 border-l border-zinc-200">
                  <div className="flex items-center gap-1">
                    <Button
                      id="dateTodayBtn"
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!isReady}
                      onClick={setDateToday}
                      className="h-8 px-2 text-xs text-zinc-600 hover:text-zinc-900 cursor-pointer"
                      title="填入今天日期"
                    >
                      今日
                    </Button>
                    <Button
                      id="dateTomorrowBtn"
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!isReady}
                      onClick={setDateTomorrow}
                      className="h-8 px-2 text-xs text-zinc-600 hover:text-zinc-900 cursor-pointer"
                      title="填入明天日期"
                    >
                      明日
                    </Button>
                  </div>
                  <Input
                    id="productionDateInput"
                    type="date"
                    disabled={!isReady}
                    value={batchDate}
                    onChange={(e) => setBatchDate(e.target.value)}
                    className="h-8 text-xs w-36 bg-white"
                  />
                  <Button
                    id="applyProductionDateBtn"
                    variant={selectedProductKeys.size > 0 ? 'default' : 'secondary'}
                    size="sm"
                    disabled={selectedProductKeys.size === 0}
                    onClick={handleApplyDate}
                    className="text-xs h-8"
                    title={selectedProductKeys.size === 0 ? '请先勾选需要设置生产日期的商品' : (batchDate ? '批量应用所选日期' : '清除所选商品的生产日期')}
                  >
                    {batchDate ? '应用日期' : '清除日期'}
                  </Button>
                </div>
              </div>
            </div>

            {/* Product list table */}
            <div className="max-h-[380px] overflow-y-auto">
              <div className="grid grid-cols-[50px_90px_1fr_150px_160px_130px_100px] bg-zinc-100/95 border-b border-zinc-200 p-2.5 text-xs font-semibold text-zinc-600 sticky top-0 z-10 shadow-xs backdrop-blur-xs">
                <div className="flex justify-center">
                  <Checkbox
                    checked={allVisibleSelected}
                    disabled={visibleProducts.length === 0}
                    onCheckedChange={handleToggleSelectAllVisible}
                    title="全选/清空当前筛选结果"
                  />
                </div>
                <span>品牌</span>
                <span>商品简称</span>
                <span>条码</span>
                <span>发运仓库</span>
                <span>生产日期</span>
                <span className="text-right pr-2">快捷操作</span>
              </div>

              <div id="deliveryProductList" className="divide-y divide-zinc-100">
                {visibleProducts.length === 0 ? (
                  <div className="py-16 text-center text-xs text-zinc-400">
                    导入两份源文件后，在这里配置生产日期
                  </div>
                ) : (
                  visibleProducts.map((p) => {
                    const key = getProductKey(p);
                    const displayName = p.name || p.shortName || p.sourceName || '-';
                    const isSelected = selectedProductKeys.has(key);
                    const curDate = getProductDate(p);
                    const whList = p.warehouses || [];
                    const whSummary = whList.length > 0
                      ? `${whList.slice(0, 2).join('、')}${whList.length > 2 ? ` 等 ${whList.length} 仓` : ''}`
                      : '-';

                    return (
                      <div
                        key={`${key}-${p.brand}`}
                        onClick={() => handleToggleProduct(key)}
                        className={`grid grid-cols-[50px_90px_1fr_150px_160px_130px_100px] items-center p-2.5 text-xs transition-colors cursor-pointer ${
                          isSelected ? 'bg-zinc-100/70' : 'hover:bg-zinc-50'
                        }`}
                      >
                        <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleToggleProduct(key)}
                          />
                        </div>
                        <div>
                          <Badge variant="secondary" className="text-[10px]">
                            {p.brand}
                          </Badge>
                        </div>
                        <div className="font-medium text-zinc-800 truncate pr-2" title={displayName}>
                          {displayName}
                        </div>
                        <div className="font-mono text-zinc-500 truncate" title={p.barcode}>
                          {p.barcode || '-'}
                        </div>
                        <div className="text-zinc-500 truncate text-[11px]" title={whList.join('、')}>
                          {whSummary}
                        </div>
                        <div>
                          {curDate ? (
                            <Badge variant="outline" className="font-mono text-[11px] bg-white text-zinc-800 border-zinc-300">
                              {curDate}
                            </Badge>
                          ) : (
                            <span className="text-zinc-400 text-[11px]">未设置</span>
                          )}
                        </div>
                        <div className="flex items-center justify-end gap-1 pr-1" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="unstyled"
                            type="button"
                            onClick={() => {
                              const d = new Date();
                              const y = d.getFullYear();
                              const m = String(d.getMonth() + 1).padStart(2, '0');
                              const day = String(d.getDate()).padStart(2, '0');
                              handleSetSingleDate(key, `${y}-${m}-${day}`);
                            }}
                            className="px-1.5 py-0.5 rounded text-[10px] text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200 transition-colors"
                            title="快捷设为今日"
                          >
                            设为今日
                          </Button>
                          {curDate && (
                            <Button variant="ghost" size="unstyled"
                              type="button"
                              onClick={() => handleSetSingleDate(key, '')}
                              className="px-1 py-0.5 rounded text-[10px] text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                              title="清除日期"
                            >
                              清除
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}

        {/* Tab 2: Full DeliveryNote Row Preview */}
        {previewTab === 'deliveryRows' && (
          <>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-zinc-50/60 border-b border-zinc-100">
              <div className="relative w-72">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                <Input
                  placeholder="搜索仓库、物流宝单号或商品简称..."
                  value={rowSearch}
                  onChange={(e) => setRowSearch(e.target.value)}
                  className="h-8 pl-8 text-xs bg-white"
                />
              </div>

              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span>显示 {filteredDeliveryPreviewRows.length} / {deliveryPreviewRows.length} 条生成明细</span>
                {fractionalCount > 0 && (
                  <span className="text-rose-600 font-medium">({fractionalCount} 条小数箱将标红)</span>
                )}
              </div>
            </div>

            {/* Delivery preview rows table */}
            <div className="max-h-[380px] overflow-y-auto">
              <div className="grid grid-cols-[50px_90px_130px_140px_130px_1fr_65px_70px_70px_100px] bg-zinc-100/95 border-b border-zinc-200 p-2.5 text-xs font-semibold text-zinc-600 sticky top-0 z-10 shadow-xs backdrop-blur-xs">
                <span className="text-center">#</span>
                <span>送货日期</span>
                <span>物流宝单号</span>
                <span>仓库名称</span>
                <span>商品条码</span>
                <span>商品简称</span>
                <span className="text-right">箱规</span>
                <span className="text-right">包数</span>
                <span className="text-right">箱数</span>
                <span className="text-center">生产日期</span>
              </div>

              <div className="divide-y divide-zinc-100 font-mono text-xs">
                {filteredDeliveryPreviewRows.length === 0 ? (
                  <div className="py-16 text-center text-xs text-zinc-400">
                    没有匹配的送货单明细
                  </div>
                ) : (
                  filteredDeliveryPreviewRows.map((r, index) => (
                    <div
                      key={`${r.warehouse}-${r.lbx}-${r.barcode}-${index}`}
                      className="grid grid-cols-[50px_90px_130px_140px_130px_1fr_65px_70px_70px_100px] items-center p-2 text-xs hover:bg-zinc-50 transition-colors"
                    >
                      <span className="text-center text-zinc-400 font-sans text-[11px]">{index + 1}</span>
                      <span className="text-zinc-600 truncate">{r.deliveryDate}</span>
                      <span className="text-zinc-700 truncate" title={r.lbx}>{r.lbx}</span>
                      <span className="font-sans text-zinc-800 font-medium truncate" title={r.warehouse}>{r.warehouse}</span>
                      <span className="text-zinc-500 truncate" title={r.barcode}>{r.barcode}</span>
                      <span className="font-sans text-zinc-800 truncate pr-2 font-medium" title={r.name}>{r.name}</span>
                      <span className="text-right text-zinc-600">{r.boxSpec}</span>
                      <span className="text-right text-zinc-800 font-medium">{r.packages}</span>
                      <span className={cn(
                        "text-right font-semibold",
                        r.isFractional ? "text-rose-600 bg-rose-50 px-1 rounded" : "text-zinc-900"
                      )}>
                        {r.boxes}
                      </span>
                      <div className="flex justify-center">
                        {r.productionDate ? (
                          <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 bg-white text-zinc-700 border-zinc-300">
                            {r.productionDate}
                          </Badge>
                        ) : (
                          <span className="text-zinc-400 font-sans text-[10px]">留空</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between p-3 bg-zinc-50/70 border-t border-zinc-100 text-xs mt-auto">
          <div id="deliveryMetrics" className="flex items-center gap-4 text-zinc-600">
            <span><strong>{selectedBrands.size}</strong> 个品牌</span>
            <span><strong>{selectedWarehouses.size}</strong> 个仓库</span>
            <span><strong>{deliveryPreviewRows.length}</strong> 条明细</span>
            {fractionalCount > 0 && (
              <span className="text-rose-600"><strong>{fractionalCount}</strong> 个小数箱</span>
            )}
          </div>
          <p id="deliveryExportHint" className="text-zinc-400 text-[11px]">
            配置完整；将按{splitByWarehouse ? '仓库分别生成独立 Excel' : '品牌生成多工作表 Excel'}。
          </p>
        </div>
      </section>
    </main>
  );
}
