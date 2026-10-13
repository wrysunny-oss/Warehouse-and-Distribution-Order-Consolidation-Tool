import React, { useState, useEffect } from 'react';
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
import { RotateCcw, Plus, Trash2, Save } from 'lucide-react';

const DEFAULT_MAP = {
  '推广服务费': '电商市场推广费',
  '客服服务费': '售后费用',
  '供应链管理服务费': '售后费用',
  '集货仓物流费': '电商物流费',
  '技术服务费': '电商运营费',
  '物流服务费': '电商物流费'
};

export function PlatformFeeConfigDialog({
  open,
  onOpenChange,
  categoryRemarks = {},
  onSaveRemarks,
}) {
  const [items, setItems] = useState([]);
  const [newCat, setNewCat] = useState('');
  const [newRemark, setNewRemark] = useState('');

  useEffect(() => {
    if (open) {
      const merged = { ...DEFAULT_MAP, ...categoryRemarks };
      const list = Object.entries(merged).map(([cat, rem]) => ({
        id: cat,
        cat,
        rem
      }));
      setItems(list);
      setNewCat('');
      setNewRemark('');
    }
  }, [open, categoryRemarks]);

  const handleChange = (index, field, val) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: val };
      return next;
    });
  };

  const handleRemove = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    if (!newCat.trim()) return;
    setItems((prev) => [
      ...prev,
      { id: newCat.trim(), cat: newCat.trim(), rem: newRemark.trim() }
    ]);
    setNewCat('');
    setNewRemark('');
  };

  const handleReset = () => {
    const list = Object.entries(DEFAULT_MAP).map(([cat, rem]) => ({
      id: cat,
      cat,
      rem
    }));
    setItems(list);
  };

  const handleSave = () => {
    const result = {};
    for (const item of items) {
      if (item.cat.trim()) {
        result[item.cat.trim()] = item.rem.trim();
      }
    }
    onSaveRemarks(result);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl flex flex-col max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>费用大类与财务科目（备注）设置</DialogTitle>
          <DialogDescription>
            配置天猫开票内容大类汇总后对应的财务备注科目。生成表二（汇总表）时将自动匹配并填入最后一列。
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2 text-xs space-y-2 pr-1">
          <div className="grid grid-cols-12 gap-2 text-[11px] font-semibold text-zinc-500 px-1 pb-1 border-b border-zinc-200">
            <span className="col-span-5">开票内容大类</span>
            <span className="col-span-6">财务科目备注</span>
            <span className="col-span-1 text-center">操作</span>
          </div>

          {items.map((item, idx) => (
            <div key={item.id || idx} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-5">
                <Input
                  size="sm"
                  value={item.cat}
                  onChange={(e) => handleChange(idx, 'cat', e.target.value)}
                  placeholder="开票大类名称"
                  className="h-8 text-xs font-medium"
                />
              </div>
              <div className="col-span-6">
                <Input
                  size="sm"
                  value={item.rem}
                  onChange={(e) => handleChange(idx, 'rem', e.target.value)}
                  placeholder="财务科目（如：电商市场推广费）"
                  className="h-8 text-xs"
                />
              </div>
              <div className="col-span-1 flex justify-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemove(idx)}
                  className="size-7 text-zinc-400 hover:text-red-600 hover:bg-red-50"
                  title="删除"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}

          {/* 新增行 */}
          <div className="grid grid-cols-12 gap-2 items-center pt-2 border-t border-dashed border-zinc-200">
            <div className="col-span-5">
              <Input
                size="sm"
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                placeholder="新增大类名称..."
                className="h-8 text-xs"
              />
            </div>
            <div className="col-span-6">
              <Input
                size="sm"
                value={newRemark}
                onChange={(e) => setNewRemark(e.target.value)}
                placeholder="对应财务科目..."
                className="h-8 text-xs"
              />
            </div>
            <div className="col-span-1 flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleAdd}
                className="size-7 text-zinc-700 hover:text-zinc-950"
                title="添加"
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="flex justify-between items-center sm:justify-between pt-2 border-t border-zinc-200">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="text-xs text-zinc-600 hover:text-zinc-900"
          >
            <RotateCcw className="size-3.5 mr-1" />
            恢复默认
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              className="text-xs bg-zinc-900 text-white hover:bg-zinc-800"
            >
              <Save className="size-3.5 mr-1" />
              保存配置
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
