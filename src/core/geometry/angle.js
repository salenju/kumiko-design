/**
 * 角度工具（core/geometry/angle.js）
 * 约定：
 *  - 画布坐标系 y 轴向下（SVG 惯例）。
 *  - 角度单位为「度」，0° = 水平向右；方向向量统一由 deg2dir 生成：
 *      d = (cos a, sin a)
 *    在 y-down 坐标系下，正角度视觉上为顺时针（与木工直觉一致：90°=竖直向下）。
 *  - 直线是无向的：角度 a 与 a+180 等价（isParallelDeg 按模 180 判断）。
 */

/** 度 → 弧度 */
export function deg2rad(deg) {
  return (deg * Math.PI) / 180
}

/** 弧度 → 度 */
export function rad2deg(rad) {
  return (rad * 180) / Math.PI
}

/** 归一化到 [0, 360) */
export function normalizeDeg(deg) {
  const m = deg % 360
  return m < 0 ? m + 360 : m
}

/** 归一化直线角度到 [0, 180)（无向直线 a 与 a+180 等价） */
export function normalizeLineDeg(deg) {
  const m = normalizeDeg(deg)
  return m >= 180 ? m - 180 : m
}

/**
 * 度 → 单位方向向量 {dx, dy}（y-down 画布）。
 * 例：angle=0 → (1,0) 水平向右；angle=90 → (0,1) 竖直向下。
 */
export function deg2dir(deg) {
  const r = deg2rad(deg)
  return { dx: Math.cos(r), dy: Math.sin(r) }
}

/**
 * 判断两个「直线角度」是否平行（含 0/180 同向情形）。
 * @param {number} aDeg
 * @param {number} bDeg
 * @param {number} [epsDeg=1e-6]
 */
export function isParallelDeg(aDeg, bDeg, epsDeg = 1e-6) {
  const diff = Math.abs(normalizeLineDeg(aDeg) - normalizeLineDeg(bDeg))
  return diff < epsDeg || Math.abs(diff - 180) < epsDeg
}

/** 直线角度 → 法向单位向量（逆时针旋转 90°：n = (-dy, dx)） */
export function deg2normal(deg) {
  const { dx, dy } = deg2dir(deg)
  return { nx: -dy, ny: dx }
}

/** 由两点计算直线角度（y-down，范围 [0,180)）；两点重合返回 null */
export function angleOfSegment(x1, y1, x2, y2, eps = 1e-9) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy)
  if (len < eps) return null
  const deg = rad2deg(Math.atan2(dy, dx))
  return normalizeLineDeg(deg)
}
