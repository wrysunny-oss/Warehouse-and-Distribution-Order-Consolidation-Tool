import React, { useState, useMemo, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableFooter,
} from '@/components/ui/table';
import {
  Upload,
  FileSpreadsheet,
  Coins,
  ReceiptText,
  Calendar,
  Layers,
  Trash2,
  Download,
  Settings,
  Search,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { useFileDrop } from '@/lib/use-file-drop';
import { PlatformFeeConfigDialog } from '@/components/dialogs/PlatformFeeConfigDialog';
import { toast } from 'sonner';

export function PlatformFeeView({ notice }) {
  const [fileInfo, setFileInfo] = useState(null);
  const [rawRows, setRawRows] = useState([]);
  const [configOpen, setConfigOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'details'
  const [search, setSearch] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  // 报表标题与参数
  const [buyerShortName, setBuyerShortName] = useState('国宝');
  const [periodText, setPeriodText] = useState('');
  const [sellerName, setSellerName] = useState('浙江天猫供应链管理有限公司');
  const [categoryRemarks, setCategoryRemarks] = useState({});

  // 初始加载配置
  useEffect(() => {
    async function loadConfig() {
      try {
        if (window.excelTool?.getPlatformFeeConfig) {
          const cfg = await window.excelTool.getPlatformFeeConfig();
          if (cfg?.categoryRemarks) {
            setCategoryRemarks(cfg.categoryRemarks);
          }
        }
      } catch (e) {
        console.error('加载平台费用配置失败', e);
      }
    }
    loadConfig();
  }, []);

  // 解析并载入文件
  const handleLoadFile = async (filePath) => {
    try {
      if (!window.excelTool?.parsePlatformFeeFile) return;
      const res = await window.excelTool.parsePlatformFeeFile(filePath);
      setFileInfo({
        filePath: res.filePath,
        fileName: res.fileName,
        rowCount: res.rowCount,
      });
      setRawRows(res.rows || []);
      if (res.defaultBuyerShort) setBuyerShortName(res.defaultBuyerShort);
      if (res.defaultSeller) setSellerName(res.defaultSeller);
      if (res.defaultPeriodText) setPeriodText(res.defaultPeriodText);
      toast.success(`成功载入 ${res.rowCount} 笔流水单据`);
    } catch (err) {
      toast.error(`读取文件失败: ${err.message}`);
    }
  };

  const handleSelectFile = async () => {
    try {
      const filePath = await window.excelTool.openPlatformFeeFile();
      if (filePath) {
        await handleLoadFile(filePath);
      }
    } catch (err) {
      toast.error(`打开文件失败: ${err.message}`);
    }
  };

  const handleClearFile = () => {
    setFileInfo(null);
    setRawRows([]);
    setPeriodText('');
  };

  const dropProps = useFileDrop({
    onFilesDropped: (paths) => {
      if (paths.length > 0) handleLoadFile(paths[0]);
    },
  });

  // 保存财务备注配置
  const handleSaveRemarks = async (newRemarks) => {
    setCategoryRemarks(newRemarks);
    try {
      if (window.excelTool?.savePlatformFeeConfig) {
        await window.excelTool.savePlatformFeeConfig({ categoryRemarks: newRemarks });
        toast.success('财务科目配置已保存');
      }
    } catch (e) {
      toast.error(`保存配置失败: ${e.message}`);
    }
  };

  // 计算汇总结果
  const summaryResult = useMemo(() => {
    if (!rawRows || rawRows.length === 0) return null;
    const { calculatePlatformFeeSummary } = window.excelTool?.calculatePlatformFee
      ? { calculatePlatformFeeSummary: null }
      : {};

    // 前端直接汇总（与后端逻辑完全对称）
    const groupMap = new Map();
    for (const r of rawRows) {
      const content = r.invoiceContent || '未分类';
      const feeName = r.feeItemName || '未命名费用项';
      const amount = Number(r.amount) || 0;
      if (!groupMap.has(content)) groupMap.set(content, new Map());
      const itemMap = groupMap.get(content);
      itemMap.set(feeName, Math.round(((itemMap.get(feeName) || 0) + amount) * 100) / 100);
    }

    const defaultOrder = [
      '推广服务费', '客服服务费', '供应链管理服务费',
      '集货仓物流费', '技术服务费', '物流服务费'
    ];

    const defaultRemarks = {
      '推广服务费': '电商市场推广费',
      '客服服务费': '售后费用',
      '供应链管理服务费': '售后费用',
      '集货仓物流费': '电商物流费',
      '技术服务费': '电商运营费',
      '物流服务费': '电商物流费',
      ...categoryRemarks,
    };

    const categories = [];
    let totalAmount = 0;

    for (const [content, itemMap] of groupMap.entries()) {
      const items = [];
      let subtotal = 0;
      for (const [feeName, amt] of itemMap.entries()) {
        items.push({ feeItemName: feeName, amount: amt });
        subtotal += amt;
      }
      items.sort((a, b) => a.feeItemName.localeCompare(b.feeItemName, 'zh-Hans-CN'));
      categories.push({
        invoiceContent: content,
        items,
        subtotal: Math.round(subtotal * 100) / 100,
        remark: defaultRemarks[content] || '',
      });
    }

    categories.sort((a, b) => {
      let idxA = defaultOrder.indexOf(a.invoiceContent);
      let idxB = defaultOrder.indexOf(b.invoiceContent);
      if (idxA === -1) idxA = 999;
      if (idxB === -1) idxB = 999;
      if (idxA !== idxB) return idxA - idxB;
      return a.invoiceContent.localeCompare(b.invoiceContent, 'zh-Hans-CN');
    });

    categories.forEach((c, idx) => {
      c.index = idx + 1;
      totalAmount += c.subtotal;
    });
    totalAmount = Math.round(totalAmount * 100) / 100;

    const detailRows = rawRows.map((r) => {
      let genDate = '';
      if (r.billNo) {
        const m = String(r.billNo).match(/^[A-Za-z]?(\d{4})(\d{2})(\d{2})/);
        if (m) genDate = `${m[1]}-${m[2]}-${m[3]}`;
      }
      return {
        flowNo: r.flowNo,
        billNo: r.billNo,
        billGenDate: genDate || (r.date ? String(r.date).slice(0, 10) : ''),
        feeItemName: r.feeItemName,
        invoiceContent: r.invoiceContent,
        docDate: r.date ? String(r.date).slice(0, 10) : '',
        amount: r.amount,
      };
    });

    detailRows.sort((a, b) => {
      if (a.billNo !== b.billNo) return a.billNo.localeCompare(b.billNo);
      return a.flowNo.localeCompare(b.flowNo);
    });

    return {
      buyerShortName,
      sellerName,
      periodText,
      totalAmount,
      categories,
      categoryCount: categories.length,
      rowCount: rawRows.length,
      detailRows,
    };
  }, [rawRows, buyerShortName, sellerName, periodText, categoryRemarks]);

  // 搜索过滤汇总表
  const filteredCategories = useMemo(() => {
    if (!summaryResult?.categories) return [];
    if (!search.trim()) return summaryResult.categories;
    const q = search.trim().toLowerCase();

    return summaryResult.categories
      .map((cat) => {
        const matchCat = cat.invoiceContent.toLowerCase().includes(q) || (cat.remark && cat.remark.toLowerCase().includes(q));
        const matchedItems = cat.items.filter((it) => it.feeItemName.toLowerCase().includes(q));
        if (matchCat) return cat;
        if (matchedItems.length > 0) {
          const sub = matchedItems.reduce((s, it) => s + it.amount, 0);
          return {
            ...cat,
            items: matchedItems,
            subtotal: Math.round(sub * 100) / 100,
          };
        }
        return null;
      })
      .filter(Boolean);
  }, [summaryResult, search]);

  // 搜索过滤明细表
  const filteredDetails = useMemo(() => {
    if (!summaryResult?.detailRows) return [];
    if (!search.trim()) return summaryResult.detailRows;
    const q = search.trim().toLowerCase();
    return summaryResult.detailRows.filter(
      (r) =>
        (r.flowNo && r.flowNo.toLowerCase().includes(q)) ||
        (r.billNo && r.billNo.toLowerCase().includes(q)) ||
        (r.feeItemName && r.feeItemName.toLowerCase().includes(q)) ||
        (r.invoiceContent && r.invoiceContent.toLowerCase().includes(q))
    );
  }, [summaryResult, search]);

  // 导出 Excel (表二)
  const handleExport = async () => {
    if (!summaryResult) {
      toast.warning('请先导入开票流水文件');
      return;
    }
    setIsExporting(true);
    try {
      const defaultFileName = `${buyerShortName} 猫超平台费用明细_${periodText || '汇总'}.xlsx`;
      const res = await window.excelTool.exportPlatformFee({
        summaryResult,
        rawRows,
        defaultFileName,
      });
      if (res && res.filePath) {
        toast.success(`费用汇总导出成功: ${formatNumber(res.totalAmount, 2)} 元`);
      }
    } catch (err) {
      toast.error(`导出失败: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 顶部文件导入卡片 */}
      <Card
        {...dropProps}
        className={`p-4 border-dashed transition-colors ${
          dropProps.isDragging
            ? 'border-zinc-950 bg-zinc-50'
            : 'border-zinc-200 hover:border-zinc-300'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-zinc-900 text-white shrink-0">
              <Upload className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-zinc-900">
                  导入开票流水单据列表（表一）
                </span>
                <Badge variant="outline" className="text-[10px] text-zinc-600 bg-zinc-50">
                  支持 .xlsx / .csv
                </Badge>
              </div>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                支持拖拽或选择天猫后台导出的《开票流水单据列表》，系统将自动匹配费用大类与财务科目
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {fileInfo ? (
              <div className="flex items-center gap-2 bg-zinc-100/80 px-3 py-1.5 rounded-lg border border-zinc-200 text-xs">
                <FileSpreadsheet className="size-4 text-emerald-600 shrink-0" />
                <span className="font-medium text-zinc-800 max-w-[200px] truncate" title={fileInfo.fileName}>
                  {fileInfo.fileName}
                </span>
                <span className="text-[11px] text-zinc-500">
                  ({fileInfo.rowCount} 笔)
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClearFile}
                  className="size-5 text-zinc-400 hover:text-red-600 hover:bg-transparent ml-1"
                  title="移除文件"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ) : null}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSelectFile}
              className="text-xs shrink-0 cursor-pointer"
            >
              <FileSpreadsheet className="size-3.5 mr-1.5" />
              {fileInfo ? '重新选择' : '选择流水文件'}
            </Button>
          </div>
        </div>
      </Card>

      {/* 核心指标统计 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3.5 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-zinc-500">费用总金额</div>
            <div className="text-lg font-bold text-zinc-950 mt-0.5 font-mono">
              ¥ {formatNumber(summaryResult?.totalAmount || 0, 2)}
            </div>
          </div>
          <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700">
            <Coins className="size-5" />
          </div>
        </Card>

        <Card className="p-3.5 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-zinc-500">流水单据笔数</div>
            <div className="text-lg font-bold text-zinc-950 mt-0.5">
              {summaryResult?.rowCount || 0} <span className="text-xs font-normal text-zinc-500">笔</span>
            </div>
          </div>
          <div className="p-2 rounded-lg bg-blue-50 text-blue-700">
            <ReceiptText className="size-5" />
          </div>
        </Card>

        <Card className="p-3.5 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-zinc-500">费用大类</div>
            <div className="text-lg font-bold text-zinc-950 mt-0.5">
              {summaryResult?.categoryCount || 0} <span className="text-xs font-normal text-zinc-500">个分类</span>
            </div>
          </div>
          <div className="p-2 rounded-lg bg-purple-50 text-purple-700">
            <Layers className="size-5" />
          </div>
        </Card>

        <Card className="p-3.5 flex items-center justify-between">
          <div className="min-w-0 pr-1">
            <div className="text-[11px] font-medium text-zinc-500">账单周期</div>
            <div className="text-xs font-semibold text-zinc-800 mt-1 truncate" title={periodText || '未指定'}>
              {periodText || '未指定'}
            </div>
          </div>
          <div className="p-2 rounded-lg bg-amber-50 text-amber-700 shrink-0">
            <Calendar className="size-5" />
          </div>
        </Card>
      </div>

      {/* 报表参数配置与标题预览 */}
      <Card className="p-3.5 bg-zinc-50/50 border-zinc-200">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 flex-1 w-full">
            <div>
              <label className="text-[11px] font-medium text-zinc-600 block mb-1">
                商家简称 (品牌)
              </label>
              <Input
                size="sm"
                value={buyerShortName}
                onChange={(e) => setBuyerShortName(e.target.value)}
                placeholder="例如：国宝"
                className="h-8 text-xs bg-white"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-zinc-600 block mb-1">
                账单周期
              </label>
              <Input
                size="sm"
                value={periodText}
                onChange={(e) => setPeriodText(e.target.value)}
                placeholder="例如：2026.8.11-2026.9.1"
                className="h-8 text-xs bg-white font-mono"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-zinc-600 block mb-1">
                销方公司名称
              </label>
              <Input
                size="sm"
                value={sellerName}
                onChange={(e) => setSellerName(e.target.value)}
                placeholder="例如：浙江天猫供应链管理有限公司"
                className="h-8 text-xs bg-white"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-center shrink-0 pt-2 sm:pt-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfigOpen(true)}
              className="text-xs h-8 cursor-pointer text-zinc-700"
            >
              <Settings className="size-3.5 mr-1.5" />
              配置财务科目
            </Button>
          </div>
        </div>

        {/* 标题预览条 */}
        <div className="mt-2.5 pt-2 border-t border-zinc-200/80 flex items-center justify-between text-[11px] text-zinc-500">
          <div className="truncate">
            <span className="font-semibold text-zinc-700">导出大标题预览：</span>
            <span className="font-mono text-zinc-800 ml-1">
              {buyerShortName} 猫超平台费用明细（账单时间：{periodText || '全周期'}）（{sellerName}）
            </span>
          </div>
        </div>
      </Card>

      {/* 报表预览区域 */}
      <Card className="overflow-hidden">
        {/* 选项卡与搜索栏 */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between p-3 border-b border-zinc-200 gap-2 bg-zinc-50/30">
          <div className="flex items-center gap-1 bg-zinc-200/60 p-0.5 rounded-lg text-xs self-start">
            <Button variant="ghost" size="unstyled"
              type="button"
              onClick={() => setActiveTab('summary')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                activeTab === 'summary'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              费用汇总表（表二）
            </Button>
            <Button variant="ghost" size="unstyled"
              type="button"
              onClick={() => setActiveTab('details')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                activeTab === 'details'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              流水明细打印表
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-60">
              <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <Input
                size="sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索费用项 / 开票内容..."
                className="pl-8 h-8 text-xs bg-white"
              />
            </div>

            <Button
              type="button"
              size="sm"
              onClick={handleExport}
              disabled={!summaryResult || isExporting}
              className="bg-zinc-950 text-white hover:bg-zinc-800 text-xs h-8 shrink-0 cursor-pointer"
            >
              <Download className="size-3.5 mr-1.5" />
              {isExporting ? '导出中...' : '导出费用汇总 Excel'}
            </Button>
          </div>
        </div>

        {/* 报表主体 */}
        <div className="overflow-x-auto max-h-[520px]">
          {activeTab === 'summary' ? (
            <Table>
              <TableHeader className="bg-zinc-100/70 sticky top-0 z-10">
                <TableRow>
                  <TableHead className="w-16 text-center text-xs font-semibold text-zinc-700">序号</TableHead>
                  <TableHead className="w-40 text-center text-xs font-semibold text-zinc-700">开票内容</TableHead>
                  <TableHead className="text-left text-xs font-semibold text-zinc-700">费用项名称</TableHead>
                  <TableHead className="w-36 text-center text-xs font-semibold text-zinc-700">开票金额 (元)</TableHead>
                  <TableHead className="w-44 text-center text-xs font-semibold text-zinc-700">备注 (财务科目)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCategories.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-40 text-center text-zinc-400 text-xs">
                      {rawRows.length === 0 ? '请先在上方导入开票流水单据文件' : '没有匹配的费用项'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCategories.map((cat) => (
                    <React.Fragment key={cat.invoiceContent}>
                      {/* 明细行 */}
                      {cat.items.map((item, idx) => (
                        <TableRow key={item.feeItemName} className="hover:bg-zinc-50/60 text-xs">
                          {idx === 0 && (
                            <TableCell
                              rowSpan={cat.items.length + 1}
                              className="text-center font-medium text-zinc-700 border-r border-zinc-200 bg-zinc-50/20"
                            >
                              {cat.index}
                            </TableCell>
                          )}
                          {idx === 0 && (
                            <TableCell
                              rowSpan={cat.items.length}
                              className="text-center font-medium text-zinc-900 border-r border-zinc-200 bg-zinc-50/20"
                            >
                              {cat.invoiceContent}
                            </TableCell>
                          )}
                          <TableCell className="text-left text-zinc-800">
                            {item.feeItemName}
                          </TableCell>
                          <TableCell className="text-center font-mono text-zinc-800">
                            {formatNumber(item.amount, 2)}
                          </TableCell>
                          <TableCell className="text-center text-zinc-400">
                            {/* 明细备注留空 */}
                          </TableCell>
                        </TableRow>
                      ))}

                      {/* 大类小计汇总行 */}
                      <TableRow className="bg-zinc-100/60 font-semibold text-xs border-b-2 border-zinc-200">
                        <TableCell className="text-center text-zinc-900 border-r border-zinc-200">
                          {cat.invoiceContent} 汇总
                        </TableCell>
                        <TableCell className="text-left text-zinc-400">
                          —
                        </TableCell>
                        <TableCell className="text-center font-mono text-zinc-950 text-sm">
                          {formatNumber(cat.subtotal, 2)}
                        </TableCell>
                        <TableCell className="text-center text-zinc-900 font-medium">
                          {cat.remark ? (
                            <Badge variant="outline" className="font-normal bg-white text-zinc-800">
                              {cat.remark}
                            </Badge>
                          ) : (
                            <span className="text-zinc-400 font-normal">未设置</span>
                          )}
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  ))
                )}
              </TableBody>

              {summaryResult && (
                <TableFooter className="bg-zinc-950 text-white sticky bottom-0 z-10">
                  <TableRow className="hover:bg-zinc-950">
                    <TableCell className="text-center text-xs font-bold text-zinc-400">总计</TableCell>
                    <TableCell className="text-center text-xs font-bold" colSpan={2}>
                      全表费用汇总总计
                    </TableCell>
                    <TableCell className="text-center font-mono text-base font-bold text-emerald-400">
                      ¥ {formatNumber(summaryResult.totalAmount, 2)}
                    </TableCell>
                    <TableCell className="text-center text-xs text-zinc-400">
                      共 {summaryResult.categoryCount} 类 / {summaryResult.rowCount} 笔
                    </TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          ) : (
            /* 流水明细打印表 */
            <Table>
              <TableHeader className="bg-zinc-100/70 sticky top-0 z-10">
                <TableRow>
                  <TableHead className="w-48 text-center text-xs font-semibold text-zinc-700">待开票流水主单号</TableHead>
                  <TableHead className="w-44 text-center text-xs font-semibold text-zinc-700">对账单号</TableHead>
                  <TableHead className="w-28 text-center text-xs font-semibold text-zinc-700">账单生成时间</TableHead>
                  <TableHead className="text-left text-xs font-semibold text-zinc-700">费用项名称</TableHead>
                  <TableHead className="w-36 text-center text-xs font-semibold text-zinc-700">开票内容</TableHead>
                  <TableHead className="w-28 text-center text-xs font-semibold text-zinc-700">单据日期</TableHead>
                  <TableHead className="w-32 text-center text-xs font-semibold text-zinc-700">开票金额 (元)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDetails.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-40 text-center text-zinc-400 text-xs">
                      没有流水明细
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDetails.map((d) => (
                    <TableRow key={d.flowNo || `${d.billNo}-${d.feeItemName}`} className="hover:bg-zinc-50 text-xs font-normal">
                      <TableCell className="text-center font-mono text-[11px] text-zinc-600">{d.flowNo}</TableCell>
                      <TableCell className="text-center font-mono text-[11px] text-zinc-600">{d.billNo}</TableCell>
                      <TableCell className="text-center font-mono text-zinc-700">{d.billGenDate}</TableCell>
                      <TableCell className="text-left text-zinc-800">{d.feeItemName}</TableCell>
                      <TableCell className="text-center text-zinc-700">{d.invoiceContent}</TableCell>
                      <TableCell className="text-center font-mono text-zinc-600">{d.docDate}</TableCell>
                      <TableCell className="text-center font-mono text-zinc-950 font-medium">{formatNumber(d.amount, 2)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>

              {summaryResult && (
                <TableFooter className="bg-zinc-950 text-white sticky bottom-0 z-10">
                  <TableRow className="hover:bg-zinc-950">
                    <TableCell colSpan={6} className="text-right text-xs font-bold pr-4">
                      合计
                    </TableCell>
                    <TableCell className="text-center font-mono text-sm font-bold text-emerald-400">
                      ¥ {formatNumber(summaryResult.totalAmount, 2)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          )}
        </div>
      </Card>

      {/* 配置弹窗 */}
      <PlatformFeeConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        categoryRemarks={categoryRemarks}
        onSaveRemarks={handleSaveRemarks}
      />
    </div>
  );
}
