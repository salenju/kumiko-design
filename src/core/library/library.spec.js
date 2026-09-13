import { describe, it, expect } from 'vitest'
import {
  DEFAULT_LAYOUT,
  defaultLayout,
  normalizeLayout,
  frameLineCount,
  slotRect,
  allSlots,
  findSlotAt,
  nearestSlot,
  layoutBounds,
  insetRect,
  slotKey,
  parseSlotKey,
  isSlotInRange
} from './layout.js'
import { framePatterns, replaceFramePatterns, FRAME_MODULE_ID, FRAME_PREFIX } from './frame.js'
import { familyLines } from '../patterns/family.js'
import {
  DEFAULT_END_CUT,
  normalizeEndCut,
  isSquareCut,
  isOnBoundsEdge,
  boundaryEnds,
  endFaceLine,
  buildEndFaces
} from './endCut.js'
import {
  BUILTIN_MODULES,
  CATEGORIES,
  builtinModule,
  categoryName,
  MANUAL_CATEGORY_KEY,
  searchModules
} from './catalog.js'
import {
  buildModulePatterns,
  clipSegmentToRect,
  kikkouSegments,
  mergeCollinearSegments,
  generateModuleSegments,
  generateModulePatterns,
  placeRect
} from './build.js'
import { moduleFromPatterns, patternsExtent } from './custom.js'
import { segmentsFromPatterns } from '../patterns/derive.js'
import { analyzeParts, groupPartsByCategory } from '../parts/parts.js'

const rect = { x: 0, y: 0, w: 300, h: 300 }

describe('layout：初始化框架与单元格', () => {
  const layout = normalizeLayout({ rows: 3, cols: 4, pitchX: 200, pitchY: 200 })

  it('默认框架合法', () => {
    const d = defaultLayout()
    expect(d.rows).toBe(DEFAULT_LAYOUT.rows)
    expect(d.origin).toEqual({ x: 0, y: 0 })
  })

  it('单元格矩形 = 间距 × 间距，相邻无缝', () => {
    expect(slotRect(layout, 0, 0)).toEqual({ x: 0, y: 0, w: 200, h: 200 })
    expect(slotRect(layout, 1, 2)).toEqual({ x: 400, y: 200, w: 200, h: 200 })
    expect(slotRect(layout, 2, 3)).toEqual({ x: 600, y: 400, w: 200, h: 200 })
  })

  it('单元格数量 = 行 × 列', () => {
    expect(allSlots(layout)).toHaveLength(12)
  })

  it('线条数 = 行+1 条横线、列+1 条竖线', () => {
    expect(frameLineCount(layout)).toEqual({ horizontal: 4, vertical: 5 })
  })

  it('框架包围盒 = 列×横向间距 × 行×纵向间距', () => {
    expect(layoutBounds(layout)).toEqual({ x: 0, y: 0, w: 800, h: 600 })
  })

  it('命中单元格：格内归该格，边界归右/下格，框架外返回 null', () => {
    expect(findSlotAt(layout, { x: 100, y: 100 })).toMatchObject({ row: 0, col: 0 })
    expect(findSlotAt(layout, { x: 199, y: 199 })).toMatchObject({ row: 0, col: 0 })
    expect(findSlotAt(layout, { x: 200, y: 100 })).toMatchObject({ row: 0, col: 1 })
    expect(findSlotAt(layout, { x: 700, y: 500 })).toMatchObject({ row: 2, col: 3 })
    expect(findSlotAt(layout, { x: 900, y: 100 })).toBeNull()
    expect(findSlotAt(layout, { x: -500, y: 0 })).toBeNull()
  })

  it('最近单元格', () => {
    expect(nearestSlot(layout, { x: 450, y: 250 })).toMatchObject({ row: 1, col: 2 })
  })

  it('单元格键解析与越界判定', () => {
    expect(parseSlotKey(slotKey(2, 3))).toEqual({ row: 2, col: 3 })
    expect(parseSlotKey('bad')).toBeNull()
    expect(isSlotInRange(layout, { row: 2, col: 3 })).toBe(true)
    expect(isSlotInRange(layout, { row: 3, col: 0 })).toBe(false)
  })

  it('参数越界被夹取，超大框架被收缩', () => {
    const n = normalizeLayout({ rows: 500, cols: 500, pitchX: -5, pitchY: -1, endCut: 999 })
    expect(n.rows * n.cols).toBeLessThanOrEqual(2000)
    expect(n.pitchX).toBeGreaterThan(0)
    expect(n.pitchY).toBeGreaterThan(0)
    expect(n.endCut).toBe(170)
  })

  it('兼容早期「单元格 + 间隙」写法：pitch = cell + gap', () => {
    const n = normalizeLayout({ rows: 2, cols: 2, cellW: 100, cellH: 80, gapX: 20, gapY: 10 })
    expect(n.pitchX).toBe(120)
    expect(n.pitchY).toBe(90)
  })

  it('内缩矩形', () => {
    expect(insetRect({ x: 0, y: 0, w: 100, h: 100 }, 10)).toEqual({ x: 10, y: 10, w: 80, h: 80 })
    expect(insetRect({ x: 0, y: 0, w: 100, h: 100 }, 999).w).toBeGreaterThan(0)
  })
})

describe('frame：初始化框架用线条生成', () => {
  it('生成 rows+1 条横线与 cols+1 条竖线，覆盖框架范围', () => {
    const l = normalizeLayout({
      enabled: true,
      rows: 2,
      cols: 3,
      pitchX: 100,
      pitchY: 80,
      origin: { x: 10, y: 20 },
      width: 3
    })
    const pats = framePatterns(l)
    expect(pats).toHaveLength(2)
    const h = pats.find((p) => p.angle === 0)
    const v = pats.find((p) => p.angle === 90)
    expect(h.count).toBe(3) // rows + 1
    expect(v.count).toBe(4) // cols + 1
    expect(h.spacing).toBe(80)
    expect(v.spacing).toBe(100)
    expect(h.bounds).toEqual({ x: 10, y: 20, w: 300, h: 160 })
    expect(h.id).toBe(`${FRAME_PREFIX}-h`)
    expect(v.id).toBe(`${FRAME_PREFIX}-v`)
    expect(pats.every((p) => p.frame === true && p.moduleId === FRAME_MODULE_ID)).toBe(true)
  })

  it('展开的线条精确落在网格线位置（含起点偏移）', () => {
    const l = normalizeLayout({
      enabled: true,
      rows: 2,
      cols: 3,
      pitchX: 100,
      pitchY: 80,
      origin: { x: 10, y: 20 }
    })
    const [h, v] = framePatterns(l)
    const ys = familyLines(h)
      .map((line) => line.y)
      .sort((a, b) => a - b)
    expect(ys).toEqual([20, 100, 180])
    const xs = familyLines(v)
      .map((line) => line.x)
      .sort((a, b) => a - b)
    expect(xs).toEqual([10, 110, 210, 310])
  })

  it('框架线参与派生：被切成单元格边界段（2×2 → 12 段）', () => {
    const l = normalizeLayout({ enabled: true, rows: 2, cols: 2, pitchX: 100, pitchY: 100 })
    const segs = segmentsFromPatterns(framePatterns(l))
    expect(segs).toHaveLength(12)
    expect(segs.every((s) => Math.abs(s.length - 100) < 1e-6)).toBe(true)
  })

  it('未启用时不生成线条', () => {
    expect(framePatterns(normalizeLayout({ enabled: false, rows: 2, cols: 2 }))).toEqual([])
  })

  it('replaceFramePatterns 整体替换格线并保留其它图案', () => {
    const l = normalizeLayout({ enabled: true, rows: 1, cols: 1, pitchX: 50, pitchY: 50 })
    const other = { id: 'ln-1', kind: 'line', x1: 0, y1: 0, x2: 10, y2: 0, width: 3 }
    const out = replaceFramePatterns([other, ...framePatterns(l)], l)
    expect(out.filter((p) => p.frame)).toHaveLength(2)
    expect(out.filter((p) => !p.frame)).toHaveLength(1)
    // 关掉框架 → 格线全部移除
    const off = replaceFramePatterns(out, normalizeLayout({ enabled: false, rows: 1, cols: 1 }))
    expect(off.filter((p) => p.frame)).toHaveLength(0)
    expect(off).toHaveLength(1)
  })

  it('框架线条数随行列与间距变化', () => {
    const l1 = normalizeLayout({ enabled: true, rows: 4, cols: 6, pitchX: 50, pitchY: 50 })
    expect(frameLineCount(l1)).toEqual({ horizontal: 5, vertical: 7 })
    expect(layoutBounds(l1)).toEqual({ x: 0, y: 0, w: 300, h: 200 })
  })
})

describe('endCut：末端切口角', () => {
  it('规整范围', () => {
    expect(normalizeEndCut(90)).toBe(90)
    expect(normalizeEndCut(0)).toBe(10)
    expect(normalizeEndCut(999)).toBe(170)
    expect(normalizeEndCut('x')).toBe(DEFAULT_END_CUT)
    expect(isSquareCut(90)).toBe(true)
    expect(isSquareCut(45)).toBe(false)
  })

  it('边界端判定：只认落在 bounds 边上的端点', () => {
    const bounds = { x: 0, y: 0, w: 100, h: 100 }
    expect(isOnBoundsEdge(0, 50, bounds)).toBe(true)
    expect(isOnBoundsEdge(100, 50, bounds)).toBe(true)
    expect(isOnBoundsEdge(50, 0, bounds)).toBe(true)
    expect(isOnBoundsEdge(50, 50, bounds)).toBe(false)
    expect(isOnBoundsEdge(101, 50, bounds)).toBe(false)
  })

  it('取边界端', () => {
    const bounds = { x: 0, y: 0, w: 100, h: 100 }
    const seg = { x1: 0, y1: 50, x2: 50, y2: 50 }
    expect(boundaryEnds(seg, bounds)).toHaveLength(1)
    const mid = { x1: 30, y1: 50, x2: 50, y2: 50 }
    expect(boundaryEnds(mid, bounds)).toHaveLength(0)
  })

  it('端面线方向 = 木条方向 + 切口角', () => {
    // 木条水平（0°），切口 90° → 端面竖直
    const f90 = endFaceLine({ x: 0, y: 0 }, 0, 90, 10)
    expect(f90.x1).toBeCloseTo(0, 6)
    expect(f90.y1).toBeCloseTo(-10, 6)
    expect(f90.x2).toBeCloseTo(0, 6)
    expect(f90.y2).toBeCloseTo(10, 6)
    // 切口 45° → 端面成 45°
    const f45 = endFaceLine({ x: 0, y: 0 }, 0, 45, 10)
    expect(Math.abs(f45.x2 - f45.x1)).toBeCloseTo(Math.abs(f45.y2 - f45.y1), 6)
  })

  it('buildEndFaces 只对边界端产生端面，并带角度', () => {
    const segments = [
      { id: 's1', x1: 0, y1: 50, x2: 100, y2: 50, width: 4 },
      { id: 's2', x1: 30, y1: 50, x2: 70, y2: 50, width: 4 }
    ]
    const boundsOf = () => ({ x: 0, y: 0, w: 100, h: 100 })
    const faces = buildEndFaces(segments, boundsOf, () => 45, () => 5)
    expect(faces).toHaveLength(2) // s1 两端在边界上，s2 无
    expect(faces.every((f) => f.angle === 45)).toBe(true)
    expect(faces.every((f) => f.square === false)).toBe(true)
  })
})

describe('catalog：图案库目录', () => {
  it('分类与模块齐备', () => {
    expect(CATEGORIES.map((c) => c.key)).toEqual(['basic', 'flower', 'geo', 'chain', 'custom'])
    const ids = BUILTIN_MODULES.map((m) => m.id)
    expect(ids).toContain('mod-koushi')
    expect(ids).toContain('mod-asanoha')
    expect(ids).toContain('mod-kikkou')
    expect(ids).toContain('mod-handinhand')
    expect(ids).toContain('mod-squaredance')
    expect(builtinModule('mod-kikkou').express).toBe('segs')
  })

  it('分类名与搜索', () => {
    expect(categoryName('flower')).toBe('花叶纹样')
    expect(categoryName(MANUAL_CATEGORY_KEY)).toBe('手工绘制')
    expect(searchModules(BUILTIN_MODULES, '龟')).toHaveLength(1)
    expect(searchModules(BUILTIN_MODULES, '')).toHaveLength(BUILTIN_MODULES.length)
  })
})

describe('build：模块 → patterns', () => {
  it('线族类模块生成对应角度的线族', () => {
    const pats = buildModulePatterns(builtinModule('mod-koushi'), { rect, params: { spacing: 30, width: 4 } })
    expect(pats).toHaveLength(2)
    expect(pats.map((p) => p.angle)).toEqual([0, 90])
    expect(pats.every((p) => p.kind === 'family')).toBe(true)
    expect(pats.every((p) => p.bounds.w === 300)).toBe(true)
  })

  it('麻叶为三组 60° 线族', () => {
    const pats = buildModulePatterns(builtinModule('mod-asanoha'), { rect, params: { spacing: 20 } })
    expect(pats.map((p) => p.angle)).toEqual([0, 60, 120])
  })

  it('手牵手/广场舞间距比生效', () => {
    const hh = buildModulePatterns(builtinModule('mod-handinhand'), { rect, params: { spacing: 20 } })
    expect(hh.find((p) => p.angle === 90).spacing).toBeCloseTo(40, 6)
    expect(hh.find((p) => p.angle === 60).spacing).toBeCloseTo(20, 6)
    const sd = buildModulePatterns(builtinModule('mod-squaredance'), { rect, params: { spacing: 30 } })
    expect(sd.find((p) => p.angle === 45).spacing).toBeCloseTo(30 / Math.SQRT2, 6)
  })

  it('groupId / moduleId / endCut 注入到每个 pattern', () => {
    const pats = buildModulePatterns(builtinModule('mod-asanoha'), {
      rect,
      params: { spacing: 20, endCut: 45 },
      groupId: 'g1'
    })
    expect(pats.every((p) => p.groupId === 'g1')).toBe(true)
    expect(pats.every((p) => p.moduleId === 'mod-asanoha')).toBe(true)
    expect(pats.every((p) => p.endCut === 45)).toBe(true)
  })

  it('龟甲生成段集，段长不超过边长且均在 rect 内', () => {
    const pats = buildModulePatterns(builtinModule('mod-kikkou'), { rect, params: { spacing: 30 } })
    expect(pats).toHaveLength(1)
    expect(pats[0].kind).toBe('segs')
    const segs = pats[0].segments
    expect(segs.length).toBeGreaterThan(50)
    const a = 30 / Math.sqrt(3)
    for (const s of segs) {
      const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1)
      expect(len).toBeLessThanOrEqual(a + 1e-6)
      for (const [x, y] of [[s.x1, s.y1], [s.x2, s.y2]]) {
        expect(x).toBeGreaterThanOrEqual(-1e-6)
        expect(x).toBeLessThanOrEqual(300 + 1e-6)
        expect(y).toBeGreaterThanOrEqual(-1e-6)
        expect(y).toBeLessThanOrEqual(300 + 1e-6)
      }
    }
    // 无重复边（共享边已去重）
    const keys = segs.map((s) => {
      const p = [`${Math.round(s.x1 * 100)}_${Math.round(s.y1 * 100)}`, `${Math.round(s.x2 * 100)}_${Math.round(s.y2 * 100)}`].sort()
      return p.join('|')
    })
    expect(new Set(keys).size).toBe(segs.length)
  })

  it('线段裁剪', () => {
    const clipped = clipSegmentToRect(-50, 50, 150, 50, { x: 0, y: 0, w: 100, h: 100 })
    expect(clipped.x1).toBeCloseTo(0, 6)
    expect(clipped.x2).toBeCloseTo(100, 6)
    expect(clipSegmentToRect(-50, -50, -10, -10, { x: 0, y: 0, w: 100, h: 100 })).toBeNull()
  })

  it('共线相邻段合并', () => {
    const merged = mergeCollinearSegments([
      { x1: 0, y1: 0, x2: 10, y2: 0 },
      { x1: 10, y1: 0, x2: 25, y2: 0 },
      { x1: 0, y1: 5, x2: 10, y2: 5 }
    ])
    expect(merged).toHaveLength(2)
    const long = merged.find((s) => Math.abs(s.y1) < 1e-6)
    expect(Math.abs(long.x2 - long.x1)).toBeCloseTo(25, 6)
  })

  it('自由放置矩形按中心与尺寸生成', () => {
    const r = placeRect({ x: 10, y: 20 }, 200)
    expect(r).toEqual({ x: -90, y: -80, w: 200, h: 200 })
  })

  it('无 families 的合法模块不产出 pattern（防御）', () => {
    expect(buildModulePatterns({ id: 'x', defaults: {} }, { rect })).toEqual([])
    expect(generateModuleSegments(null, rect, {})).toEqual([])
  })
})

describe('build：便捷生成器 generateModulePatterns（替代旧 core/presets）', () => {
  it('支持简称与全称，几何与 buildModulePatterns 完全一致', () => {
    const a = generateModulePatterns('koushi', { cx: 10, cy: 20, size: 200, spacing: 40, width: 3 })
    const b = buildModulePatterns(builtinModule('mod-koushi'), {
      rect: { x: -90, y: -80, w: 200, h: 200 },
      params: { spacing: 40, width: 3 }
    })
    expect(a).toHaveLength(2)
    expect(a.map((p) => p.ref)).toEqual(b.map((p) => p.ref))
    expect(a.map((p) => p.count)).toEqual(b.map((p) => p.count))
    expect(a.every((p) => p.moduleId === 'mod-koushi')).toBe(true)
    expect(a[0].groupId).toBeNull()
  })

  it('旧预设的三种图案都能按简称生成', () => {
    expect(generateModulePatterns('asanoha', { size: 100, spacing: 20 })).toHaveLength(3)
    expect(generateModulePatterns('mod-diagonal', { size: 100, spacing: 20 })).toHaveLength(2)
  })

  it('未知模块返回空数组', () => {
    expect(generateModulePatterns('unknown', {})).toEqual([])
    expect(generateModulePatterns(null, {})).toEqual([])
  })
})

describe('custom：自定义图案模块', () => {
  it('选区外接矩形', () => {
    const ext = patternsExtent([
      { kind: 'family', bounds: { x: 0, y: 0, w: 100, h: 100 } },
      { kind: 'line', x1: 120, y1: 10, x2: 200, y2: 10 }
    ])
    expect(ext).toEqual({ x: 0, y: 0, w: 200, h: 100 })
  })

  it('线族选区归一化为可复用模块（间距比保留）', () => {
    const src = buildModulePatterns(builtinModule('mod-asanoha'), { rect, params: { spacing: 20 } })
    const mod = moduleFromPatterns(src, { name: '我的麻叶' })
    expect(mod).toBeTruthy()
    expect(mod.custom).toBe(true)
    expect(mod.families.map((f) => f.angle)).toEqual([0, 60, 120])
    expect(mod.families.every((f) => Math.abs(f.ratio - 1) < 1e-9)).toBe(true)
    expect(mod.defaults.spacing).toBe(20)
    expect(mod.defaults.size).toBe(300)

    // 重建后段数应与原图案派生段数一致
    const rebuilt = buildModulePatterns(mod, { rect, params: { spacing: 20 } })
    expect(segmentsFromPatterns(rebuilt).length).toBe(segmentsFromPatterns(src).length)
  })

  it('段集选区归一化后按矩形缩放', () => {
    const src = buildModulePatterns(builtinModule('mod-kikkou'), { rect, params: { spacing: 30 } })
    const mod = moduleFromPatterns(src, { name: '我的龟甲' })
    expect(mod.families).toHaveLength(0)
    expect(mod.segs.length).toBe(src[0].segments.length)
    expect(Math.max(...mod.segs.map((s) => Math.max(s.x1, s.x2)))).toBeCloseTo(1, 6)
  })

  it('空选区返回 null', () => {
    expect(moduleFromPatterns([], {})).toBeNull()
    expect(moduleFromPatterns(null, {})).toBeNull()
  })
})

describe('derive / parts：段集与分类统计打通', () => {
  it('segmentsFromPatterns 输出段集', () => {
    const pats = buildModulePatterns(builtinModule('mod-kikkou'), { rect, params: { spacing: 30 } })
    const segs = segmentsFromPatterns(pats)
    expect(segs.length).toBe(pats[0].segments.length)
    expect(segs.every((s) => s.patternId === pats[0].id)).toBe(true)
  })

  it('analyzeParts 按图案分类拆分同型部件', () => {
    const koushi = buildModulePatterns(builtinModule('mod-koushi'), {
      rect: { x: 0, y: 0, w: 200, h: 200 },
      params: { spacing: 50, width: 4 },
      groupId: 'g-k'
    })
    const kikkou = buildModulePatterns(builtinModule('mod-kikkou'), {
      rect: { x: 400, y: 0, w: 200, h: 200 },
      params: { spacing: 50, width: 4 },
      groupId: 'g-q'
    })
    const manual = { id: 'ln-1', kind: 'line', x1: 0, y1: 500, x2: 100, y2: 500, width: 3 }
    const patterns = [...koushi, ...kikkou, manual]
    const meta = {}
    for (const p of koushi) meta[p.id] = { category: 'basic', moduleId: 'mod-koushi', moduleName: '井字（方格）', groupId: 'g-k' }
    for (const p of kikkou) meta[p.id] = { category: 'geo', moduleId: 'mod-kikkou', moduleName: '龟甲', groupId: 'g-q' }

    const groups = analyzeParts(patterns, 10, { meta })
    const cats = new Set(groups.map((g) => g.category))
    expect(cats.has('basic')).toBe(true)
    expect(cats.has('geo')).toBe(true)
    expect(cats.has(MANUAL_CATEGORY_KEY)).toBe(true)

    // 井字：水平/竖直各 4 根（200/50 = 4 条线各自 200 长），尺寸与插口一致
    const basicGroups = groups.filter((g) => g.category === 'basic')
    expect(basicGroups.reduce((s, g) => s + g.pieces, 0)).toBe(10) // 0°组 5 根 + 90°组 5 根（含边界）

    const byCat = groupPartsByCategory(groups)
    expect(byCat.map((c) => c.category)).toContain('geo')
    const geo = byCat.find((c) => c.category === 'geo')
    expect(geo.modules[0].moduleName).toBe('龟甲')
    expect(geo.pieceCount).toBe(kikkou[0].segments.length)
  })

  it('分类维度使同尺寸部件不跨模块合并', () => {
    const a = buildModulePatterns(builtinModule('mod-koushi'), {
      rect: { x: 0, y: 0, w: 100, h: 100 },
      params: { spacing: 50, width: 4 }
    })
    const b = buildModulePatterns(builtinModule('mod-koushi'), {
      rect: { x: 0, y: 0, w: 100, h: 100 },
      params: { spacing: 50, width: 4 }
    })
    // 同一模块但不同实例：应合并为同一组（pieces 累加）
    const meta = {}
    for (const p of a) meta[p.id] = { category: 'basic', moduleId: 'mod-koushi', moduleName: '井字' }
    for (const p of b) meta[p.id] = { category: 'basic', moduleId: 'mod-koushi', moduleName: '井字' }
    const one = analyzeParts(a, 10, { meta })
    const both = analyzeParts([...a, ...b], 10, { meta })
    expect(both.length).toBe(one.length)
    expect(both.reduce((s, g) => s + g.pieces, 0)).toBe(2 * one.reduce((s, g) => s + g.pieces, 0))
  })
})
