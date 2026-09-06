import { describe, it, expect } from 'vitest'
import {
  defaultColorScheme,
  normalizeScheme,
  normalizeDirDeg,
  angleKey,
  colorForAngle,
  colorForSeg,
  segmentDirDeg
} from './colors.js'

describe('core/colors 角度配色', () => {
  it('方向角归一化到 [0,180)：180/360/-90 归并同向', () => {
    expect(normalizeDirDeg(0)).toBe(0)
    expect(normalizeDirDeg(180)).toBe(0)
    expect(normalizeDirDeg(360)).toBe(0)
    expect(normalizeDirDeg(90)).toBe(90)
    expect(normalizeDirDeg(-90)).toBe(90)
    expect(normalizeDirDeg(270)).toBe(90)
    expect(normalizeDirDeg(45)).toBe(45)
  })

  it('angleKey：0.1° 精度键', () => {
    expect(angleKey(45.0001)).toBe(45)
    expect(angleKey(22.55)).toBe(22.6)
  })

  it('默认方案：覆盖组子常用角度、含 fallback 与高亮色', () => {
    const d = defaultColorScheme()
    const angles = d.angles.map((e) => e.angle)
    for (const a of [0, 30, 45, 60, 90, 120, 135, 150]) expect(angles).toContain(a)
    expect(d.fallback).toMatch(/^#/)
    expect(d.hoverColor).toBe('#d64541')
    expect(d.selectedColor).toBe('#1f4e9c')
    // 归一化后按角度升序且无重复
    const norm = normalizeScheme(d)
    expect(norm.angles).toEqual(d.angles)
  })

  it('normalizeScheme：缺 hover/selected 时补默认，非法回落默认', () => {
    const s = normalizeScheme({ fallback: '#123456', angles: [{ angle: 45, color: '#abcdef' }] })
    expect(s.hoverColor).toBe('#d64541')
    expect(s.selectedColor).toBe('#1f4e9c')
    const bad = normalizeScheme({ hoverColor: 3, selectedColor: '', angles: [] })
    expect(bad.hoverColor).toBe('#d64541')
    expect(bad.selectedColor).toBe('#1f4e9c')
  })

  it('colorForAngle：命中取色、未命中 fallback；0° 与 180° 同色', () => {
    const s = normalizeScheme({ fallback: '#111111', angles: [{ angle: 0, color: '#ff0000' }, { angle: 45, color: '#00ff00' }] })
    expect(colorForAngle(s, 0)).toBe('#ff0000')
    expect(colorForAngle(s, 180)).toBe('#ff0000')
    expect(colorForAngle(s, 45)).toBe('#00ff00')
    expect(colorForAngle(s, 30)).toBe('#111111')
  })

  it('normalizeScheme：非法条目被清理、按角度升序去重（角度周期归一）', () => {
    const s = normalizeScheme({
      fallback: 123,
      angles: [
        { angle: 90, color: '#000001' },
        { angle: -999, color: '#000002' }, // 归一化后 = 81°
        { angle: 90, color: '#000003' }, // 与第一条同角（0.1°）→ 后者覆盖
        { angle: 0, color: '' },
        { angle: 45, color: '#aabbcc' },
        { angle: 'bad', color: '#deadbeef' }
      ]
    })
    expect(s.fallback).toBe('#222222') // 非法 fallback → 默认
    expect(s.angles).toEqual([
      { angle: 45, color: '#aabbcc' },
      { angle: 81, color: '#000002' },
      { angle: 90, color: '#000003' }
    ])
  })

  it('colorForSeg：按线段方向取色（水平/竖直线段）', () => {
    const s = defaultColorScheme()
    const h = { x1: 0, y1: 5, x2: 100, y2: 5 }
    const v = { x1: 40, y1: 0, x2: 40, y2: 80 }
    expect(segmentDirDeg(h)).toBeCloseTo(0, 6)
    expect(colorForSeg(s, h)).toBe(colorForAngle(s, 0))
    expect(colorForSeg(s, v)).toBe(colorForAngle(s, 90))
  })
})
