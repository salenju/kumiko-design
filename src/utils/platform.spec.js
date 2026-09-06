import { describe, it, expect, afterEach } from 'vitest'
import { formatShortcut, modKey, isMac } from './platform.js'

function withPlatform(value, fn) {
  const desc = Object.getOwnPropertyDescriptor(navigator, 'platform')
  try {
    Object.defineProperty(navigator, 'platform', {
      value,
      configurable: true,
      enumerable: true
    })
    fn()
  } finally {
    if (desc) Object.defineProperty(navigator, 'platform', desc)
    else delete navigator.platform
  }
}

afterEach(() => {})

describe('utils/platform 快捷键文案（平台区分）', () => {
  it('Windows/Linux：Ctrl 文案', () => {
    withPlatform('Win32', () => {
      expect(isMac()).toBe(false)
      expect(modKey()).toBe('Ctrl')
      expect(formatShortcut(['mod', 's'])).toBe('Ctrl+S')
      expect(formatShortcut(['mod', 'shift', 'z'])).toBe('Ctrl+Shift+Z')
      expect(formatShortcut(['mod', '0'])).toBe('Ctrl+0')
      expect(formatShortcut(['alt', 'x'])).toBe('Alt+X')
    })
  })

  it('macOS：⌘/⇧ 文案', () => {
    withPlatform('MacIntel', () => {
      expect(isMac()).toBe(true)
      expect(modKey()).toBe('⌘')
      expect(formatShortcut(['mod', 's'])).toBe('⌘S')
      expect(formatShortcut(['mod', 'shift', 'z'])).toBe('⌘⇧Z')
      expect(formatShortcut(['mod', 'd'])).toBe('⌘D')
    })
  })

  it('iOS 也按 mac 风格', () => {
    withPlatform('iPhone', () => {
      expect(isMac()).toBe(true)
    })
  })
})
