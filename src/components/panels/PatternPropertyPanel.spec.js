// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import naive, { NSelect } from 'naive-ui'
import PatternPropertyPanel from './PatternPropertyPanel.vue'
import { useProjectStore } from '../../stores/project.js'
import { useUiStore } from '../../stores/ui.js'
import { useHistoryStore } from '../../stores/history.js'
import { generatePatterns } from '../../core/presets/index.js'

let pinia
beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
})

function mountPanel() {
  return mount(PatternPropertyPanel, { global: { plugins: [pinia, naive] } })
}

/** 面板内所有 Nx 倍数下拉（naive NSelect） */
function panelSelects(w) {
  return w.findAllComponents(NSelect)
}

describe('PatternPropertyPanel：间距按全局单位 Nx 倍数', () => {
  it('线族「间距」：以 Nx 回显，选 4x → spacing = 4 × 单位，可撤销', async () => {
    const project = useProjectStore()
    const history = useHistoryStore()
    const ui = useUiStore()
    const patterns = generatePatterns('koushi', { size: 60, spacing: 30, width: 2 })
    project.addPatterns(patterns)
    ui.setSelectedPatterns([patterns[0].id])

    const w = mountPanel()
    expect(w.text()).toContain('间距（Nx = N × 10mm）')

    const sel = panelSelects(w)[0]
    expect(sel.props('value')).toBe(3) // 30mm / 10mm = 3x
    expect(sel.props('options').find((o) => o.value === 3).label).toBe('3x')

    // 选 4x → spacing = 40
    sel.vm.$emit('update:value', 4)
    await nextTick()
    expect(project.patternById(patterns[0].id).spacing).toBe(40)

    history.undo()
    expect(project.patternById(patterns[0].id).spacing).toBe(30)
    w.unmount()
  })

  it('线族「间距」：改全局单位后同一 spacing 的倍数换算随之更新', async () => {
    const project = useProjectStore()
    const ui = useUiStore()
    const patterns = generatePatterns('koushi', { size: 60, spacing: 30, width: 2 })
    project.addPatterns(patterns)
    ui.setSelectedPatterns([patterns[0].id])

    const w = mountPanel()
    expect(w.text()).toContain('N × 10mm')
    expect(panelSelects(w)[0].props('value')).toBe(3)

    project.setSpacingUnit(15) // 单位改大 → 30/15 = 2x
    await nextTick()
    expect(w.text()).toContain('N × 15mm')
    expect(panelSelects(w)[0].props('value')).toBe(2)
    w.unmount()
  })

  it('单线「相邻线间距」：当前间距回显 Nx，选 4x 移动到 4×单位 并撤销', async () => {
    const project = useProjectStore()
    const history = useHistoryStore()
    const ui = useUiStore()
    // 参考横线 y=-20（其它图案，在上方） + 待调横线 y=0 → 间距 20mm = 2x
    project.addPattern({ id: 'ref', kind: 'line', x1: 0, y1: -20, x2: 60, y2: -20, width: 3 })
    project.addPattern({ id: 'mov', kind: 'line', x1: 0, y1: 0, x2: 60, y2: 0, width: 3 })
    ui.setSelectedPatterns(['mov'])

    const w = mountPanel()
    expect(w.text()).toContain('相邻线间距（基准=上方）')
    const sel = panelSelects(w)[0]
    expect(sel.props('disabled')).toBe(false)
    expect(sel.props('value')).toBe(2) // 20mm / 10mm

    sel.vm.$emit('update:value', 4) // 4x = 40mm
    await nextTick()
    const mov = project.patternById('mov')
    // 参考线 y=-20，本线保持其下方 → 移动到 y = -20 + 40 = 20
    expect(mov.y1).toBeCloseTo(20, 6)
    expect(mov.y2).toBeCloseTo(20, 6)

    history.undo()
    const back = project.patternById('mov')
    expect(back.y1).toBeCloseTo(0, 6)
    expect(back.y2).toBeCloseTo(0, 6)
    w.unmount()
  })

  it('单线「相邻线间距」：该方向无相邻平行线时下拉禁用', async () => {
    const project = useProjectStore()
    const ui = useUiStore()
    project.addPattern({ id: 'only', kind: 'line', x1: 0, y1: 0, x2: 60, y2: 0, width: 3 })
    ui.setSelectedPatterns(['only'])

    const w = mountPanel()
    const sel = panelSelects(w)[0]
    expect(sel.props('disabled')).toBe(true)
    expect(sel.props('placeholder')).toBe('该方向无相邻线')
    w.unmount()
  })

  it('未选中时的画布统计展示当前全局间距单位', () => {
    const project = useProjectStore()
    project.setSpacingUnit(12)
    const w = mountPanel()
    expect(w.text()).toContain('全局间距单位')
    expect(w.text()).toContain('12 mm')
    w.unmount()
  })
})
