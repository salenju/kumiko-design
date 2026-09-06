import { describe, it, expect } from 'vitest'
import {
  segAngleDeg,
  segmentsParallel,
  spacingBetween,
  nearestParallelSegment,
  translatePattern,
  moveLineToSpacing,
  patternAnchor,
  nearestForeignEndpoint
} from './spacing.js'

/** 构造水平/竖直/斜线段 */
const h0 = { id: 'h0', x1: 0, y1: 0, x2: 100, y2: 0 }
const h1 = { id: 'h1', x1: 0, y1: 10, x2: 100, y2: 10 } // 与 h0 间距 10
const h2 = { id: 'h2', x1: 0, y1: 30, x2: 100, y2: 30 } // 与 h0 间距 30
const v0 = { id: 'v0', x1: 0, y1: 0, x2: 0, y2: 100 }
const v1 = { id: 'v1', x1: 15, y1: 0, x2: 15, y2: 100 } // 与 v0 间距 15
const d45 = { id: 'd45', x1: 0, y1: 0, x2: 10, y2: 10 }

describe('patterns/spacing 平行线间距', () => {
  it('segAngleDeg：水平 0、竖直 90（y-down）', () => {
    expect(segAngleDeg(h0)).toBeCloseTo(0, 9)
    expect(segAngleDeg(v0)).toBeCloseTo(90, 9)
    expect(segAngleDeg(d45)).toBeCloseTo(45, 9)
    // 反向线仍是同一方向向量角 180→归一 0（平行判定基于无向）
    expect(segmentsParallel({ ...h0, x1: 100, x2: 0 }, h1)).toBe(true)
  })

  it('segmentsParallel：平行 true、垂直 false', () => {
    expect(segmentsParallel(h0, h1)).toBe(true)
    expect(segmentsParallel(v0, v1)).toBe(true)
    expect(segmentsParallel(h0, v0)).toBe(false)
    expect(segmentsParallel(h0, d45)).toBe(false)
  })

  it('spacingBetween：垂直间距取点到直线距离；非平行返回 Infinity', () => {
    expect(spacingBetween(h0, h1)).toBeCloseTo(10, 9)
    expect(spacingBetween(h1, h2)).toBeCloseTo(20, 9)
    expect(spacingBetween(v0, v1)).toBeCloseTo(15, 9)
    expect(spacingBetween(h0, v0)).toBe(Infinity)
  })

  it('nearestParallelSegment：取平行方向最近邻居，忽略自身与非平行', () => {
    const r = nearestParallelSegment(h0, [h0, h1, h2, v0])
    expect(r.other.id).toBe('h1')
    expect(r.distance).toBeCloseTo(10, 9)

    // 无平行邻居
    expect(nearestParallelSegment(d45, [h0, h1, v0])).toBeNull()

    // 空候选
    expect(nearestParallelSegment(h0, [])).toBeNull()
  })

  it('nearestParallelSegment：tolDeg 容差内视为平行（0.5° 差）', () => {
    const slight = { id: 's', x1: 0, y1: 5, x2: 100, y2: 5.5 } // 约 0.286°
    const r = nearestParallelSegment(h0, [h0, slight], { tolDeg: 1 })
    expect(r.other.id).toBe('s')
    const r2 = nearestParallelSegment(h0, [h0, slight], { tolDeg: 0.1 })
    expect(r2).toBeNull()
  })

  it('translatePattern：line 平移两端点；family 平移 ref+bounds', () => {
    const line = { id: 'L', kind: 'line', x1: 0, y1: 0, x2: 100, y2: 50, width: 3 }
    const l2 = translatePattern(line, 10, -5)
    expect(l2.x1).toBe(10)
    expect(l2.y1).toBe(-5)
    expect(l2.x2).toBe(110)
    expect(l2.y2).toBe(45)
    expect(line.x1).toBe(0) // 不修改原对象

    const fam = { id: 'F', kind: 'family', ref: { x: 1, y: 2 }, bounds: { x: 0, y: 0, w: 100, h: 80 }, angle: 0, spacing: 10, count: 3, width: 3 }
    const f2 = translatePattern(fam, 5, 5)
    expect(f2.ref).toEqual({ x: 6, y: 7 })
    expect(f2.bounds).toEqual({ x: 5, y: 5, w: 100, h: 80 })
  })

  it('moveLineToSpacing：把平行线段移到距参考线指定间距（保持所在侧）', () => {
    // 参考水平线 y=0；目标线 y=30 → 移动到 y=10（同一侧）
    const refH = { x1: 0, y1: 0, x2: 100, y2: 0 }
    const lineH = { id: 'LH', kind: 'line', x1: 0, y1: 30, x2: 100, y2: 30, width: 3 }
    const movedH = moveLineToSpacing(lineH, refH, 10)
    expect(movedH.y1).toBeCloseTo(10, 9)
    expect(movedH.y2).toBeCloseTo(10, 9)

    // 负侧：参考水平线 y=0，目标线 y=-30 → 移动到 y=-10（仍在负侧）
    const lineNeg = { ...lineH, y1: -30, y2: -30 }
    const movedNeg = moveLineToSpacing(lineNeg, refH, 10)
    expect(movedNeg.y1).toBeCloseTo(-10, 9)

    // 竖直参考 x=0；目标 x=-40 → 移动到 x=-8（负侧）
    const refV = { x1: 0, y1: 0, x2: 0, y2: 100 }
    const lineV = { id: 'LV', kind: 'line', x1: -40, y1: 0, x2: -40, y2: 100, width: 3 }
    const movedV = moveLineToSpacing(lineV, refV, 8)
    expect(movedV.x1).toBeCloseTo(-8, 9)
    expect(movedV.x2).toBeCloseTo(-8, 9)

    // 不平行 → null
    const line45 = { ...lineH, y1: 30, y2: 130 }
    expect(moveLineToSpacing(line45, refH, 10)).toBeNull()
    // 非法目标 → null
    expect(moveLineToSpacing(lineH, refH, 0)).toBeNull()
    expect(moveLineToSpacing(lineH, refH, -5)).toBeNull()
    // 非 line kind → null
    expect(moveLineToSpacing({ kind: 'family' }, refH, 10)).toBeNull()
  })

  it('patternAnchor：line 取起点、family 取 ref', () => {
    expect(patternAnchor({ kind: 'line', x1: 3, y1: 4 })).toEqual({ x: 3, y: 4 })
    expect(patternAnchor({ kind: 'family', ref: { x: 7, y: 8 } })).toEqual({ x: 7, y: 8 })
    expect(patternAnchor({ kind: 'other' })).toEqual({ x: 0, y: 0 })
  })

  it('nearestForeignEndpoint：返回最近的其它端点；超容差/无候选返回 null', () => {
    const seg = { id: 'A', x1: 0, y1: 0, x2: 100, y2: 0 }
    const b = { id: 'B', x1: 100, y1: 30, x2: 100, y2: 80 } // x2 端点与 A 端点重合(100,0)? B x1=(100,30),x2=(100,80) 都不重合
    const c = { id: 'C', x1: 100.4, y1: 0, x2: 200, y2: 0 } // C.x1≈A.x2 距离 0.4
    const d = { id: 'D', x1: 500, y1: 500, x2: 600, y2: 600 } // 远处

    const r = nearestForeignEndpoint(seg, [seg, b, c, d], 2)
    expect(r.other.id).toBe('C')
    expect(r.x).toBeCloseTo(100.4, 9)
    expect(r.y).toBeCloseTo(0, 9)
    expect(r.distance).toBeCloseTo(0.4, 9)
    expect(r.ownKey).toBe('x2')

    // 超容差
    expect(nearestForeignEndpoint(seg, [seg, d], 2)).toBeNull()
    // 空/全自身
    expect(nearestForeignEndpoint(seg, [], 2)).toBeNull()
    expect(nearestForeignEndpoint(seg, [seg], 2)).toBeNull()
  })
})
