import React from 'react';
import { Button } from '@/components/ui/button';
import { 
  Download, 
  ArrowRightLeft, 
  Truck, 
  ReceiptText,
  Settings,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function Header({
  workflow,
  // Replenish actions
  summaryModeText,
  summaryCanExport,
  onSummaryExport,
  onSummaryDemand,
  onSummaryBackfill,
  // Delivery actions
  deliveryModeText,
  deliveryCanDemand,
  deliveryCanExport,
  onDeliveryDemand,
  onDeliveryExport,
  // Invoice actions
  invoiceModeText,
  invoiceCanExport,
  onInvoiceExport,
  onOpenMasterData,
}) {
  const titles = {
    replenish: {
      category: '仓配计划',
      name: '补货与库存协同工作区',
      desc: '表三自动计算 · 实时良品在途校准 · 采购需求生成',
    },
    delivery: {
      category: '发运履约',
      name: '发运履约中心 (送货单)',
      desc: '入库回执解析 · 批次生产日期维护 · 送货单智能分仓',
    },
    invoice: {
      category: '财务结算',
      name: '财务结算与开票中心',
      desc: '猫超账单智能解析 · 费用项及方向筛选 · 开票通知单生成',
    },
  };

  const currentMeta = titles[workflow] || titles.replenish;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-zinc-200/90 bg-white px-6 select-none shadow-xs">
      {/* Left: Breadcrumbs & Status */}
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <span className="font-medium text-zinc-600">{currentMeta.category}</span>
          <ChevronRight className="size-3 text-zinc-400" />
          <h1 className="text-sm font-semibold tracking-tight text-zinc-950 truncate">
            {currentMeta.name}
          </h1>
        </div>

        {/* Dynamic Status Pill - Black & White */}
        {workflow === 'replenish' && summaryModeText && (
          <span
            id="modeBadge"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border",
              summaryCanExport
                ? "bg-zinc-100 text-zinc-950 border-zinc-300 font-semibold"
                : "bg-zinc-50 text-zinc-500 border-zinc-200"
            )}
          >
            {summaryCanExport && (
              <span className="size-1.5 rounded-full bg-zinc-900" />
            )}
            {summaryModeText}
          </span>
        )}

        {workflow === 'delivery' && deliveryModeText && (
          <span
            id="deliveryModeBadge"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border",
              deliveryCanExport
                ? "bg-zinc-100 text-zinc-950 border-zinc-300 font-semibold"
                : "bg-zinc-50 text-zinc-500 border-zinc-200"
            )}
          >
            {deliveryCanExport && (
              <span className="size-1.5 rounded-full bg-zinc-900" />
            )}
            {deliveryModeText}
          </span>
        )}

        {workflow === 'invoice' && invoiceModeText && (
          <span
            id="invoiceModeBadge"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border",
              invoiceCanExport
                ? "bg-zinc-100 text-zinc-950 border-zinc-300 font-semibold"
                : "bg-zinc-50 text-zinc-500 border-zinc-200"
            )}
          >
            {invoiceCanExport && (
              <span className="size-1.5 rounded-full bg-zinc-900" />
            )}
            {invoiceModeText}
          </span>
        )}
      </div>

      {/* Right: Dynamic Top Action Buttons - Strict Black & White */}
      <div className="flex items-center gap-2.5 shrink-0">
        {workflow === 'replenish' && (
          <div id="summaryTopActions" className="flex items-center gap-2">
            <Button
              id="demandBtn"
              variant="outline"
              size="sm"
              onClick={onSummaryDemand}
              className="text-xs h-8 cursor-pointer border-zinc-200 hover:bg-zinc-100 text-zinc-800"
            >
              <Download className="size-3.5 mr-1" />
              导出采购需求表
            </Button>
            <Button
              id="backfillBtn"
              variant="outline"
              size="sm"
              onClick={onSummaryBackfill}
              className="text-xs h-8 cursor-pointer border-zinc-200 hover:bg-zinc-100 text-zinc-800"
            >
              <ArrowRightLeft className="size-3.5 mr-1" />
              回填订单原表
            </Button>
            <Button
              id="exportBtn"
              variant="default"
              size="sm"
              disabled={!summaryCanExport}
              onClick={onSummaryExport}
              className={cn(
                "text-xs h-8 font-medium cursor-pointer shadow-xs",
                summaryCanExport
                  ? "bg-zinc-900 hover:bg-zinc-800 text-white"
                  : "bg-zinc-100 text-zinc-400"
              )}
            >
              <Download className="size-3.5 mr-1" />
              导出表三
            </Button>
          </div>
        )}

        {workflow === 'delivery' && (
          <div id="deliveryTopActions" className="flex items-center gap-2">
            <Button
              id="deliveryDemandBtn"
              variant="outline"
              size="sm"
              disabled={!deliveryCanDemand}
              onClick={onDeliveryDemand}
              className="text-xs h-8 cursor-pointer border-zinc-200 hover:bg-zinc-100 text-zinc-800"
            >
              <Download className="size-3.5 mr-1" />
              导出采购需求表
            </Button>
            <Button
              id="generateDeliveryBtn"
              variant="default"
              size="sm"
              disabled={!deliveryCanExport}
              onClick={onDeliveryExport}
              className={cn(
                "text-xs h-8 font-medium cursor-pointer shadow-xs",
                deliveryCanExport
                  ? "bg-zinc-900 hover:bg-zinc-800 text-white"
                  : "bg-zinc-100 text-zinc-400"
              )}
            >
              <Truck className="size-3.5 mr-1" />
              生成送货单
            </Button>
          </div>
        )}

        {workflow === 'invoice' && (
          <div id="invoiceTopActions" className="flex items-center gap-2">
            <Button
              id="exportInvoiceBtn"
              variant="default"
              size="sm"
              disabled={!invoiceCanExport}
              onClick={onInvoiceExport}
              className={cn(
                "text-xs h-8 font-medium cursor-pointer shadow-xs",
                invoiceCanExport
                  ? "bg-zinc-900 hover:bg-zinc-800 text-white"
                  : "bg-zinc-100 text-zinc-400"
              )}
            >
              <Download className="size-3.5 mr-1" />
              导出开票通知单
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
