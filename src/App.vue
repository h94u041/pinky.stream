<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import KeygenIntro from './components/KeygenIntro.vue'
import ToastStack from './components/ToastStack.vue'
import { setLocale, type Locale } from './i18n'
import { mapData } from './map/mapdata'
import { seedTaichung } from './world/seed'
import { bootWorld, world } from './world/store'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const ready = ref(false)
const showIntro = ref(false)

onMounted(async () => {
  const fresh = await bootWorld(seedTaichung)
  showIntro.value = fresh
  ready.value = true
})

function switchLang() {
  setLocale((locale.value === 'zh-TW' ? 'en' : 'zh-TW') as Locale)
}
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <div class="brand">
        <span class="dot" />
        <h1>{{ t('app.name') }}</h1>
        <span v-if="mapData.source === 'placeholder'" class="chip amber">{{ t('app.placeholderMap') }}</span>
      </div>
      <nav class="tabs">
        <button :class="{ active: route.path === '/' }" @click="router.push('/')">{{ t('app.participant') }}</button>
        <button :class="{ active: route.path === '/console' }" @click="router.push('/console')">{{ t('app.console') }}</button>
        <a class="about" href="/about/">{{ t('app.about') }}</a>
        <button class="lang mono" @click="switchLang">{{ t('app.lang') }}</button>
      </nav>
    </header>

    <main class="stage">
      <router-view v-if="ready" />
    </main>

    <KeygenIntro v-if="ready && showIntro" :codename="world.player.codename" @done="showIntro = false" />
    <ToastStack />
  </div>
</template>

<style scoped>
.shell {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--line);
  background: var(--ink);
  flex-wrap: wrap;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}
.brand h1 {
  font-size: 18px;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--pinky);
  box-shadow: 0 0 12px var(--pinky);
}
.tabs {
  display: flex;
  gap: 6px;
}
.tabs button {
  background: transparent;
  color: var(--haze);
  border: 1px solid transparent;
  padding: 6px 12px;
  border-radius: 999px;
  cursor: pointer;
  font: inherit;
}
.tabs button.active {
  color: var(--paper);
  border-color: var(--line);
  background: var(--panel);
}
.tabs .lang {
  font-size: 12px;
}
.tabs .about {
  color: var(--haze);
  text-decoration: none;
  padding: 6px 12px;
  font-size: 14px;
}
.tabs .about:hover {
  color: var(--paper);
}
.stage {
  flex: 1;
  min-height: 0;
  position: relative;
}
</style>
