import { describe, it, expect } from 'vitest'
import { deriveSegments } from '../core/patterns/derive.js'
import { generatePatterns } from '../core/presets/index.js'
import { planCutGroups } from '../core/cutlist/index.js'
import { analyzeParts } from '../core/parts/index.js'
import { buildSvgString } from './exportSvg.js'
import {
  buildConstructionEntries,
  buildReportHtml,
  buildCutlistCsv,
  buildPartsCsv,
  cutSummary
} from './constructionDoc.js'

function makeData({ size = 120, spacing = 20, width = 3 } = {}) {
  const patterns = generatePatterns('koushi', { size, spacing, width })
  const segments = deriveSegments(patterns)
  return {
    version: 4,
    patterns,
    material: { stockLength: 1200, kerf: 1.5, endAllowance: 2 },
    spacingUnit: 10,
    segments
  }
}

describe('utils/constructionDoc 施工资料组装', () => {
  it('buildConstructionEntries：zip 内 5 个文件、名称基于同一基名、.json 与包同名', () => {
    const data = makeData()
    const svg = buildSvgString(data.segments)
    const entries = buildConstructionEntries(data, svg, '麻叶纹300', { generatedAt: '2025-01-01 00:00:00' })
    expect(entries.map((e) => e.name)).toEqual([
      '麻叶纹300.json',
      '麻叶纹300-设计图.svg',
      '麻叶纹300-施工单.html',
      '麻叶纹300-算料.csv',
      '麻叶纹300-图案部件.csv'
    ])
    // .json 内容可解析且与项目一致
    const proj = JSON.parse(entries[0].data)
    expect(proj.patterns.length).toBe(data.patterns.length)
    expect(proj.spacingUnit).toBe(10)
    // svg 与传入一致
    expect(entries[1].data).toBe(svg)
  })

  it('施工单 HTML：包含 设计图/材料参数/算料/图案部件 四节与表', () => {
    const data = makeData()
    const svg = buildSvgString(data.segments)
    const cut = planCutGroups(data.segments, data.material)
    const parts = analyzeParts(data.patterns, data.spacingUnit)
    const html = buildReportHtml(data, cut, parts, svg, {
      baseName: '麻叶纹300',
      generatedAt: '2025-01-01 00:00:00'
    })
    expect(html).toContain('麻叶纹300 · 施工单')
    for (const sec of ['一、设计图', '二、材料参数', '三、算料', '四、图案部件']) {
      expect(html).toContain(sec)
    }
    expect(html).toContain('<svg') // 内嵌设计图
    expect(html).toContain('综合利用率')
    expect(html).toContain('间距缩写')
    expect(html).toContain('2025-01-01 00:00:00')
  })

  it('算料 CSV：表头 + 每根标准料一行，含材料口径一致的利用率列', () => {
    const data = makeData()
    const cut = planCutGroups(data.segments, data.material)
    const csv = buildCutlistCsv(cut)
    expect(csv.charCodeAt(0)).toBe(0xfeff) // Excel 中文 BOM
    const lines = csv.replace(/^\uFEFF/, '').trim().split('\r\n')
    expect(lines[0]).toContain('木条宽(mm)')
    expect(lines.length - 1).toBe(cut.reduce((s, g) => s + g.plan.count, 0)) // 每根料一行
    expect(lines[1]).toContain('x') // 装载切割列形如 118.5x3
  })

  it('图案部件 CSV：表头 + 每组一行，与 analyzeParts 一致', () => {
    const data = makeData()
    const parts = analyzeParts(data.patterns, data.spacingUnit)
    const csv = buildPartsCsv(parts)
    const lines = csv.replace(/^\uFEFF/, '').trim().split('\r\n')
    expect(lines[0]).toContain('间距缩写')
    expect(lines.length - 1).toBe(parts.length)
    const g = parts[0]
    expect(lines[1].split(',')[0]).toBe(String(g.length))
    expect(lines[1].split(',')[3]).toBe(String(g.pieces))
    expect(lines[1].split(',')[4]).toBe(String(g.notchCount))
  })

  it('cutSummary：跨组合计与抽屉汇总口径一致', () => {
    const data = makeData()
    const cut = planCutGroups(data.segments, data.material)
    const sum = cutSummary(cut)
    const manual = cut.reduce((s, g) => s + g.plan.count, 0)
    expect(sum.stockCount).toBe(manual)
    expect(sum.groups).toBe(cut.length)
    expect(sum.utilization).toBeGreaterThan(0)
    expect(sum.utilization).toBeLessThanOrEqual(100)
  })
})
