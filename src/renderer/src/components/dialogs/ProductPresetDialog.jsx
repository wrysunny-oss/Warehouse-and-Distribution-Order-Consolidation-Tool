import React, { useState, useMemo } from 'react';
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
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Search, Plus, Upload, RotateCcw, Trash2 } from 'lucide-react';

function getProductFields(p) {
  return {
    brand: p['品牌名称'] || p.brand || '',
    barcode: p['条码'] || p.barcode || '',
    shortName: p['订单简称'] || p.shortName || '',
    spec: p['规格kg'] ?? p.spec ?? '',
    boxSpec: p['采购规格(箱规数)'] ?? p.boxSpec ?? '',
    fullName: p['货品名称（带空格）'] || p.fullName || '',
    note: p['备注'] || p.note || '',
  };
}

export function ProductPresetDialog({
  open,
  onOpenChange,
  presets = [],
  onSavePresets,
  onResetPresets,
  onImportExcel,
}) {
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newForm, setNewForm] = useState({
    brand: '',
    barcode: '',
    shortName: '',
    spec: '',
    boxSpec: '',
    note: '',
    fullName: '',
  });

  const filteredPresets = useMemo(() => {
    if (!search.trim()) return presets;
    const q = search.trim().toLowerCase();
    return presets.filter((p) => {
      const f = getProductFields(p);
      return (
        f.brand.toLowerCase().includes(q) ||
        f.barcode.toLowerCase().includes(q) ||
        f.shortName.toLowerCase().includes(q) ||
        f.fullName.toLowerCase().includes(q)
      );
    });
  }, [presets, search]);

  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!newForm.brand || !newForm.barcode || !newForm.shortName || !newForm.spec || !newForm.boxSpec || !newForm.fullName) {
      return;
    }
    const updated = [
      {
        '序号': presets.length + 1,
        '品牌名称': newForm.brand.trim(),
        '条码': newForm.barcode.trim(),
        '订单简称': newForm.shortName.trim(),
        '规格kg': Number(newForm.spec),
        '采购规格(箱规数)': Number(newForm.boxSpec),
        '备注': (newForm.note || '').trim(),
        '货品名称（带空格）': newForm.fullName.trim(),
        '企业微信申报订单简称': newForm.shortName.trim(),
      },
      ...presets,
    ];
    onSavePresets(updated);
    setShowAddForm(false);
    setNewForm({
      brand: '',
      barcode: '',
      shortName: '',
      spec: '',
      boxSpec: '',
      note: '',
      fullName: '',
    });
  };

  const handleDelete = (indexToDelete) => {
    const target = filteredPresets[indexToDelete];
    const updated = presets.filter((p) => p !== target);
    onSavePresets(updated);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent id="productPresetDialog" className="max-w-5xl flex flex-col max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle>商品主数据全局预设</DialogTitle>
            <span id="presetCountBadge" className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-zinc-100 text-zinc-700">
              共 {presets.length} 个商品
            </span>
          </div>
          <DialogDescription id="productPresetMeta">
            用于送货单和采购需求表的条码、品牌、商品简称和规格匹配。修改后永久保存。
          </DialogDescription>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-2 border-b border-zinc-100">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <Input
              id="presetSearchInput"
              placeholder="搜索商品简称、条码、品牌..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              id="toggleAddProductBtn"
              size="sm"
              variant={showAddForm ? 'secondary' : 'outline'}
              onClick={() => setShowAddForm(!showAddForm)}
            >
              <Plus className="h-3.5 w-3.5" />
              {showAddForm ? '收起表单' : '新增商品'}
            </Button>
            <Button
              id="importPresetExcelBtn"
              size="sm"
              variant="outline"
              onClick={onImportExcel}
            >
              <Upload className="h-3.5 w-3.5" />
              重新导入 Excel 覆盖
            </Button>
            <Button
              id="resetPresetBtn"
              size="sm"
              variant="ghost"
              onClick={onResetPresets}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              恢复默认预设
            </Button>
          </div>
        </div>

        {/* Collapsible Add Form */}
        {showAddForm && (
          <form
            id="addProductForm"
            onSubmit={handleAddSubmit}
            className="p-3.5 bg-zinc-50 border border-zinc-200/80 rounded-lg space-y-3"
          >
            <div className="text-xs font-semibold text-zinc-800">新增商品信息</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 text-xs">
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1">品牌名称 *</label>
                <Input
                  id="newProductBrand"
                  placeholder="如：稻花翁"
                  value={newForm.brand}
                  onChange={(e) => setNewForm({ ...newForm, brand: e.target.value })}
                  required
                  className="h-7 text-xs bg-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1">条码 (多条码用#分隔) *</label>
                <Input
                  id="newProductBarcode"
                  placeholder="如：6911006000076"
                  value={newForm.barcode}
                  onChange={(e) => setNewForm({ ...newForm, barcode: e.target.value })}
                  required
                  className="h-7 text-xs bg-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1">订单简称 *</label>
                <Input
                  id="newProductShortName"
                  placeholder="如：稻花翁泰玉京香大米5kg"
                  value={newForm.shortName}
                  onChange={(e) => setNewForm({ ...newForm, shortName: e.target.value })}
                  required
                  className="h-7 text-xs bg-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1">规格 (kg) *</label>
                <Input
                  id="newProductSpec"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="如：5"
                  value={newForm.spec}
                  onChange={(e) => setNewForm({ ...newForm, spec: e.target.value })}
                  required
                  className="h-7 text-xs bg-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1">采购箱规 *</label>
                <Input
                  id="newProductBoxSpec"
                  type="number"
                  step="1"
                  min="1"
                  placeholder="如：5"
                  value={newForm.boxSpec}
                  onChange={(e) => setNewForm({ ...newForm, boxSpec: e.target.value })}
                  required
                  className="h-7 text-xs bg-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1">备注</label>
                <Input
                  id="newProductNote"
                  placeholder="如：真空（选填）"
                  value={newForm.note}
                  onChange={(e) => setNewForm({ ...newForm, note: e.target.value })}
                  className="h-7 text-xs bg-white"
                />
              </div>
              <div className="col-span-2 md:col-span-3">
                <label className="text-[11px] text-zinc-500 block mb-1">货品完整名称 *</label>
                <Input
                  id="newProductFullName"
                  placeholder="如：国宝桥米稻花翁泰玉京香大米5kg籼米南方大米 5kg×1袋"
                  value={newForm.fullName}
                  onChange={(e) => setNewForm({ ...newForm, fullName: e.target.value })}
                  required
                  className="h-7 text-xs bg-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                id="cancelAddProductBtn"
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAddForm(false)}
              >
                取消
              </Button>
              <Button id="saveNewProductBtn" type="submit" size="sm">
                保存添加
              </Button>
            </div>
          </form>
        )}

        {/* Table */}
        <div className="flex-1 overflow-y-auto min-h-[300px] max-h-[460px] border border-zinc-200/80 rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center">序号</TableHead>
                <TableHead className="w-24">品牌</TableHead>
                <TableHead className="w-36">条码</TableHead>
                <TableHead className="w-48">订单简称</TableHead>
                <TableHead className="w-20 text-right">规格(kg)</TableHead>
                <TableHead className="w-16 text-right">箱规</TableHead>
                <TableHead>货品完整名称</TableHead>
                <TableHead className="w-16 text-center">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody id="presetTableBody">
              {filteredPresets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-zinc-400">
                    未找到商品预设
                  </TableCell>
                </TableRow>
              ) : (
                filteredPresets.map((p, idx) => {
                  const f = getProductFields(p);
                  return (
                    <TableRow key={`${f.barcode}-${idx}`} className="text-xs">
                      <TableCell className="text-center font-mono text-zinc-400">
                        {idx + 1}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">
                          {f.brand}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-zinc-600 truncate" title={f.barcode}>
                        {f.barcode}
                      </TableCell>
                      <TableCell className="font-medium text-zinc-900 truncate" title={f.shortName}>
                        {f.shortName}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {f.spec}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {f.boxSpec}
                      </TableCell>
                      <TableCell className="text-zinc-600 truncate max-w-xs" title={f.fullName}>
                        {f.fullName}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(idx)}
                          className="h-6 w-6 text-zinc-400 hover:text-red-600"
                          title="删除"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <span className="text-xs text-zinc-400">
            保存后立即自动同步到送货单与采购需求表
          </span>
          <Button id="closePresetBtn" size="sm" onClick={() => onOpenChange(false)}>
            完成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
