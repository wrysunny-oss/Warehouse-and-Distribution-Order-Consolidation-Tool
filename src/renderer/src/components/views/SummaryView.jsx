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
  Layers, 
  ShoppingCart, 
  Weight, 
  Upload, 
  Search, 
  AlertCircle,
  FileSpreadsheet,
  CheckCircle2
} from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { useFileDrop } from '@/lib/use-file-drop';

export function SummaryView({
  table2,
  table1,
  onImportTable2,
  onImportTable1,
  brands = [],
  selectedBrand,
  onBrandChange,
  mappingCount = 0,
  productCatalogCount = 0,
  onOpenMapping,
  onOpenProductCatalog,
  notice,
  result,
  onActualOrderChange,
  onWarehouseStatusChange,
}) {
  const [search, setSearch] = useState('');

  const { isDragging: isDraggingT2, dropProps: dropT2Props } = useFileDrop((path) => onImportTable2(path), { allowMultiple: false });
  const { isDragging: isDraggingT1, dropProps: dropT1Props } = useFileDrop((path) => onImportTable1(path), { allowMultiple: false });

  const metrics = useMemo(() => {
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

  const displayRows = useMemo(() => {
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

  return (
    <main id="summaryView" className="flex-1 p-6 space-y-5">
      {/* Control Strip */}
      <section className="grid grid-cols-1 md:grid-cols-[1.2fr_1.2fr_200px_160px] gap-3.5 items-stretch" aria-label="数据导入">
        {/* Table 2 Slot */}
        <Card
          id="table2Slot"
          {...dropT2Props}
          className={`flex items-center justify-between p-4 transition-all ${
            isDraggingT2
              ? 'border-2 border-dashed border-zinc-950 bg-zinc-100/90 shadow-sm scale-[1.01]'
              : table2
              ? 'border-zinc-400/80 bg-zinc-50/50'
              : 'bg-white hover:border-zinc-300'
          }`}
        >
          <div className="min-w-0 pr-3">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={table2 ? 'success' : 'default'} className="text-[10px] px-1.5 py-0">
                必需
              </Badge>
              <strong className="text-xs font-semibold text-zinc-900 truncate">
                表二 · 库存数据
              </strong>
            </div>
            <p id="table2Meta" className="text-[11px] text-zinc-400 truncate max-w-xs" title={table2 ? table2.fileName : '支持点击或拖拽文件到此处'}>
              {table2 ? `${table2.fileName} (${table2.rows.length} 行)` : isDraggingT2 ? '释放以导入表二' : '支持拖拽 Excel 到此处'}
            </p>
          </div>
          <Button
            id="table2Btn"
            variant={table2 ? 'outline' : 'secondary'}
            size="sm"
            onClick={() => onImportTable2()}
          >
            <Upload className="h-3.5 w-3.5" />
            {table2 ? '重新选择' : '选择文件'}
          </Button>
        </Card>

        {/* Table 1 Slot */}
        <Card
          id="table1Slot"
          {...dropT1Props}
          className={`flex items-center justify-between p-4 transition-all ${
            isDraggingT1
              ? 'border-2 border-dashed border-zinc-950 bg-zinc-100/90 shadow-sm scale-[1.01]'
              : table1
              ? 'border-zinc-400/80 bg-zinc-50/50'
              : 'bg-white hover:border-zinc-300'
          }`}
        >
          <div className="min-w-0 pr-3">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                可选
              </Badge>
              <strong className="text-xs font-semibold text-zinc-900 truncate">
                表一 · 订单数据
              </strong>
            </div>
            <p id="table1Meta" className="text-[11px] text-zinc-400 truncate max-w-xs" title={table1 ? table1.fileName : '不导入也可生成库存汇总，支持拖拽'}>
              {table1 ? `${table1.fileName} (${table1.rows.length} 行)` : isDraggingT1 ? '释放以导入表一' : '不导入也可生成汇总，支持拖拽'}
            </p>
          </div>
          <Button
            id="table1Btn"
            variant="outline"
            size="sm"
            onClick={() => onImportTable1()}
          >
            <Upload className="h-3.5 w-3.5" />
            {table1 ? '重新选择' : '选择文件'}
          </Button>
        </Card>

        {/* Brand Selector */}
        <Card className="flex flex-col justify-center p-3 bg-white">
          <label htmlFor="brandSelect" className="text-[11px] font-medium text-zinc-500 mb-1">
            汇总品牌
          </label>
          <select
            id="brandSelect"
            disabled={!table2 || brands.length === 0}
            value={selectedBrand}
            onChange={(e) => onBrandChange(e.target.value)}
            className="h-8 rounded-md border border-zinc-200 bg-white px-2.5 text-xs text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-950 disabled:opacity-50"
          >
            {!table2 ? (
              <option>请先导入表二</option>
            ) : (
              brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))
            )}
          </select>
        </Card>

        {/* Auxiliary actions */}
        <div className="flex flex-col gap-2">
          <Button
            id="productCatalogBtn"
            variant="outline"
            size="sm"
            disabled={!table2}
            onClick={onOpenProductCatalog}
            className="h-full justify-between px-3 text-xs"
          >
            <span>商品清单</span>
            <span id="productCatalogCount" className="text-[10px] text-zinc-500 font-mono">
              {productCatalogCount > 0 ? `${productCatalogCount}项` : ''}
            </span>
          </Button>
          <Button
            id="mappingBtn"
            variant="outline"
            size="sm"
            disabled={!table2}
            onClick={onOpenMapping}
            className="h-full justify-between px-3 text-xs"
          >
            <span>仓库映射</span>
            <span id="mappingCount" className="text-[10px] text-zinc-500 font-mono">
              {mappingCount > 0 ? `${mappingCount}项` : ''}
            </span>
          </Button>
        </div>
      </section>

      {/* Notice alert */}
      {notice && (
        <section
          id="notice"
          role="status"
          className={`flex items-center gap-2.5 p-3 rounded-lg text-xs font-medium border ${
            notice.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{notice.message}</span>
        </section>
      )}

      {/* KPI Metrics */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-3" aria-label="汇总概览">
        <Card className="p-3.5 bg-white">
          <div className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1.5">
            <Building2 className="h-3.5 w-3.5 text-zinc-400" />
            <span>直营仓</span>
          </div>
          <strong id="warehouseMetric" className="text-xl font-bold tracking-tight text-zinc-900 tabular-nums">
            {metrics.warehouses}
          </strong>
        </Card>

        <Card className="p-3.5 bg-white">
          <div className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1.5">
            <Package className="h-3.5 w-3.5 text-zinc-400" />
            <span>货品</span>
          </div>
          <strong id="productMetric" className="text-xl font-bold tracking-tight text-zinc-900 tabular-nums">
            {metrics.products}
          </strong>
        </Card>

        <Card className="p-3.5 bg-white">
          <div className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1.5">
            <Layers className="h-3.5 w-3.5 text-zinc-400" />
            <span>明细行</span>
          </div>
          <strong id="rowMetric" className="text-xl font-bold tracking-tight text-zinc-900 tabular-nums">
            {metrics.rows}
          </strong>
        </Card>

        <Card className="p-3.5 bg-zinc-900 text-white shadow-xs">
          <div className="flex items-center gap-1.5 text-zinc-400 text-xs mb-1.5">
            <ShoppingCart className="h-3.5 w-3.5 text-zinc-300" />
            <span>系统订单</span>
          </div>
          <strong id="orderMetric" className="text-xl font-bold tracking-tight text-white tabular-nums">
            {formatNumber(metrics.orders)}
          </strong>
        </Card>

        <Card className="p-3.5 bg-white">
          <div className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1.5">
            <Weight className="h-3.5 w-3.5 text-zinc-400" />
            <span>订单重量（吨）</span>
          </div>
          <strong id="weightMetric" className="text-xl font-bold tracking-tight text-zinc-900 tabular-nums">
            {formatNumber(metrics.weight, 3)}
          </strong>
        </Card>
      </section>

      {/* Table 3 Preview Workspace */}
      <section className="rounded-xl border border-zinc-200/80 bg-white overflow-hidden shadow-xs">
        <div className="flex items-center justify-between p-4 border-b border-zinc-100">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">表三预览</h2>
            <p id="previewHelp" className="text-[11px] text-zinc-400 mt-0.5">
              导入表二后生成预览。实际订单安排可直接在单元格内编辑。
            </p>
          </div>

          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <Input
              id="searchInput"
              type="search"
              placeholder="筛选仓库或货品名称..."
              disabled={!result}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs bg-zinc-50/50"
            />
          </div>
        </div>

        {!result ? (
          <div id="emptyState" className="flex flex-col items-center justify-center py-24 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500 mb-4 border border-zinc-200/60">
              <FileSpreadsheet className="h-7 w-7 stroke-[1.5]" />
            </div>
            <h3 className="text-sm font-semibold text-zinc-800">先导入库存数据</h3>
            <p className="text-xs text-zinc-400 mt-1 max-w-sm">
              系统将自动识别字段、按品牌与直营仓生成汇总，并保留 Excel 导出公式与格式。
            </p>
          </div>
        ) : (
          <div id="tableWrap" className="max-h-[calc(100vh-360px)] min-h-[360px] overflow-auto border-t border-zinc-200">
            <table className="w-full min-w-[2200px] border-collapse text-xs">
              <thead className="sticky top-0 z-20 bg-zinc-100 shadow-xs">
                <tr className="border-b border-zinc-200 bg-zinc-100 text-zinc-700">
                  <th className="h-9 px-3 text-left font-bold text-zinc-800 w-[200px] min-w-[200px]">仓库名称</th>
                  <th className="h-9 px-3 text-left font-bold text-zinc-800 w-[380px] min-w-[380px]">货品名称</th>
                  <th className="h-9 px-2 text-center font-bold text-zinc-800 w-[70px]">状态</th>
                  <th className="h-9 px-2 text-right font-bold text-zinc-800 w-[60px]">规格</th>
                  <th className="h-9 px-2 text-right font-bold text-zinc-800 w-[60px]">箱规</th>
                  <th className="h-9 px-2 text-right font-bold text-zinc-800 w-[75px]">高库龄</th>
                  <th className="h-9 px-2 text-right font-bold text-zinc-800 w-[75px]">高周转</th>
                  <th className="h-9 px-2 text-right font-bold text-zinc-900 w-[85px] bg-zinc-200/40">良品可用</th>
                  <th className="h-9 px-2 text-right font-bold text-zinc-900 w-[95px] bg-zinc-200/40">非锁定库存</th>
                  <th className="h-9 px-2 text-right font-bold text-zinc-800 w-[65px]">近1天</th>
                  <th className="h-9 px-2 text-right font-bold text-zinc-800 w-[65px]">近7天</th>
                  <th className="h-9 px-2 text-right font-bold text-zinc-800 w-[65px]">近14天</th>
                  <th className="h-9 px-2 text-right font-bold text-zinc-800 w-[65px]">近30天</th>
                  <th className="h-9 px-2 text-right font-bold text-zinc-950 w-[85px] bg-zinc-200/50">系统订单</th>
                  <th className="h-9 px-2 text-right font-bold text-zinc-800 w-[85px]">重量</th>
                  <th className="h-9 px-2 text-right font-bold text-zinc-900 w-[110px] bg-emerald-100/60">实际订单安排</th>
                  <th className="h-9 px-2 text-right font-bold text-zinc-800 w-[85px]">实际重量</th>
                  <th className="h-9 px-2 text-center font-bold text-zinc-900 w-[90px] bg-zinc-200/40">安排状态</th>
                </tr>
              </thead>
              <tbody id="resultBody" className="divide-y divide-zinc-100 bg-white">
                {displayRows.map((r, idx) => {
                  if (r.isSubtotal) {
                    return (
                      <tr
                        key={`subtotal-${r.warehouse}-${idx}`}
                        className="bg-emerald-50/70 font-semibold text-zinc-900 border-y border-emerald-200 hover:bg-emerald-50 transition-colors"
                      >
                        <td className="p-2.5 text-left font-bold text-emerald-950 truncate" title={`${r.warehouse} 汇总`}>
                          {r.warehouse} 汇总
                        </td>
                        <td className="p-2.5"></td>
                        <td className="p-2.5 text-center"></td>
                        <td className="p-2.5 text-right"></td>
                        <td className="p-2.5 text-right"></td>
                        <td className="p-2.5 text-right"></td>
                        <td className="p-2.5 text-right"></td>
                        <td className="p-2.5 text-right"></td>
                        <td className="p-2.5 text-right"></td>
                        <td className="p-2.5 text-right"></td>
                        <td className="p-2.5 text-right"></td>
                        <td className="p-2.5 text-right"></td>
                        <td className="p-2.5 text-right"></td>
                        <td className="p-2.5 text-right tabular-nums font-bold text-zinc-950">{formatNumber(r.systemOrder)}</td>
                        <td className="p-2.5 text-right tabular-nums font-semibold text-zinc-700">{formatNumber(r.weight, 4)}</td>
                        <td className="p-2.5 text-right tabular-nums font-bold text-emerald-950 bg-emerald-100/50">
                          {formatNumber(r.actualOrder)}
                        </td>
                        <td className="p-2.5 text-right tabular-nums font-semibold text-zinc-700">{formatNumber(r.actualWeight, 4)}</td>
                        <td className="p-2.5 text-center text-zinc-600 bg-emerald-100/30">
                          {r.arrangement || ''}
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={r.id || `row-${r.warehouse}-${r.product}-${idx}`} className="hover:bg-zinc-50/80 transition-colors">
                      <td className="p-2.5 font-medium text-zinc-900 truncate max-w-[200px]" title={r.warehouse}>
                        {r.warehouse}
                      </td>
                      <td className="p-2.5 text-zinc-700 truncate max-w-[380px]" title={r.product}>
                        {r.product}
                      </td>
                      <td className="p-2.5 text-center text-zinc-500">{r.status || '-'}</td>
                      <td className="p-2.5 text-right tabular-nums text-zinc-600">{r.spec != null ? r.spec : '-'}</td>
                      <td className="p-2.5 text-right tabular-nums text-zinc-600">{r.boxSpec != null ? r.boxSpec : '-'}</td>
                      <td className="p-2.5 text-right tabular-nums text-zinc-600">{formatNumber(r.aged)}</td>
                      <td className="p-2.5 text-right tabular-nums text-zinc-600">{formatNumber(r.turnover)}</td>
                      <td className="p-2.5 text-right tabular-nums font-medium text-zinc-900 bg-zinc-50/50">{formatNumber(r.availableGood)}</td>
                      <td className="p-2.5 text-right tabular-nums text-zinc-700 bg-zinc-50/50">{formatNumber(r.nonLocked)}</td>
                      <td className="p-2.5 text-right tabular-nums text-zinc-500">{formatNumber(r.out1)}</td>
                      <td className="p-2.5 text-right tabular-nums text-zinc-500">{formatNumber(r.out7)}</td>
                      <td className="p-2.5 text-right tabular-nums text-zinc-500">{formatNumber(r.out14)}</td>
                      <td className="p-2.5 text-right tabular-nums text-zinc-500">{formatNumber(r.out30)}</td>
                      <td className="p-2.5 text-right tabular-nums font-semibold text-zinc-950 bg-zinc-50/50">{formatNumber(r.systemOrder)}</td>
                      <td className="p-2.5 text-right tabular-nums text-zinc-600">{formatNumber(r.weight, 4)}</td>
                      <td className="p-2 text-right bg-emerald-50/20">
                        <Input
                          type="number"
                          step={r.boxSpec || 1}
                          min="0"
                          max={r.hasOrderLimit ? r.systemOrder : undefined}
                          disabled={r.hasOrderLimit && r.systemOrder === 0}
                          title={`系统建议 ${formatNumber(r.suggestedActual)} 件，箱规 ${formatNumber(r.boxSpec)}`}
                          value={r.actualOrder !== undefined ? r.actualOrder : ''}
                          onChange={(e) => onActualOrderChange(r.id, e.target.value)}
                          className={`h-7 w-24 text-right tabular-nums font-mono text-xs px-2 ml-auto transition-colors ${
                            r.actualOrder !== undefined
                              ? 'bg-emerald-50 text-emerald-950 font-bold border-emerald-500 shadow-xs ring-1 ring-emerald-500/20'
                              : 'bg-white text-zinc-900 border-zinc-200'
                          }`}
                        />
                      </td>
                      <td className="p-2.5 text-right tabular-nums text-zinc-600">{formatNumber(r.actualWeight, 4)}</td>
                      <td className="p-2.5 text-center text-zinc-400 bg-zinc-50/30">{r.arrangement || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
