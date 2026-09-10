import { defineStore } from 'pinia'
import { useProjectStore } from './project.js'
import { useHistoryStore } from './history.js'
import { useUiStore } from './ui.js'
import {
  SCHEMA_VERSION,
  buildThumbDataUrl,
  byteSize,
  cloneWorkRecord,
  createWorkRecord,
  downloadBackupZip,
  downloadWorkFile,
  fileNameToWorkName,
  formatBytes,
  getRepo,
  nextUntitledName,
  pickWorkData,
  sortByUpdatedDesc,
  uniqueWorkName
} from '../utils/workspace/repo.js'
import { parseProjectJson, pickAndReadJsonFiles } from '../utils/projectFile.js'
import {
  estimateStorage,
  isStoragePersisted,
  requestPersistentStorage
} from '../utils/workspace/db.js'
import { clearLegacyProject, loadLegacyProject } from '../utils/persist.js'

/** 自动暂存防抖（模块级，避免把 timer 放进响应式 state） */
let saveTimer = null
/** 载入作品期间抑制自动暂存回写 */
let suppressAutosave = false

/** 与 project store 默认值一致的空白作品数据（新建作品时保留材料/间距单位/配色） */
function emptyWorkData(project) {
  return {
    version: project.version,
    patterns: [],
    material: JSON.parse(JSON.stringify(project.material)),
    spacingUnit: project.spacingUnit,
    lineColors: JSON.parse(JSON.stringify(project.lineColors))
  }
}

/** 把导入/旧存档数据补全为完整纯数据（缺省字段回退当前项目默认值） */
function normalizeData(partial, project) {
  return {
    version: partial.version ?? project.version,
    patterns: Array.isArray(partial.patterns) ? partial.patterns : [],
    material:
      partial.material && typeof partial.material === 'object'
        ? partial.material
        : JSON.parse(JSON.stringify(project.material)),
    spacingUnit: partial.spacingUnit ?? project.spacingUnit,
    lineColors: partial.lineColors ?? JSON.parse(JSON.stringify(project.lineColors))
  }
}

/**
 * workspace store —— 应用内工作区（0910 需求）
 *
 * 职责：多作品的暂存/恢复/管理；单条自动暂存；导入导出与备份；容量与持久化。
 * 数据源：utils/workspace/*（IndexedDB，不可用时降级 localStorage）。
 * 依赖 project store 读写画布数据（单向依赖）。
 */
export const useWorkspaceStore = defineStore('workspace', {
  state: () => ({
    ready: false,
    mode: '', // 'indexeddb' | 'localstorage'
    works: [], // 全部作品（含回收站）
    currentId: null,
    usage: null, // 已用字节
    quota: null, // 配额字节
    persisted: false,
    saving: false,
    lastSavedAt: null,
    error: ''
  }),

  getters: {
    activeWorks: (s) => s.works.filter((w) => !w.deletedAt),
    trashedWorks: (s) => s.works.filter((w) => !!w.deletedAt),
    currentWork: (s) => s.works.find((w) => w.id === s.currentId) || null,
    existingNames: (s) => s.works.filter((w) => !w.deletedAt).map((w) => w.name),
    isFallbackMode: (s) => s.mode === 'localstorage',
    usageText: (s) => formatBytes(s.usage),
    quotaText: (s) => formatBytes(s.quota),
    usageRatio: (s) => (s.quota ? (s.usage || 0) / s.quota : 0)
  },

  actions: {
    /* ---------------- 初始化 ---------------- */

    /** 启动初始化：解析后端、读取作品、迁移旧存档、确定当前作品 */
    async init() {
      const repo = await getRepo()
      this.mode = repo.backend.kind
      this.works = await repo.listWorks()
      this.currentId = (await repo.getCurrentId()) || null

      await this.migrateLegacy(repo)

      // 回收站里的 currentId 视为无效
      const current = this.works.find((w) => w.id === this.currentId && !w.deletedAt)
      if (!current) {
        const fallback = this.activeWorks[0]
        if (fallback) this.currentId = fallback.id
        else await this.createWork() // 保证始终有一个可编辑作品
        await repo.setCurrentId(this.currentId)
      }

      const rec = this.currentWork
      if (rec) this.applyToProject(rec.data)

      this.ready = true
      await this.refreshStorage()
    },

    /** 旧版 localStorage 单项目 → 工作区第一个作品（仅首次） */
    async migrateLegacy(repo) {
      const schema = await repo.getMeta('schemaVersion')
      if (schema) return
      const project = useProjectStore()
      const legacy = loadLegacyProject()
      if (legacy && Array.isArray(legacy.patterns) && legacy.patterns.length) {
        const record = createWorkRecord({
          name: uniqueWorkName('我的作品', this.existingNames),
          data: normalizeData(legacy, project)
        })
        await repo.putWork(record)
        this.works = sortByUpdatedDesc([...this.works, record])
        this.currentId = record.id
        await repo.setCurrentId(record.id)
      }
      await repo.setMeta('schemaVersion', SCHEMA_VERSION)
      if (legacy) clearLegacyProject()
    },

    /* ---------------- 作品 CRUD ---------------- */

    /** 新建空白作品并打开（保留当前材料参数） */
    async createWork(name) {
      const repo = await getRepo()
      const project = useProjectStore()
      const record = createWorkRecord({
        name: name || nextUntitledName(this.existingNames),
        data: emptyWorkData(project)
      })
      await repo.putWork(record)
      this.works = sortByUpdatedDesc([...this.works, record])
      this.currentId = record.id
      await repo.setCurrentId(record.id)
      this.applyToProject(record.data)
      this.lastSavedAt = record.updatedAt
      return record
    },

    /** 打开作品（切到回收站中的作品会被忽略） */
    async openWork(id) {
      const rec = this.works.find((w) => w.id === id && !w.deletedAt)
      if (!rec) return null
      // 切换前先把当前编辑成果写回
      await this.saveCurrentNow()
      const repo = await getRepo()
      this.currentId = rec.id
      await repo.setCurrentId(rec.id)
      this.applyToProject(rec.data)
      return rec
    },

    async renameWork(id, name) {
      const next = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
      if (!next) return
      await this.patchWork(id, { name: next })
    },

    /** 复制作品为新作品（不切换当前编辑对象） */
    async duplicateWork(id) {
      const repo = await getRepo()
      const src = this.works.find((w) => w.id === id)
      if (!src) return null
      const copy = cloneWorkRecord(src, this.existingNames)
      await repo.putWork(copy)
      this.works = sortByUpdatedDesc([...this.works, copy])
      return copy
    },

    /** 软删除 → 回收站 */
    async trashWork(id) {
      await this.patchWork(id, { deletedAt: Date.now() })
      if (this.currentId === id) {
        const next = this.activeWorks[0]
        if (next) await this.openWork(next.id)
        else await this.createWork()
      }
    },

    /** 回收站恢复 */
    async restoreWork(id) {
      await this.patchWork(id, { deletedAt: null })
    },

    /** 彻底删除（不可恢复） */
    async purgeWork(id) {
      const repo = await getRepo()
      suppressAutosave = true
      try {
        await repo.deleteWork(id)
        this.works = this.works.filter((w) => w.id !== id)
        if (this.currentId === id) {
          this.currentId = null
          await repo.setCurrentId(null)
          const next = this.activeWorks[0]
          if (next) await this.openWork(next.id)
          else await this.createWork()
        }
      } finally {
        suppressAutosave = false
      }
    },

    async emptyTrash() {
      const ids = this.trashedWorks.map((w) => w.id)
      for (const id of ids) await this.purgeWork(id)
    },

    /** 内部：更新单条作品并同步列表 */
    async patchWork(id, patch) {
      const rec = this.works.find((w) => w.id === id)
      if (!rec) return null
      const next = { ...rec, ...patch }
      const repo = await getRepo()
      await repo.putWork(next)
      this.works = this.works.map((w) => (w.id === id ? next : w))
      return next
    },

    /* ---------------- 暂存（自动保存） ---------------- */

    /** 编辑后防抖写回当前作品 */
    scheduleSave(delay = 400) {
      if (suppressAutosave || !this.ready) return
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        saveTimer = null
        this.saveCurrentNow().catch((e) => {
          this.error = e?.message || String(e)
        })
      }, delay)
    },

    /** 立即写回当前作品（⌘S / 切换作品前 / 关闭前） */
    async saveCurrentNow({ withThumbnail = false } = {}) {
      const rec = this.currentWork
      if (!rec) return null
      const project = useProjectStore()
      const data = pickWorkData(project)
      this.saving = true
      try {
        const next = {
          ...rec,
          data,
          size: byteSize(data),
          thumbnail: withThumbnail
            ? buildThumbDataUrl(data) || rec.thumbnail
            : rec.thumbnail,
          updatedAt: Date.now()
        }
        const repo = await getRepo()
        await repo.putWork(next)
        this.works = this.works.map((w) => (w.id === next.id ? next : w))
        this.lastSavedAt = next.updatedAt
        this.error = ''
        return next
      } catch (e) {
        this.error = e?.message || String(e)
        throw e
      } finally {
        this.saving = false
      }
    },

    /** 重新生成当前作品缩略图（打开工作区面板时调用，避免编辑期频繁重算） */
    async refreshCurrentThumbnail() {
      const rec = this.currentWork
      if (!rec) return
      const thumb = buildThumbDataUrl(rec.data)
      if (thumb && thumb !== rec.thumbnail) {
        await this.patchWork(rec.id, { thumbnail: thumb, size: byteSize(rec.data) })
      }
    },

    /* ---------------- 导入 / 导出 / 备份 ---------------- */

    /**
     * 从「文件名 + 文本」批量导入为新作品（不覆盖当前作品）。
     * @returns {Promise<{created:Array, failed:Array<{name:string,message:string}>}>}
     */
    async importEntries(entries) {
      const repo = await getRepo()
      const project = useProjectStore()
      const created = []
      const failed = []
      for (const entry of entries || []) {
        try {
          const parsed = parseProjectJson(entry.text)
          const record = createWorkRecord({
            name: uniqueWorkName(
              normalizeName(parsed.name) || fileNameToWorkName(entry.name),
              [...this.existingNames, ...created.map((w) => w.name)]
            ),
            data: normalizeData(parsed, project)
          })
          await repo.putWork(record)
          created.push(record)
        } catch (e) {
          failed.push({ name: entry.name, message: e?.message || String(e) })
        }
      }
      if (created.length) this.works = sortByUpdatedDesc([...this.works, ...created])
      return { created, failed }
    },

    /** 打开系统文件选择器多选导入 */
    async importFromPicker() {
      const entries = await pickAndReadJsonFiles()
      if (!entries.length) return { created: [], failed: [] }
      return this.importEntries(entries)
    },

    /** 导出单个作品为 .kumiko.json */
    async exportWork(id) {
      const rec = this.works.find((w) => w.id === id)
      if (!rec) return
      if (rec.id === this.currentId) await this.saveCurrentNow()
      downloadWorkFile(this.works.find((w) => w.id === id) || rec)
    },

    /** 一键备份全部作品（zip：manifest + 每作品一个 json） */
    async exportAll() {
      await this.saveCurrentNow()
      const list = this.activeWorks
      if (!list.length) return 0
      downloadBackupZip(list)
      return list.length
    },

    /* ---------------- 容量 / 持久化 ---------------- */

    async refreshStorage() {
      const { usage, quota } = await estimateStorage()
      this.usage = usage
      this.quota = quota
      this.persisted = await isStoragePersisted()
    },

    /** 申请持久化存储；返回是否已授权 */
    async requestPersist() {
      const granted = await requestPersistentStorage()
      this.persisted = granted
      await this.refreshStorage()
      return granted
    },

    /* ---------------- 内部 ---------------- */

    /**
     * 载入作品数据到画布。
     * 同时清空撤销历史与选中：历史栈是「上一个作品」的快照，跨作品撤销会串数据。
     * 期间抑制由此触发的自动回写。
     */
    applyToProject(data) {
      const project = useProjectStore()
      const history = useHistoryStore()
      const ui = useUiStore()
      suppressAutosave = true
      try {
        project.replaceAll({
          patterns: data.patterns,
          material: data.material,
          spacingUnit: data.spacingUnit,
          lineColors: data.lineColors
        })
        history.clear()
        ui.clearSelection()
      } finally {
        suppressAutosave = false
      }
    }
  }
})

function normalizeName(name) {
  return String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
}
