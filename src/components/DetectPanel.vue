<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { currentLight, detectedStrangers, lightTitle, toast, world } from '../world/store'
import type { Stranger } from '../world/types'

const { t } = useI18n()
const picked = ref<Stranger | null>(null)
const muted = ref(false)
const greeted = ref(new Set<string>())

const lightName = computed(() => (currentLight.value ? lightTitle(currentLight.value) : ''))

function greet(s: Stranger) {
  greeted.value.add(s.id)
  toast(t('detect.greeted', { name: s.codename }), 'lilac')
  picked.value = null
}
</script>

<template>
  <div v-if="currentLight" class="detect" :class="{ on: world.player.detectOn }">
    <template v-if="world.player.detectOn">
      <div class="head">
        <span class="t-lilac">{{ t('detect.header', { name: lightName, n: detectedStrangers.length }) }}</span>
        <span class="chip lilac">◉ {{ t('detect.beingSeen') }}</span>
      </div>
      <div v-if="detectedStrangers.length" class="row">
        <button v-for="s in detectedStrangers" :key="s.id" class="avatar" @click="picked = s">
          <span class="face" />
          <span class="mono name">{{ s.codename }}</span>
        </button>
      </div>
      <div v-else class="haze small">{{ t('detect.none') }}</div>
    </template>
    <div v-else class="haze small">◌ {{ t('detect.canOpen') }}</div>
  </div>

  <el-dialog :model-value="!!picked" :show-close="false" width="min(92vw, 380px)" align-center @close="picked = null">
    <template v-if="picked">
      <div class="card-head">
        <span class="face big" />
        <div>
          <div class="mono big-name">{{ picked.codename }}</div>
          <div class="haze small">{{ t('detect.stayed', { n: Math.floor((world.now - picked.since) / 60000) }) }}</div>
        </div>
      </div>
      <div class="tags">
        <span v-for="tag in picked.tags" :key="tag" class="chip">{{ tag }}</span>
        <span v-for="b in picked.badges" :key="b" class="chip zk">✓ {{ b }}</span>
      </div>
      <div class="section-title">{{ t('detect.history') }}</div>
      <ul v-if="picked.history.length" class="hist">
        <li v-for="h in picked.history" :key="h" class="t-fire small">🔥 {{ h }}</li>
      </ul>
      <p v-else class="haze small">{{ t('detect.noHistory') }}</p>
      <p class="haze small why">{{ t('detect.why', { name: lightName }) }}</p>
      <div class="acts">
        <el-button type="primary" round :disabled="muted || greeted.has(picked.id)" @click="greet(picked)">{{ t('detect.greet') }}</el-button>
        <el-button round @click="picked = null">{{ t('detect.justLook') }}</el-button>
        <el-checkbox v-model="muted" class="mute">{{ t('detect.mute') }}</el-checkbox>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.detect {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: calc(76px + env(safe-area-inset-bottom, 0px));
  background: rgba(25, 21, 39, 0.92);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 10px 12px;
  z-index: 15;
}
@media (min-width: 900px) {
  .detect {
    left: auto;
    right: 16px;
    top: 16px;
    bottom: auto;
    width: 400px;
  }
}
.detect.on {
  border-color: rgba(201, 190, 240, 0.5);
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  margin-bottom: 8px;
}
.row {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.avatar {
  background: transparent;
  border: 0;
  color: var(--lilac);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  flex: 0 0 auto;
}
.face {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #3a3157, #1b1538);
  border: 1px solid var(--lilac);
  box-shadow: 0 0 10px rgba(201, 190, 240, 0.35);
  display: inline-block;
}
.face.big {
  width: 48px;
  height: 48px;
}
.name {
  font-size: 11px;
}
.small {
  font-size: 12px;
}
.card-head {
  display: flex;
  gap: 12px;
  align-items: center;
}
.big-name {
  font-size: 18px;
  color: var(--lilac);
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.hist {
  list-style: none;
  padding: 0;
  margin: 0;
}
.why {
  margin-top: 10px;
  border-left: 2px solid var(--line);
  padding-left: 8px;
}
.acts {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 12px;
}
.mute {
  margin-left: auto;
}
</style>
