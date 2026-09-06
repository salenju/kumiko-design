/**
 * 图案部件统计（core/parts/parts.js）
 *
 * 面向组子正式施工前的「同型部件计数与标注」：
 *  - 部件 = 一整根木条：线族中每一根直线（在自身 bounds 内的整根），
 *          以及画出的每一根「单线」（kind:'line'）—— 都按整根参与统计；
 *  - 插口 = 该木条与其它【非平行】木条（不区分线族/单线，任意角度）相交，
 *           且交点落在双方木条实体内部（排除正好戳在端头的退化交点）；
 *  - 相同部件：尺寸（长度/宽度，0.1mm 精度归并）
 *            + 插口间距序列（相邻插口中心距 ÷ 全局单位，四舍五入取整 x）
 *            + 插口数量相同；
 *  - 间距缩写 = 相邻插口间距的整数 x 序列，用 '-' 连接（如 1-2-1），
 *    一根木条翻转后应视为同型 → 分组时取「原序/倒序」中字典序小者。
 */

import { familyLines } from '../patterns/family.js'
import { lineLineIntersect, lineRectIntersect } from '../geometry/index.js'

const EPS = 1e-6 // 端点/重合容差（mm）

/* ---------- 部件展开（含端点裁剪） ---------- */

/** 把单线图案展开为一根部件；长度过短视为无效 */
function barFromSingleLine(p) {
  const dx = p.x2 - p.x1
  const dy = p.y2 - p.y1
  const len = Math.hypot(dx, dy)
  if (len <= EPS) return null
  return {
    patternId: p.id,
    lineIndex: 0,
    x: p.x1,
    y: p.y1,
    dx: dx / len,
    dy: dy / len,
    spanLo: 0,
    spanHi: len,
    length: len,
    width: p.width
  }
}

/** 线族的一条直线裁剪进自身 bounds 得到的一根部件 */
function barFromFamilyLine(line, p) {
  const { w, h } = p.bounds || {}
  if (!(w > 0) || !(h > 0)) return null
  const ts = lineRectIntersect(line, p.bounds)
  if (ts.length !== 2) return null // 与 bounds 无两交点 → 画布内不存在整根
  const [lo, hi] = ts
  return {
    patternId: p.id,
    lineIndex: line.lineIndex,
    x: line.x,
    y: line.y,
    dx: line.dx,
    dy: line.dy,
    spanLo: lo,
    spanHi: hi,
    length: hi - lo,
    width: p.width
  }
}

/** 展开全部部件（family 每根直线 + 每条单线） */
export function expandBars(patterns) {
  const bars = []
  if (!Array.isArray(patterns)) return bars
  for (const p of patterns) {
    if (!p) continue
    if (p.kind === 'line') {
      const b = barFromSingleLine(p)
      if (b) bars.push(b)
    } else if (p.kind === 'family') {
      for (const line of familyLines(p)) {
        const b = barFromFamilyLine(line, p)
        if (b) bars.push(b)
      }
    }
  }
  return bars
}

/* ---------- 插口与间距码 ---------- */

/** 相邻插口中心距(mm) → 全局单位整数 x（四舍五入，最小 1） */
export function gapToUnitX(gap, unit) {
  if (!Number.isFinite(gap) || gap <= 0) return 1
  if (!Number.isFinite(unit) || unit <= 0) return 1
  return Math.max(1, Math.round(gap / unit))
}

/** 升序插口位置(mm 参数) → 间距 x 序列 */
export function notchesToDigits(positions, unit) {
  const digits = []
  for (let i = 1; i < positions.length; i++) {
    digits.push(gapToUnitX(positions[i] - positions[i - 1], unit))
  }
  return digits
}

/** 间距 x 序列 → 规范缩写（去方向歧义：取原序与倒序的字典序小者） */
export function canonicalCode(digits) {
  if (!digits || digits.length === 0) return ''
  const a = digits.join('-')
  const b = [...digits].reverse().join('-')
  return a <= b ? a : b
}

/**
 * 统计整根部件并按「相同部件」分组。
 * @param {Array} patterns 图案纯数据（family + line）
 * @param {number} unit 全局间距单位 mm（默认 10）
 * @returns {Array<{length:number,width:number,digits:number[],code:string,notchCount:number,pieces:number}>}
 *   长度/宽度保留 0.1mm 归并；按 长度→宽度→插口数→code 升序。
 */
export function analyzeParts(patterns, unit = 10) {
  const bars = expandBars(patterns)
  // 1) 每根部件求内部插口位置（沿自身方向参数 t，mm）
  const notches = bars.map(() => [])
  for (let i = 0; i < bars.length; i++) {
    for (let j = i + 1; j < bars.length; j++) {
      const A = bars[i]
      const B = bars[j]
      const hit = lineLineIntersect(A, B)
      if (!hit) continue // 平行/共线 → 无插口
      // 交点须落在双方实体内（排除戳在端头的退化点）
      const inA = hit.t1 > A.spanLo + EPS && hit.t1 < A.spanHi - EPS
      const inB = hit.t2 > B.spanLo + EPS && hit.t2 < B.spanHi - EPS
      if (!inA || !inB) continue
      notches[i].push(hit.t1)
      notches[j].push(hit.t2)
    }
  }

  // 2) 每根部件 → 归一化特征
  const groups = new Map()
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]
    const sorted = notches[i].sort((a, c) => a - c)
    const uniq = []
    for (const t of sorted) {
      if (uniq.length === 0 || Math.abs(t - uniq[uniq.length - 1]) > EPS) uniq.push(t)
    }
    const digits = notchesToDigits(uniq, unit)
    const code = canonicalCode(digits)
    const lengthR = Math.round(b.length * 10) / 10 // 0.1mm 归并
    const widthR = Math.round((b.width ?? 0) * 10) / 10
    const key = `${lengthR}|${widthR}|${code}|${uniq.length}`
    const cur = groups.get(key)
    if (cur) cur.pieces += 1
    else groups.set(key, { length: lengthR, width: widthR, digits, code, notchCount: uniq.length, pieces: 1 })
  }
  const list = [...groups.values()]
  list.sort(
    (a, b) =>
      a.length - b.length ||
      a.width - b.width ||
      a.notchCount - b.notchCount ||
      (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)
  )
  return list
}
