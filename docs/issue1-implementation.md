# Issue 1 实施文档

> 基于 `docs/issue1-solution.md` 方案 | 2026-05-21

---

## 实施步骤

按依赖关系排序，每个文件列出具体改动。

---

### 步骤 1：`src/shared/types.ts` — 类型系统

#### 1.1 新增类型

在 `SelectedNodeSummary` 接口前插入：

```ts
// 模板节点类型：插件接受作为模板的节点类型
export type TemplateNodeType = 'FRAME' | 'INSTANCE' | 'GROUP';
export const TEMPLATE_NODE_TYPES: ReadonlySet<string> = new Set(['FRAME', 'INSTANCE', 'GROUP']);
```

#### 1.2 修改 `SelectedNodeSummary`

```diff
  export interface SelectedNodeSummary {
    id: string;
    name: string;
    type: string;
-   isFrame: boolean;
+   isTemplate: boolean;
  }
```

#### 1.3 修改 `MappingConfig`

无代码改动，但注意字段名已使用 `templateNodeId`、`templateName`，无需修改。

---

### 步骤 2：`src/shared/messages.ts` — 消息协议

#### 2.1 重命名 `TemplateLayersMessage` 中的字段

```diff
  export interface TemplateLayersMessage {
    type: 'template-layers';
    payload: {
      nodeId: string;
-     frameName: string;
+     templateName: string;
      textLayers: PlaceholderLayer[];
      imageLayers: PlaceholderLayer[];
      totalLayers: number;
    };
  }
```

---

### 步骤 3：`src/sandbox/layer-scanner.ts` — 层扫描

#### 3.1 修改 `STOP_TYPES`

```diff
  const PENETRATE_TYPES = new Set(['GROUP', 'BOOLEAN_OPERATION']);

- const STOP_TYPES = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SECTION']);
+ // 仅阻断元容器。FRAME 被移除以支持 FRAME 套 FRAME 的嵌套扫描
+ const STOP_TYPES = new Set(['COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SECTION']);
```

#### 3.2 放宽 `scanLayers` 签名

```diff
- export async function scanLayers(templateFrame: FrameNode): Promise<{
+ export async function scanLayers(root: SceneNode): Promise<{
    textLayers: PlaceholderLayer[];
    imageLayers: PlaceholderLayer[];
  }> {
    const result = {
      textLayers: [] as PlaceholderLayer[],
      imageLayers: [] as PlaceholderLayer[],
    };

-   await collectLayers(templateFrame, templateFrame.id, result);
+   await collectLayers(root, root.id, result);
    return result;
  }
```

#### 3.3 参数重命名 `frameId` → `rootId`

```diff
  async function collectLayers(
    node: SceneNode,
-   frameId: string,
+   rootId: string,
    result: { textLayers: PlaceholderLayer[]; imageLayers: PlaceholderLayer[] },
  ): Promise<void> {
    if ('visible' in node && node.visible === false) return;
    if ('locked' in node && node.locked === true) return;

-   if (node.id !== frameId && STOP_TYPES.has(node.type)) return;
+   if (node.id !== rootId && STOP_TYPES.has(node.type)) return;

    if (node.type === 'TEXT') {
      const textNode = node as TextNode;
-     const path = await buildPath(node, frameId);
+     const path = await buildPath(node, rootId);
      // ... unchanged
    }

    if (IMAGE_NODE_TYPES.has(node.type)) {
-     const path = await buildPath(node, frameId);
+     const path = await buildPath(node, rootId);
      // ... unchanged
      if (PENETRATE_TYPES.has(node.type)) {
        if ('children' in node) {
          for (const child of (node as ChildrenMixin).children) {
-           await collectLayers(child, frameId, result);
+           await collectLayers(child, rootId, result);
          }
        }
      }
      return;
    }

    if (PENETRATE_TYPES.has(node.type)) {
      if ('children' in node) {
        for (const child of (node as ChildrenMixin).children) {
-         await collectLayers(child, frameId, result);
+         await collectLayers(child, rootId, result);
        }
      }
      return;
    }

    if ('children' in node) {
      for (const child of (node as ChildrenMixin).children) {
-       await collectLayers(child, frameId, result);
+       await collectLayers(child, rootId, result);
      }
    }
  }
```

#### 3.4 参数重命名 `buildPath`

```diff
- async function buildPath(node: SceneNode, frameId: string): Promise<string> {
+ async function buildPath(node: SceneNode, rootId: string): Promise<string> {
    const parts: string[] = [];
    let current: BaseNode | null = node;

-   while (current && current.id !== frameId) {
+   while (current && current.id !== rootId) {
      if ('name' in current && typeof current.name === 'string') {
        parts.unshift(current.name);
      }
      if ('parent' in current && current.parent) {
        current = current.parent as BaseNode | null;
      } else {
        break;
      }
    }

-   const frame = await figma.getNodeByIdAsync(frameId);
-   if (frame && 'name' in frame && typeof frame.name === 'string') {
-     parts.unshift(frame.name);
+   const root = await figma.getNodeByIdAsync(rootId);
+   if (root && 'name' in root && typeof root.name === 'string') {
+     parts.unshift(root.name);
    }

    return parts.join(' > ');
  }
```

---

### 步骤 4：`src/sandbox/frame-cloner.ts` → `src/sandbox/node-cloner.ts`

#### 4.1 重命名文件

```bash
mv src/sandbox/frame-cloner.ts src/sandbox/node-cloner.ts
```

#### 4.2 修改内容

```diff
- export function cloneFrame(templateFrame: FrameNode): FrameNode {
-   const clone = templateFrame.clone();
+ export function cloneNode(template: SceneNode): SceneNode {
+   const clone = template.clone();
    figma.currentPage.appendChild(clone);
    return clone;
  }
```

---

### 步骤 5：`src/sandbox/content-filler.ts` — 内容填充

#### 5.1 放宽 `loadFonts` 签名

```diff
- export async function loadFonts(frame: FrameNode): Promise<void> {
+ export async function loadFonts(root: SceneNode & ChildrenMixin): Promise<void> {
    const fonts = new Map<string, FontKey>();

    function collect(node: SceneNode): void {
      if (node.type === 'TEXT') {
        // ... unchanged
      }
      if ('children' in node) {
-       for (const child of (node as FrameNode).children) {
+       for (const child of (node as ChildrenMixin).children) {
          collect(child);
        }
      }
    }

-   collect(frame);
+   collect(root);

    await Promise.all(
      Array.from(fonts.values()).map(f => figma.loadFontAsync({ family: f.family, style: f.style }))
    );
  }
```

#### 5.2 放宽 `fillContent` 签名

```diff
  export function fillContent(
-   clonedFrame: FrameNode,
+   clonedRoot: SceneNode & ChildrenMixin,
    mappings: MappingEntry[],
    row: TableRow,
  ): { issues: Issue[]; warnings: Warning[] } {
    const issues: Issue[] = [];
    const warnings: Warning[] = [];

    for (const mapping of mappings) {
      if (!mapping.sourceField || !mapping.targetLayerName) continue;

      const cellValue = row.cells[mapping.sourceField];
-     const targetNode = findNodeByPath(clonedFrame, mapping.targetLayerName.split(' > '));
+     const targetNode = findNodeByPath(clonedRoot, mapping.targetLayerName.split(' > '));
      // ... unchanged
    }

    return { issues, warnings };
  }
```

#### 5.3 放宽 `findNodeByPath` 签名

```diff
- function findNodeByPath(frame: FrameNode, pathSegments: string[]): SceneNode | null {
-   const searchSegments = pathSegments[0] === frame.name ? pathSegments.slice(1) : pathSegments;
+ function findNodeByPath(root: SceneNode & ChildrenMixin, pathSegments: string[]): SceneNode | null {
+   const searchSegments = pathSegments[0] === root.name ? pathSegments.slice(1) : pathSegments;

    if (searchSegments.length === 0) return null;

-   return findInChildren(frame, searchSegments, 0);
+   return findInChildren(root, searchSegments, 0);
  }
```

---

### 步骤 6：`src/sandbox/layout-engine.ts` — 布局引擎

#### 6.1 放宽 `layoutFrames` 签名

```diff
- export function layoutFrames(frames: FrameNode[], settings: LayoutSettings = DEFAULT_LAYOUT): void {
-   if (frames.length === 0) return;
+ export function layoutNodes(nodes: SceneNode[], settings: LayoutSettings = DEFAULT_LAYOUT): void {
+   if (nodes.length === 0) return;

-   const firstFrame = frames[0];
+   const firstNode = nodes[0] as SceneNode & DimensionAndPositionMixin;
-   const baseX = firstFrame.x;
+   const baseX = firstNode.x;
-   const baseY = firstFrame.y;
+   const baseY = firstNode.y;
-   const frameWidth = firstFrame.width;
+   const nodeWidth = firstNode.width;
-   const frameHeight = firstFrame.height;
+   const nodeHeight = firstNode.height;

-   for (let i = 0; i < frames.length; i++) {
-     const pos = calculatePosition(i, frameWidth, frameHeight, settings);
-     const node = frames[i] as SceneNode & DimensionAndPositionMixin;
+   for (let i = 0; i < nodes.length; i++) {
+     const pos = calculatePosition(i, nodeWidth, nodeHeight, settings);
+     const node = nodes[i] as SceneNode & DimensionAndPositionMixin;
      node.x = baseX + pos.x;
      node.y = baseY + pos.y;
    }
  }
```

---

### 步骤 7：`src/sandbox/message-handler.ts` — 消息处理

#### 7.1 更新 import

```diff
- import { cloneFrame } from './frame-cloner';
+ import { cloneNode } from './node-cloner';
- import { layoutFrames } from './layout-engine';
+ import { layoutNodes } from './layout-engine';
- import { DEFAULT_LAYOUT } from '../shared/constants';
+ import { DEFAULT_LAYOUT, TEMPLATE_NODE_TYPES } from '../shared/constants';
```

> 注意：第 7.1 步的导入变更中，`TEMPLATE_NODE_TYPES` 也在 `src/shared/types.ts` 中定义。需确认是从 `../shared/types` 还是 `../shared/constants` 导入。应直接从 `../shared/types` 导入。

**更正后：**

```diff
- import { cloneFrame } from './frame-cloner';
+ import { cloneNode } from './node-cloner';
- import { layoutFrames } from './layout-engine';
+ import { layoutNodes } from './layout-engine';
  import { DEFAULT_LAYOUT } from '../shared/constants';
```

在顶部已有导入行追加 `TEMPLATE_NODE_TYPES`：

```diff
  import type { SelectionInfo, SelectedNodeSummary, PlaceholderLayer, GenerationConfig, Issue, Warning } from '../shared/types';
+ import { TEMPLATE_NODE_TYPES } from '../shared/types';
```

#### 7.2 修改 `generatedFrames` 变量

```diff
  let cancelRequested = false;
- let generatedFrames: FrameNode[] = [];
+ let generatedNodes: SceneNode[] = [];
```

#### 7.3 修改 `buildSelectionInfo` 中的 `isFrame`

```diff
    for (const node of selection) {
      selectedNodes.push({
        id: node.id,
        name: node.name,
        type: node.type,
-       isFrame: node.type === 'FRAME',
+       isTemplate: TEMPLATE_NODE_TYPES.has(node.type),
      });
    }
```

#### 7.4 修改 `processSelection`

```diff
  function processSelection(): void {
    const selection = figma.currentPage.selection;
    const selectionInfo = buildSelectionInfo();

-   if (selection.length === 1 && selection[0].type === 'FRAME') {
-     const frame = selection[0] as FrameNode;
+   if (selection.length === 1 && TEMPLATE_NODE_TYPES.has(selection[0].type)) {
+     const templateNode = selection[0] as SceneNode;

-     if (frame.removed) {
+     if ('removed' in templateNode && templateNode.removed) {
        sendToUi({ type: 'selection-changed', payload: selectionInfo });
        return;
      }

-     if (frame.id === currentTemplateId && cachedLayers) {
+     if (templateNode.id === currentTemplateId && cachedLayers) {
        sendToUi({ type: 'selection-changed', payload: selectionInfo });
        sendToUi({
          type: 'template-layers',
          payload: {
-           nodeId: frame.id,
-           frameName: frame.name,
+           nodeId: templateNode.id,
+           templateName: templateNode.name,
            ...cachedLayers,
            totalLayers: cachedLayers.textLayers.length + cachedLayers.imageLayers.length,
          },
        });
        return;
      }

-     scanLayers(frame).then(layers => {
+     scanLayers(templateNode).then(layers => {
        cachedLayers = layers;
-       currentTemplateId = frame.id;
+       currentTemplateId = templateNode.id;

        sendToUi({ type: 'selection-changed', payload: selectionInfo });
        sendToUi({
          type: 'template-layers',
          payload: {
-           nodeId: frame.id,
-           frameName: frame.name,
+           nodeId: templateNode.id,
+           templateName: templateNode.name,
            ...layers,
            totalLayers: layers.textLayers.length + layers.imageLayers.length,
          },
        });
      }).catch(_e => {
        cachedLayers = null;
        sendToUi({ type: 'selection-changed', payload: selectionInfo });
        sendToUi({
          type: 'template-layers',
          payload: {
-           nodeId: frame.id,
-           frameName: frame.name,
+           nodeId: templateNode.id,
+           templateName: templateNode.name,
            textLayers: [],
            imageLayers: [],
            totalLayers: 0,
          },
        });
      });
    } else {
      // ... unchanged (cachedLayers = null; currentTemplateId = null; sendToUi)
    }
  }
```

#### 7.5 修改 `handleUiReady`

```diff
  function handleUiReady(): void {
    const selection = figma.currentPage.selection;
    sendToUi({ type: 'selection-changed', payload: buildSelectionInfo() });

-   if (selection.length === 1 && selection[0].type === 'FRAME') {
+   if (selection.length === 1 && TEMPLATE_NODE_TYPES.has(selection[0].type)) {
      processSelection();
    }
  }
```

#### 7.6 修改 `handleRequestSelectionInfo`

```diff
  function handleRequestSelectionInfo(): void {
    sendToUi({ type: 'selection-changed', payload: buildSelectionInfo() });
    const selection = figma.currentPage.selection;
-   if (selection.length === 1 && selection[0].type === 'FRAME') {
+   if (selection.length === 1 && TEMPLATE_NODE_TYPES.has(selection[0].type)) {
      processSelection();
    }
  }
```

#### 7.7 修改 `handleRequestTemplateLayers`

```diff
  async function handleRequestTemplateLayers(nodeId: string): Promise<void> {
    const node = await figma.getNodeByIdAsync(nodeId);
-   if (node && node.type === 'FRAME') {
+   if (node && TEMPLATE_NODE_TYPES.has(node.type)) {
      try {
-       const layers = await scanLayers(node as FrameNode);
+       const layers = await scanLayers(node as SceneNode);
        sendToUi({
          type: 'template-layers',
          payload: {
            nodeId: node.id,
-           frameName: node.name,
+           templateName: node.name,
            ...layers,
            totalLayers: layers.textLayers.length + layers.imageLayers.length,
          },
        });
      } catch (_e) {
        sendToUi({
          type: 'template-layers',
          payload: {
            nodeId,
-           frameName: '',
+           templateName: '',
            textLayers: [],
            imageLayers: [],
            totalLayers: 0,
          },
        });
      }
    }
  }
```

#### 7.8 修改 `handleStartGeneration`

```diff
  async function handleStartGeneration(config: GenerationConfig): Promise<void> {
    cancelRequested = false;
-   generatedFrames = [];
+   generatedNodes = [];

    const mappings = config.mapping.entries;
    const rows = config.sourceTable.rows;
    const layout = config.layout || DEFAULT_LAYOUT;

-   let templateFrame: FrameNode | null = null;
+   let templateNode: SceneNode | null = null;
    const selection = figma.currentPage.selection;
-   if (selection.length === 1 && selection[0].type === 'FRAME') {
-     templateFrame = selection[0] as FrameNode;
+   if (selection.length === 1 && TEMPLATE_NODE_TYPES.has(selection[0].type)) {
+     templateNode = selection[0] as SceneNode;
    } else {
      const node = await figma.getNodeByIdAsync(config.mapping.templateNodeId);
-     if (node && node.type === 'FRAME') {
-       templateFrame = node as FrameNode;
+     if (node && TEMPLATE_NODE_TYPES.has(node.type)) {
+       templateNode = node as SceneNode;
      }
    }

-   if (!templateFrame) {
+   if (!templateNode) {
      sendToUi({
        type: 'generation-error',
        payload: {
-         message: '模板 Frame 未找到',
+         message: '模板节点未找到',
          phase: 'cloning',
          rowIndex: -1,
-         detail: 'Template frame not found',
+         detail: 'Template node not found',
        },
      });
      return;
    }

-   await loadFonts(templateFrame);
+   // templateNode 必有 children（已通过 TEMPLATE_NODE_TYPES 类型检查保证）
+   await loadFonts(templateNode as SceneNode & ChildrenMixin);

    const allIssues: Issue[] = [];
    const allWarnings: Warning[] = [];
    const startTime = Date.now();

    for (let i = 0; i < rows.length; i++) {
      if (cancelRequested) {
        const resultPayload = {
-         successCount: generatedFrames.length,
+         successCount: generatedNodes.length,
          processedRows: i,
          totalRows: rows.length,
        };
        sendToUi({
          type: 'generation-cancelled',
          payload: resultPayload,
        });
        return;
      }

      try {
-       const clone = cloneFrame(templateFrame);
-       generatedFrames.push(clone);
+       const clone = cloneNode(templateNode);
+       generatedNodes.push(clone);

        if (mappings.length > 0) {
-         const { issues, warnings } = fillContent(clone, mappings, rows[i]);
+         const { issues, warnings } = fillContent(clone as SceneNode & ChildrenMixin, mappings, rows[i]);
          allIssues.push(...issues);
          allWarnings.push(...warnings);
        }

        if (config.nameColumn) {
          const cellValue = rows[i].cells[config.nameColumn];
          if (cellValue != null && String(cellValue).trim() !== '') {
            clone.name = String(cellValue).trim();
          }
        }

        // ... progress message unchanged
      } catch (err) {
        // ... error handling unchanged
      }
    }

-   layoutFrames(generatedFrames, layout);
+   layoutNodes(generatedNodes, layout);

    const endTime = Date.now();
    const result = {
-     successCount: generatedFrames.length,
+     successCount: generatedNodes.length,
      // ... unchanged
    };
    // ... unchanged
  }
```

---

### 步骤 8：`src/sandbox/main.ts` — 入口

#### 8.1 无需修改

入口文件仅引用 `messageHandler`，导入在 `message-handler.ts` 中更新。

---

### 步骤 9：`src/ui/message-handler.ts` — UI 端消息处理

#### 9.1 修改 callback 类型中的 `frameName`

```diff
  let onTemplateLayersReceived: ((payload: {
    nodeId: string;
-   frameName: string;
+   templateName: string;
    textLayers: PlaceholderLayer[];
    imageLayers: PlaceholderLayer[];
    totalLayers: number;
  }) => void) | null = null;
```

#### 9.2 修改 `handleSelectionChanged`

```diff
  function handleSelectionChanged(info: SelectionInfo): void {
    if (!info.hasSelection) {
      updateTemplateStatus('no-selection');
      clearLayerList();
      notifyTemplateReady(false);
      return;
    }

    if (info.selectionCount > 1) {
      updateTemplateStatus('multiple');
      clearLayerList();
      notifyTemplateReady(false);
      return;
    }

    const node = info.selectedNodes[0];
-   if (!node.isFrame) {
-     updateTemplateStatus('not-frame', node.type);
+   if (!node.isTemplate) {
+     updateTemplateStatus('not-template', node.type);
      clearLayerList();
      notifyTemplateReady(false);
      return;
    }
  }
```

#### 9.3 修改 `handleTemplateLayers`

```diff
  function handleTemplateLayers(payload: {
    nodeId: string;
-   frameName: string;
+   templateName: string;
    textLayers: PlaceholderLayer[];
    imageLayers: PlaceholderLayer[];
    totalLayers: number;
  }): void {
-   updateTemplateStatus('valid', payload.frameName);
+   updateTemplateStatus('valid', payload.templateName);

    // ... unchanged
  }
```

---

### 步骤 10：`src/ui/layer-list.ts` — 图层列表 UI

#### 10.1 修改状态文案

```diff
    switch (status) {
      case 'no-selection':
-       el.innerHTML = '<div class="status status-gray">请先在画布中选中一个模板 Frame</div>';
+       el.innerHTML = '<div class="status status-gray">请选择一个容器节点（Frame / 实例 / 群组）作为模板</div>';
        break;
      case 'multiple':
-       el.innerHTML = '<div class="status status-warning">请只选择一个 Frame 作为模板，当前选中了多个对象</div>';
+       el.innerHTML = '<div class="status status-warning">请只选择一个容器节点（Frame / 实例 / 群组）作为模板，当前选中了多个对象</div>';
        break;
-     case 'not-frame':
-       el.innerHTML = `<div class="status status-warning">请选择一个 Frame 作为模板，当前选中的是 ${detail || '非Frame对象'}</div>`;
+     case 'not-template':
+       el.innerHTML = `<div class="status status-warning">请选择一个容器节点（Frame / 实例 / 群组）作为模板，当前选中的是 ${detail || '不支持的类型'}</div>`;
        break;
      case 'valid':
        el.innerHTML = `<div class="status status-success">已选择模板：${detail || ''}</div>`;
        break;
      default:
        break;
    }
```

---

### 步骤 11：`src/shared/constants.ts` — 常量清理

#### 11.1 更新未使用但语义相关的常量

```diff
  export const ERROR_MESSAGES = {
    FILE_PARSE_ERROR: '文件解析失败，请检查文件格式',
-   NO_SELECTION: '请先在画布中选中一个模板 Frame',
-   MULTIPLE_SELECTION: '请只选择一个 Frame 作为模板，当前选中了多个对象',
-   NOT_A_FRAME: '请选择一个 Frame 作为模板，当前选中的是 {type}',
+   NO_SELECTION: '请选择一个容器节点（Frame / 实例 / 群组）作为模板',
+   MULTIPLE_SELECTION: '请只选择一个容器节点（Frame / 实例 / 群组）作为模板，当前选中了多个对象',
+   NOT_A_TEMPLATE: '请选择一个容器节点（Frame / 实例 / 群组）作为模板，当前选中的是 {type}',
  } as const;
```

---

### 步骤 12：`src/ui/app.ts` — 主控制器

#### 12.1 检查 `isFrame` 引用

在 `src/ui/app.ts` 中搜索 `isFrame`，如存在引用，改为 `isTemplate`。

（根据影响分析报告，`app.ts` 中 `currentTemplateId` 等已使用 "template" 命名，仅需检查是否直接引用了 `isFrame`）

---

### 步骤 13：构建脚本验证

#### 13.1 `scripts/build-sandbox.mjs`

入口仍为 `src/sandbox/main.ts`，无需修改。重命名的文件 (`frame-cloner.ts` → `node-cloner.ts`) 通过 `main.ts` → `message-handler.ts` 导入链自动处理。

---

## 变更文件总览

| # | 文件 | 改动范围 | 优先级 |
|---|------|---------|--------|
| 1 | `src/shared/types.ts` | 新增 TemplateNodeType、TEMPLATE_NODE_TYPES；isFrame → isTemplate | P0 |
| 2 | `src/shared/messages.ts` | frameName → templateName | P0 |
| 3 | `src/sandbox/layer-scanner.ts` | STOP_TYPES 移除 FRAME；签名放宽；frameId → rootId | P0 |
| 4 | `src/sandbox/frame-cloner.ts` → `node-cloner.ts` | 文件重命名 + 签名放宽 | P0 |
| 5 | `src/sandbox/content-filler.ts` | 三处函数签名放宽；ChildrenMixin cast | P0 |
| 6 | `src/sandbox/layout-engine.ts` | layoutFrames → layoutNodes；签名放宽 | P0 |
| 7 | `src/sandbox/message-handler.ts` | import 更新；类型检查放宽；变量重命名 | P0 |
| 8 | `src/sandbox/main.ts` | 不变（import 链由步骤7覆盖） | — |
| 9 | `src/ui/message-handler.ts` | isFrame → isTemplate；frameName → templateName | P0 |
| 10 | `src/ui/layer-list.ts` | 状态键 + 3处文案更新 | P0 |
| 11 | `src/shared/constants.ts` | 3处 ERROR_MESSAGES 文案更新 | P1 |
| 12 | `src/ui/app.ts` | 搜索确认 isFrame 引用（如有） | P1 |

---

## 验证步骤

```bash
# 1. 类型检查
npm run typecheck

# 2. 代码检查
npm run lint

# 3. 构建
npm run build
```
