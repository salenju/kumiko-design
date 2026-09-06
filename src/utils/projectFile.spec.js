import { describe, it, expect } from 'vitest'
import { buildProjectJson, parseProjectJson, sanitizeFileBase } from './projectFile.js'

/** 模拟 project store 形状（纯数据） */
const fakeStore = {
  version: 4,
  patterns: [{ id: 'p1', kind: 'family', angle: 60 }],
  material: { stockLength: 1200, kerf: 1.5, endAllowance: 2 },
  spacingUnit: 10
}

describe('utils/projectFile 项目文件导出/导入', () => {
  it('buildProjectJson 生成带元信息的 JSON 字符串', () => {
    const json = buildProjectJson(fakeStore)
    const data = JSON.parse(json)
    expect(data.app).toBe('kumiko-design')
    expect(data.version).toBe(4)
    expect(data.patterns).toEqual(fakeStore.patterns)
    expect(data.material).toEqual(fakeStore.material)
    expect(data.spacingUnit).toBe(10)
    expect(typeof data.exportedAt).toBe('string')
    expect(typeof data.file).toBe('string')
  })

  it('parseProjectJson 正确解析有效文件（含全局间距单位）', () => {
    const json = JSON.stringify({ patterns: [{ id: 'a' }], material: { kerf: 2 }, spacingUnit: 12 })
    const data = parseProjectJson(json)
    expect(data.patterns).toEqual([{ id: 'a' }])
    expect(data.material.kerf).toBe(2)
    expect(data.spacingUnit).toBe(12)
  })

  it('parseProjectJson：旧文件/非法单位 → spacingUnit undefined（回退默认）', () => {
    // 旧版本文件没有 spacingUnit
    expect(parseProjectJson('{"patterns":[]}').spacingUnit).toBeUndefined()
    // 非法（0 / 负数 / 非数字）同样回退
    expect(parseProjectJson('{"patterns":[],"spacingUnit":0}').spacingUnit).toBeUndefined()
    expect(parseProjectJson('{"patterns":[],"spacingUnit":"abc"}').spacingUnit).toBeUndefined()
  })

  it('parseProjectJson 拒绝非法 JSON 与缺 patterns 数据', () => {
    expect(() => parseProjectJson('not json{{')).toThrow('JSON')
    expect(() => parseProjectJson('{"material":{}}')).toThrow('patterns')
    expect(() => parseProjectJson('null')).toThrow('patterns')
  })

  it('sanitizeFileBase：导出文件名跨平台安全化', () => {
    expect(sanitizeFileBase('麻叶纹 300')).toBe('麻叶纹 300')
    expect(sanitizeFileBase('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j')
    expect(sanitizeFileBase('  麻叶  ')).toBe('麻叶')
    expect(sanitizeFileBase('.hidden.')).toBe('hidden')
    expect(sanitizeFileBase('..')).toBe('')
    expect(sanitizeFileBase('')).toBe('')
    expect(sanitizeFileBase('a\u0000b')).toBe('a_b')
  })
})
