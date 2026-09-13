<script setup>
/**
 * SlotLayer —— 初始化框架的**单元格**辅助高亮（不是框架本身）
 *
 * 框架本体由「线条」构成：frame.js 生成的横线/竖线是真实木条图案，
 * 由 PatternLayer 正常渲染为实线网格（见 docs/图案模块化-0913.md §5）。
 *
 * 本层只负责「往格子里放图案」时需要的轻量提示：
 *   - 已填充单元格：极淡蓝底（表示该格已有图案实例）
 *   - 选中单元格：蓝色底 + 实线边框 + 行列号
 * 不绘制全部格的虚线框，避免与框架线条重复。
 * 全部 pointer-events: none —— 命中判定由 KumikoCanvas 负责（findSlotAt）。
 */
import { computed } from 'vue'

const props = defineProps({
  slots: { type: Array, default: () => [] },
  occupancy: { type: Object, default: () => ({}) },
  selectedKey: { type: String, default: null },
  zoom: { type: Number, required: true }
})

const filled = computed(() =>
  props.slots.filter((s) => props.occupancy[s.key] && s.key !== props.selectedKey)
)

const selected = computed(() => props.slots.find((s) => s.key === props.selectedKey) || null)

const strokeW = computed(() => 1.6 / props.zoom)
const fontMm = computed(() => 11 / props.zoom)
</script>

<template>
  <g class="kd-slots" style="pointer-events: none">
    <!-- 已填充单元格：极淡底 -->
    <rect
      v-for="s in filled"
      :key="`f-${s.key}`"
      :x="s.rect.x"
      :y="s.rect.y"
      :width="s.rect.w"
      :height="s.rect.h"
      fill="rgba(47,111,208,0.05)"
    />

    <!-- 选中单元格：高亮 + 行列号 -->
    <g v-if="selected">
      <rect
        :x="selected.rect.x"
        :y="selected.rect.y"
        :width="selected.rect.w"
        :height="selected.rect.h"
        fill="rgba(47,111,208,0.12)"
        stroke="#2f6fd0"
        :stroke-width="strokeW"
      />
      <text
        :x="selected.rect.x + selected.rect.w / 2"
        :y="selected.rect.y + selected.rect.h / 2"
        :font-size="fontMm"
        fill="#1f4e9c"
        text-anchor="middle"
        dominant-baseline="middle"
        :stroke="'#fff'"
        :stroke-width="Math.max(0.8, 3 / zoom)"
        paint-order="stroke"
        stroke-linejoin="round"
      >
        第 {{ selected.row + 1 }} 行 · 第 {{ selected.col + 1 }} 列
      </text>
    </g>
  </g>
</template>
