<script setup>
/**
 * SettingsPanel —— 设置（工具栏 ⚙）
 *  1. 常规：全局间距单位（原位于算料抽屉，现移至此）
 *  2. 线条颜色：按木条方向角度分色（横/竖/斜等按角度各设），可改可新增/删除，
 *     兜底色用于未单独设置的角度；随项目保存并影响画布与 SVG/施工包导出。
 * 交互：改动在弹窗内暂存，点「保存」一次性写入 store 并记为一步撤销；取消不生效。
 */
import { ref, watch } from 'vue'
import {
  NDrawer,
  NDrawerContent,
  NInputNumber,
  NColorPicker,
  NButton
} from 'naive-ui'
import { useProjectStore } from '../../stores/project.js'
import { useHistoryStore } from '../../stores/history.js'
import { defaultColorScheme, normalizeDirDeg } from '../../core/colors.js'

const props = defineProps({ show: Boolean })
const emit = defineEmits(['update:show'])

const project = useProjectStore()
const history = useHistoryStore()

/** 本地暂存工作副本（保存时一次性写回 store） */
const localUnit = ref(10)
const localFallback = ref('#222222')
const localHover = ref('#d64541')
const localSelected = ref('#1f4e9c')
const localAngles = ref([])

function syncFromProject() {
  localUnit.value = project.spacingUnit
  const s = defaultColorScheme()
  const scheme = project.lineColors || s
  localFallback.value = scheme.fallback || s.fallback
  localHover.value = scheme.hoverColor || s.hoverColor
  localSelected.value = scheme.selectedColor || s.selectedColor
  localAngles.value = (Array.isArray(scheme.angles) ? scheme.angles : []).map((e) => ({ angle: e.angle, color: e.color }))
}

watch(
  () => props.show,
  (v) => {
    if (v) syncFromProject()
  },
  { immediate: true }
)

/** 保存：一次性写 store 并记为一步撤销 */
function applyAndClose() {
  const before = project.snapshot()
  project.setSpacingUnit(localUnit.value)
  project.setLineColors({
    fallback: localFallback.value,
    hoverColor: localHover.value,
    selectedColor: localSelected.value,
    angles: localAngles.value
  })
  if (project.snapshot() !== before) history.push(before)
  emit('update:show', false)
}

function cancelAndClose() {
  emit('update:show', false)
}

/** 恢复默认（仅本地副本，保存后生效） */
function resetToDefault() {
  const d = defaultColorScheme()
  localUnit.value = 10
  localFallback.value = d.fallback
  localHover.value = d.hoverColor
  localSelected.value = d.selectedColor
  localAngles.value = d.angles.map((e) => ({ ...e }))
}

function addAngle() {
  const used = new Set(localAngles.value.map((e) => Math.round(e.angle * 10) / 10))
  let angle = 15
  for (let a = 0; a <= 165; a += 15) {
    if (!used.has(a)) {
      angle = a
      break
    }
  }
  localAngles.value.push({ angle, color: '#555555' })
}

function removeAngle(i) {
  localAngles.value.splice(i, 1)
}

/** 角度显示名（演示用） */
function dirName(a) {
  const k = Math.round(normalizeDirDeg(a) * 10) / 10
  if (k === 0) return '横'
  if (k === 90) return '竖'
  return '斜'
}
</script>

<template>
  <n-drawer
    :show="props.show"
    :width="560"
    placement="right"
    :mask-closable="false"
    @update:show="(v) => !v && emit('update:show', false)"
  >
    <n-drawer-content title="设置" closable>
      <div class="kd-set-block">
        <div class="kd-set-title">常规</div>
        <div class="kd-set-row">
          <label>全局间距单位 mm</label>
          <n-input-number v-model:value="localUnit" :min="1" :max="500" :step="1" style="width: 140px" />
        </div>
        <div class="kd-set-note">
          线族「间距」与单线「相邻线间距」在属性面板按 Nx = N × 单位设置（原位于算料抽屉，已移至本设置）。
          改单位不影响已画线段的实际间距。
        </div>
      </div>

      <div class="kd-set-block">
        <div class="kd-set-title">线条颜色（按木条方向角度）</div>
        <div class="kd-set-note">
          线族与单线按其方向角度取色（0° 与 180° 同向算同色），可新增/修改/删除常用角度条目；
          未单独设置的角度使用「其它角度」底色。颜色随项目保存，并作用于画布、导出 SVG 与施工包设计图。
        </div>

        <div class="kd-set-row kd-set-fallback">
          <label>其它角度（未单独设置）</label>
          <n-color-picker v-model:value="localFallback" :show-alpha="false" size="small" style="width: 150px" />
        </div>
        <div class="kd-set-row">
          <label>悬停高亮色（鼠标移到线段）</label>
          <n-color-picker v-model:value="localHover" :show-alpha="false" size="small" style="width: 150px" />
        </div>
        <div class="kd-set-row">
          <label>选中高亮色（选中族描边）</label>
          <n-color-picker v-model:value="localSelected" :show-alpha="false" size="small" style="width: 150px" />
        </div>
        <div class="kd-set-note">悬停/选中以半透明描边环叠加显示，可单独改色避免与线条本身颜色相近冲突。</div>

        <div v-for="(e, i) in localAngles" :key="`${e.angle}-${i}`" class="kd-set-row kd-set-angle-row">
          <label class="kd-angle-label">{{ dirName(e.angle) }} {{ e.angle }}°</label>
          <n-input-number
            v-model:value="e.angle"
            :min="0"
            :max="179.9"
            :step="5"
            size="small"
            style="width: 110px"
            class="kd-settings-angle"
          />
          <n-color-picker v-model:value="e.color" :show-alpha="false" size="small" style="width: 150px" />
          <n-button size="tiny" quaternary type="error" title="删除该角度颜色" @click="removeAngle(i)">✕</n-button>
        </div>

        <div class="kd-set-actions">
          <n-button size="small" secondary @click="addAngle">＋ 添加角度</n-button>
          <n-button size="small" secondary @click="resetToDefault">恢复默认</n-button>
        </div>
      </div>

      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 8px">
          <n-button @click="cancelAndClose">取消</n-button>
          <n-button type="primary" @click="applyAndClose">保存</n-button>
        </div>
      </template>
    </n-drawer-content>
  </n-drawer>
</template>

<style scoped>
.kd-set-block { margin-bottom: 16px; }
.kd-set-title { font-weight: 600; font-size: 13px; border-left: 3px solid #18a058; padding-left: 8px; margin-bottom: 10px; }
.kd-set-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.kd-set-row label { width: 190px; flex: none; font-size: 13px; color: #333; }
.kd-set-fallback label { color: #777; }
.kd-set-angle-row label.kd-angle-label { font-size: 13px; color: #333; }
.kd-set-note { font-size: 12px; color: #888; line-height: 1.6; margin: 4px 0 10px; }
.kd-set-actions { display: flex; gap: 8px; margin-top: 6px; }
</style>
