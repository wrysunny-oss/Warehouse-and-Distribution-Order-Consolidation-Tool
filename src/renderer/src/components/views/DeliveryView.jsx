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
  Building2
} from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { useFileDrop } from '@/lib/use-file-drop';

export function DeliveryView({
  deliveryState,
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

  const datedCount = useMemo(() => {
    return allProducts.filter((p) => Boolean(productionDates[p.barcode || p.name || p.shortName])).length;
  }, [allProducts, productionDates]);

  const summaryText = useMemo(() => {
    if (!analysis) return '尚未分析数据';
    if (analysis.stats) {
      return `${analysis.stats.productRows || 0} 个商品 · ${analysis.stats.receiptRows || 0} 条明细 · ${analysis.stats.warehouses || 0} 个仓库`;
    }
    return analysis.summaryText || '已分析数据';
  }, [analysis]);

  const handleSelectVisible = () => {
    const next = new Set(selectedProductKeys);
    visibleProducts.forEach((p) => next.add(p.barcode || p.name || p.shortName));
    setSelectedProductKeys(next);
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
    onApplyProductionDate(Array.from(selectedProductKeys), batchDate);
  };

  return (
    <main id="deliveryView" className="flex-1 p-6 flex flex-col gap-5 select-none overflow-y-auto">
      {/* Intro Header */}
      <section className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-200/90 bg-white shadow-xs">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">生成送货单与采购需求</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            基于商品主数据和入库明细，一键生成送货单，或导出工厂采购需求一览表。
          </p>
        </div>

        <div id="deliveryReadiness">
          {isReady ? (
            <Badge variant="success" className="gap-1.5 py-1 px-3">
              <CheckCircle2 className="size-3.5" data-icon="inline-start" />
              已就绪，可生成送货单
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1.5 py-1 px-3">
              <Clock className="size-3.5 text-slate-400" data-icon="inline-start" />
              等待入库明细
            </Badge>
          )}
        </div>
      </section>

      {/* 3 Slots: 2 Presets + 1 ReceiptNote */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3.5" aria-label="送货单数据导入">
        {/* Preset 1: Product Master Data */}
        <Card id="productSlot" className="p-4 bg-white flex flex-col justify-between border-slate-200/90 shadow-xs">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-50 font-medium">
                  全局预设
                </Badge>
                <strong className="text-xs font-semibold text-slate-900">
                  商品主数据表
                </strong>
              </div>
              <p id="productMeta" className="text-[11px] text-zinc-400">
                已预设 {productPresetCount} 个商品条码与简称
              </p>
            </div>
            <Database className="h-4 w-4 text-zinc-400" />
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-zinc-100">
            <Button
              id="manageProductPresetBtn"
              variant="outline"
              size="sm"
              onClick={onOpenProductPreset}
              className="text-xs flex-1"
            >
              管理主数据
            </Button>
            <Button
              id="importProductPresetBtn"
              variant="ghost"
              size="sm"
              onClick={onImportProductPreset}
              className="text-xs text-zinc-500"
            >
              重新导入覆盖
            </Button>
          </div>
        </Card>

        {/* Preset 2: Warehouse Factory Data */}
        <Card id="warehousePresetSlot" className="p-4 bg-white flex flex-col justify-between">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-zinc-50 font-medium">
                  全局预设
                </Badge>
                <strong className="text-xs font-semibold text-zinc-900">
                  仓库与米厂对应表
                </strong>
              </div>
              <p id="warehousePresetMeta" className="text-[11px] text-zinc-400">
                已预设 {warehousePresetCount} 个仓库米厂关系
              </p>
            </div>
            <Building2 className="h-4 w-4 text-zinc-400" />
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-zinc-100">
            <Button
              id="manageWarehousePresetBtn"
              variant="outline"
              size="sm"
              onClick={onOpenWarehousePreset}
              className="text-xs flex-1"
            >
              管理主数据
            </Button>
            <Button
              id="importWarehousePresetBtn"
              variant="ghost"
              size="sm"
              onClick={onImportWarehousePreset}
              className="text-xs text-zinc-500"
            >
              重新导入覆盖
            </Button>
          </div>
        </Card>

        {/* Slot 3: ReceiptNote */}
        <Card
          id="receiptSlot"
          {...dropReceiptProps}
          className={`flex items-center justify-between p-4 transition-all ${
            dropReceiptProps.isDragging
              ? 'border-2 border-dashed border-zinc-950 bg-zinc-100/90 shadow-sm scale-[1.01]'
              : receipt
              ? 'border-zinc-400/80 bg-zinc-50/50'
              : 'bg-white hover:border-zinc-300'
          }`}
        >
          <div className="min-w-0 pr-3">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={receipt ? 'success' : 'default'} className="text-[10px] px-1.5 py-0">
                必需
              </Badge>
              <strong className="text-xs font-semibold text-zinc-900 truncate">
                ReceiptNote · 入库明细
              </strong>
            </div>
            <p id="receiptMeta" className="text-[11px] text-zinc-400 truncate" title={receipt ? receipt.fileName : '支持拖拽 Excel 到此处'}>
              {dropReceiptProps.isDragging
                ? '释放以导入入库明细'
                : receipt
                ? receipt.fileName
                : '支持拖拽 Excel 到此处'}
            </p>
          </div>
          <Button
            id="receiptBtn"
            variant={receipt ? 'outline' : 'secondary'}
            size="sm"
            onClick={() => onImportReceipt()}
          >
            <Upload className="h-3.5 w-3.5" />
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
      <section className="rounded-xl border border-zinc-200/80 bg-white p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">品牌与全局配置</h2>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              每个品牌单独生成一个 Excel；供应商名称会自动保存在本机。
            </p>
          </div>
          <span id="deliverySourceSummary" className="text-xs text-zinc-500 font-mono">
            {summaryText}
          </span>
        </div>

        {/* Brands selector chips */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-zinc-600">生成品牌</span>
            {availableBrands.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <Button
                  id="deliverySelectAllBrandsBtn"
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] text-zinc-500 hover:text-zinc-900"
                  onClick={() => onSelectAllBrands && onSelectAllBrands(availableBrands)}
                >
                  全选
                </Button>
                <span className="text-zinc-300">|</span>
                <Button
                  id="deliveryClearBrandsBtn"
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] text-zinc-500 hover:text-zinc-900"
                  onClick={() => onClearBrands && onClearBrands()}
                >
                  清空
                </Button>
              </div>
            )}
          </div>
          <div id="deliveryBrands" className="flex flex-wrap gap-2">
            {availableBrands.length === 0 ? (
              <span className="text-xs text-zinc-400">导入两份文件后显示品牌</span>
            ) : (
              availableBrands.map((b) => {
                const brandName = typeof b === 'string' ? b : b.name;
                const isSelected = selectedBrands.has(brandName);
                const count = typeof b === 'object' ? (b.rowCount ?? b.productCount) : null;
                return (
                  <button
                    key={brandName}
                    type="button"
                    onClick={() => onToggleBrand(brandName)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                    }`}
                  >
                    <span>{brandName}</span>
                    {count !== null && (
                      <span className="text-[10px] opacity-70 tabular-nums">({count})</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Warehouses selector chips */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-zinc-600">生成仓库</span>
            {availableWarehouses.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <Button
                  id="deliverySelectAllWarehousesBtn"
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] text-zinc-500 hover:text-zinc-900"
                  onClick={() => onSelectAllWarehouses && onSelectAllWarehouses(availableWarehouses)}
                >
                  全选
                </Button>
                <span className="text-zinc-300">|</span>
                <Button
                  id="deliveryClearWarehousesBtn"
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] text-zinc-500 hover:text-zinc-900"
                  onClick={() => onClearWarehouses && onClearWarehouses()}
                >
                  清空
                </Button>
              </div>
            )}
          </div>
          <div id="deliveryWarehouses" className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
            {availableWarehouses.length === 0 ? (
              <span className="text-xs text-zinc-400">导入两份文件后显示仓库</span>
            ) : (
              availableWarehouses.map((wh) => {
                const whName = typeof wh === 'string' ? wh : wh.name;
                const isSelected = selectedWarehouses.has(whName);
                const count = typeof wh === 'object' ? wh.rowCount : null;
                return (
                  <button
                    key={whName}
                    type="button"
                    onClick={() => onToggleWarehouse(whName)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                    }`}
                  >
                    <span>{whName}</span>
                    {count !== null && (
                      <span className="text-[10px] opacity-70 tabular-nums">({count})</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Form grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-zinc-100">
          <div>
            <label className="text-[11px] font-medium text-zinc-600 block mb-1">供应商名称</label>
            <Input
              id="supplierNameInput"
              value={supplierName}
              onChange={(e) => onUpdateDeliveryConfig('supplierName', e.target.value)}
              className="h-8 text-xs bg-zinc-50/50"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-zinc-600 block mb-1">保质期（天）</label>
            <Input
              id="shelfLifeInput"
              type="number"
              min="1"
              value={shelfLife}
              onChange={(e) => onUpdateDeliveryConfig('shelfLife', e.target.value)}
              className="h-8 text-xs bg-zinc-50/50"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-zinc-600 block mb-1">联系方式</label>
            <Input
              id="contactInput"
              value={contact}
              onChange={(e) => onUpdateDeliveryConfig('contact', e.target.value)}
              className="h-8 text-xs bg-zinc-50/50"
            />
          </div>
        </div>

        <div className="pt-2">
          <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs text-zinc-700">
            <Checkbox
              id="splitByWarehouseInput"
              checked={splitByWarehouse}
              onCheckedChange={(checked) => onUpdateDeliveryConfig('splitByWarehouse', Boolean(checked))}
            />
            <span className="font-medium">按仓库拆分为多个独立 Excel</span>
            <span className="text-zinc-400 text-[11px]">（勾选后每个仓库单独生成一个文件；不勾选时每个品牌一个工作簿）</span>
          </label>
        </div>
      </section>

      {/* Product Production Date Workspace */}
      <section className="rounded-xl border border-zinc-200/80 bg-white overflow-hidden shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border-b border-zinc-100 gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">商品生产日期</h2>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              生产日期选填；可通过商品简称或条码筛选，批量设置或清除日期。
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">已填写（选填）：</span>
            <strong id="datedProductCount" className="text-xs font-semibold px-2 py-0.5 rounded bg-zinc-100 text-zinc-800 font-mono">
              {datedCount} / {allProducts.length}
            </strong>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-zinc-50/50 border-b border-zinc-100">
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
              className="text-xs"
            >
              选择筛选结果 ({visibleProducts.length})
            </Button>
            <Button
              id="clearProductSelectionBtn"
              variant="ghost"
              size="sm"
              disabled={selectedProductKeys.size === 0}
              onClick={handleClearSelection}
              className="text-xs text-zinc-500"
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
                  disabled={selectedProductKeys.size === 0}
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
                  disabled={selectedProductKeys.size === 0}
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
                disabled={selectedProductKeys.size === 0}
                value={batchDate}
                onChange={(e) => setBatchDate(e.target.value)}
                className="h-8 text-xs w-36 bg-white"
              />
              <Button
                id="applyProductionDateBtn"
                variant="secondary"
                size="sm"
                disabled={selectedProductKeys.size === 0}
                onClick={handleApplyDate}
                className="text-xs"
              >
                应用/清除
              </Button>
            </div>
          </div>
        </div>

        {/* Product list */}
        <div className="max-h-[360px] overflow-y-auto">
          <div className="grid grid-cols-[50px_100px_1fr_160px_140px] bg-zinc-100/95 border-b border-zinc-200 p-2.5 text-xs font-semibold text-zinc-600 sticky top-0 z-10 shadow-xs backdrop-blur-xs">
            <span className="text-center">选择</span>
            <span>品牌</span>
            <span>商品名称</span>
            <span>条码</span>
            <span>生产日期</span>
          </div>

          <div id="deliveryProductList" className="divide-y divide-zinc-100">
            {visibleProducts.length === 0 ? (
              <div className="py-16 text-center text-xs text-zinc-400">
                导入两份源文件后，在这里配置生产日期
              </div>
            ) : (
              visibleProducts.map((p) => {
                const key = p.barcode || p.name || p.shortName;
                const displayName = p.name || p.shortName || p.sourceName || '-';
                const isSelected = selectedProductKeys.has(key);
                const curDate = productionDates[key] || '';

                return (
                  <div
                    key={`${key}-${p.brand}`}
                    className={`grid grid-cols-[50px_100px_1fr_160px_140px] items-center p-2.5 text-xs transition-colors ${
                      isSelected ? 'bg-zinc-100/70' : 'hover:bg-zinc-50'
                    }`}
                  >
                    <div className="flex justify-center">
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
                    <div>
                      {curDate ? (
                        <Badge variant="outline" className="font-mono text-[11px] bg-white">
                          {curDate}
                        </Badge>
                      ) : (
                        <span className="text-zinc-400 text-[11px]">未设置</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-3.5 bg-zinc-50/50 border-t border-zinc-100 text-xs">
          <div id="deliveryMetrics" className="flex items-center gap-4 text-zinc-600">
            <span><strong>{selectedBrands.size}</strong> 个品牌</span>
            <span><strong>{selectedWarehouses.size}</strong> 个仓库</span>
            <span><strong>{allProducts.length}</strong> 条明细</span>
          </div>
          <p id="deliveryExportHint" className="text-zinc-400 text-[11px]">
            完成文件导入和生产日期配置后即可生成送货单。
          </p>
        </div>
      </section>
    </main>
  );
}
