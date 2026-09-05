/**
 * 项目文件 导出/导入（保存功能）
 * 项目文件 = 纯 JSON：{ app, version, exportedAt, patterns, material }
 * 与 localStorage 自动持久化互补：可下载备份 / 跨浏览器迁移。
 */
import { uid } from './id.js'

const APP_NAME = 'kumiko-design'

/** 由 project store 构建可下载的项目 JSON 字符串 */
export function buildProjectJson(projectStore) {
  return JSON.stringify(
    {
      app: APP_NAME,
      file: uid('proj').slice(0, 14),
      version: projectStore.version,
      exportedAt: new Date().toISOString(),
      patterns: projectStore.patterns,
      material: projectStore.material
    },
    null,
    2
  )
}

/** 触发下载项目文件 */
export function downloadProjectFile(projectStore) {
  const json = buildProjectJson(projectStore)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  a.href = url
  a.download = `kumiko-design-${ts}.kumiko.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return json
}

/**
 * 解析项目 JSON 文本。
 * @returns {{patterns:Array, material:object}} 校验通过的数据；失败抛 Error
 */
export function parseProjectJson(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('文件不是有效的 JSON')
  }
  if (!data || !Array.isArray(data.patterns)) {
    throw new Error('缺少 patterns 数据，不是 kumiko-design 项目文件')
  }
  return { patterns: data.patterns, material: data.material || {} }
}

/** 浏览器打开文件选择器并读取文本 */
export function pickAndReadJsonFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = () => {
      const file = input.files && input.files[0]
      if (!file) return resolve(null)
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('读取文件失败'))
      reader.readAsText(file)
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}
