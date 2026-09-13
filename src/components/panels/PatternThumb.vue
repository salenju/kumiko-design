<script setup>
/**
 * PatternThumb —— 图案模块缩略图
 * 在归一化方框内按模块默认参数等比缩放渲染，忠实反映真实图案的密度与走向。
 * 只依赖 core 纯函数，不依赖画布数据。
 */
import { computed } from 'vue'
import { buildModulePatterns } from '../../core/library/index.js'
import { segmentsFromPatterns } from '../../core/patterns/index.js'
import { colorForSeg } from '../../core/colors.js'

const props = defineProps({
  module: { type: Object, required: true },
  /** 渲染像素尺寸 */
  size: { type: Number, default: 76 },
  /** 线条配色方案（缺省用中性灰） */
  colorScheme: { type: Object, default: null }
})

const BOX = 100 // 归一化绘制框（mm）

const segments = computed(() => {
  const m = props.module
  const defaults = m.defaults || {}
  const baseSize = Number(defaults.size) > 0 ? Number(defaults.size) : 300
  const k = BOX / baseSize
  const params = {
    ...defaults,
    size: BOX,
    spacing: Math.max(0.5, (Number(defaults.spacing) || 30) * k),
    width: Math.max(0.2, (Number(defaults.width) || 4) * k)
  }
  const patterns = buildModulePatterns(m, { rect: { x: 0, y: 0, w: BOX, h: BOX }, params })
  return segmentsFromPatterns(patterns).slice(0, 900)
})

function strokeOf(seg) {
  return props.colorScheme ? colorForSeg(props.colorScheme, seg) : '#3a3a3a'
}
</script>

<template>
  <svg
    :width="size"
    :height="size"
    :viewBox="`0 0 ${BOX} ${BOX}`"
    preserveAspectRatio="xMidYMid meet"
    class="pt-svg"
  >
    <rect :x="0" :y="0" :width="BOX" :height="BOX" fill="#fdfdfb" />
    <line
      v-for="(s, i) in segments"
      :key="i"
      :x1="s.x1"
      :y1="s.y1"
      :x2="s.x2"
      :y2="s.y2"
      :stroke="strokeOf(s)"
      :stroke-width="Math.max(0.8, s.width || 1.6)"
      stroke-linecap="butt"
    />
  </svg>
</template>

<style scoped>
.pt-svg {
  display: block;
  border: 1px solid var(--kd-border);
  border-radius: 6px;
  background: #fff;
}
</style>
