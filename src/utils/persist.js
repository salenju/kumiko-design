/**
 * 纯数据持久化 util（V2 §8.6）
 * 只保存 project 的纯数据（patterns/material/spacingUnit），不含派生段与 ui 态。
 * localStorage 容量 ~5MB；预留 storage 抽象便于日后切换 IndexedDB。
 */

const KEY = 'kumiko:project:v2'

/** 兼容不同环境的 storage 后端（预留 IndexedDB 切换点） */
const storage = {
  get() {
    try {
      const raw = localStorage.getItem(KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  },
  set(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data))
    } catch (e) {
      // 容量超限：静默失败（MVP 不打断编辑），可由后续 IndexedDB 方案替代
      console.warn('[persist] 保存失败（可能超出 localStorage 容量）', e)
    }
  }
}

let timer = null

/** 加载已保存的项目（返回 null 表示无存档） */
export function loadPersistedProject() {
  const data = storage.get()
  if (!data || !Array.isArray(data.patterns)) return null
  return data
}

/** 从 project store 提取需要持久化的纯数据 */
function toStorable(state) {
  return {
    version: state.version,
    patterns: state.patterns,
    material: state.material,
    spacingUnit: state.spacingUnit
  }
}

/**
 * 订阅 project store 变化并防抖持久化。
 * 用 $subscribe（默认 deep=false，本 store 顶层字段即 patterns 数组引用，
 * 任何 action 都会整体替换数组，可可靠触发）。
 */
export function installPersistence(projectStore, delay = 400) {
  projectStore.$subscribe((_mutation, state) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      storage.set(toStorable(state))
    }, delay)
  })
}

export function clearPersistedProject() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* noop */
  }
}

/** 立即把当前 project 状态写入 localStorage（不等待防抖） */
export function saveProjectNow(projectStore) {
  storage.set(toStorable(projectStore.$state ?? projectStore))
}
