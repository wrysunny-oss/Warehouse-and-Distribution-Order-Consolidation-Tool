import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
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
import { Badge } from '@/components/ui/badge';
import { Download, Upload, Settings2, Calendar } from 'lucide-react';

function addDays(dateStr, days) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function DemandDialog({
  open,
  onOpenChange,
  demandData = {},
  onImportFile,
  onOpenWarehousePreset,
  onConfirmDemand,
}) {
  const [title, setTitle] = useState(demandData.title || `国宝 采购需求一览表${new Date().getFullYear()}年`);
  const [baseDate, setBaseDate] = useState(demandData.defaultPickupDate || '');
  const [warehouseConfigs, setWarehouseConfigs] = useState({});

  useEffect(() => {
    if (open) {
      setTitle(demandData.title || `国宝 采购需求一览表${new Date().getFullYear()}年`);
      setBaseDate(demandData.defaultPickupDate || '');
      setWarehouseConfigs(demandData.warehouseConfigs || {});
    }
  }, [open, demandData]);

  const warehouses = demandData.warehouses || [];
  const presetFactories = demandData.presetFactories || [];

  const handleBaseDateChange = (newDate) => {
    setBaseDate(newDate);
    const updated = { ...warehouseConfigs };
    warehouses.forEach((w) => {
      const cur = updated[w.warehouse] || {};
      updated[w.warehouse] = {
        ...cur,
        factory: cur.factory || w.factory || presetFactories[0] || '宏禾米厂',
        pickupDate: newDate,
        inboundDate: addDays(newDate, 1),
      };
    });
    setWarehouseConfigs(updated);
  };

  const handleFactoryChange = (whName, factory) => {
    setWarehouseConfigs((prev) => ({
      ...prev,
      [whName]: {
        ...prev[whName],
        factory,
      },
    }));
  };

  const handlePickupDateChange = (whName, pickupDate) => {
    setWarehouseConfigs((prev) => ({
      ...prev,
      [whName]: {
        ...prev[whName],
        pickupDate,
        inboundDate: addDays(pickupDate, 1),
      },
    }));
  };

  const handleInboundDateChange = (whName, inboundDate) => {
    setWarehouseConfigs((prev) => ({
      ...prev,
      [whName]: {
        ...prev[whName],
        inboundDate,
      },
    }));
  };

  const handleConfirm = () => {
    onConfirmDemand({
      title,
      warehouseConfigs,
      rows: demandData.rows,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent id="demandDialog" className="max-w-4xl flex flex-col max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle>导出采购需求一览表</DialogTitle>
            <Badge variant="secondary">
              已匹配 {warehouses.length} 个发货仓库
            </Badge>
          </div>
          <DialogDescription id="demandTaskMeta">
            将需求数量大于 0 的明细导出为发货米厂需求表，包含条形码、订单简称与分仓汇总
          </DialogDescription>
        </DialogHeader>

        {/* Demand config strip */}
        <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_auto] gap-3 items-end p-3 rounded-lg bg-zinc-50 border border-zinc-200/70">
          <div>
            <label htmlFor="demandTitleInput" className="text-xs font-medium text-zinc-600 block mb-1">
              表格标题
            </label>
            <Input
              id="demandTitleInput"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-8 text-xs bg-white"
            />
          </div>

          <div>
            <label htmlFor="demandBaseDateInput" className="text-xs font-medium text-zinc-600 block mb-1">
              基准提货日期 (联动全体仓)
            </label>
            <Input
              id="demandBaseDateInput"
              type="date"
              value={baseDate}
              onChange={(e) => handleBaseDateChange(e.target.value)}
              className="h-8 text-xs bg-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              id="demandImportReceiptBtn"
              variant="outline"
              size="sm"
              onClick={() => onImportFile('receipt')}
            >
              <Upload className="h-3 w-3" />
              导入入库单
            </Button>
            <Button
              id="demandImportTable3Btn"
              variant="outline"
              size="sm"
              onClick={() => onImportFile('table3')}
            >
              <Upload className="h-3 w-3" />
              导入外部表三
            </Button>
            <Button
              id="demandManageWarehousePresetBtn"
              variant="ghost"
              size="sm"
              onClick={onOpenWarehousePreset}
            >
              <Settings2 className="h-3.5 w-3.5" />
              管理米厂
            </Button>
          </div>
        </div>

        {/* Warehouse list */}
        <div id="demandWarehouseList" className="flex-1 overflow-y-auto min-h-[300px] max-h-[460px] divide-y divide-zinc-100 pr-1">
          {warehouses.length === 0 ? (
            <div className="py-16 text-center text-xs text-zinc-400">
              暂无仓库需求数据，可直接导入入库单或外部表三生成
            </div>
          ) : (
            warehouses.map((w) => {
              const cfg = warehouseConfigs[w.warehouse] || {};
              const currentFactory = cfg.factory || w.factory || presetFactories[0] || '宏禾米厂';
              const pickupDate = cfg.pickupDate || w.pickupDate || baseDate || '';
              const inboundDate = cfg.inboundDate || w.inboundDate || addDays(pickupDate, 1) || '';

              return (
                <div
                  key={w.warehouse}
                  className="grid grid-cols-[1.5fr_1.2fr_1fr_1fr] items-center gap-3 py-2.5 px-2 hover:bg-zinc-50/80 rounded-md transition-colors text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-800 truncate" title={w.warehouse}>
                      {w.warehouse}
                    </p>
                    <p className="text-[11px] text-zinc-400 truncate">
                      {w.region ? `${w.region} · ` : ''}{w.logicWarehouse || '主仓'}
                    </p>
                  </div>

                  <div>
                    <Select value={String((currentFactory) ?? '')} onValueChange={value => handleFactoryChange(w.warehouse, value)}>
                      <SelectTrigger className="h-8 w-full text-xs" aria-label="选择发货米厂"><SelectValue placeholder="请选择" /></SelectTrigger>
                      <SelectContent><SelectGroup>
                      {presetFactories.map((f) => (
                        <SelectItem key={f} value={String(f)}>
                          {f}
                        </SelectItem>
                      ))}
                    </SelectGroup></SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Input
                      type="date"
                      value={pickupDate}
                      onChange={(e) => handlePickupDateChange(w.warehouse, e.target.value)}
                      className="h-8 text-xs px-2"
                      title="提货日期"
                    />
                  </div>

                  <div>
                    <Input
                      type="date"
                      value={inboundDate}
                      onChange={(e) => handleInboundDateChange(w.warehouse, e.target.value)}
                      className="h-8 text-xs px-2"
                      title="入仓日期 (默认提货+1天)"
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <span id="demandFootnote" className="text-xs text-zinc-400">
            已自动按大区匹配默认发货米厂；修改基准提货日期可联动全体仓库，入仓时间默认+1天。
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              id="confirmDemandBtn"
              size="sm"
              disabled={warehouses.length === 0}
              onClick={handleConfirm}
            >
              <Download className="h-3.5 w-3.5" />
              生成采购需求表
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
