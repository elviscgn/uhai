<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  CircleHelp,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Repeat,
  X,
} from '@lucide/vue'
import { useLaboratory } from './stores/laboratory'
import BrandLockup from './components/BrandLockup.vue'
import FishGlyph from './components/FishGlyph.vue'
import Ecosystem from './components/Ecosystem.vue'
import CreatureInspector from './components/CreatureInspector.vue'
import ExperimentDialog from './components/ExperimentDialog.vue'
import EvolutionView from './views/EvolutionView.vue'
import LaboratoryView from './views/LaboratoryView.vue'

const lab = useLaboratory()
const view = ref<'observatory' | 'evolution' | 'laboratory'>('observatory')
const configuring = ref(false)
const about = ref(false)
const counts = computed(() =>
  [0, 1].map((s) => (lab.frame?.agents ?? []).filter((a) => a[1] === s && a[8]).length),
)
const foodCount = computed(() => lab.frame?.food.filter(Boolean).length ?? 0)
const selectedReport = computed(() => lab.history.find((r) => r.generation === lab.generation))
const status = computed(
  () =>
    ({
      ready: 'Ready',
      running: 'Training in background',
      pausing: 'Saving generation…',
      paused: 'Training paused',
      completed: 'Training complete',
      interrupted: 'Checkpoint recovered',
      error: 'Training error',
    })[lab.current?.status ?? 'ready'],
)
const clock = (t: number) =>
  `${Math.floor(t / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(t % 60)
    .toString()
    .padStart(2, '0')}`
function reconnect() {
  lab.error = ''
  void lab.initialize()
}
function restartPlayback() {
  lab.time = 0
  lab.playing = true
}
function closeConfiguration() {
  configuring.value = false
  view.value = 'observatory'
}
function exploreExperiments() {
  about.value = false
  view.value = 'laboratory'
}
function togglePlay() {
  if (lab.time >= lab.duration) {
    lab.time = 0
    lab.playing = true
  } else lab.playing = !lab.playing
}
function keydown(event: KeyboardEvent) {
  if (event.code === 'Escape') {
    about.value = false
    void lab.inspect(null)
    return
  }
  const target = event.target as HTMLElement
  if (
    ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName) ||
    configuring.value ||
    about.value
  )
    return
  if (event.code === 'Space' && view.value === 'observatory') {
    event.preventDefault()
    togglePlay()
  }
}
onMounted(() => {
  void lab.initialize()
  window.addEventListener('keydown', keydown)
})
onUnmounted(() => {
  lab.dispose()
  window.removeEventListener('keydown', keydown)
})
</script>

<template>
  <div class="app-shell" :class="{ 'is-observing': view === 'observatory' }">
    <header class="app-header">
      <a class="brand" href="#" aria-label="Uhai observatory" @click.prevent="view = 'observatory'"
        ><BrandLockup
      /></a>
      <nav aria-label="Main navigation">
        <button :class="{ current: view === 'observatory' }" @click="view = 'observatory'">
          Observatory
        </button>
        <button :class="{ current: view === 'evolution' }" @click="view = 'evolution'">
          Evolution
        </button>
        <button :class="{ current: view === 'laboratory' }" @click="view = 'laboratory'">
          Experiments
        </button>
      </nav>
      <div class="header-right">
        <button class="icon-button" aria-label="About Uhai" @click="about = true">
          <CircleHelp :size="18" />
        </button>
      </div>
    </header>
    <main :class="{ 'observatory-main': view === 'observatory' }">
      <div v-if="lab.error" role="alert" class="error-banner">
        <span>{{ lab.error }}</span
        ><button @click="reconnect">Reconnect</button
        ><button aria-label="Dismiss error" @click="lab.error = ''"><X :size="16" /></button>
      </div>
      <template v-if="view === 'observatory'">
        <section class="experiment-bar">
          <div class="experiment-title">
            <span class="eyebrow">COEVOLUTION</span>
            <h1>Predator <span>/</span> Prey</h1>
          </div>
          <div class="experiment-picker">
            <select
              :value="lab.current?.id"
              aria-label="Choose experiment"
              @change="lab.choose(($event.target as HTMLSelectElement).value)"
            >
              <option
                v-for="experiment in lab.experiments"
                :key="experiment.id"
                :value="experiment.id"
              >
                {{ experiment.name }}
              </option></select
            ><ChevronDown :size="14" /><button
              class="icon-button"
              aria-label="Create experiment"
              title="New experiment"
              @click="configuring = true"
            >
              <Plus :size="18" />
            </button>
          </div>
          <div class="training-controls">
            <span class="trainer-status">{{ status }}</span
            ><button
              v-if="lab.current?.status !== 'completed'"
              class="button primary train-button"
              :disabled="!lab.current || lab.current.status === 'pausing'"
              @click="lab.command(lab.running ? 'pause' : 'start')"
            >
              <Pause v-if="lab.running" :size="14" /><Play v-else :size="14" />{{
                lab.running ? 'Pause training' : 'Start training'
              }}</button
            ><button v-else class="button primary" @click="configuring = true">
              New experiment <Plus :size="14" />
            </button>
          </div>
        </section>
        <div class="observatory-frame" :class="{ 'has-inspector': lab.selected !== null }">
          <Ecosystem />
          <div class="population-key" aria-label="Current population" data-world-ui>
            <div class="population-row">
              <FishGlyph class="species-symbol" predator /><span>Predators</span
              ><strong>{{ counts[0] }}</strong>
            </div>
            <div class="population-row">
              <FishGlyph class="species-symbol" /><span>Prey</span><strong>{{ counts[1] }}</strong>
            </div>
            <div class="population-row resource-row">
              <span class="resource-symbol"><i /><i /><i /></span><span>Resources</span
              ><strong>{{ foodCount }}</strong>
            </div>
          </div>
          <div class="episode-tag" data-world-ui>
            <span class="episode-kind">Recorded episode</span>
            <span class="tag-separator">/</span
            ><span class="episode-seed">Seed {{ lab.recording?.seed ?? '—' }}</span>
          </div>
          <CreatureInspector />
        </div>
        <section class="playback-strip" aria-label="Playback controls">
          <div class="generation-readout">
            <span>Generation</span><strong>{{ String(lab.generation).padStart(3, '0') }}</strong
            ><small
              >{{ selectedReport ? 'Evaluated' : 'Random founders'
              }}<template v-if="lab.opponentGeneration !== null">
                · prey {{ lab.opponentGeneration }}</template
              ></small
            >
          </div>
          <div class="playback-controls">
            <button
              class="icon-button"
              aria-label="Replay from beginning"
              :disabled="!lab.recording"
              @click="restartPlayback"
            >
              <RotateCcw :size="17" /></button
            ><button
              class="play-button"
              :aria-label="lab.playing ? 'Pause playback' : 'Play playback'"
              :disabled="!lab.recording"
              @click="togglePlay"
            >
              <Pause v-if="lab.playing" :size="17" fill="currentColor" /><Play
                v-else
                :size="17"
                fill="currentColor"
              /></button
            ><span class="playback-time">{{ clock(lab.time) }}</span
            ><input
              v-model.number="lab.time"
              class="timeline-range"
              type="range"
              min="0"
              :max="lab.duration || 1"
              step="0.01"
              aria-label="Episode position"
            /><span class="duration">{{ clock(lab.duration) }}</span>
            <div class="playback-speeds" role="group" aria-label="Playback speed">
              <button
                v-for="speed in [1, 2, 4, 8]"
                :key="speed"
                :aria-label="`Playback ${speed} times speed`"
                :aria-pressed="lab.speed === speed"
                :class="{ active: lab.speed === speed }"
                @click="lab.speed = speed"
              >
                {{ speed }}×
              </button>
            </div>
            <button
              class="playback-loop"
              :class="{ active: lab.loopPlayback }"
              :aria-pressed="lab.loopPlayback"
              title="Repeat this recorded episode"
              @click="lab.loopPlayback = !lab.loopPlayback"
            >
              <Repeat :size="15" /> Loop
            </button>
          </div>
          <span class="interaction-hint"><kbd>space</kbd> pause <span>·</span> Click a fish</span>
        </section>
        <section class="generation-timeline">
          <span class="timeline-caption"
            >Generations <small>{{ lab.history.length }} evaluated</small></span
          >
          <div class="generation-stops">
            <button
              v-for="g in lab.current?.generations ?? [0]"
              :key="g"
              :class="{ selected: lab.generation === g }"
              :aria-label="`Observe generation ${g}`"
              :aria-pressed="lab.generation === g"
              @click="lab.observe(g)"
            >
              {{ String(g).padStart(3, '0') }}</button
            ><span v-if="!lab.history.length" class="timeline-empty"
              >Start training to evolve the founder populations.</span
            >
          </div>
          <button class="text-link" @click="view = 'evolution'">
            Evolution record <ArrowRight :size="15" />
          </button>
        </section>
      </template>
      <EvolutionView v-else-if="view === 'evolution'" @observe="view = 'observatory'" />
      <LaboratoryView v-else @create="configuring = true" @observe="view = 'observatory'" />
    </main>
    <ExperimentDialog v-if="configuring" @close="closeConfiguration" />
    <div v-if="about" class="about-backdrop" @click.self="about = false">
      <section class="about-panel" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <button class="icon-button close-about" aria-label="Close about" @click="about = false">
          <X :size="20" /></button
        ><BrandLockup />
        <h2 id="about-title">An artificial life laboratory.</h2>
        <p>
          Uhai means life in Kiswahili. Observe neural organisms, evolve their populations, and
          compare the evidence across generations.
        </p>
        <p>
          Movement comes from real neural policies. Selection changes their weights. Complex
          behaviour and improvement remain experimental outcomes.
        </p>
        <button class="text-link" @click="exploreExperiments">
          Explore experiments <ArrowUpRight :size="15" />
        </button>
      </section>
    </div>
  </div>
</template>
