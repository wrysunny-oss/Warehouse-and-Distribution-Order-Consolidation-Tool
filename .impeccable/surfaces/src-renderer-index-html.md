---
version: 1
slug: "src-renderer-index-html"
primary_target: "src/renderer/index.html"
related_targets: ["src/renderer/styles.css","src/renderer/app.js"]
---

# DeliveryNote workflow extension

Mode: Operate

Audience and task: 仓配业务人员导入 product 与 ReceiptNote，选择品牌、补齐生产日期和全局字段，并批量生成按品牌拆分、按仓库分表的 DeliveryNote 文件。

Constraints: 继承现有桌面工具的视觉系统和单窗口操作方式；保持表三功能不变；生产日期必须能通过商品联想搜索单选或多选批量设置；导出前明确显示未配置商品和异常箱数。

## Direction contract

THESIS: 在现有仓配工具中加入一个完整但不打断主流程的 DeliveryNote 工作区，拒绝把多阶段配置塞进弹窗或隐藏菜单。

OWN-WORLD: 延续现有浅色业务界面、深绿色主操作、清晰边界和紧凑表格；新增内容使用同一圆角、控件高度、状态色和中文系统字体。

STORY: 用户切换到 DeliveryNote，先导入两份源表，再选择品牌和填写全局配置，随后按商品批量分配生产日期，看到完整性状态后选择目录生成文件。

FIRST VIEWPORT: 顶部保留产品标题并加入两个清晰的工作流切换项；DeliveryNote 页面首屏展示双文件导入与主要生成配置，生产日期分配紧随其下，生成按钮始终与当前可生成状态一起出现。

FORM: 这是既有界面的局部扩展，采用单窗口双工作流与内联配置，不进行新视觉方向抽选；seed key: local-extension-no-seed。

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
