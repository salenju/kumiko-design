<script setup>
/**
 * KumikoCanvas —— SVG 画布容器（V2 §5）
 * 负责：viewBox 视口、指针事件路由（选择/画族/画单线/平移）、滚轮缩放、悬停命中。
 *
 * 选择工具交互：
 *   - 点线段 → 选中所属图案（Shift/Ctrl 加选）
 *   - 拖拽线段 → 移动图案（单线平移端点 / 线族整组平移），
 *     拖动中显示该线与相邻平行线的垂直间距；松手记一次撤销
 *   - 空白拖拽 → 框选
 */
import { ref, computed, onMounted, nextTick } from 'vue'
import { useUiStore } from '../../stores/ui.js'
import { useProjectStore } from '../../stores/project.js'
import { useHistoryStore } from '../../stores/history.js'
import { useViewport } from '../../composables/useViewport.js'
import { useSelection } from '../../composables/useSelection.js'
import { usePatternTool } from '../../composables/usePatternTool.js'
import { nearestParallelSegment } from '../../core/patterns/index.js'
import GridLayer from './GridLayer.vue'
import PatternLayer from './PatternLayer.vue'
import InteractionLayer from './InteractionLayer.vue'

const ui = useUiStore()
const project = useProjectStore()
const history = useHistoryStore()

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
const dragStart = ref(null) // 指针起点世界坐标
const lastPointer = ref({ x: 0, y: 0 })
const moved = ref(false)
const mode = computed(() => ui.tool)

// —— 线段拖拽状态（select 工具） ——
const segDrag = ref(null) // { patternId, seg, snapBefore, lastWorld }
const dragHint = ref(null) // { x, y, text } 拖拽中的间距提示（世界坐标）

const DRAG_THRESHOLD_PX = 4 // 判定为拖拽的屏幕像素阈值

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
  }
  if (mode.value === 'pan') {
    return
  }
  if (drawModes.includes(mode.value)) {
    patternTool.begin(w)
    return
  }
  // select 工具：命中线段 → 候选拖拽（点选与拖拽共用）；空白 → 框选
  const seg = selection.pickSegment(w.x, w.y)
  if (seg) {
    segDrag.value = {
      patternId: seg.patternId,
      seg,
      snapBefore: project.snapshot(),
      lastWorld: w
    }
    ui.setHovered(seg.id)
    return
  }
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

  // select：线段拖拽 or 框选
  if (segDrag.value) {
    const d = segDrag.value
    // 屏幕位移（世界位移 × zoom）达到阈值才升级为拖拽（区分点选）
    const movePx = Math.hypot(
      (w.x - dragStart.value.x) * ui.zoom,
      (w.y - dragStart.value.y) * ui.zoom
    )
    if (!d.active && movePx >= DRAG_THRESHOLD_PX) {
      d.active = true
      // 首次拖动：若未选中该图案则单选它
      if (!ui.selectedPatternIds.includes(d.patternId)) {
        ui.setSelectedPatterns([d.patternId])
      }
    }
    if (d.active) {
      const wdx = w.x - d.lastWorld.x
      const wdy = w.y - d.lastWorld.y
      d.lastWorld = w
      project.translatePattern(d.patternId, wdx, wdy)
      updateDragHint()
    }
    return
  }
  if (rubber.value) {
    rubber.value.x2 = w.x
    rubber.value.y2 = w.y
  }
}

/** 拖拽中更新「与相邻平行线间距」提示（基于当前该图案的代表段） */
function updateDragHint() {
  const d = segDrag.value
  if (!d) return
  const pat = project.patternById(d.patternId)
  if (!pat) return
  // 取该图案当前的一条代表段（单线即自身；线族取线索引 0 的段）
  let rep = null
  if (pat.kind === 'line') {
    rep = {
      id: pat.id,
      x1: pat.x1,
      y1: pat.y1,
      x2: pat.x2,
      y2: pat.y2,
      patternId: pat.id
    }
  } else {
    const first = project.segments.find((s) => s.patternId === pat.id)
    if (first) rep = first
  }
  if (!rep) {
    dragHint.value = null
    return
  }
  // 排除自身图案的段，找最近平行邻居
  const others = project.segments.filter((s) => s.patternId !== d.patternId)
  const near = nearestParallelSegment(rep, others, { tolDeg: 1 })
  const mx = (rep.x1 + rep.x2) / 2
  const my = (rep.y1 + rep.y2) / 2
  if (near) {
    const angle = Math.atan2(rep.y2 - rep.y1, rep.x2 - rep.x1)
    const offset = 14 / ui.zoom
    dragHint.value = {
      x: mx + Math.cos(angle + Math.PI / 2) * offset,
      y: my + Math.sin(angle + Math.PI / 2) * offset,
      text: `相邻平行线间距 ${near.distance.toFixed(1)} mm`
    }
  } else {
    dragHint.value = { x: mx, y: my - 12 / ui.zoom, text: '无可比相邻平行线' }
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

  // select：先处理线段拖拽
  if (segDrag.value) {
    const d = segDrag.value
    segDrag.value = null
    dragHint.value = null
    if (d.active) {
      // 拖拽结束：若数据变化则记一次撤销
      if (project.snapshot() !== d.snapBefore) history.push(d.snapBefore)
      return
    }
    // 未形成拖拽 → 视为点选
    const additive = e.shiftKey || e.metaKey || e.ctrlKey
    selection.clickAt(w.x, w.y, additive)
    return
  }

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
  if (moved.value) return
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

// 打开即自动适配铺满（无图案时 fit 默认工作台范围；有持久化图案时 fit 到内容）
onMounted(() => {
  nextTick(() => {
    fitTo(project.bounds, 80)
  })
})
</script>

<template>
  <div ref="hostEl" class="kumiko-canvas" :style="{ width: '100%', height: '100%', position: 'relative', cursor: mode === 'pan' ? 'grab' : drawModes.includes(mode) ? 'crosshair' : segDrag && segDrag.active ? 'grabbing' : 'default' }">
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
      <InteractionLayer :rubber="rubber" :draft="ui.draft" :drag-hint="dragHint" :zoom="ui.zoom" />
    </svg>
  </div>
</template>
