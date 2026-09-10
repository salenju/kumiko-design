import { createApp } from 'vue'
import { createPinia } from 'pinia'
import naive from 'naive-ui'
import App from './App.vue'
import { useProjectStore } from './stores/project.js'
import { useWorkspaceStore } from './stores/workspace.js'
import { initPwa } from './pwa.js'
import './assets/main.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(naive)

const project = useProjectStore(pinia)
const workspace = useWorkspaceStore(pinia)

/**
 * 先初始化工作区（异步：IndexedDB → 兜底 localStorage），再挂载。
 * 这样首屏渲染的就是「上次打开的作品」，不会出现空画布闪烁。
 */
workspace
  .init()
  .catch((e) => {
    console.error('[workspace] 初始化失败', e)
    workspace.error = e?.message || String(e)
  })
  .finally(() => {
    app.mount('#app')
    // 画布数据变化 → 防抖暂存到当前作品
    project.$subscribe(() => workspace.scheduleSave())
    // PWA：注册 Service Worker + 安装/更新引导
    initPwa()
  })

/**
 * 页面隐藏/关闭前兜底 flush（pad 上切后台、杀进程场景）。
 * IndexedDB 写入为异步，此处仅尽力而为；常规编辑已由防抖暂存覆盖。
 */
function flush() {
  workspace.saveCurrentNow().catch(() => {})
}
window.addEventListener('pagehide', flush)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush()
})
