<script setup>
/**
 * InteractionLayer —— 框选矩形 + 画线族/单线草稿预览 + 图案库放置预览
 */
import { computed } from 'vue'

const props = defineProps({
  rubber: { type: Object, default: null }, // {x1,y1,x2,y2} mm
  draft: { type: Object, default: null }, // {kind:'family'|'line', ...}
  dragHints: { type: Array, default: () => [] }, // [{x,y,text,kind}] 拖拽提示（端点/等距/间距）
  zoom: { type: Number, required: true },
  /** 图案库放置预览：目标矩形（mm） */
  placeRect: { type: Object, default: null },
  /** 放置预览的派生线段 */
  placeSegments: { type: Array, default: () => [] },
  /** 放置预览文案（模块名 + 参数摘要） */
  placeLabel: { type: String, default: '' },
  /** 是否吸附到槽位（预览配色区分） */
  placeSnapped: { type: Boolean, default: false }
})

const rubberNorm = computed(() => {
  if (!props.rubber) return null
  return {
    x: Math.min(props.rubber.x1, props.rubber.x2),
    y: Math.min(props.rubber.y1, props.rubber.y2),
    w: Math.abs(props.rubber.x2 - props.rubber.x1),
    h: Math.abs(props.rubber.y2 - props.rubber.y1)
  }
})

const isLineDraft = computed(() => props.draft && props.draft.kind === 'line')

const familyDraft = computed(() => {
  const d = props.draft
  if (!d || d.kind !== 'family') return null
  const rad = Math.max(d.radius, 15)
  const endX = d.x + Math.cos((d.angle * Math.PI) / 180) * rad
  const endY = d.y + Math.sin((d.angle * Math.PI) / 180) * rad
  return {
    cx: d.x,
    cy: d.y,
    angle: d.angle,
    endX,
    endY,
    bounds: {
      x: d.x - rad,
      y: d.y - rad,
      size: rad * 2
    }
  }
})

const lineDraftInfo = computed(() => {
  const d = props.draft
  if (!d || d.kind !== 'line') return null
  const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1)
  return {
    x1: d.x1,
    y1: d.y1,
    x2: d.x2,
    y2: d.y2,
    length: len
  }
})
</script>

<template>
  <g class="kd-interaction">
    <!-- 图案库放置预览 -->
    <g v-if="placeRect" style="pointer-events: none">
      <rect
        :x="placeRect.x"
        :y="placeRect.y"
        :width="placeRect.w"
        :height="placeRect.h"
        :fill="placeSnapped ? 'rgba(47,111,208,0.10)' : 'rgba(24,160,88,0.06)'"
        :stroke="placeSnapped ? '#2f6fd0' : '#18a058'"
        :stroke-width="1.6 / zoom"
        :stroke-dasharray="`${6 / zoom} ${4 / zoom}`"
      />
      <line
        v-for="(s, i) in placeSegments"
        :key="`ps-${i}`"
        :x1="s.x1"
        :y1="s.y1"
        :x2="s.x2"
        :y2="s.y2"
        :stroke="placeSnapped ? '#2f6fd0' : '#18a058'"
        :stroke-width="Math.max(0.5, s.width || 3)"
        stroke-opacity="0.45"
      />
      <text
        :x="placeRect.x + 4 / zoom"
        :y="placeRect.y - 6 / zoom"
        :font-size="11 / zoom"
        :fill="placeSnapped ? '#1f4e9c' : '#0f7c43'"
        stroke="#fff"
        :stroke-width="Math.max(0.8, 3 / zoom)"
        paint-order="stroke"
        stroke-linejoin="round"
      >
        {{ placeLabel }}
      </text>
    </g>

    <!-- 框选 -->
    <rect
      v-if="rubberNorm"
      :x="rubberNorm.x"
      :y="rubberNorm.y"
      :width="rubberNorm.w"
      :height="rubberNorm.h"
      fill="rgba(47,111,208,0.08)"
      stroke="#2f6fd0"
      :stroke-width="1 / zoom"
      stroke-dasharray="4 3"
      style="pointer-events: none"
    />

    <!-- 画线族草稿 -->
    <template v-if="familyDraft">
      <rect
        :x="familyDraft.bounds.x"
        :y="familyDraft.bounds.y"
        :width="familyDraft.bounds.size"
        :height="familyDraft.bounds.size"
        fill="none"
        stroke="#2f6fd0"
        :stroke-width="1 / zoom"
        stroke-dasharray="6 4"
        style="pointer-events: none"
      />
      <line
        :x1="familyDraft.cx"
        :y1="familyDraft.cy"
        :x2="familyDraft.endX"
        :y2="familyDraft.endY"
        stroke="#2f6fd0"
        :stroke-width="1.5 / zoom"
        style="pointer-events: none"
      />
      <circle :cx="familyDraft.cx" :cy="familyDraft.cy" :r="2.5 / zoom" fill="#2f6fd0" />
      <text
        :x="familyDraft.cx"
        :y="familyDraft.cy - 8 / zoom"
        :font-size="10 / zoom"
        fill="#2f6fd0"
        text-anchor="middle"
        style="pointer-events: none"
      >
        {{ familyDraft.angle }}°
      </text>
    </template>

    <!-- 画单线草稿 -->
    <template v-if="lineDraftInfo">
      <line
        :x1="lineDraftInfo.x1"
        :y1="lineDraftInfo.y1"
        :x2="lineDraftInfo.x2"
        :y2="lineDraftInfo.y2"
        stroke="#2f6fd0"
        :stroke-width="1.5 / zoom"
        style="pointer-events: none"
      />
      <circle :cx="lineDraftInfo.x1" :cy="lineDraftInfo.y1" :r="2.5 / zoom" fill="#2f6fd0" />
      <circle :cx="lineDraftInfo.x2" :cy="lineDraftInfo.y2" :r="2.5 / zoom" fill="#fff" stroke="#2f6fd0" :stroke-width="1.5 / zoom" />
      <text
        v-if="lineDraftInfo.length >= 5"
        :x="(lineDraftInfo.x1 + lineDraftInfo.x2) / 2"
        :y="(lineDraftInfo.y1 + lineDraftInfo.y2) / 2 - 6 / zoom"
        :font-size="10 / zoom"
        fill="#2f6fd0"
        text-anchor="middle"
        style="pointer-events: none"
      >
        {{ lineDraftInfo.length.toFixed(1) }}
      </text>
    </template>

    <!-- 拖拽中的提示（多条可并存，纵向错开） -->
    <g v-for="(hint, hi) in dragHints" :key="hi" style="pointer-events: none">
      <template v-if="hint.kind === 'equal'">
        <!-- 等距对齐：绿色双线 -->
        <line :x1="hint.x - 9 / zoom" :y1="hint.y - 3 / zoom" :x2="hint.x + 9 / zoom" :y2="hint.y - 3 / zoom" stroke="#2e9e5b" :stroke-width="1.6 / zoom" />
        <line :x1="hint.x - 9 / zoom" :y1="hint.y + 3 / zoom" :x2="hint.x + 9 / zoom" :y2="hint.y + 3 / zoom" stroke="#2e9e5b" :stroke-width="1.6 / zoom" />
      </template>
      <template v-else-if="hint.kind === 'endpoint'">
        <!-- 端点对齐：蓝色十字 -->
        <circle :cx="hint.x" :cy="hint.y" :r="4.5 / zoom" fill="none" stroke="#2f6fd0" :stroke-width="1.4 / zoom" />
        <line :x1="hint.x - 8 / zoom" :y1="hint.y" :x2="hint.x + 8 / zoom" :y2="hint.y" stroke="#2f6fd0" :stroke-width="1.2 / zoom" />
        <line :x1="hint.x" :y1="hint.y - 8 / zoom" :x2="hint.x" :y2="hint.y + 8 / zoom" stroke="#2f6fd0" :stroke-width="1.2 / zoom" />
      </template>
      <!-- 气泡（多个时纵向错开 22px 屏幕） -->
      <rect
        :x="hint.x"
        :y="hint.y - 18 / zoom - hi * 22 / zoom"
        :width="hint.text.length * 6.2 / zoom + 8 / zoom"
        :height="16 / zoom"
        rx="3 / zoom"
        :fill="hint.kind === 'equal' ? 'rgba(232,246,238,0.97)' : hint.kind === 'endpoint' ? 'rgba(235,242,255,0.97)' : 'rgba(255,247,224,0.92)'"
        :stroke="hint.kind === 'equal' ? '#2e9e5b' : hint.kind === 'endpoint' ? '#2f6fd0' : '#d4a017'"
        :stroke-width="1 / zoom"
      />
      <text
        :x="hint.x + 4 / zoom"
        :y="hint.y - 6 / zoom - hi * 22 / zoom"
        :font-size="10 / zoom"
        :fill="hint.kind === 'equal' ? '#1e6b3d' : hint.kind === 'endpoint' ? '#1f4e9c' : '#7a5b00'"
      >
        {{ hint.text }}
      </text>
    </g>
  </g>
</template>
