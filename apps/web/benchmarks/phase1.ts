import { EcosystemRenderer } from '../src/rendering/EcosystemRenderer'
import type { RenderMetrics, RenderState } from '../src/rendering/EcosystemRenderer'
import type { Recording } from '../src/types'
import { sample } from '../src/rendering/playback'

const start = document.querySelector<HTMLButtonElement>('#start')!
const status = document.querySelector<HTMLElement>('#status')!
const result = document.querySelector<HTMLElement>('#result')!
const metric = document.querySelector<HTMLElement>('#metric')!
const vitals = document.querySelector<HTMLElement>('#vitals')!
const brain = document.querySelector<SVGElement>('#brain')!
const response = await fetch('/benchmarks/phase1-founders.json')
if (!response.ok)
  throw new Error('Generate the fixture with uv run python -m scripts.render_fixture')
const recording = (await response.json()) as Recording & { benchmark_meta: Record<string, unknown> }
const state: RenderState = {
  recording,
  time: 0,
  playing: true,
  speed: 1,
  selected: 0,
  sensors: true,
  trails: true,
  tracking: false,
  neural: recording.trace[0],
}
const runs: { name: string; windows: RenderMetrics[] }[] = []
let running = false,
  run = -1,
  stageStarted = 0,
  lastNeuralStep = -1
const stages = ['All overlays · fixed camera', 'All overlays · following selected predator']
const renderer = new EcosystemRenderer(
  document.querySelector<HTMLElement>('#host')!,
  () => state,
  (time) => {
    state.time = time >= recording.frames.at(-1)!.time ? 0 : time
    const { index } = sample(recording.frames, state.time)
    state.neural = recording.trace[index]
    if (index !== lastNeuralStep) {
      lastNeuralStep = index
      const a = recording.frames[index].agents[0]
      vitals.textContent = `Energy ${(a[7] * 100).toFixed(0)}% · Age ${a[10].toFixed(1)}s · Speed ${Math.hypot(a[4], a[5]).toFixed(1)} u/s`
      const layers = state.neural?.brain.layers ?? []
      brain.querySelectorAll<SVGCircleElement>('circle').forEach((node) => {
        const value = layers[Number(node.dataset.layer)]?.[Number(node.dataset.index)] ?? 0
        node.setAttribute('fill', value < 0 ? '#b66b47' : '#4b6e53')
        node.setAttribute('fill-opacity', String(0.18 + Math.abs(value) * 0.82))
      })
    }
  },
  () => {},
  (m) => {
    metric.textContent = `${m.fps.toFixed(1)} fps · draw ${m.frameMs.toFixed(2)} ms · p95 frame ${m.p95FrameMs.toFixed(2)} ms · ${m.agents} active · ${m.drawnAgents} drawn · ${m.cacheFrames} fish images`
    metric.dataset.renderMetrics = JSON.stringify(m)
    if (!running) return
    const elapsed = performance.now() - stageStarted
    status.textContent = `${stages[run]} · ${Math.max(0, 17 - Math.floor(elapsed / 1000))} s remaining`
    if (elapsed - m.windowMs >= 2000) runs[run].windows.push(m)
    if (elapsed >= 17000) nextStage()
  },
  () => {
    state.tracking = false
  },
)
const topology = [24, 16, 16, 2]
for (let layer = 0; layer < topology.length; layer++)
  for (let i = 0; i < topology[layer]; i++) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    node.setAttribute('cx', String(12 + layer * 72))
    node.setAttribute('cy', String(8 + ((i + 0.5) * 160) / topology[layer]))
    node.setAttribute('r', layer === 3 ? '5' : '2.5')
    node.dataset.layer = String(layer)
    node.dataset.index = String(i)
    brain.appendChild(node)
  }
function nextStage() {
  run++
  if (run >= stages.length) {
    finish()
    return
  }
  runs.push({ name: stages[run], windows: [] })
  state.tracking = run === 1
  state.time = 0
  renderer.fit()
  stageStarted = performance.now()
  status.textContent = stages[run]
}
function finish() {
  running = false
  start.disabled = false
  start.textContent = 'Run benchmark again'
  status.textContent = 'Complete · raw results below'
  const summary = runs.map((r) => {
    const count = r.windows.reduce((n, w) => n + w.frameCount, 0)
    const duration = r.windows.reduce((n, w) => n + (w.frameCount * 1000) / w.fps, 0)
    return {
      name: r.name,
      mean_fps: (count * 1000) / duration,
      mean_draw_ms: r.windows.reduce((n, w) => n + w.frameMs * w.frameCount, 0) / count,
      worst_window_p95_interval_ms: Math.max(...r.windows.map((w) => w.p95FrameMs)),
      min_window_fps: Math.min(...r.windows.map((w) => w.fps)),
      mean_active_agents: r.windows.reduce((n, w) => n + w.agents, 0) / r.windows.length,
      mean_drawn_agents: r.windows.reduce((n, w) => n + w.drawnAgents, 0) / r.windows.length,
      fish_cache_frames: [...new Set(r.windows.map((w) => w.cacheFrames))],
      frames: count,
      actual_measured_seconds: duration / 1000,
      windows: r.windows,
    }
  })
  result.textContent = JSON.stringify(
    {
      schema: 1,
      fixture: recording.benchmark_meta,
      viewport: {
        width: document.querySelector('#host')!.clientWidth,
        height: document.querySelector('#host')!.clientHeight,
        dpr: devicePixelRatio,
      },
      visible: document.visibilityState,
      focused: document.hasFocus(),
      renderer: 'Canvas 2D drawImage',
      warmup_seconds_per_case: 2,
      requested_measured_seconds_per_case: 15,
      overlays: '100-agent trails, selected sensory cone/rays, recorded neural inspector, UI masks',
      cases: summary,
    },
    null,
    2,
  )
  result.dataset.complete = 'true'
}
await renderer.init()
start.disabled = false
start.textContent = 'Run 2 × 15 second benchmark'
start.onclick = () => {
  if (running) return
  result.textContent = ''
  delete result.dataset.complete
  runs.length = 0
  run = -1
  running = true
  start.disabled = true
  nextStage()
}
addEventListener('pagehide', () => renderer.destroy(), { once: true })
