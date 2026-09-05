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
  // Ctrl/⌘+S 保存到本地
  if (mod && e.key.toLowerCase() === 's' && !isTypingTarget(e)) {
    e.preventDefault()
    saveLocal()
    return
  }
  if (mod && e.key.toLowerCase() === 'z' && !isTypingTarget(e)) {
    e.preventDefault()
    if (e.shiftKey) history.redo()
    else history.undo()
    return
  }
  if (mod && e.key.toLowerCase() === 'y' && !isTypingTarget(e)) {
    e.preventDefault()
    history.redo()
    return
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && !isTypingTarget(e)) {
    selection.deleteSelected()
    return
  }
  if (e.key === 'Escape') {
    ui.clearSelection()
    ui.setTool(ui.tool)
  }
  // 数字键切换工具：1=选择 2=画线族 3=画单线 4=平移
  if (!isTypingTarget(e) && !mod && ['1', '2', '3', '4'].includes(e.key)) {
    ui.setTool(['select', 'pattern', 'line', 'pan'][Number(e.key) - 1])
  }
}

function onFit() {
  canvasRef.value?.fitToProject()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
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
