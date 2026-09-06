// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import naive from 'naive-ui'
import PartsPanel from './PartsPanel.vue'
import { useProjectStore } from '../../stores/project.js'
import { generatePatterns } from '../../core/presets/index.js'

let pinia
beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
})

function mountParts() {
  return mount(PartsPanel, { props: { show: true }, global: { plugins: [pinia, naive] } })
}

describe('PartsPanel 图案部件抽屉', () => {
  it('空画布：显示提示文案', async () => {
    const w = mountParts()
    await nextTick()
    expect(document.body.textContent).toContain('画布为空，先添加纹样再统计部件')
    w.unmount()
  })

  it('方格纹：统计出同型组并出现 piece/插口 标注', async () => {
    const project = useProjectStore()
    project.addPatterns(generatePatterns('koushi', { size: 200, spacing: 20, width: 3 }))
    const w = mountParts()
    // naive 抽屉内容经 teleport 到 body
    await new Promise((r) => setTimeout(r, 50))
    const t = document.body.textContent
    expect(t).toContain('piece')
    expect(t).toContain('插口')
    expect(t).toContain('间距缩写')
    w.unmount()
  })
})
