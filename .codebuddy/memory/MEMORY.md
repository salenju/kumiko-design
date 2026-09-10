# kumiko-design 长期记忆

## 项目定位
组子细工绘图助手：面向组子细工爱好者的 2D 精确制图与算料工具（Web / PWA）。

## 技术栈与约定
- Vite 8 + Vue 3.5（`<script setup>`）+ Pinia 4 + Naive UI（全量引入）；**纯 JS，无 TypeScript**。
- 渲染：原生 SVG 三层（GridLayer / PatternLayer / InteractionLayer），viewBox 承载 mm→px。
- 纯逻辑集中在 `src/core/`（零依赖、可单测）；几何/图案/算料测试齐全。
- 测试：`pnpm test`（Vitest），spec 文件与被测文件同目录；组件测试需 `// @vitest-environment happy-dom`。
- 派生段不入 store：`project.segments` 是响应式 getter（`core/patterns/derive.js` 的 `segmentsFromPatterns`）。
- 撤销：`stores/history.js` 快照栈；**切换作品/载入文件必须清空撤销栈**，否则跨上下文撤销会串数据。

## 关键环境约束（易踩坑）
- **Android Chrome 不支持 File System Access API**（`showDirectoryPicker` 等）；故「读写平板任意目录」不可行，一律用「应用内工作区 + 导入导出」。若确需真读写目录，只能上原生壳（Capacitor / Tauri Mobile）。
- pnpm 严格模式下，`vite-plugin-pwa` 的 `virtual:pwa-register` 需要**显式安装 `workbox-window`**（`workbox-build` 亦然），否则构建报 unresolved import。
- Pinia state 内对象是响应式 Proxy，**不能直接写 IndexedDB**（DataCloneError）→ 写库前需 JSON 往返转纯对象。
- `src/pwa.js` 引用 `virtual:pwa-register`，**不得在 vitest 中导入**（插件在 `VITEST` 下 `disable`）。

## 存储与部署
- 工作区数据：IndexedDB `kumiko-workspace`（store `works` / `meta`），不可用时降级 localStorage（`kumiko:ws:*`）。
- 旧版单项目存档 key：`kumiko:project:v2`（仅用于一次性迁移）。
- PWA：Workbox 全量预缓存（完全离线）；单 chunk ~1.5MB（gzip ~426KB，Naive UI 全量引入所致）。
- 部署：GitHub Pages（`.github/workflows/deploy.yml`）；子路径部署必须传 `BASE_PATH=/<repo>/ pnpm build`，它同时作用于 Vite base 与 PWA `start_url`/`scope`。免费版 Pages 需 public 仓库。

## 常用命令
```bash
pnpm dev        # 开发（不注册 SW）
pnpm test       # 全量测试
pnpm build      # 生产构建（含 sw.js / manifest.webmanifest）
pnpm preview    # 验证 PWA / 离线用这里
pnpm pwa:assets # 由 public/logo.svg 重新生成图标集
```
