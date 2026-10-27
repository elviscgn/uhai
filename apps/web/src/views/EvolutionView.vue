<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowUpRight, Play, GitCompareArrows } from '@lucide/vue'
import { useLaboratory } from '../stores/laboratory'
import FitnessChart from '../components/FitnessChart.vue'
import EcologyChart from '../components/EcologyChart.vue'
const emit = defineEmits<{ observe: [] }>()
const lab = useLaboratory()
const predator = ref(lab.generation),
  prey = ref(lab.generation),
  chosen = ref(lab.generation)
const available = computed(() => lab.current?.generations ?? [0])
const first = computed(() => available.value[0] ?? 0)
const latestGeneration = computed(() => available.value.at(-1) ?? 0)
const latest = computed(() => lab.history.at(-1))
const recent = computed(() => [...lab.history].reverse().slice(0, 12))
async function watch(g: number) {
  emit('observe')
  await lab.observe(g)
}
async function match() {
  emit('observe')
  await lab.observe(predator.value, prey.value)
}
</script>

<template>
  <div class="research-view evolution-view">
    <div class="research-intro evolution-intro">
      <div>
        <span class="eyebrow">EVOLUTION</span>
        <h1>Watch what changed</h1>
      </div>
      <p>Pick a saved generation to see its fish in the Observatory.</p>
    </div>
    <section class="generation-viewer" aria-label="Watch an evolutionary generation">
      <button class="button outline" :disabled="!lab.current" @click="watch(first)">
        <Play :size="14" />{{ first === 0 ? 'Watch founders' : 'Watch earliest'
        }}<span>Gen {{ first }}</span>
      </button>
      <button class="button primary" :disabled="!lab.current" @click="watch(latestGeneration)">
        <Play :size="14" /> Watch latest <span>Gen {{ latestGeneration }}</span>
      </button>
      <div class="generation-choice">
        <label for="generation-watch">Or choose a generation</label
        ><select id="generation-watch" v-model.number="chosen">
          <option v-for="g in available" :key="g" :value="g">Generation {{ g }}</option></select
        ><button class="text-link" @click="watch(chosen)">
          Watch fish <ArrowUpRight :size="15" />
        </button>
      </div>
    </section>
    <div v-if="!lab.history.length" class="empty-research">
      <h2>The founders have not been evaluated yet</h2>
      <p>
        You can watch their random neural policies now. Training evaluates them and creates the next
        generation.
      </p>
      <button class="button outline" @click="lab.command('start')">
        Start training <ArrowUpRight :size="15" />
      </button>
    </div>
    <template v-else>
      <div class="chart-pair behavioural-charts">
        <section>
          <div class="chart-heading">
            <div>
              <span class="eyebrow">PREDATORS</span>
              <h2>Successful captures</h2>
            </div>
            <strong
              >{{ latest!.ecology.captures_per_predator.toFixed(2)
              }}<small>per predator</small></strong
            >
          </div>
          <EcologyChart
            :history="lab.history"
            :available="available"
            metric="captures"
            @observe="watch"
          />
        </section>
        <section>
          <div class="chart-heading">
            <div>
              <span class="eyebrow">PREY</span>
              <h2>Survival time</h2>
            </div>
            <strong
              >{{ latest!.ecology.prey_survival_seconds.toFixed(1)
              }}<small>seconds on average</small></strong
            >
          </div>
          <EcologyChart
            :history="lab.history"
            :available="available"
            metric="survival"
            @observe="watch"
          />
          <p class="chart-food-note">
            Food collected: {{ latest!.ecology.food_per_prey.toFixed(2) }} per prey in the latest
            evaluation.
          </p>
        </section>
      </div>
      <p class="chart-watch-hint">
        Click a marked generation to watch it. These averages come from evaluation episodes;
        playback uses the experiment’s observation seed.
      </p>
      <details class="advanced-analysis">
        <summary>Selection scores &amp; reference tests <span>Advanced analysis</span></summary>
        <div class="score-explanation">
          <strong>Selection scores decide which neural networks reproduce.</strong>
          <p>
            Predators earn {{ lab.current?.config.fitness.predator_capture }} points per capture.
            Prey earn {{ lab.current?.config.fitness.prey_food }} points per food collected and up
            to {{ lab.current?.config.fitness.prey_survival }} points for surviving the episode.
            Energy and effort also affect the score. These are not individual energy reserves.
          </p>
        </div>
        <div class="chart-pair">
          <section v-for="species in [0, 1] as const" :key="species">
            <div class="chart-heading">
              <span class="eyebrow">{{ species === 0 ? 'PREDATOR SCORE' : 'PREY SCORE' }}</span
              ><strong
                >{{ latest!.contemporary[species].mean.toFixed(2)
                }}<small>average selection points</small></strong
              >
            </div>
            <FitnessChart :history="lab.history" :species="species" />
          </section>
        </div>
        <div class="chart-legend">
          <span><i class="legend-line" /> Population average</span
          ><span><i class="legend-line faint" /> Best network</span
          ><span><i class="legend-ring" /> Reference opponents</span
          ><span><i class="legend-diamond" /> Unseen environment</span>
        </div>
        <p class="research-caveat">
          Reference tests use scripted opponents. Unseen-environment tests use current champions on
          new placements with more obstacles. These challenges are reported separately and never
          select parents. Contemporary scores alone do not establish improvement.
        </p>
        <section class="measurement-table">
          <span class="eyebrow">RECENT EVALUATIONS</span>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Generation</th>
                  <th>Predator score ± SD</th>
                  <th>Prey score ± SD</th>
                  <th>Captures / predator</th>
                  <th>Prey lifetime</th>
                  <th>Evaluation time</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in recent" :key="r.generation">
                  <td>{{ r.generation }}</td>
                  <td>
                    {{ r.contemporary[0].mean.toFixed(2) }} ± {{ r.contemporary[0].std.toFixed(2) }}
                  </td>
                  <td>
                    {{ r.contemporary[1].mean.toFixed(2) }} ± {{ r.contemporary[1].std.toFixed(2) }}
                  </td>
                  <td>{{ r.ecology.captures_per_predator.toFixed(2) }}</td>
                  <td>{{ r.ecology.prey_survival_seconds.toFixed(1) }} s</td>
                  <td>{{ r.seconds.toFixed(2) }} s</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </details>
      <details class="advanced-analysis">
        <summary>
          Compare populations &amp; archived champions <span>Saved experiments</span>
        </summary>
        <div class="research-columns">
          <section class="tournament-panel">
            <h2>Cross-generation match</h2>
            <p>Watch a saved predator population against prey from another generation.</p>
            <div class="match-selects">
              <label
                >Predators<select v-model.number="predator">
                  <option v-for="g in available" :key="g" :value="g">Generation {{ g }}</option>
                </select></label
              ><GitCompareArrows :size="18" /><label
                >Prey<select v-model.number="prey">
                  <option v-for="g in available" :key="g" :value="g">Generation {{ g }}</option>
                </select></label
              >
            </div>
            <button class="button outline" @click="match">Watch match <Play :size="14" /></button>
          </section>
          <section class="hall-panel">
            <h2>Archived champions</h2>
            <div
              v-for="entry in [...(lab.current?.archive ?? [])].reverse()"
              :key="entry.generation"
              class="archive-row"
            >
              <span>Generation {{ entry.generation }}</span
              ><span>Archived neural policies</span
              ><button
                class="icon-button"
                :disabled="!available.includes(entry.generation)"
                :aria-label="`Watch archived generation ${entry.generation}`"
                @click="watch(entry.generation)"
              >
                <Play :size="15" />
              </button>
            </div>
          </section>
        </div>
      </details>
    </template>
  </div>
</template>
