<script setup>
/**
 * AiModal —— AI 生成入口（V2 §8.7 Phase 4 预留）
 * 当前实现：本地关键词解析（parseIntent），未来替换为 LLM function-calling，
 * 几何始终由 core/presets 本地生成。
 */
import { ref } from 'vue'
import { NModal, NCard, NInput, NButton, NAlert } from 'naive-ui'
import { parseIntent } from '../../ai/parseIntent.js'
import { generatePatterns, PRESETS } from '../../core/presets/index.js'
import { useProjectStore } from '../../stores/project.js'
import { useUiStore } from '../../stores/ui.js'
import { useHistoryStore } from '../../stores/history.js'

const props = defineProps({ show: Boolean })
const emit = defineEmits(['update:show'])

const project = useProjectStore()
const ui = useUiStore()
const history = useHistoryStore()

const prompt = ref('')
const result = ref(null)
const error = ref('')

function close() {
  emit('update:show', false)
  prompt.value = ''
  result.value = null
  error.value = ''
}

function parse() {
  error.value = ''
  result.value = null
  if (!prompt.value.trim()) {
    error.value = '请输入描述，例如：生成一个 30cm 的麻叶纹'
    return
  }
  const r = parseIntent(prompt.value)
  if (!r) {
    error.value = '未能识别纹样类型。试试：麻叶纹 / 方格纹 / 斜格纹，可附带尺寸如 30cm、200mm。'
    return
  }
  result.value = r
}

function add() {
  if (!result.value) return
  const patterns = generatePatterns(result.value.preset, {
    cx: 0,
    cy: 0,
    size: result.value.params.size,
    spacing: result.value.params.spacing,
    width: 3
  })
  history.beginEdit(() => {
    project.addPatterns(patterns)
    ui.setSelectedPatterns(patterns.map((p) => p.id))
  })
  close()
}
</script>

<template>
  <n-modal :show="props.show" @update:show="emit('update:show', $event)">
    <n-card style="width: 520px" title="AI 生成纹样（Phase 4 接口）" :bordered="false" size="huge">
      <div style="margin-bottom: 10px">
        <n-input
          v-model:value="prompt"
          type="textarea"
          :rows="2"
          placeholder="例如：生成一个 30cm 的麻叶纹"
          @keydown.enter.prevent="parse"
        />
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 12px">
        <n-button size="small" @click="parse">解析意图</n-button>
      </div>

      <n-alert v-if="error" type="warning" :show-icon="false" style="margin-bottom: 10px">
        {{ error }}
      </n-alert>

      <n-alert v-if="result" type="info" :show-icon="false" style="margin-bottom: 10px">
        识别为 <b>{{ PRESETS[result.preset].label }}</b>（{{ result.preset }}），外框
        {{ result.params.size }}mm、间距 {{ result.params.spacing }}mm。
      </n-alert>

      <template #footer>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span style="font-size: 12px; color: #999">
            当前为本地规则解析；接入 LLM 后行为不变，几何仍由本地生成器产出。
          </span>
          <div style="display: flex; gap: 8px">
            <n-button @click="close">关闭</n-button>
            <n-button type="primary" :disabled="!result" @click="add">添加到画布</n-button>
          </div>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>
