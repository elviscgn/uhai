// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { api } from '../transport/api'
import { defaultConfig } from '../types'
import type { Experiment, Recording } from '../types'
import { useLaboratory } from './laboratory'

vi.mock('../transport/api', () => ({ api: vi.fn() }))
const mockApi = vi.mocked(api)
const recording = (seed: number): Recording => ({
  schema: 1,
  seed,
  stride: 3,
  kind: 'recorded',
  environment: {
    config: defaultConfig().world,
    dt: 1 / 30,
    topology: [24, 16, 16, 2],
    food: [],
    obstacles: [],
  },
  frames: [{ step: 0, time: 0, agents: [], food: [] }],
  trace: [],
  weights: null,
})
const experiment = (): Experiment => ({
  id: 'test',
  name: 'test',
  status: 'ready',
  generation: 0,
  config: defaultConfig(),
  created: 0,
  error: null,
})

beforeEach(() => {
  setActivePinia(createPinia())
  mockApi.mockReset()
})
describe('observation state', () => {
  it('loops the recording at 2× without advancing the evolutionary generation', () => {
    const lab = useLaboratory()
    lab.current = experiment()
    lab.generation = 17
    expect(lab.speed).toBe(2)
    lab.advancePlayback(30, true)
    expect(lab.time).toBe(0)
    expect(lab.playing).toBe(true)
    expect(lab.generation).toBe(17)
    expect(mockApi).not.toHaveBeenCalled()
  })
  it('stops at the final frame when replay looping is disabled', () => {
    const lab = useLaboratory()
    lab.loopPlayback = false
    lab.advancePlayback(30, true)
    expect(lab.time).toBe(30)
    expect(lab.playing).toBe(false)
  })
  it('ignores a stale recording response when generations are changed quickly', async () => {
    const lab = useLaboratory()
    lab.current = experiment()
    let finish!: (r: Recording) => void
    mockApi.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve as typeof finish
        }),
    )
    mockApi.mockResolvedValueOnce(recording(2))
    const earlier = lab.observe(0)
    await lab.observe(1)
    finish(recording(1))
    await earlier
    expect(lab.generation).toBe(1)
    expect(lab.recording?.seed).toBe(2)
    expect(lab.loading).toBe(false)
  })
  it('requests neural traces for the exact recorded match and clears inspection on change', async () => {
    const lab = useLaboratory()
    lab.current = experiment()
    mockApi.mockResolvedValue(recording(42))
    await lab.observe(5, 2)
    await lab.inspect(7)
    expect(mockApi).toHaveBeenLastCalledWith(
      '/experiments/test/replay?generation=5&seed=42&prey_generation=2&organism=7',
    )
    expect(lab.selected).toBe(7)
    await lab.observe(0)
    expect(lab.selected).toBeNull()
    expect(lab.trace).toBeNull()
  })
})
