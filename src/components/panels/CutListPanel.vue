<script setup>
/**
 * CutListPanel —— 算料抽屉（V2 Phase 3）
 * 对当前派生线段按宽度分组，做 1D 下料，输出切割清单与利用率。
 * 材料参数（标准条长/锯缝/端部余量）保存在 project.material（可撤销编辑）。
 */
import { ref, computed } from 'vue'
import { NDrawer, NDrawerContent, NInputNumber, NButton, NEmpty } from 'naive-ui'
import { useProjectStore } from '../../stores/project.js'
import { useHistoryStore } from '../../stores/history.js'
import { aggregateCutItems, planStock } from '../../core/cutlist/index.js'

const props = defineProps({ show: Boolean })
const emit = defineEmits(['update:show'])

const project = useProjectStore()
const history = useHistoryStore()

const startSnapshot = ref(null)
function onMatFocus() {
  if (!startSnapshot.value) startSnapshot.value = project.snapshot()
}
/** blur：值有变化则把起点快照入栈（撤销粒度=一次字段编辑） */
function onMatChange() {
  if (startSnapshot.value) {
    const before = startSnapshot.value
    startSnapshot.value = null
    if (project.snapshot() !== before) history.push(before)
  }
}
/** update:value 的直通 handler（key 提前绑定，value 由事件传入） */
function setMaterialValue(key, v) {
  project.setMaterial({ [key]: v == null ? 0 : Number(v) })
}

/** 切割需求按宽度分组 */
const groups = computed(() => {
  const items = aggregateCutItems(project.segments)
  const byWidth = new Map()
  for (const it of items) {
    if (!byWidth.has(it.width)) byWidth.set(it.width, [])
    byWidth.get(it.width).push(it)
  }
  const result = []
  for (const [width, list] of byWidth) {
    // 端部余量：每端 endAllowance，两段 → 每根料需求长度 = 段长 + 2×余量（简单近似）
    const plan = planStock(list, {
      stockLength: project.material.stockLength,
      kerf: project.material.kerf
    })
    result.push({ width, items: list, plan })
  }
  return result
})

const summary = computed(() => {
  let stockCount = 0
  let totalUsed = 0
  let totalLength = 0
  let totalCap = 0
  for (const g of groups.value) {
    stockCount += g.plan.count
    totalUsed += g.plan.totalUsed
    totalLength += g.plan.totalLength
    totalCap += g.plan.totalCapacity
  }
  return {
    groups: groups.value.length,
    stockCount,
    totalUsed,
    totalLength,
    utilization: totalCap > 0 ? Math.round((totalUsed / totalCap) * 1000) / 10 : 0
  }
})
</script>

<template>
  <n-drawer :show="props.show" :width="560" placement="right" @update:show="emit('update:show', $event)">
    <n-drawer-content title="算料 · 1D 切割清单 (cut list)">
      <div style="display: flex; justify-content: flex-end; margin-bottom: 8px">
        <n-button size="small" @click="emit('update:show', false)">✕ 关闭</n-button>
      </div>
      <div class="cl-material">
        <div class="cl-mat-title">材料参数</div>
        <div class="cl-mat-grid">
          <label>标准条长 mm
            <n-input-number
              :value="project.material.stockLength"
              :min="100"
              :step="100"
              @focus="onMatFocus"
              @update:value="(v) => setMaterialValue('stockLength', v)"
              @blur="onMatChange"
            />
          </label>
          <label>锯缝 kerf mm
            <n-input-number
              :value="project.material.kerf"
              :min="0"
              :step="0.5"
              @focus="onMatFocus"
              @update:value="(v) => setMaterialValue('kerf', v)"
              @blur="onMatChange"
            />
          </label>
          <label>端部余量 mm
            <n-input-number
              :value="project.material.endAllowance"
              :min="0"
              :step="0.5"
              @focus="onMatFocus"
              @update:value="(v) => setMaterialValue('endAllowance', v)"
              @blur="onMatChange"
            />
          </label>
        </div>
        <div class="cl-mat-note">端部余量为每端预留（45° 斜切近似）；实际下料长度 = 段长 + 2 × 端部余量（保守估值见清单余料）。</div>
      </div>

      <n-empty
        v-if="!project.segments.length"
        description="画布为空，先添加纹样再算料"
        style="margin-top: 24px"
      />

      <template v-else>
        <div class="cl-summary">
          共 {{ project.segments.length }} 段、{{ summary.groups }} 个宽度分组；
          需 {{ summary.stockCount }} 根标准条；总用料 {{ summary.totalUsed.toFixed(1) }} mm；
          综合利用率 <b>{{ summary.utilization }}%</b>（{{ project.material.stockLength }}mm 条长）。
        </div>

        <div v-for="g in groups" :key="g.width" class="cl-group">
          <div class="cl-group-title">木条宽度 {{ g.width }} mm</div>
          <div class="cl-group-sub">
            段数 {{ g.items.reduce((s, i) => s + i.qty, 0) }} · 净长 {{ g.plan.totalLength.toFixed(1) }} mm ·
            需 {{ g.plan.count }} 根 · 利用率 {{ Math.round(g.plan.utilization * 1000) / 10 }}%
          </div>
          <table class="cl-table">
            <thead>
              <tr><th>#</th><th>装载切割（长度×数量）</th><th>使用</th><th>余料</th></tr>
            </thead>
            <tbody>
              <tr v-for="st in g.plan.stocks" :key="st.index">
                <td>{{ st.index }}</td>
                <td>
                  <span v-for="c in st.cuts" :key="c.length" class="cl-chip">{{ c.length }}×{{ c.qty }}</span>
                </td>
                <td>{{ st.used.toFixed(1) }}</td>
                <td>{{ st.remaining.toFixed(1) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </n-drawer-content>
  </n-drawer>
</template>

<style scoped>
.cl-material { background: #f6f6f2; border: 1px solid var(--kd-border); border-radius: 8px; padding: 10px; margin-bottom: 12px; }
.cl-mat-title { font-weight: 600; margin-bottom: 8px; font-size: 13px; }
.cl-mat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.cl-mat-grid label { font-size: 12px; color: #555; display: flex; flex-direction: column; gap: 4px; }
.cl-mat-note { font-size: 11px; color: #999; margin-top: 8px; }
.cl-summary { background: #eef4ff; border-radius: 6px; padding: 8px 10px; font-size: 13px; margin-bottom: 10px; }
.cl-group { margin-bottom: 16px; }
.cl-group-title { font-weight: 600; font-size: 14px; }
.cl-group-sub { font-size: 12px; color: #777; margin: 2px 0 6px; }
.cl-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.cl-table th, .cl-table td { border: 1px solid var(--kd-border); padding: 4px 8px; text-align: left; }
.cl-table th { background: #f0f0ec; font-weight: 600; }
.cl-chip { display: inline-block; background: #eef0f5; border-radius: 4px; padding: 1px 6px; margin: 1px 3px 1px 0; font-size: 12px; }
</style>
