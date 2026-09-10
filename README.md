# 组子细工绘图助手 (Kumiko Design)

面向组子细工爱好者的 2D 精确制图与算料工具。基于《需求&技术选型文档-修订版V2》实施。

## 文档

- [📖 使用说明](docs/使用说明.md) —— 本地运行后如何操作（含完整流程与快捷键速查）
- [📐 需求与技术选型（V2）](docs/需求&技术选型文档-修订版V2.md)
- [📝 0910 需求（工作区 + PWA）](docs/0910需求.md)
- [🧪 自测报告](docs/自测报告.md)

## 技术栈

- Vite 8 + Vue 3.5（`<script setup>`）+ Pinia 4（纯 JS，无 TypeScript）
- 渲染：**原生 SVG**（网格层 / 图案层 / 交互层，viewBox 承载 mm→px 映射）
- UI：Naive UI（全量引入）
- 几何/图案/算料：零依赖 `src/core/` 纯函数库，Vitest 全量单测
- 撤销/重做：Pinia 快照栈（`stores/history.js`）
- **持久化**：应用内工作区（多作品），存储走 IndexedDB（`utils/workspace/*`），不可用时降级 localStorage
- **PWA**：`vite-plugin-pwa` + Workbox 全量预缓存 → 可安装到 Android 主屏、**完全离线可用**

## 快速开始

```bash
pnpm install
pnpm dev        # http://127.0.0.1:5173（开发期不注册 Service Worker）
pnpm test       # Vitest（core + AI 解析 + 组件渲染 + 工作区 + 状态冒烟）
pnpm build      # 生产构建 → dist/（含 manifest.webmanifest + sw.js）
pnpm preview    # 预览构建产物（验证 PWA / 离线请用这里）
pnpm pwa:assets # 改图标后重新生成 PWA 图标集（源自 public/logo.svg）
```

### 部署（GitHub Pages）

推送 `main` 即由 `.github/workflows/deploy.yml` 自动「测试 → 构建 → 发布」。首次需在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**（免费版需 public 仓库）。

子路径部署必须传 `BASE_PATH`（同时作用于 Vite base 与 PWA `start_url`/`scope`）：

```bash
BASE_PATH=/<仓库名>/ pnpm build
```

## 数据流

```
线族参数 patterns[]（纯数据，project store）
   → core/patterns/derive.segmentsFromPatterns()  求交切分
   → 派生线段 segments[]（只读，响应式 getter 缓存，不入 store）
   → PatternLayer 渲染 <line> / 算料 aggregate → planStock / 导出 SVG / 工作区缩略图
```

任何编辑都落在 patterns 参数上（角度/间距/条数/木条宽/范围），派生段自动重算。

```
工作区（workspace store）
   project 纯数据 → pickWorkData() → IndexedDB `kumiko-workspace`（works + meta）
   编辑防抖 400ms 自动写回当前作品；⌘S 立即写回；切换作品前先写回
```

数据流向单向：`workspace → project`（载入用 `replaceAll`，并清空撤销栈与选中，避免跨作品撤销串数据）。

## 核心目录

```
src/
├── core/            # 纯逻辑（geometry / patterns / presets / cutlist），可单测可进 Worker
├── stores/          # project（画布数据）/ workspace（工作区）/ history（撤销栈）/ ui（视图状态）
├── composables/     # useViewport / useSelection / usePatternTool
├── components/
│   ├── canvas/      # KumikoCanvas + GridLayer + PatternLayer + InteractionLayer
│   ├── panels/      # Toolbar / PatternPropertyPanel / CutListPanel
│   └── dialogs/     # WorkspaceModal / PwaPrompts / PresetsModal / AiModal
├── ai/              # parseIntent（Phase 4：NL→参数，几何本地生成）
├── pwa.js           # PWA 运行时（SW 注册 / 安装引导 / 更新提示）
└── utils/
    ├── workspace/   # db.js（IndexedDB 引擎 + 兜底）/ repo.js（作品 CRUD/导入导出/备份/缩略图）
    └── ...          # exportSvg / projectFile / persist（旧存档迁移）/ zip / id
```

## 功能对照

- 添加纹样：工具栏「预设纹样」（麻叶/方格/斜格，参数化）或「画线族」工具拖拽
- 编辑：点选/框选线段 → 右侧面板改 角度/间距/条数/木条宽/bounds，画布即时重排
- 撤销/重做：Ctrl+Z / Ctrl+Y（或工具栏按钮），Delete 删除选中
- 尺寸：悬停显示该段长度（mm，0.1 精度），「标注」开关显示全部
- **工作区**：工具栏「🗂 工作区」→ 多作品列表（缩略图/时间/大小），新建、打开、重命名、复制、删除（回收站）、搜索、容量展示
- **暂存/恢复**：编辑后自动防抖写回当前作品；`Ctrl/⌘+S` 立即暂存；旧版单项目自动迁入
- **文件**：「导入文件」（可多选）作为新作品导入；「导出文件」导出单个作品；「备份全部」导出 zip（manifest + 每作品一个 json）
- **PWA**：可安装到主屏、全屏运行、**完全离线可用**、更新提示；申请持久化存储降低被清理风险
- 算料：工具栏「算料」→ 按木条宽分组 1D 下料 → cut list + 利用率
- 图案部件：工具栏「图案部件」→ 同型整根本条分组（尺寸 × 插口间距缩写 × 插口数）
- 导出：SVG（mm 坐标，可用于矢量/激光切割）
- AI（接口就绪）：「AI 生成」→ 本地 NL→参数解析（接 LLM 时替换 parseIntent 实现）

## 说明与取舍

- 打包体积大：Naive UI 全量引入所致；PWA 要求「完全离线」故**全量预缓存**（首屏 ~1.5MB / gzip ~426KB），后续可按需引入优化。
- 工作区数据存 IndexedDB（仅 project 纯数据，不含派生段/UI 态）；IndexedDB 不可用时降级 localStorage 并在 UI 提示。
- **Android Chrome 不支持 File System Access API**，故不做「直接读写平板目录」，改用「应用内工作区 + 导入导出」。若将来必须真读写目录，需上原生壳（Capacitor / Tauri Mobile）。
- 卸载 PWA / 清除站点数据会删除工作区内容 → 依赖「备份全部」与持久化存储申请兜底。
- 段级宽度覆盖、斜接/燕尾端工艺元数据为后续扩展点（见修订版 V2 §4）。
- Tauri 桌面打包为 Phase 5（见修订版 V2 §7），未包含在仓库内。
