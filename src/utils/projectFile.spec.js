import { describe, it, expect } from 'vitest'
import { buildProjectJson, parseProjectJson } from './projectFile.js'

/** 模拟 project store 形状（纯数据） */
const fakeStore = {
  version: 3,
  patterns: [{ id: 'p1', kind: 'family', angle: 60 }],
  material: { stockLength: 1200, kerf: 1.5, endAllowance: 2 }
}

describe('utils/projectFile 项目文件导出/导入', () => {
  it('buildProjectJson 生成带元信息的 JSON 字符串', () => {
    const json = buildProjectJson(fakeStore)
    const data = JSON.parse(json)
    expect(data.app).toBe('kumiko-design')
    expect(data.version).toBe(3)
    expect(data.patterns).toEqual(fakeStore.patterns)
    expect(data.material).toEqual(fakeStore.material)
    expect(typeof data.exportedAt).toBe('string')
    expect(typeof data.file).toBe('string')
  })

  it('parseProjectJson 正确解析有效文件', () => {
    const json = JSON.stringify({ patterns: [{ id: 'a' }], material: { kerf: 2 } })
    const data = parseProjectJson(json)
    expect(data.patterns).toEqual([{ id: 'a' }])
    expect(data.material.kerf).toBe(2)
  })

  it('parseProjectJson 拒绝非法 JSON 与缺 patterns 数据', () => {
    expect(() => parseProjectJson('not json{{')).toThrow('JSON')
    expect(() => parseProjectJson('{"material":{}}')).toThrow('patterns')
    expect(() => parseProjectJson('null')).toThrow('patterns')
  })
})
