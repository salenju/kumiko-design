import { describe, it, expect } from 'vitest'
import {
  length,
  distPointLine,
  distPointSegment,
  parallelLineDistance,
  cross
} from '../geometry/vector.js'

describe('vector 向量与距离', () => {
  it('length 勾股距离', () => {
    expect(length(0, 0, 3, 4)).toBeCloseTo(5, 10)
    expect(length(1, 1, 1, 1)).toBe(0)
  })

  it('distPointLine 点到无限直线距离', () => {
    const horiz = { x: 0, y: 0, dx: 1, dy: 0 }
    expect(distPointLine(5, 7, horiz)).toBeCloseTo(7, 10)
    const diag = { x: 0, y: 0, dx: 1, dy: 1 }
    expect(distPointLine(1, -1, diag)).toBeCloseTo(Math.SQRT2, 10)
  })

  it('distPointSegment 点到线段（含投影落在段外）', () => {
    // 段 (0,0)-(10,0)
    expect(distPointSegment(5, 3, 0, 0, 10, 0)).toBeCloseTo(3, 10)
    expect(distPointSegment(-1, 0, 0, 0, 10, 0)).toBeCloseTo(1, 10)
    expect(distPointSegment(11, 0, 0, 0, 10, 0)).toBeCloseTo(1, 10)
    expect(distPointSegment(5, 0, 0, 0, 10, 0)).toBe(0)
  })

  it('parallelLineDistance 平行线垂直间距', () => {
    const l1 = { x: 0, y: 0, dx: 1, dy: 0 }
    const l2 = { x: 0, y: 8, dx: 1, dy: 0 }
    expect(parallelLineDistance(l1, l2)).toBeCloseTo(8, 10)
    const d1 = { x: 0, y: 0, dx: 0, dy: 1 }
    const d2 = { x: -12.5, y: 0, dx: 0, dy: 1 }
    expect(parallelLineDistance(d1, d2)).toBeCloseTo(12.5, 10)
  })

  it('cross 叉积符号', () => {
    expect(cross(1, 0, 0, 1)).toBeCloseTo(1, 10)
    expect(cross(0, 1, 1, 0)).toBeCloseTo(-1, 10)
  })
})
