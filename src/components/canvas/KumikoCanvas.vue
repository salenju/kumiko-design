<script setup>
/**
 * KumikoCanvas —— SVG 画布容器（V2 §5）
 * 负责：viewBox 视口、指针事件路由（选择/画族/平移）、滚轮缩放、悬停命中。
 */
import { ref, computed, onMounted, nextTick } from 'vue'
import { useUiStore } from '../../stores/ui.js'
import { useProjectStore } from '../../stores/project.js'
import { useViewport } from '../../composables/useViewport.js'
import { useSelection } from '../../composables/useSelection.js'
import { usePatternTool } from '../../composables/usePatternTool.js'
import GridLayer from './GridLayer.vue'
import PatternLayer from './PatternLayer.vue'
import InteractionLayer from './InteractionLayer.vue'

const ui = useUiStore()
const project = useProjectStore()

const hostEl = ref(null)
const svgEl = ref(null)
const { viewBox, screenToWorld, zoomAt, panByPx, px, fitTo } = useViewport(hostEl)
const selection = useSelection()
const patternTool = usePatternTool()

// 绘制类工具（画线族/画单线共用 usePatternTool 指针状态机）
const drawModes = ['pattern', 'line']

// 可见世界范围（mm）
const viewRect = computed(() => {
  const w = px.w / ui.zoom
  const h = px.h / ui.zoom
  return { x: ui.center.x - w / 2, y: ui.center.y - h / 2, w, h }
})

// 指针状态
const dragging = ref(false)
const rubber = ref(null) // 框选矩形（世界坐标）
const dragStart = ref(null) // 拖拽起点世界坐标
const lastPointer = ref({ x: 0, y: 0 })
const moved = ref(false)
const mode = computed(() => ui.tool)

function worldOf(e) {
  return screenToWorld(e.clientX, e.clientY)
}

function onPointerDown(e) {
  const w = worldOf(e)
  dragging.value = true
  moved.value = false
  dragStart.value = w
  lastPointer.value = { x: e.clientX, y: e.clientY }
  // 捕获指针：保证拖出容器仍收到 move/up
  try {
    svgEl.value?.setPointerCapture?.(e.pointerId)
  } catch {
    /* 兼容性忽略 */
  }  if (mode.value === 'pan') {
    // 平移工具：直接记录起点
    return
  }
  if (drawModes.includes(mode.value)) {
    patternTool.begin(w)
    return
  }
  // select 工具：先探测是否点到线（命中则进入点击选择，否则进入框选）
  const seg = selection.pickSegment(w.x, w.y)
  if (seg) {
    // 点击命中：等 pointerup 做选择（区分拖拽）
    return
  }
  // 空白按下：进入框选
  rubber.value = { x1: w.x, y1: w.y, x2: w.x, y2: w.y }
}

function onPointerMove(e) {
  if (!dragging.value) {
    // hover 命中提示（仅 select 模式）
    if (mode.value === 'select') {
      const w = worldOf(e)
      const seg = selection.pickSegment(w.x, w.y)
      ui.setHovered(seg ? seg.id : null)
    }
    return
  }
  const w = worldOf(e)
  const dx = e.clientX - lastPointer.value.x
  const dy = e.clientY - lastPointer.value.y
  const dist = Math.hypot(dx, dy)
  if (dist > 1) moved.value = true
  lastPointer.value = { x: e.clientX, y: e.clientY }

  if (mode.value === 'pan') {
    panByPx(dx, dy)
    return
  }
  if (drawModes.includes(mode.value)) {
    patternTool.update(w)
    return
  }
  // select：更新框选矩形
  if (rubber.value) {
    rubber.value.x2 = w.x
    rubber.value.y2 = w.y
  }
}

function onPointerUp(e) {
  if (!dragging.value) return
  const w = worldOf(e)
  dragging.value = false
  ui.setHovered(null)

  if (mode.value === 'pan') {
    return
  }
  if (drawModes.includes(mode.value)) {
    patternTool.commit()
    return
  }
  // select
  if (rubber.value) {
    const r = rubber.value
    if (moved.value && Math.abs(r.x2 - r.x1) > 0.5 && Math.abs(r.y2 - r.y1) > 0.5) {
      selection.boxSelect(r)
    } else {
      // 视为点击空白 → 清空选择
      ui.clearSelection()
    }
    rubber.value = null
    return
  }
  // 点击命中分支（pointerdown 时命中线段）
  if (moved.value) return // 拖拽过 → 忽略
  const additive = e.shiftKey || e.metaKey || e.ctrlKey
  selection.clickAt(w.x, w.y, additive)
}

function onPointerLeave() {
  ui.setHovered(null)
}

function onWheel(e) {
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
  zoomAt(e.clientX, e.clientY, factor)
}

/** 供父组件调用：适配到图案整体（或指定 bounds） */
function fitToProject(bounds) {
  fitTo(bounds ?? project.bounds, 80)
}

defineExpose({ fitToProject })

// 需求 1：打开即自动适配铺满（无图案时 fit 默认工作台范围；有持久化图案时 fit 到内容）
onMounted(() => {
  nextTick(() => {
    fitTo(project.bounds, 80)
  })
})
</script>

<template>
  <div ref="hostEl" class="kumiko-canvas" :style="{ width: '100%', height: '100%', position: 'relative', cursor: mode === 'pan' ? 'grab' : drawModes.includes(mode) ? 'crosshair' : 'default' }">
    <svg
      ref="svgEl"
      :viewBox="viewBox"
      :width="px.w"
      :height="px.h"
      style="display: block; touch-action: none; user-select: none"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointerleave="onPointerLeave"
      @wheel.prevent="onWheel"
      @dblclick.prevent
    >
      <GridLayer :rect="viewRect" :zoom="ui.zoom" :enabled="ui.gridEnabled" />
      <PatternLayer
        :segments="project.segments"
        :selected-ids="ui.selectedPatternIds"
        :hovered-segment-id="ui.hoveredSegmentId"
        :labels-enabled="ui.labelsEnabled"
        :zoom="ui.zoom"
      />
      <InteractionLayer :rubber="rubber" :draft="ui.draft" :zoom="ui.zoom" />
    </svg>
  </div>
</template>
