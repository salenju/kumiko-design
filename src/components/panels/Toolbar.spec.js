// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import naive, { NModal, NMessageProvider } from 'naive-ui'
import Toolbar from './Toolbar.vue'
import { useProjectStore } from '../../stores/project.js'

let pinia
beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
})

/** Toolbar 依赖 useMessage → 需包一层 n-message-provider */
const ToolbarHost = {
  components: { Toolbar, NMessageProvider },
  template: '<n-message-provider><Toolbar /></n-message-provider>'
}

function mountToolbar() {
  return mount(ToolbarHost, { global: { plugins: [pinia, naive] } })
}

describe('Toolbar：导出文件 / 导入文件', () => {
  it('按钮文案改为「导出文件」「导入文件」（无旧文案）', () => {
    const w = mountToolbar()
    const text = w.text()
    expect(text).toContain('导出文件')
    expect(text).toContain('导入文件')
    expect(text).not.toContain('另存文件')
    expect(text).not.toContain('打开文件')
    w.unmount()
  })

  it('点「导出文件」先弹出命名弹窗（输入导出文件名）', async () => {
    const project = useProjectStore()
    project.addPattern({ id: 'p1', kind: 'line', x1: 0, y1: 0, x2: 10, y2: 0, width: 3 })
    const w = mountToolbar()

    const btn = w.findAll('button').find((b) => b.text().includes('导出文件'))
    expect(btn).toBeTruthy()
    await btn.trigger('click')
    await nextTick()

    // 弹窗已打开且标题为「导出项目文件」
    const modal = w.findAllComponents(NModal).find((m) => m.props('show') === true)
    expect(modal).toBeTruthy()
    expect(document.body.textContent).toContain('导出项目文件')
    expect(document.body.textContent).toContain('导出文件名')

    // 名称为空时「导出」不可用 → 必须先输入文件名
    const exportBtns = Array.from(document.querySelectorAll('button')).filter((b) => b.textContent.trim() === '导出')
    expect(exportBtns.length).toBeGreaterThan(0)
    expect(exportBtns[0].disabled).toBe(true)
    w.unmount()
  })
})
