<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFmt } from '../composables/useFmt'
import { villageAt } from '../map/mapdata'
import { randomPassphrase } from '../world/codename'
import { inWorld, toWorld } from '../world/geo'
import { parseGoogleMapsLink } from '../world/gmaps'
import { GATHERING_DEFAULTS, MAX_ACTIVE_RESERVATIONS, PASSPHRASE_MAX } from '../world/rules'
import { activeReservationCount, createGathering, joinedCount, needOf, world, type GatheringInput } from '../world/store'
import type { Gathering } from '../world/types'

const props = defineProps<{ open: boolean; retry?: Gathering | null }>()
const emit = defineEmits<{ 'update:open': [v: boolean]; created: [g: Gathering] }>()
const { t } = useI18n()
const fmt = useFmt()

const step = ref(0)
const link = ref('')
const linkError = ref('')
const place = reactive({ lat: 0, lng: 0, name: '', district: null as string | null })

const form = reactive({
  title: '',
  day: 'today' as 'today' | 'tomorrow',
  hour: GATHERING_DEFAULTS.hour as number,
  minute: GATHERING_DEFAULTS.minute as number,
  builtIn: GATHERING_DEFAULTS.builtIn as number,
  cap: GATHERING_DEFAULTS.cap as number,
  unlimited: false,
  needMore: GATHERING_DEFAULTS.needMore as number,
  passphrase: randomPassphrase(),
  hostPays: false,
})
const formError = ref('')
const created = ref<Gathering | null>(null)

const hours = Array.from({ length: 24 }, (_, i) => i)
const minutes = [0, 10, 20, 30, 40, 50]

const startAt = computed(() => {
  const d = new Date()
  if (form.day === 'tomorrow') d.setDate(d.getDate() + 1)
  d.setHours(form.hour, form.minute, 0, 0)
  return d.getTime()
})

watch(
  () => props.open,
  (v) => {
    if (!v) return
    step.value = 0
    link.value = ''
    linkError.value = ''
    formError.value = ''
    created.value = null
    if (props.retry) {
      // 流局後「換個時間再開一次」：帶原設定回表單
      const g = props.retry
      place.lat = g.lat
      place.lng = g.lng
      place.name = g.placeName
      place.district = g.district
      form.title = g.title === g.placeName ? '' : g.title
      form.builtIn = g.builtIn
      form.unlimited = g.cap === null
      form.cap = g.cap ?? GATHERING_DEFAULTS.cap
      form.needMore = g.needMore
      form.passphrase = g.passphrase
      form.hostPays = g.hostPays
      form.day = 'today'
      step.value = 1
    } else {
      form.title = ''
      form.builtIn = GATHERING_DEFAULTS.builtIn
      form.cap = GATHERING_DEFAULTS.cap
      form.unlimited = false
      form.needMore = GATHERING_DEFAULTS.needMore
      form.hour = GATHERING_DEFAULTS.hour
      form.minute = GATHERING_DEFAULTS.minute
      form.day = 'today'
      form.passphrase = randomPassphrase()
      form.hostPays = false
    }
  },
)

function parse() {
  linkError.value = ''
  const r = parseGoogleMapsLink(link.value)
  if (!r.ok) {
    linkError.value = t(r.reason === 'empty' ? 'create.errEmpty' : r.reason === 'short' ? 'create.errShort' : 'create.errNoCoords')
    return
  }
  const w = toWorld(r.lat, r.lng)
  if (!inWorld(w.x, w.y)) {
    linkError.value = t('create.errOutside')
    return
  }
  place.lat = r.lat
  place.lng = r.lng
  place.name = r.name ?? t('create.unnamed')
  const v = villageAt(w.x, w.y)
  place.district = v ? `${v.d} ${v.n}` : null
  step.value = 1
}

async function submit() {
  formError.value = ''
  if (!form.passphrase.trim()) return (formError.value = t('create.errPass'))
  if (!form.unlimited && form.builtIn > form.cap) return (formError.value = t('create.errBuiltIn'))
  if (!form.unlimited && form.builtIn + form.needMore > form.cap) return (formError.value = t('create.errNeed'))
  if (startAt.value <= Date.now()) return (formError.value = t('create.timePassed'))
  const input: GatheringInput = {
    title: form.title,
    placeName: place.name,
    district: place.district,
    lat: place.lat,
    lng: place.lng,
    startAt: startAt.value,
    builtIn: form.builtIn,
    cap: form.unlimited ? null : form.cap,
    needMore: form.needMore,
    passphrase: form.passphrase.trim().slice(0, PASSPHRASE_MAX),
    hostPays: form.hostPays,
  }
  const r = await createGathering(input)
  if ('error' in r) {
    formError.value =
      r.error === 'too-many'
        ? t('event.tooMany', { n: activeReservationCount(), max: MAX_ACTIVE_RESERVATIONS })
        : r.error === 'out-of-world'
          ? t('create.errOutside')
          : r.error === 'time-passed'
            ? t('create.timePassed')
            : r.error === 'network'
              ? t('online.network')
              : t('online.failed', { code: r.error })
    return
  }
  created.value = r
  step.value = 2
  emit('created', r)
}
</script>

<template>
  <el-dialog :model-value="open" width="min(94vw, 440px)" align-center :title="t('create.title')" @update:model-value="emit('update:open', $event)">
    <el-steps :active="step" simple class="steps">
      <el-step :title="t('create.step1')" />
      <el-step :title="t('create.step2')" />
      <el-step :title="t('create.step3')" />
    </el-steps>

    <!-- 步驟 1 -->
    <div v-if="step === 0" class="body">
      <label class="lbl">{{ t('create.linkLabel') }}</label>
      <el-input v-model="link" type="textarea" :rows="3" :placeholder="t('create.linkPlaceholder')" @keydown.enter.prevent="parse" />
      <p v-if="linkError" class="err">{{ linkError }}</p>
      <div class="acts">
        <el-button type="primary" round @click="parse">{{ t('create.parse') }}</el-button>
      </div>
    </div>

    <!-- 步驟 2 -->
    <div v-else-if="step === 1" class="body">
      <div class="place">
        <div class="haze small">{{ t('create.parsed') }}</div>
        <div class="place-name">{{ place.name }}</div>
        <div class="mono small haze">{{ place.lat.toFixed(5) }}, {{ place.lng.toFixed(5) }}<span v-if="place.district"> · {{ place.district }}</span></div>
      </div>

      <el-form label-position="top" size="default">
        <el-form-item :label="t('create.name')">
          <el-input v-model="form.title" :placeholder="t('create.nameHint')" maxlength="30" />
        </el-form-item>
        <div class="grid2">
          <el-form-item :label="t('create.date')">
            <el-radio-group v-model="form.day">
              <el-radio-button value="today">{{ t('time.today') }}</el-radio-button>
              <el-radio-button value="tomorrow">{{ t('time.tomorrow') }}</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item :label="t('create.time')">
            <div class="time">
              <el-select v-model="form.hour" class="sel">
                <el-option v-for="h in hours" :key="h" :value="h" :label="String(h).padStart(2, '0')" />
              </el-select>
              <span>:</span>
              <el-select v-model="form.minute" class="sel">
                <el-option v-for="m in minutes" :key="m" :value="m" :label="String(m).padStart(2, '0')" />
              </el-select>
            </div>
          </el-form-item>
        </div>
        <p class="haze small note">{{ t('create.timeNote') }}</p>
        <div class="grid2">
          <el-form-item :label="t('create.builtIn')">
            <el-input-number v-model="form.builtIn" :min="1" :max="form.unlimited ? 99 : form.cap" />
          </el-form-item>
          <el-form-item :label="t('create.cap')">
            <el-input-number v-model="form.cap" :min="1" :max="99" :disabled="form.unlimited" />
            <el-checkbox v-model="form.unlimited" class="unl">{{ t('create.unlimited') }}</el-checkbox>
          </el-form-item>
        </div>
        <el-form-item :label="t('create.needMore')">
          <el-input-number v-model="form.needMore" :min="0" :max="99" />
          <span class="haze small ml">{{ t('create.needMoreZero') }}</span>
        </el-form-item>
        <el-form-item :label="t('create.passphrase')">
          <div class="pass-row">
            <el-input v-model="form.passphrase" :maxlength="PASSPHRASE_MAX" show-word-limit />
            <el-button round @click="form.passphrase = randomPassphrase()">{{ t('create.shuffle') }}</el-button>
          </div>
          <div class="haze small">{{ t('create.passphraseHint', { max: PASSPHRASE_MAX }) }}</div>
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="form.hostPays">{{ t('create.hostPays') }}</el-checkbox>
          <div class="haze small">{{ t('create.hostPaysHint') }}</div>
        </el-form-item>
      </el-form>
      <p v-if="formError" class="err">{{ formError }}</p>
      <div class="acts">
        <el-button round @click="step = 0">{{ t('create.back') }}</el-button>
        <el-button type="primary" round @click="submit">{{ t('create.submit') }}</el-button>
      </div>
    </div>

    <!-- 步驟 3 -->
    <div v-else-if="created" class="body">
      <h3>{{ t('create.doneTitle') }}</h3>
      <div class="pass-card">
        <div class="haze small">{{ t('event.passphrase') }} · {{ t('event.passphraseHost') }}</div>
        <div class="pass-text">「{{ created.passphrase }}」</div>
        <div class="mono small haze">{{ created.title }} · {{ fmt.dayLabel(created.startAt) }} {{ fmt.clock(created.startAt) }}</div>
      </div>
      <p v-if="created.status === 'pending'" class="t-lilac">
        {{ t('create.donePending', { n: Math.max(0, needOf(created) - joinedCount(created)), t: fmt.left(created.deadline - world.now) }) }}
      </p>
      <p v-else class="t-lilac">{{ t('create.doneFormed') }}</p>
      <div class="acts">
        <el-button type="primary" round @click="emit('update:open', false)">{{ t('create.close') }}</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.steps {
  margin-bottom: 12px;
  background: transparent;
  padding: 8px 0;
}
.body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.lbl {
  font-size: 13px;
  color: var(--haze);
}
.err {
  color: var(--fire);
  font-size: 13px;
  margin: 0;
  border-left: 2px solid var(--fire);
  padding-left: 8px;
}
.acts {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.place {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 8px 12px;
}
.place-name {
  font-size: 16px;
}
.small {
  font-size: 12px;
}
.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 12px;
}
@media (max-width: 420px) {
  .grid2 {
    grid-template-columns: 1fr;
  }
}
.time {
  display: flex;
  align-items: center;
  gap: 6px;
}
.sel {
  width: 84px;
}
.note {
  margin: -6px 0 8px;
}
.unl {
  margin-left: 8px;
}
.ml {
  margin-left: 10px;
}
.pass-row {
  display: flex;
  gap: 8px;
  width: 100%;
}
.pass-card {
  border: 1px dashed var(--lilac);
  border-radius: 12px;
  padding: 12px 14px;
}
.pass-text {
  font-size: 22px;
  color: var(--lilac);
  font-family: var(--font-display);
  margin: 4px 0;
}
</style>
