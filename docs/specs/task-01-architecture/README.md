# 任务 01：项目脚手架与架构搭建

---

## 1. 任务概述

| 属性 | 内容 |
|------|------|
| **Task ID** | `TASK-01` |
| **任务名称** | 项目脚手架与架构搭建 |
| **优先级** | P0（最高优先级，阻塞所有后续任务） |
| **前置依赖** | 无——本任务是整个项目的基石 |
| **后续任务** | TASK-02（数据源模块）、TASK-03（模板模块）、TASK-04（映射模块）、TASK-05（生成模块）、TASK-06（集成联调） |

### 1.1 任务目标

本任务负责搭建项目的完整工程骨架，使后续五个功能模块的实现有据可依。具体包括：

1. 建立清晰的分层目录结构，将 **Figma 沙盒代码**（Sandbox）与 **浏览器 iframe 代码**（UI）物理隔离，并通过 `shared/` 目录共享类型与协议定义。
2. 定义全部 TypeScript 类型/接口，覆盖数据源、模板、映射、生成四个核心领域，确保类型在 Sandbox 与 UI 间一致。
3. 设计完整、无歧义的 `postMessage` 消息协议，使两个执行上下文的通信有明确的契约。
4. 搭建与清单文件（`manifest.json`）兼容的构建系统，确保输出产物路径正确，且所有第三方库（如 SheetJS）被内联打包，不依赖运行时外部网络。
5. 安装并锁定全部第三方依赖。
6. 产出本任务范围内的全部源文件。

### 1.2 边界说明

- 本任务**不实现**任何业务逻辑，仅搭建结构骨架与类型定义。
- 未提及的文件不创建；已存在但与本任务无关的文件不修改。
- 所有代码文件内容为有效的 TypeScript/HTML/CSS，能够通过构建系统成功编译/打包为最终产物（输出 `code.js` 与 `ui.html`），但不要求运行时产生任何功能行为。

---

## 2. 目录结构设计

### 2.1 设计原则

- **按执行上下文分层**：Sandbox 与 UI 是两个完全不同运行时环境，代码不可互相引用，必须物理隔离。
- **共享类型与协议集中管理**：所有跨上下文共享的定义放在 `src/shared/`，两端各自通过 TypeScript 项目引用或构建工具 alias 来消费。
- **每个文件职责单一**：一个文件只负责一个明确的概念或模块，便于后续任务独立修改。
- **入口文件位置与 manifest.json 一致**：
  - 主代码入口编译后产出为项目根目录下的 `code.js`（对应 `manifest.json` 的 `main` 字段）。
  - UI 入口编译后产出为项目根目录下的 `ui.html`（对应 `manifest.json` 的 `ui` 字段）。

### 2.2 完整目录树

```
cp-workflow/
├── manifest.json                    # Figma 插件清单（已存在，本任务不修改）
├── package.json                     # npm 配置（本任务会修改 scripts 与 dependencies）
├── tsconfig.json                    # TypeScript 配置（本任务会修改）
├── tsconfig.sandbox.json            # [新增] Sandbox 专用 TS 配置
├── tsconfig.ui.json                 # [新增] UI 打包入口的 TS 配置（供 esbuild 插件读取）
├── eslint.config.js                 # ESLint 配置（已存在，本任务不修改）
├── README.md                        # 项目说明（已存在，本任务不修改）
├── yarn.lock                        # 依赖锁定（本任务会因新增依赖而更新）
│
├── code.js                          # 编译产物 — Sandbox 入口（由构建生成，纳入 .gitignore）
├── ui.html                          # 编译产物 — UI 入口（由构建生成，纳入 .gitignore）
│
└── src/                             # 全部源代码根目录
    │
    ├── sandbox/                     # === Figma 沙盒代码 ===
    │   ├── main.ts                  # 沙盒入口 — 负责启动插件、注册消息监听、调度各模块
    │   ├── message-handler.ts       # 消息分发器 — 根据 message.type 路由到对应处理函数
    │   ├── layer-scanner.ts         # 图层扫描器 — 遍历模板 Frame 识别可映射的占位层
    │   ├── frame-cloner.ts          # Frame 克隆器 — 深度克隆模板 Frame 及其子孙节点
    │   ├── content-filler.ts        # 内容填充器 — 将文本/图片写入克隆 Frame 的对应图层
    │   ├── layout-engine.ts         # 布局引擎 — 将生成结果在画布上排列成行列布局
    │   └── constants.ts             # 沙盒常量 — 沙盒特有的阈值与配置（如间距、字体回退值）
    │
    ├── ui/                          # === 浏览器 iframe 代码 ===
    │   ├── index.html              # UI 入口 HTML — 包含 <script> 和 <link> 引用
    │   ├── app.ts                   # UI 主应用 — 初始化组件、绑定全局事件、协调各模块
    │   ├── message-handler.ts       # 消息分发器 — 处理来自 Sandbox 的消息
    │   ├── file-parser.ts           # 文件解析器 — 调用 SheetJS 解析 .xlsx / .csv
    │   ├── field-list.ts            # 字段列表组件 — 渲染表格列清单 UI
    │   ├── layer-list.ts            # 图层列表组件 — 渲染模板可映射层清单 UI
    │   ├── mapping-view.ts          # 映射视图组件 — 渲染字段↔图层映射配置 UI
    │   ├── progress-bar.ts          # 进度条组件 — 生成过程实时进度展示
    │   ├── result-view.ts           # 结果视图组件 — 生成完成后展示摘要与问题行
    │   └── styles.css               # 全局样式 — UI 面板的全部 CSS（轻量，无框架依赖）
    │
    └── shared/                      # === 跨上下文共享 ===
        ├── types.ts                 # 类型定义 — 全部 TypeScript 类型与接口
        ├── messages.ts              # 消息协议 — postMessage 的消息类型与载荷定义
        └── constants.ts             # 共享常量 — 图层类型、节点类型、错误消息等

```

> **注意**：根目录下的 `code.ts` 与 `ui.html` 是当前 Figma 模板提供的样板文件。本任务执行时需删除它们，并在 `src/sandbox/main.ts` 与 `src/ui/index.html` 中重新创建入口。

### 2.3 各文件职责说明

#### 2.3.1 `src/sandbox/` — 沙盒层

| 文件 | 职责 | 运行环境 |
|------|------|----------|
| `main.ts` | 入口。调用 `figma.showUI()` 显示 UI；注册 `figma.ui.onmessage` 监听；初始化各子模块；处理插件生命周期事件（`figma.on('selectionchange')` 等）。 | Figma 沙盒 |
| `message-handler.ts` | 接收来自 UI 的 PluginMessage，按 `message.type` 分发到 `layer-scanner`、`frame-cloner` 等处理函数；收集结果后通过 `figma.ui.postMessage()` 回复 UI。 | Figma 沙盒 |
| `layer-scanner.ts` | 遍历指定 Frame 的子树，收集所有 `TEXT` 与 `IMAGE` 类型的可填充节点；对每个节点生成 `LayerInfo` 对象（含 id、name、type、path）。遇到嵌套 Frame 时停止深入。 | Figma 沙盒 |
| `frame-cloner.ts` | 接收模板 Frame 引用，调用 Figma API 深度克隆（包括所有子节点）；返回克隆后的 Frame 引用。 | Figma 沙盒 |
| `content-filler.ts` | 接收克隆 Frame、映射配置、数据行；将对应的文本值写入文本节点，将图片数据写入图片节点；保持原节点样式不变。 | Figma 沙盒 |
| `layout-engine.ts` | 将生成的所有 Frame 在画布上按行列规则排列；计算合理的间距和换行位置。 | Figma 沙盒 |
| `constants.ts` | 沙盒特有常量：默认列间距、行间距、最大列数、生成节流间隔等。 | Figma 沙盒 |

#### 2.3.2 `src/ui/` — UI 层

| 文件 | 职责 | 运行环境 |
|------|------|----------|
| `index.html` | HTML 入口。加载打包后的 JS 与 CSS；提供基础的 DOM 骨架（用于各组件挂载的容器 div）。 | 浏览器 iframe |
| `app.ts` | UI 主逻辑。初始化所有子组件；管理全局状态（当前选中模板、数据源、映射配置）；响应 UI 事件（文件上传、按钮点击等）。 | 浏览器 iframe |
| `message-handler.ts` | 接收来自 Sandbox 的 PluginMessage，分发给对应组件更新 UI 状态。 | 浏览器 iframe |
| `file-parser.ts` | 接收用户上传的文件（.xlsx / .csv），调用 SheetJS 库解析为 `SourceTable` 对象；处理解析错误并返回友好提示。 | 浏览器 iframe |
| `field-list.ts` | 渲染表格字段列表 UI；展示列名、列类型图标、样例值预览；支持字段选择（用于映射）。 | 浏览器 iframe |
| `layer-list.ts` | 渲染模板可映射图层列表 UI；展示图层名称、类型、路径；支持图层选择（用于映射）。 | 浏览器 iframe |
| `mapping-view.ts` | 渲染映射配置界面；提供字段对图层的绑定/解绑操作；校验映射约束（同列不重复映射、不同列不同目标）。 | 浏览器 iframe |
| `progress-bar.ts` | 渲染进度条；接收 `GenerationProgress` 消息更新进度；提供取消按钮。 | 浏览器 iframe |
| `result-view.ts` | 渲染生成结果摘要；展示成功数、问题行数、warning 数与详细信息列表。 | 浏览器 iframe |
| `styles.css` | 全部 UI 样式。采用轻量级 CSS，不依赖任何 CSS 框架。使用 CSS 变量控制配色，适配 Figma 插件面板的浅色/深色主题。 | 浏览器 iframe |

#### 2.3.3 `src/shared/` — 共享层

| 文件 | 职责 |
|------|------|
| `types.ts` | 定义全部领域类型的 TypeScript `interface` 与 `type`，供 Sandbox 与 UI 通过 import 共享。所有导出类型附带 JSDoc 注释。 |
| `messages.ts` | 定义 `PluginMessage` 可辨识联合类型；对每个消息定义独立接口（含 `type` 字面量类型与 payload 字段）；定义所有消息类型字符串常量。 |
| `constants.ts` | 定义跨上下文共享的常量：Figma 节点类型常量映射、图层类型枚举、错误消息字符串集、生成的默认参数等。 |

---

## 3. 类型系统设计

> 所有类型定义在 `src/shared/types.ts` 中。每个类型附带完整的 JSDoc 字段说明。

### 3.1 核心领域类型

#### 3.1.1 `SourceTable` — 数据源表格

```typescript
/**
 * 从 Excel/CSV 文件解析出的表格数据
 * 代表用户上传的完整数据源
 */
interface SourceTable {
  /** 表格中的所有列（字段）定义 */
  fields: TableField[];
  /** 表格中的所有数据行 */
  rows: TableRow[];
  /** 源文件名（如 "商品数据.xlsx"），用于 UI 展示 */
  fileName: string;
  /** 源文件扩展名（如 "xlsx" / "csv"），用于判断文件类型 */
  fileExtension: string;
  /** 总行数（不含表头），与 rows.length 一致 */
  totalRows: number;
  /** 总列数，与 fields.length 一致 */
  totalColumns: number;
}
```

#### 3.1.2 `TableRow` — 数据行

```typescript
/**
 * 表格中的单行数据
 * 每一行对应一个即将生成的模板实例
 */
interface TableRow {
  /** 行索引（0-based，对应表格中的数据行位置，不含表头行） */
  index: number;
  /**
   * 该行的所有单元格值，key 为列名（来自 TableField.name）
   * 例如：{ "标题": "春季促销", "价格": "99元", "图片": { ... } }
   */
  cells: Record<string, CellValue>;
}
```

#### 3.1.3 `TableField` — 列定义

```typescript
/**
 * 表格中的一列（字段）定义
 */
interface TableField {
  /** 列名（表头文本）。若无表头行，显示为 "列 A" / "列 B" / ... */
  name: string;
  /** 列索引（0-based），对应表格中的列位置（A=0, B=1, ...） */
  index: number;
  /** 列的数据类型 */
  type: FieldType;
  /**
   * 该列第一个有效（非空）单元格的样例值
   * 用于 UI 中展示数据预览，帮助用户识别列内容
   * 文本列展示截断后的前 50 个字符；图片列展示占位标识
   */
  sample: string;
}

/**
 * 字段（列）的数据类型
 */
type FieldType = 'text' | 'image';
```

#### 3.1.4 `CellValue` — 单元格值

```typescript
/**
 * 单元格值的联合类型
 * - string: 文本列（包括数字被解析成的字符串）
 * - ImageData: Excel 内嵌图片列
 * - null: 空单元格
 */
type CellValue = string | ImageData | null;
```

#### 3.1.5 `ImageData` — Excel 内嵌图片数据

```typescript
/**
 * 从 Excel 单元格内提取的图片资源
 * 注意：图片数据以 base64 Data URL 形式存储，
 * 经由 postMessage 从 UI 传递到 Sandbox
 */
interface ImageData {
  /** 源文件名或图片索引标识（如 "image1.png"），用于日志与调试 */
  name: string;
  /**
   * 图片的 base64 编码 Data URL
   * 格式：data:image/png;base64,iVBORw0KGgo...
   * Sandbox 侧调用 figma.createImage() 加载此数据
   */
  dataUrl: string;
  /** MIME 类型，如 "image/png" / "image/jpeg" */
  mimeType: string;
  /**
   * 原始字节大小（bytes），用于校验数据完整性
   * 不包含 base64 编码膨胀，指原始图片文件的大小
   */
  byteSize: number;
}
```

#### 3.1.6 `LayerInfo` — 图层信息

```typescript
/**
 * 模板 Frame 中扫描到的一个图层信息
 * 包括文本图层（TEXT）、图片图层（RECTANGLE with image fill 等）
 */
interface LayerInfo {
  /** Figma 节点 ID，全局唯一标识 */
  id: string;
  /** 图层在 Figma 图层面板中显示的名称 */
  name: string;
  /** 图层的 Figma 节点类型，如 "TEXT"、"RECTANGLE"、"ELLIPSE" 等 */
  nodeType: string;
  /** 图层在文档树中的路径，用 " > " 分隔，如 "Frame > Group > Title" */
  path: string;
  /**
   * 图层当前的内容描述
   * - 文本层：当前文本字符（截断到 100 字符）
   * - 图片层：fill 类型描述（如 "IMAGE" / "SOLID"）
   */
  currentContent: string;
  /**
   * 图层分类类型，用于判断该层可接收哪种数据
   * - 'text': 文本层，可接收文本 MapField
   * - 'image': 图片层，可接收图片 MapField
   * - 'other': 其他类型，不可映射
   */
  layerType: LayerType;
}

/**
 * 图层分类类型
 */
type LayerType = 'text' | 'image' | 'other';
```

#### 3.1.7 `PlaceholderLayer` — 可映射占位层

```typescript
/**
 * 模板中可被字段映射的占位层（继承 LayerInfo，仅包含 text/image 类型）
 * 过滤掉 layerType === 'other' 的节点
 */
interface PlaceholderLayer extends LayerInfo {
  layerType: 'text' | 'image';
}
```

#### 3.1.8 `MappingEntry` — 映射条目

```typescript
/**
 * 一条映射关系：将「表格列字段」映射到「模板图层」
 * 每个 MappingEntry 代表用户 UI 中的一行映射配置
 */
interface MappingEntry {
  /** 映射条目的唯一标识（UUID），用于 UI 中 tracking */
  id: string;
  /** 源字段名称（对应 TableField.name） */
  sourceField: string;
  /** 源字段类型 */
  sourceFieldType: FieldType;
  /** 目标图层 ID（对应 PlaceholderLayer.id） */
  targetLayerId: string;
  /** 目标图层名称（对应 PlaceholderLayer.name），用于 UI 展示 */
  targetLayerName: string;
  /** 目标图层类型 */
  targetLayerType: 'text' | 'image';
}
```

#### 3.1.9 `MappingConfig` — 映射配置集

```typescript
/**
 * 用户配置的完整映射关系集合
 * 从 MappingView 组件收集，传递给生成引擎
 */
interface MappingConfig {
  /** 映射条目列表 */
  entries: MappingEntry[];
  /** 模板 Frame 的节点 ID，用于 Sandbox 侧定位模板 */
  templateNodeId: string;
  /** 模板 Frame 名称，用于 UI 展示与日志 */
  templateName: string;
  /** 映射创建时间戳（毫秒） */
  createdAt: number;
  /** 映射最后修改时间戳（毫秒） */
  updatedAt: number;
}
```

#### 3.1.10 `GenerationConfig` — 生成请求配置

```typescript
/**
 * 传递给 Sandbox 的完整生成请求
 * 包含模板信息、映射关系、全部表格数据
 */
interface GenerationConfig {
  /** 映射配置 */
  mapping: MappingConfig;
  /** 表格数据源（包含全部行） */
  sourceTable: SourceTable;
  /**
   * 底图 PNG 的 base64 Data URL（可选）
   * 模板 Frame 的外观截图，用于 Sandbox 侧还原时的视觉参考
   * 若模板无视觉效果或不需要，可为 null
   */
  templatePreviewDataUrl: string | null;
  /** 布局配置 */
  layout: LayoutSettings;
}

/**
 * 生成结果的画布布局设置
 */
interface LayoutSettings {
  /** 每行放置的最大 Frame 数量，超出则换行 */
  columns: number;
  /** 列间距（像素） */
  horizontalGap: number;
  /** 行间距（像素） */
  verticalGap: number;
}
```

#### 3.1.11 `GenerationProgress` — 生成进度

```typescript
/**
 * Sandbox 发送给 UI 的实时进度更新
 * 每处理完一行数据发送一次
 */
interface GenerationProgress {
  /** 当前已处理的序号（1-based，即第几条数据） */
  current: number;
  /** 总需处理的数据行数 */
  total: number;
  /** 当前进度状态 */
  status: GenerationStatus;
  /**
   * 当前正在处理的行索引（0-based，对应 TableRow.index）
   * 用于发生错误时定位具体行
   */
  currentRowIndex: number;
}

type GenerationStatus = 'running' | 'cancelling' | 'cancelled';
```

#### 3.1.12 `GenerationResult` — 生成结果摘要

```typescript
/**
 * 生成完成后的结果摘要
 * Sandbox 在所有行处理完毕后发送此消息
 */
interface GenerationResult {
  /** 成功生成的 Frame 数量 */
  successCount: number;
  /** 存在问题的行数 */
  issueCount: number;
  /** 本次生成的总行数（sourceTable.rows.length） */
  totalRows: number;
  /** 问题行列表（已映射文本字段对应单元格为空的行） */
  issues: Issue[];
  /** 警告列表（图片提取失败等非阻塞问题） */
  warnings: Warning[];
  /** 生成开始时间戳 */
  startTime: number;
  /** 生成结束时间戳 */
  endTime: number;
}
```

#### 3.1.13 `Issue` — 问题行信息

```typescript
/**
 * 某一行中被映射的文本字段对应单元格为空时产生的问题记录
 */
interface Issue {
  /** 问题行在数据源中的索引（0-based） */
  rowIndex: number;
  /**
   * 出现空值的字段名
   * 注意：一个行可能有多个字段为空，因此 issueCount 按字段计数
   */
  fieldName: string;
  /** 目标图层名称，用于定位 */
  layerName: string;
  /** 问题描述（如 "字段「标题」在第 3 行的单元格为空，已保留模板原始文本"） */
  message: string;
}
```

#### 3.1.14 `Warning` — 警告信息

```typescript
/**
 * 非阻塞的警告信息
 * 如图片提取失败：该 Frame 仍正常生成，仅图片位置保持空白
 */
interface Warning {
  /** 数据行索引（0-based） */
  rowIndex: number;
  /** 出问题的字段名 */
  fieldName: string;
  /** 警告描述 */
  message: string;
}
```

### 3.2 辅助类型

```typescript
/**
 * 用户当前在 Figma 画布上的选择状态
 * 用于 UI 端模板选择校验
 */
interface SelectionInfo {
  /** 是否选中了任何对象 */
  hasSelection: boolean;
  /** 选中的节点数量 */
  selectionCount: number;
  /** 选中的节点列表信息（仅返回第一个的摘要信息） */
  selectedNodes: SelectedNodeSummary[];
}

/**
 * 选中节点的摘要信息
 */
interface SelectedNodeSummary {
  /** 节点 ID */
  id: string;
  /** 节点名称 */
  name: string;
  /** Figma 节点类型（"FRAME" / "GROUP" / "COMPONENT" / ...） */
  type: string;
  /** 该节点是否为 Frame */
  isFrame: boolean;
}
```

---

## 4. 消息协议设计

> 所有消息定义在 `src/shared/messages.ts` 中。
> 消息通过 `parent.postMessage({ pluginMessage: msg }, '*')` （UI→Sandbox）和
> `figma.ui.postMessage(msg)` （Sandbox→UI）传递。

### 4.1 消息类型常量

```typescript
/** UI → Sandbox 消息类型 */
const UI_TO_SANDBOX = {
  UI_READY:                    'ui-ready',
  REQUEST_SELECTION_INFO:      'request-selection-info',
  REQUEST_TEMPLATE_LAYERS:     'request-template-layers',
  START_GENERATION:            'start-generation',
  CANCEL_GENERATION:           'cancel-generation',
} as const;

/** Sandbox → UI 消息类型 */
const SANDBOX_TO_UI = {
  SELECTION_CHANGED:           'selection-changed',
  TEMPLATE_LAYERS:             'template-layers',
  GENERATION_PROGRESS:         'generation-progress',
  GENERATION_COMPLETE:         'generation-complete',
  GENERATION_CANCELLED:        'generation-cancelled',
  GENERATION_ERROR:            'generation-error',
} as const;
```

### 4.2 消息详细定义

#### 4.2.1 UI → Sandbox 消息

##### `ui-ready`
- **触发时机**：UI iframe 完成加载，DOM 就绪，所有初始化逻辑执行完毕。
- **目的**：告知 Sandbox，UI 侧已准备好接收消息。Sandbox 收到后可以开始主动推送数据（如当前选择状态）。
- **Payload**：空对象 `{}`

```typescript
interface UiReadyMessage {
  type: 'ui-ready';
  payload: Record<string, never>;
}
```

##### `request-selection-info`
- **触发时机**：用户在 UI 中点击"刷新选择"按钮，或 UI 初始加载完成后自动触发。
- **目的**：向 Sandbox 请求当前用户在画布上的选择状态，用于模板选择校验。
- **Payload**：空对象 `{}`
- **响应消息**：Sandbox 回复 `selection-changed`

```typescript
interface RequestSelectionInfoMessage {
  type: 'request-selection-info';
  payload: Record<string, never>;
}
```

##### `request-template-layers`
- **触发时机**：UI 确认用户已选中单个 Frame 后，用户点击"扫描模板"或自动触发。
- **目的**：请求 Sandbox 扫描指定 Frame 内的所有可映射图层。
- **Payload**：模板 Frame 的节点 ID。
- **响应消息**：Sandbox 回复 `template-layers`

```typescript
interface RequestTemplateLayersMessage {
  type: 'request-template-layers';
  payload: {
    /** 模板 Frame 的 Figma 节点 ID */
    nodeId: string;
  };
}
```

##### `start-generation`
- **触发时机**：用户配置完映射关系后，点击"生成"按钮。
- **目的**：将完整的生成配置（模板、映射、数据源、布局参数）发送给 Sandbox，启动批量生成。
- **Payload**：完整的 `GenerationConfig` 对象。
- **响应消息**：Sandbox 持续发送 `generation-progress`，最终发送 `generation-complete` 或 `generation-error`。

```typescript
interface StartGenerationMessage {
  type: 'start-generation';
  payload: GenerationConfig;
}
```

##### `cancel-generation`
- **触发时机**：用户在生成过程中点击"取消"按钮。
- **目的**：通知 Sandbox 中断当前生成任务。
- **Payload**：空对象 `{}`
- **响应消息**：Sandbox 在当前批次行处理完毕后发送 `generation-cancelled`

```typescript
interface CancelGenerationMessage {
  type: 'cancel-generation';
  payload: Record<string, never>;
}
```

#### 4.2.2 Sandbox → UI 消息

##### `selection-changed`
- **触发时机**：
  - 响应 `request-selection-info` 请求。
  - Figma 沙盒中 `figma.on('selectionchange')` 事件触发时主动推送。
- **目的**：通知 UI 当前画布选择状态，UI 据此更新模板校验提示。
- **Payload**：`SelectionInfo` 对象。

```typescript
interface SelectionChangedMessage {
  type: 'selection-changed';
  payload: SelectionInfo;
}
```

##### `template-layers`
- **触发时机**：响应 `request-template-layers` 请求，图层扫描完成后。
- **目的**：将扫描到的可映射图层列表返回给 UI。
- **Payload**：以 `nodeId` 为 key 的分组结构，方便 UI 渲染树状列表。

```typescript
interface TemplateLayersMessage {
  type: 'template-layers';
  payload: {
    /** 模板 Frame 的节点 ID */
    nodeId: string;
    /** 模板 Frame 的名称 */
    frameName: string;
    /** 扫描到的文本图层列表 */
    textLayers: PlaceholderLayer[];
    /** 扫描到的图片图层列表 */
    imageLayers: PlaceholderLayer[];
    /** 可映射图层总数（textLayers.length + imageLayers.length） */
    totalLayers: number;
  };
}
```

##### `generation-progress`
- **触发时机**：Sandbox 每完成一行数据的处理（包含克隆+填充+布局）后发送。
- **目的**：驱动 UI 显示实时进度条与当前处理的页码。
- **Payload**：`GenerationProgress` 对象。

```typescript
interface GenerationProgressMessage {
  type: 'generation-progress';
  payload: GenerationProgress;
}
```

##### `generation-complete`
- **触发时机**：Sandbox 完成全部数据行的处理（无论是否有问题行）后发送。
- **目的**：通知 UI 生成完毕，携带结果摘要供结果视图展示。
- **Payload**：`GenerationResult` 对象。

```typescript
interface GenerationCompleteMessage {
  type: 'generation-complete';
  payload: GenerationResult;
}
```

##### `generation-cancelled`
- **触发时机**：
  - Sandbox 收到 `cancel-generation` 并安全中断生成后。
  - 用户关闭插件面板时，Figma 自动销毁 iframe，Sandbox 检测到后停止生成并发送此消息（虽然此时 UI 已销毁，但仍应发送以满足协议完整性）。
- **目的**：确认取消操作已完成。
- **Payload**：已处理的结果摘要（部分完成的数据）。

```typescript
interface GenerationCancelledMessage {
  type: 'generation-cancelled';
  payload: {
    /** 成功生成的 Frame 数量（取消前已完成的行数） */
    successCount: number;
    /** 取消前已处理的总行数 */
    processedRows: number;
    /** 原始计划的总行数 */
    totalRows: number;
  };
}
```

##### `generation-error`
- **触发时机**：生成过程中发生不可恢复的错误（如模板 Frame 已被删除、数据异常等）。
- **目的**：通知 UI 生成失败，携带错误详情供展示。
- **Payload**：错误信息。

```typescript
interface GenerationErrorMessage {
  type: 'generation-error';
  payload: {
    /** 错误描述，面向用户的友好文本 */
    message: string;
    /** 错误发生的环节 */
    phase: 'cloning' | 'filling' | 'layout';
    /** 发生错误的行索引（若适用，否则为 -1） */
    rowIndex: number;
    /** 技术错误详情，用于调试（不展示给最终用户） */
    detail: string;
  };
}
```

### 4.3 可辨识联合类型

```typescript
/**
 * UI → Sandbox 消息的联合类型
 */
type UiToSandboxMessage =
  | UiReadyMessage
  | RequestSelectionInfoMessage
  | RequestTemplateLayersMessage
  | StartGenerationMessage
  | CancelGenerationMessage;

/**
 * Sandbox → UI 消息的联合类型
 */
type SandboxToUiMessage =
  | SelectionChangedMessage
  | TemplateLayersMessage
  | GenerationProgressMessage
  | GenerationCompleteMessage
  | GenerationCancelledMessage
  | GenerationErrorMessage;

/**
 * 所有 PluginMessage 的联合类型
 * 用于全量类型检查
 */
type PluginMessage = UiToSandboxMessage | SandboxToUiMessage;
```

### 4.4 消息交互序列图（文字版）

```
UI (iframe)                           Sandbox (figma)
    |                                        |
    |———— ui-ready —————————————————————————>|  UI 加载完成
    |                                        |
    |———— request-selection-info ———————————>|  请求当前选择
    |<——— selection-changed —————————————————|  返回选择状态
    |                                        |
    |  (用户选中模板 Frame)                     |
    |<——— selection-changed —————————————————|  selectionchange 事件
    |                                        |
    |———— request-template-layers ——————————>|  请求扫描模板
    |<——— template-layers ———————————————————|  返回图层列表
    |                                        |
    |  (用户配置映射，点击生成)                    |
    |———— start-generation ——————————————————>|  携带 GenerationConfig
    |<——— generation-progress ———————————————|  每行处理完发送
    |<——— generation-progress ———————————————|    ...
    |<——— generation-progress ———————————————|    ...
    |<——— generation-complete ———————————————|  全部处理完毕
    |                                        |
    |  【或用户取消】                            |
    |———— cancel-generation —————————————————>|  取消请求
    |<——— generation-cancelled ——————————————|  取消确认
    |                                        |
    |  【或发生致命错误】                         |
    |<——— generation-error ——————————————————|  错误通知
```

---

## 5. 构建系统设计

### 5.1 约束条件

| 约束 | 说明 |
|------|------|
| **无运行时外部请求** | manifest.json 中 `networkAccess.allowedDomains` 为 `["none"]`，所有第三方库必须在构建时打包进输出文件 |
| **输出路径固定** | 主代码必须输出为根目录的 `code.js`（对应 manifest.json 的 `main`）；UI 代码必须输出为根目录的 `ui.html`（对应 manifest.json 的 `ui`） |
| **两个独立执行上下文** | Sandbox 与 UI 代码不可互相 import。共享类型/常量通过 TypeScript 的 path mapping 或构建工具 alias 引用 |
| **Sandbox 仅需编译 TypeScript** | 沙盒侧无 DOM/CSS/HTML，只需 TypeScript → JavaScript 编译 |
| **UI 需要打包** | UI 侧需要将 TypeScript + CSS + 第三方库（SheetJS）打包为一个自包含的 HTML 文件（含内联 `<script>` 与 `<style>`） |

### 5.2 推荐方案：esbuild + tsc 混用

**推荐使用 esbuild 作为 UI 侧的打包工具，tsc 作为沙盒侧的编译工具**。

#### 5.2.1 方案对比

| 方案 | 优点 | 缺点 | 推荐 |
|------|------|------|------|
| **纯 tsc** | 零配置，已在项目中使用 | UI 侧无法打包 SheetJS（无法内联 node_modules 中的库文件）；HTML/CSS 无法参与编译流程 | ❌ |
| **Vite** | 完整的 dev server + HMR；生态成熟 | 对 Figma 插件场景过重（无需 dev server，iframe 由 Figma 托管）；需额外配置 `@figma/plugin-typings` 的类型兼容 | ⚠️ 可用于 UI，但过重 |
| **esbuild** | 极快（毫秒级）；API 简洁；可同时处理 JS 打包 + CSS 内联 + HTML 复制；对 Figma 插件场景轻量且灵活 | 无类型检查（需配合 tsc --noEmit）；社区相对小 | ✅ **推荐** |
| **Webpack** | 生态最全；插件丰富 | 配置复杂；冷启动慢；对小型 Figma 插件过重 | ❌ |

#### 5.2.2 推荐方案详细说明

**esbuild 的核心理由**：
1. 构建速度极快（~10ms 级别），适合"修改 → 构建 → 在 Figma 中重新加载插件"的开发循环。
2. JS API 可直接在 Node.js 脚本中调用，无需配置文件。
3. 原生支持 `bundle: true`，将所有 import 打包为单文件。
4. 可通过简单的脚本实现"将 CSS 内联到 HTML 的 `<style>` 标签、将 JS 内联到 `<script>` 标签"，满足"无外部网络请求"的约束。
5. 支持 watch 模式，开发体验流畅。

#### 5.2.3 构建流程图

```
                        ┌─────────────────────┐
                        │  src/sandbox/*.ts    │
                        │  (含 shared/ 引用)   │
                        └──────────┬──────────┘
                                   │
                          tsc -p tsconfig.sandbox.json
                                   │
                                   ▼
                        ┌─────────────────────┐
                        │     code.js         │  ← 根目录输出
                        └─────────────────────┘


┌────────────────────┐       ┌─────────────────────┐
│  src/ui/*.ts       │       │  src/ui/index.html   │
│  (import SheetJS)  │       │  (含 <link>/<script>)│
└────────┬───────────┘       └──────────┬──────────┘
         │                              │
         │    esbuild bundle            │
         │    (bundle: true)            │
         │    (所有 import 打包)        │
         │    (SheetJS 内联)            │
         ▼                              │
┌─────────────────┐                     │
│  ui.bundle.js   │                     │
└────────┬────────┘                     │
         │                              │
         │   构建脚本：将 CSS 和 JS      │
         │   内联到 HTML 模板中          │
         │                              │
         └──────────┬───────────────────┘
                    │
                    ▼
         ┌─────────────────────┐
         │     ui.html         │  ← 根目录输出
         │  (自包含:           │
         │   <style>+<script>) │
         └─────────────────────┘
```

#### 5.2.4 npm scripts 设计

更新 `package.json` 的 `scripts` 字段为：

```jsonc
{
  "scripts": {
    // === 构建 ===

    // 沙盒侧：仅 TypeScript 编译
    "build:sandbox": "tsc -p tsconfig.sandbox.json",

    // UI 侧：esbuild 打包 + HTML 内联
    "build:ui": "node scripts/build-ui.mjs",

    // 全量构建
    "build": "npm run build:sandbox && npm run build:ui",

    // === 开发 ===

    // 沙盒 watch：
    "watch:sandbox": "tsc -p tsconfig.sandbox.json --watch",

    // UI watch：esbuild watch 模式
    "watch:ui": "node scripts/build-ui.mjs --watch",

    // 并行 watch（开发时使用）：
    "dev": "npm run build && concurrently \"npm:watch:sandbox\" \"npm:watch:ui\"",

    // === 代码质量 ===
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",

    // 类型检查（不生成输出文件，用于 CI）
    "typecheck": "tsc -p tsconfig.sandbox.json --noEmit && tsc -p tsconfig.ui.json --noEmit",

    // === 清理 ===
    "clean": "rm -f code.js ui.html"
  }
}
```

#### 5.2.5 TypeScript 配置设计

需要创建两个独立的 tsconfig 文件：

**`tsconfig.sandbox.json`** — 沙盒侧

```jsonc
{
  "compilerOptions": {
    "target": "es2020",
    "lib": ["es2020"],
    "module": "commonjs",
    "strict": true,
    "outFile": "./code.js",                    // 单文件输出
    "rootDir": "./src",
    "typeRoots": [
      "./node_modules/@types",
      "./node_modules/@figma"
    ],
    "paths": {
      "@shared/*": ["./src/shared/*"]          // 别名引用共享代码
    },
    "removeComments": true,
    "sourceMap": false
  },
  "include": ["src/sandbox/**/*.ts", "src/shared/**/*.ts"]
}
```

**`tsconfig.ui.json`** — UI 侧（供 `tsc --noEmit` 类型检查）

```jsonc
{
  "compilerOptions": {
    "target": "es2020",
    "lib": ["es2020", "dom"],                  // UI 侧有 DOM API
    "module": "esnext",
    "moduleResolution": "bundler",             // 兼容 esbuild 的模块解析
    "strict": true,
    "outDir": "./dist",                        // 临时输出目录（不会被实际使用）
    "rootDir": "./src",
    "paths": {
      "@shared/*": ["./src/shared/*"]
    },
    "noEmit": true,                            // 仅类型检查，不产出文件
    "removeComments": true,
    "sourceMap": true
  },
  "include": ["src/ui/**/*.ts", "src/shared/**/*.ts"]
}
```

#### 5.2.6 构建脚本

需要新增文件 `scripts/build-ui.mjs`，负责：

1. 调用 esbuild 的 JS API 打包 `src/ui/app.ts`（及其所有 import），输出捆绑后的 JS 文件。
2. 读取 `src/ui/index.html` 模板。
3. 读取捆绑后的 JS 内容，替换模板中的 `<script src="...">` 为内联 `<script>...</script>`。
4. 读取 `src/ui/styles.css` 内容，替换模板中的 `<link rel="stylesheet" href="...">` 为内联 `<style>...</style>`。
5. 将最终 HTML 写入根目录 `ui.html`。

> 注意：此脚本的详细实现在本任务中只搭骨架——需能成功运行，输出一个包含空 `<script>` 和 `<style>` 标签的有效 `ui.html`，业务逻辑在后继任务中填充。

### 5.3 构建产物说明

| 产物 | 生成方式 | 内容 |
|------|----------|------|
| `code.js` | `tsc -p tsconfig.sandbox.json` | 沙盒代码（所有 `src/sandbox/` 与 `src/shared/` 的内容合并为单文件） |
| `ui.html` | `node scripts/build-ui.mjs` | 自包含 HTML 文件（内联 CSS + 内联 JS），JS 中包含 SheetJS 库代码 |

### 5.4 `.gitignore` 更新

需要忽略以下构建产物和临时目录：

```
# 构建产物
code.js
ui.html

# 临时文件
dist/
*.tsbuildinfo
```

---

## 6. 依赖管理

### 6.1 依赖列表

#### 6.1.1 运行时依赖（dependencies）

| 包名 | 版本 | 用途 | 使用位置 |
|------|------|------|----------|
| `xlsx` | `^0.18.5` | Excel (.xlsx) 与 CSV 文件解析。SheetJS 社区版，纯 JavaScript，无原生依赖，可在浏览器 iframe 中安全运行。提供 `.xlsx` 文件的读/写能力及 CSV 解析能力。 | `src/ui/file-parser.ts` |

#### 6.1.2 开发依赖（devDependencies）

已存在的依赖保持不变，新增：

| 包名 | 版本 | 用途 |
|------|------|------|
| `esbuild` | `^0.25.0` | 极速 JavaScript/CSS 打包工具，用于 UI 侧代码打包与依赖内联。JS API 调用方式，在 `scripts/build-ui.mjs` 中使用。 |
| `concurrently` | `^9.1.0` | 并行运行多个 watch 进程（`watch:sandbox` + `watch:ui`），用于 `npm run dev` 命令。 |
| `@types/node` | `^22.0.0` | Node.js 类型定义，供构建脚本（`scripts/build-ui.mjs`）使用。 |

> **不引入 CSS 框架**。理由：
> 1. Figma 插件面板尺寸有限（通常 320~400px 宽），大型 CSS 框架体积过大，增加加载负担。
> 2. UI 界面较简单（字段列表、图层列表、映射配置、进度条、结果摘要），纯 CSS 即可实现。
> 3. 所有资源必须内联到 `ui.html`，依赖越少文件体积越小。
> 4. 开发者可完全控制样式细节，确保与 Figma 原生 UI 风格协调。

### 6.2 安装命令

```bash
# 运行时依赖
npm install xlsx@^0.18.5

# 开发依赖
npm install -D esbuild@^0.25.0 concurrently@^9.1.0 @types/node@^22.0.0
```

---

## 7. 共享常量

> 所有共享常量定义在 `src/shared/constants.ts` 中。

### 7.1 Figma 节点类型常量

```typescript
/**
 * Figma 节点类型常量
 * 用于 Sandbox 侧类型判断与 UI 侧展示
 */
export const NODE_TYPES = {
  FRAME: 'FRAME',
  GROUP: 'GROUP',
  TEXT: 'TEXT',
  RECTANGLE: 'RECTANGLE',
  ELLIPSE: 'ELLIPSE',
  COMPONENT: 'COMPONENT',
  INSTANCE: 'INSTANCE',
  VECTOR: 'VECTOR',
  LINE: 'LINE',
  POLYGON: 'POLYGON',
  STAR: 'STAR',
  BOOLEAN_OPERATION: 'BOOLEAN_OPERATION',
  SLICE: 'SLICE',
  SECTION: 'SECTION',
} as const;
```

### 7.2 图层分类类型常量

```typescript
/**
 * 图层分类类型常量
 * 对应 LayerType 枚举值
 */
export const LAYER_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  OTHER: 'other',
} as const;
```

### 7.3 字段类型常量

```typescript
/**
 * 字段（列）的数据类型常量
 * 对应 FieldType 枚举值
 */
export const FIELD_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
} as const;
```

### 7.4 文件类型常量

```typescript
/**
 * 支持的文件扩展名
 */
export const SUPPORTED_FILE_EXTENSIONS = {
  XLSX: 'xlsx',
  CSV: 'csv',
} as const;

/** 文件上传 input 的 accept 属性值 */
export const FILE_ACCEPT = '.xlsx,.csv';
```

### 7.5 图层扫描常量

```typescript
/**
 * 图层扫描相关常量
 */
export const LAYER_SCAN = {
  /**
   * 扫描模板 Frame 时遇到这些类型的子 Frame，停止深入
   * 即不进入嵌套 Frame 内部扫描
   */
  STOP_TYPES: ['FRAME', 'COMPONENT', 'INSTANCE'] as string[],
  /** path 字段的分隔符 */
  PATH_SEPARATOR: ' > ',
  /** 文本图层当前内容截断的最大长度（字符数） */
  MAX_CONTENT_PREVIEW_LENGTH: 100,
} as const;
```

### 7.6 布局默认参数

```typescript
/**
 * 生成结果布局的默认参数
 */
export const DEFAULT_LAYOUT: LayoutSettings = {
  /** 每行默认放置 4 个 Frame */
  columns: 4,
  /** 默认列间距（像素） */
  horizontalGap: 80,
  /** 默认行间距（像素） */
  verticalGap: 100,
};
```

### 7.7 性能与节流常量

```typescript
/**
 * 性能控制的默认参数
 */
export const PERFORMANCE = {
  /**
   * 每批处理的帧数（克隆 + 填充 + 放置）
   * 分批次处理，避免长时间阻塞 Figma 主线程
   */
  BATCH_SIZE: 5,
  /**
   * 批次间延迟（毫秒）
   * 给 Figma UI 线程喘息时间，防止 UI 冻结
   */
  BATCH_DELAY_MS: 50,
  /**
   * 每次 postMessage 发送进度后的最小间隔（毫秒）
   * 避免过于频繁的进度消息导致 iframe 消息队列积压
   */
  PROGRESS_THROTTLE_MS: 200,
} as const;
```

### 7.8 错误消息字符串

```typescript
/**
 * 面向用户的错误/提示消息字符串常量集
 * 集中定义便于未来国际化（i18n）
 */
export const MESSAGES = {
  // 模板选择校验
  NO_SELECTION: '请先在画布中选中一个模板 Frame',
  MULTIPLE_SELECTION: '请只选择一个 Frame 作为模板，当前选中了多个对象',
  NOT_A_FRAME: '请选择一个 Frame 作为模板，当前选中的是 {type}',
  NO_FILLABLE_LAYERS: '模板中未检测到可填充的文本层或图片层',

  // 文件解析
  FILE_PARSE_ERROR: '文件解析失败：{reason}',
  FILE_TYPE_UNSUPPORTED: '不支持的文件格式，请上传 .xlsx 或 .csv 文件',
  NO_DATA_ROWS: '未检测到数据行，请检查表格是否包含有效数据',
  NO_HEADER_ROW: '（无表头）',

  // 映射
  FIELD_ALREADY_MAPPED: '列「{field}」已被映射，不能重复映射到不同图层',
  LAYER_ALREADY_MAPPED: '图层「{layer}」已被映射，不能将不同列映射到同一图层',
  TYPE_MISMATCH: '列「{field}」的类型为 {fieldType}，无法映射到 {layerType} 类型的图层',
  NO_MAPPING_WARNING: '未建立任何字段映射。将生成模板副本但不替换任何内容，确认继续吗？',

  // 生成
  GENERATION_IN_PROGRESS: '生成中...',
  GENERATION_CANCELLED: '生成已取消',
  GENERATION_COMPLETE: '生成完成！',
  GENERATION_ERROR: '生成失败：{message}',

  // 结果摘要
  RESULT_SUMMARY: '成功生成 {success} 页，{issues} 个问题行，{warnings} 个警告',
  ISSUE_EMPTY_CELL: '行 {row} 的字段「{field}」单元格为空，图层「{layer}」保留模板原始内容',
  WARNING_IMAGE_FAILED: '行 {row} 的字段「{field}」图片提取失败，对应位置保持空白',

  // 通用
  CANCEL: '取消',
  GENERATE: '生成',
  SCAN_TEMPLATE: '扫描模板',
  UPLOAD_FILE: '上传文件',
} as const;
```

### 7.9 日志级别常量

```typescript
/**
 * 日志级别
 */
export const LOG_LEVELS = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
} as const;
```

---

## 8. 验收标准

本任务（TASK-01）被视作完成的必要条件：

| 编号 | 验收项 | 验证方式 |
|------|--------|----------|
| **AC-01** | 目录结构完全符合第 2 节定义，所有文件已创建，每个文件职责明确且无冗余 | 逐文件检查目录树 |
| **AC-02** | `src/shared/types.ts` 包含第 3 节定义的全部类型/接口，每个字段附带 JSDoc 说明 | 逐接口检查字段完整性 |
| **AC-03** | `src/shared/messages.ts` 包含第 4 节定义的全部消息接口与 `PluginMessage` 可辨识联合类型，消息类型字符串常量齐全 | 逐消息检查字段完整性 |
| **AC-04** | `src/shared/constants.ts` 包含第 7 节定义的全部常量 | 逐常量检查 |
| **AC-05** | `package.json` 已更新 scripts 字段，包含 `build:sandbox`、`build:ui`、`build`、`dev`、`typecheck`、`clean` 命令 | 检查 package.json |
| **AC-06** | `package.json` 已新增 `xlsx` (dependencies)、`esbuild` / `concurrently` / `@types/node` (devDependencies) | 检查 package.json 与 node_modules |
| **AC-07** | `tsconfig.sandbox.json` 已创建，编译 `src/sandbox/` + `src/shared/` 输出为根目录 `code.js` | `npm run build:sandbox` 执行成功 |
| **AC-08** | `tsconfig.ui.json` 已创建，配置 `noEmit: true`，正确包含 UI 与 Shared 源码 | `npm run typecheck` 执行成功 |
| **AC-09** | `scripts/build-ui.mjs` 已创建并正常运行，输出根目录 `ui.html` | `npm run build:ui` 执行成功 |
| **AC-10** | `npm run build` 一次性成功构建全部产物（`code.js` 与 `ui.html`） | 完整构建零错误 |
| **AC-11** | `npm run typecheck` 零错误（所有 TypeScript 类型通过检查） | tsc --noEmit 零错误 |
| **AC-12** | 构建产物路径与 `manifest.json` 的 `main` 和 `ui` 字段一致 | 检查 manifest.json |
| **AC-13** | 根目录原有 `code.ts` 与 `ui.html` 样板文件已删除（代码已迁移至 `src/` 目录下） | 确认文件不存在 |
| **AC-14** | `.gitignore` 已更新，排除构建产物 `code.js`、`ui.html` 及临时目录 `dist/` | 检查 .gitignore |
| **AC-15** | 所有源文件不含任何业务逻辑实现代码（仅包含类型定义、常量定义、函数签名与空函数体或 `throw new Error('Not implemented')` 占位） | 逐文件审查 |
| **AC-16** | ESLint 检查通过（`npm run lint` 零错误） | 执行 lint |

---

## 9. 产出文件清单

### 9.1 新增文件

| 序号 | 文件（绝对路径） | 说明 |
|------|------------------|------|
| 1 | `/Users/ruipeng/Documents/cp-workflow/src/sandbox/main.ts` | 沙盒入口文件 |
| 2 | `/Users/ruipeng/Documents/cp-workflow/src/sandbox/message-handler.ts` | 沙盒侧消息分发器 |
| 3 | `/Users/ruipeng/Documents/cp-workflow/src/sandbox/layer-scanner.ts` | 图层扫描器 |
| 4 | `/Users/ruipeng/Documents/cp-workflow/src/sandbox/frame-cloner.ts` | Frame 克隆器 |
| 5 | `/Users/ruipeng/Documents/cp-workflow/src/sandbox/content-filler.ts` | 内容填充器 |
| 6 | `/Users/ruipeng/Documents/cp-workflow/src/sandbox/layout-engine.ts` | 布局引擎 |
| 7 | `/Users/ruipeng/Documents/cp-workflow/src/sandbox/constants.ts` | 沙盒常量 |
| 8 | `/Users/ruipeng/Documents/cp-workflow/src/ui/index.html` | UI 入口 HTML |
| 9 | `/Users/ruipeng/Documents/cp-workflow/src/ui/app.ts` | UI 主应用 |
| 10 | `/Users/ruipeng/Documents/cp-workflow/src/ui/message-handler.ts` | UI 侧消息分发器 |
| 11 | `/Users/ruipeng/Documents/cp-workflow/src/ui/file-parser.ts` | 文件解析器 |
| 12 | `/Users/ruipeng/Documents/cp-workflow/src/ui/field-list.ts` | 字段列表组件 |
| 13 | `/Users/ruipeng/Documents/cp-workflow/src/ui/layer-list.ts` | 图层列表组件 |
| 14 | `/Users/ruipeng/Documents/cp-workflow/src/ui/mapping-view.ts` | 映射视图组件 |
| 15 | `/Users/ruipeng/Documents/cp-workflow/src/ui/progress-bar.ts` | 进度条组件 |
| 16 | `/Users/ruipeng/Documents/cp-workflow/src/ui/result-view.ts` | 结果视图组件 |
| 17 | `/Users/ruipeng/Documents/cp-workflow/src/ui/styles.css` | UI 样式文件 |
| 18 | `/Users/ruipeng/Documents/cp-workflow/src/shared/types.ts` | 类型定义 |
| 19 | `/Users/ruipeng/Documents/cp-workflow/src/shared/messages.ts` | 消息协议定义 |
| 20 | `/Users/ruipeng/Documents/cp-workflow/src/shared/constants.ts` | 共享常量 |
| 21 | `/Users/ruipeng/Documents/cp-workflow/tsconfig.sandbox.json` | 沙盒 TypeScript 配置 |
| 22 | `/Users/ruipeng/Documents/cp-workflow/tsconfig.ui.json` | UI TypeScript 配置 |
| 23 | `/Users/ruipeng/Documents/cp-workflow/scripts/build-ui.mjs` | UI 构建脚本 |

### 9.2 修改文件

| 序号 | 文件（绝对路径） | 修改内容 |
|------|------------------|----------|
| 1 | `/Users/ruipeng/Documents/cp-workflow/package.json` | 更新 scripts 字段；新增 dependencies（xlsx）；新增 devDependencies（esbuild, concurrently, @types/node） |
| 2 | `/Users/ruipeng/Documents/cp-workflow/.gitignore` | 新增忽略规则（code.js, ui.html, dist/） |

### 9.3 删除文件

| 序号 | 文件（绝对路径） | 原因 |
|------|------------------|------|
| 1 | `/Users/ruipeng/Documents/cp-workflow/code.ts` | 样板文件，代码已迁移至 `src/sandbox/main.ts` |
| 2 | `/Users/ruipeng/Documents/cp-workflow/ui.html` | 样板文件，代码已迁移至 `src/ui/index.html`（注意：构建后会重新在根目录生成 `ui.html` 作为产物） |

### 9.4 间接更新文件

| 序号 | 文件（绝对路径） | 说明 |
|------|------------------|------|
| 1 | `/Users/ruipeng/Documents/cp-workflow/yarn.lock` | 因依赖变更自动更新（由 `npm install` 生成） |
| 2 | `/Users/ruipeng/Documents/cp-workflow/code.js` | 构建产物，由 `npm run build:sandbox` 生成（纳入 .gitignore） |
| 3 | `/Users/ruipeng/Documents/cp-workflow/ui.html` | 构建产物，由 `npm run build:ui` 生成（纳入 .gitignore） |

---

## 附录 A：与后续任务的衔接点

本任务搭建的骨架为后续任务提供以下明确的接入口：

| 后续任务 | 本任务提供的输入 | 后续任务需填充的文件 |
|----------|------------------|---------------------|
| **TASK-02** 数据源模块 | `TableField`, `TableRow`, `CellValue`, `ImageData`, `SourceTable` 类型定义；`file-parser.ts` 空壳 | `src/ui/file-parser.ts` — 实现 SheetJS 解析逻辑 |
| **TASK-03** 模板模块 | `LayerInfo`, `PlaceholderLayer`, `SelectionInfo` 类型定义；`layer-scanner.ts` 空壳；`selection-changed` / `template-layers` 消息协议 | `src/sandbox/layer-scanner.ts` — 实现图层遍历逻辑；`src/ui/layer-list.ts` — 实现图层列表渲染 |
| **TASK-04** 映射模块 | `MappingEntry`, `MappingConfig` 类型定义；`mapping-view.ts` 空壳；消息协议全部就绪 | `src/ui/mapping-view.ts` — 实现映射配置 UI；`src/ui/field-list.ts` — 实现字段列表 UI |
| **TASK-05** 生成模块 | `GenerationConfig`, `GenerationProgress`, `GenerationResult`, `Issue`, `Warning`, `LayoutSettings` 类型定义；`frame-cloner.ts` / `content-filler.ts` / `layout-engine.ts` 空壳；`start-generation` / `cancel-generation` 消息协议 | Sandbox 侧三个核心引擎文件实现；UI 侧 `progress-bar.ts` / `result-view.ts` 实现 |
| **TASK-06** 集成联调 | 全部类型、协议、常量就绪；构建系统可用 | `main.ts`, `app.ts`, 两端 `message-handler.ts` 集成所有子模块 |

---

## 附录 B：术语对照表

| 中文 | 英文（代码中使用的标识符） | 说明 |
|------|---------------------------|------|
| 沙盒 | Sandbox | Figma 插件的后台执行环境，可访问 `figma` 全局对象 |
| 用户界面 | UI | 插件面板的浏览器 iframe 环境，可访问 DOM 与 Web API |
| 消息协议 | Message Protocol | Sandbox 与 UI 间通过 `postMessage` 通信的约定 |
| 可辨识联合类型 | Discriminated Union | TypeScript 中通过 `type` 字面量区分不同消息的联合类型 |
| 数据源 | Source Table | 用户上传的 Excel/CSV 文件解析后的结构化数据 |
| 模板 | Template | 用户在 Figma 画布上选中的 Frame |
| 占位层 | Placeholder Layer | 模板中可被数据替换的文本层或图片层 |
| 映射 | Mapping | 表格字段与模板图层的对应关系 |
| 批量生成 | Batch Generation | 按表格每行数据自动创建模板副本并填充内容的操作 |
