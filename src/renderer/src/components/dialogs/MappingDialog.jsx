import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import React, { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Save, AlertCircle, ArrowRight } from 'lucide-react';

export function MappingDialog({
  open,
  onOpenChange,
  mappingRows = [],
  directWarehouses = [],
  initialMapping = {},
  onSaveMapping,
}) {
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState({});

  useEffect(() => {
    if (open) {
      setDraft({ ...initialMapping });
      setSearch('');
    }
  }, [open, initialMapping]);

  const filteredRows = useMemo(() => {
    if (!search.trim()) return mappingRows;
    const q = search.trim().toLowerCase();
    return mappingRows.filter((r) =>
      r.source.toLowerCase().includes(q) ||
      (draft[r.source] || '').toLowerCase().includes(q)
    );
  }, [mappingRows, search, draft]);

  const unresolvedCount = useMemo(() => {
    return mappingRows.filter((r) => !draft[r.source]).length;
  }, [mappingRows, draft]);

  const handleSelectChange = (source, target) => {
    setDraft((prev) => ({
      ...prev,
      [source]: target,
    }));
  };

  const handleSave = () => {
    onSaveMapping(draft);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent id="mappingDialog" className="max-w-3xl flex flex-col max-h-[85vh]">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle>前置仓到直营仓映射</DialogTitle>
            {unresolvedCount > 0 ? (
              <Badge variant="warning" className="gap-1">
                <AlertCircle className="h-3 w-3" />
                {unresolvedCount} 个待匹配
              </Badge>
            ) : (
              <Badge variant="success">已全部映射</Badge>
            )}
          </div>
          <DialogDescription>
            系统自动匹配名称含相同城市的仓库，其余需手动选择。映射将保存在本机。
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 py-2 border-b border-zinc-100">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              id="mappingSearch"
              placeholder="筛选前置仓或直营仓名称..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-8 text-xs"
            />
          </div>
          <span id="mappingSummary" className="text-xs text-zinc-500 whitespace-nowrap">
            共 {mappingRows.length} 个前置仓 · 待配置 {unresolvedCount} 个
          </span>
        </div>

        <div id="mappingList" className="flex-1 overflow-y-auto min-h-[300px] max-h-[460px] divide-y divide-zinc-100 pr-1">
          {filteredRows.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-400">
              未找到匹配的前置仓
            </div>
          ) : (
            filteredRows.map((row) => {
              const currentTarget = draft[row.source] || '';
              const isUnresolved = !currentTarget;

              return (
                <div
                  key={row.source}
                  className={`grid grid-cols-[1fr_80px_1fr] items-center gap-3 py-2.5 px-2 rounded-md transition-colors ${
                    isUnresolved ? 'bg-amber-50/50' : 'hover:bg-zinc-50'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-zinc-800 truncate" title={row.source}>
                      {row.source}
                    </p>
                    <p className="text-[11px] text-zinc-400 truncate">
                      前置仓原始名称
                    </p>
                  </div>

                  <div className="flex flex-col items-center justify-center text-zinc-400">
                    <ArrowRight className="h-3.5 w-3.5 text-zinc-400" />
                    <span className="text-[10px] text-zinc-500 tabular-nums">
                      {row.orders || 0} 单
                    </span>
                  </div>

                  <div>
                    <Select value={String((currentTarget) ?? '') || '__none__'} onValueChange={value => handleSelectChange(row.source, (value === '__none__' ? '' : value))}>
                      <SelectTrigger className="h-8 w-full text-xs" aria-label="选择映射仓库"><SelectValue placeholder="请选择" /></SelectTrigger>
                      <SelectContent><SelectGroup>
                      <SelectItem value="__none__">-- 请选择直营仓 --</SelectItem>
                      {directWarehouses.map((wh) => (
                        <SelectItem key={wh} value={String(wh)}>
                          {wh}
                        </SelectItem>
                      ))}
                    </SelectGroup></SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <span className="text-xs text-zinc-400">
            保存后将立即触发重新计算
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button id="saveMappingBtn" size="sm" onClick={handleSave}>
              <Save className="h-3.5 w-3.5" />
              保存并重新汇总
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
