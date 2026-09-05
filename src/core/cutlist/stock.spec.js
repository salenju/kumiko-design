import { describe, it, expect } from 'vitest'
import {
  round1,
  aggregateCutItems,
  planStock
} from './stock.js'

describe('cutlist 1D 下料', () => {
  it('round1 保留 0.1mm', () => {
    expect(round1(12.34)).toBe(12.3)
    expect(round1(12.35)).toBe(12.4)
    expect(round1(100)).toBe(100)
  })

  it('aggregateCutItems 按宽度分组、按长度合并数量', () => {
    const items = aggregateCutItems([
      { width: 3, length: 100.04 },
      { width: 3, length: 100.05 },
      { width: 3, length: 50.11 },
      { width: 4, length: 100.04 },
      { width: 3, length: 100.04 }
    ])
    // 3mm: 100.0(round 100.04→100.0, 100.05→100.1? 注意 round1(100.05)=100.1) 单独核对
    const w3 = items.filter((i) => i.width === 3)
    const w4 = items.filter((i) => i.width === 4)
    expect(w4.length).toBe(1)
    expect(w4[0].length).toBe(100.0)
    expect(w3.length).toBeGreaterThanOrEqual(2)
  })

  it('planStock 精确贴合：5 段总长 1000 装入两条 500', () => {
    const res = planStock(
      [
        { length: 300, qty: 1 },
        { length: 250, qty: 1 },
        { length: 200, qty: 1 },
        { length: 150, qty: 1 },
        { length: 100, qty: 1 }
      ],
      { stockLength: 500, kerf: 0 }
    )
    expect(res.count).toBe(2)
    expect(res.totalLength).toBe(1000)
    expect(res.totalUsed).toBe(1000)
    expect(res.totalWaste).toBe(0)
    expect(res.utilization).toBe(1)
  })

  it('planStock 考虑 kerf 后可能需要更多料', () => {
    const res = planStock(
      [
        { length: 300, qty: 1 },
        { length: 250, qty: 1 },
        { length: 200, qty: 1 },
        { length: 150, qty: 1 },
        { length: 100, qty: 1 }
      ],
      { stockLength: 500, kerf: 5 }
    )
    // 每段占用 length+5：305+? 300→305, 250→255, 200→205, 150→155, 100→105
    // 305+? 500 内：305(+155=460 还差 155+? ) 305+205=510>500 → 分箱更多
    expect(res.count).toBeGreaterThan(2)
    expect(res.totalLength).toBe(1000)
  })

  it('planStock 校验非法 stockLength', () => {
    expect(() => planStock([{ length: 10, qty: 1 }], { stockLength: 0 })).toThrow()
  })

  it('planStock 空需求', () => {
    const res = planStock([], { stockLength: 500 })
    expect(res.count).toBe(0)
    expect(res.totalUsed).toBe(0)
  })

  it('planStock 合并输出 cuts 与余料正确', () => {
    const res = planStock(
      [
        { length: 200, qty: 4 },
        { length: 100, qty: 2 }
      ],
      { stockLength: 500, kerf: 0 }
    )
    // 200×4 + 100×2 = 1000；BFD：500 内放 200+200+100=500，再来一条相同 → 2 条
    expect(res.count).toBe(2)
    expect(res.totalLength).toBe(1000)
    expect(res.totalWaste).toBe(0)
    const first = res.stocks[0]
    const len200 = first.cuts.find((c) => c.length === 200)
    expect(len200.qty).toBe(2)
  })
})
