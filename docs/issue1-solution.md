# Issue 1 解决方案（修订版）

> 状态：待确认 | 日期：2026-05-21

## 一、问题回顾

1. **选区类型限制**：只接受 FRAME 作为模板，INSTANCE、GROUP 被拒绝
2. **嵌套结构阻断**：STOP_TYPES 阻止扫描进入子 FRAME，嵌套的文本/图片图层被遗漏

---

## 二、方案总览

```
              ┌──────────────┐     ┌──────────────┐
              │  第1部分     │     │  第2部分     │
              │  扩展节点    │     │  递归穿透    │
              │  类型检测    │     │  嵌套容器    │
              └──────┬───────┘     └──────┬───────┘
                     │                    │
         ┌───────────┴───────┐            ▼
         ▼                   ▼    ┌─────────────────────┐
   ┌──────────┐   ┌────────────┐  │ STOP_TYPES 移除     │
   │  FRAME   │   │  INSTANCE  │  │ FRAME，保留其余     │
   │   (已有) │   │            │  │ COMPONENT / COMPO-  │
   └──────────┘   │   GROUP    │  │ NENT_SET / INSTANCE │
                  └────────────┘  │ / SECTION           │
                                  └─────────────────────┘
```

两个改动相对独立。

---

## 三、第1部分：扩展模板节点类型

### 3.1 允许的节点类型

| 节点类型 | 克隆方式 | 写文本 | 写图片 | 备注 |
|---------|---------|--------|--------|------|
| `FRAME`（已有） | `.clone()` | 直接赋值 | 直接赋值 | 无变化 |
| `INSTANCE`（新增） | `.clone()` → 仍链接同一主组件 | 覆盖写入（直接赋值即可） | 覆盖写入 | 所有生成副本指向同一主组件 |
| `GROUP`（新增） | `.clone()` | 直接赋值 | 直接赋值 | 低风险 |

> **不纳入的类型**：COMPONENT（经与设计师确认，暂不需要）；COMPONENT_SET、SECTION（元容器，始终不接受）。

### 3.2 涉及的改动

#### 3.2.1 类型系统（`src/shared/types.ts`）

新增：
```ts
export type TemplateNodeType = 'FRAME' | 'INSTANCE' | 'GROUP';
export const TEMPLATE_NODE_TYPES: ReadonlySet<string> = new Set([
  'FRAME', 'INSTANCE', 'GROUP'
]);
```

`SelectedNodeSummary.isFrame` → `isTemplate`，计算逻辑改为 `TEMPLATE_NODE_TYPES.has(node.type)`。

#### 3.2.2 沙箱端层扫描（`src/sandbox/layer-scanner.ts`）

- `scanLayers(templateFrame: FrameNode)` → `scanLayers(root: SceneNode)`（放宽参数类型）
- `frameId` → `rootId`（变量重命名）
- 内部逻辑不变（已有空值判断）

#### 3.2.3 沙箱端消息处理（`src/sandbox/message-handler.ts`）

- 所有 `selection[0].type === 'FRAME'` → `TEMPLATE_NODE_TYPES.has(selection[0].type)`
- 所有 `as FrameNode` → `as SceneNode`
- `let templateFrame: FrameNode | null` → `let templateNode: SceneNode | null`
- `generatedFrames: FrameNode[]` → `generatedNodes: SceneNode[]`
- 错误消息 `'模板 Frame 未找到'` → `'模板节点未找到'`

#### 3.2.4 内容填充（`src/sandbox/content-filler.ts`）

- `loadFonts(frame: FrameNode)` → `loadFonts(root: SceneNode & ChildrenMixin)`
  - 内部 `(node as FrameNode).children` → `(node as ChildrenMixin).children`
- `fillContent(clonedFrame: FrameNode, ...)` → `fillContent(clonedRoot: SceneNode & ChildrenMixin, ...)`
- `findNodeByPath(frame: FrameNode, ...)` → `findNodeByPath(root: SceneNode & ChildrenMixin, ...)`

#### 3.2.5 克隆（`src/sandbox/frame-cloner.ts` → `src/sandbox/node-cloner.ts`）

- `cloneFrame(templateFrame: FrameNode): FrameNode` → `cloneNode(template: SceneNode): SceneNode`
- `.clone()` 在 FRAME、INSTANCE、GROUP 三种类型上都支持

#### 3.2.6 布局引擎（`src/sandbox/layout-engine.ts`）

- `layoutFrames(frames: FrameNode[], ...)` → `layoutNodes(nodes: SceneNode[], ...)`
- 使用的 `.x`、`.y`、`.width`、`.height` 属性来自 `DimensionAndPositionMixin`，三种目标类型均具备

#### 3.2.7 消息协议（`src/shared/messages.ts`）

- `TemplateLayersMessage.payload.frameName` → `templateName`

#### 3.2.8 UI 端

- `node.isFrame` → `node.isTemplate`（`src/ui/message-handler.ts:70`）
- 状态键 `'not-frame'` → `'not-template'`（`src/ui/message-handler.ts:71`, `src/ui/layer-list.ts:85`）
- **文案更新**：UI 中所有出现 "Frame" 的提示文字，改为列出支持的容器类型。具体如下：

| 位置 | 当前文案 | 更新后 |
|------|---------|--------|
| `layer-list.ts:80` 无选中 | 请先在画布中选中一个模板 Frame | 请选择一个容器节点（Frame / 实例 / 群组）作为模板 |
| `layer-list.ts:83` 多选 | 请只选择一个 Frame 作为模板 | 请只选择一个容器节点（Frame / 实例 / 群组）作为模板 |
| `layer-list.ts:86` 类型不匹配 | 请选择一个 Frame 作为模板，当前选中的是 … | 请选择一个容器节点（Frame / 实例 / 群组）作为模板，当前选中的是 … |
| `layer-list.ts:86` 默认 detail | 非Frame对象 | 不支持的类型 |
| `constants.ts:22-24`（未使用但保留） | 同上类似 | 同步更新 |

---

## 四、第2部分：嵌套结构递归穿透

### 4.1 方案

STOP_TYPES 中**仅移除 FRAME**（允许 FRAME 套 FRAME 穿透），其余保留：

```ts
// 修改前
const STOP_TYPES = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SECTION']);

// 修改后
const STOP_TYPES = new Set(['COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SECTION']);
```

### 4.2 设计意图

| 节点类型 | 是否穿透 | 理由 |
|---------|---------|------|
| `FRAME` | **是**（新） | 设计师在 FRAME 内嵌套 FRAME 作为图片/文字容器，需穿透 |
| `COMPONENT` | 否 | 组件内部结构由组件自身维护 |
| `COMPONENT_SET` | 否 | 变体集合，纯组织容器 |
| `INSTANCE` | 否 | 实例内部为虚拟子节点，当前阶段不穿透 |
| `SECTION` | 否 | 画布分区，纯组织容器 |

### 4.3 影响分析

| 改动项 | 文件 | 影响 |
|--------|------|------|
| STOP_TYPES 定义 | `layer-scanner.ts:9` | 移除 FRAME |
| 扫描递归行为 | `layer-scanner.ts:32` | FRAME 内 FRAME 自动穿透 |
| 层名称路径 | `layer-scanner.ts:92-113` | 自然包含嵌套 FRAME 名称（如 `外层FRAME > 内层FRAME > 标题`） |
| 内容查找 | `content-filler.ts:134-161` | 已支持按路径递归深度查找，无需修改 |
| 字体加载 | `content-filler.ts:9-38` | 已递归遍历所有子节点，无需修改 |

### 4.4 特别说明：INSTANCE 根模板的场景

当用户选择 INSTANCE 作为模板时：
- 根 INSTANCE 可以扫描（`node.id !== rootId` 使其通过 STOP_TYPES 检查）
- 但 INSTANCE **内部**的子 INSTANCE 不会穿透（INSTANCE 仍在 STOP_TYPES 中）
- 这与设计意图一致

---

## 五、改动清单总结

| # | 文件 | 改动类型 | 内容 |
|---|------|---------|------|
| 1 | `src/shared/types.ts` | 新增 + 修改 | 新增 `TemplateNodeType`（`'FRAME' \| 'INSTANCE' \| 'GROUP'`）、`TEMPLATE_NODE_TYPES`；`isFrame` → `isTemplate` |
| 2 | `src/shared/messages.ts` | 修改 | `frameName` → `templateName` |
| 3 | `src/sandbox/layer-scanner.ts` | 修改 | STOP_TYPES 移除 FRAME；函数签名放宽；`frameId` → `rootId` |
| 4 | `src/sandbox/message-handler.ts` | 修改 | 类型检查放宽为 `TEMPLATE_NODE_TYPES.has()`；变量重命名（`frame` → `templateNode`）；错误消息更新 |
| 5 | `src/sandbox/frame-cloner.ts` | 重命名+修改 | → `node-cloner.ts`；签名放宽为 `SceneNode` |
| 6 | `src/sandbox/content-filler.ts` | 修改 | 三个函数签名放宽为 `SceneNode & ChildrenMixin`；`(node as FrameNode)` → `(node as ChildrenMixin)` |
| 7 | `src/sandbox/layout-engine.ts` | 修改 | 函数签名放宽为 `SceneNode[]`；函数名 `layoutFrames` → `layoutNodes` |
| 8 | `src/sandbox/main.ts` | 修改 | 导入路径从 `./frame-cloner` → `./node-cloner` |
| 9 | `src/ui/message-handler.ts` | 修改 | `isFrame` → `isTemplate`；`frameName` → `templateName`；`'not-frame'` → `'not-template'` |
| 10 | `src/ui/layer-list.ts` | 修改 | 状态键 `'not-frame'` → `'not-template'`；3 处 UI 文案更新 |
| 11 | `src/ui/app.ts` | 修改 | 可能涉及 `isFrame` 引用 |
| 12 | `scripts/build-sandbox.mjs` | 验证 | 构建入口路径不变 |

---

## 六、风险与缓解

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| GROUP 类型未充分测试 | 低 | `.clone()` 和 children 遍历均受 Figma API 支持 |
| INSTANCE 克隆后仍链接主组件 | 中 | 生成的副本指向同一主组件，修改主组件会影响所有副本。符合设计师预期：模板即为主组件 |
| 重命名导致的漏改 | 中 | TypeScript 编译 + ESLint 检查覆盖所有引用 |
| UI 文案更新不完全 | 低 | 全局搜索 `'Frame'` / `'非Frame'` 确认 |

---

## 七、验证计划

1. **TypeScript 编译**：`npm run typecheck`
2. **ESLint**：`npm run lint`
3. **构建**：`npm run build`

4. **手动测试用例**：

| # | 测试场景 | 预期结果 |
|---|---------|---------|
| 1 | 选择 FRAME 模板 | 正常扫描内部图层 |
| 2 | 选择 INSTANCE 模板 | 正常扫描内部图层 |
| 3 | 选择 GROUP 模板 | 正常扫描内部图层 |
| 4 | 选择 COMPONENT | 提示不支持（因 COMPONENT 不在 TEMPLATE_NODE_TYPES 中） |
| 5 | 选择 TEXT / RECTANGLE | 提示"请选择容器节点（Frame / 实例 / 群组）" |
| 6 | 选择 COMPONENT_SET | 同上，提示不支持 |
| 7 | 多选 | 提示只选一个 |
| 8 | 嵌套 FRAME > FRAME > TEXT | TEXT 被扫描到，路径含两层 FRAME |
| 9 | 嵌套 FRAME > GROUP > TEXT | TEXT 被扫描到（GROUP 原本就已穿透） |
| 10 | 嵌套 FRAME > INSTANCE > TEXT | 不穿透（INSTANCE 仍在 STOP_TYPES） |
| 11 | 批量生成（FRAME 模板） | 正常克隆、填充、布局 |
| 12 | 批量生成（INSTANCE 模板） | 正常克隆、覆盖填充、布局 |
| 13 | 批量生成（GROUP 模板） | 正常克隆、填充、布局 |

---

请确认后，我将编写详细的分步实施文档。
