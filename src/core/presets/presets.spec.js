import { describe, it, expect } from 'vitest'
import { asanoha, koushi, diagonal, PRESETS, generatePatterns } from './index.js'
import { deriveSegments } from '../patterns/derive.js'

describe('presets 参数化纹样', () => {
  it('asanoha 麻叶：三族 60° 夹角，bounds 居中于 (cx,cy)', () => {
    const patterns = asanoha({ cx: 10, cy: 20, size: 200, spacing: 20, width: 3 })
    expect(patterns.length).toBe(3)
    const angles = patterns.map((p) => p.angle).sort((a, b) => a - b)
    expect(angles).toEqual([0, 60, 120])
    for (const p of patterns) {
      expect(p.width).toBe(3)
      expect(p.bounds.x).toBeCloseTo(10 - 100, 6)
      expect(p.bounds.y).toBeCloseTo(20 - 100, 6)
      expect(p.bounds.w).toBeCloseTo(200, 6)
      expect(p.count).toBeGreaterThan(2)
    }
    // 生成后能派生大量正三角单元
    const segs = deriveSegments(patterns)
    expect(segs.length).toBeGreaterThan(30)
    for (const s of segs) {
      expect(s.length).toBeGreaterThan(1e-6)
    }
  })

  it('koushi 方格：两族正交，段长模式为方格', () => {
    const patterns = koushi({ size: 100, spacing: 25, width: 2 })
    expect(patterns.length).toBe(2)
    expect(patterns[0].angle).toBe(0)
    expect(patterns[1].angle).toBe(90)
    const segs = deriveSegments(patterns)
    // 水平族段长应为 25 的倍数（25 或 50…被竖线切）
    const hSegs = segs.filter((s) => s.patternId.startsWith('ko-0'))
    for (const s of hSegs) {
      expect(Math.abs(s.length - 25) < 1e-6 || Math.abs(s.length - 50) < 1e-6).toBe(true)
    }
  })

  it('diagonal 斜格：45°/135° 两族', () => {
    const patterns = diagonal({ size: 80, spacing: 20, width: 2 })
    expect(patterns.map((p) => p.angle)).toEqual([45, 135])
  })

  it('PRESETS 注册表与 generatePatterns 分发', () => {
    expect(Object.keys(PRESETS)).toEqual(['asanoha', 'koushi', 'diagonal'])
    expect(generatePatterns('asanoha', { size: 50, spacing: 10 }).length).toBe(3)
    expect(generatePatterns('unknown', {})).toEqual([])
    expect(generatePatterns('koushi', { size: 50, spacing: 10 })[0].kind).toBe('family')
  })
})
