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
图案库模块（core/library/catalog.js：内置 6 种 + 自定义）
   → buildModulePatterns()  按目标矩形/参数展开
线族参数 patterns[]（纯数据，project store；kind = family / line / segs）
   → core/patterns/derive.segmentsFromPatterns()  求交切分
   → 派生线段 segments[]（只读，响应式 getter 缓存，不入 store）
   → PatternLayer 渲染 <line> / 算料 aggregate → planStock / 导出 SVG / 工作区缩略图
```

任何编辑都落在 patterns 参数上（角度/间距/条数/木条宽/范围/末端切口角），派生段自动重算。

```
图案库实例 groups[]（moduleId + params + cell + patternIds + module 快照）
   → 一次插入 = 展开为一组带 groupId 的 patterns；点选任一木条 = 选中整个实例
初始化框架 layout（rows/cols/pitchX/pitchY/origin/width/endCut）
   → frame.js 用线条生成横线族 + 竖线族（frame:true，真实木条，参与求交/算料/部件/导出）
   → 单元格由 allSlots() 派生（不入库）；实例 cell 绑定 → 框架变更时 rebuildGroups() 自动重排
```

```
工作区（workspace store）
   project 纯数据 → pickWorkData() → IndexedDB `kumiko-workspace`（works + meta）
   编辑防抖 400ms 自动写回当前作品；⌘S 立即写回；切换作品前先写回
```

数据流向单向：`workspace → project`（载入用 `replaceAll`，并清空撤销栈与选中，避免跨作品撤销串数据）。

## 核心目录

```
src/
├── core/            # 纯逻辑（geometry / patterns / cutlist / parts / library），可单测可进 Worker
│   └── library/     # 图案库：catalog（模块目录）/ build（展开生成）/ endCut（末端切口角）
│                    #        layout（单元格几何）/ frame（框架线条生成）/ custom（存为图案 + localStorage）
├── stores/          # project（画布数据）/ workspace（工作区）/ library（自定义图案）/ history（撤销栈）/ ui（视图状态）
├── composables/     # useViewport / useSelection / usePatternTool
├── components/
│   ├── canvas/      # KumikoCanvas + GridLayer + SlotLayer + PatternLayer + InteractionLayer
│   ├── panels/      # Toolbar / PatternPropertyPanel / PatternLibraryPanel / PatternThumb / CutListPanel / PartsPanel
│   └── dialogs/     # WorkspaceModal / LayoutModal / PwaPrompts / AiModal
├── ai/              # parseIntent（Phase 4：NL→参数，几何本地生成）
├── pwa.js           # PWA 运行时（SW 注册 / 安装引导 / 更新提示）
└── utils/
    ├── workspace/   # db.js（IndexedDB 引擎 + 兜底）/ repo.js（作品 CRUD/导入导出/备份/缩略图）
    └── ...          # exportSvg / projectFile / persist（旧存档迁移）/ zip / id
```

## 功能对照

- **图案库**：工具栏「▤ 图案库」→ 6 种内置图案（井字/斜格/麻叶/龟甲/手牵手/广场舞）+「我的图案」，按分类浏览、缩略图预览；单击插入 / 参数弹窗插入 / 拖拽到画布（拖到槽位自动吸附）；插入后是整体实例，可整体调参、整体复制删除
- **存为图案**：框选画布内容 → 「＋ 存为图案」→ 归一化为自定义模块存入「我的图案」（localStorage，跨作品可用，可重命名/复制/删除）
- **初始化框架**：工具栏「▦ 初始化框架」→ 输入 x 行 / y 列 / 横纵间距 / 起点 / 木条宽 → **用线条生成格子框架**（横线 rows+1 条、竖线 cols+1 条，是真实木条，参与求交/算料/部件/导出）；点单元格选中后从图案库单击即可填入，拖拽可吸附；改框架参数线条整体重建且已填图案自动重排；框架线条不可单独删除
- **末端切口角**：木条端面与木条方向的夹角（90° = 方切，45° = 斜切）；非方切时在图案边界的木条末端绘制端面线，鼠标悬停显示角度；不影响长度与算料
- 添加纹样：工具栏「▤ 图案库」（原「＋ 预设」已并入）或「画线族」工具拖拽
- 编辑：点选/框选线段 → 右侧面板改 角度/间距/条数/木条宽/bounds，画布即时重排
- 撤销/重做：Ctrl+Z / Ctrl+Y（或工具栏按钮），Delete 删除选中
- 尺寸：悬停显示该段长度（mm，0.1 精度），「标注」开关显示全部
- **工作区**：工具栏「🗂 工作区」→ 多作品列表（缩略图/时间/大小），新建、打开、重命名、复制、删除（回收站）、搜索、容量展示
- **暂存/恢复**：编辑后自动防抖写回当前作品；`Ctrl/⌘+S` 立即暂存；旧版单项目自动迁入
- **文件**：「导入文件」（可多选）作为新作品导入；「导出文件」导出单个作品；「备份全部」导出 zip（manifest + 每作品一个 json）
- **PWA**：可安装到主屏、全屏运行、**完全离线可用**、更新提示；申请持久化存储降低被清理风险
- 算料：工具栏「算料」→ 按木条宽分组 1D 下料 → cut list + 利用率
- 图案部件：工具栏「图案部件」→ 同型整根本条分组（尺寸 × 插口间距缩写 × 插口数）；两种视图：「按图案分类」（分类 → 图案模块 → 同型表，逐级小计）/「全部展开」（含分类/模块列）；施工包 CSV 同步带分类与模块列
- 导出：SVG（mm 坐标，可用于矢量/激光切割）
- AI（接口就绪）：「AI 生成」→ 本地 NL→参数解析（接 LLM 时替换 parseIntent 实现）

## 说明与取舍

- 打包体积大：Naive UI 全量引入所致；PWA 要求「完全离线」故**全量预缓存**（首屏 ~1.5MB / gzip ~426KB），后续可按需引入优化。
- 工作区数据存 IndexedDB（仅 project 纯数据，不含派生段/UI 态）；IndexedDB 不可用时降级 localStorage 并在 UI 提示。
- **Android Chrome 不支持 File System Access API**，故不做「直接读写平板目录」，改用「应用内工作区 + 导入导出」。若将来必须真读写目录，需上原生壳（Capacitor / Tauri Mobile）。
- 卸载 PWA / 清除站点数据会删除工作区内容 → 依赖「备份全部」与持久化存储申请兜底。
- 图案的「末端切口角」只做**端面示意与角度标注**（不改中心线长度、不影响算料）；更细的端部工艺（燕尾、榫接配合公差）仍为后续扩展点（见修订版 V2 §4 与 [图案模块化 PRD](docs/图案模块化-0913.md) §11）。
- 「手牵手」「广场舞」非标准组子术语，当前为**候选几何定义**（见 [图案模块化 PRD](docs/图案模块化-0913.md) §4）；几何由 `core/library/catalog.js` 配置驱动，校正成本 = 改一条定义。
- `kind:'segs'`（段集，如龟甲）**不参与跨图案求交**，只做渲染 + 部件统计，以避免大图案下的 O(n²) 派生开销。
- Tauri 桌面打包为 Phase 5（见修订版 V2 §7），未包含在仓库内。
