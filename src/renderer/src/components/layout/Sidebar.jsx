import React from 'react';
import { 
  Boxes, 
  FileSpreadsheet, 
  Truck, 
  ReceiptText, 
  Settings, 
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function Sidebar({
  workflow,
  onWorkflowChange,
  replenishReady = false,
  deliveryReady = false,
  invoiceReady = false,
  onOpenMasterData,
  masterDataCount = 0,
}) {
  const menuItems = [
    {
      id: 'replenish',
      label: '补货与库存协同',
      sublabel: '表三计算 · 良品在途校验',
      icon: FileSpreadsheet,
      isReady: replenishReady,
    },
    {
      id: 'delivery',
      label: '发运履约中心',
      sublabel: '送货单生成 · 采购需求',
      icon: Truck,
      isReady: deliveryReady,
    },
    {
      id: 'invoice',
      label: '财务结算对账',
      sublabel: '费用核销 · 开票通知单',
      icon: ReceiptText,
      isReady: invoiceReady,
    },
  ];

  return (
    <aside className="w-64 bg-zinc-950 text-zinc-300 flex flex-col justify-between shrink-0 border-r border-zinc-800 select-none">
      <div>
        {/* Brand Header - Strict Black & White */}
        <div className="h-16 flex items-center px-5 gap-3 border-b border-zinc-800/80 bg-zinc-950">
          <div className="flex size-9 items-center justify-center rounded-xl bg-white text-zinc-950 shadow-xs">
            <Boxes className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white tracking-tight text-sm truncate">
                仓配订单协同
              </span>
              <span className="text-[10px] bg-zinc-800 text-zinc-300 border border-zinc-700/80 px-1.5 py-0.5 rounded font-mono font-medium shrink-0">
                v2.0
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 truncate mt-0.5">
              一体化供应链工作台
            </p>
          </div>
        </div>

        {/* Workflow Navigation */}
        <nav className="p-3 flex flex-col gap-1.5 text-xs" aria-label="核心业务流程">
          <div className="px-3 pt-3 pb-1 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
            核心业务流程
          </div>

          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = workflow === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onWorkflowChange(item.id)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all text-left cursor-pointer group',
                  isActive
                    ? 'bg-zinc-800 text-white font-medium border border-zinc-700 shadow-xs'
                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 border border-transparent font-normal'
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn(
                    'p-1.5 rounded-lg transition-colors',
                    isActive ? 'bg-white text-zinc-950' : 'bg-zinc-900 text-zinc-400 group-hover:text-zinc-200'
                  )}>
                    <Icon className="size-4 shrink-0" />
                  </div>
                  <div className="min-w-0">
                    <div className={cn('text-xs truncate', isActive ? 'font-semibold text-white' : 'text-zinc-300')}>
                      {item.label}
                    </div>
                    <div className="text-[10px] text-zinc-400 truncate mt-0.5">
                      {item.sublabel}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 pl-1">
                  {item.isReady && (
                    <span 
                      className="size-1.5 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.7)]" 
                      title="已就绪"
                    />
                  )}
                  {isActive && (
                    <ChevronRight className="size-3.5 text-zinc-400" />
                  )}
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Master Data & Presets Dock */}
      <div className="p-3 border-t border-zinc-800/80 bg-zinc-950">
        <button
          type="button"
          onClick={onOpenMasterData}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-850 hover:bg-zinc-800 text-zinc-200 text-xs transition-colors border border-zinc-800 cursor-pointer shadow-xs group"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1 rounded-md bg-zinc-800 text-zinc-300 group-hover:text-white transition-colors">
              <Settings className="size-3.5" />
            </div>
            <div className="min-w-0 text-left">
              <div className="text-xs font-medium text-zinc-200 truncate">
                主数据与配置中心
              </div>
              <div className="text-[10px] text-zinc-400 truncate">
                商品 · 仓库 · 映射 · 资质
              </div>
            </div>
          </div>
          <span className="text-[10px] bg-zinc-800 text-zinc-300 border border-zinc-700/80 px-1.5 py-0.5 rounded font-mono font-medium shrink-0">
            {masterDataCount > 0 ? `${masterDataCount}项` : '管理'}
          </span>
        </button>
      </div>
    </aside>
  );
}
