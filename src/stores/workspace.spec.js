// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProjectStore } from './project.js'
import { useHistoryStore } from './history.js'
import { useWorkspaceStore } from './workspace.js'
import { createMemoryBackend, __setBackendForTest } from '../utils/workspace/db.js'
import { __setRepoForTest } from '../utils/workspace/repo.js'
import { generatePatterns } from '../core/presets/index.js'
import { buildProjectJson } from '../utils/projectFile.js'

const LEGACY_KEY = 'kumiko:project:v2'

let backend

beforeEach(() => {
  backend = createMemoryBackend()
  __setBackendForTest(backend)
  __setRepoForTest(null) // 让 getRepo 用新后端重新解析
  localStorage.clear()
  setActivePinia(createPinia())
})

afterEach(() => {
  localStorage.clear()
})

async function initStore() {
  const workspace = useWorkspaceStore()
  await workspace.init()
  return workspace
}

describe('workspace store：初始化与迁移', () => {
  it('空工作区首次启动：自动创建一份空白作品并载入画布', async () => {
    const workspace = await initStore()
    expect(workspace.ready).toBe(true)
    expect(workspace.activeWorks.length).toBe(1)
    expect(workspace.currentWork.name).toBe('未命名作品 1')
    expect(workspace.currentId).toBe(workspace.currentWork.id)
    // 元数据写入：schema 版本 + 当前作品
    expect(await backend.getMeta('schemaVersion')).toBe(1)
    expect(await backend.getMeta('currentWorkId')).toBe(workspace.currentId)
  })

  it('旧版 localStorage 单项目自动迁入为「我的作品」，并清理旧 key', async () => {
    const patterns = generatePatterns('koushi', { size: 80, spacing: 20, width: 2 })
    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({
        version: 5,
        patterns,
        material: { stockLength: 1200, kerf: 1.5, endAllowance: 2 },
        spacingUnit: 15,
        lineColors: { fallback: '#123456', angles: [] }
      })
    )
    const workspace = await initStore()
    expect(workspace.activeWorks.length).toBe(1)
    const rec = workspace.currentWork
    expect(rec.name).toBe('我的作品')
    expect(rec.data.patterns.length).toBe(patterns.length)
    expect(rec.data.spacingUnit).toBe(15)
    // 画布已载入迁移数据；旧 localStorage 存档已清理
    expect(useProjectStore().patterns.length).toBe(patterns.length)
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
  })

  it('旧存档为空项目时不建作品，走默认空白作品', async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ version: 5, patterns: [] }))
    const workspace = await initStore()
    expect(workspace.activeWorks.length).toBe(1)
    expect(workspace.currentWork.name).toBe('未命名作品 1')
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
  })
})

describe('workspace store：作品 CRUD', () => {
  it('新建 / 打开 / 重命名 / 复制 / 导出内容隔离', async () => {
    const workspace = await initStore()
    const project = useProjectStore()
    const history = useHistoryStore()

    const firstId = workspace.currentId
    history.beginEdit(() =>
      project.addPatterns(generatePatterns('koushi', { size: 100, spacing: 20, width: 2 }))
    )
    const firstPatternIds = project.patterns.map((p) => p.id)
    await workspace.saveCurrentNow()
    expect(workspace.currentWork.data.patterns.length).toBe(2)

    // 新建空白作品 → 画布清空，且撤销历史被清（不跨作品撤销）
    const second = await workspace.createWork()
    expect(second.name).toBe('未命名作品 2')
    expect(project.patterns.length).toBe(0)
    expect(history.canUndo).toBe(false)

    history.beginEdit(() =>
      project.addPatterns(generatePatterns('diagonal', { size: 60, spacing: 10, width: 2 }))
    )
    await workspace.saveCurrentNow()
    expect(workspace.currentWork.data.patterns.length).toBe(2)

    // 切回第一份：数据各自独立（不要在切换后使用旧的响应式引用）
    await workspace.openWork(firstId)
    expect(workspace.currentWork.id).toBe(firstId)
    expect(project.patterns.length).toBe(2)
    expect(project.patterns.map((p) => p.id)).toEqual(firstPatternIds)

    // 重命名
    await workspace.renameWork(firstId, '  麻叶  纹  ')
    expect(workspace.currentWork.name).toBe('麻叶 纹')

    // 复制：新 id + 名称加副本，不影响当前
    const copy = await workspace.duplicateWork(firstId)
    expect(copy.id).not.toBe(firstId)
    expect(copy.name).toBe('麻叶 纹 副本')
    expect(workspace.activeWorks.length).toBe(3)
    expect(workspace.currentId).toBe(firstId)
  })

  it('自动暂存：防抖写回当前作品', async () => {
    const workspace = await initStore()
    const project = useProjectStore()
    const history = useHistoryStore()
    const id = workspace.currentId

    history.beginEdit(() =>
      project.addPatterns(generatePatterns('koushi', { size: 100, spacing: 20, width: 2 }))
    )
    workspace.scheduleSave(5)
    await new Promise((r) => setTimeout(r, 30))

    const saved = workspace.works.find((w) => w.id === id)
    expect(saved.data.patterns.length).toBe(2)
    expect(saved.updatedAt).toBeGreaterThanOrEqual(saved.createdAt)
    expect(saved.size).toBeGreaterThan(0)
  })

  it('删除进回收站 → 恢复 → 彻底删除；删除当前作品会自动切到其它作品', async () => {
    const workspace = await initStore()
    const a = workspace.currentWork
    const b = await workspace.createWork()

    await workspace.trashWork(b.id)
    expect(workspace.trashedWorks.length).toBe(1)
    expect(workspace.currentId).toBe(a.id) // 自动切走

    await workspace.restoreWork(b.id)
    expect(workspace.trashedWorks.length).toBe(0)

    await workspace.trashWork(b.id)
    await workspace.purgeWork(b.id)
    expect(workspace.works.find((w) => w.id === b.id)).toBeUndefined()
    expect(workspace.trashedWorks.length).toBe(0)
  })

  it('清空回收站：批量彻底删除', async () => {
    const workspace = await initStore()
    const a = await workspace.createWork()
    const b = await workspace.createWork()
    await workspace.trashWork(a.id)
    await workspace.trashWork(b.id)
    expect(workspace.trashedWorks.length).toBe(2)
    await workspace.emptyTrash()
    expect(workspace.trashedWorks.length).toBe(0)
    expect(workspace.activeWorks.length).toBeGreaterThan(0)
  })
})

describe('workspace store：导入', () => {
  it('导入项目文件为新作品（按文件名命名、同名加序号、可选名称优先）', async () => {
    const workspace = await initStore()
    const patterns = generatePatterns('koushi', { size: 60, spacing: 20, width: 2 })
    const text = buildProjectJson(
      { version: 5, patterns, material: {}, spacingUnit: 10, lineColors: undefined },
      { name: '方格 300' }
    )
    const r = await workspace.importEntries([
      { name: '方格 300.kumiko.json', text },
      { name: '方格 300.kumiko.json', text }
    ])
    expect(r.created.length).toBe(2)
    expect(r.failed.length).toBe(0)
    expect(r.created[0].name).toBe('方格 300')
    expect(r.created[1].name).toBe('方格 300 2')
    // 导入不改变当前编辑对象
    expect(workspace.currentWork.name).toBe('未命名作品 1')
    expect(workspace.activeWorks.length).toBe(3)
  })

  it('非法文件计入 failed 且不建作品', async () => {
    const workspace = await initStore()
    const before = workspace.activeWorks.length
    const r = await workspace.importEntries([{ name: 'bad.json', text: 'not json{{' }])
    expect(r.created.length).toBe(0)
    expect(r.failed.length).toBe(1)
    expect(workspace.activeWorks.length).toBe(before)
  })
})
