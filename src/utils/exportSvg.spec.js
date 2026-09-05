import { describe, it, expect } from 'vitest'
import { buildSvgString } from './exportSvg.js'

describe('utils/exportSvg SVG 导出', () => {
  const segments = [
    { id: 'a:0:0', x1: 0, y1: 0, x2: 100, y2: 0, length: 100, width: 3, patternId: 'a', lineIndex: 0 },
    { id: 'b:0:0', x1: 50, y1: -50, x2: 50, y2: 50, length: 100, width: 4, patternId: 'b', lineIndex: 0 }
  ]

  it('空数组返回最小 svg', () => {
    const svg = buildSvgString([])
    expect(svg).toContain('<svg')
    expect(svg).not.toContain('<line')
  })

  it('生成含线宽（mm）与视图范围的 SVG', () => {
    const svg = buildSvgString(segments)
    expect(svg).toContain('stroke-width="3"')
    expect(svg).toContain('stroke-width="4"')
    // viewBox 含 padding=10：x=-10, y=-60, w=120, h=120
    expect(svg).toContain('viewBox="-10 -60 120 120"')
    // 长度单位 mm
    expect(svg).toContain('width="120mm"')
    expect(svg).toContain('<line')
  })

  it('自定义 padding', () => {
    const svg = buildSvgString(segments, { padding: 0 })
    expect(svg).toContain('viewBox="0 -50 100 100"')
  })
})
