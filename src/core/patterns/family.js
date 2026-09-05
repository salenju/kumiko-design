/**
 * 平行线族（core/patterns/family.js）
 * 数据模型（V2 §3.2）：
 *   { id, kind:'family', ref:{x,y}, angle(deg), spacing(mm), count, width(mm), bounds:{x,y,w,h} }
 * 约定（与 geometry/angle.js 一致）：
 *   - 直线沿 angle 方向；ref 是「第 0 条线」上的一点；第 i 条线沿法向偏移 i·spacing。
 *   - bounds 为矩形绘制范围（mm），派生时按此裁剪。
 * 生成器 helper：coverFamily() 让线族正好覆盖给定 bounds。
 */

import { deg2dir, deg2normal } from '../geometry/index.js'

/** 线族方向单位向量 */
export function familyDir(pattern) {
  return deg2dir(pattern.angle)
}

/** 线族法向单位向量（垂直于线方向） */
export function familyNormal(pattern) {
  return deg2normal(pattern.angle)
}

/**
 * 第 index 条线的锚点（该线上的一个点）。
 * 锚点 = ref + index·spacing·n
 */
export function lineAnchor(pattern, index) {
  const { nx, ny } = familyNormal(pattern)
  return {
    x: pattern.ref.x + index * pattern.spacing * nx,
    y: pattern.ref.y + index * pattern.spacing * ny
  }
}

/**
 * 线族展开为无限直线数组。
 * @returns {{x,y,dx,dy,patternId,lineIndex}[]}
 */
export function familyLines(pattern) {
  const { dx, dy } = familyDir(pattern)
  const lines = []
  for (let i = 0; i < pattern.count; i++) {
    const a = lineAnchor(pattern, i)
    lines.push({ x: a.x, y: a.y, dx, dy, patternId: pattern.id, lineIndex: i })
  }
  return lines
}

/**
 * 计算能覆盖给定 bounds 的线族参数（ref 落于边界线上，count 恰好覆盖）。
 * 用于预设纹样生成器与「放置到画布」交互。
 * @param {number} angle 度
 * @param {number} spacing mm
 * @param {{x,y,w,h}} bounds
 * @returns {{ref:{x,y}, count:number}}
 */
export function coverFamily(angle, spacing, bounds, eps = 1e-9) {
  const { nx, ny } = deg2normal(angle)
  const corners = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.w, y: bounds.y },
    { x: bounds.x, y: bounds.y + bounds.h },
    { x: bounds.x + bounds.w, y: bounds.y + bounds.h }
  ]
  // 角点沿法向的投影范围
  const proj = corners.map((c) => c.x * nx + c.y * ny)
  let minP = Math.min(...proj)
  const maxP = Math.max(...proj)
  if (spacing <= eps) spacing = 1 // 防御
  // 让第 0 条线落在 minP 处，从 minP 覆盖到 maxP
  const span = maxP - minP
  const count = Math.floor(span / spacing) + 2 // +2 保证越界余量
  // ref 满足 ref·n = minP（n 是单位向量，直接沿法向平移修正）
  const c = corners[0]
  const refProj = c.x * nx + c.y * ny
  const ref = { x: c.x + (minP - refProj) * nx, y: c.y + (minP - refProj) * ny }
  return { ref, count }
}
