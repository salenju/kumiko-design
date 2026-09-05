/**
 * 参数化纹样预设（core/presets/index.js）
 * 用途：Phase 4 本地生成器 —— AI 只输出 {preset, params}，几何由此处确定性生成。
 *
 * 设计：预设 = 若干平行线族的组合（bounds 均为以 (cx,cy) 为中心、边长 size 的正方形）。
 * 新增预设只需实现一个 (params) => patterns[] 的纯函数并注册到 PRESETS。
 */

import { coverFamily } from '../patterns/family.js'
import { uid } from '../../utils/id.js'

/**
 * 用 coverFamily 构造一族恰好覆盖 bounds 的平行线。
 */
function makeFamily({ angle, spacing, width, bounds, prefix }) {
  const { ref, count } = coverFamily(angle, spacing, bounds)
  return {
    id: `${prefix}-${angle}`,
    kind: 'family',
    ref,
    angle,
    spacing,
    count,
    width,
    bounds: { ...bounds }
  }
}

function squareBounds(cx, cy, size) {
  return { x: cx - size / 2, y: cy - size / 2, w: size, h: size }
}

/**
 * 麻叶纹（麻の葉 / asanoha）：三组互成 60° 的平行线族，正三角网格。
 * 参数：{ cx, cy, size, spacing, width }
 */
export function asanoha({ cx = 0, cy = 0, size = 300, spacing = 20, width = 4 } = {}) {
  const bounds = squareBounds(cx, cy, size)
  const prefix = uid('as')
  return [0, 60, 120].map((angle) =>
    makeFamily({ angle, spacing, width, bounds, prefix })
  )
}

/**
 * 方格纹（格子 / koushi）：正交两组平行线族（0° 与 90°）。
 */
export function koushi({ cx = 0, cy = 0, size = 300, spacing = 30, width = 4 } = {}) {
  const bounds = squareBounds(cx, cy, size)
  const prefix = uid('ko')
  return [0, 90].map((angle) =>
    makeFamily({ angle, spacing, width, bounds, prefix })
  )
}

/**
 * 斜格纹（斜交两族 / 45° 菱形网格）。
 */
export function diagonal({ cx = 0, cy = 0, size = 300, spacing = 30, width = 4 } = {}) {
  const bounds = squareBounds(cx, cy, size)
  const prefix = uid('dg')
  return [45, 135].map((angle) =>
    makeFamily({ angle, spacing, width, bounds, prefix })
  )
}

/** 预设注册表：名称 → 生成函数 */
export const PRESETS = {
  asanoha: { label: '麻叶纹（三组 60°）', generate: asanoha },
  koushi: { label: '方格纹（正交两族）', generate: koushi },
  diagonal: { label: '斜格纹（45° 菱形）', generate: diagonal }
}

/**
 * 按名称与参数生成纹样 patterns[]。
 * @param {string} name PRESETS 键名
 * @returns {Array} patterns 数组；未知名称返回 []
 */
export function generatePatterns(name, params = {}) {
  const preset = PRESETS[name]
  if (!preset) return []
  return preset.generate(params)
}
