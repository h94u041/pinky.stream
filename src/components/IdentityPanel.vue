<script setup lang="ts">
import { ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import type { Badge } from '../world/codename'
import { burnIdentity, persistIdentityPatch, toast, world } from '../world/store'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [v: boolean] }>()
const { t } = useI18n()

function toggleBadge(b: Badge) {
  const p = world.player
  p.shownBadges = p.shownBadges.includes(b) ? p.shownBadges.filter((x) => x !== b) : [...p.shownBadges, b]
  persistIdentityPatch()
}

async function burn() {
  try {
    await ElMessageBox.confirm(t('identity.burnConfirm'), t('identity.burn'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    })
  } catch {
    return
  }
  const idn = await burnIdentity()
  toast(t('identity.burnDone', { name: idn.codename }), 'pinky')
  emit('update:open', false)
}
</script>

<template>
  <el-drawer :model-value="open" direction="btt" size="70%" :title="t('identity.title')" @update:model-value="emit('update:open', $event)">
    <div class="card">
      <div class="haze small">{{ t('identity.codename') }}</div>
      <div class="codename mono">{{ world.player.codename }}</div>
      <div class="haze small">{{ t('identity.xp') }} · <span class="mono t-fire">{{ world.player.xp }}</span></div>
    </div>

    <div class="section-title">{{ t('identity.commit') }}</div>
    <div class="mono commit">{{ world.player.commit }}</div>

    <div class="section-title">{{ t('identity.badges') }}</div>
    <p class="haze small">{{ t('identity.badgesHint') }}</p>
    <div class="badges">
      <button v-for="b in world.player.badges" :key="b" class="chip" :class="{ zk: world.player.shownBadges.includes(b) }" @click="toggleBadge(b)">
        {{ world.player.shownBadges.includes(b) ? '✓' : '○' }} {{ b }}
      </button>
    </div>

    <div class="burn">
      <el-button type="danger" plain round @click="burn">🔥 {{ t('identity.burn') }}</el-button>
    </div>
  </el-drawer>
</template>

<style scoped>
.codename {
  font-size: 26px;
  color: var(--pinky);
  margin: 2px 0;
}
.small {
  font-size: 12px;
}
.commit {
  font-size: 11px;
  color: var(--zk);
  word-break: break-all;
}
.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.badges .chip {
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}
.burn {
  margin-top: 24px;
}
</style>
