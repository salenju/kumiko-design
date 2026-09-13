<script setup>
/**
 * LayoutModal —— 初始化框架
 *
 * 输入 x 行、y 列、间距（单元格宽/高）、起点、木条宽与末端切口角，
 * 由 core/library/frame.js 用**线条**生成格子框架：
 *   - 横线 rows + 1 条（中心距 pitchY）
 *   - 竖线 cols + 1 条（中心距 pitchX）
 * 这些线是真实木条，相互求交后切成单元格边界段 → 画布上呈现实线网格。
 * 生成的 rows×cols 个单元格用于「点格子 → 从图案库填入图案」。
 */
import { ref, computed, watch } from 'vue'
import { NModal, NCard, NInputNumber, NButton, NSwitch, useMessage } from 'naive-ui'
import { useProjectStore } from '../../stores/project.js'
import { useUiStore } from '../../stores/ui.js'
import { useHistoryStore } from '../../stores/history.js'
import { defaultLayout, frameLineCount, layoutBounds } from '../../core/library/index.js'

const props = defineProps({ show: Boolean })
const emit = defineEmits(['update:show', 'fit'])

const project = useProjectStore()
const ui = useUiStore()
const history = useHistoryStore()
const message = useMessage()

const form = ref(defaultLayout())

watch(
  () => props.show,
  (v) => {
    if (v) form.value = { ...project.layout, origin: { ...project.layout.origin } }
  }
)

const cellCount = computed(() => Math.max(1, Math.round(form.value.rows)) * Math.max(1, Math.round(form.value.cols)))
const lines = computed(() => frameLineCount(form.value))
const frameSize = computed(() => layoutBounds(form.value) || { w: 0, h: 0 })
const boundCount = computed(() => project.groups.filter((g) => g.cell).length)

function apply() {
  history.beginEdit(() => {
    project.setLayout({ ...form.value, enabled: true })
    ui.setSlotVisible(true)
  })
  emit('update:show', false)
  emit('fit')
  message.success(`已生成框架：横线 ${lines.value.horizontal} 条 + 竖线 ${lines.value.vertical} 条（${form.value.rows} 行 × ${form.value.cols} 列）`)
}

function refresh() {
  if (!project.groups.length) return
  history.beginEdit(() => project.rebuildGroups())
  emit('fit')
  message.success('已按当前框架重排实例')
}

function clearSlots() {
  history.beginEdit(() => project.clearLayout(true))
  ui.clearSelectedSlot()
  emit('update:show', false)
  message.success('已清除框架线条（图案保留为自由放置）')
}

function clearAll() {
  if (!window.confirm('将同时删除框架内由图案库生成的图案，确定继续吗？')) return
  history.beginEdit(() => project.clearLayout(false))
  ui.clearSelectedSlot()
  emit('update:show', false)
  message.success('已清除框架与相关图案')
}
</script>

<template>
  <n-modal :show="props.show" @update:show="emit('update:show', $event)">
    <n-card style="width: 580px; max-width: 94vw" title="初始化框架" :bordered="false">
      <div class="lm-row">
        <label>行数 x</label>
        <n-input-number v-model:value="form.rows" :min="1" :max="200" :step="1" style="flex: 1" />
        <label>列数 y</label>
        <n-input-number v-model:value="form.cols" :min="1" :max="200" :step="1" style="flex: 1" />
      </div>
      <div class="lm-row">
        <label>横向间距 mm</label>
        <n-input-number v-model:value="form.pitchX" :min="2" :max="10000" :step="10" style="flex: 1" />
        <label>纵向间距 mm</label>
        <n-input-number v-model:value="form.pitchY" :min="2" :max="10000" :step="10" style="flex: 1" />
      </div>
      <div class="lm-row">
        <label>起点 X mm</label>
        <n-input-number v-model:value="form.origin.x" :step="10" style="flex: 1" />
        <label>起点 Y mm</label>
        <n-input-number v-model:value="form.origin.y" :step="10" style="flex: 1" />
      </div>
      <div class="lm-row">
        <label>框架木条宽 mm</label>
        <n-input-number v-model:value="form.width" :min="0.1" :max="50" :step="0.5" style="flex: 1" />
        <label>末端切口角 °</label>
        <n-input-number v-model:value="form.endCut" :min="10" :max="170" :step="5" style="flex: 1" />
      </div>
      <div class="lm-row">
        <label>显示单元格高亮</label>
        <n-switch :value="ui.slotVisible" @update:value="ui.setSlotVisible" />
      </div>

      <div class="lm-summary">
        将生成 <b>{{ lines.horizontal }}</b> 条横线 + <b>{{ lines.vertical }}</b> 条竖线
        （间距 {{ form.pitchX }} / {{ form.pitchY }} mm）→ 形成 <b>{{ form.rows }} 行 × {{ form.cols }} 列 = {{ cellCount }}</b> 个单元格，
        框架尺寸 <b>{{ frameSize.w.toFixed(0) }} × {{ frameSize.h.toFixed(0) }} mm</b>
        <span v-if="boundCount"> · 已有 <b>{{ boundCount }}</b> 个实例绑定单元格（改参数会自动跟随重排）</span>
      </div>
      <div class="lm-note">
        框架线条是真实木条（参与求交切分、算料与图案部件统计）；改行列或间距会整体重建线条。
        生成后：点某个单元格可选中它，再从「图案库」单击图案即可填入该格（也可把图案直接拖到格子上）。
      </div>

      <template #footer>
        <div class="lm-footer">
          <div class="lm-footer-left">
            <n-button v-if="boundCount" size="small" @click="refresh">按框架重排</n-button>
            <n-button v-if="project.layout.enabled" size="small" @click="clearSlots">清除框架（保留图案）</n-button>
            <n-button v-if="project.layout.enabled && project.groups.length" size="small" type="error" tertiary @click="clearAll">
              清除框架与图案
            </n-button>
          </div>
          <div class="lm-footer-right">
            <n-button @click="emit('update:show', false)">取消</n-button>
            <n-button type="primary" @click="apply">
              {{ project.layout.enabled ? '更新框架' : '生成框架' }}
            </n-button>
          </div>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<style scoped>
.lm-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.lm-row label { width: 116px; flex: none; font-size: 13px; color: #555; }
.lm-summary { background: #eef4ff; border-radius: 6px; padding: 8px 10px; font-size: 13px; margin-top: 4px; line-height: 1.6; }
.lm-note { font-size: 12px; color: #888; line-height: 1.6; margin-top: 6px; }
.lm-footer { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.lm-footer-left, .lm-footer-right { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
