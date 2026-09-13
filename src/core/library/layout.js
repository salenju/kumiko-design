/**
 * 初始化框架（core/library/layout.js）
 *
 * 「初始化框架」= 按 x 行 / y 列 / 间距，用**线条**生成一个格子框架：
 *   - 横线：rows + 1 条，中心距 pitchY
 *   - 竖线：cols + 1 条，中心距 pitchX
 * 这些线是**真实木条**（由 frame.js 生成为 kind:'family' 图案），
 * 相互求交后被切成单元格边界段，渲染为实线网格（见 docs/图案模块化-0913.md §5）。
 *
 * 单元格（Cell）由 layout 参数**派生**，用于「点格子 → 从图案库填入图案」的命中判定：
 *   cellRect(layout,row,col) = { x: origin.x + col*pitchX, y: origin.y + row*pitchY, w: pitchX, h: pitchY }
 *
 * 数据模型（project.layout，随项目持久化）：
 *   { enabled, rows, cols, pitchX, pitchY, origin:{x,y}, width, endCut }
 */

import { DEFAULT_END_CUT } from './endCut.js'

/** 单元格数量上限（防御：避免超大框架拖垮渲染） */
export const MAX_SLOTS = 2000

export const DEFAULT_LAYOUT = Object.freeze({
  enabled: false,
  rows: 3,
  cols: 4,
  pitchX: 200,
  pitchY: 200,
  origin: Object.freeze({ x: 0, y: 0 }),
  width: 3,
  endCut: DEFAULT_END_CUT
})

/** 复制一份默认框架（可变对象） */
export function defaultLayout() {
  return { ...DEFAULT_LAYOUT, origin: { ...DEFAULT_LAYOUT.origin } }
}

function clampInt(v, min, max, fallback) {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function clampNum(v, min, max, fallback) {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** 规整框架参数（补默认值 / 夹取范围 / 限制单元格总数） */
export function normalizeLayout(layout) {
  const l = layout || {}
  const o = l.origin || {}
  let rows = clampInt(l.rows, 1, 200, DEFAULT_LAYOUT.rows)
  let cols = clampInt(l.cols, 1, 200, DEFAULT_LAYOUT.cols)
  if (rows * cols > MAX_SLOTS) {
    // 等比收缩到上限内
    const scale = Math.sqrt(MAX_SLOTS / (rows * cols))
    rows = Math.max(1, Math.floor(rows * scale))
    cols = Math.max(1, Math.floor(cols * scale))
  }
  // 兼容早期「单元格 + 间隙」写法：pitch = cell + gap
  const legacyX = Number(l.cellW) + Number(l.gapX || 0)
  const legacyY = Number(l.cellH) + Number(l.gapY || 0)
  return {
    enabled: !!l.enabled,
    rows,
    cols,
    pitchX: clampNum(l.pitchX ?? (Number.isFinite(legacyX) ? legacyX : undefined), 2, 10000, DEFAULT_LAYOUT.pitchX),
    pitchY: clampNum(l.pitchY ?? (Number.isFinite(legacyY) ? legacyY : undefined), 2, 10000, DEFAULT_LAYOUT.pitchY),
    origin: {
      x: Number.isFinite(Number(o.x)) ? Number(o.x) : 0,
      y: Number.isFinite(Number(o.y)) ? Number(o.y) : 0
    },
    width: clampNum(l.width, 0.1, 50, DEFAULT_LAYOUT.width),
    endCut: clampNum(l.endCut, 10, 170, DEFAULT_END_CUT)
  }
}

/** 单元格键（用于实例绑定与命中判断） */
export function slotKey(row, col) {
  return `${row}:${col}`
}

/** 解析单元格键；非法返回 null */
export function parseSlotKey(key) {
  if (typeof key !== 'string') return null
  const [r, c] = key.split(':')
  const row = Number(r)
  const col = Number(c)
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null
  return { row, col }
}

/** 第 row 行第 col 列单元格矩形 */
export function slotRect(layout, row, col) {
  return {
    x: layout.origin.x + col * layout.pitchX,
    y: layout.origin.y + row * layout.pitchY,
    w: layout.pitchX,
    h: layout.pitchY
  }
}

/** 全部单元格（行优先），含 row/col/key/rect */
export function allSlots(layout) {
  const out = []
  if (!layout || !layout.rows || !layout.cols) return out
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols; c++) {
      out.push({ row: r, col: c, key: slotKey(r, c), rect: slotRect(layout, r, c) })
    }
  }
  return out
}

/** 单元格中心 */
export function slotCenter(rect) {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
}

/** 矩形内缩（负值外扩）；内缩量过大时退化为原矩形内的最小区域 */
export function insetRect(rect, inset) {
  const d = Number(inset)
  if (!Number.isFinite(d) || d === 0) return { ...rect }
  if (d < 0) {
    return { x: rect.x + d, y: rect.y + d, w: rect.w - 2 * d, h: rect.h - 2 * d }
  }
  const maxD = Math.min(rect.w, rect.h) / 2 - 0.5
  const dd = Math.min(d, Math.max(0, maxD))
  return { x: rect.x + dd, y: rect.y + dd, w: rect.w - 2 * dd, h: rect.h - 2 * dd }
}

/** 框架整体外接矩形（= 线条覆盖范围）；非法返回 null */
export function layoutBounds(layout) {
  if (!layout || !layout.rows || !layout.cols) return null
  return {
    x: layout.origin.x,
    y: layout.origin.y,
    w: layout.cols * layout.pitchX,
    h: layout.rows * layout.pitchY
  }
}

/** 框架线条数（横线 / 竖线），供 UI 摘要展示 */
export function frameLineCount(layout) {
  if (!layout) return { horizontal: 0, vertical: 0 }
  return { horizontal: layout.rows + 1, vertical: layout.cols + 1 }
}

/**
 * 命中单元格：点 → { row, col, key, rect } | null
 * 单元格相邻无缝，故落在格内的点即属于该格（边界冲突时归右侧/下侧格）。
 * @param {number} pad 容差（mm），默认 0
 */
export function findSlotAt(layout, point, pad = 0) {
  if (!layout || !point || !layout.rows || !layout.cols) return null
  const { pitchX, pitchY, origin, rows, cols } = layout
  const col = Math.round((point.x - origin.x - pitchX / 2) / pitchX)
  const row = Math.round((point.y - origin.y - pitchY / 2) / pitchY)
  if (row < 0 || col < 0 || row >= rows || col >= cols) return null
  const rect = slotRect(layout, row, col)
  const p = Number.isFinite(pad) && pad > 0 ? pad : 0
  if (point.x < rect.x - p || point.x > rect.x + rect.w + p) return null
  if (point.y < rect.y - p || point.y > rect.y + rect.h + p) return null
  return { row, col, key: slotKey(row, col), rect }
}

/** 距点最近的单元格（框架无效返回 null） */
export function nearestSlot(layout, point) {
  if (!layout || !point) return null
  const slots = allSlots(layout)
  if (!slots.length) return null
  let best = null
  let bestD = Infinity
  for (const s of slots) {
    const c = slotCenter(s.rect)
    const d = Math.hypot(c.x - point.x, c.y - point.y)
    if (d < bestD) {
      bestD = d
      best = s
    }
  }
  return best
}

/** 单元格是否在框架范围内（判断实例绑定是否越界） */
export function isSlotInRange(layout, cell) {
  if (!layout || !cell) return false
  return (
    Number.isInteger(cell.row) &&
    Number.isInteger(cell.col) &&
    cell.row >= 0 &&
    cell.row < layout.rows &&
    cell.col >= 0 &&
    cell.col < layout.cols
  )
}
