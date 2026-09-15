<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ConsoleMap from '../components/ConsoleMap.vue'
import { useFmt } from '../composables/useFmt'
import { dist } from '../world/geo'
import { TORCH_MAX, TORCH_MIN } from '../world/rules'
import { addSupply, addTorch, joinedCount, setTorchLit, toast, torchCrowd, world } from '../world/store'
import { effectiveTarget } from '../world/torch'

const { t } = useI18n()
const fmt = useFmt()
const tab = ref('dashboard')
const selectedTorchId = ref<string | null>(null)
const placing = ref<'supply' | 'torch' | null>(null)

const merchantTorches = computed(() => world.torches.filter((x) => !x.temporary))
const burning = computed(() => merchantTorches.value.filter((x) => x.lit))
/** 各圈面積相加（未扣重疊，memo 已知的洞） */
const litKm2 = computed(() => burning.value.reduce((a, x) => a + Math.PI * x.eff * x.eff, 0) / 1e6)
const pickups = computed(() => world.supplies.reduce((a, s) => a + (s.total - s.remaining), 0))
const participants = computed(() => world.holdings.reduce((a, h) => a + h.joined, 0))

const gatheringsInCircles = computed(() =>
  world.gatherings
    .filter((g) => g.status !== 'dissolved')
    .map((g) => ({ g, torch: burning.value.find((x) => dist(x.x, x.y, g.x, g.y) <= x.eff) }))
    .filter((r) => r.torch),
)

const drop = reactive({ torchId: '', label: '', count: 5, rare: false, req: false })
const newTorch = reactive({ name: '', baseR: 260, hours: 6 })

function startPlaceSupply() {
  if (!drop.torchId || !drop.label.trim()) return
  placing.value = 'supply'
  tab.value = 'supplies'
}

function onPlace(x: number, y: number) {
  if (placing.value === 'supply') {
    const torch = world.torches.find((z) => z.id === drop.torchId)
    if (!torch) return
    addSupply({
      torchId: torch.id,
      x,
      y,
      kind: drop.rare ? 'rare' : 'discount',
      label: drop.label.trim(),
      rare: drop.rare,
      remaining: drop.count,
      perPerson: 1,
      requirement: drop.req ? 'reservation' : 'none',
    })
    toast(t('console.dropped', { name: torch.name }), 'zk')
  } else if (placing.value === 'torch') {
    const torch = addTorch({
      name: newTorch.name.trim() || `Torch ${world.torches.length + 1}`,
      ownerId: 'm_console',
      x,
      y,
      baseR: newTorch.baseR,
      lit: true,
      temporary: false,
      burnHours: newTorch.hours,
    })
    selectedTorchId.value = torch.id
    newTorch.name = ''
  }
  placing.value = null
}

function growthPct(torch: (typeof world.torches)[number]) {
  return Math.round((effectiveTarget(torch.baseR, torchCrowd(torch)) / torch.baseR - 1) * 100)
}
</script>

<template>
  <div class="console">
    <aside class="side">
      <h2>{{ t('console.title') }}</h2>
      <el-tabs v-model="tab" class="tabs">
        <!-- 儀表板 -->
        <el-tab-pane :label="t('console.dashboard')" name="dashboard">
          <div class="stats">
            <div class="stat"><div class="v mono t-fire">{{ burning.length }}</div><div class="k">{{ t('console.burning') }}</div></div>
            <div class="stat"><div class="v mono t-fire">{{ litKm2.toFixed(2) }} km²</div><div class="k">{{ t('console.litArea') }}</div></div>
            <div class="stat"><div class="v mono t-zk">{{ pickups }}</div><div class="k">{{ t('console.pickups') }}</div></div>
            <div class="stat"><div class="v mono t-lilac">{{ gatheringsInCircles.length }}</div><div class="k">{{ t('console.reservations') }}</div></div>
            <div class="stat"><div class="v mono t-pinky">{{ participants }}</div><div class="k">{{ t('console.participants') }}</div></div>
          </div>
          <div class="section-title">{{ t('console.gatheringsInCircle') }}</div>
          <p v-if="!gatheringsInCircles.length" class="haze small">{{ t('console.noGatherings') }}</p>
          <div v-for="r in gatheringsInCircles" :key="r.g.id" class="card row">
            <div>
              <div class="t-lilac">{{ r.g.status === 'pending' ? '◌' : '●' }} {{ fmt.clock(r.g.startAt) }} · {{ t('console.people', { n: joinedCount(r.g) }) }}</div>
              <div class="haze small">{{ r.torch!.name }}</div>
            </div>
          </div>
        </el-tab-pane>

        <!-- 火把 -->
        <el-tab-pane :label="t('console.torches')" name="torches">
          <p class="haze small">{{ t('console.noteLive') }}</p>
          <div v-for="torch in merchantTorches" :key="torch.id" class="card row" :class="{ sel: selectedTorchId === torch.id }" @click="selectedTorchId = torch.id">
            <div>
              <div :class="torch.lit ? 't-fire' : 'haze'">{{ torch.lit ? '🔥' : '○' }} {{ torch.name }}</div>
              <div class="haze small mono">
                {{ t('console.baseR') }} {{ torch.baseR }} m → {{ t('console.effR') }} {{ Math.round(torch.eff) }} m
                · {{ t('console.crowd') }} {{ torchCrowd(torch).toFixed(2) }}
                · {{ t('console.growth') }} {{ torch.lit ? growthPct(torch) : 0 }}%
              </div>
            </div>
            <el-button size="small" round :type="torch.lit ? 'default' : 'warning'" @click.stop="setTorchLit(torch.id, !torch.lit)">
              {{ torch.lit ? t('console.extinguish') : t('console.light') }}
            </el-button>
          </div>
          <div class="section-title">{{ t('console.newTorch') }}</div>
          <div class="form">
            <el-input v-model="newTorch.name" :placeholder="t('console.torchName')" />
            <div class="inline">
              <span class="haze small">{{ t('console.baseR') }}</span>
              <el-slider v-model="newTorch.baseR" :min="TORCH_MIN" :max="800" :step="10" class="slider" />
              <span class="mono small">{{ newTorch.baseR }} m</span>
            </div>
            <div class="haze small">{{ t('console.torchRule', { min: TORCH_MIN, max: TORCH_MAX }) }}</div>
            <el-button round type="warning" plain :disabled="placing === 'torch'" @click="placing = 'torch'">{{ placing === 'torch' ? t('console.placeHint') : t('console.addTorch') }}</el-button>
          </div>
        </el-tab-pane>

        <!-- 物資 -->
        <el-tab-pane :label="t('console.supplies')" name="supplies">
          <div class="section-title">{{ t('console.dropTitle') }}</div>
          <div class="form">
            <el-select v-model="drop.torchId" :placeholder="t('console.dropTorch')">
              <el-option v-for="torch in merchantTorches" :key="torch.id" :value="torch.id" :label="torch.name" />
            </el-select>
            <el-input v-model="drop.label" :placeholder="t('console.dropLabel')" maxlength="30" />
            <div class="inline">
              <span class="haze small">{{ t('console.dropCount') }}</span>
              <el-input-number v-model="drop.count" :min="1" :max="99" size="small" />
              <el-checkbox v-model="drop.rare">{{ t('console.dropRare') }}</el-checkbox>
            </div>
            <el-checkbox v-model="drop.req">{{ t('console.dropReq') }}</el-checkbox>
            <el-button type="success" round plain :disabled="!drop.torchId || !drop.label.trim() || placing === 'supply'" @click="startPlaceSupply">
              {{ placing === 'supply' ? t('console.placeHint') : t('console.drop') }}
            </el-button>
          </div>
          <div class="section-title">{{ t('console.supplyList') }}</div>
          <div v-for="s in world.supplies" :key="s.id" class="card row">
            <div>
              <div :class="s.rare ? 't-pinky' : 't-zk'">◆ {{ s.label }}</div>
              <div class="haze small">{{ world.torches.find((z) => z.id === s.torchId)?.name }} · {{ s.total - s.remaining }} / {{ s.total }}</div>
            </div>
          </div>
        </el-tab-pane>

        <!-- 活動 -->
        <el-tab-pane :label="t('console.events')" name="events">
          <div class="section-title">{{ t('console.holdingsTitle') }}</div>
          <div v-for="hg in world.holdings" :key="hg.id" class="card row">
            <div>
              <div class="t-pinky">● {{ hg.title }}</div>
              <div class="haze small">{{ world.torches.find((z) => z.id === hg.torchId)?.name }} · {{ fmt.dayLabel(hg.startAt) }} {{ fmt.clock(hg.startAt) }} · {{ hg.joined }} / {{ hg.capacity }}</div>
            </div>
          </div>
        </el-tab-pane>

        <!-- 帳單 -->
        <el-tab-pane :label="t('console.billing')" name="billing">
          <p class="haze">{{ t('console.billingTbd') }}</p>
        </el-tab-pane>
      </el-tabs>
    </aside>

    <section class="mapbox">
      <ConsoleMap :placing="placing !== null" :selected-torch-id="selectedTorchId" @place="onPlace" @pick="selectedTorchId = $event" />
      <div class="legend mono">
        <span class="t-fire">● {{ t('console.effR') }}</span>
        <span class="haze">◌ {{ t('console.baseR') }}</span>
        <span class="t-zk">◆ {{ t('console.supplies') }}</span>
        <span class="t-lilac">○ {{ t('event.gathering') }}</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.console {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: minmax(300px, 400px) 1fr;
  gap: 12px;
  padding: 12px;
}
.side {
  overflow: auto;
  min-width: 0;
}
.side h2 {
  font-size: 18px;
  margin-bottom: 8px;
}
.mapbox {
  position: relative;
  min-height: 300px;
}
.legend {
  position: absolute;
  left: 10px;
  bottom: 10px;
  display: flex;
  gap: 12px;
  font-size: 11px;
  background: rgba(25, 21, 39, 0.85);
  border: 1px solid var(--line);
  padding: 4px 10px;
  border-radius: 999px;
}
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}
.stat {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px 12px;
}
.stat .v {
  font-size: 20px;
}
.stat .k {
  font-size: 11px;
  color: var(--haze);
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  cursor: pointer;
}
.row.sel {
  border-color: var(--fire);
}
.small {
  font-size: 12px;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.inline {
  display: flex;
  align-items: center;
  gap: 10px;
}
.slider {
  flex: 1;
}
@media (max-width: 800px) {
  .console {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(300px, 1fr);
  }
}
</style>
