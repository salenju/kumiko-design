import { describe, it, expect } from 'vitest'
import { parseIntent, intentKeywords } from './parseIntent.js'

describe('ai/parseIntent 自然语言 → 图案模块参数（Phase4 本地规则）', () => {
  it('识别麻叶纹并解析 cm 尺寸', () => {
    const r = parseIntent('生成一个 30cm 的麻叶纹')
    expect(r).not.toBeNull()
    expect(r.moduleId).toBe('mod-asanoha')
    expect(r.name).toBe('麻叶')
    expect(r.params.size).toBe(300)
    expect(r.params.spacing).toBe(20)
  })

  it('识别方格纹并解析 mm 尺寸', () => {
    const r = parseIntent('做一个 200mm 的方格纹样')
    expect(r.moduleId).toBe('mod-koushi')
    expect(r.params.size).toBe(200)
    expect(r.params.spacing).toBe(30)
  })

  it('识别斜格纹（菱形）', () => {
    const r = parseIntent('给我一个 45 度的菱形斜格纹')
    expect(r.moduleId).toBe('mod-diagonal')
  })

  it('识别图案库新增图案（龟甲 / 手牵手 / 广场舞）', () => {
    expect(parseIntent('做一个龟甲纹').moduleId).toBe('mod-kikkou')
    expect(parseIntent('手牵手图案').moduleId).toBe('mod-handinhand')
    expect(parseIntent('广场舞 300mm').moduleId).toBe('mod-squaredance')
  })

  it('无尺寸时返回默认 300mm', () => {
    const r = parseIntent('麻叶纹')
    expect(r.moduleId).toBe('mod-asanoha')
    expect(r.params.size).toBe(300)
  })

  it('繁体/别名也能命中（麻の葉）', () => {
    const r = parseIntent('麻の葉 500mm')
    expect(r.moduleId).toBe('mod-asanoha')
    expect(r.params.size).toBe(500)
  })

  it('无法识别返回 null；空输入返回 null', () => {
    expect(parseIntent('画一只猫')).toBeNull()
    expect(parseIntent('')).toBeNull()
    expect(parseIntent(null)).toBeNull()
  })

  it('intentKeywords 覆盖图案库内置图案名', () => {
    const names = intentKeywords()
    expect(names).toContain('麻叶')
    expect(names).toContain('龟甲')
    expect(names.length).toBeGreaterThanOrEqual(6)
  })

  it('结果参数可直接喂给图案库生成器', async () => {
    const { generateModulePatterns } = await import('../core/library/index.js')
    const r = parseIntent('生成 10cm 斜格纹')
    const patterns = generateModulePatterns(r.moduleId, {
      cx: 0,
      cy: 0,
      size: r.params.size,
      spacing: r.params.spacing,
      width: 3
    })
    expect(patterns.length).toBeGreaterThan(0)
    expect(patterns[0].bounds.w).toBeCloseTo(100, 6)
    expect(patterns[0].moduleId).toBe('mod-diagonal')
  })
})
