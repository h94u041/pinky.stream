<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFmt } from '../composables/useFmt'
import type { Hit } from '../map/renderer'
import { dist } from '../world/geo'
import { MAX_ACTIVE_RESERVATIONS } from '../world/rules'
import {
  activeReservationCount,
  completeGathering,
  completeTask,
  holdingLightR,
  isVisible,
  joinGathering,
  joinHolding,
  joinedCount,
  needOf,
  simulateJoin,
  supplyLocked,
  toast,
  torchById,
  torchCrowd,
  world,
} from '../world/store'

const props = defineProps<{ hit: Hit | null }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const fmt = useFmt()

const holding = computed(() => (props.hit?.type === 'holding' ? world.holdings.find((h) => h.id === props.hit!.id) ?? null : null))
const gathering = computed(() => (props.hit?.type === 'gathering' ? world.gatherings.find((g) => g.id === props.hit!.id) ?? null : null))
const torch = computed(() => {
  if (props.hit?.type === 'torch') return torchById(props.hit.id) ?? null
  if (holding.value) return torchById(holding.value.torchId) ?? null
  return null
})
const supply = computed(() => (props.hit?.type === 'supply' ? world.supplies.find((s) => s.id === props.hit!.id) ?? null : null))

const holdingVisible = computed(() => !!torch.value && isVisible(torch.value.x, torch.value.y))
const gatheringVisible = computed(() => !!gathering.value && isVisible(gathering.value.x, gathering.value.y))
const onSiteHolding = computed(() => !!torch.value && dist(torch.value.x, torch.value.y, world.player.x, world.player.y) <= holdingLightR(holding.value!))
const isHost = computed(() => gathering.value?.hostId === world.player.id)
const amIn = computed(() => !!gathering.value && world.player.id in gathering.value.joined)
const myCode = computed(() => (gathering.value ? gathering.value.joined[world.player.id] : null))
const doneCount = computed(() => holding.value?.tasks.filter((x) => x.done).length ?? 0)
/** 4.1：曾參與過的事件 → 共同參與的對象們（只有代號） */
const coParticipants = computed(() => (holding.value?.completedByMe ? world.strangers.filter((s) => s.history.includes(holding.value!.title)) : []))

function join() {
  if (!gathering.value) return
  const r = joinGathering(gathering.value.id)
  if (r === 'full') toast(t('event.full'), 'lilac')
  else if (r === 'too-many') toast(t('event.tooMany', { n: activeReservationCount(), max: MAX_ACTIVE_RESERVATIONS }), 'lilac')
  else if (r === 'gone') toast(t('event.gone'), 'lilac')
}
</script>

<template>
  <transition name="sheet">
    <div v-if="hit" class="sheet">
      <button class="close" @click="emit('close')">×</button>

      <!-- Holding Group -->
      <template v-if="holding && torch">
        <div class="kind t-pinky">{{ t('event.holding') }} · {{ t('event.by') }}</div>
        <h2>{{ holding.title }}</h2>
        <div class="meta">
          <span class="chip fire">{{ torch.name }}</span>
          <span class="chip">{{ t('event.startsAt') }} {{ fmt.dayLabel(holding.startAt) }} {{ fmt.clock(holding.startAt) }}</span>
          <span class="chip">{{ t('event.capacity', { joined: holding.joined, cap: holding.capacity }) }}</span>
          <span class="chip" :class="holding.entry ? 'zk' : ''">{{ t('event.entry') }}：{{ holding.entry ?? t('event.entryNone') }}</span>
        </div>
        <p v-if="!holdingVisible" class="haze note">{{ t('event.inMemory') }}</p>
        <div class="actions">
          <el-button v-if="!holding.joinedByMe" type="primary" round @click="joinHolding(holding.id)">{{ t('event.join') }}</el-button>
          <span v-else class="chip pinky">{{ t('event.joined') }}</span>
        </div>
        <template v-if="holding.joinedByMe">
          <div class="section-title">{{ t('event.tasks') }} · {{ doneCount }}/{{ holding.tasks.length }}</div>
          <div class="ring-row">
            <el-progress type="circle" :percentage="Math.round((doneCount / holding.tasks.length) * 100)" :width="56" :stroke-width="5" color="#FF9A3C" />
            <ul class="tasks">
              <li v-for="task in holding.tasks" :key="task.id" :class="{ done: task.done }">
                <div>
                  <div>{{ task.label }}</div>
                  <div class="haze small">→ {{ task.reward }}</div>
                </div>
                <el-button v-if="!task.done" size="small" round :disabled="!onSiteHolding" @click="completeTask(holding.id, task.id)">{{ t('event.taskDo') }}</el-button>
                <span v-else class="chip zk">{{ t('event.taskDone') }}</span>
              </li>
            </ul>
          </div>
          <p v-if="!onSiteHolding" class="haze small">{{ t('event.taskNeedPresence') }}</p>
          <p v-if="holding.completedByMe" class="t-fire small">{{ t('event.allDone') }}</p>
          <el-collapse v-if="holding.completedByMe" class="co">
            <el-collapse-item :title="t('event.coParticipants', { n: coParticipants.length })">
              <p v-if="!coParticipants.length" class="haze small">{{ t('event.noCo') }}</p>
              <div class="meta"><span v-for="s in coParticipants" :key="s.id" class="chip lilac mono">{{ s.codename }}</span></div>
            </el-collapse-item>
          </el-collapse>
        </template>
      </template>

      <!-- 自發聚集 -->
      <template v-else-if="gathering">
        <div class="kind t-lilac">
          {{ t('event.gathering') }} ·
          <span v-if="gathering.status === 'pending'">{{ t('event.pendingTitle') }}</span>
          <span v-else-if="gathering.status === 'formed'">{{ t('event.formedTitle') }}</span>
          <span v-else>{{ t('event.dissolvedTitle') }}</span>
        </div>
        <h2>{{ gathering.title }}</h2>
        <div class="haze small">{{ gathering.placeName }}<span v-if="gathering.district"> · {{ gathering.district }}</span></div>
        <div class="meta">
          <span class="chip">{{ fmt.dayLabel(gathering.startAt) }} {{ fmt.clock(gathering.startAt) }}</span>
          <span class="chip">{{ gathering.cap === null ? t('event.unlimited') : t('event.capacity', { joined: joinedCount(gathering), cap: gathering.cap }) }}</span>
          <span v-if="gathering.hostPays" class="chip amber">{{ t('map.hostPays') }}</span>
        </div>
        <template v-if="gathering.status === 'pending'">
          <p class="t-lilac">
            {{ t('event.need', { n: Math.max(0, needOf(gathering) - joinedCount(gathering)) }) }} ·
            {{ t('event.deadline', { t: fmt.left(gathering.deadline - world.now) }) }}
          </p>
        </template>
        <template v-else-if="gathering.status === 'formed'">
          <p class="haze small">
            <template v-if="gathering.torchId">{{ t('event.attachedTo', { name: torchById(gathering.torchId)?.name ?? '' }) }}</template>
            <template v-else>{{ t('event.ownTorch') }}</template>
          </p>
        </template>
        <p v-if="!gatheringVisible && gathering.status !== 'dissolved'" class="haze note">{{ t('event.inMemory') }}</p>

        <div class="actions" v-if="gathering.status !== 'dissolved'">
          <el-button v-if="!amIn" type="primary" round @click="join">{{ t('event.join') }}</el-button>
          <el-button v-if="isHost && gathering.status === 'formed' && !gathering.completedByHost" round class="fire-btn" @click="completeGathering(gathering.id)">{{ t('event.hostComplete') }}</el-button>
          <el-button v-if="gathering.status === 'pending'" size="small" text @click="simulateJoin(gathering.id)">{{ t('event.simulateJoin') }}</el-button>
        </div>

        <div class="section-title">{{ t('event.passphrase') }}</div>
        <div v-if="amIn" class="pass">
          <div class="pass-text">「{{ gathering.passphrase }}」<span class="mono code">· {{ myCode }}</span></div>
          <div class="haze small">
            <template v-if="isHost">{{ t('event.passphraseHost') }}</template>
            <template v-else>{{ t('event.passphraseYours', { code: myCode }) }}</template>
            <template v-if="gathering.status === 'pending'"> · {{ t('event.passphrasePending') }}</template>
          </div>
        </div>
        <p v-else class="haze small">{{ t('event.passphraseHidden') }}</p>
        <p v-if="isHost && gathering.status === 'formed'" class="haze small">{{ t('event.hostCompleteHint') }}</p>
      </template>

      <!-- 火把 -->
      <template v-else-if="torch">
        <div class="kind t-fire">{{ torch.temporary ? t('event.tempTorch') : t('event.torch') }}</div>
        <h2>{{ torch.name }}</h2>
        <div class="meta">
          <span class="chip" :class="torch.lit ? 'fire' : ''">{{ torch.lit ? t('event.lit') : t('event.unlit') }}</span>
          <span v-if="torch.lit" class="chip">{{ t('event.effR', { r: Math.round(torch.eff) }) }}</span>
          <span v-if="torch.lit && torch.burnHours !== null && torch.litAt !== null" class="chip">
            {{ t('event.burnLeft', { t: fmt.left(torch.litAt + torch.burnHours * 3600000 - world.now) }) }}
          </span>
          <span v-if="torch.lit" class="chip">crowd {{ torchCrowd(torch).toFixed(2) }}</span>
        </div>
        <p v-if="!isVisible(torch.x, torch.y)" class="haze note">{{ t('event.inMemory') }}</p>
      </template>

      <!-- 物資 -->
      <template v-else-if="supply">
        <div class="kind t-zk">{{ t('supply.title') }}<span v-if="supply.rare"> · {{ t('supply.rare') }}</span></div>
        <h2>{{ supply.label }}</h2>
        <div class="meta">
          <span class="chip zk">{{ t('supply.remaining', { n: supply.remaining }) }}</span>
          <span class="chip fire">{{ torchById(supply.torchId)?.name }}</span>
        </div>
        <p v-if="supplyLocked(supply)" class="t-lilac small">{{ t('supply.locked') }}</p>
        <p v-else-if="torchById(supply.torchId) && !torchById(supply.torchId)!.lit" class="haze small">{{ t('supply.outside') }}</p>
      </template>
    </div>
  </transition>
</template>

<style scoped>
.sheet {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: calc(76px + env(safe-area-inset-bottom, 0px));
  max-height: 62%;
  overflow: auto;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 14px 16px 16px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  z-index: 20;
}
.close {
  position: absolute;
  right: 10px;
  top: 8px;
  background: transparent;
  border: 0;
  color: var(--haze);
  font-size: 20px;
  cursor: pointer;
}
.kind {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
h2 {
  font-size: 18px;
  margin: 2px 0 6px;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 6px 0;
}
.note {
  border-left: 2px solid var(--line);
  padding-left: 8px;
  font-size: 12px;
}
.small {
  font-size: 12px;
}
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin: 10px 0 4px;
}
.ring-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.tasks {
  list-style: none;
  padding: 0;
  margin: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tasks li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
}
.tasks li.done {
  border-color: rgba(95, 224, 206, 0.4);
}
.pass {
  border: 1px dashed var(--lilac);
  border-radius: 10px;
  padding: 10px 12px;
}
.pass-text {
  font-size: 16px;
  color: var(--lilac);
}
.code {
  font-size: 12px;
  color: var(--haze);
  margin-left: 6px;
}
.fire-btn {
  border-color: var(--fire);
  color: var(--fire);
}
@media (min-width: 900px) {
  .sheet {
    left: auto;
    right: 16px;
    top: 16px;
    bottom: auto;
    width: 400px;
    max-height: calc(100% - 100px);
  }
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
.sheet-enter-active,
.sheet-leave-active {
  transition: all 0.18s ease;
}
</style>
