<script setup>
/**
 * AiModal —— AI 生成入口（V2 §8.7 Phase 4 预留）
 * 当前实现：本地关键词解析（parseIntent），未来替换为 LLM function-calling，
 * 几何始终由**图案库**（core/library）本地生成，插入结果为整体实例。
 */
import { ref } from 'vue'
import { NModal, NCard, NInput, NButton, NAlert } from 'naive-ui'
import { parseIntent, intentKeywords } from '../../ai/parseIntent.js'
import { builtinModule, placeRect } from '../../core/library/index.js'
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
    error.value = `未能识别图案类型。试试：${intentKeywords().join(' / ')}，可附带尺寸如 30cm、200mm。`
    return
  }
  result.value = r
}

/** 与图案库同一路径：生成整体实例（可整体再调参 / 复制 / 删除） */
function add() {
  const r = result.value
  if (!r) return
  const module = builtinModule(r.moduleId)
  if (!module) return
  const params = { ...module.defaults, ...r.params }
  const rect = placeRect(ui.center, params.size)
  history.beginEdit(() => {
    const g = project.addGroup({ module, params, rect })
    if (g) ui.setSelectedPatterns(g.patternIds)
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
        识别为 <b>{{ result.name }}</b>（{{ result.moduleId }}），外框
        {{ result.params.size }}mm、间距 {{ result.params.spacing }}mm；插入后可在右侧面板整体调参。
      </n-alert>

      <template #footer>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span style="font-size: 12px; color: #999">
            当前为本地规则解析；接入 LLM 后行为不变，几何仍由图案库本地产出。
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
