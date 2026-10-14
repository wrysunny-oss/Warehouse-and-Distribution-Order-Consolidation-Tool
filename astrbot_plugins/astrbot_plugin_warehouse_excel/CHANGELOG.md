# 更新日志 (Changelog)

## v1.0.1
- 修复 `Comp.File` 异步上下文下载机制，使用 `await comp.get_file()` 替代同步属性读取
- 修复 `chain_result` 返回值格式，采用组件列表规范传递，解决 `MessageChain has no len()` 报错
- 优化与 Node.js 算力后台联动时的状态通知逻辑

## v1.0.0
- 首次发布：支持送货单、库存更新、采购需求、开票对账、平台费用核销 5 大单据
- 支持斜杠指令与智谱 AI 大模型工具调用
