<script setup lang="ts">
import { computed } from 'vue'
import type { Trace } from '../types'
const props = defineProps<{ weights: number[]; trace: Trace | null }>()
const topology = [24, 16, 16, 2]
const point = (layer: number, index: number) => ({
  x: 20 + layer * 89,
  y: 16 + ((index + 0.5) * 176) / topology[layer],
})
const nodes = computed(() =>
  topology.flatMap((size, layer) =>
    Array.from({ length: size }, (_, i) => ({
      ...point(layer, i),
      layer,
      index: i,
      value: props.trace?.brain.layers[layer][i] ?? 0,
    })),
  ),
)
const edges = computed(() => {
  let offset = 0
  const result: { x1: number; y1: number; x2: number; y2: number; weight: number }[] = []
  for (let layer = 0; layer < topology.length - 1; layer++) {
    const inputs = topology[layer],
      outputs = topology[layer + 1]
    for (let j = 0; j < outputs; j++)
      for (let i = 0; i < inputs; i++) {
        const a = point(layer, i),
          b = point(layer + 1, j)
        result.push({
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          weight: props.weights[offset + j * (inputs + 1) + i],
        })
      }
    offset += (inputs + 1) * outputs
  }
  return result.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, 80)
})
</script>

<template>
  <div class="neural-network">
    <div class="network-labels"><span>SENSE</span><span>PROCESS</span><span>ACT</span></div>
    <svg
      viewBox="0 0 308 212"
      role="img"
      aria-label="Actual 24–16–16–2 neural network. The 80 strongest connections are shown; biases omitted. Node colour shows recorded activation."
    >
      <line
        v-for="(edge, i) in edges"
        :key="i"
        :x1="edge.x1"
        :y1="edge.y1"
        :x2="edge.x2"
        :y2="edge.y2"
        :stroke="edge.weight >= 0 ? '#58765b' : '#b56c47'"
        :stroke-opacity="Math.min(0.5, Math.abs(edge.weight) * 0.3)"
        stroke-width=".7"
      />
      <circle
        v-for="node in nodes"
        :key="`${node.layer}-${node.index}`"
        :cx="node.x"
        :cy="node.y"
        :r="node.layer === 3 ? 6 : node.layer === 0 ? 2.5 : 3.5"
        :fill="node.value >= 0 ? '#4b6e53' : '#b66b47'"
        :fill-opacity="0.18 + Math.abs(node.value) * 0.82"
        stroke="#faf9f0"
        stroke-width=".6"
      >
        <title>
          {{ ['Input', 'Hidden 1', 'Hidden 2', 'Action'][node.layer] }} {{ node.index }}:
          {{ node.value.toFixed(4) }}
        </title>
      </circle>
      <text
        v-for="(size, i) in topology"
        :key="i"
        :x="20 + i * 89"
        y="210"
        text-anchor="middle"
        fill="#7c8274"
        font-size="9"
      >
        {{ size }}
      </text>
    </svg>
    <p class="micro-note">
      80 strongest connections · biases omitted<br />Green positive, ochre negative · tanh
      activation
    </p>
  </div>
</template>
