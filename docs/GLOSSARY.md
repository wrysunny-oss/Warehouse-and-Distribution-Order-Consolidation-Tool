# 仓配协同工作台领域词汇表 (Domain Glossary)

本词汇表由 `grill-with-docs` 与 `improve-codebase-architecture` 技能约束驱动建立，用于固化仓配与供应链业务术语，杜绝命名混乱与概念漂移。

| 业务术语 (Domain Term) | 系统标识 (Identifier) | 业务定义与约束说明 (Definition & Constraints) |
| :--- | :--- | :--- |
| **表二 (库存数据)** | `Table2` / `table2` | ERP/WMS 导出的基础库存与品项大表，包含仓库名称、货品名称、规格、良品库存等基础字段，为补货计算的**必需输入源**。 |
| **表一 (待发/调拨需求)** | `Table1` / `table1` | 渠道或销售端待发货需求单，包含原订单仓库名称、采购/订货数量。为**可选输入源**。导入后触发仓库别名映射。 |
| **表三 (补货汇总交付表)** | `Table3` / `table3` | 需求合并计算的核心交付物，以配送仓库与商品为主键，汇总各仓系统订单、实调安排、包装箱数及预估吨数。 |
| **良品可用库存** | `AvailableStock` / `availableStock` | 实际仓储物流中心可供调拨发货的合格品数量。步骤二通过实时库存表对此字段进行精确校准。 |
| **库存在途明细** | `TransitInventory` / `transit` | 已经从米厂发运但尚未正式入库上架的货品数量。校准时自动汇总并作为末列在途指标挂接至表三。 |
| **送货单 (Delivery Note)** | `DeliveryNote` / `delivery` | 发运履约单据。根据入库回执与预设规则生成，按仓库聚合，包含收货地址、联系人、生产日期及批次。 |
| **采购需求表 (Demand Sheet)** | `ProcurementDemand` / `demand` | 向上游米厂下达的生产与提货计划一览表，智能匹配归属米厂、计划提货日期及到仓日期。 |
| **原表回填 (Backfill)** | `BackfillTask` / `backfill` | 将表三计算出的最终确认发货量与物流宝单号，反向写回销售原始订单表各分仓工作表的过程。 |
| **猫超对账单 (Reconciliation)** | `InvoiceReconciliation` / `invoice` | 浙江昊超网络（天猫超市）提供的批量结算账单，包含费用类型（货款/赔付等）与发票方向（顺向/逆向）。 |
| **开票通知单 (Invoice Notice)** | `InvoiceNotice` / `invoiceNotification` | 财务结算交付物。依据核对后的货品与金额，按开票资质规范格式自动排版生成的最终开票 Excel。 |
| **主数据与配置中心** | `MasterDataCenter` | 统一管理商品档案（规格/箱规/保质期/条码）、仓库米厂预设、别名映射规则及开票资质的集中控制中心。 |
| **流转管道 (Pipeline)** | `ReplenishPipeline` | 补货汇总（步骤一）与库存校准（步骤二）之间的在内存直通机制，免去手动导出再重新上传文件的断层。 |
