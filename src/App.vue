<script setup>
/**
 * App —— 应用布局与全局快捷键
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'
import {
  NConfigProvider,
  NMessageProvider,
  zhCN,
  dateZhCN
} from 'naive-ui'
import { useUiStore } from './stores/ui.js'
import { useProjectStore } from './stores/project.js'
import { useHistoryStore } from './stores/history.js'
import { saveProjectNow } from './utils/persist.js'
import KumikoCanvas from './components/canvas/KumikoCanvas.vue'
import Toolbar from './components/panels/Toolbar.vue'
import PatternPropertyPanel from './components/panels/PatternPropertyPanel.vue'
import CutListPanel from './components/panels/CutListPanel.vue'
import PresetsModal from './components/dialogs/PresetsModal.vue'
import AiModal from './components/dialogs/AiModal.vue'
import { useSelection } from './composables/useSelection.js'

const ui = useUiStore()
const project = useProjectStore()
const history = useHistoryStore()
const selection = useSelection()

const canvasRef = ref(null)
const showPresets = ref(false)
const showAi = ref(false)
const showCutlist = ref(false)

function saveLocal() {
  saveProjectNow(project)
}

function isTypingTarget(e) {
  const t = e.target
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
}

function onKeydown(e) {
  const mod = e.ctrlKey || e.metaKey
  const inField = isTypingTarget(e)
  // 空格：临时平移（任何工具下按住空格+拖拽 = 平移）
  if (e.code === 'Space' && !inField) {
    if (!e.repeat) {
      e.preventDefault()
      ui.setSpacePan(true)
    }
    return
  }
  // Ctrl/⌘+S 保存到本地
  if (mod && e.key.toLowerCase() === 's' && !inField) {
    e.preventDefault()
    saveLocal()
    return
  }
  if (mod && e.key.toLowerCase() === 'z' && !inField) {
    e.preventDefault()
    if (e.shiftKey) history.redo()
    else history.undo()
    return
  }
  if (mod && e.key.toLowerCase() === 'y' && !inField) {
    e.preventDefault()
    history.redo()
    return
  }
  // Ctrl/⌘+D 复制选中（行业惯例，AI/PS 同）
  if (mod && e.key.toLowerCase() === 'd' && !inField) {
    e.preventDefault()
    selection.duplicateSelected()
    return
  }
  // Ctrl/⌘+A 全选（行业惯例）
  if (mod && e.key.toLowerCase() === 'a' && !inField) {
    e.preventDefault()
    ui.setSelectedPatterns(project.patterns.map((p) => p.id))
    return
  }
  // Ctrl/⌘+0 适配视图（行业惯例）
  if (mod && e.key === '0' && !inField) {
    e.preventDefault()
    onFit()
    return
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && !inField) {
    e.preventDefault()
    selection.deleteSelected()
    return
  }
  if (e.key === 'Escape' && !inField) {
    ui.clearSelection()
    ui.setTool(ui.tool)
    return
  }
  // 工具快捷键（行业惯例：V 选择 / H 平移 / L 画线 / G 画线族；数字键 1-4 同义）
  if (!inField && !mod) {
    const k = e.key.toLowerCase()
    const map = { v: 'select', h: 'pan', l: 'line', g: 'pattern', '1': 'select', '2': 'pattern', '3': 'line', '4': 'pan' }
    if (map[k]) {
      ui.setTool(map[k])
    }
  }
}

function onKeyup(e) {
  // 松开空格结束临时平移
  if (e.code === 'Space') {
    ui.setSpacePan(false)
  }
}

function onFit() {
  canvasRef.value?.fitToProject()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('keyup', onKeyup)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('keyup', onKeyup)
})
</script>

<template>
  <n-config-provider :locale="zhCN" :date-locale="dateZhCN">
    <n-message-provider>
      <div class="kd-full">
        <Toolbar
          @open-presets="showPresets = true"
          @open-ai="showAi = true"
          @open-cutlist="showCutlist = true"
          @fit="onFit"
        />
        <div class="kd-main">
          <div class="kd-canvas-host">
            <KumikoCanvas ref="canvasRef" />
          </div>
          <div class="kd-panel">
            <PatternPropertyPanel />
          </div>
        </div>

        <PresetsModal v-model:show="showPresets" />
        <AiModal v-model:show="showAi" />
        <CutListPanel v-model:show="showCutlist" />
      </div>
    </n-message-provider>
  </n-config-provider>
</template>
