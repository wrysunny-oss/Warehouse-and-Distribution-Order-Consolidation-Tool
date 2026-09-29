# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

仓配业务人员在 Windows 桌面环境中处理采购、库存、入库和送货 Excel 文件，需要减少人工匹配、计算、汇总和排版工作。

## Product Purpose

仓配订单汇总工具是一款 Electron 桌面应用。它将订单与库存模板生成表三，并将商品主数据与入库单明细生成可打印的 DeliveryNote 工作簿。成功意味着导入模板后得到字段准确、规则可追溯、可继续在 Excel 中计算和打印的文件。

## Operating Context

用户从业务系统导出 Excel 文件，在本机导入应用，检查预览与配置后导出结果。现有表三流程使用表一与表二；DeliveryNote 流程使用 product.xlsx、ReceiptNote.xlsx 和 DeliveryNote.xlsx 的版式规则。

## Capabilities and Constraints

- 表三支持仅库存和订单加库存双模式；完整模式合并相同仓库商品的订单。商品清单按品牌独立配置，默认从表一按首次出现顺序去重，没有表一时回退表二；所有仓库输出相同清单，缺少订单的商品系统订单为 0，清单外商品不输出。
- 表三的安排状态保持空白；有表一时实际订单安排受系统订单上限约束，仅有表二时直接按库存与销量生成；导出保留明细计算公式和仓库汇总公式。
- DeliveryNote 按所选品牌分别生成 Excel 文件，每个文件按完整仓库名称建立工作表，同一送货单不混入多个品牌。
- DeliveryNote 商品通过条形码匹配 product 主数据，商品名称使用“订单简称”。
- DeliveryNote 包数取 ReceiptNote 的“商品实际发货数量”，箱规取 ReceiptNote 的“采购规格(箱规数)”，箱数等于包数除以箱规；小数箱数必须标红。
- 同一工作表内连续且相同的物流宝单号需要纵向合并单元格。
- 生产日期在生成前通过商品联想搜索单选或多选后填写；不使用生产批号。
- 保质期和联系方式在生成前统一填写。
- 供应商名称是持久化全局配置，默认“湖北国宝桥米有限公司”；商家编码来自 ReceiptNote。
- DeliveryNote 延续模板的横向打印与一页宽设置。
- Excel 工作表名称最长 31 个字符；当前使用完整仓库名称，需在导出时校验并安全处理冲突。

## Brand Commitments

应用名称为“仓配订单汇总工具”。界面使用简洁、克制、面向高频业务操作的中文桌面工具语言，并延续现有界面风格。

## Evidence on Hand

- `template1.xlsx`、`template2.xlsx` 和 `template.xlsx`：表三业务样例。
- `product.xlsx`：商品主数据样例。
- `ReceiptNote.xlsx`：入库单明细样例。
- `DeliveryNote.xlsx`：送货清单目标版式样例。

## Product Principles

- 业务字段与导入模板保持可核对。
- 不静默合并、丢弃或错误归类订单明细。
- 生成前暴露必要配置，生成后保留 Excel 的可编辑和可打印能力。
- 异常数据应明确标识，并给出可恢复的处理方式。