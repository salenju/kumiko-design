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

/**
 * 标注摆放（用户需求）：
 *  - 横线：距【左端点】10px（屏幕）沿 x 方向，文字放线上方（不遮线）
 *  - 竖线：距【上端点】10px（屏幕）沿 y 方向，文字放线左侧（不遮线）
 *  - 斜线：中点略偏移
 */
function labelPlacement(seg) {
  const dx = Math.abs(seg.x2 - seg.x1)
  const dy = Math.abs(seg.y2 - seg.y1)
  const gap = 10 / props.zoom // 10px 屏幕 → mm
  const half = labelFontMm.value * 0.55 // 半行字高（mm）
  if (dy <= dx * 0.15) {
    // 横线：从左端点向右 gap 处开始，y 提到线上方半个字高
    const leftX = Math.min(seg.x1, seg.x2)
    const lineY = (seg.y1 + seg.y2) / 2
    return { x: leftX + gap, y: lineY - half, anchor: 'start', baseline: 'middle' }
  }
  if (dx <= dy * 0.15) {
    // 竖线：从上端点向下 gap 处，x 移到线左侧
    const topY = Math.min(seg.y1, seg.y2)
    const lineX = (seg.x1 + seg.x2) / 2
    return { x: lineX - gap, y: topY + gap, anchor: 'end', baseline: 'middle' }
  }
  // 斜线：中点法向偏移
  const mx = (seg.x1 + seg.x2) / 2
  const my = (seg.y1 + seg.y2) / 2
  return { x: mx, y: my - half, anchor: 'middle', baseline: 'middle' }
}

function placementFor(seg) {
  const p = labelPlacement(seg)
  return {
    x: p.x,
    y: p.y,
    anchor: p.anchor,
    baseline: p.baseline
  }
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
        :x="placementFor(seg).x"
        :y="placementFor(seg).y"
        :font-size="labelFontMm"
        fill="#7a4d00"
        :text-anchor="placementFor(seg).anchor"
        :dominant-baseline="placementFor(seg).baseline"
        stroke="#fff"
        :stroke-width="Math.max(0.8, 3 / zoom)"
        paint-order="stroke"
        stroke-linejoin="round"
        style="pointer-events: none"
      >
        {{ seg.length.toFixed(1) }}
      </text>
    </template>
  </g>
</template>
