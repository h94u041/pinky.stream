<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BackpackPanel from '../components/BackpackPanel.vue'
import CreateGathering from '../components/CreateGathering.vue'
import DetectPanel from '../components/DetectPanel.vue'
import DissolvedDialog from '../components/DissolvedDialog.vue'
import EventSheet from '../components/EventSheet.vue'
import FogMap from '../components/FogMap.vue'
import IdentityPanel from '../components/IdentityPanel.vue'
import { geo, toggleGeo } from '../composables/useGeo'
import type { Hit } from '../map/renderer'
import { currentLight, dismissFormed, toast, toggleDetect, world } from '../world/store'
import type { Gathering } from '../world/types'

const { t } = useI18n()
const map = ref<InstanceType<typeof FogMap> | null>(null)
const hit = ref<Hit | null>(null)
const createOpen = ref(false)
const retryFrom = ref<Gathering | null>(null)
const bagOpen = ref(false)
const idOpen = ref(false)

const selectedId = computed(() => hit.value?.id ?? null)

const gpsLabel = computed(() => {
  switch (geo.status) {
    case 'on':
      return t('gps.accuracy', { m: Math.round(geo.accuracy) })
    case 'asking':
      return t('gps.asking')
    case 'outside':
      return t('gps.outside')
    default:
      return t('gps.label')
  }
})

function onSelect(h: Hit | null) {
  hit.value = h
}

function onDetect() {
  if (!world.player.detectOn && !currentLight.value) {
    toast(t('detect.noLight'), 'lilac')
    return
  }
  toggleDetect()
}

function onGps() {
  toggleGeo()
}

function openCreate(retry: Gathering | null = null) {
  retryFrom.value = retry
  createOpen.value = true
}

function onCreated(g: Gathering) {
  map.value?.centerOn(g.x, g.y)
  hit.value = { type: 'gathering', id: g.id }
}

function focusOn(x: number, y: number, id: string) {
  bagOpen.value = false
  map.value?.centerOn(x, y)
  hit.value = { type: 'gathering', id }
}

// 定位狀態變化的提示
watch(
  () => geo.status,
  (s) => {
    if (s === 'denied') toast(t('gps.denied'), 'fire')
    else if (s === 'unsupported') toast(t('gps.unsupported'), 'fire')
    else if (s === 'outside') toast(t('gps.outsideMsg'), 'fire')
    else if (s === 'error') toast(t('gps.error', { msg: geo.errorMsg }), 'fire')
    else if (s === 'on') map.value?.locate()
  },
)

// 「湊齊了」提示：顯示一次就清掉
watch(
  () => world.formedPending.length,
  (n) => {
    if (!n) return
    const id = world.formedPending[0]
    const g = world.gatherings.find((x) => x.id === id)
    if (g) toast(t('formed.body', { pass: g.passphrase }), 'lilac')
    dismissFormed(id)
  },
)
</script>

<template>
  <div class="app">
    <FogMap ref="map" :selected-id="selectedId" @select="onSelect">
      <div class="hint mono">{{ world.gpsOn ? t('gps.on') : t('map.hint') }}</div>
      <EventSheet :hit="hit" @close="hit = null" />
      <DetectPanel v-if="!hit" />
    </FogMap>

    <nav class="bottom">
      <button :class="{ on: world.player.detectOn }" @click="onDetect">
        <span class="ico">◉</span>{{ world.player.detectOn ? t('detect.on') : t('nav.detect') }}
      </button>
      <button :class="{ on: geo.status === 'on', warn: geo.status === 'outside' }" @click="onGps">
        <span class="ico">⊕</span>{{ gpsLabel }}
      </button>
      <button @click="openCreate()"><span class="ico t-lilac">＋</span>{{ t('nav.create') }}</button>
      <button @click="bagOpen = true"><span class="ico t-zk">◆</span>{{ t('nav.backpack') }}</button>
      <button @click="idOpen = true"><span class="ico t-pinky">●</span>{{ t('nav.identity') }}</button>
    </nav>

    <CreateGathering v-model:open="createOpen" :retry="retryFrom" @created="onCreated" />
    <BackpackPanel v-model:open="bagOpen" @focus="focusOn" />
    <IdentityPanel v-model:open="idOpen" />
    <DissolvedDialog @retry="openCreate($event)" @nearby="map?.locate()" />
  </div>
</template>

<style scoped>
.app {
  position: absolute;
  inset: 0;
  background: var(--void);
}
.app :deep(.map) {
  position: absolute;
  inset: 0;
}
.hint {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: 12px;
  font-size: 11px;
  color: var(--haze);
  background: rgba(25, 21, 39, 0.75);
  border: 1px solid var(--line);
  padding: 2px 10px;
  border-radius: 999px;
  pointer-events: none;
  white-space: nowrap;
}
.bottom {
  position: absolute;
  left: 50%;
  bottom: calc(10px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  display: flex;
  gap: 2px;
  padding: 4px 6px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: rgba(11, 9, 18, 0.92);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  z-index: 30;
  max-width: calc(100% - 16px);
}
.bottom button {
  background: transparent;
  border: 0;
  color: var(--haze);
  padding: 6px 12px;
  font: inherit;
  font-size: 11px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  cursor: pointer;
  border-radius: 999px;
  white-space: nowrap;
}
.bottom button:hover {
  color: var(--paper);
}
.bottom button.on {
  color: #fff;
  text-shadow: 0 0 10px #fff;
}
.bottom button.warn {
  color: var(--fire);
}
.ico {
  font-size: 18px;
  line-height: 1.1;
}
@media (max-width: 420px) {
  .bottom button {
    padding: 6px 8px;
    font-size: 10px;
  }
}
</style>
