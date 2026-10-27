# 前端组件约定

- 交互控件优先复用 `src/renderer/src/components/ui` 中的 shadcn 组件；缺少时从官方 shadcn 注册表添加，沿用 Radix 体系。
- 业务页面不直接编写原生 `select`、`button`、`input`、`textarea` 或复选框；使用 Select、Button、Input、Textarea、Checkbox 等组件。基础组件内部的原生元素及必要的语义化 HTML 不受此限制。
- 下拉选项放在 SelectGroup 中，并提供可访问的名称。映射仓库等可清空选项需保留空值业务含义。
- 表格滚动容器需限制宽度、避免被 flex 压缩裁切；使用 ScrollArea 时显式添加横向 ScrollBar，并验证鼠标拖动能查看末列。
