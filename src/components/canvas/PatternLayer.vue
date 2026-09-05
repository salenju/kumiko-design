<script setup>
/**
 * PatternLayer —— 渲染派生线段（V2 §5.1）
 * stroke-width 使用物理 mm（viewBox 统一映射 1mm=zoom px，物理宽度随缩放正确）。
 * 高亮：选中族加粗蓝色；悬停段红色。长度标注按需显示（屏幕恒定字号）。
 */
import { computed } from 'vue'

const props = defineProps({
  segments: { type: Array, default: () => [] },
  selectedIds: { type: Array, default: () => [] },
  hoveredSegmentId: { type: String, default: null },
  labelsEnabled: { type: Boolean, default: false },
  zoom: { type: Number, required: true }
})

const selectedSet = computed(() => new Set(props.selectedIds))
const labelFontMm = computed(() => 11 / props.zoom)

function segColor(seg) {
  if (seg.id === props.hoveredSegmentId) return '#d64541'
  if (selectedSet.value.has(seg.patternId)) return '#2f6fd0'
  return '#222222'
}

function labelPos(seg) {
  return { x: (seg.x1 + seg.x2) / 2, y: (seg.y1 + seg.y2) / 2 }
}
</script>

<template>
  <g class="kd-pattern">
    <template v-for="seg in segments" :key="seg.id">
      <line
        :x1="seg.x1"
        :y1="seg.y1"
        :x2="seg.x2"
        :y2="seg.y2"
        :stroke="segColor(seg)"
        :stroke-width="seg.width"
        stroke-linecap="butt"
      />
      <!-- 高亮描边：比木条稍宽一圈，仍物理缩放 -->
      <line
        v-if="selectedSet.has(seg.patternId) || seg.id === hoveredSegmentId"
        :x1="seg.x1"
        :y1="seg.y1"
        :x2="seg.x2"
        :y2="seg.y2"
        :stroke="segColor(seg)"
        :stroke-width="seg.width + Math.max(0.6, 2 / zoom)"
        stroke-opacity="0.35"
      />
      <!-- 长度标注：悬停段总是显示；全图标注开关对所有段显示 -->
      <text
        v-if="labelsEnabled || seg.id === hoveredSegmentId"
        :x="labelPos(seg).x"
        :y="labelPos(seg).y"
        :font-size="labelFontMm"
        fill="#8a5a00"
        text-anchor="middle"
        dominant-baseline="middle"
        style="pointer-events: none"
      >
        {{ seg.length.toFixed(1) }}
      </text>
    </template>
  </g>
</template>
