<script setup>
/**
 * PatternLayer —— 渲染派生线段（V2 §5.1）
 * stroke-width 使用物理 mm（viewBox 统一映射 1mm=zoom px，物理宽度随缩放正确）。
 * 高亮：选中族加粗蓝色；悬停段红色。长度标注按需显示（屏幕恒定字号）。
 */
import { computed } from 'vue'
import { colorForSeg, HOVER_COLOR, SELECTED_COLOR } from '../../core/colors.js'

const props = defineProps({
  segments: { type: Array, default: () => [] },
  selectedIds: { type: Array, default: () => [] },
  hoveredSegmentId: { type: String, default: null },
  labelsEnabled: { type: Boolean, default: false },
  zoom: { type: Number, required: true },
  /** 线条配色方案（{fallback, hoverColor, selectedColor, angles:[{angle,color}]}，见 core/colors.js）；缺省用旧色 */
  colorScheme: { type: Object, default: null }
})

const selectedSet = computed(() => new Set(props.selectedIds))
const labelFontMm = computed(() => 11 / props.zoom)

/** 木条主色：按线段方向角度取项目配色 */
function baseColor(seg) {
  return props.colorScheme ? colorForSeg(props.colorScheme, seg) : '#222222'
}

/** 高亮环色：悬停色 / 选中色（可由用户配置，避免与线条色冲突）；无高亮返回 null */
function ringColor(seg) {
  const scheme = props.colorScheme
  if (seg.id === props.hoveredSegmentId) {
    return scheme ? scheme.hoverColor : HOVER_COLOR
  }
  if (selectedSet.value.has(seg.patternId)) {
    return scheme ? scheme.selectedColor : SELECTED_COLOR
  }
  return null
}

/**
 * 标注摆放（用户需求）：
 *  - 横线：长度值横排显示在【左端点外侧】（向左伸出），文字右缘距左端点 10px
 *  - 竖线：长度值横排显示在【上端点外侧】（向上伸出），文字下缘距上端点 10px
 *  - 斜线：中点上方
 */
function labelPlacement(seg) {
  const dx = Math.abs(seg.x2 - seg.x1)
  const dy = Math.abs(seg.y2 - seg.y1)
  const gap = 10 / props.zoom // 10px 屏幕 → mm
  const half = labelFontMm.value / 2 // 半字高
  if (dy <= dx * 0.15) {
    // 横线：左端外侧向左（end 对齐，右缘距左端 gap）
    const leftX = Math.min(seg.x1, seg.x2)
    const lineY = (seg.y1 + seg.y2) / 2
    return { x: leftX - gap, y: lineY, anchor: 'end', baseline: 'middle' }
  }
  if (dx <= dy * 0.15) {
    // 竖线：上端外侧向上（文字下缘距上端 gap，中心 y = 上端 - gap - half）
    const topY = Math.min(seg.y1, seg.y2)
    const lineX = (seg.x1 + seg.x2) / 2
    return { x: lineX, y: topY - gap - half, anchor: 'middle', baseline: 'middle' }
  }
  // 斜线：中点上方
  const mx = (seg.x1 + seg.x2) / 2
  const my = (seg.y1 + seg.y2) / 2
  return { x: mx, y: my - half, anchor: 'middle', baseline: 'middle' }
}

function placementFor(seg) {
  const p = labelPlacement(seg)
  return { x: p.x, y: p.y, anchor: p.anchor, baseline: p.baseline }
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
        :stroke="baseColor(seg)"
        :stroke-width="seg.width"
        stroke-linecap="butt"
      />
      <!-- 高亮环（悬停红 / 选中蓝）：叠加在配色线上，不覆盖原方向色 -->
      <line
        v-if="ringColor(seg)"
        :x1="seg.x1"
        :y1="seg.y1"
        :x2="seg.x2"
        :y2="seg.y2"
        :stroke="ringColor(seg)"
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
