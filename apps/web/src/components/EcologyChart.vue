<script setup lang="ts">
import { computed } from 'vue'
import type { Report } from '../types'
const props = defineProps<{
  history: Report[]
  available: number[]
  metric: 'captures' | 'survival'
}>()
const emit = defineEmits<{ observe: [generation: number] }>()
const value = (r: Report) =>
  props.metric === 'captures' ? r.ecology.captures_per_predator : r.ecology.prey_survival_seconds
const lastGeneration = computed(() => Math.max(1, ...props.history.map((r) => r.generation)))
const maximum = computed(() => Math.max(1, ...props.history.map(value)) * 1.12)
const x = (generation: number) => 42 + (generation / lastGeneration.value) * 560
const y = (score: number) => 200 - (score / maximum.value) * 168
const path = computed(() =>
  props.history.map((r, i) => `${i ? 'L' : 'M'}${x(r.generation)},${y(value(r))}`).join(' '),
)
const saved = computed(() => props.history.filter((r) => props.available.includes(r.generation)))
const unit = computed(() =>
  props.metric === 'captures' ? 'CAPTURES PER PREDATOR' : 'AVERAGE LIFETIME · SECONDS',
)
</script>

<template>
  <div class="fitness-chart ecology-chart">
    <svg
      viewBox="0 0 630 235"
      role="group"
      :aria-label="`${unit} by generation. Marked generations can be opened as recorded episodes.`"
    >
      <text x="42" y="14">{{ unit }}</text>
      <g v-for="tick in [0, 1, 2, 3, 4]" :key="tick">
        <line
          x1="42"
          x2="602"
          :y1="32 + tick * 42"
          :y2="32 + tick * 42"
          stroke="#d7dccd"
          stroke-width=".6"
        />
        <text x="32" :y="36 + tick * 42" text-anchor="end">
          {{ (maximum * (1 - tick / 4)).toFixed(1) }}
        </text>
      </g>
      <path
        :d="path"
        fill="none"
        :stroke="metric === 'captures' ? '#b56945' : '#58775b'"
        stroke-width="2"
      />
      <g
        v-for="r in saved"
        :key="r.generation"
        class="generation-marker"
        role="button"
        tabindex="0"
        :aria-label="`Watch generation ${r.generation}: ${value(r).toFixed(2)} ${metric === 'captures' ? 'captures per predator' : 'seconds average prey lifetime'}`"
        @click="emit('observe', r.generation)"
        @keydown.enter="emit('observe', r.generation)"
        @keydown.space.prevent="emit('observe', r.generation)"
      >
        <circle :cx="x(r.generation)" :cy="y(value(r))" r="9" fill="transparent" />
        <circle
          :cx="x(r.generation)"
          :cy="y(value(r))"
          r="2.7"
          fill="#f8f6ee"
          :stroke="metric === 'captures' ? '#b56945' : '#58775b'"
          stroke-width="1.2"
        />
        <title>
          Generation {{ r.generation }} · {{ value(r).toFixed(2) }}
          {{ metric === 'captures' ? 'captures per predator' : 'seconds average prey lifetime' }} ·
          click to watch
        </title>
      </g>
      <text x="42" y="225">0</text>
      <text x="602" y="225" text-anchor="end">{{ history.at(-1)?.generation ?? 0 }}</text>
      <text x="322" y="225" text-anchor="middle">GENERATION</text>
    </svg>
  </div>
</template>
