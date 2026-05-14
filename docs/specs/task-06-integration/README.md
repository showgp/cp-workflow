# Task 06: 集成、预览与反馈 (Integration, Preview & Feedback)

## 1. 任务概述

| 属性 | 值 |
|------|-----|
| **Task ID** | TASK-06 |
| **任务名称** | 集成、预览与反馈 |
| **优先级** | P0（最高优先级，核心交付物） |
| **依赖** | TASK-01（架构/类型/消息协议）、TASK-02（文件上传与数据解析）、TASK-03（模板选择与图层发现）、TASK-04（字段映射系统）、TASK-05（批量生成引擎） |
| **预估工期** | 5-7 个工作日 |

### 任务简述

本任务负责将所有独立模块整合为一个完整的、面向用户的 Figma 插件体验。包含以下核心工作：

1. **整体 UI 外壳设计**：定义插件的完整面板布局、各功能区块的组织方式以及区块间的导航/显示逻辑
2. **端到端数据流串联**：定义从插件打开→上传文件→选择模板→建立映射→生成→查看结果的完整数据流转路径
3. **状态管理体系**：设计全局应用状态对象、状态更新机制和状态驱动的 UI 渲染模式
4. **预览与反馈 UI**：实现生成前的预览信息展示（FR-19）、生成中的实时进度展示（FR-20）、生成后的结果摘要展示（FR-21）以及零映射确认对话框（FR-15）
5. **接受测试方案**：定义端到端验收测试用例和手动测试检查清单

---

## 2. 整体 UI 架构

### 2.1 设计原则

- **单页面滚动布局**（非多步骤向导）：MVP 阶段采用单页滚动布局，让用户在同一视图内看到所有上下文信息。相比多步骤向导，单页布局更简单、开发成本更低，且用户无需在步骤间来回切换即可快速调整。
- **渐进式展示**：不相关的区块在条件不满足时自动隐藏，减少视觉干扰。
- **状态驱动渲染**：所有 UI 变化完全由状态对象驱动，避免隐式 UI 状态。

### 2.2 插件面板完整布局

Figma 插件面板是一个垂直 iframe，典型宽度约 350px，高度可变。以下为完整面板布局设计：

```
┌──────────────────────────────────────────────┐
│  📋 批量套版生成器                   v1.0.0  │  ← Header bar（固定顶部）
├──────────────────────────────────────────────┤
│                                              │
│  ┌─ 📁 数据源 ────────────────────────────┐  │
│  │                                         │  │
│  │  ┌─────────────────────────────────┐    │  │
│  │  │      拖放或点击上传文件          │    │  │
│  │  │    📄 支持 .xlsx / .csv 格式     │    │  │
│  │  └─────────────────────────────────┘    │  │
│  │                                         │  │
│  │  ✅ 已加载: 商品数据.xlsx              │  │
│  │  ┌─────────────────────────────────┐    │  │
│  │  │ ☑ 首行为表头                     │    │  │
│  │  │ 共 50 行数据，6 个字段            │    │  │
│  │  │ 字段: 标题, 描述, 价格, ...      │    │  │
│  │  └─────────────────────────────────┘    │  │
│  │                                         │  │
│  └─────────────────────────────────────────┘  │
│                                              │
│  ┌─ 🖼️ 模板选择 ──────────────────────────┐  │
│  │                                         │  │
│  │  ✅ 已选择: "商品卡片模板"              │  │
│  │  📐 Frame · 400 × 600px                │  │
│  │  📝 文本图层 3 个                       │  │
│  │  🖼️ 图片图层 2 个                       │  │
│  │                                         │  │
│  │  状态：无选择时                          │  │
│  │  ⚠️ 请在画布中选择一个 Frame 作为模板    │  │
│  │                                         │  │
│  │  状态：选择了非 Frame 对象时             │  │
│  │  ❌ 当前选择为 "Group"，请选择一个 Frame │  │
│  │                                         │  │
│  └─────────────────────────────────────────┘  │
│                                              │
│  ┌─ 🔗 字段映射 ──────────────────────────┐  │
│  │                                         │  │
│  │  ┌─────────────────────────────────┐    │  │
│  │  │ 数据字段        目标图层         │    │  │
│  │  │ ─────────────────────────────── │    │  │
│  │  │ 标题 (文本)  →  图层/标题     ✕ │    │  │
│  │  │ 描述 (文本)  →  图层/描述     ✕ │    │  │
│  │  │ 价格 (文本)  →  图层/价格     ✕ │    │  │
│  │  │ 图片 (图片)  →  图层/商品图   ✕ │    │  │
│  │  └─────────────────────────────────┘    │  │
│  │  [+ 添加新映射]                         │  │
│  │  已映射 4 / 未映射 2                     │  │
│  │                                         │  │
│  │  状态：模板切换警告                      │  │
│  │  ⚠️ 模板已更改，之前的映射已被清除       │  │
│  │                                         │  │
│  └─────────────────────────────────────────┘  │
│                                              │
│  ┌─ 📊 生成预览 ──────────────────────────┐  │
│  │                                         │  │
│  │  将生成: 50 页                          │  │
│  │  已映射字段: 4 个                       │  │
│  │  潜在问题: 2 行数据存在空字段           │  │
│  │  ⚠️ 未映射的字段将不会进行内容替换       │  │
│  │                                         │  │
│  └─────────────────────────────────────────┘  │
│                                              │
│  ┌─────────────────────────────────────────┐  │
│  │         🚀 开始生成（50 页）             │  │
│  └─────────────────────────────────────────┘  │
│                                              │
└──────────────────────────────────────────────┘
```

### 2.3 区块（Section）显示逻辑

并非所有区块同时可见，以下为各区块的显示条件：

| 区块 | 显示条件 | 隐藏时的行为 |
|------|---------|-------------|
| **Header 栏** | 始终显示 | — |
| **数据源** | 始终显示（用户第一个操作入口） | — |
| **模板选择** | 始终显示 | — |
| **字段映射** | `dataSource.status === 'loaded'` **且** `template.status === 'valid'` 时显示 | 隐藏整个映射区块，不清除已有映射数据 |
| **生成预览** | `dataSource.status === 'loaded'` **且** `template.status === 'valid'` **且** `table.rows.length > 0` 时显示 | 隐藏预览区块 |
| **生成按钮** | `dataSource.status === 'loaded'` **且** `template.status === 'valid'` **且** `table.rows.length > 0` 时显示 | 隐藏按钮（或用禁用状态占位） |

#### 特殊显示规则

- **当数据源加载失败时**：模板选择区块仍然可见（用户可以继续选择模板），但映射、预览和生成按钮区块隐藏。
- **当模板选择无效时**：映射区块显示但呈灰色禁用态（保留已建立的映射数据，仅视觉上灰化），预览和生成按钮区块隐藏。
- **当数据行数为 0 时**：预览区块显示"未检测到数据行"提示，生成按钮隐藏。

### 2.4 各区块初始/空白状态

系统应处理以下初始和边界状态：

#### 数据源区块 - 初始状态

```
┌─ 📁 数据源 ────────────────────────────────┐
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │                                     │    │
│  │         📄  拖放文件到此处           │    │
│  │         或点击选择文件               │    │
│  │                                     │    │
│  │     支持 .xlsx .xls .csv 格式       │    │
│  │                                     │    │
│  └─────────────────────────────────────┘    │
│                                             │
└─────────────────────────────────────────────┘
```

#### 模板选择区块 - 初始状态（无选择）

```
┌─ 🖼️ 模板选择 ──────────────────────────────┐
│                                             │
│  ⚠️ 请在画布中选择一个 Frame 作为模板       │
│                                             │
│  操作提示：                                 │
│  1. 在 Figma 画布中选中目标 Frame            │
│  2. 确保 Frame 内包含需要替换的文本/图片图层  │
│  3. 图层名称将用于后续映射配置               │
│                                             │
└─────────────────────────────────────────────┘
```

#### 字段映射区块 - 初始状态（数据/模板就绪但无映射）

```
┌─ 🔗 字段映射 ──────────────────────────────┐
│                                             │
│  尚未建立任何映射                            │
│  请将数据字段与模板图层关联以进行内容替换     │
│                                             │
│  [+ 添加第一组映射]                         │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 3. 完整数据流

### 3.1 初始化流程

```
Figma 用户在画布中运行插件
    │
    ▼
Sandbox 执行 main 函数
    │
    ├─→ figma.showUI(__html__, { width: 360, height: 560 })
    │      创建 iframe，加载 ui.html
    │
    ▼
UI iframe 加载完成，DOM 就绪
    │
    ├─→ 初始化全局 AppState 为默认值
    ├─→ 注册所有消息处理器
    ├─→ 注册 DOM 事件监听器
    ├─→ 发送消息: { type: 'ui-ready' }
    │
    ▼
Sandbox 收到 'ui-ready'
    │
    ├─→ 获取当前选中状态: figma.currentPage.selection
    ├─→ 验证选中对象（是否为 Frame、是否有可填充图层）
    ├─→ 发送消息: { type: 'selection-changed', payload: { ... } }
    │
    ▼
Sandbox 启动事件监听
    │
    ├─→ figma.on('selectionchange', () => { ... })
    │     每次用户选中改变时，重新验证并发送 selection-changed
    │
    ▼
UI 收到 'selection-changed'
    │
    ├─→ 更新 state.template
    ├─→ 根据模板状态决定是否请求详细图层信息
    ├─→ 渲染模板选择区块
    ├─→ 触发联动逻辑（见第 9 节）
    │
    ▼
UI 初次渲染完成
    │
    └─→ 用户看到初始面板（数据源空 + 模板选择提示）
```

#### 初始化状态一览

| 状态字段 | 初始值 |
|---------|--------|
| `dataSource.status` | `'empty'` |
| `template.status` | `'no-selection'` |
| `mapping.entries` | `[]` |
| `generation.status` | `'idle'` |

### 3.2 文件上传流程

```
用户通过拖放或点击上传文件
    │
    ▼
UI 文件选择/拖放事件触发
    │
    ├─→ 验证文件扩展名（.xlsx / .xls / .csv）
    │     └─ 不合法 → 更新 state.dataSource.status = 'error', 显示错误提示
    │
    ├─→ 更新 state.dataSource.status = 'loading'
    ├─→ 渲染加载状态（上传区域显示 spinner 或进度提示）
    │
    ├─→ 调用 TASK-02 的解析逻辑:
    │     ├─ .xlsx: 使用 SheetJS (xlsx) 库读取
    │     └─ .csv: 使用 Papaparse 库读取
    │
    ├─→ 解析成功:
    │     ├─→ 提取表头行（如果勾选"首行为表头"）
    │     ├─→ 提取所有数据行
    │     ├─→ 识别字段类型（文本/数字/图片）
    │     ├─→ 如有嵌入图片，提取图片数据为 base64
    │     ├─→ 更新 state.dataSource:
    │     │     status: 'loaded'
    │     │     fileName: 'xxx.xlsx'
    │     │     table: { fields: [...], rows: [...], images: {...} }
    │     │     hasHeaderRow: true
    │     │     error: undefined
    │     ├─→ 触发联动: 如果之前有映射且模板 ID 未变，保留映射
    │     │    如果文件名/来源不同，清除所有映射
    │     ├─→ 触发联动: 更新预览区块
    │     └─→ 触发联动: 更新生成按钮状态
    │
    ├─→ 解析失败:
    │     ├─→ 更新 state.dataSource:
    │     │     status: 'error'
    │     │     error: '文件格式不正确，无法解析' | '文件读取失败' | ...
    │     ├─→ 不清除已有映射（用户可能是误操作）
    │     └─→ 渲染错误提示: "❌ 文件解析失败: {具体原因}"
    │
    ▼
渲染数据源区块
    ├─→ 已加载状态: 显示文件名、行数、字段列表、首行表头开关
    └─→ 错误状态: 显示错误信息 + "重新上传"按钮
```

#### 文件更新时的映射处理策略

当用户上传新文件时，需要决定如何处理已建立的映射关系：

| 场景 | 处理策略 |
|------|---------|
| **文件名与之前相同** | 保留映射。重新解析后根据字段名匹配已有映射条目，无法匹配的映射条目标记为"字段不存在" |
| **文件名与之前不同** | 清除所有映射。新文件的结构完全不同，旧映射无意义 |
| **用户切换表头开关** | 清除所有映射。表头行改变意味着字段列表可能完全不同，旧映射全部失效 |

### 3.3 模板选择流程

```
用户在 Figma 画布中选中一个对象
    │
    ▼
Sandbox: figma.on('selectionchange') 触发
    │
    ├─→ 获取当前选中: const selection = figma.currentPage.selection
    │
    ├─→ 无选中 (selection.length === 0):
    │     └─→ 发送: { type: 'selection-changed', payload: { hasSelection: false } }
    │
    ├─→ 有选中:
    │     ├─→ 取 selection[0] 作为候选模板 (MVP 仅支持单模板)
    │     ├─→ 验证: selected.type === 'FRAME'
    │     │     ├─ 否 → 发送:
    │     │     │     { type: 'selection-changed', payload: {
    │     │     │       hasSelection: true,
    │     │     │       isValid: false,
    │     │     │       nodeType: selected.type,
    │     │     │       message: '请选择一个 Frame，而不是 {类型名称}'
    │     │     │     }}
    │     │     │
    │     │     └─ 是 → 继续验证
    │     │
    │     ├─→ 扫描选中 Frame 内的可填充图层 (TASK-03 逻辑):
    │     │     ├─→ 递归遍历子节点
    │     │     ├─→ 收集所有 TEXT 节点 → textLayers
    │     │     ├─→ 收集所有支持图片填充的节点 → imageLayers
    │     │     └─→ 合计可填充图层总数
    │     │
    │     ├─→ 构建消息并发送:
    │     │     { type: 'selection-changed', payload: {
    │     │       hasSelection: true,
    │     │       isValid: !!(textLayers.length || imageLayers.length),
    │     │       nodeId: selected.id,
    │     │       nodeName: selected.name,
    │     │       nodeType: selected.type,
    │     │       textLayerCount: textLayers.length,
    │     │       imageLayerCount: imageLayers.length,
    │     │       message: textLayers.length + imageLayers.length === 0
    │     │         ? '该 Frame 内没有可填充的文本或图片图层'
    │     │         : undefined
    │     │     }}
    │     │
    │     └─→ 如果此时有待处理的 request-template-layers 请求，一并响应
    │
    ▼
UI 收到 'selection-changed'
    │
    ├─→ 比较新旧 nodeId:
    │     ├─ 不同 → 模板已更改
    │     │     ├─→ 如果 mapping.entries.length > 0:
    │     │     │     设置 mapping.showTemplateChangeWarning = true
    │     │     │     清空 mapping.entries = []
    │     │     │     更新 mapping.templateId = newNodeId
    │     │     └─→ 如果 mapping.entries.length === 0: 仅更新 templateId
    │     └─ 相同 → 模板未变（可能只是属性更新），保留映射
    │
    ├─→ 更新 state.template
    ├─→ 渲染模板选择区块
    │
    ├─→ 如果 template.status === 'valid':
    │     └─→ 发送 { type: 'request-template-layers' }
    │           请求详细图层列表（名称、ID、类型）
    │
    ▼
Sandbox 收到 'request-template-layers'
    │
    ├─→ 确认当前选中仍为之前的 Frame（防止竞态）
    ├─→ 构建详细图层信息列表 (TASK-03 逻辑)
    ├─→ 发送: { type: 'template-layers', payload: { layers: [...] } }
    │
    ▼
UI 收到 'template-layers'
    │
    ├─→ 更新 state.template.layers
    ├─→ 渲染图层列表
    └─→ 更新映射编辑器的目标图层选项
```

#### 模板选择区块的各状态渲染

| 状态 | 图标 | 标题/内容 | 额外操作 |
|------|------|----------|---------|
| `no-selection` | ⚠️ | "请在画布中选择一个 Frame 作为模板" | 无 |
| `invalid` | ❌ | "当前选择为「{type}」，请选择一个 Frame" | 无 |
| `no-layers` | ⚠️ | "Frame「{name}」内没有可填充的文本或图片图层" | 无 |
| `valid` | ✅ | "已选择: 「{name}」· 文本 {n} 个 · 图片 {m} 个" | 显示图层列表 |

### 3.4 生成流程

这是整个插件最核心的业务流程，涉及 UI 和 Sandbox 之间的密切协调。

```
用户点击「开始生成」按钮
    │
    ▼
UI: 生成前检查
    │
    ├─→ 检查 mapping.entries.length === 0:
    │     └─→ 弹出零映射确认对话框 (见第 8 节)
    │            ├─ 用户点「取消」→ 终止，不进入生成
    │            └─ 用户点「继续生成」→ 继续
    │
    ├─→ 收集生成所需全部数据，构建 GenerationConfig:
    │     {
    │       templateNodeId: state.template.nodeId,
    │       templateNodeName: state.template.nodeName,
    │       mappings: state.mapping.entries,
    │       rows: state.dataSource.table.rows,
    │       images: state.dataSource.table.images || {},
    │       hasHeaderRow: state.dataSource.hasHeaderRow,
    │       fields: state.dataSource.table.fields
    │     }
    │
    ├─→ 切换到进度模式:
    │     state.generation.status = 'generating'
    │     state.generation.progress = {
    │       current: 0,
    │       total: table.rows.length,
    │       issues: [],
    │       warnings: []
    │     }
    │
    ├─→ 渲染进度视图（替换/覆盖主内容区域）
    │
    ├─→ 发送消息:
    │     { type: 'start-generation', payload: { config: generationConfig } }
    │
    ▼
Sandbox 收到 'start-generation'
    │
    ├─→ try {
    │     │
    │     ├─→ 验证模板节点仍存在:
    │     │     const templateNode = figma.getNodeById(config.templateNodeId)
    │     │     if (!templateNode) throw new Error('模板节点已不存在')
    │     │
    │     ├─→ Phase 1: 字体预加载
    │     │     ├─→ 收集所有文本层使用的字体
    │     │     ├─→ 调用 figma.loadFontAsync(font) 逐个加载
    │     │     └─→ 字体加载失败 → 记录 warning，继续（文本可能回退到默认字体）
    │     │
    │     ├─→ Phase 2: 逐行生成（循环）
    │     │     │
    │     │     ├─→ 检查取消标志 (cancelRequested flag):
    │     │     │     └─ 已设置 → 跳出循环，进入取消流程
    │     │     │
    │     │     ├─→ 克隆模板 Frame:
    │     │     │     const clone = templateNode.clone()
    │     │     │     page.appendChild(clone)
    │     │     │
    │     │     ├─→ 遍历 mappings，对每个映射执行:
    │     │     │     ├─→ 获取数据行对应字段的值
    │     │     │     ├─→ 在 clone 中查找目标图层 (findOne + findChild)
    │     │     │     ├─→ 如果值为空/undefined → 记录 issue，跳过该映射
    │     │     │     ├─→ 如果图层未找到 → 记录 warning，跳过该映射
    │     │     │     ├─→ 文本类型: 替换 clone 中文本层的 characters
    │     │     │     └─→ 图片类型: 填充图片到对应图层
    │     │     │
    │     │     ├─→ 定位 clone: x/y 坐标计算，排列为网格或垂直列表
    │     │     │
    │     │     ├─→ 发送进度更新（每 N 行发送一次，避免过于频繁）:
    │     │     │     {
    │     │     │       type: 'generation-progress',
    │     │     │       payload: {
    │     │     │         current: i,
    │     │     │         total: rows.length,
    │     │     │         issues: [...],
    │     │     │         warnings: [...]
    │     │     │       }
    │     │     │     }
    │     │     │
    │     │     └─→ 继续下一行
    │     │     │
    │     │     ├─→ 如果取消了 (cancelRequested):
    │     │     │     └─→ 发送 { type: 'generation-cancelled', payload: { partialResult } }
    │     │     │
    │     │     └─→ 如果全部完成:
    │     │           └─→ 发送 { type: 'generation-complete', payload: { result } }
    │     │
    │     └─→ } catch (error) {
    │           └─→ 发送 { type: 'generation-error', payload: { message: error.message } }
    │         }
    │
    ▼
UI 收到进度/完成/取消/错误消息
    │
    ├─→ 'generation-progress':
    │     ├─→ 更新 state.generation.progress
    │     ├─→ 更新进度条百分比
    │     ├─→ 更新已生成行数、问题数显示
    │     └─→ 注意：合并 issues/warnings（增量添加，而非覆盖）
    │
    ├─→ 'generation-complete':
    │     ├─→ 更新 state.generation.status = 'completed'
    │     ├─→ 更新 state.generation.result
    │     ├─→ 渲染结果视图（替换进度视图）
    │     └─→ 数据源/模板/映射状态保留（允许重新生成）
    │
    ├─→ 'generation-cancelled':
    │     ├─→ 更新 state.generation.status = 'cancelled'
    │     ├─→ 渲染结果视图（显示已取消状态）
    │     └─→ 保留已生成的部分信息
    │
    └─→ 'generation-error':
          ├─→ 更新 state.generation.status = 'error'
          ├─→ 更新 state.generation.error
          └─→ 渲染错误结果视图
```

#### 进度更新频率控制

为避免消息过于频繁导致 UI 线程阻塞，采用以下策略：

- **批量进度上报**：Sandbox 每完成 1 行或每 5 行上报一次进度（可配置），而非逐行上报
- **增量传递 issues/warnings**：进度消息只包含本轮新增的 issues/warnings，UI 端负责累积合并
- **最快渲染保护**：如果总行数 ≤ 3，跳过进度视图，生成完成后直接展示结果

#### 生成结果对象结构

```typescript
interface GenerationResult {
  totalRows: number;           // 总行数
  successCount: number;        // 成功生成页数
  issueCount: number;          // 存在问题的行数（存在问题的行数，该行至少有一个字段为空）
  warningCount: number;        // 存在警告的行数（有图片提取失败等非致命问题的行数）
  issues: GenerationIssue[];   // 问题详情列表
  warnings: GenerationWarning[]; // 警告详情列表
  startTime: number;           // 开始时间戳
  endTime: number;             // 结束时间戳
  durationMs: number;          // 耗时 (ms)
}

interface GenerationIssue {
  rowIndex: number;            // 数据行索引（从 1 开始）
  fieldName: string;           // 相关字段名
  message: string;             // 问题描述，如 "「标题」字段为空"
}

interface GenerationWarning {
  rowIndex: number;
  fieldName: string;
  message: string;             // 如 "图片提取失败，已跳过"
}
```

### 3.5 取消流程

```
用户点击进度视图中的「取消生成」按钮
    │
    ▼
UI 端处理:
    │
    ├─→ 更新生成视图: 取消按钮变为 disabled，文字改为 "正在取消..."
    │
    ├─→ 发送消息: { type: 'cancel-generation' }
    │
    └─→ 等待 Sandbox 响应（不阻塞 UI）
    
    ▼
Sandbox 端处理:
    │
    ├─→ 收到 'cancel-generation' 消息
    │
    ├─→ 设置全局取消标志: cancelRequested = true
    │     （注意：不能立即中断循环，需在当前迭代完成后检查）
    │
    ├─→ 当前正在处理的迭代继续执行完成（确保数据一致性）
    │
    ├─→ 在下一轮循环开始处检测到 cancelRequested === true
    │     ├─→ 跳出循环
    │     ├─→ 统计已生成的结果（successCount = 当前 index, 包含已记录的 issues）
    │     ├─→ 清理未完成的 clone（如果有当前迭代的半成品）
    │     └─→ 发送: { type: 'generation-cancelled', payload: { result: partialResult } }
    │
    ▼
UI 收到 'generation-cancelled':
    │
    ├─→ 更新 state.generation.status = 'cancelled'
    ├─→ 更新 state.generation.result
    └─→ 渲染结果视图（取消状态，灰色基调）
```

#### 取消的边界情况

| 场景 | 处理方式 |
|------|---------|
| **快速生成（<1秒）** | 用户来不及点击取消，进度视图在 300ms 后才显示取消按钮（防抖） |
| **重复点击取消** | 第一次点击后按钮 disabled，忽略后续点击 |
| **取消后无法恢复** | 已生成的 Frame 保留在画布上，不支持"撤销生成"（用户可手动 Ctrl+Z） |
| **已在取消中，又收到完成** | 以取消为准。Sandbox 在设置 cancelRequested 后，即使循环恰好完成，也发送 generation-cancelled |

### 3.6 插件关闭流程

插件面板关闭的两种情况：

#### 情况 1：不在生成中时关闭

```
用户点击面板右上角 X 或点击画布其他地方
    │
    ▼
Figma 销毁 iframe
    │
    └─→ 无特别清理需求。UI 状态自然销毁。
```

#### 情况 2：正在生成中时关闭

```
用户点击面板右上角 X（此时进度条在运行）
    │
    ▼
Figma 销毁 iframe → UI 上下文消失
    │
    ├─→ Sandbox 端:
    │     ├─→ 无法主动检测 UI 已关闭
    │     ├─→ 继续执行生成循环
    │     ├─→ 每次尝试发送 'generation-progress' 时：
    │     │     figma.ui.postMessage(...) 不会抛出错误（Figma API 静默忽略）
    │     ├─→ 生成完成后发送 'generation-complete' → 同样被忽略
    │     └─→ 已生成的 Frame 保留在画布上（这是在关闭前/关闭期间创建的）
    │
    └─→ 用户看到的：
          ├─→ 关闭时已生成的 Frame 在画布上
          └─→ 关闭后 Sandbox 继续生成了更多 Frame（用户不可见进度）
               → 当 Sandbox 完成时，所有 Frame 都在画布上
```

#### 关于关闭检测的说明

Figma 插件 API 中，`figma.on('close')` **不会**在 UI iframe 关闭时触发。该事件只在插件进程被 Figma 终止时触发。因此：

- **当前行为（可接受）**：关闭面板后 Sandbox 继续生成，所有 Frame 最终出现在画布上。用户可能感到困惑（关闭了面板，过一会画布上还在新增 Frame）。
- **未来改进方向**：可考虑通过心跳机制检测 UI 存活状态（Sandbox 定时发送 ping，如果连续 N 次无响应则认为 UI 已关闭，主动停止）。

---

## 4. UI 状态管理

### 4.1 全局应用状态定义

```typescript
interface AppState {
  // ===== 数据源 =====
  dataSource: {
    status: 'empty' | 'loading' | 'loaded' | 'error';
    fileName?: string;           // 上传的文件名
    fileSize?: string;           // 人类可读的文件大小 "128 KB"
    table?: SourceTable;         // 解析后的表格数据 (TASK-02 定义)
    error?: string;              // 错误描述
    hasHeaderRow: boolean;       // 首行是否为表头
  };

  // ===== 模板选择 =====
  template: {
    status: 'no-selection' | 'invalid' | 'no-layers' | 'valid';
    nodeId?: string;             // Figma 节点 ID
    nodeName?: string;           // 节点名称
    nodeType?: string;           // 节点类型（用于错误提示："Group"）
    nodeWidth?: number;          // Frame 宽度
    nodeHeight?: number;         // Frame 高度
    message?: string;            // 用户可见的状态提示
    layers?: PlaceholderLayer[]; // 可填充图层详细列表
    textLayerCount?: number;
    imageLayerCount?: number;
    totalLayerCount?: number;
  };

  // ===== 字段映射 =====
  mapping: {
    entries: MappingEntry[];              // 映射条目列表
    templateId: string | null;            // 绑定的模板 ID（用于检测模板切换）
    showTemplateChangeWarning: boolean;   // 是否显示模板切换警告
    showFileChangeWarning: boolean;       // 是否显示文件变更警告
  };

  // ===== 生成状态 =====
  generation: {
    status: 'idle' | 'confirming' | 'generating' | 'completed' | 'cancelled' | 'error';
    progress?: GenerationProgress;
    result?: GenerationResult;
    error?: string;
    showConfirmDialog?: boolean;  // 是否显示零映射确认弹窗
  };

  // ===== UI 状态 =====
  ui: {
    sectionsVisible: {
      dataSource: boolean;     // 始终 true
      template: boolean;       // 始终 true
      mapping: boolean;        // 动态
      preview: boolean;        // 动态
      generateButton: boolean; // 动态
    };
  };
}

interface GenerationProgress {
  current: number;        // 当前已生成行数
  total: number;          // 总行数
  percentage: number;     // 0-100
  issues: GenerationIssue[];
  warnings: GenerationWarning[];
}
```

### 4.2 状态更新机制

由于 MVP 阶段使用原生 JavaScript（无 React/Vue 等框架），采用简洁的中心化状态管理模式。

#### 核心函数

```typescript
// 全局状态对象
let state: AppState = getInitialState();

// 状态更新函数（浅合并）
function updateState(partial: DeepPartial<AppState>): void {
  // 1. 深度合并 partial 到 state
  state = deepMerge(state, partial);
  
  // 2. 自动计算派生状态
  computeDerivedState();
  
  // 3. 触发 UI 重渲染
  render();
}

// 计算派生状态（如 sectionsVisible）
function computeDerivedState(): void {
  const { dataSource, template } = state;
  
  state.ui.sectionsVisible = {
    dataSource: true,
    template: true,
    mapping: dataSource.status === 'loaded' && template.status === 'valid',
    preview: dataSource.status === 'loaded'
             && template.status === 'valid'
             && (dataSource.table?.rows.length ?? 0) > 0,
    generateButton: dataSource.status === 'loaded'
                    && (dataSource.table?.rows.length ?? 0) > 0
                    && template.status === 'valid'
                    && state.generation.status === 'idle'
  };
}
```

#### 更新触发时机

| 事件 | 调用的更新逻辑 |
|------|-------------|
| 收到 `selection-changed` | `updateState({ template: {...} })` |
| 文件解析成功 | `updateState({ dataSource: {...} })` 并触发映射清理 |
| 文件解析失败 | `updateState({ dataSource: { status: 'error', error: '...' } })` |
| 切换表头开关 | `updateState({ dataSource: { hasHeaderRow: ! } })` 并重新解析 |
| 添加/删除映射 | `updateState({ mapping: { entries: [...] } })` |
| 收到进度更新 | `updateState({ generation: { progress: {...} } })` |
| 生成完成 | `updateState({ generation: { status: 'completed', result: {...} } })` |
| 生成取消 | `updateState({ generation: { status: 'cancelled', result: {...} } })` |

### 4.3 渲染策略

```typescript
function render(): void {
  const app = document.getElementById('app');
  
  // 如果正在生成中，只渲染进度视图
  if (state.generation.status === 'generating') {
    renderProgressView(app);
    return;
  }
  
  // 如果生成已完成/取消/错误，渲染结果视图（覆盖在其他内容之上或替换）
  if (['completed', 'cancelled', 'error'].includes(state.generation.status)) {
    renderResultView(app);
    // 同时渲染下面的区块（用户可以看到当前配置，方便重新生成）
    renderSections(app);
    return;
  }
  
  // 正常状态：渲染所有区块
  renderSections(app);
}

function renderSections(container: HTMLElement): void {
  // 使用 document fragment 批处理 DOM 更新
  // 各区块负责自己的渲染，读取 state 中的对应数据
  renderDataSourceSection(container, state);
  
  if (state.ui.sectionsVisible.template) {
    renderTemplateSection(container, state);
  }
  
  if (state.ui.sectionsVisible.mapping) {
    renderMappingSection(container, state);
  }
  
  if (state.ui.sectionsVisible.preview) {
    renderPreviewSection(container, state);
  }
  
  if (state.ui.sectionsVisible.generateButton) {
    renderGenerateButton(container, state);
  }
  
  // 如果有确认弹窗，渲染在顶层
  if (state.generation.showConfirmDialog) {
    renderConfirmDialog(container, state);
  }
}
```

#### 性能优化

- **局部重渲染**：各渲染函数先计算新旧内容差异（简单 diff），仅更新变化的部分 DOM
- **防抖**：对于频繁触发的更新（如 selection-change），使用防抖（debounce 100ms）避免过度渲染
- **批量 DOM 更新**：使用 `DocumentFragment` 或 `requestAnimationFrame` 批量应用 DOM 变更

### 4.4 状态重置场景

| 场景 | 重置范围 |
|------|---------|
| **上传新文件（不同文件名）** | 清除 `mapping.entries`，重置 `generation` 为 idle |
| **切换首行表头** | 清除 `mapping.entries`，重置 `generation` 为 idle |
| **选择新模板（不同 nodeId）** | 清除 `mapping.entries`，重置 `generation` 为 idle |
| **取消选择** | 清除 `mapping.entries`，重置 `generation` 为 idle |
| **生成完成后** | 保留所有配置（dataSource, template, mapping），仅重置 `generation.status` 为 idle（允许用户重新生成） |

---

## 5. 生成按钮状态逻辑

### 5.1 按钮状态判定矩阵

生成按钮的文本、可用性和样式完全由 `AppState` 计算得出：

| 条件 | 按钮状态 | 按钮文案 | 样式 |
|------|---------|---------|------|
| `dataSource.status === 'empty'` | `disabled` | "请先上传数据文件" | 灰色 |
| `dataSource.status === 'loading'` | `disabled` | "正在解析文件…" | 灰色 + spinner |
| `dataSource.status === 'error'` | `disabled` | "文件解析失败" | 灰色 |
| `dataSource.status === 'loaded'` 且 `table.rows.length === 0` | `disabled` | "未检测到数据行" | 灰色 |
| 数据已加载 且 有数据行 但 `template.status === 'no-selection'` | `disabled` | "请先选择模板 Frame" | 灰色 |
| 数据已加载 且 `template.status === 'invalid'` | `disabled` | "请选择一个 Frame（当前为 {type}）" | 灰色 |
| 数据已加载 且 `template.status === 'no-layers'` | `disabled` | "模板中无可填充的图层" | 灰色 |
| `generation.status === 'generating'` | `disabled` | "生成中…" | 灰色 + spinner |
| 数据已加载（有数据行）+ 模板有效 | `enabled` | "🚀 开始生成（{n}页）" | 主色（蓝色） |

### 5.2 按钮状态计算函数

```typescript
function getGenerateButtonConfig(): ButtonConfig {
  const { dataSource, template, generation } = state;

  // 生成中
  if (generation.status === 'generating') {
    return { disabled: true, text: '生成中…', variant: 'disabled' };
  }

  // 数据源未就绪
  if (dataSource.status === 'empty') {
    return { disabled: true, text: '请先上传数据文件', variant: 'disabled' };
  }
  if (dataSource.status === 'loading') {
    return { disabled: true, text: '正在解析文件…', variant: 'disabled' };
  }
  if (dataSource.status === 'error') {
    return { disabled: true, text: '文件解析失败', variant: 'disabled' };
  }

  // 数据行为空
  const rows = dataSource.table?.rows ?? [];
  if (rows.length === 0) {
    return { disabled: true, text: '未检测到数据行', variant: 'disabled' };
  }

  // 模板未选择或无效
  if (template.status === 'no-selection') {
    return { disabled: true, text: '请先选择模板 Frame', variant: 'disabled' };
  }
  if (template.status === 'invalid') {
    return {
      disabled: true,
      text: `请选择一个 Frame（当前为 ${template.nodeType || '未知'}）`,
      variant: 'disabled'
    };
  }
  if (template.status === 'no-layers') {
    return { disabled: true, text: '模板中无可填充的图层', variant: 'disabled' };
  }

  // 一切就绪
  return {
    disabled: false,
    text: `🚀 开始生成（${rows.length} 页）`,
    variant: 'primary'
  };
}
```

### 5.3 按钮点击行为

```
用户点击「开始生成」
    │
    ├─→ 首先检查: state.mapping.entries.length === 0
    │     ├─→ 是 → 弹出确认对话框（见第 8 节）
    │     │         ├─→ 用户确认 → 继续执行生成流程
    │     │         └─→ 用户取消 → 终止
    │     └─→ 否 → 直接执行生成流程
    │
    ├─→ 更新状态: generation.status = 'generating'
    ├─→ 初始化进度对象
    ├─→ 切换为进度视图
    ├─→ 构建 GenerationConfig
    └─→ 发送 'start-generation' 消息
```

---

## 6. 进度显示 UI (FR-20)

### 6.1 进度视图布局

```
┌──────────────────────────────────────┐
│                                      │
│           🔄 正在生成中               │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ ████████████████░░░░░░░░░░░░░ │  │  ← 进度条
│  └────────────────────────────────┘  │
│              60%                     │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ 已完成: 30 / 50 行             │  │
│  │ 已发现问题: 2 行               │  │
│  │ ⚠️ 警告: 1 行（图片提取失败）   │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │        ⏹ 取消生成              │  │
│  └────────────────────────────────┘  │
│                                      │
│  预计剩余时间: ~15 秒                │
│                                      │
└──────────────────────────────────────┘
```

### 6.2 进度条动画

- 进度条使用 CSS `transition: width 0.3s ease` 实现平滑动画
- 进度条颜色：
  - 0% - 80%：主色（蓝色 `#4A90D9`）
  - 80% - 99%：渐变为黄色（警告色 `#F5A623`）
  - 100%：绿色（成功色 `#7ED321`）
- 进度条内部显示百分比文字（白色，在进度条填充区域内右对齐）

### 6.3 进度更新逻辑

```
UI 收到 'generation-progress' 消息:
    │
    ├─→ 提取: payload.current, payload.total, payload.issues, payload.warnings
    │
    ├─→ 计算百分比: percentage = Math.round((current / total) * 100)
    │
    ├─→ 合并 issues 和 warnings（增量累加）:
    │     state.generation.progress.issues.push(...newIssues)
    │     state.generation.progress.warnings.push(...newWarnings)
    │
    ├─→ 更新显示数字:
    │     - 进度条宽度 → percentage%
    │     - "已完成: current / total 行"
    │     - "已发现问题: issues.length 行"
    │     - 如果有 warnings: "⚠️ 警告: warnings.length 行"
    │
    └─→ 估算剩余时间:
          elapsed = now - startTime
          rate = current / elapsed  (行/ms)
          remaining = (total - current) / rate
          显示为："> 1分钟" / "~30秒" / "~5秒"
          （仅在 current > 5 之后显示，避免初始阶段误差过大）
```

### 6.4 快速生成处理

为防止生成速度极快时闪现进度视图造成体验不佳：

```
if (totalRows <= 3) {
  // 跳过进度视图，直接等待完成
  // 不渲染进度 UI，设置一个最小延迟（300ms）后展示结果
  // 目的是避免 UI 闪烁
}
```

对于行数 > 3 的情况，进度视图始终显示。如果生成在 2 秒内完成，进度条快速到达 100% 后直接过渡到结果视图。

### 6.5 取消按钮交互

- 取消按钮在进度视图渲染 **300ms 后**才变为可点击（防止用户误触）
- 点击后按钮立即 disabled，文字变为 "正在取消…"
- 如果 5 秒内未收到 `generation-cancelled`，显示 "取消超时，请关闭面板"（极少数情况）

---

## 7. 结果展示 UI (FR-21)

### 7.1 全部成功状态（0 问题，0 警告）

```
┌──────────────────────────────────────┐
│                                      │
│              ✅ 生成完成              │
│                                      │
│         全部 50 页生成成功！          │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  耗时: 8.5 秒                  │  │
│  │  请在画布中查看生成的 Frame     │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────┐ ┌──────────┐ │
│  │   🔄 重新生成       │ │ 📋 查看  │ │
│  └────────────────────┘ └──────────┘ │
│                                      │
└──────────────────────────────────────┘
```

### 7.2 部分问题状态（有问题行，0 警告）

```
┌──────────────────────────────────────┐
│                                      │
│              ⚠️ 生成完成              │
│                                      │
│  48 页成功，2 行存在数据缺失          │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ 成功生成: 48 页                │  │
│  │ 问题行: 2 行                   │  │
│  │ 耗时: 8.5 秒                   │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌─ 📋 问题详情 ─────────────────┐  │
│  │ · 第 5 行: 「标题」字段为空    │  │
│  │ · 第 12 行: 「描述」字段为空   │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────┐ ┌──────────┐ │
│  │   🔄 重新生成       │ │ 📋 查看  │ │
│  └────────────────────┘ └──────────┘ │
│                                      │
└──────────────────────────────────────┘
```

### 7.3 带警告状态（0 问题，有警告）

```
┌──────────────────────────────────────┐
│                                      │
│              ℹ️ 生成完成              │
│                                      │
│  50 页全部生成成功，1 行有警告        │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ ⚠️ 第 8 行: 图片"商品图"提取    │  │
│  │    失败，已使用空白占位          │  │
│  └────────────────────────────────┘  │
│                                      │
└──────────────────────────────────────┘
```

### 7.4 取消状态

```
┌──────────────────────────────────────┐
│                                      │
│              ⏸️ 已取消                │
│                                      │
│      共生成 25 / 50 页后取消          │
│                                      │
│  已生成的 Frame 保留在画布上           │
│                                      │
│  ┌────────────────────┐ ┌──────────┐ │
│  │   🔄 重新生成       │ │ 📋 查看  │ │
│  └────────────────────┘ └──────────┘ │
│                                      │
└──────────────────────────────────────┘
```

### 7.5 错误状态

```
┌──────────────────────────────────────┐
│                                      │
│              ❌ 生成失败              │
│                                      │
│  错误信息:                            │
│  模板节点已被删除，无法继续生成         │
│                                      │
│  请检查模板是否仍然存在于画布中         │
│                                      │
│  ┌────────────────────────────────┐  │
│  │        🔄 重新尝试              │  │
│  └────────────────────────────────┘  │
│                                      │
└──────────────────────────────────────┘
```

### 7.6 零映射生成完成状态

当用户未建立任何映射时生成完成，结果展示特殊处理：

```
┌──────────────────────────────────────┐
│                                      │
│              ✅ 生成完成              │
│                                      │
│  已生成 50 页模板副本                 │
│  （未进行内容替换）                    │
│                                      │
│  问题行: 0 行                         │
│  （未建立映射时，不会检查数据缺失）     │
│                                      │
│  ┌────────────────────┐ ┌──────────┐ │
│  │   🔄 重新生成       │ │ 📋 查看  │ │
│  └────────────────────┘ └──────────┘ │
│                                      │
└──────────────────────────────────────┘
```

关键逻辑：当 `generation.result.issueCount === 0` 且 `mapping.entries.length === 0` 时，显示"未建立映射时，不会检查数据缺失"的提示，避免用户困惑。

### 7.7 结果视图操作按钮

| 按钮 | 行为 | 适用场景 |
|------|------|---------|
| **🔄 重新生成** | 重置 generation 状态为 idle，滚动回生成按钮，允许用户修改配置后重新生成 | 所有完成/取消状态 |
| **📋 查看画布** | 发送消息 `{ type: 'focus-canvas' }` 给 Sandbox，Sandbox 调用 `figma.viewport.scrollAndZoomIntoView([...generatedFrames])`，聚焦到生成的 Frame | 生成完成/取消（画布上有内容时） |
| **📋 问题详情** | 展开/收起问题详情列表（默认收起，点击展开） | 有问题行时 |

### 7.8 从结果返回配置

结果视图不替换配置区块，而是在配置区块上方展示（或使用可折叠的结果面板）。这样用户可以：
1. 查看结果
2. 滚动到映射区块修改映射
3. 点击"重新生成"再次运行

---

## 8. 预生成确认对话框 (FR-15)

### 8.1 触发条件

当用户点击「开始生成」按钮时，如果 `state.mapping.entries.length === 0`，弹出确认对话框。

### 8.2 对话框设计

```
┌──────────────────────────────────────────┐
│                                          │
│  ┌────────────────────────────────────┐  │
│  │                                    │  │
│  │         ⚠️  未建立任何映射          │  │
│  │                                    │  │
│  │  将生成 {n} 个模板副本，            │  │
│  │  但不会替换任何文本或图片内容。      │  │
│  │                                    │  │
│  │  是否确认继续？                     │  │
│  │                                    │  │
│  │  ┌──────────────┐ ┌──────────────┐ │  │
│  │  │  继续生成     │ │   取消       │ │  │
│  │  └──────────────┘ └──────────────┘ │  │
│  │                                    │  │
│  └────────────────────────────────────┘  │
│                                          │
│  (半透明遮罩覆盖下方内容)                  │
│                                          │
└──────────────────────────────────────────┘
```

### 8.3 实现细节

- **模态弹窗**：使用绝对定位 + 半透明黑色遮罩（`rgba(0,0,0,0.4)`），覆盖插件面板全部区域
- **阻止背景交互**：遮罩层设置 `pointer-events: all` 阻止点击穿透
- **键盘支持**：
  - `Escape` 键 → 等同点击「取消」
  - `Enter` 键 → 等同点击「继续生成」
- **动画**：弹窗使用简单的 fadeIn 动画（200ms）
- **状态管理**：
  ```
  点击「继续生成」:
    ├─→ 关闭弹窗 (state.generation.showConfirmDialog = false)
    ├─→ generation.status = 'generating'
    └─→ 继续正常生成流程
  
  点击「取消」:
    ├─→ 关闭弹窗 (state.generation.showConfirmDialog = false)
    └─→ 不改变其他状态
  ```

### 8.4 特殊规则

- 该对话框**仅在从 idle 变为 generating 时**触发一次（同一生成会话不重复触发）
- 如果用户关闭对话框后建立了映射再点生成，不再弹窗（因为 `mapping.entries.length > 0`）

---

## 9. 实时数据联动

### 9.1 联动规则总表

| 用户操作 | 触发事件 | 联动影响 |
|---------|---------|---------|
| **上传新文件（不同文件名）** | dataSource 更新 | ① 清除所有映射 `mapping.entries = []` ② 重置生成状态 `generation.status = 'idle'` ③ 更新预览区块（行数变化） ④ 更新生成按钮文案和状态 |
| **上传新文件（相同文件名）** | dataSource 更新 | ① 保留映射，重新匹配字段名 ② 无法匹配的映射标记为"字段不存在" ③ 更新预览区块 ④ 更新生成按钮 |
| **切换「首行为表头」** | dataSource.hasHeaderRow 切换 | ① 重新解析数据（第一行变为数据行或表头行） ② 清除所有映射（字段列表变化） ③ 更新所有相关显示 |
| **选择新 Frame（不同 nodeId）** | template 更新 | ① 设置 `mapping.showTemplateChangeWarning = true` ② 清除所有映射 `mapping.entries = []` ③ 更新 `mapping.templateId` ④ 请求新模板的图层列表 ⑤ 更新映射编辑器的图层选项 |
| **选择变为非 Frame 对象** | template 更新 | ① 映射区块灰化但仍可见 ② 隐藏预览和生成按钮 ③ template.status = 'invalid' |
| **取消选择** | template 更新 | ① 清除映射 ② template.status = 'no-selection' ③ 隐藏所有后续区块 |
| **Frame 内图层变化**（新增/删除子图层） | Sandbox 检测到变化 | ① 更新 template.layers ② 更新映射条目中图层选项（已选图层如果不存在则标记为"图层已删除"） |
| **添加映射条目** | mapping.entries 更新 | ① 更新映射计数 "已映射 n / 未映射 m" ② 更新预览区块的"已映射字段"计数 |
| **删除映射条目** | mapping.entries 更新 | ① 同添加映射 |
| **点击「开始生成」** | generation 状态变更 | ① 切换到进度视图 ② 禁用所有其他交互 |
| **生成完成** | generation 状态变更 | ① 显示结果视图 ② 保留 dataSource/template/mapping 状态 ③ 允许重新生成 |

### 9.2 模板切换时的映射处理

这是最重要的联动场景。当用户选择了不同的 Frame 作为模板时：

```
1. 收到 selection-changed，新 nodeId !== 旧 mapping.templateId
2. 检查: mapping.entries.length > 0?
   ├─→ 是 → 设置 mapping.showTemplateChangeWarning = true
   │        清空 mapping.entries = []
   │        更新 mapping.templateId = newNodeId
   │        渲染警告横幅:
   │        ┌──────────────────────────────────────┐
   │        │ ⚠️ 模板已更改，之前的映射已被清除     │
   │        │    请为新模板重新建立映射关系         │
   │        └──────────────────────────────────────┘
   │        3秒后自动隐藏警告横幅
   │
   └─→ 否 → 仅更新 mapping.templateId，无警告
```

### 9.3 图层变更时的映射处理

```
1. 收到 template-layers（图层列表与之前不同）
2. 遍历 mapping.entries，检查每个 entry 的 targetLayerId:
   ├─→ 图层仍存在 → 保持映射
   └─→ 图层已不存在 → 在该映射条目标记 "图层已删除"（红色警告图标）
      不自动删除映射条目（让用户自行决定如何处理）
```

### 9.4 数据字段变更时的映射处理

当切换表头开关或上传新文件导致字段列表变化时：

```
1. 遍历 mapping.entries，检查每个 entry 的 sourceField:
   ├─→ 字段仍存在 → 保持映射
   └─→ 字段不存在 → 在该映射条目标记 "字段不存在"（红色警告图标 + 禁用态）
      不自动删除映射条目
      但该映射在生成时会被跳过（等效于未映射）
```

---

## 10. 消息协议集成

### 10.1 完整消息生命周期

以下是插件从启动到完成的完整消息序列：

```
阶段 1: 插件启动
─────────────────────────────────────────────────
UI → Sandbox:   { type: 'ui-ready' }
Sandbox → UI:   { type: 'selection-changed', payload: { hasSelection: true/false, ... } }

阶段 2: 用户选择模板 Frame
─────────────────────────────────────────────────
[用户在画布中选中 Frame]
Sandbox → UI:   { type: 'selection-changed', payload: {
                    hasSelection: true,
                    isValid: true,
                    nodeId: '...',
                    nodeName: '商品卡片模板',
                    textLayerCount: 3,
                    imageLayerCount: 2
                }}
UI → Sandbox:   { type: 'request-template-layers' }
Sandbox → UI:   { type: 'template-layers', payload: {
                    layers: [
                      { id: '...', name: '标题', type: 'TEXT', ... },
                      { id: '...', name: '描述', type: 'TEXT', ... },
                      { id: '...', name: '价格', type: 'TEXT', ... },
                      { id: '...', name: '商品图', type: 'IMAGE', ... },
                      { id: '...', name: '徽章', type: 'IMAGE', ... }
                    ]
                }}

阶段 3: 用户切换选择（从模板 A 到模板 B）
─────────────────────────────────────────────────
[用户在画布中选中另一个 Frame]
Sandbox → UI:   { type: 'selection-changed', payload: {
                    nodeId: 'new-id',       // ← 不同
                    nodeName: '模板B',
                    ...
                }}
UI → Sandbox:   { type: 'request-template-layers' }
Sandbox → UI:   { type: 'template-layers', payload: { layers: [...] } }
// UI 自动清除映射 + 显示警告

阶段 4: 用户点击「开始生成」
─────────────────────────────────────────────────
UI → Sandbox:   { type: 'start-generation', payload: {
                    config: {
                        templateNodeId: '...',
                        templateNodeName: '...',
                        mappings: [...],
                        rows: [...],
                        images: {},
                        hasHeaderRow: true,
                        fields: [...]
                    }
                }}

阶段 5: 生成进度（多次）
─────────────────────────────────────────────────
Sandbox → UI:   { type: 'generation-progress', payload: {
                    current: 10,
                    total: 50,
                    percentage: 20,
                    issues: [],
                    warnings: []
                }}
Sandbox → UI:   { type: 'generation-progress', payload: {
                    current: 20,  total: 50,  percentage: 40,
                    issues: [
                        { rowIndex: 5, fieldName: '标题', message: '「标题」字段为空' }
                    ],
                    warnings: []
                }}
Sandbox → UI:   { type: 'generation-progress', payload: {
                    current: 30,  total: 50,  percentage: 60,
                    issues: [
                        { rowIndex: 12, fieldName: '描述', message: '「描述」字段为空' }
                    ],
                    warnings: []
                }}
// ... 更多进度更新 ...

阶段 5a: 用户点击「取消」
─────────────────────────────────────────────────
UI → Sandbox:   { type: 'cancel-generation' }
// Sandbox 在下一轮迭代检查取消标志
Sandbox → UI:   { type: 'generation-cancelled', payload: {
                    result: {
                        totalRows: 50,
                        successCount: 25,
                        issueCount: 1,
                        ...
                    }
                }}

阶段 6: 生成完成
─────────────────────────────────────────────────
Sandbox → UI:   { type: 'generation-complete', payload: {
                    result: {
                        totalRows: 50,
                        successCount: 48,
                        issueCount: 2,
                        warningCount: 0,
                        issues: [...],
                        warnings: [],
                        startTime: 1715678900000,
                        endTime: 1715678908500,
                        durationMs: 8500
                    }
                }}

阶段 6a: 生成失败（异常路径）
─────────────────────────────────────────────────
Sandbox → UI:   { type: 'generation-error', payload: {
                    message: '模板节点已被删除，无法继续生成'
                }}
```

### 10.2 消息类型速查表

| 消息类型 | 方向 | 触发时机 | 频率 |
|---------|------|---------|------|
| `ui-ready` | UI → Sandbox | 插件加载时 | 一次 |
| `selection-changed` | Sandbox → UI | 用户在画布中选中对象 / 插件启动时 | 随用户操作 |
| `request-template-layers` | UI → Sandbox | 收到有效的 selection-changed 后 | 随模板选择 |
| `template-layers` | Sandbox → UI | 响应 request-template-layers | 随请求 |
| `start-generation` | UI → Sandbox | 用户点击生成按钮 | 一次 |
| `generation-progress` | Sandbox → UI | 生成过程中定期发送 | 多次（每 N 行） |
| `generation-complete` | Sandbox → UI | 所有行生成完毕 | 一次 |
| `generation-cancelled` | Sandbox → UI | 用户取消后 | 一次 |
| `generation-error` | Sandbox → UI | 生成过程发生未预期错误 | 一次 |
| `cancel-generation` | UI → Sandbox | 用户点击取消按钮 | 一次 |
| `focus-canvas` | UI → Sandbox | 用户点击"查看画布" | 按需 |

### 10.3 消息处理器注册

```typescript
// UI 端消息处理器注册（在 main.ts 初始化时）
const messageHandlers: Record<string, MessageHandler> = {
  'selection-changed': handleSelectionChanged,
  'template-layers': handleTemplateLayers,
  'generation-progress': handleGenerationProgress,
  'generation-complete': handleGenerationComplete,
  'generation-cancelled': handleGenerationCancelled,
  'generation-error': handleGenerationError,
};

window.onmessage = (event: MessageEvent) => {
  const msg = event.data.pluginMessage as PluginMessage;
  if (!msg) return;
  
  const handler = messageHandlers[msg.type];
  if (handler) {
    handler(msg.payload);
  } else {
    console.warn('[UI] 未注册的消息类型:', msg.type);
  }
};
```

```typescript
// Sandbox 端消息处理器注册（在 code.ts 初始化时）
figma.ui.onmessage = (msg: UIMessage) => {
  switch (msg.type) {
    case 'ui-ready':
      handleUiReady();
      break;
    case 'request-template-layers':
      handleRequestTemplateLayers();
      break;
    case 'start-generation':
      handleStartGeneration(msg.payload.config);
      break;
    case 'cancel-generation':
      handleCancelGeneration();
      break;
    case 'focus-canvas':
      handleFocusCanvas();
      break;
    default:
      console.warn('[Sandbox] 未注册的消息类型:', msg.type);
  }
};
```

---

## 11. 错误处理集成

### 11.1 系统级错误分类

| 错误类别 | 发生位置 | 严重程度 | 处理策略 | 用户可见表现 |
|---------|---------|---------|---------|------------|
| **文件解析错误** | UI | 非致命 | 显示错误信息，允许重试 | 数据源区块显示红色错误提示 |
| **模板验证错误** | Sandbox | 非致命 | 返回错误信息给 UI 展示 | 模板区块显示提示，禁用生成 |
| **字体加载失败** | Sandbox (生成中) | 非致命 | 记录 warning，继续生成。文本可能使用默认字体回退 | 进度中显示警告，结果中展示 |
| **图层查找失败** | Sandbox (生成中) | 非致命 | 跳过该映射，记录 warning，继续下一行 | 结果中标记为警告 |
| **图片填充失败** | Sandbox (生成中) | 非致命 | 跳过该图片，记录 warning，文本仍正常替换 | 结果中标记为警告 |
| **模板节点丢失** | Sandbox (生成中) | 致命 | 中止生成，发送 error 消息 | 错误结果视图显示明确原因 |
| **Sandbox 未捕获异常** | Sandbox | 致命 | try-catch 包裹整个生成函数 | 错误结果视图 + 错误消息 |
| **通信超时** | UI ↔ Sandbox | 潜在 | 暂时不处理（MVP 阶段网络通信极快） | — |
| **UI 栈溢出/无限循环** | UI | 致命 | 用户需重新打开插件面板 | Figma 插件面板可能崩溃 |

### 11.2 Sandbox 生成函数异常保护

```typescript
// Sandbox 端 code.ts — 生成函数包裹
async function handleStartGeneration(config: GenerationConfig): Promise<void> {
  try {
    // 预验证
    const templateNode = figma.getNodeById(config.templateNodeId);
    if (!templateNode) {
      throw new GenerationError(
        '模板节点不存在',
        'TEMPLATE_NOT_FOUND',
        '请确认模板 Frame 仍在画布中，然后重新选择模板。'
      );
    }

    if (templateNode.type !== 'FRAME') {
      throw new GenerationError(
        '模板不是 Frame 类型',
        'INVALID_TEMPLATE_TYPE',
        '请选择一个 Frame 作为模板。'
      );
    }

    // 字体加载
    await preloadFonts(templateNode);

    // 逐行生成
    const result = await generateFrames(config, templateNode);

    // 发送完成消息
    figma.ui.postMessage({
      type: 'generation-complete',
      payload: { result }
    });

  } catch (error) {
    console.error('[Sandbox] 生成失败:', error);

    if (error instanceof GenerationError) {
      figma.ui.postMessage({
        type: 'generation-error',
        payload: {
          code: error.code,
          message: error.message,
          suggestion: error.suggestion
        }
      });
    } else {
      figma.ui.postMessage({
        type: 'generation-error',
        payload: {
          code: 'UNKNOWN_ERROR',
          message: error instanceof Error ? error.message : '未知错误',
          suggestion: '请重试。如果问题持续出现，请重新打开插件。'
        }
      });
    }
  }
}
```

### 11.3 UI 端错误显示

#### 错误消息优先级

结果视图中同时可能有多条信息（成功数、问题数、警告数、致命错误），展示优先级：

1. **致命错误**（`generation.status === 'error'`）：优先展示，使用红色错误样式
2. **取消**（`generation.status === 'cancelled'`）：展示取消信息
3. **部分成功 + 有问题**：展示黄色警告样式，列出问题
4. **全部成功**：展示绿色成功样式

#### 错误复现与调试

在 UI 中添加一个隐藏的调试面板（通过连续点击 Header 5 次激活），显示：
- 所有收发消息的日志
- 当前 state 的 JSON 表示
- 错误堆栈（如果有）

### 11.4 异常恢复策略

| 场景 | 恢复方式 |
|------|---------|
| 文件解析失败 | 用户可点击"重新上传"或直接拖放新文件覆盖 |
| 生成出现致命错误 | 用户可修改配置后点击"重新生成"（`generation.status = 'idle'`） |
| 生成被取消 | 用户可点击"重新生成"（数据/模板/映射均保留） |
| 模板节点丢失 | 用户需重新选择模板，映射需重新建立 |
| UI 意外崩溃 | 用户关闭并重新打开插件面板（所有状态丢失） |

---

## 12. UI 技术实现方案

### 12.1 技术选型

| 技术项 | 选型 | 理由 |
|-------|------|------|
| **JavaScript** | 原生 ES2020（无框架） | MVP 阶段降低复杂度，避免引入构建工具链 |
| **类型检查** | TypeScript (.ts 文件） | 与项目其他模块保持一致，提供类型安全 |
| **CSS** | 单一 CSS 文件 + CSS 自定义属性 | 简洁，易于维护，与 Figma 插件环境兼容 |
| **状态管理** | 自建中心化状态管理 | 极简实现，约 50 行代码，无需额外库 |
| **文件解析** | SheetJS (xlsx) + Papaparse | 已在 TASK-02 选型确定 |
| **模块组织** | ES Module (import/export) | 编译为单一 bundle（使用 esbuild 或 tsc） |

### 12.2 文件组织

```
src/
├── code.ts                      # Sandbox 入口（TASK-03, TASK-05 逻辑）
├── types/
│   └── index.ts                 # 共享类型定义（TASK-01 产物）
│
├── ui/
│   ├── index.html               # 插件面板 HTML 骨架
│   ├── styles.css               # 全局样式 + CSS 自定义属性
│   ├── main.ts                  # UI 入口：初始化、消息路由、主渲染循环
│   ├── state.ts                 # AppState 定义、初始化、updateState 函数
│   │
│   └── components/
│       ├── data-source.ts       # 📁 数据源区块组件
│       ├── template-status.ts   # 🖼️ 模板选择区块组件
│       ├── layer-list.ts        # 图层列表子组件（模板选择内使用）
│       ├── mapping-editor.ts    # 🔗 字段映射区块组件
│       ├── preview-bar.ts       # 📊 生成预览区块组件
│       ├── generate-button.ts   # 🚀 生成按钮组件
│       ├── progress-view.ts     # 🔄 进度显示视图组件
│       ├── result-view.ts       # ✅/⚠️/❌ 结果展示视图组件
│       └── confirm-dialog.ts    # 💬 模态确认弹窗组件
```

### 12.3 编译输出

```
dist/
├── code.js                      # Sandbox bundle（IIFE，包含 TASK-03/05 逻辑）
└── ui.html                      # UI bundle（HTML + inline CSS + inline JS）
```

- `code.js`：TypeScript 编译为 ES5/ES6，目标环境为 Figma Sandbox
- `ui.html`：HTML + 内联 CSS + 内联 JS 的单一文件，因为 Figma 的 `figma.showUI(__html__)` 需要一个 HTML 文件路径

### 12.4 CSS 设计系统

#### 自定义属性

```css
:root {
  /* ===== 颜色 ===== */
  --color-primary: #4A90D9;
  --color-primary-hover: #3A7BC8;
  --color-primary-light: #E8F0FE;
  
  --color-success: #34A853;
  --color-success-light: #E6F4EA;
  
  --color-warning: #F5A623;
  --color-warning-light: #FEF3E0;
  
  --color-error: #EA4335;
  --color-error-light: #FCE8E6;
  
  --color-info: #4285F4;
  --color-info-light: #E8F0FE;
  
  /* ===== 中性色 ===== */
  --color-bg: #FFFFFF;
  --color-bg-secondary: #F5F5F5;
  --color-bg-tertiary: #EBEBEB;
  --color-border: #DADADA;
  --color-border-light: #E5E5E5;
  --color-text: #333333;
  --color-text-secondary: #666666;
  --color-text-tertiary: #999999;
  --color-text-inverse: #FFFFFF;
  
  /* ===== 排版 ===== */
  --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 
                 'Helvetica Neue', Arial, sans-serif;
  --font-size-heading: 13px;
  --font-size-body: 12px;
  --font-size-small: 11px;
  --font-size-caption: 10px;
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-bold: 600;
  
  /* ===== 间距（4px 基准单位） ===== */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 20px;
  --space-2xl: 24px;
  
  /* ===== 圆角 ===== */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  
  /* ===== 阴影 ===== */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.06);
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.1);
  --shadow-modal: 0 4px 16px rgba(0, 0, 0, 0.15);
  
  /* ===== 动画 ===== */
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;
  
  /* ===== 布局 ===== */
  --panel-max-width: 360px;
  --section-gap: var(--space-lg);
}
```

#### 区块（Section）通用样式

```css
.section {
  margin-bottom: var(--section-gap);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.section__header {
  display: flex;
  align-items: center;
  padding: var(--space-sm) var(--space-md);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border-light);
  font-size: var(--font-size-heading);
  font-weight: var(--font-weight-medium);
}

.section__header-icon {
  margin-right: var(--space-xs);
  font-size: 14px;
}

.section__body {
  padding: var(--space-md);
}

.section--disabled {
  opacity: 0.5;
  pointer-events: none;
}
```

#### 按钮通用样式

```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-sm) var(--space-lg);
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-medium);
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--transition-fast);
  width: 100%;
}

.btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.btn--primary {
  background: var(--color-primary);
  color: var(--color-text-inverse);
}
.btn--primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.btn--secondary {
  background: var(--color-bg-tertiary);
  color: var(--color-text);
}
.btn--secondary:hover:not(:disabled) {
  background: var(--color-border);
}

.btn--danger {
  background: var(--color-error);
  color: var(--color-text-inverse);
}
.btn--danger:hover:not(:disabled) {
  background: #D93025;
}

.btn--small {
  padding: var(--space-xs) var(--space-sm);
  font-size: var(--font-size-small);
  width: auto;
}
```

#### 状态标签 / Badge

```css
.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  font-size: var(--font-size-caption);
  border-radius: 10px;
  font-weight: var(--font-weight-medium);
}

.badge--success {
  background: var(--color-success-light);
  color: var(--color-success);
}
.badge--warning {
  background: var(--color-warning-light);
  color: var(--color-warning);
}
.badge--error {
  background: var(--color-error-light);
  color: var(--color-error);
}
.badge--info {
  background: var(--color-info-light);
  color: var(--color-info);
}
```

#### 进度条样式

```css
.progress-bar {
  width: 100%;
  height: 8px;
  background: var(--color-bg-tertiary);
  border-radius: 4px;
  overflow: hidden;
}

.progress-bar__fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: 4px;
  transition: width 0.3s ease;
  min-width: 0;
}

.progress-bar__fill--warning {
  background: var(--color-warning);
}

.progress-bar__fill--success {
  background: var(--color-success);
}
```

### 12.5 组件开发规范

每个组件文件导出一个或多个渲染函数，遵循以下接口约定：

```typescript
// 组件标准接口示例
interface SectionComponent {
  // 渲染函数：接收容器元素和当前状态，将内容渲染到容器中
  render(container: HTMLElement, state: AppState): void;
  
  // 可选：清理函数（移除事件监听等）
  destroy?(): void;
}
```

所有 DOM 事件处理在组件内部完成，通过回调函数与主状态管理通信：

```typescript
// 组件内事件处理示例（data-source.ts）
function renderDataSourceSection(container: HTMLElement, state: AppState): void {
  // 1. 创建或获取区块 DOM 结构
  let section = container.querySelector('#section-datasource');
  if (!section) {
    section = createSectionElement('datasource', '📁 数据源');
    container.appendChild(section);
  }
  
  // 2. 根据状态渲染内容
  const body = section.querySelector('.section__body');
  body.innerHTML = '';  // 清空旧内容
  
  switch (state.dataSource.status) {
    case 'empty':
      renderDropZone(body, state);
      break;
    case 'loading':
      renderLoadingState(body, state);
      break;
    case 'loaded':
      renderLoadedState(body, state);
      break;
    case 'error':
      renderErrorState(body, state);
      break;
  }
}

function renderDropZone(container: HTMLElement, state: AppState): void {
  const dropZone = document.createElement('div');
  dropZone.className = 'drop-zone';
  dropZone.innerHTML = `...`;  // 拖放区域 HTML
  
  // 事件绑定
  dropZone.addEventListener('click', () => {
    triggerFileInput();
  });
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drop-zone--active');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drop-zone--active');
    const file = e.dataTransfer?.files[0];
    if (file) handleFileUpload(file);
  });
  
  container.appendChild(dropZone);
}
```

---

## 13. 验收标准

### 13.1 端到端验收测试用例

#### TC-01: 完整正向流程（Happy Path）

| 属性 | 内容 |
|------|------|
| **测试 ID** | TC-01 |
| **描述** | 从上传数据到生成结果的完整正向流程 |
| **前置条件** | 画布中存在一个名为「商品卡片模板」的 Frame，内有文本图层「标题」「描述」「价格」和图片图层「商品图」 |
| **步骤** | 1. 打开插件面板 <br> 2. 上传包含 10 行数据的 CSV 文件（字段：标题、描述、价格、商品图） <br> 3. 在画布中选中「商品卡片模板」Frame <br> 4. 在映射区域配置 4 组映射关系 <br> 5. 点击「开始生成」 <br> 6. 等待生成完成 |
| **预期结果** | ① 画布上新增 10 个 Frame（模板的克隆）<br> ② 每个 Frame 中的文本图层被替换为对应行的数据<br> ③ 结果视图显示"全部 10 页生成成功！"<br> ④ 生成耗时在合理范围（视数据量而定） |
| **覆盖需求** | FR-01, FR-02, FR-03, FR-04, FR-05, FR-06, FR-07, FR-08, FR-09, FR-10, FR-11, FR-12, FR-13, FR-14, FR-19, FR-20, FR-21, NFR-03 |

#### TC-02: 零映射生成（不进行内容替换）

| 属性 | 内容 |
|------|------|
| **测试 ID** | TC-02 |
| **描述** | 在不建立任何映射的情况下执行生成 |
| **前置条件** | 同 TC-01，但不上传图片字段 |
| **步骤** | 1. 打开插件 <br> 2. 上传 5 行数据 <br> 3. 选中模板 Frame <br> 4. 不建立任何映射，直接点击「开始生成」 <br> 5. 弹出确认对话框 → 点击「继续生成」 <br> 6. 等待完成 |
| **预期结果** | ① 生成 5 个模板克隆 Frame<br> ② 克隆中无内容被替换（保持模板原始文本）<br> ③ 结果视图显示"已生成 5 页模板副本（未进行内容替换）"<br> ④ 问题行显示为 0（不检查数据缺失） |
| **覆盖需求** | FR-15, FR-21 |

#### TC-03: 零映射确认对话框 - 取消

| 属性 | 内容 |
|------|------|
| **测试 ID** | TC-03 |
| **描述** | 零映射弹窗中选择取消 |
| **前置条件** | 同 TC-02 |
| **步骤** | 1. 上传数据 + 选择模板（无映射）<br> 2. 点击「开始生成」<br> 3. 在确认弹窗中点击「取消」 |
| **预期结果** | ① 弹窗消失<br> ② 生成未执行<br> ③ 状态保持为 idle，所有配置保持不变<br> ④ 可重新点击生成或添加映射 |
| **覆盖需求** | FR-15 |

#### TC-04: 生成过程取消

| 属性 | 内容 |
|------|------|
| **测试 ID** | TC-04 |
| **描述** | 在生成过程中中途取消 |
| **前置条件** | 至少 50 行数据（确保生成耗时足够取消操作） |
| **步骤** | 1. 正常走完数据上传 + 选择模板 + 映射流程 <br> 2. 点击「开始生成」 <br> 3. 在进度到达约 40% 时点击「取消生成」 <br> 4. 等待取消完成 |
| **预期结果** | ① 生成立即停止（不产生更多新 Frame）<br> ② 已生成的 Frame（约 20 个）保留在画布上<br> ③ 结果视图显示"已取消"状态 + 已生成页数<br> ④ 总页数 > 已生成页数 |
| **覆盖需求** | FR-20 |

#### TC-05: 模板切换导致映射清除

| 属性 | 内容 |
|------|------|
| **测试 ID** | TC-05 |
| **描述** | 已建立映射后切换到不同模板 |
| **前置条件** | 画布中存在两个不同的 Frame：「模板A」和「模板B」，各有不同的子图层 |
| **步骤** | 1. 上传数据 <br> 2. 选择「模板A」 <br> 3. 配置 3 组映射 <br> 4. 在画布中切换到选中「模板B」 |
| **预期结果** | ① 映射区域显示警告横幅"模板已更改，之前的映射已被清除"<br> ② mapping.entries 清空<br> ③ 图层选项更新为模板B的图层<br> ④ 预览区块更新<br> ⑤ 警告横幅在 3 秒后自动消失 |
| **覆盖需求** | FR-03, FR-04 |

#### TC-06: 文件替换导致映射清除

| 属性 | 内容 |
|------|------|
| **测试 ID** | TC-06 |
| **描述** | 已建立映射后上传不同的数据文件 |
| **前置条件** | 有两个内容不同的数据文件 |
| **步骤** | 1. 上传「文件A.csv」（字段：姓名、年龄、城市）<br> 2. 选择模板并配置映射 <br> 3. 上传「文件B.csv」（字段：产品名、价格、库存）|
| **预期结果** | ① 映射清除<br> ② 字段列表更新为文件B的字段<br> ③ 可用字段选项更新<br> ④ 数据行数和预览更新 |
| **覆盖需求** | FR-02, FR-04 |

#### TC-07: 无数据行

| 属性 | 内容 |
|------|------|
| **测试 ID** | TC-07 |
| **描述** | 上传只有表头没有数据行的文件 |
| **前置条件** | 准备一个只包含表头行的 CSV 文件 |
| **步骤** | 1. 上传只有表头的 CSV <br> 2. 选择模板 |
| **预期结果** | ① 数据源显示"共 0 行数据"<br> ② 预览区块显示"将生成 0 页"<br> ③ 生成按钮 disabled，文案"未检测到数据行" |
| **覆盖需求** | FR-01 |

#### TC-08: 选择非 Frame 对象作为模板

| 属性 | 内容 |
|------|------|
| **测试 ID** | TC-08 |
| **描述** | 用户选中 Group/Rectangle 等非 Frame 节点 |
| **前置条件** | 画布中存在 Group 和 Rectangle |
| **步骤** | 1. 上传数据 <br> 2. 选中一个 Group |
| **预期结果** | ① 模板区块显示"当前选择为「Group」，请选择一个 Frame"<br> ② template.status = 'invalid'<br> ③ 映射区块灰化（不可操作）<br> ④ 生成按钮 disabled |
| **覆盖需求** | FR-03 |

#### TC-09: 生成期间关闭插件面板

| 属性 | 内容 |
|------|------|
| **测试 ID** | TC-09 |
| **描述** | 生成过程中关闭插件面板后的行为 |
| **前置条件** | 至少 50 行数据 |
| **步骤** | 1. 正常走完配置流程 <br> 2. 点击「开始生成」<br> 3. 在进度条运行中（约 30%），点击面板 X 关闭插件<br> 4. 等待约 10 秒后查看画布 |
| **预期结果** | ① 面板关闭后画布上可能继续新增 Frame（Sandbox 仍在运行）<br> ② 最终画布上出现 50 个 Frame（Sandbox 跑完了全部循环）<br> ③ 这是可接受的预期行为<br> ④ 无 Figma 崩溃或报错 |
| **覆盖需求** | NFR-05 |

#### TC-10: 上传损坏的文件

| 属性 | 内容 |
|------|------|
| **测试 ID** | TC-10 |
| **描述** | 上传损坏的或无效的 Excel 文件 |
| **前置条件** | 准备一个非标准格式的 .xlsx 文件（或用 .txt 改名） |
| **步骤** | 1. 拖放损坏文件到上传区域 |
| **预期结果** | ① dataSource.status = 'error' <br> ② 显示具体错误信息（如"文件格式不正确，无法解析"）<br> ③ 显示"重新上传"按钮或允许用户拖放新文件覆盖<br> ④ 其他区块状态不变 |
| **覆盖需求** | FR-02, NFR-06 |

#### TC-11: 完整带图片工作流

| 属性 | 内容 |
|------|------|
| **测试 ID** | TC-11 |
| **描述** | 上传包含嵌入图片的 Excel，生成带图片的模板 |
| **前置条件** | 准备包含嵌入图片的 .xlsx 文件，模板有对应图片图层 |
| **步骤** | 1. 上传带图片的 Excel <br> 2. 选择模板（含图片图层）<br> 3. 配置文本 + 图片映射 <br> 4. 生成 |
| **预期结果** | ① 文本正确替换<br> ② 图片填充到对应图层<br> ③ 如有行缺少图片，结果中标记为警告 |
| **覆盖需求** | FR-09, FR-12 |

#### TC-12: 首行表头开关切换

| 属性 | 内容 |
|------|------|
| **测试 ID** | TC-12 |
| **描述** | 切换"首行为表头"复选框的效果 |
| **前置条件** | 已上传数据文件 |
| **步骤** | 1. 上传数据（默认首行为表头，勾选状态）<br> 2. 观察字段列表：第一行显示为表头<br> 3. 取消勾选"首行为表头" |
| **预期结果** | ① 数据重新解析<br> ② 之前的第一行变为数据行（总行数 +1）<br> ③ 字段使用自动生成的名称（列1, 列2...）<br> ④ 已有映射被清除 |
| **覆盖需求** | FR-01 |

#### TC-13: 结果视图按钮功能

| 属性 | 内容 |
|------|------|
| **测试 ID** | TC-13 |
| **描述** | 结果视图中的操作按钮功能 |
| **前置条件** | 已完成一次生成 |
| **步骤** | 1. 点击"重新生成" <br> 2. 修改某条映射 <br> 3. 再次点击"开始生成" <br> 4. 完成后点击"查看画布" |
| **预期结果** | ① "重新生成"后返回到配置视图<br> ② 可以修改配置并再次生成<br> ③ "查看画布"后 Figma 画布视角聚焦到生成的 Frame |
| **覆盖需求** | FR-21 |

### 13.2 验收测试通过标准

| 验收项 | 通过条件 |
|-------|---------|
| TC-01 ~ TC-13 | 全部通过 |
| 无阻塞性 Bug | 不存在导致无法完成核心流程的缺陷 |
| UI 一致性 | 面板在 Figma 插件环境中显示正常，无布局错乱、文字遮挡、溢出等问题 |
| 性能 | 100 行数据生成在 60 秒内完成（不设硬性上限，但明显卡死或超时不可接受） |
| 无内存泄漏 | 连续执行 5 轮生成（每轮 50 行）不出现明显内存增长或插件崩溃 |

---

## 14. 测试策略

### 14.1 测试现状

| 测试类型 | 可行性 | 说明 |
|---------|-------|------|
| **单元测试** | MVP 不适用 | 暂无测试框架配置。后续版本可引入 Vitest/Jest 进行类型和纯逻辑的单元测试 |
| **集成测试** | 不适用 | Figma 插件环境无自动化集成测试方案 |
| **端到端测试** | 不适用 | Figma 无官方 E2E 测试框架，插件运行需要完整 Figma 环境 |
| **手动测试** | ✅ 主要方式 | 通过详细的手动测试检查清单，在 Figma 中逐项验证 |

### 14.2 手动测试检查清单

#### 测试环境准备

- Figma Desktop App (macOS / Windows)
- 测试用模板 Frame（包含文本和图片图层）
- 测试用数据文件：
  - `test-10-rows.csv` — 10 行完整数据
  - `test-50-rows.csv` — 50 行数据（用于测试取消和性能）
  - `test-empty.csv` — 仅表头无数据
  - `test-with-images.xlsx` — 包含嵌入图片
  - `test-corrupted.xlsx` — 损坏的文件

#### 测试清单

| ID | 测试项 | 步骤 | 预期结果 | 覆盖 | 状态 |
|----|-------|------|---------|------|------|
| M-01 | 插件启动 | 在 Figma 中通过 Plugins 菜单运行插件 | 面板正确显示，数据源和模板区块可见 | 初始化 | ☐ |
| M-02 | 上传 CSV 文件 | 拖放 CSV 到上传区域 | 解析成功，显示文件名、行数、字段列表 | FR-01, FR-02 | ☐ |
| M-03 | 上传 Excel 文件 | 点击上传区域选择 .xlsx | 同上 | FR-02 | ☐ |
| M-04 | 拖放上传 | 从文件管理器拖拽文件 | 同上 | FR-02 | ☐ |
| M-05 | 上传区域视觉反馈 | 拖拽文件悬停 | 上传区域高亮 | — | ☐ |
| M-06 | 选择有效 Frame | 在画布中选中包含子图层的 Frame | 显示模板信息（名称、图层数） | FR-03 | ☐ |
| M-07 | 选择无图层 Frame | 选中空的 Frame | 提示"没有可填充图层" | FR-03 | ☐ |
| M-08 | 选择非 Frame | 选中 Group/Rectangle | 提示"请选择一个 Frame" | FR-03 | ☐ |
| M-09 | 清除选择 | 点击画布空白处 | 提示"请在画布中选择 Frame" | FR-03 | ☐ |
| M-10 | 添加映射 | 点击"+添加映射"，选择字段和图层 | 映射条目显示在列表中 | FR-04 | ☐ |
| M-11 | 删除映射 | 点击映射条目旁的 ✕ | 映射条目消失 | FR-04 | ☐ |
| M-12 | 修改映射 | 更改已建立映射的字段或图层选择 | 映射更新 | FR-04 | ☐ |
| M-13 | 模板切换（有映射） | 切换选择到不同 Frame | 显示警告，映射清除 | FR-03, FR-04 | ☐ |
| M-14 | 模板切换（无映射） | 切换选择（当前无映射） | 无警告，仅更新图层列表 | FR-03 | ☐ |
| M-15 | 文件切换（有映射） | 上传不同文件 | 映射清除，字段更新 | FR-02, FR-04 | ☐ |
| M-16 | 首行表头开关 | 取消勾选"首行为表头" | 数据重新解析，映射清除 | FR-01 | ☐ |
| M-17 | 生成预览 | 数据+模板就绪 | 显示行数、映射数、潜在问题 | FR-19 | ☐ |
| M-18 | 生成按钮 - 禁用状态 | 数据未上传 | 按钮 disabled | — | ☐ |
| M-19 | 生成按钮 - 启用状态 | 数据+模板均就绪 | 按钮 enabled，显示"开始生成 (N页)" | — | ☐ |
| M-20 | 零映射确认弹窗 | 无映射点生成 | 弹窗出现，显示说明文字 | FR-15 | ☐ |
| M-21 | 零映射 - 继续 | 弹窗中点"继续生成" | 进入生成流程 | FR-15 | ☐ |
| M-22 | 零映射 - 取消 | 弹窗中点"取消" | 返回配置界面 | FR-15 | ☐ |
| M-23 | 进度条更新 | 生成进行中 | 进度条实时更新，数字正确 | FR-20 | ☐ |
| M-24 | 进度 - 问题计数 | 生成中（有数据缺失） | 问题计数递增 | FR-20 | ☐ |
| M-25 | 取消生成 | 进度中点击"取消" | 生成停止，显示取消结果 | FR-20 | ☐ |
| M-26 | 取消按钮冷却 | 刚进入进度视图的 300ms 内 | 取消按钮不可点击 | FR-20 | ☐ |
| M-27 | 生成完成 - 全成功 | 所有行数据完整 | 绿色结果视图 | FR-21 | ☐ |
| M-28 | 生成完成 - 有问题 | 部分行数据缺失 | 黄色结果视图，列出问题 | FR-21 | ☐ |
| M-29 | 生成完成 - 零映射 | 零映射生成完成 | 问题行=0，显示特殊说明 | FR-21 | ☐ |
| M-30 | 结果 - 重新生成 | 点击"重新生成" | 回到配置视图，配置保留 | FR-21 | ☐ |
| M-31 | 结果 - 查看画布 | 点击"查看画布" | Figma 视角聚焦到生成结果 | — | ☐ |
| M-32 | 关闭面板（不在生成中） | 点击 X 关闭 | 面板关闭，无异常 | NFR-05 | ☐ |
| M-33 | 关闭面板（生成中） | 生成过程中关闭 | Frame 继续在画布创建 | NFR-05 | ☐ |
| M-34 | 上传损坏文件 | 上传非标准 xlsx | 显示错误信息，可重试 | NFR-06 | ☐ |
| M-35 | 生成错误处理 | 模拟生成中报错 | 错误视图显示具体原因 | NFR-06 | ☐ |
| M-36 | 面板滚动 | 配置项较多时 | 面板可正常垂直滚动 | — | ☐ |
| M-37 | 样式一致性 | 检查所有组件 | 颜色、间距、字体与设计系统一致 | NFR-07 | ☐ |
| M-38 | 图片字段处理 | 上传带图片数据的 Excel | 图片正确填充到对应图层 | FR-09, FR-12 | ☐ |
| M-39 | 图片提取失败 | 某行图片数据损坏 | 生成继续，结果中标记警告 | FR-12 | ☐ |
| M-40 | 重复生成 | 连续进行 3 次生成操作 | 均正常完成，无状态残留 | — | ☐ |
| M-41 | 超大数据量 | 上传 500 行数据并生成 | 生成可完成，UI 有进度反馈 | NFR-03 | ☐ |
| M-42 | 极端宽面板 | 调整 Figma 窗口宽度 | 面板布局不自适应（宽度固定） | — | ☐ |

### 14.3 回归测试

每次修改代码后，至少执行以下最小回归集：

| 优先级 | 测试 ID | 说明 |
|-------|--------|------|
| P0 | M-01, M-02, M-06, M-18, M-19, M-27 | 核心通路：启动→上传→选择→生成→完成 |
| P1 | M-20, M-21, M-25, M-28 | 重要边界：零映射、取消、数据缺失 |
| P2 | M-08, M-10, M-13, M-34 | 异常处理和交互 |

---

## 15. 项目完成检查清单

### 15.1 功能需求追踪 (FR-01 ~ FR-26)

| 需求 ID | 需求描述 | 状态 | 负责任务 | 备注 |
|--------|---------|------|---------|------|
| FR-01 | 支持上传 .xlsx, .xls, .csv 格式的数据文件，并解析为表格 | ✅ 已完成 | TASK-02 | |
| FR-02 | 上传新文件时，自动清除已有的映射关系和生成结果 | ✅ 已完成 | TASK-06 | 联动逻辑 |
| FR-03 | 用户在画布中选中 Frame 作为模板；选中非 Frame 时给出提示 | ✅ 已完成 | TASK-03 | |
| FR-04 | 切换模板时清除已有映射，并提示用户 | ✅ 已完成 | TASK-06 | 联动逻辑 |
| FR-05 | 递归扫描模板 Frame 内所有文本图层 | ✅ 已完成 | TASK-03 | |
| FR-06 | 递归扫描模板 Frame 内所有图片填充图层 | ✅ 已完成 | TASK-03 | |
| FR-07 | 将数据字段映射到模板文本图层 | ✅ 已完成 | TASK-04 | |
| FR-08 | 将数据字段映射到模板图片图层 | ✅ 已完成 | TASK-04 | |
| FR-09 | 支持从 Excel 中提取嵌入图片，用于图片填充 | ✅ 已完成 | TASK-02, TASK-05 | |
| FR-10 | 对每个映射执行字段类型匹配检查（文本→文本层，图片→图片层） | ✅ 已完成 | TASK-04 | |
| FR-11 | 通过 clone 模板 Frame 来为每行数据生成独立页面 | ✅ 已完成 | TASK-05 | |
| FR-12 | 每行数据生成时替换所有映射的文本和图片内容 | ✅ 已完成 | TASK-05 | |
| FR-13 | 支持用户配置布局方式（网格/垂直列表） | 🟡 简化 | TASK-05 | MVP 简化为默认网格 |
| FR-14 | 生成前预加载所有需要的字体，避免字体回退 | ✅ 已完成 | TASK-05 | |
| FR-15 | 当未建立任何映射时允许生成（仅克隆模板，不替换内容），需确认 | ✅ 已完成 | TASK-06 | 确认对话框 |
| FR-16 | 数据行中存在空字段时，跳过该映射但继续生成 | ✅ 已完成 | TASK-05 | |
| FR-17 | 目标图层不存在时，标记警告并继续生成 | ✅ 已完成 | TASK-05 | |
| FR-18 | 生成多个 Frame 时自动排列位置 | ✅ 已完成 | TASK-05 | |
| **FR-19** | **生成前展示将生成的总页数** | **🔲 本任务** | **TASK-06** | 预览区块 |
| **FR-20** | **生成过程中展示实时进度，支持用户取消；关闭面板时停止** | **🔲 本任务** | **TASK-06** | 进度视图 |
| **FR-21** | **生成完成后展示结果摘要（成功 X 页，问题行 Y 行）；无映射时结果无问题行** | **🔲 本任务** | **TASK-06** | 结果视图 |
| FR-22 | 生成完成后将生成的 Frame 排列到模板下方或用页面/分组整理 | ✅ 已完成 | TASK-05 | |
| FR-23 | 支持生成完成后聚焦到生成的 Frame | 🔲 待完成 | TASK-06 | "查看画布"按钮 |
| FR-24 | 提供清除/重置所有配置的功能 | 🟡 简化 | TASK-06 | MVP 不单独提供重置按钮，通过文件/模板切换自然触发 |
| FR-25 | 用户取消生成时，已生成的 Frame 保留在画布上 | ✅ 已完成 | TASK-06 | 取消逻辑 |
| FR-26 | 插件面板宽度自适应 Figma 面板（~350px） | ✅ 已完成 | TASK-06 | CSS 布局 |

### 15.2 非功能需求追踪 (NFR-01 ~ NFR-07)

| 需求 ID | 需求描述 | 状态 | 负责任务 | 验证方式 |
|--------|---------|------|---------|---------|
| NFR-01 | 代码可维护性：模块化拆分，职责清晰 | ✅ 已完成 | 所有任务 | 代码审查 |
| NFR-02 | 错误处理：全局 try-catch，友好错误信息 | 🔲 本任务 | TASK-06 | M-34, M-35 |
| NFR-03 | 性能：100 行数据正常生成不超时 | 🔲 本任务 | TASK-05, TASK-06 | M-41 |
| NFR-04 | 插件面板 UI 操作简单直观 | 🔲 本任务 | TASK-06 | 全部 M 测试 |
| NFR-05 | 用户关闭面板时无异常报错 | 🔲 本任务 | TASK-06 | M-32, M-33 |
| NFR-06 | 异常数据处理：损坏文件、空数据等 | ✅ 已完成 | TASK-02, TASK-06 | M-34, M-07 |
| NFR-07 | UI 与 Figma 原生面板风格一致 | 🔲 本任务 | TASK-06 | M-37 |

### 15.3 整体项目进度

| 任务 | 状态 | 完成度 | 备注 |
|------|------|-------|------|
| TASK-01: 架构/类型/消息协议 | ✅ 已完成 | 100% | 基础类型和协议定义 |
| TASK-02: 文件上传与数据解析 | ✅ 已完成 | 100% | UI 端文件处理 |
| TASK-03: 模板选择与图层发现 | ✅ 已完成 | 100% | Sandbox 端图层扫描 |
| TASK-04: 字段映射系统 | ✅ 已完成 | 100% | UI 端映射编辑 |
| TASK-05: 批量生成引擎 | ✅ 已完成 | 100% | Sandbox 端生成逻辑 |
| **TASK-06: 集成、预览与反馈** | **🔲 进行中** | **0%** | **本任务** |

---

## 16. 产出文件清单

### 16.1 本任务创建的文件

| 文件路径 | 描述 | 类型 |
|---------|------|------|
| `src/ui/index.html` | 插件面板 HTML 骨架，包含所有区块的 DOM 结构和占位元素 | 新建 |
| `src/ui/styles.css` | 全局样式表，包含 CSS 自定义属性设计系统、各组件样式、响应式布局 | 新建 |
| `src/ui/state.ts` | 全局状态管理：AppState 类型定义、初始状态工厂函数、`updateState()`、`computeDerivedState()` | 新建 |
| `src/ui/main.ts` | UI 入口：初始化、消息处理器注册、主渲染循环 `render()`、Sandbox 通信桥接 | 新建 |
| `src/ui/components/data-source.ts` | 📁 数据源区块：拖放上传区域、文件解析调用、加载/已加载/错误状态渲染 | 新建 |
| `src/ui/components/template-status.ts` | 🖼️ 模板选择区块：各状态渲染（无选择/无效/有效/无图层）、图层概况 | 新建 |
| `src/ui/components/layer-list.ts` | 图层列表子组件：展示模板内可填充图层的详细信息（名称、类型、ID） | 新建 |
| `src/ui/components/mapping-editor.ts` | 🔗 字段映射区块：映射条目渲染、添加/删除/修改映射、类型匹配指示 | 新建 |
| `src/ui/components/preview-bar.ts` | 📊 生成预览区块：行数、映射数、潜在问题统计 | 新建 |
| `src/ui/components/generate-button.ts` | 🚀 生成按钮：状态判定逻辑、点击处理器、零映射检查 | 新建 |
| `src/ui/components/progress-view.ts` | 🔄 进度显示视图：进度条、实时计数、取消按钮、防抖逻辑 | 新建 |
| `src/ui/components/result-view.ts` | ✅ 结果展示视图：全成功/有问题/警告/取消/错误/零映射 六种状态渲染 | 新建 |
| `src/ui/components/confirm-dialog.ts` | 💬 模态确认弹窗：零映射确认、通用确认对话框组件 | 新建 |

### 16.2 本任务修改的文件

| 文件路径 | 修改内容 | 原因 |
|---------|---------|------|
| `src/code.ts` | ① 添加 `figma.on('selectionchange')` 事件监听<br> ② 完善消息处理器（`ui-ready`, `request-template-layers`, `cancel-generation`, `focus-canvas`）<br> ③ 生成函数 try-catch 包裹<br> ④ 添加取消标志位 | Sandbox 需要完整的消息处理和事件监听来支持集成工作流 |
| `src/types/index.ts` | ① 添加 `GenerationProgress` 类型<br> ② 添加 `GenerationResult` 类型<br> ③ 添加 `GenerationIssue` / `GenerationWarning` 类型<br> ④ 添加 `PluginMessage` 联合类型中新增的消息类型<br> ⑤ 添加 `AppState` 相关类型 | 支持进度和结果的类型安全 |

### 16.3 项目构建配置

| 文件路径 | 描述 |
|---------|------|
| `tsconfig.json` | TypeScript 编译配置（已存在，可能需要调整以包含 ui/ 目录） |
| `package.json` | 项目依赖和脚本（已存在，可能需要添加构建脚本将 ui 模块打包为单一 html） |
| `esbuild.config.js` 或 `rollup.config.js` | 构建工具配置：将 TypeScript UI 模块编译为 JavaScript 并内联到 HTML（按需创建） |

### 16.4 最终项目结构总览

```
cp-workflow/
├── package.json
├── tsconfig.json
├── manifest.json                # Figma 插件清单
│
├── docs/
│   └── specs/
│       ├── task-01-architecture/
│       ├── task-02-file-upload/
│       ├── task-03-template-selection/
│       ├── task-04-field-mapping/
│       ├── task-05-generation/
│       └── task-06-integration/
│           └── README.md        # ← 本文档
│
├── src/
│   ├── code.ts                  # Sandbox 入口
│   ├── types/
│   │   └── index.ts             # 共享类型 + 消息协议
│   │
│   └── ui/
│       ├── index.html           # 面板骨架
│       ├── styles.css           # 全局样式
│       ├── main.ts              # UI 入口
│       ├── state.ts             # 状态管理
│       └── components/
│           ├── data-source.ts
│           ├── template-status.ts
│           ├── layer-list.ts
│           ├── mapping-editor.ts
│           ├── preview-bar.ts
│           ├── generate-button.ts
│           ├── progress-view.ts
│           ├── result-view.ts
│           └── confirm-dialog.ts
│
├── dist/
│   ├── code.js                  # 编译后的 Sandbox bundle
│   └── ui.html                  # 编译后的 UI bundle
│
└── test/
    └── test-data/               # 测试用数据文件
        ├── test-10-rows.csv
        ├── test-50-rows.csv
        ├── test-empty.csv
        ├── test-with-images.xlsx
        └── test-corrupted.xlsx
```

---

*文档版本: v1.0 | 最后更新: 2026-05-14 | 作者: TASK-06 规范编写*
