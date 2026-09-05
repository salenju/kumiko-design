/** 轻量唯一 id 生成（前缀 + 时间戳 + 随机） */
let counter = 0
export function uid(prefix = 'id') {
  counter = (counter + 1) % 100000
  const rand = Math.random().toString(36).slice(2, 6)
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}${rand}`
}
