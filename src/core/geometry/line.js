/**
 * 直线/线段求交（core/geometry/line.js）
 * 无限直线用 { x, y, dx, dy }（建议单位化方向），参数化 p(t) = (x + t·dx, y + t·dy)。
 * 两直线求交采用行列式法；返回 null 表示平行/共线。
 */

import { EPS } from './vector.js'

/**
 * 两无限直线交点（按各自参数 t 描述）。
 * @param {{x,y,dx,dy}} l1
 * @param {{x,y,dx,dy}} l2
 * @returns {{t1:number,t2:number,x:number,y:number}|null} 平行/共线返回 null
 */
export function lineLineIntersect(l1, l2, eps = EPS) {
  const denom = l1.dx * l2.dy - l1.dy * l2.dx
  if (Math.abs(denom) < eps) return null // 平行或共线
  const ox = l2.x - l1.x
  const oy = l2.y - l1.y
  const t2 = (ox * l1.dy - oy * l1.dx) / denom
  const t1 = (ox * l2.dy - oy * l2.dx) / denom
  return {
    t1,
    t2,
    x: l1.x + t1 * l1.dx,
    y: l1.y + t1 * l1.dy
  }
}

/** 直线上参数 t 处的点 */
export function pointAt(line, t) {
  return { x: line.x + t * line.dx, y: line.y + t * line.dy }
}

/**
 * 直线与 AABB 矩形边界的交点（用于把无限直线裁剪进 bounds）。
 * @param {{x,y,dx,dy}} line 方向需单位化（否则 t 不是 mm，但仍可用）
 * @param {{x,y,w,h}} rect
 * @returns {number[]} 参数 t 升序数组（0、1 或 2 个）
 */
export function lineRectIntersect(line, rect, eps = EPS) {
  const ts = []
  const edges = [
    // 左/右边：竖直 x = const
    { x: rect.x, y: rect.y, dx: 0, dy: 1 }, // 左
    { x: rect.x + rect.w, y: rect.y, dx: 0, dy: 1 }, // 右
    { x: rect.x, y: rect.y, dx: 1, dy: 0 }, // 上
    { x: rect.x, y: rect.y + rect.h, dx: 1, dy: 0 } // 下
  ]
  for (const edge of edges) {
    const hit = lineLineIntersect(line, edge, eps)
    if (!hit) continue
    // 交点必须落在矩形边上
    if (Math.abs(edge.dx) < eps) {
      // 竖直边：y ∈ [rect.y, rect.y+h]
      if (hit.y >= rect.y - eps && hit.y <= rect.y + rect.h + eps) ts.push(hit.t1)
    } else {
      // 水平边：x ∈ [rect.x, rect.x+w]
      if (hit.x >= rect.x - eps && hit.x <= rect.x + rect.w + eps) ts.push(hit.t1)
    }
  }
  // 去重并升序
  const unique = []
  for (const t of ts.sort((a, b) => a - b)) {
    if (unique.length === 0 || Math.abs(t - unique[unique.length - 1]) > eps) unique.push(t)
  }
  return unique
}

/**
 * 线段与 AABB 是否相交（含线段完全在矩形内、矩形在线上、共享端点）。
 * 采用 SAT 投影判定。
 */
export function segmentRectOverlap(x1, y1, x2, y2, rect, eps = EPS) {
  const rx = rect.x
  const ry = rect.y
  const rw = rect.w
  const rh = rect.h
  // 矩形退化
  if (rw <= 0 || rh <= 0) return false
  // 线段方向与法向投影
  const dx = x2 - x1
  const dy = y2 - y1
  // 先检查线段包围盒与矩形是否分离
  const sxMin = Math.min(x1, x2)
  const sxMax = Math.max(x1, x2)
  const syMin = Math.min(y1, y2)
  const syMax = Math.max(y1, y2)
  if (sxMax < rx - eps || sxMin > rx + rw + eps || syMax < ry - eps || syMin > ry + rh + eps) {
    return false
  }
  // 线段方向作为分离轴：把矩形四角投影到 (dx,dy) 上
  if (Math.abs(dx) > eps || Math.abs(dy) > eps) {
    const len = Math.hypot(dx, dy)
    const ux = dx / len
    const uy = dy / len
    // 线段端点在轴上的范围
    const p1 = x1 * ux + y1 * uy
    const p2 = x2 * ux + y2 * uy
    let lo = Math.min(p1, p2)
    let hi = Math.max(p1, p2)
    const corners = [
      rx * ux + ry * uy,
      (rx + rw) * ux + ry * uy,
      rx * ux + (ry + rh) * uy,
      (rx + rw) * ux + (ry + rh) * uy
    ]
    const rLo = Math.min(...corners)
    const rHi = Math.max(...corners)
    if (hi < rLo - eps || lo > rHi + eps) return false
  }
  return true
}
