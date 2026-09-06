/**
 * 平行线间距辅助（core/patterns/spacing.js）
 * 用于「拖拽线段时显示并调整与相邻平行线的间距」：
 *   - nearestParallelSegment：从候选段中找与该段平行的最近邻居（垂直距离最小）；
 *   - spacingBetween：两条平行线段（作为无限直线）的垂直间距。
 */

import { distPointLine, isParallelDeg } from '../geometry/index.js'
import { angleDegOfVector } from '../geometry/index.js'

/** 线段方向角度（度，y-down 有向 0..360；平行判定用无向容差） */
export function segAngleDeg(seg) {
  return angleDegOfVector(seg.x2 - seg.x1, seg.y2 - seg.y1)
}

/** 两条线段是否平行（角度模 180 差 < tolDeg） */
export function segmentsParallel(segA, segB, tolDeg = 1e-6) {
  return isParallelDeg(segA.angleDeg ?? segAngleDeg(segA), segB.angleDeg ?? segAngleDeg(segB), tolDeg)
}

/**
 * 两平行线段之间的垂直间距（取 B 的起点到 A 所在无限直线的距离）。
 * 若线段不平行返回 Infinity。
 */
export function spacingBetween(segA, segB) {
  if (!segmentsParallel(segA, segB, 1e-6)) return Infinity
  // A 所在无限直线（过 x1,y1 沿方向）
  const aLine = {
    x: segA.x1,
    y: segA.y1,
    dx: segA.x2 - segA.x1,
    dy: segA.y2 - segA.y1
  }
  return distPointLine(segB.x1, segB.y1, aLine)
}

/**
 * 在候选段中找与 seg 平行且垂直距离最小的邻居段。
 * @param {object} seg 基准线段（可携带 angleDeg 缓存）
 * @param {Array} candidates 候选段（通常含自身，会被排除）
 * @param {object} [opts] { tolDeg=1, excludeId }
 * @returns {{other:object, distance:number}|null}
 */
export function nearestParallelSegment(seg, candidates, opts = {}) {
  const tolDeg = opts.tolDeg ?? 1
  const excludeId = opts.excludeId ?? seg.id
  const baseAngle = seg.angleDeg ?? segAngleDeg(seg)
  // 基准线所在无限直线（用于到候选的距离）
  const baseLine = {
    x: seg.x1,
    y: seg.y1,
    dx: seg.x2 - seg.x1,
    dy: seg.y2 - seg.y1
  }
  let best = null
  let bestDist = Infinity
  for (const other of candidates || []) {
    if (!other || other.id === excludeId) continue
    const oAngle = other.angleDeg ?? segAngleDeg(other)
    if (!isParallelDeg(baseAngle, oAngle, tolDeg)) continue
    // 近平行即可，距离用点到无限直线（不必严格平行）
    const d = distPointLine(other.x1, other.y1, baseLine)
    if (d < bestDist) {
      bestDist = d
      best = other
    }
  }
  return best ? { other: best, distance: bestDist } : null
}

/** 线段（或 pattern）整体平移，返回新数据（纯函数，不改原对象） */
export function translateSegmentLike(s, dx, dy) {
  const out = { ...s }
  for (const k of ['x1', 'y1', 'x2', 'y2', 'x', 'y']) {
    if (typeof s[k] === 'number') out[k] = s[k] + (k.endsWith('y') ? dy : dx)
  }
  return out
}

/**
 * 平移整个 pattern（family：ref+bounds；line：两端点），返回新 pattern。
 */
export function translatePattern(pattern, dx, dy) {
  const out = { ...pattern }
  if (pattern.kind === 'line') {
    out.x1 = pattern.x1 + dx
    out.y1 = pattern.y1 + dy
    out.x2 = pattern.x2 + dx
    out.y2 = pattern.y2 + dy
    return out
  }
  // family：整体移动（ref 与 bounds 同步平移）
  out.ref = { x: pattern.ref.x + dx, y: pattern.ref.y + dy }
  if (pattern.bounds) {
    out.bounds = {
      x: pattern.bounds.x + dx,
      y: pattern.bounds.y + dy,
      w: pattern.bounds.w,
      h: pattern.bounds.h
    }
  }
  return out
}

/**
 * 沿参考线的法向平移线段所在图案，使该线段与参考线的垂直间距 = targetSpacing。
 * 方向语义：保留线段原本位于参考线的那一侧（正侧/负侧）。
 * 参考线可为任意平行线段；targetSpacing <= 0 返回 null。
 * @param {object} pattern kind:'line' 的图案
 * @param {object} refSeg 平行参考线段
 * @param {number} targetSpacing 目标间距 mm（>0）
 * @returns {object|null} 平移后的图案；线段不平行或目标非法返回 null
 */
export function moveLineToSpacing(pattern, refSeg, targetSpacing) {
  if (pattern.kind !== 'line') return null
  if (!Number.isFinite(targetSpacing) || targetSpacing <= 0) return null
  const angle = segAngleDeg(pattern)
  const refAngle = segAngleDeg(refSeg)
  if (!isParallelDeg(angle, refAngle, 1e-6)) return null

  // 参考线方向（单位化）与法向
  const rdx = refSeg.x2 - refSeg.x1
  const rdy = refSeg.y2 - refSeg.y1
  const rl = Math.hypot(rdx, rdy)
  if (rl < 1e-9) return null
  const ndx = -rdy / rl
  const ndy = rdx / rl

  // 图案当前侧向偏移：以起点到参考线起点的向量在法向的投影（带符号）
  const vx = pattern.x1 - refSeg.x1
  const vy = pattern.y1 - refSeg.y1
  const signed = vx * ndx + vy * ndy

  // 当前投影 → 目标投影（保留方向符号，最小间距 clamp）
  const side = signed >= 0 ? 1 : -1
  const targetSigned = side * Math.abs(targetSpacing)

  // 需要的平移量（沿法向）
  const move = targetSigned - signed
  return translatePattern(pattern, move * ndx, move * ndy)
}

/**
 * 线段方向分类：
 *   'h' —— 水平（主方向沿 x，|dy| ≤ |dx|*0.15）
 *   'v' —— 竖直（|dx| ≤ |dy|*0.15）
 *   'd' —— 斜线（其余，如 30/45/60° 纹样）
 */
export function segOrientation(seg) {
  const dx = Math.abs(seg.x2 - seg.x1)
  const dy = Math.abs(seg.y2 - seg.y1)
  if (dy <= dx * 0.15) return 'h'
  if (dx <= dy * 0.15) return 'v'
  return 'd'
}

/**
 * 按「相邻线间距」基准规则查找参考平行线：
 *   横线 → 以【上方】相邻平行线为基准；竖线 → 以【左侧】相邻平行线为基准；
 *   斜线 → 回退为任意侧最近的平行线。
 * 基准侧若不存在平行线（例如线在最上方/最左侧），返回 null（面板应禁用调整）。
 * @returns {{other:object, distance:number, side:'up'|'left'|'nearest'}|null}
 */
export function referenceParallel(seg, candidates, opts = {}) {
  const tolDeg = opts.tolDeg ?? 1
  const excludeId = opts.excludeId ?? seg.id
  const baseAngle = seg.angleDeg ?? segAngleDeg(seg)
  const orientation = segOrientation(seg)
  const mx = (seg.x1 + seg.x2) / 2
  const my = (seg.y1 + seg.y2) / 2
  const baseLine = { x: seg.x1, y: seg.y1, dx: seg.x2 - seg.x1, dy: seg.y2 - seg.y1 }

  // 过滤平行候选
  const parallel = []
  for (const other of candidates || []) {
    if (!other || other.id === excludeId) continue
    const oAngle = other.angleDeg ?? segAngleDeg(other)
    if (isParallelDeg(baseAngle, oAngle, tolDeg)) parallel.push(other)
  }

  // 横/竖：只取基准侧（上方 ocy<my / 左侧 ocx<mx），取垂直距离最小者
  if (orientation === 'h' || orientation === 'v') {
    let best = null
    let bestDist = Infinity
    for (const other of parallel) {
      const ocx = (other.x1 + other.x2) / 2
      const ocy = (other.y1 + other.y2) / 2
      const onSide = orientation === 'h' ? ocy < my - 1e-9 : ocx < mx - 1e-9
      if (!onSide) continue
      const d = distPointLine(other.x1, other.y1, baseLine)
      if (d < bestDist) {
        bestDist = d
        best = other
      }
    }
    if (!best) return null
    return { other: best, distance: bestDist, side: orientation === 'h' ? 'up' : 'left' }
  }

  // 斜线：任意侧最近
  let anyBest = null
  let anyBestDist = Infinity
  for (const other of parallel) {
    const d = distPointLine(other.x1, other.y1, baseLine)
    if (d < anyBestDist) {
      anyBestDist = d
      anyBest = other
    }
  }
  if (!anyBest) return null
  return { other: anyBest, distance: anyBestDist, side: 'nearest' }
}

/**
 * 等距对齐检测（用户场景：A、B 平行间距 D；拖动第三条平行线 C，
 * 当 C 与相邻线 B 的间距也 ≈ D 时给出提示）。
 *
 * 规则：找 C 的最近平行邻居 B；再找 B 的最近平行邻居 A（排除 C 本身及其所属图案），
 * 若 spacing(C,B) ≈ spacing(B,A)（容差内）则返回提示信息。
 * @param {object} seg 被拖线段（C）
 * @param {Array} candidates 全部候选段（含 C 所属图案的段）
 * @param {object} [opts] { tolDeg=1, absTol=0.5, relTol=0.02, excludePatternId }
 * @returns {{reference:object, anchor:object, spacing, referenceSpacing}|null}
 */
export function equalSpacingHint(seg, candidates, opts = {}) {
  const absTol = opts.absTol ?? 0.5
  const relTol = opts.relTol ?? 0.02
  // C 的最近平行邻居 B（任意侧，取垂直距离最小）
  const B = nearestParallelSegment(seg, candidates, { tolDeg: opts.tolDeg ?? 1 })
  if (!B) return null
  // B 的最近平行邻居 A：排除 C（seg.id）与同图案的段，避免把 C 当参考
  const excludePattern = opts.excludePatternId
  const forA = (candidates || []).filter(
    (c) => c && c.id !== seg.id && (!excludePattern || c.patternId !== excludePattern)
  )
  const A = nearestParallelSegment(B.other, forA, { tolDeg: opts.tolDeg ?? 1 })
  if (!A) return null
  const spacingCB = B.distance
  const spacingBA = A.distance
  const tol = Math.max(absTol, spacingBA * relTol, spacingCB * relTol)
  if (Math.abs(spacingCB - spacingBA) > tol) return null
  return {
    reference: A.other, // A（参考系）
    anchor: B.other, // B（被拖线的相邻线）
    spacing: spacingCB,
    referenceSpacing: spacingBA
  }
}

/** 图案参考锚点：line 用起点；family 用 ref。 */export function patternAnchor(pattern) {
  if (pattern.kind === 'line') return { x: pattern.x1, y: pattern.y1 }
  if (pattern.kind === 'family') return { x: pattern.ref.x, y: pattern.ref.y }
  return { x: 0, y: 0 }
}

/**
 * 找与某线段的端点最接近的其它线段端点（端点捕捉提示用）。
 * @param {object} seg 被拖线段 {x1,y1,x2,y2}
 * @param {Array} candidates 候选线段（将排除与 seg 相同 id 者）
 * @param {number} [tol=2] 容差 mm
 * @returns {{x,y,other,ownKey:'x1'|'x2',distance:number}|null} 最近的外部端点；超过容差返回 null
 */
export function nearestForeignEndpoint(seg, candidates, tol = 2) {
  const own = [
    { key: 'x1', x: seg.x1, y: seg.y1 },
    { key: 'x2', x: seg.x2, y: seg.y2 }
  ]
  let best = null
  let bestDist = Infinity
  for (const other of candidates || []) {
    if (!other || other.id === seg.id) continue
    const others = [
      { x: other.x1, y: other.y1 },
      { x: other.x2, y: other.y2 }
    ]
    for (const pt of own) {
      for (const op of others) {
        const d = Math.hypot(op.x - pt.x, op.y - pt.y)
        if (d < bestDist) {
          bestDist = d
          best = { x: op.x, y: op.y, other, ownKey: pt.key, distance: d }
        }
      }
    }
  }
  if (!best || bestDist > tol) return null
  return best
}

/**
 * 通用「按相邻平行线间距移动图案」：
 * 以图案锚点在参考线法向的带符号距离为当前间距，整体平移图案使锚点
 * 到参考线(所在无限直线)的垂直距离 = targetSpacing（保持所在侧）。
 * 支持单线与线族。
 */
export function movePatternToSpacing(pattern, refSeg, targetSpacing) {
  if (!Number.isFinite(targetSpacing) || targetSpacing <= 0) return null
  const angle = pattern.kind === 'line' ? segAngleDeg(pattern) : pattern.angle
  const refAngle = segAngleDeg(refSeg)
  if (!isParallelDeg(angle, refAngle, 1e-6)) return null

  const rdx = refSeg.x2 - refSeg.x1
  const rdy = refSeg.y2 - refSeg.y1
  const rl = Math.hypot(rdx, rdy)
  if (rl < 1e-9) return null
  const ndx = -rdy / rl
  const ndy = rdx / rl

  const a = patternAnchor(pattern)
  const vx = a.x - refSeg.x1
  const vy = a.y - refSeg.y1
  const signed = vx * ndx + vy * ndy
  const side = signed >= 0 ? 1 : -1
  const move = side * Math.abs(targetSpacing) - signed
  return translatePattern(pattern, move * ndx, move * ndy)
}
