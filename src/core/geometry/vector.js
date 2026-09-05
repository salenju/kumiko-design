/**
 * 向量/点运算（core/geometry/vector.js）
 * 全部纯函数，坐标单位 mm。
 * 无限直线统一表示为 { x, y, dx, dy }：过点 (x,y)，方向向量 (dx,dy)（建议单位化，
 * 单位化后直线参数 t 即 mm 距离，供 derive 使用）。
 */

export const EPS = 1e-9

/** 两点间距离（勾股定理） */
export function length(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1)
}

/** 叉积（2D，返回标量 z 分量） */
export function cross(ax, ay, bx, by) {
  return ax * by - ay * bx
}

/** 点积 */
export function dot(ax, ay, bx, by) {
  return ax * bx + ay * by
}

/**
 * 点到无限直线的垂直距离。
 * @param {number} px,py 点
 * @param {{x,y,dx,dy}} line 直线（方向不要求单位化）
 */
export function distPointLine(px, py, line) {
  const { x, y, dx, dy } = line
  const len = Math.hypot(dx, dy)
  if (len < EPS) return Number.POSITIVE_INFINITY
  return Math.abs(cross(dx, dy, px - x, py - y)) / len
}

/**
 * 点到线段的距离。
 * @param {number} px,py 点
 * @param {number} x1,y1,x2,y2 线段端点
 */
export function distPointSegment(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1
  const vy = y2 - y1
  const wx = px - x1
  const wy = py - y1
  const c1 = dot(wx, wy, vx, vy)
  if (c1 <= 0) return length(px, py, x1, y1)
  const c2 = dot(vx, vy, vx, vy)
  if (c2 <= c1) return length(px, py, x2, y2)
  const b = c1 / c2
  const bx = x1 + b * vx
  const by = y1 + b * vy
  return length(px, py, bx, by)
}

/** 平行线间距：lineB 上取一点到 lineA 的距离 */
export function parallelLineDistance(lineA, lineB) {
  return distPointLine(lineB.x, lineB.y, lineA)
}
