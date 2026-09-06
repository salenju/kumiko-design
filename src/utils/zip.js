/**
 * 浏览器端无依赖 ZIP 生成（utils/zip.js）
 *
 * 采用 STORE（不压缩）+ CRC-32，兼容所有现代解压工具（系统自带/7-Zip/WinRAR 等）。
 * 文件名按 UTF-8 写入（ZIP 通用位 bit11=1），中文名可正常解压。
 * 纯函数（可单测）：makeZipBytes 返回 Uint8Array；downloadZip 负责浏览器下载。
 */

const encoder = new TextEncoder()

/* ---------- CRC-32 ---------- */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes) {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/* ---------- 字节写入辅助 ---------- */
class ByteWriter {
  constructor() {
    this.chunks = []
    this.size = 0
  }
  u8(b) {
    this.chunks.push(b)
    this.size += b.length
  }
  u16(v) {
    this.u8(new Uint8Array([v & 0xff, (v >>> 8) & 0xff]))
  }
  u32(v) {
    this.u8(new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]))
  }
}

/** DOS 日期时间（固定 1980-01-01 00:00:00，仅存档用不影响解压） */
const DOS_TIME = 0
const DOS_DATE = 0x21 // 1980-01-01（day=1）

/**
 * 生成 ZIP 二进制（STORE）。
 * @param {Array<{name:string, data:string|Uint8Array}>} files 文件名（可含中文/路径分隔 /）与内容
 * @returns {Uint8Array}
 */
export function makeZipBytes(files) {
  const nameBytes = files.map((f) => encoder.encode(f.name))
  const dataBytes = files.map((f) =>
    typeof f.data === 'string' ? encoder.encode(f.data) : f.data
  )
  const crcs = dataBytes.map((d) => crc32(d))
  const sizes = dataBytes.map((d) => d.length)
  const nameLens = nameBytes.map((n) => n.length)

  const out = new ByteWriter()
  const localOffsets = []
  const FLAG_UTF8 = 0x0800

  // 1) 本地文件头 + 数据
  for (let i = 0; i < files.length; i++) {
    localOffsets.push(out.size)
    out.u32(0x04034b50)
    out.u16(20) // version needed
    out.u16(FLAG_UTF8)
    out.u16(0) // STORE
    out.u16(DOS_TIME)
    out.u16(DOS_DATE)
    out.u32(crcs[i])
    out.u32(sizes[i]) // compressed = uncompressed（STORE）
    out.u32(sizes[i])
    out.u16(nameLens[i])
    out.u16(0) // extra length
    out.u8(nameBytes[i])
    out.u8(dataBytes[i])
  }

  // 2) 中央目录
  const cdStart = out.size
  for (let i = 0; i < files.length; i++) {
    out.u32(0x02014b50)
    out.u16(20) // version made by
    out.u16(20) // version needed
    out.u16(FLAG_UTF8)
    out.u16(0)
    out.u16(DOS_TIME)
    out.u16(DOS_DATE)
    out.u32(crcs[i])
    out.u32(sizes[i])
    out.u32(sizes[i])
    out.u16(nameLens[i])
    out.u16(0) // extra
    out.u16(0) // comment
    out.u16(0) // disk number start
    out.u16(0) // internal attrs
    out.u32(0) // external attrs
    out.u32(localOffsets[i])
    out.u8(nameBytes[i])
  }
  const cdSize = out.size - cdStart

  // 3) EOCD
  out.u32(0x06054b50)
  out.u16(0)
  out.u16(0)
  out.u16(files.length)
  out.u16(files.length)
  out.u32(cdSize)
  out.u32(cdStart)
  out.u16(0)

  const total = new Uint8Array(out.size)
  let pos = 0
  for (const c of out.chunks) {
    total.set(c, pos)
    pos += c.length
  }
  return total
}

/** 浏览器下载 ZIP */
export function downloadZip(files, filename) {
  const bytes = makeZipBytes(files)
  const blob = new Blob([bytes], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.zip') ? filename : `${filename}.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
