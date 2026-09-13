import { useProjectStore } from '../stores/project.js'
import { useUiStore } from '../stores/ui.js'
import { useHistoryStore } from '../stores/history.js'
import { distPointSegment, segmentRectOverlap } from '../core/geometry/index.js'

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

  /** 应用选择：自动扩展到「图案库实例」的全部成员 */
  function applySelection(ids, additive) {
    const expanded = project.expandSelection(ids)
    if (additive) {
      ui.setSelectedPatterns([...new Set([...ui.selectedPatternIds, ...expanded])])
    } else {
      ui.setSelectedPatterns(expanded)
    }
  }

  /** 点选：命中则选所属图案（含其所属实例）；未命中则清空 */
  function clickAt(wx, wy, additive = false) {
    const seg = pickSegment(wx, wy)
    if (!seg) {
      ui.clearSelection()
      return null
    }
    applySelection([seg.patternId], additive)
    return seg
  }

  /** 框选：世界坐标矩形内与任一 segment 相交的图案（含实例展开） */
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
    applySelection([...ids], false)
  }

  /** 删除选中（实例级联删除，可撤销） */
  function deleteSelected() {
    if (!ui.selectedPatternIds.length) return
    const ids = [...ui.selectedPatternIds]
    history.beginEdit(() => project.removeSelection(ids))
    ui.clearSelection()
  }

  /** 复制选中（实例整体复制，可撤销） */
  function duplicateSelected() {
    if (!ui.selectedPatternIds.length) return
    const ids = [...ui.selectedPatternIds]
    history.beginEdit(() => {
      const created = project.duplicatePatterns(ids, 10)
      if (created.length) ui.setSelectedPatterns(created)
    })
  }

  return { pickSegment, clickAt, boxSelect, deleteSelected, duplicateSelected, hitTolerance }
}
