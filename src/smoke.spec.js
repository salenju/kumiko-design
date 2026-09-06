// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProjectStore } from './stores/project.js'
import { useUiStore } from './stores/ui.js'
import { useHistoryStore } from './stores/history.js'
import { useSelection } from './composables/useSelection.js'
import { generatePatterns } from './core/presets/index.js'
import { aggregateCutItems, planStock } from './core/cutlist/index.js'
import { buildSvgString } from './utils/exportSvg.js'

describe('状态集成冒烟：store + composable + core 数据流', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('添加预设 → 派生段 → 点选命中 → 撤销/重做', () => {
    const project = useProjectStore()
    const ui = useUiStore()
    const history = useHistoryStore()
    const selection = useSelection()

    // 1. 通过撤销包装添加麻叶纹
    const patterns = generatePatterns('asanoha', { size: 100, spacing: 20, width: 3 })
    history.beginEdit(() => project.addPatterns(patterns))
    expect(project.patterns.length).toBe(3)
    expect(project.segments.length).toBeGreaterThan(10)
    expect(history.canUndo).toBe(true)

    // 2. 命中第一条线段 → 选中其线族
    const first = project.segments[0]
    const midX = (first.x1 + first.x2) / 2
    const midY = (first.y1 + first.y2) / 2
    const seg = selection.clickAt(midX, midY)
    expect(seg).not.toBeNull()
    expect(ui.selectedPatternIds).toEqual([seg.patternId])

    // 3. 修改间距（模拟编辑会话：focus→input→change）
    const before = project.snapshot()
    history.push(before) // 视同字段编辑提交起点
    project.updatePattern(seg.patternId, { spacing: 30 })
    expect(project.patternById(seg.patternId).spacing).toBe(30)

    // 4. 撤销 → 恢复原间距
    history.undo()
    expect(project.patternById(seg.patternId).spacing).toBe(20)
    // 再撤销 → 图案消失
    history.undo()
    expect(project.patterns.length).toBe(0)
    // 重做两次回来
    history.redo()
    history.redo()
    expect(project.patterns.length).toBe(3)
    expect(project.patternById(seg.patternId).spacing).toBe(30)
  })

  it('空画布点击清空选择', () => {
    const ui = useUiStore()
    const project = useProjectStore()
    const selection = useSelection()
    const patterns = generatePatterns('koushi', { size: 60, spacing: 20, width: 2 })
    project.addPatterns(patterns)
    ui.setSelectedPatterns(patterns.map((p) => p.id))
    expect(ui.selectedPatternIds.length).toBe(2)
    selection.clickAt(9999, 9999) // 远处空白
    expect(ui.selectedPatternIds.length).toBe(0)
  })

  it('框选命中跨越多段的多族', () => {
    const ui = useUiStore()
    const project = useProjectStore()
    const selection = useSelection()
    project.addPatterns(generatePatterns('koushi', { size: 100, spacing: 20, width: 2 }))
    // 框选包含整个图案
    selection.boxSelect({ x1: -200, y1: -200, x2: 200, y2: 200 })
    expect(ui.selectedPatternIds.length).toBe(2)
  })

  it('删除选中（可撤销）', () => {
    const ui = useUiStore()
    const project = useProjectStore()
    const history = useHistoryStore()
    const selection = useSelection()
    const patterns = generatePatterns('diagonal', { size: 80, spacing: 20, width: 2 })
    project.addPatterns(patterns)
    ui.setSelectedPatterns([patterns[0].id])
    selection.deleteSelected()
    expect(project.patterns.length).toBe(1)
    history.undo()
    expect(project.patterns.length).toBe(2)
  })

  it('算料与导出链：segments → cut list → SVG 字符串', () => {
    const project = useProjectStore()
    project.addPatterns(generatePatterns('koushi', { size: 120, spacing: 30, width: 3 }))
    const items = aggregateCutItems(project.segments)
    expect(items.length).toBeGreaterThan(0)
    const plan = planStock(items, { stockLength: 1200, kerf: 1.5 })
    expect(plan.count).toBeGreaterThan(0)
    expect(plan.utilization).toBeGreaterThan(0)
    const svg = buildSvgString(project.segments)
    expect(svg).toContain('<line')
  })

  it('持久化快照往返（纯数据序列化不破坏派生）', () => {
    const project = useProjectStore()
    const history = useHistoryStore()
    const patterns = generatePatterns('asanoha', { size: 60, spacing: 15, width: 2 })
    history.beginEdit(() => project.addPatterns(patterns))
    const snap = project.snapshot()
    const segCountBefore = project.segments.length
    // 模拟 reload：新 store 实例恢复
    setActivePinia(createPinia())
    const p2 = useProjectStore()
    p2.restore(snap)
    expect(p2.patterns.length).toBe(3)
    expect(p2.segments.length).toBe(segCountBefore)
  })

  it('画单线（kind:line）：直接作为一段渲染/算料/点选，可删除', () => {
    const project = useProjectStore()
    const ui = useUiStore()
    const history = useHistoryStore()
    const selection = useSelection()

    // 1. 加一条单线（不参与线族求交）
    history.beginEdit(() =>
      project.addPattern({
        id: 'ln1',
        kind: 'line',
        x1: 0,
        y1: 0,
        x2: 80,
        y2: 0,
        width: 3
      })
    )
    expect(project.patterns.length).toBe(1)
    expect(project.segments.length).toBe(1)
    expect(project.segments[0].length).toBeCloseTo(80, 9)
    expect(project.totalSegmentLength).toBeCloseTo(80, 6)

    // 2. 单线参与算料（按宽度分组）
    const items = aggregateCutItems(project.segments)
    expect(items).toEqual([{ width: 3, length: 80, qty: 1 }])
    expect(buildSvgString(project.segments)).toContain('<line')

    // 3. 点选命中单线 → 选中其自身 id
    const seg = selection.clickAt(40, 0)
    expect(seg && seg.patternId).toBe('ln1')
    expect(ui.selectedPatternIds).toEqual(['ln1'])

    // 4. 编辑端点（模拟属性面板会话）→ 长度变化
    const before = project.snapshot()
    history.push(before)
    project.updatePattern('ln1', { x2: 120 })
    expect(project.segments[0].length).toBeCloseTo(120, 6)

    // 5. 撤销编辑
    history.undo()
    expect(project.segments[0].length).toBeCloseTo(80, 6)

    // 6. 删除单线（可撤销）
    selection.deleteSelected()
    expect(project.patterns.length).toBe(0)
    expect(project.segments.length).toBe(0)
    history.undo()
    expect(project.patterns.length).toBe(1)
  })

  it('单线与线族共存：混合渲染与派生段合并', () => {
    const project = useProjectStore()
    const history = useHistoryStore()
    history.beginEdit(() => {
      project.addPatterns(generatePatterns('koushi', { size: 60, spacing: 20, width: 2 }))
      project.addPattern({ id: 'lnX', kind: 'line', x1: -5, y1: 0, x2: 65, y2: 0, width: 2 })
    })
    // 方格两族各自派生段 + 单线 1 段
    const familySegs = project.segments.filter((s) => s.patternId !== 'lnX')
    const lineSegs = project.segments.filter((s) => s.patternId === 'lnX')
    expect(lineSegs.length).toBe(1)
    expect(familySegs.length).toBeGreaterThan(0)
    // bounds 覆盖单线（segmentsBounds 语义，不依赖 pattern.bounds）
    expect(project.bounds.w).toBeGreaterThanOrEqual(60)
  })

  it('bounds 默认工作台范围（空画布）', () => {
    const project = useProjectStore()
    const b = project.bounds
    expect(b.w).toBe(400)
    expect(b.h).toBe(400)
  })

  it('全局间距单位：默认10、setSpacingUnit 可撤销、随快照往返', () => {
    const project = useProjectStore()
    const history = useHistoryStore()
    expect(project.spacingUnit).toBe(10)

    // 修改（可撤销）
    history.beginEdit(() => project.setSpacingUnit(15))
    expect(project.spacingUnit).toBe(15)
    history.undo()
    expect(project.spacingUnit).toBe(10)

    // 非法值忽略
    project.setSpacingUnit(0)
    expect(project.spacingUnit).toBe(10)

    // 快照 → 新 store 恢复（模拟 reload/undo/打开文件）
    history.beginEdit(() => project.setSpacingUnit(25))
    const snap = project.snapshot()
    setActivePinia(createPinia())
    const p2 = useProjectStore()
    expect(p2.spacingUnit).toBe(10)
    p2.restore(snap)
    expect(p2.spacingUnit).toBe(25)

    // 旧格式快照（无 spacingUnit）恢复 → replaceAll 回退：保持当前值不丢单位
    const legacy = JSON.stringify({ version: 3, patterns: [], material: {} })
    p2.restore(legacy)
    expect(p2.spacingUnit).toBe(25)
  })
})
