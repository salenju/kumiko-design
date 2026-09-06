/**
 * 平台检测与快捷键文案（快捷键需区分 macOS / Windows / Linux）
 */

/** 是否 macOS */
export function isMac() {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '')
}

/** 主修饰键：mac 显示 ⌘，其余显示 Ctrl */
export function modKey() {
  return isMac() ? '⌘' : 'Ctrl'
}

/** 替代修饰键：mac 用 Alt，Win 用 Ctrl+Alt（行业惯例不同工具实现不同，这里取常见） */
export function altKey() {
  return isMac() ? '⌥' : 'Alt'
}

/** 组合成可读快捷键文本：'mod+shift+z' → '⌘⇧Z' / 'Ctrl+Shift+Z' */
export function formatShortcut(parts) {
  const map = {
    mod: modKey(),
    alt: altKey(),
    shift: isMac() ? '⇧' : 'Shift',
    ctrl: isMac() ? '⌃' : 'Ctrl'
  }
  const tokens = []
  for (const p of parts) {
    if (p === 'mod') tokens.push(modKey())
    else if (map[p]) tokens.push(map[p])
    else tokens.push(p.length === 1 ? p.toUpperCase() : p)
  }
  return tokens.join(isMac() ? '' : '+')
}
