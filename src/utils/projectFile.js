/**
 * 项目文件 导出/导入（保存功能）
 * 项目文件 = 纯 JSON：{ app, version, exportedAt, patterns, material }
 * 与 localStorage 自动持久化互补：可下载备份 / 跨浏览器迁移。
 */
import { uid } from './id.js'

const APP_NAME = 'kumiko-design'

/**
 * 由 project store（或等价的纯数据对象）构建可下载的项目 JSON 字符串。
 * @param {object} source 含 version/patterns/material/spacingUnit/lineColors
 * @param {object} [opts]
 *   - name?: string 作品名（写入文件，供导入时还原名称）
 *   - file?: string 文件标识（缺省自动生成）
 */
export function buildProjectJson(source, opts = {}) {
  const name = sanitizeFileBase(opts.name)
  const payload = {
    app: APP_NAME,
    file: sanitizeFileBase(opts.file) || uid('proj').slice(0, 14),
    version: source.version,
    exportedAt: new Date().toISOString(),
    patterns: source.patterns,
    groups: source.groups,
    layout: source.layout,
    material: source.material,
    spacingUnit: source.spacingUnit,
    lineColors: source.lineColors
  }
  if (name) payload.name = name
  return JSON.stringify(payload, null, 2)
}

/** 非法文件名字符 → 下划线（跨平台安全），并裁首尾空白/点号 */
export function sanitizeFileBase(name) {
  return String(name ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .trim()
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
}

/**
 * 触发下载项目文件。
 * @param {object} projectStore project store
 * @param {string} [fileName] 用户输入的文件名（不含扩展名）；缺省时用时间戳命名
 */
export function downloadProjectFile(projectStore, fileName) {
  const json = buildProjectJson(projectStore)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const base = sanitizeFileBase(fileName)
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  a.href = url
  a.download = base ? `${base}.kumiko.json` : `kumiko-design-${ts}.kumiko.json`
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
  const spacingUnit = Number(data.spacingUnit)
  const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : undefined
  return {
    patterns: data.patterns,
    // 图案库实例与初始化框架（旧文件缺失 → undefined，replaceAll 时回退默认）
    groups: Array.isArray(data.groups) ? data.groups : undefined,
    layout: data.layout && typeof data.layout === 'object' ? data.layout : undefined,
    material: data.material || {},
    // 旧版本文件缺 spacingUnit/lineColors → undefined，replaceAll 时回退默认
    spacingUnit: Number.isFinite(spacingUnit) && spacingUnit > 0 ? spacingUnit : undefined,
    lineColors:
      data.lineColors && typeof data.lineColors === 'object' ? data.lineColors : undefined,
    name
  }
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsText(file)
  })
}

/** 浏览器打开文件选择器并读取单个文件文本 */
export function pickAndReadJsonFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = () => {
      const file = input.files && input.files[0]
      if (!file) return resolve(null)
      readFileAsText(file).then(resolve, reject)
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}

/**
 * 多选读取项目文件（工作区批量导入）。
 * @returns {Promise<Array<{name:string, text:string}>>} 用户取消返回 []
 */
export function pickAndReadJsonFiles() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = '.json,application/json'
    input.onchange = async () => {
      const files = Array.from(input.files || [])
      if (!files.length) return resolve([])
      try {
        const out = []
        for (const f of files) out.push({ name: f.name, text: await readFileAsText(f) })
        resolve(out)
      } catch (e) {
        reject(e)
      }
    }
    input.oncancel = () => resolve([])
    input.click()
  })
}
