/**
 * 图案模块 → patterns[] 生成（core/library/build.js）
 *
 * 生成规则：
 *  - families：每条 { angle, ratio } 用 coverFamily 覆盖 rect 得到一族平行线；
 *  - segsStrategy：内置线段策略（龟甲）；
 *  - segs：归一化 [0,1]² 的自定义线段，按 rect 缩放；
 *  - 每个 pattern 附加 groupId / moduleId / endCut，供渲染端面线与部件分类统计使用。
 */

import { coverFamily } from '../patterns/family.js'
import { uid } from '../../utils/id.js'
import { normalizeEndCut } from './endCut.js'
import { builtinModule } from './catalog.js'

const SQRT3 = Math.sqrt(3)

function safeNum(v, fallback) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** 点坐标量化键（0.01mm 精度） */
function ptKey(x, y) {
  return `${Math.round(x * 100)}_${Math.round(y * 100)}`
}

/** 无向边去重键（两端点排序） */
function edgeKey(x1, y1, x2, y2) {
  const a = ptKey(x1, y1)
  const b = ptKey(x2, y2)
  return a <= b ? `${a}|${b}` : `${b}|${a}`
}

/**
 * 线段与 AABB 裁剪（Liang–Barsky）。完全在矩形外返回 null。
 * @returns {{x1,y1,x2,y2}|null}
 */
export function clipSegmentToRect(x1, y1, x2, y2, rect) {
  if (!rect || !(rect.w > 0) || !(rect.h > 0)) return null
  const xmin = rect.x
  const xmax = rect.x + rect.w
  const ymin = rect.y
  const ymax = rect.y + rect.h
  const dx = x2 - x1
  const dy = y2 - y1
  let t0 = 0
  let t1 = 1
  const p = [-dx, dx, -dy, dy]
  const q = [x1 - xmin, xmax - x1, y1 - ymin, ymax - y1]
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-12) {
      if (q[i] < 0) return null // 平行且在界外
      continue
    }
    const r = q[i] / p[i]
    if (p[i] < 0) {
      if (r > t1) return null
      if (r > t0) t0 = r
    } else {
      if (r < t0) return null
      if (r < t1) t1 = r
    }
  }
  const nx1 = x1 + t0 * dx
  const ny1 = y1 + t0 * dy
  const nx2 = x1 + t1 * dx
  const ny2 = y1 + t1 * dy
  if (Math.hypot(nx2 - nx1, ny2 - ny1) < 1e-9) return null
  return { x1: nx1, y1: ny1, x2: nx2, y2: ny2 }
}

/**
 * 龟甲：平顶正六边形蜂窝网格的全部边（去重共享边 + 裁剪进 rect）。
 * 六边形边长 a = spacing/√3（spacing 为对边距）；
 * 列间距 1.5a，列内行间距 spacing，奇数列纵向错开 spacing/2。
 */
export function kikkouSegments(rect, spacing) {
  const s = Math.max(2, safeNum(spacing, 30))
  const a = s / SQRT3
  const pitchX = 1.5 * a
  const out = []
  const seen = new Set()
  const cols = Math.ceil(rect.w / pitchX) + 4
  const rows = Math.ceil(rect.h / s) + 4
  const x0 = rect.x - 2 * pitchX
  const y0 = rect.y - 2 * s
  for (let i = 0; i < cols; i++) {
    const cx = x0 + i * pitchX
    const yShift = i % 2 ? s / 2 : 0
    for (let j = 0; j < rows; j++) {
      const cy = y0 + j * s + yShift
      for (let k = 0; k < 6; k++) {
        const a1 = ((k * 60) * Math.PI) / 180
        const a2 = (((k + 1) * 60) * Math.PI) / 180
        const p1x = cx + a * Math.cos(a1)
        const p1y = cy + a * Math.sin(a1)
        const p2x = cx + a * Math.cos(a2)
        const p2y = cy + a * Math.sin(a2)
        const key = edgeKey(p1x, p1y, p2x, p2y)
        if (seen.has(key)) continue
        seen.add(key)
        const clipped = clipSegmentToRect(p1x, p1y, p2x, p2y, rect)
        if (clipped) out.push(clipped)
      }
    }
  }
  return out
}

/**
 * 共线相邻段合并：同一直线上首尾相接（间隙 ≤ tol）的段合并为一根。
 * 蜂窝网格中不存在共线相邻边，此步为通用正确性保障。
 */
export function mergeCollinearSegments(segments, tol = 0.02) {
  const groups = new Map()
  for (const seg of segments || []) {
    const dx = seg.x2 - seg.x1
    const dy = seg.y2 - seg.y1
    const len = Math.hypot(dx, dy)
    if (len < 1e-9) continue
    const ux = dx / len
    const uy = dy / len
    // 无向方向：保证 (ux,uy) 与 (-ux,-uy) 归一到同一表示
    const flip = ux < -1e-9 || (Math.abs(ux) <= 1e-9 && uy < 0)
    const vx = flip ? -ux : ux
    const vy = flip ? -uy : uy
    const ang = Math.round((Math.atan2(vy, vx) * 180) / Math.PI) * 1e3
    // 直线偏移量（法向截距）
    const off = Math.round((seg.x1 * -vy + seg.y1 * vx) * 100) / 100
    const key = `${ang}|${off}`
    // 沿方向参数
    let t1 = seg.x1 * vx + seg.y1 * vy
    let t2 = seg.x2 * vx + seg.y2 * vy
    if (t1 > t2) [t1, t2] = [t2, t1]
    const arr = groups.get(key)
    if (arr) arr.push({ t1, t2 })
    else groups.set(key, [{ t1, t2 }])
  }
  const out = []
  for (const [key, spans] of groups) {
    const [angStr, offStr] = key.split('|')
    const ang = Number(angStr) / 1e3
    const off = Number(offStr)
    const rad = (ang * Math.PI) / 180
    const vx = Math.cos(rad)
    const vy = Math.sin(rad)
    // 点 = 法向偏移投影 + 方向参数
    spans.sort((a, b) => a.t1 - b.t1)
    let cur = { ...spans[0] }
    const merged = []
    for (let i = 1; i < spans.length; i++) {
      const s = spans[i]
      if (s.t1 - cur.t2 <= tol) {
        cur.t2 = Math.max(cur.t2, s.t2)
      } else {
        merged.push({ ...cur })
        cur = { ...s }
      }
    }
    merged.push(cur)
    for (const m of merged) {
      if (m.t2 - m.t1 < 1e-9) continue
      // 取方向上的一个基准点：法向 (nx,ny) = (-vy, vx)
      const nx = -vy
      const ny = vx
      const bx = off * nx
      const by = off * ny
      out.push({
        x1: bx + m.t1 * vx,
        y1: by + m.t1 * vy,
        x2: bx + m.t2 * vx,
        y2: by + m.t2 * vy
      })
    }
  }
  return out
}

/** 生成模块的显式线段（rect 坐标系） */
export function generateModuleSegments(module, rect, params) {
  if (!module) return []
  if (module.segsStrategy === 'kikkou') {
    return mergeCollinearSegments(kikkouSegments(rect, safeNum(params.spacing, 30)))
  }
  if (Array.isArray(module.segs) && module.segs.length) {
    const out = []
    for (const s of module.segs) {
      const x1 = rect.x + safeNum(s.x1, 0) * rect.w
      const y1 = rect.y + safeNum(s.y1, 0) * rect.h
      const x2 = rect.x + safeNum(s.x2, 0) * rect.w
      const y2 = rect.y + safeNum(s.y2, 0) * rect.h
      if (Math.hypot(x2 - x1, y2 - y1) < 1e-9) continue
      out.push({ x1, y1, x2, y2 })
    }
    return out
  }
  return []
}

/**
 * 由模块定义 + 目标矩形 + 参数生成 patterns[]。
 * @param {object} module PatternModule
 * @param {{rect:{x,y,w,h}, params?:object, groupId?:string|null, idPrefix?:string}} opts
 * @returns {Array} patterns（family / segs）
 */
export function buildModulePatterns(module, { rect, params, groupId = null, idPrefix } = {}) {
  if (!module || !rect || !(rect.w > 0) || !(rect.h > 0)) return []
  const p = { ...(module.defaults || {}), ...(params || {}) }
  const width = Math.max(0.1, safeNum(p.width, 4))
  const endCut = normalizeEndCut(p.endCut)
  const bounds = { x: rect.x, y: rect.y, w: rect.w, h: rect.h }
  const prefix = idPrefix || uid('pg')
  const baseSpacing = Math.max(0.5, safeNum(p.spacing, 30))
  const out = []

  const families = Array.isArray(module.families) ? module.families : []
  families.forEach((f, i) => {
    const angle = safeNum(f.angle, 0)
    const ratio = Number.isFinite(Number(f.ratio)) && Number(f.ratio) > 0 ? Number(f.ratio) : 1
    const spacing = Math.max(0.5, baseSpacing * ratio)
    const { ref, count } = coverFamily(angle, spacing, bounds)
    out.push({
      id: `${prefix}-f${i}`,
      kind: 'family',
      ref,
      angle,
      spacing,
      count,
      width: Math.max(0.1, safeNum(f.width, width)),
      bounds: { ...bounds },
      groupId,
      moduleId: module.id,
      endCut
    })
  })

  const segs = generateModuleSegments(module, rect, p)
  if (segs.length) {
    out.push({
      id: `${prefix}-s`,
      kind: 'segs',
      segments: segs,
      width,
      bounds: { ...bounds },
      groupId,
      moduleId: module.id,
      endCut
    })
  }

  return out
}

/**
 * 在 rect 内选取一个居中的正方形/矩形放置区（自由放置时用）。
 * @param {{x,y}} center 放置中心
 * @param {number} size 外框尺寸（mm）
 * @param {{w?:number,h?:number}} [aspect] 期望宽高比（默认 1:1）
 */
export function placeRect(center, size, aspect) {
  const s = Math.max(5, safeNum(size, 300))
  const aw = safeNum(aspect?.w, 1)
  const ah = safeNum(aspect?.h, 1)
  const ratio = ah > 0 ? aw / ah : 1
  const w = ratio >= 1 ? s : s * ratio
  const h = ratio >= 1 ? s / ratio : s
  return { x: center.x - w / 2, y: center.y - h / 2, w, h }
}

/**
 * 便捷生成器：按内置模块 id 在外框中心生成图案（脚本化 / 测试 fixture 用）。
 * 交互路径请用 `project.addGroup()`（会生成整体实例）；此函数仅返回裸 patterns。
 *
 * 模块 id 可写全称 `'mod-koushi'` 或简称 `'koushi'`。
 * @param {string} moduleId
 * @param {{cx?,cy?,size?,spacing?,width?,endCut?}} params 外框中心 + 模块参数
 * @returns {Array} patterns（无 groupId）
 */
export function generateModulePatterns(moduleId, params = {}) {
  const key = String(moduleId || '')
  const module = builtinModule(key.startsWith('mod-') ? key : `mod-${key}`)
  if (!module) return []
  const { cx = 0, cy = 0, size = 300, ...rest } = params
  return buildModulePatterns(module, {
    rect: placeRect({ x: Number(cx) || 0, y: Number(cy) || 0 }, size),
    params: rest
  })
}

