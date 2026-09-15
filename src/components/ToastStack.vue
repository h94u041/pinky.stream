<script setup lang="ts">
import { world } from '../world/store'
</script>

<template>
  <div class="toasts">
    <transition-group name="toast">
      <div v-for="tst in world.toasts" :key="tst.id" class="toast" :class="tst.tone">{{ tst.text }}</div>
    </transition-group>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 3000;
  pointer-events: none;
  max-width: min(92vw, 420px);
}
.toast {
  background: var(--panel);
  border: 1px solid var(--line);
  border-left: 3px solid var(--haze);
  color: var(--paper);
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 13px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.45);
}
.toast.fire { border-left-color: var(--fire); }
.toast.zk { border-left-color: var(--zk); }
.toast.lilac { border-left-color: var(--lilac); }
.toast.pinky { border-left-color: var(--pinky); }
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s ease;
}
</style>
