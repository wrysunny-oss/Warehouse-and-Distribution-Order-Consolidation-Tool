import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldSet, FieldLegend } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectLabel, SelectItem } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

export const text = value => String(value ?? '').trim();
export const number = value => Number(value).toLocaleString('zh-CN');
export const unique = values => [...new Set(values.map(text).filter(Boolean))];
export const quantity = value => text(value) !== '' && ['string', 'number'].includes(typeof value) && Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
export const matches = (row, search) => !search.trim() || ['履行单号', '待预约单据编号', '货品名称', '产品明细', '货品条码'].some(key => text(row[key] || (key === '货品条码' ? row._barcode : '')).toLowerCase().includes(search.trim().toLowerCase()));

export function Choice({ id, label, value, options, onChange, disabled, placeholder }) {
  return <Select value={value} disabled={disabled} onValueChange={onChange}><SelectTrigger id={id} aria-label={label}><SelectValue placeholder={placeholder || '请选择'} /></SelectTrigger><SelectContent><SelectGroup><SelectLabel>{label}</SelectLabel>{options.map(option => <SelectItem key={option.value} value={option.value} disabled={option.disabled}>{option.label}</SelectItem>)}</SelectGroup></SelectContent></Select>;
}

export function StatusFilter({ rows, value, onChange, disabled }) {
  const options = unique(['已完成', ...rows.map(row => row['预约单状态'])]);
  const active = options.every(status => value.includes(status)) && value.length > 1 ? 'all' : value.length === 1 ? `status:${value[0]}` : '';
  return <FieldSet className="gap-2"><FieldLegend className="mb-0 text-xs">预约单状态</FieldLegend>
    <ToggleGroup type="single" variant="outline" size="sm" value={active} disabled={disabled} aria-label="预约单状态快捷筛选" className="flex-wrap justify-start" onValueChange={next => { if (next) onChange(next === 'all' ? options : [next.slice(7)]); }}>
      <ToggleGroupItem value="all" aria-label="全部状态">全部状态</ToggleGroupItem>
      {options.map(status => <ToggleGroupItem key={status} value={`status:${status}`} aria-label={`只看${status}`}>{status}<span className="text-muted-foreground">{rows.filter(row => text(row['预约单状态']) === status).length}</span></ToggleGroupItem>)}
    </ToggleGroup>
  </FieldSet>;
}

export function DataTable({ rows, headers, selected, onSelect, render, disabled, id = 'returnDataScroll', height = 'h-[360px]', tableClassName = '', headerLabels = {} }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / 80)), current = Math.min(page, pages - 1);
  const selectedCount = selected ? rows.filter(row => selected.includes(row._id)).length : 0;
  return <div className="min-w-0 flex flex-col gap-2"><ScrollArea id={id} type="always" className={`${height} min-w-0 w-full max-w-full rounded-md border bg-background`}>
    <Table className={`w-max min-w-full ${tableClassName}`} containerClassName="overflow-visible"><TableHeader><TableRow>{selected && <TableHead><Checkbox aria-label="全选当前筛选结果" checked={selectedCount ? selectedCount === rows.length ? true : 'indeterminate' : false} disabled={disabled || !rows.length} onCheckedChange={checked => onSelect(checked ? unique([...selected, ...rows.map(row => row._id)]) : selected.filter(id => !rows.some(row => row._id === id)))} /></TableHead>}{headers.map(header => <TableHead key={header}>{headerLabels[header] ?? header}</TableHead>)}</TableRow></TableHeader>
      <TableBody>{rows.slice(current * 80, (current + 1) * 80).map((row, i) => <TableRow key={row._id || i}>{selected && <TableCell><Checkbox aria-label={`选择源表第${row._sourceRow}行`} disabled={disabled} checked={selected.includes(row._id)} onCheckedChange={checked => onSelect(checked ? [...selected, row._id] : selected.filter(id => id !== row._id))} /></TableCell>}{headers.map(header => <TableCell key={header} className="min-w-32 max-w-80 truncate" title={text(row[header])}>{render ? render(row, header) : text(row[header]) || '—'}</TableCell>)}</TableRow>)}</TableBody>
    </Table>{rows.length === 0 && <p className="p-6 text-sm text-muted-foreground">没有符合条件的记录。</p>}<ScrollBar orientation="horizontal" /></ScrollArea>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>共 {number(rows.length)} 行 · 拖动底部滚动条查看末列</span><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>上一页</Button><span>{current + 1} / {pages}</span><Button size="sm" variant="outline" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>下一页</Button></div></div>
  </div>;
}

export function SummaryTable({ analysis }) {
  const rows = Array.from({ length: Math.max(analysis.productSummary.length, analysis.orderSummary.length) + 1 }, (_, i) => {
    const product = analysis.productSummary[i], order = analysis.orderSummary[i];
    return { _id: String(i), '左序号': product?.number ?? '', '产品明细': product?.name ?? (i === analysis.productSummary.length ? '总计' : ''), '左数量（包）': product?.quantity ?? (i === analysis.productSummary.length ? analysis.productTotal : ''), '分隔': '', '右序号': order?.number ?? '', '预约日期': order?.date ?? (i === analysis.orderSummary.length ? '总计' : ''), '退供单号': order?.orderNumber ?? '', '右数量（包）': order?.quantity ?? (i === analysis.orderSummary.length ? analysis.orderTotal : '') };
  });
  return <DataTable id="returnAddressScroll" tableClassName="min-w-[1240px]" rows={rows} headers={['左序号', '产品明细', '左数量（包）', '分隔', '右序号', '预约日期', '退供单号', '右数量（包）']} headerLabels={{ '左序号': '序号', '右序号': '序号', '左数量（包）': '数量（包）', '右数量（包）': '数量（包）', '分隔': '' }} render={(row, header) => row[header]} />;
}

export function Stats({ values }) {
  return <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">{values.map(([label, value, description]) => <Card key={label}><CardHeader className="pb-3"><CardDescription>{label}</CardDescription><CardTitle>{value}</CardTitle></CardHeader><CardContent><p className="text-xs text-muted-foreground">{description}</p></CardContent></Card>)}</div>;
}
