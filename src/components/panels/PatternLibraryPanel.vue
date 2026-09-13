<script setup>
/**
 * PatternLibraryPanel —— 图案库抽屉
 *
 * 交互（见 docs/图案模块化-0913.md §3）：
 *  - 左侧分类导航（含「全部」），顶部搜索
 *  - 卡片：缩略图 + 名称 + 描述 + 操作（参数 / 重命名 / 复制 / 删除）
 *  - 单击卡片 = 直接插入（选中槽位则填入该格，否则放到视图中心）
 *  - 按住卡片拖动 = 进入放置态，落到画布（拖到槽位自动吸附）
 *  - 顶部「＋ 存为图案」= 把当前选中内容归一化为自定义模块
 */
import { ref, computed, onBeforeUnmount } from 'vue'
import {
  NDrawer,
  NDrawerContent,
  NInput,
  NButton,
  NModal,
  NCard,
  NInputNumber,
  NEmpty,
  useMessage
} from 'naive-ui'
import { useProjectStore } from '../../stores/project.js'
import { useUiStore } from '../../stores/ui.js'
import { useHistoryStore } from '../../stores/history.js'
import { useLibraryStore } from '../../stores/library.js'
import { CATEGORIES, searchModules, placeRect, slotRect, frameLineCount } from '../../core/library/index.js'
import PatternThumb from './PatternThumb.vue'

const props = defineProps({ show: Boolean })
const emit = defineEmits(['update:show'])

const project = useProjectStore()
const ui = useUiStore()
const history = useHistoryStore()
const library = useLibraryStore()
const message = useMessage()

const keyword = ref('')
const activeCategory = ref('all')

const NAV = computed(() => [
  { key: 'all', name: '全部' },
  ...CATEGORIES
])

const countOf = computed(() => {
  const acc = { all: library.modules.length }
  for (const c of CATEGORIES) acc[c.key] = 0
  for (const m of library.modules) acc[m.category] = (acc[m.category] || 0) + 1
  return acc
})

const list = computed(() => {
  const base =
    activeCategory.value === 'all'
      ? library.modules
      : library.modules.filter((m) => m.category === activeCategory.value)
  return searchModules(base, keyword.value)
})

/** 框架状态提示 + 当前选中格（无框架时给出引导） */
const slotHint = computed(() => {
  const l = project.layout
  if (!l?.enabled) {
    return '提示：先「▦ 初始化框架」用线条生成格子骨架，点格子后单击图案即可填入；也可直接把图案拖到画布摆放。'
  }
  const n = frameLineCount(l)
  const bound = project.groups.filter((g) => g.cell).length
  const base = `框架：${l.rows} 行 × ${l.cols} 列（横线 ${n.horizontal} + 竖线 ${n.vertical}），已填 ${bound} / ${project.slots.length} 格`
  if (!ui.selectedSlot) return `${base} · 点某个单元格可选中，再单击图案填入`
  return `${base} · 已选中第 ${ui.selectedSlot.row + 1} 行第 ${ui.selectedSlot.col + 1} 列，单击图案即填入该格`
})

/* ---------- 插入 ---------- */

/** 目标矩形：选中槽位优先，否则视图中心 */
function targetRect(params) {
  const slot = ui.selectedSlot
  if (slot && project.layout.enabled) {
    const rect = slotRect(project.layout, slot.row, slot.col)
    return { rect, cell: { row: slot.row, col: slot.col } }
  }
  return { rect: placeRect(ui.center, Number(params?.size) || 300), cell: null }
}

function insertModule(module, overrides) {
  const params = { ...(module.defaults || {}), ...(overrides || {}) }
  const { rect, cell } = targetRect(params)
  history.beginEdit(() => {
    const g = project.addGroup({ module, params, rect, cell })
    if (g) ui.setSelectedPatterns(g.patternIds)
  })
  ui.clearSelectedSlot()
  message.success(`已加入「${module.name}」`)
}

/* ---------- 点击 / 拖拽判定 ---------- */

let press = null

function onCardDown(e, module) {
  if (e.button !== undefined && e.button !== 0) return
  // 卡片内的操作按钮（参数/改名/复制/删除）不触发「点击插入」
  const target = e.target
  if (target && typeof target.closest === 'function' && target.closest('.pl-card-ops')) return
  press = { module, x: e.clientX, y: e.clientY, armed: false }
  window.addEventListener('pointermove', onCardMove)
  window.addEventListener('pointerup', onCardUp)
}

function onCardMove(e) {
  if (!press || press.armed) return
  if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < 6) return
  press.armed = true
  // 进入放置态：落到画布由 KumikoCanvas 负责（拖到槽位自动吸附）
  ui.setPlacing({
    module: press.module,
    params: { ...(press.module.defaults || {}) },
    point: null,
    rect: null,
    cell: null,
    from: 'library'
  })
  message.info('拖到画布放下；拖到槽位上会自动吸附')
}

function onCardUp() {
  const p = press
  press = null
  window.removeEventListener('pointermove', onCardMove)
  window.removeEventListener('pointerup', onCardUp)
  if (!p) return
  if (p.armed) {
    // 拖到画布上松手时画布已提交并清空放置态；仍在放置态说明松手在画布外 → 取消
    if (ui.placing) ui.clearPlacing()
    return
  }
  insertModule(p.module)
}

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onCardMove)
  window.removeEventListener('pointerup', onCardUp)
})

/* ---------- 参数弹窗 ---------- */

const paramModal = ref({ show: false, module: null, values: {} })

function openParams(module) {
  const values = {}
  for (const f of module.schema || []) values[f.key] = module.defaults?.[f.key]
  paramModal.value = { show: true, module, values }
}

function confirmParams() {
  const { module, values } = paramModal.value
  insertModule(module, values)
  paramModal.value = { ...paramModal.value, show: false }
}

/* ---------- 存为图案 / 重命名 / 复制 / 删除 ---------- */

const saveModal = ref({ show: false, name: '', mode: 'create', targetId: null })

function openSaveFromSelection() {
  if (!ui.selectedPatterns.length) {
    message.warning('请先在画布上选中图案（框选或点选）')
    return
  }
  saveModal.value = { show: true, name: `我的图案 ${library.customCount + 1}`, mode: 'create', targetId: null }
}

function openRename(module) {
  saveModal.value = { show: true, name: module.name, mode: 'rename', targetId: module.id }
}

function confirmSaveModal() {
  const { name, mode, targetId } = saveModal.value
  if (mode === 'rename') {
    library.renameCustom(targetId, name)
    message.success('已重命名')
  } else {
    const mod = library.saveFromSelection(ui.selectedPatterns, name)
    if (mod) message.success(`已存为图案「${mod.name}」（我的图案）`)
    else message.error('选中内容无法归一化为图案')
  }
  saveModal.value = { ...saveModal.value, show: false }
}

function duplicateModule(module) {
  library.duplicateCustom(module.id)
  message.success('已复制到「我的图案」')
}

function removeModule(module) {
  library.removeCustom(module.id)
  message.success(`已删除「${module.name}」`)
}

function isCustom(module) {
  return !!module.custom
}
</script>

<template>
  <n-drawer :show="props.show" :width="760" placement="right" @update:show="emit('update:show', $event)">
    <n-drawer-content title="图案库" closable>
      <div class="pl-top">
        <n-input v-model:value="keyword" placeholder="搜索图案名称…" clearable style="flex: 1" />
        <n-button title="用线条生成格子骨架（x 行 × y 列 / 间距）" @click="ui.setLayoutModal(true)">
          ▦ 初始化框架
        </n-button>
        <n-button type="primary" secondary :disabled="!ui.selectedPatterns.length" @click="openSaveFromSelection">
          ＋ 存为图案
        </n-button>
      </div>

      <div class="pl-slot-hint" :class="{ info: project.layout.enabled }">{{ slotHint }}</div>

      <div class="pl-body">
        <div class="pl-nav">
          <button
            v-for="c in NAV"
            :key="c.key"
            class="pl-nav-btn"
            :class="{ active: activeCategory === c.key }"
            @click="activeCategory = c.key"
          >
            <span>{{ c.name }}</span>
            <span class="pl-nav-count">{{ countOf[c.key] || 0 }}</span>
          </button>
          <div class="pl-nav-note">
            单击卡片插入；按住拖动可拖到画布摆放（拖到槽位吸附）。
          </div>
        </div>

        <div class="pl-grid-wrap">
          <n-empty v-if="!list.length" description="该分类下暂无图案" style="margin-top: 32px" />
          <div v-else class="pl-grid">
            <div
              v-for="m in list"
              :key="m.id"
              class="pl-card"
              :title="m.desc"
              @pointerdown="onCardDown($event, m)"
            >
              <pattern-thumb :module="m" :size="84" :color-scheme="project.lineColors" />
              <div class="pl-card-name">{{ m.name }}</div>
              <div class="pl-card-ops">
                <n-button size="tiny" quaternary title="设置参数后插入" @click.stop="openParams(m)">参数</n-button>
                <template v-if="isCustom(m)">
                  <n-button size="tiny" quaternary title="重命名" @click.stop="openRename(m)">改名</n-button>
                  <n-button size="tiny" quaternary title="复制" @click.stop="duplicateModule(m)">复制</n-button>
                  <n-button size="tiny" quaternary type="error" title="删除" @click.stop="removeModule(m)">删除</n-button>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 参数弹窗 -->
      <n-modal :show="paramModal.show" @update:show="(v) => (paramModal = { ...paramModal, show: v })">
        <n-card style="width: 440px; max-width: 92vw" :title="`${paramModal.module?.name || ''} · 参数`" :bordered="false">
          <div v-for="f in paramModal.module?.schema || []" :key="f.key" class="pl-field">
            <label>{{ f.label }}<span v-if="f.unit">（{{ f.unit }}）</span></label>
            <n-input-number
              v-model:value="paramModal.values[f.key]"
              :min="f.min"
              :max="f.max"
              :step="f.step"
              style="width: 100%"
            />
          </div>
          <div class="pl-note">
            末端切口角 90° 为方切（默认）；45° 为斜切。间距为相邻木条中心距。
          </div>
          <template #footer>
            <div style="display: flex; justify-content: flex-end; gap: 8px">
              <n-button @click="paramModal = { ...paramModal, show: false }">取消</n-button>
              <n-button type="primary" @click="confirmParams">添加到画布</n-button>
            </div>
          </template>
        </n-card>
      </n-modal>

      <!-- 存为图案 / 重命名 -->
      <n-modal :show="saveModal.show" @update:show="(v) => (saveModal = { ...saveModal, show: v })">
        <n-card
          style="width: 420px; max-width: 92vw"
          :title="saveModal.mode === 'rename' ? '重命名图案' : '存为图案'"
          :bordered="false"
        >
          <n-input
            v-model:value="saveModal.name"
            :placeholder="saveModal.mode === 'rename' ? '新名称' : '如：我的三角网格'"
            :maxlength="40"
            @keydown.enter.prevent="confirmSaveModal"
          />
          <div v-if="saveModal.mode !== 'rename'" class="pl-note">
            将按当前选中内容的外接矩形归一化，保存到「我的图案」（本机可用，跨作品复用）。
          </div>
          <template #footer>
            <div style="display: flex; justify-content: flex-end; gap: 8px">
              <n-button @click="saveModal = { ...saveModal, show: false }">取消</n-button>
              <n-button type="primary" :disabled="!saveModal.name.trim()" @click="confirmSaveModal">
                {{ saveModal.mode === 'rename' ? '保存' : '存为图案' }}
              </n-button>
            </div>
          </template>
        </n-card>
      </n-modal>
    </n-drawer-content>
  </n-drawer>
</template>

<style scoped>
.pl-top { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.pl-slot-hint {
  background: #f6f6f2; border: 1px solid var(--kd-border); color: #777;
  border-radius: 6px; padding: 6px 10px; font-size: 12px; margin-bottom: 8px; line-height: 1.5;
}
.pl-slot-hint.info { background: #eef4ff; border-color: #cfe0f8; color: #1f4e9c; }
.pl-body { display: flex; gap: 12px; align-items: flex-start; }
.pl-nav { width: 132px; flex: none; display: flex; flex-direction: column; gap: 4px; }
.pl-nav-btn {
  display: flex; justify-content: space-between; align-items: center;
  border: 1px solid transparent; background: transparent; border-radius: 6px;
  padding: 7px 10px; font-size: 13px; cursor: pointer; color: #333; text-align: left;
}
.pl-nav-btn:hover { background: #f1f2f6; }
.pl-nav-btn.active { background: #e8effc; border-color: #b7cdf0; color: #1f4e9c; font-weight: 600; }
.pl-nav-count { font-size: 11px; color: #8a93a3; }
.pl-nav-note { font-size: 11px; color: #9a9a9a; line-height: 1.5; margin-top: 8px; }
.pl-grid-wrap { flex: 1; min-width: 0; }
.pl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 10px;
}
.pl-card {
  border: 1px solid var(--kd-border);
  border-radius: 10px;
  padding: 8px;
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.pl-card:hover { border-color: #b7cdf0; box-shadow: 0 2px 8px rgba(31, 78, 156, 0.08); }
.pl-card:active { cursor: grabbing; }
.pl-card-name { font-size: 13px; font-weight: 600; color: #333; text-align: center; }
.pl-card-ops { display: flex; flex-wrap: wrap; gap: 2px; justify-content: center; }
.pl-field { display: flex; flex-direction: column; gap: 3px; margin-bottom: 10px; }
.pl-field label { font-size: 12px; color: #555; }
.pl-note { font-size: 12px; color: #888; line-height: 1.5; margin-top: 6px; }
</style>
