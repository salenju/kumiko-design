<script setup>
/**
 * KNumberField —— 属性面板数字输入（naive-ui 组件封装）
 *
 * 行为契约（与父级撤销会话配合）：
 *  - 输入/步进中：只更新内部显示值并 emit('input', v)（live=false 时不发）
 *  - blur / Enter：emit('commit', v)，由父级统一应用并结束一次撤销会话
 *  - props.value 变化（撤销/重做/外部修改）会 watch 回内部显示
 * live=true  ：父级监听 input 即时写入 store（画布实时变化，撤销以会话计）
 * live=false ：父级只监听 commit，失焦/回车才应用（长度/角度/间距类字段）
 */
import { ref, watch, nextTick } from 'vue'
import { NInputNumber } from 'naive-ui'

const props = defineProps({
  value: { type: Number, default: null },
  min: { type: Number, default: undefined },
  max: { type: Number, default: undefined },
  step: { type: Number, default: 1 },
  disabled: { type: Boolean, default: false },
  placeholder: { type: String, default: '' },
  live: { type: Boolean, default: true } // 是否随输入即时提交
})
const emit = defineEmits(['focus', 'input', 'commit'])

const display = ref(props.value)
watch(
  () => props.value,
  (v) => {
    display.value = v
  }
)

function toNum(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function onFocus() {
  emit('focus')
}
function onUpdate(v) {
  const n = toNum(v)
  display.value = n
  if (props.live && n !== null) emit('input', n)
}
function commit() {
  // live=false：blur/回车提交当前显示值；父级应用后外部值会变，否则回弹原值
  emit('commit', display.value)
  nextTick(() => {
    display.value = props.value
  })
}
</script>

<template>
  <n-input-number
    :value="display"
    :min="props.min"
    :max="props.max"
    :step="props.step"
    :disabled="props.disabled"
    :placeholder="props.placeholder"
    size="small"
    style="width: 100%"
    @focus="onFocus"
    @update:value="onUpdate"
    @blur="commit"
    @keydown.enter.prevent="commit"
  />
</template>
