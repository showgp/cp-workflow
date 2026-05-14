# Task 05: 批量生成引擎 (Batch Generation Engine)

---

## 1. 任务概述

| 属性 | 值 |
|------|-----|
| **Task ID** | Task-05 |
| **名称** | 批量生成引擎 (Batch Generation Engine) |
| **优先级** | P0（最高优先级，核心功能） |
| **依赖** | Task-01（类型定义与架构）、Task-04（映射配置），以及构建完成的映射数据结构 |
| **运行上下文** | **Sandbox 独占**（`code.ts`）—— 所有生成逻辑仅在沙箱中执行 |
| **产出物** | `src/core/generation/` 目录下的生成引擎模块 |

### 简介

批量生成引擎是整个插件的核心执行模块。当用户在 UI 中点击"生成"按钮后，UI 通过 `postMessage` 将完整的生成配置（模板信息、字段映射、表格数据）发送至沙箱。沙箱接收到消息后，按以下三阶段执行批量生成：

1. **预处理阶段**：收集并预加载所有唯一字体。
2. **逐行生成阶段**：遍历每一行数据，克隆模板 Frame，按映射关系替换内容。
3. **布局收尾阶段**：将所有生成的 Frame 排列到画布上。

整个生成过程必须在 **30 秒内** 完成 100 行数据的处理（NFR-03），且不能阻塞 Figma 主界面（NFR-04），需支持中途取消。

---

## 2. 功能需求细节

### 2.1 FR-15：无映射时的生成行为

**需求描述：**
当用户未建立任何字段映射时，仍允许执行生成操作。生成结果为一组模板 Frame 的副本，**不对任何图层内容做替换**。

**实现方案：**

- **UI 侧确认**：是否在无映射情况下生成的选择由 Task-06 集成层在 UI 侧负责。当 `mappings` 数组长度为 0 时，UI 弹出确认对话框询问用户——"您尚未选择任何字段映射，生成的页面将不会包含数据内容，是否继续？"。
- **沙箱侧行为**：沙箱不关心是否有映射。它接收到的 `GenerationConfig.mappings` 可能为空数组。若为空，则直接跳过所有内容替换步骤，仅执行克隆与布局操作。
- **伪代码逻辑**：

```
if (config.mappings.length === 0) {
  // 仅克隆 + 布局，跳过内容替换
  for each row in data.rows:
    clone = templateFrame.clone()
    page.appendChild(clone)
    frameIds.push(clone.id)
  layoutGeneratedFrames(frameIds)
  return
}
// 正常流程：克隆 + 内容替换 + 布局
```

**注意事项：**
- 即使无映射，仍需生成 `GenerationRowResult` 结构（`issues` 和 `warnings` 均为空数组）。
- 进度上报照常发送，UI 显示的 `completedRows` 与 `totalRows` 正常递增。

---

### 2.2 FR-16：Frame 克隆

**需求描述：**
对每一行数据，克隆一份模板 Frame 及其全部子图层。

**核心 API：`BaseNode.clone()`**

```typescript
const clone = templateFrame.clone();
```

**API 行为说明：**

| 特性 | 说明 |
|------|------|
| 返回类型 | 新节点，类型与原始节点完全一致（如 `FrameNode`） |
| 节点 ID | Figma 为克隆节点分配**全新的 ID**，与原节点不同 |
| 子节点 | 递归克隆所有子节点，所有子节点也获得新 ID |
| 属性继承 | 克隆节点继承原始节点的全部属性（位置、尺寸、样式、填充、字体等） |
| 挂载状态 | **克隆节点默认是"游离"的**，不自动附加到任何父节点。必须手动调用 `parentNode.appendChild(clone)` 才能将克隆节点添加到画布 |
| 图层名称 | 克隆的图层名称与原始图层完全一致（`clone.name === templateFrame.name`） |

**关键设计决策：通过路径而非 ID 查找目标图层**

由于 `clone()` 会为所有节点分配新 ID，我们不能使用映射阶段记录的原始模板图层 ID 在克隆中定位节点。必须采用**路径匹配（Path Matching）**方式。

**三种候选方案对比：**

| 方案 | 描述 | 优点 | 缺点 | 采纳 |
|------|------|------|------|------|
| **A：路径匹配** | 存储图层在模板中的层级路径（如 `"模板 > 头部组 > 标题"`），在克隆中按路径逐级查找 | 结构可靠，克隆结构与原模板一致 | 同级同名节点会匹配到第一个 | ✅ 推荐 |
| **B：索引匹配** | 存储图层在模板中的层级索引（如 `[0, 2, 1]`），按索引在克隆中定位 | 查找速度快 | 结构不一致时风险高 | ❌ |
| **C：重新扫描** | 克隆后对克隆节点重新扫描，通过名称匹配重新建立映射关系 | 灵活 | 性能开销大，语义模糊 | ❌ |

**最终采用方案 A：路径匹配。**

- 在 Task-04 映射阶段，记录每个映射目标图层的完整层级路径（相对于模板 Frame）。
- 路径格式：`"TemplateName > GroupA > SubGroupB > TargetLayer"`
- 生成时，去掉路径的第一个段（模板 Frame 名称），按剩余段在克隆中逐级查找。
- **已知限制**：如果同一层级存在多个同名节点，路径匹配总会返回第一个。对于 MVP 阶段，此限制可接受且应明确记录在用户手册中。

**克隆操作伪代码：**

```typescript
function cloneTemplateFrame(
  templateFrame: FrameNode,
  targetPage: PageNode
): FrameNode {
  const clone = templateFrame.clone();

  // 克隆后的节点不带位置偏移，保留模板原有坐标
  // 位置将在布局阶段统一调整

  targetPage.appendChild(clone);

  return clone;
}
```

---

### 2.3 FR-17：内容替换

**需求描述：**
对每一行数据的克隆 Frame，按映射关系将对应列数据填入对应图层。

#### 2.3.1 文本替换

**前置条件检测：**

在执行任何文本替换前，必须确保该 `fontName` 已通过 `figma.loadFontAsync()` 加载。此步骤在 Phase 1（字体预加载）中统一完成（详见第 3.6 节）。

**替换流程：**

```
function replaceTextContent(node: TextNode, cellValue: string): void
  1. 检查 cellValue 是否为 null、undefined、或去除首尾空白后为空字符串
     ├─ 是 → 不修改 node.characters，保留模板原始文本
     │       记录 Issue（reason: 'empty_text'）
     │       return
     └─ 否 → 继续执行
  2. node.characters = cellValue
  3. 不修改以下属性（继承自模板克隆）：
     - fontName（{ family, style }）
     - fontSize（number）
     - fills（Paint[]）
     - textAlignHorizontal（String）
     - textAlignVertical（String）
     - lineHeight（LineHeight）
     - letterSpacing（LetterSpacing）
     - textCase（TextCase）
     - textDecoration（TextDecoration）
     - paragraphSpacing（number）
     - paragraphIndent（number）
```

**NFR-01 风格保持的天然保证：**

Figma API 的 `textNode.characters = "xxx"` 操作**不会**重置字体、字号、颜色等样式属性。这些属性是节点自身的状态，而 `characters` 仅修改文本内容。因此，模板的所有文字样式天然保留，无需额外操作。

**混合样式（Mixed-Style）的处理：**

> 对于包含多种字体/字号/颜色的单个 TextNode，设置 `characters` 属性会替换全部文本但保留所有 style segments 的位置信息。若新文本长度与原文本不同，style segments 的覆盖范围可能错位。**此为 Figma 平台固有限制**。

- **MVP 处理**：假定所有模板文本图层为单一风格。若模板中存在混合风格文本节点，行为未定义（记录为文档限制）。
- **安全措施（可选实现）**：在替换前对原文本进行 `getRangeFontSize(0, originalLength)` 与 `getRangeFills()` 探测，若检测到混合风格则发出 Warning。

#### 2.3.2 图片替换

**数据来源：**

图片数据来源于 Excel 单元格内嵌图片，由 Task-02 在 UI 侧提取。提取成功后以 **base64 Data URL 格式**（如 `data:image/png;base64,iVBOR...`）包装为 `ImageCellValue` 对象，随生成配置的 `TableRowData.cells` 一同发送至沙箱。

**替换流程：**

```
async function replaceImageContent(
  node: SceneNode,
  imageData: ImageCellValue
): Promise<{ success: boolean; warning?: Warning }>

  情况 1：imageData 有效（base64 字符串非空）
    ├─ 1. 解码 base64 → Uint8Array（使用自定义 base64 解码器）
    │    注意：Figma 沙箱环境没有 window.atob()，必须自行实现 base64→binary 解码
    ├─ 2. 调用 figma.createImage(uint8Array) → 获得 Image 对象
    │    若 createImage 抛出异常 → 跳转到"失败处理"
    ├─ 3. 获取 image.hash
    ├─ 4. 构造 ImagePaint：
    │    { type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }
    ├─ 5. 若节点支持 fills 属性（类型守卫：'fills' in node）：
    │    node.fills = [newFill]
    │    注意：直接替换整个 fills 数组，完全覆盖模板可能存在的占位填充
    ├─ 6. 不修改以下属性（继承自模板克隆）：
    │    - x, y（位置）
    │    - width, height（尺寸）
    │    - constraints（约束）
    │    - opacity, blendMode（透明度与混合模式）
    └─ 返回 { success: true }

  情况 2：imageData 无效（null 或 base64 为空）
    ├─ 若节点支持 fills 属性：
    │    清空图片填充：node.fills = []
    │    （对应 FR-24："不填充，保持空白"）
    ├─ 记录 Warning（reason: 'image_extraction_failed'）
    └─ 返回 { success: false, warning }

  失败处理（FR-23, FR-24）：
    ├─ base64 解码失败 OR figma.createImage() 抛出异常
    ├─ 清空该图层的 fills → node.fills = []
    ├─ 记录 Warning（reason: 'image_decode_failed' 或 'image_create_failed'）
    ├─ **不标记为 Issue**（不影响该 Frame 的生成）
    ├─ **继续处理该行的其他字段**
    └─ 返回 { success: false, warning }
```

**关键实现：自定义 Base64 解码器**

Figma 沙箱是一个受限的 JavaScript 环境，**不存在 `window` 对象，因此没有 `atob()` 和 `btoa()` 函数**。必须实现一个纯 TypeScript 的 base64 解码函数。

**算法概要（纯 TypeScript）：**

```
function base64ToUint8Array(base64: string): Uint8Array
  输入：去除 Data URL 前缀后的 pure base64 字符串
  算法：
    1. 构建 Base64 字符映射表（A-Z, a-z, 0-9, +, / → 0-63）
    2. 移除输入中的 '=' 填充符
    3. 将每 4 个 base64 字符解码为 3 个字节：
       - char1 → 取其 6 bits
       - char2 → 取其 6 bits
       - char3 → 取其 6 bits（可能不存在）
       - char4 → 取其 6 bits（可能不存在）
       - byte1 = (char1 << 2) | (char2 >> 4)
       - byte2 = ((char2 & 0x0F) << 4) | (char3 >> 2)
       - byte3 = ((char3 & 0x03) << 6) | char4
    4. 输出为 Uint8Array
    5. 异常处理：遇到非法字符则抛出错误
  输出：Uint8Array（可直接传入 figma.createImage()）
```

**`scaleMode` 说明：**

使用 `'FILL'` 模式使图片填满模板原有区域，保持与模板占位图片一致的显示效果。其他可选值：
- `'FIT'`：保持比例适应区域，可能有留白
- `'CROP'`：保持比例裁剪溢出部分
- `'TILE'`：平铺

MVP 统一使用 `'FILL'`。若后续需要可由映射配置指定。

---

### 2.4 FR-18：Frame 布局排列

**需求描述：**
生成的所有 Frame 需要排列在画布上，保持合理的间距。

**布局方案：**

采用**等间距网格布局**。由于所有克隆 Frame 源自同一模板，具有完全相同的尺寸（width, height），因此可使用简单统一的网格计算。

**布局参数（常量）：**

```typescript
const LAYOUT = {
  COLS_PER_ROW: 4,          // 每行 Frame 数量
  HORIZONTAL_GAP: 100,      // 水平间距（px）
  VERTICAL_GAP: 100,        // 垂直间距（px）
  OFFSET_X: 100,            // 第一个 Frame 距离模板右侧的偏移（px）
  OFFSET_Y: 0,              // Y 方向偏移（与模板顶部对齐）
} as const;
```

**布局算法伪代码：**

```
function layoutGeneratedFrames(
  frameIds: string[],
  templateX: number,
  templateY: number,
  templateWidth: number,
  templateHeight: number
): void

  输入：
    - frameIds: 已生成的所有克隆 Frame ID 列表（按行顺序）
    - templateX, templateY: 模板 Frame 的当前坐标
    - templateWidth, templateHeight: 模板 Frame 的尺寸

  计算起始坐标：
    startX = templateX + templateWidth + LAYOUT.OFFSET_X
    startY = templateY + LAYOUT.OFFSET_Y

  遍历 frameIds，for i = 0 to frameIds.length - 1：
    frame = figma.getNodeById(frameIds[i]) as FrameNode
    若 frame 不存在 → continue

    col = i % LAYOUT.COLS_PER_ROW
    row = Math.floor(i / LAYOUT.COLS_PER_ROW)

    计算目标坐标：
      frame.x = startX + col * (frame.width + LAYOUT.HORIZONTAL_GAP)
      frame.y = startY + row * (frame.height + LAYOUT.VERTICAL_GAP)

    // 由于所有克隆尺寸一致，不需要逐行动态计算行高
```

**特殊情况处理：**

| 情况 | 处理 |
|------|------|
| 生成过程中用户取消了操作 | 仅对已生成（未取消）的 Frame 执行布局 |
| 模板 Frame 在画布最右侧（无足够空间） | 生成的 Frame 自动换行至模板下方（`startY + gap`）——此逻辑由网格计算自然处理 |
| Frame 数量少于 1 行（如只有 2 个） | 正常布局，只占一行 |
| Frame 数量远超画布范围 | 不做特殊处理，延续无限排列（Figma 画布自身支持无限延伸） |

---

### 2.5 NFR-01：文本样式保持

**需求描述：**
生成页面中的文本需保持模板原有的 `fontName`、`fontSize`、`fills`（颜色）、`textAlignHorizontal`（对齐方式）。

**天然实现机制：**

克隆节点（`clone()` 产物）继承原始节点的全部样式属性。设置 `node.characters` 仅修改文本内容，不触碰样式系统。

**安全措施（防御性编程）：**

虽非必要，但可在替换前置保存原始样式，以备在异常场景下回退：

```typescript
// 仅作为防御性记录，正常流程不需要调用
const originalFontName = node.fontName;
const originalFontSize = node.fontSize;
// ... 设置 characters ...
// 若出现意外样式重置（不应发生），执行回退恢复
```

**字体加载失败的降级策略：**

若某种字体在用户系统中不可用且 `figma.loadFontAsync()` 返回 reject，则此字体的所有文本替换操作**全部跳过**，对应图层保留模板原有文本。记录 Issue（`reason: 'font_load_failed'`）。

---

### 2.6 NFR-02：图片尺寸与位置保持

**需求描述：**
生成页面中的图片需保持模板原有的尺寸和位置。

**实现：**

与文本类似，克隆节点继承原始图片图层的 `x`、`y`、`width`、`height` 属性。内容替换仅修改 `fills` 数组中的图片引用（`imageHash`），不触碰几何属性。无额外操作。

---

### 2.7 NFR-03：性能要求（30 秒 / 100 行）

**需求描述：**
100 行以内的数据，生成总耗时不超过 30 秒。

**性能分析：**

| 操作 | 耗时特征 | 优化策略 |
|------|---------|---------|
| `node.clone()` | 同步，极快（< 5ms） | 无需优化 |
| `figma.loadFontAsync()` | 异步，首次加载耗时 | **Phase 1 统一预加载**，避免逐行重复加载 |
| `figma.createImage()` | 异步，图片越大越慢 | 图片数据已在消息传递时完成传输，无需额外 I/O |
| 图层路径遍历 | 同步，每层 O(layers) | 模板图层数通常 < 20，可忽略 |
| `node.characters = xxx` | 同步，极快 | 无需优化 |

**优化策略详述：**

**策略 1：字体预加载去重（Phase 1）**
- 在开始生成循环前，遍历所有映射条目，收集所有目标文本图层的 `fontName` 对象（`{ family, style }`）。
- 对收集到的 `fontName` 数组做去重（基于 `family + style` 组合）。
- 对每个唯一的 `fontName` 调用一次 `figma.loadFontAsync()`。
- 若某字体加载失败，将该字体名称加入"失败字体集合"，后续涉及该字体的文本替换全部跳过。

**策略 2：进度上报节流**
- 不在每行生成后都发送 `postMessage`（频繁的消息传递会阻塞 UI 线程）。
- 采用"每 N 行 + 时间节流"策略：
  - 每处理 5 行数据后发送一次进度。
  - 或距离上次发送已超过 500ms 时发送（取较优者）。
- 最后一行处理完成后，无论是否达到阈值都发送最终进度。

**策略 3：不缓存图层引用**
- 每个克隆都有新 ID，无法跨克隆缓存节点引用。
- 但单次路径遍历的复杂度为 O(图层深度 × 每层子节点数)，模板场景下此数值极小，无优化必要。
- 100 行 × 10 层映射 × 平均 3 层深度 = 3000 次子节点查找，现代 JavaScript 引擎数毫秒内完成。

**预期性能基准：**

| 数据量 | 目标耗时 | 说明 |
|--------|---------|------|
| 10 行 | < 3 秒 | 包含字体加载（首次） |
| 50 行 | < 15 秒 | 字体已加载 |
| 100 行 | < 30 秒 | 字体已加载，仅克隆+替换 |

---

### 2.8 NFR-04：非阻塞操作（可取消）

**需求描述：**
生成过程不阻塞 Figma 界面，用户可随时取消操作。

**实现机制：**

**异步主循环：**

核心生成函数必须为 `async`，在每次迭代之间让出控制权给 Figma 事件循环：

```typescript
async function generateBatch(config: GenerationConfig): Promise<void> {
  for (let i = 0; i < rows.length; i++) {
    // 每次循环前检查取消标志
    if (cancellationRequested) break;

    await processRow(config, i);

    // await 语句天然让出执行权给事件循环
    // 此时 Figma 可处理 UI 消息（包括取消指令）
  }
}
```

**取消标志管理：**

```typescript
let cancellationRequested = false;

// 在 message 监听器中接收取消指令
figma.ui.onmessage = (msg) => {
  if (msg.type === 'cancel-generation') {
    cancellationRequested = true;
  }
  // ... 其他消息处理
};

// 每次开始新生成时重置标志
function startGeneration(config: GenerationConfig) {
  cancellationRequested = false;
  generateBatch(config);
}
```

**取消后的行为：**

| 阶段 | 行为 |
|------|------|
| 预处理阶段（字体加载中） | 无法取消。字体加载是原子 async 操作，必须在开始循环前完成。该阶段通常 < 2 秒。 |
| 逐行生成阶段 | 完成当前行后检查标志 → 若已设置则跳出循环 |
| 布局阶段 | 仅对已成功生成的 Frame 执行布局（未开始的行不生成 Frame） |
| 完成后 | 发送 `generation-cancelled` 消息给 UI，携带已完成行数与总行数 |
| 已生成的 Frame | **保留在画布上**，不做删除。用户可能需要部分生成结果。 |

---

## 3. 核心技术方案

### 3.1 整体生成流程

```typescript
async function executeGeneration(config: GenerationConfig): Promise<void> {
  // ═══════════════════════════════════════════════════
  // Phase 0: 前置校验
  // ═══════════════════════════════════════════════════
  const templateFrame = figma.getNodeById(config.templateId) as FrameNode | null;
  if (!templateFrame) {
    sendToUI({ type: 'generation-error', payload: { error: '模板 Frame 不存在或已被删除' } });
    return;
  }

  // ═══════════════════════════════════════════════════
  // Phase 1: 字体预加载
  // ═══════════════════════════════════════════════════
  const failedFonts = new Set<string>();

  if (config.mappings.length > 0) {
    const uniqueFontNames = collectUniqueFontNames(config.mappings, templateFrame);

    for (const fontName of uniqueFontNames) {
      try {
        await figma.loadFontAsync(fontName);
      } catch {
        failedFonts.add(`${fontName.family}-${fontName.style}`);
      }
    }
  }

  // ═══════════════════════════════════════════════════
  // Phase 2: 逐行生成
  // ═══════════════════════════════════════════════════
  const results: GenerationRowResult[] = [];
  const frameIds: string[] = [];
  let lastProgressTime = Date.now();

  for (let rowIndex = 0; rowIndex < config.data.length; rowIndex++) {
    // --- 取消检查 ---
    if (cancellationRequested) {
      break;
    }

    // --- 处理单行 ---
    const rowResult = await processRow(
      templateFrame,
      config.data[rowIndex],
      config.mappings,
      failedFonts
    );
    results.push(rowResult);
    frameIds.push(rowResult.frameId);

    // --- 进度上报（节流：每 5 行或间隔 > 500ms 或最后一行）---
    const now = Date.now();
    if (rowIndex % 5 === 0 || now - lastProgressTime > 500 || rowIndex === config.data.length - 1) {
      sendProgress(results, config.data.length);
      lastProgressTime = now;
    }
  }

  // ═══════════════════════════════════════════════════
  // Phase 3: 布局排列
  // ═══════════════════════════════════════════════════
  layoutGeneratedFrames(
    frameIds,
    config.templatePosition.x,
    config.templatePosition.y,
    config.templatePosition.width
  );

  // ═══════════════════════════════════════════════════
  // Phase 4: 发送完成消息
  // ═══════════════════════════════════════════════════
  sendCompletion(results, cancellationRequested);

  // 重置取消标志
  cancellationRequested = false;
}
```

### 3.2 单行处理流程

```typescript
async function processRow(
  templateFrame: FrameNode,
  rowData: TableRowData,
  mappings: MappingEntry[],
  failedFonts: Set<string>
): Promise<GenerationRowResult> {

  const issues: Issue[] = [];
  const warnings: Warning[] = [];

  // ═══ Step 1: 克隆模板 Frame ═══
  let clone: FrameNode;
  try {
    clone = templateFrame.clone();
  } catch (error) {
    // 克隆操作本身失败 —— 极罕见，可能是模板损坏
    return {
      rowIndex: rowData.rowIndex,
      frameId: '',
      issues: [{
        rowIndex: rowData.rowIndex,
        columnName: '',
        layerName: '',
        reason: 'clone_failed'
      }],
      warnings: []
    };
  }

  // 将克隆节点添加到当前页
  figma.currentPage.appendChild(clone);

  // ═══ Step 2: 遍历映射，替换内容 ═══
  // 若无映射，跳过此步骤
  if (mappings.length > 0) {
    for (const mapping of mappings) {
      // 2a: 在克隆中查找目标图层
      const targetNode = findNodeInCloneByPath(clone, mapping.layerPath);

      if (!targetNode) {
        issues.push({
          rowIndex: rowData.rowIndex,
          columnName: mapping.columnHeader,
          layerName: mapping.layerName,
          reason: 'layer_not_found'
        });
        continue; // 跳过此映射，处理下一个
      }

      // 2b: 获取此行此列的数据
      const cellValue = rowData.cells[mapping.columnIndex];

      // 2c: 根据映射类型执行替换
      if (mapping.type === 'text') {
        await processTextMapping(
          targetNode,
          cellValue,
          mapping.columnHeader,
          mapping.layerName,
          rowData.rowIndex,
          failedFonts,
          issues
        );
      } else if (mapping.type === 'image') {
        await processImageMapping(
          targetNode,
          cellValue,
          mapping.columnHeader,
          mapping.layerName,
          rowData.rowIndex,
          warnings
        );
      }
    }
  }

  // ═══ Step 3: 返回结果 ═══
  return {
    rowIndex: rowData.rowIndex,
    frameId: clone.id,
    issues,
    warnings
  };
}
```

### 3.3 图层查找算法：路径匹配

**路径格式定义：**

图层路径在映射阶段（Task-04）确定并存储为字符串：
```
"模板Frame名 > 父图层名 > 子图层名 > 目标图层名"
```

例如：`"促销海报模板 > 头部组 > 标题文本"`

**查找算法实现：**

```typescript
function findNodeInCloneByPath(
  clone: FrameNode,
  layerPath: string
): SceneNode | null {
  // 解析路径，去除第一个段（模板 Frame 名称）
  // "促销海报模板 > 头部组 > 标题文本" → ["头部组", "标题文本"]
  const segments = layerPath.split(' > ').slice(1);

  if (segments.length === 0) {
    return null;
  }

  let currentNode: BaseNode = clone;

  for (const targetName of segments) {
    if ('children' in currentNode) {
      const parentNode = currentNode as FrameNode | GroupNode;
      const found = parentNode.children.find(child => child.name === targetName);
      if (!found) {
        return null; // 路径中途断裂
      }
      currentNode = found;
    } else {
      // 当前节点不支持 children，无法继续向下查找
      return null;
    }
  }

  return currentNode as SceneNode;
}
```

**时间复杂度**：`O(层级深度 × 平均每层子节点数)`

**已知限制与处理：**

| 限制 | 处理方式 |
|------|---------|
| 同级存在同名节点 | 返回**第一个**匹配项。MVP 阶段标记为已知限制，在文档中说明 |
| 模板用户在映射后重命名了图层 | 路径断裂，标记 `layer_not_found` Issue |
| 路径中包含特殊字符 `>` | `>` 是路径分隔符，若图层名包含 `>` 可能导致解析错误。解决方案：在 Task-04 映射阶段对图层名中的 `>` 做转义处理（如替换为 `→` 或 `&gt;`） |

### 3.4 文本替换详细实现

```typescript
async function processTextMapping(
  targetNode: SceneNode,
  cellValue: CellValue,
  columnName: string,
  layerName: string,
  rowIndex: number,
  failedFonts: Set<string>,
  issues: Issue[]
): Promise<void> {
  // 类型守卫：确保目标节点是 TextNode
  if (targetNode.type !== 'TEXT') {
    issues.push({
      rowIndex,
      columnName,
      layerName,
      reason: 'layer_not_found' // 映射的是文本字段但目标节点不是文本
    });
    return;
  }

  const textNode = targetNode as TextNode;

  // 检查字体是否可用
  const fontKey = `${textNode.fontName.family}-${textNode.fontName.style}`;
  if (failedFonts.has(fontKey)) {
    issues.push({
      rowIndex,
      columnName,
      layerName,
      reason: 'font_load_failed'
    });
    return; // 保留模板原始文本
  }

  // 判断 cellValue 是否有效
  if (!isValidTextCellValue(cellValue)) {
    // 文本为空 → 保留模板原始文本，标记 Issue
    issues.push({
      rowIndex,
      columnName,
      layerName,
      reason: 'empty_text'
    });
    return; // 不修改 characters
  }

  const textCellValue = cellValue as TextCellValue;
  const newText = textCellValue.value;

  // 设置文本内容
  // Figma API 保证：设置 characters 不会更改 fontName、fontSize、fills 等属性
  textNode.characters = newText;

  // 文本替换成功，不产生 issue
}

function isValidTextCellValue(cellValue: CellValue): boolean {
  if (!cellValue) return false;
  if (cellValue.type !== 'text') return false;
  return cellValue.value.trim().length > 0;
}
```

**关于 `figma.loadFontAsync()` 的调用时机：**

`loadFontAsync()` 必须在**任何对使用该字体的 TextNode 的字符操作之前**调用。Phases 1 的字体预加载已经确保所有字体在循环开始前加载完毕，因此单行处理中无需再次调用。这是一个关键的架构决策，避免了逐行加载同一字体的性能问题。

### 3.5 图片替换详细实现

#### 3.5.1 自定义 Base64 解码器

核心需求：在 Figma 沙箱环境（无 `atob`）中实现 base64 → `Uint8Array` 的转换。

**Base64 字符映射表：**

```
A-Z → 0-25,  a-z → 26-51,  0-9 → 52-61,  + → 62,  / → 63
```

**解码算法（逐字节描述）：**

```
输入：pureBase64（已去除 data URL 前缀及填充符 '='）
输出：Uint8Array

1. 计算输出字节数 = Math.floor(pureBase64.length * 3 / 4)
2. 创建 Uint8Array(输出字节数)
3. 以 4 个 base64 字符为一组处理：
   for 每组 (char0, char1, char2, char3):
     b0 = base64 解码(char0)
     b1 = base64 解码(char1)
     b2 = char2 存在 ? base64 解码(char2) : 0
     b3 = char3 存在 ? base64 解码(char3) : 0

     输出[outIdx++] = (b0 << 2) | (b1 >> 4)
     若 char2 不是填充符 '='：
       输出[outIdx++] = ((b1 & 0x0F) << 4) | (b2 >> 2)
     若 char3 不是填充符 '='：
       输出[outIdx++] = ((b2 & 0x03) << 6) | b3

4. 返回输出
```

**`base64 解码(字符)` 内部逻辑：**
- 字符属于 A-Z → 返回 `charCode - 65`
- 字符属于 a-z → 返回 `charCode - 71`（因为 a=26，减去 71：97-71=26）
- 字符属于 0-9 → 返回 `charCode + 4`（0=52，48+4=52）
- 字符为 `+` → 返回 62
- 字符为 `/` → 返回 63
- 其他 → 抛出错误（非法字符）

**完整包装函数：**

```typescript
function decodeBase64Image(base64DataUrl: string): { bytes: Uint8Array; mimeType: string } {
  // 解析 Data URL 格式：data:[<mediatype>][;base64],<data>
  const match = base64DataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('无效的 Data URL 格式');
  }

  const mimeType = match[1];   // 如 "image/png"
  const base64 = match[2];     // 纯 base64 编码数据

  const bytes = base64ToUint8Array(base64);
  return { bytes, mimeType };
}
```

#### 3.5.2 图片内容替换实现

```typescript
async function processImageMapping(
  targetNode: SceneNode,
  cellValue: CellValue,
  columnName: string,
  layerName: string,
  rowIndex: number,
  warnings: Warning[]
): Promise<void> {
  // 检查目标节点是否支持图片（检查 fills 属性）
  if (!hasFillsProperty(targetNode)) {
    warnings.push({
      rowIndex,
      columnName,
      layerName,
      reason: 'image_extraction_failed' // 目标节点不支持填充
    });
    return;
  }

  // 检查 cellValue 是否包含有效图片数据
  if (!isValidImageCellValue(cellValue)) {
    // 清空填充，保持空白（FR-24）
    clearNodeFills(targetNode);
    warnings.push({
      rowIndex,
      columnName,
      layerName,
      reason: 'image_extraction_failed'
    });
    return;
  }

  const imageCell = cellValue as ImageCellValue;

  // 解码 base64 图片数据
  let imageBytes: Uint8Array;
  try {
    const decoded = decodeBase64Image(imageCell.base64);
    imageBytes = decoded.bytes;
  } catch {
    // 解码失败 → 清空填充
    clearNodeFills(targetNode);
    warnings.push({
      rowIndex,
      columnName,
      layerName,
      reason: 'image_decode_failed'
    });
    return; // 不阻塞其他字段
  }

  // 创建 Figma Image 资源
  let image: Image;
  try {
    image = figma.createImage(imageBytes);
  } catch {
    // createImage 失败 → 清空填充
    clearNodeFills(targetNode);
    warnings.push({
      rowIndex,
      columnName,
      layerName,
      reason: 'image_decode_failed'
    });
    return;
  }

  // 应用图片到图层
  const newFill: ImagePaint = {
    type: 'IMAGE',
    scaleMode: 'FILL',
    imageHash: image.hash,
  };

  // 直接替换整个 fills 数组
  (targetNode as GeometryMixin & { fills: Paint[] }).fills = [newFill];

  // 部分图层可能原有多个 fills（如背景色 + 图片叠加），
  // 此处简化为单一 ImagePaint。若有复合填充需求，后续版本可扩展。
}

function hasFillsProperty(node: SceneNode): boolean {
  return 'fills' in node;
}

function clearNodeFills(node: SceneNode): void {
  if ('fills' in node) {
    (node as any).fills = [];
  }
}

function isValidImageCellValue(cellValue: CellValue): boolean {
  if (!cellValue) return false;
  if (cellValue.type !== 'image') return false;
  const imageCell = cellValue as ImageCellValue;
  return typeof imageCell.base64 === 'string' && imageCell.base64.length > 0;
}
```

### 3.6 字体预加载算法

```typescript
function collectUniqueFontNames(
  mappings: MappingEntry[],
  templateFrame: FrameNode
): Array<{ family: string; style: string }> {
  const fontSet = new Map<string, { family: string; style: string }>();

  for (const mapping of mappings) {
    if (mapping.type !== 'text') continue;

    // 在模板中找到目标文本图层
    const targetNode = findNodeInCloneByPath(templateFrame, mapping.layerPath);
    if (!targetNode || targetNode.type !== 'TEXT') continue;

    const textNode = targetNode as TextNode;
    const fontName = textNode.fontName;

    // fontName 是 { family: string, style: string }
    const key = `${fontName.family}|${fontName.style}`;

    if (!fontSet.has(key)) {
      fontSet.set(key, {
        family: fontName.family,
        style: fontName.style,
      });
    }
  }

  return Array.from(fontSet.values());
}
```

**字体加载失败处理：**

```typescript
async function preloadFonts(
  mappings: MappingEntry[],
  templateFrame: FrameNode
): Promise<{ failedFonts: Set<string> }> {
  const uniqueFonts = collectUniqueFontNames(mappings, templateFrame);
  const failedFonts = new Set<string>();

  // 并行加载所有字体，收集失败的
  const results = await Promise.allSettled(
    uniqueFonts.map(font =>
      figma.loadFontAsync(font).then(
        () => ({ font, ok: true }),
        () => ({ font, ok: false })
      )
    )
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && !result.value.ok) {
      const font = result.value.font;
      failedFonts.add(`${font.family}|${font.style}`);
    }
  }

  return { failedFonts };
}
```

### 3.7 布局算法详细实现

```typescript
const LAYOUT = {
  COLS_PER_ROW: 4,
  HORIZONTAL_GAP: 100,
  VERTICAL_GAP: 100,
  OFFSET_X: 100,
  OFFSET_Y: 0,
} as const;

function layoutGeneratedFrames(
  frameIds: string[],
  templateX: number,
  templateY: number,
  templateWidth: number
): void {
  if (frameIds.length === 0) return;

  // 获取第一个克隆 Frame 来确定基准尺寸
  // （所有克隆尺寸相同，只需读取第一个）
  const firstFrame = figma.getNodeById(frameIds[0]) as FrameNode;
  if (!firstFrame) return;

  const frameWidth = firstFrame.width;
  const frameHeight = firstFrame.height;

  // 计算起始位置：模板右侧偏移 HORIZONTAL_GAP
  const startX = templateX + templateWidth + LAYOUT.HORIZONTAL_GAP;
  const startY = templateY + LAYOUT.OFFSET_Y;

  for (let i = 0; i < frameIds.length; i++) {
    const frame = figma.getNodeById(frameIds[i]) as FrameNode | null;
    if (!frame) continue;

    const col = i % LAYOUT.COLS_PER_ROW;
    const row = Math.floor(i / LAYOUT.COLS_PER_ROW);

    frame.x = startX + col * (frameWidth + LAYOUT.HORIZONTAL_GAP);
    frame.y = startY + row * (frameHeight + LAYOUT.VERTICAL_GAP);
    // width 和 height 不修改（继承自模板）
  }
}
```

**布局示意图：**

```
模板 Frame                  [生成1]  [生成2]  [生成3]  [生成4]
(100, 100)                  (x+100)  (x+200)  (x+300)  (x+400)
                            [生成5]  [生成6]  [生成7]  [生成8]
                            (y+200)  ...
```

### 3.8 取消机制详细实现

```typescript
// ═══ 模块级状态 ═══
let cancellationRequested = false;

// ═══ 注册取消消息处理器（在 code.ts 初始化时调用） ═══
function registerCancelHandler(): void {
  figma.ui.onmessage = (msg: GenerationMessage) => {
    // ... 其他消息处理 ...

    if (msg.type === 'cancel-generation') {
      cancellationRequested = true;
    }
  };
}

// ═══ 在生成循环中使用 ═══
async function generateBatch(config: GenerationConfig): Promise<void> {
  // 重置取消标志
  cancellationRequested = false;

  // ... Phase 1 ...

  for (let i = 0; i < config.data.length; i++) {
    // 每次迭代前检查
    if (cancellationRequested) {
      // 跳出循环，进入 Phase 3（仅布局已生成的 Frame）
      break;
    }

    const result = await processRow(/* ... */);
    results.push(result);
    frameIds.push(result.frameId);
  }

  // 即使取消，仍对已生成的 Frame 执行布局
  layoutGeneratedFrames(frameIds, /* ... */);

  // 根据是否取消发送不同消息
  if (cancellationRequested) {
    sendToUI({
      type: 'generation-cancelled',
      payload: {
        completedRows: results.length,
        totalRows: config.data.length,
      }
    });
  } else {
    sendCompletion(results, false);
  }
}
```

**多处取消检查点：**

取消标志在以下位置检出：

| 检查点 | 位置 | 说明 |
|--------|------|------|
| 主循环入口 | `for` 循环初 | 每行开始前检查 |
| 单行处理完成后 | `processRow` 返回值后 | 通过循环条件 `if (cancellationRequested) break` 自然检出 |
| 字体预加载中 | 不检查 | 字体加载不可取消（原子操作，通常在 200ms 内完成） |

---

## 4. 消息协议

### 4.1 消息类型总览

| 方向 | 消息类型 | 触发时机 |
|------|---------|---------|
| UI → Sandbox | `start-generation` | 用户点击"生成"按钮 |
| UI → Sandbox | `cancel-generation` | 用户点击"取消"按钮 |
| Sandbox → UI | `generation-progress` | 每 5 行或间隔 > 500ms |
| Sandbox → UI | `generation-complete` | 全部行生成完毕 |
| Sandbox → UI | `generation-cancelled` | 用户取消后生成已中止 |
| Sandbox → UI | `generation-error` | 发生致命错误 |

### 4.2 消息格式定义

**UI → Sandbox：`start-generation`**

```typescript
interface StartGenerationMessage {
  type: 'start-generation';
  payload: GenerationConfig;  // 完整生成配置（详见第 5 节）
}
```

**UI → Sandbox：`cancel-generation`**

```typescript
interface CancelGenerationMessage {
  type: 'cancel-generation';
  // 无 payload
}
```

**Sandbox → UI：`generation-progress`**

```typescript
interface GenerationProgressMessage {
  type: 'generation-progress';
  payload: {
    completedRows: number;    // 已完成行数（含失败）
    totalRows: number;        // 总行数
    percentage: number;       // 百分比（0-100）
    issueCount: number;       // 累计 Issue 数
    warningCount: number;     // 累计 Warning 数
  };
}
```

**Sandbox → UI：`generation-complete`**

```typescript
interface GenerationCompleteMessage {
  type: 'generation-complete';
  payload: {
    totalPages: number;           // 生成的 Frame 总数
    successCount: number;         // 无 Issue 的行数
    issueCount: number;           // 有 Issue 的行数
    warningCount: number;         // 有 Warning 的行数
    issues: Issue[];              // 所有 Issue 的扁平列表
    warnings: Warning[];          // 所有 Warning 的扁平列表
    cancelled: false;
  };
}
```

**Sandbox → UI：`generation-cancelled`**

```typescript
interface GenerationCancelledMessage {
  type: 'generation-cancelled';
  payload: {
    completedRows: number;
    totalRows: number;
    generatedFrameCount: number;  // 实际已生成并布局的 Frame 数量
    issues: Issue[];
    warnings: Warning[];
  };
}
```

**Sandbox → UI：`generation-error`**

```typescript
interface GenerationErrorMessage {
  type: 'generation-error';
  payload: {
    error: string;              // 错误描述
    rowIndex?: number;          // 发生错误的行索引（若可确定）
    phase: 'font-loading' | 'generation' | 'layout';
  };
}
```

### 4.3 消息时序图

```
UI                          Sandbox
│                              │
│──── start-generation ───────→│  (含完整 GenerationConfig)
│                              │
│                              ├─ Phase 1: 加载字体
│                              │
│←── generation-progress ──────┤  (第 5 行完成)
│←── generation-progress ──────┤  (第 10 行完成)
│←── generation-progress ──────┤  (第 15 行完成)
│                              │
│         ... 持续 ...          │
│                              │
│   [用户点击取消]               │
│──── cancel-generation ──────→│
│                              ├─ 检查取消标志 → 停止循环
│                              ├─ Phase 3: 布局已生成的 Frame
│←── generation-cancelled ─────┤
│                              │
│         或者正常完成：            │
│←── generation-complete ──────┤
│                              │
│         或者错误：              │
│←── generation-error ─────────┤
```

---

## 5. 数据结构定义

### 5.1 核心类型（扩展自 Task-01）

```typescript
/**
 * 生成配置 —— 从 UI 传递到 Sandbox 的完整生成指令
 */
interface GenerationConfig {
  /** 模板 Frame 的节点 ID（运行时 Figma ID） */
  templateId: string;

  /** 模板 Frame 名称（用于路径解析和日志） */
  templateName: string;

  /** 模板 Frame 当前位置与尺寸信息 */
  templatePosition: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  /** 字段映射列表，可能为空（表示无映射仅克隆） */
  mappings: MappingEntry[];

  /** 所有行的数据，按行索引顺序排列 */
  data: TableRowData[];
}

/**
 * 字段映射条目
 */
interface MappingEntry {
  /** 映射类型 */
  type: 'text' | 'image';

  /** 源 Excel 列的索引（0-based） */
  columnIndex: number;

  /** 源 Excel 列标题（用于日志和 Issue 报告） */
  columnHeader: string;

  /** 目标图层的完整路径字符串（含模板名段） */
  layerPath: string;

  /** 目标图层名称（最末段的 name，用于日志和 Issue 报告） */
  layerName: string;
}

/**
 * 单行数据
 */
interface TableRowData {
  /** 行索引（0-based） */
  rowIndex: number;

  /** 该行各列的值，key 为 columnIndex */
  cells: Record<number, CellValue>;
}

/**
 * 单元格值 —— 联合类型
 */
type CellValue = TextCellValue | ImageCellValue | null;

/**
 * 文本单元格值
 */
interface TextCellValue {
  type: 'text';
  value: string;
}

/**
 * 图片单元格值（Excel 内嵌图片提取结果）
 */
interface ImageCellValue {
  type: 'image';
  /** base64 编码的图片数据，格式为 Data URL */
  base64: string;
  /** MIME 类型，如 'image/png', 'image/jpeg' */
  mimeType: string;
  /** 可选的文件名 */
  fileName?: string;
}
```

### 5.2 生成结果类型

```typescript
/**
 * 单行生成结果
 */
interface GenerationRowResult {
  /** 行索引 */
  rowIndex: number;

  /** 生成的克隆 Frame 的 Figma 节点 ID */
  frameId: string;

  /** 该行产生的所有 Issue */
  issues: Issue[];

  /** 该行产生的所有 Warning */
  warnings: Warning[];
}

/**
 * Issue —— 表示一个需要用户关注的生成问题
 * （文本单元格为空、字体不可用、图层未找到等）
 */
interface Issue {
  /** 行索引 */
  rowIndex: number;

  /** 对应的 Excel 列名称 */
  columnName: string;

  /** 目标图层名称 */
  layerName: string;

  /** Issue 类型 */
  reason: 'empty_text' | 'font_load_failed' | 'layer_not_found';
}

/**
 * Warning —— 表示一个不影响整体生成的非致命问题
 * （图片提取/解码失败等）
 */
interface Warning {
  /** 行索引 */
  rowIndex: number;

  /** 对应的 Excel 列名称 */
  columnName: string;

  /** 目标图层名称 */
  layerName: string;

  /** Warning 类型 */
  reason: 'image_extraction_failed' | 'image_decode_failed';
}
```

### 5.3 消息类型汇总

```typescript
/**
 * Sandbox 接收的消息（UI → Sandbox）
 */
type SandboxInboundMessage =
  | StartGenerationMessage
  | CancelGenerationMessage;

/**
 * Sandbox 发送的消息（Sandbox → UI）
 */
type SandboxOutboundMessage =
  | GenerationProgressMessage
  | GenerationCompleteMessage
  | GenerationCancelledMessage
  | GenerationErrorMessage;
```

---

## 6. 错误处理与容错

### 6.1 完整故障模式矩阵

| 序号 | 故障场景 | 发生阶段 | 严重等级 | 处理策略 | 标记类型 | 是否继续 |
|------|---------|---------|---------|---------|---------|---------|
| E1 | 模板 Frame 不存在（ID 无效或已被删除） | Phase 0 | **致命** | 立即中止，发送 `generation-error`，不生成任何 Frame | Error | ❌ 停止 |
| E2 | `figma.currentPage` 访问异常 | Phase 0 | **致命** | 立即中止，发送 `generation-error` | Error | ❌ 停止 |
| E3 | 字体 `loadFontAsync` 失败 | Phase 1 | **非致命** | 记录失败字体。后续涉及该字体的文本替换全部跳过，保留原始文本 | Issue | ✅ 继续 |
| E4 | 全部字体加载失败（没有任何字体可用） | Phase 1 | **降级** | 仍可执行克隆与图片替换（若存在图片映射）。每个文本映射产生 Issue | Issue | ✅ 继续 |
| E5 | `clone()` 操作抛出异常 | Phase 2 | **行级致命** | 跳过当前行，不生成该行 Frame，记录 Issue，继续下一行 | Issue | ✅ 继续 |
| E6 | 克隆后的图层路径遍历未找到目标 | Phase 2 | **非致命** | 跳过该映射，记录 Issue，继续处理该行的其他映射 | Issue | ✅ 继续 |
| E7 | 文本单元格值为空 | Phase 2 | **非致命** | 保留模板原始文本，记录 Issue | Issue | ✅ 继续 |
| E8 | 图片 base64 解码失败（格式错误、非法字符） | Phase 2 | **非致命** | 清空图层 fills，记录 Warning | Warning | ✅ 继续 |
| E9 | `figma.createImage()` 调用失败（数据损坏） | Phase 2 | **非致命** | 清空图层 fills，记录 Warning | Warning | ✅ 继续 |
| E10 | 目标节点不支持 `fills` 属性（如纯 Group） | Phase 2 | **非致命** | 跳过图片替换，记录 Warning | Warning | ✅ 继续 |
| E11 | 用户取消生成操作 | Phase 2 | **用户触发** | 完成当前行后停止，仅布局已生成 Frame，发送 `generation-cancelled` | — | ❌ 停止 |
| E12 | 布局阶段某 Frame ID 无效（已被外部操作删除） | Phase 3 | **非致命** | `getNodeById` 返回 null → 跳过该 Frame 的布局，继续排列其他 | — | ✅ 继续 |
| E13 | 内存不足（极端大量数据） | 任意 | **致命** | 尽力而为，若沙箱崩溃则 Figma 自行恢复 | Error | ❌ 崩溃 |

### 6.2 错误恢复策略

**逐行隔离原则：**

单行生成失败**不应影响**其他行的生成。例如，第 5 行的图片解码失败不应该阻止第 6 行的正常生成。每一行都是一个独立的生成单元，拥有独立的 `try-catch` 保护。

```typescript
async function generateBatch(config: GenerationConfig): Promise<void> {
  for (let i = 0; i < config.data.length; i++) {
    try {
      const result = await processRow(templateFrame, config.data[i], config.mappings, failedFonts);
      results.push(result);
      frameIds.push(result.frameId);
    } catch (unexpectedError) {
      // 兜底：捕获 processRow 中未预料的异常
      results.push({
        rowIndex: i,
        frameId: '',
        issues: [{
          rowIndex: i,
          columnName: '',
          layerName: '',
          reason: 'clone_failed'
        }],
        warnings: []
      });
      // 继续下一行
    }

    if (cancellationRequested) break;
  }
}
```

### 6.3 日志与调试

由于 Figma 插件没有独立日志系统，使用 `console.log` / `console.warn` / `console.error` 进行调试输出：

```typescript
const LOG_PREFIX = '[Task-05 Generation]';

async function logGenerationStart(config: GenerationConfig) {
  console.log(`${LOG_PREFIX} 开始生成`, {
    rows: config.data.length,
    mappings: config.mappings.length,
    template: config.templateName,
  });
}

function logRowComplete(rowIndex: number, issues: number, warnings: number) {
  if (issues > 0 || warnings > 0) {
    console.warn(`${LOG_PREFIX} 行 ${rowIndex} 完成: ${issues} issue(s), ${warnings} warning(s)`);
  }
}

function logFontLoading(failed: string[]) {
  if (failed.length > 0) {
    console.error(`${LOG_PREFIX} 字体加载失败: ${failed.join(', ')}`);
  }
}
```

> **注意：** 日志输出应在正式发布时通过构建工具移除或包裹为开发模式限定词（如 `if (DEV) {}`）。

---

## 7. 性能优化

### 7.1 优化点总结

| 优化点 | 策略 | 预期收益 |
|--------|------|---------|
| **字体预加载去重** | Phase 1 一次性加载所有唯一字体，避免逐行重复加载 | 将 O(n × m) 次字体加载减少为 O(u)，其中 u = 唯一字体数（通常 1-3） |
| **进度上报节流** | 每 5 行 + 500ms 双重节流，减少 postMessage 调用 | 将 n 次消息传递减少为约 n/5 次，显著降低消息序列化开销 |
| **同步克隆** | `clone()` 为同步操作，无 I/O 开销 | 单个克隆 < 5ms，100 个 < 500ms |
| **避免跨克隆缓存** | 不尝试缓存节点引用，直接路径遍历 | 避免无效缓存导致的 Bug，以极小的遍历代价换取正确性 |
| **图片数据预传输** | 图片 base64 数据已在 `start-generation` 消息中一次性传输，无需运行时分段加载 | 零运行时网络开销 |

### 7.2 性能基准测试计划

| 场景 | 行数 | 映射数 | 字体数 | 图片 | 预期耗时 |
|------|------|--------|--------|------|---------|
| 基准 | 100 | 5 文本 | 1 | 0 | < 5s |
| 多字体 | 100 | 10 文本 | 3 | 0 | < 8s |
| 多图片 | 100 | 10 图片 | 0 | 10 | < 15s |
| 混合 | 100 | 5 文本 + 5 图片 | 2 | 5 | < 20s |
| 压力 | 200 | 20 文本 + 10 图片 | 5 | 10 | < 60s（超 NFR 但作为参考） |

### 7.3 性能监控埋点

在关键阶段记录时间戳用于分析瓶颈：

```typescript
interface PerformanceMetrics {
  fontLoadingMs: number;
  generationMs: number;
  layoutMs: number;
  totalMs: number;
  rowsPerSecond: number;
}

function measurePerformance(
  startTime: number,
  fontEndTime: number,
  genEndTime: number,
  layoutEndTime: number,
  totalRows: number
): PerformanceMetrics {
  return {
    fontLoadingMs: fontEndTime - startTime,
    generationMs: genEndTime - fontEndTime,
    layoutMs: layoutEndTime - genEndTime,
    totalMs: layoutEndTime - startTime,
    rowsPerSecond: (totalRows / ((genEndTime - fontEndTime) / 1000)),
  };
}
```

> 性能指标可在开发阶段记录到 `console`，用于验证 NFR-03 达标情况。生产环境移除或降级为 debug 模式。

---

## 8. Figma API 注意事项

### 8.1 API 约束清单

| API | 约束 | 影响 |
|-----|------|------|
| `figma.loadFontAsync(fontName)` | **必须在设置 `textNode.characters` 之前调用**。若不调用，`characters` 赋值将抛出异常 | 必须在 Phase 1 中完成所有字体加载 |
| `figma.createImage(bytes)` | 接受 `Uint8Array` 类型的图片二进制数据，返回 `Image` 对象 | 需要自定义 base64 解码器生成 `Uint8Array` |
| `figma.createImage(bytes)` | 返回的 `Image` 对象不含 `.src` 或 `.data`，只有 `.hash` | 通过 `imageHash` 引用图片，无法直接读取图片数据 |
| `node.clone()` | 返回的克隆节点是"游离"的（detached），不自动挂载到文档树 | 必须手动调用 `parent.appendChild(clone)` |
| `textNode.characters` | 设置该属性**不会**修改 fontName、fontSize、fills 等样式属性 | 天然满足 NFR-01，无需额外样式回写 |
| `textNode.characters` | 对于包含多种样式片段的文本节点，设置后保留所有 style segments 范围 | 若新文本长度变化，style segments 可能错位（详见 2.3.1） |
| `node.fills = [...]` | **覆盖替换**整个 fills 数组，非追加 | 需要将模板原有的多个 fills 一并考虑。MVP 简化为单一 ImagePaint |
| `figma.currentPage` | 当前活动页面的引用 | 所有生成的新 Frame 添加到此页面 |
| 无 `atob` / `btoa` | Figma 沙箱没有 window 对象 | 必须实现纯 TypeScript base64 解码器 |

### 8.2 常见陷阱

**陷阱 1：忘记 `appendChild`**

```typescript
// ❌ 错误：克隆后忘记添加到页面
const clone = templateFrame.clone();
clone.x = 100; // 可设置属性，但节点不可见

// ✅ 正确：先添加再操作
const clone = templateFrame.clone();
figma.currentPage.appendChild(clone);
clone.x = 100; // 现在可见且可编辑
```

**陷阱 2：字体加载与字符设置顺序**

```typescript
// ❌ 错误：未预加载字体直接设置 characters
node.characters = "Hello";  // 抛出异常：Font not loaded

// ✅ 正确：先加载字体
await figma.loadFontAsync({ family: "Inter", style: "Regular" });
node.characters = "Hello";
```

**陷阱 3：修改克隆节点属性导致模板被修改**

`clone()` 返回的节点是完全独立的副本。修改克隆节点的任何属性都不会影响原始模板节点。这是正确的行为，无需特殊处理。

**陷阱 4：`figma.createImage()` 不支持 SVG**

`figma.createImage()` 接受的是光栅图片格式（PNG、JPEG、GIF、WebP），**不支持 SVG 矢量图**。如果 Excel 中嵌入的是 SVG 图片，会产生 Warning。

---

## 9. 验收标准

### 9.1 测试用例矩阵

| 编号 | 测试场景 | 对应需求 | 验收标准 |
|------|---------|---------|---------|
| TC-01 | 生成 3 行数据，仅文本映射 | FR-15, FR-16, FR-17 | 生成 3 个 Frame，文本内容与数据一致，字体/字号/颜色与模板一致 |
| TC-02 | 生成 4 行数据，文本 + 图片映射 | FR-16, FR-17 | 4 个 Frame，文本正确，图片正确显示，styles 保持不变 |
| TC-03 | 映射的文本字段对应空单元格 | FR-25 | 该图层保留模板原始文本，行结果标记 Issue（`empty_text`） |
| TC-04 | 图片解码失败（损坏的 base64） | FR-23, FR-24 | 该图层 fills 清空（空白），标记 Warning，同 Frame 其他字段正常填充 |
| TC-05 | 生成中途取消操作 | NFR-04 | 已生成的 Frame 保留在画布且已布局，未生成的行不再处理，UI 收到 `generation-cancelled` |
| TC-06 | 100 行纯文本数据生成 | NFR-03 | 总耗时 < 30 秒（首次含字体加载） |
| TC-07 | 50 行数据生成 | NFR-03 | 总耗时 < 15 秒 |
| TC-08 | 所有 Frame 网格布局排列 | FR-18 | 每行 4 个 Frame，行内水平间距 100px，行间垂直间距 100px |
| TC-09 | 混合映射：部分字段映射，部分未映射 | FR-17, FR-26 | 已映射字段内容更新，未映射图层保持模板原始内容不变 |
| TC-10 | 零映射生成 | FR-15 | 生成与行数相等的模板副本，全部内容不变，仅执行克隆与布局 |
| TC-11 | 字体不可用（模拟） | NFR-01 | 该字段保留原始文本，标记 Issue（`font_load_failed`），其他字段正常填充 |
| TC-12 | 图层路径失效（模板修改后） | FR-17 | 标记 Issue（`layer_not_found`），跳过该映射，继续处理其他 |

### 9.2 测试执行环境

- **Figma 桌面客户端**（macOS / Windows）
- Figma Editor 模式（非 Dev Mode）
- 测试用 `.xlsx` 文件及配套 `.fig` 模板文件

### 9.3 通过标准

- 所有 TC-01 到 TC-12 测试用例通过
- 无 console.error 级别的未处理异常（预期的用户提示除外）
- 100 行生成耗时 < 30 秒（CI 困难，改用手动验收）

---

## 10. 产出文件清单

### 10.1 新增文件

```
src/
└── core/
    └── generation/
        ├── index.ts              # 生成引擎入口，导出主函数 executeGeneration()
        ├── types.ts              # 生成相关类型定义（GenerationConfig, TableRowData, Issue, Warning 等）
        ├── generate-batch.ts     # 批量生成主控制器（Phase 0-4 的编排逻辑）
        ├── process-row.ts       # 单行处理逻辑（克隆 + 遍历映射 + 内容替换）
        ├── find-node.ts         # 图层路径查找算法 findNodeInCloneByPath()
        ├── replace-text.ts      # 文本替换逻辑 processTextMapping()
        ├── replace-image.ts     # 图片替换逻辑 processImageMapping()
        ├── base64-decoder.ts    # 纯 TypeScript base64 → Uint8Array 解码器
        ├── font-preloader.ts    # 字体预加载（collectUniqueFontNames + preloadFonts）
        ├── layout.ts            # Frame 网格布局算法 layoutGeneratedFrames()
        ├── cancel.ts            # 取消机制管理（cancellationRequested 标志 + registerCancelHandler）
        ├── progress.ts          # 进度上报节流逻辑 sendProgress()
        ├── errors.ts            # 错误分类与 Issue/Warning 构建辅助函数
        └── constants.ts         # 布局常量（COLS_PER_ROW, H_GAP, V_GAP 等）

```

### 10.2 修改文件

```
src/
├── code.ts                      # 注册消息处理器（start-generation, cancel-generation），调用 executeGeneration()
└── core/
    └── types/
        └── index.ts             # 补全 GenerationConfig, TableRowData, CellValue, GenerationRowResult 等的类型定义
```

### 10.3 文件职责矩阵

| 文件 | 职责 | 行数估算 |
|------|------|---------|
| `generation/index.ts` | 聚合导出，公共 API 入口 | ~20 |
| `generation/types.ts` | 所有生成相关类型、接口定义 | ~80 |
| `generation/generate-batch.ts` | 四阶段编排（校验→字体→循环→布局） | ~120 |
| `generation/process-row.ts` | 单行克隆 + 映射遍历 + 错误收集 | ~100 |
| `generation/find-node.ts` | 路径匹配算法实现 | ~50 |
| `generation/replace-text.ts` | 文本替换 + 空值检测 + Issue 记录 | ~60 |
| `generation/replace-image.ts` | 图片解码 + createImage + Warning 记录 | ~80 |
| `generation/base64-decoder.ts` | 纯 TS base64 → Uint8Array | ~80 |
| `generation/font-preloader.ts` | 字体收集 + 去重 + 并行加载 | ~50 |
| `generation/layout.ts` | 网格布局坐标计算 | ~50 |
| `generation/cancel.ts` | 取消标志管理 + 消息监听注册 | ~30 |
| `generation/progress.ts` | 节流上报逻辑 | ~40 |
| `generation/errors.ts` | Issue/Warning 工厂函数 | ~40 |
| `generation/constants.ts` | 布局常量定义 | ~15 |
| **合计** | | **~815 行** |

---

## 附录 A：与上下游 Task 的接口约定

### A.1 上游依赖：Task-04 映射 (MappingEntry)

Task-04 必须提供 `MappingEntry` 对象，生成引擎依赖以下字段：

```typescript
interface MappingEntry {
  type: 'text' | 'image';           // 必须：映射类型
  columnIndex: number;              // 必须：对应 Excel 列索引
  columnHeader: string;             // 必须：列名（用于 Issue 报告）
  layerPath: string;                // 必须：完整路径字符串（含模板名段）
  layerName: string;                // 必须：图层名（用于 Issue 报告）
}
```

### A.2 上游依赖：Task-02 数据源 (TableRowData)

Task-02 必须提供 `TableRowData` 对象，生成引擎依赖以下字段：

```typescript
interface TableRowData {
  rowIndex: number;                         // 必须：0-based 行索引
  cells: Record<number, CellValue>;         // 必须：columnIndex → CellValue
}
```

其中 `CellValue` 分为：
- `TextCellValue`：`{ type: 'text', value: string }` — value 为非 null 且去除空白后长度 > 0 时视为有效
- `ImageCellValue`：`{ type: 'image', base64: string, mimeType: string, fileName?: string }` — base64 为 `data:` 协议的完整 Data URL 字符串

### A.3 下游依赖：Task-06 集成层

Task-06 负责：
- UI 侧"生成"按钮事件处理
- 构造 `GenerationConfig` 对象并发送 `start-generation` 消息
- 接收并展示进度更新、结果报告、错误信息
- "取消"按钮的 UI 交互与 `cancel-generation` 消息发送

---

## 附录 B：术语表

| 术语 | 英文 | 定义 |
|------|------|------|
| 沙箱 | Sandbox | Figma 插件的后端执行环境（`code.ts`），可访问 `figma` 全局 API |
| UI | UI | Figma 插件的用户界面（`ui.html`），运行在浏览器 iframe 中 |
| 模板 Frame | Template Frame | 用户在 Figma 画布上选择作为批量生成模板的 Frame 节点 |
| 克隆 | Clone | 通过 `BaseNode.clone()` 创建的模板 Frame 副本 |
| 映射 | Mapping | Excel 列与 Figma 模板图层的对应关系 |
| Issue | Issue | 需要用户关注的生成问题（如文本为空），不影响生成继续 |
| Warning | Warning | 非致命提示（如图片解码失败），不影响生成继续 |
| 路径 | Path | 以 `>` 分隔的图层层级字符串，用于在克隆中定位目标图层 |
| 字体预加载 | Font Preloading | 在生成循环前批量加载所有唯一字体，避免逐行重复加载 |
| Data URL | Data URL | `data:[<mediatype>][;base64],<data>` 格式的 URI 字符串 |

---

## 附录 C：变更记录

| 版本 | 日期 | 作者 | 变更内容 |
|------|------|------|---------|
| 1.0 | 2026-05-14 | — | 初始版本，完整规格编写 |
