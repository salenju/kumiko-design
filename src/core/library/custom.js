/**
 * 自定义图案模块（core/library/custom.js）
 *
 * 「存为图案」：把画布上选中的图案归一化为一个可复用的模块定义：
 *  - 线族（family）→ 记录 angle 与 ratio = spacing / 基准间距（基准 = 最小间距），
 *    插入时按目标矩形的 spacing 重新铺满；
 *  - 单线（line）/ 段集（segs）→ 归一化到 [0,1]²，插入时按目标矩形缩放；
 *  - 记录选区外接矩形尺寸作为模块默认 size。
 *
 * 持久化：localStorage 单 key，跨作品可用（不随项目文件走）。
 */

import { uid } from '../../utils/id.js'
import { MODULE_PARAM_SCHEMA } from './catalog.js'

export const CUSTOM_STORE_KEY = 'kumiko:pattern-library:v1'

/** 选区内容的外接矩形（考虑 family 的 bounds、line 的端点、segs 的段） */
export function patternsExtent(patterns) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let has = false
  const grow = (x, y) => {
    has = true
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  for (const p of patterns || []) {
    if (!p) continue
    if (p.kind === 'line') {
      grow(p.x1, p.y1)
      grow(p.x2, p.y2)
    } else if (p.kind === 'segs' && Array.isArray(p.segments)) {
      for (const s of p.segments) {
        grow(s.x1, s.y1)
        grow(s.x2, s.y2)
      }
    } else if (p.bounds && p.bounds.w > 0 && p.bounds.h > 0) {
      grow(p.bounds.x, p.bounds.y)
      grow(p.bounds.x + p.bounds.w, p.bounds.y + p.bounds.h)
    }
  }
  if (!has) return null
  return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) }
}

function normSeg(x1, y1, x2, y2, bounds) {
  return {
    x1: (x1 - bounds.x) / bounds.w,
    y1: (y1 - bounds.y) / bounds.h,
    x2: (x2 - bounds.x) / bounds.w,
    y2: (y2 - bounds.y) / bounds.h
  }
}

/**
 * 选区 → 自定义模块定义（纯数据，可 JSON 序列化）。
 * @returns {object|null} 无有效内容时返回 null
 */
export function moduleFromPatterns(patterns, { name, category = 'custom' } = {}) {
  const list = (patterns || []).filter(Boolean)
  const bounds = patternsExtent(list)
  if (!bounds) return null

  const fams = list.filter((p) => p && p.kind === 'family')
  const spacings = fams.map((p) => Number(p.spacing)).filter((v) => Number.isFinite(v) && v > 0)
  const baseSpacing = spacings.length ? Math.min(...spacings) : 20

  const families = fams.map((p) => ({
    angle: Number.isFinite(Number(p.angle)) ? Number(p.angle) : 0,
    ratio: Math.max(0.01, (Number(p.spacing) || baseSpacing) / baseSpacing),
    width: Number.isFinite(Number(p.width)) ? Number(p.width) : undefined
  }))

  const segs = []
  for (const p of list) {
    if (p.kind === 'line') {
      segs.push(normSeg(p.x1, p.y1, p.x2, p.y2, bounds))
    } else if (p.kind === 'segs' && Array.isArray(p.segments)) {
      for (const s of p.segments) segs.push(normSeg(s.x1, s.y1, s.x2, s.y2, bounds))
    }
  }

  const widths = list.map((p) => Number(p.width)).filter((v) => Number.isFinite(v) && v > 0)

  return {
    id: uid('mod'),
    name: String(name || '我的图案').trim().slice(0, 40) || '我的图案',
    category,
    custom: true,
    desc: `自定义图案（${families.length} 组线族 / ${segs.length} 段）`,
    express: 'custom',
    defaults: {
      size: Math.round(Math.max(bounds.w, bounds.h)),
      spacing: Math.round(baseSpacing),
      width: widths.length ? Math.min(...widths) : 4,
      endCut: 90
    },
    schema: MODULE_PARAM_SCHEMA,
    families,
    segs: segs.length ? segs : undefined
  }
}

/** 读取自定义模块（自动补 schema / custom 标记；损坏数据安全跳过） */
export function loadCustomModules() {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(CUSTOM_STORE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data
      .filter((m) => m && typeof m.id === 'string' && (Array.isArray(m.families) || Array.isArray(m.segs)))
      .map((m) => ({ ...m, custom: true, category: m.category || 'custom', schema: MODULE_PARAM_SCHEMA }))
  } catch {
    return []
  }
}

/** 写入自定义模块（失败静默，UI 侧另行提示） */
export function saveCustomModules(list) {
  try {
    if (typeof localStorage === 'undefined') return false
    const slim = (list || []).map((m) => {
      const { schema, ...rest } = m
      return rest
    })
    localStorage.setItem(CUSTOM_STORE_KEY, JSON.stringify(slim))
    return true
  } catch {
    return false
  }
}
