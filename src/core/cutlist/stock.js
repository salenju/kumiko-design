/**
 * 1D 下料 / 切割清单（core/cutlist/stock.js）——V2 Phase 3
 *
 * 组子算料语义：把各段木条（已含/不含端部余量）按「市售标准条长」做一维下料分组，
 * 最小化余料，输出 cut list。不是 2D 板面排样。
 *
 * 算法：Best-Fit Decreasing（确定性贪心，可单测）：
 *   - 段按长度降序；
 *   - 每段放入「剩余空间最小且放得下」的已有料，否则开新料；
 *   - kerf：每切一刀损耗 kerf mm（每段一割的保守近似）。
 */

/** 四舍五入到 0.1mm（与需求精度一致） */
export function round1(x) {
  return Math.round(x * 10) / 10
}

/**
 * 按木条宽度分组做 1D 下料（属性面板「算料」与「导出施工」共用，保证口径一致）。
 * @param {Array} segments 派生线段
 * @param {object} material { stockLength, kerf, endAllowance }
 * @returns {Array<{width:number, items:Array<{width,length,qty}>, plan:object}>} 按宽度升序
 */
export function planCutGroups(segments, material = {}) {
  const { stockLength, kerf } = material
  const byWidth = new Map()
  for (const it of aggregateCutItems(segments)) {
    if (!byWidth.has(it.width)) byWidth.set(it.width, [])
    byWidth.get(it.width).push(it)
  }
  const groups = []
  for (const [width, list] of byWidth) {
    const plan = planStock(list, { stockLength, kerf })
    groups.push({ width, items: list, plan })
  }
  groups.sort((a, b) => a.width - b.width)
  return groups
}

/**
 * 由派生 segments 汇总切割需求。
 * 按 width 分组，同组内按长度（0.1mm）合并计数。
 * @returns {Array<{width:number,length:number,qty:number}>}
 */
export function aggregateCutItems(segments) {
  const byWidth = new Map()
  for (const s of segments || []) {
    const key = round1(s.width)
    if (!byWidth.has(key)) byWidth.set(key, new Map())
    const byLen = byWidth.get(key)
    const len = round1(s.length)
    byLen.set(len, (byLen.get(len) || 0) + 1)
  }
  const out = []
  for (const [width, byLen] of byWidth) {
    for (const [length, qty] of byLen) {
      out.push({ width, length, qty })
    }
  }
  out.sort((a, b) => a.width - b.width || a.length - b.length)
  return out
}

/**
 * 对一组同宽度需求做 1D 下料。
 * @param {Array<{length:number,qty:number}>} items 需求（含数量）
 * @param {object} opts { stockLength, kerf=0 }
 * @returns {{
 *   stocks: Array<{index:number, used:number, remaining:number, cuts:Array<{length:number,qty:number}>}>,
 *   count:number, totalLength:number, totalUsed:number, totalWaste:number, utilization:number
 * }}
 */
export function planStock(items, { stockLength, kerf = 0 } = {}) {
  if (!stockLength || stockLength <= 0) {
    throw new Error('planStock: stockLength 必须为正数')
  }
  const pieces = []
  for (const it of items || []) {
    if (!it || it.qty <= 0 || it.length <= 0) continue
    for (let q = 0; q < it.qty; q++) pieces.push(round1(it.length))
  }
  pieces.sort((a, b) => b - a) // 降序

  const bins = [] // { remaining, used, cuts: Map<length, qty> }
  const pushBin = () => bins.push({ remaining: stockLength, used: 0, cuts: new Map() })

  for (const len of pieces) {
    // 该段实际占用 = 长度 + 一刀 kerf
    const occupy = len + kerf
    let best = -1
    let bestRemain = Infinity
    for (let i = 0; i < bins.length; i++) {
      if (bins[i].remaining >= occupy && bins[i].remaining < bestRemain) {
        best = i
        bestRemain = bins[i].remaining
      }
    }
    if (best === -1) {
      pushBin()
      best = bins.length - 1
    }
    const bin = bins[best]
    bin.remaining -= occupy
    bin.used += len
    bin.cuts.set(len, (bin.cuts.get(len) || 0) + 1)
  }

  const stocks = bins.map((b, i) => ({
    index: i + 1,
    used: round1(b.used),
    remaining: round1(b.remaining),
    cuts: [...b.cuts.entries()]
      .sort((a, c) => a[0] - c[0])
      .map(([length, qty]) => ({ length, qty }))
  }))

  const totalLength = round1(pieces.reduce((s, l) => s + l, 0))
  const totalUsed = round1(stocks.reduce((s, st) => s + st.used, 0))
  const totalWaste = round1(stocks.reduce((s, st) => s + st.remaining, 0))
  const totalCapacity = round1(stocks.length * stockLength)
  return {
    stocks,
    count: stocks.length,
    totalLength,
    totalUsed,
    totalWaste,
    totalCapacity,
    utilization: totalCapacity > 0 ? round1(totalUsed / totalCapacity) : 0
  }
}
