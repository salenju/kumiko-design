<script setup>
/**
 * InteractionLayer —— 框选矩形 + 画线族/单线草稿预览
 */
import { computed } from 'vue'

const props = defineProps({
  rubber: { type: Object, default: null }, // {x1,y1,x2,y2} mm
  draft: { type: Object, default: null }, // {kind:'family'|'line', ...}
  dragHint: { type: Object, default: null }, // {x,y,text} 拖拽中的间距提示
  zoom: { type: Number, required: true }
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

    <!-- 拖拽中的间距提示 -->
    <g v-if="dragHint" style="pointer-events: none">
      <rect
        :x="dragHint.x"
        :y="dragHint.y - 18 / zoom"
        :width="dragHint.text.length * 6.2 / zoom + 8 / zoom"
        :height="16 / zoom"
        rx="3 / zoom"
        fill="rgba(255,247,224,0.92)"
        stroke="#d4a017"
        :stroke-width="1 / zoom"
      />
      <text
        :x="dragHint.x + 4 / zoom"
        :y="dragHint.y - 6 / zoom"
        :font-size="10 / zoom"
        fill="#7a5b00"
      >
        {{ dragHint.text }}
      </text>
    </g>
  </g>
</template>
