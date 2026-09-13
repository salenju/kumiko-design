// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProjectStore } from './project.js'
import { builtinModule } from '../core/library/index.js'

let project

beforeEach(() => {
  setActivePinia(createPinia())
  project = useProjectStore()
})

const RECT = { x: 0, y: 0, w: 200, h: 200 }

function addKoushi(overrides = {}) {
  return project.addGroup({
    module: builtinModule('mod-koushi'),
    params: { spacing: 50, width: 4, ...overrides },
    rect: RECT
  })
}

describe('project store：图案库实例（PatternGroup）', () => {
  it('addGroup 展开为带 groupId/moduleId/endCut 的图案', () => {
    const g = addKoushi()
    expect(g).toBeTruthy()
    expect(project.groups).toHaveLength(1)
    expect(project.patterns).toHaveLength(2)
    expect(project.patterns.every((p) => p.groupId === g.id)).toBe(true)
    expect(project.patterns.every((p) => p.moduleId === 'mod-koushi')).toBe(true)
    expect(project.patterns.every((p) => p.endCut === 90)).toBe(true)
  })

  it('patternMeta 提供分类 / 模块名 / 端角', () => {
    const g = addKoushi({ endCut: 45 })
    const meta = project.patternMeta[g.patternIds[0]]
    expect(meta.category).toBe('basic')
    expect(meta.categoryName).toBe('基础网格')
    expect(meta.moduleName).toBe('井字（方格）')
    expect(meta.endCut).toBe(45)
  })

  it('updateGroup 整体重建几何并返回新 id（旧 id 全部移除）', () => {
    const g = addKoushi()
    const oldIds = [...g.patternIds]
    const res = project.updateGroup(g.id, { params: { spacing: 100 } })
    expect(res.patternIds).toHaveLength(2)
    expect(res.patternIds.every((id) => !oldIds.includes(id))).toBe(true)
    expect(project.patterns.filter((p) => oldIds.includes(p.id))).toHaveLength(0)
    // 间距 100 覆盖 200 的框 → 每族 3 条线
    const spacing = project.patterns.map((p) => p.spacing)
    expect(spacing.every((v) => v === 100)).toBe(true)
    expect(project.groupById(g.id).params.spacing).toBe(100)
  })

  it('expandSelection 把单个成员扩展为整个实例', () => {
    const g = addKoushi()
    const expanded = project.expandSelection([g.patternIds[0]])
    expect(expanded.sort()).toEqual([...g.patternIds].sort())
    expect(project.expandSelection(['unknown'])).toEqual(['unknown'])
  })

  it('removeGroups 级联删除展开的图案', () => {
    const g = addKoushi()
    project.removeGroups([g.id])
    expect(project.groups).toHaveLength(0)
    expect(project.patterns).toHaveLength(0)
  })

  it('removePatterns 会从实例中剔除成员，成员耗尽则移除实例', () => {
    const g = addKoushi()
    project.removePatterns([g.patternIds[0]])
    expect(project.groupById(g.id).patternIds).toHaveLength(1)
    // 取更新后的成员 id（实例对象的 patternIds 已刷新）
    project.removePatterns([project.groupById(g.id).patternIds[0]])
    expect(project.groups).toHaveLength(0)
  })

  it('removeSelection 同时处理实例与裸图案', () => {
    const g = addKoushi()
    project.addPattern({ id: 'ln-1', kind: 'line', x1: 0, y1: 0, x2: 50, y2: 0, width: 3 })
    project.removeSelection([g.patternIds[0], 'ln-1'])
    expect(project.groups).toHaveLength(0)
    expect(project.patterns).toHaveLength(0)
  })

  it('duplicatePatterns 复制整个实例且不带槽位绑定', () => {
    project.setLayout({ enabled: true, rows: 2, cols: 2, pitchX: 100, pitchY: 100 })
    const g = project.addGroup({
      module: builtinModule('mod-koushi'),
      params: { spacing: 50, width: 4 },
      rect: { x: 0, y: 0, w: 100, h: 100 },
      cell: { row: 0, col: 0 }
    })
    const created = project.duplicatePatterns([g.patternIds[0]], 10)
    expect(created.length).toBe(2)
    expect(project.groups).toHaveLength(2)
    const copy = project.groups.find((x) => x.id !== g.id)
    expect(copy.cell).toBeNull()
    expect(copy.rect.x).toBe(10)
  })
})

describe('project store：初始化框架', () => {
  it('setLayout 让绑定实例跟随槽位重排', () => {
    project.setLayout({ enabled: true, rows: 2, cols: 3, pitchX: 120, pitchY: 120 })
    const g = project.addGroup({
      module: builtinModule('mod-koushi'),
      params: { spacing: 50, width: 4 },
      rect: { x: 0, y: 0, w: 100, h: 100 },
      cell: { row: 1, col: 2 }
    })
    const bounds = project.patternsOfGroup(g.id)[0].bounds
    expect(bounds.x).toBe(2 * 120)
    expect(bounds.y).toBe(1 * 120)

    // 列数变化 → 槽位位置变化 → 实例跟随
    project.setLayout({ cols: 4 })
    const moved = project.patternsOfGroup(g.id)[0].bounds
    expect(moved.x).toBe(2 * 120) // col 2 位置不变，行间距不变
    expect(project.slots).toHaveLength(2 * 4)
  })

  it('槽位越界时回退为实例当前实际位置（不丢数据）', () => {
    project.setLayout({ enabled: true, rows: 3, cols: 3, pitchX: 100, pitchY: 100 })
    const g = project.addGroup({
      module: builtinModule('mod-koushi'),
      params: { spacing: 50, width: 4 },
      rect: { x: 0, y: 0, w: 100, h: 100 },
      cell: { row: 2, col: 2 }
    })
    const before = project.patternsOfGroup(g.id)[0].bounds.x
    project.setLayout({ rows: 1, cols: 1 })
    const after = project.patternsOfGroup(g.id)[0].bounds
    expect(after.x).toBe(before) // 保持原位
    expect(project.groups).toHaveLength(1)
  })

  it('slotOccupancy 标记已填充槽位', () => {
    project.setLayout({ enabled: true, rows: 2, cols: 2, pitchX: 100, pitchY: 100 })
    const g = project.addGroup({
      module: builtinModule('mod-koushi'),
      params: { spacing: 50, width: 4 },
      rect: { x: 0, y: 0, w: 100, h: 100 },
      cell: { row: 0, col: 1 }
    })
    expect(project.slotOccupancy['0:1']).toBe(g.id)
    expect(project.slotOccupancy['0:0']).toBeUndefined()
  })

  it('slotAt / nearestSlotAt 命中', () => {
    project.setLayout({ enabled: true, rows: 2, cols: 2, pitchX: 100, pitchY: 100 })
    expect(project.slotAt({ x: 150, y: 50 })).toMatchObject({ row: 0, col: 1 })
    expect(project.nearestSlotAt({ x: 90, y: 190 })).toMatchObject({ row: 1, col: 0 })
    project.setLayout({ enabled: false })
    expect(project.slotAt({ x: 150, y: 50 })).toBeNull()
  })

  it('clearLayout(true) 仅解绑槽位，图案保留', () => {
    project.setLayout({ enabled: true, rows: 1, cols: 1, pitchX: 100, pitchY: 100 })
    const g = project.addGroup({
      module: builtinModule('mod-koushi'),
      params: { spacing: 50, width: 4 },
      rect: { x: 0, y: 0, w: 100, h: 100 },
      cell: { row: 0, col: 0 }
    })
    project.clearLayout(true)
    expect(project.layout.enabled).toBe(false)
    expect(project.groups).toHaveLength(1)
    expect(project.groupById(g.id).cell).toBeNull()
    expect(project.patterns.length).toBeGreaterThan(0)
  })

  it('clearLayout(false) 连图案一起清除', () => {
    const g = addKoushi()
    expect(g).toBeTruthy()
    project.clearLayout(false)
    expect(project.groups).toHaveLength(0)
    expect(project.patterns).toHaveLength(0)
  })

  it('unbindGroupCell 解除绑定', () => {
    const g = addKoushi()
    project.updateGroup(g.id, { cell: { row: 0, col: 0 } })
    project.unbindGroupCell([g.id])
    expect(project.groupById(g.id).cell).toBeNull()
  })
})

describe('project store：持久化与快照', () => {
  it('snapshot / restore 保留 groups 与 layout', () => {
    project.setLayout({ enabled: true, rows: 2, cols: 2, pitchX: 120, pitchY: 120 })
    const g = addKoushi({ endCut: 45 })
    const snap = project.snapshot()

    setActivePinia(createPinia())
    const fresh = useProjectStore()
    expect(fresh.groups).toHaveLength(0)
    fresh.restore(snap)
    expect(fresh.groups).toHaveLength(1)
    expect(fresh.groups[0].id).toBe(g.id)
    expect(fresh.layout.rows).toBe(2)
    expect(fresh.layout.pitchX).toBe(120)
    expect(fresh.groups[0].module.families).toHaveLength(2)
  })

  it('replaceAll 兼容旧数据（无 groups/layout 时回退默认并清空）', () => {
    addKoushi()
    project.replaceAll({ patterns: [{ id: 'ln-1', kind: 'line', x1: 0, y1: 0, x2: 5, y2: 0, width: 3 }] })
    expect(project.groups).toHaveLength(0)
    expect(project.layout.enabled).toBe(false)
    expect(project.patterns).toHaveLength(1)
  })

  it('setPatternEndCut 只作用于散图案', () => {
    project.addPattern({ id: 'ln-1', kind: 'line', x1: 0, y1: 0, x2: 50, y2: 0, width: 3 })
    project.setPatternEndCut(['ln-1'], 999)
    expect(project.patternById('ln-1').endCut).toBe(170)
  })
})

describe('project store：初始化框架的线条', () => {
  it('setLayout 用线条生成框架：横线 + 竖线，并参与求交派生', () => {
    project.setLayout({ enabled: true, rows: 2, cols: 3, pitchX: 100, pitchY: 100 })
    const frames = project.framePatternsOf
    expect(frames).toHaveLength(2)
    expect(frames.map((p) => p.angle).sort((a, b) => a - b)).toEqual([0, 90])
    expect(frames.find((p) => p.angle === 0).count).toBe(3) // rows + 1
    expect(frames.find((p) => p.angle === 90).count).toBe(4) // cols + 1

    // 派生段：3 条横线 × 3 段 + 4 条竖线 × 2 段 = 17
    const frameSegs = project.segments.filter((s) => s.patternId.startsWith('frame-'))
    expect(frameSegs).toHaveLength(3 * 3 + 4 * 2)
    expect(frameSegs.every((s) => Math.abs(s.length - 100) < 1e-6)).toBe(true)
  })

  it('改行列数整体重建线条（旧线不残留、无重复）', () => {
    project.setLayout({ enabled: true, rows: 1, cols: 1, pitchX: 50, pitchY: 50 })
    project.setLayout({ rows: 3, cols: 4 })
    expect(project.framePatternsOf).toHaveLength(2)
    expect(project.framePatternsOf.find((p) => p.angle === 0).count).toBe(4)
    expect(project.framePatternsOf.find((p) => p.angle === 90).count).toBe(5)
  })

  it('框架线不可单独删除，clearLayout 才移除', () => {
    project.setLayout({ enabled: true, rows: 1, cols: 1, pitchX: 50, pitchY: 50 })
    project.removePatterns(['frame-h', 'frame-v'])
    expect(project.framePatternsOf).toHaveLength(2)
    project.clearLayout(true)
    expect(project.framePatternsOf).toHaveLength(0)
  })

  it('patternMeta 把框架线归入「框架」分类', () => {
    project.setLayout({ enabled: true, rows: 1, cols: 1, pitchX: 50, pitchY: 50 })
    const meta = project.patternMeta['frame-h']
    expect(meta.category).toBe('frame')
    expect(meta.categoryName).toBe('框架')
    expect(meta.moduleName).toBe('初始化框架')
    expect(meta.endCut).toBe(90)
  })

  it('框架线不参与复制', () => {
    project.setLayout({ enabled: true, rows: 1, cols: 1, pitchX: 50, pitchY: 50 })
    const created = project.duplicatePatterns(['frame-h'], 10)
    expect(created).toHaveLength(0)
    expect(project.framePatternsOf).toHaveLength(2)
  })

  it('框架线随快照持久化并可恢复', () => {
    project.setLayout({ enabled: true, rows: 2, cols: 2, pitchX: 100, pitchY: 100 })
    const snap = project.snapshot()
    setActivePinia(createPinia())
    const fresh = useProjectStore()
    fresh.restore(snap)
    expect(fresh.framePatternsOf).toHaveLength(2)
    expect(fresh.segments.length).toBeGreaterThan(0)
    expect(fresh.frameBounds()).toEqual({ x: 0, y: 0, w: 200, h: 200 })
  })
})
