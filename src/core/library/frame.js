/**
 * 初始化框架的线条生成（core/library/frame.js）
 *
 * 「初始化框架」按 x 行 / y 列 / 间距，用**线条**生成格子框架：
 *   - 横线：rows + 1 条（angle 0°），第 i 条 y = origin.y + i·pitchY
 *   - 竖线：cols + 1 条（angle 90°），第 i 条 x = origin.x + i·pitchX
 * 这些线作为**真实木条**（kind:'family'）参与求交派生 / 渲染 / 算料 / 部件统计，
 * 相互求交后被切成单元格边界段，即形成所见网格。
 *
 * 与「图案实例」的区别：框架线带 `frame: true` 标记，无 groupId，
 * 由 project.syncFrame() 在 layout 变化时整体重建，不参与槽位绑定。
 */

import { layoutBounds, normalizeLayout } from './layout.js'
import { normalizeEndCut } from './endCut.js'

/** 框架图案的模块标识（用于部件分类统计与属性面板识别） */
export const FRAME_MODULE_ID = 'mod-frame'
/** 框架在属性面板上的显示名 */
export const FRAME_MODULE_NAME = '初始化框架'

/** 框架图案 id 前缀（稳定，便于识别与替换） */
export const FRAME_PREFIX = 'frame'

/**
 * 由框架参数生成线条图案（横线族 + 竖线族）。
 * @param {object} layout 框架参数（会自动规整）
 * @returns {Array} patterns（kind:'family'，带 frame:true / moduleId:'mod-frame'）
 */
export function framePatterns(layout) {
  const l = normalizeLayout(layout)
  const bounds = layoutBounds(l)
  if (!l.enabled || !bounds) return []
  const endCut = normalizeEndCut(l.endCut)
  const width = Math.max(0.1, l.width)

  // 横线：angle 0°，法向 (0,1) → lineAnchor(i) = ref + i·spacing·(0,1)
  //        故 ref 取左上角，第 i 条 y = origin.y + i·pitchY
  const horizontal = {
    id: `${FRAME_PREFIX}-h`,
    kind: 'family',
    ref: { x: bounds.x, y: bounds.y },
    angle: 0,
    spacing: l.pitchY,
    count: l.rows + 1,
    width,
    bounds: { ...bounds },
    frame: true,
    moduleId: FRAME_MODULE_ID,
    endCut
  }

  // 竖线：angle 90°，法向 (-1,0) → lineAnchor(i) = ref - i·spacing·(1,0)
  //        故 ref 取右上角，第 i 条 x = origin.x + cols·pitchX - i·pitchX
  //        （线集等价于 origin.x … origin.x + cols·pitchX）
  const vertical = {
    id: `${FRAME_PREFIX}-v`,
    kind: 'family',
    ref: { x: bounds.x + bounds.w, y: bounds.y },
    angle: 90,
    spacing: l.pitchX,
    count: l.cols + 1,
    width,
    bounds: { ...bounds },
    frame: true,
    moduleId: FRAME_MODULE_ID,
    endCut
  }

  return [horizontal, vertical]
}

/** 替换 patterns 中的框架线（保留其余图案）；layout 未启用时仅移除 */
export function replaceFramePatterns(patterns, layout) {
  const rest = (patterns || []).filter((p) => !p || !p.frame)
  return [...rest, ...framePatterns(layout)]
}
