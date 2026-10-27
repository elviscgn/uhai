import type { Agent, Recording, Trace } from '../types'
import { bellyScaleY, easeAngle, interpolate, sample } from './playback'
import { constrainCamera } from './camera'
import { CanvasArtwork } from './CanvasArtwork'
import { getFishAtlas } from './spriteAtlas'
import type { FishAtlas } from './spriteAtlas'

export interface RenderState {
  recording: Recording | null
  time: number
  playing: boolean
  speed: number
  selected: number | null
  sensors: boolean
  trails: boolean
  tracking: boolean
  neural: Trace | null
}
export interface RenderMetrics {
  fps: number
  frameMs: number
  p95FrameMs: number
  sprites: number
  samples: number
  agents: number
  drawnAgents: number
  cacheFrames: number
  frameCount: number
  windowMs: number
}
interface Rect {
  x: number
  y: number
  width: number
  height: number
}
const BACKGROUND = '#e9ece0'
const percentile = (samples: number[], p: number) => {
  const sorted = [...samples].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0
}
function surface() {
  return document.createElement('canvas')
}

/** Recorded engine state is read-only. Rendering uses cached images and its own animation clock. */
export class EcosystemRenderer {
  private canvas = surface()
  private ctx: CanvasRenderingContext2D
  private ground = surface()
  private groundCtx: CanvasRenderingContext2D
  private foodLayer = surface()
  private foodCtx: CanvasRenderingContext2D
  private foodSprite = surface()
  private atlas!: FishAtlas
  private terrain: CanvasArtwork | null = null
  private loaded: Recording | null = null
  private distances: Float32Array[] = []
  private angles = new Float32Array(0)
  private poses = new Float32Array(0)
  private cameraState = { x: 0, y: 0, zoom: 1, scale: 1, left: 0, top: 0 }
  private cx = 0
  private cy = 0
  private zoom = 1
  private width = 0
  private height = 0
  private density = 1
  private frameRequest = 0
  private lastTimestamp = 0
  private lastTime = NaN
  private layoutDirty = true
  private groundDirty = true
  private foodFrame = -1
  private destroyed = false
  private observer: ResizeObserver | null = null
  private mutationObserver: MutationObserver | null = null
  private uiElements = new Set<Element>()
  private occlusions: Rect[] = []
  private panel: Element
  private drag: { x: number; y: number; lastX: number; lastY: number; moved: boolean } | null = null
  private intervals: number[] = []
  private drawTimes: number[] = []
  private windowStart = 0
  private samples = 0
  private activeAgents = 0
  private drawnAgents = 0

  constructor(
    private host: HTMLElement,
    private state: () => RenderState,
    private setTime: (time: number, ended: boolean) => void,
    private select: (id: number | null) => void,
    private metrics: (value: RenderMetrics) => void,
    private manualCamera: () => void,
  ) {
    const ctx = this.canvas.getContext('2d', { alpha: false })
    const ground = this.ground.getContext('2d', { alpha: false })
    const food = this.foodLayer.getContext('2d')
    if (!ctx || !ground || !food) throw new Error('Canvas 2D is unavailable')
    this.ctx = ctx
    this.groundCtx = ground
    this.foodCtx = food
    this.panel = host.closest('.observatory-frame') ?? host
  }
  async init() {
    this.atlas = getFishAtlas()
    this.makeFoodSprite()
    this.canvas.setAttribute(
      'aria-label',
      'Interactive neural ecosystem. Click an organism to inspect it; drag to pan and scroll to zoom.',
    )
    this.canvas.dataset.renderer = 'canvas2d'
    this.host.appendChild(this.canvas)
    this.canvas.addEventListener('pointerdown', this.pointerDown)
    this.canvas.addEventListener('pointermove', this.pointerMove)
    this.canvas.addEventListener('pointerup', this.pointerUp)
    this.canvas.addEventListener('pointercancel', this.pointerCancel)
    this.canvas.addEventListener('wheel', this.wheel, { passive: false })
    this.observer = new ResizeObserver(() => {
      this.layoutDirty = true
    })
    this.observer.observe(this.host)
    this.mutationObserver = new MutationObserver(() => {
      this.layoutDirty = true
    })
    this.mutationObserver.observe(this.panel, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'hidden'],
    })
    document.fonts.ready.then(() => {
      this.layoutDirty = true
    })
    this.frameRequest = requestAnimationFrame(this.animate)
  }
  private makeFoodSprite() {
    this.foodSprite.width = 64
    this.foodSprite.height = 64
    const c = this.foodSprite.getContext('2d')!
    c.scale(8, 8)
    c.translate(4, 4)
    new CanvasArtwork()
      .circle(-1.8, 0.8, 1.5)
      .fill(0x899d68)
      .circle(1.5, -1.5, 1.9)
      .fill(0x9ead79)
      .circle(2, 2, 1.1)
      .fill(0xb7bd87)
      .draw(c)
  }
  private load(recording: Recording) {
    this.loaded = recording
    this.angles = new Float32Array(recording.frames[0].agents.length)
    this.poses = new Float32Array(this.angles.length * 3)
    this.distances = []
    recording.frames.forEach((frame, index) => {
      const distance = new Float32Array(frame.agents.length)
      if (index)
        frame.agents.forEach((a, i) => {
          const b = recording.frames[index - 1].agents[i]
          distance[i] = this.distances[index - 1][i] + Math.hypot(a[2] - b[2], a[3] - b[3])
        })
      this.distances.push(distance)
    })
    const { config: c, obstacles } = recording.environment
    const terrain = new CanvasArtwork().rect(0, 0, c.width, c.height).fill(0xe9ece0)
    for (let x = 50; x < c.width; x += 100)
      for (let y = 50; y < c.height; y += 100) {
        terrain
          .moveTo(x - 2, y)
          .lineTo(x + 2, y)
          .moveTo(x, y - 2)
          .lineTo(x, y + 2)
          .stroke({ color: 0x9aa88b, width: 0.65, alpha: 0.22 })
      }
    for (const o of obstacles) {
      terrain.circle(o.x + 1.5, o.y + 2, o.radius + 2).fill({ color: 0x879475, alpha: 0.1 })
      const points: number[] = []
      for (let k = 0; k < 10; k++) {
        const angle = (k * Math.PI) / 5,
          radius = o.radius * (0.89 + 0.08 * Math.sin(k * 2.7 + o.x))
        points.push(o.x + Math.cos(angle) * radius, o.y + Math.sin(angle) * radius)
      }
      terrain
        .poly(points)
        .fill(0xb8c0a5)
        .moveTo(points[0], points[1])
        .lineTo(points[4], points[5])
        .lineTo(o.x - o.radius * 0.2, o.y - o.radius * 0.16)
        .lineTo(points[16], points[17])
        .closePath()
        .fill(0xcbd1b7)
        .moveTo(o.x - o.radius * 0.2, o.y - o.radius * 0.16)
        .lineTo(points[8], points[9])
        .stroke({ color: 0x9aa98a, width: 0.65, alpha: 0.7 })
        .circle(o.x, o.y, o.radius)
        .stroke({ color: 0x8b9b7a, width: 0.6, alpha: 0.25 })
    }
    this.terrain = terrain
    this.lastTime = NaN
    this.cx = c.width / 2
    this.cy = c.height / 2
    this.zoom = 1
    this.groundDirty = true
    this.foodFrame = -1
    this.layoutDirty = true
    this.camera()
  }
  private layout() {
    this.layoutDirty = false
    const width = this.host.clientWidth,
      height = this.host.clientHeight
    const density = Math.min(devicePixelRatio || 1, 2)
    if (width !== this.width || height !== this.height || density !== this.density) {
      this.width = width
      this.height = height
      this.density = density
      for (const c of [this.canvas, this.ground, this.foodLayer]) {
        c.width = Math.max(1, Math.ceil(width * density))
        c.height = Math.max(1, Math.ceil(height * density))
      }
      this.groundDirty = true
      this.foodFrame = -1
    }
    const elements = new Set(this.panel.querySelectorAll('[data-world-ui]'))
    for (const element of this.uiElements)
      if (!elements.has(element)) this.observer?.unobserve(element)
    for (const element of elements)
      if (!this.uiElements.has(element)) this.observer?.observe(element)
    this.uiElements = elements
    const host = this.host.getBoundingClientRect()
    this.occlusions = []
    for (const element of elements) {
      const r = element.getBoundingClientRect()
      if (!r.width || !r.height) continue
      const x = Math.max(0, r.left - host.left - 4),
        y = Math.max(0, r.top - host.top - 4)
      const right = Math.min(width, r.right - host.left + 4),
        bottom = Math.min(height, r.bottom - host.top + 4)
      if (right > x && bottom > y)
        this.occlusions.push({ x, y, width: right - x, height: bottom - y })
    }
    this.camera()
  }
  fit() {
    if (!this.loaded) return
    const c = this.loaded.environment.config
    this.cx = c.width / 2
    this.cy = c.height / 2
    this.zoom = 1
    this.camera()
  }
  zoomBy(factor: number, x = this.width / 2, y = this.height / 2) {
    if (!this.loaded || !this.width || !this.height) return
    const previous = this.cameraState
    const anchorX = (x - previous.left) / previous.scale,
      anchorY = (y - previous.top) / previous.scale
    const next = constrainCamera(
      this.loaded.environment.config,
      { width: this.width, height: this.height },
      { x: this.cx, y: this.cy, zoom: this.zoom * factor },
    )
    this.zoom = next.zoom
    this.cx = anchorX - (x - this.width / 2) / next.scale
    this.cy = anchorY - (y - this.height / 2) / next.scale
    this.camera()
  }
  private camera() {
    if (!this.loaded || !this.width || !this.height) return
    const c = constrainCamera(
      this.loaded.environment.config,
      { width: this.width, height: this.height },
      { x: this.cx, y: this.cy, zoom: this.zoom },
    )
    if (
      c.scale !== this.cameraState.scale ||
      c.left !== this.cameraState.left ||
      c.top !== this.cameraState.top
    ) {
      this.groundDirty = true
      this.foodFrame = -1
    }
    this.cx = c.x
    this.cy = c.y
    this.zoom = c.zoom
    this.cameraState = c
  }
  private worldTransform(ctx: CanvasRenderingContext2D) {
    const c = this.cameraState,
      d = this.density
    ctx.setTransform(d * c.scale, 0, 0, d * c.scale, d * c.left, d * c.top)
  }
  private paintGround() {
    const c = this.groundCtx
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.fillStyle = BACKGROUND
    c.fillRect(0, 0, this.ground.width, this.ground.height)
    this.worldTransform(c)
    this.terrain?.draw(c)
    this.groundDirty = false
  }
  private paintFood(index: number) {
    const c = this.foodCtx,
      r = this.loaded!,
      camera = this.cameraState
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.clearRect(0, 0, this.foodLayer.width, this.foodLayer.height)
    this.worldTransform(c)
    r.environment.food.forEach((food, i) => {
      const x = food.x * camera.scale + camera.left,
        y = food.y * camera.scale + camera.top
      if (x < -8 || x > this.width + 8 || y < -8 || y > this.height + 8) return
      c.globalAlpha = r.frames[index].food[i] ? 0.8 : 0.08
      c.drawImage(this.foodSprite, food.x - 4, food.y - 4, 8, 8)
    })
    c.globalAlpha = 1
    this.foodFrame = index
  }
  private animate = (timestamp: number) => {
    if (this.destroyed) return
    this.frameRequest = requestAnimationFrame(this.animate)
    const interval = this.lastTimestamp ? timestamp - this.lastTimestamp : 0
    this.lastTimestamp = timestamp
    if (this.layoutDirty) this.layout()
    const s = this.state()
    if (!s.recording || !this.width || !this.height) return
    const started = performance.now()
    if (s.recording !== this.loaded) {
      this.load(s.recording)
      if (this.layoutDirty) this.layout()
    }
    const dt = Math.min(interval / 1000, 0.1)
    const duration = s.recording.frames.at(-1)!.time
    const time = s.playing ? Math.min(duration, s.time + dt * s.speed) : s.time
    if (s.playing) this.setTime(time, time >= duration)
    const playback = this.state()
    this.draw(playback.time, dt, playback)
    if (document.visibilityState === 'visible' && interval > 0) {
      if (!this.windowStart) this.windowStart = timestamp
      this.intervals.push(interval)
      this.drawTimes.push(performance.now() - started)
      if (timestamp - this.windowStart >= 1000) {
        this.samples++
        this.metrics({
          fps: (1000 * this.intervals.length) / this.intervals.reduce((a, b) => a + b, 0),
          frameMs: this.drawTimes.reduce((a, b) => a + b, 0) / this.drawTimes.length,
          p95FrameMs: percentile(this.intervals, 0.95),
          sprites: this.drawnAgents + s.recording.environment.food.length,
          samples: this.samples,
          agents: this.activeAgents,
          drawnAgents: this.drawnAgents,
          cacheFrames: this.atlas.cacheBuilds,
          frameCount: this.intervals.length,
          windowMs: timestamp - this.windowStart,
        })
        this.intervals = []
        this.drawTimes = []
        this.windowStart = timestamp
      }
    } else {
      this.intervals = []
      this.drawTimes = []
      this.windowStart = 0
    }
  }
  private draw(time: number, dt: number, s: RenderState) {
    const r = this.loaded!,
      { index, fraction } = sample(r.frames, time)
    const frame = r.frames[index],
      next = r.frames[index + 1]
    const seek =
      !Number.isFinite(this.lastTime) ||
      time < this.lastTime ||
      (!s.playing && time !== this.lastTime) ||
      Math.abs(time - this.lastTime) > Math.max(0.3, dt * s.speed * 2.5)
    frame.agents.forEach((agent, i) => {
      const p = interpolate(agent, next?.agents[i], fraction)
      const angle = seek
        ? p.angle
        : easeAngle(this.angles[i], p.angle, dt * (s.playing ? s.speed : 1))
      this.angles[i] = angle
      this.poses[i * 3] = p.x
      this.poses[i * 3 + 1] = p.y
      this.poses[i * 3 + 2] = angle
    })
    if (s.tracking && s.selected !== null) {
      const i = frame.agents.findIndex((a) => a[0] === s.selected)
      if (i >= 0) {
        const k = 1 - Math.exp(-dt * 5)
        this.cx += (this.poses[i * 3] - this.cx) * k
        this.cy += (this.poses[i * 3 + 1] - this.cy) * k
        this.camera()
      }
    }
    if (this.groundDirty) this.paintGround()
    if (this.foodFrame !== index) this.paintFood(index)
    const c = this.ctx
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.globalAlpha = 1
    c.drawImage(this.ground, 0, 0)
    c.save()
    c.setTransform(this.density, 0, 0, this.density, 0, 0)
    // Intersect exclusions separately: overlapping UI panels must never cancel one another's mask.
    for (const rect of this.occlusions) {
      c.beginPath()
      c.rect(0, 0, this.width, this.height)
      c.rect(rect.x, rect.y, rect.width, rect.height)
      c.clip('evenodd')
    }
    c.drawImage(this.foodLayer, 0, 0, this.width, this.height)
    const camera = this.cameraState
    c.transform(camera.scale, 0, 0, camera.scale, camera.left, camera.top)
    if (s.trails) this.drawTrails(index, frame.agents, s.selected)
    this.activeAgents = 0
    this.drawnAgents = 0
    frame.agents.forEach((agent, i) => {
      if (!agent[8]) return
      this.activeAgents++
      const x = this.poses[i * 3],
        y = this.poses[i * 3 + 1],
        angle = this.poses[i * 3 + 2]
      const fish = this.atlas.species[agent[1]],
        radius = Math.max(fish.width, fish.height) * camera.scale
      const sx = x * camera.scale + camera.left,
        sy = y * camera.scale + camera.top
      if (
        sx + radius < 0 ||
        sx - radius > this.width ||
        sy + radius < 0 ||
        sy - radius > this.height
      )
        return
      if (
        this.occlusions.some(
          (o) =>
            sx - radius >= o.x &&
            sx + radius <= o.x + o.width &&
            sy - radius >= o.y &&
            sy + radius <= o.y + o.height,
        )
      )
        return
      const after = next?.agents[i] ?? agent
      const speed = Math.hypot(
        agent[4] + (after[4] - agent[4]) * fraction,
        agent[5] + (after[5] - agent[5]) * fraction,
      )
      const d0 = this.distances[index][i],
        d1 = this.distances[index + 1]?.[i] ?? d0
      const phase = (d0 + (d1 - d0) * fraction) * (agent[1] === 0 ? 0.12 : 0.19) + agent[0] * 2.399
      const animation =
        speed < 1 ? 0 : Math.floor(((((phase / (Math.PI * 2)) % 1) + 1) % 1) * fish.frames.length)
      c.save()
      c.translate(x, y)
      c.rotate(angle)
      c.scale(1, bellyScaleY(angle))
      c.globalAlpha = 0.75 + agent[7] * 0.25
      c.drawImage(fish.frames[animation], -fish.originX, -fish.originY, fish.width, fish.height)
      c.restore()
      this.drawnAgents++
    })
    if (s.selected !== null) {
      const i = frame.agents.findIndex((a) => a[0] === s.selected)
      if (i >= 0) this.drawSelection(frame.agents[i], i, s)
    }
    c.restore()
    this.lastTime = time
  }
  private drawTrails(index: number, agents: Agent[], selected: number | null) {
    const c = this.ctx,
      r = this.loaded!,
      first = Math.max(0, index - 16)
    for (let i = 0; i < agents.length; i++) {
      if (!agents[i][8]) continue
      c.beginPath()
      for (let j = first; j <= index; j += 2) {
        const a = r.frames[j].agents[i]
        if (j === first) c.moveTo(a[2], a[3])
        else c.lineTo(a[2], a[3])
      }
      c.strokeStyle = agents[i][1] === 0 ? '#b4603e' : '#466a56'
      c.lineWidth = agents[i][0] === selected ? 1.4 : 0.65
      c.globalAlpha = 0.3
      c.stroke()
    }
    c.globalAlpha = 1
  }
  private drawSelection(agent: Agent, i: number, s: RenderState) {
    const c = this.ctx,
      x = this.poses[i * 3],
      y = this.poses[i * 3 + 1],
      angle = this.poses[i * 3 + 2]
    const color = agent[1] === 0 ? '#b4603e' : '#466a56'
    c.strokeStyle = color
    c.lineWidth = 1.2
    c.globalAlpha = 0.8
    c.beginPath()
    c.arc(x, y, 20, 0, Math.PI * 2)
    c.stroke()
    c.lineWidth = 0.5
    c.globalAlpha = 0.25
    c.beginPath()
    c.arc(x, y, 23, 0, Math.PI * 2)
    c.stroke()
    if (s.sensors) {
      const cfg = this.loaded!.environment.config
      c.beginPath()
      c.moveTo(x, y)
      c.arc(x, y, cfg.perception, angle - cfg.fov / 2, angle + cfg.fov / 2)
      c.closePath()
      c.fillStyle = color
      c.globalAlpha = 0.045
      c.fill()
      c.globalAlpha = 0.25
      c.lineWidth = 0.8
      c.stroke()
      const obs = s.neural?.agent.observation
      if (obs)
        for (const [a, b, flag] of [
          [4, 5, 8],
          [9, 10, 13],
          [14, 15, 16],
          [17, 18, 20],
        ]) {
          if (!obs[flag]) continue
          const dx = obs[a] * cfg.perception,
            dy = obs[b] * cfg.perception
          const tx = x + dx * Math.cos(angle) - dy * Math.sin(angle),
            ty = y + dx * Math.sin(angle) + dy * Math.cos(angle)
          c.globalAlpha = 0.55
          c.lineWidth = 0.9
          c.beginPath()
          c.moveTo(x, y)
          c.lineTo(tx, ty)
          c.stroke()
          c.beginPath()
          c.arc(tx, ty, 3, 0, Math.PI * 2)
          c.stroke()
        }
    }
    c.globalAlpha = 1
  }
  private pointerDown = (event: PointerEvent) => {
    this.canvas.setPointerCapture(event.pointerId)
    this.drag = {
      x: event.offsetX,
      y: event.offsetY,
      lastX: event.offsetX,
      lastY: event.offsetY,
      moved: false,
    }
  }
  private pointerMove = (event: PointerEvent) => {
    if (!this.drag) return
    if (Math.hypot(event.offsetX - this.drag.x, event.offsetY - this.drag.y) > 4)
      this.drag.moved = true
    if (this.drag.moved) {
      this.manualCamera()
      this.cx -= (event.offsetX - this.drag.lastX) / this.cameraState.scale
      this.cy -= (event.offsetY - this.drag.lastY) / this.cameraState.scale
      this.drag.lastX = event.offsetX
      this.drag.lastY = event.offsetY
      this.camera()
    }
  }
  private pointerUp = (event: PointerEvent) => {
    if (this.drag && !this.drag.moved && this.loaded) {
      const camera = this.cameraState,
        x = (event.offsetX - camera.left) / camera.scale,
        y = (event.offsetY - camera.top) / camera.scale
      const { index } = sample(this.loaded.frames, this.state().time)
      let nearest = Math.max(18, 14 / camera.scale),
        found: number | null = null
      for (let i = 0; i < this.loaded.frames[index].agents.length; i++) {
        const agent = this.loaded.frames[index].agents[i]
        const distance = Math.hypot(this.poses[i * 3] - x, this.poses[i * 3 + 1] - y)
        if (agent[8] && distance < nearest) {
          nearest = distance
          found = agent[0]
        }
      }
      this.select(found)
    }
    this.drag = null
  }
  private pointerCancel = () => {
    this.drag = null
  }
  private wheel = (event: WheelEvent) => {
    event.preventDefault()
    this.manualCamera()
    this.zoomBy(Math.exp(-event.deltaY * 0.0015), event.offsetX, event.offsetY)
  }
  destroy() {
    this.destroyed = true
    cancelAnimationFrame(this.frameRequest)
    this.observer?.disconnect()
    this.mutationObserver?.disconnect()
    this.canvas.removeEventListener('pointerdown', this.pointerDown)
    this.canvas.removeEventListener('pointermove', this.pointerMove)
    this.canvas.removeEventListener('pointerup', this.pointerUp)
    this.canvas.removeEventListener('pointercancel', this.pointerCancel)
    this.canvas.removeEventListener('wheel', this.wheel)
    this.canvas.remove()
  }
}
