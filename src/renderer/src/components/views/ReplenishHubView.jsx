import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import React, { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { 
  Building2, 
  Package, 
  ShoppingCart, 
  Weight, 
  Upload, 
  Search, 
  AlertCircle,
  FileSpreadsheet,
  CheckCircle2,
  RefreshCw,
  Truck,
  ArrowRight,
  Layers,
  RotateCcw
} from 'lucide-react';
import { formatNumber, cn } from '@/lib/utils';
import { useFileDrop } from '@/lib/use-file-drop';

export function ReplenishHubView({
  // Step 1: Summary state & handlers
  table2,
  table1,
  onImportTable2,
  onImportTable1,
  brands = [],
  selectedBrand,
  onBrandChange,
  mappingCount = 0,
  productCatalogCount = 0,
  statsWarehouseCount = 0,
  isHubMode = false,
  onOpenMapping,
  onOpenWarehousePreset,
  onOpenProductCatalog,
  summaryNotice,
  result,
  onActualOrderChange,
  onWarehouseStatusChange,
  onSummaryExport,
  onSummaryDemand,
  onSummaryBackfill,

  // Step 2: Inventory state & handlers
  inventoryState,
  onImportTable3,
  onImportLiveInventory,
  onImportTransit,
  onExportInventory,
  inventoryNotice,
  pipedFromSummary = false,
  onPipeToInventory,
  onClearPipedTable3,
}) {
  const [activeStep, setActiveStep] = useState('summary'); // 'summary' | 'inventory'
  const [search, setSearch] = useState('');
  const [inventorySearch, setInventorySearch] = useState('');

  // Drop props for Step 1
  const { isDragging: isDraggingT2, dropProps: dropT2Props } = useFileDrop((path) => onImportTable2(path), { allowMultiple: false });
  const { isDragging: isDraggingT1, dropProps: dropT1Props } = useFileDrop((path) => onImportTable1(path), { allowMultiple: false });

  // Drop props for Step 2
  const dropTable3Props = useFileDrop({
    onFilesDropped: (paths) => {
      if (paths.length > 0) onImportTable3(paths[0]);
    },
  });

  const dropLiveProps = useFileDrop({
    onFilesDropped: (paths) => {
      if (paths.length > 0) onImportLiveInventory(paths);
    },
  });

  const dropTransitProps = useFileDrop({
    onFilesDropped: (paths) => {
      if (paths.length > 0) onImportTransit(paths[0]);
    },
  });

  // Step 1 Metrics
  const summaryMetrics = useMemo(() => {
    if (!result?.stats) {
      return { warehouses: 0, products: 0, rows: 0, orders: 0, weight: 0 };
    }
    const { stats } = result;
    return {
      warehouses: stats.warehouseCount || 0,
      products: stats.productCount || 0,
      rows: stats.detailRows || 0,
      orders: stats.systemOrders || 0,
      weight: stats.weight || 0,
    };
  }, [result]);

  // Step 1 display rows
  const displaySummaryRows = useMemo(() => {
    if (!result?.rows || !result?.summaries) return [];
    const q = search.trim().toLowerCase();
    const rows = [];
    result.summaries.forEach((summary) => {
      const groupRows = result.rows.filter(
        (row) =>
          row.warehouse === summary.warehouse &&
          (!q || row.warehouse.toLowerCase().includes(q) || row.product.toLowerCase().includes(q))
      );
      if (!groupRows.length) return;
      groupRows.forEach((row) => rows.push({ ...row, isSubtotal: false }));
      rows.push({
        isSubtotal: true,
        warehouse: summary.warehouse,
        systemOrder: summary.systemOrder,
        weight: summary.weight,
        actualOrder: summary.actualOrder,
        actualWeight: summary.actualWeight,
        arrangement: summary.arrangement,
      });
    });
    return rows;
  }, [result, search]);

  // Step 2 Metrics
  const { table3, inventories = [], transit, analysis: invAnalysis } = inventoryState;
  const invMetrics = useMemo(() => {
    if (!invAnalysis) {
      return { targetRows: 0, matched: 0, preserved: 0, ignored: 0, transitOrders: 0 };
    }
    return {
      targetRows: invAnalysis.targetRows ?? invAnalysis.targetRowCount ?? 0,
      matched: invAnalysis.matchedRows ?? invAnalysis.matchedCount ?? 0,
      preserved: invAnalysis.preservedRows ?? invAnalysis.preservedCount ?? 0,
      ignored: invAnalysis.ignoredInventoryRows ?? 0,
      transitOrders: invAnalysis.hasTransit
        ? (invAnalysis.transitTotal ?? 0)
        : (invAnalysis.matchedTransitRows ?? invAnalysis.transitOrderCount ?? 0),
    };
  }, [invAnalysis]);

  const displayInventoryRows = invAnalysis?.previewRows || invAnalysis?.updates || [];
  const filteredInvRows = useMemo(() => {
    if (!inventorySearch.trim()) return displayInventoryRows;
    const q = inventorySearch.trim().toLowerCase();
    return displayInventoryRows.filter(
      (r) =>
        (r.warehouse || '').toLowerCase().includes(q) ||
        (r.product || '').toLowerCase().includes(q)
    );
  }, [displayInventoryRows, inventorySearch]);

  const handlePipeAndSwitch = () => {
    onPipeToInventory();
    setActiveStep('inventory');
  };

  return (
    <main className="flex-1 p-6 flex flex-col gap-5 overflow-y-auto select-none bg-zinc-50/50">
      {/* 1. PIPELINE STEP NAVIGATION TABS - Black & White */}
      <div className="bg-white rounded-2xl border border-zinc-200/90 p-2.5 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Step 1 Button */}
          <Button variant="ghost" size="unstyled"
            type="button"
            onClick={() => setActiveStep('summary')}
            className={cn(
              "flex items-center gap-3 px-4 py-2 rounded-xl transition-all text-xs cursor-pointer",
              activeStep === 'summary'
                ? "bg-zinc-100 text-zinc-950 font-semibold border border-zinc-300 shadow-xs"
                : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 font-medium"
            )}
          >
            <div className={cn(
              "size-6 rounded-lg flex items-center justify-center text-xs font-bold",
              activeStep === 'summary' ? "bg-zinc-900 text-white" : "bg-zinc-200 text-zinc-700"
            )}>
              1
            </div>
            <div className="text-left">
              <div className="font-semibold text-zinc-950 flex items-center gap-1.5">
                步骤一：补货需求合并计算
                {Boolean(result?.rows?.length) && (
                  <span className="size-1.5 rounded-full bg-zinc-900" />
                )}
              </div>
              <div className="text-[10px] text-zinc-500 font-normal">
                导入表一与表二 · 自动折算箱数与吨数
              </div>
            </div>
          </Button>

          <ArrowRight className="size-3.5 text-zinc-400 shrink-0" />

          {/* Step 2 Button */}
          <Button variant="ghost" size="unstyled"
            type="button"
            onClick={() => setActiveStep('inventory')}
            className={cn(
              "flex items-center gap-3 px-4 py-2 rounded-xl transition-all text-xs cursor-pointer",
              activeStep === 'inventory'
                ? "bg-zinc-100 text-zinc-950 font-semibold border border-zinc-300 shadow-xs"
                : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 font-medium"
            )}
          >
            <div className={cn(
              "size-6 rounded-lg flex items-center justify-center text-xs font-bold",
              activeStep === 'inventory' ? "bg-zinc-900 text-white" : "bg-zinc-200 text-zinc-700"
            )}>
              2
            </div>
            <div className="text-left">
              <div className="font-semibold text-zinc-950 flex items-center gap-1.5">
                步骤二：实时库存与在途校准
                {Boolean(invAnalysis?.canExport) && (
                  <span className="size-1.5 rounded-full bg-zinc-900" />
                )}
              </div>
              <div className="text-[10px] text-zinc-500 font-normal">
                校准 WMS 实时良品可用 · 挂接库存在途
              </div>
            </div>
          </Button>
        </div>

        {/* Quick hint on right */}
        <div className="text-xs text-zinc-600 pr-3 flex items-center gap-2">
          {activeStep === 'summary' && result?.rows?.length > 0 && (
            <Button
              size="sm"
              onClick={handlePipeAndSwitch}
              className="text-xs h-8 bg-zinc-900 hover:bg-zinc-800 text-white font-medium cursor-pointer shadow-xs"
            >
              联动下一步：校准库存与在途
            </Button>
          )}
          {activeStep === 'inventory' && pipedFromSummary && (
            <Badge variant="outline" className="bg-zinc-100 text-zinc-900 border-zinc-300 font-medium">
              已由步骤一直接带入表三
            </Badge>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VIEW FOR STEP 1: SUMMARY */}
      {/* ========================================================================= */}
      {activeStep === 'summary' && (
        <div className="flex flex-col gap-5">
          {/* File Upload Strip - Black & White */}
          <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1.2fr_220px] gap-4">
            {/* Table 2 Slot */}
            <Card
              id="table2Slot"
              {...dropT2Props}
              className={cn(
                "flex items-center justify-between p-4 transition-all rounded-xl border-2 border-dashed",
                isDraggingT2
                  ? "border-zinc-900 bg-zinc-100 shadow-xs scale-[1.01]"
                  : table2
                  ? "border-zinc-400 bg-zinc-50/70"
                  : "bg-white hover:border-zinc-300 border-zinc-200"
              )}
            >
              <div className="min-w-0 pr-3">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={table2 ? "default" : "outline"} className="text-[10px] px-1.5 py-0 font-medium">
                    必需
                  </Badge>
                  <strong className="text-xs font-semibold text-zinc-950 truncate">
                    表二 · 库存数据
                  </strong>
                </div>
                <p id="table2Meta" className="text-xs text-zinc-500 truncate max-w-xs">
                  {table2 ? `${table2.fileName} (${table2.rows.length} 行)` : isDraggingT2 ? '释放以导入表二' : '支持拖拽 Excel 到此处'}
                </p>
              </div>
              <Button
                id="table2Btn"
                variant={table2 ? "outline" : "default"}
                size="sm"
                onClick={() => onImportTable2()}
                className={cn(
                  "text-xs h-8 shrink-0 cursor-pointer",
                  !table2 ? "bg-zinc-900 hover:bg-zinc-800 text-white" : "border-zinc-200 text-zinc-800"
                )}
              >
                <Upload className="size-3.5 mr-1" />
                {table2 ? '更换文件' : '选择文件'}
              </Button>
            </Card>

            {/* Table 1 Slot */}
            <Card
              id="table1Slot"
              {...dropT1Props}
              className={cn(
                "flex items-center justify-between p-4 transition-all rounded-xl border-2 border-dashed",
                isDraggingT1
                  ? "border-zinc-900 bg-zinc-100 shadow-xs scale-[1.01]"
                  : table1
                  ? "border-zinc-400 bg-zinc-50/70"
                  : "bg-white hover:border-zinc-300 border-zinc-200"
              )}
            >
              <div className="min-w-0 pr-3">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-zinc-600 border-zinc-200">
                    可选
                  </Badge>
                  <strong className="text-xs font-semibold text-zinc-950 truncate">
                    表一 · 待发订单
                  </strong>
                </div>
                <p id="table1Meta" className="text-xs text-zinc-500 truncate max-w-xs">
                  {table1 ? `${table1.fileName} (${table1.rows.length} 行)` : isDraggingT1 ? '释放以导入表一' : '支持拖拽 Excel 到此处'}
                </p>
              </div>
              <Button
                id="table1Btn"
                variant={table1 ? "outline" : "default"}
                size="sm"
                onClick={() => onImportTable1()}
                className={cn(
                  "text-xs h-8 shrink-0 cursor-pointer",
                  !table1 ? "bg-zinc-900 hover:bg-zinc-800 text-white" : "border-zinc-200 text-zinc-800"
                )}
              >
                <Upload className="size-3.5 mr-1" />
                {table1 ? '更换文件' : '选择文件'}
              </Button>
            </Card>

            {/* Target Brand & Rule Config Slot */}
            <Card className="flex flex-col justify-between p-4 bg-white border border-zinc-200/90 rounded-xl">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <strong className="text-xs font-semibold text-zinc-950">目标计算品牌</strong>
                  <span className="text-[11px] text-zinc-500">
                    {brands.length ? `${brands.length} 个候选` : '自动识别'}
                  </span>
                </div>
                <Select value={String((selectedBrand) ?? '') || '__none__'} onValueChange={value => onBrandChange((value === '__none__' ? '' : value))} disabled={!brands.length}>
                      <SelectTrigger id="brandSelect" className="h-8 w-full text-xs"><SelectValue placeholder="请选择" /></SelectTrigger>
                      <SelectContent><SelectGroup>
                  {brands.length ? (
                    brands.map((b) => (
                      <SelectItem key={b} value={String(b)}>{b}</SelectItem>
                    ))
                  ) : (
                    <SelectItem value="__none__">导入表二后可选</SelectItem>
                  )}
                </SelectGroup></SelectContent>
                    </Select>
                {isHubMode && (
                  <div className="mt-2 px-2 py-1 bg-amber-50/80 border border-amber-200/90 rounded-md text-[11px] text-amber-900 flex items-center justify-between">
                    <span className="font-medium">集货模式：武汉商超仓 + 武汉集货仓（汇总其余所有仓）</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-zinc-100 text-[11px] gap-2">
                <Button variant="ghost" size="unstyled"
                  type="button"
                  onClick={onOpenMapping}
                  className="text-zinc-900 hover:underline font-medium cursor-pointer"
                >
                  仓库映射 {mappingCount > 0 && `(${mappingCount}待处理)`}
                </Button>
                <Button variant="ghost" size="unstyled"
                  type="button"
                  onClick={onOpenWarehousePreset}
                  className="text-zinc-900 font-semibold hover:underline cursor-pointer flex items-center gap-1"
                >
                  {isHubMode ? '统计仓库 (2仓·集货汇总)' : `统计仓库 (${statsWarehouseCount || 0}个)`}
                </Button>
                <Button variant="ghost" size="unstyled"
                  type="button"
                  onClick={onOpenProductCatalog}
                  className="text-zinc-600 hover:text-zinc-900 cursor-pointer"
                >
                  商品目录排序
                </Button>
              </div>
            </Card>
          </div>

          {/* Notice Alert */}
          {summaryNotice && (
            <div
              className={cn(
                "p-3 rounded-xl border text-xs flex items-center gap-2.5",
                summaryNotice.type === 'error'
                  ? "bg-red-50 text-red-800 border-red-200"
                  : "bg-zinc-100 text-zinc-800 border-zinc-300"
              )}
            >
              <AlertCircle className="size-4 shrink-0" />
              <span>{summaryNotice.message}</span>
            </div>
          )}

          {/* KPI Stat Cards - Black & White */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4 bg-white border border-zinc-200/90 rounded-xl shadow-xs">
              <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
                <Building2 className="size-3.5 text-zinc-600" />
                <span>覆盖配送仓库</span>
              </div>
              <div className="text-2xl font-bold text-zinc-950 mt-1 tracking-tight">
                {summaryMetrics.warehouses} <span className="text-xs font-normal text-zinc-500">个</span>
              </div>
            </Card>

            <Card className="p-4 bg-white border border-zinc-200/90 rounded-xl shadow-xs">
              <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
                <Package className="size-3.5 text-zinc-600" />
                <span>涉及商品品项</span>
              </div>
              <div className="text-2xl font-bold text-zinc-950 mt-1 tracking-tight">
                {summaryMetrics.products} <span className="text-xs font-normal text-zinc-500">款 SKU</span>
              </div>
            </Card>

            <Card className="p-4 bg-white border border-zinc-200/90 rounded-xl shadow-xs">
              <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
                <ShoppingCart className="size-3.5 text-zinc-900" />
                <span>汇总订货总量</span>
              </div>
              <div className="text-2xl font-bold text-zinc-950 mt-1 tracking-tight">
                {formatNumber(summaryMetrics.orders)} <span className="text-xs font-normal text-zinc-500">箱</span>
              </div>
            </Card>

            <Card className="p-4 bg-white border border-zinc-200/90 rounded-xl shadow-xs">
              <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
                <Weight className="size-3.5 text-zinc-600" />
                <span>预估发运总重</span>
              </div>
              <div className="text-2xl font-bold text-zinc-950 mt-1 tracking-tight">
                {(summaryMetrics.weight / 1000).toFixed(2)} <span className="text-xs font-normal text-zinc-500">吨</span>
              </div>
            </Card>
          </div>

          {/* Data Grid Preview */}
          <div className="bg-white rounded-2xl border border-zinc-200/90 shadow-xs overflow-hidden">
            <div className="p-3.5 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/60">
              <div className="flex items-center gap-3">
                <h3 className="text-xs font-semibold text-zinc-950">
                  补货计算结果明细与小计预览
                </h3>
                <span className="text-xs text-zinc-500 font-medium">
                  共 {displaySummaryRows.length} 行数据
                </span>
              </div>
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-zinc-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索仓库或商品..."
                  className="pl-8 text-xs h-8 bg-white border-zinc-200 focus:border-zinc-900"
                />
              </div>
            </div>

            <div className="overflow-auto max-h-[380px]">
              <Table className="text-xs">
                <TableHeader className="bg-zinc-100 sticky top-0 z-10 text-zinc-700 font-medium text-[11px]">
                  <TableRow>
                    <TableHead className="w-36">配送仓库</TableHead>
                    <TableHead>商品简称</TableHead>
                    <TableHead className="w-24 text-right">良品可用</TableHead>
                    <TableHead className="w-24 text-right font-semibold text-zinc-950">系统订单(箱)</TableHead>
                    <TableHead className="w-28 text-right font-semibold text-zinc-950">实调订货安排</TableHead>
                    <TableHead className="w-20 text-right">单件重(kg)</TableHead>
                    <TableHead className="w-24 text-right">预估重量(kg)</TableHead>
                    <TableHead className="w-28 text-center">分仓处理状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displaySummaryRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-zinc-500">
                        {table2 ? '未匹配到符合搜索条件的数据' : '请在上方导入表二（库存数据）开始计算'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    displaySummaryRows.map((row, idx) => {
                      if (row.isSubtotal) {
                        return (
                          <TableRow key={`subtotal-${idx}`} className="bg-zinc-100/90 font-semibold border-t border-zinc-300 text-zinc-950">
                            <TableCell className="text-zinc-950 font-bold">
                              {row.warehouse} [小计]
                            </TableCell>
                            <TableCell className="text-zinc-500 text-[11px]">-</TableCell>
                            <TableCell className="text-right text-zinc-500">-</TableCell>
                            <TableCell className="text-right tabular-nums text-zinc-950 font-bold">
                              {formatNumber(row.systemOrder)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-zinc-950 font-bold">
                              {formatNumber(row.actualOrder)}
                            </TableCell>
                            <TableCell className="text-right">-</TableCell>
                            <TableCell className="text-right tabular-nums text-zinc-950 font-bold">
                              {formatNumber(row.actualWeight || row.weight)}
                            </TableCell>
                            <TableCell className="text-center">
                              <Select value={String((row.arrangement || '') ?? '') || '__none__'} onValueChange={value => onWarehouseStatusChange(row.warehouse, (value === '__none__' ? '' : value))}>
                      <SelectTrigger className="h-8 w-full text-xs" aria-label="安排状态"><SelectValue placeholder="请选择" /></SelectTrigger>
                      <SelectContent><SelectGroup>
                                <SelectItem value="__none__">正常安排</SelectItem>
                                <SelectItem value="取消">取消整仓</SelectItem>
                                <SelectItem value="延期">延期发货</SelectItem>
                              </SelectGroup></SelectContent>
                    </Select>
                            </TableCell>
                          </TableRow>
                        );
                      }

                      return (
                        <TableRow key={`row-${idx}`} className="hover:bg-zinc-50 transition-colors">
                          <TableCell className="font-medium text-zinc-900">{row.warehouse}</TableCell>
                          <TableCell className="text-zinc-800">{row.product}</TableCell>
                          <TableCell className="text-right tabular-nums text-zinc-600">
                            {formatNumber(row.availableStock ?? 0)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold text-zinc-900">
                            {formatNumber(row.systemOrder ?? 0)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min="0"
                              value={row.actualOrder ?? row.systemOrder ?? 0}
                              onChange={(e) => onActualOrderChange(row.id, e.target.value)}
                              className="w-20 text-right text-xs font-semibold text-zinc-950 border border-zinc-300 rounded px-1.5 py-0.5 focus:border-zinc-900 outline-none"
                            />
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-zinc-600">{row.specWeight || '-'}</TableCell>
                          <TableCell className="text-right tabular-nums text-zinc-700">{formatNumber(row.weight || 0)}</TableCell>
                          <TableCell className="text-center">
                            <span className="text-[10px] bg-zinc-100 text-zinc-700 px-1.5 py-0.5 rounded border border-zinc-200">正常</span>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW FOR STEP 2: INVENTORY SYNC */}
      {/* ========================================================================= */}
      {activeStep === 'inventory' && (
        <div className="flex flex-col gap-5">
          {/* File Upload Strip - Black & White */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Table 3 Slot */}
            <Card
              {...dropTable3Props}
              className={cn(
                "p-4 rounded-xl border-2 border-dashed flex items-center justify-between transition-all",
                table3
                  ? "border-zinc-400 bg-zinc-50/70"
                  : "border-zinc-200 bg-white hover:border-zinc-300"
              )}
            >
              <div className="min-w-0 pr-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Badge variant={table3 ? "default" : "outline"} className="text-[10px] px-1.5 py-0 font-medium">
                    基准表三
                  </Badge>
                  <strong className="text-xs font-semibold text-zinc-950">
                    {pipedFromSummary ? '步骤一计算生成表三' : '目标表三'}
                  </strong>
                </div>
                <p className="text-xs text-zinc-500 truncate max-w-xs">
                  {table3 ? table3.fileName : '支持拖入表三 Excel'}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {pipedFromSummary && (
                  <Button variant="ghost" size="sm" onClick={onClearPipedTable3} className="text-xs h-8 text-zinc-600 hover:text-zinc-950">
                    重置
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => onImportTable3()} className="text-xs h-8 cursor-pointer border-zinc-200">
                  <Upload className="size-3 mr-1" />
                  {table3 ? '更换' : '上传'}
                </Button>
              </div>
            </Card>

            {/* Live Inventory Slot */}
            <Card
              {...dropLiveProps}
              className={cn(
                "p-4 rounded-xl border-2 border-dashed flex items-center justify-between transition-all",
                inventories.length
                  ? "border-zinc-400 bg-zinc-50/70"
                  : "border-zinc-200 bg-white hover:border-zinc-300"
              )}
            >
              <div className="min-w-0 pr-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Badge variant={inventories.length ? "default" : "outline"} className="text-[10px] px-1.5 py-0 text-zinc-700">
                    {inventories.length ? `${inventories.length} 份文件` : '至少其一'}
                  </Badge>
                  <strong className="text-xs font-semibold text-zinc-950">实时库存 (良品)</strong>
                </div>
                <p className="text-xs text-zinc-500 truncate max-w-xs">
                  {inventories.length
                    ? inventories.map((i) => i.fileName).join('; ')
                    : '支持拖入 1 份或多份 WMS 实时库存'}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => onImportLiveInventory()} className="text-xs h-8 cursor-pointer border-zinc-200">
                <Upload className="size-3 mr-1" />
                {inventories.length ? '加选/更换' : '上传'}
              </Button>
            </Card>

            {/* Transit Slot */}
            <Card
              {...dropTransitProps}
              className={cn(
                "p-4 rounded-xl border-2 border-dashed flex items-center justify-between transition-all",
                transit
                  ? "border-zinc-400 bg-zinc-50/70"
                  : "border-zinc-200 bg-white hover:border-zinc-300"
              )}
            >
              <div className="min-w-0 pr-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Badge variant={transit ? "default" : "outline"} className="text-[10px] px-1.5 py-0 text-zinc-600">
                    可选
                  </Badge>
                  <strong className="text-xs font-semibold text-zinc-950">库存在途明细</strong>
                </div>
                <p className="text-xs text-zinc-500 truncate max-w-xs">
                  {transit ? transit.fileName : '支持拖入库存在途明细'}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => onImportTransit()} className="text-xs h-8 cursor-pointer border-zinc-200">
                <Upload className="size-3 mr-1" />
                {transit ? '更换' : '上传'}
              </Button>
            </Card>
          </div>

          {/* Notice Alert */}
          {inventoryNotice && (
            <div className="p-3 rounded-xl border border-red-200 bg-red-50 text-red-800 text-xs flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{inventoryNotice.message}</span>
            </div>
          )}

          {/* KPI Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4 bg-white border border-zinc-200/90 rounded-xl shadow-xs">
              <div className="text-xs text-zinc-500 font-medium">目标待校准条目</div>
              <div className="text-2xl font-bold text-zinc-950 mt-1 tabular-nums">
                {invMetrics.targetRows} <span className="text-xs font-normal text-zinc-500">条</span>
              </div>
            </Card>

            <Card className="p-4 bg-white border border-zinc-200/90 rounded-xl shadow-xs">
              <div className="text-xs text-zinc-500 font-medium">成功匹配更新良品</div>
              <div className="text-2xl font-bold text-zinc-950 mt-1 tabular-nums">
                {invMetrics.matched} <span className="text-xs font-normal text-zinc-500">条</span>
              </div>
            </Card>

            <Card className="p-4 bg-white border border-zinc-200/90 rounded-xl shadow-xs">
              <div className="text-xs text-zinc-500 font-medium">保留原值 (未匹配)</div>
              <div className="text-2xl font-bold text-zinc-950 mt-1 tabular-nums">
                {invMetrics.preserved} <span className="text-xs font-normal text-zinc-500">条</span>
              </div>
            </Card>

            <Card className="p-4 bg-white border border-zinc-200/90 rounded-xl shadow-xs">
              <div className="text-xs text-zinc-500 font-medium">在途挂接总量</div>
              <div className="text-2xl font-bold text-zinc-950 mt-1 tabular-nums">
                {formatNumber(invMetrics.transitOrders)} <span className="text-xs font-normal text-zinc-500">件</span>
              </div>
            </Card>
          </div>

          {/* Preview Grid */}
          <div className="bg-white rounded-2xl border border-zinc-200/90 shadow-xs overflow-hidden">
            <div className="p-3.5 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/60">
              <div className="flex items-center gap-3">
                <h3 className="text-xs font-semibold text-zinc-950">
                  良品库存与在途校验明细预览
                </h3>
                <span className="text-xs text-zinc-500 font-medium">
                  共 {filteredInvRows.length} 条对比
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative w-56">
                  <Search className="absolute left-2.5 top-2.5 size-3.5 text-zinc-400" />
                  <Input
                    value={inventorySearch}
                    onChange={(e) => setInventorySearch(e.target.value)}
                    placeholder="过滤仓库或商品..."
                    className="pl-8 text-xs h-8 bg-white border-zinc-200 focus:border-zinc-900"
                  />
                </div>
                <Button
                  size="sm"
                  disabled={!invAnalysis?.canExport}
                  onClick={onExportInventory}
                  className="text-xs h-8 bg-zinc-900 hover:bg-zinc-800 text-white font-medium cursor-pointer shadow-xs"
                >
                  <RefreshCw className="size-3 mr-1" />
                  导出更新表三
                </Button>
              </div>
            </div>

            <div className="overflow-auto max-h-[380px]">
              <Table className="text-xs">
                <TableHeader className="bg-zinc-100 sticky top-0 z-10 text-zinc-700 font-medium text-[11px]">
                  <TableRow>
                    <TableHead>仓库名称</TableHead>
                    <TableHead>货品名称</TableHead>
                    <TableHead className="text-right w-28">旧良品可用</TableHead>
                    <TableHead className="text-right w-28 font-semibold text-zinc-950">更新后良品可用</TableHead>
                    <TableHead className="text-right w-28">挂接在途数量</TableHead>
                    <TableHead className="text-center w-24">校验匹配状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-zinc-500">
                        {table3 ? '尚未导入实时库存或在途明细' : '请先在上方导入目标表三，或从步骤一直接点击联动'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredInvRows.map((r, idx) => (
                      <TableRow key={idx} className="hover:bg-zinc-50 transition-colors">
                        <TableCell className="font-medium text-zinc-950">{r.warehouse}</TableCell>
                        <TableCell className="text-zinc-800">{r.product}</TableCell>
                        <TableCell className="text-right tabular-nums text-zinc-600">{r.oldAvailable ?? '-'}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold text-zinc-950">
                          {r.newAvailable ?? r.matchedStock ?? '-'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-zinc-700">{r.transitQty ?? '-'}</TableCell>
                        <TableCell className="text-center">
                          <span className="text-[10px] bg-zinc-100 text-zinc-800 px-1.5 py-0.5 rounded font-medium border border-zinc-200">
                            已校准
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
