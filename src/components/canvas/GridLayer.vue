<script setup>
/**
 * GridLayer —— mm 网格（V2 §5.1）
 * 依据可视世界范围 rect（mm）与 zoom（px/mm）自适应步长，控制 DOM 数量。
 */
import { computed } from 'vue'

const props = defineProps({
  rect: { type: Object, required: true }, // {x,y,w,h} mm
  zoom: { type: Number, required: true },
  enabled: { type: Boolean, default: true }
})

const CANDIDATES = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500]

const grid = computed(() => {
  if (!props.enabled) return { lines: [], axisX: null, axisY: null }
  let step = CANDIDATES[CANDIDATES.length - 1]
  for (const c of CANDIDATES) {
    if (c * props.zoom >= 24) {
      step = c
      break
    }
  }
  const { x, y, w, h } = props.rect
  const lines = []
  let count = 0
  for (let gx = Math.floor(x / step) * step; gx <= x + w && count < 800; gx += step) {
    lines.push({ key: `v${gx}`, x1: gx, y1: y, x2: gx, y2: y + h, major: Math.abs(gx) < 1e-6 })
    count++
  }
  for (let gy = Math.floor(y / step) * step; gy <= y + h && count < 1600; gy += step) {
    lines.push({ key: `h${gy}`, x1: x, y1: gy, x2: x + w, y2: gy, major: Math.abs(gy) < 1e-6 })
    count++
  }
  return { lines, step }
})
</script>

<template>
  <g class="kd-grid" v-if="enabled">
    <line
      v-for="l in grid.lines"
      :key="l.key"
      :x1="l.x1"
      :y1="l.y1"
      :x2="l.x2"
      :y2="l.y2"
      stroke="#ececec"
      :stroke-width="l.major ? 1 / zoom : 0.6 / zoom"
    />
  </g>
</template>
