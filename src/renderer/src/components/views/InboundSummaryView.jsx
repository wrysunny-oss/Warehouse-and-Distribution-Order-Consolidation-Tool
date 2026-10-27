import React from 'react';
import { Download, FileSpreadsheet, RotateCcw, Upload, Settings, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectLabel, SelectItem } from '@/components/ui/select';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const number = value => value?.toLocaleString('zh-CN') ?? '—';

function RecordsTable({ rows, excluded }) {
  return <ScrollArea type="always" className="h-80 w-full min-w-0 rounded-md border">
    <Table className="min-w-[1250px]" containerClassName="overflow-visible">
      <TableHeader><TableRow>{['源表行号', '货品名称', '货品条码', '品牌', '预约日期', '履行单号', '总件数', excluded ? '排除原因' : '待处理问题'].map(header => <TableHead key={header}>{header}</TableHead>)}</TableRow></TableHeader>
      <TableBody>{rows.map((row, i) => <TableRow key={`${row.rowNumber}-${i}`}>
        <TableCell>{row.rowNumber}</TableCell><TableCell title={row.productName} className="max-w-64 truncate">{row.productName || '—'}</TableCell>
        <TableCell>{row.barcode || '空条码'}</TableCell><TableCell>{row.brand || '—'}</TableCell><TableCell>{row.date || '缺失'}</TableCell>
        <TableCell>{row.orderNumber || '缺失'}</TableCell><TableCell>{String(row.rawQuantity ?? '') || '空白'}</TableCell>
        <TableCell className="whitespace-normal min-w-60">{row.reason}{row.candidates?.length > 1 && <p className="mt-1 text-muted-foreground">{row.candidates.join('；')}</p>}</TableCell>
      </TableRow>)}</TableBody>
    </Table>
    <ScrollBar orientation="horizontal" />
  </ScrollArea>;
}

export function InboundSummaryView({ state, setState, productPresets, onOpenProducts }) {
  const { source, type, analysis, busy, error, titleOverride } = state;
  const masterKey = JSON.stringify(productPresets);
  const masterChanged = Boolean(analysis && state.masterKey !== masterKey);
  const title = titleOverride ?? analysis?.defaultTitle ?? '';
  const update = patch => setState(previous => ({ ...previous, ...patch }));
  async function execute(task) {
    update({ busy: true, error: '' });
    try { await task(); }
    catch (error) { update({ error: error.message }); toast.error(error.message); }
    finally { update({ busy: false }); }
  }
  const importFile = () => execute(async () => {
    const result = await window.excelTool.importReturnSummary({ type: '普通直入预约单' });
    if (!result) return;
    if (!result.types.includes('普通直入预约单')) throw new Error('导入文件中没有普通直入预约单。');
    update({ source: result, type: result.type, analysis: result.analysis, titleOverride: null, masterKey });
    toast.success(`已读取 ${result.fileName}`);
  });
  const rematch = (nextType = type) => execute(async () => {
    const result = await window.excelTool.analyzeReturnSummary({ token: source.token, type: nextType });
    update({ analysis: result, type: nextType, masterKey, ...(nextType !== type ? { titleOverride: null } : {}) });
  });
  const exportFile = () => execute(async () => {
    const result = await window.excelTool.exportReturnSummary({ token: source.token, type, title });
    if (!result) { toast.info('已取消保存'); return; }
    if (result.analysis) update({ analysis: result.analysis, masterKey });
    if (result.ok) toast.success(`已导出：${result.filePath}`);
    else update({ error: result.message || '请处理异常后重试。' });
  });
  return <section id="returnSummaryView" className="flex-1 min-h-0 min-w-0 overflow-y-auto p-5 flex flex-col gap-4" aria-busy={busy}>
    <Card className="shrink-0">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2"><CardTitle>普通直入入库汇总</CardTitle>
          <CardDescription>导入预约单明细，按总件数汇总包数，核对商品与单号后导出。</CardDescription></div>
        <div className="flex flex-wrap gap-2">
          <Button id="returnImport" variant="outline" onClick={importFile} disabled={busy}><Upload data-icon="inline-start" />{busy ? '处理中…' : source ? '重新导入 Excel' : '导入 Excel'}</Button>
          <Button id="returnExport" onClick={exportFile} disabled={busy || !analysis?.canExport || masterChanged || !title.trim()}><Download data-icon="inline-start" />导出{analysis?.summaryName || '汇总'}</Button>
        </div>
      </CardHeader>
      {source && <CardContent className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground break-all">{source.fileName} · 首个工作表「{source.sheetName}」· {number(source.rowCount)} 行 · 切换菜单保留本次导入</p>
        <FieldGroup className="flex-row flex-wrap items-end gap-4">
          <Field className="w-60 shrink-0 grow-0">
            <FieldLabel htmlFor="returnType">预约单类型</FieldLabel>
            <Select value={type} onValueChange={rematch} disabled={busy}>
              <SelectTrigger id="returnType" aria-label="预约单类型"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup><SelectLabel>普通直入预约单</SelectLabel><SelectItem value="普通直入预约单">普通直入预约单</SelectItem></SelectGroup></SelectContent>
            </Select>
          </Field>
          <Field className="flex-1 min-w-72" data-invalid={!title.trim()}>
            <FieldLabel htmlFor="returnTitle">导出主标题</FieldLabel>
            <Input id="returnTitle" value={title} aria-invalid={!title.trim()} onChange={event => update({ titleOverride: event.target.value })} disabled={busy} />
          </Field>
          <Button variant="ghost" disabled={busy || titleOverride === null} onClick={() => update({ titleOverride: null })}>恢复默认标题</Button>
        </FieldGroup>
      </CardContent>}
    </Card>
    {error && <Alert variant="destructive"><AlertCircle /><AlertTitle>操作未完成</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {!analysis ? <Empty className="border border-dashed bg-background flex-1 min-h-64">
      <EmptyHeader><EmptyMedia variant="icon"><FileSpreadsheet /></EmptyMedia><EmptyTitle>导入预约单明细</EmptyTitle>
        <EmptyDescription>支持单个 .xlsx 文件，读取第一个工作表。仅按预约单类型筛选，保留已预约等所有状态。</EmptyDescription></EmptyHeader>
      <Button variant="outline" disabled={busy} onClick={importFile}>选择 Excel 文件</Button>
    </Empty> : <>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 shrink-0" aria-live="polite">
        {[
          ['纳入记录', `${number(analysis.includedCount)} 行`, `当前类型共 ${number(analysis.selectedCount)} 行`],
          ['总包数', `${number(analysis.totalPackages)} 包`, '直接累计总件数，不乘箱规'],
          ['产品／单号分组', `${analysis.productSummary.length} ／ ${analysis.orderSummary.length}`, analysis.totalsMatch ? '两侧合计一致' : '两侧合计异常，禁止导出'],
          ['排除记录', `${analysis.excluded.length} 行 · ${number(analysis.excludedPackages)} 包`, analysis.excludedInvalidQuantityCount ? `另有 ${analysis.excludedInvalidQuantityCount} 行数量无效，未计入排除包数` : '缺少预约日期或履行单号'],
        ].map(([label, value, description]) => <Card key={label}><CardHeader className="pb-3"><CardDescription>{label}</CardDescription><CardTitle>{value}</CardTitle></CardHeader><CardContent><p className="text-xs text-muted-foreground">{description}</p></CardContent></Card>)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
          <Badge variant={analysis.canExport && !masterChanged ? 'secondary' : 'destructive'}>{masterChanged ? '商品主数据已变更，请重新匹配' : analysis.canExport ? '校验通过，可导出' : `待处理 ${analysis.issues.length} 项${analysis.includedCount === 0 ? ' · 没有可导出记录' : ''}`}</Badge>
          <span className="text-xs text-muted-foreground">{analysis.dateRange ? `${analysis.dateRange.start} 至 ${analysis.dateRange.end}` : '无有效日期'} · 预览底部可左右拖动</span>
        </div>
        <div className="flex gap-2"><Button variant="outline" size="sm" onClick={onOpenProducts}><Settings data-icon="inline-start" />商品主数据</Button>
          <Button id="returnRematch" variant="outline" size="sm" onClick={() => rematch()} disabled={busy}><RotateCcw data-icon="inline-start" />重新匹配</Button></div>
      </div>
      <Tabs defaultValue="summary" className="min-w-0 shrink-0">
        <TabsList aria-label="汇总核对"><TabsTrigger value="summary">汇总预览</TabsTrigger><TabsTrigger value="issues">匹配及数据问题（{analysis.issues.length}）</TabsTrigger><TabsTrigger value="excluded">排除记录（{analysis.excluded.length}）</TabsTrigger></TabsList>
        <TabsContent value="summary" className="min-w-0">
          <ScrollArea id="returnPreviewScroll" type="always" className="h-[340px] w-full min-w-0 max-w-full rounded-md border bg-background">
            <Table className="min-w-[1240px]" containerClassName="overflow-visible">
              <TableHeader><TableRow>{['序号', '产品明细（订单简称）', '数量（包）', '', '序号', '预约日期', analysis.orderHeader, '数量（包）'].map((header, i) => <TableHead key={i}>{header}</TableHead>)}</TableRow></TableHeader>
              <TableBody>{Array.from({ length: Math.max(analysis.productSummary.length, analysis.orderSummary.length) + 1 }, (_, i) => {
                const product = analysis.productSummary[i], order = analysis.orderSummary[i];
                const productSum = i === analysis.productSummary.length, orderSum = i === analysis.orderSummary.length;
                return <TableRow key={i}>
                  <TableCell>{product?.number}</TableCell><TableCell className="max-w-96 truncate" title={product?.name}>{product?.unresolved && <Badge variant="destructive" className="mr-2">待匹配</Badge>}{product?.name ?? (productSum ? '总计' : '')}</TableCell><TableCell>{product ? number(product.quantity) : productSum ? number(analysis.productTotal) : ''}</TableCell>
                  <TableCell className="min-w-8" /><TableCell>{order?.number}</TableCell><TableCell>{order?.date ?? (orderSum ? '总计' : '')}</TableCell><TableCell>{order?.orderNumber}</TableCell><TableCell>{order ? number(order.quantity) : orderSum ? number(analysis.orderTotal) : ''}</TableCell>
                </TableRow>;
              })}</TableBody>
            </Table><ScrollBar orientation="horizontal" />
          </ScrollArea>
        </TabsContent>
        <TabsContent value="issues"><RecordsTable rows={analysis.issues} />{analysis.issues.length === 0 && <p className="mt-2 text-xs text-muted-foreground">没有匹配或数据问题。</p>}</TabsContent>
        <TabsContent value="excluded"><RecordsTable rows={analysis.excluded} excluded />{analysis.excluded.length === 0 && <p className="mt-2 text-xs text-muted-foreground">没有缺少预约日期或履行单号的记录。</p>}</TabsContent>
      </Tabs>
    </>}
  </section>;
}
