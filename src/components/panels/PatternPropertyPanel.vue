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

        <!-- 单根线段：编辑两端点与宽度 -->
        <template v-if="p.kind === 'line'">
          <div class="pp-sub">起点</div>
          <div class="pp-bounds">
            <div class="pp-field half"><label>X1</label><input type="number" step="1" :value="p.x1" @focus="onFieldFocus" @change="onFieldChange" @input="updatePattern(p.id, { x1: Number($event.target.value) })" /></div>
            <div class="pp-field half"><label>Y1</label><input type="number" step="1" :value="p.y1" @focus="onFieldFocus" @change="onFieldChange" @input="updatePattern(p.id, { y1: Number($event.target.value) })" /></div>
          </div>
          <div class="pp-sub">终点</div>
          <div class="pp-bounds">
            <div class="pp-field half"><label>X2</label><input type="number" step="1" :value="p.x2" @focus="onFieldFocus" @change="onFieldChange" @input="updatePattern(p.id, { x2: Number($event.target.value) })" /></div>
            <div class="pp-field half"><label>Y2</label><input type="number" step="1" :value="p.y2" @focus="onFieldFocus" @change="onFieldChange" @input="updatePattern(p.id, { y2: Number($event.target.value) })" /></div>
          </div>
          <div class="pp-field">
            <label>木条宽 mm</label>
            <input type="number" step="0.5" min="0.1" :value="p.width" @focus="onFieldFocus" @change="onFieldChange" @input="updatePattern(p.id, { width: Number($event.target.value) })" />
          </div>
          <div class="pp-stats">
            长度 {{ Math.hypot(p.x2 - p.x1, p.y2 - p.y1).toFixed(1) }} mm
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
.pp-stats { font-size: 12px; color: #666; margin-top: 6px; }
.pp-delete-all { width: 100%; border: 1px solid #e6b8b4; background: #fdf3f2; color: #c0392b; border-radius: 6px; padding: 6px; cursor: pointer; }
.pp-delete-all:hover { background: #fdeceb; }
.kd-mini-table { border-collapse: collapse; font-size: 13px; margin: 6px 0; }
.kd-mini-table td { padding: 3px 12px 3px 0; }
</style>
