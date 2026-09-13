// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import naive from 'naive-ui'
import KumikoCanvas from './KumikoCanvas.vue'
import { useProjectStore } from '../../stores/project.js'
import { useUiStore } from '../../stores/ui.js'
import { builtinModule } from '../../core/library/index.js'

beforeAll(() => {
  // happy-dom 未提供 ResizeObserver 时补一个空实现（useViewport 会用到）
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})

let pinia
beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
})

const PE = globalThis.PointerEvent || globalThis.MouseEvent

function fire(el, type, opts = {}) {
  el.dispatchEvent(new PE(type, { bubbles: true, clientX: 100, clientY: 100, pointerId: 1, ...opts }))
}

async function mountCanvas() {
  const w = mount(KumikoCanvas, { global: { plugins: [pinia, naive] } })
  await nextTick()
  await nextTick()
  return w
}

function armPlacing() {
  const ui = useUiStore()
  ui.setPlacing({
    module: builtinModule('mod-koushi'),
    params: { spacing: 50, width: 4, endCut: 90, size: 200 },
    point: null,
    rect: null,
    cell: null,
    from: 'library'
  })
  return ui
}

describe('KumikoCanvas：图案库放置', () => {
  it('放置态下 pointermove 更新预览，pointerup 落下图案（从面板拖拽的路径）', async () => {
    const project = useProjectStore()
    const w = await mountCanvas()
    const ui = armPlacing()
    const svg = w.find('svg').element

    fire(svg, 'pointermove', { clientX: 120, clientY: 90 })
    await nextTick()
    expect(ui.placing.point).toBeTruthy()
    expect(ui.placing.rect).toBeTruthy()

    fire(svg, 'pointerup', { clientX: 120, clientY: 90 })
    await nextTick()
    expect(project.groups).toHaveLength(1)
    expect(ui.placing).toBeNull()
    expect(w.findAll('line').length).toBeGreaterThan(0)
    w.unmount()
  })

  it('放置态下 pointerdown 直接落下图案（先点卡片再点画布的路径）', async () => {
    const project = useProjectStore()
    const w = await mountCanvas()
    const ui = armPlacing()
    fire(w.find('svg').element, 'pointerdown', { clientX: 60, clientY: 60 })
    await nextTick()
    expect(project.groups).toHaveLength(1)
    expect(ui.placing).toBeNull()
    w.unmount()
  })

  it('拖到槽位上会吸附：实例绑定该槽位且尺寸等于格子', async () => {
    const project = useProjectStore()
    const w = await mountCanvas()
    const ui = useUiStore()
    // 把视图设为可预测状态：中心 (200,200)、zoom 1
    ui.setZoom(1)
    ui.setCenter(200, 200)
    project.setLayout({ enabled: true, rows: 2, cols: 2, pitchX: 100, pitchY: 100 })

    armPlacing()
    const svg = w.find('svg').element
    // 容器 px 为 0：world = center + (client - 0)/zoom → 目标格 (0,0) 中心 (50,50) → client ( -150, -150 )
    fire(svg, 'pointermove', { clientX: -150, clientY: -150 })
    await nextTick()
    expect(ui.placing.cell).toMatchObject({ row: 0, col: 0 })

    fire(svg, 'pointerup', { clientX: -150, clientY: -150 })
    await nextTick()
    const g = project.groups[0]
    expect(g.cell).toEqual({ row: 0, col: 0 })
    expect(g.rect).toEqual({ x: 0, y: 0, w: 100, h: 100 })
    w.unmount()
  })

  it('框架启用时渲染槽位层；末端切口角非方切时渲染端面线', async () => {
    const project = useProjectStore()
    const w = await mountCanvas()
    project.setLayout({ enabled: true, rows: 1, cols: 2, pitchX: 100, pitchY: 100 })
    await nextTick()
    expect(w.find('.kd-slots').exists()).toBe(true)
    // 框架本体是线条：2 条横线 ×2 段 + 3 条竖线 ×1 段 = 7 段实线
    expect(w.findAll('.kd-pattern line')).toHaveLength(7)
    // 未选中单元格且无填充 → SlotLayer 不绘制任何矩形（不与框架线条重复）
    expect(w.findAll('.kd-slots rect')).toHaveLength(0)

    project.addGroup({
      module: builtinModule('mod-koushi'),
      params: { spacing: 50, width: 4, endCut: 45 },
      rect: { x: 0, y: 0, w: 100, h: 100 }
    })
    await nextTick()
    // 45° 斜切 → 每个边界端一条端面线（棕色 #b45309）
    const faces = w.findAll('line').filter((l) => l.attributes('stroke') === '#b45309')
    expect(faces.length).toBeGreaterThan(0)
    w.unmount()
  })
})
