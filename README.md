# cp-workflow

从 Excel / CSV 电子表格数据批量生成 Figma 模板页面。选择模板 Frame，上传数据文件，映射字段到图层，一键生成。

## 功能特性

- **电子表格解析** — 支持 `.xlsx` 和 `.csv` 格式，自动识别编码（UTF-8 / GBK / Big5），提取文字与嵌入图片
- **模板图层扫描** — 自动检测选中 Frame 中可填充的文本层与图片层
- **字段映射** — 将电子表格列与模板图层建立对应关系，支持增删改
- **批量生成** — 按数据行数克隆模板并替换内容，支持取消操作
- **布局选项** — 生成的页面可选择网格 / 水平 / 垂直方向排列
- **进度反馈** — 生成过程实时显示进度，完成时汇总成功/问题数量

## 安装

1. 在 Figma 中打开菜单 **Plugins → Development → Import plugin from manifest**
2. 选择本项目根目录下的 `manifest.json`
3. 插件出现在 **Plugins → Development → cp-workflow** 中

也可将打包后的 `cp-workflow.zip` 通过 Figma 社区或拖拽方式安装。

## 快速上手

1. 在 Figma 中设计一个模板 **Frame**，包含需要替换的文本图层和图片图层
2. 选中该 Frame，打开 cp-workflow 插件
3. 点击上传区域或拖拽上传 `.xlsx` / `.csv` 文件
4. 在映射面板中将数据列拖拽对应到模板图层
5. 选择布局方向和命名依据列（可选）
6. 点击 **生成**，插件将按数据行批量创建页面

## 本地开发

```bash
# 安装依赖
npm install

# 开发模式（构建 + 监听文件变更）
npm run dev

# 类型检查
npm run typecheck

# 代码检查
npm run lint

# 构建（产出 code.js + ui.html）
npm run build

# 打包为 cp-workflow.zip（用于发布或分享）
npm run package
```

### 命令速查

| 命令 | 说明 |
|------|------|
| `npm run dev` | 构建并启动双端监听 |
| `npm run build` | 构建沙箱端 + UI 端 |
| `npm run build:sandbox` | 仅构建沙箱端（`code.js`） |
| `npm run build:ui` | 仅构建 UI 端（`ui.html`） |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run lint` | ESLint 代码检查 |
| `npm run lint:fix` | 自动修复 ESLint 问题 |
| `npm run clean` | 删除构建产物 |
| `npm run package` | 构建并打包为 `.zip` |

## 项目架构

```
cp-workflow/
├── manifest.json          # Figma 插件清单
├── scripts/               # 构建脚本（esbuild + 打包）
│   ├── build-sandbox.mjs  # 沙箱端打包 → code.js
│   ├── build-ui.mjs       # UI 端打包 → ui.html
│   └── package.mjs        # 打包为 .zip
├── src/
│   ├── shared/            # 共享类型、消息协议、常量
│   │   ├── types.ts       # 所有 TypeScript 类型定义
│   │   ├── messages.ts    # postMessage 协议（11 种消息）
│   │   └── constants.ts   # 共享常量
│   ├── sandbox/           # Figma 沙箱端（无 DOM）
│   │   ├── main.ts        # 入口：showUI、消息分发
│   │   ├── message-handler.ts
│   │   ├── layer-scanner.ts     # 扫描模板图层
│   │   ├── frame-cloner.ts      # 深克隆 Frame
│   │   ├── content-filler.ts    # 填充文本/图片
│   │   ├── layout-engine.ts     # 排列生成页面
│   │   └── base64.ts            # base64 解码（沙箱无 atob）
│   ├── ui/                # UI 端（浏览器 iframe）
│   │   ├── app.ts         # 主应用：状态管理、事件、编排
│   │   ├── message-handler.ts
│   │   ├── styles.css     # 全部样式
│   │   ├── field-list.ts  # 字段列表渲染
│   │   ├── layer-list.ts  # 图层列表渲染
│   │   ├── mapping-view.ts
│   │   ├── progress-bar.ts
│   │   ├── result-view.ts
│   │   ├── mapping/       # 映射面板组件
│   │   └── parsers/       # 文件解析器（Excel/CSV/图片）
│   └── ui/index.html      # HTML 模板（构建时内联 CSS/JS）
└── docs/                  # 需求与设计文档
```

插件运行在 Figma 提供的两个上下文中，通过 `postMessage` 通信：

```
┌──────────────────────────────────────┐
│            Figma 插件                 │
│  ┌──────────────┐  postMessage  ┌──┐ │
│  │   Sandbox    │◄─────────────►│UI│ │
│  │  (code.js)   │              │  │ │
│  │  Figma API   │              │  │ │
│  │  无 DOM      │              │有│ │
│  └──────────────┘              │DO│ │
│                                │M │ │
└──────────────────────────────────────┘
```

## 技术栈

| 层 | 技术 |
|----|------|
| 语言 | TypeScript |
| 打包 | esbuild |
| UI | 原生 DOM 操作（无框架） |
| Excel | SheetJS (`xlsx`) + JSZip |
| CSV | PapaParse + 编码检测 |
| 代码检查 | ESLint + typescript-eslint |
| 通信 | postMessage 协议 |

## 开源协议

[MIT](LICENSE)
