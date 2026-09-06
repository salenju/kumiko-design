import { createApp } from 'vue'
import { createPinia } from 'pinia'
import naive from 'naive-ui'
import App from './App.vue'
import { useProjectStore } from './stores/project.js'
import { loadPersistedProject, installPersistence } from './utils/persist.js'
import './assets/main.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(naive)

// 恢复持久化项目数据（若有存档；旧存档缺 spacingUnit/lineColors → 回退默认）
const project = useProjectStore(pinia)
const saved = loadPersistedProject()
if (saved) {
  project.replaceAll({
    patterns: saved.patterns,
    material: saved.material,
    spacingUnit: saved.spacingUnit,
    lineColors: saved.lineColors
  })
}
installPersistence(project)

app.mount('#app')
