import React from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { InboundSummaryView } from './InboundSummaryView';
import { ReturnWorkflowView } from './ReturnWorkflowView';

export function ReturnSummaryView({ state, setState, ...props }) {
  return <Tabs id="returnToolView" value={state.mode || 'return'} onValueChange={mode => setState(previous => ({ ...previous, mode }))} className="flex-1 min-h-0 min-w-0 flex flex-col">
    <TabsList aria-label="退货与入库业务" className="self-start mx-5 mt-4 shrink-0"><TabsTrigger value="return">退货三步处理</TabsTrigger><TabsTrigger value="inbound">普通直入入库汇总</TabsTrigger></TabsList>
    <TabsContent value="return" className="flex-1 min-h-0 min-w-0 flex flex-col data-[state=inactive]:hidden m-0"><ReturnWorkflowView model={state.workflow} setModel={update => setState(previous => ({ ...previous, workflow: typeof update === 'function' ? update(previous.workflow) : update }))} onOpenProducts={props.onOpenProducts} /></TabsContent>
    <TabsContent value="inbound" className="flex-1 min-h-0 min-w-0 flex flex-col data-[state=inactive]:hidden m-0"><InboundSummaryView state={state} setState={setState} {...props} /></TabsContent>
  </Tabs>;
}
