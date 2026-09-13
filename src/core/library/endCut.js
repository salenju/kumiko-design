/**
 * 末端切口角几何（core/library/endCut.js）
 *
 * 定义：endCut = 木条「端面方向」与「木条方向」的夹角（度）。
 *   - 90° = 端面垂直于木条 = 方切（默认，等同普通截断，不额外绘制端面线）
 *   - 45° = 端面与木条成 45° = 斜切
 *   - 有效区间 10° ~ 170°
 *
 * 端面线方向（世界坐标有向角） = 木条方向角 + endCut。
 * 「末端」判定：段端点落在其所属图案 bounds 的边界上（容差 BOUNDS_TOL）。
 *   落在图案内部的交点属于「插口」，不是末端。
 *
 * 注意：斜切只改变端部形状，不改变木条中心线长度，因此**不影响派生段、算料与插口统计**。
 */

import { angleOfSegment } from '../geometry/index.js'

export const DEFAULT_END_CUT = 90
export const MIN_END_CUT = 10
export const MAX_END_CUT = 170

/** 边界判定容差（mm） */
export const BOUNDS_TOL = 0.05

/** 规整末端切口角到 [10,170]；非法值返回 fallback */
export function normalizeEndCut(v, fallback = DEFAULT_END_CUT) {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(MAX_END_CUT, Math.max(MIN_END_CUT, n))
}

/** 是否方切（90°，无需绘制端面线） */
export function isSquareCut(endCut) {
  return Math.abs(normalizeEndCut(endCut) - DEFAULT_END_CUT) < 1e-6
}

/** 点是否落在 AABB 边界上（含端点，容差 tol） */
export function isOnBoundsEdge(px, py, bounds, tol = BOUNDS_TOL) {
  if (!bounds || !(bounds.w > 0) || !(bounds.h > 0)) return false
  const { x, y, w, h } = bounds
  if (px < x - tol || px > x + w + tol || py < y - tol || py > y + h + tol) return false
  const onV = Math.abs(px - x) <= tol || Math.abs(px - (x + w)) <= tol
  const onH = Math.abs(py - y) <= tol || Math.abs(py - (y + h)) <= tol
  return onV || onH
}

/** 段的两个端点中落在 bounds 边界上的那些端 */
export function boundaryEnds(seg, bounds, tol = BOUNDS_TOL) {
  const ends = []
  if (!seg || !bounds) return ends
  if (isOnBoundsEdge(seg.x1, seg.y1, bounds, tol)) ends.push({ x: seg.x1, y: seg.y1, at: 'start' })
  if (isOnBoundsEdge(seg.x2, seg.y2, bounds, tol)) ends.push({ x: seg.x2, y: seg.y2, at: 'end' })
  return ends
}

/** 段的直线方向角（[0,180)，无向）；退化返回 null */
export function barAngleOfSegment(seg) {
  return angleOfSegment(seg.x1, seg.y1, seg.x2, seg.y2)
}

/** 以 point 为中点、方向 = 木条方向 + endCut、半长 halfLen 的端面线段 */
export function endFaceLine(point, barAngleDeg, endCut, halfLen) {
  const a = (((barAngleDeg ?? 0) + normalizeEndCut(endCut)) * Math.PI) / 180
  const ux = Math.cos(a)
  const uy = Math.sin(a)
  const l = Number.isFinite(halfLen) && halfLen > 0 ? halfLen : 0
  return {
    x1: point.x - ux * l,
    y1: point.y - uy * l,
    x2: point.x + ux * l,
    y2: point.y + uy * l
  }
}

/**
 * 为一批派生段生成端面（末端切口示意线 + 角度信息）。
 *
 * @param {Array} segments 派生段（需含 id/x1/y1/x2/y2/width）
 * @param {(seg:object)=>({x,y,w,h}|null)} boundsOf 取该段所属图案的绘制范围
 * @param {(seg:object)=>number} endCutOf 取该段的末端切口角
 * @param {(seg:object)=>number} [halfLenOf] 端面线半长（默认取木条宽）
 * @returns {Array<{id,segId,point:{x,y},angle:number,square:boolean,x1,y1,x2,y2}>}
 */
export function buildEndFaces(segments, boundsOf, endCutOf, halfLenOf) {
  const faces = []
  if (!Array.isArray(segments)) return faces
  for (const seg of segments) {
    if (!seg) continue
    const bounds = boundsOf ? boundsOf(seg) : null
    if (!bounds) continue
    const ends = boundaryEnds(seg, bounds)
    if (!ends.length) continue
    const barAngle = barAngleOfSegment(seg)
    if (barAngle === null) continue
    const angle = normalizeEndCut(endCutOf ? endCutOf(seg) : DEFAULT_END_CUT)
    const halfLen = (halfLenOf ? halfLenOf(seg) : seg.width) || seg.width || 3
    for (const e of ends) {
      const line = endFaceLine(e, barAngle, angle, halfLen)
      faces.push({
        id: `${seg.id}#${e.at}`,
        segId: seg.id,
        point: { x: e.x, y: e.y },
        angle,
        square: isSquareCut(angle),
        ...line
      })
    }
  }
  return faces
}
