<script setup lang="ts">
import { computed } from 'vue'
import { ArrowUpRight, Copy, Download, GitBranch, Plus } from '@lucide/vue'
import { useLaboratory } from '../stores/laboratory'
const lab = useLaboratory()
const emit = defineEmits<{ create: []; observe: [] }>()
const c = computed(() => lab.current?.config)
async function select(identity: string) {
  await lab.choose(identity)
  emit('observe')
}
</script>

<template>
  <div class="research-view laboratory-view">
    <div class="research-intro">
      <div>
        <span class="eyebrow">LABORATORY</span>
        <h1>Experiments</h1>
      </div>
      <button class="button primary" @click="emit('create')">
        New experiment <Plus :size="16" />
      </button>
    </div>
    <div class="laboratory-columns">
      <section class="experiments-list">
        <span class="eyebrow">SAVED EXPERIMENTS</span
        ><button
          v-for="experiment in lab.experiments"
          :key="experiment.id"
          class="experiment-row"
          :class="{ chosen: experiment.id === lab.current?.id }"
          @click="select(experiment.id)"
        >
          <div>
            <span class="eyebrow">SEED {{ experiment.config.seed }} / {{ experiment.status }}</span>
            <h3>{{ experiment.name }}</h3>
            <p>
              {{ experiment.config.world.predators }} predators ·
              {{ experiment.config.world.prey }} prey ·
              {{ experiment.config.evolution.generations }} generations
            </p>
          </div>
          <ArrowUpRight :size="18" />
        </button>
      </section>
      <section v-if="c" class="configuration-sheet">
        <span class="eyebrow">CURRENT CONDITIONS</span>
        <h2>{{ c.name }}</h2>
        <dl>
          <template
            v-for="(value, key) in {
              Seed: c.seed,
              Habitat: `${c.world.width} × ${c.world.height}`,
              Predators: c.world.predators,
              Prey: c.world.prey,
              Resources: c.world.food,
              Obstacles: c.world.obstacles,
              'Perception range': c.world.perception,
              'Field of view': `${((c.world.fov * 180) / Math.PI).toFixed(0)}°`,
              'Candidate genomes / species': c.evolution.population,
              'Episodes / generation': c.evolution.episodes,
              'Episode duration': `${c.evolution.steps / 30} s`,
              'Neural topology': '24 → 16 → 16 → 2',
              Selection: 'Tournament, size ' + c.evolution.tournament,
              Elites: c.evolution.elites,
              'Mutation probability': c.evolution.mutation_rate,
              'Mutation deviation': c.evolution.mutation_scale,
            }"
            :key="key"
            ><dt>{{ key }}</dt>
            <dd>{{ value }}</dd></template
          >
        </dl>
        <div class="configuration-actions">
          <button class="button outline" @click="lab.command('duplicate')">
            <Copy :size="14" /> Duplicate conditions</button
          ><button class="button outline" @click="lab.command('fork')">
            <GitBranch :size="14" /> Resume from gen {{ lab.generation }}</button
          ><a
            class="text-link"
            :href="`/api/experiments/${lab.current!.id}/checkpoint?generation=${lab.generation}`"
            :download="`uhai-generation-${lab.generation}.json`"
            ><Download :size="14" /> Export checkpoint</a
          >
        </div>
        <p class="micro-note">
          Duplicate starts from random founders under the same conditions. Resume copies saved
          evolutionary state into a new run. The most recent 32 generations, the founder, and 24
          ten-generation milestones are retained.
        </p>
      </section>
    </div>
  </div>
</template>
