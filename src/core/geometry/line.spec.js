import { describe, it, expect } from 'vitest'
import {
  lineLineIntersect,
  pointAt,
  lineRectIntersect,
  segmentRectOverlap
} from '../geometry/line.js'

describe('line 直线求交与裁剪', () => {
  it('lineLineIntersect 垂直相交', () => {
    const h = { x: 0, y: 2, dx: 1, dy: 0 }
    const v = { x: 3, y: 0, dx: 0, dy: 1 }
    const hit = lineLineIntersect(h, v)
    expect(hit.x).toBeCloseTo(3, 10)
    expect(hit.y).toBeCloseTo(2, 10)
  })

  it('lineLineIntersect 平行返回 null', () => {
    const a = { x: 0, y: 0, dx: 1, dy: 1 }
    const b = { x: 1, y: 1, dx: 1, dy: 1 }
    expect(lineLineIntersect(a, b)).toBeNull()
  })

  it('pointAt 参数化取点', () => {
    const l = { x: 10, y: 10, dx: 1, dy: 0 }
    expect(pointAt(l, 5)).toEqual({ x: 15, y: 10 })
  })

  it('lineRectIntersect 水平线穿过矩形得两个 t', () => {
    const l = { x: 0, y: 0, dx: 1, dy: 0 }
    const ts = lineRectIntersect(l, { x: -50, y: -50, w: 100, h: 100 })
    expect(ts.length).toBe(2)
    expect(ts[0]).toBeCloseTo(-50, 9)
    expect(ts[1]).toBeCloseTo(50, 9)
  })

  it('lineRectIntersect 斜线穿过对角', () => {
    const l = { x: 0, y: 0, dx: 1, dy: 1 } // y=x（方向未单位化，t 即坐标增量）
    const ts = lineRectIntersect(l, { x: -10, y: -10, w: 20, h: 20 })
    expect(ts.length).toBe(2)
    expect(ts[0]).toBeCloseTo(-10, 8)
    expect(ts[1]).toBeCloseTo(10, 8)
  })

  it('lineRectIntersect 不相交返回空', () => {
    const l = { x: 100, y: 100, dx: 0, dy: 1 }
    expect(lineRectIntersect(l, { x: 0, y: 0, w: 10, h: 10 })).toEqual([])
  })

  it('segmentRectOverlap 各类相交判定', () => {
    const rect = { x: 0, y: 0, w: 100, h: 100 }
    expect(segmentRectOverlap(50, 50, 150, 50, rect)).toBe(true) // 穿出右边
    expect(segmentRectOverlap(50, -50, 50, 150, rect)).toBe(true) // 穿出上下
    expect(segmentRectOverlap(120, 120, 150, 150, rect)).toBe(false) // 完全在外
    expect(segmentRectOverlap(20, 20, 30, 30, rect)).toBe(true) // 全在内
    expect(segmentRectOverlap(-10, -10, 10, 10, rect)).toBe(true) // 对角穿过
    expect(segmentRectOverlap(-20, -20, -5, -5, rect)).toBe(false) // 左上外
  })
})
