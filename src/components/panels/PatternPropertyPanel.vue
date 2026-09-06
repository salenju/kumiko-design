<script setup>
/**
 * PatternPropertyPanel —— 右侧属性面板（V2 §6 panels）
 * 选中线族的参数编辑。编辑会话：focus 记录变更前快照，blur/change 时有实际变化才入撤销栈
 * （一次连续编辑 = 一条历史，符合 V2 §8.2 粒度）。
 */
import { ref, computed } from 'vue'
import { useProjectStore } from '../../stores/project.js'
import { useUiStore } from '../../stores/ui.js'
import { useHistoryStore } from '../../stores/history.js'
import { useSelection } from '../../composables/useSelection.js'
import {
  angleDegOfVector,
  endFromPolar,
  length
} from '../../core/geometry/index.js'
import { nearestParallelSegment, movePatternToSpacing } from '../../core/patterns/index.js'

const project = useProjectStore()
const ui = useUiStore()
const history = useHistoryStore()
const selection = useSelection()

const startSnapshot = ref(null)

/** 每个字段会话：focus 记录起点 */
function onFieldFocus() {
  if (!startSnapshot.value) startSnapshot.value = project.snapshot()
}
/** blur/change：若有变化则把起点快照入栈（允许撤销到编辑前） */
function onFieldChange() {
  if (startSnapshot.value) {
    const before = startSnapshot.value
    startSnapshot.value = null
    if (project.snapshot() !== before) {
      history.push(before)
    }
  }
}

function updatePattern(id, patch) {
  project.updatePattern(id, patch)
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

/** 单线当前长度 mm（从两端点） */
function lineLength(p) {
  return length(p.x1, p.y1, p.x2, p.y2)
}

/** 单线当前有向角度 °（0=水平右，90=竖直下；y-down 与画线一致） */
function lineAngleDeg(p) {
  return angleDegOfVector(p.x2 - p.x1, p.y2 - p.y1)
}

/**
 * 以「长度」更新终点：保持起点 (x1,y1) 与当前角度不变。
 * @returns {boolean} 是否产生了有效更新
 */
function updateLineByLength(p, v) {
  const len = Number(v)
  if (!Number.isFinite(len) || len <= 0) return false
  const a = lineAngleDeg(p)
  const end = endFromPolar(p.x1, p.y1, len, a)
  updatePattern(p.id, end)
  return true
}

/**
 * 以「角度」更新终点：保持起点 (x1,y1) 与当前长度不变。
 * @returns {boolean} 是否产生了有效更新
 */
function updateLineByAngle(p, v) {
  const a = Number(v)
  if (!Number.isFinite(a)) return false
  const cur = lineLength(p)
  if (cur <= 0) return false // 零长线段无方向，拒绝旋转
  const end = endFromPolar(p.x1, p.y1, cur, a)
  updatePattern(p.id, end)
  return true
}

/**
 * 长度输入：change/blur 时一次性应用并记录撤销（避免输入过程被重算打断）；
 * 无效输入回填当前显示值。
 */
function onLineLengthChange(p, e) {
  const ok = updateLineByLength(p, e.target.value)
  if (!ok) e.target.value = lineLength(p).toFixed(1)
  onFieldChange()
}

/** 角度输入：change/blur 时一次性应用并记录撤销 */
function onLineAngleChange(p, e) {
  const ok = updateLineByAngle(p, e.target.value)
  if (!ok) e.target.value = lineAngleDeg(p).toFixed(1)
  onFieldChange()
}

/* ---------- 相邻平行线间距（单线） ---------- */

/** 把单线 pattern 转成线段结构 */
function linePatternAsSeg(p) {
  return { id: p.id, x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2, patternId: p.id }
}

/** 找与选中图案相邻的最近平行线（排除自身图案的段）；返回 {seg, distance} 或 null */
function adjacentParallel(p) {
  const mine = new Set(
    project.segments.filter((s) => s.patternId === p.id).map((s) => s.id)
  )
  const seg = linePatternAsSeg(p)
  const others = project.segments.filter((s) => !mine.has(s.id))
  return nearestParallelSegment(seg, others, { tolDeg: 1 })
}

/**
 * 相邻间距输入（change/blur 应用）：把单线整体移动，使其与最近的
 * 相邻平行线间距 = 输入值（保持原本位于参考线哪一侧）。
 */
function onLineSpacingChange(p, e) {
  const v = Number(e.target.value)
  const near = adjacentParallel(p)
  const ok = near && Number.isFinite(v) && v > 0
  if (ok) {
    const moved = movePatternToSpacing(p, near.seg, v)
    if (moved) {
      updatePattern(p.id, {
        x1: moved.x1,
        y1: moved.y1,
        x2: moved.x2,
        y2: moved.y2
      })
    }
  }
  const nearAfter = adjacentParallel(p)
  e.target.value = nearAfter ? nearAfter.distance.toFixed(1) : ''
  onFieldChange()
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
            <button class="mini-btn" title="复制" @click="selection.duplicateSelected()">⧉</button>
            <button class="mini-btn danger" title="删除" @click="removePatterns([p.id])">🗑</button>
          </div>
        </div>

        <!-- 单根线段：起点 + 长度/角度（以起点为轴），或直接改终点 -->
        <template v-if="p.kind === 'line'">
          <div class="pp-sub">起点（编辑时保持不动）</div>
          <div class="pp-bounds">
            <div class="pp-field half"><label>X1</label><input type="number" step="1" :value="p.x1" @focus="onFieldFocus" @change="onFieldChange" @input="updatePattern(p.id, { x1: Number($event.target.value) })" /></div>
            <div class="pp-field half"><label>Y1</label><input type="number" step="1" :value="p.y1" @focus="onFieldFocus" @change="onFieldChange" @input="updatePattern(p.id, { y1: Number($event.target.value) })" /></div>
          </div>
          <div class="pp-sub">长度与角度（由起点指向终点）</div>
          <div class="pp-field">
            <label>长度 mm</label>
            <input
              type="number"
              step="0.5"
              min="0.1"
              :value="lineLength(p).toFixed(1)"
              @focus="onFieldFocus"
              @change="onLineLengthChange(p, $event)"
              @keydown.enter.prevent="$event.target.blur()"
            />
          </div>
          <div class="pp-field">
            <label>角度 °</label>
            <input
              type="number"
              step="1"
              :value="lineAngleDeg(p).toFixed(1)"
              @focus="onFieldFocus"
              @change="onLineAngleChange(p, $event)"
              @keydown.enter.prevent="$event.target.blur()"
            />
          </div>
          <div class="pp-hint2">0°=水平向右，90°=竖直向下（同画线方向）；改长度保持角度，改角度保持长度。</div>
          <div class="pp-field">
            <label>相邻线间距 mm</label>
            <input
              type="number"
              step="0.5"
              min="0.1"
              :value="adjacentParallel(p) ? adjacentParallel(p).distance.toFixed(1) : ''"
              :disabled="!adjacentParallel(p)"
              :placeholder="adjacentParallel(p) ? '' : '无相邻平行线'"
              @focus="onFieldFocus"
              @change="onLineSpacingChange(p, $event)"
              @keydown.enter.prevent="$event.target.blur()"
            />
          </div>
          <div class="pp-hint2">输入目标间距后按回车/失焦：本线向最近的相邻平行线移动至该间距（保持所在侧）。</div>
          <div class="pp-sub">终点（微调）</div>
          <div class="pp-bounds">
            <div class="pp-field half"><label>X2</label><input type="number" step="1" :value="p.x2" @focus="onFieldFocus" @change="onFieldChange" @input="updatePattern(p.id, { x2: Number($event.target.value) })" /></div>
            <div class="pp-field half"><label>Y2</label><input type="number" step="1" :value="p.y2" @focus="onFieldFocus" @change="onFieldChange" @input="updatePattern(p.id, { y2: Number($event.target.value) })" /></div>
          </div>
          <div class="pp-field">
            <label>木条宽 mm</label>
            <input type="number" step="0.5" min="0.1" :value="p.width" @focus="onFieldFocus" @change="onFieldChange" @input="updatePattern(p.id, { width: Number($event.target.value) })" />
          </div>
        </template>

        <!-- 线族：参数化编辑 -->
        <template v-else>
          <div class="pp-field">
            <label>角度 °</label>
            <input
              type="number"
              step="15"
              :value="p.angle"
              @focus="onFieldFocus"
              @change="onFieldChange"
              @input="updatePattern(p.id, { angle: Number($event.target.value) })"
            />
          </div>
          <div class="pp-field">
            <label>间距 mm</label>
            <input
              type="number"
              step="1"
              min="0.1"
              :value="p.spacing"
              @focus="onFieldFocus"
              @change="onFieldChange"
              @input="updatePattern(p.id, { spacing: Number($event.target.value) })"
            />
          </div>
          <div class="pp-field">
            <label>条数</label>
            <input
              type="number"
              step="1"
              min="1"
              max="2000"
              :value="p.count"
              @focus="onFieldFocus"
              @change="onFieldChange"
              @input="updatePattern(p.id, { count: Math.max(1, Math.round(Number($event.target.value))) })"
            />
          </div>
          <div class="pp-field">
            <label>木条宽 mm</label>
            <input
              type="number"
              step="0.5"
              min="0.1"
              :value="p.width"
              @focus="onFieldFocus"
              @change="onFieldChange"
              @input="updatePattern(p.id, { width: Number($event.target.value) })"
            />
          </div>

          <div class="pp-sub">绘制范围 bounds（mm）</div>
          <div class="pp-bounds">
            <div class="pp-field half"><label>X</label><input type="number" step="5" :value="p.bounds.x" @focus="onFieldFocus" @change="onFieldChange" @input="updatePattern(p.id, { bounds: { ...p.bounds, x: Number($event.target.value) } })" /></div>
            <div class="pp-field half"><label>Y</label><input type="number" step="5" :value="p.bounds.y" @focus="onFieldFocus" @change="onFieldChange" @input="updatePattern(p.id, { bounds: { ...p.bounds, y: Number($event.target.value) } })" /></div>
            <div class="pp-field half"><label>宽</label><input type="number" step="5" min="1" :value="p.bounds.w" @focus="onFieldFocus" @change="onFieldChange" @input="updatePattern(p.id, { bounds: { ...p.bounds, w: Number($event.target.value) } })" /></div>
            <div class="pp-field half"><label>高</label><input type="number" step="5" min="1" :value="p.bounds.h" @focus="onFieldFocus" @change="onFieldChange" @input="updatePattern(p.id, { bounds: { ...p.bounds, h: Number($event.target.value) } })" /></div>
          </div>

          <div class="pp-stats">
            该族派生 {{ segsOfPattern(p.id).length }} 段 ·
            长 {{ segsOfPattern(p.id).reduce((s, x) => s + x.length, 0).toFixed(1) }} mm
          </div>
        </template>
      </div>

      <button class="pp-delete-all" @click="removePatterns([...ui.selectedPatternIds])">删除全部选中</button>
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
.pp-card-ops { display: flex; gap: 2px; }
.mini-btn { border: 1px solid var(--kd-border); background: #fff; border-radius: 5px; cursor: pointer; padding: 2px 6px; font-size: 12px; }
.mini-btn:hover { background: #eef0f5; }
.mini-btn.danger:hover { background: #fdeceb; }
.pp-field { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; }
.pp-field label { width: 70px; font-size: 12px; color: #555; flex: none; }
.pp-field.half label { width: 26px; }
.pp-field input { flex: 1; border: 1px solid #cfd4dd; border-radius: 5px; padding: 3px 6px; font-size: 13px; width: 0; min-width: 0; }
.pp-field input:focus { outline: 2px solid #b7cdf0; border-color: #2f6fd0; }
.pp-bounds { display: flex; flex-wrap: wrap; gap: 4px; }
.pp-bounds .pp-field.half { width: 48%; }
.pp-sub { font-size: 12px; color: #888; margin: 6px 0 4px; }
.pp-hint2 { font-size: 11px; color: #9a9a9a; margin: 2px 0 6px; line-height: 1.4; }
.pp-stats { font-size: 12px; color: #666; margin-top: 6px; }
.pp-delete-all { width: 100%; border: 1px solid #e6b8b4; background: #fdf3f2; color: #c0392b; border-radius: 6px; padding: 6px; cursor: pointer; }
.pp-delete-all:hover { background: #fdeceb; }
.kd-mini-table { border-collapse: collapse; font-size: 13px; margin: 6px 0; }
.kd-mini-table td { padding: 3px 12px 3px 0; }
</style>
