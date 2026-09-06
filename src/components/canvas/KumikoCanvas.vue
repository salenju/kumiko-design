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
import { equalSpacingHint, parallelEndpointAlign, referenceParallel } from '../../core/patterns/index.js'
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

// 是否处于平移状态：平移工具 或 按住空格临时平移
const isPanning = computed(() => ui.tool === 'pan' || ui.spacePan)

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
const dragHints = ref([]) // [{ x, y, text, kind }] 拖拽中的提示（世界坐标）
const panSession = ref(false) // 本次拖拽是否为平移手势（含空格临时平移）

const DRAG_THRESHOLD_PX = 4 // 判定为拖拽的屏幕像素阈值（鼠标）
const TOUCH_DRAG_THRESHOLD_PX = 12 // 触摸防误触：稍大
const PINCH_MIN_PX = 8 // 双指距离小于此值不缩放（避免误判）

// —— 多指手势（触摸板/pad 捏合缩放、双指平移） ——
const activePointers = new Map() // pointerId → {x, y}（client 坐标）
const pinchPair = ref(null) // 双指手势使用的两个 pointerId
const pinchPrev = ref(null) // 上一帧 { dist, midX, midY }
const multiGesture = ref(false) // 是否处于多指手势
const strayUpId = ref(null) // 捏合后残留单指的 pointerId（忽略其抬起，防误操作）

// —— 双击适配 ——
const TAP_MS = 300
const TAP_DIST_PX = 24
const lastTap = ref({ t: 0, x: 0, y: 0 })

function pointerDistance() {
  const ids = pinchPair.value ? pinchPair.value.ids : []
  if (ids.length !== 2) return 0
  const a = activePointers.get(ids[0])
  const b = activePointers.get(ids[1])
  if (!a || !b) return 0
  return Math.hypot(a.x - b.x, a.y - b.y)
}
function pointerMid() {
  const ids = pinchPair.value ? pinchPair.value.ids : []
  if (ids.length !== 2) return null
  const a = activePointers.get(ids[0])
  const b = activePointers.get(ids[1])
  if (!a || !b) return null
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}
/** 从当前活跃指针里选前两根作为双指手势对象 */
function ensurePinchPair() {
  const ids = [...activePointers.keys()]
  if (pinchPair.value === null && ids.length >= 2) {
    pinchPair.value = { ids: [ids[0], ids[1]] }
    const d = pointerDistance()
    const m = pointerMid()
    pinchPrev.value = d > PINCH_MIN_PX && m ? { dist: d, midX: m.x, midY: m.y } : null
  }
}
/** 双指手势：以两指中点为锚缩放 + 中点移动平移 */
function applyPinch() {
  const m = pointerMid()
  const d = pointerDistance()
  const prev = pinchPrev.value
  pinchPrev.value = d > PINCH_MIN_PX && m ? { dist: d, midX: m.x, midY: m.y } : null
  if (!prev || !m || !(d > PINCH_MIN_PX) || !(prev.dist > PINCH_MIN_PX)) return
  // 1) 中点移动量（旧帧世界坐标 - 当前中点）
  const worldPrev = screenToWorld(prev.midX, prev.midY)
  // 2) 缩放（锚在当前中点的世界位置）
  const factor = d / prev.dist
  zoomAt(m.x, m.y, factor)
  // 3) 平移，使旧帧中点下的世界点跟随到新中点
  const worldNow = screenToWorld(m.x, m.y)
  if (worldPrev && worldNow) {
    panByPx((worldPrev.x - worldNow.x) * ui.zoom, (worldPrev.y - worldNow.y) * ui.zoom)
  }
}

function worldOf(e) {
  return screenToWorld(e.clientX, e.clientY)
}

function onPointerDown(e) {
  const w = worldOf(e)
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  // 捕获指针：保证拖出容器仍收到 move/up
  try {
    svgEl.value?.setPointerCapture?.(e.pointerId)
  } catch {
    /* 兼容性忽略 */
  }
  if (activePointers.size >= 2) {
    // 第二根手指落下 → 双指手势（缩放/平移），取消进行中的单指动作
    dragging.value = true
    multiGesture.value = true
    segDrag.value = null
    dragHints.value = []
    rubber.value = null
    panSession.value = false
    ui.setHovered(null)
    patternTool.cancel()
    ensurePinchPair()
    return
  }
  dragging.value = true
  moved.value = false
  dragStart.value = w
  lastPointer.value = { x: e.clientX, y: e.clientY }
  if (isPanning.value) {
    panSession.value = true
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
  if (activePointers.has(e.pointerId)) {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  }
  // 多指手势：只对参与双指的两根指针做缩放/平移
  if (multiGesture.value) {
    const ids = pinchPair.value ? pinchPair.value.ids : []
    if (ids.includes(e.pointerId)) applyPinch()
    return
  }
  if (!dragging.value) {
    // hover 命中提示（仅 select 模式；触摸不触发悬停）
    if (mode.value === 'select' && e.pointerType !== 'touch') {
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

  if (isPanning.value || panSession.value) {
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
    // 屏幕位移（世界位移 × zoom）达到阈值才升级为拖拽（区分点选；触摸阈值更大防误触）
    const movePx = Math.hypot(
      (w.x - dragStart.value.x) * ui.zoom,
      (w.y - dragStart.value.y) * ui.zoom
    )
    const threshold = e.pointerType === 'touch' ? TOUCH_DRAG_THRESHOLD_PX : DRAG_THRESHOLD_PX
    if (!d.active && movePx >= threshold) {
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

/** 拖拽中更新提示：优先「端点已对齐」，其次「相邻平行线间距」 */
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
    dragHints.value = []
    return
  }
  // 其它图案的段（排除自身图案，便于找可对齐的外部端点/平行线）
  const others = project.segments.filter((s) => s.patternId !== d.patternId)

  const mx = (rep.x1 + rep.x2) / 2
  const my = (rep.y1 + rep.y2) / 2
  const ang = Math.atan2(rep.y2 - rep.y1, rep.x2 - rep.x1)
  const dirName = segOrientationOf(rep) === 'h' ? '横线' : segOrientationOf(rep) === 'v' ? '竖线' : '线'
  const hints = []

  // 1) 端点/顶点对齐提示（横线比左/右端 x、竖线比上/下端 y，与基准相邻线齐平）
  const ep = parallelEndpointAlign(rep, others, { tol: Math.max(0.4, 2.5 / ui.zoom), tolDeg: 1 })
  if (ep && ep.aligned) {
    const endX = ep.end === 'min' ? Math.min(rep.x1, rep.x2) : Math.max(rep.x1, rep.x2)
    const endY = ep.end === 'min' ? Math.min(rep.y1, rep.y2) : Math.max(rep.y1, rep.y2)
    const whichEnd = dirName === '横线' ? (ep.end === 'min' ? '左端' : '右端') : dirName === '竖线' ? (ep.end === 'min' ? '上端' : '下端') : ''
    hints.push({
      x: endX,
      y: endY,
      text: `端点与相邻线${whichEnd}对齐`,
      kind: 'endpoint'
    })
  }

  // 2) 等距对齐提示（拖 C 使其与基准相邻线 B 的间距 ≈ B 与参考线 A 的间距）
  const eq = equalSpacingHint(rep, others, { tolDeg: 1 })
  if (eq) {
    const offset = 18 / ui.zoom
    const sideTxt = eq.side === 'up' ? '上方相邻线' : eq.side === 'left' ? '左侧相邻线' : '相邻线'
    hints.push({
      x: mx + Math.cos(ang + Math.PI / 2) * offset,
      y: my + Math.sin(ang + Math.PI / 2) * offset,
      text: `${dirName}间距与${sideTxt}一致 ${eq.spacing.toFixed(1)} mm`,
      kind: 'equal'
    })
  }

  if (hints.length) {
    dragHints.value = hints
    return
  }

  // 3) 仅普通间距提示
  const near = referenceParallel(rep, others, { tolDeg: 1 })
  if (near) {
    const offset = 14 / ui.zoom
    const label = near.side === 'up' ? '与上方相邻线间距' : near.side === 'left' ? '与左侧相邻线间距' : '相邻平行线间距'
    dragHints.value = [
      {
        x: mx + Math.cos(ang + Math.PI / 2) * offset,
        y: my + Math.sin(ang + Math.PI / 2) * offset,
        text: `${label} ${near.distance.toFixed(1)} mm`,
        kind: 'spacing'
      }
    ]
  } else {
    dragHints.value = [{ x: mx, y: my - 12 / ui.zoom, text: '基准方向无相邻平行线', kind: 'spacing' }]
  }
}

/** 拖拽代表段的主方向（横/竖/斜），用于提示文案 */
function segOrientationOf(seg) {
  const dx = Math.abs(seg.x2 - seg.x1)
  const dy = Math.abs(seg.y2 - seg.y1)
  if (dy <= dx * 0.15) return 'h'
  if (dx <= dy * 0.15) return 'v'
  return 'd'
}

function onPointerUp(e) {
  activePointers.delete(e.pointerId)

  // 多指手势结束：只剩 0/1 指时收尾（残留的单指忽略其抬起）
  if (multiGesture.value) {
    const ids = pinchPair.value ? pinchPair.value.ids : []
    if (ids.includes(e.pointerId)) pinchPair.value = null
    if (activePointers.size >= 2) {
      ensurePinchPair()
      return
    }
    multiGesture.value = false
    pinchPair.value = null
    pinchPrev.value = null
    const remain = [...activePointers.keys()]
    strayUpId.value = remain.length === 1 ? remain[0] : null
    dragging.value = false
    ui.setHovered(null)
    return
  }
  // 捏合结束残留的最后一根手指抬起：忽略，避免误点/误拖
  if (e.pointerId === strayUpId.value) {
    strayUpId.value = null
    return
  }

  if (!dragging.value) return
  const w = worldOf(e)
  dragging.value = false
  ui.setHovered(null)

  // 双击适配（仅简单点击：非平移、非绘制、未移动）
  const tapLike =
    !isPanning.value && !drawModes.includes(mode.value) && !moved.value && !multiGesture.value
  if (tapLike) {
    const now = performance.now()
    const dt = now - lastTap.value.t
    const dist = Math.hypot(e.clientX - lastTap.value.x, e.clientY - lastTap.value.y)
    lastTap.value = { t: now, x: e.clientX, y: e.clientY }
    if (dt < TAP_MS && dist < TAP_DIST_PX) {
      lastTap.value = { t: 0, x: 0, y: 0 } // 消费这次双击
      fitToProject()
    }
  }

  if (isPanning.value || panSession.value) {
    panSession.value = false
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
    dragHints.value = []
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
    // 触摸防误触：屏幕范围过小的“框”视为点击空白（清空选择）
    const pxW = Math.abs(r.x2 - r.x1) * ui.zoom
    const pxH = Math.abs(r.y2 - r.y1) * ui.zoom
    const minSel = e.pointerType === 'touch' ? 10 : 4
    if (moved.value && pxW > minSel && pxH > minSel) {
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
  <div ref="hostEl" class="kumiko-canvas" :style="{ width: '100%', height: '100%', position: 'relative', cursor: isPanning ? 'grab' : drawModes.includes(mode) ? 'crosshair' : segDrag && segDrag.active ? 'grabbing' : 'default' }">
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
        :color-scheme="project.lineColors"
      />
      <InteractionLayer :rubber="rubber" :draft="ui.draft" :drag-hints="dragHints" :zoom="ui.zoom" />
    </svg>
  </div>
</template>
