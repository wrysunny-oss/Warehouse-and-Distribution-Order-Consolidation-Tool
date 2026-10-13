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
import { Textarea } from '@/components/ui/textarea';
import { RotateCcw, Save } from 'lucide-react';

export function ProductCatalogDialog({
  open,
  onOpenChange,
  brand,
  initialText = '',
  onSaveCatalog,
  onRestoreDefault,
}) {
  const [text, setText] = useState('');

  useEffect(() => {
    if (open) {
      setText(initialText);
    }
  }, [open, initialText]);

  const handleSave = () => {
    onSaveCatalog(brand, text);
    onOpenChange(false);
  };

  const handleRestore = () => {
    onRestoreDefault(brand);
  };

  const lineCount = text ? text.split('\n').filter((l) => l.trim()).length : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent id="productCatalogDialog" className="max-w-2xl flex flex-col max-h-[85vh]">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle>配置商品清单</DialogTitle>
            <span id="productCatalogBrand" className="text-xs font-semibold px-2 py-0.5 rounded bg-zinc-100 text-zinc-700">
              {brand || '未指定品牌'}
            </span>
          </div>
          <DialogDescription>
            一行一个商品，排列顺序即为表三导出顺序。重复名称保存时将自动去重。
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col gap-2 py-2 min-h-0">
          <label htmlFor="productCatalogTextarea" className="text-xs font-medium text-zinc-700">
            商品列表 (已配置 {lineCount} 个)
          </label>
          <Textarea
            id="productCatalogTextarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck="false"
            placeholder="稻花翁泰玉京香大米5kg&#10;稻花翁长粒香米5kg"
            className="flex-1 min-h-[320px] font-mono text-xs leading-relaxed resize-none bg-zinc-50/30"
          />
          <p id="productCatalogHelp" className="text-[11px] text-zinc-400">
            默认从当前品牌的表一订单中去重生成；没有表一时从表二生成。
          </p>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <Button
            id="restoreProductCatalogBtn"
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRestore}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            恢复默认
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              id="saveProductCatalogBtn"
              type="button"
              size="sm"
              onClick={handleSave}
            >
              <Save className="h-3.5 w-3.5" />
              保存并重新汇总
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
