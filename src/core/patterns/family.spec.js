import { describe, it, expect } from 'vitest'
import {
  familyDir,
  familyNormal,
  lineAnchor,
  familyLines,
  coverFamily
} from './family.js'

/** 构造一个水平线族测试样本 */
function samplePattern(over = {}) {
  return {
    id: 'A',
    kind: 'family',
    ref: { x: 0, y: 0 },
    angle: 0,
    spacing: 10,
    count: 3,
    width: 3,
    bounds: { x: -50, y: -50, w: 100, h: 100 },
    ...over
  }
}

describe('patterns/family 线族', () => {
  it('familyLines 展开 count 条无限直线，锚点沿法向步进 spacing', () => {
    const p = samplePattern()
    const lines = familyLines(p)
    expect(lines.length).toBe(3)
    // y-down：angle=0 方向 (1,0)，法向 (0,1) → 第 i 条线锚点 y = i*10
    expect(lines[0].y).toBeCloseTo(0, 9)
    expect(lines[1].y).toBeCloseTo(10, 9)
    expect(lines[2].y).toBeCloseTo(20, 9)
    // 每条方向一致
    for (const l of lines) {
      expect(l.dx).toBeCloseTo(1, 9)
      expect(l.dy).toBeCloseTo(0, 9)
      expect(l.patternId).toBe('A')
    }
  })

  it('竖直线族（angle=90）锚点沿 -x 方向步进', () => {
    const p = samplePattern({ angle: 90 })
    const lines = familyLines(p)
    // 法向 = deg2normal(90) = (-1, 0)
    expect(lines[0].x).toBeCloseTo(0, 9)
    expect(lines[1].x).toBeCloseTo(-10, 9)
    expect(lines[2].x).toBeCloseTo(-20, 9)
  })

  it('lineAnchor 与 familyDir/familyNormal 一致', () => {
    const p = samplePattern({ angle: 30, count: 5 })
    const d = familyDir(p)
    const n = familyNormal(p)
    const a = lineAnchor(p, 2)
    // 第 2 条线锚点 = ref + 2*spacing*n
    expect(a.x).toBeCloseTo(p.ref.x + 2 * p.spacing * n.nx, 9)
    expect(a.y).toBeCloseTo(p.ref.y + 2 * p.spacing * n.ny, 9)
    expect(Math.hypot(d.dx, d.dy)).toBeCloseTo(1, 9)
  })

  it('coverFamily 返回的线族恰好覆盖 bounds（水平族）', () => {
    const bounds = { x: 0, y: 0, w: 100, h: 100 }
    const { ref, count } = coverFamily(0, 10, bounds)
    // 水平线族法向 (0,1)：第 0 条线 y = ref.y = 0，最后一条 y = ref.y + (count-1)*10 >= 100
    expect(ref.y).toBeCloseTo(0, 9)
    expect(ref.y + (count - 1) * 10).toBeGreaterThanOrEqual(100)
    expect(count).toBe(Math.floor(100 / 10) + 2)
  })

  it('coverFamily 竖直族也覆盖 bounds', () => {
    const bounds = { x: 0, y: 0, w: 100, h: 100 }
    const { ref, count } = coverFamily(90, 10, bounds)
    // 竖直族法向 (-1,0)：第 0 条线应位于 x 最大端（minP 修正后）
    // 角点沿法向投影 p = -x，min = -100 出现在 x=100 端
    const lastX = ref.x - (count - 1) * 10
    expect(Math.min(ref.x, lastX)).toBeLessThanOrEqual(0)
    expect(Math.max(ref.x, lastX)).toBeGreaterThanOrEqual(100)
  })

  it('coverFamily spacing 防御：非正数时按 1 处理', () => {
    const { count } = coverFamily(0, 0, { x: 0, y: 0, w: 10, h: 10 })
    expect(count).toBeGreaterThan(0)
  })
})
