import { defineStore } from 'pinia'
import { computed, markRaw, ref, shallowRef } from 'vue'
import { api } from '../transport/api'
import { defaultConfig } from '../types'
import { sample } from '../rendering/playback'
import type { Config, Experiment, Recording, StreamMessage } from '../types'

export const useLaboratory = defineStore('laboratory', () => {
  const experiments = ref<Experiment[]>([])
  const current = ref<Experiment | null>(null)
  const recording = shallowRef<Recording | null>(null)
  const generation = ref(0)
  const opponentGeneration = ref<number | null>(null)
  const selected = ref<number | null>(null)
  const trace = shallowRef<Recording | null>(null)
  const loading = ref(false)
  const inspecting = ref(false)
  const error = ref('')
  const connected = ref(false)
  const speed = ref(2)
  const loopPlayback = ref(true)
  const playing = ref(true)
  const time = ref(0)
  const sensors = ref(false)
  const trails = ref(false)
  const tracking = ref(false)
  let socket: WebSocket | null = null
  let retry: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  let requestId = 0
  let inspectId = 0
  const frameIndex = computed(() => {
    const frames = recording.value?.frames
    if (!frames?.length) return 0
    return sample(frames, time.value).index
  })
  const frame = computed(() => recording.value?.frames[frameIndex.value] ?? null)
  const creature = computed(() =>
    selected.value === null
      ? null
      : (frame.value?.agents.find((a) => a[0] === selected.value) ?? null),
  )
  const neural = computed(() => trace.value?.trace[frameIndex.value] ?? null)
  const history = computed(() => current.value?.history ?? [])
  const running = computed(() => ['running', 'pausing'].includes(current.value?.status ?? ''))
  const duration = computed(() => recording.value?.frames.at(-1)?.time ?? 0)

  async function refresh() {
    experiments.value = await api<Experiment[]>('/experiments')
    if (current.value) current.value = await api<Experiment>(`/experiments/${current.value.id}`)
  }
  async function choose(identity: string) {
    requestId++
    inspectId++
    current.value = await api<Experiment>(`/experiments/${identity}`)
    opponentGeneration.value = null
    await observe(current.value.generation < 0 ? 0 : current.value.generation)
  }
  async function create(config: Config) {
    const experiment = await api<Experiment>('/experiments', {
      method: 'POST',
      body: JSON.stringify(config),
    })
    await refresh()
    await choose(experiment.id)
  }
  async function initialize() {
    disposed = false
    try {
      await refresh()
      if (experiments.value.length) await choose(experiments.value[0].id)
      else await create(defaultConfig())
      connect()
    } catch (e) {
      fail(e)
    }
  }
  function replayPath(organism?: number) {
    const seed = current.value?.config.seed ?? 42
    let path = `/experiments/${current.value!.id}/replay?generation=${generation.value}&seed=${seed}`
    if (opponentGeneration.value !== null) path += `&prey_generation=${opponentGeneration.value}`
    if (organism !== undefined) path += `&organism=${organism}`
    return path
  }
  async function observe(g: number, opponent: number | null = null) {
    if (!current.value) return
    const id = ++requestId
    inspectId++
    loading.value = true
    selected.value = null
    trace.value = null
    generation.value = g
    opponentGeneration.value = opponent
    try {
      const data = await api<Recording>(replayPath())
      if (id !== requestId) return
      recording.value = markRaw(data)
      time.value = 0
      playing.value = true
    } catch (e) {
      if (id === requestId) fail(e)
    } finally {
      if (id === requestId) loading.value = false
    }
  }
  async function inspect(id: number | null) {
    const token = ++inspectId
    selected.value = id
    trace.value = null
    if (id === null) {
      inspecting.value = false
      return
    }
    inspecting.value = true
    try {
      const data = await api<Recording>(replayPath(id))
      if (token === inspectId) trace.value = markRaw(data)
    } catch (e) {
      if (token === inspectId) fail(e)
    } finally {
      if (token === inspectId) inspecting.value = false
    }
  }
  async function command(action: 'start' | 'pause' | 'duplicate' | 'fork') {
    if (!current.value) return
    try {
      const result = await api<Experiment>(`/experiments/${current.value.id}/${action}`, {
        method: 'POST',
        ...(action === 'fork' ? { body: JSON.stringify({ generation: generation.value }) } : {}),
      })
      if (action === 'duplicate' || action === 'fork') {
        await refresh()
        await choose(result.id)
      } else {
        current.value.status = result.status
        await refresh()
      }
    } catch (e) {
      fail(e)
    }
  }
  function fail(e: unknown) {
    error.value = e instanceof Error ? e.message : String(e)
  }
  function advancePlayback(nextTime: number, ended: boolean) {
    if (ended && loopPlayback.value) {
      time.value = 0
      playing.value = true
    } else {
      time.value = nextTime
      if (ended) playing.value = false
    }
  }
  function connect() {
    if (disposed) return
    clearTimeout(retry)
    if (socket) {
      socket.onclose = null
      socket.close()
    }
    socket = new WebSocket(
      `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/stream`,
    )
    socket.onopen = () => {
      connected.value = true
      void refresh().catch(fail)
    }
    socket.onclose = () => {
      connected.value = false
      if (!disposed) retry = setTimeout(connect, 2000)
    }
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as StreamMessage
      if (message.type === 'connected' || message.type === 'heartbeat') return
      if (!('id' in message)) return
      if (message.type === 'error' && message.id === current.value?.id)
        error.value = message.message
      void refresh().catch(fail)
    }
  }
  function dispose() {
    disposed = true
    clearTimeout(retry)
    socket?.close()
  }
  return {
    experiments,
    current,
    recording,
    generation,
    opponentGeneration,
    selected,
    trace,
    loading,
    inspecting,
    error,
    connected,
    speed,
    loopPlayback,
    playing,
    time,
    sensors,
    trails,
    tracking,
    frameIndex,
    frame,
    creature,
    neural,
    history,
    running,
    duration,
    initialize,
    choose,
    create,
    observe,
    inspect,
    command,
    advancePlayback,
    refresh,
    fail,
    dispose,
  }
})
