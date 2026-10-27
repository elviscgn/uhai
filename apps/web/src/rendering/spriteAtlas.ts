import { createCreatureArtwork } from './fishArtwork'
import type { CreatureArtwork } from './fishArtwork'
import type { CanvasArtwork } from './CanvasArtwork'

export const TAIL_FRAMES = 4
export const PREY_WIDTH = 32
export const PREDATOR_WIDTH = PREY_WIDTH * 1.4
const DENSITY = 8
const SIDE = 64
export interface CachedFish {
  frames: HTMLCanvasElement[]
  width: number
  height: number
  originX: number
  originY: number
  visibleWidth: number
}
export interface FishAtlas {
  species: [CachedFish, CachedFish]
  cacheBuilds: number
}
let sharedAtlas: FishAtlas | undefined

function canvas(width: number, height: number) {
  const element = document.createElement('canvas')
  element.width = width
  element.height = height
  return element
}
function part(
  ctx: CanvasRenderingContext2D,
  art: CanvasArtwork,
  x: number,
  y: number,
  angle = 0,
  sy = 1,
) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.scale(1, sy)
  art.draw(ctx)
  ctx.restore()
}
function speciesFrames(art: CreatureArtwork, predator: boolean): CachedFish {
  const source: HTMLCanvasElement[] = []
  let left = SIDE * DENSITY,
    top = left,
    right = 0,
    bottom = 0
  for (let frame = 0; frame < TAIL_FRAMES; frame++) {
    const image = canvas(SIDE * DENSITY, SIDE * DENSITY)
    const ctx = image.getContext('2d', { willReadFrequently: true })!
    const phase = (frame * Math.PI) / 2,
      stroke = Math.sin(phase)
    ctx.scale(DENSITY, DENSITY)
    ctx.translate(SIDE / 2, SIDE / 2)
    part(ctx, art.tail, predator ? -12 : -9, stroke * 0.35, stroke * (predator ? 0.25 : 0.32))
    part(ctx, art.dorsal, -1, predator ? -8 : -5.8, stroke * 0.025)
    part(ctx, art.body, 0, 0, 0, 1 + Math.cos(phase * 2) * 0.012)
    part(
      ctx,
      art.pectoral,
      1,
      predator ? 4.5 : 3,
      -0.1 + stroke * 0.2,
      0.88 + Math.cos(phase) * 0.12,
    )
    const pixels = ctx.getImageData(0, 0, image.width, image.height).data
    for (let y = 0; y < image.height; y++)
      for (let x = 0; x < image.width; x++) {
        if (pixels[(y * image.width + x) * 4 + 3] > 2) {
          left = Math.min(left, x)
          right = Math.max(right, x + 1)
          top = Math.min(top, y)
          bottom = Math.max(bottom, y + 1)
        }
      }
    source.push(image)
  }
  const targetWidth = predator ? PREDATOR_WIDTH : PREY_WIDTH
  const normalization = targetWidth / ((right - left) / DENSITY)
  left = Math.max(0, left - 2)
  right = Math.min(SIDE * DENSITY, right + 2)
  top = Math.max(0, top - 2)
  bottom = Math.min(SIDE * DENSITY, bottom + 2)
  const frames = source.map((image) => {
    const cropped = canvas(right - left, bottom - top)
    cropped
      .getContext('2d')!
      .drawImage(image, left, top, right - left, bottom - top, 0, 0, cropped.width, cropped.height)
    return cropped
  })
  return {
    frames,
    width: ((right - left) / DENSITY) * normalization,
    height: ((bottom - top) / DENSITY) * normalization,
    originX: (((SIDE * DENSITY) / 2 - left) / DENSITY) * normalization,
    originY: (((SIDE * DENSITY) / 2 - top) / DENSITY) * normalization,
    visibleWidth: targetWidth,
  }
}
/** Eight offscreen images are built once per page, shared across renderer remounts. */
export function getFishAtlas(): FishAtlas {
  if (!sharedAtlas) {
    const art = createCreatureArtwork()
    sharedAtlas = {
      species: [speciesFrames(art[0], true), speciesFrames(art[1], false)],
      cacheBuilds: 8,
    }
  }
  return sharedAtlas
}
