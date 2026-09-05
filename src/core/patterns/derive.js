/**
 * 求交派生线段（core/patterns/derive.js）——V2 §4
 *
 * 输入：patterns[]（线族参数，纯数据）
 * 输出：segments[]，每条 = 相邻切点（与其他线族的交点 ∪ bounds 边界）之间的一段木条。
 *
 * 核心步骤（对每条线族直线 L）：
 *  1. 求 L 与其所有平行线族不相交 —— 只与其他「非平行线族」的每条线求交；
 *  2. 求 L 与自身 bounds 的交点 t 区间（若无 bounds 则仅靠交点切分，见下）；
 *  3. 所有切点 t 排序去重 → 相邻两切点构成一段 segment（长度 = Δt，方向已单位化）。
 *
 * 防御说明：若 pattern.bounds 缺失，L 不裁剪边界；此时若切点不足 2 个（孤线/仅单侧有交），
 * 无法构成有限线段，该线不产生 segment。
 */

import {
  isParallelDeg,
  lineLineIntersect,
  lineRectIntersect,
  pointAt
} from '../geometry/index.js'
import { familyLines } from './family.js'

const T_EPS = 1e-6 // t 去重阈值（mm 级，方向已单位化）

/** 判断两条线族直线是否平行（同族或角度差为 0/180） */
function linesParallelDeg(aDeg, bDeg) {
  return isParallelDeg(aDeg, bDeg, 1e-9)
}

/**
 * 派生线段。
 * @param {Array} patterns
 * @returns {Array<{id,x1,y1,x2,y2,length,width,patternId,lineIndex}>}
 */
export function deriveSegments(patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) return []
  // 预展开全部直线（带角度，用于平行判定）
  const expanded = []
  for (const p of patterns) {
    if (!p || p.kind !== 'family') continue
    for (const line of familyLines(p)) {
      expanded.push({ ...line, angle: p.angle, width: p.width, bounds: p.bounds })
    }
  }
  const segments = []
  for (let i = 0; i < expanded.length; i++) {
    const L = expanded[i]
    // 收集切点 t
    const ts = []
    for (let j = 0; j < expanded.length; j++) {
      if (j === i) continue
      const M = expanded[j]
      if (linesParallelDeg(L.angle, M.angle)) continue
      const hit = lineLineIntersect(L, M)
      if (hit) ts.push(hit.t1)
    }
    // bounds 裁剪：得到 L 在矩形内的 t 区间端点
    let tLo = null
    let tHi = null
    if (L.bounds && L.bounds.w > 0 && L.bounds.h > 0) {
      const rectTs = lineRectIntersect(L, L.bounds)
      if (rectTs.length === 2) {
        ;[tLo, tHi] = rectTs
      } else if (rectTs.length === 1) {
        // 相切等退化：单点不构成区间
        continue
      } else {
        continue // 直线与 bounds 不相交 → 该线在画布内无线段
      }
    }
    // 过滤并加入区间端点
    const cuts = []
    if (tLo !== null) cuts.push(tLo)
    for (const t of ts) {
      if (tLo === null || (t > tLo - T_EPS && t < tHi + T_EPS)) cuts.push(t)
    }
    if (tHi !== null) cuts.push(tHi)
    if (cuts.length < 2) continue
    // 排序去重
    cuts.sort((a, b) => a - b)
    const uniq = []
    for (const t of cuts) {
      if (uniq.length === 0 || Math.abs(t - uniq[uniq.length - 1]) > T_EPS) uniq.push(t)
    }
    // 相邻切点成段
    for (let k = 0; k < uniq.length - 1; k++) {
      const t1 = uniq[k]
      const t2 = uniq[k + 1]
      const len = t2 - t1
      if (len < T_EPS) continue
      const p1 = pointAt(L, t1)
      const p2 = pointAt(L, t2)
      segments.push({
        id: `${L.patternId}:${L.lineIndex}:${k}`,
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        length: len,
        width: L.width,
        patternId: L.patternId,
        lineIndex: L.lineIndex
      })
    }
  }
  return segments
}

/** 全体线段最小包围盒（用于导出/适配视图）；空数组返回 null */
export function segmentsBounds(segments) {
  if (!segments.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const s of segments) {
    minX = Math.min(minX, s.x1, s.x2)
    minY = Math.min(minY, s.y1, s.y2)
    maxX = Math.max(maxX, s.x1, s.x2)
    maxY = Math.max(maxY, s.y1, s.y2)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/** 求若干 bounds 的并集包围盒；空返回 null */
export function patternsBounds(patterns) {
  const boxes = (patterns || [])
    .filter((p) => p && p.bounds && p.bounds.w > 0 && p.bounds.h > 0)
    .map((p) => p.bounds)
  if (!boxes.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const b of boxes) {
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.w)
    maxY = Math.max(maxY, b.y + b.h)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}
