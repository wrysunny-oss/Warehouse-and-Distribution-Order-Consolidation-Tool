import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Sparkles,
  Upload,
  Download,
  Search,
  FileSpreadsheet,
  TrendingUp,
  Coins,
  Package,
  Layers,
  Radio,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Copy,
  Plus,
  RefreshCw,
  HelpCircle,
  Eye,
  Trash2,
  Bot,
  Loader2,
  Play
} from 'lucide-react';
import { toast } from 'sonner';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { selectItems, summarize, unitPrice, reviewKind } from '../../../../shared/competitor-analysis.mjs';
import { CompetitorReviewsDialog } from '@/components/dialogs/CompetitorReviewsDialog';
import { loadCompetitorCache, saveCompetitorCache } from '@/lib/competitor-cache';

/**
 * 客户端备用矢量大米包装图生成器 (确保无论网络断网、防盗链均 100% 正常清晰展示)
 */
function getFallbackRiceSvg(item) {
  const variety = item.variety || '大米';
  const escapeXml = value => String(value).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
  const shortVariety = escapeXml(variety.split(' ')[0] || '大米');
  const spec = escapeXml(item.spec || '未识别');
  const isVacuum = (item.packaging || '').includes('真空');

  let bgColor = '#f8fafc';
  let accentColor = '#eab308';
  let headerColor = '#0f172a';

  if (shortVariety.includes('珍珠')) {
    bgColor = '#ecfdf5';
    accentColor = '#10b981';
    headerColor = '#064e3b';
  } else if (shortVariety.includes('长粒')) {
    bgColor = '#eff6ff';
    accentColor = '#3b82f6';
    headerColor = '#1e3a8a';
  } else if (shortVariety.includes('小町')) {
    bgColor = '#fffbeb';
    accentColor = '#f59e0b';
    headerColor = '#78350f';
  } else if (shortVariety.includes('丝苗')) {
    bgColor = '#f0fdfa';
    accentColor = '#14b8a6';
    headerColor = '#0f766e';
  } else if (shortVariety.includes('富硒')) {
    bgColor = '#faf5ff';
    accentColor = '#a855f7';
    headerColor = '#581c87';
  } else if (shortVariety.includes('五常')) {
    bgColor = '#fefce8';
    accentColor = '#ca8a04';
    headerColor = '#422006';
  }

  const bagShape = isVacuum
    ? `<rect x="36" y="24" width="88" height="116" rx="8" fill="${bgColor}" stroke="${accentColor}" stroke-width="2" />
       <path d="M42 24 L52 14 L108 14 L118 24 Z" fill="${accentColor}" opacity="0.9" />`
    : `<rect x="32" y="30" width="96" height="112" rx="14" fill="${bgColor}" stroke="${accentColor}" stroke-width="2" />
       <path d="M40 30 Q80 18 120 30" stroke="${accentColor}" stroke-width="3" fill="none" />
       <rect x="58" y="14" width="44" height="16" rx="8" fill="none" stroke="${accentColor}" stroke-width="2" />`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
    <rect width="160" height="160" rx="14" fill="#ffffff" stroke="#e2e8f0" stroke-width="1" />
    ${bagShape}
    <rect x="44" y="44" width="72" height="32" rx="4" fill="${headerColor}" opacity="0.9" />
    <text x="80" y="58" fill="#ffffff" font-size="11" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-weight="bold" text-anchor="middle">${shortVariety}</text>
    <text x="80" y="71" fill="${accentColor}" font-size="9" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-weight="bold" text-anchor="middle">示意图 · 非商品主图</text>
    <circle cx="80" cy="98" r="14" fill="${accentColor}" opacity="0.2" />
    <path d="M80 88 C74 94 76 104 80 108 C84 104 86 94 80 88 Z" fill="${accentColor}" />
    <rect x="54" y="116" width="52" height="16" rx="8" fill="${accentColor}" />
    <text x="80" y="128" fill="#ffffff" font-size="10" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-weight="bold" text-anchor="middle">${spec}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function CompetitorView() {
  const [items, setItems] = useState(() => {
    try {
      const saved = localStorage.getItem('competitor_items');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed.filter(i => i && typeof i === 'object' && typeof i.title === 'string').map(i => i.source ? i : {
        ...i, source: /^TF_RICE_/.test(i.itemId || '') ? 'sample' : 'legacy', isRealReview: false
      }) : [];
    } catch {
      return [];
    }
  });

  const [receiverRunning, setReceiverRunning] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | '引流款' | '主推款' | '利润款'
  const [varietyFilter, setVarietyFilter] = useState('all');
  const [sortBy, setSortBy] = useState('rank');
  const [page, setPage] = useState(1);
  const [reviewFilter, setReviewFilter] = useState('all');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [exportScope, setExportScope] = useState('filtered');
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [undoItems, setUndoItems] = useState(null);
  const [importMode, setImportMode] = useState('replace');
  const crawlRun = useRef(0);
  const acceptItems = (incoming) => {
    if (!Array.isArray(incoming) || !incoming.length) return;
    setItems(previous => {
      setUndoItems(previous);
      if (importMode === 'replace') return incoming;
      // Preserve distinct SKUs; update only the same identified product + spec.
      const next = [...previous];
      for (const item of incoming) {
        const key = item.itemId || item.link;
        const index = key ? next.findIndex(i => (i.itemId || i.link) === key && i.spec === item.spec) : -1;
        if (index < 0) next.push(item); else next[index] = { ...next[index], ...item };
      }
      return next;
    });
  };
  const [isExporting, setIsExporting] = useState(false);
  const [helperDialogOpen, setHelperDialogOpen] = useState(false);
  const [pasteDialogOpen, setPasteDialogOpen] = useState(false);
  const [pasteContent, setPasteContent] = useState('');
  const [hoverItem, setHoverItem] = useState(null);
  const [reviewItem, setReviewItem] = useState(null);
  const initialItems = useRef(items);
  const [cacheReady, setCacheReady] = useState(false);

  // 模式 B 内置自动化浏览器状态
  const [crawlerDialogOpen, setCrawlerDialogOpen] = useState(false);
  const [crawlExisting, setCrawlExisting] = useState(false);
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlProgress, setCrawlProgress] = useState(null);
  const [crawlKeyword, setCrawlKeyword] = useState('https://tmai.tmall.com/search.htm?keyword=%B4%F3%C3%D7+&spm=a21xtw.29978516.0.0');
  const [crawlLimit, setCrawlLimit] = useState(20);
  const [deepReviewLimit, setDeepReviewLimit] = useState(50);

  const acceptRef = useRef(acceptItems);
  acceptRef.current = acceptItems;

  // 监听模式 B 自动化采集进度
  useEffect(() => {
    if (!window.excelTool?.onCompetitorCrawlProgress) return;
    const unsub = window.excelTool.onCompetitorCrawlProgress((prog) => {
      setCrawlProgress(prog);
      if (prog.stage === 'item_completed' && prog.item) {
        setItems(previous => previous.map((item, index) => String(item.itemId) === String(prog.item.itemId) && (String(item.skuId || '') === String(prog.item.skuId || '') || (!item.skuId && index === prog.current - 1)) ? { ...item, ...prog.item } : item));
      }
    });
    return () => {
      if (unsub) unsub();
    };
  }, []);

  // 启动模式 B 内置浏览器自动化抓取
  const handleStartCrawl = async () => {
    if (isCrawling) return;
    const limit = Number(crawlLimit);
    if (crawlExisting && (items.length < 1 || items.length > 50)) {
      toast.error('补采支持 1–50 款带商品链接的数据');
      return;
    }
    if (!crawlExisting && (!Number.isInteger(limit) || limit < 5 || limit > 50)) {
      toast.error('采集数量请输入 5–50 之间的整数');
      return;
    }
    if (!window.excelTool?.startCompetitorCrawl) { toast.error('请在桌面端使用内置采集'); return; }
    const run = ++crawlRun.current;
    setIsCrawling(true);
    setCrawlProgress({ stage: 'started', message: '正在启动桌面端 Chromium 自动化会话...' });
    try {
      const result = await window.excelTool.startCompetitorCrawl({
        keyword: crawlKeyword.trim() || '淘工厂 大米',
        limit: Number(crawlLimit) || 20,
        deepReviewLimit: Number(deepReviewLimit),
        sort: 'sale-desc',
        showWindow: true,
        seedItems: crawlExisting ? items : undefined
      });
      if (run !== crawlRun.current) return;
      if (Array.isArray(result) && result.length > 0) {
        if (crawlExisting) { setUndoItems(items); setItems(result); }
        else acceptRef.current(result);
        const incomplete = result.filter(item => item.detailStatus !== '详情已读取').length;
        if (result.some(item => item.reviewRateLimited)) toast.warning('平台限制访问，本轮已停止后续请求并保存已读结果，请稍后手动重试');
        else if (incomplete) toast.warning(`已载入 ${result.length} 款商品，${incomplete} 款有字段待补充，请查看商品下方的采集说明`);
        else toast.success(`已载入 ${result.length} 款商品详情，请按价格口径与评价状态核对数据`);
        setCrawlerDialogOpen(false);
      } else {
        toast.warning('未获取到有效商品数据，请重试');
      }
    } catch (err) {
      if (run === crawlRun.current) toast.error(`采集任务中断: ${err.message}`);
    } finally {
      if (run === crawlRun.current) setIsCrawling(false);
    }
  };

  // 终止模式 B 采集
  const handleStopCrawl = async () => {
    try {
      ++crawlRun.current;
      if (window.excelTool?.stopCompetitorCrawl) {
        await window.excelTool.stopCompetitorCrawl();
      }
      setIsCrawling(false);
      toast.info('已终止内置采集任务');
    } catch (err) {
      console.error(err);
    }
  };

  const handleContinueCrawl = async () => {
    try {
      const result = await window.excelTool?.continueCompetitorCrawl?.();
      if (!result?.ok) toast.error(result?.message || '请重新启动桌面端后重试');
      else setCrawlProgress({ stage: 'resuming', message: '正在检查页面；如仍需验证，将继续等待。' });
    } catch (err) { toast.error(`继续采集失败: ${err.message}`); }
  };

  // 本地存储同步
  useEffect(() => {
    let active = true;
    loadCompetitorCache().then(saved => {
      if (active && Array.isArray(saved)) setItems(current => current === initialItems.current ? saved : current);
    }).catch(() => { if (active) toast.warning('评价缓存读取失败，可重新补采或导入备份'); })
      .finally(() => { if (active) setCacheReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!cacheReady) return;
    saveCompetitorCache(items).catch(() => toast.error('完整评价保存失败，请导出 Excel 或 JSON 备份'));
    try {
      localStorage.setItem('competitor_items', JSON.stringify(items.map(({ reviews, ...item }) => item)));
    } catch (e) {
      console.error('保存竞品数据失败:', e);
    }
  }, [items, cacheReady]);

  // 监听来自浏览器扩展或本地推送的数据
  useEffect(() => {
    if (!window.excelTool?.onCompetitorDataReceived) return;
    const unsubscribe = window.excelTool.onCompetitorDataReceived((newItems, meta) => {
      if (meta?.isSingleReviewUpdate && newItems?.[0]?.itemId) {
        const update = newItems[0];
        setItems((prev) => {
          const idx = prev.findIndex((i) => String(i.itemId) === String(update.itemId));
          if (idx !== -1) {
            const next = prev.map(item => String(item.itemId) === String(update.itemId) ? {
              ...item,
              negativeReviews: update.negativeReviews,
              isRealReview: update.isRealReview === true,
              reviewSource: 'collected',
              ...(Array.isArray(update.reviews) ? {
                reviews: update.reviews, reviewCount: update.reviewCount,
                reviewScope: update.reviewScope, reviewComplete: update.reviewComplete,
                reviewListExhausted: update.reviewListExhausted, reviewExcludedCount: update.reviewExcludedCount,
                reviewTotal: update.reviewTotal, reviewStatus: update.reviewStatus,
                reviewRateLimited: update.reviewRateLimited, reviewStopReason: update.reviewStopReason,
                ...(update.reviewRateLimited && !update.reviewCount && item.reviews?.length ? {
                  reviews: item.reviews, reviewCount: item.reviews.length,
                  reviewStatus: `${update.reviewStatus}；保留上次${item.reviews.length}条已保存评价`
                } : {})
              } : {})
            } : item);
            if (update.reviewRateLimited) toast.warning('浏览器采集受到访问限制，已保存读取结果，请稍后手动重试');
            else toast.success(`已为「${next[idx].title.slice(0, 10)}...」更新商详页真实买家评价！`);
            return next;
          }
          return prev;
        });
      } else if (Array.isArray(newItems) && newItems.length > 0) {
        acceptRef.current(newItems);
        toast.success(`已实时接收浏览器扩展同步的 ${newItems.length} 款竞品数据！`);
      }
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // 启动/停止本地接收服务
  const toggleReceiver = async () => {
    if (!window.excelTool?.startCompetitorReceiver) return;
    try {
    if (receiverRunning) {
      await window.excelTool.stopCompetitorReceiver();
      setReceiverRunning(false);
      toast.info('已停止浏览器扩展本地接收监听');
    } else {
      try {
        const res = await window.excelTool.startCompetitorReceiver({ port: 41235 });
        if (res?.status === 'running') {
          setReceiverRunning(true);
          toast.success('本地接收服务已在 127.0.0.1:41235 启动，可随时接收油猴插件推送');
        }
      } catch (err) {
        toast.error(`启动本地接收服务失败: ${err.message}`);
      }
    }
    } catch (err) {
      toast.error(`停止接收服务失败: ${err.message}`);
    }
  };

  // 加载 Top 20 示例演示数据
  const handleLoadSample = async () => {
    try {
      if (!window.excelTool?.getCompetitorSample) return;
      const sample = await window.excelTool.getCompetitorSample();
      acceptRef.current(sample || []);
      toast.success('已载入淘工厂大米销量 Top 20 演示数据（非市场实测）！');
    } catch (err) {
      toast.error(`载入示例失败: ${err.message}`);
    }
  };

  // 导入本地 JSON 文件
  const handleImportFile = async () => {
    try {
      if (!window.excelTool?.importCompetitorFile) return;
      const imported = await window.excelTool.importCompetitorFile();
      if (imported && imported.length > 0) {
        acceptRef.current(imported);
        toast.success(`成功导入 ${imported.length} 款竞品数据`);
      }
    } catch (err) {
      toast.error(`导入文件失败: ${err.message}`);
    }
  };

  // 粘贴导入
  const handleConfirmPaste = async () => {
    if (!pasteContent.trim()) {
      toast.error('请粘贴有效的 JSON 数据或文本');
      return;
    }
    try {
      const parsed = JSON.parse(pasteContent);
      const normalized = await window.excelTool.parseCompetitorData(
        parsed
      );
      if (normalized && normalized.length > 0) {
        acceptRef.current(normalized);
        setPasteDialogOpen(false);
        setPasteContent('');
        toast.success(`成功解析并载入 ${normalized.length} 款竞品数据`);
      } else {
        toast.error('未从粘贴内容中识别到有效商品');
      }
    } catch (err) {
      toast.error(`JSON 解析失败，请检查格式: ${err.message}`);
    }
  };

  // 导出高保真 Excel
  const handleExportExcel = async () => {
    const exportItems = exportScope === 'all' ? items : filteredItems;
    if (!exportItems.length) {
      toast.error('当前导出范围暂无竞品数据');
      return;
    }
    setIsExporting(true);
    try {
      const res = await window.excelTool.exportCompetitorExcel({ items: exportItems });
      if (res?.filePath) {
        toast.success(`已成功导出分析 Excel：${res.filePath}`);
      }
    } catch (err) {
      toast.error(`导出失败: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // 更新某行数据
  const updateItemField = (index, field, value) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      if (field === 'negativeReviews') {
        next[index].isRealReview = false;
        next[index].reviewSource = 'manual';
      }
      if (field === 'remark') next[index].remarkManual = true;
      return next;
    });
  };

  // 清空列表
  const handleClear = () => {
    setUndoItems(items);
    setItems([]);
    setClearDialogOpen(false);
    toast.info('已清空当前竞品列表');
  };

  // 获取所有可用的米种列表（去重）
  const availableVarieties = useMemo(() => {
    const set = new Set();
    items.forEach((i) => {
      if (i.variety) set.add(i.variety);
    });
    return Array.from(set);
  }, [items]);

  const resetFilters = () => {
    setSearchQuery(''); setTypeFilter('all'); setVarietyFilter('all');
    setReviewFilter('all'); setMinPrice(''); setMaxPrice(''); setSortBy('rank');
  };
  const filteredItems = useMemo(() => selectItems(items, {
    query: searchQuery, type: typeFilter, variety: varietyFilter, review: reviewFilter,
    sort: sortBy, min: minPrice, max: maxPrice
  }), [items, searchQuery, typeFilter, varietyFilter, reviewFilter, sortBy, minPrice, maxPrice]);
  const metrics = useMemo(() => summarize(filteredItems), [filteredItems]);
  const allMetrics = useMemo(() => summarize(items), [items]);
  const itemIndices = useMemo(() => new Map(items.map((item, index) => [item, index])), [items]);
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / 100));
  const currentPage = Math.min(page, pageCount);
  const pageItems = filteredItems.slice((currentPage - 1) * 100, currentPage * 100);
  useEffect(() => { setPage(1); }, [searchQuery, typeFilter, varietyFilter, reviewFilter, sortBy, minPrice, maxPrice]);

  return (
    <main id="competitorView" className="flex-1 min-h-0 min-w-0 p-4 sm:p-5 flex flex-col gap-3.5 select-none overflow-y-auto bg-slate-50">
      {/* 顶部标题栏与核心操作 (浅色白底卡片) */}
      <section className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-3 px-4 py-3 rounded-xl border border-slate-200/90 bg-white shadow-xs shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200/80">
            <TrendingUp className="size-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold tracking-tight text-slate-900">
                淘工厂大米 竞品分析洞察
              </h2>
              <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[11px] font-medium whitespace-nowrap">
                采集 · 比价 · 导出
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              对比商品到手价与每公斤单价，核对评价来源；汇总指标随筛选更新。款式定位仅供参考。
            </p>
          </div>
        </div>

        {/* 顶部操作按钮组 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 模式 B：内置自动化浏览器抓取 */}
          <Button
            id="startModeBBrowserCrawlBtn"
            variant="outline"
            size="sm"
            onClick={() => { setCrawlExisting(false); setCrawlerDialogOpen(true); }}
            className="bg-indigo-50 border-indigo-200 hover:bg-indigo-100 text-indigo-700 text-xs gap-1.5 cursor-pointer font-medium shadow-xs h-8"
            title="模式 B：在桌面端内直接启动 Chromium 自动化采集 Top 20 竞品"
          >
            <Bot className="size-3.5 text-indigo-600" />
            模式 B：内置浏览器采集
          </Button>
          {items.length > 0 && <Button size="sm" variant="outline" disabled={isCrawling} onClick={() => { setCrawlExisting(true); setCrawlerDialogOpen(true); }}>补采当前列表详情</Button>}

          <Button
            variant="outline"
            size="sm"
            onClick={toggleReceiver}
            className={`text-xs gap-1.5 border cursor-pointer h-8 shadow-xs ${
              receiverRunning
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
            title="模式 A：接收来自 Chrome/Edge 油猴扩展的实时推送数据"
          >
            <Radio className={`size-3.5 ${receiverRunning ? 'animate-pulse text-emerald-600' : 'text-slate-400'}`} />
            {receiverRunning ? '模式A监听中 (:41235)' : '模式A助手监听'}
          </Button>

          <Button
            id="openHelperDialogBtn"
            variant="ghost"
            size="sm"
            onClick={() => setHelperDialogOpen(true)}
            className="text-slate-500 hover:text-slate-800 hover:bg-slate-100 text-xs px-2 h-8 cursor-pointer rounded-lg"
            title="查看模式 A 油猴脚本安装使用指南"
          >
            <HelpCircle className="size-4" />
          </Button>

          <Button
            id="loadSampleBtn"
            variant="outline"
            size="sm"
            onClick={handleLoadSample}
            className="bg-white border-slate-200 hover:bg-slate-50 text-slate-700 text-xs gap-1.5 cursor-pointer shadow-xs h-8"
          >
            <Sparkles className="size-3.5 text-amber-500" />
            载入Top20示例
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setPasteDialogOpen(true)}
            className="bg-white border-slate-200 hover:bg-slate-50 text-slate-700 text-xs gap-1.5 cursor-pointer shadow-xs h-8"
          >
            <Plus className="size-3.5" />
            粘贴数据
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleImportFile}
            className="bg-white border-slate-200 hover:bg-slate-50 text-slate-700 text-xs gap-1.5 cursor-pointer shadow-xs h-8"
          >
            <Upload className="size-3.5" />
            导入JSON
          </Button>

          {items.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setClearDialogOpen(true)}
              className="bg-white border-red-200 text-red-600 hover:bg-red-50 text-xs px-2 h-8 cursor-pointer shadow-xs"
              title="清空当前数据"
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}

          <Button
            size="sm"
            onClick={handleExportExcel}
            disabled={isExporting || (exportScope === 'all' ? items : filteredItems).length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs gap-1.5 shadow-xs cursor-pointer h-8 disabled:opacity-50"
          >
            <Download className="size-3.5" />
            {isExporting ? '正在导出...' : `导出 Excel (${exportScope === 'all' ? items.length : filteredItems.length} 款)`}
          </Button>
        </div>
      </section>

      {/* 核心指标统计卡片看板 (白底清爽风格) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        {/* 卡片 1: 商品与链接规模 */}
        <Card className="bg-white border border-slate-200/90 p-3.5 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">监测商品 / 独立链接</span>
            <Package className="size-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono">{metrics.totalCount}</span>
            <span className="text-xs text-slate-500">款 SKU</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1.5">
            <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
            覆盖 <span className="text-slate-800 font-semibold">{metrics.uniqueLinks}</span> 个独立链接 · 当前筛选范围
          </div>
        </Card>

        {/* 卡片 2: 到手价与引流门槛 */}
        <Card className="bg-white border border-slate-200/90 p-3.5 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">券后均价 / 最低引流门槛</span>
            <Coins className="size-4 text-amber-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-600 font-mono">¥{metrics.avgPrice}</span>
            <span className="text-xs text-slate-500">平均到手</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            最低已知到手价 <span className="text-amber-600 font-mono font-bold">¥{metrics.minPrice}</span> · 缺价 {metrics.missingPrices} 款
          </div>
        </Card>

        {/* 卡片 3: 主流规格与包装结构 */}
        <Card className="bg-white border border-slate-200/90 p-3.5 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">主力规格与包装占比</span>
            <Layers className="size-4 text-blue-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-base font-semibold text-slate-900">
              {metrics.specStats[0]?.name || '—'} ({metrics.specStats[0]?.percent || 0}%)
            </span>
            <span className="text-xs text-slate-500">
              · {metrics.packagingStats[0]?.name || '—'} ({metrics.packagingStats[0]?.percent || 0}%)
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 truncate">
            {metrics.specStats.slice(0, 3).map((s) => `${s.name}: ${s.percent}%`).join(' | ')}
          </div>
        </Card>

        {/* 卡片 4: 高频差评痛点聚焦 */}
        <Card className="bg-white border border-slate-200/90 p-3.5 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">采集评价主题（按商品数）</span>
            <AlertTriangle className="size-4 text-rose-500" />
          </div>
          <div className="text-xs text-slate-800 font-medium truncate">
            {metrics.topNegativeTopics[0]?.tag || (metrics.collectedReviews ? '已读样本暂无负面反馈' : '暂无采集评价')}
          </div>
          <div className="mt-2 text-[11px] text-rose-600 truncate font-medium">
            {`已读评价 ${metrics.collectedReviews}/${metrics.totalCount} 款 · 负面反馈 ${metrics.negativeReviewProducts} 款`}
          </div>
        </Card>
      </section>

      <section className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-600" aria-live="polite">
        <span>每公斤单价中位数 <strong className="text-emerald-700 tabular-nums">{metrics.medianUnit === '—' ? '—' : `¥${metrics.medianUnit}/kg`}</strong></span>
        <span>可比价 {metrics.comparableCount}/{metrics.totalCount} 款 · 不含运费</span>
        {allMetrics.sampleCount > 0 && <span className="text-amber-800">含 {allMetrics.sampleCount} 款示例数据，仅供演示</span>}
        {items.some(i => i.source === 'legacy') && <span className="text-amber-800">旧版缓存可能含自动补值，建议重新采集或导入核对。</span>}
        {items.some(i => i.detailStatus) && <span className="text-amber-800">详情待补充 {items.filter(i => i.detailStatus !== '详情已读取').length} 款，逐款原因见商品下方</span>}
        <span className="ml-auto">数据载入方式</span>
        <Select value={String((importMode) ?? '')} onValueChange={value => setImportMode(value)}>
                      <SelectTrigger aria-label="数据载入方式" className="h-8 w-56 text-xs"><SelectValue placeholder="请选择" /></SelectTrigger>
                      <SelectContent><SelectGroup>
          <SelectItem value="replace">替换当前列表</SelectItem><SelectItem value="merge">合并（同链接同规格更新）</SelectItem>
        </SelectGroup></SelectContent>
                    </Select>
        {undoItems && <Button size="sm" variant="outline" onClick={() => { setItems(undoItems); setUndoItems(null); }}>撤销上次载入 / 清空</Button>}
      </section>
      {/* 表格工具栏：搜索、分类筛选与统计信息 */}
      <section className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-2.5 rounded-xl border border-slate-200/90 shadow-xs shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          {/* 款式类型过滤 */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs">
            {['all', '引流款', '主推款', '利润款'].map((t) => (
              <Button variant="ghost" size="unstyled"
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer text-xs ${
                  typeFilter === t
                    ? 'bg-white text-slate-900 font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t === 'all' ? '全部款式' : t}
              </Button>
            ))}
          </div>

          {/* 米种过滤 */}
          {availableVarieties.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 text-[11px]">米种:</span>
              <Select value={String((varietyFilter) ?? '')} onValueChange={value => setVarietyFilter(value)}>
                      <SelectTrigger aria-label="米种筛选" className="h-8 w-44 text-xs"><SelectValue placeholder="请选择" /></SelectTrigger>
                      <SelectContent><SelectGroup>
                <SelectItem value="all">全部米种</SelectItem>
                {availableVarieties.map((v) => (
                  <SelectItem key={v} value={String(v)}>
                    {v}
                  </SelectItem>
                ))}
              </SelectGroup></SelectContent>
                    </Select>
            </div>
          )}
        </div>

        {/* 关键字搜索输入 */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
          <Input
            aria-label="搜索竞品"
            placeholder="搜索商品标题、差评、米种..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 rounded-lg focus:bg-white"
          />
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span className="tabular-nums" role="status">显示 {filteredItems.length} / {items.length} 款</span>
        <Select value={String((sortBy) ?? '')} onValueChange={value => setSortBy(value)}>
                      <SelectTrigger aria-label="排序方式" className="h-8 w-44 text-xs"><SelectValue placeholder="请选择" /></SelectTrigger>
                      <SelectContent><SelectGroup>
          <SelectItem value="rank">原始排名</SelectItem><SelectItem value="price-asc">到手价：低到高</SelectItem><SelectItem value="price-desc">到手价：高到低</SelectItem>
          <SelectItem value="unit-asc">元/kg：低到高</SelectItem><SelectItem value="unit-desc">元/kg：高到低</SelectItem><SelectItem value="sales">销量：高到低</SelectItem>
        </SelectGroup></SelectContent>
                    </Select>
        <Select value={String((reviewFilter) ?? '')} onValueChange={value => setReviewFilter(value)}>
                      <SelectTrigger aria-label="评价来源筛选" className="h-8 w-44 text-xs"><SelectValue placeholder="请选择" /></SelectTrigger>
                      <SelectContent><SelectGroup>
          <SelectItem value="all">全部评价来源</SelectItem><SelectItem value="collected">有采集评价</SelectItem><SelectItem value="missing">待补采集评价</SelectItem>
        </SelectGroup></SelectContent>
                    </Select>
        <Input type="number" min="0" aria-label="最低到手价" placeholder="最低价 ¥" value={minPrice} onChange={e => setMinPrice(e.target.value)} className="w-28 h-8 bg-white text-xs" />
        <span>至</span>
        <Input type="number" min="0" aria-label="最高到手价" placeholder="最高价 ¥" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} className="w-28 h-8 bg-white text-xs" />
        {minPrice !== '' && maxPrice !== '' && Number(minPrice) > Number(maxPrice) && <span className="text-red-700">最低价应小于或等于最高价</span>}
        <Button size="sm" variant="ghost" onClick={resetFilters}>重置筛选</Button>
        <Select value={String((exportScope) ?? '')} onValueChange={value => setExportScope(value)}>
                      <SelectTrigger aria-label="导出范围" className="h-8 w-40 ml-auto text-xs"><SelectValue placeholder="请选择" /></SelectTrigger>
                      <SelectContent><SelectGroup>
          <SelectItem value="filtered">导出当前筛选</SelectItem><SelectItem value="all">导出全部数据</SelectItem>
        </SelectGroup></SelectContent>
                    </Select>
      </section>
      {/* 
        竞品明细数据表格 (12列，严格对齐用户 Excel 模板)
        采用原生专属双向滚动容器，支持上下滚轮平滑滚动 + 左右横向拖动/滚动
      */}
      <div className="w-full min-w-0 shrink-0 bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden mb-4">
        <div className="px-3 py-2 border-b border-border text-xs text-muted-foreground">拖动底部滚动条查看右侧评价与款式，也可使用触控板横滑或 Shift + 滚轮。</div>
        <ScrollArea id="competitorTableScroll" type="always" className="w-full min-w-0 h-[clamp(280px,calc(100dvh-600px),560px)] select-text">
          <Table containerClassName="overflow-visible" className="w-full table-fixed border-collapse caption-bottom text-xs text-slate-800 text-left" style={{ minWidth: '1700px' }}>
            <TableHeader className="bg-slate-50/95 sticky top-0 z-20 border-b border-slate-200 shadow-2xs backdrop-blur-xs">
              <TableRow className="border-b border-slate-200">
                <TableHead className="w-14 text-center py-2.5 text-xs font-semibold text-slate-600">排名</TableHead>
                <TableHead className="w-28 text-center text-xs font-semibold text-slate-600">米种</TableHead>
                <TableHead className="w-20 text-center text-xs font-semibold text-slate-600">规格</TableHead>
                <TableHead className="w-24 text-center text-xs font-semibold text-slate-600">包装类型</TableHead>
                <TableHead className="w-24 text-center text-xs font-semibold text-slate-600">前台标价</TableHead>
                <TableHead className="w-24 text-center text-xs font-semibold text-emerald-600">券后到手价</TableHead>
                <TableHead className="w-24 text-center text-xs font-semibold text-slate-600">元/kg</TableHead>
                <TableHead className="w-20 text-center text-xs font-semibold text-slate-600">是否包邮</TableHead>
                <TableHead className="w-24 text-center text-xs font-semibold text-slate-600">发货时效</TableHead>
                <TableHead className="w-[360px] text-left text-xs font-semibold text-slate-600">主图 + 标题</TableHead>
                <TableHead className="w-24 text-center text-xs font-semibold text-slate-600">销量</TableHead>
                <TableHead className="w-[340px] text-left text-xs font-semibold text-slate-600">全部评价 / 负面反馈</TableHead>
                <TableHead className="w-28 text-center text-xs font-semibold text-slate-600">备注</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} className="h-64 text-center text-slate-500 py-12">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <FileSpreadsheet className="size-8 text-slate-400" />
                      <p className="text-sm font-medium text-slate-700">{items.length ? '没有符合筛选条件的商品' : '暂无竞品数据'}</p>
                      <p className="text-xs text-slate-500">
                        {items.length ? '请调整搜索词、价格或评价来源，或点击「重置筛选」。' : '导入或粘贴 JSON 开始分析，也可载入示例预览。'}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                pageItems.map((item, idx) => {
                  const globalIndex = itemIndices.get(item);
                  const displayImgUrl = item.imageUrl || getFallbackRiceSvg(item);

                  return (
                    <TableRow
                      key={item.itemId || idx}
                      className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors group"
                    >
                      {/* 1. 排名 */}
                      <TableCell className="p-3 text-center font-mono font-bold text-slate-700">
                        <span
                          className={`inline-flex items-center justify-center size-6 rounded-md text-xs ${
                            item.rank === 1
                              ? 'bg-amber-100 text-amber-800 border border-amber-300 font-bold'
                              : item.rank === 2
                              ? 'bg-slate-200 text-slate-800 border border-slate-300'
                              : item.rank === 3
                              ? 'bg-orange-100 text-orange-800 border border-orange-300'
                              : 'text-slate-500'
                          }`}
                        >
                          {item.rank || idx + 1}
                        </span>
                      </TableCell>

                      {/* 2. 米种 */}
                      <TableCell className="p-3 text-center">
                        <Badge variant="outline" className="bg-slate-50 border-slate-200 text-slate-700 text-[11px] font-normal">
                          {item.variety || '未识别'}
                        </Badge>
                      </TableCell>

                      {/* 3. 规格 */}
                      <TableCell className="p-3 text-center font-mono text-xs text-slate-800 font-medium">
                        {item.spec}
                      </TableCell>

                      {/* 4. 包装类型 */}
                      <TableCell className="p-3 text-center text-xs text-slate-600">
                        <span className={`px-2 py-0.5 rounded text-[11px] ${
                          (item.packaging || '').includes('真空')
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {item.packaging || '未识别'}
                        </span>
                      </TableCell>

                      {/* 5. 前台标价 (支持直接点击修改) */}
                      <TableCell className="p-2 text-center font-mono text-xs text-slate-400">
                        <div className="flex items-center justify-center">
                          <span className="text-slate-400 text-xs mr-0.5">¥</span>
                          <Input
                            type="number"
                            min="0"
                            placeholder="待补"
                            step="0.1"
                            value={item.originalPrice ?? ''}
                            onChange={(e) => updateItemField(globalIndex, 'originalPrice', Number(e.target.value) > 0 ? Number(e.target.value) : null)}
                            className="w-16 text-center font-mono text-xs text-slate-400 line-through bg-transparent hover:bg-slate-50 focus:bg-white border border-transparent hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400/20 rounded px-1 py-0.5 transition-colors outline-hidden"
                            title="点击可直接编辑修改前台标价"
                          />
                        </div>
                      </TableCell>

                      {/* 6. 券后到手价 (支持直接点击修改) */}
                      <TableCell className="p-2 text-center font-mono text-sm font-bold text-emerald-600">
                        <div className="flex items-center justify-center">
                          <span className="text-emerald-600 text-xs mr-0.5 font-bold">¥</span>
                          <Input
                            type="number"
                            min="0"
                            placeholder="待补"
                            step="0.01"
                            value={item.finalPrice ?? ''}
                            onChange={(e) => updateItemField(globalIndex, 'finalPrice', Number(e.target.value) > 0 ? Number(e.target.value) : null)}
                            className="w-18 text-center font-mono text-sm font-bold text-emerald-600 bg-transparent hover:bg-slate-50 focus:bg-white border border-transparent hover:border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 rounded px-1 py-0.5 transition-colors outline-hidden"
                            title={item.priceBasis || '点击可直接编辑修改券后到手价'}
                          />
                        </div>
                      </TableCell>

                      <TableCell className="p-3 text-center font-mono text-xs text-emerald-700" title="到手价 ÷ 规格总重量，不含运费">
                        {unitPrice(item) == null ? '—' : `¥${unitPrice(item).toFixed(2)}`}
                      </TableCell>
                      {/* 7. 是否包邮 */}
                      <TableCell className="p-3 text-center">
                        <span className="text-[11px] text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                          {item.freeShipping || '未采集'}
                        </span>
                      </TableCell>

                      {/* 8. 发货时效 */}
                      <TableCell className="p-3 text-center text-xs text-slate-600">
                        {item.shippingTime || '未采集'}
                      </TableCell>

                      {/* 9. 主图 + 标题 */}
                      <TableCell className="p-3 text-left">
                        <div className="flex items-center gap-3">
                          {/* 主图缩略图 (带点击放大，永不白屏/空黑框) */}
                          <Button variant="ghost" size="unstyled"
                            type="button"
                            aria-label={`查看 ${item.title} 的图片`}
                            className="relative size-14 shrink-0 rounded-lg overflow-hidden bg-slate-50 border border-slate-200 cursor-pointer shadow-2xs group/img"
                            onClick={() => setHoverItem(item)}
                            title="点击查看大图与商品详情"
                          >
                            <img
                              src={displayImgUrl}
                              alt="商品主图"
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover/img:scale-110 transition-transform"
                              onError={(e) => {
                                e.currentTarget.onerror = null;
                                e.currentTarget.src = getFallbackRiceSvg(item);
                              }}
                            />
                            <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity text-white text-[10px]">
                              <Eye className="size-3.5" />
                            </div>
                          </Button>

                          <div className="min-w-0 flex-1">
                            {item.link ? (
                              <a
                                href={item.link}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-slate-900 hover:text-emerald-700 transition-colors line-clamp-2 leading-relaxed flex items-center gap-1 group/link font-medium"
                              >
                                <span>{item.title}</span>
                                <ExternalLink className="size-3 shrink-0 opacity-0 group-hover/link:opacity-100 transition-opacity text-emerald-600" />
                              </a>
                            ) : (
                              <p className="text-xs text-slate-900 line-clamp-2 leading-relaxed font-medium">
                                {item.title}
                              </p>
                            )}

                            {item.isSameLink && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded mt-1 font-medium">
                                同一个链接多SKU
                              </span>
                            )}
                            {item.detailMessage && <p className="mt-1 text-[11px] text-amber-800 line-clamp-2" title={item.detailMessage}>{item.detailStatus} · {item.detailMessage}</p>}
                          </div>
                        </div>
                      </TableCell>

                      {/* 10. 销量 */}
                      <TableCell className="p-3 text-center font-mono text-xs text-slate-700">
                        {item.sales || '未采集'}
                      </TableCell>

                      {/* 11. 高频差评 (显示真实买家反馈标识，支持点击直接行内编辑) */}
                      <TableCell className="p-2 text-left text-xs text-slate-600 min-w-[240px]">
                        <div className="mb-2 flex items-center gap-2">
                          <Button variant="outline" size="sm" disabled={!item.reviews?.length} onClick={() => setReviewItem(item)}>
                            {item.reviews?.length ? `查看评价（${item.reviews.length}条）` : '待补采评价全文'}
                          </Button>
                          <Badge variant={item.reviewListExhausted ? 'default' : 'secondary'}>{item.reviewListExhausted ? '可见列表已读完' : '未读完'}</Badge>
                        </div>
                        <p className="mb-2 max-w-80 text-xs text-muted-foreground" title={item.reviewStatus}>{item.reviewStatus || '尚未读取全部评价'}</p>
                        <div className="flex items-center gap-1.5">
                          {(
                            <span className="inline-flex items-center text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 py-0.5 rounded shrink-0">
                              {reviewKind(item)}
                            </span>
                          )}
                          <Input
                            type="text"
                            value={item.negativeReviews || ''}
                            onChange={(e) => updateItemField(globalIndex, 'negativeReviews', e.target.value)}
                            className="w-full text-xs text-rose-600 font-medium bg-transparent hover:bg-slate-50 focus:bg-white border border-transparent hover:border-slate-300 focus:border-rose-400 focus:ring-1 focus:ring-rose-400/20 rounded px-1.5 py-1 transition-colors outline-hidden truncate focus:truncate-none"
                            title="点击可直接编辑修改此商品的高频差评"
                            placeholder={item.reviewStatus || '尚未采集评价'}
                            aria-label={`编辑 ${item.title} 的评价记录`}
                          />
                        </div>
                      </TableCell>

                      {/* 12. 备注 */}
                      <TableCell className="p-3 text-center">
                        <Select value={String((item.remark || '常规款') ?? '')} onValueChange={value => updateItemField(globalIndex, 'remark', value)}>
                      <SelectTrigger className="h-8 w-full min-w-28 text-xs" aria-label="商品款式"><SelectValue placeholder="请选择" /></SelectTrigger>
                      <SelectContent><SelectGroup>
                          <SelectItem value="引流款">引流款</SelectItem>
                          <SelectItem value="主推款">主推款</SelectItem>
                          <SelectItem value="利润款">利润款</SelectItem>
                          <SelectItem value="同一个链接">同一个链接</SelectItem>
                          <SelectItem value="常规款">常规款</SelectItem>
                          <SelectItem value="待判断">待判断</SelectItem>
                        </SelectGroup></SelectContent>
                    </Select>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      {pageCount > 1 && <div className="flex items-center justify-end gap-3 text-xs text-slate-600">
        <span>第 {currentPage} / {pageCount} 页 · 每页 100 款，导出包含所选范围全部数据</span>
        <Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>上一页</Button>
        <Button size="sm" variant="outline" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>下一页</Button>
      </div>}
      {/* 弹窗 1: 油猴脚本安装与使用指引 (白底清晰明亮) */}
      <Dialog open={helperDialogOpen} onOpenChange={setHelperDialogOpen}>
        <DialogContent className="max-w-xl bg-white border-slate-200 text-slate-900 shadow-xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold">
              <Radio className="size-4 text-emerald-600" />
              淘工厂大米 浏览器采集助手使用指引
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-xs">
              通过真实浏览器采集，天然携带买家 Cookie，按页面实际可见内容采集，登录或安全验证需在浏览器中完成。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-xs text-slate-700 py-2 leading-relaxed">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div className="font-semibold text-slate-900 mb-1.5">第一步：安装 Tampermonkey (油猴) 扩展</div>
              <p className="text-slate-600">
                在 Chrome 或 Edge 浏览器的应用商店搜索并安装 <strong>Tampermonkey</strong> 插件。
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div className="font-semibold text-slate-900 mb-1.5">第二步：添加采集脚本</div>
              <p className="text-xs text-muted-foreground">内置版本 2.1.0，支持慢速分页和访问受限即停止。已安装旧版的用户需覆盖保存脚本，再刷新商品页。</p>
              <p className="text-slate-600 mb-3">
                脚本文件已内置在项目目录：<code className="text-emerald-700 font-mono bg-white px-2 py-0.5 rounded border border-slate-200">scripts/tampermonkey/taobao_factory_crawler.js</code>。
              </p>
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    const code = await window.excelTool?.getTampermonkeyScript?.();
                    if (code) {
                      await navigator.clipboard.writeText(code);
                      toast.success('已复制油猴采集脚本完整源码！请在 Tampermonkey 中新建脚本并粘贴保存');
                    } else {
                      const scriptPath = 'scripts/tampermonkey/taobao_factory_crawler.js';
                      navigator.clipboard.writeText(`// 请打开项目本地目录：${scriptPath} 复制全部源码`);
                      toast.info(`已复制脚本路径：${scriptPath}`);
                    }
                  } catch (e) {
                    toast.error('复制失败，请手动打开 scripts/tampermonkey/taobao_factory_crawler.js');
                  }
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs cursor-pointer shadow-xs gap-1.5"
              >
                <Copy className="size-3.5" />
                一键复制脚本源码
              </Button>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div className="font-semibold text-slate-900 mb-1.5">第三步：在淘宝/淘工厂店搜索页采集并一键同步</div>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-600">
                <li>确保本工具右上角的「模式A助手监听」已开启（绿色高亮）。</li>
                <li>
                  在浏览器中打开目标搜索页，推荐直接进入淘工厂官方店搜索：
                  <code className="block mt-1 p-1 bg-white border border-slate-200 rounded text-[10px] text-emerald-700 font-mono break-all select-all">
                    https://tmai.tmall.com/search.htm?keyword=%B4%F3%C3%D7+&spm=a21xtw.29978516.0.0
                  </code>
                </li>
                <li>
                  页面右下角将自动弹出悬浮工具栏，点击「一键采集Top20」后，点击「推送桌面端」即可秒级同步！
                </li>
              </ol>
            </div>
          </div>

          <DialogFooter>
            <Button
              size="sm"
              onClick={() => setHelperDialogOpen(false)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-900 font-semibold text-xs cursor-pointer border border-slate-200"
            >
              我知道了
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 弹窗 2: 手动粘贴 JSON 数据 */}
      <Dialog open={pasteDialogOpen} onOpenChange={setPasteDialogOpen}>
        <DialogContent className="max-w-lg bg-white border-slate-200 text-slate-900 shadow-xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">粘贴竞品数据 (JSON 格式)</DialogTitle>
            <DialogDescription className="text-slate-500 text-xs">
              将浏览器油猴插件导出的 JSON 数据或包含 title、finalPrice、sales 的对象数组直接粘贴至下方：
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <Textarea
              placeholder='[ { "title": "五常大米 1kg", "finalPrice": 0.8, "sales": "3w+人付款" } ... ]'
              value={pasteContent}
              onChange={(e) => setPasteContent(e.target.value)}
              className="h-48 font-mono text-xs bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-slate-300"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPasteDialogOpen(false)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 text-xs cursor-pointer"
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmPaste}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs cursor-pointer shadow-xs"
            >
              确认解析载入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 模式 B：桌面端内置浏览器自动采集对话框 (白底清爽风格) */}
      <Dialog open={crawlerDialogOpen} onOpenChange={(open) => !isCrawling && setCrawlerDialogOpen(open)}>
        <DialogContent className="max-w-lg bg-white border-slate-200 text-slate-900 p-6 rounded-2xl shadow-xl">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
                <Bot className="size-4" />
              </span>
              <DialogTitle className="text-slate-900 font-bold text-base">
                {crawlExisting ? `模式 B：补采当前 ${items.length} 款商品详情` : '模式 B：桌面端内置浏览器自动采集'}
              </DialogTitle>
            </div>
            <DialogDescription className="text-slate-500 text-xs leading-relaxed">
              无需安装外部浏览器扩展。桌面端直接启动独立的 Chromium 会话，自动模拟人工滚动加载商品与主图并提取 Top 20 核心数据。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {crawlExisting && <p className="text-amber-800">将逐款打开当前列表的商品链接，核对对应 SKU、价格、包装、物流和评价，不重新搜索。请先完成登录与验证。</p>}
            {/* 目标搜索链接与关键词配置 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-slate-700 text-xs font-semibold">
                  目标采集源（支持一键预设或输入自定义链接）
                </label>
                <span className="text-[10px] text-slate-500">
                  自动识别完整 URL 与搜索关键词
                </span>
              </div>

              {/* 预设快捷按钮 */}
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="unstyled"
                  type="button"
                  disabled={isCrawling || crawlExisting}
                  onClick={() => setCrawlKeyword('https://tmai.tmall.com/search.htm?keyword=%B4%F3%C3%D7+&spm=a21xtw.29978516.0.0')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer flex items-center gap-1.5 ${
                    crawlKeyword.includes('tmai.tmall.com')
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-bold shadow-2xs'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Sparkles className="size-3 text-amber-500" />
                  淘工厂官方直营店 (tmai.tmall.com)
                </Button>
                <Button variant="ghost" size="unstyled"
                  type="button"
                  disabled={isCrawling || crawlExisting}
                  onClick={() => setCrawlKeyword('淘工厂 大米')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer flex items-center gap-1.5 ${
                    crawlKeyword === '淘工厂 大米'
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-bold shadow-2xs'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Search className="size-3 text-slate-500" />
                  淘宝全网大米搜索 (s.taobao.com)
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-1">
                <div className="sm:col-span-3">
                  <Input
                    disabled={isCrawling || crawlExisting}
                    value={crawlKeyword}
                    onChange={(e) => setCrawlKeyword(e.target.value)}
                    placeholder="例如：https://tmai.tmall.com/search.htm... 或 淘工厂 大米"
                    className="bg-slate-50 border-slate-200 text-slate-900 text-xs focus:bg-white focus:border-indigo-400 font-mono"
                  />
                </div>
                <div>
                  <Input
                    type="number"
                    min="5"
                    max="50"
                    disabled={isCrawling || crawlExisting}
                    value={crawlLimit}
                    onChange={(e) => setCrawlLimit(e.target.value)}
                    placeholder="数量: 20"
                    className="bg-slate-50 border-slate-200 text-slate-900 text-xs focus:bg-white focus:border-indigo-400"
                    title="目标采集商品数量"
                  />
                </div>
              </div>
            </div>

            {/* 商详真实评价抓取深度 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-slate-700 text-xs font-semibold">
                  全部评价采集范围
                </label>
                <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-medium">
                  逐页读取好评、中评、差评与追评
                </span>
              </div>
              <Select value={String((deepReviewLimit) ?? '')} onValueChange={value => setDeepReviewLimit(Number(value))} disabled={isCrawling}>
                      <SelectTrigger className="h-8 w-full min-w-28 text-xs" aria-label="评价采集深度"><SelectValue placeholder="请选择" /></SelectTrigger>
                      <SelectContent><SelectGroup>
                <SelectItem value={String(50)}>所有商品：读取全部评价</SelectItem>
                <SelectItem value={String(5)}>前 5 款：读取全部评价</SelectItem>
                <SelectItem value={String(10)}>前 10 款：读取全部评价</SelectItem>
                <SelectItem value={String(20)}>前 20 款：读取全部评价</SelectItem>
                <SelectItem value={String(0)}>补全全部商品详情，不读取评价</SelectItem>
              </SelectGroup></SelectContent>
                    </Select>
              <p className="mt-2 text-xs text-muted-foreground">翻页至少间隔 10 秒，每 20 页休息 60 秒，商品间隔 30 秒。平台拒绝访问时停止本轮采集，保留已读结果；请稍后手动重试。</p>
            </div>

            {/* 自动化过盾与登录机制说明 */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 space-y-2">
              <div className="flex items-center gap-1.5 text-slate-900 font-semibold text-xs">
                <Sparkles className="size-3.5 text-amber-500" />
                双轨制 · 模式 B 一体化优势与过盾机制
              </div>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600 leading-relaxed">
                <li>
                  <strong className="text-slate-800">免反复扫码</strong>：首次弹出的淘宝窗口若未登录，可用手机淘宝扫码一次，登录状态保存在本地独立分区，失效时需重新登录。
                </li>
                <li>
                  <strong className="text-slate-800">手动验证</strong>：先在浏览器中完成登录和滑块验证，再回到这里点击「我已完成验证，开始采集」。检测到验证时会暂停采集，不设验证等待超时。
                </li>
                <li>
                  <strong className="text-slate-800">确认后采集</strong>：确认前不会滚动或切换页面；采集中再次遇到验证时暂停等待，通过后继续。可随时终止任务。
                </li>
              </ul>
            </div>

            {/* 运行中进度反馈 */}
            {isCrawling && (
              <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center gap-3">
                <Loader2 className="size-5 text-indigo-600 animate-spin shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-indigo-900">
                    {['waiting_ready', 'login_needed', 'captcha_needed'].includes(crawlProgress?.stage) ? '等待手动登录或验证' : '自动化采集任务进行中...'}
                  </div>
                  <div className="text-[11px] text-indigo-700 whitespace-normal mt-0.5" role="status">
                    {crawlProgress?.message || '正在初始化自动化 Chromium 窗口...'}
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            {isCrawling ? (
              <>
              {crawlProgress?.stage === 'waiting_ready' && <Button size="sm" onClick={handleContinueCrawl}>
                我已完成验证，开始采集
              </Button>}
              <Button
                size="sm"
                variant="outline"
                onClick={handleStopCrawl}
                className="bg-red-50 hover:bg-red-100 border-red-200 text-red-700 text-xs cursor-pointer"
              >
                终止采集任务
              </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCrawlerDialogOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 text-xs cursor-pointer"
                >
                  取消
                </Button>
                <Button
                  id="confirmStartCrawlBtn"
                  size="sm"
                  onClick={handleStartCrawl}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs cursor-pointer shadow-xs gap-1.5"
                >
                  <Play className="size-3.5 fill-current" />
                  启动内置浏览器采集
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CompetitorReviewsDialog item={reviewItem} onClose={() => setReviewItem(null)} />
      <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>清空竞品列表？</DialogTitle><DialogDescription>将移除当前 {items.length} 款商品。清空后可以撤销。</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setClearDialogOpen(false)}>保留数据</Button><Button onClick={handleClear}>清空列表</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(hoverItem)} onOpenChange={open => !open && setHoverItem(null)}>
        <DialogContent className="max-w-md bg-white text-slate-900">
          <DialogHeader><DialogTitle>{hoverItem?.title || '商品详情'}</DialogTitle><DialogDescription>商品主图与采集信息</DialogDescription></DialogHeader>
          {hoverItem && <div className="space-y-3 text-sm">
            <img className="h-56 w-full object-contain" src={hoverItem.imageUrl || getFallbackRiceSvg(hoverItem)} alt={hoverItem.title} referrerPolicy="no-referrer" onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = getFallbackRiceSvg(hoverItem); }} />
            <p>{hoverItem.spec} · {hoverItem.packaging} · 到手价 {hoverItem.finalPrice ? `¥${Number(hoverItem.finalPrice).toFixed(2)}` : '待补充'}</p>
            <p>{reviewKind(hoverItem)}：{hoverItem.negativeReviews || '尚未采集评价'}</p>
          </div>}
        </DialogContent>
      </Dialog>
    </main>
  );
}
