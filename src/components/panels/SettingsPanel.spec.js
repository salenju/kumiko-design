// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import naive from 'naive-ui'
import SettingsPanel from './SettingsPanel.vue'
import { useProjectStore } from '../../stores/project.js'
import { useHistoryStore } from '../../stores/history.js'

let pinia
beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
})

function mountSettings() {
  return mount(SettingsPanel, { props: { show: true }, global: { plugins: [pinia, naive] } })
}

describe('SettingsPanel 设置', () => {
  it('抽屉含 常规（间距单位）与 线条颜色 分区及默认角度行', async () => {
    const w = mountSettings()
    await nextTick()
    const t = document.body.textContent
    expect(t).toContain('全局间距单位')
    expect(t).toContain('线条颜色（按木条方向角度）')
    expect(t).toContain('其它角度（未单独设置）')
    expect(t).toContain('悬停高亮色')
    expect(t).toContain('选中高亮色')
    // 默认配色常见角度出现（横0°、竖90°、斜45°）
    expect(t).toContain('0°')
    expect(t).toContain('90°')
    expect(t).toContain('保存')
    expect(t).toContain('恢复默认')
    w.unmount()
  })

  it('未编辑时点「保存」关闭弹窗且不产生撤销记录；恢复默认按钮可用', async () => {
    const project = useProjectStore()
    const history = useHistoryStore()
    const w = mountSettings()
    await nextTick()

    const btns = Array.from(document.querySelectorAll('button'))
    const saveBtn = btns.find((b) => b.textContent.trim() === '保存')
    const resetBtn = btns.find((b) => b.textContent.trim() === '恢复默认')
    expect(saveBtn).toBeTruthy()
    expect(resetBtn).toBeTruthy()

    resetBtn.click() // 本地副本重置（默认值）→ 保存后不应产生数据变化
    await nextTick()
    saveBtn.click()
    await nextTick()
    expect(w.emitted('update:show')).toBeTruthy()
    expect(w.emitted('update:show').at(-1)).toEqual([false])
    // 无实际变更 → 不产生撤销步
    expect(history.canUndo).toBe(false)
    expect(project.spacingUnit).toBe(10)
    w.unmount()
  })
})
