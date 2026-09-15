<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFmt } from '../composables/useFmt'
import { MapRenderer, type Hit } from '../map/renderer'
import {
  currentLight,
  detectedStrangers,
  isWalking,
  lightSources,
  needOf,
  joinedCount,
  playerRadius,
  stepWalk,
  supplyLocked,
  tick,
  walkTo,
  world,
} from '../world/store'

const props = defineProps<{
  selectedId: string | null
  /** 店家後台模式：點地圖不是走路，而是回報座標 */
  placeMode?: boolean
}>()
const emit = defineEmits<{
  select: [hit: Hit | null]
  place: [x: number, y: number]
}>()

const { t } = useI18n()
const fmt = useFmt()
const canvas = ref<HTMLCanvasElement | null>(null)
let renderer: MapRenderer | null = null
let raf = 0
let last = performance.now()
const explored = ref(0)

const pointer = { down: false, moved: false, x: 0, y: 0, sx: 0, sy: 0 }

function onDown(e: PointerEvent) {
  pointer.down = true
  pointer.moved = false
  pointer.x = pointer.sx = e.clientX
  pointer.y = pointer.sy = e.clientY
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
}
function onMove(e: PointerEvent) {
  if (!pointer.down || !renderer) return
  const dx = e.clientX - pointer.x
  const dy = e.clientY - pointer.y
  if (Math.hypot(e.clientX - pointer.sx, e.clientY - pointer.sy) > 4) pointer.moved = true
  if (pointer.moved) {
    renderer.cam.cx -= dx / renderer.cam.scale
    renderer.cam.cy -= dy / renderer.cam.scale
  }
  pointer.x = e.clientX
  pointer.y = e.clientY
}
function onUp(e: PointerEvent) {
  if (!pointer.down || !renderer) return
  pointer.down = false
  if (pointer.moved) return
  const rect = canvas.value!.getBoundingClientRect()
  const px = e.clientX - rect.left
  const py = e.clientY - rect.top
  const hit = renderer.hitTest(px, py)
  const w = renderer.screenToWorld(px, py)
  if (props.placeMode) {
    emit('place', w.x, w.y)
    return
  }
  if (hit) {
    emit('select', hit)
    return
  }
  emit('select', null)
  walkTo(w.x, w.y)
}
function onWheel(e: WheelEvent) {
  if (!renderer) return
  e.preventDefault()
  const rect = canvas.value!.getBoundingClientRect()
  renderer.zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.15 : 1 / 1.15)
}
function zoom(f: number) {
  renderer?.zoomAt(renderer.size.w / 2, renderer.size.h / 2, f)
}
function locate() {
  if (!renderer) return
  renderer.cam.cx = world.player.x
  renderer.cam.cy = world.player.y
}
function centerOn(x: number, y: number) {
  if (!renderer) return
  renderer.cam.cx = x
  renderer.cam.cy = y
}
defineExpose({ centerOn, locate })

let frame = 0
function loop(now: number) {
  raf = requestAnimationFrame(loop)
  if (!renderer) return
  const dt = Math.min(100, now - last)
  last = now
  tick()
  if (isWalking()) {
    stepWalk(dt)
    // 走路時鏡頭跟著人
    renderer.cam.cx += (world.player.x - renderer.cam.cx) * 0.12
    renderer.cam.cy += (world.player.y - renderer.cam.cy) * 0.12
  }
  renderer.applyMemories(world.memories)
  renderer.draw({
    t: now,
    player: { x: world.player.x, y: world.player.y, r: playerRadius(), detectOn: world.player.detectOn, codename: world.player.codename },
    torches: world.torches,
    supplies: world.supplies,
    holdings: world.holdings,
    gatherings: world.gatherings,
    strangers: detectedStrangers.value,
    lights: lightSources.value,
    currentLight: currentLight.value,
    selectedId: props.selectedId,
    supplyLocked,
    labels: {
      pending: (g) => t('map.pending', { n: Math.max(0, needOf(g) - joinedCount(g)), t: fmt.left(g.deadline - world.now) }),
      memory: t('map.memory'),
      hostPays: t('map.hostPays'),
    },
  })
  if (++frame % 60 === 0) explored.value = Math.round(renderer.exploredRatio() * 1000) / 10
}

function onResize() {
  renderer?.resize()
}

onMounted(() => {
  renderer = new MapRenderer(canvas.value!)
  renderer.resize()
  renderer.cam.cx = world.player.x
  renderer.cam.cy = world.player.y
  window.addEventListener('resize', onResize)
  raf = requestAnimationFrame(loop)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <div class="map">
    <canvas
      ref="canvas"
      class="cv"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="pointer.down = false"
      @wheel="onWheel"
    />
    <div class="ctrls">
      <button :title="t('map.zoomIn')" @click="zoom(1.3)">+</button>
      <button :title="t('map.zoomOut')" @click="zoom(1 / 1.3)">−</button>
      <button :title="t('map.locate')" @click="locate">◎</button>
    </div>
    <div class="explored mono">{{ t('map.explored', { p: explored }) }}</div>
    <slot />
  </div>
</template>

<style scoped>
.map {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--void);
}
.cv {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
  cursor: crosshair;
}
.ctrls {
  position: absolute;
  right: 10px;
  top: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ctrls button {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: rgba(25, 21, 39, 0.85);
  color: var(--paper);
  cursor: pointer;
  font-size: 16px;
}
.explored {
  position: absolute;
  left: 10px;
  top: 10px;
  font-size: 11px;
  color: var(--haze);
  background: rgba(25, 21, 39, 0.75);
  border: 1px solid var(--line);
  padding: 2px 8px;
  border-radius: 999px;
}
</style>
