/**
 * SVG 导出（V2 §5.1 ④）
 * 坐标单位为 mm（1 unit = 1mm），可直接供激光切割/CNC/矢量软件使用。
 * buildSvgString 为纯函数（可单测），downloadSvg 依赖浏览器。
 */
import { segmentsBounds } from '../core/patterns/index.js'

/**
 * 由派生线段构建 SVG 字符串。
 * @param {Array} segments
 * @param {object} [opts] { padding=10(mm), strokeScale=1, includeBounds }
 * @returns {string} SVG XML
 */
export function buildSvgString(segments, opts = {}) {
  const padding = opts.padding ?? 10
  const bounds = segmentsBounds(segments)
  if (!bounds) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"></svg>`
  }
  const x = bounds.x - padding
  const y = bounds.y - padding
  const w = bounds.w + padding * 2
  const h = bounds.h + padding * 2
  const lines = (segments || [])
    .map((s) => {
      const strokeWidth = Math.max(0.05, s.width || 1)
      return `  <line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="#000" stroke-width="${strokeWidth}" />`
    })
    .join('\n')
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="${x} ${y} ${w} ${h}">`,
    lines,
    '</svg>'
  ].join('\n')
}

/** 浏览器下载（Blob） */
export function downloadSvg(svgString, filename = 'kumiko.svg') {
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
