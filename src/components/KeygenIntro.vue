<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { world } from '../world/store'

defineProps<{ codename: string }>()
const emit = defineEmits<{ done: [] }>()
const { t } = useI18n()
const step = ref(0)

onMounted(() => {
  const timers = [500, 1100, 1700, 2300]
  timers.forEach((ms, i) => setTimeout(() => (step.value = i + 1), ms))
})
</script>

<template>
  <div class="intro">
    <div class="box">
      <h2>{{ t('identity.keygenTitle') }}</h2>
      <ol>
        <li :class="{ on: step >= 1 }"><span class="k">01</span>{{ t('identity.keygen1') }}</li>
        <li :class="{ on: step >= 2 }"><span class="k">02</span>{{ t('identity.keygen2') }}</li>
        <li :class="{ on: step >= 3 }"><span class="k">03</span>{{ t('identity.keygen3') }}</li>
      </ol>
      <div class="commit mono" :class="{ on: step >= 2 }">{{ world.player.commit.slice(0, 32) }}…</div>
      <transition name="fade">
        <div v-if="step >= 4" class="done">
          <p>{{ t('identity.keygenDone', { name: codename }) }}</p>
          <el-button type="primary" round @click="emit('done')">{{ t('identity.start') }}</el-button>
        </div>
      </transition>
    </div>
  </div>
</template>

<style scoped>
.intro {
  position: fixed;
  inset: 0;
  background: rgba(6, 6, 13, 0.92);
  display: grid;
  place-items: center;
  z-index: 2500;
  padding: 16px;
}
.box {
  width: min(420px, 100%);
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 24px;
}
h2 {
  font-size: 18px;
  margin-bottom: 16px;
}
ol {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
li {
  color: var(--haze);
  opacity: 0.35;
  transition: opacity 0.3s;
  display: flex;
  gap: 10px;
}
li.on {
  opacity: 1;
  color: var(--paper);
}
.k {
  font-family: var(--font-mono);
  color: var(--zk);
}
.commit {
  margin-top: 16px;
  font-size: 12px;
  color: var(--zk);
  opacity: 0;
  transition: opacity 0.4s;
  word-break: break-all;
}
.commit.on {
  opacity: 1;
}
.done {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-start;
}
.done p {
  margin: 0;
}
.fade-enter-from {
  opacity: 0;
}
.fade-enter-active {
  transition: opacity 0.3s;
}
</style>
