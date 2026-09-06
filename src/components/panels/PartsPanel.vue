<script setup>
/**
 * PartsPanel —— 图案部件抽屉（与「算料」平行）
 * 统计设计图中「整根木条部件」，并按同型分组标注：
 *   同型 = 尺寸（长×宽）相同 + 插口间距序列相同 + 插口数量相同；
 *   插口 = 与其它非平行木条（线族或单线，任意角度）在双方实体内相交的交叉点；
 *   间距缩写 = 相邻插口中心距 ÷ 全局间距单位，四舍五入取整 x，如 1-2-1。
 */
import { computed } from 'vue'
import { NDrawer, NDrawerContent, NEmpty } from 'naive-ui'
import { useProjectStore } from '../../stores/project.js'
import { analyzeParts } from '../../core/parts/index.js'

const props = defineProps({ show: Boolean })
const emit = defineEmits(['update:show'])

const project = useProjectStore()

/** 显示数值：去掉多余的 .0（200.0 → 200） */
function fmt(v) {
  const r = Math.round(v * 10) / 10
  return String(Number.isInteger(r) ? r : r)
}

const unit = computed(() => project.spacingUnit)

const groups = computed(() => analyzeParts(project.patterns, unit.value))

const summary = computed(() => {
  const pieces = groups.value.reduce((s, g) => s + g.pieces, 0)
  const notches = groups.value.reduce((s, g) => s + g.pieces * g.notchCount, 0)
  return { groupCount: groups.value.length, pieces, notches }
})
</script>

<template>
  <n-drawer :show="props.show" :width="640" placement="right" @update:show="emit('update:show', $event)">
    <n-drawer-content title="图案部件 · 同型整根本条统计" closable>
      <div class="pp-parts-note">
        插口 = 与其它木条（线族/单线，任意角度）的交叉点；间距缩写 = 相邻插口中心距 ÷
        全局间距单位（{{ unit }}mm）四舍五入取整，如 <code>1-2-1</code> 表示间距依次 1x、2x、1x。
        相同部件 = 长×宽相同 + 间距缩写相同 + 插口数量相同。
      </div>

      <n-empty v-if="!project.patterns.length" description="画布为空，先添加纹样再统计部件" style="margin-top: 24px" />

      <template v-else>
        <div class="pp-parts-summary">
          共 <b>{{ summary.groupCount }}</b> 组同型部件 · <b>{{ summary.pieces }}</b> 根本条 ·
          合计 <b>{{ summary.notches }}</b> 个插口
        </div>

        <table class="pp-parts-table">
          <thead>
            <tr>
              <th>#</th>
              <th>尺寸（长 × 宽）mm</th>
              <th>间距缩写</th>
              <th>数量</th>
              <th>插口数</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(g, i) in groups" :key="i">
              <td>{{ i + 1 }}</td>
              <td>{{ fmt(g.length) }} × {{ fmt(g.width) }}</td>
              <td>
                <code v-if="g.code">{{ g.code }}</code>
                <span v-else class="pp-no">—</span>
              </td>
              <td>{{ g.pieces }} piece</td>
              <td>{{ g.notchCount }} 插口</td>
            </tr>
          </tbody>
        </table>
      </template>
    </n-drawer-content>
  </n-drawer>
</template>

<style scoped>
.pp-parts-note { font-size: 12px; color: #777; background: #f6f6f2; border: 1px solid var(--kd-border); border-radius: 8px; padding: 8px 10px; margin-bottom: 10px; line-height: 1.6; }
.pp-parts-note code { background: #eef0f5; border-radius: 4px; padding: 0 4px; }
.pp-parts-summary { background: #eef4ff; border-radius: 6px; padding: 8px 10px; font-size: 13px; margin-bottom: 10px; }
.pp-parts-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.pp-parts-table th, .pp-parts-table td { border: 1px solid var(--kd-border); padding: 5px 8px; text-align: left; }
.pp-parts-table th { background: #f0f0ec; font-weight: 600; }
.pp-parts-table code { background: #eef0f5; border-radius: 4px; padding: 1px 6px; font-size: 12px; }
.pp-no { color: #aaa; }
</style>
