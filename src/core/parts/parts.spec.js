import { describe, it, expect } from 'vitest'
import {
  analyzeParts,
  expandBars,
  gapToUnitX,
  notchesToDigits,
  canonicalCode
} from './parts.js'

/** 水平线族：angle0，法向(0,1)；ref.y 决定 line0，lines 沿 +y 每 spacing 一条 */
function hFamily({ id = 'H', y0 = 10, spacing = 10, count = 3, bounds = { x: 0, y: 0, w: 40, h: 40 }, width = 2 } = {}) {
  return { kind: 'family', id, angle: 0, ref: { x: 0, y: y0 }, spacing, count, width, bounds }
}
/** 竖直线族：angle90，法向(-1,0)；lines 沿 -x 每 spacing 一条（x = ref.x - i·spacing） */
function vFamily({ id = 'V', x0 = 30, spacing = 10, count = 3, bounds = { x: 0, y: 0, w: 40, h: 40 }, width = 2 } = {}) {
  return { kind: 'family', id, angle: 90, ref: { x: x0, y: 0 }, spacing, count, width, bounds }
}
/** 单线 */
function line(id, x1, y1, x2, y2, width = 3) {
  return { kind: 'line', id, x1, y1, x2, y2, width }
}

describe('core/parts 间距码换算', () => {
  it('gapToUnitX：mm ÷ 单位 四舍五入取整，最小 1', () => {
    expect(gapToUnitX(10, 10)).toBe(1)
    expect(gapToUnitX(20, 10)).toBe(2)
    expect(gapToUnitX(17.3, 10)).toBe(2)
    expect(gapToUnitX(13.9, 10)).toBe(1)
    expect(gapToUnitX(0.4, 10)).toBe(1) // 最小 1
    expect(gapToUnitX(20, 0)).toBe(1) // 单位非法兜底
    expect(gapToUnitX(-3, 10)).toBe(1)
  })

  it('notchesToDigits / canonicalCode：倒序视为同型（翻转木条同一根）', () => {
    expect(notchesToDigits([10, 20, 30], 10)).toEqual([1, 1])
    expect(notchesToDigits([10, 20, 40], 10)).toEqual([1, 2])
    expect(canonicalCode([1, 2])).toBe('1-2')
    expect(canonicalCode([2, 1])).toBe('1-2') // 倒序归一
    expect(canonicalCode([1, 2, 1])).toBe('1-2-1') // 回文不变
    expect(canonicalCode([])).toBe('')
  })
})

describe('core/parts 部件统计与分组', () => {
  it('方格整幅：横3 × 竖3 全部同型（同长同宽同码同插口数）→ 归为 1 组 6 根', () => {
    const patterns = [hFamily(), vFamily()]
    const bars = expandBars(patterns)
    expect(bars.length).toBe(6) // 3 横 + 3 竖
    const groups = analyzeParts(patterns, 10)
    expect(groups).toHaveLength(1)
    const g = groups[0]
    expect(g.length).toBe(40) // bounds 跨度端到端
    expect(g.width).toBe(2)
    expect(g.code).toBe('1-1') // 相邻插口 10mm → 1x
    expect(g.notchCount).toBe(3)
    expect(g.pieces).toBe(6)
  })

  it('间距 20mm（单位 10 → 2x）时 code 为 2-2', () => {
    const patterns = [
      hFamily({ spacing: 20, y0: 20, bounds: { x: 0, y: 0, w: 80, h: 80 } }),
      vFamily({ spacing: 20, x0: 60, bounds: { x: 0, y: 0, w: 80, h: 80 } })
    ]
    // 横线 y=20/40/60，竖线 x=60/40/20 → 插口间距 20mm
    const groups = analyzeParts(patterns, 10)
    expect(groups).toHaveLength(1)
    expect(groups[0].code).toBe('2-2')
    expect(groups[0].notchCount).toBe(3)
    expect(groups[0].pieces).toBe(6)
  })

  it('单线也参与：两条交叉单线各得 1 个插口（不区分线族/单线）', () => {
    const patterns = [line('s1', 0, 0, 100, 0, 3), line('s2', 50, -50, 50, 50, 4)]
    const groups = analyzeParts(patterns, 10)
    expect(groups).toHaveLength(2) // 宽度不同 → 两组
    for (const g of groups) {
      expect(g.length).toBe(100)
      expect(g.notchCount).toBe(1) // 单插口 → 无数码
      expect(g.code).toBe('')
      expect(g.pieces).toBe(1)
    }
    const w = groups.map((g) => g.width).sort((a, b) => a - b)
    expect(w).toEqual([3, 4])
  })

  it('翻转同型：间距 [1,2] 与 [2,1] 的两根同尺寸木条合并为一组', () => {
    // bar A(y=0) 被 v(20/30/50) 交叉 → 间距 10,20 → 1-2
    // bar B(y=30，镜像) 被 v'(50/70/80) 交叉 → 间距 20,10 → 倒序 → 同为 1-2
    const patterns = [
      line('a', 0, 0, 100, 0, 2),
      line('b', 0, 30, 100, 30, 2),
      // 只与 y=0 相交（y ∈ -5..15）
      line('v1', 20, -5, 20, 15, 2),
      line('v2', 30, -5, 30, 15, 2),
      line('v3', 50, -5, 50, 15, 2),
      // 只与 y=30 相交（y ∈ 25..45）
      line('v4', 50, 25, 50, 45, 2),
      line('v5', 70, 25, 70, 45, 2),
      line('v6', 80, 25, 80, 45, 2)
    ]
    const groups = analyzeParts(patterns, 10)
    const g = groups.find((x) => x.length === 100 && x.width === 2 && x.notchCount === 3)
    expect(g).toBeTruthy()
    expect(g.code).toBe('1-2')
    expect(g.pieces).toBe(2) // a 与 b（镜像）合并
  })

  it('平行线不产生插口；无交叉的单线为 0 插口组', () => {
    const patterns = [
      hFamily(), // 3 根横线互相平行
      line('iso', 200, 200, 300, 200, 2) // 孤线
    ]
    const groups = analyzeParts(patterns, 10)
    // 3 根横线同尺寸无插口 → 1 组 3 根；孤线 1 组 1 根
    expect(groups).toHaveLength(2)
    expect(groups.find((g) => g.pieces === 3 && g.notchCount === 0)).toBeTruthy()
    expect(groups.find((g) => g.pieces === 1 && g.notchCount === 0 && g.code === '')).toBeTruthy()
  })

  it('总根数 = 全部展开部件数', () => {
    const patterns = [
      hFamily({ y0: 20, count: 4, bounds: { x: 0, y: 0, w: 60, h: 60 } }),
      vFamily({ x0: 40, count: 4, bounds: { x: 0, y: 0, w: 60, h: 60 } })
    ]
    const groups = analyzeParts(patterns, 10)
    const total = groups.reduce((s, g) => s + g.pieces, 0)
    expect(total).toBe(expandBars(patterns).length)
  })

  it('交叉点戳在端头（bounds 边界）不算插口', () => {
    // 横线在 y=0 与竖线在 x=0 相交于矩形角点 → 不构成实体内部交叉
    const p1 = hFamily({ y0: 0, count: 1, bounds: { x: 0, y: 0, w: 40, h: 40 } })
    const p2 = vFamily({ x0: 0, count: 1, bounds: { x: 0, y: 0, w: 40, h: 40 } })
    const patterns = [p1, p2]
    const groups = analyzeParts(patterns, 10)
    for (const g of groups) expect(g.notchCount).toBe(0)
  })
})
