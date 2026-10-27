import { describe, expect, it } from 'vitest'
import { constrainCamera } from './camera'
import type { Camera, Size } from './camera'

function expectCovered(world: Size, viewport: Size, camera: Camera) {
  const c = constrainCamera(world, viewport, camera)
  expect(c.left).toBeLessThanOrEqual(1e-8)
  expect(c.top).toBeLessThanOrEqual(1e-8)
  expect(c.left + world.width * c.scale).toBeGreaterThanOrEqual(viewport.width - 1e-8)
  expect(c.top + world.height * c.scale).toBeGreaterThanOrEqual(viewport.height - 1e-8)
  return c
}

describe('habitat camera boundaries', () => {
  const world = { width: 1200, height: 800 }
  it('stops zoom-out at a view that fills the entire viewport', () => {
    const c = expectCovered(world, { width: 1980, height: 670 }, { x: 600, y: 400, zoom: 0.01 })
    expect(c.zoom).toBe(1)
    expect(c.scale).toBeCloseTo(1980 / 1200)
  })
  it('clamps panning and tracking at every edge, at minimum and maximum zoom', () => {
    for (const zoom of [1, 2, 6, 100])
      for (const x of [-10000, 0, 600, 1200, 10000]) {
        for (const y of [-10000, 0, 400, 800, 10000]) {
          const c = expectCovered(world, { width: 1280, height: 440 }, { x, y, zoom })
          expect(c.zoom).toBeLessThanOrEqual(6)
        }
      }
  })
  it('keeps the view covered after desktop window resizes', () => {
    for (const viewport of [
      { width: 1980, height: 670 },
      { width: 1180, height: 620 },
      { width: 1440, height: 900 },
    ]) {
      expectCovered(world, viewport, { x: 0, y: 800, zoom: 1.4 })
    }
  })
  it('covers even extreme habitat aspect ratios', () => {
    expectCovered(
      { width: 5000, height: 200 },
      { width: 390, height: 844 },
      { x: 0, y: 0, zoom: 0.1 },
    )
    expectCovered(
      { width: 200, height: 5000 },
      { width: 2000, height: 500 },
      { x: 200, y: 5000, zoom: 1 },
    )
  })
})
