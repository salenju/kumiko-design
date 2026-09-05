/**
 * AI 意图解析 —— Phase 4 预留接口（V2 §8.7）
 *
 * 架构约束：LLM 只做「自然语言 → 结构化参数」，几何一律由本地参数化生成器产出。
 * 本文件先提供**本地关键词映射 + 尺寸解析**的可用实现（无需密钥、可单测），
 * 未来接入真实 LLM 时替换 parseIntent 内部实现（function-calling / JSON mode），
 * 对外契约不变：
 *   parseIntent(text) => { preset: 'asanoha'|'koushi'|'diagonal', params: { size, spacing, width } } | null
 */

import { PRESETS } from '../core/presets/index.js'

const PRESET_ALIASES = [
  { key: 'asanoha', words: ['麻叶', '麻の葉', '麻之叶', '麻葉', 'asanoha', '正三角', '三角纹'] },
  { key: 'koushi', words: ['方格', '格子', '正方', '井字', 'koushi', 'square'] },
  { key: 'diagonal', words: ['斜格', '菱形', '45度', '斜纹', 'diagonal', 'diamond'] }
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
 * 解析自然语言 → 纹样参数。
 * 例：'生成 30cm 麻叶纹' → { preset:'asanoha', params:{ size:300, spacing:20, width:3 } }
 * 例：'做一个 200mm 的方格纹' → { preset:'koushi', params:{ size:200 } }
 * @param {string} text
 */
export function parseIntent(text) {
  if (!text || typeof text !== 'string') return null
  const lower = text.toLowerCase()
  for (const alias of PRESET_ALIASES) {
    const hit = alias.words.some((w) => text.includes(w) || lower.includes(w.toLowerCase()))
    if (hit) {
      const size = parseSize(text)
      // 无尺寸时提供与纹样匹配的默认 spacing
      const base = PRESETS[alias.key]
      const defaults = { asanoha: { spacing: 20 }, koushi: { spacing: 30 }, diagonal: { spacing: 30 } }
      return {
        preset: alias.key,
        params: { size, ...defaults[alias.key], label: base.label }
      }
    }
  }
  return null
}
