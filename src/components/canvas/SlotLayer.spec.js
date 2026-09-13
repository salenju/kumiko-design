// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SlotLayer from './SlotLayer.vue'
import { normalizeLayout, allSlots } from '../../core/library/index.js'

const layout = normalizeLayout({ enabled: true, rows: 2, cols: 3, pitchX: 100, pitchY: 100 })

/**
 * 框架本体是线条（由 PatternLayer 渲染），SlotLayer 只做「往格子里放图案」的轻量高亮：
 * 未选中/未填充时不绘制任何矩形，避免与框架线条重复。
 */
describe('SlotLayer：单元格高亮', () => {
  it('无选中、无填充时不绘制矩形（框架线条由 PatternLayer 负责）', () => {
    const w = mount(SlotLayer, {
      props: { slots: allSlots(layout), occupancy: {}, selectedKey: null, zoom: 1 }
    })
    expect(w.find('.kd-slots').exists()).toBe(true)
    expect(w.findAll('rect')).toHaveLength(0)
    expect(w.text()).toBe('')
    w.unmount()
  })

  it('仅已填充单元格绘制淡底（不含选中格）', () => {
    const w = mount(SlotLayer, {
      props: { slots: allSlots(layout), occupancy: { '0:0': 'grp-1', '1:2': 'grp-2' }, selectedKey: '0:0', zoom: 1 }
    })
    const rects = w.findAll('rect')
    // 选中格单独绘制 → 共 1（淡底，排除选中） + 1（选中高亮） = 2
    expect(rects).toHaveLength(2)
    expect(rects.filter((r) => r.attributes('stroke') === '#2f6fd0')).toHaveLength(1)
    w.unmount()
  })

  it('选中单元格高亮并显示行列号', () => {
    const w = mount(SlotLayer, {
      props: { slots: allSlots(layout), occupancy: {}, selectedKey: '1:2', zoom: 2 }
    })
    const rect = w.find('rect')
    expect(rect.attributes('x')).toBe('200')
    expect(rect.attributes('y')).toBe('100')
    expect(rect.attributes('width')).toBe('100')
    expect(rect.attributes('stroke')).toBe('#2f6fd0')
    expect(w.text()).toContain('第 2 行 · 第 3 列')
    w.unmount()
  })
})
