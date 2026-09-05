import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { useUiStore } from '../stores/ui.js'

/**
 * 视口控制（V2 §5.1）
 * SVG 使用 viewBox 承载「mm 世界坐标 → 屏幕像素」的换算：
 *   viewBox = (center ± 容器px/zoom/2)，即 1mm = zoom px。
 * 事件坐标均通过 screenToWorld 换算为 mm。
 * @param {import('vue').Ref<HTMLElement|null>} containerRef
 */
export function useViewport(containerRef) {
  const ui = useUiStore()
  const px = reactive({ w: 0, h: 0 })
  let ro = null

  function measure() {
    const el = containerRef.value
    if (el) {
      px.w = el.clientWidth
      px.h = el.clientHeight
    }
  }

  onMounted(() => {
    measure()
    ro = new ResizeObserver(measure)
    if (containerRef.value) ro.observe(containerRef.value)
  })
  onBeforeUnmount(() => {
    if (ro) ro.disconnect()
  })

  /** viewBox 属性字符串（mm） */
  const viewBox = computed(() => {
    const w = px.w / ui.zoom
    const h = px.h / ui.zoom
    return `${ui.center.x - w / 2} ${ui.center.y - h / 2} ${w} ${h}`
  })

  /** 相对容器的像素 → 世界坐标 mm */
  function screenToWorld(clientX, clientY) {
    const el = containerRef.value
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    const localX = clientX - rect.left
    const localY = clientY - rect.top
    return {
      x: ui.center.x + (localX - px.w / 2) / ui.zoom,
      y: ui.center.y + (localY - px.h / 2) / ui.zoom
    }
  }

  /** 世界坐标 mm → 相对容器像素 */
  function worldToScreen(wx, wy) {
    return {
      x: px.w / 2 + (wx - ui.center.x) * ui.zoom,
      y: px.h / 2 + (wy - ui.center.y) * ui.zoom
    }
  }

  /** 以光标为锚点缩放（滚轮） */
  function zoomAt(clientX, clientY, factor) {
    const anchor = screenToWorld(clientX, clientY)
    const next = Math.min(50, Math.max(0.05, ui.zoom * factor))
    ui.setZoom(next, { aroundWorld: anchor })
  }

  /** 适配到给定 bounds（mm），padPx 为屏幕边距 */
  function fitTo(bounds, padPx = 60) {
    if (!bounds || bounds.w <= 0 || bounds.h <= 0) return
    if (px.w === 0 || px.h === 0) measure()
    const availW = Math.max(1, px.w - padPx * 2)
    const availH = Math.max(1, px.h - padPx * 2)
    const next = Math.min(50, Math.max(0.05, Math.min(availW / bounds.w, availH / bounds.h)))
    ui.setZoom(next)
    ui.setCenter(bounds.x + bounds.w / 2, bounds.y + bounds.h / 2)
  }

  /** 按像素平移（pan 工具拖拽） */
  function panByPx(dx, dy) {
    ui.panBy(-dx / ui.zoom, -dy / ui.zoom)
  }

  return { px, viewBox, screenToWorld, worldToScreen, zoomAt, fitTo, panByPx, measure }
}
