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

/** 图案参考锚点：line 用起点；family 用 ref。 */
export function patternAnchor(pattern) {
  if (pattern.kind === 'line') return { x: pattern.x1, y: pattern.y1 }
  if (pattern.kind === 'family') return { x: pattern.ref.x, y: pattern.ref.y }
  return { x: 0, y: 0 }
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
