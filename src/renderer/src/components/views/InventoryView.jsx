import React, { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  FileSpreadsheet, 
  Upload, 
  RefreshCw, 
  CheckCircle2, 
  Layers, 
  Truck, 
  AlertCircle,
  Clock
} from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { useFileDrop } from '@/lib/use-file-drop';

export function InventoryView({
  inventoryState,
  onImportTable3,
  onImportLiveInventory,
  onImportTransit,
  notice,
}) {
  const { table3, inventories = [], transit, analysis } = inventoryState;

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

  const isReady = Boolean(table3 && (inventories.length > 0 || transit));

  const metrics = useMemo(() => {
    if (!analysis) {
      return { targetRows: 0, matched: 0, preserved: 0, ignored: 0, transitOrders: 0 };
    }
    return {
      targetRows: analysis.targetRows ?? analysis.targetRowCount ?? 0,
      matched: analysis.matchedRows ?? analysis.matchedCount ?? 0,
      preserved: analysis.preservedRows ?? analysis.preservedCount ?? 0,
      ignored: analysis.ignoredInventoryRows ?? 0,
      transitOrders: analysis.hasTransit
        ? (analysis.transitTotal ?? 0)
        : (analysis.matchedTransitRows ?? analysis.transitOrderCount ?? 0),
    };
  }, [analysis]);

  const summaryText = useMemo(() => {
    if (!analysis) return '尚未分析数据';
    const parts = [];
    if (analysis.inventoryFileCount) {
      parts.push(`${analysis.inventoryFileCount} 份库存 · ${analysis.matchedRows ?? 0} 条匹配`);
    }
    if (analysis.hasTransit) {
      parts.push(`在途 ${analysis.matchedTransitRows ?? 0} 条 / ${formatNumber(analysis.transitTotal ?? 0)} 件`);
    }
    return parts.join(' · ') || '尚未分析数据';
  }, [analysis]);

  const previewHelp = useMemo(() => {
    if (!analysis) return '导入旧表三，再从实时库存和在途明细中至少选择一种。';
    const rowCount = (analysis.previewRows || analysis.updates || []).length;
    return `显示 ${formatNumber(rowCount)} 条库存或在途匹配明细。`;
  }, [analysis]);

  const displayRows = analysis?.previewRows || analysis?.updates || [];

  return (
    <main id="inventoryView" className="flex-1 p-6 space-y-5">
      {/* Intro Header */}
      <section className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border border-zinc-200/80 bg-white">
        <div>
          <h2 className="text-sm font-semibold text-zinc-950">更新表三良品可用</h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            实时库存与在途明细二选一即可，也可以同时导入并一次完成两项更新。支持拖拽 Excel 快速导入。
          </p>
        </div>

        <div id="inventoryReadiness">
          {analysis?.errors?.length ? (
            <Badge variant="destructive" className="gap-1.5 py-1 px-3">
              <AlertCircle className="h-3.5 w-3.5" />
              存在数据冲突 ({analysis.errors.length})
            </Badge>
          ) : isReady && analysis?.canExport ? (
            <Badge variant="success" className="gap-1.5 py-1 px-3">
              <CheckCircle2 className="h-3.5 w-3.5" />
              已就绪，可执行更新
            </Badge>
          ) : isReady ? (
            <Badge variant="secondary" className="gap-1.5 py-1 px-3">
              <RefreshCw className="h-3.5 w-3.5 text-zinc-400 animate-spin" />
              正在分析文件
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1.5 py-1 px-3">
              <Clock className="h-3.5 w-3.5 text-zinc-400" />
              等待旧表三和数据文件
            </Badge>
          )}
        </div>
      </section>

      {/* 3 File Slots Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3.5" aria-label="良品库存更新文件导入">
        {/* Slot 1: Old Table 3 */}
        <Card
          id="inventoryTable3Slot"
          {...dropTable3Props}
          className={`flex items-center justify-between p-4 transition-all ${
            dropTable3Props.isDragging
              ? 'border-2 border-dashed border-zinc-950 bg-zinc-100/90 shadow-sm scale-[1.01]'
              : table3
              ? 'border-zinc-400/80 bg-zinc-50/50'
              : 'bg-white hover:border-zinc-300'
          }`}
        >
          <div className="min-w-0 pr-3">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={table3 ? 'success' : 'default'} className="text-[10px] px-1.5 py-0">
                必需
              </Badge>
              <strong className="text-xs font-semibold text-zinc-900 truncate">
                旧表三 · 待更新文件
              </strong>
            </div>
            <p id="inventoryTable3Meta" className="text-[11px] text-zinc-400 truncate" title={table3 ? table3.fileName : '支持拖拽 Excel 到此处'}>
              {dropTable3Props.isDragging
                ? '释放以导入旧表三'
                : table3
                ? table3.fileName
                : '支持拖拽 Excel 到此处'}
            </p>
          </div>
          <Button
            id="inventoryTable3Btn"
            variant={table3 ? 'outline' : 'secondary'}
            size="sm"
            onClick={() => onImportTable3()}
          >
            <Upload className="h-3.5 w-3.5" />
            {table3 ? '重新选择' : '选择文件'}
          </Button>
        </Card>

        {/* Slot 2: Live Inventory */}
        <Card
          id="liveInventorySlot"
          {...dropLiveProps}
          className={`flex items-center justify-between p-4 transition-all ${
            dropLiveProps.isDragging
              ? 'border-2 border-dashed border-zinc-950 bg-zinc-100/90 shadow-sm scale-[1.01]'
              : inventories.length > 0
              ? 'border-zinc-400/80 bg-zinc-50/50'
              : 'bg-white hover:border-zinc-300'
          }`}
        >
          <div className="min-w-0 pr-3">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                二选一
              </Badge>
              <strong className="text-xs font-semibold text-zinc-900 truncate">
                实时库存 · 可多选
              </strong>
            </div>
            <p id="liveInventoryMeta" className="text-[11px] text-zinc-400 truncate" title={inventories.length > 0 ? `已导入 ${inventories.length} 个文件` : '支持多选或多次拖拽文件'}>
              {dropLiveProps.isDragging
                ? '释放以导入实时库存文件'
                : inventories.length > 0
                ? `已导入 ${inventories.length} 个文件 (${inventories.map((f) => f.fileName).join('、')})`
                : '支持多选或多次拖拽文件'}
            </p>
          </div>
          <Button
            id="liveInventoryBtn"
            variant="outline"
            size="sm"
            onClick={() => onImportLiveInventory()}
          >
            <Upload className="h-3.5 w-3.5" />
            {inventories.length > 0 ? '重新选择' : '选择文件'}
          </Button>
        </Card>

        {/* Slot 3: Transit Detail */}
        <Card
          id="transitSlot"
          {...dropTransitProps}
          className={`flex items-center justify-between p-4 transition-all ${
            dropTransitProps.isDragging
              ? 'border-2 border-dashed border-zinc-950 bg-zinc-100/90 shadow-sm scale-[1.01]'
              : transit
              ? 'border-zinc-400/80 bg-zinc-50/50'
              : 'bg-white hover:border-zinc-300'
          }`}
        >
          <div className="min-w-0 pr-3">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                二选一
              </Badge>
              <strong className="text-xs font-semibold text-zinc-900 truncate">
                库存在途明细
              </strong>
            </div>
            <p id="transitMeta" className="text-[11px] text-zinc-400 truncate" title={transit ? transit.fileName : '支持拖拽 Excel 到此处'}>
              {dropTransitProps.isDragging
                ? '释放以导入在途明细'
                : transit
                ? transit.fileName
                : '支持拖拽 Excel 到此处'}
            </p>
          </div>
          <Button
            id="transitBtn"
            variant="outline"
            size="sm"
            onClick={() => onImportTransit()}
          >
            <Upload className="h-3.5 w-3.5" />
            {transit ? '重新选择' : '选择文件'}
          </Button>
        </Card>
      </section>

      {/* Notice bar */}
      {notice && (
        <section
          id="inventoryNotice"
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
      <section className="grid grid-cols-2 md:grid-cols-5 gap-3" aria-label="更新概览">
        <Card className="p-3.5 bg-white">
          <span className="text-[11px] text-zinc-500 block mb-1">表三明细</span>
          <strong id="inventoryTargetMetric" className="text-xl font-bold tracking-tight text-zinc-900 tabular-nums">
            {metrics.targetRows}
          </strong>
        </Card>

        <Card className="p-3.5 bg-zinc-900 text-white shadow-xs">
          <span className="text-[11px] text-zinc-400 block mb-1">匹配更新</span>
          <strong id="inventoryMatchedMetric" className="text-xl font-bold tracking-tight text-white tabular-nums">
            {metrics.matched}
          </strong>
        </Card>

        <Card className="p-3.5 bg-white">
          <span className="text-[11px] text-zinc-500 block mb-1">保留原值</span>
          <strong id="inventoryPreservedMetric" className="text-xl font-bold tracking-tight text-zinc-900 tabular-nums">
            {metrics.preserved}
          </strong>
        </Card>

        <Card className="p-3.5 bg-white">
          <span className="text-[11px] text-zinc-500 block mb-1">忽略库存行</span>
          <strong id="inventoryIgnoredMetric" className="text-xl font-bold tracking-tight text-zinc-900 tabular-nums">
            {metrics.ignored}
          </strong>
        </Card>

        <Card className="p-3.5 bg-white">
          <span className="text-[11px] text-zinc-500 block mb-1">在途订单</span>
          <strong id="transitMetric" className="text-xl font-bold tracking-tight text-zinc-900 tabular-nums">
            {metrics.transitOrders}
          </strong>
        </Card>
      </section>

      {/* Difference Preview Workspace */}
      <section className="rounded-xl border border-zinc-200/80 bg-white overflow-hidden shadow-xs">
        <div className="flex items-center justify-between p-4 border-b border-zinc-100">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">更新明细</h2>
            <p id="inventoryPreviewHelp" className="text-[11px] text-zinc-400 mt-0.5">
              {previewHelp}
            </p>
          </div>
          <span id="inventorySourceSummary" className="text-xs text-zinc-500 font-mono">
            {summaryText}
          </span>
        </div>

        {displayRows.length === 0 ? (
          <div id="inventoryEmptyState" className="flex flex-col items-center justify-center py-24 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500 mb-4 border border-zinc-200/60">
              <RefreshCw className="h-7 w-7 stroke-[1.5]" />
            </div>
            <h3 className="text-sm font-semibold text-zinc-800">先导入旧表三</h3>
            <p className="text-xs text-zinc-400 mt-1 max-w-sm">
              实时库存和库存在途明细二选一即可；两者都选时会同时更新。
            </p>
          </div>
        ) : (
          <div id="inventoryPreviewWrap" className="max-h-[calc(100vh-360px)] min-h-[360px] overflow-auto">
            <div className="grid grid-cols-[1.5fr_2fr_1fr_1fr_1fr_1fr] bg-zinc-100/95 border-b border-zinc-200 p-2.5 text-xs font-semibold text-zinc-600 sticky top-0 z-10 shadow-xs backdrop-blur-xs">
              <span>仓库名称</span>
              <span>货品名称</span>
              <span className="text-right">原良品可用</span>
              <span className="text-right">新良品可用</span>
              <span className="text-center">变化</span>
              <span className="text-right">在途订单</span>
            </div>

            <div id="inventoryUpdateList" className="divide-y divide-zinc-100">
              {displayRows.map((item, idx) => {
                const oldValue = item.oldValue ?? item.oldAvailable ?? 0;
                const newValue = item.newValue ?? item.newAvailable ?? 0;
                const diff = item.difference ?? (Number(newValue) - Number(oldValue));
                const transitVal = item.transitValue ?? item.transitOrders ?? 0;
                const isUnchanged = Number(oldValue) === Number(newValue);
                return (
                  <div
                    key={`${item.warehouse}-${item.product}-${item.rowNumber || idx}`}
                    className={`grid grid-cols-[1.5fr_2fr_1fr_1fr_1fr_1fr] items-center p-2.5 text-xs hover:bg-zinc-50 transition-colors ${
                      isUnchanged ? 'opacity-70 bg-zinc-50/30' : ''
                    }`}
                  >
                    <span className="font-medium text-zinc-800 truncate" title={item.warehouse}>
                      {item.warehouse}
                    </span>
                    <span className="text-zinc-600 truncate" title={item.product}>
                      {item.product}
                    </span>
                    <span className="text-right font-mono tabular-nums text-zinc-400">
                      {formatNumber(oldValue)}
                    </span>
                    <span className="text-right font-mono tabular-nums font-semibold text-zinc-900">
                      {formatNumber(newValue)}
                    </span>
                    <div className="text-center">
                      {diff > 0 ? (
                        <Badge variant="success" className="text-[10px] px-1.5 py-0 font-mono">
                          +{formatNumber(diff)}
                        </Badge>
                      ) : diff < 0 ? (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0 font-mono">
                          {formatNumber(diff)}
                        </Badge>
                      ) : (
                        <span className="text-[11px] text-zinc-400 font-mono">0</span>
                      )}
                    </div>
                    <span className="text-right tabular-nums text-zinc-600 font-mono">
                      {analysis?.hasTransit ? formatNumber(transitVal) : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
