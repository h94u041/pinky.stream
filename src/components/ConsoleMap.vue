<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { mapData } from '../map/mapdata'
import { LIGHT_R, PALETTE } from '../world/rules'
import { world } from '../world/store'

/**
 * 店家後台的地圖：沒有迷霧。實心暖光＝有效半徑，虛線鬼圈＝基礎半徑；
 * 圈內的自發聚集只畫位置與人數，不畫是誰。
 */
const props = defineProps<{ placing: boolean; selectedTorchId: string | null }>()
const emit = defineEmits<{ place: [x: number, y: number]; pick: [torchId: string] }>()

const canvas = ref<HTMLCanvasElement | null>(null)
const cam = { cx: 0, cy: -600, scale: 0.06 }
let raf = 0
let w = 0
let h = 0
let dpr = 1
const ptr = { down: false, moved: false, x: 0, y: 0, sx: 0, sy: 0 }

const w2s = (x: number, y: number) => ({ px: (x - cam.cx) * cam.scale + w / 2, py: (y - cam.cy) * cam.scale + h / 2 })
const s2w = (px: number, py: number) => ({ x: (px - w / 2) / cam.scale + cam.cx, y: (py - h / 2) / cam.scale + cam.cy })

function resize() {
  const c = canvas.value!
  const r = c.getBoundingClientRect()
  dpr = Math.min(2, window.devicePixelRatio || 1)
  w = Math.max(1, Math.round(r.width))
  h = Math.max(1, Math.round(r.height))
  c.width = w * dpr
  c.height = h * dpr
}

function draw(t: number) {
  raf = requestAnimationFrame(draw)
  const ctx = canvas.value!.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = PALETTE.void
  ctx.fillRect(0, 0, w, h)

  ctx.save()
  ctx.translate(w / 2 - cam.cx * cam.scale, h / 2 - cam.cy * cam.scale)
  ctx.scale(cam.scale, cam.scale)
  ctx.fillStyle = PALETTE.land
  ctx.strokeStyle = PALETTE.line
  ctx.lineWidth = 1 / cam.scale
  for (const v of mapData.villages) {
    for (const ring of v.r) {
      ctx.beginPath()
      ring.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      ctx.closePath()
      ctx.fill()
      if (cam.scale > 0.07) ctx.stroke()
    }
  }
  for (const line of mapData.mrt) {
    ctx.strokeStyle = line.c
    ctx.lineWidth = 3 / cam.scale
    ctx.globalAlpha = 0.8
    ctx.beginPath()
    line.p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  ctx.restore()

  for (const torch of world.torches) {
    const { px, py } = w2s(torch.x, torch.y)
    const effP = torch.eff * cam.scale
    const baseP = torch.baseR * cam.scale
    if (torch.lit) {
      const g = ctx.createRadialGradient(px, py, 0, px, py, effP)
      g.addColorStop(0, 'rgba(255,154,60,0.35)')
      g.addColorStop(1, 'rgba(255,154,60,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(px, py, effP, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = PALETTE.fire
      ctx.lineWidth = props.selectedTorchId === torch.id ? 2 : 1
      ctx.beginPath()
      ctx.arc(px, py, effP, 0, Math.PI * 2)
      ctx.stroke()
      // 鬼圈：基礎半徑
      ctx.setLineDash([4, 5])
      ctx.strokeStyle = 'rgba(255,154,60,0.45)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(px, py, baseP, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }
    ctx.fillStyle = torch.lit ? PALETTE.fire : PALETTE.haze
    ctx.beginPath()
    ctx.arc(px, py, torch.temporary ? 3 : 5, 0, Math.PI * 2)
    ctx.fill()
    if (!torch.temporary) {
      ctx.font = '12px "Noto Sans TC", system-ui'
      ctx.fillStyle = torch.lit ? PALETTE.paper : PALETTE.haze
      ctx.textAlign = 'center'
      ctx.fillText(torch.name, px, py + 18)
    }
  }
  for (const s of world.supplies) {
    if (s.remaining <= 0) continue
    const { px, py } = w2s(s.x, s.y)
    ctx.fillStyle = s.rare ? PALETTE.pinky : PALETTE.zk
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(Math.PI / 4)
    ctx.fillRect(-3, -3, 6, 6)
    ctx.restore()
  }
  for (const g of world.gatherings) {
    if (g.status === 'dissolved') continue
    const { px, py } = w2s(g.x, g.y)
    ctx.strokeStyle = PALETTE.lilac
    ctx.fillStyle = PALETTE.lilac
    ctx.lineWidth = 1
    if (g.status === 'pending') {
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.arc(px, py, Math.max(6, LIGHT_R.gathering * cam.scale * (0.92 + 0.08 * Math.sin(t / 500))), 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    } else {
      ctx.beginPath()
      ctx.arc(px, py, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(px, py, LIGHT_R.gathering * cam.scale, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  if (props.placing) {
    ctx.strokeStyle = PALETTE.zk
    ctx.setLineDash([6, 4])
    ctx.lineWidth = 2
    ctx.strokeRect(2, 2, w - 4, h - 4)
    ctx.setLineDash([])
  }
}

function onDown(e: PointerEvent) {
  ptr.down = true
  ptr.moved = false
  ptr.x = ptr.sx = e.clientX
  ptr.y = ptr.sy = e.clientY
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
}
function onMove(e: PointerEvent) {
  if (!ptr.down) return
  if (Math.hypot(e.clientX - ptr.sx, e.clientY - ptr.sy) > 4) ptr.moved = true
  if (ptr.moved) {
    cam.cx -= (e.clientX - ptr.x) / cam.scale
    cam.cy -= (e.clientY - ptr.y) / cam.scale
  }
  ptr.x = e.clientX
  ptr.y = e.clientY
}
function onUp(e: PointerEvent) {
  if (!ptr.down) return
  ptr.down = false
  if (ptr.moved) return
  const r = canvas.value!.getBoundingClientRect()
  const px = e.clientX - r.left
  const py = e.clientY - r.top
  const wpt = s2w(px, py)
  if (props.placing) {
    emit('place', wpt.x, wpt.y)
    return
  }
  let best: { id: string; d: number } | null = null
  for (const torch of world.torches) {
    if (torch.temporary) continue
    const { px: tx, py: ty } = w2s(torch.x, torch.y)
    const d = Math.hypot(tx - px, ty - py)
    if (d < 16 && (!best || d < best.d)) best = { id: torch.id, d }
  }
  if (best) emit('pick', best.id)
}
function onWheel(e: WheelEvent) {
  e.preventDefault()
  const r = canvas.value!.getBoundingClientRect()
  const px = e.clientX - r.left
  const py = e.clientY - r.top
  const before = s2w(px, py)
  cam.scale = Math.min(0.8, Math.max(0.03, cam.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))
  const after = s2w(px, py)
  cam.cx += before.x - after.x
  cam.cy += before.y - after.y
}

onMounted(() => {
  resize()
  window.addEventListener('resize', resize)
  raf = requestAnimationFrame(draw)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', resize)
})
</script>

<template>
  <canvas ref="canvas" class="cv" :class="{ placing }" @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="ptr.down = false" @wheel="onWheel" />
</template>

<style scoped>
.cv {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
  cursor: grab;
  border-radius: 12px;
  border: 1px solid var(--line);
}
.cv.placing {
  cursor: crosshair;
}
</style>
