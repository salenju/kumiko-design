import { describe, it, expect } from 'vitest'
import { makeZipBytes, crc32 } from './zip.js'

const decoder = new TextDecoder()

/** 最小 ZIP 读取器（仅供测试）：解析 EOCD + 中央目录 + 本地头 */
function listZipEntries(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const u16 = (o) => dv.getUint16(o, true)
  const u32 = (o) => dv.getUint32(o, true)

  // 找 EOCD（0x06054b50），从末尾倒找
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (u32(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  expect(eocd).toBeGreaterThan(-1)
  const count = u16(eocd + 10)
  const cdOffset = u32(eocd + 16)

  const entries = []
  let off = cdOffset
  for (let k = 0; k < count; k++) {
    expect(u32(off)).toBe(0x02014b50) // central header
    const nameLen = u16(off + 28)
    const extraLen = u16(off + 30)
    const commentLen = u16(off + 32)
    const localOffset = u32(off + 42)
    const name = decoder.decode(bytes.subarray(off + 46, off + 46 + nameLen))

    // 本地头
    expect(u32(localOffset)).toBe(0x04034b50)
    const lNameLen = u16(localOffset + 26)
    const lExtraLen = u16(localOffset + 28)
    const size = u32(localOffset + 22)
    const dataStart = localOffset + 30 + lNameLen + lExtraLen
    entries.push({ name, data: bytes.slice(dataStart, dataStart + size) })

    off += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

describe('utils/zip 无依赖 ZIP(STORED)', () => {
  it('crc32：与已知值一致（"123456789" = 0xCBF43926）', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('makeZipBytes：生成可解析 zip，内容/名称/CRC 与源一致（含中文名）', () => {
    const files = [
      { name: '麻叶纹300.json', data: '{"a":1}\n' },
      { name: '麻叶纹300-施工单.html', data: '<html>施工</html>' },
      { name: 'readme.txt', data: 'hello world' }
    ]
    const bytes = makeZipBytes(files)
    // 文件头标记 P K
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)

    const entries = listZipEntries(bytes)
    expect(entries.map((e) => e.name)).toEqual(files.map((f) => f.name))
    for (let i = 0; i < files.length; i++) {
      const enc = new TextEncoder().encode(files[i].data)
      expect(crc32(entries[i].data)).toBe(crc32(enc))
      expect(entries[i].data).toEqual(enc)
    }
  })

  it('空文件集也可生成合法 zip（仅 EOCD）', () => {
    const bytes = makeZipBytes([])
    const entries = listZipEntries(bytes)
    expect(entries).toHaveLength(0)
  })
})
