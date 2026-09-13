<script setup>
/**
 * PatternPropertyPanel —— 右侧属性面板（V2 §6 panels）
 * 使用 naive-ui 组件（NButton / 封装的 n-input-number）。
 *
 * 编辑会话（撤销粒度=一次字段编辑）：
 *   focus 记录变更前快照 → 输入/步进实时或失焦应用 → blur/回车提交会话。
 *   - live 字段（坐标、族参数）：每次输入即时更新 store，blur 时若有变化入栈；
 *   - commit 字段（单线长度/角度）：失焦或回车才应用，随后入栈；
 *   - x 倍数下拉（线族间距 / 单线相邻线间距）：选中即应用「Nx = N × 全局间距单位」。
 */
import { ref, computed } from 'vue'
import { NButton, NSelect, NModal, NCard, NInput, useMessage } from 'naive-ui'
import { useProjectStore } from '../../stores/project.js'
import { useUiStore } from '../../stores/ui.js'
import { useHistoryStore } from '../../stores/history.js'
import { useLibraryStore } from '../../stores/library.js'
import { useSelection } from '../../composables/useSelection.js'
import { categoryName, MANUAL_CATEGORY_KEY, frameLineCount } from '../../core/library/index.js'
import {
  angleDegOfVector,
  endFromPolar,
  length
} from '../../core/geometry/index.js'
import {
  movePatternToSpacing,
  ratioToSpacing,
  referenceParallel,
  segOrientation,
  spacingRatio,
  unitChoices
} from '../../core/patterns/index.js'
import KNumberField from './KNumberField.vue'

const project = useProjectStore()
const ui = useUiStore()
const history = useHistoryStore()
const library = useLibraryStore()
const selection = useSelection()
const message = useMessage()

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

/** 下拉等「选中即应用」字段：保证会话已开启，执行变更后统一收尾入栈 */
function applyUndoable(mutate) {
  if (!startSnapshot.value) startSnapshot.value = project.snapshot()
  mutate()
  onFieldCommit()
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

/* ---------- 间距按全局单位 Nx 倍数（线族「间距」+ 单线「相邻线间距」） ---------- */
/**
 * 全局间距单位 spacingUnit（默认 10mm，见工具栏「⚙ 设置」）。
 * 面板上间距一律以 Nx 下拉设置：Nx = N × spacingUnit。
 */

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
  if (near.side === 'up') return '基准：上方相邻线（选择倍数后本线保持其下方）'
  if (near.side === 'left') return '基准：左侧相邻线（选择倍数后本线保持其右侧）'
  return '基准：最近的相邻平行线'
}

function adjacentLabel(p) {
  const o = segOrientation(linePatternAsSeg(p))
  if (o === 'h') return '相邻线间距（基准=上方）'
  if (o === 'v') return '相邻线间距（基准=左侧）'
  return '相邻线间距（基准=最近）'
}

/** mm 间距 → 当前 Nx 值（供下拉回显；无相邻线/非法返回 null） */
function ratioOf(mm) {
  return spacingRatio(mm, project.spacingUnit)
}

/** 下拉选项：恒定 1x..8x，当前间距超出时向上扩展；非整倍补一条当前值 */
function choicesOf(mm) {
  const r = unitChoices(mm, project.spacingUnit)
  return r ? r.choices : []
}

/** 线族间距：mm → 倍数（回显值） */
function familyRatio(p) {
  return p.spacing > 0 ? ratioOf(p.spacing) : null
}
function familyChoices(p) {
  return p.spacing > 0 ? choicesOf(p.spacing) : []
}

/** 单线相邻线间距：mm → 倍数（回显值） */
function adjacentRatio(p) {
  const d = adjacentDistance(p)
  return d !== null && d > 0 ? ratioOf(d) : null
}
function adjacentChoices(p) {
  const d = adjacentDistance(p)
  return d !== null && d > 0 ? choicesOf(d) : []
}

/** 线族间距应用：选择 Nx → spacing = N × unit */
function commitFamilySpacing(p, v) {
  const mm = ratioToSpacing(Number(v), project.spacingUnit)
  if (!Number.isFinite(mm) || mm <= 0) return
  applyUndoable(() => updatePattern(p.id, { spacing: mm }))
}

/** 单线相邻线间距应用：选择 Nx → 本线移动到与基准线间距 = N × unit */
function commitAdjacent(p, v) {
  const near = adjacentParallel(p)
  const mm = ratioToSpacing(Number(v), project.spacingUnit)
  applyUndoable(() => {
    if (near && Number.isFinite(mm) && mm > 0) {
      const moved = movePatternToSpacing(p, near.other, mm)
      if (moved) {
        updatePattern(p.id, {
          x1: moved.x1,
          y1: moved.y1,
          x2: moved.x2,
          y2: moved.y2
        })
      }
    }
  })
}

/* ---------- 图案库实例（PatternGroup）参数 ---------- */

/** 选中项所属的实例集合 */
const selectedGroups = computed(() => {
  const ids = new Set()
  for (const p of ui.selectedPatterns) if (p.groupId) ids.add(p.groupId)
  return [...ids].map((id) => project.groupById(id)).filter(Boolean)
})

/** 恰好选中单一实例时用于展示实例参数卡 */
const singleGroup = computed(() => (selectedGroups.value.length === 1 ? selectedGroups.value[0] : null))

/** 选中的框架格线（由 layout 参数管理，单独提示，不逐条编辑） */
const frameSelectedIds = computed(() =>
  ui.selectedPatternIds.filter((id) => project.patternById(id)?.frame)
)

/** 逐图案编辑卡：隐藏实例成员（由实例卡统一编辑）与框架格线（由框架参数管理） */
const editablePatterns = computed(() =>
  ui.selectedPatterns.filter((p) => !p.frame && !(singleGroup.value && p.groupId))
)

/** 无实例归属、且非框架线的散图案 id（末端切口角直接存在图案上） */
const manualIds = computed(() =>
  ui.selectedPatternIds.filter((id) => {
    const p = project.patternById(id)
    return p && !p.groupId && !p.frame
  })
)

const manualEndCut = computed(() => {
  const first = manualIds.value.map((id) => project.patternById(id)).find(Boolean)
  return first ? project.patternMeta[first.id]?.endCut ?? 90 : 90
})

function beginGroupEdit() {
  onFieldFocus()
}

/** 修改实例参数 → 整体重建几何并保持选中 */
function setGroupParam(g, key, value) {
  const v = Number(value)
  if (!Number.isFinite(v)) {
    onFieldCommit()
    return
  }
  const res = project.updateGroup(g.id, { params: { [key]: v } })
  if (res) ui.setSelectedPatterns(res.patternIds)
  onFieldCommit()
}

function unbindGroup(g) {
  history.beginEdit(() => project.unbindGroupCell(g.id))
  message.success('已解除槽位绑定（转为自由放置）')
}

function removeGroupWithPatterns(g) {
  history.beginEdit(() => project.removeGroups([g.id]))
  ui.clearSelection()
}

/** 散图案末端切口角 */
function setManualEndCut(ids, value) {
  const v = Number(value)
  if (!Number.isFinite(v)) {
    onFieldCommit()
    return
  }
  project.setPatternEndCut(ids, v)
  onFieldCommit()
}

/* ---------- 存为图案 ---------- */

const saveModal = ref({ show: false, name: '' })

function openSaveAsPattern() {
  if (!ui.selectedPatterns.length) return
  saveModal.value = { show: true, name: `我的图案 ${library.customCount + 1}` }
}

function confirmSaveAsPattern() {
  const mod = library.saveFromSelection(ui.selectedPatterns, saveModal.value.name)
  saveModal.value = { ...saveModal.value, show: false }
  if (mod) message.success(`已存为图案「${mod.name}」，可在「图案库 → 我的图案」中复用`)
  else message.error('选中内容无法归一化为图案')
}

/* ---------- 框架摘要（未选中时展示） ---------- */

const layoutSummary = computed(() => {
  const l = project.layout
  if (!l?.enabled) return '未启用'
  const n = frameLineCount(l)
  const bound = project.groups.filter((g) => g.cell).length
  return `${l.rows} 行 × ${l.cols} 列（横线 ${n.horizontal} + 竖线 ${n.vertical}，已填 ${bound} 格）`
})
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
        <tr>
          <td>全局间距单位</td>
          <td>{{ project.spacingUnit }} mm（改：工具栏 ⚙ 设置）</td>
        </tr>
        <tr>
          <td>初始化框架</td>
          <td>{{ layoutSummary }}</td>
        </tr>
        <tr>
          <td>图案实例</td>
          <td>{{ project.groups.length }} 个</td>
        </tr>
      </table>
      <p class="pp-hint">提示：点选线段选中其所属图案（属图案库实例时整组选中）；Ctrl/Shift+点选多选；Delete 删除。</p>
      <p class="pp-hint">
        图案库：工具栏「▤ 图案库」；初始化框架：工具栏「▦ 初始化框架」。
      </p>
    </div>

    <!-- 选中列表 -->
    <div v-else>
      <div class="pp-summary">
        已选 {{ selectionSummary.patterns }} 图案 ·
        {{ selectionSummary.segments }} 段 ·
        {{ selectionSummary.totalLen.toFixed(1) }} mm
      </div>

      <!-- 图案库实例：整体参数 -->
      <div v-if="singleGroup" class="pp-card pp-group-card">
        <div class="pp-card-head">
          <span class="pp-card-title">
            实例 · {{ singleGroup.name }}
            <span class="pp-cat">{{ categoryName(singleGroup.category) }}</span>
          </span>
          <div class="pp-card-ops">
            <n-button size="tiny" quaternary type="error" title="删除实例（连带其木条）" @click="removeGroupWithPatterns(singleGroup)">🗑</n-button>
          </div>
        </div>

        <div v-if="singleGroup.cell" class="pp-group-cell">
          已绑定槽位 {{ singleGroup.cell.row + 1 }}-{{ singleGroup.cell.col + 1 }}
          <n-button size="tiny" quaternary @click="unbindGroup(singleGroup)">解除绑定</n-button>
        </div>

        <div class="pp-field">
          <label>间距 mm（相邻木条中心距）</label>
          <k-number-field
            :value="singleGroup.params.spacing"
            :step="project.spacingUnit || 1"
            :min="1"
            :live="false"
            @focus="beginGroupEdit"
            @commit="setGroupParam(singleGroup, 'spacing', $event)"
          />
        </div>
        <div class="pp-field">
          <label>木条宽 mm</label>
          <k-number-field
            :value="singleGroup.params.width"
            :step="0.5"
            :min="0.1"
            :live="false"
            @focus="beginGroupEdit"
            @commit="setGroupParam(singleGroup, 'width', $event)"
          />
        </div>
        <div class="pp-field">
          <label>末端切口角 °（90 = 方切，45 = 斜切）</label>
          <k-number-field
            :value="singleGroup.params.endCut ?? 90"
            :step="5"
            :min="10"
            :max="170"
            :live="false"
            @focus="beginGroupEdit"
            @commit="setGroupParam(singleGroup, 'endCut', $event)"
          />
        </div>
        <div class="pp-hint2">
          改参数会按当前槽位/放置矩形整体重建几何；末端切口角只影响端部造型，不影响长度与算料。
        </div>
      </div>

      <!-- 框架格线：由「初始化框架」参数管理 -->
      <div v-if="frameSelectedIds.length" class="pp-card">
        <div class="pp-card-head"><span class="pp-card-title">初始化框架 · 格线（{{ frameSelectedIds.length }} 条）</span></div>
        <div class="pp-hint2">
          框架横线 / 竖线由「初始化框架」的行数、列数、间距、木条宽与末端切口角统一生成，
          不能单独编辑或删除；改参数会整体重建。
        </div>
        <n-button block secondary size="small" @click="ui.setLayoutModal(true)">打开框架参数</n-button>
      </div>

      <!-- 散图案：末端切口角统一设置 -->
      <div v-if="manualIds.length" class="pp-card">
        <div class="pp-card-head"><span class="pp-card-title">手工绘制图案（{{ manualIds.length }} 个）</span></div>
        <div class="pp-field">
          <label>末端切口角 °（90 = 方切）</label>
          <k-number-field
            :value="manualEndCut"
            :step="5"
            :min="10"
            :max="170"
            :live="false"
            @focus="onFieldFocus"
            @commit="setManualEndCut(manualIds, $event)"
          />
        </div>
      </div>

      <div v-for="p in editablePatterns" :key="p.id" class="pp-card">
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
            <label>{{ adjacentLabel(p) }}（Nx = N × {{ project.spacingUnit }}mm）</label>
            <n-select
              :value="adjacentRatio(p)"
              :options="adjacentChoices(p)"
              :disabled="!adjacentParallel(p)"
              :placeholder="adjacentParallel(p) ? `选择倍数，如 4x = ${project.spacingUnit * 4}mm` : '该方向无相邻线'"
              size="small"
              style="width: 100%"
              @focus="onFieldFocus"
              @update:value="commitAdjacent(p, $event)"
              @blur="onFieldCommit"
            />
          </div>
          <div class="pp-hint2">{{ adjacentHint(p) }}；选择 Nx 后本线沿基准线法向移动至 N × 单位 的间距（保持在基准线的同一侧）。</div>
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
            <label>间距（Nx = N × {{ project.spacingUnit }}mm）</label>
            <n-select
              :value="familyRatio(p)"
              :options="familyChoices(p)"
              :placeholder="`1x = ${project.spacingUnit}mm`"
              size="small"
              style="width: 100%"
              @focus="onFieldFocus"
              @update:value="commitFamilySpacing(p, $event)"
              @blur="onFieldCommit"
            />
            <div class="pp-hint2">相邻木条中心距按全局单位整数倍设置；想整体调密/调疏就改它。改单位见工具栏「⚙ 设置」。</div>
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

      <div class="pp-actions">
        <n-button block secondary size="small" @click="openSaveAsPattern">＋ 存为图案</n-button>
        <n-button block type="error" secondary size="small" @click="removePatterns([...ui.selectedPatternIds])">
          删除全部选中
        </n-button>
      </div>
    </div>

    <n-modal :show="saveModal.show" @update:show="(v) => (saveModal = { ...saveModal, show: v })">
      <n-card style="width: 420px; max-width: 92vw" title="存为图案" :bordered="false">
        <n-input
          v-model:value="saveModal.name"
          placeholder="如：我的三角网格"
          :maxlength="40"
          @keydown.enter.prevent="confirmSaveAsPattern"
        />
        <div class="pp-hint2" style="margin-top: 8px">
          将按选中内容的外接矩形归一化，保存到「图案库 → 我的图案」（本机可用，跨作品复用）。
        </div>
        <template #footer>
          <div style="display: flex; justify-content: flex-end; gap: 8px">
            <n-button @click="saveModal = { ...saveModal, show: false }">取消</n-button>
            <n-button type="primary" :disabled="!saveModal.name.trim()" @click="confirmSaveAsPattern">存为图案</n-button>
          </div>
        </template>
      </n-card>
    </n-modal>
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
.pp-actions { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
/* 图案库实例卡：淡蓝背景区分 */
.pp-group-card { background: #f7faff; border-color: #cfe0f8; }
.pp-cat {
  font-size: 11px; font-weight: 400; color: #1f4e9c; background: #e8effc;
  border-radius: 4px; padding: 1px 5px; margin-left: 4px;
}
.pp-group-cell {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 12px; color: #1f4e9c; background: #eef4ff; border-radius: 6px;
  padding: 4px 8px; margin-bottom: 8px;
}
</style>
