import { describe, it, expect } from 'vitest'
import { generateModulePatterns } from '../../core/library/index.js'
import { parseProjectJson } from '../projectFile.js'
import {
  buildBackupFiles,
  buildThumbDataUrl,
  buildThumbSvg,
  buildWorkJson,
  byteSize,
  cloneWorkRecord,
  createRepo,
  createWorkRecord,
  fileNameToWorkName,
  formatBytes,
  nextUntitledName,
  normalizeWorkName,
  pickWorkData,
  sortByUpdatedDesc,
  uniqueWorkName
} from './repo.js'
import { createMemoryBackend } from './db.js'

const sampleData = () => ({
  version: 5,
  patterns: generateModulePatterns('koushi', { size: 100, spacing: 20, width: 2 }),
  material: { stockLength: 1200, kerf: 1.5, endAllowance: 2 },
  spacingUnit: 10,
  lineColors: { fallback: '#222222', angles: [{ angle: 0, color: '#4e79a7' }] }
})

describe('workspace/repo 纯函数', () => {
  it('normalizeWorkName：去首尾空白、压连续空白、截断 60 字符', () => {
    expect(normalizeWorkName('  麻叶  纹  ')).toBe('麻叶 纹')
    expect(normalizeWorkName('a'.repeat(80)).length).toBe(60)
    expect(normalizeWorkName(null)).toBe('')
  })

  it('uniqueWorkName：重名依次追加序号', () => {
    expect(uniqueWorkName('麻叶', [])).toBe('麻叶')
    expect(uniqueWorkName('麻叶', ['麻叶'])).toBe('麻叶 2')
    expect(uniqueWorkName('麻叶', ['麻叶', '麻叶 2'])).toBe('麻叶 3')
    // 空名回退到「未命名作品」
    expect(uniqueWorkName('', [])).toBe('未命名作品')
  })

  it('nextUntitledName：从 1 开始递增，跳过已占用', () => {
    expect(nextUntitledName([])).toBe('未命名作品 1')
    expect(nextUntitledName(['未命名作品 1'])).toBe('未命名作品 2')
    expect(nextUntitledName(['未命名作品 1', '未命名作品 2'])).toBe('未命名作品 3')
  })

  it('fileNameToWorkName：去掉扩展名（含中文名）', () => {
    expect(fileNameToWorkName('麻叶纹 300.kumiko.json')).toBe('麻叶纹 300')
    expect(fileNameToWorkName('a/b/方格.kumiko.json')).toBe('方格')
    expect(fileNameToWorkName('diagonal.json')).toBe('diagonal')
    expect(fileNameToWorkName('')).toBe('')
  })

  it('pickWorkData：只取白名单字段且转为纯对象（不含派生段）', () => {
    const store = { ...sampleData(), segments: [{ id: 'x' }], extra: 1 }
    const data = pickWorkData(store)
    expect(Object.keys(data).sort()).toEqual([
      'lineColors',
      'material',
      'patterns',
      'spacingUnit',
      'version'
    ])
    expect(data.segments).toBeUndefined()
    // 纯对象（可被结构化克隆写入 IndexedDB）
    expect(JSON.parse(JSON.stringify(data))).toEqual(data)
  })

  it('createWorkRecord：生成 id/时间/size/缩略图，空作品缩略图为 null', () => {
    const rec = createWorkRecord({ name: '  测试  ', data: sampleData() })
    expect(rec.id).toMatch(/^w-/)
    expect(rec.name).toBe('测试')
    expect(rec.deletedAt).toBeNull()
    expect(rec.size).toBeGreaterThan(0)
    expect(rec.thumbnail).toContain('data:image/svg+xml')
    expect(rec.updatedAt).toBe(rec.createdAt)

    const empty = createWorkRecord({ name: '空的', data: { ...sampleData(), patterns: [] } })
    expect(empty.thumbnail).toBeNull()
    expect(buildThumbSvg({ patterns: [] })).toBeNull()
    expect(buildThumbDataUrl({ patterns: [] })).toBeNull()
  })

  it('缩略图 SVG：含 viewBox 与线段，颜色按角度取用', () => {
    const svg = buildThumbSvg(sampleData(), { width: 240 })
    expect(svg).toContain('<svg')
    expect(svg).toContain('viewBox=')
    expect(svg).toContain('<line')
    expect(svg).toContain('#4e79a7')
  })

  it('cloneWorkRecord：新 id、名称加「副本」且避开重名', () => {
    const rec = createWorkRecord({ name: '麻叶', data: sampleData() })
    const copy = cloneWorkRecord(rec, ['麻叶', '麻叶 副本'])
    expect(copy.id).not.toBe(rec.id)
    expect(copy.name).toBe('麻叶 副本 2')
    expect(copy.deletedAt).toBeNull()
  })

  it('byteSize / formatBytes', () => {
    expect(byteSize('abc')).toBe(3)
    expect(byteSize({ a: 1 })).toBe(7)
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
    expect(formatBytes(null)).toBe('—')
  })

  it('buildWorkJson → parseProjectJson 往返：作品名与数据不丢', () => {
    const rec = createWorkRecord({ name: '麻叶纹 300', data: sampleData() })
    const parsed = parseProjectJson(buildWorkJson(rec))
    expect(parsed.name).toBe('麻叶纹 300')
    expect(parsed.patterns).toEqual(rec.data.patterns)
    expect(parsed.spacingUnit).toBe(10)
    expect(parsed.lineColors).toEqual(rec.data.lineColors)
  })

  it('buildBackupFiles：manifest + 每作品一个文件，同名自动加序号', () => {
    const a = createWorkRecord({ name: '麻叶', data: sampleData() })
    const b = createWorkRecord({ name: '麻叶', data: sampleData() })
    const files = buildBackupFiles([a, b])
    expect(files[0].name).toBe('manifest.json')
    const manifest = JSON.parse(files[0].data)
    expect(manifest.type).toBe('workspace-backup')
    expect(manifest.count).toBe(2)
    expect(files.map((f) => f.name)).toEqual([
      'manifest.json',
      '麻叶.kumiko.json',
      '麻叶 2.kumiko.json'
    ])
    // 每个作品文件都可被重新导入
    const back = parseProjectJson(files[1].data)
    expect(back.patterns.length).toBe(a.data.patterns.length)
  })

  it('sortByUpdatedDesc：按更新时间倒序', () => {
    const list = [
      { id: 'a', updatedAt: 100 },
      { id: 'b', updatedAt: 300 },
      { id: 'c', updatedAt: 200 }
    ]
    expect(sortByUpdatedDesc(list).map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })
})

describe('workspace/repo 持久化层（内存后端）', () => {
  it('CRUD 与 currentId 元数据', async () => {
    const backend = createMemoryBackend()
    const repo = createRepo(backend)

    expect(await repo.listWorks()).toEqual([])
    expect(await repo.getCurrentId()).toBeUndefined()

    const rec = createWorkRecord({ name: 'A', data: { patterns: [] } })
    await repo.putWork(rec)
    expect((await repo.listWorks()).map((r) => r.name)).toEqual(['A'])

    await repo.setCurrentId(rec.id)
    expect(await repo.getCurrentId()).toBe(rec.id)

    await repo.putWork({ ...rec, name: 'A2' })
    expect((await repo.getWork(rec.id)).name).toBe('A2')

    await repo.deleteWork(rec.id)
    expect(await repo.listWorks()).toEqual([])

    await repo.setCurrentId(null)
    expect(await repo.getCurrentId()).toBeUndefined()
  })
})
