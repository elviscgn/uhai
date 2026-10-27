import type { Agent, Frame } from '../types'

export function angleLerp(a: number, b: number, t: number): number {
  const delta = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI
  return a + delta * t
}
/** Exponential angular easing has the same response at different display frame rates. */
export function easeAngle(current: number, target: number, elapsed: number): number {
  return angleLerp(current, target, 1 - Math.exp(-Math.max(0, elapsed) / 0.075))
}
/** After rotation, mirroring local Y keeps the illustrated belly facing screen-down. */
export function bellyScaleY(heading: number): 1 | -1 {
  return Math.cos(heading) < 0 ? -1 : 1
}
export function interpolate(
  a: Agent,
  b: Agent | undefined,
  fraction: number,
): { x: number; y: number; angle: number } {
  const next = b ?? a
  return {
    x: a[2] + (next[2] - a[2]) * fraction,
    y: a[3] + (next[3] - a[3]) * fraction,
    angle: angleLerp(a[6], next[6], fraction),
  }
}
export function sample(frames: Frame[], time: number): { index: number; fraction: number } {
  let low = 0,
    high = frames.length - 1
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (frames[mid].time <= time) low = mid
    else high = mid - 1
  }
  const a = frames[low],
    b = frames[low + 1]
  return {
    index: low,
    fraction: b ? Math.max(0, Math.min(1, (time - a.time) / (b.time - a.time))) : 0,
  }
}
