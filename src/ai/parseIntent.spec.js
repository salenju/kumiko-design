import { describe, it, expect } from 'vitest'
import { parseIntent } from './parseIntent.js'

describe('ai/parseIntent 自然语言 → 纹样参数（Phase4 本地规则）', () => {
  it('识别麻叶纹并解析 cm 尺寸', () => {
    const r = parseIntent('生成一个 30cm 的麻叶纹')
    expect(r).not.toBeNull()
    expect(r.preset).toBe('asanoha')
    expect(r.params.size).toBe(300)
    expect(r.params.spacing).toBe(20)
  })

  it('识别方格纹并解析 mm 尺寸', () => {
    const r = parseIntent('做一个 200mm 的方格纹样')
    expect(r.preset).toBe('koushi')
    expect(r.params.size).toBe(200)
  })

  it('识别斜格纹（菱形）', () => {
    const r = parseIntent('给我一个 45 度的菱形斜格纹')
    expect(r.preset).toBe('diagonal')
  })

  it('无尺寸时返回默认 300mm', () => {
    const r = parseIntent('麻叶纹')
    expect(r.preset).toBe('asanoha')
    expect(r.params.size).toBe(300)
  })

  it('繁体/别名也能命中（麻の葉）', () => {
    const r = parseIntent('麻の葉 500mm')
    expect(r.preset).toBe('asanoha')
    expect(r.params.size).toBe(500)
  })

  it('无法识别返回 null；空输入返回 null', () => {
    expect(parseIntent('画一只猫')).toBeNull()
    expect(parseIntent('')).toBeNull()
    expect(parseIntent(null)).toBeNull()
  })

  it('结果参数可直接喂给本地生成器', async () => {
    const { generatePatterns } = await import('../core/presets/index.js')
    const r = parseIntent('生成 10cm 斜格纹')
    const patterns = generatePatterns(r.preset, {
      cx: 0,
      cy: 0,
      size: r.params.size,
      spacing: r.params.spacing,
      width: 3
    })
    expect(patterns.length).toBeGreaterThan(0)
    expect(patterns[0].bounds.w).toBeCloseTo(100, 6)
  })
})
