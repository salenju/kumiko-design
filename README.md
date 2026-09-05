# 组子细工绘图助手 (Kumiko Design)

面向组子细工爱好者的 2D 精确制图与算料工具。基于《需求&技术选型文档-修订版V2》实施。

## 文档

- [📖 使用说明](docs/使用说明.md) —— 本地运行后如何操作（含完整流程与快捷键速查）
- [📐 需求与技术选型（V2）](docs/需求&技术选型文档-修订版V2.md)
- [🧪 自测报告](docs/自测报告.md)

## 技术栈

- Vite 8 + Vue 3.5（`<script setup>`）+ Pinia 4（纯 JS，无 TypeScript）
- 渲染：**原生 SVG**（网格层 / 图案层 / 交互层，viewBox 承载 mm→px 映射）
- UI：Naive UI（全量引入）
- 几何/图案/算料：零依赖 `src/core/` 纯函数库，Vitest 全量单测
- 撤销/重做：Pinia 快照栈（`stores/history.js`），持久化仅存纯数据（localStorage）

## 快速开始

```bash
pnpm install
pnpm dev        # http://127.0.0.1:5173
pnpm test       # Vitest（core + AI 解析 + 组件渲染 + 状态冒烟）
pnpm build      # 生产构建 → dist/
pnpm preview    # 预览构建产物
```

## 数据流

```
线族参数 patterns[]（纯数据，store）
   → core/patterns/derive.deriveSegments()  求交切分
   → 派生线段 segments[]（只读，响应式 getter 缓存，不入 store）
   → PatternLayer 渲染 <line> / 算料 aggregate → planStock / 导出 SVG
```

任何编辑都落在 patterns 参数上（角度/间距/条数/木条宽/范围），派生段自动重算。

## 核心目录

```
src/
├── core/            # 纯逻辑（geometry / patterns / presets / cutlist），可单测可进 Worker
├── stores/          # project（持久化）/ history（撤销栈）/ ui（视图状态）
├── composables/     # useViewport / useSelection / usePatternTool
├── components/
│   ├── canvas/      # KumikoCanvas + GridLayer + PatternLayer + InteractionLayer
│   ├── panels/      # Toolbar / PatternPropertyPanel / CutListPanel
│   └── dialogs/     # PresetsModal / AiModal
├── ai/              # parseIntent（Phase 4：NL→参数，几何本地生成）
└── utils/           # exportSvg / persist / id
```

## 功能对照

- 添加纹样：工具栏「预设纹样」（麻叶/方格/斜格，参数化）或「画线族」工具拖拽
- 编辑：点选/框选线段 → 右侧面板改 角度/间距/条数/木条宽/bounds，画布即时重排
- 撤销/重做：Ctrl+Z / Ctrl+Y（或工具栏按钮），Delete 删除选中
- 尺寸：悬停显示该段长度（mm，0.1 精度），「标注」开关显示全部
- 算料：工具栏「算料」→ 按木条宽分组 1D 下料 → cut list + 利用率
- 导出：SVG（mm 坐标，可用于矢量/激光切割）
- AI（接口就绪）：「AI 生成」→ 本地 NL→参数解析（接 LLM 时替换 parseIntent 实现）

## 说明与取舍

- 打包体积大：Naive UI 全量引入所致，可按需引入优化（非功能阻塞）。
- localStorage 持久化仅 project 纯数据；预留 IndexedDB 切换点（utils/persist.js）。
- 段级宽度覆盖、斜接/燕尾端工艺元数据为后续扩展点（见修订版 V2 §4）。
- Tauri 桌面打包为 Phase 5（见修订版 V2 §7），未包含在仓库内。
