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
import { RotateCcw, Save } from 'lucide-react';

export function InvoiceConfigDialog({
  open,
  onOpenChange,
  config = {},
  onSaveConfig,
  onResetConfig,
}) {
  const [form, setForm] = useState(config);

  useEffect(() => {
    if (open) {
      setForm(config);
    }
  }, [open, config]);

  const handleChange = (field, val) => {
    setForm((prev) => ({
      ...prev,
      [field]: val,
    }));
  };

  const handleSave = () => {
    onSaveConfig(form);
    onOpenChange(false);
  };

  const handleReset = () => {
    onResetConfig();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent id="invoiceConfigDialog" className="max-w-2xl flex flex-col max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>开票资料与邮寄设置</DialogTitle>
          <DialogDescription>
            发票抬头与税号等资料，生成《开票通知单》时将自动填充到二/三项表格中。修改后本机持久化。
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 py-2 text-xs">
          <div>
            <label className="text-[11px] font-medium text-zinc-600 block mb-1">
              发票种类
            </label>
            <Input
              id="cfgInvoiceType"
              value={form.invoiceType || ''}
              onChange={(e) => handleChange('invoiceType', e.target.value)}
              className="h-8 text-xs bg-white"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium text-zinc-600 block mb-1">
              发票抬头
            </label>
            <Input
              id="cfgCompanyTitle"
              value={form.companyTitle || ''}
              onChange={(e) => handleChange('companyTitle', e.target.value)}
              className="h-8 text-xs bg-white"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium text-zinc-600 block mb-1">
              纳税人识别号 (税号)
            </label>
            <Input
              id="cfgTaxId"
              value={form.taxId || ''}
              onChange={(e) => handleChange('taxId', e.target.value)}
              className="h-8 text-xs bg-white font-mono"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium text-zinc-600 block mb-1">
              电话
            </label>
            <Input
              id="cfgPhone"
              value={form.phone || ''}
              onChange={(e) => handleChange('phone', e.target.value)}
              className="h-8 text-xs bg-white"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-[11px] font-medium text-zinc-600 block mb-1">
              地址
            </label>
            <Input
              id="cfgAddress"
              value={form.address || ''}
              onChange={(e) => handleChange('address', e.target.value)}
              className="h-8 text-xs bg-white"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium text-zinc-600 block mb-1">
              开户银行
            </label>
            <Input
              id="cfgBank"
              value={form.bank || ''}
              onChange={(e) => handleChange('bank', e.target.value)}
              className="h-8 text-xs bg-white"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium text-zinc-600 block mb-1">
              银行账号
            </label>
            <Input
              id="cfgAccount"
              value={form.account || ''}
              onChange={(e) => handleChange('account', e.target.value)}
              className="h-8 text-xs bg-white font-mono"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-[11px] font-medium text-zinc-600 block mb-1">
              发票邮寄收件人
            </label>
            <Input
              id="cfgMailRecipient"
              value={form.mailRecipient || ''}
              onChange={(e) => handleChange('mailRecipient', e.target.value)}
              className="h-8 text-xs bg-white"
            />
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <Button
            id="resetInvoiceConfigBtn"
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReset}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            恢复默认
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button id="saveInvoiceConfigBtn" size="sm" onClick={handleSave}>
              <Save className="h-3.5 w-3.5" />
              保存设置
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
