import { Checkbox } from '@/components/ui/checkbox';
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
import { Search, Plus, Upload, RotateCcw, Trash2, Pencil, Check, X, CheckSquare, Square } from 'lucide-react';

function getWarehouseFields(w) {
  return {
    region: w['区域'] || w.region || '',
    code: w['仓库编码'] || w.warehouseCode || w.code || '',
    warehouse: w['仓库名称'] || w.warehouseName || w.warehouse || '',
    logicWarehouse: w['逻辑仓名称'] || w.logicName || w.logicWarehouse || '',
    factory: w['发货米厂'] || w.factory || '',
    note: w['备注'] || w.note || '',
    inStats: w.inStats !== undefined ? Boolean(w.inStats) : (w['参与统计'] !== undefined ? Boolean(w['参与统计']) : true),
  };
}

export function WarehousePresetDialog({
  open,
  onOpenChange,
  presets = [],
  onSavePresets,
  onResetPresets,
  onImportPreset,
}) {
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newForm, setNewForm] = useState({
    region: '',
    code: '',
    warehouse: '',
    logicWarehouse: '',
    factory: '宏禾米厂',
    note: '',
    inStats: true,
  });

  const [editIndex, setEditIndex] = useState(null);
  const [editForm, setEditForm] = useState({
    region: '',
    code: '',
    warehouse: '',
    logicWarehouse: '',
    factory: '',
    note: '',
    inStats: true,
  });

  const statsCount = useMemo(() => {
    return presets.filter((w) => getWarehouseFields(w).inStats).length;
  }, [presets]);

  const filteredPresetsWithIndex = useMemo(() => {
    const list = presets.map((w, index) => ({ w, index, f: getWarehouseFields(w) }));
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(({ f }) =>
      f.warehouse.toLowerCase().includes(q) ||
      f.code.toLowerCase().includes(q) ||
      f.factory.toLowerCase().includes(q) ||
      f.region.toLowerCase().includes(q) ||
      f.logicWarehouse.toLowerCase().includes(q)
    );
  }, [presets, search]);

  const handleToggleStats = (actualIndex) => {
    const next = presets.map((w, idx) => {
      if (idx !== actualIndex) return w;
      const current = getWarehouseFields(w).inStats;
      return { ...w, inStats: !current, '参与统计': !current };
    });
    onSavePresets(next);
  };

  const handleSelectAllStats = () => {
    const next = presets.map((w) => ({ ...w, inStats: true, '参与统计': true }));
    onSavePresets(next);
  };

  const handleDeselectAllStats = () => {
    const next = presets.map((w) => ({ ...w, inStats: false, '参与统计': false }));
    onSavePresets(next);
  };

  const handleSelectStandard16 = () => {
    const STANDARD_16 = [
      '华东杭州直营商超仓', '华东合肥直营商超仓', '华东嘉定直营商超仓', '华东嘉兴直营商超A仓',
      '华东金义直营商超仓', '华东南京直营商超仓', '华东无锡直营商超仓',
      '华南东莞直营商超仓', '华南广州直营商超A仓', '华南惠阳直营商超仓',
      '华南江门直营商超仓', '华南江门直萱商超仓',
      '华西成都直营商超仓', '华西猫超重庆RDC仓',
      '华中南昌直营商超仓', '华中武汉直营商超仓', '华中长沙直营商超仓'
    ];
    const next = presets.map((w) => {
      const name = w.warehouseName || w['仓库名称'] || w.warehouse || '';
      const inStats = STANDARD_16.includes(name);
      return { ...w, inStats, '参与统计': inStats };
    });
    onSavePresets(next);
  };

  const handleStartEdit = (actualIndex) => {
    const target = presets[actualIndex];
    const f = getWarehouseFields(target);
    setEditIndex(actualIndex);
    setEditForm({
      region: f.region,
      code: f.code,
      warehouse: f.warehouse,
      logicWarehouse: f.logicWarehouse,
      factory: f.factory,
      note: f.note,
      inStats: f.inStats,
    });
  };

  const handleSaveEdit = () => {
    if (editIndex === null || !editForm.warehouse.trim()) return;
    const next = presets.map((w, idx) => {
      if (idx !== editIndex) return w;
      return {
        ...w,
        region: editForm.region.trim(),
        warehouseCode: editForm.code.trim(),
        warehouseName: editForm.warehouse.trim(),
        logicName: editForm.logicWarehouse.trim(),
        factory: editForm.factory.trim() || '宏禾米厂',
        note: editForm.note.trim(),
        inStats: Boolean(editForm.inStats),
        '区域': editForm.region.trim(),
        '仓库编码': editForm.code.trim(),
        '仓库名称': editForm.warehouse.trim(),
        '逻辑仓名称': editForm.logicWarehouse.trim(),
        '发货米厂': editForm.factory.trim() || '宏禾米厂',
        '备注': editForm.note.trim(),
        '参与统计': Boolean(editForm.inStats),
      };
    });
    onSavePresets(next);
    setEditIndex(null);
  };

  const handleCancelEdit = () => {
    setEditIndex(null);
  };

  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!newForm.warehouse || !newForm.factory) return;
    const updated = [
      {
        id: presets.length + 1,
        region: (newForm.region || '').trim(),
        warehouseCode: (newForm.code || '').trim(),
        warehouseName: newForm.warehouse.trim(),
        logicName: (newForm.logicWarehouse || '').trim(),
        factory: newForm.factory.trim(),
        note: (newForm.note || '').trim(),
        inStats: Boolean(newForm.inStats),
        '区域': (newForm.region || '').trim(),
        '仓库编码': (newForm.code || '').trim(),
        '仓库名称': newForm.warehouse.trim(),
        '逻辑仓名称': (newForm.logicWarehouse || '').trim(),
        '发货米厂': newForm.factory.trim(),
        '备注': (newForm.note || '').trim(),
        '参与统计': Boolean(newForm.inStats),
      },
      ...presets,
    ];
    onSavePresets(updated);
    setShowAddForm(false);
    setNewForm({
      region: '',
      code: '',
      warehouse: '',
      logicWarehouse: '',
      factory: '宏禾米厂',
      note: '',
      inStats: true,
    });
  };

  const handleDelete = (indexToDelete) => {
    const next = presets.filter((_, idx) => idx !== indexToDelete);
    onSavePresets(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent id="warehousePresetDialog" className="max-w-5xl flex flex-col max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle>仓库与统计全局预设</DialogTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {statsCount} 仓参与统计
              </span>
              <span id="warehousePresetCountBadge" className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-zinc-100 text-zinc-700">
                共 {presets.length} 个仓库
              </span>
            </div>
          </div>
          <DialogDescription id="warehousePresetDialogMeta">
            维护仓库与发货米厂、大区、仓库编码对应关系，并勾选是否参与补货需求统计汇总。修改后永久保存并立即自动生效。
          </DialogDescription>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-2 border-b border-zinc-100">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <Input
              id="warehousePresetSearchInput"
              placeholder="搜索仓库名称、编码、米厂、大区..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Quick stats selection buttons */}
            <div className="flex items-center gap-1 bg-zinc-100 p-0.5 rounded-md text-xs">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs px-2 text-zinc-600 hover:text-zinc-900"
                onClick={handleSelectStandard16}
                title="快速选中16个标配直营商超仓"
              >
                标配商超仓 (16仓)
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs px-2 text-zinc-600 hover:text-zinc-900"
                onClick={handleSelectAllStats}
              >
                <CheckSquare className="h-3 w-3 mr-1" />
                全选参与
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs px-2 text-zinc-600 hover:text-zinc-900"
                onClick={handleDeselectAllStats}
              >
                <Square className="h-3 w-3 mr-1" />
                全不选
              </Button>
            </div>

            <Button
              id="toggleAddWarehouseBtn"
              size="sm"
              variant={showAddForm ? 'secondary' : 'outline'}
              onClick={() => setShowAddForm(!showAddForm)}
            >
              <Plus className="h-3.5 w-3.5" />
              {showAddForm ? '收起表单' : '新增仓库'}
            </Button>
            <Button
              id="importWarehousePresetExcelBtn"
              size="sm"
              variant="outline"
              onClick={onImportPreset}
            >
              <Upload className="h-3.5 w-3.5" />
              导入覆盖
            </Button>
            <Button
              id="resetWarehousePresetBtn"
              size="sm"
              variant="ghost"
              onClick={onResetPresets}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              恢复默认
            </Button>
          </div>
        </div>

        {/* Collapsible Add Form */}
        {showAddForm && (
          <form
            id="addWarehouseForm"
            onSubmit={handleAddSubmit}
            className="p-3.5 bg-zinc-50 border border-zinc-200/80 rounded-lg space-y-3"
          >
            <div className="text-xs font-semibold text-zinc-800">新增仓库与统计对应关系</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1">区域</label>
                <Input
                  id="newWarehouseRegion"
                  placeholder="如：华东仓 / 华南仓"
                  value={newForm.region}
                  onChange={(e) => setNewForm({ ...newForm, region: e.target.value })}
                  className="h-7 text-xs bg-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1">仓库编码</label>
                <Input
                  id="newWarehouseCode"
                  placeholder="如：HGH101"
                  value={newForm.code}
                  onChange={(e) => setNewForm({ ...newForm, code: e.target.value })}
                  className="h-7 text-xs bg-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1">仓库名称 *</label>
                <Input
                  id="newWarehouseName"
                  placeholder="如：华东杭州直营商超仓"
                  value={newForm.warehouse}
                  onChange={(e) => setNewForm({ ...newForm, warehouse: e.target.value })}
                  required
                  className="h-7 text-xs bg-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1">逻辑仓名称</label>
                <Input
                  id="newLogicWarehouseName"
                  placeholder="如：杭州商超逻辑1仓"
                  value={newForm.logicWarehouse}
                  onChange={(e) => setNewForm({ ...newForm, logicWarehouse: e.target.value })}
                  className="h-7 text-xs bg-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1">发货米厂 *</label>
                <Input
                  id="newWarehouseFactory"
                  placeholder="如：宏禾米厂"
                  value={newForm.factory}
                  onChange={(e) => setNewForm({ ...newForm, factory: e.target.value })}
                  required
                  className="h-7 text-xs bg-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1">备注</label>
                <Input
                  id="newWarehouseNote"
                  placeholder="选填，如：退货仓/说明"
                  value={newForm.note}
                  onChange={(e) => setNewForm({ ...newForm, note: e.target.value })}
                  className="h-7 text-xs bg-white"
                />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <Checkbox checked={newForm.inStats} className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500" onCheckedChange={checked => setNewForm({ ...newForm, inStats: (checked === true) })} aria-label="参与补货统计" />
                  <span className="text-xs font-medium text-zinc-700">参与补货统计</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                id="cancelAddWarehouseBtn"
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAddForm(false)}
              >
                取消
              </Button>
              <Button id="saveNewWarehouseBtn" type="submit" size="sm">
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
                <TableHead className="w-10 text-center">序号</TableHead>
                <TableHead className="w-20 text-center">参与统计</TableHead>
                <TableHead className="w-24">区域</TableHead>
                <TableHead className="w-28">仓库编码</TableHead>
                <TableHead className="w-48">仓库名称</TableHead>
                <TableHead className="w-36">逻辑仓名称</TableHead>
                <TableHead className="w-28">发货米厂</TableHead>
                <TableHead>备注</TableHead>
                <TableHead className="w-20 text-center">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody id="warehousePresetTableBody">
              {filteredPresetsWithIndex.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-zinc-400">
                    未找到仓库预设
                  </TableCell>
                </TableRow>
              ) : (
                filteredPresetsWithIndex.map(({ w, index, f }) => {
                  const isEditing = editIndex === index;

                  if (isEditing) {
                    return (
                      <TableRow key={`edit-${index}`} className="bg-blue-50/40">
                        <TableCell className="text-center font-mono text-zinc-400">
                          {index + 1}
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox checked={editForm.inStats} className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 cursor-pointer" onCheckedChange={checked => setEditForm({ ...editForm, inStats: (checked === true) })} aria-label="参与补货统计" />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={editForm.region}
                            onChange={(e) => setEditForm({ ...editForm, region: e.target.value })}
                            className="h-7 text-xs bg-white"
                            placeholder="区域"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={editForm.code}
                            onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                            className="h-7 text-xs bg-white font-mono"
                            placeholder="编码"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={editForm.warehouse}
                            onChange={(e) => setEditForm({ ...editForm, warehouse: e.target.value })}
                            className="h-7 text-xs bg-white font-semibold"
                            placeholder="仓库名称"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={editForm.logicWarehouse}
                            onChange={(e) => setEditForm({ ...editForm, logicWarehouse: e.target.value })}
                            className="h-7 text-xs bg-white"
                            placeholder="逻辑仓"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={editForm.factory}
                            onChange={(e) => setEditForm({ ...editForm, factory: e.target.value })}
                            className="h-7 text-xs bg-white"
                            placeholder="发货米厂"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={editForm.note}
                            onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                            className="h-7 text-xs bg-white"
                            placeholder="备注"
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={handleSaveEdit}
                              className="h-6 w-6 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              title="保存修改"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={handleCancelEdit}
                              className="h-6 w-6 text-zinc-400 hover:text-zinc-600"
                              title="取消"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  return (
                    <TableRow key={`${f.warehouse}-${index}`} className="text-xs hover:bg-zinc-50/70">
                      <TableCell className="text-center font-mono text-zinc-400">
                        {index + 1}
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox checked={f.inStats} className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 cursor-pointer" title={f.inStats ? '点击取消参与统计' : '点击勾选参与统计'} onCheckedChange={() => handleToggleStats(index)} aria-label="参与补货统计" />
                      </TableCell>
                      <TableCell>
                        {f.region ? (
                          <Badge variant="secondary" className="text-[10px]">
                            {f.region}
                          </Badge>
                        ) : (
                          <span className="text-zinc-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-zinc-600">
                        {f.code || '-'}
                      </TableCell>
                      <TableCell className="font-medium text-zinc-900 truncate" title={f.warehouse}>
                        <span className={f.inStats ? 'text-zinc-900 font-semibold' : 'text-zinc-400 line-through'}>
                          {f.warehouse}
                        </span>
                      </TableCell>
                      <TableCell className="text-zinc-600 truncate" title={f.logicWarehouse}>
                        {f.logicWarehouse || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] bg-zinc-50 font-medium">
                          {f.factory}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-zinc-400 truncate max-w-xs" title={f.note}>
                        {f.note || '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleStartEdit(index)}
                            className="h-6 w-6 text-zinc-400 hover:text-blue-600"
                            title="修改编辑"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(index)}
                            className="h-6 w-6 text-zinc-400 hover:text-red-600"
                            title="删除"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
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
            勾选的仓库将作为补货统计的全局依据，支持随时增加或修改。
          </span>
          <Button id="closeWarehousePresetBtn" size="sm" onClick={() => onOpenChange(false)}>
            完成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
