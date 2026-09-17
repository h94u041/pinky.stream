/**
 * 線上模式：世界狀態來自 /api/world（每 5 秒同步），所有動作打 API。
 * store.ts 在 world.online 為真時把動作轉到這裡；離線（本機示範）仍走 store.ts 原本的邏輯。
 */
import { api, ApiError, setCommit } from '../api/client'
import { i18n } from '../i18n'
import { uid } from './codename'
import { currentLight, memorize, toast, world, type GatheringInput } from './store'
import type { Gathering, HoldingGroup, Stranger, Supply, Torch } from './types'

const tr = (key: string, params?: Record<string, unknown>) => i18n.global.t(key, params ?? {})

interface WorldPayload {
  now: number
  torches: Torch[]
  holdings: (Omit<HoldingGroup, 'joinedByMe' | 'completedByMe' | 'tasks'> & { tasks: { id: string; label: string; reward: string }[] })[]
  supplies: Supply[]
  gatherings: (Omit<Gathering, 'hostId' | 'joined' | 'passphrase' | 'completedByHost'> & { isHost: boolean; joinedCount: number; completedByHost: boolean })[]
  me: {
    holdings: { holdingId: string; doneTasks: string[]; completed: boolean }[]
    gatherings: { gatheringId: string; suffix: string; passphrase: string }[]
    pickups: { supplyId: string; count: number }[]
    xp: number
    completions: string[]
  } | null
}

let pollTimer: number | null = null
let presenceTimer: number | null = null
const seenStatus = new Map<string, Gathering['status']>()
export const myPickups = new Map<string, number>()

export async function connect(): Promise<boolean> {
  setCommit(world.player.commit)
  try {
    const payload = await api<WorldPayload>('/api/world', { timeoutMs: 6000 })
    applyWorld(payload, true)
    world.online = true
    if (pollTimer === null) pollTimer = window.setInterval(() => void sync(), 5000)
    return true
  } catch {
    return false
  }
}

export async function sync() {
  if (!world.online) return
  try {
    applyWorld(await api<WorldPayload>('/api/world'), false)
  } catch {
    /* 暫時斷線：保留上一份狀態，下次再試 */
  }
}

function applyWorld(p: WorldPayload, first: boolean) {
  world.now = p.now
  const me = world.player.id
  // 火把：保留前端平滑中的 eff，只更新目標值（tick 會朝 eff 靠近）
  const prevEff = new Map(world.torches.map((t) => [t.id, t.eff]))
  world.torches = p.torches.map((t) => ({ ...t, eff: prevEff.get(t.id) ?? t.eff, target: t.eff }))
  for (const t of world.torches) if (t.lit && !prevEff.has(t.id)) memorize(t.x, t.y, t.eff)

  const myH = new Map((p.me?.holdings ?? []).map((h) => [h.holdingId, h]))
  world.holdings = p.holdings.map((h) => {
    const mine = myH.get(h.id)
    const done = new Set(mine?.doneTasks ?? [])
    return {
      ...h,
      tasks: h.tasks.map((t) => ({ ...t, done: done.has(t.id) })),
      joinedByMe: !!mine,
      completedByMe: !!mine?.completed,
    }
  })

  world.supplies = p.supplies.map((s) => ({ ...s, kind: s.kind as Supply['kind'], requirement: s.requirement as Supply['requirement'] }))
  myPickups.clear()
  for (const pk of p.me?.pickups ?? []) myPickups.set(pk.supplyId, pk.count)

  const myG = new Map((p.me?.gatherings ?? []).map((g) => [g.gatheringId, g]))
  world.gatherings = p.gatherings.map((g) => {
    const mine = myG.get(g.id)
    return {
      ...g,
      hostId: g.isHost ? me : 'other',
      joined: mine ? { [me]: mine.suffix } : {},
      passphrase: mine?.passphrase ?? '',
      joinedCount: g.joinedCount,
    }
  })
  // 狀態轉換 → 提示（4.7）
  for (const g of world.gatherings) {
    const prev = seenStatus.get(g.id)
    if (!first && prev && prev !== g.status && me in g.joined) {
      if (g.status === 'formed') {
        world.formedPending.push(g.id)
        memorize(g.x, g.y, 220)
      }
      if (g.status === 'dissolved') world.dissolvedPending.push(g.id)
    }
    seenStatus.set(g.id, g.status)
  }

  if (p.me) {
    world.player.xp = p.me.xp
    world.player.completions = p.me.completions
  }
}

/* ---------- 動作 ---------- */

function errToast(e: unknown, map: Record<string, string> = {}) {
  const code = e instanceof ApiError ? e.code : 'network'
  const key = map[code] ?? (code === 'network' ? 'online.network' : 'online.failed')
  toast(tr(key, { code }), 'fire')
}

export async function joinHolding(id: string) {
  try {
    await api(`/api/holdings/${id}/join`, { body: {} })
    const h = world.holdings.find((x) => x.id === id)
    if (h) {
      h.joinedByMe = true
      h.joined += 1
      toast(tr('event.joinedToast', { title: h.title }), 'pinky')
    }
    await sync()
  } catch (e) {
    errToast(e, { full: 'event.full' })
  }
}

export async function completeTask(holdingId: string, taskId: string) {
  try {
    const r = await api<{ doneTasks: string[]; completed: boolean; memorize: { x: number; y: number; r: number } | null }>(
      `/api/holdings/${holdingId}/tasks/${taskId}/complete`,
      { body: { x: world.player.x, y: world.player.y } },
    )
    const h = world.holdings.find((x) => x.id === holdingId)
    if (h) {
      for (const t of h.tasks) t.done = r.doneTasks.includes(t.id)
      if (taskId.endsWith('checkin')) {
        const torch = world.torches.find((t) => t.id === h.torchId)
        world.player.backpack.proofs.push({ id: uid('p_'), kind: 'checkin', label: tr('proof.checkin', { name: torch?.name ?? '' }), at: world.now })
      }
      if (r.completed && !h.completedByMe) {
        h.completedByMe = true
        if (r.memorize) memorize(r.memorize.x, r.memorize.y, r.memorize.r)
        world.player.backpack.proofs.push({ id: uid('p_'), kind: 'event', label: tr('proof.event', { name: h.title }), at: world.now })
        toast(tr('event.completedToast', { xp: 40, name: h.title }), 'fire')
      }
    }
    await sync()
  } catch (e) {
    errToast(e, { 'not-on-site': 'event.taskNeedPresence' })
  }
}

const pickupInFlight = new Set<string>()
export async function pickup(s: Supply) {
  if (pickupInFlight.has(s.id)) return
  if ((myPickups.get(s.id) ?? 0) >= s.perPerson) return
  pickupInFlight.add(s.id)
  try {
    const r = await api<{ supply: Supply; torchName: string }>(`/api/supplies/${s.id}/pickup`, { body: { x: world.player.x, y: world.player.y } })
    myPickups.set(s.id, (myPickups.get(s.id) ?? 0) + 1)
    s.remaining = r.supply.remaining
    world.player.backpack.supplies.push({
      id: uid('b_'),
      supplyId: s.id,
      kind: s.kind,
      label: s.label,
      rare: s.rare,
      torchName: r.torchName,
      pickedAt: world.now,
      used: false,
    })
    toast(tr('supply.picked', { label: s.label }), 'zk')
  } catch (e) {
    // 撿不到就標記，避免每幀重試
    if (e instanceof ApiError && (e.code === 'limit' || e.code === 'gone')) myPickups.set(s.id, s.perPerson)
  } finally {
    pickupInFlight.delete(s.id)
  }
}

export async function createGathering(input: GatheringInput): Promise<Gathering | { error: string }> {
  try {
    const r = await api<{ id: string; formed: boolean }>('/api/gatherings', { body: input })
    await sync()
    const g = world.gatherings.find((x) => x.id === r.id)
    if (g) seenStatus.set(g.id, g.status)
    if (r.formed) toast(tr('formed.title'), 'lilac')
    return g ?? { error: 'network' }
  } catch (e) {
    return { error: e instanceof ApiError ? e.code : 'network' }
  }
}

export async function joinGathering(id: string): Promise<string | null> {
  try {
    const r = await api<{ suffix: string; passphrase: string; formed: boolean }>(`/api/gatherings/${id}/join`, { body: {} })
    await sync()
    const g = world.gatherings.find((x) => x.id === id)
    if (g) {
      g.joined[world.player.id] = r.suffix
      g.passphrase = r.passphrase
      seenStatus.set(g.id, g.status)
      if (r.formed) {
        toast(tr('formed.title'), 'lilac')
        memorize(g.x, g.y, 220)
      }
    }
    return null
  } catch (e) {
    return e instanceof ApiError ? e.code : 'network'
  }
}

export async function completeGathering(id: string) {
  try {
    const r = await api<{ memorize: { x: number; y: number; r: number } }>(`/api/gatherings/${id}/complete`, { body: {} })
    memorize(r.memorize.x, r.memorize.y, r.memorize.r)
    const g = world.gatherings.find((x) => x.id === id)
    if (g) {
      g.completedByHost = true
      world.player.backpack.proofs.push({ id: uid('p_'), kind: 'event', label: tr('proof.event', { name: g.title }), at: world.now })
      toast(tr('event.completedToast', { xp: 40, name: g.title }), 'fire')
    }
    await sync()
  } catch (e) {
    errToast(e)
  }
}

/* ---------- 探知（4.5）：開著才回報位置，關掉就刪 ---------- */

export function startPresence() {
  stopPresenceTimer()
  void pushPresence()
  presenceTimer = window.setInterval(() => void pushPresence(), 5000)
}

export async function stopPresence() {
  stopPresenceTimer()
  world.strangers = []
  try {
    await api('/api/presence', { method: 'DELETE' })
  } catch {
    /* ignore */
  }
}

function stopPresenceTimer() {
  if (presenceTimer !== null) {
    clearInterval(presenceTimer)
    presenceTimer = null
  }
}

async function pushPresence() {
  const light = currentLight.value
  if (!world.player.detectOn || !light) {
    stopPresenceTimer()
    return
  }
  try {
    const r = await api<{ strangers: Stranger[] }>('/api/presence', {
      body: {
        codename: world.player.codename,
        x: world.player.x,
        y: world.player.y,
        lightId: light.id,
        badges: world.player.shownBadges,
      },
    })
    world.strangers = r.strangers
  } catch {
    /* 下次再試 */
  }
}
