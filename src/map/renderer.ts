import { WORLD_HALF } from '../world/geo'
import { FOG, LIGHT_MIN, PALETTE } from '../world/rules'
import type { Gathering, HoldingGroup, Memory, Stranger, Supply, Torch } from '../world/types'
import type { LightSource } from '../world/store'
import { mapData } from './mapdata'

export interface Hit {
  type: 'holding' | 'gathering' | 'torch' | 'stranger' | 'supply'
  id: string
}

export interface DrawInput {
  t: number
  player: { x: number; y: number; r: number; detectOn: boolean; codename: string }
  torches: Torch[]
  supplies: Supply[]
  holdings: HoldingGroup[]
  gatherings: Gathering[]
  /** 只放「此刻應該畫出來」的人：探知開著、同一盞燈下、對方也開著 */
  strangers: Stranger[]
  lights: LightSource[]
  currentLight: LightSource | null
  selectedId: string | null
  supplyLocked: (s: Supply) => boolean
  labels: {
    pending: (g: Gathering) => string
    memory: string
    hostPays: string
  }
}

const FOG_PX_PER_M = 0.12
const GRID_CELL = 25

/**
 * 迷霧地圖繪製器。三層：
 *   fogCv  — 記憶遮罩（不透明黑，累積挖洞，永不重置，除非燒掉身分）
 *   visCv  — 視野遮罩（半透明，每幀重畫）
 *   main   — 底圖 + 光源 + 活物 + 標籤 + 玩家
 */
export class MapRenderer {
  readonly cam = { cx: 0, cy: 0, scale: 0.3 }
  private ctx: CanvasRenderingContext2D
  private fogCv: HTMLCanvasElement
  private fogCtx: CanvasRenderingContext2D
  private visCv: HTMLCanvasElement
  private visCtx: CanvasRenderingContext2D
  private w = 0
  private h = 0
  private dpr = 1
  private appliedMemories = 0
  private explored: Uint8Array
  private gridW: number
  private gridH: number
  private hits: { hit: Hit; px: number; py: number; r: number }[] = []
  private canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.fogCv = document.createElement('canvas')
    this.fogCv.width = Math.ceil(WORLD_HALF.x * 2 * FOG_PX_PER_M)
    this.fogCv.height = Math.ceil(WORLD_HALF.y * 2 * FOG_PX_PER_M)
    this.fogCtx = this.fogCv.getContext('2d')!
    this.visCv = document.createElement('canvas')
    this.visCtx = this.visCv.getContext('2d')!
    this.gridW = Math.ceil((WORLD_HALF.x * 2) / GRID_CELL)
    this.gridH = Math.ceil((WORLD_HALF.y * 2) / GRID_CELL)
    this.explored = new Uint8Array(this.gridW * this.gridH)
    this.resetFog()
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect()
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    this.w = Math.max(1, Math.round(rect.width))
    this.h = Math.max(1, Math.round(rect.height))
    this.canvas.width = this.w * this.dpr
    this.canvas.height = this.h * this.dpr
    this.visCv.width = this.w
    this.visCv.height = this.h
  }

  get size() {
    return { w: this.w, h: this.h }
  }

  worldToScreen(x: number, y: number) {
    return { px: (x - this.cam.cx) * this.cam.scale + this.w / 2, py: (y - this.cam.cy) * this.cam.scale + this.h / 2 }
  }

  screenToWorld(px: number, py: number) {
    return { x: (px - this.w / 2) / this.cam.scale + this.cam.cx, y: (py - this.h / 2) / this.cam.scale + this.cam.cy }
  }

  zoomAt(px: number, py: number, factor: number) {
    const before = this.screenToWorld(px, py)
    this.cam.scale = Math.min(1.2, Math.max(0.045, this.cam.scale * factor))
    const after = this.screenToWorld(px, py)
    this.cam.cx += before.x - after.x
    this.cam.cy += before.y - after.y
  }

  /* ---------- 記憶 ---------- */

  private resetFog() {
    this.fogCtx.globalCompositeOperation = 'source-over'
    this.fogCtx.fillStyle = FOG.unexplored
    this.fogCtx.fillRect(0, 0, this.fogCv.width, this.fogCv.height)
    this.explored.fill(0)
    this.appliedMemories = 0
  }

  applyMemories(memories: Memory[]) {
    if (memories.length < this.appliedMemories) this.resetFog()
    const ctx = this.fogCtx
    ctx.globalCompositeOperation = 'destination-out'
    for (let i = this.appliedMemories; i < memories.length; i++) {
      const m = memories[i]
      const fx = (m.x + WORLD_HALF.x) * FOG_PX_PER_M
      const fy = (m.y + WORLD_HALF.y) * FOG_PX_PER_M
      const fr = m.r * FOG_PX_PER_M
      const g = ctx.createRadialGradient(fx, fy, fr * 0.8, fx, fy, fr)
      g.addColorStop(0, 'rgba(0,0,0,1)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(fx, fy, fr, 0, Math.PI * 2)
      ctx.fill()
      this.markExplored(m)
    }
    ctx.globalCompositeOperation = 'source-over'
    this.appliedMemories = memories.length
  }

  private markExplored(m: Memory) {
    const r = m.r * 0.9
    const x0 = Math.max(0, Math.floor((m.x - r + WORLD_HALF.x) / GRID_CELL))
    const x1 = Math.min(this.gridW - 1, Math.floor((m.x + r + WORLD_HALF.x) / GRID_CELL))
    const y0 = Math.max(0, Math.floor((m.y - r + WORLD_HALF.y) / GRID_CELL))
    const y1 = Math.min(this.gridH - 1, Math.floor((m.y + r + WORLD_HALF.y) / GRID_CELL))
    for (let gy = y0; gy <= y1; gy++) {
      const cy = (gy + 0.5) * GRID_CELL - WORLD_HALF.y
      for (let gx = x0; gx <= x1; gx++) {
        const cx = (gx + 0.5) * GRID_CELL - WORLD_HALF.x
        if ((cx - m.x) ** 2 + (cy - m.y) ** 2 <= r * r) this.explored[gy * this.gridW + gx] = 1
      }
    }
  }

  isRemembered(x: number, y: number): boolean {
    const gx = Math.floor((x + WORLD_HALF.x) / GRID_CELL)
    const gy = Math.floor((y + WORLD_HALF.y) / GRID_CELL)
    if (gx < 0 || gy < 0 || gx >= this.gridW || gy >= this.gridH) return false
    return this.explored[gy * this.gridW + gx] === 1
  }

  /** 已探索比例（陸地格子為分母的粗估） */
  exploredRatio(): number {
    let n = 0
    for (let i = 0; i < this.explored.length; i++) n += this.explored[i]
    return n / this.explored.length
  }

  /* ---------- 繪製 ---------- */

  draw(input: DrawInput) {
    const { ctx } = this
    this.hits = []
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.fillStyle = PALETTE.void
    ctx.fillRect(0, 0, this.w, this.h)

    this.drawBase()
    this.drawGlows(input)
    this.drawVisibility(input.lights)
    this.drawFog()
    this.drawHints(input)
    this.drawUnits(input)
    this.drawPlayer(input)
  }

  private isVisible(lights: LightSource[], x: number, y: number) {
    for (const s of lights) if ((s.x - x) ** 2 + (s.y - y) ** 2 <= s.r * s.r) return true
    return false
  }

  private inView(x: number, y: number, margin = 400) {
    const { px, py } = this.worldToScreen(x, y)
    const m = margin * this.cam.scale
    return px > -m && py > -m && px < this.w + m && py < this.h + m
  }

  private drawBase() {
    const { ctx, cam } = this
    const s = cam.scale
    ctx.save()
    ctx.translate(this.w / 2 - cam.cx * s, this.h / 2 - cam.cy * s)
    ctx.scale(s, s)
    ctx.fillStyle = PALETTE.land
    ctx.strokeStyle = PALETTE.line
    ctx.lineWidth = 1 / s
    const drawStroke = s > 0.07
    // 只畫視窗內的里
    const left = cam.cx - this.w / 2 / s - 500
    const right = cam.cx + this.w / 2 / s + 500
    const top = cam.cy - this.h / 2 / s - 500
    const bottom = cam.cy + this.h / 2 / s + 500
    for (const v of mapData.villages) {
      for (const ring of v.r) {
        const [x0, y0] = ring[0]
        if (x0 < left || x0 > right || y0 < top || y0 > bottom) continue
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1])
        ctx.closePath()
        ctx.fill()
        if (drawStroke) ctx.stroke()
      }
    }
    for (const line of mapData.mrt) {
      ctx.strokeStyle = line.c
      ctx.globalAlpha = 0.85
      ctx.lineWidth = 3 / s
      ctx.lineJoin = 'round'
      ctx.beginPath()
      line.p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      ctx.stroke()
      ctx.globalAlpha = 1
      if (s > 0.09) {
        ctx.fillStyle = PALETTE.ink
        for (const st of line.s) {
          ctx.beginPath()
          ctx.arc(st.x, st.y, 4 / s, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
        }
      }
    }
    ctx.restore()
    if (s > 0.16) {
      ctx.font = '11px "Noto Sans TC", system-ui'
      ctx.fillStyle = PALETTE.haze
      ctx.textAlign = 'left'
      for (const line of mapData.mrt) {
        for (const st of line.s) {
          if (!this.inView(st.x, st.y, 0)) continue
          const { px, py } = this.worldToScreen(st.x, st.y)
          ctx.fillText(st.n, px + 7, py + 4)
        }
      }
    }
  }

  private radial(x: number, y: number, r: number, color: string, alpha: number) {
    const { ctx } = this
    const { px, py } = this.worldToScreen(x, y)
    const pr = r * this.cam.scale
    if (pr < 1) return
    const g = ctx.createRadialGradient(px, py, 0, px, py, pr)
    g.addColorStop(0, hexA(color, alpha))
    g.addColorStop(0.7, hexA(color, alpha * 0.45))
    g.addColorStop(1, hexA(color, 0))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(px, py, pr, 0, Math.PI * 2)
    ctx.fill()
  }

  private drawGlows(input: DrawInput) {
    for (const t of input.torches) {
      if (!t.lit || !this.inView(t.x, t.y, t.eff)) continue
      this.radial(t.x, t.y, t.eff, PALETTE.fire, 0.3)
    }
    for (const s of input.lights) {
      if (s.kind === 'holding' || s.kind === 'gathering') this.radial(s.x, s.y, s.r, PALETTE.lilac, 0.26)
    }
  }

  private drawVisibility(lights: LightSource[]) {
    const v = this.visCtx
    v.setTransform(1, 0, 0, 1, 0, 0)
    v.globalCompositeOperation = 'source-over'
    v.clearRect(0, 0, this.w, this.h)
    v.fillStyle = FOG.memory
    v.fillRect(0, 0, this.w, this.h)
    v.globalCompositeOperation = 'destination-out'
    for (const s of lights) {
      const { px, py } = this.worldToScreen(s.x, s.y)
      const pr = s.r * this.cam.scale
      const g = v.createRadialGradient(px, py, pr * 0.82, px, py, pr)
      g.addColorStop(0, 'rgba(0,0,0,1)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      v.fillStyle = g
      v.beginPath()
      v.arc(px, py, pr, 0, Math.PI * 2)
      v.fill()
    }
    this.ctx.drawImage(this.visCv, 0, 0)
  }

  private drawFog() {
    const { ctx, cam } = this
    const s = cam.scale
    ctx.save()
    ctx.imageSmoothingEnabled = true
    const { px, py } = this.worldToScreen(-WORLD_HALF.x, -WORLD_HALF.y)
    ctx.drawImage(this.fogCv, px, py, (WORLD_HALF.x * 2) * s, (WORLD_HALF.y * 2) * s)
    // 世界範圍外永遠是黑的
    ctx.fillStyle = FOG.unexplored
    const x1 = px + WORLD_HALF.x * 2 * s
    const y1 = py + WORLD_HALF.y * 2 * s
    if (px > 0) ctx.fillRect(0, 0, px, this.h)
    if (x1 < this.w) ctx.fillRect(x1, 0, this.w - x1, this.h)
    if (py > 0) ctx.fillRect(0, 0, this.w, py)
    if (y1 < this.h) ctx.fillRect(0, y1, this.w, this.h - y1)
    ctx.restore()
  }

  /** 4.1：全黑區也「會顯示潛在的火把」—— 一道細細的光芒線條 */
  private drawHints(input: DrawInput) {
    const { ctx } = this
    for (const t of input.torches) {
      if (!t.lit || this.isRemembered(t.x, t.y) || !this.inView(t.x, t.y)) continue
      const { px, py } = this.worldToScreen(t.x, t.y)
      const flick = 0.55 + 0.25 * Math.sin(input.t / 300 + px)
      const g = ctx.createLinearGradient(px, py - 70, px, py)
      g.addColorStop(0, hexA(PALETTE.fire, 0))
      g.addColorStop(1, hexA(PALETTE.fire, 0.75 * flick))
      ctx.strokeStyle = g
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(px, py - 70)
      ctx.lineTo(px, py)
      ctx.stroke()
      this.radial(t.x, t.y, 60 / this.cam.scale, PALETTE.fire, 0.35 * flick)
    }
  }

  private label(text: string, px: number, py: number, color: string, alpha = 1, mono = false) {
    const { ctx } = this
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.font = `${mono ? '11px "DM Mono", ui-monospace' : '12px "Noto Sans TC", system-ui'}`
    ctx.textAlign = 'center'
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(6,6,13,0.85)'
    ctx.strokeText(text, px, py)
    ctx.fillStyle = color
    ctx.fillText(text, px, py)
    ctx.restore()
  }

  private addHit(hit: Hit, px: number, py: number, r: number) {
    this.hits.push({ hit, px, py, r })
  }

  private drawUnits(input: DrawInput) {
    const { ctx } = this
    const s = this.cam.scale
    const t = input.t
    const lightR = (id: string) => input.lights.find((l) => l.id === id)?.r ?? LIGHT_MIN

    // 火把本體（活的：只有視野內才有火焰；記憶中只剩灰色標記）
    for (const torch of input.torches) {
      if (!this.inView(torch.x, torch.y)) continue
      const { px, py } = this.worldToScreen(torch.x, torch.y)
      const visible = this.isVisible(input.lights, torch.x, torch.y)
      const remembered = this.isRemembered(torch.x, torch.y)
      if (!visible && !remembered) continue
      if (visible && torch.lit) {
        const flick = 1 + 0.15 * Math.sin(t / 120 + px)
        ctx.fillStyle = PALETTE.fire
        ctx.beginPath()
        ctx.ellipse(px, py - 6, 4 * flick, 7 * flick, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = PALETTE.amber
        ctx.beginPath()
        ctx.ellipse(px, py - 4, 2, 3.5, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = hexA(PALETTE.fire, 0.5)
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(px, py, torch.eff * s, 0, Math.PI * 2)
        ctx.stroke()
        if (!torch.temporary) this.label(torch.name, px, py + 20, PALETTE.paper)
      } else {
        ctx.strokeStyle = PALETTE.haze
        ctx.lineWidth = 1
        ctx.globalAlpha = FOG.memoryLabelAlpha
        ctx.beginPath()
        ctx.arc(px, py, 5, 0, Math.PI * 2)
        ctx.stroke()
        ctx.globalAlpha = 1
        if (!torch.temporary) {
          this.label(torch.name, px, py + 20, PALETTE.haze, FOG.memoryLabelAlpha)
          this.label(input.labels.memory, px, py + 33, PALETTE.haze, FOG.memoryLabelAlpha)
        }
      }
      this.addHit({ type: 'torch', id: torch.id }, px, py, 16)
    }

    // 物資：只有視野內才存在
    for (const sup of input.supplies) {
      if (sup.remaining <= 0 || !this.inView(sup.x, sup.y)) continue
      if (!this.isVisible(input.lights, sup.x, sup.y)) continue
      const { px, py } = this.worldToScreen(sup.x, sup.y)
      const bob = Math.sin(t / 400 + px) * 2
      const color = sup.rare ? PALETTE.pinky : PALETTE.zk
      const locked = input.supplyLocked(sup)
      ctx.save()
      ctx.translate(px, py + bob)
      ctx.rotate(Math.PI / 4)
      ctx.fillStyle = locked ? 'transparent' : color
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.shadowColor = color
      ctx.shadowBlur = locked ? 0 : 10
      ctx.beginPath()
      ctx.rect(-5, -5, 10, 10)
      if (!locked) ctx.fill()
      ctx.stroke()
      ctx.restore()
      if (s > 0.34) this.label(sup.label, px, py + 20, color, 0.9)
      this.addHit({ type: 'supply', id: sup.id }, px, py, 12)
    }

    // Holding Group：店家活動點（粉）
    for (const h of input.holdings) {
      const torch = input.torches.find((x) => x.id === h.torchId)
      if (!torch || !this.inView(torch.x, torch.y)) continue
      const visible = this.isVisible(input.lights, torch.x, torch.y)
      const remembered = this.isRemembered(torch.x, torch.y)
      if (!visible && !remembered) continue
      const { px, py } = this.worldToScreen(torch.x, torch.y)
      const alpha = visible ? 1 : FOG.memoryLabelAlpha
      ctx.globalAlpha = alpha
      ctx.fillStyle = PALETTE.pinky
      ctx.beginPath()
      ctx.arc(px + 14, py - 10, input.selectedId === h.id ? 7 : 5, 0, Math.PI * 2)
      ctx.fill()
      if (visible) {
        ctx.strokeStyle = hexA(PALETTE.lilac, 0.55)
        ctx.setLineDash([])
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(px, py, lightR(h.id) * s, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      if (h.completedByMe) {
        // 4.1：曾在該區參與過事件 → 圖釘標示紀錄，灰色區也看得到
        ctx.globalAlpha = Math.max(alpha, 0.85)
        ctx.fillStyle = PALETTE.fire
        ctx.beginPath()
        ctx.moveTo(px - 14, py - 4)
        ctx.lineTo(px - 19, py - 14)
        ctx.lineTo(px - 9, py - 14)
        ctx.closePath()
        ctx.fill()
        ctx.beginPath()
        ctx.arc(px - 14, py - 16, 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
      this.label(h.title, px, py - 22, visible ? PALETTE.pinky : PALETTE.haze, alpha)
      this.addHit({ type: 'holding', id: h.id }, px + 14, py - 10, 14)
    }

    // 自發聚集
    for (const g of input.gatherings) {
      if (g.status === 'dissolved' || !this.inView(g.x, g.y)) continue
      const visible = this.isVisible(input.lights, g.x, g.y)
      const remembered = this.isRemembered(g.x, g.y)
      if (!visible && !remembered) continue
      const { px, py } = this.worldToScreen(g.x, g.y)
      const alpha = visible ? 1 : FOG.memoryLabelAlpha
      ctx.save()
      ctx.globalAlpha = alpha
      if (g.status === 'pending') {
        // 呼吸的空心虛線圈
        const breathe = 0.92 + 0.08 * Math.sin(t / 500)
        ctx.strokeStyle = PALETTE.lilac
        ctx.setLineDash([6, 6])
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.arc(px, py, Math.max(10, LIGHT_MIN * s * breathe), 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.arc(px, py, input.selectedId === g.id ? 7 : 5, 0, Math.PI * 2)
        ctx.stroke()
      } else {
        ctx.fillStyle = PALETTE.lilac
        ctx.strokeStyle = PALETTE.lilac
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(px, py, input.selectedId === g.id ? 7 : 5, 0, Math.PI * 2)
        ctx.fill()
        if (visible) {
          ctx.beginPath()
          ctx.arc(px, py, lightR(g.id) * s, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
      if (g.hostPays) {
        ctx.fillStyle = PALETTE.amber
        ctx.beginPath()
        ctx.arc(px + 9, py - 8, 3, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
      this.label(g.title, px, py - 16, visible ? PALETTE.lilac : PALETTE.haze, alpha)
      if (g.status === 'pending' && visible) this.label(input.labels.pending(g), px, py + 22, PALETTE.lilac, 0.9, true)
      this.addHit({ type: 'gathering', id: g.id }, px, py, 14)
    }

    // 燈下的人：呼叫端已篩過（探知開著、同一盞燈、對方也開著）
    for (const st of input.strangers) {
      const { px, py } = this.worldToScreen(st.x, st.y)
      ctx.fillStyle = PALETTE.lilac
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(px, py, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(px, py, 10, 0, Math.PI * 2)
      ctx.stroke()
      this.label(st.codename, px, py - 14, PALETTE.lilac, 0.95, true)
      this.addHit({ type: 'stranger', id: st.id }, px, py, 14)
    }
  }

  private drawPlayer(input: DrawInput) {
    const { ctx } = this
    const p = input.player
    const { px, py } = this.worldToScreen(p.x, p.y)
    ctx.strokeStyle = hexA(PALETTE.paper, 0.25)
    ctx.setLineDash([3, 5])
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(px, py, p.r * this.cam.scale, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    if (p.detectOn) {
      // 4.5 規則 1：白色光暈明示「你正在被看到」
      const pulse = 14 + 3 * Math.sin(input.t / 250)
      const g = ctx.createRadialGradient(px, py, 4, px, py, pulse)
      g.addColorStop(0, 'rgba(255,255,255,0.55)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(px, py, pulse, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = PALETTE.paper
    ctx.strokeStyle = PALETTE.pinky
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(px, py, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    this.label(p.codename, px, py - 14, PALETTE.paper, 1, true)
  }

  hitTest(px: number, py: number): Hit | null {
    let best: { hit: Hit; d: number } | null = null
    for (const h of this.hits) {
      const d = Math.hypot(h.px - px, h.py - py)
      if (d <= h.r && (!best || d < best.d)) best = { hit: h.hit, d }
    }
    return best?.hit ?? null
  }
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`
}
