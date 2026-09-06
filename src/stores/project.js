import { defineStore } from 'pinia'
import { deriveSegments, segmentsBounds, translatePattern } from '../core/index.js'

/**
 * project store —— 唯一持久化数据源（V2 §3.2）
 * 只存纯数据：
 *   - kind:'family'  平行线族（参数化，求交派生）
 *   - kind:'line'    单根独立线段 { x1,y1,x2,y2,width }（不参与求交，直接作为一段渲染/算料）
 *   - material 材料规格
 *   - spacingUnit 全局间距单位 mm（默认 10）：线族「间距」/单线「相邻线间距」
 *     按该单位的整数倍（Nx）设置，见 core/patterns/spacing.js 的换算与下拉选项。
 * 派生 segments 由 getter 实时计算（响应式缓存），不入 state、不持久化。
 */
export const useProjectStore = defineStore('project', {
  state: () => ({
    version: 4,
    patterns: [],
    material: {
      stockLength: 1200, // 标准条长 mm
      kerf: 1.5, // 锯缝 mm
      endAllowance: 2 // 每端端部处理余量 mm（45° 斜切近似）
    },
    spacingUnit: 10 // 全局间距单位 mm（1x = 1 × spacingUnit）
  }),

  getters: {
    /** 单线图案直接作为一段（不参与求交） */
    lineSegments(state) {
      return state.patterns
        .filter((p) => p && p.kind === 'line')
        .map((p) => ({
          id: p.id,
          x1: p.x1,
          y1: p.y1,
          x2: p.x2,
          y2: p.y2,
          length: Math.hypot(p.x2 - p.x1, p.y2 - p.y1),
          width: p.width,
          patternId: p.id,
          lineIndex: 0
        }))
    },

    /** 全部派生段 = 线族求交派生段 + 单线（依赖 patterns 引用，仅在数据变化时重算） */
    segments(state) {
      const families = state.patterns.filter((p) => p && p.kind === 'family')
      return [...this.lineSegments, ...deriveSegments(families)]
    },

    /** 整体图案 bounds（mm）；无图案时给一个默认画布区域（工作台范围） */
    bounds(state) {
      return (
        segmentsBounds(this.segments) ?? { x: -200, y: -200, w: 400, h: 400 }
      )
    },

    patternById: (state) => (id) => state.patterns.find((p) => p.id === id),

    totalSegmentLength(state) {
      return this.segments.reduce((s, x) => s + x.length, 0)
    }
  },

  actions: {
    /** 追加若干线族（纯数据，由调用方负责 undo 记录） */
    addPatterns(patterns) {
      this.patterns = [...this.patterns, ...patterns]
    },

    /** 追加单个线族并返回其引用 */
    addPattern(pattern) {
      this.patterns = [...this.patterns, pattern]
      return pattern
    },

    /** 原位更新线族字段 */
    updatePattern(id, patch) {
      this.patterns = this.patterns.map((p) =>
        p.id === id ? { ...p, ...patch } : p
      )
    },

    /**
     * 平移整个图案（单线平移两端点 / 线族整体平移 ref+bounds）。
     * 拖拽中高频调用；由调用方负责撤销（一次拖拽一条历史）。
     */
    translatePattern(id, dx, dy) {
      this.patterns = this.patterns.map((p) =>
        p.id === id ? translatePattern(p, dx, dy) : p
      )
    },

    /** 删除若干线族 */
    removePatterns(ids) {
      const set = new Set(ids)
      this.patterns = this.patterns.filter((p) => !set.has(p.id))
    },

    setMaterial(patch) {
      this.material = { ...this.material, ...patch }
    },

    /** 设置全局间距单位 mm（>0 生效；面板负责会话级撤销） */
    setSpacingUnit(v) {
      const n = Number(v)
      if (Number.isFinite(n) && n > 0) this.spacingUnit = n
    },

    /**
     * 整体替换（undo/redo/加载用）。
     * 兼容旧数据：某字段缺失时保持当前值（spacingUnit 缺省=默认 10）。
     */
    replaceAll({ patterns, material, spacingUnit }) {
      if (Array.isArray(patterns)) this.patterns = patterns
      if (material) this.material = { ...this.material, ...material }
      if (typeof spacingUnit === 'number' && Number.isFinite(spacingUnit) && spacingUnit > 0) {
        this.spacingUnit = spacingUnit
      }
    },

    /** 返回可序列化快照（纯 JSON 字符串） */
    snapshot() {
      return JSON.stringify({
        version: this.version,
        patterns: this.patterns,
        material: this.material,
        spacingUnit: this.spacingUnit
      })
    },

    /** 从快照恢复 */
    restore(json) {
      const data = JSON.parse(json)
      this.replaceAll(data)
    }
  }
})
