<script setup>
/**
 * Toolbar —— 顶部工具（V2 §6 Toolbar.vue）
 */
import { ref, nextTick, computed } from 'vue'
import { NModal, NCard, NInput, useMessage } from 'naive-ui'
import { useUiStore } from '../../stores/ui.js'
import { useHistoryStore } from '../../stores/history.js'
import { useProjectStore } from '../../stores/project.js'
import { useWorkspaceStore } from '../../stores/workspace.js'
import { useSelection } from '../../composables/useSelection.js'
import { buildSvgString, downloadSvg } from '../../utils/exportSvg.js'
import { downloadProjectFile, sanitizeFileBase } from '../../utils/projectFile.js'
import { buildConstructionEntries } from '../../utils/constructionDoc.js'
import { downloadZip } from '../../utils/zip.js'
import { colorForSeg } from '../../core/colors.js'
import { formatShortcut } from '../../utils/platform.js'

const emit = defineEmits([
  'open-library',
  'open-layout',
  'open-ai',
  'open-cutlist',
  'open-parts',
  'open-settings',
  'open-workspace',
  'fit'
])
const ui = useUiStore()
const history = useHistoryStore()
const project = useProjectStore()
const workspace = useWorkspaceStore()
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

/** 立即暂存到当前作品（重新打开自动恢复） */
async function saveLocal() {
  try {
    await workspace.saveCurrentNow()
    message.success(`已暂存「${workspace.currentWork?.name || '当前作品'}」`)
  } catch (e) {
    message.error(`暂存失败：${e?.message || e}`)
  }
}

/**
 * 新建空白作品并切换编辑。
 * 材料参数（条长/kerf）、间距单位、线条配色保留；图案与撤销历史清空。
 */
async function newProject() {
  if (
    project.patterns.length &&
    !window.confirm('新建将切换到一份空白作品（当前作品仍保留在工作区，撤销历史会清除），确定继续吗？')
  ) {
    return
  }
  ui.setTool('select')
  const rec = await workspace.createWork()
  message.success(`已新建「${rec.name}」`)
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
      groups: project.groups,
      layout: project.layout,
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

/**
 * 导入项目文件：作为「新作品」加入工作区并打开（不覆盖当前作品）。
 * 支持多选，逐个导入，文件名作为作品名。
 */
async function importFile() {
  try {
    const r = await workspace.importFromPicker()
    if (!r.created.length && !r.failed.length) return
    if (r.created.length) {
      const last = r.created[r.created.length - 1]
      await workspace.openWork(last.id)
      message.success(`已导入 ${r.created.length} 个作品，并打开「${last.name}」`)
      emit('fit')
    }
    if (r.failed.length) {
      message.error(`${r.failed.length} 个文件导入失败：${r.failed[0].message}`)
    }
  } catch (e) {
    message.error(`导入失败：${e?.message || e}`)
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

    <!-- 图案：图案库（含原「预设」的全部图案与参数弹窗） -->
    <div class="tb-group">
      <button class="tb-btn primary" title="图案库：分类浏览图案模块，单击插入 / 参数弹窗 / 拖拽到画布（拖到格子吸附）；也可在此生成初始化框架" @click="emit('open-library')">▤ 图案库</button>
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

    <!-- 文件：工作区与项目存取 -->
    <div class="tb-group" title="文件与工作区">
      <button class="tb-btn ws" title="工作区：多作品暂存/恢复/管理、备份全部" @click="emit('open-workspace')">🗂 工作区</button>
      <button class="tb-btn" title="新建空白作品（当前作品保留在工作区）" @click="newProject">＋ 新建</button>
      <button class="tb-btn" :title="`立即暂存当前作品（${formatShortcut(['mod', 's'])}）`" @click="saveLocal">💾 保存</button>
      <button class="tb-btn" title="导出当前作品为 .kumiko.json（先输入导出文件名）" @click="openExportDialog">⇩ 导出文件</button>
      <button class="tb-btn" title="导入 .kumiko.json（可多选）为新作品并打开" @click="importFile">⇧ 导入文件</button>
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
      <button class="tb-work" title="打开工作区" @click="emit('open-workspace')">
        {{ workspace.currentWork?.name || '未命名作品' }}
      </button>
      · {{ project.patterns.length }} 图案 · {{ project.segments.length }} 段
      <span v-if="workspace.saving" class="tb-saving">保存中…</span>
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
.tb-status { font-size: 12px; color: #777; margin-left: 8px; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; }
.tb-work {
  border: 1px solid var(--kd-border);
  background: #fff;
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 12px;
  color: #1f4e9c;
  cursor: pointer;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tb-work:hover { background: #eef2fa; }
.tb-saving { color: #18a058; }
/* 「工作区」按钮：与普通按钮区分（浅蓝底） */
.tb-btn.ws { background: #eef2fa; border-color: #d3e0f5; color: #1f4e9c; }
.tb-btn.ws:hover { background: #e2eaf8; }
.tb-export { display: flex; flex-direction: column; gap: 8px; }
.tb-export label { font-size: 13px; color: #333; }
.tb-export-note { font-size: 12px; color: #888; line-height: 1.5; }
.tb-export-note code { background: #eef0f5; border-radius: 4px; padding: 0 4px; }
</style>
