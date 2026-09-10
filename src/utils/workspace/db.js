/**
 * 工作区存储引擎（utils/workspace/db.js）
 *
 * 职责：只提供「记录 + 元数据」的存取原语，不含任何业务语义（业务见 repo.js）。
 *
 * 引擎优先级：
 *   1) IndexedDB（DB `kumiko-workspace`，store: works / meta）—— 容量大、可单条读写；
 *   2) 降级 localStorage（隐私模式 / 老浏览器）—— 容量 ~5MB，UI 需提示。
 *
 * 两个引擎实现同一接口（见 createIdbBackend / createLocalStorageBackend）：
 *   allWorks() / getWork(id) / putWork(rec) / deleteWork(id) / clearWorks()
 *   getMeta(key) / setMeta(key,value) / removeMeta(key)
 */

const DB_NAME = 'kumiko-workspace'
const DB_VERSION = 1
const STORE_WORKS = 'works'
const STORE_META = 'meta'

const LS_PREFIX = 'kumiko:ws:'
const LS_INDEX = `${LS_PREFIX}index`
const LS_META_PREFIX = `${LS_PREFIX}meta:`
const LS_WORK_PREFIX = `${LS_PREFIX}work:`

function hasIndexedDB() {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('IndexedDB 请求失败'))
  })
}

function openIdb() {
  return new Promise((resolve, reject) => {
    let req
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION)
    } catch (e) {
      reject(e)
      return
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_WORKS)) {
        const s = db.createObjectStore(STORE_WORKS, { keyPath: 'id' })
        s.createIndex('updatedAt', 'updatedAt', { unique: false })
        s.createIndex('deletedAt', 'deletedAt', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('IndexedDB 打开失败'))
    req.onblocked = () => reject(new Error('IndexedDB 被其它页面阻塞，请关闭其它标签页后重试'))
  })
}

/** IndexedDB 引擎 */
export function createIdbBackend(db) {
  const tx = (store, mode) => db.transaction(store, mode).objectStore(store)

  return {
    kind: 'indexeddb',
    allWorks: () => reqToPromise(tx(STORE_WORKS, 'readonly').getAll()),
    getWork: (id) => reqToPromise(tx(STORE_WORKS, 'readonly').get(id)),
    putWork: (rec) => reqToPromise(tx(STORE_WORKS, 'readwrite').put(rec)),
    deleteWork: (id) => reqToPromise(tx(STORE_WORKS, 'readwrite').delete(id)),
    clearWorks: () => reqToPromise(tx(STORE_WORKS, 'readwrite').clear()),
    getMeta: async (key) => (await reqToPromise(tx(STORE_META, 'readonly').get(key)))?.value,
    setMeta: async (key, value) => reqToPromise(tx(STORE_META, 'readwrite').put({ key, value })),
    removeMeta: (key) => reqToPromise(tx(STORE_META, 'readwrite').delete(key))
  }
}

/** localStorage 降级引擎（兼容模式，容量有限） */
export function createLocalStorageBackend() {
  const readJson = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : fallback
    } catch {
      return fallback
    }
  }
  const writeJson = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch (e) {
      console.warn('[workspace] localStorage 写入失败（可能超出容量）', e)
      return false
    }
  }
  const readIndex = () => {
    const idx = readJson(LS_INDEX, [])
    return Array.isArray(idx) ? idx : []
  }

  return {
    kind: 'localstorage',
    async allWorks() {
      return readIndex()
        .map((id) => readJson(`${LS_WORK_PREFIX}${id}`, null))
        .filter(Boolean)
    },
    async getWork(id) {
      return readJson(`${LS_WORK_PREFIX}${id}`, null)
    },
    async putWork(rec) {
      if (!writeJson(`${LS_WORK_PREFIX}${rec.id}`, rec)) {
        throw new Error('浏览器本地存储空间不足')
      }
      const idx = readIndex()
      if (!idx.includes(rec.id)) writeJson(LS_INDEX, [...idx, rec.id])
      return rec
    },
    async deleteWork(id) {
      try {
        localStorage.removeItem(`${LS_WORK_PREFIX}${id}`)
      } catch {
        /* noop */
      }
      writeJson(
        LS_INDEX,
        readIndex().filter((x) => x !== id)
      )
    },
    async clearWorks() {
      for (const id of readIndex()) {
        try {
          localStorage.removeItem(`${LS_WORK_PREFIX}${id}`)
        } catch {
          /* noop */
        }
      }
      writeJson(LS_INDEX, [])
    },
    async getMeta(key) {
      return readJson(`${LS_META_PREFIX}${key}`, undefined)
    },
    async setMeta(key, value) {
      writeJson(`${LS_META_PREFIX}${key}`, value)
    },
    async removeMeta(key) {
      try {
        localStorage.removeItem(`${LS_META_PREFIX}${key}`)
      } catch {
        /* noop */
      }
    }
  }
}

/** 内存引擎（仅供单测注入使用） */
export function createMemoryBackend(seed = {}) {
  const works = new Map(Object.entries(seed.works || {}))
  const meta = new Map(Object.entries(seed.meta || {}))
  return {
    kind: 'memory',
    async allWorks() {
      return [...works.values()].map((r) => structuredClone(r))
    },
    async getWork(id) {
      const r = works.get(id)
      return r ? structuredClone(r) : undefined
    },
    async putWork(rec) {
      works.set(rec.id, structuredClone(rec))
      return rec
    },
    async deleteWork(id) {
      works.delete(id)
    },
    async clearWorks() {
      works.clear()
    },
    async getMeta(key) {
      return meta.has(key) ? structuredClone(meta.get(key)) : undefined
    },
    async setMeta(key, value) {
      meta.set(key, structuredClone(value))
    },
    async removeMeta(key) {
      meta.delete(key)
    }
  }
}

let backendPromise = null

/**
 * 创建（并缓存）可用后端：优先 IndexedDB，不可用时降级 localStorage。
 * @returns {Promise<ReturnType<typeof createIdbBackend>>}
 */
export function createBackend() {
  if (hasIndexedDB()) {
    return openIdb()
      .then((db) => createIdbBackend(db))
      .catch((e) => {
        console.warn('[workspace] IndexedDB 不可用，降级 localStorage', e)
        return createLocalStorageBackend()
      })
  }
  return Promise.resolve(createLocalStorageBackend())
}

/** 获取全局后端（单例） */
export function getBackend() {
  if (!backendPromise) backendPromise = createBackend()
  return backendPromise
}

/** 仅供测试：替换全局后端 */
export function __setBackendForTest(backend) {
  backendPromise = Promise.resolve(backend)
}

/* ---------- 容量 / 持久化 ---------- */

/** 存储用量与配额（不支持的环境返回 null 值） */
export async function estimateStorage() {
  try {
    if (navigator?.storage?.estimate) {
      const { usage, quota } = await navigator.storage.estimate()
      return { usage: usage ?? null, quota: quota ?? null }
    }
  } catch {
    /* noop */
  }
  return { usage: null, quota: null }
}

/** 是否已获得持久化存储授权 */
export async function isStoragePersisted() {
  try {
    if (navigator?.storage?.persisted) return await navigator.storage.persisted()
  } catch {
    /* noop */
  }
  return false
}

/** 申请持久化存储（降低被系统回收风险）；返回是否已授权 */
export async function requestPersistentStorage() {
  try {
    if (navigator?.storage?.persist) {
      const already = await isStoragePersisted()
      if (already) return true
      return await navigator.storage.persist()
    }
  } catch {
    /* noop */
  }
  return false
}
