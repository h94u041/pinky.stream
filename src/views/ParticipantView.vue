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
  <div class="wrap">
    <div class="phone">
      <FogMap ref="map" :selected-id="selectedId" @select="onSelect">
        <div class="hint mono">{{ t('map.hint') }}</div>
        <EventSheet :hit="hit" @close="hit = null" />
        <DetectPanel v-if="!hit" />
      </FogMap>

      <nav class="bottom">
        <button :class="{ on: world.player.detectOn }" @click="onDetect">
          <span class="ico">◉</span>{{ world.player.detectOn ? t('detect.on') : t('nav.detect') }}
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
  </div>
</template>

<style scoped>
.wrap {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 12px;
  background: radial-gradient(ellipse at center, #120e1f 0%, var(--ink) 70%);
}
.phone {
  position: relative;
  width: min(100%, 430px);
  height: min(100%, 860px);
  border: 1px solid var(--line);
  border-radius: 28px;
  overflow: hidden;
  background: var(--void);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
}
.phone :deep(.map) {
  flex: 1;
  min-height: 0;
}
.hint {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: 10px;
  font-size: 10px;
  color: var(--haze);
  opacity: 0.7;
  pointer-events: none;
}
.bottom {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-top: 1px solid var(--line);
  background: var(--ink);
}
.bottom button {
  background: transparent;
  border: 0;
  color: var(--haze);
  padding: 8px 4px 10px;
  font: inherit;
  font-size: 11px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  cursor: pointer;
}
.bottom button.on {
  color: #fff;
  text-shadow: 0 0 10px #fff;
}
.ico {
  font-size: 18px;
}
@media (max-width: 480px) {
  .wrap {
    padding: 0;
  }
  .phone {
    border-radius: 0;
    border: 0;
    height: 100%;
  }
}
</style>
