<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ArrowRight, X } from '@lucide/vue'
import { useLaboratory } from '../stores/laboratory'
import { defaultConfig } from '../types'
import BrandLockup from './BrandLockup.vue'
const emit = defineEmits<{ close: [] }>()
const lab = useLaboratory()
const dialog = ref<HTMLDialogElement>()
const config = ref(defaultConfig())
const busy = ref(false)
const message = ref('')
onMounted(() => dialog.value?.showModal())
async function create() {
  busy.value = true
  message.value = ''
  try {
    await lab.create(config.value)
    dialog.value?.close()
    emit('close')
  } catch (e) {
    message.value = String(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <dialog
    ref="dialog"
    class="experiment-dialog"
    @cancel="emit('close')"
    @click="
      (event) => {
        if (event.target === dialog) emit('close')
      }
    "
  >
    <div class="dialog-art"><BrandLockup /></div>
    <form class="experiment-form" @submit.prevent="create">
      <div class="inspector-top">
        <span class="eyebrow">LABORATORY / NEW EXPERIMENT</span
        ><button
          type="button"
          class="icon-button"
          aria-label="Close configuration"
          @click="emit('close')"
        >
          <X :size="18" />
        </button>
      </div>
      <h2>New experiment</h2>
      <p class="form-intro">
        Configure the habitat and evolutionary conditions. Both populations start with random neural
        weights.
      </p>
      <label class="full-label"
        >Experiment name<input v-model="config.name" required maxlength="80"
      /></label>
      <fieldset>
        <legend>01 <span>The habitat</span></legend>
        <div class="form-grid">
          <label
            >Predator organisms<input
              v-model.number="config.world.predators"
              type="number"
              min="1"
              max="256"
              required /></label
          ><label
            >Prey organisms<input
              v-model.number="config.world.prey"
              type="number"
              min="1"
              max="1000"
              required
          /></label>
          <label
            >Food resources<input
              v-model.number="config.world.food"
              type="number"
              min="0"
              max="3000"
              required /></label
          ><label
            >Obstacles<input
              v-model.number="config.world.obstacles"
              type="number"
              min="0"
              max="80"
              required
          /></label>
          <label
            >World width<input
              v-model.number="config.world.width"
              type="number"
              min="200"
              max="5000"
              required /></label
          ><label
            >World height<input
              v-model.number="config.world.height"
              type="number"
              min="200"
              max="5000"
              required
          /></label>
          <label
            >Perception range<input
              v-model.number="config.world.perception"
              type="number"
              min="20"
              max="500"
              required /></label
          ><label
            >Movement speed<input
              v-model.number="config.world.speed"
              type="number"
              min="5"
              max="200"
              required
          /></label>
        </div>
      </fieldset>
      <fieldset>
        <legend>02 <span>Evolutionary pressure</span></legend>
        <div class="form-grid">
          <label
            >Candidate genomes / species<input
              v-model.number="config.evolution.population"
              type="number"
              min="4"
              max="128"
              required /></label
          ><label
            >Generations<input
              v-model.number="config.evolution.generations"
              type="number"
              min="1"
              max="500"
              required
          /></label>
          <label
            >Episodes / generation<input
              v-model.number="config.evolution.episodes"
              type="number"
              min="1"
              max="12"
              required /></label
          ><label
            >Steps / episode (30 per second)<input
              v-model.number="config.evolution.steps"
              type="number"
              min="120"
              max="3600"
              step="30"
              required
          /></label>
          <label
            >Mutation probability<input
              v-model.number="config.evolution.mutation_rate"
              type="number"
              min="0"
              max="1"
              step="0.01"
              required /></label
          ><label
            >Mutation standard deviation<input
              v-model.number="config.evolution.mutation_scale"
              type="number"
              min="0"
              max="2"
              step="0.01"
              required
          /></label>
        </div>
        <p class="micro-note">
          A genome may control several organisms. Candidate counts are capped by each species’
          organism count. Networks use 24 → 16 → 16 → 2 neurons.
        </p>
      </fieldset>
      <details>
        <summary>Fitness & physiological parameters</summary>
        <div class="form-grid advanced-fields">
          <label
            >Predator capture reward<input
              v-model.number="config.fitness.predator_capture"
              type="number"
              min="0"
              max="20"
              step="0.1"
              required /></label
          ><label
            >Prey food reward<input
              v-model.number="config.fitness.prey_food"
              type="number"
              min="0"
              max="10"
              step="0.1"
              required
          /></label>
          <label
            >Prey survival reward<input
              v-model.number="config.fitness.prey_survival"
              type="number"
              min="0"
              max="10"
              step="0.1"
              required /></label
          ><label
            >Predator survival reward<input
              v-model.number="config.fitness.predator_survival"
              type="number"
              min="0"
              max="10"
              step="0.1"
              required
          /></label>
          <label
            >Remaining energy reward<input
              v-model.number="config.fitness.remaining_energy"
              type="number"
              min="0"
              max="2"
              step="0.01"
              required /></label
          ><label
            >Effort penalty<input
              v-model.number="config.fitness.effort_cost"
              type="number"
              min="0"
              max="2"
              step="0.01"
              required
          /></label>
          <label
            >Basal energy cost<input
              v-model.number="config.world.energy_cost"
              type="number"
              min="0"
              max="0.1"
              step="0.001"
              required /></label
          ><label
            >Food regrowth (seconds)<input
              v-model.number="config.world.food_regrowth"
              type="number"
              min="1"
              max="120"
              required
          /></label>
        </div>
      </details>
      <div class="seed-row">
        <label
          >Random seed<input
            v-model.number="config.seed"
            type="number"
            min="0"
            max="4294967295"
            required
        /></label>
        <p>Saved with every checkpoint.<br />The same seed starts the same world.</p>
      </div>
      <p v-if="message" role="alert" class="inline-error">{{ message }}</p>
      <button type="submit" class="button primary create-button" :disabled="busy">
        {{ busy ? 'Creating the habitat…' : 'Create experiment' }}<ArrowRight :size="16" />
      </button>
    </form>
  </dialog>
</template>
