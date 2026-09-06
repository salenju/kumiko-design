<script setup>
/**
 * Toolbar —— 顶部工具（V2 §6 Toolbar.vue）
 */
import { ref, nextTick, computed } from 'vue'
import { NModal, NCard, NInput, useMessage } from 'naive-ui'
import { useUiStore } from '../../stores/ui.js'
import { useHistoryStore } from '../../stores/history.js'
import { useProjectStore } from '../../stores/project.js'
import { useSelection } from '../../composables/useSelection.js'
import { buildSvgString, downloadSvg } from '../../utils/exportSvg.js'
import {
  downloadProjectFile,
  parseProjectJson,
  pickAndReadJsonFile,
  sanitizeFileBase
} from '../../utils/projectFile.js'
import { buildConstructionEntries } from '../../utils/constructionDoc.js'
import { downloadZip } from '../../utils/zip.js'
import { colorForSeg } from '../../core/colors.js'
import { saveProjectNow, clearPersistedProject } from '../../utils/persist.js'
import { formatShortcut } from '../../utils/platform.js'

const emit = defineEmits(['open-presets', 'open-ai', 'open-cutlist', 'open-parts', 'open-settings', 'fit'])
const ui = useUiStore()
const history = useHistoryStore()
const project = useProjectStore()
const message = useMessage()

const selection = useSelection()

const TOOLS = [
  { key: 'select', label: '选择', icon: '↖', hotkey: 'V', hint: '点选 / 框选 / 拖拽移动（Shift 加选）' },
  { key: 'pattern', label: '画线族', icon: '╱', hotkey: 'G', hint: '拖拽画一族平行线（自动吸附网格/角度）' },
  { key: 'line', label: '画单线', icon: '∕', hotkey: 'L', hint: '拖拽画一根独立线段' },
  { key: 'pan', label: '平移', icon: '✥', hotkey: 'H', hint: '拖拽平移画布；也可按住空格+拖拽临时平移' }
]

const TOOL_TITLE = (t) => `${t.hint}（快捷键 ${t.hotkey}）`

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

/** 命名弹窗：file = 导出单个 .kumiko.json；zip = 导出施工资料包 */
const showExport = ref(false)
const exportMode = ref('file') // 'file' | 'zip'
const exportName = ref('')
const exportInputRef = ref(null)

const exportDialogTitle = computed(() =>
  exportMode.value === 'zip' ? '导出施工资料包' : '导出项目文件'
)
const exportNamePlaceholder = computed(() =>
  exportMode.value === 'zip' ? '如：麻叶纹 300（施工包）' : '如：麻叶纹 300'
)
const exportActionLabel = computed(() => (exportMode.value === 'zip' ? '导出施工包' : '导出'))

function openExportDialog() {
  exportName.value = ''
  exportMode.value = 'file'
  showExport.value = true
  nextTick(() => exportInputRef.value?.focus())
}

function openConstructionDialog() {
  if (!project.patterns.length) {
    message.warning('画布为空，没有可导出的施工资料')
    return
  }
  exportName.value = ''
  exportMode.value = 'zip'
  showExport.value = true
  nextTick(() => exportInputRef.value?.focus())
}

function exportFile() {
  const base = sanitizeFileBase(exportName.value)
  if (!base) {
    message.warning('请输入导出文件名')
    return
  }
  if (exportMode.value === 'zip') {
    const data = {
      version: project.version,
      patterns: project.patterns,
      material: project.material,
      spacingUnit: project.spacingUnit,
      lineColors: project.lineColors,
      segments: project.segments
    }
    const svg = buildSvgString(data.segments, { strokeOf: (s) => colorForSeg(data.lineColors, s) })
    const entries = buildConstructionEntries(data, svg, base)
    downloadZip(entries, `${base}.zip`)
    showExport.value = false
    message.success(`已导出施工资料包 ${base}.zip（json/设计图/施工单/算料/部件）`)
    return
  }
  downloadProjectFile(project, base)
  showExport.value = false
  message.success(`已导出项目文件：${base}.kumiko.json`)
}

/** 导入项目文件（替换当前项目，可撤销） */
async function importFile() {
  try {
    const text = await pickAndReadJsonFile()
    if (!text) return
    const data = parseProjectJson(text)
    history.beginEdit(() => {
      project.replaceAll(data)
      ui.clearSelection()
    })
    message.success(`已导入项目：${data.patterns.length} 图案`)
    emit('fit')
  } catch (e) {
    message.error(`导入失败：${e.message}`)
  }
}

function exportSvg() {
  const segs = project.segments
  if (!segs.length) {
    message.warning('画布为空，没有可导出的线段')
    return
  }
  const svg = buildSvgString(segs, { strokeOf: (s) => colorForSeg(project.lineColors, s) })
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
    <div class="tb-group" title="工具（快捷键）">
      <button
        v-for="t in TOOLS"
        :key="t.key"
        class="tb-btn"
        :class="{ active: ui.tool === t.key }"
        :title="`${t.hint}（快捷键 ${t.hotkey}）`"
        @click="setTool(t.key)"
      >
        <span class="tb-ico">{{ t.icon }}</span>{{ t.label }}<kbd class="tb-key">{{ t.hotkey }}</kbd>
      </button>
    </div>

    <div class="tb-sep"></div>

    <!-- 纹样：往画布添加 -->
    <div class="tb-group">
      <button class="tb-btn primary" @click="emit('open-presets')">＋ 预设纹样</button>
      <button class="tb-btn" @click="emit('open-ai')">✦ AI 生成</button>
    </div>

    <div class="tb-sep"></div>

    <!-- 编辑：通用编辑动作 -->
    <div class="tb-group">
      <button class="tb-btn" :disabled="!history.canUndo" :title="`撤销（${formatShortcut(['mod', 'z'])}）`" @click="undo">↩ 撤销</button>
      <button class="tb-btn" :disabled="!history.canRedo" :title="`重做（${formatShortcut(['mod', 'shift', 'z'])}）`" @click="redo">↪ 重做</button>
      <button class="tb-btn" :title="`复制选中（${formatShortcut(['mod', 'd'])}）`" @click="selection.duplicateSelected()">⧉ 复制</button>
      <button class="tb-btn danger" title="删除选中（Del/Backspace）" @click="selection.deleteSelected()">🗑 删除选中</button>
    </div>

    <div class="tb-sep"></div>

    <!-- 视图：显示相关 -->
    <div class="tb-group">
      <button class="tb-btn" title="显示/隐藏 mm 网格" :class="{ active: ui.gridEnabled }" @click="toggleGrid">⊞ 网格</button>
      <button class="tb-btn" title="显示全部尺寸标注" :class="{ active: ui.labelsEnabled }" @click="toggleLabels">尺 标注</button>
      <button class="tb-btn" :title="`适配视图到图案（${formatShortcut(['mod', '0'])}）`" @click="emit('fit')">⤢ 适配</button>
    </div>

    <div class="tb-sep"></div>

    <!-- 文件：项目存取 -->
    <div class="tb-group" title="文件">
      <button class="tb-btn" title="新建空白项目（清空当前画布）" @click="newProject">＋ 新建</button>
      <button class="tb-btn" :title="`立即保存到浏览器本地（${formatShortcut(['mod', 's'])}）`" @click="saveLocal">💾 保存</button>
      <button class="tb-btn" title="导出项目文件 .kumiko.json（先输入导出文件名）" @click="openExportDialog">⇩ 导出文件</button>
      <button class="tb-btn" title="导入 .kumiko.json 项目文件（替换当前项目，可撤销）" @click="importFile">⇧ 导入文件</button>
      <button class="tb-btn" title="设置：全局间距单位、线条按角度颜色（随项目保存）" @click="emit('open-settings')">⚙ 设置</button>
    </div>

    <div class="tb-spacer"></div>

    <!-- 施工：生产/导出资料 -->
    <div class="tb-group">
      <button class="tb-btn success" title="导出施工资料包 zip：项目JSON + 设计图SVG + 施工单HTML + 算料/部件CSV（先输入包名）" @click="openConstructionDialog">✔ 导出施工</button>
      <button class="tb-btn" title="图案部件：统计同型整根本条（尺寸+插口间距+插口数）" @click="emit('open-parts')">🔩 图案部件</button>
      <button class="tb-btn" title="算料（1D 切割清单）" @click="emit('open-cutlist')">📏 算料</button>
      <button class="tb-btn" @click="exportSvg">⬇ 导出 SVG</button>
    </div>

    <div class="tb-status">
      {{ project.patterns.length }} 图案 · {{ project.segments.length }} 段
      <span v-if="ui.tool === 'select'">· V 选择 | 空格=临时平移</span>
      <span v-else-if="ui.tool === 'pattern'">· G 画线族 | 空格=临时平移</span>
      <span v-else-if="ui.tool === 'line'">· L 画单线（Esc 取消）| 空格=临时平移</span>
      <span v-else>· H 平移 / 空格+拖拽</span>
    </div>

    <n-modal v-model:show="showExport" @update:show="(v) => (showExport = v)">
      <n-card style="width: 460px; max-width: 92vw" :title="exportDialogTitle" :bordered="false" size="medium">
        <div class="tb-export">
          <label>{{ exportMode === 'zip' ? '压缩包名称' : '导出文件名' }}</label>
          <n-input
            ref="exportInputRef"
            v-model:value="exportName"
            :placeholder="exportNamePlaceholder"
            :maxlength="120"
            clearable
            @keydown.enter.prevent="exportFile"
          />
          <div v-if="exportMode === 'zip'" class="tb-export-note">
            将下载 <code>&lt;名称&gt;.zip</code>，内含：<code>&lt;名称&gt;.json</code>（项目文件，与包同名）、
            <code>-设计图.svg</code>、<code>-施工单.html</code>（材料参数 + 算料 + 图案部件 + 设计图预览）、
            <code>-算料.csv</code>、<code>-图案部件.csv</code>。
          </div>
          <div v-else class="tb-export-note">将导出为 <code>&lt;名称&gt;.kumiko.json</code>（无需输入扩展名）。</div>
        </div>
        <template #footer>
          <div style="display: flex; justify-content: flex-end; gap: 8px">
            <n-button @click="showExport = false">取消</n-button>
            <n-button :type="exportMode === 'zip' ? 'success' : 'primary'" :disabled="!exportName.trim()" @click="exportFile">{{ exportActionLabel }}</n-button>
          </div>
        </template>
      </n-card>
    </n-modal>
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
/* 「导出施工」：naive-ui 成功色 */
.tb-btn.success { background: #18a058; color: #fff; }
.tb-btn.success:hover { background: #0f7c43; }
.tb-btn.danger:hover { background: #fdeceb; color: #c0392b; }
.tb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.tb-ico { margin-right: 3px; }
.tb-key {
  display: inline-block;
  margin-left: 5px;
  padding: 0 4px;
  font-size: 10px;
  line-height: 14px;
  border: 1px solid #c9ced8;
  border-bottom-width: 2px;
  border-radius: 4px;
  background: #fff;
  color: #667;
  font-family: inherit;
}
.tb-btn.active .tb-key { border-color: #b7cdf0; color: #2a5fb8; }
.tb-spacer { flex: 1; }
.tb-status { font-size: 12px; color: #777; margin-left: 8px; white-space: nowrap; }
.tb-export { display: flex; flex-direction: column; gap: 8px; }
.tb-export label { font-size: 13px; color: #333; }
.tb-export-note { font-size: 12px; color: #888; line-height: 1.5; }
.tb-export-note code { background: #eef0f5; border-radius: 4px; padding: 0 4px; }
</style>
