/**
 * 旧版单项目存档（仅用于迁移）
 *
 * V2 阶段：用 localStorage 单 key 保存 project 纯数据（回看 V2 §8.6）。
 * 0910 需求引入「应用内工作区」后，正式存取改由 utils/workspace/*（IndexedDB）负责，
 * 本文件只保留「读取旧存档 / 清理旧存档」两项职责，供一次性迁移使用。
 */

const LEGACY_KEY = 'kumiko:project:v2'

/**
 * 读取旧版单项目存档。
 * @returns {{version?:number, patterns:Array, material?:object, spacingUnit?:number, lineColors?:object}|null}
 */
export function loadLegacyProject() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || !Array.isArray(data.patterns)) return null
    return data
  } catch {
    return null
  }
}

/** 是否存在旧版存档（迁移判定） */
export function hasLegacyProject() {
  return loadLegacyProject() !== null
}

/** 清理旧版存档（迁移完成后调用） */
export function clearLegacyProject() {
  try {
    localStorage.removeItem(LEGACY_KEY)
  } catch {
    /* noop */
  }
}
