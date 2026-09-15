<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFmt } from '../composables/useFmt'
import { joinedCount, needOf, useSupply, world } from '../world/store'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [v: boolean]; focus: [x: number, y: number, id: string] }>()
const { t } = useI18n()
const fmt = useFmt()

const mine = computed(() => world.gatherings.filter((g) => world.player.id in g.joined).slice().reverse())
</script>

<template>
  <el-drawer :model-value="open" direction="btt" size="70%" :title="t('backpack.title')" @update:model-value="emit('update:open', $event)">
    <el-tabs>
      <el-tab-pane :label="`${t('backpack.supplies')} · ${world.player.backpack.supplies.length}`">
        <p v-if="!world.player.backpack.supplies.length" class="haze">{{ t('backpack.empty') }}</p>
        <div v-for="s in world.player.backpack.supplies" :key="s.id" class="card row" :class="{ used: s.used }">
          <div>
            <div :class="s.rare ? 't-pinky' : 't-zk'">◆ {{ s.label }}</div>
            <div class="haze small">{{ t('backpack.from', { name: s.torchName }) }} · {{ fmt.clock(s.pickedAt) }}</div>
          </div>
          <el-button v-if="!s.used" size="small" round @click="useSupply(s.id)">{{ t('supply.use') }}</el-button>
          <span v-else class="chip">{{ t('supply.used') }}</span>
        </div>
      </el-tab-pane>
      <el-tab-pane :label="`${t('backpack.proofs')} · ${world.player.backpack.proofs.length}`">
        <p v-if="!world.player.backpack.proofs.length" class="haze">{{ t('backpack.noProofs') }}</p>
        <div v-for="p in world.player.backpack.proofs" :key="p.id" class="card row">
          <div>
            <div :class="p.kind === 'checkin' ? 't-zk' : 't-fire'">{{ p.kind === 'checkin' ? '✓' : '🔥' }} {{ p.label }}</div>
            <div class="haze small mono">{{ fmt.clock(p.at) }}</div>
          </div>
        </div>
      </el-tab-pane>
      <el-tab-pane :label="`${t('backpack.reservations')} · ${mine.length}`">
        <p v-if="!mine.length" class="haze">{{ t('backpack.noReservations') }}</p>
        <div v-for="g in mine" :key="g.id" class="card row" :class="{ used: g.status === 'dissolved' }" @click="emit('focus', g.x, g.y, g.id)">
          <div>
            <div class="t-lilac">
              {{ g.title }}
              <span class="chip" :class="g.status === 'formed' ? 'lilac' : ''">
                {{ g.status === 'pending' ? t('event.pendingTitle') : g.status === 'formed' ? t('event.formedTitle') : t('backpack.dissolved') }}
              </span>
            </div>
            <div class="haze small">
              {{ fmt.dayLabel(g.startAt) }} {{ fmt.clock(g.startAt) }} · {{ g.hostId === world.player.id ? t('backpack.host') : t('backpack.member') }}
              <template v-if="g.status === 'pending'"> · {{ t('event.need', { n: Math.max(0, needOf(g) - joinedCount(g)) }) }}</template>
            </div>
            <div class="small">「{{ g.passphrase }}」<span class="mono haze"> · {{ g.joined[world.player.id] }}</span></div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </el-drawer>
</template>

<style scoped>
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  cursor: default;
}
.row.used {
  opacity: 0.45;
  filter: grayscale(1);
}
.small {
  font-size: 12px;
}
</style>
