/**
 * 线条角度配色（core/colors.js）
 *
 * 组子木条按【实际方向角度】取色（线族与单线一视同仁，方向取模 180° 同向）：
 *   - 方向角度归一化到 [0,180)（同一条线的两个朝向视为同向）；
 *   - 命中表里同角度条目 → 用其颜色；未命中 → fallback 底色。
 * 角度可自定义（含小数，如 22.5°）；条目按 0.1° 精度匹配。
 */

export const FALLBACK_COLOR = '#222222'

/** 默认悬停高亮色（鼠标移到线段上时的描边环） */
export const HOVER_COLOR = '#d64541'
/** 默认选中高亮色（选中族的描边环） */
export const SELECTED_COLOR = '#1f4e9c'

/** 方向角度归一化到 [0,180)（度） */
export function normalizeDirDeg(deg) {
  const a = ((Number(deg) || 0) % 360 + 360) % 360
  return a >= 180 ? a - 180 : a
}

/** 0.1° 精度匹配键 */
export function angleKey(deg) {
  return Math.round(normalizeDirDeg(deg) * 10) / 10
}

/** 线段方向角（有向 0..360，由几何自动归一） */
export function segmentDirDeg(seg) {
  return (Math.atan2(seg.y2 - seg.y1, seg.x2 - seg.x1) * 180) / Math.PI
}

/** 默认配色方案：组子常用角度 + 区分度高的初始颜色 */
export function defaultColorScheme() {
  return {
    fallback: FALLBACK_COLOR,
    hoverColor: HOVER_COLOR,
    selectedColor: SELECTED_COLOR,
    angles: [
      { angle: 0, color: '#4e79a7' }, // 横
      { angle: 30, color: '#f28e2b' },
      { angle: 45, color: '#59a14f' }, // 斜 45
      { angle: 60, color: '#e15759' },
      { angle: 90, color: '#b07aa1' }, // 竖
      { angle: 120, color: '#76b7b2' },
      { angle: 135, color: '#edc948' },
      { angle: 150, color: '#9c755f' }
    ]
  }
}

function isColorLike(v) {
  return typeof v === 'string' && v.length > 0
}

/** 规整化方案：兜底/高亮色合法 + 角度条目去重（0.1°）并按角度升序 */
export function normalizeScheme(scheme) {
  const s = scheme && typeof scheme === 'object' ? scheme : {}
  const fallback = isColorLike(s.fallback) ? s.fallback : FALLBACK_COLOR
  const hoverColor = isColorLike(s.hoverColor) ? s.hoverColor : HOVER_COLOR
  const selectedColor = isColorLike(s.selectedColor) ? s.selectedColor : SELECTED_COLOR
  const map = new Map()
  for (const e of Array.isArray(s.angles) ? s.angles : []) {
    if (!e || !Number.isFinite(e.angle) || !isColorLike(e.color)) continue
    map.set(angleKey(e.angle), e.color)
  }
  const angles = [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([angle, color]) => ({ angle, color }))
  return { fallback, hoverColor, selectedColor, angles }
}

/** 某角度取色（未命中 → fallback） */
export function colorForAngle(scheme, deg) {
  const s = normalizeScheme(scheme)
  const k = angleKey(deg)
  const hit = s.angles.find((e) => e.angle === k)
  return hit ? hit.color : s.fallback
}

/** 某线段取色（按其方向角） */
export function colorForSeg(scheme, seg) {
  return colorForAngle(scheme, segmentDirDeg(seg))
}
