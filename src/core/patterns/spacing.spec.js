import { describe, it, expect } from 'vitest'
import {
  segAngleDeg,
  segmentsParallel,
  spacingBetween,
  nearestParallelSegment,
  translatePattern,
  moveLineToSpacing,
  patternAnchor,
  nearestForeignEndpoint,
  segOrientation,
  referenceParallel,
  equalSpacingHint,
  parallelEndpointAlign,
  spacingRatio,
  ratioToSpacing,
  unitChoices
} from './spacing.js'

/** 构造水平/竖直/斜线段 */
const h0 = { id: 'h0', x1: 0, y1: 0, x2: 100, y2: 0 }
const h1 = { id: 'h1', x1: 0, y1: 10, x2: 100, y2: 10 } // 与 h0 间距 10
const h2 = { id: 'h2', x1: 0, y1: 30, x2: 100, y2: 30 } // 与 h0 间距 30
const v0 = { id: 'v0', x1: 0, y1: 0, x2: 0, y2: 100 }
const v1 = { id: 'v1', x1: 15, y1: 0, x2: 15, y2: 100 } // 与 v0 间距 15
const d45 = { id: 'd45', x1: 0, y1: 0, x2: 10, y2: 10 }

describe('patterns/spacing 平行线间距', () => {
  it('segAngleDeg：水平 0、竖直 90（y-down）', () => {
    expect(segAngleDeg(h0)).toBeCloseTo(0, 9)
    expect(segAngleDeg(v0)).toBeCloseTo(90, 9)
    expect(segAngleDeg(d45)).toBeCloseTo(45, 9)
    // 反向线仍是同一方向向量角 180→归一 0（平行判定基于无向）
    expect(segmentsParallel({ ...h0, x1: 100, x2: 0 }, h1)).toBe(true)
  })

  it('segmentsParallel：平行 true、垂直 false', () => {
    expect(segmentsParallel(h0, h1)).toBe(true)
    expect(segmentsParallel(v0, v1)).toBe(true)
    expect(segmentsParallel(h0, v0)).toBe(false)
    expect(segmentsParallel(h0, d45)).toBe(false)
  })

  it('spacingBetween：垂直间距取点到直线距离；非平行返回 Infinity', () => {
    expect(spacingBetween(h0, h1)).toBeCloseTo(10, 9)
    expect(spacingBetween(h1, h2)).toBeCloseTo(20, 9)
    expect(spacingBetween(v0, v1)).toBeCloseTo(15, 9)
    expect(spacingBetween(h0, v0)).toBe(Infinity)
  })

  it('nearestParallelSegment：取平行方向最近邻居，忽略自身与非平行', () => {
    const r = nearestParallelSegment(h0, [h0, h1, h2, v0])
    expect(r.other.id).toBe('h1')
    expect(r.distance).toBeCloseTo(10, 9)

    // 无平行邻居
    expect(nearestParallelSegment(d45, [h0, h1, v0])).toBeNull()

    // 空候选
    expect(nearestParallelSegment(h0, [])).toBeNull()
  })

  it('nearestParallelSegment：tolDeg 容差内视为平行（0.5° 差）', () => {
    const slight = { id: 's', x1: 0, y1: 5, x2: 100, y2: 5.5 } // 约 0.286°
    const r = nearestParallelSegment(h0, [h0, slight], { tolDeg: 1 })
    expect(r.other.id).toBe('s')
    const r2 = nearestParallelSegment(h0, [h0, slight], { tolDeg: 0.1 })
    expect(r2).toBeNull()
  })

  it('translatePattern：line 平移两端点；family 平移 ref+bounds', () => {
    const line = { id: 'L', kind: 'line', x1: 0, y1: 0, x2: 100, y2: 50, width: 3 }
    const l2 = translatePattern(line, 10, -5)
    expect(l2.x1).toBe(10)
    expect(l2.y1).toBe(-5)
    expect(l2.x2).toBe(110)
    expect(l2.y2).toBe(45)
    expect(line.x1).toBe(0) // 不修改原对象

    const fam = { id: 'F', kind: 'family', ref: { x: 1, y: 2 }, bounds: { x: 0, y: 0, w: 100, h: 80 }, angle: 0, spacing: 10, count: 3, width: 3 }
    const f2 = translatePattern(fam, 5, 5)
    expect(f2.ref).toEqual({ x: 6, y: 7 })
    expect(f2.bounds).toEqual({ x: 5, y: 5, w: 100, h: 80 })
  })

  it('moveLineToSpacing：把平行线段移到距参考线指定间距（保持所在侧）', () => {
    // 参考水平线 y=0；目标线 y=30 → 移动到 y=10（同一侧）
    const refH = { x1: 0, y1: 0, x2: 100, y2: 0 }
    const lineH = { id: 'LH', kind: 'line', x1: 0, y1: 30, x2: 100, y2: 30, width: 3 }
    const movedH = moveLineToSpacing(lineH, refH, 10)
    expect(movedH.y1).toBeCloseTo(10, 9)
    expect(movedH.y2).toBeCloseTo(10, 9)

    // 负侧：参考水平线 y=0，目标线 y=-30 → 移动到 y=-10（仍在负侧）
    const lineNeg = { ...lineH, y1: -30, y2: -30 }
    const movedNeg = moveLineToSpacing(lineNeg, refH, 10)
    expect(movedNeg.y1).toBeCloseTo(-10, 9)

    // 竖直参考 x=0；目标 x=-40 → 移动到 x=-8（负侧）
    const refV = { x1: 0, y1: 0, x2: 0, y2: 100 }
    const lineV = { id: 'LV', kind: 'line', x1: -40, y1: 0, x2: -40, y2: 100, width: 3 }
    const movedV = moveLineToSpacing(lineV, refV, 8)
    expect(movedV.x1).toBeCloseTo(-8, 9)
    expect(movedV.x2).toBeCloseTo(-8, 9)

    // 不平行 → null
    const line45 = { ...lineH, y1: 30, y2: 130 }
    expect(moveLineToSpacing(line45, refH, 10)).toBeNull()
    // 非法目标 → null
    expect(moveLineToSpacing(lineH, refH, 0)).toBeNull()
    expect(moveLineToSpacing(lineH, refH, -5)).toBeNull()
    // 非 line kind → null
    expect(moveLineToSpacing({ kind: 'family' }, refH, 10)).toBeNull()
  })

  it('patternAnchor：line 取起点、family 取 ref', () => {
    expect(patternAnchor({ kind: 'line', x1: 3, y1: 4 })).toEqual({ x: 3, y: 4 })
    expect(patternAnchor({ kind: 'family', ref: { x: 7, y: 8 } })).toEqual({ x: 7, y: 8 })
    expect(patternAnchor({ kind: 'other' })).toEqual({ x: 0, y: 0 })
  })

  it('nearestForeignEndpoint：返回最近的其它端点；超容差/无候选返回 null', () => {
    const seg = { id: 'A', x1: 0, y1: 0, x2: 100, y2: 0 }
    const b = { id: 'B', x1: 100, y1: 30, x2: 100, y2: 80 } // x2 端点与 A 端点重合(100,0)? B x1=(100,30),x2=(100,80) 都不重合
    const c = { id: 'C', x1: 100.4, y1: 0, x2: 200, y2: 0 } // C.x1≈A.x2 距离 0.4
    const d = { id: 'D', x1: 500, y1: 500, x2: 600, y2: 600 } // 远处

    const r = nearestForeignEndpoint(seg, [seg, b, c, d], 2)
    expect(r.other.id).toBe('C')
    expect(r.x).toBeCloseTo(100.4, 9)
    expect(r.y).toBeCloseTo(0, 9)
    expect(r.distance).toBeCloseTo(0.4, 9)
    expect(r.ownKey).toBe('x2')

    // 超容差
    expect(nearestForeignEndpoint(seg, [seg, d], 2)).toBeNull()
    // 空/全自身
    expect(nearestForeignEndpoint(seg, [], 2)).toBeNull()
    expect(nearestForeignEndpoint(seg, [seg], 2)).toBeNull()
  })

  it('segOrientation：横/竖/斜分类', () => {
    expect(segOrientation({ x1: 0, y1: 0, x2: 100, y2: 0 })).toBe('h')
    expect(segOrientation({ x1: 0, y1: 0, x2: 0, y2: 100 })).toBe('v')
    expect(segOrientation({ x1: 0, y1: 0, x2: 50, y2: 50 })).toBe('d') // 45°
    expect(segOrientation({ x1: 0, y1: 0, x2: 100, y2: 8 })).toBe('h') // 近水平
    expect(segOrientation({ x1: 0, y1: 0, x2: 8, y2: 100 })).toBe('v') // 近竖直
  })

  it('referenceParallel：横线取上方、竖线取左侧，斜线取最近', () => {
    // 横线：C 在 y=0；上方邻居 A(y=-10) 与下方邻居 B(y=15) —— 应选 A（上方）
    const C = { id: 'C', x1: 0, y1: 0, x2: 100, y2: 0 }
    const upA = { id: 'A', x1: 0, y1: -10, x2: 100, y2: -10 }
    const downB = { id: 'B', x1: 0, y1: 15, x2: 100, y2: 15 }
    const r = referenceParallel(C, [C, upA, downB])
    expect(r.other.id).toBe('A')
    expect(r.side).toBe('up')
    expect(r.distance).toBeCloseTo(10, 9)

    // 上方无线 → null（尽管下方有）
    const onlyDown = referenceParallel(C, [C, downB])
    expect(onlyDown).toBeNull()

    // 竖线：C 在 x=0；左侧 A(x=-8) 与右侧 B(x=20) —— 应选 A（左侧）
    const VC = { id: 'VC', x1: 0, y1: 0, x2: 0, y2: 100 }
    const vLeft = { id: 'VL', x1: -8, y1: 0, x2: -8, y2: 100 }
    const vRight = { id: 'VR', x1: 20, y1: 0, x2: 20, y2: 100 }
    const vr = referenceParallel(VC, [VC, vLeft, vRight])
    expect(vr.other.id).toBe('VL')
    expect(vr.side).toBe('left')
    expect(vr.distance).toBeCloseTo(8, 9)

    // 斜线 → 最近任意侧
    const d45 = { id: 'D', x1: 0, y1: 0, x2: 100, y2: 100 }
    const dUp = { id: 'DU', x1: 0, y1: -14, x2: 100, y2: 86 } // 平行 45°，上方
    const dDown = { id: 'DD', x1: 0, y1: 20, x2: 100, y2: 120 } // 下方更近？垂直距离更大
    const dr = referenceParallel(d45, [d45, dUp, dDown])
    expect(dr.side).toBe('nearest')
    expect(dr.other.id).toBe('DU')
  })

  it('equalSpacingHint：A/B 间距 100，C 拖到与 B 同为 100 时命中（用户场景）', () => {
    // A(y=-100) 与 B(y=0) 平行横线，间距 100
    const A = { id: 'A', x1: 0, y1: -100, x2: 100, y2: -100, patternId: 'PA' }
    const B = { id: 'B', x1: 0, y1: 0, x2: 100, y2: 0, patternId: 'PB' }
    // C 拖到 y=100 → C-B=100，命中
    const Cok = { id: 'C', x1: 0, y1: 100, x2: 100, y2: 100, patternId: 'PC' }
    const hit = equalSpacingHint(Cok, [A, B, Cok], { tolDeg: 1, excludePatternId: 'PC' })
    expect(hit).not.toBeNull()
    expect(hit.spacing).toBeCloseTo(100, 9)
    expect(hit.referenceSpacing).toBeCloseTo(100, 9)
    expect(hit.anchor.id).toBe('B')

    // C 拖到 y=30 → C-B=30，不命中
    const Cno = { id: 'C', x1: 0, y1: 30, x2: 100, y2: 30, patternId: 'PC' }
    expect(equalSpacingHint(Cno, [A, B, Cno], { tolDeg: 1, excludePatternId: 'PC' })).toBeNull()
  })

  it('equalSpacingHint：无 A 参考（B 是边缘线）→ null', () => {
    const B = { id: 'B', x1: 0, y1: 0, x2: 100, y2: 0, patternId: 'PB' }
    const C = { id: 'C', x1: 0, y1: 100, x2: 100, y2: 100, patternId: 'PC' }
    expect(equalSpacingHint(C, [B, C], { excludePatternId: 'PC' })).toBeNull()
  })

  it('parallelEndpointAlign：横线左/右端与基准线平齐时提示', () => {
    // C 在 y=0；基准 B 在 y=-100（上方），B 两端 x=-60..60
    const B = { id: 'B', x1: -60, y1: -100, x2: 60, y2: -100, patternId: 'PB' }
    // C 左端 x 与 B 左端同为 -60 → min 对齐
    const CalignL = { id: 'C', x1: -60, y1: 0, x2: 20, y2: 0, patternId: 'PC' }
    const r1 = parallelEndpointAlign(CalignL, [B, CalignL], { tol: 0.5 })
    expect(r1.aligned).toBe(true)
    expect(r1.sideOfBase).toBe('up')
    expect(r1.end).toBe('min')

    // C 右端 x 与 B 右端同为 60 → max 对齐
    const CalignR = { id: 'C', x1: -20, y1: 0, x2: 60, y2: 0, patternId: 'PC' }
    const r2 = parallelEndpointAlign(CalignR, [B, CalignR], { tol: 0.5 })
    expect(r2.aligned).toBe(true)
    expect(r2.end).toBe('max')

    // C 两端都不对齐 → aligned false
    const Cmis = { id: 'C', x1: -30, y1: 0, x2: 10, y2: 0, patternId: 'PC' }
    const r3 = parallelEndpointAlign(Cmis, [B, Cmis], { tol: 0.5 })
    expect(r3.aligned).toBe(false)

    // 上方无基准线 → null
    expect(parallelEndpointAlign(B, [B], { tol: 0.5 })).toBeNull()
  })

  it('parallelEndpointAlign：竖线对比上/下端 y（基准=左侧）', () => {
    const B = { id: 'B', x1: -100, y1: -50, x2: -100, y2: 50, patternId: 'PB' }
    // C 在 x=0（右侧），上端 y 与 B 上端 -50 相同 → min（y 小=上端）
    const CalignT = { id: 'C', x1: 0, y1: -50, x2: 0, y2: 20, patternId: 'PC' }
    const r = parallelEndpointAlign(CalignT, [B, CalignT], { tol: 0.5 })
    expect(r.aligned).toBe(true)
    expect(r.sideOfBase).toBe('left')
    expect(r.end).toBe('min')
  })
})

describe('patterns/spacing 间距 ↔ 全局单位倍数（Nx 下拉）', () => {
  it('spacingRatio / ratioToSpacing：mm ↔ 倍数换算；单位非法回退原值', () => {
    expect(spacingRatio(40, 10)).toBe(4)
    expect(spacingRatio(40, 0)).toBe(40)
    expect(spacingRatio(40, -10)).toBe(40)
    expect(ratioToSpacing(4, 10)).toBe(40)
    expect(ratioToSpacing(4, 0)).toBe(4)
  })

  it('unitChoices：整倍间距给出 1x..8x 并命中当前倍数', () => {
    const r = unitChoices(40, 10)
    expect(r).not.toBeNull()
    expect(r.exact).toBe(true)
    expect(r.ratio).toBe(4)
    expect(r.choices.map((c) => c.value)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(r.choices[3].label).toBe('4x')
    expect(r.choices[3].mm).toBe(40)
    expect(r.choices.some((c) => c.custom)).toBe(false)
  })

  it('unitChoices：非整倍间距追加 custom 保留项，前面仍是 1x..8x', () => {
    const r = unitChoices(45, 10)
    expect(r).not.toBeNull()
    expect(r.exact).toBe(false)
    expect(r.ratio).toBeCloseTo(4.5, 9)
    const custom = r.choices.find((c) => c.custom)
    expect(custom).toBeTruthy()
    expect(custom.value).toBeCloseTo(4.5, 9)
    expect(custom.mm).toBeCloseTo(45, 9)
    expect(custom.label).toContain('4.5x')
    expect(r.choices[0].label).toBe('1x')
    expect(r.choices[7].label).toBe('8x')
    // 自定义在列表末尾
    expect(r.choices[r.choices.length - 1]).toBe(custom)
  })

  it('unitChoices：间距超 8x 自动向上扩展（120mm/10 → 1x..12x）', () => {
    const r = unitChoices(120, 10)
    expect(r).not.toBeNull()
    expect(r.exact).toBe(true)
    expect(r.ratio).toBe(12)
    expect(r.choices.length).toBe(12)
    expect(r.choices[11].label).toBe('12x')
    expect(r.choices[11].mm).toBe(120)
  })

  it('unitChoices：单位换算（15mm/5 → 3x）与自定义小数单位', () => {
    const r = unitChoices(15, 5)
    expect(r.exact).toBe(true)
    expect(r.ratio).toBe(3)
    expect(r.choices[2].label).toBe('3x')
  })

  it('unitChoices：非法参数返回 null', () => {
    expect(unitChoices(0, 10)).toBeNull()
    expect(unitChoices(-5, 10)).toBeNull()
    expect(unitChoices(40, 0)).toBeNull()
    expect(unitChoices(40, -10)).toBeNull()
    expect(unitChoices(NaN, 10)).toBeNull()
    expect(unitChoices(40, NaN)).toBeNull()
  })
})
