import { describe, expect, it } from 'vitest'
import { angleLerp, bellyScaleY, easeAngle, interpolate, sample } from './playback'
import type { Agent, Frame } from '../types'

describe('recorded playback', () => {
  it('keeps the belly screen-down around a full turn, including leftward headings', () => {
    for (let degrees = -720; degrees <= 720; degrees += 3) {
      const heading = (degrees * Math.PI) / 180
      // A belly point is local (0,+1); after the actual scale+rotation its screen Y must be positive.
      const screenBellyY = Math.cos(heading) * bellyScaleY(heading)
      expect(screenBellyY).toBeGreaterThanOrEqual(-1e-12)
    }
    expect(bellyScaleY(Math.PI)).toBe(-1)
    expect(bellyScaleY(0)).toBe(1)
  })
  it('eases through the short angular arc with frame-rate independent timing', () => {
    const target = -Math.PI + 0.2
    let at30 = Math.PI - 0.2,
      at60 = at30
    for (let i = 0; i < 30; i++) at30 = easeAngle(at30, target, 1 / 30)
    for (let i = 0; i < 60; i++) at60 = easeAngle(at60, target, 1 / 60)
    expect(at30).toBeCloseTo(at60, 9)
    const first = easeAngle(Math.PI - 0.2, target, 1 / 60)
    expect(first).toBeGreaterThan(Math.PI - 0.2)
    expect(first).toBeLessThan(Math.PI + 0.2)
  })
  it('interpolates positions and turns through the short arc at the angle boundary', () => {
    const a: Agent = [0, 0, 10, 20, 0, 0, Math.PI - 0.1, 1, 1, 0, 0, 0, 0, 0, 0]
    const b: Agent = [...a]
    b[2] = 30
    b[3] = 40
    b[6] = -Math.PI + 0.1
    const middle = interpolate(a, b, 0.5)
    expect(middle.x).toBe(20)
    expect(middle.y).toBe(30)
    expect(middle.angle).toBeCloseTo(Math.PI)
    expect(angleLerp(0, 1, 0)).toBe(0)
  })
  it('handles nonuniform final frame intervals and clamps playback endpoints', () => {
    const frames: Frame[] = [0, 0.1, 0.2, 0.25].map((time, step) => ({
      time,
      step,
      agents: [],
      food: [],
    }))
    expect(sample(frames, 0.225).index).toBe(2)
    expect(sample(frames, 0.225).fraction).toBeCloseTo(0.5)
    expect(sample(frames, 99)).toEqual({ index: 3, fraction: 0 })
    expect(sample(frames, -0.1)).toEqual({ index: 0, fraction: 0 })
  })
})
