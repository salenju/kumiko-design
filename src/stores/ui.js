import { defineStore } from 'pinia'
import { useProjectStore } from './project.js'

/**
 * ui store —— 视图/工具/选中/吸附状态（V2 §3.2）
 * 不持久化。
 */
export const useUiStore = defineStore('ui', {
  state: () => ({
    tool: 'select', // 'select' | 'pattern' | 'pan'
    // 视图：center = 视口中心对应的世界坐标（mm）；zoom = 像素/mm
    center: { x: 0, y: 0 },
    zoom: 1.5,
    // 吸附与显示
    snapGrid: 1, // 网格吸附步长 mm
    snapAngle: 15, // 角度步进 deg
    gridEnabled: true,
    snapEnabled: true,
    labelsEnabled: false, // 全图尺寸标注
    selectedPatternIds: [], // 当前选中线族
    hoveredSegmentId: null,
    // 交互草稿
    draft: null, // { x, y, angle, spacing, count, width, size } 画线族预览
    spacePan: false // 空格临时平移中（配合鼠标拖动）
  }),

  getters: {
    selectedPatterns(state) {
      const project = useProjectStore()
      return state.selectedPatternIds
        .map((id) => project.patternById(id))
        .filter(Boolean)
    }
  },

  actions: {
    setTool(tool) {
      this.tool = tool
      this.draft = null
    },
    setSpacePan(v) {
      this.spacePan = v
    },
    setCenter(x, y) {
      this.center = { x, y }
    },
    panBy(dxMm, dyMm) {
      this.center = { x: this.center.x + dxMm, y: this.center.y + dyMm }
    },
    setZoom(zoom, { aroundWorld } = {}) {
      // aroundWorld: 保持该世界坐标不动（滚轮锚定）
      if (aroundWorld) {
        // 视口中心偏移量（世界坐标）
        const dx = this.center.x - aroundWorld.x
        const dy = this.center.y - aroundWorld.y
        const ratio = this.zoom / zoom
        this.zoom = zoom
        this.center = {
          x: aroundWorld.x + dx * ratio,
          y: aroundWorld.y + dy * ratio
        }
      } else {
        this.zoom = zoom
      }
    },
    toggleSelectPattern(id) {
      const i = this.selectedPatternIds.indexOf(id)
      if (i >= 0) this.selectedPatternIds.splice(i, 1)
      else this.selectedPatternIds.push(id)
    },
    setSelectedPatterns(ids) {
      this.selectedPatternIds = [...ids]
    },
    clearSelection() {
      this.selectedPatternIds = []
    },
    setHovered(segmentId) {
      this.hoveredSegmentId = segmentId
    }
  }
})
