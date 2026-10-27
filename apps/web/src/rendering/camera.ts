export interface Size {
  width: number
  height: number
}
export interface Camera {
  x: number
  y: number
  zoom: number
}

/** Zoom is relative to filling the viewport, so the camera can never reveal outside space. */
export function constrainCamera(world: Size, viewport: Size, camera: Camera) {
  const zoom = Math.max(1, Math.min(6, camera.zoom))
  const scale = Math.max(viewport.width / world.width, viewport.height / world.height) * zoom
  const halfWidth = Math.min(world.width / 2, viewport.width / (2 * scale))
  const halfHeight = Math.min(world.height / 2, viewport.height / (2 * scale))
  const x = Math.max(halfWidth, Math.min(world.width - halfWidth, camera.x))
  const y = Math.max(halfHeight, Math.min(world.height - halfHeight, camera.y))
  return {
    x,
    y,
    zoom,
    scale,
    left: viewport.width / 2 - x * scale,
    top: viewport.height / 2 - y * scale,
  }
}
