## 问题描述

插件目前对模板的选择和图层扫描有两个限制：

1. **选区类型限制** — 只接受 `FRAME` 类型的节点作为模板。`COMPONENT`、`INSTANCE`、`GROUP` 等节点被直接拒绝，即使它们内部包含可填充的文本层和图片层。
2. **嵌套结构阻断** — 即使选区是 `FRAME`，其内部的子 `FRAME`、`COMPONENT`、`INSTANCE` 等容器中的图层不会被发现，导致模板中的嵌套文本/图片被遗漏。

## 复现步骤

### 问题一：非 FRAME 无法选为模板

1. 在 Figma 中创建一个 `INSTANCE` 或 `GROUP`，内含文本图层
2. 选中该节点，打开插件
3. 预期：应能识别内部的文本图层
4. 实际：提示"请选择一个 Frame 作为模板"，无法继续

### 问题二：嵌套结构中的图层被遗漏

1. 创建一个 `FRAME`，在其中放入另一个 `FRAME`，内含文本
2. 选中外层 FRAME，打开插件
3. 预期：内层 FRAME 中的文本应被扫描到
4. 实际：内层 FRAME 中的图层完全不可见

## 涉及的代码位置

### 选区类型限制
- `src/sandbox/message-handler.ts:70` — 只接受 `node.type === "FRAME"`
- `src/sandbox/message-handler.ts:183-189` — 生成阶段同样只检查 `FRAME`
- `src/ui/message-handler.ts:70` — UI 端根据 `isFrame` 显示错误状态
- `src/ui/layer-list.ts` — 状态文案

### 嵌套遍历阻断
- `src/sandbox/layer-scanner.ts:9` — `STOP_TYPES` 定义（`FRAME`, `COMPONENT`, `COMPONENT_SET`, `INSTANCE`, `SECTION`）
- `src/sandbox/layer-scanner.ts:32` — 遇到 `STOP_TYPES` 直接返回，不递归进入子节点

## 期望行为

- 支持选择 `FRAME`、`COMPONENT`、`INSTANCE`、`GROUP` 等容器类型作为模板
- 图层遍历应递归进入所有容器节点（包括嵌套的 Frame/Component）以发现可填充的文本和图片图层
- 克隆和填充逻辑应同步适配，支持对非 Frame 节点的处理

## 注意事项

- 当前 `cloneFrame` 和 `fillContent` 可能也假设输入为 FrameNode，需同步修改
- `STOP_TYPES` 的设计初衷可能是避免穿透到不应修改的组件内部，但对于 Component/Instance 内部的可编辑文本应该仍然可以识别
- 需要处理好 `INSTANCE` 组件的覆盖（override）写入方式
