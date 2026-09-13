import { defineStore } from 'pinia'
import {
  segmentsFromPatterns,
  segmentsBounds,
  translatePattern,
  patternsBounds,
  defaultColorScheme,
  normalizeScheme,
  angleKey,
  defaultLayout,
  normalizeLayout,
  layoutBounds,
  slotRect,
  allSlots,
  isSlotInRange,
  findSlotAt,
  nearestSlot,
  buildModulePatterns,
  framePatterns,
  FRAME_MODULE_ID,
  FRAME_MODULE_NAME,
  FRAME_CATEGORY_KEY,
  normalizeEndCut,
  DEFAULT_END_CUT,
  MANUAL_CATEGORY_KEY,
  categoryName
} from '../core/index.js'
import { uid } from '../utils/id.js'

/** 取出模块定义中生成几何所需的字段（随实例持久化，保证恢复后可重建） */
function slimModule(module) {
  if (!module) return null
  return {
    id: module.id,
    name: module.name,
    category: module.category,
    desc: module.desc,
    express: module.express,
    defaults: { ...(module.defaults || {}) },
    families: module.families ? module.families.map((f) => ({ ...f })) : undefined,
    segsStrategy: module.segsStrategy,
    segs: module.segs ? module.segs.map((s) => ({ ...s })) : undefined
  }
}

/**
 * project store —— 唯一持久化数据源（V2 §3.2）
 * 只存纯数据：
 *   - kind:'family'  平行线族（参数化，求交派生）
 *   - kind:'line'    单根独立线段 { x1,y1,x2,y2,width }（不参与求交，直接作为一段渲染/算料）
 *   - kind:'segs'    段集 { segments:[{x1,y1,x2,y2}],width,bounds }（龟甲等显式线段图案，不参与跨图案求交）
 *   - groups         图案库模块实例（图案组）：{ id, moduleId, name, category, params, cell, rect, patternIds, module }
 *   - layout         初始化框架（格子槽位参数，槽位本身由 getter 派生）
 *   - material 材料规格
 *   - spacingUnit 全局间距单位 mm（默认 10）
 *   - lineColors 线条配色（按方向角度）
 * 派生 segments 由 getter 实时计算（响应式缓存），不入 state、不持久化。
 */
export const useProjectStore = defineStore('project', {
  state: () => ({
    version: 6,
    patterns: [],
    groups: [],
    layout: defaultLayout(),
    material: {
      stockLength: 1200, // 标准条长 mm
      kerf: 1.5, // 锯缝 mm
      endAllowance: 2 // 每端端部处理余量 mm（45° 斜切近似）
    },
    spacingUnit: 10, // 全局间距单位 mm（1x = 1 × spacingUnit）
    lineColors: defaultColorScheme() // 线条按角度配色（见 core/colors.js）
  }),

  getters: {
    /**
     * 全部派生段 = 线族求交派生段 + 单线 + 段集。
     */
    segments(state) {
      return segmentsFromPatterns(state.patterns)
    },

    /** 整体图案 bounds（mm）；无图案时给一个默认画布区域（工作台范围） */
    bounds(state) {
      return (
        segmentsBounds(this.segments) ?? { x: -200, y: -200, w: 400, h: 400 }
      )
    },

    patternById: (state) => (id) => state.patterns.find((p) => p.id === id),

    groupById: (state) => (id) => state.groups.find((g) => g.id === id) || null,

    /** 初始化框架的全部槽位（派生，不入库） */
    slots(state) {
      return state.layout && state.layout.enabled ? allSlots(state.layout) : []
    },

    /** 槽位键 → 占用的实例（用于渲染「已填充」状态） */
    slotOccupancy(state) {
      const map = Object.create(null)
      for (const g of state.groups) {
        if (g.cell) map[`${g.cell.row}:${g.cell.col}`] = g.id
      }
      return map
    },

    /**
     * patternId → 展示/统计元信息。
     * 供画布端面线（endCut）、图案部件分类统计、属性面板共用。
     */
    patternMeta(state) {
      const map = Object.create(null)
      const byGroup = new Map(state.groups.map((g) => [g.id, g]))
      for (const p of state.patterns) {
        const g = p.groupId ? byGroup.get(p.groupId) : null
        const cat = g ? g.category : p.frame ? FRAME_CATEGORY_KEY : MANUAL_CATEGORY_KEY
        map[p.id] = {
          groupId: p.groupId || null,
          moduleId: p.moduleId || (g ? g.moduleId : null),
          moduleName: g ? g.name : p.frame ? FRAME_MODULE_NAME : '',
          category: cat,
          categoryName: categoryName(cat),
          endCut: normalizeEndCut(p.endCut ?? g?.params?.endCut ?? DEFAULT_END_CUT)
        }
      }
      return map
    },

    /** 初始化框架生成的格线图案 */
    framePatternsOf(state) {
      return state.patterns.filter((p) => p && p.frame)
    },

    totalSegmentLength(state) {
      return this.segments.reduce((s, x) => s + x.length, 0)
    },

    /** 某个实例当前占用的图案（用于拖拽/重建时取实际范围） */
    patternsOfGroup: (state) => (groupId) => {
      const g = state.groups.find((x) => x.id === groupId)
      if (!g) return []
      const set = new Set(g.patternIds)
      return state.patterns.filter((p) => set.has(p.id))
    }
  },

  actions: {
    /** 追加若干图案（纯数据，由调用方负责 undo 记录） */
    addPatterns(patterns) {
      this.patterns = [...this.patterns, ...patterns]
    },

    /** 追加单个图案并返回其引用 */
    addPattern(pattern) {
      this.patterns = [...this.patterns, pattern]
      return pattern
    },

    /** 原位更新图案字段 */
    updatePattern(id, patch) {
      this.patterns = this.patterns.map((p) =>
        p.id === id ? { ...p, ...patch } : p
      )
    },

    /**
     * 平移整个图案（单线平移两端点 / 段集逐段平移 / 线族整体平移 ref+bounds）。
     * 拖拽中高频调用；由调用方负责撤销（一次拖拽一条历史）。
     */
    translatePattern(id, dx, dy) {
      this.patterns = this.patterns.map((p) =>
        p.id === id ? translatePattern(p, dx, dy) : p
      )
    },

    /**
     * 删除若干图案；同步清理实例中已删除的成员，空实例自动移除。
     * 框架格线（frame:true）由 layout 参数管理，不参与单独删除。
     */
    removePatterns(ids) {
      const set = new Set(ids)
      this.patterns = this.patterns.filter((p) => p.frame || !set.has(p.id))
      if (!this.groups.length) return
      const next = []
      for (const g of this.groups) {
        const kept = g.patternIds.filter((id) => !set.has(id))
        if (kept.length) next.push(kept.length === g.patternIds.length ? g : { ...g, patternIds: kept })
      }
      if (next.length !== this.groups.length || next.some((g, i) => g !== this.groups[i])) {
        this.groups = next
      }
    },

    /** 统一批量删除（实例与散pattern混选）：先按实例级联，再删残留裸图案 */
    removeSelection(ids) {
      const set = new Set(ids)
      const patterns = this.patterns.filter((p) => set.has(p.id))
      const groupIds = new Set(patterns.map((p) => p.groupId).filter(Boolean))
      this.removeGroups([...groupIds])
      this.removePatterns(ids)
    },

    setMaterial(patch) {
      this.material = { ...this.material, ...patch }
    },

    /** 设置全局间距单位 mm（>0 生效；面板负责会话级撤销） */
    setSpacingUnit(v) {
      const n = Number(v)
      if (Number.isFinite(n) && n > 0) this.spacingUnit = n
    },

    /* ---------- 末端切口角（散图案） ---------- */

    /** 批量设置散图案（无实例归属）的末端切口角 */
    setPatternEndCut(ids, endCut) {
      const set = new Set(ids)
      const v = normalizeEndCut(endCut)
      this.patterns = this.patterns.map((p) => (set.has(p.id) ? { ...p, endCut: v } : p))
    },

    /* ---------- 图案库实例（PatternGroup） ---------- */

    /**
     * 新增实例：由模块定义 + 目标矩形 + 参数展开为 patterns。
     * @returns {object|null} 新建的 group
     */
    addGroup({ module, params, rect, cell = null }) {
      if (!module) return null
      const merged = { ...(module.defaults || {}), ...(params || {}) }
      // 绑定槽位时以槽位矩形为准（框架已启用且在范围内）
      const bound = cell && isSlotInRange(this.layout, cell) ? { row: cell.row, col: cell.col } : null
      const target = bound ? slotRect(this.layout, bound.row, bound.col) : rect
      if (!target || !(target.w > 0) || !(target.h > 0)) return null
      const groupId = uid('grp')
      const patterns = buildModulePatterns(module, { rect: target, params: merged, groupId })
      if (!patterns.length) return null
      const group = {
        id: groupId,
        moduleId: module.id,
        name: module.name || module.id,
        category: module.category || 'custom',
        desc: module.desc || '',
        params: merged,
        cell: bound,
        rect: { ...target },
        patternIds: patterns.map((p) => p.id),
        module: slimModule(module)
      }
      this.groups = [...this.groups, group]
      this.patterns = [...this.patterns, ...patterns]
      return group
    },

    /** 实例当前的实际矩形：绑定槽位则取槽位；否则取实例图案的实际包围盒（拖动后仍生效） */
    groupRectOf(groupId) {
      const g = this.groupById(groupId)
      if (!g) return null
      if (g.cell && isSlotInRange(this.layout, g.cell)) {
        return slotRect(this.layout, g.cell.row, g.cell.col)
      }
      const pats = this.patternsOfGroup(groupId)
      return patternsBounds(pats) || (g.rect ? { ...g.rect } : null)
    },

    /**
     * 更新实例（参数 / 槽位绑定 / 放置矩形），并按新几何整体重建。
     * @returns {{groupId:string, patternIds:string[]}|null}
     */
    updateGroup(groupId, patch = {}) {
      const g = this.groupById(groupId)
      if (!g) return null
      const params = { ...g.params, ...(patch.params || {}) }
      const cell = patch.cell !== undefined ? (patch.cell ? { ...patch.cell } : null) : g.cell
      let rect
      if (patch.rect) rect = { ...patch.rect }
      else if (cell && isSlotInRange(this.layout, cell)) rect = slotRect(this.layout, cell.row, cell.col)
      else rect = this.groupRectOf(groupId) || { ...g.rect }

      const patterns = buildModulePatterns(g.module, { rect, params, groupId })
      const oldIds = new Set(g.patternIds)
      const kept = this.patterns.filter((p) => !oldIds.has(p.id))
      this.patterns = [...kept, ...patterns]
      const patternIds = patterns.map((p) => p.id)
      this.groups = this.groups.map((x) =>
        x.id === groupId ? { ...x, params, cell, rect: { ...rect }, patternIds } : x
      )
      return { groupId, patternIds }
    },

    /** 批量删除实例（连带删除其展开的全部图案） */
    removeGroups(ids) {
      const set = new Set(ids)
      if (!set.size || !this.groups.length) return
      const doomed = new Set()
      for (const g of this.groups) {
        if (!set.has(g.id)) continue
        for (const pid of g.patternIds) doomed.add(pid)
      }
      this.patterns = this.patterns.filter((p) => !doomed.has(p.id))
      this.groups = this.groups.filter((g) => !set.has(g.id))
    },

    /** 解除实例的槽位绑定（保留图案，转为自由放置） */
    unbindGroupCell(ids) {
      const set = new Set(Array.isArray(ids) ? ids : [ids])
      this.groups = this.groups.map((g) => (set.has(g.id) ? { ...g, cell: null } : g))
    },

    /**
     * 复制选中图案；若选中项属于某个实例，则整个实例一起复制（新实例不带槽位绑定）。
     * @returns {string[]} 新图案 id 列表
     */
    duplicatePatterns(ids, offset = 10) {
      const set = new Set(ids)
      const sel = this.patterns.filter((p) => set.has(p.id))
      if (!sel.length) return []
      const byGroup = new Map(this.groups.map((g) => [g.id, g]))
      const newPatterns = []
      const newGroups = []
      const done = new Set()

      for (const p of sel) {
        if (p.groupId && byGroup.has(p.groupId)) continue
        if (p.frame) continue // 框架格线不复制（由 layout 管理）
        const clone = { ...p, id: uid(p.kind === 'line' ? 'ln' : 'pat') }
        delete clone.frame
        delete clone.moduleId
        newPatterns.push(translatePattern(clone, offset, offset))
      }
      for (const p of sel) {
        if (!p.groupId || done.has(p.groupId)) continue
        const g = byGroup.get(p.groupId)
        if (!g) continue
        done.add(p.groupId)
        const rect = patternsBounds(this.patternsOfGroup(g.id)) || g.rect
        if (!rect) continue
        const moved = { ...rect, x: rect.x + offset, y: rect.y + offset }
        const gid = uid('grp')
        const patterns = buildModulePatterns(g.module, { rect: moved, params: g.params, groupId: gid })
        if (!patterns.length) continue
        newPatterns.push(...patterns)
        newGroups.push({
          ...g,
          id: gid,
          cell: null,
          rect: moved,
          patternIds: patterns.map((x) => x.id)
        })
      }
      if (!newPatterns.length) return []
      this.patterns = [...this.patterns, ...newPatterns]
      this.groups = [...this.groups, ...newGroups]
      return newPatterns.map((p) => p.id)
    },

    /** 把图案 id 集合扩展为「包含其所属实例全部图案」的 id 集合 */
    expandSelection(ids) {
      const set = new Set(ids)
      if (this.groups.length) {
        const byGroup = new Map(this.groups.map((g) => [g.id, g]))
        for (const p of this.patterns) {
          if (!set.has(p.id) || !p.groupId) continue
          const g = byGroup.get(p.groupId)
          if (g) for (const pid of g.patternIds) set.add(pid)
        }
      }
      return [...set]
    },

    /* ---------- 初始化框架 ---------- */

    /**
     * 用当前 layout 重建框架格线（未启用时仅移除）。
     * 框架线是真实木条（kind:'family'），随参数变化整体替换：
     *   横线 rows+1 条 / 竖线 cols+1 条，相互求交后切成单元格边界段。
     */
    syncFrame() {
      const rest = this.patterns.filter((p) => p && !p.frame)
      const lines = framePatterns(this.layout)
      if (!lines.length && rest.length === this.patterns.length) return
      this.patterns = [...rest, ...lines]
    },

    /** 更新框架参数；格线整体重建，已有实例按单元格自动重排 */
    setLayout(patch) {
      this.layout = normalizeLayout({ ...this.layout, ...patch })
      this.syncFrame()
      this.rebuildGroups()
    },

    /**
     * 清除框架。
     * @param {boolean} keepPatterns true=仅解绑单元格（图案保留为自由放置）；false=连图案一起清除
     */
    clearLayout(keepPatterns = true) {
      if (keepPatterns) {
        const ok = new Set(this.groups.map((g) => g.id))
        this.groups = this.groups.map((g) => (ok.has(g.id) ? { ...g, cell: null } : g))
      } else {
        const doomed = new Set()
        for (const g of this.groups) for (const pid of g.patternIds) doomed.add(pid)
        this.patterns = this.patterns.filter((p) => !doomed.has(p.id))
        this.groups = []
      }
      this.layout = defaultLayout()
      this.syncFrame() // 移除框架格线
    },

    /** 框架整体外接矩形（mm） */
    frameBounds() {
      return this.layout?.enabled ? layoutBounds(this.layout) : null
    },

    /** 命中槽位（画布点击用） */
    slotAt(point) {
      if (!this.layout || !this.layout.enabled) return null
      return findSlotAt(this.layout, point)
    },

    /** 距点最近的槽位 */
    nearestSlotAt(point) {
      if (!this.layout || !this.layout.enabled) return null
      return nearestSlot(this.layout, point)
    },

    /** 按当前框架/实例实际位置，重建全部实例的几何（框架参数变更后调用） */
    rebuildGroups() {
      if (!this.groups.length) return
      const doomed = new Set()
      for (const g of this.groups) for (const pid of g.patternIds) doomed.add(pid)

      const nextGroups = []
      const added = []
      for (const g of this.groups) {
        const rect =
          g.cell && isSlotInRange(this.layout, g.cell)
            ? slotRect(this.layout, g.cell.row, g.cell.col)
            : this.groupRectOf(g.id)
        if (!rect) continue
        const patterns = buildModulePatterns(g.module, { rect, params: g.params, groupId: g.id })
        if (!patterns.length) continue
        added.push(...patterns)
        nextGroups.push({ ...g, rect: { ...rect }, patternIds: patterns.map((p) => p.id) })
      }
      this.patterns = [...this.patterns.filter((p) => !doomed.has(p.id)), ...added]
      this.groups = nextGroups
    },

    /* ----- 线条角度配色 ----- */

    /** 整体替换配色方案（会规整化；面板负责会话级撤销） */
    setLineColors(scheme) {
      this.lineColors = normalizeScheme(scheme)
    },

    /** 设置「其它角度」兜底色 */
    setLineFallback(color) {
      if (typeof color !== 'string' || !color) return
      this.lineColors = { ...this.lineColors, fallback: color }
    },

    /** 新增/覆盖某角度颜色（0.1° 匹配去重，按角度升序） */
    upsertLineColor(angle, color) {
      if (!Number.isFinite(angle) || typeof color !== 'string' || !color) return
      const k = angleKey(angle)
      const others = this.lineColors.angles.filter((e) => angleKey(e.angle) !== k)
      others.push({ angle: k, color })
      others.sort((a, b) => a.angle - b.angle)
      this.lineColors = { ...this.lineColors, angles: others }
    },

    /** 删除某角度颜色 */
    removeLineColor(angle) {
      if (!Number.isFinite(angle)) return
      const k = angleKey(angle)
      this.lineColors = {
        ...this.lineColors,
        angles: this.lineColors.angles.filter((e) => angleKey(e.angle) !== k)
      }
    },

    /** 恢复默认配色 */
    resetLineColors() {
      this.lineColors = defaultColorScheme()
    },

    /**
     * 整体替换（undo/redo/加载用）。
     * 兼容旧数据：某字段缺失时保持当前值。
     */
    replaceAll({ patterns, groups, layout, material, spacingUnit, lineColors }) {
      if (Array.isArray(patterns)) this.patterns = patterns
      if (Array.isArray(groups)) {
        this.groups = groups.filter((g) => g && g.id && g.module && Array.isArray(g.patternIds))
      } else {
        this.groups = []
      }
      if (layout) this.layout = normalizeLayout(layout)
      if (material) this.material = { ...this.material, ...material }
      if (typeof spacingUnit === 'number' && Number.isFinite(spacingUnit) && spacingUnit > 0) {
        this.spacingUnit = spacingUnit
      }
      if (lineColors && typeof lineColors === 'object') {
        this.lineColors = normalizeScheme(lineColors)
      }
    },

    /** 返回可序列化快照（纯 JSON 字符串） */
    snapshot() {
      return JSON.stringify({
        version: this.version,
        patterns: this.patterns,
        groups: this.groups,
        layout: this.layout,
        material: this.material,
        spacingUnit: this.spacingUnit,
        lineColors: this.lineColors
      })
    },

    /** 从快照恢复 */
    restore(json) {
      const data = JSON.parse(json)
      this.replaceAll(data)
    }
  }
})
