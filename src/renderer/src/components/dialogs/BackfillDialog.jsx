import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ArrowRightLeft, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

export function BackfillDialog({
  open,
  onOpenChange,
  preview,
  onConfirmBackfill,
}) {
  if (!preview) return null;

  const warehouses = preview.warehouses || [];
  const readyCount = preview.readyWarehouseCount ?? warehouses.filter((w) => w.ready).length;
  const errorCount = preview.errorCount ?? warehouses.filter((w) => !w.ready).length;
  const canConfirm = readyCount > 0;

  const versionCopy = preview.legacy ? '旧版表三 · 外部订单原表' : '内置回填任务';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent id="backfillDialog" className="max-w-3xl flex flex-col max-h-[85vh]">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle>回填订单原表</DialogTitle>
            {errorCount > 0 ? (
              <Badge variant="warning">{errorCount} 个仓库需处理</Badge>
            ) : (
              <Badge variant="success">全部分仓已就绪</Badge>
            )}
          </div>
          <DialogDescription id="backfillTaskMeta">
            {preview.fileName} · {preview.brand || '未标注品牌'} · {versionCopy}：{preview.sourceFileName || '无'}
          </DialogDescription>
        </DialogHeader>

        {/* Backfill summary metric cards */}
        <div id="backfillSummary" className="grid grid-cols-3 gap-3 py-2 border-b border-zinc-100">
          <Card className="p-3 bg-zinc-50/50">
            <span className="text-[11px] text-zinc-500 block mb-1">识别直营仓</span>
            <strong className="text-lg font-semibold text-zinc-900 tabular-nums">
              {warehouses.length}
            </strong>
          </Card>
          <Card className="p-3 bg-zinc-900 text-white shadow-xs">
            <span className="text-[11px] text-zinc-400 block mb-1">可以生成</span>
            <strong className="text-lg font-semibold text-white tabular-nums">
              {readyCount}
            </strong>
          </Card>
          <Card className="p-3 bg-zinc-50/50">
            <span className="text-[11px] text-zinc-500 block mb-1">异常项目</span>
            <strong className={`text-lg font-semibold tabular-nums ${errorCount > 0 ? 'text-amber-600' : 'text-zinc-900'}`}>
              {errorCount}
            </strong>
          </Card>
        </div>

        {/* Warehouse list */}
        <div id="backfillWarehouseList" className="flex-1 overflow-y-auto min-h-[260px] max-h-[420px] divide-y divide-zinc-100 pr-1">
          {warehouses.map((item) => (
            <div
              key={item.warehouse}
              className={`p-3 rounded-md transition-colors ${
                item.ready ? 'hover:bg-zinc-50/80' : 'bg-amber-50/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-800 truncate" title={item.warehouse}>
                      {item.warehouse}
                    </span>
                    <span className="text-[11px] text-zinc-500 font-mono">
                      {formatNumber(item.groupCount)} 个货品 · {formatNumber(item.actualTotal)} 件
                    </span>
                  </div>
                </div>

                <div>
                  {item.ready ? (
                    <Badge variant="success" className="text-[11px] gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      可生成
                    </Badge>
                  ) : (
                    <Badge variant="warning" className="text-[11px] gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      需处理
                    </Badge>
                  )}
                </div>
              </div>

              {item.errors && item.errors.length > 0 && (
                <div className="mt-2 p-2 bg-amber-100/60 rounded text-[11px] text-amber-800 space-y-1">
                  {item.errors.map((msg, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <AlertCircle className="h-3 w-3 shrink-0 text-amber-600" />
                      <span>{msg}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <span id="backfillFootnote" className="text-xs text-zinc-400">
            {errorCount > 0
              ? '有异常的仓库不会生成；其余仓库仍可正常导出。'
              : '数量将按订单原表的行顺序依次分配，每行不超过采购数量。'}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              id="confirmBackfillBtn"
              size="sm"
              disabled={!canConfirm}
              onClick={onConfirmBackfill}
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              生成分仓文件
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
