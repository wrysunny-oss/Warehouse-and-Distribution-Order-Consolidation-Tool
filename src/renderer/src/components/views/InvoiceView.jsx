import React, { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { 
  ReceiptText, 
  Upload, 
  Search, 
  X, 
  Trash2, 
  AlertCircle, 
  CheckCircle2, 
  FileSpreadsheet,
  Coins,
  PackageCheck
} from 'lucide-react';
import { formatNumber, cn } from '@/lib/utils';
import { useFileDrop } from '@/lib/use-file-drop';
import { PlatformFeeView } from './PlatformFeeView';

export function InvoiceView({
  invoiceState,
  onSelectInvoiceFiles,
  onRemoveInvoiceFile,
  onClearInvoiceFiles,
  onToggleFeeType,
  onSelectGoodsFeeOnly,
  onSelectAllFeeTypes,
  onClearFeeTypes,
  onToggleInvoiceDir,
  onSelectIncomingInvoiceOnly,
  onSelectAllInvoiceDirs,
  onUpdateConfig,
  notice,
}) {
  const {
    files = [],
    availableFeeTypes = [],
    availableInvoiceDirs = [],
    selectedFeeTypes = new Set(),
    selectedInvoiceDirs = new Set(),
    summaryResult,
    config = {},
  } = invoiceState;

  const [subTab, setSubTab] = useState('goods'); // 'goods' | 'platformFee'
  const [search, setSearch] = useState('');

  const dropInvoiceProps = useFileDrop({
    onFilesDropped: (paths) => {
      if (paths.length > 0) onSelectInvoiceFiles(paths);
    },
  });

  const metrics = useMemo(() => {
    if (!summaryResult) {
      return { billCount: 0, productCount: 0, rowCount: 0, totalQty: 0, totalAmount: 0 };
    }
    const billCount = new Set((invoiceState.rawRows || []).map((r) => r.billNo).filter(Boolean)).size;
    return {
      billCount: summaryResult.billCount ?? billCount,
      productCount: summaryResult.productCount ?? summaryResult.items?.length ?? 0,
      rowCount: summaryResult.matchedRowCount ?? summaryResult.rowCount ?? 0,
      totalQty: summaryResult.totalQty || 0,
      totalAmount: summaryResult.totalAmount || 0,
    };
  }, [summaryResult, invoiceState.rawRows]);

  const displayItems = useMemo(() => {
    if (!summaryResult?.items) return [];
    if (!search.trim()) return summaryResult.items;
    const q = search.trim().toLowerCase();
    return summaryResult.items.filter(
      (item) =>
        (item.shortName || item.productName || '').toLowerCase().includes(q) ||
        (item.spec || '').toLowerCase().includes(q) ||
        (item.rawNames && item.rawNames.some((n) => n.toLowerCase().includes(q)))
    );
  }, [summaryResult, search]);

  const visibleTotals = useMemo(() => {
    let qty = 0;
    let amount = 0;
    for (const it of displayItems) {
      qty += it.qty || 0;
      amount += (it.amount ?? it.taxIncludedAmount ?? 0);
    }
    return {
      qty,
      amount: Math.round(amount * 100) / 100,
    };
  }, [displayItems]);

  return (
    <main id="invoiceView" className="flex-1 p-6 flex flex-col gap-4 select-none overflow-y-auto">
      {/* 顶部财务功能子模块切换 */}
      <div className="flex items-center gap-2 border-b border-zinc-200/80 pb-3">
        <button
          type="button"
          onClick={() => setSubTab('goods')}
          className={cn(
            "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors",
            subTab === 'goods'
              ? "bg-zinc-950 text-white shadow-xs"
              : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100"
          )}
        >
          <ReceiptText className="size-3.5" />
          商品开票通知单
        </button>
        <button
          type="button"
          onClick={() => setSubTab('platformFee')}
          className={cn(
            "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors",
            subTab === 'platformFee'
              ? "bg-zinc-950 text-white shadow-xs"
              : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100"
          )}
        >
          <FileSpreadsheet className="size-3.5" />
          平台费用核销汇总 (输入表一 → 输出表二)
        </button>
      </div>

      {subTab === 'platformFee' ? (
        <PlatformFeeView notice={notice} />
      ) : (
        <>
          {/* Control Strip */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch" aria-label="对账单导入与基础信息">
        {/* Multi-file Slot */}
        <Card
          id="invoiceFilesSlot"
          {...dropInvoiceProps}
          className={`lg:col-span-5 flex items-center justify-between p-4 transition-all rounded-xl border border-zinc-200 shadow-xs ${
            dropInvoiceProps.isDragging
              ? 'border-2 border-dashed border-zinc-900 bg-zinc-100 shadow-sm scale-[1.01]'
              : files.length > 0
              ? 'border-zinc-400 bg-zinc-50/70'
              : 'bg-white hover:border-zinc-300'
          }`}
        >
          <div className="min-w-0 pr-3">
            <div className="flex items-center gap-2 mb-1">
              <Badge
                variant={files.length > 0 ? 'default' : 'outline'}
                className="text-[10px] px-1.5 py-0 shrink-0 whitespace-nowrap font-medium"
              >
                必需 · 多选
              </Badge>
              <strong className="text-xs font-semibold text-zinc-900 whitespace-nowrap">
                天猫超市对账单
              </strong>
            </div>
            <p
              id="invoiceFilesMeta"
              className="text-[11px] text-zinc-500 truncate"
              title={files.length > 0 ? `已导入 ${files.length} 个对账单` : '支持多选或拖拽对账单到此处'}
            >
              {dropInvoiceProps.isDragging
                ? '释放以追加导入对账单'
                : files.length > 0
                ? `已导入 ${files.length} 个对账单`
                : '支持拖拽 Excel 到此处，可多选导入'}
            </p>
          </div>
          <Button
            id="invoiceFilesBtn"
            variant={files.length > 0 ? 'outline' : 'default'}
            size="sm"
            onClick={() => onSelectInvoiceFiles()}
            className={`shrink-0 text-xs h-8 cursor-pointer ${
              files.length > 0
                ? 'border-zinc-200 text-zinc-800 hover:bg-zinc-100'
                : 'bg-zinc-900 hover:bg-zinc-800 text-white shadow-xs'
            }`}
          >
            <Upload className="h-3.5 w-3.5 mr-1" />
            {files.length > 0 ? '追加对账单' : '选择对账单'}
          </Button>
        </Card>

        {/* Consolidated Metadata Inputs */}
        <Card className="lg:col-span-7 p-3.5 bg-white rounded-xl border border-zinc-200 shadow-xs flex flex-col justify-center">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 items-center">
            {/* Date */}
            <div className="min-w-0">
              <label htmlFor="invoiceDateInput" className="block text-[11px] font-medium text-zinc-500 mb-1 truncate">
                开票通知时间
              </label>
              <Input
                id="invoiceDateInput"
                value={config.date || ''}
                onChange={(e) => onUpdateConfig('date', e.target.value)}
                placeholder="YYYY-M-D"
                className="h-8 text-xs bg-zinc-50/60 border-zinc-200 focus:bg-white focus:border-zinc-900"
              />
            </div>

            {/* Applicant */}
            <div className="min-w-0">
              <label htmlFor="invoiceApplicantInput" className="block text-[11px] font-medium text-zinc-500 mb-1 truncate">
                申请人
              </label>
              <Input
                id="invoiceApplicantInput"
                value={config.applicant || ''}
                onChange={(e) => onUpdateConfig('applicant', e.target.value)}
                placeholder="丁锐杰"
                className="h-8 text-xs bg-zinc-50/60 border-zinc-200 focus:bg-white focus:border-zinc-900"
              />
            </div>

            {/* Platform */}
            <div className="min-w-0">
              <label htmlFor="invoicePlatformInput" className="block text-[11px] font-medium text-zinc-500 mb-1 truncate">
                销售平台
              </label>
              <Input
                id="invoicePlatformInput"
                value={config.platform || ''}
                onChange={(e) => onUpdateConfig('platform', e.target.value)}
                placeholder="国宝猫超"
                className="h-8 text-xs bg-zinc-50/60 border-zinc-200 focus:bg-white focus:border-zinc-900"
              />
            </div>

            {/* Warehouse */}
            <div className="min-w-0">
              <label htmlFor="invoiceWarehouseInput" className="block text-[11px] font-medium text-zinc-500 mb-1 truncate">
                发货仓库
              </label>
              <Input
                id="invoiceWarehouseInput"
                value={config.warehouse || ''}
                onChange={(e) => onUpdateConfig('warehouse', e.target.value)}
                placeholder="留空或输入发货仓"
                className="h-8 text-xs bg-zinc-50/60 border-zinc-200 focus:bg-white focus:border-zinc-900"
              />
            </div>
          </div>
        </Card>
      </section>

      {/* Filter Chips Section */}
      {(availableFeeTypes.length > 0 || availableInvoiceDirs.length > 0) && (
        <section id="invoiceFilterSection" className="p-3.5 bg-white rounded-xl border border-zinc-200/80 shadow-xs space-y-3">
          {availableFeeTypes.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-zinc-500">费用类型筛选：</span>
                <div id="invoiceFeeTypeChips" className="flex flex-wrap gap-1.5">
                  {availableFeeTypes.map((type) => {
                    const isSelected = selectedFeeTypes.has(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => onToggleFeeType(type)}
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-zinc-900 text-white border-zinc-900'
                            : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                        }`}
                      >
                        {type}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                <Button
                  id="invoiceSelectGoodsOnlyBtn"
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[11px] font-medium text-zinc-900 bg-zinc-100 border-zinc-300 hover:bg-zinc-200 cursor-pointer"
                  onClick={onSelectGoodsFeeOnly}
                  title="仅勾选包含货款的费用类型，忽略其他杂项费用"
                >
                  仅保留货款
                </Button>
                <Button
                  id="invoiceSelectAllFeesBtn"
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] text-zinc-500 hover:text-zinc-900 cursor-pointer"
                  onClick={onSelectAllFeeTypes}
                >
                  全选
                </Button>
                <span className="text-zinc-300">|</span>
                <Button
                  id="invoiceClearFeesBtn"
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] text-zinc-500 hover:text-zinc-900 cursor-pointer"
                  onClick={onClearFeeTypes}
                >
                  清空
                </Button>
              </div>
            </div>
          )}

          {availableInvoiceDirs.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2.5 border-t border-zinc-100">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-zinc-500">发票方向筛选：</span>
                <div id="invoiceDirChips" className="flex flex-wrap gap-1.5">
                  {availableInvoiceDirs.map((dir) => {
                    const isSelected = selectedInvoiceDirs.has(dir);
                    return (
                      <button
                        key={dir}
                        type="button"
                        onClick={() => onToggleInvoiceDir(dir)}
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-zinc-900 text-white border-zinc-900'
                            : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                        }`}
                      >
                        {dir}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                <Button
                  id="invoiceSelectIncomingOnlyBtn"
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[11px] font-medium text-zinc-900 bg-zinc-100 border-zinc-300 hover:bg-zinc-200 cursor-pointer"
                  onClick={onSelectIncomingInvoiceOnly}
                  title="仅勾选进项发票"
                >
                  仅进项票
                </Button>
                <Button
                  id="invoiceSelectAllDirsBtn"
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] text-zinc-500 hover:text-zinc-900 cursor-pointer"
                  onClick={onSelectAllInvoiceDirs}
                >
                  全选
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Imported files chips */}
      {files.length > 0 && (
        <section id="invoiceFileListSection" className="flex items-center justify-between p-3 bg-zinc-50/70 rounded-lg border border-zinc-200/60 text-xs">
          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="text-zinc-500 whitespace-nowrap">
              已导入 <strong id="invoiceFileCount" className="text-zinc-900">{files.length}</strong> 个文件：
            </span>
            <div id="invoiceFileChips" className="flex items-center gap-1.5 flex-wrap">
              {files.map((f, idx) => {
                const filePath = f.filePath || f.path || f;
                const fileName = f.fileName || f.name || (typeof filePath === 'string' ? filePath.split(/[/\\]/).pop() : `文件 ${idx + 1}`);
                return (
                  <span
                    key={filePath || idx}
                    className="inline-flex items-center gap-1.5 rounded bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 border border-zinc-200 shadow-xs"
                  >
                    <span className="truncate max-w-[260px]" title={fileName}>
                      {fileName} {f.rowCount ? <span className="text-zinc-400 font-normal">({f.rowCount}行{f.timeRange ? ` · ${f.timeRange}` : ''})</span> : null}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveInvoiceFile(filePath)}
                      className="text-zinc-400 hover:text-zinc-900 cursor-pointer p-0.5 rounded-full hover:bg-zinc-100"
                      title="移除此文件"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          </div>

          <Button
            id="invoiceClearFilesBtn"
            variant="ghost"
            size="sm"
            onClick={onClearInvoiceFiles}
            className="text-xs text-zinc-500 hover:text-red-600 h-7"
          >
            <Trash2 className="h-3 w-3" />
            清空对账单
          </Button>
        </section>
      )}

      {/* Notice alert */}
      {notice && (
        <section
          id="invoiceNotice"
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

      {/* KPI Metrics */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-3" aria-label="开票汇总统计">
        <Card className="p-3.5 bg-white">
          <span className="text-[11px] text-zinc-500 block mb-1">对账单号数</span>
          <strong id="invoiceBillCountMetric" className="text-xl font-bold tracking-tight text-zinc-900 tabular-nums">
            {metrics.billCount}
          </strong>
        </Card>

        <Card className="p-3.5 bg-white">
          <span className="text-[11px] text-zinc-500 block mb-1">结算商品种数</span>
          <strong id="invoiceProductCountMetric" className="text-xl font-bold tracking-tight text-zinc-900 tabular-nums">
            {metrics.productCount}
          </strong>
        </Card>

        <Card className="p-3.5 bg-white">
          <span className="text-[11px] text-zinc-500 block mb-1">有效明细行</span>
          <strong id="invoiceRowCountMetric" className="text-xl font-bold tracking-tight text-zinc-900 tabular-nums">
            {metrics.rowCount}
          </strong>
        </Card>

        <Card className="p-3.5 bg-zinc-900 text-white shadow-xs">
          <span className="text-[11px] text-zinc-400 block mb-1">开票总数量（袋）</span>
          <strong id="invoiceQtyMetric" className="text-xl font-bold tracking-tight text-white tabular-nums">
            {formatNumber(metrics.totalQty)}
          </strong>
        </Card>

        <Card className="p-3.5 bg-white">
          <span className="text-[11px] text-zinc-500 block mb-1">开票含税金额（元）</span>
          <strong id="invoiceAmountMetric" className="text-xl font-bold tracking-tight text-zinc-900 tabular-nums">
            {formatNumber(metrics.totalAmount, 2)}
          </strong>
        </Card>
      </section>

      {/* Table Preview Workspace */}
      <section className="rounded-xl border border-zinc-200/80 bg-white overflow-hidden shadow-xs">
        <div className="flex items-center justify-between p-4 border-b border-zinc-100">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">开票通知单预览（表二）</h2>
            <p id="invoicePreviewHelp" className="text-[11px] text-zinc-400 mt-0.5">
              导入对账单并设置筛选后，实时生成开票通知单预览
            </p>
          </div>

          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <Input
              id="invoiceSearchInput"
              type="search"
              placeholder="搜索商品名称或规格..."
              disabled={!summaryResult}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs bg-zinc-50/50"
            />
          </div>
        </div>

        {!summaryResult ? (
          <div id="invoiceEmptyState" className="flex flex-col items-center justify-center py-24 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500 mb-4 border border-zinc-200/60">
              <ReceiptText className="h-7 w-7 stroke-[1.5]" />
            </div>
            <h3 className="text-sm font-semibold text-zinc-800">先导入天猫超市对账单</h3>
            <p className="text-xs text-zinc-400 mt-1 max-w-sm">
              系统会自动识别费用类型与发票方向，使用商品预设匹配规范简称与规格，并生成标准的《开票通知单》。
            </p>
          </div>
        ) : (
          <div id="invoiceTableWrap" className="max-h-[calc(100vh-360px)] min-h-[360px] overflow-auto">
            <Table>
              <TableHeader className="bg-zinc-100/95 sticky top-0 z-10 shadow-xs backdrop-blur-xs">
                <TableRow>
                  <TableHead className="w-14 text-center">序号</TableHead>
                  <TableHead>商品名称</TableHead>
                  <TableHead className="w-28 text-center">规 格（袋）</TableHead>
                  <TableHead className="w-28 text-right font-bold">数 量（袋）</TableHead>
                  <TableHead className="w-32 text-right">折后单价（元）</TableHead>
                  <TableHead className="w-36 text-right font-bold">含税金额（元）</TableHead>
                  <TableHead className="w-28 text-center">预设状态</TableHead>
                  <TableHead className="w-36">备注</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody id="invoiceTableBody">
                {displayItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-zinc-400">
                      没有符合筛选条件的明细
                    </TableCell>
                  </TableRow>
                ) : (
                  displayItems.map((item, idx) => {
                    const name = item.shortName || item.productName || '-';
                    const amount = item.amount ?? item.taxIncludedAmount ?? 0;
                    const isMatched = item.matched ?? item.isPresetMatched ?? false;
                    const remarkText = item.remark || (item.detailCount ? `来源 ${item.detailCount} 行` : '-');

                    return (
                      <TableRow key={`${name}-${idx}`} className="text-xs">
                        <TableCell className="text-center font-mono text-zinc-400">
                          {idx + 1}
                        </TableCell>
                        <TableCell className="font-medium text-zinc-900 truncate max-w-[280px]" title={name}>
                          {name}
                        </TableCell>
                        <TableCell className="text-center text-zinc-600">
                          {item.spec || '-'}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums text-zinc-950">
                          {formatNumber(item.qty)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-zinc-600">
                          {item.unitPrice !== undefined ? formatNumber(item.unitPrice, 4) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-bold tabular-nums text-zinc-950">
                          {formatNumber(amount, 2)}
                        </TableCell>
                        <TableCell className="text-center">
                          {isMatched ? (
                            <Badge variant="success" className="text-[10px] px-1.5 py-0 font-normal">
                              匹配成功
                            </Badge>
                          ) : (
                            <Badge variant="warning" className="text-[10px] px-1.5 py-0 font-normal">
                              未预设
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-zinc-400 truncate max-w-[160px]" title={remarkText}>
                          {remarkText}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
              <TableFooter>
                <TableRow className="font-bold text-zinc-900 bg-zinc-100/90 text-xs">
                  <TableCell colSpan={3} className="text-center">
                    合计
                  </TableCell>
                  <TableCell id="invoiceFootQty" className="text-right tabular-nums">
                    {formatNumber(visibleTotals.qty)}
                  </TableCell>
                  <TableCell className="text-center text-zinc-400">
                    -
                  </TableCell>
                  <TableCell id="invoiceFootAmount" className="text-right tabular-nums">
                    {formatNumber(visibleTotals.amount, 2)}
                  </TableCell>
                  <TableCell colSpan={2}></TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </section>
      </>
      )}
    </main>
  );
}
