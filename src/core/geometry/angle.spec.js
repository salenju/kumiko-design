import { describe, it, expect } from 'vitest'
import {
  deg2rad,
  rad2deg,
  normalizeDeg,
  normalizeLineDeg,
  deg2dir,
  isParallelDeg,
  deg2normal,
  angleOfSegment
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
})
