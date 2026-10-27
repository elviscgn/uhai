<script setup lang="ts">
import { computed } from 'vue'
import { X, Crosshair, ScanLine, ArrowUpRight } from '@lucide/vue'
import { useLaboratory } from '../stores/laboratory'
import NeuralNetwork from './NeuralNetwork.vue'
import FishGlyph from './FishGlyph.vue'
const lab = useLaboratory()
const a = computed(() => lab.creature)
const isPredator = computed(() => a.value?.[1] === 0)
const speed = computed(() => (a.value ? Math.hypot(a.value[4], a.value[5]) : 0))
const observations = computed(() => {
  const x = lab.neural?.agent.observation
  if (!x) return []
  return [
    { label: isPredator.value ? 'Nearest prey' : 'Nearest predator', x: 4, flag: 8 },
    { label: 'Nearest kin', x: 9, flag: 13 },
    { label: 'Food resource', x: 14, flag: 16 },
    { label: 'Obstacle', x: 17, flag: 20 },
  ].map((v) => ({
    label: v.label,
    visible: x[v.flag] > 0,
    distance: Math.hypot(x[v.x], x[v.x + 1]) * (lab.current?.config.world.perception ?? 0),
  }))
})
const actions = computed(() => lab.neural?.brain.actions ?? [0, 0])
</script>

<template>
  <aside v-if="a" class="inspector" aria-label="Creature inspector" data-world-ui>
    <div class="inspector-top">
      <span class="eyebrow">FIELD NOTES / ORGANISM</span
      ><button class="icon-button" aria-label="Close inspector" @click="lab.inspect(null)">
        <X :size="17" />
      </button>
    </div>
    <div class="specimen-heading">
      <FishGlyph class="specimen-glyph" :predator="isPredator" />
      <div>
        <h2>
          {{ isPredator ? 'Predator' : 'Prey' }} <em>{{ String(a[0]).padStart(3, '0') }}</em>
        </h2>
        <p>{{ a[8] ? 'Living neural organism' : 'Life ended in this episode' }}</p>
      </div>
    </div>
    <div class="genome-identity">
      <span>GENOME</span
      ><code
        >{{ isPredator ? 'P' : 'Q' }}.{{
          String(isPredator ? lab.generation : (lab.opponentGeneration ?? lab.generation)).padStart(
            3,
            '0',
          )
        }}.{{ String(a[9]).padStart(3, '0') }}</code
      ><span>706 PARAMETERS</span>
    </div>
    <div class="inspection-actions">
      <button
        :class="{ active: lab.tracking }"
        :aria-pressed="lab.tracking"
        @click="lab.tracking = !lab.tracking"
      >
        <Crosshair :size="13" /> Follow</button
      ><button
        :class="{ active: lab.sensors }"
        :aria-pressed="lab.sensors"
        @click="lab.sensors = !lab.sensors"
      >
        <ScanLine :size="13" /> Perception
      </button>
    </div>
    <div class="energy-label">
      <span>Energy reserve</span><strong>{{ Math.round(a[7] * 100) }}<small>%</small></strong>
    </div>
    <div class="energy-track"><div :style="{ width: `${a[7] * 100}%` }" /></div>
    <div class="vital-grid">
      <div>
        <span>Speed</span><strong>{{ speed.toFixed(1) }} <small>u/s</small></strong>
      </div>
      <div>
        <span>Survived</span><strong>{{ a[10].toFixed(1) }} <small>s</small></strong>
      </div>
      <div>
        <span>{{ isPredator ? 'Captures' : 'Food collected' }}</span
        ><strong>{{ isPredator ? a[12] : a[11] }}</strong>
      </div>
      <div>
        <span>Heading</span
        ><strong>{{ (((a[6] * 180) / Math.PI + 360) % 360).toFixed(0) }}<small>°</small></strong>
      </div>
    </div>
    <div class="instrument-title">
      <h3>The neural policy</h3>
      <span>24 → 16 → 16 → 2</span>
    </div>
    <div v-if="lab.inspecting" class="inspector-loading">Reconstructing neural decisions…</div>
    <NeuralNetwork
      v-else-if="lab.trace?.weights"
      :weights="lab.trace.weights"
      :trace="lab.neural"
    />
    <div v-if="lab.neural" class="decision-panel">
      <div>
        <span>Steering</span
        ><strong>{{ actions[0] > 0 ? '+' : '' }}{{ actions[0].toFixed(3) }}</strong>
      </div>
      <div>
        <span>Thrust</span><strong>{{ (((actions[1] + 1) / 2) * 100).toFixed(1) }}%</strong>
      </div>
      <p>
        {{
          lab.neural.step === 0
            ? 'Before the first decision; inputs are uninitialized.'
            : `Last neural decision at step ${lab.neural.observation_step}.`
        }}
        {{ !a[8] ? 'Final decision retained after death.' : '' }}
      </p>
    </div>
    <div class="instrument-title">
      <h3>Within perception</h3>
      <ArrowUpRight :size="13" />
    </div>
    <div class="sensor-list">
      <div v-for="obs in observations" :key="obs.label">
        <span>{{ obs.label }}</span
        ><strong>{{ obs.visible ? `${obs.distance.toFixed(1)} u` : 'Not visible' }}</strong>
      </div>
    </div>
    <p class="micro-note inspection-footnote">
      The brain receives local observations only. Episode events are shown here; generation fitness
      is averaged across evaluation episodes.
    </p>
  </aside>
</template>
