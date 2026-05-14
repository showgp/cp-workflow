# Task 02: 数据源管理 · 实现规格

**版本**: v1.0 (MVP) | **日期**: 2026-05-14 | **作者**: — | **审核**: —

---

## 目录

1. [任务概述](#1-任务概述)
2. [功能需求细节](#2-功能需求细节)
3. [技术方案](#3-技术方案)
4. [数据结构](#4-数据结构)
5. [UI 组件规格](#5-ui-组件规格)
6. [消息协议](#6-消息协议)
7. [错误处理](#7-错误处理)
8. [可访问性与国际化](#8-可访问性与国际化)
9. [UI 布局示意](#9-ui-布局示意)
10. [验收标准](#10-验收标准)
11. [产出文件清单](#11-产出文件清单)

---

## 1. 任务概述

| 属性 | 值 |
|------|-----|
| **Task ID** | TASK-02 |
| **任务名称** | 数据源管理 (Data Source Management) |
| **优先级** | P0（阻塞所有下游任务） |
| **执行上下文** | UI（浏览器 iframe），不涉及 Figma 沙盒 |
| **依赖任务** | **Task 01**：类型系统与消息协议（依赖其定义的 `SourceTable`、`TableField`、`TableCell`、`ImageData` 等数据结构和 UI↔Sandbox 消息协议） |
| **被依赖任务** | Task 04（映射管理）：需要本任务产出的 `SourceTable` 数据作为映射的数据方；Task 05（批量生成）：需要以本任务产出的数据驱动生成循环 |

### 摘要

本任务负责接收用户上传的 Excel (.xlsx) 或 CSV 文件，在浏览器端完成解析，提取列信息与行数据，并在 UI 中展示字段列表和数据预览。**整个解析流程完全在 UI iframe 内运行，不涉及 Figma 沙盒交互，不发起任何网络请求**。

上传、解析、展示是一个单向流水线：
> 文件选择 → 格式识别 → 解析引擎选择 → 逐行抽取 → 列名推断 → 状态更新 → UI 渲染

---

## 2. 功能需求细节

以下展开 requirements.md 中 FR-01 至 FR-05 的具体实现规格。

### 2.1 FR-01：支持上传 Excel (.xlsx) 文件

**接受的扩展名**：
- `.xlsx`（Office Open XML 格式）
- **不接受**：`.xls`（旧式 BIFF 二进制格式，需考虑兼容性风险，MVP 阶段不支持）、`.xlsm`、`.xlsb`、`.ods`、`.numbers`

**接受方式**：
- 拖拽至拖拽区域（`dragenter` / `dragover` / `drop` 事件）
- 点击打开系统文件选择器（隐藏的 `<input type="file">`，通过点击触发 `click()`）
- 从文件选择器粘贴（可选增强，非 MVP 必须）

**文件过滤**：
```html
<!-- accept 属性限定类型 -->
<input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" />
```

**MIME 类型双重校验**：
除了 `accept` 属性过滤，在 `File.type` 和文件扩展名上再做双重校验，防止用户通过修改扩展名绕过：

| 预期格式 | 标准 MIME | 可接受的 MIME 变体 |
|----------|-----------|-------------------|
| `.xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | 允许 `""`（空，某些 OS 不设 MIME） |
| `.csv` | `text/csv` | 允许 `text/plain`、`application/vnd.ms-excel`、`""` |

> **注意**：CSV 的 MIME 非常不可靠，不应以 MIME 做严格拒绝，以扩展名+内容嗅探为主。

**Magic Bytes 校验（可选安全层）**：
- `.xlsx` 实际是一个 ZIP 文件，前 4 字节为 `50 4B 03 04`（PK..）
- 在正式解析前读取文件头部 4 字节做预校验，快速识别伪造扩展名的非 xlsx 文件

---

### 2.2 FR-02：支持上传 CSV 文件

**编码处理策略**（3 层回退）：

```
第 1 层：UTF-8（优先尝试，覆盖最常见场景）
   ↓ 解码后若出现 � (U+FFFD) 或控制字符异常
第 2 层：GBK/GB2312（中文 Windows 系统默认编码）
   ↓ 若仍然乱码
第 3 层：用户手动选择编码（下拉列表备选：UTF-8, GBK, GB2312, BIG5, Shift_JIS）
```

**实现细节**：
- 使用 `FileReader.readAsArrayBuffer()` 读取原始字节，避免浏览器自动按错误编码解释
- 使用 `TextDecoder("utf-8", { fatal: false })` 尝试 UTF-8 解码
- 如果误码率超过阈值（连续 3+ 个 `\uFFFD` 或 非 ASCII 字符中 `\uFFFD` 占比 > 10%），回退到 GBK
- 提供手动编码切换下拉框，位于文件预览区域顶部
- 切换编码后即时重新解析，不丢失已上传文件内容

**分隔符检测**：
- 读取文件前 5 行，统计 `,`、`;`、`\t` 的出现频次
- 选择每行计数最一致的分隔符作为主分隔符
- 优先级：`,` > `;` > `\t`（在计票持平的情况下）
- 用户可手动覆盖分隔符选择（提供一个分隔符单选组）

**引号处理**：
- 支持双引号 `"` 作为字段引用符
- 引用字段内允许包含分隔符和换行符
- 引用字段内的 `""` 转义为 `"`
- 不处理单引号 `'` 转义（非标准 CSV）

**CSV 与图片**：
CSV 是纯文本格式，**不可包含嵌入图片**。解析后所有列的 `TableField.type` 统一为 `'text'`。若用户后续在映射界面试图将 CSV 字段映射到图片层，需在 Task 04 中予以阻止。

---

### 2.3 FR-03：字段（列名）清单展示

**列名判定逻辑**：

```
首行为表头复选框状态：
  ├── ☑ 已选中（默认）
  │   ├── 提取第一行作为列名
  │   ├── 去除列名首尾空白字符
  │   ├── 若某列列名为空字符串 → 替换为 "列 A" / "列 B" / …（按列索引）
  │   └── 若存在重复列名 → 追加后缀 _1, _2, _3 直到唯一
  │
  └── ☐ 未选中
      ├── 第一行视为数据行（非表头）
      └── 全部列以 "列 A" / "列 B" / "列 C" / … 命名
```

**重复列名去重算法**：

```
输入：原始列名列表 ["标题", "标题", "标题"]
输出：唯一列名列表 ["标题", "标题_1", "标题_2"]

步骤：
1. 遍历列名列表
2. 使用 Map<string, number> 记录每个基础名称的出现次数
3. 首次出现不追加后缀，后续出现追加 _1, _2, _3...
4. 若原始名称本身已包含 "_数字" 后缀（如 "标题_1"），不做特殊处理
```

**列名合法性**：
- 列名可为任意 UTF-8 字符串，不做格式校验
- 列名长度上限 128 字符（UI 展示截断并加省略号）

---

### 2.4 FR-04：数据行数预览

**数据行定义**：
- **全空白行**：该行所有列的值均为 `null`、空字符串 `""` 或仅含空白字符（`/^\s*$/`）→ 不计入有效数据行，不参与生成
- **部分空白行**：至少一列有有效值 → 计入有效数据行
- **零数据行场景**：文件仅包含表头（1 行）或为空（0 行有效数据）→ 触发零数据行状态

**零数据行处置**：
1. UI 中显示警告横幅："未检测到数据行，请检查文件内容"
2. 禁用"生成"按钮
3. 字段列表和映射区域保留显示（保留表头信息），仅数据预览区域显示警告
4. 用户可更换文件重新上传

**行数展示格式**：
- `共 10 行数据`（正常）
- `共 0 行数据`（零行，警告状态）
- 若检测到并跳过了全空白行，追加提示：`（已忽略 X 行空白行）`

---

### 2.5 FR-05：文件解析失败处理

**错误分级**：
| 级别 | 含义 | UI 表现 |
|------|------|---------|
| **Fatal** | 文件无法解析，不生成任何 SourceTable | 错误横幅（红色），阻断流程 |
| **Warning** | 解析成功但部分数据异常（如某行某单元格数据不可读） | 内联警告（黄色），不阻断流程 |

**错误分类与消息模板**：

| 错误场景 | 级别 | 用户可见消息 |
|----------|------|-------------|
| 文件大于 10MB | Fatal | "文件过大（> 10MB），请使用更小的文件" |
| 文件扩展名不是 .xlsx 或 .csv | Fatal | "不支持的文件格式：.xxx，请上传 .xlsx 或 .csv 文件" |
| 文件 MIME 不匹配 | Fatal | "文件类型不匹配，请确认文件为有效的 Excel 或 CSV 文件" |
| Magic bytes 校验失败（xlsx） | Fatal | "文件已损坏或不是有效的 .xlsx 文件" |
| xlsx 文件无法解压（ZIP 损坏） | Fatal | "无法读取文件内容，文件可能已损坏" |
| xlsx 工作簿无 sheet | Fatal | "Excel 文件中未找到任何工作表" |
| xlsx 解析库抛出异常 | Fatal | "Excel 文件解析失败：{异常消息}" |
| CSV 编码无法解析（所有尝试均失败） | Fatal | "无法识别文件编码，请尝试手动选择编码格式" |
| CSV 字段数不一致（超过阈值） | Warning | "部分行的列数与表头不一致，已按最大列数对齐" |
| Excel 嵌入图片提取失败（单张） | Warning | "第 X 行第 Y 张图片提取失败，将使用空白占位" |
| Excel 嵌入图片损坏 | Warning | "第 X 行图片数据已损坏，将使用空白占位" |

**错误对象结构**（建议在 Task 01 中定义）：

```typescript
interface ParseError {
  level: 'fatal' | 'warning';
  code: string;        // 错误码，如 'FILE_TOO_LARGE', 'UNSUPPORTED_FORMAT'
  message: string;     // 用户可见中文消息
  detail?: string;     // 可选技术细节（折叠显示，默认不展示）
  fileName?: string;   // 出错文件名
}
```

**共性问题**：
- 每次上传新文件时，**清除上一次的所有错误提示**和解析状态
- Fatal 错误**不保留**之前已解析的任何数据
- Warning 错误允许流程继续，但需在 UI 中持续可见

---

## 3. 技术方案

### 技术选型总览

| 文件格式 | 解析库 | 引入方式 | 库体积(压缩后) |
|----------|--------|----------|---------------|
| .xlsx | [SheetJS](https://sheetjs.com/) (`xlsx` npm 包) | Bundled into `ui.html` | ~500KB（完整版） |
| .csv | Papaparse | Bundled into `ui.html` | ~20KB |

### 构建与打包约束

由于 `networkAccess.allowedDomains` 设为 `["none"]`，**禁止在运行时通过 CDN 或网络动态加载任何脚本**。所有第三方库必须在构建时内联进 `ui.html`。

**打包方案**（二选一）：

**方案 A：通过构建工具打包（推荐）**
- 使用 Vite/Rollup/esbuild 将 `ui.ts` 入口文件打包成单文件 `ui.html`
- `import XLSX from 'xlsx'` 和 `import Papa from 'papaparse'` 经 tree-shaking 后内联
- 优势：TypeScript 类型检查、代码分割、依赖管理清晰
- 劣势：需要额外配置构建管道

**方案 B：手动内联（MVP 可接受）**
- 将 xlsx 库和 Papaparse 库的预编译版本直接 `<script>` 内联到 ui.html
- 使用 `xlsx.full.min.js` 并 `import` 或 `require`
- 优势：零构建配置
- 劣势：无 tree-shaking，库体积全量引入

> **MVP 建议**：采用方案 B（手动内联），降低初期工程复杂度。后续可迁移到方案 A。

**文件结构**（Task 02 产出）：

```
src/
├── ui/
│   ├── app.ts                  # UI 主入口，挂载所有组件
│   ├── components/
│   │   ├── FileUploadZone.ts   # 文件上传区域组件
│   │   ├── FieldList.ts        # 列名清单组件
│   │   ├── DataPreview.ts      # 数据预览组件
│   │   └── EncodingSelector.ts # 编码选择器组件（CSV）
│   ├── parsers/
│   │   ├── FileParser.ts       # 解析器入口，根据格式分发
│   │   ├── ExcelParser.ts      # Excel (.xlsx) 解析器
│   │   ├── CsvParser.ts        # CSV 解析器
│   │   └── encoding.ts         # 编码检测与转换工具
│   ├── state/
│   │   └── dataSourceState.ts  # 数据源状态管理
│   └── types/
│       └── index.ts            # Re-export from shared types (Task 01)
└── shared/
    └── types.ts                # Task 01: 共享类型定义
```

---

### 3.1 Excel (.xlsx) 解析

#### 3.1.1 解析流程

```
输入：File 对象（.xlsx）
  ↓
1. 读取 ArrayBuffer (FileReader)
  ↓
2. 传入 XLSX.read(buffer, { type: 'array' })
  ↓
3. 获取第一个 sheet：wb.SheetNames[0] → wb.Sheets[name]
  ↓
4. 检测图片列：检查 ws['!images'] 是否存在
  ↓
5. 将 sheet 转换为二维数组 (XLSX.utils.sheet_to_json 或逐格遍历)
  ↓
6. 提取表头行（第 1 行）
  ↓
7. 提取数据行（第 2 行起）
  ↓
8. 构建 SourceTable → 更新 UI 状态
```

**关键调用**：

```typescript
// 读取工作簿
const wb = XLSX.read(data, { type: 'array' });

// 获取第一个 Sheet
const sheetName = wb.SheetNames[0];
const ws = wb.Sheets[sheetName];

// 获取 sheet 的行列范围
const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
// range.s.r: 起始行, range.e.r: 结束行
// range.s.c: 起始列, range.e.c: 结束列

// 逐格读取单元格值（避免 sheet_to_json 的格式推断问题）
for (let r = range.s.r; r <= range.e.r; r++) {
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r, c });
    const cell = ws[addr];
    // cell.v: 原始值
    // cell.t: 单元格类型 ('s': string, 'n': number, 'b': boolean, 'e': error)
  }
}
```

#### 3.1.2 Excel 嵌入图片提取（CRITICAL）

这是本插件区别于普通 Excel 导入工具的核心能力。SheetJS 在读取 XLSX 时支持提取 `!images` 元数据。

**检测图片列**：

```typescript
// ws['!images'] 是一个数组，每个元素描述一张嵌入图片
interface SheetJSImage {
  name: string;          // 图片内部名称（如 'image1.png'）
  data: Uint8Array;      // 图片原始二进制数据
  type: string;          // 图片格式扩展名（'png', 'jpeg', 'gif'）
  l: { col: number; row: number };  // 图片左上角所在单元格（列, 行）
  r: { col: number; row: number };  // 图片右下角所在单元格（列, 行）
}

const images: SheetJSImage[] = ws['!images'] || [];
```

**图片与单元格的关联规则**：
- SheetJS 的 `!images` 包含 `l`（left/top）定位信息，指向图片锚定的起始单元格
- **一个单元格可能包含多张图片**（如商品多角度图堆叠在一个 Cell 中）
- 图片列判定：遍历所有图片，按 `l.col` 分组，若某列包含至少 1 张图片，则该列被识别为**图片列**
- 图片列不包含文本值（单元格 `v` 为 `null` 或空）

**图片提取流程**：

```
输入：ws['!images']
  ↓
1. 按 (row, col) 建立 Map<cellAddress, ImageData[]>
  ↓
2. 判定哪些列是图片列：遍历所有图片的 col，创建 Set<colIndex>
  ↓
3. 对每个图片列中的每个图片：
  │  a. 识别图片格式：从 `data` 的 magic bytes 推断 MIME
  │     FF D8 FF       → image/jpeg
  │     89 50 4E 47    → image/png
  │     47 49 46 38    → image/gif
  │     (不支持 BMP, TIFF, WEBP 等其他格式)
  │  b. 将 Uint8Array 转换为 base64 字符串
  │  c. 构造 data URL: `data:${mime};base64,${base64}`
  │  d. 记录原始图片尺寸（若可从头部解析）
  │  c. 构建 ImageData 对象
  ↓
4. 在 SourceTable 中，图片列的 TableField.type = 'image'
   │  文本列 type = 'text'
```

**支持的图片格式**：

| 格式 | MIME | Magic Bytes | 优先级 |
|------|------|-------------|--------|
| PNG | `image/png` | `89 50 4E 47` | 主支持 |
| JPEG | `image/jpeg` | `FF D8 FF` | 主支持 |
| GIF | `image/gif` | `47 49 46 38` | 主支持 |
| 其他 | — | — | **不解析**，记录 warning |

**未识别格式的处理**：
- 不尝试强制渲染
- 记录 Warning 级别错误
- 该单元格返回 `null` 值 + 错误信息

**base64 转换实现**：

```typescript
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
```

> **性能关注**：对于大图片（如 > 5MB 的高清 PNG），base64 编码会膨胀内存 ~33%。需要考虑内存管理（见下方）。

**图片与文本列的差异**：

| 特性 | 文本列 | 图片列 |
|------|--------|--------|
| `TableField.type` | `'text'` | `'image'` |
| `TableCell.value` | `string` | `ImageData[]`（数组：一个单元格可含多图） |
| 可映射目标 | Figma TextNode | Figma 图片层（Rectangle with image fill） |
| 数据预览 | 显示文本（截断） | 显示第一张图片缩略图（48x48px） |
| 空值处理 | 显示 `—` 或 `（空）` | 显示占位图标 |
| CSV 支持 | ✔ | ✘（CSV 无图片列） |

**多图单元格处理**：
一个 Excel 单元格中可能嵌入多张图片（例如商品详情列中堆叠 3 张图）。处理策略：
- 一个 Cell 的 `ImageData[]` 数组保持多图
- 映射时（Task 04），将该列的图片集合映射到一个图片层，**使用第一张图**（`images[0]`）作为主图；若用户需求多图布局，留待后续版本支持
- 在数据预览中，该单元格显示 `"3 张图片"`（文本提示）+ 首图缩略图

**内存与性能**（含大量嵌入图片的 Excel 文件）：
- 设置总图片总大小上限：**50MB**（所有图片 base64 编码后的累计大小）
- 超出上限时显示 Warning，截断图片加载，后续图片置为 `null`
- 对每张 > 5MB 的图片进行降采样（可选，MVP 可跳过）
- 图片 base64 数据仅在内存中保存，**不写入 localStorage 或 IndexedDB**
- 插件关闭时所有内存由 iframe 自然释放

---

### 3.2 CSV 解析

#### 3.2.1 解析流程

```
输入：File 对象（.csv）
  ↓
1. 读取 ArrayBuffer (FileReader)
  ↓
2. 编码检测：UTF-8 → GBK → 手动选择
  ↓
3. 使用 TextDecoder 将 ArrayBuffer 解码为字符串
  ↓
4. 分隔符检测：前 5 行计数 → 自动选择
  ↓
5. Papaparse.parse(text, { delimiter, header: false, skipEmptyLines: 'greedy' })
  ↓
6. 按首行为表头配置提取表头/列名
  ↓
7. 过滤全空白行
  ↓
8. 构建 SourceTable → 更新 UI 状态
```

**关键调用**：

```typescript
import Papa from 'papaparse';

const result = Papa.parse(csvText, {
  delimiter: detectedDelimiter,  // 自动检测或手动指定
  header: false,                 // 由上层逻辑自行处理表头
  skipEmptyLines: 'greedy',     // 跳过所有空行（含仅含空白字符的行）
  quotes: true,                  // 标准双引号处理
  quoteChar: '"',
  escapeChar: '"',
  encoding: 'utf-8',            // 输入已是字符串，此参数无效但标记意图
});

const rows: string[][] = result.data;  // 二维字符串数组
const parseErrors: Papa.ParseError[] = result.errors;
```

**Papaparse 配置说明**：

| 配置项 | 值 | 理由 |
|--------|-----|------|
| `header` | `false` | 首行表头由上层逻辑处理，保留灵活性（支持"首行为表头"开关） |
| `skipEmptyLines` | `'greedy'` | 跳过所有空行，包括只含空白符的行。注意：此配置仅跳过完全空白的行，CSV 中 `"  "` 这样的行仍会被保留 |
| `delimiter` | 自动检测 | 见下文"分隔符检测"算法 |
| `quoteChar` | `"` | 标准 CSV 双引号 |
| `escapeChar` | `"` | 引号内转义引号 |
| `dynamicTyping` | `false` | **禁止自动类型转换**。CSV 中的所有值都保留为字符串，由上层按需处理。避免 `"0123"` 被转成 `123` |

#### 3.2.2 编码检测算法

```typescript
interface EncodingResult {
  encoding: string;      // 检测到的编码名称
  confidence: number;    // 置信度 0-1
  text: string;          // 解码后的文本
}

function detectEncoding(buffer: ArrayBuffer): EncodingResult {
  // 尝试 UTF-8
  const utf8Decoder = new TextDecoder('utf-8', { fatal: false });
  const utf8Text = utf8Decoder.decode(buffer);
  const ufffdCount = (utf8Text.match(/\uFFFD/g) || []).length;
  const nonAsciiCount = (utf8Text.match(/[^\x00-\x7F]/g) || []).length;

  // UTF-8 正常（无误码或误码率 < 5%）
  if (nonAsciiCount === 0 || ufffdCount / nonAsciiCount < 0.05) {
    return { encoding: 'utf-8', confidence: 0.95, text: utf8Text };
  }

  // 尝试 GBK
  const gbkDecoder = new TextDecoder('gbk', { fatal: false });
  const gbkText = gbkDecoder.decode(buffer);
  const gbkUfffdCount = (gbkText.match(/\uFFFD/g) || []).length;

  if (gbkUfffdCount / nonAsciiCount < 0.1) {
    return { encoding: 'gbk', confidence: 0.7, text: gbkText };
  }

  // 都不可靠，返回 UTF-8 结果并标记低置信度
  return { encoding: 'utf-8', confidence: 0.3, text: utf8Text };
}
```

**GBK 在浏览器中的支持**：
- `TextDecoder` 支持 `'gbk'` 编码（Chromium 系，V8 `--harmony` 已默认开启）
- 备选方案：若 `TextDecoder('gbk')` 抛出 `RangeError`，使用 `'gb18030'` 代替（GBK 超集）
- 还不行：使用纯 JS 实现的 GBK 解码表（如 `encoding.js` 库），但不推荐增加包体积

#### 3.2.3 分隔符检测算法

```typescript
function detectDelimiter(text: string): string {
  const sampleLines = text.split(/\r?\n/).slice(0, 5).filter(l => l.trim().length > 0);
  if (sampleLines.length === 0) return ',';

  const candidates = [',', ';', '\t'];
  const scores: Record<string, number[]> = { ',': [], ';': [], '\t': [] };

  for (const line of sampleLines) {
    for (const delim of candidates) {
      // 不考虑在引号内出现的分隔符（简化处理）
      const count = line.split(delim).length - 1;
      scores[delim].push(count);
    }
  }

  // 选择每行计数最一致（方差最小）且不为全 0 的分隔符
  let bestDelim = ',';
  let bestScore = -1;

  for (const delim of candidates) {
    const counts = scores[delim];
    if (counts.every(c => c === 0)) continue; // 该分隔符未出现
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance = counts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / counts.length;
    const score = mean / (variance + 1); // 均值高、方差小 → 得分高
    if (score > bestScore) {
      bestScore = score;
      bestDelim = delim;
    }
  }

  return bestDelim;
}
```

**CSV 不支持图片**：
CSV 为纯文本格式，解析后 `SourceTable.fields` 中所有字段的 `type` 均为 `'text'`。在 Task 04 的映射 UI 中，CSV 数据源应仅显示可映射到文本层的字段。

---

### 3.3 列名策略

#### 3.3.1 从表头提取列名

```typescript
function extractHeaders(firstRow: (string | null)[], columnCount: number): string[] {
  return Array.from({ length: columnCount }, (_, i) => {
    const rawName = firstRow[i];
    if (rawName === null || rawName === undefined || rawName.trim() === '') {
      return generateDefaultColumnName(i);
    }
    return rawName.trim().slice(0, 128); // 截断超长列名
  });
}

function generateDefaultColumnName(columnIndex: number): string {
  // 列 A, 列 B, 列 C, ..., 列 Z, 列 AA, 列 AB, ...
  let name = '';
  let n = columnIndex;
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  }
  return `列 ${name}`;
}
```

**列名生成示例**：
- 索引 0 → `列 A`
- 索引 25 → `列 Z`
- 索引 26 → `列 AA`
- 索引 701 → `列 ZZ`

#### 3.3.2 去重算法

```typescript
function deduplicateHeaders(headers: string[]): string[] {
  const countMap = new Map<string, number>();
  return headers.map((name) => {
    if (!countMap.has(name)) {
      countMap.set(name, 1);
      return name;
    }
    const count = countMap.get(name)!;
    countMap.set(name, count + 1);
    return `${name}_${count}`;
  });
}
```

示例：`["标题", "名称", "标题", "标题", "名称"]` → `["标题", "名称", "标题_1", "标题_2", "名称_1"]`

#### 3.3.3 首行为表头切换

用户通过"首行为表头"复选框控制此行为：

| 复选框状态 | 第一行角色 | 列名来源 | 数据行计算 |
|-----------|-----------|---------|-----------|
| ☑ 选中（默认） | 表头 | 第一行取值 + 空值回退 + 去重 | Row 2 起 |
| ☐ 未选中 | 数据 | `列 A, 列 B, …` | Row 1 起 |

**切换行为**：
- 切换复选框后**即时**重新计算列名和数据行范围
- 不清除已解析的原始数据（仅改变"视图"）
- 不影响已有的映射关系（映射以 columnIndex 为 key，列名只是展示标签）

---

## 4. 数据结构

以下数据结构基于 Task 01 定义的类型系统。本任务读写这些数据。

### 4.1 SourceTable（解析后的表格）

```typescript
/**
 * 数据源表格：解析完成后的完整数据结构
 * 此对象存储在 UI 状态中，供 Task 04（映射）和 Task 05（生成）使用
 */
interface SourceTable {
  /** 原始文件名（不含路径，如 "商品数据.xlsx"） */
  fileName: string;

  /** 文件格式：'xlsx' | 'csv' */
  fileFormat: 'xlsx' | 'csv';

  /** 编码（仅 CSV 有值，xlsx 为 null） */
  encoding?: string | null;

  /** 字段（列）定义列表，按列索引排序 */
  fields: TableField[];

  /** 全部行数据（包含表头行在内的原始行，rowIndex 从 0 开始） */
  rows: TableRow[];

  /** 数据行起始索引（对于有表头场景，此值为 1；无表头为 0） */
  dataStartRowIndex: number;

  /** 有效数据行数（排除表头行和全空白行） */
  dataRowCount: number;

  /** 所有空白行索引（已被过滤，不参与生成） */
  blankRowIndices: number[];

  /** 解析过程中产生的警告列表 */
  warnings: ParseError[];

  /** 解析时间戳 */
  parsedAt: number;
}
```

### 4.2 TableField（列定义）

```typescript
/**
 * 表格列元数据
 */
interface TableField {
  /** 列索引（0-based，对应原始表格的第几列） */
  index: number;

  /** 列名（显示名称，已去重、去空） */
  name: string;

  /** 列数据类型 */
  type: 'text' | 'image';

  /** 来自第一行的原始列名（去重前的原始值，用于调试） */
  rawName?: string;

  /** 样本值：取自第一数据行该列的值，用于预览 */
  sampleValue?: string | null;  // text 类型为截断文本，image 类型为 "X 张图片"

  /** 仅 image 类型：该列中提取到的图片总数 */
  imageCount?: number;
}
```

### 4.3 TableRow（行数据）

```typescript
/**
 * 表格单行数据
 */
interface TableRow {
  /** 行索引（0-based，在原始表格中的行号） */
  rowIndex: number;

  /** 该行各列的值，按列索引排列 */
  cells: TableCell[];

  /** 是否为全空白行 */
  isBlank: boolean;
}
```

### 4.4 TableCell（单元格值）

```typescript
/**
 * 单元格值：联合类型
 * - string: 文本列的值（CSV 全为此类型）
 * - ImageData[]: 图片列的图片数据集（单元格可含多张图片）
 * - null: 空单元格
 */
type TableCellValue = string | ImageData[] | null;

interface TableCell {
  /** 列索引 */
  columnIndex: number;

  /** 单元格值 */
  value: TableCellValue;

  /** 单元格原始类型（来自 SheetJS cell.t） */
  rawType?: string;

  /** 值是否为空（null、undefined、空字符串） */
  isEmpty: boolean;
}
```

### 4.5 ImageData（提取的嵌入图片）

```typescript
/**
 * 从 Excel 中提取的嵌入图片
 */
interface ImageData {
  /** 唯一标识符（生成自 Excel 图片内部名称 + 行列 + 时间戳） */
  id: string;

  /** base64 编码的图片 data URL（格式：data:image/png;base64,...） */
  dataUrl: string;

  /** 原始二进制数据（用于后续 Figma Image API） */
  binaryData?: Uint8Array;

  /** MIME 类型：'image/png' | 'image/jpeg' | 'image/gif' */
  mimeType: string;

  /** 图片原始宽度（像素），若无法获取则为 0 */
  width: number;

  /** 图片原始高度（像素），若无法获取则为 0 */
  height: number;

  /** 图片在 Excel 中的名称（来自 !images[].name） */
  sourceName: string;

  /** 图片所在原始单元格地址（如 "B3"） */
  sourceCell: string;

  /** 图片文件大小（字节，base64 编码前） */
  fileSize: number;

  /** 提取是否成功 */
  extracted: boolean;

  /** 若提取失败，记录错误信息 */
  error?: string;
}
```

**ImageData.id 生成规则**：

```typescript
function generateImageId(sourceName: string, sourceCell: string): string {
  const raw = `${sourceName}@${sourceCell}`;
  // 简单哈希，避免特殊字符问题
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0; // 转为 32 位整型
  }
  return `img_${Math.abs(hash).toString(36)}`;
}
```

### 4.6 UI 状态管理

Task 02 在 UI 中管理以下状态（建议在 `dataSourceState.ts` 中集中管理）：

```typescript
interface DataSourceState {
  /** 已解析的表格数据（null 表示尚未解析或解析失败） */
  sourceTable: SourceTable | null;

  /** 原始 File 对象（用于重新解析，如切换编码） */
  rawFile: File | null;

  /** 首行为表头（默认 true） */
  hasHeaderRow: boolean;

  /** CSV 编码（默认 'utf-8'，可切换） */
  encoding: string;

  /** CSV 分隔符（默认自动检测） */
  delimiter: string;

  /** 是否正在解析 */
  isParsing: boolean;

  /** 是否发生 Fatal 错误 */
  hasFatalError: boolean;

  /** 致命错误信息 */
  fatalError: ParseError | null;

  /** 是否发生 Warning */
  hasWarnings: boolean;

  /** 上传区域 UI 状态 */
  uploadState: 'idle' | 'dragover' | 'loading' | 'error';
}
```

### 4.7 数据流经的任务

```
Task 02 (本任务)      Task 04 (映射)       Task 05 (生成)
    ↓                    ↓                   ↓
 SourceTable  ────→  MappingEngine     BatchGenerator
   .fields             使用 .fields        遍历 .rows
   .rows               (展示列清单)       (逐行生成)
   .dataStartRowIndex
   .dataRowCount
```

---

## 5. UI 组件规格

本节定义 Task 02 创建的所有 UI 组件及其状态变化。所有组件运行在 `ui.html` 内。

### 5.1 文件上传区域 (FileUploadZone)

**功能**：接收用户上传的 Excel/CSV 文件，提供拖拽和点击两种交互方式。

#### 5.1.1 视觉规格

```
┌─────────────────────────────────┐
│                                 │
│        📁 拖放或点击上传        │  ← 默认状态 (idle)
│        Excel (.xlsx) 或         │
│        CSV 文件                 │
│                                 │
│   支持格式：.xlsx, .csv        │
│   最大文件大小：10MB            │
│                                 │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
│  ▓▓▓▓▓▓▓ 释放文件以上传 ▓▓▓▓▓▓  │  ← 拖拽悬停 (dragover)
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │    背景高亮，边框加粗
└─────────────────────────────────┘

┌─────────────────────────────────┐
│         ⏳ 正在解析文件...       │  ← 解析中 (loading)
│         文件.csv                 │     显示文件名
│                                 │
│     ████████████░░░░░  65%     │     进度条（可选）
└─────────────────────────────────┘

┌─────────────────────────────────┐
│  ⚠ 文件解析失败                 │  ← 错误状态 (error)
│  文件已损坏或不是有效的 .xlsx   │     红色边框
│  文件                              显示详细错误
│      [🔄 重新上传]                │     重试按钮
└─────────────────────────────────┘
```

#### 5.1.2 状态枚举

```typescript
type UploadState = 'idle' | 'dragover' | 'loading' | 'error';
```

#### 5.1.3 交互行为

| 交互 | 触发条件 | 行为 |
|------|---------|------|
| **点击区域** | 用户点击空白区域 | 触发隐藏的 `<input type="file">` 的 `click()` |
| **键盘空间键** | 区域聚焦时按 Space | 同上 |
| **拖入文件** | `dragenter` 事件 | 切换为 `dragover` 状态，视觉效果变化 |
| **在区域内移动** | `dragover` 事件 | 阻止默认行为（`preventDefault`），保持 `dragover` |
| **离开区域** | `dragleave` 事件 | 恢复 `idle` 状态（仅在离开至外部时，不因子元素冒泡误触发） |
| **释放文件** | `drop` 事件 | 提取 `File` 对象，开始解析；阻止默认行为 |
| **文件选择** | `<input>` 的 `change` 事件 | 提取 `File` 对象，开始解析 |

#### 5.1.4 文件校验（前端校验，解析前）

在 `drop` / `change` 事件中执行以下校验（顺序执行，遇错即止）：

```typescript
function validateFile(file: File): ParseError | null {
  // 1. 大小校验
  if (file.size > 10 * 1024 * 1024) {
    return { level: 'fatal', code: 'FILE_TOO_LARGE', message: '文件过大（> 10MB）' };
  }

  // 2. 扩展名校验
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext !== 'xlsx' && ext !== 'csv') {
    return { level: 'fatal', code: 'UNSUPPORTED_FORMAT', message: `不支持的文件格式 .${ext}` };
  }

  // 3. 空文件校验
  if (file.size === 0) {
    return { level: 'fatal', code: 'EMPTY_FILE', message: '文件为空' };
  }

  return null; // 通过校验
}
```

#### 5.1.5 拖拽兼容性注意

- `dragleave` 事件容易从子元素冒泡误触发，需使用 `relatedTarget` 判断鼠标是否真正离开拖拽区域
- 若使用 React/Vanilla JS，推荐使用 `dragenter` 计数器模式或 `event.relatedTarget` 判断

---

### 5.2 列名清单 (FieldList)

**功能**：解析成功后，展示表格中所有列的名称、类型和样本值。

#### 5.2.1 视觉规格

```
┌──────────────────────────────────┐
│ 字段列表                         │
├────┬──────────┬──────┬───────────┤
│ #  │ 列名     │ 类型 │  样本值   │
├────┼──────────┼──────┼───────────┤
│ 1  │ 标题     │ 📝   │ 夏日新品..│
│ 2  │ 描述     │ 📝   │ 采用全棉..│
│ 3  │ 商品图   │ 🖼️  │ [缩略图]  │
│ 4  │ 价格     │ 📝   │ ¥ 199.00 │
│ 5  │ 标签     │ 📝   │ 热卖     │
├────┴──────────┴──────┴───────────┤
│ 共 5 个字段                      │
└──────────────────────────────────┘
```

#### 5.2.2 字段行规格

每行显示：
1. **列序号**：1-based（`field.index + 1`）
2. **类型图标**：
   - 📝 (文本)：`type === 'text'`
   - 🖼️ (图片)：`type === 'image'`
3. **列名**：`field.name`，最大显示宽度 30 字符（超长截断 + 省略号）
4. **样本值**：
   - 文本列：取第一数据行该列的值，截断至 40 字符
   - 图片列：若 `imageCount === 1`，显示 48×48px 缩略图；若 `imageCount > 1`，显示 `"N 张图片"`
   - 空列：显示灰色虚线 `—`

#### 5.2.3 图片缩略图渲染

```html
<!-- 图片列预览单元格 -->
<div class="field-thumbnail">
  <img src="data:image/png;base64,..." width="48" height="48"
       alt="商品图 预览" loading="lazy" />
  <!-- 多图徽标 -->
  <span class="image-count-badge">3</span>
</div>
```

- 缩略图尺寸：**48×48px**，`object-fit: cover`
- 圆角：4px
- 多图时右下角显示图片数徽标（半透明黑底白字圆形）
- `loading="lazy"`：大量图片列时延迟加载
- `alt` 属性：`"${field.name} 预览"`

---

### 5.3 数据预览 (DataPreview)

**功能**：展示数据行数概览，可选展开查看前 N 行数据。

#### 5.3.1 视觉规格（收折状态）

```
┌─────────────────────────────────┐
│ 📊 数据预览                     │
│                                 │
│ 共 10 行数据                    │
│ （已忽略 3 行空白行）            │  ← 仅当有空白行时显示
│                                 │
│ [展开预览 ▸]                    │
└─────────────────────────────────┘
```

#### 5.3.2 视觉规格（展开状态）

```
┌─────────────────────────────────┐
│ 📊 数据预览                    │
│                                 │
│ 共 10 行数据                   │
│                                 │
│ 首行为表头 ☑                    │  ← 复选框
│ CSV 编码：[UTF-8 ▾]             │  ← 仅 CSV 显示
│ 分隔符：  [自动 ▾]              │  ← 仅 CSV 显示
│                                 │
│ ┌───────┬──────┬──────┬─────┐  │
│ │ #     │ 标题 │ 描述 │ 价格│  │  ← 迷你表格
│ ├───────┼──────┼──────┼─────┤  │
│ │ 1     │夏日..│全棉..│199..│  │
│ │ 2     │秋季..│真丝..│299..│  │
│ │ 3     │冬季..│羊毛..│399..│  │
│ ├───────┼──────┼──────┼─────┤  │
│ │ ...还有 7 行                 │  │
│ └───────┴──────┴──────┴─────┘  │
│                                 │
│ [收折预览 ▾]                   │
└─────────────────────────────────┘
```

#### 5.3.3 "首行为表头"复选框

- 默认状态：**选中**（☑）
- 选中：第一行作为列名，数据行从第 2 行起算
- 未选中：第一行作为数据，列名为 `列 A, 列 B, 列 C …`
- 切换时：**即时**重新计算列名 + 数据行范围 + 刷新 FieldList 和迷你表格
- 不重新解析文件（原始解析结果保持在内存中）

#### 5.3.4 迷你表格

- 仅显示前 **5 行**（或全部，若 ≤ 5）
- 显示所有列（若 > 6 列，仅显示前 6 列 + "…" 省略指示）
- 图片列：显示 🖼️ 图标代替缩略图（节省空间）
- 空单元格：显示灰色 `—`
- 每列最大宽度 12 字符（超长截断 + 省略号）
- 底部行数提示：`…还有 X 行`

#### 5.3.5 CSV 编码选择器

- 仅当 `fileFormat === 'csv'` 时显示
- 下拉列表选项：`UTF-8`、`GBK`、`GB2312`、`BIG5`、`Shift_JIS`
- 当前生效编码高亮显示
- 切换编码后触发重解析：保留 `rawFile`，使用新编码重新调用 `CsvParser`
- 选择器旁显示"自动检测"建议标签（若与自动检测结果不一致）

#### 5.3.6 CSV 分隔符选择器

- 仅当 `fileFormat === 'csv'` 时显示
- 单选按钮组：`,`、`;`、`\t`（制表符）、`自动`
- 默认选择"自动"（由分隔符检测算法决定）
- 切换分隔符后触发重解析

---

### 5.4 空状态与错误状态

#### 5.4.1 初始空状态（首次打开插件，未上传文件）

```
┌─────────────────────────────────┐
│                                 │
│        📁 拖放或点击上传        │
│        Excel (.xlsx) 或         │
│        CSV 文件                 │
│                                 │
│   支持格式：.xlsx, .csv        │
│   最大文件大小：10MB            │
│                                 │
└─────────────────────────────────┘
```

#### 5.4.2 零数据行状态（解析成功但无有效数据）

```
┌─────────────────────────────────┐
│ ⚠️ 未检测到数据行               │
│    文件仅包含表头，请检查文件    │
│    内容或取消"首行为表头"。      │
│                                 │
│ 字段列表（仅表头）              │
│ ┌─ 标题                        │  ← 字段仍然展示
│ │─ 描述                        │
│ └─ 价格                        │
│                                 │
│ [🔄 重新上传]                  │
└─────────────────────────────────┘
```

- 黄色警告横幅（非红色错误）
- 字段列表仍然可见（显示列名信息）
- **生成按钮禁用**（灰色不可点击）
- 用户可取消"首行为表头"复选框来将表头视作数据

#### 5.4.3 Fatal 错误状态（解析完全失败）

```
┌─────────────────────────────────┐
│ ❌ 文件解析失败                 │
│    文件已损坏或不是有效的       │
│    .xlsx 文件                   │
│                                 │
│ [🔄 重新上传]                  │
└─────────────────────────────────┘
```

- 红色错误横幅 + 错误图标
- 显示用户可理解的中文错误原因
- **不显示**字段列表或数据预览
- "重新上传"按钮：点击后清除所有状态，回到初始空状态

---

## 6. 消息协议

### 6.1 Task 02 与 Sandbox 的交互

**Task 02 不直接与 Sandbox 通信**。文件上传、解析、预览全部在 UI iframe 内完成。数据暂存在 UI 内存状态中。

### 6.2 为下游任务预留的数据传递

Task 02 产出的 `SourceTable` 将供 Task 04（映射）和 Task 05（生成）使用。数据传递方式：

#### 方案 A：UI 内部状态共享（推荐）

所有 Task 组件运行在同一 `ui.html` 上下文中，共享 JavaScript 内存状态。`DataSourceState` 存储在全局状态管理器中（如一个简单的 PubSub store 或 React Context），Task 04 和 Task 05 从同一 store 读取。

```typescript
// 伪代码：状态管理器
const store = {
  dataSource: null as SourceTable | null,
  // ... Task 04 的状态
  // ... Task 05 的状态
};
```

#### 方案 B：通过 Sandbox 中转

UI 将解析结果通过 `postMessage` 发送到 Sandbox，Sandbox 缓存数据，后续再传回 UI。

> **不推荐方案 B**：增加了序列化开销（对包含 base64 图片的数据尤其沉重）、增加了复杂度、且无实际收益。Task 02 的数据仅在 UI 中使用，不需要 Sandbox 参与。

### 6.3 未来可能需要的消息（预留）

如果将来需要在 Sandbox 中处理数据（如使用 Figma API 创建图片时），Task 05 会按需发送 `pluginMessage`。此时传递的是 `ImageData` 的 `binaryData`（`Uint8Array`），而非 base64 字符串（Figma API 接受 `Uint8Array`）。

```typescript
// 未来 Task 05 可能发送的消息格式
interface GenerateBatchMessage {
  type: 'GENERATE_BATCH';
  mappings: Mapping[];
  rows: TableRow[];         // 来自 Task 02
  templateFrameId: string;
}
```

---

## 7. 错误处理

### 7.1 完整错误矩阵

| 错误码 | 触发条件 | 级别 | 用户消息 | 恢复路径 |
|--------|---------|------|---------|---------|
| `FILE_TOO_LARGE` | 文件 > 10MB | Fatal | "文件过大（> 10MB），请使用更小的文件" | 上传新文件 |
| `UNSUPPORTED_FORMAT` | 扩展名非 .xlsx/.csv | Fatal | "不支持的文件格式：.{ext}，请上传 .xlsx 或 .csv 文件" | 上传新文件 |
| `EMPTY_FILE` | 文件大小为 0 | Fatal | "文件为空，请选择有效的数据文件" | 上传新文件 |
| `MIME_MISMATCH` | xlsx 但 MIME 不对 | Fatal | "文件类型不匹配，请确认文件为有效的 Excel 文件" | 上传新文件 |
| `MAGIC_BYTES_FAIL` | xlsx 前 4 字节非 ZIP header | Fatal | "文件已损坏或不是有效的 .xlsx 文件" | 上传新文件 |
| `XLSX_CORRUPT` | XLSX.read 抛出异常 | Fatal | "Excel 文件解析失败：{msg}" | 上传新文件 |
| `NO_SHEET` | 工作簿无 sheet | Fatal | "Excel 文件中未找到任何工作表" | 上传新文件 |
| `XLSX_EMPTY` | sheet 中无任何行 | Fatal | "Excel 工作表为空" | 上传新文件 |
| `CSV_ENCODING_FAIL` | 所有编码均失败 | Fatal | "无法识别文件编码，请尝试手动选择编码格式" | 手动选择编码 |
| `CSV_PARSE_FAIL` | Papaparse 返回 fatal error | Fatal | "CSV 文件解析失败：{msg}" | 上传新文件 |
| `CSV_EMPTY` | CSV 无任何内容 | Fatal | "CSV 文件为空" | 上传新文件 |
| `CSV_COLUMN_MISMATCH` | 某行字段数与表头不一致（> 阈值） | Warning | "第 X 行的列数与表头不一致（期望 N 列，实际 M 列）" | 不阻断，该行空白字段视为 null |
| `IMAGE_EXTRACT_FAIL` | 单张图片读取失败 | Warning | "第 X 行图片 '{name}' 提取失败：{reason}" | 该单元格返回 null + error |
| `IMAGE_FORMAT_UNSUPPORTED` | 图片格式非 PNG/JPEG/GIF | Warning | "第 X 行图片 '{name}' 格式不支持（{fmt}），已跳过" | 该图片跳过，不影响同单元格其他图片 |
| `IMAGE_CORRUPT` | 图片数据损坏（格式头异常） | Warning | "第 X 行图片 '{name}' 已损坏，无法显示" | 该图片跳过 |
| `IMAGE_SIZE_LIMIT` | 所有图片总大小超 50MB | Warning | "图片总大小超过限制（50MB），部分图片未加载" | 截断加载，后续图片为 null |
| `IMAGE_SINGLE_TOO_LARGE` | 单张图片 > 5MB | Warning | "第 X 行图片 '{name}' 过大（{size}MB），可能导致页面加载缓慢" | 仍然加载（仅警告） |
| `NO_DATA_ROWS` | 数据行数为 0 | Warning（UI 状态） | "未检测到数据行" | 取消"首行为表头"或换文件 |
| `ZERO_COLUMNS` | 解析出 0 列 | Fatal | "未检测到任何数据列" | 上传新文件 |

### 7.2 错误 UI 组件规格

**Fatal Error Banner**（红色横幅）：

```
┌──────────────────────────────────┐
│ ❌ 文件解析失败                  │
│    文件已损坏或不是有效的 .xlsx  │
│    文件。                        │
│                                  │
│ [查看详情 ▸]        [🔄 重试]   │
└──────────────────────────────────┘
```

- `查看详情` 展开显示技术细节（`detail` 字段内容，适合开发者调试）
- `重试` 按钮返回初始空状态

**Warning Banner 或内联警告**：

- 高优先级（如 `NO_DATA_ROWS`）：黄色横幅，位于数据预览区域顶部
- 低优先级（如单元格级图片处理失败）：内联图标 ⚠️ + 说明文字，出现在具体行/列旁边

---

## 8. 可访问性与国际化

### 8.1 国际化

- **所有 UI 文本为中文**（简体中文）
- 列名由用户数据决定，不翻译
- 错误消息、提示文字、按钮标签均为中文硬编码（MVP 阶段不做 i18n 框架）
- 编码名称、文件格式等技术术语保留英文原词（如 "UTF-8", "CSV", "xlsx"）

### 8.2 键盘可访问性

**文件上传区域**：
- 区域可聚焦 (`tabindex="0"`)
- 聚焦时显示聚焦环（`:focus-visible` 样式）
- `Enter` 或 `Space` 触发文件选择器
- 文件选择器打开后，依赖系统原生文件浏览对话框的键盘操作

**"首行为表头"复选框**：
- 标准 `<input type="checkbox">`，原生键盘操作
- 标签可点击（`<label>` 包裹）

**编码选择器和分隔符选择器**：
- 使用 `<select>` 或 `<fieldset>` + `<input type="radio">`，原生键盘操作

**展开/收折预览**：
- 使用 `<button>` 或 `<details>` + `<summary>`
- `aria-expanded` 属性标记展开状态

### 8.3 屏幕阅读器 (Screen Reader)

**拖拽上传区域**：
- `role="button"` 或 `role="region"`
- `aria-label="上传 Excel 或 CSV 文件"`
- `aria-describedby` 指向支持格式说明文本
- `aria-live="polite"` 用于动态状态变更（如 "文件已上传，正在解析"）

**错误提示**：
- `role="alert"` 用于 Fatal 错误（使其被立即朗读）
- `aria-live="polite"` 用于 Warning
- 错误消息元素可聚焦，确保可被屏幕阅读器逐字阅读

**字段列表**：
- 使用 `<table>` 元素（原生表格对屏幕阅读器的行列导航支持良好）
- `<caption>` 或 `aria-label="字段列表"` 描述表格用途
- `<th scope="col">` 标注表头列

**图标 alt 文本**：
- 类型图标 📝：`alt=""`（仅装饰）或 `aria-label="文本列"`
- 类型图标 🖼️：`alt=""`（仅装饰）或 `aria-label="图片列"`
- 缩略图：`alt="列名 预览"`（如 `alt="商品图 预览"`）
- UI 中不使用 emoji 作为信息唯一载体，所有 icon 必须有文本备选

### 8.4 对比度与可读性

- 错误文本颜色与背景的对比度 ≥ 4.5:1（WCAG AA）
- 拖拽区域边框颜色在 hover/focus 时有明显变化
- 文字大小 ≥ 11px（Figma 插件标准 UI 字号），关键文本 ≥ 12px

---

## 9. UI 布局示意

Task 02 的 UI 区域在插件面板中的总体布局如下。整个插件面板的完整布局应由 Task 00（框架搭建）定义，此处仅展示数据源管理区域。

### 9.1 插件面板总体区域划分

```
┌───────────────────────────────┐
│  📋 批量填充模板生成器        │ ← 标题栏
├───────────────────────────────┤
│                               │
│  ╔═══════════════════════════╗│
│  ║  1. 数据源 (Task 02)     ║│ ← 本任务区域
│  ║                          ║│
│  ║  ┌──────────────────┐    ║│
│  ║  │  文件上传区域     │    ║│
│  ║  └──────────────────┘    ║│
│  ║  ┌──────────────────┐    ║│
│  ║  │  字段列表         │    ║│
│  ║  └──────────────────┘    ║│
│  ║  ┌──────────────────┐    ║│
│  ║  │  数据预览         │    ║│
│  ║  └──────────────────┘    ║│
│  ╚═══════════════════════════╝│
│                               │
│  ╔═══════════════════════════╗│
│  ║  2. 模板选择 (Task 03)   ║│
│  ╚═══════════════════════════╝│
│                               │
│  ╔═══════════════════════════╗│
│  ║  3. 字段映射 (Task 04)   ║│
│  ╚═══════════════════════════╝│
│                               │
│  ┌───────────────────────────┐│
│  │      [ 生成 (10页) ]      ││ ← 生成按钮 (Task 05)
│  └───────────────────────────┘│
│                               │
└───────────────────────────────┘
```

### 9.2 数据源区域内部详细布局

```
┌─ 1. 数据源 ─────────────────────┐
│                                  │
│  [文件上传区域]                  │
│  ┌────────────────────────────┐ │
│  │  📁 拖放或点击上传        │ │
│  │  Excel (.xlsx) 或 CSV     │ │
│  └────────────────────────────┘ │
│                                  │
│  [解析后显示]                    │
│  ╔════════════════════════════╗ │
│  ║ 字段列表 (全部 N 列)      ║ │
│  ║ ┌──┬────────┬────┬──────┐ ║ │
│  ║ │# │ 列名   │ 类型│ 样本 │ ║ │
│  ║ ├──┼────────┼────┼──────┤ ║ │
│  ║ │1 │ 标题   │ 📝 │ 夏日 │ ║ │
│  ║ │2 │ 商品图 │ 🖼️ │ [图] │ ║ │
│  ║ └──┴────────┴────┴──────┘ ║ │
│  ╚════════════════════════════╝ │
│                                  │
│  ╔════════════════════════════╗ │
│  ║ 📊 共 10 行数据           ║ │
│  ║ （已忽略 3 行空白行）     ║ │
│  ║                            ║ │
│  ║ ☑ 首行为表头              ║ │
│  ║ 编码：[UTF-8 ▾] (csv)     ║ │
│  ║ 分隔符：◎ ,  ○ ;  ○ 自动  ║ │
│  ║                            ║ │
│  ║ [展开预览 ▸]              ║ │
│  ╚════════════════════════════╝ │
│                                  │
└──────────────────────────────────┘
```

### 9.3 响应式约束

- 插件面板宽度：由 Figma 决定（通常 300–400px），不做假设
- 迷你表格 > 4 列时启用水平滚动（`overflow-x: auto`）
- 字段列表 > 10 列时整个区域启用垂直滚动（`max-height: 300px; overflow-y: auto`）

---

## 10. 验收标准

以下验收场景直接对应 FR-01 至 FR-05，构成 Task 02 的 Definition of Done。

### AC-2.1：上传 .xlsx 文件，成功解析（FR-01）

```
Given 用户准备了一个标准 .xlsx 文件
  And 文件包含 1 行表头 + 5 行数据
  And 文件大小 < 10MB
 When 用户拖拽或点击上传该文件
 Then UI 显示解析中状态（loading）
 Then 解析完成后显示字段列表（5 个字段）
 Then 数据预览显示 "共 5 行数据"
 Then 无错误信息
```

### AC-2.2：上传 .csv 文件，成功解析（FR-02）

```
Given 用户准备了一个 UTF-8 编码的 .csv 文件
  And 文件包含表头 + 10 行数据
 When 用户拖拽或点击上传该文件
 Then 编码自动识别为 UTF-8
 Then 分隔符自动识别正确
 Then 字段列表显示正确的列名
 Then 数据预览显示 "共 10 行数据"
```

### AC-2.3：上传 GBK 编码的 CSV，自动编码检测（FR-02+FR-05）

```
Given 用户准备了一个 GBK 编码的 .csv 文件（Windows 中文环境导出）
  And 文件中包含中文列名和数据
 When 用户拖拽或点击上传该文件
 Then 编码自动识别为 GBK（而非 UTF-8）
 Then 中文列名和数据正确显示（无乱码）
 Then 编码选择器显示 "GBK (自动检测)"
```

### AC-2.4：无表头文件的列名生成（FR-03）

```
Given 用户准备了一个无表头的 .csv 文件
  And 文件包含 3 列数据，10 行
 When 用户上传该文件
  And 用户取消"首行为表头"复选框
 Then 列名显示为 "列 A"、"列 B"、"列 C"
 Then 数据预览显示 "共 10 行数据"
 Then 第 1 行数据为文件的第一行
```

### AC-2.5：空列名回退（FR-03）

```
Given 用户准备了一个 .xlsx 文件
  And 第 3 列表头为空
 When 用户上传该文件（"首行为表头"默认选中）
 Then 第 3 列（columnIndex=2）的列名显示为 "列 C"
 Then 其他列名使用表头原始值
```

### AC-2.6：重复列名去重（FR-03）

```
Given 用户准备了一个 .xlsx 文件
  And 第 1 列和第 3 列表头均为 "标题"
 When 用户上传该文件
 Then 第 1 列显示为 "标题"
 Then 第 3 列显示为 "标题_1"
```

### AC-2.7：零数据行处理（FR-04）

```
Given 用户准备了一个 .xlsx 文件
  And 文件仅包含 1 行（表头），无数据行
 When 用户上传该文件
 Then 数据显示 "共 0 行数据"
 Then 显示黄色警告 "未检测到数据行"
 Then 生成按钮处于禁用状态
 Then 字段列表仍可见
```

### AC-2.8：全空白行过滤（FR-04）

```
Given 用户准备了一个 .csv 文件
  And 文件有 5 行数据 + 2 行全空白（""）
 When 用户上传该文件
 Then 数据显示 "共 5 行数据"
 Then 显示提示 "（已忽略 2 行空白行）"
```

### AC-2.9：损坏的 xlsx 文件处理（FR-05）

```
Given 用户准备了一个已损坏的 .xlsx 文件（如截断的 ZIP）
 When 用户上传该文件
 Then 显示红色错误横幅
 Then 错误消息说明解析失败原因（"文件已损坏或不是有效的 .xlsx 文件"）
 Then 不显示字段列表和数据预览
 Then 显示"重新上传"按钮
```

### AC-2.10：超大文件处理（FR-05）

```
Given 用户准备了一个 15MB 的 .xlsx 文件
 When 用户上传该文件
 Then 立即显示错误 "文件过大（> 10MB），请使用更小的文件"
 Then 不进入解析流程
```

### AC-2.11：不支持的扩展名（FR-05）

```
Given 用户选择了一个 .xls 文件（旧式 Excel）
 When 用户尝试上传
 Then 显示错误 "不支持的文件格式 .xls，请上传 .xlsx 或 .csv 文件"
```

### AC-2.12：Excel 嵌入图片列识别

```
Given 用户准备了一个 .xlsx 文件
  And 第 2 列（列 B）的单元格包含嵌入图片
 When 用户上传该文件
 Then 字段列表中第 2 列显示为图片列（🖼️ 图标）
 Then 该列样本值显示图片缩略图
 Then 其他列显示为文本列（📝 图标）
```

### AC-2.13：编码切换重新解析（FR-02）

```
Given 用户上传了一个 CSV 文件（自动检测为 UTF-8）
 When 用户从编码选择器切换为 GBK
 Then 文件重新以 GBK 编码解析
 Then 字段列表和数据预览刷新
 Then 编码选择器显示 "GBK"
```

### AC-2.14：分隔符切换重新解析（FR-02）

```
Given 用户上传了一个以分号分隔的 CSV 文件（自动检测为 `;`）
 When 用户从分隔符选择器切换为 `,`
 Then 文件重新以逗号分隔解析
 Then 字段列表和数据预览刷新
```

### AC-2.15：空文件处理（FR-05）

```
Given 用户选择了一个大小为 0 字节的 .csv 文件
 When 用户上传
 Then 显示错误 "文件为空，请选择有效的数据文件"
```

### AC-2.16：CSV 图片列不存在

```
Given 用户上传了一个 .csv 文件
 When 解析完成
 Then 所有列的 type 均为 'text'
 Then 没有任何列的 type 为 'image'
 Then 数据预览中的类型图标均为 📝
```

---

## 11. 产出文件清单

### 11.1 新建文件

| 文件路径 | 职责 | 说明 |
|----------|------|------|
| `src/ui/components/FileUploadZone.ts` | 文件上传区域组件 | 包含拖拽上传、点击上传、文件校验逻辑 |
| `src/ui/components/FieldList.ts` | 列名清单组件 | 表格形式展示字段信息，支持图片缩略图 |
| `src/ui/components/DataPreview.ts` | 数据预览组件 | 行数显示、"首行为表头"切换、迷你表格、编码/分隔符选择器 |
| `src/ui/parsers/FileParser.ts` | 解析器入口 | 根据文件格式分发到 ExcelParser 或 CsvParser |
| `src/ui/parsers/ExcelParser.ts` | Excel 解析器 | SheetJS 集成、工作簿读取、嵌入图片提取 |
| `src/ui/parsers/CsvParser.ts` | CSV 解析器 | Papaparse 集成、编码检测、分隔符检测 |
| `src/ui/parsers/encoding.ts` | 编码工具 | TextDecoder 封装、编码自动检测、支持编码列表 |
| `src/ui/state/dataSourceState.ts` | 数据源状态管理 | `DataSourceState` 管理、状态变更通知 |

### 11.2 修改文件

| 文件路径 | 修改内容 |
|----------|---------|
| `ui.html` | 引入 xlsx 和 Papaparse 库的 `<script>` 标签（或由构建工具内联）；引入 Task 02 的组件入口脚本 |
| `package.json` | 新增依赖：`xlsx`、`@types/papaparse`（Papaparse 自带类型声明）、`papaparse` |
| `docs/specs/task-01-types/README.md` | 确保 Task 01 中定义了 `SourceTable`、`TableField`、`TableCell`、`ImageData`、`ParseError` 等数据结构 |

### 11.3 新增依赖

```json
{
  "dependencies": {
    "xlsx": "^0.18.5",
    "papaparse": "^5.4.1"
  },
  "devDependencies": {
    "@types/papaparse": "^5.3.14"
  }
}
```

> **注意**：`@types/xlsx` 不需要单独安装（`xlsx` 包自带类型声明）。

### 11.4 不产出文件

- Task 02 **不修改** `code.ts`（不涉及 Figma 沙盒逻辑）
- Task 02 **不修改** `manifest.json`
- Task 02 **不修改** `tsconfig.json`

---

## 附录 A：参考资源

- [SheetJS 文档 — Cell Objects](https://docs.sheetjs.com/docs/csf/cell)
- [SheetJS 文档 — Embedded Objects (Images)](https://docs.sheetjs.com/docs/miscellany/embedded)
- [Papaparse 文档](https://www.papaparse.com/docs)
- [TextDecoder — MDN](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder)
- [File API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/File)
- [WCAG 2.1 AA 对比度要求](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)
- [Figma Plugin API](https://www.figma.com/plugin-docs/)

## 附录 B：变更记录

| 版本 | 日期 | 变更内容 | 作者 |
|------|------|---------|------|
| v1.0 | 2026-05-14 | 初稿 | — |

---

> **本文档状态**：待审核 (Draft)
> **下一任务**：[Task 03 — 模板选择](../task-03-template-selection/README.md)
