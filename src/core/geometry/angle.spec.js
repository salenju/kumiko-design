import { describe, it, expect } from 'vitest'
import {
  deg2rad,
  rad2deg,
  normalizeDeg,
  normalizeLineDeg,
  deg2dir,
  isParallelDeg,
  deg2normal,
  angleOfSegment,
  angleDegOfVector,
  endFromPolar
} from '../geometry/angle.js'

describe('angle 角度工具（y-down 画布约定）', () => {
  it('度弧互换', () => {
    expect(rad2deg(deg2rad(180))).toBeCloseTo(180, 10)
    expect(deg2rad(90)).toBeCloseTo(Math.PI / 2, 10)
  })

  it('normalizeDeg 归一化到 [0,360)', () => {
    expect(normalizeDeg(-90)).toBe(270)
    expect(normalizeDeg(450)).toBe(90)
    expect(normalizeDeg(0)).toBe(0)
  })

  it('normalizeLineDeg 直线无向 [0,180)', () => {
    expect(normalizeLineDeg(200)).toBe(20)
    expect(normalizeLineDeg(-30)).toBe(150)
    expect(normalizeLineDeg(90)).toBe(90)
  })

  it('deg2dir：0°水平向右、90°竖直向下（y-down）', () => {
    const d0 = deg2dir(0)
    expect(d0.dx).toBeCloseTo(1)
    expect(d0.dy).toBeCloseTo(0)
    const d90 = deg2dir(90)
    expect(d90.dx).toBeCloseTo(0)
    expect(d90.dy).toBeCloseTo(1)
  })

  it('isParallelDeg：0 与 180 平行、90 与 90 平行、90 与 0 垂直', () => {
    expect(isParallelDeg(0, 180)).toBe(true)
    expect(isParallelDeg(90, 90)).toBe(true)
    expect(isParallelDeg(30, 210)).toBe(true)
    expect(isParallelDeg(0, 90)).toBe(false)
    expect(isParallelDeg(10, 10.0001)).toBe(false) // 超过 eps=1e-6
  })

  it('deg2normal 与线方向垂直（点积≈0）', () => {
    for (const a of [0, 30, 60, 90, 120, 45]) {
      const d = deg2dir(a)
      const n = deg2normal(a)
      expect(d.dx * n.nx + d.dy * n.ny).toBeCloseTo(0, 10)
      expect(Math.hypot(n.nx, n.ny)).toBeCloseTo(1, 10)
    }
  })

  it('angleOfSegment：水平/竖直/45°', () => {
    expect(angleOfSegment(0, 0, 10, 0)).toBeCloseTo(0, 9)
    expect(angleOfSegment(0, 0, 0, 10)).toBeCloseTo(90, 9)
    expect(angleOfSegment(0, 0, 10, 10)).toBeCloseTo(45, 9)
    // 反向线段仍是同一条直线
    expect(angleOfSegment(10, 0, 0, 0)).toBeCloseTo(0, 9)
    // 退化
    expect(angleOfSegment(1, 1, 1, 1)).toBeNull()
  })

  it('angleDegOfVector：有向向量角（y-down：0°右、90°下），范围 [0,360)', () => {
    expect(angleDegOfVector(10, 0)).toBeCloseTo(0, 9)
    expect(angleDegOfVector(0, 10)).toBeCloseTo(90, 9) // y-down 竖直向下
    expect(angleDegOfVector(-10, 0)).toBeCloseTo(180, 9)
    expect(angleDegOfVector(0, -10)).toBeCloseTo(270, 9)
    expect(angleDegOfVector(0, 0)).toBe(0) // 零向量
  })

  it('endFromPolar：起点不动，按长度+角度求终点，往返一致', () => {
    // 0° 水平向右
    const e0 = endFromPolar(10, 20, 100, 0)
    expect(e0).toEqual({ x2: 110, y2: 20 })
    // 90° y-down 竖直向下
    const e90 = endFromPolar(10, 20, 100, 90)
    expect(e90.x2).toBeCloseTo(10, 9)
    expect(e90.y2).toBeCloseTo(120, 9)
    // 45°
    const e45 = endFromPolar(0, 0, 50, 45)
    expect(e45.x2).toBeCloseTo(50 * Math.SQRT1_2, 9)
    expect(e45.y2).toBeCloseTo(50 * Math.SQRT1_2, 9)
    // 往返：长度与角度还原
    const s = endFromPolar(3, 7, 80, 123.4)
    const len = Math.hypot(s.x2 - 3, s.y2 - 7)
    const ang = angleDegOfVector(s.x2 - 3, s.y2 - 7)
    expect(len).toBeCloseTo(80, 9)
    expect(ang).toBeCloseTo(123.4, 9)
  })
})
