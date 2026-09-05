// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PatternLayer from './PatternLayer.vue'
import GridLayer from './GridLayer.vue'

const segments = [
  { id: 'p1:0:0', x1: 0, y1: 0, x2: 100, y2: 0, length: 100, width: 3, patternId: 'p1', lineIndex: 0 },
  { id: 'p2:0:0', x1: 50, y1: -50, x2: 50, y2: 50, length: 100, width: 4, patternId: 'p2', lineIndex: 0 },
  { id: 'p2:0:1', x1: 50, y1: 50, x2: 50, y2: 100, length: 50, width: 4, patternId: 'p2', lineIndex: 0 }
]

describe('PatternLayer 渲染', () => {
  it('渲染全部线段为 <line>，线宽为物理 mm', () => {
    const w = mount(PatternLayer, {
      props: { segments, selectedIds: [], hoveredSegmentId: null, labelsEnabled: false, zoom: 2 }
    })
    const lines = w.findAll('line')
    expect(lines.length).toBe(3)
    const widths = lines.map((l) => l.attributes('stroke-width'))
    expect(widths).toContain('3')
    expect(widths).toContain('4')
  })

  it('默认不显示标注；labelsEnabled 时显示长度文字', () => {
    const w1 = mount(PatternLayer, {
      props: { segments, selectedIds: [], hoveredSegmentId: null, labelsEnabled: false, zoom: 2 }
    })
    expect(w1.findAll('text').length).toBe(0)

    const w2 = mount(PatternLayer, {
      props: { segments, selectedIds: [], hoveredSegmentId: null, labelsEnabled: true, zoom: 2 }
    })
    expect(w2.findAll('text').length).toBe(3)
    expect(w2.text()).toContain('100.0')
    expect(w2.text()).toContain('50.0')
  })

  it('选中族高亮：追加描边 layer', () => {
    const w = mount(PatternLayer, {
      props: { segments, selectedIds: ['p2'], hoveredSegmentId: null, labelsEnabled: false, zoom: 2 }
    })
    // 3 条 base line + 2 条选中高亮（p2 的两段）
    expect(w.findAll('line').length).toBe(5)
  })

  it('悬停段显示其长度标注', () => {
    const w = mount(PatternLayer, {
      props: { segments, selectedIds: [], hoveredSegmentId: 'p2:0:1', labelsEnabled: false, zoom: 2 }
    })
    expect(w.findAll('text').length).toBe(1)
    expect(w.text()).toContain('50.0')
  })
})

describe('GridLayer 渲染', () => {
  it('禁用时不渲染网格；启用时按视口生成线', () => {
    const rect = { x: -100, y: -100, w: 200, h: 200 }
    const off = mount(GridLayer, { props: { rect, zoom: 2, enabled: false } })
    expect(off.findAll('line').length).toBe(0)

    const on = mount(GridLayer, { props: { rect, zoom: 2, enabled: true } })
    expect(on.findAll('line').length).toBeGreaterThan(0)
  })
})
