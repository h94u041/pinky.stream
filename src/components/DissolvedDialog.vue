<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFmt } from '../composables/useFmt'
import { dismissDissolved, joinedCount, needOf, world } from '../world/store'
import type { Gathering } from '../world/types'

const emit = defineEmits<{ retry: [g: Gathering]; nearby: [] }>()
const { t } = useI18n()
const fmt = useFmt()

const g = computed(() => {
  const id = world.dissolvedPending[0]
  return id ? world.gatherings.find((x) => x.id === id) ?? null : null
})

function close() {
  if (g.value) dismissDissolved(g.value.id)
}
</script>

<template>
  <el-dialog :model-value="!!g" :show-close="false" :close-on-click-modal="false" width="min(92vw, 380px)" align-center>
    <template v-if="g">
      <h2 class="big">{{ t('dissolved.title') }}</h2>
      <p>{{ t('dissolved.body', { title: g.title, time: fmt.clock(g.deadline), n: Math.max(1, needOf(g) - joinedCount(g)) }) }}</p>
      <p class="promise">{{ t('dissolved.promise') }}</p>
      <div class="acts">
        <el-button type="primary" round @click="emit('retry', g); close()">{{ t('dissolved.retry') }}</el-button>
        <el-button round @click="emit('nearby'); close()">{{ t('dissolved.nearby') }}</el-button>
        <el-button text @click="close">{{ t('dissolved.ok') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.big {
  font-size: 26px;
  margin-bottom: 10px;
}
.promise {
  border-left: 2px solid var(--lilac);
  padding-left: 10px;
  color: var(--lilac);
}
.acts {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: stretch;
  margin-top: 12px;
}
.acts .el-button {
  margin: 0;
}
</style>
