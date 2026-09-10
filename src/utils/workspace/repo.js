/**
 * 工作区业务层（utils/workspace/repo.js）
 *
 * 分两部分：
 *  1) 纯函数（无副作用、可单测）：命名规则、记录构造、缩略图、导出内容、备份包内容；
 *  2) createRepo(backend)：薄持久化层，只做「读列表 / 写单条」等 IO 转发。
 *
 * 一个作品 = 一条记录（含纯数据 data），导出 = 一个独立 .kumiko.json 文件。
 */
import { uid } from '../id.js'
import { colorForSeg, segmentsBounds, segmentsFromPatterns } from '../../core/index.js'
import { buildProjectJson, sanitizeFileBase } from '../projectFile.js'
import { downloadZip } from '../zip.js'
import { getBackend } from './db.js'

export const WORK_EXT = '.kumiko.json'
export const UNTITLED_BASE = '未命名作品'
export const THUMB_WIDTH = 240
export const SCHEMA_VERSION = 1

/* ------------------------------------------------------------------ *
 * 纯函数
 * ------------------------------------------------------------------ */

/**
 * project store（或等价对象）→ 可持久化的纯数据白名单（不含派生段/UI 态）。
 * 经 JSON 往返转为「纯对象」：Pinia 的响应式 Proxy 不能被结构化克隆写入 IndexedDB。
 */
export function pickWorkData(project) {
  return JSON.parse(
    JSON.stringify({
      version: project.version,
      patterns: project.patterns,
      material: project.material,
      spacingUnit: project.spacingUnit,
      lineColors: project.lineColors
    })
  )
}

/**
 * 记录 → 纯对象。
 * Pinia state 里的记录是响应式 Proxy，结构化克隆（IndexedDB put / structuredClone）会抛 DataCloneError，
 * 因此所有写库动作都先经此转换。
 */
export function toPlainRecord(record) {
  return JSON.parse(JSON.stringify(record))
}

/** 序列化后的字节数（用于展示占用） */
export function byteSize(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  try {
    return new TextEncoder().encode(text).length
  } catch {
    return text.length
  }
}

/** 名称规整：去首尾空白、压掉内部连续空白、截断 60 字符 */
export function normalizeWorkName(name) {
  return String(name ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

/** 取未被占用的名称：base 已存在则依次追加 " 2"、" 3"… */
export function uniqueWorkName(base, existingNames = []) {
  const taken = new Set(existingNames.map((n) => normalizeWorkName(n)))
  const root = normalizeWorkName(base) || UNTITLED_BASE
  if (!taken.has(root)) return root
  let i = 2
  while (taken.has(`${root} ${i}`)) i++
  return `${root} ${i}`
}

/** 下一个「未命名作品 N」 */
export function nextUntitledName(existingNames = []) {
  const taken = new Set(existingNames.map((n) => normalizeWorkName(n)))
  let i = 1
  while (taken.has(`${UNTITLED_BASE} ${i}`)) i++
  return `${UNTITLED_BASE} ${i}`
}

/** 由导入文件名推断作品名：`麻叶纹 300.kumiko.json` → `麻叶纹 300` */
export function fileNameToWorkName(fileName) {
  const base = String(fileName ?? '').replace(/\\/g, '/').split('/').pop() || ''
  return normalizeWorkName(
    base.replace(/\.kumiko\.json$/i, '').replace(/\.json$/i, '')
  )
}

/** 构造一条作品记录（不落库） */
export function createWorkRecord({ name, data, id, createdAt } = {}) {
  const now = Date.now()
  const record = {
    id: id || uid('w'),
    name: normalizeWorkName(name) || UNTITLED_BASE,
    createdAt: createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
    size: byteSize(data),
    thumbnail: buildThumbDataUrl(data),
    data
  }
  return record
}

/** 复制记录（新 id / 新时间 / 名称加「副本」） */
export function cloneWorkRecord(record, existingNames = []) {
  const now = Date.now()
  return {
    ...record,
    id: uid('w'),
    name: uniqueWorkName(`${record.name} 副本`, existingNames),
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  }
}

/**
 * 缩略图（纯字符串生成，不依赖 DOM）。
 * 用 SVG 字符串直接作为 dataURL，浏览器 <img> 即可显示。
 * @returns {string|null} 空作品返回 null
 */
export function buildThumbSvg(data, opts = {}) {
  const width = opts.width ?? THUMB_WIDTH
  const segments = segmentsFromPatterns(data?.patterns)
  const b = segmentsBounds(segments)
  if (!b) return null
  const pad = Math.max(b.w, b.h) * 0.04 || 1
  const vbX = b.x - pad
  const vbY = b.y - pad
  const vbW = Math.max(b.w + pad * 2, 1e-6)
  const vbH = Math.max(b.h + pad * 2, 1e-6)
  const height = Math.max(1, Math.round((width * vbH) / vbW))
  // 线宽按视图尺寸换算，保证缩略图上线条可见
  const strokeScale = Math.max(vbW, vbH) / 200
  const num = (v) => Math.round(v * 100) / 100
  const lines = segments
    .map(
      (s) =>
        `<line x1="${num(s.x1)}" y1="${num(s.y1)}" x2="${num(s.x2)}" y2="${num(s.y2)}" stroke="${colorForSeg(data.lineColors, s)}" stroke-width="${num(Math.max(0.05, (s.width || 1) * strokeScale))}" />`
    )
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${num(vbX)} ${num(vbY)} ${num(vbW)} ${num(vbH)}"><rect x="${num(vbX)}" y="${num(vbY)}" width="${num(vbW)}" height="${num(vbH)}" fill="#fff"/>${lines}</svg>`
}

/** 缩略图 dataURL（供 <img src> 直接使用）；空作品返回 null */
export function buildThumbDataUrl(data, opts = {}) {
  const svg = buildThumbSvg(data, opts)
  if (!svg) return null
  try {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  } catch {
    return null
  }
}

/** 作品 → 项目文件 JSON 字符串（含 name，便于导入还原名称） */
export function buildWorkJson(record) {
  return buildProjectJson(record.data, { name: record.name })
}

/** 备份包内容：manifest.json + 每作品一个 .kumiko.json（同名自动加序号） */
export function buildBackupFiles(records, { exportedAt = Date.now() } = {}) {
  const files = []
  const used = new Set()
  for (const r of records) {
    let base = sanitizeFileBase(r.name) || 'work'
    let candidate = `${base}${WORK_EXT}`
    let i = 2
    while (used.has(candidate)) candidate = `${base} ${i++}${WORK_EXT}`
    used.add(candidate)
    files.push({ name: candidate, data: buildWorkJson(r) })
  }
  const manifest = {
    app: 'kumiko-design',
    type: 'workspace-backup',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date(exportedAt).toISOString(),
    count: records.length,
    works: records.map((r) => ({
      name: r.name,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      size: r.size
    }))
  }
  return [{ name: 'manifest.json', data: JSON.stringify(manifest, null, 2) }, ...files]
}

/** 触发下载单个作品文件（浏览器） */
export function downloadWorkFile(record) {
  const json = buildWorkJson(record)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${sanitizeFileBase(record.name) || 'kumiko-design'}${WORK_EXT}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** 触发下载全部作品备份 zip（浏览器） */
export function downloadBackupZip(records) {
  const stamp = new Date().toISOString().slice(0, 10)
  downloadZip(buildBackupFiles(records), `组子细工工作区-${stamp}.zip`)
}

/** 人类可读字节数 */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/* ------------------------------------------------------------------ *
 * 持久化层
 * ------------------------------------------------------------------ */

/** 作品排序：更新时间倒序 */
export function sortByUpdatedDesc(records) {
  return [...records].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

export function createRepo(backend) {
  return {
    backend,

    /** 读取全部作品（含回收站） */
    async listWorks() {
      const all = await backend.allWorks()
      return sortByUpdatedDesc(all.filter((r) => r && r.id))
    },

    async getWork(id) {
      return backend.getWork(id)
    },

    async putWork(record) {
      return backend.putWork(toPlainRecord(record))
    },

    async deleteWork(id) {
      return backend.deleteWork(id)
    },

    async getCurrentId() {
      return backend.getMeta('currentWorkId')
    },

    async setCurrentId(id) {
      if (id) await backend.setMeta('currentWorkId', id)
      else await backend.removeMeta('currentWorkId')
    },

    async getMeta(key) {
      return backend.getMeta(key)
    },

    async setMeta(key, value) {
      return backend.setMeta(key, value)
    }
  }
}

let defaultRepo = null

/** 全局 repo（首次调用时解析后端：IndexedDB → localStorage） */
export async function getRepo() {
  if (!defaultRepo) defaultRepo = createRepo(await getBackend())
  return defaultRepo
}

/** 仅供测试：替换全局 repo */
export function __setRepoForTest(repo) {
  defaultRepo = repo
}
