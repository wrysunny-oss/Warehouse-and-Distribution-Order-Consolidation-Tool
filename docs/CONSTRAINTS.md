# 仓配协同工作台约束规范 (System & Skill Constraints)

本规范依据用户启用的技能集（`hallmark`, `frontend-design`, `shadcn`, `improve-codebase-architecture`, `grill-me`, `grill-with-docs`）制定，作为本项目前端架构与界面演进的**硬性执行约束**。

---

## 维度一：视觉与设计约束 (Hallmark & Frontend-Design)

### 1. 杜绝 AI-Slop（反模板化与杜绝虚构）
- **禁止伪装或虚假文案 (No Fabricated Content)**：严禁臆造“+47% 提效”、“50,000+ 团队使用”等宣传套话；所有指标必须来源于真实解析数据或带有真实业务语义的待导入占位提示。
- **禁止伪造操作系统外框 (No Re-drawn Chrome)**：严禁在页面上手绘模拟浏览器标签栏、三色红绿灯控制点等伪窗体；应用必须作为真实桌面软件自然展现。
- **标题排版纯洁性 (Roman Typography Only)**：标题与展示类文本严禁使用斜体强调（严禁 `<em>` 斜体单词或全斜体标题）；强调一律通过字重（Semi-bold/Bold）或语义化色彩传达。
- **纯粹黑白配色体系 (Strict Black & White Monochrome Palette)**：全局严格遵循黑白极简工业配色。侧边栏采用沉稳深黑（Zinc-950 / Zinc-900），主工作区采用纯白（White）与浅灰（Zinc-50），主行动按钮为纯黑（Zinc-900 / Hover Zinc-800），中性边框（Zinc-200 / Zinc-300），严禁偏离为大面积绿色或其他彩色主题。
- **全系统严禁使用任何 Emoji 表情 (Zero Emoji Policy)**：禁止在任何界面标题、Tab 标签、按钮文案、提示卡片、表格小计行或日志提示中使用任何 Unicode Emoji 表情字符（包括且不限于 ⚡, ⚙️, 📦, 🏷️, 🏢, 🔄, 📋, 🧾, 📥, 📄, 🚚, 📊, ▶, ➔ 等）；所有视觉图标必须使用统一规范的 Lucide SVG 图标或清晰的标准中文文本。
- **克制设计 (Spend Boldness in One Place)**：视觉重心聚焦在**流水线拖拽舱**与**高密度数据网格**上，其他辅助元素保持安静克制，单行字符长度原则上受控于可读范围内。

### 2. 交互状态完备性 (The 8-State Checklist)
任何交互控件（按钮、输入框、下拉框、拖拽卡片）必须完整覆盖 8 种基础状态：
1. **默认态 (Default)**：结构清晰，层级分明。
2. **悬停态 (Hover)**：微光/微反差反馈，明确可点击边界。
3. **焦点可见态 (Focus-Visible)**：键盘与无障碍辅助支持，带清晰 Focus Ring。
4. **激活按下态 (Active)**：轻微缩放或位移下压感。
5. **禁用态 (Disabled)**：置灰且鼠标样式为 `not-allowed`，提示禁用原因。
6. **加载态 (Loading)**：清晰的状态动画或文本提示。
7. **错误态 (Error)**：红框/错误文案精准提示，避免抽象报错。
8. **就绪态 (Success/Ready)**：绿色脉冲点或成功徽标直观指示。

---

## 维度二：组件与样式约束 (shadcn / Tailwind UI Rules)

### 1. 结构化组合原则 (Compose, Don't Reinvent)
- 优先复用 Radix UI / shadcn 基础原语（`Dialog`, `Tabs`, `Card`, `Badge`, `Button`, `Table`, `Input`），禁止为了实现现有组件效果而徒手造轮子。
- 弹窗必须具备辅助功能标题：`DialogTitle` 与 `DialogDescription` 为必需元素。
- 卡片必须采用标准组合语义：`CardHeader`, `CardTitle`, `CardContent`, `CardFooter`。
- 选项集合（2~7 个选项）使用 `Tabs` 或原生语义单选，不自行循环拼装带手动状态的按钮堆。

### 2. 严格的 Tailwind 编写规范
- **禁止使用 `space-x-*` / `space-y-*`**：一律采用 Flexbox 或 Grid 配合 `gap-*`（例如 `flex flex-col gap-4`）。
- **等宽高属性一律使用 `size-*`**：使用 `size-4`、`size-8` 代替 `w-4 h-4`、`w-8 h-8`。
- **单行文本截断一律使用 `truncate`**：杜绝手写多段文本溢出类。
- **条件样式必须经过 `cn()` 封装**：禁止在 JSX 中手写易断行的原生模板字符串三元拼接。
- **色彩与层级必须走语义 Token**：优先使用 `bg-background`、`text-foreground`、`text-muted-foreground`、`border-border`，禁止随意手写裸 hex/rgb。
- **禁止在内层组件硬写遮罩层 `z-index`**：弹窗与浮层层级由 Dialog/Radix 底层接管。
- **图标必须使用 Lucide-React**：按钮内的前后置图标使用 `data-icon="inline-start"` 或 `data-icon="inline-end"`，避免外挂随意 margin。

---

## 维度三：代码架构与深度模块约束 (Improve-Codebase-Architecture)

### 1. 深度模块优先于浅层抽象 (Deep Modules over Shallow Modules)
- **拒绝过度拆解造成的认知摩擦**：避免抽取仅起透传作用的无状态浅壳层。
- **高内聚的业务中心**：
  - `ReplenishHubView` 作为深度模块，完整封装两步流水线（需求汇总计算 + 良品在途校准），外部仅暴露最小化文件流接口。
  - `MasterDataDialog` 作为集中式主数据模块，统一收口四大基础预设，提供一站式维护，彻底消灭配置散落。

### 2. 缝隙原则与局部性 (The Seam Principle & Locality)
- **IPC 通信缝隙隔离**：前端所有数据读写严格通过 `window.excelTool` 安全缝隙进行，禁止在 React 组件内掺杂 Node.js 原生路径探查。
- **状态局部性与内存直通**：
  - 打通补货表三到库存校准的内存流转管道，无需落盘文件即可进行良品匹配，实现真正的高效流转。
- **不可破坏的核心底线 (Safety Rail)**：
  - 核心计算文件（`core.js`, `delivery-note.js`, `inventory-update.js`, `invoice-summary.js`, `procurement-demand.js`）保持原逻辑稳定，**全部 61 项既有单元测试必须持续保持 100% 通过**。

---

## 维度四：审查与决策沉淀约束 (Grill-me & Grill-with-docs)

### 1. 决策记录规范 (ADR)
- 任何重大的架构或交互流转变更必须沉淀为 Architecture Decision Record（存放在 `docs/adr/`）。
- 本次重构确立的规范已沉淀为 `docs/adr/ADR-001-UI-REDESIGN-AND-SKILL-CONSTRAINTS.md`。

### 2. 领域词汇规范 (Glossary)
- 遵循 `docs/GLOSSARY.md` 定义的领域术语，统一表一、表二、表三、良品可用、在途明细、送货单等业务名词。
