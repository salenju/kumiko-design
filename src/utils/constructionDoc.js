/**
 * 施工资料组装（utils/constructionDoc.js）
 *
 * 为「导出施工」把四类信息打包成 zip 内的文件：
 *   <名>.json              —— 项目文件（与压缩包同名，可再导入）
 *   <名>-设计图.svg        —— 真实 mm 矢量设计图
 *   <名>-施工单.html       —— 材料参数 + 算料明细 + 图案部件 + 内嵌设计图（可打印/另存 PDF）
 *   <名>-算料.csv          —— 每根标准料的装载切割明细（机器可读）
 *   <名>-图案部件.csv      —— 同型部件分组明细（机器可读）
 *
 * 数据口径与对应抽屉一致：算料 = core/cutlist/planCutGroups，
 * 图案部件 = core/parts/analyzeParts。
 */

import { planCutGroups } from '../core/cutlist/index.js'
import { analyzeParts } from '../core/parts/index.js'
import { buildProjectJson } from './projectFile.js'

/** 显示数值：去尾 0（123.5 → 123.5、123.0 → 123） */
export function fmtNum(v) {
  const r = Math.round(Number(v) * 10) / 10
  return String(Number.isInteger(r) ? r : r)
}

/** HTML 转义 */
function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** CSV 单元格（含逗号/引号/换行时加引号） */
export function csvCell(v) {
  const s = String(v ?? '')
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** 算料汇总（与算料抽屉一致） */
export function cutSummary(groups) {
  let stockCount = 0
  let totalUsed = 0
  let totalLength = 0
  let totalCap = 0
  for (const g of groups) {
    stockCount += g.plan.count
    totalUsed += g.plan.totalUsed
    totalLength += g.plan.totalLength
    totalCap += g.plan.totalCapacity
  }
  return {
    groups: groups.length,
    stockCount,
    totalUsed,
    totalLength,
    totalCap,
    utilization: totalCap > 0 ? Math.round((totalUsed / totalCap) * 1000) / 10 : 0
  }
}

/* ---------------- 施工单 HTML ---------------- */

function materialRowsHtml(material, spacingUnit, totalSegLen) {
  return [
    ['标准条长', `${fmtNum(material.stockLength)} mm`],
    ['锯缝 kerf', `${fmtNum(material.kerf)} mm`],
    ['端部余量（每端）', `${fmtNum(material.endAllowance)} mm`],
    ['全局间距单位', `${fmtNum(spacingUnit)} mm`],
    ['木条总长（各段净长合计）', `${fmtNum(totalSegLen)} mm`]
  ]
    .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`)
    .join('')
}

function cutGroupsHtml(groups) {
  const sum = cutSummary(groups)
  const head = `<p class="s-sum">算料共 <b>${sum.groups}</b> 个宽度分组，需 <b>${sum.stockCount}</b> 根标准条；净长合计 ${fmtNum(sum.totalLength)} mm，综合利用率 <b>${sum.utilization}%</b>。</p>`
  const body = groups
    .map((g) => {
      const segCount = g.items.reduce((s, i) => s + i.qty, 0)
      const sub = `木条宽 ${fmtNum(g.width)} mm：段数 ${segCount} · 净长 ${fmtNum(g.plan.totalLength)} mm · 需 ${g.plan.count} 根 · 利用率 ${Math.round(g.plan.utilization * 1000) / 10}%`
      const rows = g.plan.stocks
        .map(
          (st) =>
            `<tr><td>${st.index}</td><td>${st.cuts
              .map((c) => `${fmtNum(c.length)}×${c.qty}`)
              .join('、')}</td><td>${fmtNum(st.used)}</td><td>${fmtNum(st.remaining)}</td></tr>`
        )
        .join('')
      return `<h4>${esc(sub)}</h4>
<table><thead><tr><th>#</th><th>装载切割（长度×数量）</th><th>使用 mm</th><th>余料 mm</th></tr></thead><tbody>${rows}</tbody></table>`
    })
    .join('')
  return { head, body }
}

function partsGroupsHtml(groups, unit) {
  const pieces = groups.reduce((s, g) => s + g.pieces, 0)
  const notches = groups.reduce((s, g) => s + g.pieces * g.notchCount, 0)
  const head = `<p class="s-sum">共 <b>${groups.length}</b> 组同型部件 · <b>${pieces}</b> 根本条 · 合计 <b>${notches}</b> 个插口（间距缩写 = 相邻插口中心距 ÷ ${fmtNum(unit)}mm 取整 x）</p>`
  const rows = groups
    .map(
      (g, i) =>
        `<tr><td>${i + 1}</td><td>${fmtNum(g.length)} × ${fmtNum(g.width)}</td><td>${
          g.code ? `<code>${esc(g.code)}</code>` : '—'
        }</td><td>${g.pieces}</td><td>${g.notchCount}</td></tr>`
    )
    .join('')
  return {
    head,
    body: `<table><thead><tr><th>#</th><th>尺寸（长 × 宽）mm</th><th>间距缩写</th><th>数量 piece</th><th>插口数</th></tr></thead><tbody>${rows}</tbody></table>`
  }
}

/**
 * 构建施工单 HTML。
 * @param {object} data { material, spacingUnit, segments }
 * @param {Array} cutGroups planCutGroups 输出
 * @param {Array} partsGroups analyzeParts 输出
 * @param {string} svgString 设计图 SVG
 * @param {object} [opts] { baseName, generatedAt }
 */
export function buildReportHtml(data, cutGroups, partsGroups, svgString, opts = {}) {
  const { material, spacingUnit, segments } = data
  const totalSegLen = (segments || []).reduce((s, x) => s + x.length, 0)
  const cut = cutGroupsHtml(cutGroups)
  const parts = partsGroupsHtml(partsGroups, spacingUnit)
  const generatedAt =
    opts.generatedAt ?? new Date().toLocaleString('zh-CN', { hour12: false })
  const base = opts.baseName || 'kumiko-design'

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${esc(base)} · 施工单</title>
<style>
  body { font-family: "PingFang SC","Microsoft YaHei",system-ui,sans-serif; color:#222; margin:24px; }
  h1 { font-size:20px; }
  h3 { margin:22px 0 6px; border-left:4px solid #18a058; padding-left:8px; }
  h4 { margin:12px 0 4px; font-size:13px; color:#444; }
  .meta { color:#777; font-size:12px; margin-bottom:18px; }
  table { border-collapse:collapse; font-size:13px; margin:4px 0 8px; }
  th,td { border:1px solid #ccc; padding:4px 10px; text-align:left; }
  th { background:#f2f2ee; font-weight:600; }
  .s-sum { font-size:13px; color:#1f4e9c; }
  code { background:#eef0f5; border-radius:4px; padding:0 5px; }
  .fig { border:1px solid #ccc; padding:10px; background:#fff; margin:8px 0 14px; }
  .fig svg { width:100%; height:auto; }
  @media print { body { margin:12mm; } .no-print { display:none; } }
</style>
</head>
<body>
<h1>${esc(base)} · 施工单</h1>
<p class="meta">生成时间：${esc(generatedAt)}｜坐标单位 mm｜导出文件：${esc(base)}.json（同包可再导入）</p>

<h3>一、设计图</h3>
<div class="fig">${svgString}</div>

<h3>二、材料参数</h3>
<table><tbody>${materialRowsHtml(material, spacingUnit, totalSegLen)}</tbody></table>

<h3>三、算料 · 1D 切割清单</h3>
${cut.head}
${cut.body}

<h3>四、图案部件 · 同型整根本条统计</h3>
${parts.head}
${parts.body}

<p class="meta no-print" style="margin-top:20px">本施工单由「组子细工绘图助手」导出。设计图另有独立 SVG 文件；算料/部件另有 CSV 便于二次加工。</p>
</body>
</html>
`
}

/* ---------------- CSV ---------------- */

/** 算料 CSV：每行一根标准条（含所属宽度组信息），便于表格/程序读取 */
export function buildCutlistCsv(cutGroups) {
  const lines = []
  lines.push(['木条宽(mm)', '需根数', '组净长(mm)', '组利用率(%)', '标准条#', '装载切割(长度×数量)', '使用(mm)', '余料(mm)'].join(','))
  for (const g of cutGroups) {
    const segCount = g.items.reduce((s, i) => s + i.qty, 0)
    const util = Math.round(g.plan.utilization * 1000) / 10
    for (const st of g.plan.stocks) {
      lines.push(
        [
          g.width,
          segCount,
          g.plan.totalLength,
          util,
          st.index,
          st.cuts.map((c) => `${fmtNum(c.length)}x${c.qty}`).join(' '),
          st.used,
          st.remaining
        ]
          .map((v) => csvCell(v))
          .join(',')
      )
    }
  }
  // Excel 中文兼容：UTF-8 BOM
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

/** 图案部件 CSV：每行一个同型部件组 */
export function buildPartsCsv(partsGroups) {
  const lines = ['长(mm),宽(mm),间距缩写,数量(piece),插口数']
  for (const g of partsGroups) {
    lines.push([g.length, g.width, g.code, g.pieces, g.notchCount].map((v) => csvCell(v)).join(','))
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

/* ---------------- 组装 zip 内容 ---------------- */

/**
 * 组装「导出施工」zip 内全部文件。
 * @param {object} data { version, patterns, material, spacingUnit, segments }
 * @param {string} svgString 设计图 SVG 字符串
 * @param {string} baseName 压缩包/项目文件基名（不含扩展名）
 * @param {object} [opts] { generatedAt }
 * @returns {Array<{name:string,data:string}>}
 */
export function buildConstructionEntries(data, svgString, baseName, opts = {}) {
  const base = baseName || 'kumiko-design'
  const cutGroups = planCutGroups(data.segments, data.material)
  const partsGroups = analyzeParts(data.patterns, data.spacingUnit ?? 10)
  return [
    { name: `${base}.json`, data: buildProjectJson(data) },
    { name: `${base}-设计图.svg`, data: svgString },
    { name: `${base}-施工单.html`, data: buildReportHtml(data, cutGroups, partsGroups, svgString, { ...opts, baseName: base }) },
    { name: `${base}-算料.csv`, data: buildCutlistCsv(cutGroups) },
    { name: `${base}-图案部件.csv`, data: buildPartsCsv(partsGroups) }
  ]
}
