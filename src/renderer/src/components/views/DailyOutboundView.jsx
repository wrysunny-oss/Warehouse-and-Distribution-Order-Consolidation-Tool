import React from 'react';
import { Upload, Download, AlertCircle, PencilLine, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableFooter } from '@/components/ui/table';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Choice, DataTable, Stats } from './return-workflow-ui';
import config from '../../../../shared/daily-outbound.json';

const { warehouses } = config;
const emptyEdits = () => ({ names: {}, specs: {}, quantities: {}, choices: {} });
const initial = { source: null, date: '', status: '上柜', edits: emptyEdits(), analysis: null, busy: false, error: '', page: 0, search: '' };
const text = value => String(value ?? '').trim();
const positive = value => text(value) !== '' && Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
const quantity = value => text(value) !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const format = (value, weight = false) => value == null || !Number.isFinite(value) ? '—' : value.toLocaleString('zh-CN', weight ? { minimumFractionDigits: 4, maximumFractionDigits: 6 } : { maximumFractionDigits: 9 });

export function DailyOutboundView({ model, setModel }) {
  const state = model || initial, { source, analysis, busy, edits } = state;
  const update = patch => setModel(previous => ({ ...(previous || initial), ...patch }));
  const api = window.excelTool;
  async function run(task) {
    if (busy) return;
    update({ busy: true, error: '' });
    try { await task(); } catch (error) { update({ error: error.message }); toast.error(error.message); }
    finally { update({ busy: false }); }
  }
  const payload = patch => ({ token: source.token, date: state.date, status: state.status, edits, ...patch });
  const analyze = patch => run(async () => {
    const nextDate = patch?.date ?? state.date, nextStatus = patch?.status ?? state.status;
    const changingScope = nextDate !== state.date || nextStatus !== state.status;
    const scopedChoices = { ...state.scopedChoices, [JSON.stringify([state.date, state.status])]: edits.choices };
    const nextEdits = patch?.edits || (changingScope ? { ...edits, choices: scopedChoices[JSON.stringify([nextDate, nextStatus])] || {} } : edits);
    const result = await api.analyzeDailyOutbound(payload({ ...patch, edits: nextEdits }));
    update({ analysis: result, date: result.date, status: result.status, edits: nextEdits, scopedChoices, page: 0 });
  });
  const importFile = () => run(async () => {
    const result = await api.importDailyOutbound(); if (!result) return;
    update({ source: result, analysis: result.analysis, date: result.analysis.date, status: '上柜', edits: emptyEdits(), scopedChoices: {}, search: '', page: 0, conflictOpen: false, draftNames: {} });
    toast.success('子表1已导入，默认筛选上柜');
  });
  const editValue = (id, field, value, warehouse) => setModel(previous => {
    const old = previous || initial;
    return { ...old, edits: { ...old.edits, [field]: { ...old.edits[field], [id]: warehouse ? { ...old.edits[field][id], [warehouse]: value } : value } } };
  });
  const rows = (analysis?.products || []).map(product => {
    const specRaw = Object.hasOwn(edits.specs, product.id) ? edits.specs[product.id] : product.spec ?? '';
    const spec = positive(specRaw);
    const localWarehouses = Object.fromEntries(warehouses.map(warehouse => {
      const base = product.warehouses[warehouse];
      const raw = Object.hasOwn(edits.quantities[product.id] || {}, warehouse) ? edits.quantities[product.id][warehouse] : base.quantity ?? '';
      const qty = quantity(raw);
      return [warehouse, { ...base, raw, quantity: qty, weight: spec !== null && qty !== null ? spec * qty / 1000 : null }];
    }));
    return { ...product, specRaw, spec, warehouses: localWarehouses };
  });
  const issues = (analysis?.issues || []).filter(issue => !/规格未识别或无效|补货数量必须/.test(issue.reason));
  rows.forEach(row => {
    if (row.spec === null) issues.push({ id: row.id, name: row.name, sku: row.sku, reason: '规格无效，请填写正数kg规格' });
    warehouses.forEach(warehouse => { if (row.warehouses[warehouse].quantity === null) issues.push({ id: row.id, name: row.name, sku: row.sku, reason: `${warehouse}补货数量必须为非负整数，不可为空` }); });
  });
  const conflicts = analysis?.conflicts || [], unresolved = conflicts.filter(item => !item.resolved);
  const localTotals = Object.fromEntries(warehouses.map(warehouse => [warehouse, { quantity: rows.reduce((sum, row) => sum + (row.warehouses[warehouse].quantity ?? 0), 0), weight: rows.reduce((sum, row) => sum + (row.warehouses[warehouse].weight ?? 0), 0) }]));
  const visible = rows.filter(row => !state.search || row.name.toLowerCase().includes(state.search.toLowerCase()) || row.sku.includes(state.search));
  const pages = Math.max(1, Math.ceil(visible.length / 40)), page = Math.min(state.page, pages - 1);
  const canExport = Boolean(state.date) && rows.length > 0 && !unresolved.length && !issues.length && !busy;
  const exportFile = () => run(async () => {
    const result = await api.exportDailyOutbound(payload());
    if (!result) return toast.info('已取消保存');
    if (result.analysis) update({ analysis: result.analysis });
    if (!result.ok) return update({ error: result.message });
    toast.success(`已导出：${result.filePath}`);
  });

  return <section id="dailyOutboundView" aria-busy={busy} className="flex-1 min-h-0 min-w-0 overflow-y-auto p-5 flex flex-col gap-4">
    <Card className="shrink-0"><CardHeader className="flex-row flex-wrap items-start justify-between gap-4"><div className="flex flex-col gap-2"><CardTitle>日出库补货计划</CardTitle><CardDescription>子表1导入 · 13仓库补货填写 · 建议及重量公式导出</CardDescription></div><div className="flex gap-2"><Button id="dailyImport" variant="outline" disabled={busy} onClick={importFile}><Upload data-icon="inline-start" />{source ? '重新导入Excel' : '导入Excel'}</Button><Button id="dailyExport" disabled={!canExport} onClick={exportFile}><Download data-icon="inline-start" />导出补货计划</Button></div></CardHeader>{source && <CardContent><p className="text-xs text-muted-foreground break-all">{source.fileName} · 子表1「{source.sheetName}」· {source.sourceCount} 条原始记录 · 当前会话保留填写</p></CardContent>}</Card>
    {state.error && <Alert variant="destructive"><AlertCircle /><AlertTitle>操作未完成</AlertTitle><AlertDescription>{state.error}</AlertDescription></Alert>}
    {!source ? <Empty className="border bg-background min-h-64"><EmptyHeader><EmptyTitle>导入日出库明细</EmptyTitle><EmptyDescription>读取第一个工作表，默认只看上柜商品。所有仓库的补货数量初始为0，可在页面填写。</EmptyDescription></EmptyHeader><Button variant="outline" disabled={busy} onClick={importFile}>选择Excel文件</Button></Empty> : <>
      <FieldGroup className="flex-row flex-wrap items-end gap-4"><Field className="w-52 shrink-0"><FieldLabel htmlFor="dailyDate">报告日期</FieldLabel><Choice id="dailyDate" label="报告日期" value={state.date} disabled={busy} onChange={date => analyze({ date })} options={source.dates.map(date => ({ value: date, label: date }))} /></Field><Field className="w-auto"><FieldLabel>上下柜状态</FieldLabel><ToggleGroup type="single" variant="outline" size="sm" aria-label="上下柜状态" disabled={busy} value={state.status} onValueChange={status => { if (status) analyze({ status }); }}>{['上柜', '下柜', '全部'].map(status => <ToggleGroupItem key={status} value={status} aria-label={`日出库${status}`}>{status}</ToggleGroupItem>)}</ToggleGroup></Field><Field className="min-w-60 flex-1"><FieldLabel htmlFor="dailySearch">搜索商品</FieldLabel><Input id="dailySearch" disabled={busy} value={state.search} onChange={event => update({ search: event.target.value, page: 0 })} placeholder="商品名称或SKU" /></Field></FieldGroup>
      {!state.date && <Alert><AlertTitle>请先选择报告日期</AlertTitle><AlertDescription>多个日期分别处理，不混合累计库存。</AlertDescription></Alert>}
      <Stats values={[[ '当前范围', `${analysis.matchedCount} 条`, `${state.status} · ${rows.length} 条商品结果` ], ['SKU冲突', `${unresolved.length} 组待处理`, `已保留SKU后排除 ${analysis.excluded.length} 条原始记录`], ['补货总数量', `${format(warehouses.reduce((sum, warehouse) => sum + localTotals[warehouse].quantity, 0))} 件`, '13仓库合计 · 默认填0'], ['补货总重量', `${format(warehouses.reduce((sum, warehouse) => sum + localTotals[warehouse].weight, 0), true)} 吨`, issues.length ? '存在待处理问题，暂不可导出' : '规格kg × 补货数量 ÷ 1000']]} />
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex gap-2"><Button id="dailyResolve" size="sm" variant={unresolved.length ? 'default' : 'outline'} disabled={busy || !conflicts.length} onClick={() => update({ conflictOpen: true, draftNames: {} })}><PencilLine data-icon="inline-start" />处理SKU冲突（{unresolved.length}）</Button><Button id="dailyValidate" size="sm" variant="outline" disabled={busy} onClick={() => analyze()}><RefreshCw data-icon="inline-start" />更新校验</Button></div><Badge variant={unresolved.length || issues.length ? 'destructive' : 'secondary'}>{unresolved.length ? '同名多SKU禁止导出' : issues.length ? `${issues.length} 项数据问题` : '校验通过'}</Badge></div>
      <Tabs defaultValue="preview" className="min-w-0"><TabsList><TabsTrigger value="preview">补货预览</TabsTrigger><TabsTrigger value="issues">数据问题（{issues.length}）</TabsTrigger><TabsTrigger value="excluded">已排除记录（{analysis.excluded.length}）</TabsTrigger></TabsList><TabsContent value="preview" className="min-w-0">
        <ScrollArea id="dailyOutboundScroll" type="always" className="h-[400px] w-full min-w-0 max-w-full rounded-md border bg-background"><Table className="w-max" containerClassName="overflow-visible"><TableHeader><TableRow>{['商品名称', '规格（kg）', 'SKU', '全国近7日出库', '全国现货库存', ...warehouses.flatMap(warehouse => [`${warehouse}近7日出库`, `${warehouse}现货库存`, `${warehouse}建议补货`, `${warehouse}补货数量`, `${warehouse}重量（吨）`])].map(header => <TableHead key={header}>{header}</TableHead>)}</TableRow></TableHeader><TableBody>
          {visible.slice(page * 40, (page + 1) * 40).map(row => <TableRow key={row.id}><TableCell className="max-w-72 truncate" title={row.name}>{row.conflict && <Badge variant="destructive" className="mr-2">SKU冲突</Badge>}{row.name || '名称缺失'}</TableCell><TableCell><Input aria-label={`${row.sku}规格kg`} type="number" min="0" step="any" className="w-24" disabled={busy} value={row.specRaw} aria-invalid={row.spec === null} onChange={event => editValue(row.id, 'specs', event.target.value)} /></TableCell><TableCell>{row.sku || 'SKU缺失'}</TableCell><TableCell>{format(row.nationalOut7)}</TableCell><TableCell>{format(row.nationalStock)}</TableCell>{warehouses.map(warehouse => <React.Fragment key={warehouse}><TableCell>{format(row.warehouses[warehouse].out7)}</TableCell><TableCell>{format(row.warehouses[warehouse].stock)}</TableCell><TableCell>{format(row.warehouses[warehouse].suggested)}</TableCell><TableCell><Input aria-label={`${row.sku} ${warehouse}补货数量`} type="number" min="0" step="1" className="w-28" disabled={busy} value={row.warehouses[warehouse].raw} aria-invalid={row.warehouses[warehouse].quantity === null} onChange={event => editValue(row.id, 'quantities', event.target.value, warehouse)} /></TableCell><TableCell>{format(row.warehouses[warehouse].weight, true)}</TableCell></React.Fragment>)}</TableRow>)}
        </TableBody><TableFooter><TableRow><TableCell>全部商品合计</TableCell><TableCell /><TableCell /><TableCell>{format(analysis.totals.nationalOut7)}</TableCell><TableCell>{format(analysis.totals.nationalStock)}</TableCell>{warehouses.map(warehouse => <React.Fragment key={warehouse}><TableCell>{format(analysis.totals.warehouses[warehouse].out7)}</TableCell><TableCell>{format(analysis.totals.warehouses[warehouse].stock)}</TableCell><TableCell>{format(analysis.totals.warehouses[warehouse].suggested)}</TableCell><TableCell>{format(localTotals[warehouse].quantity)}</TableCell><TableCell>{format(localTotals[warehouse].weight, true)}</TableCell></React.Fragment>)}</TableRow></TableFooter></Table><ScrollBar orientation="horizontal" /></ScrollArea>
        <div className="mt-2 flex flex-wrap justify-between items-center gap-2 text-xs text-muted-foreground"><span>共 {visible.length} 条预览 · 合计与导出覆盖当前状态的全部商品 · 拖动底部滚动条查看13仓</span><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={page === 0} onClick={() => update({ page: page - 1 })}>上一页</Button><span>{page + 1} / {pages}</span><Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => update({ page: page + 1 })}>下一页</Button></div></div>
      </TabsContent><TabsContent value="issues"><DataTable rows={issues.map((issue, i) => ({ _id: String(i), '商品名称': issue.name, 'SKU': issue.sku, '问题': issue.reason }))} headers={['商品名称', 'SKU', '问题']} /></TabsContent><TabsContent value="excluded"><DataTable rows={analysis.excluded.map(row => ({ _id: row.id, '源表行号': row.rowNumber, '商品名称': row.name, 'SKU': row.sku, '全国近7日出库': row.metrics['全国近7日出库商品件数'], '全国现货库存': row.metrics['全国现货库存'], '原因': row.reason }))} headers={['源表行号', '商品名称', 'SKU', '全国近7日出库', '全国现货库存', '原因']} /></TabsContent></Tabs>
    </>}
    <Dialog open={Boolean(state.conflictOpen)} onOpenChange={open => { if (!busy) update({ conflictOpen: open }); }}><DialogContent className="max-w-5xl"><DialogHeader><DialogTitle>处理同名多SKU</DialogTitle><DialogDescription>选择只保留一个SKU，或为不同SKU修改本次商品名称。被排除SKU的库存和出库量不会并入保留商品。</DialogDescription></DialogHeader><ScrollArea className="h-[50vh]"><div className="flex flex-col gap-4 pr-3">{conflicts.map((conflict, i) => <Card key={conflict.name}><CardHeader><CardTitle>{conflict.name}</CardTitle><CardDescription>{conflict.resolved ? `已保留 ${conflict.chosen}` : '未处理，整批导出已拦截'}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3"><Field><FieldLabel htmlFor={`dailyKeepSku-${i}`}>只保留一个SKU</FieldLabel><Choice id={`dailyKeepSku-${i}`} label={`保留SKU ${i + 1}`} disabled={busy} value={conflict.chosen || '__none__'} onChange={sku => analyze({ edits: { ...edits, choices: { ...edits.choices, [conflict.name]: sku === '__none__' ? '' : sku } } })} options={[{ value: '__none__', label: '尚未选择／重新核对' }, ...conflict.candidates.map(candidate => ({ value: candidate.sku || '__missing__', disabled: !candidate.sku, label: `${candidate.sku || 'SKU为空'} · 7日出库${format(candidate.out7)} · 库存${format(candidate.stock)}` }))]} /></Field>{conflict.candidates.map(candidate => <Field key={candidate.sku}><FieldLabel htmlFor={`dailyRename-${candidate.ids[0]}`}>SKU {candidate.sku} · 源表行 {candidate.rowNumbers.join('、')}</FieldLabel><Input id={`dailyRename-${candidate.ids[0]}`} value={state.draftNames?.[candidate.ids[0]] ?? conflict.name} disabled={busy} onChange={event => update({ draftNames: { ...state.draftNames, ...Object.fromEntries(candidate.ids.map(id => [id, event.target.value])) } })} /></Field>)}</CardContent></Card>)}</div></ScrollArea><DialogFooter><Button variant="outline" disabled={busy} onClick={() => update({ conflictOpen: false })}>关闭</Button><Button id="dailyApplyNames" disabled={busy || !Object.keys(state.draftNames || {}).length} onClick={() => run(async () => { const next = { ...edits, names: { ...edits.names, ...state.draftNames } }; const result = await api.analyzeDailyOutbound(payload({ edits: next })); update({ edits: next, analysis: result, draftNames: {} }); })}>应用名称修改</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
