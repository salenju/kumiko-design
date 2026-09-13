/**
 * 图案库目录（core/library/catalog.js）
 *
 * 图案模块（PatternModule）是「一种图案」的参数化定义，字段：
 *   { id, name, category, desc, express, defaults, schema, families?, segsStrategy?, segs? }
 *
 *   express: 'family' 纯平行线族组合
 *            'segs'   需要显式线段的图案（如龟甲的正六边形网格）
 *            'custom' 用户「存为图案」所得（families + 归一化 segs 混合）
 *   families: [{ angle, ratio, width? }]，实际间距 = params.spacing × ratio
 *   segsStrategy: 'kikkou' 等内置线段生成策略（见 build.js）
 *   segs: 归一化到 [0,1]² 的线段数组（自定义模块用，插入时按目标矩形缩放）
 *
 * 新增图案 = 在 BUILTIN_MODULES 里加一条配置，无需改动引擎。
 */

import { DEFAULT_END_CUT } from './endCut.js'

/** 图案库一级分类 */
export const CATEGORIES = [
  { key: 'basic', name: '基础网格' },
  { key: 'flower', name: '花叶纹样' },
  { key: 'geo', name: '几何纹样' },
  { key: 'chain', name: '连缀纹样' },
  { key: 'custom', name: '我的图案' }
]

/** 手工绘制（未归属任何模块）的图案在部件统计中的归类 */
export const MANUAL_CATEGORY_KEY = 'manual'
export const MANUAL_CATEGORY_NAME = '手工绘制'

/** 初始化框架生成的格线在部件统计中的归类（见 frame.js） */
export const FRAME_CATEGORY_KEY = 'frame'
export const FRAME_CATEGORY_NAME = '框架'

/** 分类 key → 中文名（框架 / 手工绘制为内部分类，不出现在图案库导航中） */
export function categoryName(key) {
  if (key === MANUAL_CATEGORY_KEY) return MANUAL_CATEGORY_NAME
  if (key === FRAME_CATEGORY_KEY) return FRAME_CATEGORY_NAME
  const c = CATEGORIES.find((x) => x.key === key)
  return c ? c.name : '未分类'
}

/** 参数弹窗的表单定义（通用四参数） */
export const MODULE_PARAM_SCHEMA = [
  { key: 'size', label: '外框尺寸', unit: 'mm', min: 20, max: 4000, step: 10 },
  { key: 'spacing', label: '间距', unit: 'mm', min: 2, max: 500, step: 1 },
  { key: 'width', label: '木条宽', unit: 'mm', min: 0.5, max: 50, step: 0.5 },
  { key: 'endCut', label: '末端切口角', unit: '°', min: 10, max: 170, step: 5 }
]

/** 内置图案模块 */
export const BUILTIN_MODULES = [
  {
    id: 'mod-koushi',
    name: '井字（方格）',
    category: 'basic',
    desc: '正交两组等距平行线，形成方格',
    express: 'family',
    defaults: { size: 300, spacing: 30, width: 4, endCut: DEFAULT_END_CUT },
    schema: MODULE_PARAM_SCHEMA,
    families: [
      { angle: 0, ratio: 1 },
      { angle: 90, ratio: 1 }
    ]
  },
  {
    id: 'mod-diagonal',
    name: '斜格（45° 菱形）',
    category: 'basic',
    desc: '45° 与 135° 两组平行线，形成菱形网格',
    express: 'family',
    defaults: { size: 300, spacing: 30, width: 4, endCut: DEFAULT_END_CUT },
    schema: MODULE_PARAM_SCHEMA,
    families: [
      { angle: 45, ratio: 1 },
      { angle: 135, ratio: 1 }
    ]
  },
  {
    id: 'mod-asanoha',
    name: '麻叶',
    category: 'flower',
    desc: '0°/60°/120° 三组等距平行线，正三角形网格（六角星连缀）',
    express: 'family',
    defaults: { size: 300, spacing: 20, width: 4, endCut: DEFAULT_END_CUT },
    schema: MODULE_PARAM_SCHEMA,
    families: [
      { angle: 0, ratio: 1 },
      { angle: 60, ratio: 1 },
      { angle: 120, ratio: 1 }
    ]
  },
  {
    id: 'mod-kikkou',
    name: '龟甲',
    category: 'geo',
    desc: '正六边形蜂窝网格（间距 = 六边形对边距）',
    express: 'segs',
    segsStrategy: 'kikkou',
    defaults: { size: 300, spacing: 30, width: 4, endCut: DEFAULT_END_CUT },
    schema: MODULE_PARAM_SCHEMA
  },
  {
    id: 'mod-handinhand',
    name: '手牵手',
    category: 'chain',
    desc: '竖线 + 两组 60° 斜线，形成相接连缀（候选定义，可按参考图校正）',
    express: 'family',
    defaults: { size: 300, spacing: 20, width: 4, endCut: DEFAULT_END_CUT },
    schema: MODULE_PARAM_SCHEMA,
    families: [
      { angle: 90, ratio: 2 },
      { angle: 60, ratio: 1 },
      { angle: 120, ratio: 1 }
    ]
  },
  {
    id: 'mod-squaredance',
    name: '广场舞',
    category: 'chain',
    desc: '方格 + 与格心对齐的斜格（候选定义，可按参考图校正）',
    express: 'family',
    defaults: { size: 300, spacing: 30, width: 4, endCut: DEFAULT_END_CUT },
    schema: MODULE_PARAM_SCHEMA,
    families: [
      { angle: 0, ratio: 1 },
      { angle: 90, ratio: 1 },
      { angle: 45, ratio: 0.7071067811865476 },
      { angle: 135, ratio: 0.7071067811865476 }
    ]
  }
]

/** 按 id 取内置模块 */
export function builtinModule(id) {
  return BUILTIN_MODULES.find((m) => m.id === id) || null
}

/** 按分类取模块列表 */
export function modulesByCategory(modules, category) {
  return (modules || []).filter((m) => m.category === category)
}

/** 搜索：按名称 / 描述模糊匹配（不区分大小写） */
export function searchModules(modules, keyword) {
  const k = String(keyword || '').trim().toLowerCase()
  if (!k) return modules || []
  return (modules || []).filter(
    (m) =>
      String(m.name || '').toLowerCase().includes(k) ||
      String(m.desc || '').toLowerCase().includes(k)
  )
}
