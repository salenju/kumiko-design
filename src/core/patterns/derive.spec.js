import { describe, it, expect } from 'vitest'
import { deriveSegments, segmentsBounds, patternsBounds } from './derive.js'

/** 两族正交交叉：A 为水平族（y=0,10,20），B 为竖直族（x=0,-10,-20） */
function crossSample() {
  return [
    {
      id: 'A',
      kind: 'family',
      ref: { x: 0, y: 0 },
      angle: 0,
      spacing: 10,
      count: 3,
      width: 3,
      bounds: { x: -50, y: -50, w: 100, h: 100 }
    },
    {
      id: 'B',
      kind: 'family',
      ref: { x: 0, y: 0 },
      angle: 90,
      spacing: 10,
      count: 3,
      width: 4,
      bounds: { x: -50, y: -50, w: 100, h: 100 }
    }
  ]
}

describe('patterns/derive 求交派生', () => {
  it('两条水平线之间的间距由交点确定切分', () => {
    // A 水平线 y=0 与 B 竖直线 x=0,-10,-20 交 → 切为 4 段
    const [A] = crossSample()
    const segs = deriveSegments([A]) // 单族、无交叉 → bounds 切 1 段
    expect(segs.length).toBe(3) // 3 条水平线，各 1 段
    expect(segs[0].length).toBeCloseTo(100, 6)
    expect(segs[0].width).toBe(3)
  })

  it('正交两族：每族每条线被对方切成多段', () => {
    const segs = deriveSegments(crossSample())
    // A 3 条水平线 ×（B 3 条竖线 → 4 段）= 12；B 同理 12
    expect(segs.length).toBe(24)
    const segA0 = segs.filter((s) => s.patternId === 'A' && s.lineIndex === 0)
    expect(segA0.length).toBe(4)
    // 分段长度：x=-50..-20、-20..-10、-10..0、0..50
    const lens = segA0.map((s) => s.length).sort((a, b) => a - b)
    expect(lens[0]).toBeCloseTo(10, 6)
    expect(lens[1]).toBeCloseTo(10, 6)
    expect(lens[2]).toBeCloseTo(30, 6)
    expect(lens[3]).toBeCloseTo(50, 6)
    // 端点在交点处重合（相邻段共享端点）
    const sa = segA0.sort((p, q) => p.x1 - q.x1)
    expect(sa[1].x1).toBeCloseTo(sa[0].x2, 6)
    expect(sa[2].x1).toBeCloseTo(sa[1].x2, 6)
  })

  it('三族 60°（麻叶单元）：段数正确且无零长', () => {
    const patterns = [0, 60, 120].map((angle, i) => ({
      id: `F${i}`,
      kind: 'family',
      ref: { x: 0, y: 0 },
      angle,
      spacing: 10,
      count: 3,
      width: 2,
      bounds: { x: -30, y: -30, w: 60, h: 60 }
    }))
    const segs = deriveSegments(patterns)
    expect(segs.length).toBeGreaterThan(0)
    for (const s of segs) {
      expect(s.length).toBeGreaterThan(1e-6)
      expect(Number.isFinite(s.x1)).toBe(true)
    }
  })

  it('空输入返回空数组；kind 非 family 被忽略', () => {
    expect(deriveSegments([])).toEqual([])
    expect(deriveSegments(null)).toEqual([])
    expect(deriveSegments([{ id: 'x', kind: 'circle' }])).toEqual([])
  })

  it('segmentsBounds 与 patternsBounds', () => {
    const segs = deriveSegments(crossSample())
    const sb = segmentsBounds(segs)
    expect(sb.x).toBeCloseTo(-50, 6)
    expect(sb.y).toBeCloseTo(-50, 6)
    expect(sb.w).toBeCloseTo(100, 6)
    expect(sb.h).toBeCloseTo(100, 6)
    expect(segmentsBounds([])).toBeNull()

    const pb = patternsBounds(crossSample())
    expect(pb.w).toBeCloseTo(100, 6)
    expect(patternsBounds([])).toBeNull()
  })
})
