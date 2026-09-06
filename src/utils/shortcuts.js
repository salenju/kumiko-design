/**
 * 快捷键定义与文案（行业惯例）
 *
 * 工具切换：
 *   V 选择 | P 平移 | L 画线（单线）| G 画线族(grid pattern)
 *   B 暂用画线族？—— CAD/矢量工具惯例：V=选择, H=平移, L=直线
 *   采用：V 选择、H 平移、L 画线（单线）、G 画线族（网格/族）
 * 视图：
 *   空格+拖拽 = 临时平移；滚轮缩放；Ctrl+0 适配视图
 * 编辑：Delete 删除、Ctrl+D 复制、Ctrl+Z 撤销、Ctrl+Shift+Z / Ctrl+Y 重做
 * 辅助：Escape 取消选择
 */
export const TOOL_SHORTCUTS = {
  select: 'V',
  pan: 'H',
  line: 'L',
  pattern: 'G'
}

/** 工具说明（含行业惯例的补充提示） */
export const TOOL_HINTS = {
  select: '选择 / 框选 / 拖拽移动（可配合 Shift 加选）',
  pan: '平移画布（按住空格也可临时平移）',
  line: '画单根线段',
  pattern: '画一族平行线'
}
