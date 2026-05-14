# Task 03：模板选择与图层发现

---

## 1. 任务概述

| 属性 | 值 |
|------|-----|
| **任务编号** | Task-03 |
| **任务名称** | 模板选择与图层发现（Template Selection & Layer Discovery） |
| **优先级** | P0（核心路径） |
| **前置依赖** | Task-01（类型定义与消息协议基础设施） |
| **后续任务** | Task-04（字段映射 UI） |
| **负责上下文** | Sandbox 端（`code.ts`）+ UI 端（`ui.html`） |

### 1.1 任务简述

实现用户在 Figma 画布中选择模板 Frame 的完整交互链路：

1. **Sandbox 端**监听 `selectionchange` 事件，校验当前选中的对象是否为合法的模板 Frame；若合法，扫描 Frame 内的子孙文本层和图片层，将发现的占位图层列表发送给 UI。
2. **UI 端**接收 Sandbox 发回的信息，展示模板选择状态（未选择 / 无效选择 / 有效选择 / 无可用图层），并在模板有效时展示可被映射的图层清单。

### 1.2 插件架构上下文

```
┌─────────────────────────────────────────────────────┐
│                    Figma 沙盒环境                    │
│                   code.ts (Sandbox)                  │
│  ┌─────────────────────────────────────────────────┐│
│  │  figma.on('selectionchange')                     ││
│  │       ↓                                          ││
│  │  validateTemplateSelection()  → ValidationResult ││
│  │       ↓ (if valid)                               ││
│  │  scanFrameLayers()           → PlaceholderLayer[]││
│  │       ↓                                          ││
│  │  figma.ui.postMessage()      → UI                ││
│  └─────────────────────────────────────────────────┘│
│          ↕  postMessage 消息通道                     │
│  ┌─────────────────────────────────────────────────┐│
│  │  ui.html (UI iframe)                             ││
│  │       ↓                                          ││
│  │  模板状态指示器 + 图层列表展示                     ││
│  └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

---

## 2. 功能需求细节

### 2.1 FR-06：模板选择校验

#### 2.1.1 Figma 节点类型图谱

Figma Plugin API 中的主要节点类型及继承关系：

| 节点类型 | `node.type` 值 | 特征说明 | 能否作为模板？ |
|----------|---------------|----------|:---:|
| `FrameNode` | `'FRAME'` | 标准的 Frame 容器，可包含任意子节点 | ✅ 是 |
| `GroupNode` | `'GROUP'` | 分组节点，无独立尺寸约束 | ❌ 否 |
| `ComponentNode` | `'COMPONENT'` | 主组件定义 | ❌ 否（后续可扩展） |
| `ComponentSetNode` | `'COMPONENT_SET'` | 组件集（Variants 容器） | ❌ 否 |
| `InstanceNode` | `'INSTANCE'` | 组件实例 | ❌ 否 |
| `SectionNode` | `'SECTION'` | Figma 2023 新增的 Section 容器 | ❌ 否 |
| `TextNode` | `'TEXT'` | 文本层 | ❌ 否 |
| `RectangleNode` | `'RECTANGLE'` | 矩形 | ❌ 否 |
| `EllipseNode` | `'ELLIPSE'` | 椭圆 | ❌ 否 |
| `PolygonNode` | `'POLYGON'` | 多边形 | ❌ 否 |
| `LineNode` | `'LINE'` | 线条 | ❌ 否 |
| `VectorNode` | `'VECTOR'` | 矢量图形 | ❌ 否 |
| `StarNode` | `'STAR'` | 星形 | ❌ 否 |
| `BooleanOperationNode` | `'BOOLEAN_OPERATION'` | 布尔运算组合 | ❌ 否 |
| `SliceNode` | `'SLICE'` | 切片（导出用） | ❌ 否 |
| `StickyNode` | `'STICKY'` | 便利贴（FigJam） | ❌ 否 |
| `ShapeWithTextNode` | `'SHAPE_WITH_TEXT'` | 含文本的形状 | ❌ 否 |
| `ConnectorNode` | `'CONNECTOR'` | 连接线（FigJam） | ❌ 否 |
| `CodeBlockNode` | `'CODE_BLOCK'` | 代码块（FigJam） | ❌ 否 |
| `StampNode` | `'STAMP'` | 图章（FigJam） | ❌ 否 |
| `WidgetNode` | `'WIDGET'` | Widget 节点 | ❌ 否 |
| `EmbedNode` | `'EMBED'` | 嵌入内容 | ❌ 否 |
| `LinkUnfurlNode` | `'LINK_UNFURL'` | 链接展开 | ❌ 否 |
| `MediaNode` | `'MEDIA'` | 媒体节点 | ❌ 否 |
| `WashiTapeNode` | `'WASHI_TAPE'` | 胶带节点 | ❌ 否 |
| `TableNode` | `'TABLE'` | 表格节点（FigJam） | ❌ 否 |

**校验规则**：仅当 `node.type === 'FRAME'` 时，该节点被接受为模板。**任何其他类型均视为非法选择**，包括 Component 主组件（类型为 `COMPONENT`）和 Instance（类型为 `INSTANCE`）。

> **设计决策说明**：Component 主组件和 Instance 在 MVP 阶段不作为有效模板的原因：
> - Component 主组件内部结构被 Figma 保护，对其子节点的操作可能违反组件一致性
> - Instance 是组件的引用，其子节点操作受 override 机制限制
> - MVP 阶段保持简单，仅支持 `type === 'FRAME'`

#### 2.1.2 选中状态与 UI 响应

| 选中情况 | `selection.length` | `selection[0].type` | 校验结果 | UI 展示 |
|----------|:---:|----------|----------|--------|
| 未选中任何对象 | `0` | — | `no_selection` | 灰色提示"请在画布中选择一个模板 Frame" |
| 选中多个对象 | `> 1` | — | `multiple_selection` | 黄色警告"请仅选择一个 Frame 作为模板，当前选中了 N 个对象" |
| 选中 1 个非 Frame | `1` | `!= 'FRAME'` | `not_frame` | 黄色警告"请选择一个 Frame 作为模板，当前选中的是 {节点类型中文名}" |
| 选中 1 个 Frame | `1` | `'FRAME'` | `valid` | 绿色成功"已选择: {Frame名称}" |

#### 2.1.3 嵌套选中场景说明

当用户在 Figma 中**双击进入某个 Frame 内部**后，当前选中的对象是该 Frame 的某个子节点。此时 `figma.currentPage.selection` 返回的是子节点而非 Frame 本身。这是正常的 Figma 交互行为，插件无需特殊处理——它自然会表现为"未选中 Frame"或"选中了非 Frame 节点"。

若用户从嵌套选中状态退出（按 Escape 返回父级），Figma 会将选中恢复到父级 Frame，此时插件将重新检测到有效的 Frame 选择并更新 UI。

---

### 2.2 FR-07：图层扫描

#### 2.2.1 扫描目标

扫描模板 Frame 内的**所有子孙文本层**和**可承载图片填充的图形层**（统称为"占位层"），将其识别并列出供用户建立映射。

#### 2.2.2 扫描范围界定

| 规则 | 说明 |
|------|------|
| **入口** | 模板 Frame 自身（不包含 Frame 本身作为图层） |
| **包含** | 类型为 `TEXT` 的所有子孙节点 |
| **包含** | 类型为 `RECTANGLE`、`ELLIPSE`、`POLYGON`、`STAR`、`LINE` 的图形节点（作为潜在图片占位层） |
| **包含** | 类型为 `VECTOR`、`BOOLEAN_OPERATION` 的路径/形状节点（可能承载图片填充） |
| **包含** | 位于 Group 内的子节点（Group 本身穿透，继续扫描其内部） |
| **穿透** | `GROUP`、`BOOLEAN_OPERATION` 类型节点——继续递归扫描其子节点 |
| **停止** | 遇到嵌套 `FRAME` 时停止递归，**不进入**该 Frame 内部 |
| **停止** | 遇到 `COMPONENT` 节点时停止递归，不进入组件内部 |
| **停止** | 遇到 `COMPONENT_SET` 节点时停止递归，不进入组件集内部 |
| **停止** | 遇到 `INSTANCE` 节点时停止递归，不进入实例内部 |
| **停止** | 遇到 `SECTION` 节点时停止递归 |
| **跳过** | `visible = false` 的节点 |
| **跳过** | `locked = true` 的节点 |
| **跳过** | `SLICE`、`STICKY`、`SHAPE_WITH_TEXT`、`CONNECTOR`、`CODE_BLOCK`、`STAMP`、`WIDGET`、`EMBED`、`LINK_UNFURL`、`MEDIA`、`WASHI_TAPE`、`TABLE` 类型的节点——这些类型不承载文本或图片填充，直接跳过 |

#### 2.2.3 图层类型判定

**文本层**（layerType = `'text'`）：
- 条件：`node.type === 'TEXT'`
- 提取信息：`fontName`、`fontSize`、`fills`、`textAlignHorizontal`、`lineHeight`、`letterSpacing`、`characters`（当前文本内容）

**图片层**（layerType = `'image'`）：
- 条件：节点类型属于图形类（`RECTANGLE`、`ELLIPSE`、`POLYGON`、`STAR`、`LINE`、`VECTOR`、`BOOLEAN_OPERATION`）
- **且**该节点的 `fills` 数组中**至少存在一个 `type === 'IMAGE'` 的填充**（即有实际图片填充）
- 如果图形节点没有任何 `IMAGE` 类型的填充，它**仍然被列入图片占位层**（因为它"可以"承载图片），但在图层列表中标记为"当前无图片"

> **设计决策**：即使图形节点当前没有图片填充，也将其列为图片占位层。理由是用户可能希望后续将 Excel 中的图片填入这些位置。将判断权交给用户，而非插件替用户过滤。

#### 2.2.4 图层信息提取

对于每个被发现的图层，提取以下结构化信息：

```typescript
interface PlaceholderLayer {
  id: string;                 // figma node.id，用于后续操作时定位节点
  name: string;               // figma node.name，图层的原始名称
  type: 'text' | 'image';     // 图层类型
  path: string;               // 完整层级路径，用于区分同名图层
  // --- 文本层专属 ---
  currentText?: string;       // 当前文本内容（仅 type='text' 时有值）
  textStyles?: TextStyleInfo;  // 文本样式信息
  // --- 图片层专属 ---
  hasImageFill?: boolean;     // 当前是否已有图片填充（仅 type='image' 时有值）
  currentImageHash?: string;  // 当前图片的 hash，用于 UI 预览（有图片填充时）
}

interface TextStyleInfo {
  fontName: string;           // { family: string, style: string } 的序列化
  fontSize: number;
  fontWeight?: number;        // 如果字体变体可解析
  fills: string;              // fills 数组的 JSON 序列化（供 UI 展示颜色预览）
  textAlignHorizontal: string; // 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED'
  lineHeight: string;         // 行高信息序列化
  letterSpacing: string;      // 字间距信息序列化
}
```

#### 2.2.5 路径构建算法

路径用于在存在同名图层时提供唯一区分。构建方式：

```
路径格式：{模板Frame名} > {一级子节点名} > {二级子节点名} > ... > {当前节点名}
```

算法：
1. 从当前节点向上遍历 `parent` 链
2. 收集每个父节点的 `.name` 属性
3. **停止条件**：遇到 `parent.id === frame.id` 时停止（即到达模板 Frame 本身）
4. 将收集到的名称数组**逆序**（从 Frame 到当前节点），用 ` > ` 分隔符连接
5. 若某个父节点不是 Frame/Group 等容器节点，仍包含其名称（因为它是真实的层级关系）

**示例**：
```
模板Frame: "商品卡片"
  └─ Group: "内容区"
      ├─ TEXT: "Title"      → 路径："商品卡片 > 内容区 > Title"
      └─ RECTANGLE: "配图"   → 路径："商品卡片 > 内容区 > 配图"
```

#### 2.2.6 扫描结果汇总

扫描完成后，统计并发送给 UI：

```typescript
interface LayerScanResult {
  textLayers: PlaceholderLayer[];     // 所有文本占位层
  imageLayers: PlaceholderLayer[];    // 所有图片占位层
  totalCount: number;                 // 总计占位层数量
  textLayerCount: number;             // 文本层数量
  imageLayerCount: number;            // 图片层数量
}
```

---

### 2.3 FR-22：无可用图层处理

#### 2.3.1 触发条件

当模板 Frame 经过完整扫描后，`LayerScanResult.totalCount === 0`（即没有发现任何文本层或图片层）。

常见场景：
- 模板 Frame 内没有任何子节点（空 Frame）
- 模板 Frame 内的所有子节点都是嵌套 Frame（停止递归导致无有效图层）
- 模板 Frame 内只有 Section、Slice 等不可填充的节点类型
- 模板 Frame 内的所有图层都是不可见的（`visible = false`）
- 模板 Frame 内的所有图层都是锁定的（`locked = true`）

#### 2.3.2 UI 响应

- 图层列表区域显示空状态："模板中无可填充的文本或图片图层"
- 模板状态指示器切换为**红色错误状态**
- 禁用"生成"按钮（生成按钮在 Task-05 中实现，此处需预留禁用状态接口）
- `selection-changed` 消息中 `layerScanResult` 的 `totalCount` 为 0

---

## 3. 技术方案 — Sandbox 端

### 3.1 选择监听

#### 3.1.1 事件注册

```typescript
figma.on('selectionchange', () => {
  handleSelectionChange();
});
```

> 注：以上为伪代码示意。实际实现中应将回调提取为命名函数，便于后续解绑（若需要）。

#### 3.1.2 防抖策略

| 策略 | 描述 |
|------|------|
| **基本策略** | 使用 300ms 防抖（debounce）。当用户快速点击不同节点时，仅最后一次选择触发完整校验与扫描 |
| **实现** | 使用 `setTimeout` / `clearTimeout` 模式。每次 `selectionchange` 触发时重置计时器 |
| **即时策略** | 对于**取消选中**（`selection.length === 0`），**立即响应**（跳过防抖），使用户感受界面即刻反馈 |
| **节点 ID 缓存** | 防抖期间若节点 ID 未变化（选中同一节点），直接跳过（见 3.1.3） |

**防抖参数**：
- 延迟时间：`300ms`
- 该值权衡了响应速度与计算开销。300ms 通常足够让用户停止快速点击，同时不会让界面显得迟钝。

#### 3.1.3 节点 ID 缓存优化

在 Sandbox 端维护一个状态变量：

```typescript
let currentTemplateId: string | null = null;
let cachedLayerScanResult: LayerScanResult | null = null;
```

- 每次 `selectionchange` 触发后，先计算新的有效节点 ID
- 若新 ID 与 `currentTemplateId` 相同，**不重新扫描**，直接发送缓存结果
- 若不同，执行校验 → 扫描 → 更新缓存 → 发送结果
- 当选中无效/取消选中时，清除缓存（`null`）

#### 3.1.4 初始化行为

**场景1**：用户先选中 Frame，再打开插件
- 插件启动时（`figma.showUI` 调用后），**主动调用一次** `handleSelectionChange()`
- 检查 `figma.currentPage.selection`，若已有有效 Frame，立即扫描并发送结果给 UI
- 这确保用户"先选 Frame 后开插件"和"先开插件后选 Frame"两种工作流都得到正确处理

**场景2**：用户先打开插件，再选中 Frame
- `selectionchange` 事件自然触发，无需额外处理

### 3.2 选择校验逻辑

#### 3.2.1 校验函数签名

```typescript
function validateTemplateSelection(
  selection: readonly SceneNode[]
): ValidationResult
```

#### 3.2.2 ValidationResult 类型定义

```typescript
type ValidationResult = 
  | { valid: true; frame: FrameNode }
  | { valid: false; reason: 'no_selection' }
  | { valid: false; reason: 'multiple_selection'; count: number }
  | { valid: false; reason: 'not_frame'; nodeType: string; nodeName: string };
```

#### 3.2.3 校验步骤（精确流程）

```
validateTemplateSelection(selection):
  1. IF selection.length === 0:
       RETURN { valid: false, reason: 'no_selection' }
  
  2. IF selection.length > 1:
       RETURN { valid: false, reason: 'multiple_selection', count: selection.length }
  
  3. LET node = selection[0]
  
  4. IF node.type === 'FRAME':
       RETURN { valid: true, frame: node as FrameNode }
  
  5. ELSE:
       RETURN { 
         valid: false, 
         reason: 'not_frame', 
         nodeType: node.type, 
         nodeName: node.name 
       }
```

#### 3.2.4 边缘情况处理

| 边缘情况 | 处理方式 |
|----------|----------|
| `node.removed === true`（节点已被删除但在 selection 中残留） | 视为 `no_selection`，清除缓存 |
| `node.parent === null`（孤儿节点） | 该节点仍然可能为有效 Frame，不额外限制 |
| 选中的 Frame 本身在另一 Frame 内部（嵌套 Frame） | 仍然有效，扫描时正常处理其内部子节点 |
| 选中的 Frame 是 Section 的子节点 | 仍然有效，Section 仅仅是容器，不影响 Frame 的合法性 |

### 3.3 图层扫描算法

#### 3.3.1 扫描入口函数签名

```typescript
function scanFrameLayers(frame: FrameNode): LayerScanResult
```

#### 3.3.2 递归遍历函数签名

```typescript
function traverseNode(
  node: SceneNode, 
  frameId: string, 
  pathPrefix: string, 
  result: { textLayers: PlaceholderLayer[]; imageLayers: PlaceholderLayer[] }
): void
```

#### 3.3.3 递归终止条件（精确判定逻辑）

```
traverseNode(node, frameId, pathPrefix, result):

  ←─ 1. 【可见性检查】
      IF ('visible' in node && node.visible === false): RETURN
      （仅对有 visible 属性的节点检查；所有 SceneNode 子类均有此属性）
  
  ←─ 2. 【锁定检查】
      IF ('locked' in node && node.locked === true): RETURN
      （被锁定的图层不应被用户修改）
  
  ←─ 3. 【容器穿透 vs 停止递归】判定：
      
      SWITCH (node.type):
        CASE 'FRAME':
        CASE 'COMPONENT':
        CASE 'COMPONENT_SET':
        CASE 'INSTANCE':
        CASE 'SECTION':
          IF node.id !== frameId:
            RETURN  // 遇到子 Frame/组件/实例/Section，停止深入
          // 若 node.id === frameId，说明这是模板 Frame 自身，不允许跳过，继续穿透
          BREAK
        
        CASE 'GROUP':
        CASE 'BOOLEAN_OPERATION':
          // 分组和布尔运算不产生占位层，继续递归子节点
          BREAK
        
        CASE 'TEXT':
          // 收集文本层 → 跳转到步骤 4
          COLLECT_TEXT_LAYER(node, frameId, pathPrefix, result)
          RETURN  // 文本层无子节点，无需继续递归
        
        CASE 'RECTANGLE':
        CASE 'ELLIPSE':
        CASE 'POLYGON':
        CASE 'STAR':
        CASE 'LINE':
        CASE 'VECTOR':
          // 收集图片占位层 → 跳转到步骤 5
          COLLECT_IMAGE_LAYER(node, frameId, pathPrefix, result)
          RETURN  // 图形节点无子节点，无需继续递归
        
        DEFAULT:
          RETURN  // SLICE, STICKY, SHAPE_WITH_TEXT, CONNECTOR 等类型直接跳过
  
  ←─ 4. 【递归子节点】
      IF ('children' in node):
        FOR EACH child IN (node as ChildrenMixin).children:
          traverseNode(child, frameId, pathPrefix, result)
```

#### 3.3.4 文本层收集

```
COLLECT_TEXT_LAYER(node, frameId, pathPrefix, result):
  LET textNode = node as TextNode
  LET fullPath = buildPath(textNode, frameId)
  
  LET layer: PlaceholderLayer = {
    id: textNode.id,
    name: textNode.name,
    type: 'text',
    path: fullPath,
    currentText: textNode.characters,
    textStyles: {
      fontName: JSON.stringify(textNode.fontName),
      fontSize: textNode.fontSize,
      fills: JSON.stringify(textNode.fills),
      textAlignHorizontal: textNode.textAlignHorizontal,
      lineHeight: JSON.stringify(textNode.lineHeight),
      letterSpacing: JSON.stringify(textNode.letterSpacing)
    }
  }
  
  result.textLayers.push(layer)
```

**关于 `fontName` 类型**：
- `textNode.fontName` 类型为 `FontName | PluginAPI['mixed']`
- 当文本层内包含多种字体时，`fontName === figma.mixed`（Symbol 值）
- 此时 `fontName` 无法直接读取，应在 `textStyles` 中标记为 `"mixed"` 字符串
- MVP 阶段：若遇到 `figma.mixed`，`fontName` 序列化为 `"多种字体"` 文本，不做进一步拆分
- 其他属性同理（`fontSize`、`fills`、`textAlignHorizontal`、`lineHeight`、`letterSpacing`）

#### 3.3.5 图片层收集

```
COLLECT_IMAGE_LAYER(node, frameId, pathPrefix, result):
  LET fullPath = buildPath(node, frameId)
  
  // 检查是否存在 IMAGE 类型的填充
  LET imageFills = []
  IF ('fills' in node):
    FOR EACH fill IN (node as GeometryMixin).fills:
      IF fill.type === 'IMAGE' AND fill.visible !== false:
        imageFills.push(fill)
  
  LET layer: PlaceholderLayer = {
    id: node.id,
    name: node.name,
    type: 'image',
    path: fullPath,
    hasImageFill: imageFills.length > 0,
    currentImageHash: imageFills.length > 0 ? imageFills[0].imageHash : undefined
  }
  
  result.imageLayers.push(layer)
```

**关于 `fills` 类型**：
- 仅 `GeometryMixin` 的子类有 `fills` 属性
- `RECTANGLE`、`ELLIPSE`、`POLYGON`、`STAR`、`LINE`、`VECTOR`、`BOOLEAN_OPERATION` 均有此属性
- `TextNode` 也有 `fills`，但文本层单独处理，不走图片收集逻辑
- 需检查 fill 的 `visible` 属性：`visible === false` 的图片填充不计入 `imageFills`

#### 3.3.6 路径构建

```
buildPath(node, frameId):
  LET parts = []
  LET current = node
  
  WHILE current !== null AND current.id !== frameId:
    parts.unshift(current.name)
    current = current.parent
  
  // 加入模板 Frame 本身的名称作为路径根
  parts.unshift(获取 Frame 名称(frameId))
  
  RETURN parts.join(' > ')
```

**路径示例**：
- 直接子节点：`"商品卡片 > 标题"`
- 两级嵌套 Group：`"商品卡片 > 内容区 > 文本组 > 标题"`
- 模板 Frame 本身不产生占位层，因此路径始终至少包含 Frame 名 + 一层子节点名

---

## 4. 技术方案 — UI 端

### 4.1 模板状态指示器

#### 4.1.1 状态枚举

```typescript
type TemplateStatus = 
  | 'no-selection'    // 未选择
  | 'invalid'         // 选择无效（多选或类型不对）
  | 'valid'           // 选择有效
  | 'no-layers';      // 选择有效但无可填充图层
```

#### 4.1.2 各状态 UI 呈现

**状态一：`no-selection` — 未选择模板**

```
┌──────────────────────────────────────────┐
│  📋 模板选择                              │
│  ┌──────────────────────────────────────┐│
│  │  ⬜ 请在画布中选择一个模板 Frame       ││
│  └──────────────────────────────────────┘│
│                                          │
│  图层列表                                │
│  ┌──────────────────────────────────────┐│
│  │  （选择模板后将自动显示可填充图层）    ││
│  └──────────────────────────────────────┘│
└──────────────────────────────────────────┘
```

- 背景色：浅灰 `#F3F3F3`
- 文字色：灰 `#8C8C8C`
- 图标：无勾选框（空心或虚线框）

**状态二：`invalid` — 选择无效**

```
┌──────────────────────────────────────────┐
│  📋 模板选择                              │
│  ┌──────────────────────────────────────┐│
│  │  ⚠️ 请选择一个 Frame 作为模板，       ││
│  │     当前选中的是 Group               ││
│  └──────────────────────────────────────┘│
```

或者（多选）：

```
│  ┌──────────────────────────────────────┐│
│  │  ⚠️ 请仅选择一个 Frame 作为模板，     ││
│  │     当前选中了 3 个对象              ││
│  └──────────────────────────────────────┘│
```

- 背景色：浅黄 `#FFF8E1`
- 左边框：黄色 `#FFC107`
- 文字色：深棕 `#795548`

**状态三：`valid` — 选择有效**

```
┌──────────────────────────────────────────┐
│  📋 模板选择                              │
│  ┌──────────────────────────────────────┐│
│  │  ✅ 已选择：商品卡片                  ││
│  └──────────────────────────────────────┘│
│                                          │
│  图层列表                                │
│  ┌──────────────────────────────────────┐│
│  │  文本层 (3)                           ││
│  │  ┌──────────────────────────────────┐││
│  │  │ T  标题                          │││
│  │  │    商品卡片 > 标题               │││
│  │  │    「新品上市」                   │││
│  │  ├──────────────────────────────────┤││
│  │  │ T  副标题                        │││
│  │  │    商品卡片 > 副标题             │││
│  │  │    「限时优惠」                   │││
│  │  ├──────────────────────────────────┤││
│  │  │ T  描述                          │││
│  │  │    商品卡片 > 描述               │││
│  │  │    「产品描述文本...」            │││
│  │  └──────────────────────────────────┘││
│  │                                       ││
│  │  图片层 (2)                           ││
│  │  ┌──────────────────────────────────┐││
│  │  │ 🖼  商品图                        │││
│  │  │    商品卡片 > 商品图             │││
│  │  │    [当前有图片]                   │││
│  │  ├──────────────────────────────────┤││
│  │  │ 🖼  角标                          │││
│  │  │    商品卡片 > 角标               │││
│  │  │    [暂无图片]                     │││
│  │  └──────────────────────────────────┘││
│  └──────────────────────────────────────┘│
└──────────────────────────────────────────┘
```

- 背景色：浅绿 `#E8F5E9`
- 左边框：绿色 `#4CAF50`
- 文字色：深绿 `#2E7D32`

**状态四：`no-layers` — 无可用图层**

```
┌──────────────────────────────────────────┐
│  📋 模板选择                              │
│  ┌──────────────────────────────────────┐│
│  │  ❌ 模板中无可填充的文本或图片图层    ││
│  │     已选择：商品卡片                  ││
│  └──────────────────────────────────────┘│
```

- 背景色：浅红 `#FFEBEE`
- 左边框：红色 `#F44336`
- 文字色：深红 `#C62828`

#### 4.1.3 图层列表项设计

每个图层列表项的展示信息（紧凑一行或两行布局）：

```
┌──────────────────────────────────────────┐
│  [类型图标]  图层名称                     │
│              路径面包屑                   │
│              内容预览片段                 │
└──────────────────────────────────────────┘
```

- **类型图标**：
  - 文本层：`T` 字母标记或文本图标
  - 图片层：`🖼` 或图片图标（不使用 emoji 则在 CSS 中绘制）
- **图层名称**：直接显示 `layer.name`
- **路径面包屑**：显示 `layer.path`，使用较浅的颜色和较小字号
- **内容预览片段**：
  - 文本层：截取 `currentText` 前 30 个字符 + `"…"`
  - 图片层（有图片）：显示 `[当前有图片]`
  - 图片层（无图片）：显示 `[暂无图片]`（灰色）

### 4.2 消息接收与状态更新

UI 端需要注册 `window.onmessage` 监听来自 Sandbox 的消息：

```typescript
window.onmessage = (event: MessageEvent) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;
  
  switch (msg.type) {
    case 'selection-changed':
      handleSelectionChanged(msg.payload);
      break;
    case 'template-layers':
      handleTemplateLayers(msg.payload);
      break;
  }
};
```

#### 4.2.1 selection-changed 处理

```
handleSelectionChanged(payload):
  SWITCH (payload.status):
    CASE 'no-selection':
      更新状态指示器 → no-selection
      清空图层列表
      禁用生成按钮
    
    CASE 'invalid':
      更新状态指示器 → invalid
      显示具体错误信息（payload.message）
      清空图层列表
      禁用生成按钮
    
    CASE 'valid':
      IF payload.layerScanResult.totalCount === 0:
        更新状态指示器 → no-layers
        图层列表显示空状态
        禁用生成按钮
      ELSE:
        更新状态指示器 → valid
        渲染图层列表（来自 payload.layerScanResult）
        生成按钮恢复可用（前提是数据源也已就绪，由 Task-05 统一判定）
```

### 4.3 UI 初始化行为

UI iframe 加载完成后：

1. **主动请求**当前选中状态：向 Sandbox 发送 `request-selection-info` 消息
2. 这是为了处理"先选 Frame，后打开插件"的场景
3. Sandbox 收到此消息后，立即调用校验 + 扫描，并通过 `selection-changed` 消息返回结果

```typescript
// UI 初始化时
window.addEventListener('DOMContentLoaded', () => {
  parent.postMessage({ pluginMessage: { type: 'request-selection-info' } }, '*');
});
```

---

## 5. 消息协议

### 5.1 消息一览

| 方向 | 消息类型 | 用途 |
|:---:|----------|------|
| UI → Sandbox | `request-selection-info` | UI 初始化时请求当前选中状态 |
| Sandbox → UI | `selection-changed` | 选择变化（或 UI 请求后）返回校验与扫描结果 |

### 5.2 UI → Sandbox：request-selection-info

```typescript
{
  type: 'request-selection-info'
}
```

无 payload。Sandbox 收到后应立即执行选择校验 + 图层扫描（如果有有效选择），并通过 `selection-changed` 返回结果。

### 5.3 Sandbox → UI：selection-changed

```typescript
{
  type: 'selection-changed';
  payload: {
    status: 'no-selection' | 'invalid' | 'valid';
    
    // 仅在 status = 'invalid' 时存在
    message?: string;                // 面向用户的中文提示消息
    nodeType?: string;               // 选中节点的 type 值（如 'GROUP'）
    
    // 仅在 status = 'valid' 时存在
    nodeName?: string;               // 模板 Frame 名称
    nodeId?: string;                 // 模板 Frame ID
    layerScanResult?: LayerScanResult;
  }
}
```

#### 5.3.1 payload 字段精确说明

**status = `'no-selection'`**：
```json
{
  "status": "no-selection"
}
```

**status = `'invalid'`**：
```json
{
  "status": "invalid",
  "message": "请选择一个 Frame 作为模板，当前选中的是 Group",
  "nodeType": "GROUP"
}
```
或（多选）：
```json
{
  "status": "invalid",
  "message": "请仅选择一个 Frame 作为模板，当前选中了 3 个对象"
}
```

**status = `'valid'`**：
```json
{
  "status": "valid",
  "nodeName": "商品卡片",
  "nodeId": "123:456",
  "layerScanResult": {
    "textLayers": [ /* PlaceholderLayer[] */ ],
    "imageLayers": [ /* PlaceholderLayer[] */ ],
    "totalCount": 5,
    "textLayerCount": 3,
    "imageLayerCount": 2
  }
}
```

#### 5.3.2 message 字段构造规则

| 校验失败原因 | message 模板 |
|-------------|-------------|
| `no_selection` | 不需要 message（UI 直接用固定文案） |
| `multiple_selection` | `"请仅选择一个 Frame 作为模板，当前选中了 {count} 个对象"` |
| `not_frame` | `"请选择一个 Frame 作为模板，当前选中的是 {nodeType中文名}"` |

**节点类型中文名映射表**（Sandbox 端实现时维护）：

| `node.type` | 中文名 |
|-------------|--------|
| `GROUP` | 分组（Group） |
| `COMPONENT` | 主组件（Component） |
| `COMPONENT_SET` | 组件集（Component Set） |
| `INSTANCE` | 组件实例（Instance） |
| `SECTION` | 区域（Section） |
| `TEXT` | 文本 |
| `RECTANGLE` | 矩形 |
| `ELLIPSE` | 椭圆 |
| `POLYGON` | 多边形 |
| `STAR` | 星形 |
| `LINE` | 线条 |
| `VECTOR` | 矢量图形 |
| `BOOLEAN_OPERATION` | 布尔运算 |
| `SLICE` | 切片 |
| _其他_ | 直接显示原始 `type` 值 |

### 5.4 数据流向图

```
时间线:

T1: 用户打开插件
    UI → Sandbox: { type: 'request-selection-info' }
    
T2: Sandbox 收到请求
    Sandbox: validate + scan
    Sandbox → UI: { type: 'selection-changed', payload: {...} }
    
T3: 用户在画布中点击一个 Group
    Sandbox: selectionchange 触发 → 防抖 300ms → validate
    Sandbox → UI: { type: 'selection-changed', payload: { status: 'invalid', ... } }
    
T4: 用户再点击一个 Frame
    Sandbox: selectionchange 触发 → 防抖 300ms → validate → scan
    Sandbox → UI: { type: 'selection-changed', payload: { status: 'valid', ... } }
    
T5: 用户按 Escape 取消选中
    Sandbox: selectionchange 触发 → 立即响应（跳过防抖）
    Sandbox → UI: { type: 'selection-changed', payload: { status: 'no-selection' } }
```

---

## 6. 错误处理与边界情况

### 6.1 边界情况表

| 编号 | 场景 | 处理方式 |
|:---:|------|----------|
| B-01 | 用户选中 Frame → 打开插件 → 取消选中 Frame | 触发 `selectionchange`，UI 更新为 `no-selection` 状态 |
| B-02 | 用户选中 Frame → 打开插件 → 插件打开期间选中另一个 Frame | 300ms 防抖后重新校验 + 扫描，更新 UI |
| B-03 | 选中的 Frame 在另一个 Frame 内部（嵌套 Frame） | 模板 Frame 本身仍为有效 Frame，正常扫描。嵌套的父 Frame 不影响扫描 |
| B-04 | 选中的 Frame 有 1000+ 个子节点 | 正常递归扫描。性能见第 7 章 |
| B-05 | 选中的 Frame 有 0 个子节点 | 校验通过（valid），但 `layerScanResult.totalCount === 0`，UI 显示 `no-layers` |
| B-06 | 选中的 Frame 内所有子节点都是嵌套 Frame | 停止递归 → 无可扫描内容 → `totalCount === 0` |
| B-07 | 选中的 Frame 内有 Component 实例 | Component 实例自身的子节点**不被扫描**（停止于 Component 边界），但实例之外的 Group/Frame 内的节点正常扫描 |
| B-08 | 选中的 Frame 是 Component Set 的变体 Frame | 该变体 Frame 的 `type` 仍为 `FRAME`，校验通过。但其内部结构受组件保护，操作时需注意——MVP 不做特殊处理 |
| B-09 | 图层名中包含 `>` 字符 | 路径分隔符使用 ` > `（前后带空格），图层名中的 `>` 不会导致解析歧义 |
| B-10 | 两个图层在不同层级但名称相同 | 通过完整路径区分，路径提供唯一标识 |
| B-11 | 文本层包含混合字体（`fontName === figma.mixed`） | 在 `textStyles.fontName` 中标记为 `"多种字体"` |
| B-12 | 文本层包含混合字号（`fontSize === figma.mixed`） | 在样式中标记为 `"mixed"` |
| B-13 | 文本层包含混合颜色（`fills === figma.mixed`） | 在样式中标记为 `"mixed"` |
| B-14 | 图片节点有多个 Image fill | 仅记录第一个 `visible !== false` 的 Image fill 的 hash |
| B-15 | 插件打开时 Figma 页面中没有任何 Frame | 自然的 `no-selection` 状态，除非用户手动创建一个 Frame 并选中 |
| B-16 | 用户快速连续点击多个节点 | 300ms 防抖确保仅最后一次选择生效 |
| B-17 | 节点在扫描过程中被删除 | 遍历期间不会动态变化（Figma 插件 API 是同步的），但若前后两次扫描间发生变化，由缓存失效机制处理 |

### 6.2 异常保护

```typescript
function safeScanFrameLayers(frame: FrameNode): LayerScanResult {
  try {
    return scanFrameLayers(frame);
  } catch (error) {
    console.error('[Template Discovery] Layer scan failed:', error);
    return {
      textLayers: [],
      imageLayers: [],
      totalCount: 0,
      textLayerCount: 0,
      imageLayerCount: 0
    };
  }
}
```

- 扫描失败（如节点类型不支持、意外的 API 行为）不应导致插件崩溃
- 捕获异常后返回空结果，通过 `selection-changed` 通知 UI
- UI 收到 `totalCount === 0` 时显示 `no-layers` 状态
- 同时可通过 `console.error` 输出调试信息，便于开发者排查

---

## 7. 性能考虑

### 7.1 扫描复杂度分析

| 操作 | 时间复杂度 | 说明 |
|------|:---:|------|
| 校验选择 | O(1) | 仅检查 `selection.length` 和 `selection[0].type` |
| 图层扫描 | O(n) | n = Frame 内所有子孙节点数（不穿透嵌套 Frame） |
| 路径构建 | O(d) | d = 节点深度（通常 < 10） |
| 消息传递 | O(k) | k = 发现的图层数（受结构化克隆序列化成本影响） |

### 7.2 缓存策略

```
缓存键：selectedNodeId
缓存值：{ 
  layerScanResult: LayerScanResult, 
  timestamp: number,
  nodeName: string 
}
```

| 条件 | 行为 |
|------|------|
| 选中节点 ID 与缓存键相同 | 直接使用缓存结果，不重新扫描 |
| 选中节点 ID 与缓存键不同 | 执行新扫描，更新缓存 |
| 取消选中 | 清空缓存 |
| 选中无效节点 | 清空缓存 |

### 7.3 防抖实现伪代码

```
LET debounceTimer: number | null = null
LET currentCacheKey: string | null = null

ON selectionchange:
  LET selection = figma.currentPage.selection
  
  IF selection.length === 0:
    CLEAR_TIMER(debounceTimer)
    debounceTimer = null
    currentCacheKey = null
    SEND { status: 'no-selection' }
    RETURN
  
  LET nodeId = selection[0].id
  
  IF nodeId === currentCacheKey AND debounceTimer !== null:
    RETURN  // 同一节点，无需处理
  
  CLEAR_TIMER(debounceTimer)
  
  debounceTimer = SET_TIMEOUT(300ms, () => {
    debounceTimer = null
    PROCESS_SELECTION()
  })
```

### 7.4 大规模场景性能预期

| 场景 | 预计耗时 | 说明 |
|------|:---:|------|
| 简单 Frame（10 个节点） | < 1ms | 即时响应 |
| 中等 Frame（100 个节点） | 1–2ms | 几乎无感知 |
| 复杂 Frame（500 个节点） | 5–10ms | 300ms 防抖内完成 |
| 超大 Frame（2000+ 个节点） | 20–50ms | 300ms 防抖内完成 |
| 极深嵌套（深度 > 20） | 依赖节点总数 | 深度本身不影响性能，关键在节点总数 |

> 上述预估基于典型的 Figma 插件 API 性能表现。实际性能受 Figma 文档状态、节点属性复杂度等因素影响。

---

## 8. 验收标准

### 8.1 测试用例

#### TC-01：选中单个 Frame → 模板有效

```
前置条件：画布中存在一个名为"商品卡片"的 Frame
测试步骤：
  1. 打开插件面板
  2. 在画布中单击选中"商品卡片" Frame
预期结果：
  - UI 状态指示器显示绿色"已选择：商品卡片"
  - 图层列表显示该 Frame 内的文本层和图片层
```

#### TC-02：未选中任何对象 → 提示选择模板

```
前置条件：画布中存在 Frame，但用户未选中任何对象
测试步骤：
  1. 点击画布空白区域（取消所有选择）
  2. 打开插件面板
预期结果：
  - UI 状态指示器显示灰色"请在画布中选择一个模板 Frame"
  - 图层列表为空
```

#### TC-03：选中多个对象 → 提示仅选择一个

```
前置条件：画布中存在多个 Frame
测试步骤：
  1. 按住 Shift，同时选中两个 Frame
预期结果：
  - UI 状态指示器显示黄色警告"请仅选择一个 Frame 作为模板，当前选中了 2 个对象"
```

#### TC-04：选中 Group → 提示类型错误

```
前置条件：画布中存在一个 Group
测试步骤：
  1. 选中该 Group
预期结果：
  - UI 状态指示器显示黄色警告"请选择一个 Frame 作为模板，当前选中的是 分组（Group）"
```

#### TC-05：选中 Component Instance → 提示不是 Frame

```
前置条件：画布中存在一个 Component 的 Instance
测试步骤：
  1. 选中该 Instance
预期结果：
  - UI 状态指示器显示黄色警告"请选择一个 Frame 作为模板，当前选中的是 组件实例（Instance）"
```

#### TC-06：选中 Component 主组件 → 提示不是 Frame

```
前置条件：画布中存在一个 Component 主组件
测试步骤：
  1. 选中该 Component 主组件
预期结果：
  - UI 状态指示器显示黄色警告"请选择一个 Frame 作为模板，当前选中的是 主组件（Component）"
```

#### TC-07：选中包含嵌套 Frame 的模板 → 仅扫描顶层

```
前置条件：
  - 画布中存在 Frame "A"
  - "A" 内有 TEXT "标题1"、RECTANGLE "图片1"
  - "A" 内还有子 Frame "B"
  - "B" 内有 TEXT "标题2"
测试步骤：
  1. 选中 Frame "A"
预期结果：
  - 图层列表显示"标题1"和"图片1"（位于 Frame A 下）
  - 图层列表**不显示**"标题2"（位于嵌套 Frame B 内）
  - 文本层数量 = 1，图片层数量 = 1
```

#### TC-08：选中空 Frame → 无可用图层

```
前置条件：画布中存在一个空 Frame（无任何子节点）
测试步骤：
  1. 选中该空 Frame
预期结果：
  - UI 状态指示器显示红色"模板中无可填充的文本或图片图层"
  - 图层列表显示空状态
  - 生成按钮禁用
```

#### TC-09：取消选中 → 回到未选择状态

```
前置条件：插件面板打开，当前选中的是一个有效 Frame
测试步骤：
  1. 点击画布空白区域取消选择
预期结果：
  - UI 立即更新（无延迟）
  - 状态指示器显示灰色"请在画布中选择一个模板 Frame"
  - 图层列表清空
```

#### TC-10：先选 Frame 后开插件 → 自动识别

```
前置条件：用户在打开插件之前已选中一个有效 Frame
测试步骤：
  1. 用户先在画布中选中 Frame "商品卡片"
  2. 再打开插件面板
预期结果：
  - 插件打开后立即显示绿色"已选择：商品卡片"
  - 图层列表已加载
  - 不需要用户重新选择
```

#### TC-11：模板 Frame 内所有图层被锁定 → 无可用图层

```
前置条件：Frame "A" 内有两个 TEXT 层，均被锁定（locked = true）
测试步骤：
  1. 选中 Frame "A"
预期结果：
  - 锁定的图层被跳过
  - layerScanResult.totalCount === 0
  - UI 显示红色"模板中无可填充的文本或图片图层"
```

#### TC-12：模板 Frame 内所有图层隐藏 → 无可用图层

```
前置条件：Frame "A" 内有两个 TEXT 层，均被隐藏（visible = false）
测试步骤：
  1. 选中 Frame "A"
预期结果：
  - 隐藏的图层被跳过
  - layerScanResult.totalCount === 0
```

#### TC-13：图片占位层无图片填充 → 仍列入列表

```
前置条件：Frame 内有一个 RECTANGLE（纯色填充，无图片填充）
测试步骤：
  1. 选中该 Frame
预期结果：
  - 该 RECTANGLE 出现在图片层列表中
  - 标记为"[暂无图片]"
```

#### TC-14：同名图层在不同层级 → 路径区分

```
前置条件：
  - Frame 内 Group "A" 下有 TEXT "标题"
  - Frame 内 Group "B" 下也有 TEXT "标题"
测试步骤：
  1. 选中该 Frame
预期结果：
  - 两个文本层都出现在列表中
  - 路径分别为 "Frame名 > A > 标题" 和 "Frame名 > B > 标题"
```

#### TC-15：快速切换选中 → 仅最后选择生效

```
前置条件：画布中有多个不同类型节点
测试步骤：
  1. 快速连续点击：Frame A → Rectangle → Frame B → Group → Frame C
  2. 每次点击间隔 < 300ms
预期结果：
  - UI 仅在停止点击 300ms 后更新一次，显示 Frame C 的扫描结果
  - 中间的 Rectangle、Group 等选择不触发 UI 更新
```

---

## 9. UI 布局示意

### 9.1 整体插件面板布局（本 Task 涉及的区域）

```
┌──────────────────────────────────────────┐
│  📊 批量填充模板生成器                    │  ← 面板标题
│──────────────────────────────────────────│
│                                          │
│  ┌─ 📋 模板选择 ──────────────────────┐  │  ← Task-03 区域
│  │  ┌────────────────────────────────┐ │  │
│  │  │ 状态指示器（模板选择状态）      │ │  │
│  │  └────────────────────────────────┘ │  │
│  │                                      │  │
│  │  📑 文本层 (3)                       │  │  ← 图层列表
│  │  ┌────────────────────────────────┐ │  │
│  │  │ T 标题    商品卡片 > 标题       │ │  │
│  │  │   「新品上市」                  │ │  │
│  │  ├────────────────────────────────┤ │  │
│  │  │ T 副标题  商品卡片 > 副标题     │ │  │
│  │  │   「限时优惠」                  │ │  │
│  │  ├────────────────────────────────┤ │  │
│  │  │ T 描述    商品卡片 > 描述       │ │  │
│  │  │   「产品描述文本示例...」        │ │  │
│  │  └────────────────────────────────┘ │  │
│  │                                      │  │
│  │  🖼 图片层 (2)                       │  │
│  │  ┌────────────────────────────────┐ │  │
│  │  │ 🖼 商品图  商品卡片 > 商品图     │ │  │
│  │  │   [当前有图片]                  │ │  │
│  │  ├────────────────────────────────┤ │  │
│  │  │ 🖼 角标    商品卡片 > 角标       │ │  │
│  │  │   [暂无图片]                    │ │  │
│  │  └────────────────────────────────┘ │  │
│  └──────────────────────────────────────┘  │
│                                          │
│  ┌─ 📁 数据源 ────────────────────────┐  │  ← Task-02 区域
│  │  （文件上传 / 数据预览）            │  │
│  └──────────────────────────────────────┘  │
│                                          │
│  ┌─ 🔗 字段映射 ──────────────────────┐  │  ← Task-04 区域
│  │  （列 → 图层映射 UI）               │  │
│  └──────────────────────────────────────┘  │
│                                          │
│  ┌──────────────────────────────────────┐  │
│  │         [ 批量生成 ]                  │  │  ← Task-05 区域
│  └──────────────────────────────────────┘  │
│                                          │
└──────────────────────────────────────────┘
```

### 9.2 图层列表项详细布局

```
┌──────────────────────────────────────────┐
│  ┌──┐                                    │
│  │T │ 图层名称（粗体，13px）              │
│  └──┘  路径面包屑（灰色，11px）           │
│         预览片段（浅灰，11px，斜体）      │
│──────────────────────────────────────────│
│  ┌──┐                                    │
│  │🖼│ 图层名称（粗体，13px）              │
│  └──┘  路径面包屑（灰色，11px）           │
│         图片状态标记（灰色，11px）        │
└──────────────────────────────────────────┘
```

- 每个列表项可点击（后续 Task-04 用于选择映射目标）
- 鼠标悬停时高亮背景
- 长图层名称超出宽度时使用省略号截断（`text-overflow: ellipsis`）

---

## 10. 产出文件清单

### 10.1 需修改的文件

| 文件 | 修改内容 |
|------|----------|
| `code.ts` | 完整重写：实现选择监听、校验逻辑、图层扫描算法、消息发送 |
| `ui.html` | 完整重写：实现模板状态指示器、图层列表展示、消息接收与处理 |

### 10.2 code.ts 中的函数/模块划分

```
code.ts
├── 选择监听模块
│   ├── handleSelectionChange()          // selectionchange 回调
│   ├── debounce timer management        // 防抖计时器
│   └── sendSelectionInfo()              // 发送 selection-changed 消息给 UI
│
├── 校验模块
│   ├── validateTemplateSelection()      // 选择校验（返回 ValidationResult）
│   └── getNodeTypeChineseName()         // 节点类型 → 中文名映射
│
├── 扫描模块
│   ├── scanFrameLayers()                // 扫描入口
│   ├── traverseNode()                   // 递归遍历
│   ├── collectTextLayer()               // 收集文本层
│   ├── collectImageLayer()              // 收集图片层
│   ├── buildPath()                      // 构建层级路径
│   ├── isImageNodeType()                // 判断是否为图片占位节点类型
│   └── getImageFills()                  // 提取节点的 Image fills
│
├── 缓存模块
│   ├── currentTemplateId                // 当前缓存节点 ID
│   └── cachedLayerScanResult            // 缓存的扫描结果
│
└── 消息处理模块
    └── figma.ui.onmessage handler        // 处理 UI 发来的消息
```

### 10.3 ui.html 中的模块划分

```
ui.html
├── 模板状态指示器
│   ├── 状态枚举常量
│   ├── renderTemplateStatus()           // 根据 status 渲染指示器
│   └── 状态样式管理（CSS class 切换）
│
├── 图层列表
│   ├── renderLayerList()                // 渲染整体图层列表
│   ├── renderTextLayerGroup()           // 渲染文本层分组
│   ├── renderImageLayerGroup()          // 渲染图片层分组
│   ├── renderLayerItem()                // 渲染单个图层项
│   └── renderEmptyState()               // 渲染空状态
│
├── 消息处理
│   ├── window.onmessage handler          // 接收 Sandbox 消息
│   ├── handleSelectionChanged()         // 处理 selection-changed
│   └── requestInitialState()            // 初始化时请求当前选中状态
│
└── CSS 样式
    ├── 面板整体布局样式
    ├── 状态指示器样式（4 种状态）
    ├── 图层列表样式
    └── 图层项样式
```

### 10.4 不涉及的文件（本次不修改）

| 文件 | 说明 |
|------|------|
| `manifest.json` | 无需修改 |
| `package.json` | 如需新增依赖才修改 |
| `tsconfig.json` | 无需修改 |
| `code.js` | 编译产物，不手动修改 |

---

## 11. 与其他 Task 的接口约定

### 11.1 对 Task-01（类型定义）的依赖

Task-01 负责定义共享类型。Task-03 需要 Task-01 提供以下类型定义：

```typescript
// 预期 Task-01 导出的类型

interface TextStyles {
  fontName: string;
  fontSize: number;
  fontWeight?: number;
  fills: string;
  textAlignHorizontal: string;
  lineHeight: string;
  letterSpacing: string;
}

interface LayerInfo {
  id: string;
  name: string;
  type: 'text' | 'image';
  path: string;
  currentText?: string;
  textStyles?: TextStyles;
  hasImageFill?: boolean;
  currentImageHash?: string;
}

interface LayerScanResult {
  textLayers: LayerInfo[];
  imageLayers: LayerInfo[];
  totalCount: number;
  textLayerCount: number;
  imageLayerCount: number;
}

type SelectionStatus = 'no-selection' | 'invalid' | 'valid';

interface SelectionChangedPayload {
  status: SelectionStatus;
  message?: string;
  nodeType?: string;
  nodeName?: string;
  nodeId?: string;
  layerScanResult?: LayerScanResult;
}
```

> 若 Task-01 尚未实现，Task-03 应在 `code.ts` 和 `ui.html` 中本地先定义这些类型，后续迁移至 Task-01 定义的共享模块中。

### 11.2 对 Task-04（字段映射）的暴露

Task-03 产出的图层列表是 Task-04 映射 UI 的数据源：
- Task-04 从 Task-03 维护的图层列表状态中读取 `textLayers` 和 `imageLayers`
- 用户点击图层列表项时，触发 Task-04 的映射建立流程
- 当模板变化（`selection-changed` 中 status 变为 `valid` 且 nodeId 不同于前次）时，Task-04 需**清除所有已建立的映射**

### 11.3 对 Task-05（批量生成）的暴露

Task-05 的生成按钮状态依赖于 Task-03：
- 仅在 `status === 'valid' && layerScanResult.totalCount > 0` 时生成按钮可用
- 当 `status === 'no-layers'` 或 `status === 'no-selection'` 或 `status === 'invalid'` 时，生成按钮禁用

---

## 12. 开发注意事项

1. **Figma Plugin API 环境差异**：`code.ts` 运行在 Figma 沙盒中，**不能使用** `console.log()` 以外的浏览器 API（如 `fetch`、`localStorage`）。文件读写、DOM 操作均不可用。
2. **结构化克隆限制**：`figma.ui.postMessage()` 传递数据受[结构化克隆算法](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)限制。不能传递函数、Symbol、DOM 节点等。Figma 节点引用（如 `frame: FrameNode`）**不能直接序列化传递**——必须提取为纯数据（如 `id`、`name` 等）。
3. **`figma.mixed` 判断**：当读取文本层的属性（如 `fontName`、`fontSize` 等）时，必须先检查 `=== figma.mixed`，否则会抛出异常。若为 mixed，应做降级处理。
4. **`removed` 状态**：通过 `figma.currentPage.selection` 获取的节点在极少数情况下可能已处于 `removed === true` 状态。处��时需先检查。
5. **`parent` 为 null**：根节点的 `parent` 可能为 null 或在某些场景下（如节点刚被删除）为 null，路径构建时需保护。
6. **类型守卫**：遍历子节点时，Figma API 返回的 `children` 为 `ReadonlyArray<SceneNode>`，访问具体类型属性前需使用类型守卫或类型断言。
7. **手动类型声明**：若项目未使用 `@figma/plugin-typings` 等类型包，需在 `code.ts` 中手动声明或通过 tsconfig 引入 Figma 类型。
