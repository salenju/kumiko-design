import { reactive } from 'vue'
import { useUiStore } from '../stores/ui.js'
import { useProjectStore } from '../stores/project.js'
import { useHistoryStore } from '../stores/history.js'
import { coverFamily } from '../core/patterns/index.js'
import { uid } from '../utils/id.js'
import { useSelection } from './useSelection.js'

/** 角度吸附到 step 的倍数（[0,360)） */
export function snapAngle(deg, step) {
  if (!step || step <= 0) return ((deg % 360) + 360) % 360
  const snapped = Math.round(deg / step) * step
  return ((snapped % 360) + 360) % 360
}

/** 网格吸附：world 坐标吸附到 grid 倍数（mm） */
export function snapGridCoord(v, grid) {
  if (!grid || grid <= 0) return v
  return Math.round(v / grid) * grid
}

/**
 * 绘制工具（V2 §5.2）——支持两种草稿，共用指针状态机：
 *   ui.tool === 'pattern' → 画一族平行线（draft.kind='family'）
 *   ui.tool === 'line'    → 画一根独立线段（draft.kind='line'，不参与求交）
 * 草稿放 ui.draft，供画布层渲染预览。
 */
export function usePatternTool() {
  const ui = useUiStore()
  const project = useProjectStore()
  const history = useHistoryStore()
  const selection = useSelection()

  /** 吸附点（世界坐标） */
  function snapPoint(world) {
    return ui.snapEnabled
      ? {
          x: snapGridCoord(world.x, ui.snapGrid),
          y: snapGridCoord(world.y, ui.snapGrid)
        }
      : { x: world.x, y: world.y }
  }

  /** 起一个草稿 */
  function begin(world, force = false) {
    if (!force && !['pattern', 'line'].includes(ui.tool)) return
    if (ui.draft) return // 已有草稿
    const p = snapPoint(world)
    if (ui.tool === 'line') {
      ui.draft = reactive({ kind: 'line', x1: p.x, y1: p.y, x2: p.x, y2: p.y, active: true })
    } else {
      ui.draft = reactive({ kind: 'family', x: p.x, y: p.y, angle: 0, radius: 0, active: true })
    }
  }

  /** 拖拽更新 */
  function update(world) {
    const d = ui.draft
    if (!d || !d.active) return
    if (d.kind === 'line') {
      const p = snapPoint(world)
      d.x2 = p.x
      d.y2 = p.y
      return
    }
    const dx = world.x - d.x
    const dy = world.y - d.y
    d.radius = Math.hypot(dx, dy)
    if (d.radius < 1e-6) {
      d.angle = 0
      return
    }
    // y-down 画布：视觉方向 = atan2(dy, dx)（0°=水平向右）
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI
    if (ui.snapEnabled) deg = snapAngle(deg, ui.snapAngle)
    d.angle = deg
  }

  /** 结束草稿：单线或线族（分别可撤销） */
  function commit() {
    const d = ui.draft
    if (!d) return
    ui.draft = null

    if (d.kind === 'line') {
      const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1)
      if (len < 5) return // 过短视为误点
      const line = { id: uid('ln'), kind: 'line', x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2, width: 3 }
      history.beginEdit(() => {
        project.addPattern(line)
        ui.setSelectedPatterns([line.id])
      })
      return
    }

    if (d.radius < 15) return // 过小视为误点
    // 默认间距 = 1 × 全局间距单位（属性面板可改，见「间距」下拉）
    const spacing = project.spacingUnit > 0 ? project.spacingUnit : 10
    const width = 3
    const bounds = {
      x: d.x - d.radius,
      y: d.y - d.radius,
      w: d.radius * 2,
      h: d.radius * 2
    }
    const { ref, count } = coverFamily(d.angle, spacing, bounds)
    const pattern = {
      id: uid('pat'),
      kind: 'family',
      ref,
      angle: d.angle,
      spacing,
      count,
      width,
      bounds
    }
    history.beginEdit(() => {
      project.addPattern(pattern)
      ui.setSelectedPatterns([pattern.id])
    })
  }

  /** 取消 */
  function cancel() {
    ui.draft = null
  }

  return { begin, update, commit, cancel }
}
