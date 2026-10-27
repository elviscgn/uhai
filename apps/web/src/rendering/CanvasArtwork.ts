type Paint = number | { color: number; alpha?: number }
interface Command {
  path: Path2D
  color: string
  alpha: number
  width?: number
}
const color = (value: number) => `#${value.toString(16).padStart(6, '0')}`

/** Retained vector paths, used only while preparing cached artwork and static terrain. */
export class CanvasArtwork {
  private path = new Path2D()
  private commands: Command[] = []
  moveTo(x: number, y: number) {
    this.path.moveTo(x, y)
    return this
  }
  lineTo(x: number, y: number) {
    this.path.lineTo(x, y)
    return this
  }
  bezierCurveTo(a: number, b: number, c: number, d: number, x: number, y: number) {
    this.path.bezierCurveTo(a, b, c, d, x, y)
    return this
  }
  quadraticCurveTo(a: number, b: number, x: number, y: number) {
    this.path.quadraticCurveTo(a, b, x, y)
    return this
  }
  closePath() {
    this.path.closePath()
    return this
  }
  circle(x: number, y: number, radius: number) {
    this.path.moveTo(x + radius, y)
    this.path.arc(x, y, radius, 0, Math.PI * 2)
    return this
  }
  ellipse(x: number, y: number, rx: number, ry: number) {
    this.path.moveTo(x + rx, y)
    this.path.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
    return this
  }
  rect(x: number, y: number, width: number, height: number) {
    this.path.rect(x, y, width, height)
    return this
  }
  poly(points: number[]) {
    this.path.moveTo(points[0], points[1])
    for (let i = 2; i < points.length; i += 2) this.path.lineTo(points[i], points[i + 1])
    this.path.closePath()
    return this
  }
  fill(paint: Paint) {
    const p = typeof paint === 'number' ? { color: paint } : paint
    this.commands.push({ path: this.path, color: color(p.color), alpha: p.alpha ?? 1 })
    this.path = new Path2D()
    return this
  }
  stroke(paint: { color: number; alpha?: number; width: number }) {
    this.commands.push({
      path: this.path,
      color: color(paint.color),
      alpha: paint.alpha ?? 1,
      width: paint.width,
    })
    this.path = new Path2D()
    return this
  }
  draw(ctx: CanvasRenderingContext2D) {
    const opacity = ctx.globalAlpha
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const command of this.commands) {
      ctx.globalAlpha = opacity * command.alpha
      if (command.width !== undefined) {
        ctx.strokeStyle = command.color
        ctx.lineWidth = command.width
        ctx.stroke(command.path)
      } else {
        ctx.fillStyle = command.color
        ctx.fill(command.path)
      }
    }
    ctx.globalAlpha = opacity
  }
}
