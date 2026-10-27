export type Species = 0 | 1
export interface WorldConfig {
  width: number
  height: number
  predators: number
  prey: number
  food: number
  obstacles: number
  perception: number
  fov: number
  speed: number
  energy_cost: number
  food_regrowth: number
}
export interface Config {
  name: string
  seed: number
  world: WorldConfig
  evolution: {
    population: number
    episodes: number
    steps: number
    generations: number
    mutation_rate: number
    mutation_scale: number
    elites: number
    tournament: number
    assessment_interval: number
    selection: 'tournament'
  }
  fitness: {
    predator_capture: number
    predator_survival: number
    prey_survival: number
    prey_food: number
    remaining_energy: number
    effort_cost: number
  }
}
export interface Summary {
  mean: number
  best: number
  std: number
}
export interface Report {
  generation: number
  contemporary: [Summary, Summary]
  seconds: number
  reference: [number, number] | null
  held_out: [number, number] | null
  historical: { opponent_generation: number; scores: [number, number] } | null
  ecology: { captures_per_predator: number; food_per_prey: number; prey_survival_seconds: number }
  champion_indices: [number, number]
  seeds: number[]
}
export interface Experiment {
  id: string
  name: string
  status: string
  generation: number
  config: Config
  created: number
  error: string | null
  history?: Report[]
  generations?: number[]
  archive?: { generation: number; contemporary: number[] }[]
}
/** Packed engine row. id,species,x,y,vx,vy,angle,energy,alive,genome,age,food,captures,steer,thrust */
export type Agent = [
  number,
  Species,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
]
export interface Frame {
  step: number
  time: number
  agents: Agent[]
  food: boolean[]
}
export interface Trace {
  step: number
  observation_step: number
  agent: { alive: boolean; observation: number[]; actions: number[] }
  brain: { layers: number[][]; actions: number[] }
}
export interface Recording {
  schema: number
  seed: number
  stride: number
  kind: 'recorded'
  environment: {
    config: WorldConfig
    dt: number
    topology: number[]
    food: { x: number; y: number; ready_at: number }[]
    obstacles: { x: number; y: number; radius: number }[]
  }
  frames: Frame[]
  trace: Trace[]
  weights: number[] | null
}
export type StreamMessage =
  | { type: 'generation'; id: string; report: Report }
  | { type: 'status'; id: string; status: string }
  | { type: 'error'; id: string; message: string }
  | { type: 'connected' | 'heartbeat' }

export const defaultConfig = (): Config => ({
  name: 'The first ecology',
  seed: 42,
  world: {
    width: 1200,
    height: 800,
    predators: 24,
    prey: 96,
    food: 240,
    obstacles: 12,
    perception: 150,
    fov: Math.PI * 1.5,
    speed: 62,
    energy_cost: 0.008,
    food_regrowth: 10,
  },
  evolution: {
    population: 24,
    episodes: 3,
    steps: 900,
    generations: 100,
    mutation_rate: 0.12,
    mutation_scale: 0.16,
    elites: 2,
    tournament: 3,
    assessment_interval: 5,
    selection: 'tournament',
  },
  fitness: {
    predator_capture: 4,
    predator_survival: 0.3,
    prey_survival: 2,
    prey_food: 0.6,
    remaining_energy: 0.1,
    effort_cost: 0.05,
  },
})
