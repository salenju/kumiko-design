/**
 * AI 意图解析 —— Phase 4 预留接口（V2 §8.7）
 *
 * 架构约束：LLM 只做「自然语言 → 结构化参数」，几何一律由本地**图案库**产出。
 * 本文件先提供**本地关键词映射 + 尺寸解析**的可用实现（无需密钥、可单测），
 * 未来接入真实 LLM 时替换 parseIntent 内部实现（function-calling / JSON mode），
 * 对外契约不变：
 *   parseIntent(text) => { moduleId, name, params: { size, spacing } } | null
 *
 * 关键词与图案一一对应 `core/library/catalog.js` 的内置模块（新增图案只需在此加一行）。
 */

import { builtinModule } from '../core/library/index.js'

const MODULE_ALIASES = [
  { id: 'mod-asanoha', words: ['麻叶', '麻の葉', '麻之叶', '麻葉', 'asanoha', '正三角', '三角纹'] },
  { id: 'mod-koushi', words: ['方格', '格子', '正方', '井字', 'koushi', 'square'] },
  { id: 'mod-diagonal', words: ['斜格', '菱形', '45度', '斜纹', 'diagonal', 'diamond'] },
  { id: 'mod-kikkou', words: ['龟甲', '亀甲', '六角', '蜂窝', 'kikkou', 'hexagon', 'honeycomb'] },
  { id: 'mod-handinhand', words: ['手牵手', '牵手', '手拉手', 'handinhand', 'hand in hand'] },
  { id: 'mod-squaredance', words: ['广场舞', '方阵舞', '方阵', 'squaredance', 'square dance'] }
]

/** 提取文本中「尺寸」：默认 mm，支持 cm（×10）；取第一个出现的数值 */
function parseSize(text) {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(cm|mm|厘米|毫米)?/)
  if (!m) return 300
  let v = parseFloat(m[1])
  const unit = m[2]
  if (unit === 'cm' || unit === '厘米') v *= 10
  return v
}

/**
 * 解析自然语言 → 图案模块参数。
 * 例：'生成 30cm 麻叶纹' → { moduleId:'mod-asanoha', name:'麻叶', params:{ size:300, spacing:20 } }
 * 例：'做一个 200mm 的方格纹' → { moduleId:'mod-koushi', name:'井字（方格）', params:{ size:200, spacing:30 } }
 * @param {string} text
 * @returns {{moduleId:string,name:string,params:{size:number,spacing:number}}|null}
 */
export function parseIntent(text) {
  if (!text || typeof text !== 'string') return null
  const lower = text.toLowerCase()
  for (const alias of MODULE_ALIASES) {
    const hit = alias.words.some((w) => text.includes(w) || lower.includes(w.toLowerCase()))
    if (!hit) continue
    const module = builtinModule(alias.id)
    if (!module) continue
    return {
      moduleId: module.id,
      name: module.name,
      params: { size: parseSize(text), spacing: module.defaults.spacing }
    }
  }
  return null
}

/** 可识别的图案名列表（供 UI 提示 / 文案使用） */
export function intentKeywords() {
  return MODULE_ALIASES.map((a) => builtinModule(a.id)).filter(Boolean).map((m) => m.name)
}
