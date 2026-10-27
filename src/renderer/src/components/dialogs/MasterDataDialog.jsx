import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { 
  Package, 
  Building2, 
  ArrowRightLeft, 
  ListOrdered, 
  ReceiptText,
  Search,
  Plus,
  Upload,
  RotateCcw,
  Trash2,
  Save,
  Settings,
  AlertCircle,
  Pencil,
  Check,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

export function MasterDataDialog({
  open,
  onOpenChange,
  activeTab = 'products',
  // Product Presets
  productPresets = [],
  onSaveProductPresets,
  onResetProductPresets,
  onImportProductPresetExcel,
  // Warehouse Presets
  warehousePresets = [],
  onSaveWarehousePresets,
  onResetWarehousePresets,
  onImportWarehousePresetExcel,
  // Warehouse Mapping
  mappingRows = [],
  directWarehouses = [],
  warehouseMapping = {},
  onSaveMapping,
  // Product Catalog
  currentBrand = '',
  brandCatalogs = {},
  onSaveCatalog,
  onRestoreCatalog,
  // Invoice Config
  invoiceConfig = {},
  onSaveInvoiceConfig,
  onResetInvoiceConfig,
}) {
  const [currentTab, setCurrentTab] = useState(activeTab);

  useEffect(() => {
    if (activeTab) setCurrentTab(activeTab);
  }, [activeTab]);

  // Product Presets Internal State
  const [productSearch, setProductSearch] = useState('');
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProduct, setNewProduct] = useState({
    brand: '',
    barcode: '',
    shortName: '',
    spec: '',
    boxSpec: '',
    note: '',
    fullName: '',
  });

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return productPresets;
    const q = productSearch.trim().toLowerCase();
    return productPresets.filter((p) => {
      const f = getProductFields(p);
      return (
        f.brand.toLowerCase().includes(q) ||
        f.barcode.toLowerCase().includes(q) ||
        f.shortName.toLowerCase().includes(q) ||
        f.fullName.toLowerCase().includes(q)
      );
    });
  }, [productPresets, productSearch]);

  const handleAddProduct = () => {
    if (!newProduct.shortName.trim() || !newProduct.brand.trim()) return;
    const next = [
      ...productPresets,
      {
        品牌名称: newProduct.brand.trim(),
        条码: newProduct.barcode.trim(),
        订单简称: newProduct.shortName.trim(),
        规格kg: Number(newProduct.spec) || newProduct.spec,
        '采购规格(箱规数)': Number(newProduct.boxSpec) || newProduct.boxSpec,
        '货品名称（带空格）': newProduct.fullName.trim() || newProduct.shortName.trim(),
        备注: newProduct.note.trim(),
      },
    ];
    onSaveProductPresets(next);
    setNewProduct({ brand: '', barcode: '', shortName: '', spec: '', boxSpec: '', note: '', fullName: '' });
    setShowAddProduct(false);
  };

  const handleDeleteProduct = (index) => {
    const next = productPresets.filter((_, i) => i !== index);
    onSaveProductPresets(next);
  };

  // Warehouse Presets Internal State
  const [warehouseSearch, setWarehouseSearch] = useState('');
  const [showAddWarehouse, setShowAddWarehouse] = useState(false);
  const [newWarehouse, setNewWarehouse] = useState({
    region: '',
    code: '',
    warehouse: '',
    logicWarehouse: '',
    factory: '宏禾米厂',
    note: '',
    inStats: true,
  });
  const [editWarehouseIndex, setEditWarehouseIndex] = useState(null);
  const [editWarehouseForm, setEditWarehouseForm] = useState({
    region: '',
    code: '',
    warehouse: '',
    logicWarehouse: '',
    factory: '',
    note: '',
    inStats: true,
  });

  const filteredWarehousesWithIndex = useMemo(() => {
    const list = warehousePresets.map((w, index) => ({ w, index, f: getWarehouseFields(w) }));
    if (!warehouseSearch.trim()) return list;
    const q = warehouseSearch.trim().toLowerCase();
    return list.filter(({ f }) =>
      f.warehouse.toLowerCase().includes(q) ||
      f.code.toLowerCase().includes(q) ||
      f.factory.toLowerCase().includes(q) ||
      f.region.toLowerCase().includes(q) ||
      f.logicWarehouse.toLowerCase().includes(q)
    );
  }, [warehousePresets, warehouseSearch]);

  const statsCount = useMemo(() => {
    return warehousePresets.filter((w) => getWarehouseFields(w).inStats).length;
  }, [warehousePresets]);

  const handleToggleStats = (actualIndex) => {
    const next = warehousePresets.map((w, idx) => {
      if (idx !== actualIndex) return w;
      const current = getWarehouseFields(w).inStats;
      return {
        ...w,
        inStats: !current,
        '参与统计': !current,
      };
    });
    onSaveWarehousePresets(next);
  };

  const handleSelectAllStats = () => {
    const next = warehousePresets.map((w) => ({
      ...w,
      inStats: true,
      '参与统计': true,
    }));
    onSaveWarehousePresets(next);
  };

  const handleDeselectAllStats = () => {
    const next = warehousePresets.map((w) => ({
      ...w,
      inStats: false,
      '参与统计': false,
    }));
    onSaveWarehousePresets(next);
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
    const next = warehousePresets.map((w) => {
      const name = w.warehouseName || w['仓库名称'] || w.warehouse || '';
      const inStats = STANDARD_16.includes(name);
      return { ...w, inStats, '参与统计': inStats };
    });
    onSaveWarehousePresets(next);
  };

  const handleStartEditWarehouse = (actualIndex) => {
    const target = warehousePresets[actualIndex];
    const f = getWarehouseFields(target);
    setEditWarehouseIndex(actualIndex);
    setEditWarehouseForm({
      region: f.region,
      code: f.code,
      warehouse: f.warehouse,
      logicWarehouse: f.logicWarehouse,
      factory: f.factory,
      note: f.note,
      inStats: f.inStats,
    });
  };

  const handleSaveEditWarehouse = () => {
    if (editWarehouseIndex === null || !editWarehouseForm.warehouse.trim()) return;
    const next = warehousePresets.map((w, idx) => {
      if (idx !== editWarehouseIndex) return w;
      return {
        ...w,
        region: editWarehouseForm.region.trim(),
        warehouseCode: editWarehouseForm.code.trim(),
        warehouseName: editWarehouseForm.warehouse.trim(),
        logicName: editWarehouseForm.logicWarehouse.trim(),
        factory: editWarehouseForm.factory.trim() || '宏禾米厂',
        note: editWarehouseForm.note.trim(),
        inStats: Boolean(editWarehouseForm.inStats),
        '区域': editWarehouseForm.region.trim(),
        '仓库编码': editWarehouseForm.code.trim(),
        '仓库名称': editWarehouseForm.warehouse.trim(),
        '逻辑仓名称': editWarehouseForm.logicWarehouse.trim(),
        '发货米厂': editWarehouseForm.factory.trim() || '宏禾米厂',
        '备注': editWarehouseForm.note.trim(),
        '参与统计': Boolean(editWarehouseForm.inStats),
      };
    });
    onSaveWarehousePresets(next);
    setEditWarehouseIndex(null);
  };

  const handleCancelEditWarehouse = () => {
    setEditWarehouseIndex(null);
  };

  const handleAddWarehouse = () => {
    if (!newWarehouse.warehouse.trim()) return;
    const next = [
      ...warehousePresets,
      {
        id: warehousePresets.length + 1,
        region: newWarehouse.region.trim(),
        warehouseCode: newWarehouse.code.trim(),
        warehouseName: newWarehouse.warehouse.trim(),
        logicName: newWarehouse.logicWarehouse.trim(),
        factory: newWarehouse.factory.trim() || '宏禾米厂',
        note: newWarehouse.note.trim(),
        inStats: Boolean(newWarehouse.inStats),
        '区域': newWarehouse.region.trim(),
        '仓库编码': newWarehouse.code.trim(),
        '仓库名称': newWarehouse.warehouse.trim(),
        '逻辑仓名称': newWarehouse.logicWarehouse.trim(),
        '发货米厂': newWarehouse.factory.trim() || '宏禾米厂',
        '备注': newWarehouse.note.trim(),
        '参与统计': Boolean(newWarehouse.inStats),
      },
    ];
    onSaveWarehousePresets(next);
    setNewWarehouse({ region: '', code: '', warehouse: '', logicWarehouse: '', factory: '宏禾米厂', note: '', inStats: true });
    setShowAddWarehouse(false);
  };

  const handleDeleteWarehouse = (actualIndex) => {
    const next = warehousePresets.filter((_, i) => i !== actualIndex);
    onSaveWarehousePresets(next);
    if (editWarehouseIndex === actualIndex) setEditWarehouseIndex(null);
  };

  // Mapping State
  const [mappingDraft, setMappingDraft] = useState({});
  const [mappingSearch, setMappingSearch] = useState('');

  useEffect(() => {
    if (open) {
      setMappingDraft({ ...warehouseMapping });
    }
  }, [open, warehouseMapping]);

  const filteredMappingRows = useMemo(() => {
    if (!mappingSearch.trim()) return mappingRows;
    const q = mappingSearch.trim().toLowerCase();
    return mappingRows.filter(
      (r) =>
        r.source.toLowerCase().includes(q) ||
        (mappingDraft[r.source] || '').toLowerCase().includes(q)
    );
  }, [mappingRows, mappingSearch, mappingDraft]);

  const handleSaveMappingDraft = () => {
    onSaveMapping(mappingDraft);
  };

  // Invoice Config Form State
  const [invoiceForm, setInvoiceForm] = useState(invoiceConfig);
  useEffect(() => {
    setInvoiceForm(invoiceConfig);
  }, [invoiceConfig]);

  const handleSaveInvoiceForm = () => {
    onSaveInvoiceConfig(invoiceForm);
  };

  // Catalog State
  const [catalogText, setCatalogText] = useState('');
  useEffect(() => {
    if (currentBrand) {
      setCatalogText((brandCatalogs[currentBrand] || []).join('\n'));
    }
  }, [currentBrand, brandCatalogs]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl flex flex-col max-h-[88vh] p-0 overflow-hidden bg-white rounded-2xl shadow-2xl border border-zinc-200">
        <DialogHeader className="px-6 py-4 border-b border-zinc-200/90 bg-zinc-50/70 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-base font-bold text-zinc-950 flex items-center gap-2">
                <Settings className="size-4 text-zinc-900" />
                主数据与配置中心
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-500 mt-0.5">
                统一维护供应链商品档案、仓库与供货米厂、仓库映射别名、开票资质等核心主数据
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Tab Navigation - Black & White */}
        <Tabs value={currentTab} onValueChange={setCurrentTab} className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 border-b border-zinc-200 bg-white shrink-0">
            <TabsList className="bg-transparent h-11 p-0 gap-6 flex">
              <TabsTrigger
                value="products"
                className="data-[state=active]:border-b-2 data-[state=active]:border-zinc-950 data-[state=active]:text-zinc-950 data-[state=active]:shadow-none rounded-none px-1 text-xs font-medium cursor-pointer"
              >
                <Package className="size-3.5 mr-1.5" />
                商品档案库 ({productPresets.length})
              </TabsTrigger>
              <TabsTrigger
                value="warehouses"
                className="data-[state=active]:border-b-2 data-[state=active]:border-zinc-950 data-[state=active]:text-zinc-950 data-[state=active]:shadow-none rounded-none px-1 text-xs font-medium cursor-pointer"
              >
                <Building2 className="size-3.5 mr-1.5" />
                仓库与统计预设 ({statsCount}/{warehousePresets.length})
              </TabsTrigger>
              <TabsTrigger
                value="mappings"
                className="data-[state=active]:border-b-2 data-[state=active]:border-zinc-950 data-[state=active]:text-zinc-950 data-[state=active]:shadow-none rounded-none px-1 text-xs font-medium cursor-pointer"
              >
                <ArrowRightLeft className="size-3.5 mr-1.5" />
                仓库映射字典
              </TabsTrigger>
              <TabsTrigger
                value="catalog"
                className="data-[state=active]:border-b-2 data-[state=active]:border-zinc-950 data-[state=active]:text-zinc-950 data-[state=active]:shadow-none rounded-none px-1 text-xs font-medium cursor-pointer"
              >
                <ListOrdered className="size-3.5 mr-1.5" />
                品牌商品排序
              </TabsTrigger>
              <TabsTrigger
                value="invoice"
                className="data-[state=active]:border-b-2 data-[state=active]:border-zinc-950 data-[state=active]:text-zinc-950 data-[state=active]:shadow-none rounded-none px-1 text-xs font-medium cursor-pointer"
              >
                <ReceiptText className="size-3.5 mr-1.5" />
                猫超开票资质
              </TabsTrigger>
            </TabsList>
          </div>

          {/* TAB 1: PRODUCT PRESETS */}
          <TabsContent value="products" className="flex-1 flex flex-col p-6 overflow-hidden m-0">
            <div className="flex items-center justify-between gap-3 mb-4 shrink-0">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-zinc-400" />
                <Input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="搜索简称、品牌、条码..."
                  className="pl-8 text-xs h-8 border-zinc-200 focus:border-zinc-900"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={onImportProductPresetExcel} className="text-xs h-8 border-zinc-200">
                  <Upload className="size-3 mr-1" /> 导入 Excel 预设
                </Button>
                <Button variant="outline" size="sm" onClick={onResetProductPresets} className="text-xs h-8 border-zinc-200">
                  <RotateCcw className="size-3 mr-1" /> 恢复默认
                </Button>
                <Button size="sm" onClick={() => setShowAddProduct(!showAddProduct)} className="text-xs h-8 bg-zinc-900 hover:bg-zinc-800 text-white">
                  <Plus className="size-3 mr-1" /> {showAddProduct ? '取消新增' : '新增商品'}
                </Button>
              </div>
            </div>

            {showAddProduct && (
              <div className="p-3 mb-3 bg-zinc-50 border border-zinc-200 rounded-lg shrink-0 text-xs grid grid-cols-4 gap-2">
                <Input placeholder="品牌 (如 稻花翁)" value={newProduct.brand} onChange={(e) => setNewProduct({ ...newProduct, brand: e.target.value })} className="text-xs h-7 border-zinc-200" />
                <Input placeholder="订单简称 (如 优质大米5kg)" value={newProduct.shortName} onChange={(e) => setNewProduct({ ...newProduct, shortName: e.target.value })} className="text-xs h-7 border-zinc-200" />
                <Input placeholder="条码" value={newProduct.barcode} onChange={(e) => setNewProduct({ ...newProduct, barcode: e.target.value })} className="text-xs h-7 border-zinc-200" />
                <Input placeholder="箱规数 (如 4)" value={newProduct.boxSpec} onChange={(e) => setNewProduct({ ...newProduct, boxSpec: e.target.value })} className="text-xs h-7 border-zinc-200" />
                <Input placeholder="单件重kg (如 5)" value={newProduct.spec} onChange={(e) => setNewProduct({ ...newProduct, spec: e.target.value })} className="text-xs h-7 border-zinc-200" />
                <Input placeholder="完整货品名 (可选)" value={newProduct.fullName} onChange={(e) => setNewProduct({ ...newProduct, fullName: e.target.value })} className="text-xs h-7 col-span-2 border-zinc-200" />
                <Button size="sm" onClick={handleAddProduct} className="text-xs h-7 bg-zinc-900 hover:bg-zinc-800 text-white">保存并加入档案</Button>
              </div>
            )}

            <div className="flex-1 overflow-auto border border-zinc-200 rounded-lg">
              <Table className="text-xs">
                <TableHeader className="bg-zinc-50 sticky top-0">
                  <TableRow>
                    <TableHead className="w-24">品牌</TableHead>
                    <TableHead>订单简称</TableHead>
                    <TableHead>条码</TableHead>
                    <TableHead className="w-20 text-right">箱规</TableHead>
                    <TableHead className="w-20 text-right">规格(kg)</TableHead>
                    <TableHead className="w-16 text-center">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((p, idx) => {
                    const f = getProductFields(p);
                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium text-zinc-700">{f.brand}</TableCell>
                        <TableCell className="font-medium text-zinc-950">{f.shortName}</TableCell>
                        <TableCell className="font-mono text-zinc-500">{f.barcode}</TableCell>
                        <TableCell className="text-right tabular-nums">{f.boxSpec}</TableCell>
                        <TableCell className="text-right tabular-nums">{f.spec}</TableCell>
                        <TableCell className="text-center">
                          <Button variant="ghost" size="unstyled" onClick={() => handleDeleteProduct(idx)} className="text-zinc-400 hover:text-red-600 p-1 cursor-pointer">
                            <Trash2 className="size-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* TAB 2: WAREHOUSE PRESETS & STATS CONFIG */}
          <TabsContent value="warehouses" className="flex-1 flex flex-col p-6 overflow-hidden m-0">
            <div className="flex flex-col gap-2.5 mb-4 shrink-0">
              <div className="flex items-center justify-between gap-3">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-2.5 top-2.5 size-3.5 text-zinc-400" />
                  <Input
                    value={warehouseSearch}
                    onChange={(e) => setWarehouseSearch(e.target.value)}
                    placeholder="搜索仓库名、编码、发货米厂..."
                    className="pl-8 text-xs h-8 border-zinc-200 focus:border-zinc-900"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={onImportWarehousePresetExcel} className="text-xs h-8 border-zinc-200">
                    <Upload className="size-3 mr-1" /> 导入预设
                  </Button>
                  <Button variant="outline" size="sm" onClick={onResetWarehousePresets} className="text-xs h-8 border-zinc-200">
                    <RotateCcw className="size-3 mr-1" /> 恢复默认
                  </Button>
                  <Button size="sm" onClick={() => setShowAddWarehouse(!showAddWarehouse)} className="text-xs h-8 bg-zinc-900 hover:bg-zinc-800 text-white">
                    <Plus className="size-3 mr-1" /> {showAddWarehouse ? '取消新增' : '新增仓库'}
                  </Button>
                </div>
              </div>

              {/* Fast stats filtering bar */}
              <div className="flex items-center justify-between bg-zinc-50 border border-zinc-200/80 px-3 py-1.5 rounded-lg text-xs">
                <div className="flex items-center gap-2 text-zinc-600">
                  <span className="font-semibold text-zinc-900">补货统计范围：</span>
                  <span>
                    共 <strong>{warehousePresets.length}</strong> 个仓库，已勾选 <strong className="text-zinc-950 font-bold">{statsCount}</strong> 个参与补货需求合并统计
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="unstyled"
                    type="button"
                    onClick={handleSelectAllStats}
                    className="text-[11px] text-zinc-800 hover:text-black font-medium hover:underline cursor-pointer"
                  >
                    全选参与
                  </Button>
                  <span className="text-zinc-300">|</span>
                  <Button variant="ghost" size="unstyled"
                    type="button"
                    onClick={handleDeselectAllStats}
                    className="text-[11px] text-zinc-500 hover:text-zinc-800 hover:underline cursor-pointer"
                  >
                    取消全选
                  </Button>
                  <span className="text-zinc-300">|</span>
                  <Button variant="ghost" size="unstyled"
                    type="button"
                    onClick={handleSelectStandard16}
                    className="text-[11px] text-zinc-950 font-semibold hover:underline cursor-pointer"
                  >
                    标配商超仓 (16仓)
                  </Button>
                </div>
              </div>
            </div>

            {showAddWarehouse && (
              <div className="p-3.5 mb-3 bg-zinc-50 border border-zinc-200 rounded-lg shrink-0 text-xs">
                <div className="font-semibold text-zinc-900 mb-2">新增仓库预设</div>
                <div className="grid grid-cols-4 gap-2 mb-2.5">
                  <Input placeholder="区域 (如 华东仓)" value={newWarehouse.region} onChange={(e) => setNewWarehouse({ ...newWarehouse, region: e.target.value })} className="text-xs h-7 border-zinc-200 bg-white" />
                  <Input placeholder="仓库名称 * (如 华东北斗直营商超仓)" value={newWarehouse.warehouse} onChange={(e) => setNewWarehouse({ ...newWarehouse, warehouse: e.target.value })} className="text-xs h-7 border-zinc-200 bg-white font-medium" />
                  <Input placeholder="仓库编码 (如 PEK101)" value={newWarehouse.code} onChange={(e) => setNewWarehouse({ ...newWarehouse, code: e.target.value })} className="text-xs h-7 border-zinc-200 bg-white" />
                  <Input placeholder="发货米厂 (如 宏禾米厂)" value={newWarehouse.factory} onChange={(e) => setNewWarehouse({ ...newWarehouse, factory: e.target.value })} className="text-xs h-7 border-zinc-200 bg-white" />
                  <Input placeholder="逻辑仓名称" value={newWarehouse.logicWarehouse} onChange={(e) => setNewWarehouse({ ...newWarehouse, logicWarehouse: e.target.value })} className="text-xs h-7 col-span-2 border-zinc-200 bg-white" />
                  <Input placeholder="备注说明" value={newWarehouse.note} onChange={(e) => setNewWarehouse({ ...newWarehouse, note: e.target.value })} className="text-xs h-7 col-span-2 border-zinc-200 bg-white" />
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-zinc-200/60">
                  <label className="flex items-center gap-1.5 cursor-pointer select-none text-zinc-700">
                    <Checkbox checked={newWarehouse.inStats} className="size-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900" onCheckedChange={checked => setNewWarehouse({ ...newWarehouse, inStats: (checked === true) })} aria-label="参与补货统计" />
                    <span>纳入补货需求统计范围 (在第一步配送仓库列表中展示并参与汇总)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setShowAddWarehouse(false)} className="text-xs h-7">取消</Button>
                    <Button size="sm" onClick={handleAddWarehouse} className="text-xs h-7 bg-zinc-900 hover:bg-zinc-800 text-white font-medium">保存添加</Button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-auto border border-zinc-200 rounded-lg">
              <Table className="text-xs">
                <TableHeader className="bg-zinc-50 sticky top-0 z-10 shadow-xs">
                  <TableRow>
                    <TableHead className="w-18 text-center">参与统计</TableHead>
                    <TableHead className="w-20">区域</TableHead>
                    <TableHead className="w-48">仓库名称</TableHead>
                    <TableHead className="w-24">仓库编码</TableHead>
                    <TableHead className="w-28 font-semibold text-zinc-950">发货米厂</TableHead>
                    <TableHead className="w-32">逻辑仓</TableHead>
                    <TableHead>备注</TableHead>
                    <TableHead className="w-20 text-center">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredWarehousesWithIndex.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-10 text-zinc-400">
                        未找到匹配的仓库预设
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredWarehousesWithIndex.map(({ f, index: actualIdx }) => {
                      const isEditing = editWarehouseIndex === actualIdx;
                      return (
                        <TableRow key={actualIdx} className={cn(isEditing && "bg-zinc-50/80")}>
                          {/* 参与统计 Checkbox */}
                          <TableCell className="text-center">
                            {isEditing ? (
                              <Checkbox checked={editWarehouseForm.inStats} className="size-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer" onCheckedChange={checked => setEditWarehouseForm({ ...editWarehouseForm, inStats: (checked === true) })} aria-label="参与补货统计" />
                            ) : (
                              <Checkbox checked={f.inStats} title={f.inStats ? "已参与统计（点击取消）" : "未参与统计（点击勾选）"} className="size-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer" onCheckedChange={() => handleToggleStats(actualIdx)} aria-label="参与补货统计" />
                            )}
                          </TableCell>

                          {/* 区域 */}
                          <TableCell className="text-zinc-600">
                            {isEditing ? (
                              <Input
                                value={editWarehouseForm.region}
                                onChange={(e) => setEditWarehouseForm({ ...editWarehouseForm, region: e.target.value })}
                                className="h-6 text-xs px-1.5 border-zinc-300 bg-white"
                                placeholder="区域"
                              />
                            ) : (
                              f.region || '-'
                            )}
                          </TableCell>

                          {/* 仓库名称 */}
                          <TableCell className="font-medium text-zinc-950">
                            {isEditing ? (
                              <Input
                                value={editWarehouseForm.warehouse}
                                onChange={(e) => setEditWarehouseForm({ ...editWarehouseForm, warehouse: e.target.value })}
                                className="h-6 text-xs px-1.5 border-zinc-300 bg-white font-medium"
                                placeholder="仓库名称"
                              />
                            ) : (
                              <span className={cn(!f.inStats && "text-zinc-400 line-through")}>
                                {f.warehouse}
                              </span>
                            )}
                          </TableCell>

                          {/* 仓库编码 */}
                          <TableCell className="font-mono text-zinc-500">
                            {isEditing ? (
                              <Input
                                value={editWarehouseForm.code}
                                onChange={(e) => setEditWarehouseForm({ ...editWarehouseForm, code: e.target.value })}
                                className="h-6 text-xs px-1.5 border-zinc-300 bg-white font-mono"
                                placeholder="编码"
                              />
                            ) : (
                              f.code || '-'
                            )}
                          </TableCell>

                          {/* 发货米厂 */}
                          <TableCell className="font-medium text-zinc-950">
                            {isEditing ? (
                              <Input
                                value={editWarehouseForm.factory}
                                onChange={(e) => setEditWarehouseForm({ ...editWarehouseForm, factory: e.target.value })}
                                className="h-6 text-xs px-1.5 border-zinc-300 bg-white"
                                placeholder="发货米厂"
                              />
                            ) : (
                              f.factory || '-'
                            )}
                          </TableCell>

                          {/* 逻辑仓 */}
                          <TableCell className="text-zinc-500">
                            {isEditing ? (
                              <Input
                                value={editWarehouseForm.logicWarehouse}
                                onChange={(e) => setEditWarehouseForm({ ...editWarehouseForm, logicWarehouse: e.target.value })}
                                className="h-6 text-xs px-1.5 border-zinc-300 bg-white"
                                placeholder="逻辑仓"
                              />
                            ) : (
                              f.logicWarehouse || '-'
                            )}
                          </TableCell>

                          {/* 备注 */}
                          <TableCell className="text-zinc-400 truncate max-w-xs">
                            {isEditing ? (
                              <Input
                                value={editWarehouseForm.note}
                                onChange={(e) => setEditWarehouseForm({ ...editWarehouseForm, note: e.target.value })}
                                className="h-6 text-xs px-1.5 border-zinc-300 bg-white"
                                placeholder="备注"
                              />
                            ) : (
                              f.note || '-'
                            )}
                          </TableCell>

                          {/* 操作 */}
                          <TableCell className="text-center">
                            {isEditing ? (
                              <div className="flex items-center justify-center gap-1">
                                <Button variant="ghost" size="unstyled"
                                  type="button"
                                  onClick={handleSaveEditWarehouse}
                                  className="text-zinc-900 hover:text-emerald-700 p-1 cursor-pointer"
                                  title="保存修改"
                                >
                                  <Check className="size-3.5 text-emerald-700" />
                                </Button>
                                <Button variant="ghost" size="unstyled"
                                  type="button"
                                  onClick={handleCancelEditWarehouse}
                                  className="text-zinc-400 hover:text-zinc-600 p-1 cursor-pointer"
                                  title="取消修改"
                                >
                                  <X className="size-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-1">
                                <Button variant="ghost" size="unstyled"
                                  type="button"
                                  onClick={() => handleStartEditWarehouse(actualIdx)}
                                  className="text-zinc-400 hover:text-zinc-900 p-1 cursor-pointer"
                                  title="修改仓库信息"
                                >
                                  <Pencil className="size-3.5" />
                                </Button>
                                <Button variant="ghost" size="unstyled"
                                  type="button"
                                  onClick={() => handleDeleteWarehouse(actualIdx)}
                                  className="text-zinc-400 hover:text-red-600 p-1 cursor-pointer"
                                  title="删除仓库"
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* TAB 3: WAREHOUSE MAPPING */}
          <TabsContent value="mappings" className="flex-1 flex flex-col p-6 overflow-hidden m-0">
            <div className="flex items-center justify-between gap-3 mb-4 shrink-0">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-zinc-400" />
                <Input
                  value={mappingSearch}
                  onChange={(e) => setMappingSearch(e.target.value)}
                  placeholder="搜索原单仓库或目标仓库..."
                  className="pl-8 text-xs h-8 border-zinc-200 focus:border-zinc-900"
                />
              </div>
              <Button size="sm" onClick={handleSaveMappingDraft} className="text-xs h-8 bg-zinc-900 hover:bg-zinc-800 text-white">
                <Save className="size-3 mr-1" /> 保存映射规则
              </Button>
            </div>

            <div className="flex-1 overflow-auto border border-zinc-200 rounded-lg">
              <Table className="text-xs">
                <TableHeader className="bg-zinc-50 sticky top-0">
                  <TableRow>
                    <TableHead className="w-1/2">原表订单仓库名称 (输入)</TableHead>
                    <TableHead className="w-1/2">对应表二标准配送仓库 (映射结果)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMappingRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center py-8 text-zinc-400">
                        {mappingRows.length === 0 ? '暂无需要映射的仓库数据，导入表一和表二后将自动提取' : '未找到匹配结果'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredMappingRows.map((r, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium text-zinc-950">{r.source}</TableCell>
                        <TableCell>
                          <Select value={String((mappingDraft[r.source] || '') ?? '') || '__none__'} onValueChange={value => setMappingDraft({ ...mappingDraft, [r.source]: (value === '__none__' ? '' : value) })}>
                      <SelectTrigger className="h-8 w-full text-xs" aria-label="选择映射仓库"><SelectValue placeholder="请选择" /></SelectTrigger>
                      <SelectContent><SelectGroup>
                            <SelectItem value="__none__">-- 请选择映射仓库 --</SelectItem>
                            {directWarehouses.map((w, widx) => (
                              <SelectItem key={widx} value={String(w)}>{w}</SelectItem>
                            ))}
                          </SelectGroup></SelectContent>
                    </Select>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* TAB 4: PRODUCT CATALOG CUSTOM ORDER */}
          <TabsContent value="catalog" className="flex-1 flex flex-col p-6 overflow-hidden m-0">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <div>
                <h4 className="text-xs font-semibold text-zinc-950">
                  品牌商品输出顺序自定义 ({currentBrand || '请先在汇总页选择品牌'})
                </h4>
                <p className="text-[11px] text-zinc-500">每行输入一个标准商品简称，生成表三时将严格按此先后顺序排列</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => onRestoreCatalog(currentBrand)} className="text-xs h-8 border-zinc-200">
                  恢复默认
                </Button>
                <Button size="sm" onClick={() => onSaveCatalog(currentBrand, catalogText)} className="text-xs h-8 bg-zinc-900 hover:bg-zinc-800 text-white">
                  保存此品牌顺序
                </Button>
              </div>
            </div>
            <Textarea
              value={catalogText}
              onChange={(e) => setCatalogText(e.target.value)}
              placeholder="每行一个商品简称..."
              className="flex-1 p-3 border border-zinc-300 rounded-lg font-mono text-xs outline-none focus:border-zinc-900 resize-none leading-relaxed"
            />
          </TabsContent>

          {/* TAB 5: INVOICE CONFIG */}
          <TabsContent value="invoice" className="flex-1 flex flex-col p-6 overflow-y-auto m-0">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div>
                <h4 className="text-xs font-semibold text-zinc-950">猫超开票资质与抬头信息</h4>
                <p className="text-[11px] text-zinc-500">用于在导出开票通知单时自动填充买方公司、税号及银行账户信息</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={onResetInvoiceConfig} className="text-xs h-8 border-zinc-200">
                  恢复默认
                </Button>
                <Button size="sm" onClick={handleSaveInvoiceForm} className="text-xs h-8 bg-zinc-900 hover:bg-zinc-800 text-white">
                  保存开票设置
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-zinc-600 mb-1">开票申请人</label>
                <Input value={invoiceForm.applicant || ''} onChange={(e) => setInvoiceForm({ ...invoiceForm, applicant: e.target.value })} className="text-xs h-8 border-zinc-200" />
              </div>
              <div>
                <label className="block text-zinc-600 mb-1">开票平台</label>
                <Input value={invoiceForm.platform || ''} onChange={(e) => setInvoiceForm({ ...invoiceForm, platform: e.target.value })} className="text-xs h-8 border-zinc-200" />
              </div>
              <div className="col-span-2">
                <label className="block text-zinc-600 mb-1">购方公司抬头 (发票抬头)</label>
                <Input value={invoiceForm.companyTitle || ''} onChange={(e) => setInvoiceForm({ ...invoiceForm, companyTitle: e.target.value })} className="text-xs h-8 border-zinc-200" />
              </div>
              <div>
                <label className="block text-zinc-600 mb-1">纳税人识别号 (税号)</label>
                <Input value={invoiceForm.taxId || ''} onChange={(e) => setInvoiceForm({ ...invoiceForm, taxId: e.target.value })} className="text-xs h-8 font-mono border-zinc-200" />
              </div>
              <div>
                <label className="block text-zinc-600 mb-1">联系电话</label>
                <Input value={invoiceForm.phone || ''} onChange={(e) => setInvoiceForm({ ...invoiceForm, phone: e.target.value })} className="text-xs h-8 border-zinc-200" />
              </div>
              <div className="col-span-2">
                <label className="block text-zinc-600 mb-1">注册地址</label>
                <Input value={invoiceForm.address || ''} onChange={(e) => setInvoiceForm({ ...invoiceForm, address: e.target.value })} className="text-xs h-8 border-zinc-200" />
              </div>
              <div>
                <label className="block text-zinc-600 mb-1">开户银行</label>
                <Input value={invoiceForm.bank || ''} onChange={(e) => setInvoiceForm({ ...invoiceForm, bank: e.target.value })} className="text-xs h-8 border-zinc-200" />
              </div>
              <div>
                <label className="block text-zinc-600 mb-1">银行银行账号</label>
                <Input value={invoiceForm.account || ''} onChange={(e) => setInvoiceForm({ ...invoiceForm, account: e.target.value })} className="text-xs h-8 font-mono border-zinc-200" />
              </div>
              <div className="col-span-2">
                <label className="block text-zinc-600 mb-1">财务发票邮寄收件邮箱</label>
                <Input value={invoiceForm.mailRecipient || ''} onChange={(e) => setInvoiceForm({ ...invoiceForm, mailRecipient: e.target.value })} className="text-xs h-8 border-zinc-200" />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
