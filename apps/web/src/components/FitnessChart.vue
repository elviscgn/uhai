<script setup lang="ts">
import { computed } from 'vue'
import type { Report, Species } from '../types'
const props = defineProps<{ history: Report[]; species: Species }>()
const bounds = computed(() => {
  const values = props.history
    .flatMap((r) => [
      r.contemporary[props.species].mean,
      r.contemporary[props.species].best,
      r.reference?.[props.species],
      r.held_out?.[props.species],
    ])
    .filter((v): v is number => v !== null && v !== undefined)
  return { min: Math.min(0, ...values), max: Math.max(1, ...values) * 1.12 }
})
const x = (g: number) => 42 + (g / Math.max(1, ...props.history.map((r) => r.generation))) * 560
const y = (v: number) =>
  200 - ((v - bounds.value.min) / (bounds.value.max - bounds.value.min)) * 172
const path = (key: 'mean' | 'best') =>
  props.history
    .map((r, i) => `${i ? 'L' : 'M'}${x(r.generation)},${y(r.contemporary[props.species][key])}`)
    .join(' ')
const assessments = computed(() => props.history.filter((r) => r.reference !== null))
</script>

<template>
  <div class="fitness-chart">
    <svg
      viewBox="0 0 630 235"
      role="img"
      :aria-label="`${species === 0 ? 'Predator' : 'Prey'} selection scores in points over evaluated generations. These scores select parents; they are not remaining energy. Reference tests are circles and unseen-environment tests are diamonds.`"
    >
      <text x="42" y="13">SELECTION SCORE · POINTS</text>
      <g v-for="tick in [0, 1, 2, 3, 4]" :key="tick">
        <line
          x1="42"
          x2="602"
          :y1="28 + tick * 43"
          :y2="28 + tick * 43"
          stroke="#d7dccd"
          stroke-width=".6"
        />
        <text x="32" :y="32 + tick * 43" text-anchor="end">
          {{ (bounds.max - (tick * (bounds.max - bounds.min)) / 4).toFixed(1) }}
        </text>
      </g>
      <path
        :d="path('best')"
        fill="none"
        :stroke="species === 0 ? '#b56945' : '#58775b'"
        stroke-opacity=".25"
        stroke-width="1.5"
      />
      <path
        :d="path('mean')"
        fill="none"
        :stroke="species === 0 ? '#b56945' : '#58775b'"
        stroke-width="2"
      />
      <g v-for="r in assessments" :key="r.generation">
        <circle
          :cx="x(r.generation)"
          :cy="y(r.reference![species])"
          r="3.5"
          fill="#f7f7ed"
          stroke="#67715a"
          stroke-width="1.2"
        >
          <title>
            Generation {{ r.generation }} · fixed reference {{ r.reference![species].toFixed(3) }}
          </title>
        </circle>
        <path
          :d="`M${x(r.generation)},${y(r.held_out![species]) - 4}l4,4l-4,4l-4,-4Z`"
          fill="#a18b58"
        >
          <title>
            Generation {{ r.generation }} · held-out champion match
            {{ r.held_out![species].toFixed(3) }}
          </title>
        </path>
      </g>
      <text x="42" y="225">0</text>
      <text x="602" y="225" text-anchor="end">{{ history.at(-1)?.generation ?? 0 }}</text>
      <text x="322" y="225" text-anchor="middle">GENERATION</text>
    </svg>
  </div>
</template>
