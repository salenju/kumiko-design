<script setup>
/**
 * Toolbar —— 顶部工具（V2 §6 Toolbar.vue）
 */
import { useUiStore } from '../../stores/ui.js'
import { useHistoryStore } from '../../stores/history.js'
import { useProjectStore } from '../../stores/project.js'
import { useSelection } from '../../composables/useSelection.js'
import { buildSvgString, downloadSvg } from '../../utils/exportSvg.js'
import {
  downloadProjectFile,
  parseProjectJson,
  pickAndReadJsonFile
} from '../../utils/projectFile.js'
import { saveProjectNow, clearPersistedProject } from '../../utils/persist.js'
import { useMessage } from 'naive-ui'

const emit = defineEmits(['open-presets', 'open-ai', 'open-cutlist', 'fit'])
const ui = useUiStore()
const history = useHistoryStore()
const project = useProjectStore()
const message = useMessage()

const selection = useSelection()

const TOOLS = [
  { key: 'select', label: '选择', icon: '↖', hotkey: '1' },
  { key: 'pattern', label: '画线族', icon: '╱', hotkey: '2' },
  { key: 'line', label: '画单线', icon: '∕', hotkey: '3' },
  { key: 'pan', label: '平移', icon: '✥', hotkey: '4' }
]

function setTool(key) {
  ui.setTool(key)
}

function undo() {
  history.undo()
}
function redo() {
  history.redo()
}

/** 立即保存到浏览器本地（重新打开自动恢复） */
function saveLocal() {
  saveProjectNow(project)
  message.success('已保存到浏览器本地（重新打开页面自动恢复）')
}

/**
 * 新建空白项目：清空图案、选择、撤销历史与本地存档。
 * 若当前画布非空先弹确认，避免误清空。材料参数（条长/kerf）保留。
 */
function newProject() {
  if (project.patterns.length && !window.confirm('新建将清空当前画布（撤销历史也会清除），确定继续吗？')) {
    return
  }
  project.replaceAll({ patterns: [], material: project.material })
  history.clear()
  ui.clearSelection()
  ui.setTool('select')
  clearPersistedProject()
  message.success('已新建空白项目')
  emit('fit')
}

/** 保存为项目文件（.kumiko.json 下载） */
function saveFile() {
  downloadProjectFile(project)
  message.success('已导出项目文件（.kumiko.json）')
}

/** 打开项目文件（替换当前项目，可撤销） */
async function openFile() {
  try {
    const text = await pickAndReadJsonFile()
    if (!text) return
    const data = parseProjectJson(text)
    history.beginEdit(() => {
      project.replaceAll(data)
      ui.clearSelection()
    })
    message.success(`已打开项目：${data.patterns.length} 线族`)
    emit('fit')
  } catch (e) {
    message.error(`打开失败：${e.message}`)
  }
}

function exportSvg() {
  const segs = project.segments
  if (!segs.length) {
    message.warning('画布为空，没有可导出的线段')
    return
  }
  const svg = buildSvgString(segs)
  downloadSvg(svg, 'kumiko-design.svg')
  message.success(`已导出 SVG（${segs.length} 段）`)
}

function toggleGrid() {
  ui.gridEnabled = !ui.gridEnabled
}
function toggleLabels() {
  ui.labelsEnabled = !ui.labelsEnabled
}
</script>

<template>
  <div class="kd-toolbar">
    <div class="tb-group" title="工具">
      <button
        v-for="t in TOOLS"
        :key="t.key"
        class="tb-btn"
        :class="{ active: ui.tool === t.key }"
        @click="setTool(t.key)"
      >
        <span class="tb-ico">{{ t.icon }}</span>{{ t.label }}
      </button>
    </div>

    <div class="tb-sep"></div>

    <div class="tb-group" title="文件">
      <button class="tb-btn" title="新建空白项目（清空画布）" @click="newProject">＋ 新建</button>
      <button class="tb-btn" title="立即保存到浏览器本地（Ctrl+S）" @click="saveLocal">💾 保存</button>
      <button class="tb-btn" title="保存为项目文件 .kumiko.json（下载）" @click="saveFile">⇩ 另存文件</button>
      <button class="tb-btn" title="打开 .kumiko.json 项目文件（替换当前项目，可撤销）" @click="openFile">⇧ 打开文件</button>
    </div>

    <div class="tb-sep"></div>

    <div class="tb-group">
      <button class="tb-btn" :disabled="!history.canUndo" title="撤销 (Ctrl+Z)" @click="undo">↩ 撤销</button>
      <button class="tb-btn" :disabled="!history.canRedo" title="重做 (Ctrl+Y)" @click="redo">↪ 重做</button>
    </div>

    <div class="tb-sep"></div>

    <div class="tb-group">
      <button class="tb-btn" title="显示/隐藏 mm 网格" :class="{ active: ui.gridEnabled }" @click="toggleGrid">⊞ 网格</button>
      <button class="tb-btn" title="显示全部尺寸标注" :class="{ active: ui.labelsEnabled }" @click="toggleLabels">尺 标注</button>
      <button class="tb-btn" title="适配视图到图案" @click="emit('fit')">⤢ 适配</button>
    </div>

    <div class="tb-sep"></div>

    <div class="tb-group">
      <button class="tb-btn primary" @click="emit('open-presets')">＋ 预设纹样</button>
      <button class="tb-btn" @click="emit('open-ai')">✦ AI 生成</button>
      <button class="tb-btn" @click="selection.duplicateSelected()">⧉ 复制</button>
      <button class="tb-btn danger" @click="selection.deleteSelected()">🗑 删除选中</button>
    </div>

    <div class="tb-spacer"></div>

    <div class="tb-group">
      <button class="tb-btn" title="算料（1D 切割清单）" @click="emit('open-cutlist')">📏 算料</button>
      <button class="tb-btn" @click="exportSvg">⬇ 导出 SVG</button>
    </div>

    <div class="tb-status">
      {{ project.patterns.length }} 图案 · {{ project.segments.length }} 段
      <span v-if="ui.tool === 'pattern'">· 拖拽画一族平行线</span>
      <span v-else-if="ui.tool === 'line'">· 拖拽画一根线段（Esc 取消）</span>
    </div>
  </div>
</template>

<style scoped>
.kd-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: #fbfbf9;
  border-bottom: 1px solid var(--kd-border);
  flex-wrap: wrap;
  font-size: 13px;
}
.tb-group { display: flex; gap: 4px; align-items: center; }
.tb-sep { width: 1px; height: 22px; background: var(--kd-border); margin: 0 4px; }
.tb-btn {
  border: 1px solid transparent;
  background: transparent;
  border-radius: 6px;
  padding: 5px 10px;
  cursor: pointer;
  font-size: 13px;
  color: #333;
  white-space: nowrap;
}
.tb-btn:hover { background: #eef0f5; }
.tb-btn.active { background: #e8effc; border-color: #b7cdf0; color: #1f4e9c; }
.tb-btn.primary { background: #1f4e9c; color: #fff; }
.tb-btn.primary:hover { background: #2a5fb8; }
.tb-btn.danger:hover { background: #fdeceb; color: #c0392b; }
.tb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.tb-ico { margin-right: 3px; }
.tb-spacer { flex: 1; }
.tb-status { font-size: 12px; color: #777; margin-left: 8px; white-space: nowrap; }
</style>
