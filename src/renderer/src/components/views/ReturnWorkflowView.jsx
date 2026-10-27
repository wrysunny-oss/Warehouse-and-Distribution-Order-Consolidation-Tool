import React from 'react';
import { Download, Upload, ArrowRight, RotateCcw, Save, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import constants from '../../../../shared/return-workflow.json';
import { text, number, unique, quantity, matches, Choice, StatusFilter, DataTable, SummaryTable, Stats } from './return-workflow-ui';

const { FOLLOWUP_HEADERS, EDITABLE_FIELDS } = constants;
const RETURN_TYPE = '退供出库预约单';
const stages = { selection: ['1. 选择明细', '导入原始预约单，手动勾选本次未申报明细。'], followup: ['2. 维护跟进', '由子表2生成跟进表，支持批量填写和纸质识别表导入。'], summary: ['3. 按地址汇总', '直接导入子表3，或接收第二步结果，按地址分别导出。'] };
const initial = { stage: 'selection', snapshot: {}, selected: [], followupSelected: [], statuses: ['已完成'], type: RETURN_TYPE, search: '', followupSearch: '', pending: {}, titles: {}, busy: false, error: '' };

export function ReturnWorkflowView({ model, setModel, onOpenProducts }) {
  const state = model || initial;
  const { stage, snapshot, busy, pending } = state;
  const api = window.excelTool;
  const update = patch => setModel(previous => ({ ...(previous || initial), ...patch }));
  const current = snapshot[stage];
  const selectedRows = snapshot.selection?.rows.filter(row => state.selected.includes(row._id)) || [];
  const selectedQuantity = selectedRows.reduce((sum, row) => sum + (quantity(row['总件数']) ?? 0), 0);
  const selectedInvalid = selectedRows.filter(row => quantity(row['总件数']) === null || !text(row['预约日期']) || !text(row['履行单号']));
  const rawVisible = snapshot.selection?.rows.filter(row => text(row['预约单类型']) === state.type && state.statuses.includes(text(row['预约单状态'])) && matches(row, state.search)) || [];
  const followupRows = snapshot.followup?.rows.map(row => ({ ...row, ...(pending[row._id] || {}) })) || [];
  const followupVisible = followupRows.filter(row => matches(row, state.followupSearch));
  const summary = snapshot.summary?.analysis;
  const currentGroup = summary?.groups.find(group => group.address === state.address) || summary?.groups[0];
  const summaryStale = snapshot.summary?.stale || (snapshot.summary?.fromRevision != null && Object.keys(pending).length > 0);
  const emptyTitle = summary?.groups.some(group => Object.hasOwn(state.titles, group.address) && !state.titles[group.address].trim());

  async function run(task) {
    if (busy) return;
    update({ busy: true, error: '' });
    try { return await task(); }
    catch (error) { update({ error: error.message }); toast.error(error.message); }
    finally { update({ busy: false }); }
  }
  async function savePending() {
    if (!Object.keys(pending).length) return snapshot;
    const result = await api.updateReturnFollowup({ patches: Object.entries(pending).map(([id, values]) => ({ id, values })) });
    update({ snapshot: result, pending: {} });
    return result;
  }
  const importFile = purpose => run(async () => {
    if (purpose === 'paper') await savePending();
    const result = await api.openReturnStage({ stage: purpose });
    if (!result) return;
    const candidates = result.sheets.filter(sheet => !sheet.missing.length && !sheet.duplicates.length);
    const preferred = purpose === 'followup' ? candidates.find(sheet => sheet.name.includes('未申报')) : candidates[0];
    update({ importing: { ...result, stage: purpose, sheetId: preferred?.id || candidates[0]?.id || '' } });
  });
  async function loadSheet(replace = false) {
    const input = state.importing;
    if (!input?.sheetId) throw new Error('请选择符合格式的工作表。');
    if (input.stage === 'paper') {
      const result = await api.previewReturnFollowupImport({ workbookToken: input.workbookToken, sheetId: input.sheetId });
      update({ importing: null, paper: result, choices: {}, ignoreUnmatched: false }); return;
    }
    const occupied = input.stage === 'selection' ? snapshot.selection || snapshot.followup || snapshot.summary : input.stage === 'followup' ? snapshot.followup || snapshot.summary : snapshot.summary;
    if (occupied && !replace) { update({ confirming: 'load' }); return; }
    const result = await api.loadReturnStage({ stage: input.stage, workbookToken: input.workbookToken, sheetId: input.sheetId, replace });
    const patch = { snapshot: result, stage: input.stage, importing: null, confirming: null, titles: {} };
    if (input.stage !== 'summary') Object.assign(patch, { pending: {}, followupSelected: [], followupSearch: '' });
    if (input.stage === 'selection') Object.assign(patch, { selected: [], statuses: ['已完成'], type: unique(result.selection.rows.map(row => row['预约单类型'])).includes(RETURN_TYPE) ? RETURN_TYPE : unique(result.selection.rows.map(row => row['预约单类型']))[0], search: '' });
    update(patch);
  }
  async function convert(from, replace = false) {
    const saved = await savePending();
    const occupied = from === 'selection' ? saved.followup || saved.summary : saved.summary;
    if (occupied && !replace) { update({ confirming: from }); return; }
    const result = await api.convertReturnStage({ from, selectedIds: state.selected, statuses: state.statuses, type: state.type, replace });
    update({ snapshot: result, stage: from === 'selection' ? 'followup' : 'summary', pending: {}, followupSelected: [], confirming: null, titles: {} });
  }
  const exportStage = () => run(async () => {
    await savePending();
    const result = await api.exportReturnStage({ stage, selectedIds: state.selected, statuses: state.statuses, type: state.type, titles: state.titles });
    if (!result) return toast.info('已取消保存');
    if (!result.ok) { update({ error: result.message }); return; }
    toast.success(result.files ? `已生成 ${result.files.length} 个地址汇总文件` : `已导出：${result.filePath}`);
  });
  const canExport = current && !busy && (stage === 'selection' ? selectedRows.length > 0 && !selectedInvalid.length : stage === 'followup' ? !current.issues.length && current.rows.length > 0 : summary?.canExport && !summaryStale && !emptyTitle);
  const updatePending = (id, field, value) => setModel(previous => { const old = previous || initial; return { ...old, pending: { ...old.pending, [id]: { ...old.pending[id], [field]: value } } }; });
  const checkSelect = selected => { if (!busy) update({ [stage === 'selection' ? 'selected' : 'followupSelected']: selected }); };
  const snapshotAction = task => run(async () => { await savePending(); update({ snapshot: await task() }); });

  return <section id="returnWorkflowView" aria-busy={busy} className="flex-1 min-h-0 min-w-0 overflow-y-auto p-5 flex flex-col gap-4">
    <Card className="shrink-0"><CardHeader><CardTitle>退货三步处理</CardTitle><CardDescription>每一步可直接导入对应 Excel，填写跟进后按地址分别导出。</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
      <Tabs value={stage} onValueChange={stage => update({ stage })}><TabsList aria-label="退货处理步骤">{Object.entries(stages).map(([key, [label]]) => <TabsTrigger key={key} value={key} disabled={busy}>{label}</TabsTrigger>)}</TabsList></Tabs>
      <div className="flex flex-wrap justify-between items-center gap-3"><div className="flex flex-col gap-1"><p className="text-sm">{stages[stage][1]}</p>{current && <p className="text-xs text-muted-foreground break-all">{current.sourceName} · {number(current.rows.length)} 行 · 本次会话内保留</p>}</div><div className="flex flex-wrap gap-2"><Button id="returnStageImport" variant="outline" disabled={busy} onClick={() => importFile(stage)}><Upload data-icon="inline-start" />导入{stage === 'selection' ? '原始预约单' : stage === 'followup' ? '子表2' : '子表3'}</Button><Button id="returnStageExport" disabled={!canExport} onClick={exportStage}><Download data-icon="inline-start" />{stage === 'selection' ? '导出子表2' : stage === 'followup' ? '导出子表3' : `按地址导出（${summary?.groups.length || 0}）`}</Button></div></div>
    </CardContent></Card>
    {state.error && <Alert variant="destructive"><AlertTitle>操作未完成</AlertTitle><AlertDescription>{state.error}</AlertDescription></Alert>}
    {!current ? <Empty className="border bg-background min-h-64"><EmptyHeader><EmptyTitle>{stages[stage][0]}</EmptyTitle><EmptyDescription>直接导入对应步骤的 .xlsx 文件，可选择工作表，无需先完成上一步。</EmptyDescription></EmptyHeader><Button variant="outline" disabled={busy} onClick={() => importFile(stage)}>选择 Excel 文件</Button></Empty> : <>
      {stage === 'selection' && <>
        <FieldGroup className="flex-row flex-wrap items-end gap-4"><Field className="w-60 shrink-0"><FieldLabel htmlFor="returnRawType">预约单类型</FieldLabel><Choice id="returnRawType" label="预约单类型" value={state.type} disabled={busy} options={unique(current.rows.map(row => row['预约单类型'])).map(value => ({ value, label: value }))} onChange={type => update({ type, selected: [] })} /></Field><StatusFilter rows={current.rows.filter(row => text(row['预约单类型']) === state.type)} value={state.statuses} onChange={statuses => update({ statuses, selected: [] })} disabled={busy} /><Field className="min-w-60 flex-1"><FieldLabel htmlFor="returnRawSearch">搜索明细</FieldLabel><Input id="returnRawSearch" placeholder="单号、商品或条码" value={state.search} disabled={busy} onChange={event => update({ search: event.target.value })} /></Field></FieldGroup>
        <Stats values={[[ '筛选结果', `${number(rawVisible.length)} 行`, '当前类型和状态' ], ['本次已选', `${number(selectedRows.length)} 行`, '按整行选择，不自动判定申报历史'], ['已选数量', `${number(selectedQuantity)} 包`, '总件数直接累计，不乘箱规'], ['已选异常', `${selectedInvalid.length} 行`, '异常数量、缺日期或单号不可导出']]} />
        <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={() => update({ selected: unique([...state.selected, ...rawVisible.map(row => row._id)]) })}>全选当前筛选结果</Button><Button variant="outline" size="sm" disabled={busy || !state.selected.length} onClick={() => update({ selected: [] })}>清空选择</Button><Button id="returnToFollowup" size="sm" disabled={busy || !selectedRows.length || selectedInvalid.length > 0 || state.type !== RETURN_TYPE} onClick={() => run(() => convert('selection'))}>生成第二步跟进表<ArrowRight data-icon="inline-end" /></Button></div>
        {state.type !== RETURN_TYPE && <p className="text-xs text-muted-foreground">普通直入预约单请使用上方入库汇总入口。</p>}
        <DataTable key={current.sourceName} rows={rawVisible} headers={current.headers.filter(Boolean)} selected={state.selected} onSelect={checkSelect} disabled={busy} />
      </>}
      {stage === 'followup' && <>
        <Stats values={[[ '跟进明细', `${current.rows.length} 行`, '按样表导出17列' ], ['数量', `${number(current.metrics.quantity)} 包`, current.metrics.invalidQuantityCount ? `${current.metrics.invalidQuantityCount} 行数量无效，未计入` : '合法零值保留'], ['待处理问题', `${current.issues.length} 项`, '匹配或数据异常阻止导出'], ['尚未保存', `${Object.keys(pending).length} 行`, '生成下一步及导出时自动保存']]} />
        <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={onOpenProducts}><Settings data-icon="inline-start" />商品主数据</Button><Button id="returnFollowupRematch" variant="outline" size="sm" disabled={busy} onClick={() => snapshotAction(() => api.rematchReturnFollowup())}><RotateCcw data-icon="inline-start" />重新匹配</Button><Button id="returnSaveFollowup" variant="outline" size="sm" disabled={busy || !Object.keys(pending).length} onClick={() => run(async () => { await savePending(); toast.success('填写已保存至本次会话'); })}><Save data-icon="inline-start" />保存填写</Button><Button id="returnBatchEdit" variant="outline" size="sm" disabled={busy || !state.followupSelected.length} onClick={() => update({ batch: {} })}>批量填写（{state.followupSelected.length}）</Button><Button id="returnPaperImport" variant="outline" size="sm" disabled={busy} onClick={() => importFile('paper')}>导入跟进信息表</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => run(async () => { if (await api.exportReturnFollowupTemplate()) toast.success('已导出跟进信息导入模板'); })}>下载导入模板</Button><Button id="returnToSummary" size="sm" disabled={busy || current.issues.length > 0} onClick={() => run(() => convert('followup'))}>生成第三步汇总<ArrowRight data-icon="inline-end" /></Button></div>
        <Field><FieldLabel htmlFor="returnFollowupSearch">查找并勾选批量填写的明细</FieldLabel><Input id="returnFollowupSearch" value={state.followupSearch} onChange={event => update({ followupSearch: event.target.value })} placeholder="单号、商品或条码；可勾选同一单号的全部明细" disabled={busy} /></Field>
        <Tabs defaultValue="records"><TabsList><TabsTrigger value="records">跟进表</TabsTrigger><TabsTrigger value="issues">匹配及数据问题（{current.issues.length}）</TabsTrigger></TabsList><TabsContent value="records"><DataTable key={current.sourceName} rows={followupVisible} headers={[...FOLLOWUP_HEADERS.slice(0, 3), '货品条码', ...FOLLOWUP_HEADERS.slice(3)]} selected={state.followupSelected} onSelect={checkSelect} disabled={busy} render={(row, header) => EDITABLE_FIELDS.includes(header) ? <Input aria-label={`${header} 源表第${row._sourceRow}行`} value={row[header] ?? ''} disabled={busy} className="w-52" onChange={event => updatePending(row._id, header, event.target.value)} /> : header === '货品条码' ? row._barcode : header === '产品明细' && row._matchIssue ? <Badge variant="destructive">{row._matchIssue}</Badge> : text(row[header]) || '—'} /></TabsContent><TabsContent value="issues"><DataTable rows={current.issues.map((issue, i) => ({ _id: String(i), '源表行号': issue.rowNumber, '履行单号': issue.orderNumber, '货品条码': issue.barcode, '问题': issue.reason }))} headers={['源表行号', '履行单号', '货品条码', '问题']} /></TabsContent></Tabs>
      </>}
      {stage === 'summary' && <>
        <StatusFilter rows={current.rows} value={current.statuses} disabled={busy} onChange={statuses => run(async () => update({ snapshot: await api.analyzeReturnAddresses({ statuses }) }))} />
        <Stats values={[[ '当前状态范围', `${summary.selected.count} 行 · ${number(summary.selected.quantity)} 包`, summary.selected.invalidQuantityCount ? `${summary.selected.invalidQuantityCount} 行无效数量，未计入` : '默认仅已完成，可调整状态'], ['有效地址', `${summary.groups.length} 个`, `共 ${number(summary.groups.reduce((sum, group) => sum + group.quantity, 0))} 包`], ['空地址待补', `${summary.pending.count} 行 · ${number(summary.pending.quantity)} 包`, '暂不导出，不影响其他地址'], ['弃货排除', `${summary.discarded.count} 行 · ${number(summary.discarded.quantity)} 包`, '单独展示，不生成汇总文件']]} />
        {summaryStale && <Alert><AlertTitle>第二步跟进表已更新</AlertTitle><AlertDescription>请回到第二步重新生成第三步，核对后再导出。</AlertDescription></Alert>}
        <Tabs defaultValue="preview"><TabsList><TabsTrigger value="preview">地址汇总预览</TabsTrigger><TabsTrigger value="pending">待补地址（{summary.pending.count}）</TabsTrigger><TabsTrigger value="discarded">弃货（{summary.discarded.count}）</TabsTrigger><TabsTrigger value="issues">导出问题（{summary.groups.reduce((sum, group) => sum + group.analysis.issues.length, 0)}）</TabsTrigger></TabsList><TabsContent value="preview" className="flex flex-col gap-3 min-w-0">
          {currentGroup ? <><FieldGroup className="flex-row flex-wrap items-end gap-4"><Field className="w-60 shrink-0"><FieldLabel htmlFor="returnAddress">预览退回地址</FieldLabel><Choice id="returnAddress" label="预览退回地址" value={currentGroup.address} onChange={address => update({ address })} options={summary.groups.map(group => ({ value: group.address, label: group.address }))} /></Field><Field className="flex-1 min-w-72"><FieldLabel htmlFor="returnAddressTitle">当前地址导出主标题</FieldLabel><Input id="returnAddressTitle" value={state.titles[currentGroup.address] ?? currentGroup.analysis.defaultTitle} aria-invalid={Object.hasOwn(state.titles, currentGroup.address) && !state.titles[currentGroup.address].trim()} disabled={busy} onChange={event => update({ titles: { ...state.titles, [currentGroup.address]: event.target.value } })} /></Field><Button variant="ghost" onClick={() => { const titles = { ...state.titles }; delete titles[currentGroup.address]; update({ titles }); }}>恢复默认标题</Button></FieldGroup><p className="text-xs text-muted-foreground">{currentGroup.analysis.canExport ? '校验通过' : '当前地址存在待处理问题'} · 两侧合计 {number(currentGroup.analysis.totalPackages)} 包 · 导出包含全部有效地址</p><SummaryTable analysis={currentGroup.analysis} /></> : <Empty><EmptyHeader><EmptyTitle>没有可导出的地址分组</EmptyTitle><EmptyDescription>请检查状态筛选，并补齐退回地址。</EmptyDescription></EmptyHeader></Empty>}
        </TabsContent>{['pending', 'discarded'].map(key => <TabsContent key={key} value={key}><DataTable rows={summary[key].rows} headers={['预约单状态', '履行单号', '产品明细', '数量（包）', '退回地址', '备注']} /></TabsContent>)}<TabsContent value="issues"><DataTable rows={summary.groups.flatMap(group => group.analysis.issues.map((issue, i) => ({ _id: `${group.address}-${i}`, '退回地址': group.address, '源表行号': issue.rowNumber, '履行单号': issue.orderNumber, '问题': issue.reason })))} headers={['退回地址', '源表行号', '履行单号', '问题']} /></TabsContent></Tabs>
      </>}
    </>}
    <Dialog open={Boolean(state.importing) && !state.confirming} onOpenChange={open => { if (!open && !busy) update({ importing: null }); }}><DialogContent><DialogHeader><DialogTitle>选择需要处理的工作表</DialogTitle><DialogDescription>{state.importing?.fileName} · 按字段校验，选择对应子表。</DialogDescription></DialogHeader><Field><FieldLabel htmlFor="returnImportSheet">工作表</FieldLabel><Choice id="returnImportSheet" label="选择工作表" value={state.importing?.sheetId || ''} disabled={busy} onChange={sheetId => update({ importing: { ...state.importing, sheetId } })} options={state.importing?.sheets.map(sheet => ({ value: sheet.id, label: `${sheet.name}（${sheet.rowCount} 行）`, disabled: sheet.missing.length > 0 || sheet.duplicates.length > 0 })) || []} /></Field><ScrollArea className="max-h-40"><div className="flex flex-col gap-2 text-xs text-muted-foreground">{state.importing?.sheets.filter(sheet => sheet.missing.length || sheet.duplicates.length).map(sheet => <p key={sheet.id}>{sheet.name}：{sheet.missing.length ? `缺少 ${sheet.missing.join('、')}` : '存在重复表头'}</p>)}</div></ScrollArea><DialogFooter><Button variant="outline" disabled={busy} onClick={() => update({ importing: null })}>取消</Button><Button id="returnLoadSheet" disabled={busy || !state.importing?.sheetId} onClick={() => run(() => loadSheet())}>读取所选工作表</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(state.confirming)} onOpenChange={open => { if (!open && !busy) update({ confirming: null }); }}><DialogContent><DialogHeader><DialogTitle>替换已有处理结果</DialogTitle><DialogDescription>将替换目标步骤及其下游结果，已有填写不会自动合并。需要保留的内容请先取消并导出对应表格。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={busy} onClick={() => update({ confirming: null })}>取消</Button><Button id="returnConfirmReplace" variant="destructive" disabled={busy} onClick={() => run(() => state.confirming === 'load' ? loadSheet(true) : convert(state.confirming, true))}>确认替换</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(state.batch)} onOpenChange={open => { if (!open && !busy) update({ batch: null }); }}><DialogContent><DialogHeader><DialogTitle>批量填写 {state.followupSelected.length} 行</DialogTitle><DialogDescription>只更新勾选的货品明细。空白字段不修改已有信息。</DialogDescription></DialogHeader><FieldGroup className="grid grid-cols-2 gap-4">{EDITABLE_FIELDS.map(field => <Field key={field}><FieldLabel htmlFor={`returnBatch-${field}`}>{field}</FieldLabel><Input id={`returnBatch-${field}`} value={state.batch?.[field] ?? ''} onChange={event => update({ batch: { ...state.batch, [field]: event.target.value } })} disabled={busy} placeholder={field === '快递安排时间' ? '如 2026-10-23' : undefined} /></Field>)}</FieldGroup><DialogFooter><Button variant="outline" disabled={busy} onClick={() => update({ batch: null })}>取消</Button><Button id="returnApplyBatch" disabled={busy || !Object.values(state.batch || {}).some(value => value.trim())} onClick={() => run(async () => { await savePending(); const values = Object.fromEntries(Object.entries(state.batch).filter(([, value]) => value.trim())); const result = await api.updateReturnFollowup({ patches: state.followupSelected.map(id => ({ id, values })) }); update({ snapshot: result, batch: null, pending: {} }); })}>应用到勾选明细</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(state.paper)} onOpenChange={open => { if (!open && !busy) update({ paper: null }); }}><DialogContent className="max-w-5xl"><DialogHeader><DialogTitle>核对跟进信息导入</DialogTitle><DialogDescription>影响 {state.paper?.affectedCount || 0} 行，冲突 {state.paper?.conflictCount || 0} 项。仅提供单号时更新该单号下全部货品，提供商品信息时进一步限定。</DialogDescription></DialogHeader>
      {state.paper && <DataTable id="returnPaperPreview" height="h-64" rows={state.paper.changes.map(change => ({ ...change, _id: change.key, '履行单号': change.orderNumber, '产品明细': change.productName, '字段': change.field, '原内容': change.existing, '导入内容': change.values.join(' ／ '), '处理': '' }))} headers={['履行单号', '产品明细', '字段', '原内容', '导入内容', '处理']} render={(row, header) => header === '处理' ? row.conflict ? <Choice label={`冲突处理 ${row.orderNumber} ${row.field}`} value={state.choices?.[row.key] || ''} onChange={choice => update({ choices: { ...state.choices, [row.key]: choice } })} disabled={busy} options={[{ value: 'keep', label: '保留原内容' }, ...row.values.map((value, i) => ({ value: String(i), label: `使用：${value}` }))]} /> : '写入非空内容' : text(row[header]) || '—'} />}
      {state.paper?.unmatched.length > 0 && <><Alert><AlertTitle>{state.paper.unmatched.length} 行未匹配</AlertTitle><AlertDescription><ScrollArea className="h-20">{state.paper.unmatched.map((row, i) => <p key={i}>源表第{row.rowNumber}行 · {row.orderNumber || '缺少单号'} · {row.reason}</p>)}</ScrollArea></AlertDescription></Alert><Field orientation="horizontal"><Checkbox id="returnIgnoreUnmatched" checked={Boolean(state.ignoreUnmatched)} onCheckedChange={ignoreUnmatched => update({ ignoreUnmatched: Boolean(ignoreUnmatched) })} /><FieldLabel htmlFor="returnIgnoreUnmatched">已核对，忽略未匹配行并继续</FieldLabel></Field></>}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => update({ paper: null })}>取消</Button><Button id="returnApplyPaper" disabled={busy || !state.paper?.changes.length || state.paper.changes.some(change => change.conflict && !Object.hasOwn(state.choices || {}, change.key)) || (state.paper.unmatched.length > 0 && !state.ignoreUnmatched)} onClick={() => run(async () => { update({ snapshot: await api.applyReturnFollowupImport({ previewToken: state.paper.token, choices: state.choices, ignoreUnmatched: state.ignoreUnmatched }), paper: null }); toast.success('跟进信息已核对并写入'); })}>确认写入</Button></DialogFooter>
    </DialogContent></Dialog>
  </section>;
}
