// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import naive, { NMessageProvider } from 'naive-ui'
import PatternLibraryPanel from './PatternLibraryPanel.vue'
import { useProjectStore } from '../../stores/project.js'
import { useUiStore } from '../../stores/ui.js'

let pinia
beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
})

const PanelHost = {
  components: { PatternLibraryPanel, NMessageProvider },
  template: '<n-message-provider><pattern-library-panel :show="true" /></n-message-provider>'
}

function mountPanel() {
  return mount(PanelHost, {
    global: { plugins: [pinia, naive], stubs: { teleport: true } }
  })
}

describe('PatternLibraryPanel：图案库面板', () => {
  it('渲染全部内置图案卡片与分类导航', () => {
    const w = mountPanel()
    expect(w.text()).toContain('图案库')
    expect(w.findAll('.pl-card')).toHaveLength(6)
    expect(w.text()).toContain('基础网格')
    expect(w.text()).toContain('花叶纹样')
    expect(w.text()).toContain('我的图案')
    expect(w.text()).toContain('麻叶')
    expect(w.text()).toContain('龟甲')
    w.unmount()
  })

  it('切换到分类后只显示该分类图案，搜索可过滤', async () => {
    const w = mountPanel()
    const navBtns = w.findAll('.pl-nav-btn')
    // 找到「几何纹样」分类按钮
    const geo = navBtns.find((b) => b.text().includes('几何纹样'))
    await geo.trigger('click')
    expect(w.findAll('.pl-card')).toHaveLength(1)
    expect(w.text()).toContain('龟甲')

    // 回到全部并搜索
    await navBtns.find((b) => b.text().includes('全部')).trigger('click')
    await w.find('.pl-top input').setValue('麻叶')
    expect(w.findAll('.pl-card')).toHaveLength(1)
    w.unmount()
  })

  it('单击卡片直接插入图案（生成一个实例）', async () => {
    const project = useProjectStore()
    const w = mountPanel()
    const card = w.findAll('.pl-card')[0]
    await card.trigger('pointerdown')
    window.dispatchEvent(new Event('pointerup'))
    await nextTick()
    expect(project.groups).toHaveLength(1)
    expect(project.groups[0].moduleId).toBe('mod-koushi')
    expect(project.patterns.length).toBeGreaterThan(0)
    w.unmount()
  })

  it('选中槽位时单击卡片填入该槽位', async () => {
    const project = useProjectStore()
    const ui = useUiStore()
    project.setLayout({ enabled: true, rows: 2, cols: 2, pitchX: 120, pitchY: 120 })
    ui.setSelectedSlot({ row: 1, col: 1, key: '1:1' })
    const w = mountPanel()
    await w.findAll('.pl-card')[0].trigger('pointerdown')
    window.dispatchEvent(new Event('pointerup'))
    await nextTick()
    const g = project.groups[0]
    expect(g.cell).toEqual({ row: 1, col: 1 })
    expect(g.rect).toEqual({ x: 120, y: 120, w: 120, h: 120 })
    expect(ui.selectedSlot).toBeNull()
    w.unmount()
  })

  it('点卡片内的「参数」按钮只打开参数弹窗，不误插入图案', async () => {
    const project = useProjectStore()
    const w = mountPanel()
    const paramBtn = w.findAll('.pl-card')[0].findAll('.pl-card-ops button')[0]
    expect(paramBtn.text()).toBe('参数')
    await paramBtn.trigger('pointerdown')
    window.dispatchEvent(new MouseEvent('pointerup'))
    await paramBtn.trigger('click')
    await nextTick()
    await nextTick()
    expect(project.groups).toHaveLength(0)
    expect(w.find('.pl-field').exists()).toBe(true)
    w.unmount()
  })

  it('顶栏「初始化框架」按钮直接打开框架弹窗', async () => {
    const ui = useUiStore()
    const w = mountPanel()
    const btn = w.findAll('.pl-top button').find((b) => b.text().includes('初始化框架'))
    expect(btn).toBeTruthy()
    await btn.trigger('click')
    expect(ui.layoutModalOpen).toBe(true)
    w.unmount()
  })

  it('启用框架后提示显示行列 / 线条数与已填格数', async () => {
    const project = useProjectStore()
    const w = mountPanel()
    await w.find('.pl-top input').setValue('')
    project.setLayout({ enabled: true, rows: 2, cols: 3, pitchX: 100, pitchY: 100 })
    await nextTick()
    expect(w.text()).toContain('2 行 × 3 列')
    expect(w.text()).toContain('横线 3 + 竖线 4')
    expect(w.text()).toContain('已填 0 / 6 格')
    expect(w.find('.pl-slot-hint').classes()).toContain('info')
    w.unmount()
  })

  it('拖动卡片进入放置态（不立即插入）', async () => {
    const project = useProjectStore()
    const ui = useUiStore()
    const w = mountPanel()
    await w.findAll('.pl-card')[0].trigger('pointerdown', { clientX: 10, clientY: 10, button: 0 })
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 60, clientY: 60 }))
    await nextTick()
    expect(ui.placing).toBeTruthy()
    expect(ui.placing.module.id).toBe('mod-koushi')
    // 松手在画布外 → 取消放置，且不插入
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: 60, clientY: 60 }))
    await nextTick()
    expect(ui.placing).toBeNull()
    expect(project.groups).toHaveLength(0)
    w.unmount()
  })
})
