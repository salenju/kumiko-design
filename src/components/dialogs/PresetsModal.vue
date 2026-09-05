<script setup>
/**
 * PresetsModal —— 预设纹样添加（Phase 4 core/presets 的 UI 入口）
 */
import { ref, computed } from 'vue'
import { NModal, NCard, NInputNumber, NButton, NRadioGroup, NRadioButton } from 'naive-ui'
import { PRESETS, generatePatterns } from '../../core/presets/index.js'
import { useProjectStore } from '../../stores/project.js'
import { useUiStore } from '../../stores/ui.js'
import { useHistoryStore } from '../../stores/history.js'
import { uid } from '../../utils/id.js'

const props = defineProps({ show: Boolean })
const emit = defineEmits(['update:show'])

const project = useProjectStore()
const ui = useUiStore()
const history = useHistoryStore()

const presetName = ref('asanoha')
const size = ref(300)
const spacing = ref(20)
const width = ref(3)
const centerX = ref(0)
const centerY = ref(0)

const spacingDefault = computed(() => {
  if (presetName.value === 'asanoha') return 20
  if (presetName.value === 'koushi') return 30
  return 30
})

function choosePreset(name) {
  presetName.value = name
  spacing.value = spacingDefault.value
}

function close() {
  emit('update:show', false)
}

function add() {
  const patterns = generatePatterns(presetName.value, {
    cx: centerX.value,
    cy: centerY.value,
    size: size.value,
    spacing: spacing.value,
    width: width.value
  })
  if (!patterns.length) return
  history.beginEdit(() => {
    project.addPatterns(patterns)
    ui.setSelectedPatterns(patterns.map((p) => p.id))
  })
  close()
}

function estimateSegments() {
  // 估算：不实际派生，仅提示（粗算）
  const familyCount = presetName.value === 'asanoha' ? 3 : 2
  const linesPer = Math.ceil(size.value / spacing.value) + 1
  const cuts = familyCount * (familyCount - 1) * linesPer * linesPer
  return Math.max(0, Math.round(cuts))
}
</script>

<template>
  <n-modal :show="props.show" @update:show="emit('update:show', $event)">
    <n-card style="width: 720px; max-width: 92vw" title="添加预设纹样" :bordered="false" size="huge">
      <div class="pm-row">
        <label>纹样</label>
        <n-radio-group v-model:value="presetName" class="pm-preset-group" @update:value="choosePreset">
          <n-radio-button v-for="(p, k) in PRESETS" :key="k" :value="k">
            {{ p.label }}
          </n-radio-button>
        </n-radio-group>
      </div>
      <div class="pm-row">
        <label>外框尺寸 mm</label>
        <n-input-number v-model:value="size" :min="10" :max="10000" :step="10" />
      </div>
      <div class="pm-row">
        <label>间距 mm</label>
        <n-input-number v-model:value="spacing" :min="1" :max="500" :step="1" />
      </div>
      <div class="pm-row">
        <label>木条宽 mm</label>
        <n-input-number v-model:value="width" :min="0.5" :max="50" :step="0.5" />
      </div>
      <div class="pm-row">
        <label>中心 X mm</label>
        <n-input-number v-model:value="centerX" :min="-10000" :max="10000" :step="10" />
      </div>
      <div class="pm-row">
        <label>中心 Y mm</label>
        <n-input-number v-model:value="centerY" :min="-10000" :max="10000" :step="10" />
      </div>
      <div class="pm-hint">预计派生约 {{ estimateSegments() }} 段（网格近似）。生成后可在右侧面板微调各线族参数。</div>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 8px">
          <n-button @click="close">取消</n-button>
          <n-button type="primary" @click="add">添加到画布</n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<style scoped>
.pm-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.pm-row label { width: 110px; flex: none; font-size: 13px; color: #555; }
/* class 透传到 n-radio-group 根元素：覆盖为可换行弹性布局，纹样选项不溢出 */
.pm-preset-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
}
.pm-hint { font-size: 12px; color: #888; margin-top: 4px; }
</style>
