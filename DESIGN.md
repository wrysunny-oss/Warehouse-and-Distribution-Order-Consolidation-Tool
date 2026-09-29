---
name: "仓配订单汇总工具"
description: "面向高频 Excel 仓配操作的浅灰绿单窗口业务工作台"
colors:
  page: "#f3f5f3"
  surface: "#fbfcfb"
  surface-strong: "#ffffff"
  ink: "#18211e"
  muted: "#5d6763"
  line: "#d9e0dc"
  line-strong: "#c4cec9"
  accent: "#245f50"
  accent-hover: "#194a3e"
  accent-soft: "#e4eee9"
  warning: "#a05a18"
  warning-soft: "#fff3e4"
  danger: "#a33b37"
typography:
  headline:
    fontFamily: "Segoe UI, Microsoft YaHei UI, Microsoft YaHei, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Segoe UI, Microsoft YaHei UI, Microsoft YaHei, sans-serif"
    fontSize: "15px"
    fontWeight: 700
  body:
    fontFamily: "Segoe UI, Microsoft YaHei UI, Microsoft YaHei, sans-serif"
    fontSize: "14px"
    fontWeight: 400
  label:
    fontFamily: "Segoe UI, Microsoft YaHei UI, Microsoft YaHei, sans-serif"
    fontSize: "12px"
    fontWeight: 700
rounded:
  field: "7px"
  control: "8px"
  notice: "9px"
  switch: "10px"
  surface: "12px"
  dialog: "14px"
  empty-mark: "15px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  page: "28px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface-strong}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.surface-strong}"
    rounded: "{rounded.control}"
  button-secondary:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.accent}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "36px"
  field:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    height: "38px"
  card:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
---

# Design System: 仓配订单汇总工具

## Overview

**Creative North Star: “浅灰绿业务工作台”**

这是一个为 Windows 桌面环境和高频仓配操作服务的单窗口工作台。视觉语言克制、清晰、偏紧凑：浅灰绿色页面承托白色工作表面，深绿色只用于主要操作、当前选择与完成状态，细边框承担大部分分组职责。两个入口“补货汇总 / 送货单生成”共享同一套顶栏、控件、卡片和状态语言。

界面优先保证扫描、核对、配置和导出效率。信息密度可以较高，但层级必须靠稳定的标题、标签、边框、表头和数值对齐表达；不以装饰性图形替代业务文字，也不把多阶段配置藏进临时浮层。

**Key Characteristics:**

- 浅灰绿页面、白色内容面与深绿色强调构成固定主色关系。
- 细边框和轻微色块负责分区，阴影仅出现在少数浮层或选中控件。
- 中文系统字体、紧凑控件和表格化信息适配桌面业务操作。
- 状态直接显示在当前任务附近，并同步控制主要操作是否可用。

## Colors

整体是低饱和灰绿色中性色系统：深绿表达动作与完成，橙色表达待处理，红色表达错误，背景色保持轻量、安静。

### Primary

- **工作台深绿**：用于主要按钮、可编辑列提示、关键指标、焦点边框、选中项和完成状态；悬停时使用更深的绿色。
- **完成浅绿**：用于已加载文件、选中品牌、已填写日期、汇总行和成功提示的柔和底色。

### Neutral

- **页面灰绿**：应用最底层背景，区分白色工作区域。
- **白色工作面**：顶栏、卡片、输入框、对话框和表格主体的主要承载面。
- **主文本墨绿黑**：标题、正文和关键数值。
- **次要灰绿**：说明、辅助标签、元数据、未完成状态和次级数值。
- **轻边线 / 强边线**：轻边线划分大区域与表格，强边线用于可交互控件和需要更明确边界的元素。

### Secondary

- **待处理琥珀**：用于仍需配置或存在非致命提醒的就绪状态与通知。
- **错误红**：用于源数据问题、失败通知和阻止生成的说明文本。

**The Semantic Accent Rule.** 深绿色只承担主要动作、选择、编辑提示或完成含义；警告和错误不得借用深绿色。

**The Quiet Surface Rule.** 普通容器保持白色或极浅灰绿，以边框而不是大面积高饱和色建立层级。

## Typography

**Display Font:** 无独立展示字体。  
**Body Font:** Segoe UI，回退到 Microsoft YaHei UI、Microsoft YaHei 和 sans-serif。  
**Label/Mono Font:** 无独立字体；数字通过等宽数字特性保持列对齐。

**Character:** 使用 Windows 原生中文界面字体栈，语气务实、紧凑、可快速扫描。层级主要由字号、字重和色彩建立，不依赖装饰字体。

### Hierarchy

- **Headline**（粗体，20px，略收紧字距）：应用标题与送货单页主标题。
- **Title**（粗体，15px）：工作区标题；空态与对话框标题在同一系统内提升到 17–18px。
- **Body**（常规，14px）：操作说明、控件正文与常规业务内容。
- **Label**（半粗或粗体，11–12px）：字段标签、状态徽标、元数据、表头和辅助说明。
- **Metric**（粗体，18–22px，等宽数字）：汇总指标与日期完成进度。
- **Dense Table**（常规，12px，等宽数字）：表格数据、商品列表元数据和数量信息。

**The Native Chinese Rule.** 保留系统中文字体栈；不要引入与 Windows 桌面工具气质冲突的展示字体。

**The Numeric Scan Rule.** 指标、数量、条码和表格数字使用等宽数字特性，并维持现有的右对齐或固定列宽。

## Layout

应用采用固定桌面工作台模型。顶栏高 72px，左右页面内边距为 28px；主体顶部和底部分别保留 20px 与 28px。顶栏由产品信息、居中的双入口切换器和右侧状态/主操作组成。每个工作流都在同一窗口内显示，不叠加为向导或弹窗。

补货汇总入口先呈现四列导入控制带，再显示五列指标区和主表格工作区。送货单生成入口使用 16px 的纵向间隔串联介绍、双文件导入、全局配置和生产日期工作区。卡片内部常用 12–20px 的间距，紧凑工具条采用网格布局保持字段和按钮对齐。

当前实现是桌面优先而非移动响应式：`body` 的最小宽度为 1000px。在视口不超过 1180px 时，顶栏和主体水平内边距收紧为 20px，产品副标题隐藏，生产日期工具条重排，配置表单保持三等列。双文件导入仍保持两列，商品列表和汇总表不折叠为移动卡片。

宽表格使用内部滚动而非压缩字段：补货表最小宽度为 2220px，前两列使用固定宽度并以省略号处理溢出；表头粘在滚动区域顶部。商品日期列表采用固定业务列与弹性商品名称列，列表内部最高 360px 后滚动。

**The Desktop Workspace Rule.** 新增业务区域必须适配现有 1000px 最小宽度和 1180px 紧凑断点；不得声称或假设已有移动端布局。

**The Local Scroll Rule.** 宽表格和长列表在自身容器内滚动，保留标题、工具条和关键操作的上下文。

## Elevation & Depth

系统默认是平面的。页面层、白色工作面、工具条浅底色和 1px 边框构成主要深度；常规卡片不使用阴影。阴影只为短暂浮层或明确的浮起状态服务：活动工作流标签使用轻阴影，对话框使用大范围环境阴影并配半透明遮罩，toast 使用中等环境阴影。输入焦点以深绿边框和半透明绿色焦点环表达，不用抬升。

### Shadow Vocabulary

- **活动标签**（`0 2px 8px rgba(26, 55, 46, .09)`）：仅用于当前工作流标签。
- **对话框浮层**（`0 24px 80px rgba(24, 45, 37, .2)`）：仅用于仓库映射对话框，配合深色半透明 backdrop。
- **Toast 浮层**（`0 12px 36px rgba(20, 48, 39, .2)`）：仅用于右下角临时反馈。
- **焦点环**（`0 0 0 3px rgba(36, 95, 80, .12)`）：用于输入框和选择框焦点。

**The Flat-by-Default Rule.** 常驻容器使用边框和底色分层；不要给每张卡片或每个按钮添加阴影。

## Shapes

形状语言是轻微圆润的矩形，保持工具感而不过分柔软。输入框和工作流标签使用 7px 圆角，按钮与品牌选项使用 8px，通知为 9px，工作流切换容器为 10px，主卡片与文件槽为 12px，对话框为 14px。空态标记可使用 15px；就绪指示点是唯一常见的圆形状态元素。

大多数形状都有 1px 实线边框。表格和列表依靠直线分隔，不给每一行增加独立圆角。容器若需要裁切表格或指标分隔线，应保持主卡片圆角并使用 `overflow: hidden`；送货单配置和生产日期工作区为下拉控件保留可见溢出。

**The Gentle Rectangle Rule.** 控件和容器使用 7–14px 的轻圆角矩形；除状态点外，不把业务控件改成胶囊或圆形。

## Components

### Buttons

- **Shape:** 最小高度 36px、水平内边距 14px、8px 圆角，文字半粗，保持单行。
- **Primary:** 深绿底、白字，用于“导出表三”“生成送货单”和保存确认；悬停转为更深绿。
- **Secondary:** 白底、深绿字、较强边线；悬停时边线转深绿并出现浅绿底。
- **Quiet:** 透明底、主文字色和轻边线；悬停只强化边线。
- **Active / Disabled:** 按下时向下位移 1px；禁用时降低到 48% 不透明度并显示不可用光标。加载时文案切换为“正在读取 / 正在导出 / 正在生成”。
- **Focus:** 全局 `:focus-visible` 使用 2px 深绿轮廓并向外偏移 2px。

### Navigation

- 顶部工作流切换器是带 3px 内边距、轻边线和浅灰绿底的双项分段控件。
- 默认标签透明并使用次要文字色；悬停转主文字色；活动标签使用白底、深绿文字和轻阴影。
- 切换入口时同步更新 `aria-current`、主视图和右侧状态/主操作，不保留两个视图同时可见。

### Cards / Containers

- **File Slot:** 白底、轻边线、12px 圆角、14px × 16px 内边距；导入成功后边线与背景转为浅绿色完成态。
- **Workspace:** 白底、轻边线、12px 圆角；标题栏与内容以底边线分隔。
- **Metrics:** 五列共享一个圆角容器，以竖线分隔；关键指标数值使用深绿色。
- **Toolbars:** 使用极浅灰绿背景和底边线，保持控件在同一基线上。

### Inputs / Fields

- **Style:** 白底、较强边线、7px 圆角。紧凑搜索/选择控件高 34px，设置表单字段高 38px，表格内编辑控件高 28px。
- **Focus:** 深绿边线与半透明绿色焦点环同时出现。
- **Disabled:** 由原生禁用状态与关联按钮禁用共同表达；依赖数据未导入时不可编辑。
- **Labels:** 字段标签使用 12px 次要色粗体，帮助文字使用 11px 次要色。

### Notices, Badges & Readiness

- **Notice:** 警告使用浅橙底与棕色文字，错误使用浅红底与红字，成功使用浅绿底与深绿字；通知位于相关工作流内容上方并带 `role="status"`。
- **Mode Badge:** 顶栏中的中性灰绿状态标签，随工作流数据和就绪程度更新文案。
- **Readiness:** 文字与 9px 状态点组合；默认灰色、待处理橙色、可生成深绿色，状态点带同色浅环。
- **Toast:** 固定在右下角，深绿黑底白字；显示时从下方 8px 淡入并在 3 秒后消失。

### Tables & Product Lists

- 补货表使用 12px 字号、36px 行高、粘性浅灰绿表头、细网格线和右对齐数字。行悬停使用极浅灰绿，仓库汇总行使用浅绿底、深绿字和加粗。
- 商品日期列表使用 46px 最小行高。悬停行变浅，选中行使用浅绿底；商品名称截断并保留标题提示。
- 日期状态使用 6px 圆角标签：未填写为中性灰，完成后为浅绿底和深绿粗体。

### Selection Controls

- 品牌选项是带边框的 36px 高矩形选择项，内部使用原生复选框；选中后变为浅绿底、绿色边线和深绿文字。
- 商品复选框使用深绿色 `accent-color`；选中状态同时反映到整行背景。
- 选择、清空和批量应用操作通过禁用状态反映当前是否具备可执行条件。

### Empty States, Dialog & Feedback

- 空态居中显示带边框的浅绿标记、17px 标题和最长 480px 的次要说明，不使用插画。
- 仓库映射使用原生对话框，宽度上限 900px、高度上限 720px，并保留 80px 视口边距；头部、筛选工具条、滚动列表和底部操作区分层明确。
- 对话框关闭按钮为 34px 方形描边控件；未解决映射行使用浅橙底提示。

### Motion

- 按钮和工作流标签的颜色变化为 140ms ease，按钮按下位移为 100ms ease，toast 的透明度和位移为 160ms ease。
- 系统启用 `prefers-reduced-motion: reduce` 时移除全部过渡。

## Do's and Don'ts

### Do:

- **Do** 复用现有浅灰绿背景、白色工作面、深绿色主操作和 1px 边框体系。
- **Do** 把状态文案、状态色和按钮可用性绑定到同一业务条件，尤其是导入、配置完整性和生成就绪状态。
- **Do** 为宽表与长列表提供局部滚动、粘性表头、固定关键列宽和文本省略。
- **Do** 保持“补货汇总 / 送货单生成”两入口共用顶栏、按钮、字段、卡片和通知语言。
- **Do** 保留清晰的键盘焦点轮廓、状态区域语义以及减少动态效果偏好。

### Don't:

- **Don't** 把多阶段业务配置塞入隐藏菜单或把主流程拆成一连串临时弹窗。
- **Don't** 给常驻卡片添加重阴影、渐变、高饱和装饰色或无业务含义的图形。
- **Don't** 用胶囊化、超大圆角或移动端卡片堆叠替换现有桌面工具几何语言。
- **Don't** 压缩宽业务表格到不可读；保持字段宽度并使用局部横向滚动。
- **Don't** 发明尚未实现的移动布局、主题变体、组件或交互状态。

