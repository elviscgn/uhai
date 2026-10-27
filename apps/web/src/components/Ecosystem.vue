<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { Crosshair, Maximize, Minus, Plus, ScanLine, Route } from '@lucide/vue'
import { useLaboratory } from '../stores/laboratory'
import { EcosystemRenderer } from '../rendering/EcosystemRenderer'
import type { RenderMetrics } from '../rendering/EcosystemRenderer'

const lab = useLaboratory()
const host = ref<HTMLElement>()
const metrics = ref<RenderMetrics>({
  fps: 0,
  frameMs: 0,
  p95FrameMs: 0,
  sprites: 0,
  samples: 0,
  agents: 0,
  drawnAgents: 0,
  cacheFrames: 0,
  frameCount: 0,
  windowMs: 0,
})
const renderError = ref('')
let renderer: EcosystemRenderer | null = null
function fitHabitat() {
  lab.tracking = false
  renderer?.fit()
}
onMounted(async () => {
  renderer = new EcosystemRenderer(
    host.value!,
    () => ({
      recording: lab.recording,
      time: lab.time,
      playing: lab.playing,
      speed: lab.speed,
      selected: lab.selected,
      sensors: lab.sensors,
      trails: lab.trails,
      tracking: lab.tracking,
      neural: lab.neural,
    }),
    (time, ended) => lab.advancePlayback(time, ended),
    (id) => {
      void lab.inspect(id)
    },
    (value) => {
      metrics.value = value
    },
    () => {
      lab.tracking = false
    },
  )
  try {
    await renderer.init()
  } catch (e) {
    renderError.value = `Renderer could not initialize: ${String(e)}`
  }
})
onUnmounted(() => renderer?.destroy())
defineExpose({ metrics })
</script>

<template>
  <div class="ecosystem" data-testid="ecosystem">
    <div ref="host" class="canvas-host" />
    <div class="world-caption" data-world-ui>
      Habitat
      <span>{{ lab.current?.config.world.width }} × {{ lab.current?.config.world.height }}</span>
    </div>
    <div class="camera-tools" data-world-ui>
      <button title="Zoom in" aria-label="Zoom in" @click="renderer?.zoomBy(1.3)">
        <Plus :size="16" />
      </button>
      <button title="Zoom out" aria-label="Zoom out" @click="renderer?.zoomBy(1 / 1.3)">
        <Minus :size="16" />
      </button>
      <button title="Reset view to fill habitat" aria-label="Fit habitat" @click="fitHabitat">
        <Maximize :size="15" />
      </button>
      <span />
      <button
        title="Show sensory field of selected organism"
        aria-label="Toggle sensors"
        :aria-pressed="lab.sensors"
        :class="{ active: lab.sensors }"
        @click="lab.sensors = !lab.sensors"
      >
        <ScanLine :size="16" />
      </button>
      <button
        title="Show recent trajectories"
        aria-label="Toggle trails"
        :aria-pressed="lab.trails"
        :class="{ active: lab.trails }"
        @click="lab.trails = !lab.trails"
      >
        <Route :size="16" />
      </button>
      <button
        title="Follow selected organism"
        aria-label="Track organism"
        :disabled="lab.selected === null"
        :aria-pressed="lab.tracking"
        :class="{ active: lab.tracking }"
        @click="lab.tracking = !lab.tracking"
      >
        <Crosshair :size="16" />
      </button>
    </div>
    <div
      class="render-stat"
      data-world-ui
      :data-render-metrics="JSON.stringify(metrics)"
      :title="`Canvas draw ${metrics.frameMs.toFixed(2)} ms; p95 frame interval ${metrics.p95FrameMs.toFixed(2)} ms; ${metrics.agents} active agents; ${metrics.cacheFrames} cached fish frames.`"
    >
      {{ metrics.fps ? Math.round(metrics.fps) : '—' }} fps
    </div>
    <div v-if="lab.loading || !lab.recording || renderError" class="world-loading" role="status">
      <span v-if="!renderError" class="loading-orbit" />
      <p>
        {{ renderError || (lab.loading ? 'Loading recorded episode…' : 'Preparing habitat…') }}
      </p>
    </div>
    <slot />
  </div>
</template>
