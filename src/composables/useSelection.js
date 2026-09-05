import { useProjectStore } from '../stores/project.js'
import { useUiStore } from '../stores/ui.js'
import { useHistoryStore } from '../stores/history.js'
import { distPointSegment, segmentRectOverlap } from '../core/geometry/index.js'
import { uid } from '../utils/id.js'

/**
 * 选择与命中（V2 §5.2）
 * 点选命中规则：点到线段距离 <= 命中容差（mm），取距离最小者。
 */
export function useSelection() {
  const project = useProjectStore()
  const ui = useUiStore()
  const history = useHistoryStore()

  /** 命中容差 mm = 线宽/2 + 6px/zoom */
  function hitTolerance() {
    return 3 + 6 / ui.zoom
  }

  /**
   * 命中测试：返回命中的 segment（容差内距离最小），否则 null。
   * @param {number} wx,wy 世界坐标
   */
  function pickSegment(wx, wy) {
    const tol = hitTolerance()
    let best = null
    let bestDist = Infinity
    for (const seg of project.segments) {
      const d = distPointSegment(wx, wy, seg.x1, seg.y1, seg.x2, seg.y2)
      // 线段太细时（width 远小于容差）以容差为准；木条宽度也参与（宽条点击中部应算命中）
      const effective = Math.max(tol, seg.width / 2 + 2 / ui.zoom)
      if (d <= effective && d < bestDist) {
        bestDist = d
        best = seg
      }
    }
    return best
  }

  /** 点选：命中则选所属线族；未命中则清空 */
  function clickAt(wx, wy, additive = false) {
    const seg = pickSegment(wx, wy)
    if (!seg) {
      ui.clearSelection()
      return null
    }
    if (additive) {
      ui.toggleSelectPattern(seg.patternId)
    } else {
      ui.setSelectedPatterns([seg.patternId])
    }
    return seg
  }

  /** 框选：世界坐标矩形内与任一 segment 相交的线族 */
  function boxSelect(rect) {
    const ids = new Set()
    const norm = {
      x: Math.min(rect.x1, rect.x2),
      y: Math.min(rect.y1, rect.y2),
      w: Math.abs(rect.x2 - rect.x1),
      h: Math.abs(rect.y2 - rect.y1)
    }
    if (norm.w < 1e-6 || norm.h < 1e-6) return
    for (const seg of project.segments) {
      if (segmentRectOverlap(seg.x1, seg.y1, seg.x2, seg.y2, norm)) {
        ids.add(seg.patternId)
      }
    }
    ui.setSelectedPatterns([...ids])
  }

  /** 删除选中的线族（可撤销） */
  function deleteSelected() {
    if (!ui.selectedPatternIds.length) return
    const ids = [...ui.selectedPatternIds]
    history.beginEdit(() => project.removePatterns(ids))
    ui.clearSelection()
  }

  /** 给选中的每个图案生成新 id 副本（复制，可撤销） */
  function duplicateSelected() {
    if (!ui.selectedPatternIds.length) return
    history.beginEdit(() => {
      const clones = ui.selectedPatternIds
        .map((id) => project.patternById(id))
        .filter(Boolean)
        .map((p) => {
          if (p.kind === 'line') {
            return {
              ...p,
              id: uid('ln'),
              x1: p.x1 + 10,
              y1: p.y1 + 10,
              x2: p.x2 + 10,
              y2: p.y2 + 10
            }
          }
          return {
            ...p,
            id: uid('pat'),
            ref: { x: p.ref.x + 10, y: p.ref.y + 10 }
          }
        })
      project.addPatterns(clones)
      ui.setSelectedPatterns(clones.map((c) => c.id))
    })
  }

  return { pickSegment, clickAt, boxSelect, deleteSelected, duplicateSelected, hitTolerance }
}
