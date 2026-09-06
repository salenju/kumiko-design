<script setup>
/**
 * PatternPropertyPanel —— 右侧属性面板（V2 §6 panels）
 * 使用 naive-ui 组件（NButton / 封装的 n-input-number）。
 *
 * 编辑会话（撤销粒度=一次字段编辑）：
 *   focus 记录变更前快照 → 输入/步进实时或失焦应用 → blur/回车提交会话。
 *   - live 字段（坐标、族参数）：每次输入即时更新 store，blur 时若有变化入栈；
 *   - commit 字段（单线长度/角度/相邻间距）：失焦或回车才应用，随后入栈。
 */
import { ref, computed } from 'vue'
import { NButton } from 'naive-ui'
import { useProjectStore } from '../../stores/project.js'
import { useUiStore } from '../../stores/ui.js'
import { useHistoryStore } from '../../stores/history.js'
import { useSelection } from '../../composables/useSelection.js'
import {
  angleDegOfVector,
  endFromPolar,
  length
} from '../../core/geometry/index.js'
import {
  movePatternToSpacing,
  referenceParallel,
  segOrientation
} from '../../core/patterns/index.js'
import KNumberField from './KNumberField.vue'

const project = useProjectStore()
const ui = useUiStore()
const history = useHistoryStore()
const selection = useSelection()

const startSnapshot = ref(null)

/** 字段会话开始：记录编辑前快照 */
function onFieldFocus() {
  if (!startSnapshot.value) startSnapshot.value = project.snapshot()
}
/** 字段会话结束：若有变化则入撤销栈 */
function onFieldCommit() {
  if (startSnapshot.value) {
    const before = startSnapshot.value
    startSnapshot.value = null
    if (project.snapshot() !== before) history.push(before)
  }
}

function updatePattern(id, patch) {
  project.updatePattern(id, patch)
}

/** naive 输入值可能是 null/越界 → 归一为有效数值 */
function num(v, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}
function setCount(p, v) {
  updatePattern(p.id, { count: Math.max(1, Math.round(num(v, p.count))) })
}

function segsOfPattern(id) {
  return project.segments.filter((s) => s.patternId === id)
}

const selectionSummary = computed(() => {
  const sel = ui.selectedPatterns
  const segs = sel.flatMap((p) => segsOfPattern(p.id))
  const totalLen = segs.reduce((s, x) => s + x.length, 0)
  return { patterns: sel.length, segments: segs.length, totalLen }
})

function removePatterns(ids) {
  history.beginEdit(() => project.removePatterns(ids))
  // 保留仍存在的选中项
  const set = new Set(ids)
  ui.setSelectedPatterns(ui.selectedPatternIds.filter((id) => !set.has(id)))
}

/* ---------- 单线（kind:line）长度/角度 辅助 ---------- */

function lineLength(p) {
  return length(p.x1, p.y1, p.x2, p.y2)
}
function lineAngleDeg(p) {
  return angleDegOfVector(p.x2 - p.x1, p.y2 - p.y1)
}

/** 单线显示值：画布可能 0 长度 → 显示 0 */
function commitLineLength(p, v) {
  const len = Number(v)
  if (Number.isFinite(len) && len > 0) {
    const a = lineAngleDeg(p)
    updatePattern(p.id, endFromPolar(p.x1, p.y1, len, a))
  }
  onFieldCommit()
}
function commitLineAngle(p, v) {
  const a = Number(v)
  const cur = lineLength(p)
  if (Number.isFinite(a) && cur > 0) {
    updatePattern(p.id, endFromPolar(p.x1, p.y1, cur, a))
  }
  onFieldCommit()
}

/* ---------- 相邻平行线间距（单线） ---------- */

function linePatternAsSeg(p) {
  return { id: p.id, x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2, patternId: p.id }
}

/** 找基准参考线（横线=上方、竖线=左侧、斜线=最近），排除自身图案 */
function adjacentParallel(p) {
  const mine = new Set(
    project.segments.filter((s) => s.patternId === p.id).map((s) => s.id)
  )
  const seg = linePatternAsSeg(p)
  const others = project.segments.filter((s) => !mine.has(s.id))
  return referenceParallel(seg, others, { tolDeg: 1 })
}

function adjacentDistance(p) {
  const near = adjacentParallel(p)
  return near ? near.distance : null
}

function adjacentHint(p) {
  const near = adjacentParallel(p)
  if (!near) return '该方向无相邻平行线'
  if (near.side === 'up') return '基准：上方相邻线（输入后本线保持其下方）'
  if (near.side === 'left') return '基准：左侧相邻线（输入后本线保持其右侧）'
  return '基准：最近的相邻平行线'
}

function adjacentLabel(p) {
  const o = segOrientation(linePatternAsSeg(p))
  if (o === 'h') return '相邻线间距（基准=上方）mm'
  if (o === 'v') return '相邻线间距（基准=左侧）mm'
  return '相邻线间距（基准=最近）mm'
}

function commitAdjacent(p, v) {
  const val = Number(v)
  const near = adjacentParallel(p)
  if (near && Number.isFinite(val) && val > 0) {
    const moved = movePatternToSpacing(p, near.other, val)
    if (moved) {
      updatePattern(p.id, {
        x1: moved.x1,
        y1: moved.y1,
        x2: moved.x2,
        y2: moved.y2
      })
    }
  }
  onFieldCommit()
}
</script>

<template>
  <div class="kd-prop">
    <div class="pp-title">属性面板</div>

    <!-- 未选中 -->
    <div v-if="!ui.selectedPatterns.length" class="pp-empty">
      <p>画布统计</p>
      <table class="kd-mini-table">
        <tr><td>图案数（线族+单线）</td><td>{{ project.patterns.length }}</td></tr>
        <tr><td>派生线段数</td><td>{{ project.segments.length }}</td></tr>
        <tr>
          <td>木条总长</td>
          <td>{{ project.totalSegmentLength.toFixed(1) }} mm</td>
        </tr>
      </table>
      <p class="pp-hint">提示：点选线段选中其所属图案并编辑；Ctrl/Shift+点选多选；Delete 删除。</p>
    </div>

    <!-- 选中列表 -->
    <div v-else>
      <div class="pp-summary">
        已选 {{ selectionSummary.patterns }} 图案 ·
        {{ selectionSummary.segments }} 段 ·
        {{ selectionSummary.totalLen.toFixed(1) }} mm
      </div>

      <div v-for="p in ui.selectedPatterns" :key="p.id" class="pp-card">
        <div class="pp-card-head">
          <span class="pp-card-title">{{ p.kind === 'line' ? '线段' : '线族' }} {{ p.id.slice(-5) }}</span>
          <div class="pp-card-ops">
            <n-button size="tiny" quaternary title="复制" @click="selection.duplicateSelected()">⧉</n-button>
            <n-button size="tiny" quaternary type="error" title="删除" @click="removePatterns([p.id])">🗑</n-button>
          </div>
        </div>

        <!-- 单根线段 -->
        <template v-if="p.kind === 'line'">
          <div class="pp-sub">起点（编辑时保持不动）</div>
          <div class="pp-bounds">
            <div class="pp-field half">
              <label>X1</label>
              <k-number-field :value="p.x1" :step="0.1" @focus="onFieldFocus" @input="updatePattern(p.id, { x1: $event })" @commit="onFieldCommit" />
            </div>
            <div class="pp-field half">
              <label>Y1</label>
              <k-number-field :value="p.y1" :step="0.1" @focus="onFieldFocus" @input="updatePattern(p.id, { y1: $event })" @commit="onFieldCommit" />
            </div>
          </div>
          <div class="pp-sub">长度与角度（由起点指向终点）</div>
          <div class="pp-field">
            <label>长度 mm</label>
            <k-number-field
              :value="lineLength(p)"
              :step="0.5"
              :min="0.1"
              :live="false"
              @focus="onFieldFocus"
              @commit="commitLineLength(p, $event)"
            />
          </div>
          <div class="pp-field">
            <label>角度 °</label>
            <k-number-field
              :value="lineAngleDeg(p)"
              :step="1"
              :live="false"
              @focus="onFieldFocus"
              @commit="commitLineAngle(p, $event)"
            />
          </div>
          <div class="pp-hint2">0°=水平向右，90°=竖直向下（同画线方向）；改长度保持角度，改角度保持长度。</div>
          <div class="pp-field">
            <label>{{ adjacentLabel(p) }}</label>
            <k-number-field
              :value="adjacentDistance(p)"
              :step="0.5"
              :min="0.1"
              :disabled="!adjacentParallel(p)"
              :placeholder="adjacentParallel(p) ? '' : '该方向无相邻线'"
              :live="false"
              @focus="onFieldFocus"
              @commit="commitAdjacent(p, $event)"
            />
          </div>
          <div class="pp-hint2">{{ adjacentHint(p) }}；输入目标间距回车/失焦后本线沿基准线法向移动至该间距（保持在基准线的同一侧）。</div>
          <div class="pp-sub">终点（微调）</div>
          <div class="pp-bounds">
            <div class="pp-field half">
              <label>X2</label>
              <k-number-field :value="p.x2" :step="0.1" @focus="onFieldFocus" @input="updatePattern(p.id, { x2: $event })" @commit="onFieldCommit" />
            </div>
            <div class="pp-field half">
              <label>Y2</label>
              <k-number-field :value="p.y2" :step="0.1" @focus="onFieldFocus" @input="updatePattern(p.id, { y2: $event })" @commit="onFieldCommit" />
            </div>
          </div>
          <div class="pp-field">
            <label>木条宽 mm</label>
            <k-number-field :value="p.width" :step="0.1" :min="0.1" @focus="onFieldFocus" @input="updatePattern(p.id, { width: $event })" @commit="onFieldCommit" />
          </div>
        </template>

        <!-- 线族：参数化编辑 -->
        <template v-else>
          <div class="pp-field">
            <label>角度 °</label>
            <k-number-field :value="p.angle" :step="15" @focus="onFieldFocus" @input="updatePattern(p.id, { angle: $event })" @commit="onFieldCommit" />
          </div>
          <div class="pp-field">
            <label>间距 mm</label>
            <k-number-field :value="p.spacing" :step="1" :min="0.1" @focus="onFieldFocus" @input="updatePattern(p.id, { spacing: $event })" @commit="onFieldCommit" />
          </div>
          <div class="pp-field">
            <label>条数</label>
            <k-number-field :value="p.count" :step="1" :min="1" :max="2000" @focus="onFieldFocus" @input="setCount(p, $event)" @commit="onFieldCommit" />
          </div>
          <div class="pp-field">
            <label>木条宽 mm</label>
            <k-number-field :value="p.width" :step="0.1" :min="0.1" @focus="onFieldFocus" @input="updatePattern(p.id, { width: $event })" @commit="onFieldCommit" />
          </div>

          <div class="pp-sub">绘制范围 bounds（mm）</div>
          <div class="pp-bounds">
            <div class="pp-field half"><label>X</label><k-number-field :value="p.bounds.x" :step="5" @focus="onFieldFocus" @input="updatePattern(p.id, { bounds: { ...p.bounds, x: $event } })" @commit="onFieldCommit" /></div>
            <div class="pp-field half"><label>Y</label><k-number-field :value="p.bounds.y" :step="5" @focus="onFieldFocus" @input="updatePattern(p.id, { bounds: { ...p.bounds, y: $event } })" @commit="onFieldCommit" /></div>
            <div class="pp-field half"><label>宽</label><k-number-field :value="p.bounds.w" :step="5" :min="1" @focus="onFieldFocus" @input="updatePattern(p.id, { bounds: { ...p.bounds, w: $event } })" @commit="onFieldCommit" /></div>
            <div class="pp-field half"><label>高</label><k-number-field :value="p.bounds.h" :step="5" :min="1" @focus="onFieldFocus" @input="updatePattern(p.id, { bounds: { ...p.bounds, h: $event } })" @commit="onFieldCommit" /></div>
          </div>

          <div class="pp-stats">
            该族派生 {{ segsOfPattern(p.id).length }} 段 ·
            长 {{ segsOfPattern(p.id).reduce((s, x) => s + x.length, 0).toFixed(1) }} mm
          </div>
        </template>
      </div>

      <n-button block type="error" secondary size="small" @click="removePatterns([...ui.selectedPatternIds])">
        删除全部选中
      </n-button>
    </div>
  </div>
</template>

<style scoped>
.pp-title { font-weight: 600; margin-bottom: 10px; }
.pp-empty p { font-weight: 600; margin: 6px 0; }
.pp-hint { color: #888; font-size: 12px; }
.pp-summary { background: #eef4ff; border-radius: 6px; padding: 6px 8px; margin-bottom: 8px; font-size: 12px; color: #1f4e9c; }
.pp-card { border: 1px solid var(--kd-border); border-radius: 8px; padding: 8px; margin-bottom: 10px; background: #fff; }
.pp-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.pp-card-title { font-weight: 600; font-size: 13px; }
.pp-card-ops { display: flex; gap: 2px; align-items: center; }

/* 输入项统一为「上下结构」：上方 label、下方 naive n-input-number */
.pp-field { display: flex; flex-direction: column; gap: 3px; margin-bottom: 8px; }
.pp-field label { font-size: 12px; color: #555; }
.pp-bounds { display: flex; flex-wrap: wrap; gap: 0 8px; }
.pp-bounds .pp-field.half { width: calc(50% - 4px); }
.pp-sub { font-size: 12px; color: #888; margin: 6px 0 4px; }
.pp-hint2 { font-size: 11px; color: #9a9a9a; margin: 2px 0 6px; line-height: 1.4; }
.pp-stats { font-size: 12px; color: #666; margin-top: 6px; }
.kd-mini-table { border-collapse: collapse; font-size: 13px; margin: 6px 0; }
.kd-mini-table td { padding: 3px 12px 3px 0; }
</style>
