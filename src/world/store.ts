import { computed, reactive } from 'vue'
import { i18n } from '../i18n'
import { BADGE_POOL, commitOf, passphraseSuffix, randomCodename, randomHex, uid, type Badge } from './codename'
import { dist, inWorld, toWorld } from './geo'
import {
  lightRadius,
  MAX_ACTIVE_RESERVATIONS,
  PLAYER_R,
  SUPPLY_PICKUP_R,
  TORCH_MIN,
  XP_PER_EVENT,
} from './rules'
import { crowdOf, effectiveTarget, smoothToward } from './torch'
import type {
  Gathering,
  HoldingGroup,
  Memory,
  Player,
  Stranger,
  Supply,
  Toast,
  Torch,
} from './types'

/**
 * 整個原型的世界狀態。參與者端與店家後台共用同一份，
 * 所以「後台熄火把 → 參與者地圖那塊立刻退回灰色記憶」自然成立。
 */
export interface WorldState {
  now: number
  player: Player
  torches: Torch[]
  supplies: Supply[]
  holdings: HoldingGroup[]
  gatherings: Gathering[]
  strangers: Stranger[]
  /** 記憶：所有曾進入視野的圓。renderer 依序挖洞，永不重置。 */
  memories: Memory[]
  toasts: Toast[]
  /** 剛流局、還沒被使用者關掉的攤 */
  dissolvedPending: string[]
  /** 剛成立的攤（提示用） */
  formedPending: string[]
  /** 真實定位開著：點地圖走路停用 */
  gpsOn: boolean
}

const MEMORY_KEY = 'pinky.memories.v1'
const IDENTITY_KEY = 'pinky.identity.v1'

export const world = reactive<WorldState>({
  now: Date.now(),
  player: {
    id: '',
    codename: '',
    commit: '',
    badges: [],
    shownBadges: [],
    x: 0,
    y: 0,
    detectOn: false,
    xp: 0,
    lampBoostUntil: null,
    backpack: { supplies: [], proofs: [] },
  },
  torches: [],
  supplies: [],
  holdings: [],
  gatherings: [],
  strangers: [],
  memories: [],
  toasts: [],
  dissolvedPending: [],
  formedPending: [],
  gpsOn: false,
})

const tr = (key: string, params?: Record<string, unknown>) => i18n.global.t(key, params ?? {})

let toastSeq = 0
export function toast(text: string, tone: Toast['tone'] = 'info') {
  const id = ++toastSeq
  world.toasts.push({ id, text, tone })
  setTimeout(() => {
    const i = world.toasts.findIndex((t) => t.id === id)
    if (i >= 0) world.toasts.splice(i, 1)
  }, 3200)
}

/* ---------- 身分（4.10） ---------- */

export interface StoredIdentity {
  id: string
  codename: string
  sk: string
  salt: string
  commit: string
  badges: Badge[]
  shownBadges: Badge[]
  xp: number
}

export async function createIdentity(): Promise<StoredIdentity> {
  const sk = randomHex(32)
  const salt = randomHex(16)
  const commit = await commitOf(sk, salt)
  const badges: Badge[] = ['真人', BADGE_POOL[2 + Math.floor(Math.random() * 4)]]
  return { id: 'u_' + randomHex(6), codename: randomCodename(), sk, salt, commit, badges, shownBadges: [], xp: 0 }
}

export function applyIdentity(idn: StoredIdentity) {
  const p = world.player
  p.id = idn.id
  p.codename = idn.codename
  p.commit = idn.commit
  p.badges = idn.badges
  p.shownBadges = idn.shownBadges
  p.xp = idn.xp
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(idn))
  } catch {
    /* 私密模式等情況：身分只存在記憶體 */
  }
}

export function loadIdentity(): StoredIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY)
    return raw ? (JSON.parse(raw) as StoredIdentity) : null
  } catch {
    return null
  }
}

export function persistIdentityPatch() {
  const idn = loadIdentity()
  if (!idn) return
  idn.shownBadges = world.player.shownBadges
  idn.xp = world.player.xp
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(idn))
  } catch {
    /* ignore */
  }
}

/** 燒掉重生：代價是探索記憶歸零（4.10）。 */
export async function burnIdentity() {
  const idn = await createIdentity()
  world.memories = []
  world.player.backpack = { supplies: [], proofs: [] }
  world.player.detectOn = false
  world.player.lampBoostUntil = null
  for (const g of world.gatherings) delete g.joined[world.player.id]
  for (const h of world.holdings) {
    h.joinedByMe = false
    h.completedByMe = false
    for (const t of h.tasks) t.done = false
  }
  try {
    localStorage.removeItem(MEMORY_KEY)
  } catch {
    /* ignore */
  }
  applyIdentity(idn)
  memorize(world.player.x, world.player.y, playerRadius())
  return idn
}

/* ---------- 記憶（4.2） ---------- */

/** 唯一寫入記憶的入口：走路、點火把、事件成立都呼叫它。 */
export function memorize(x: number, y: number, r: number) {
  // 走路時每幀都會呼叫：與上一筆幾乎重疊就略過，避免記憶陣列無限長大
  const last = world.memories[world.memories.length - 1]
  if (last && last.r === r && dist(last.x, last.y, x, y) < r * 0.12) return
  world.memories.push({ x, y, r })
  if (world.memories.length % 20 === 0) persistMemories()
}

export function persistMemories() {
  try {
    // 只存最近 4000 筆，避免無限長大；更早的圓通常已被後來的覆蓋
    localStorage.setItem(MEMORY_KEY, JSON.stringify(world.memories.slice(-4000)))
  } catch {
    /* ignore */
  }
}

function loadMemories(): Memory[] {
  try {
    const raw = localStorage.getItem(MEMORY_KEY)
    return raw ? (JSON.parse(raw) as Memory[]) : []
  } catch {
    return []
  }
}

/* ---------- 視野 ---------- */

export function playerRadius(): number {
  const boosted = world.player.lampBoostUntil && world.player.lampBoostUntil > world.now
  return boosted ? Math.round(PLAYER_R * 1.35) : PLAYER_R
}

export interface LightSource {
  x: number
  y: number
  r: number
  kind: 'player' | 'torch' | 'holding' | 'gathering'
  id: string
}

/** 事件照明半徑：隨人數成長（rules.lightRadius） */
export function holdingLightR(h: HoldingGroup): number {
  return lightRadius(h.joined)
}
export function gatheringLightR(g: Gathering): number {
  return lightRadius(joinedCount(g))
}

/** 目前所有視野來源（4.2）。 */
export const lightSources = computed<LightSource[]>(() => {
  const out: LightSource[] = [
    { x: world.player.x, y: world.player.y, r: playerRadius(), kind: 'player', id: 'me' },
  ]
  for (const t of world.torches) {
    if (t.lit) out.push({ x: t.x, y: t.y, r: t.eff, kind: 'torch', id: t.id })
  }
  for (const h of world.holdings) {
    const t = torchById(h.torchId)
    if (t) out.push({ x: t.x, y: t.y, r: holdingLightR(h), kind: 'holding', id: h.id })
  }
  for (const g of world.gatherings) {
    if (g.status === 'formed') out.push({ x: g.x, y: g.y, r: gatheringLightR(g), kind: 'gathering', id: g.id })
  }
  return out
})

export function isVisible(x: number, y: number): boolean {
  return lightSources.value.some((s) => dist(s.x, s.y, x, y) <= s.r)
}

/** 玩家目前站在哪一盞「照明」裡（只有事件照明能開探知，火把不行） */
export const currentLight = computed<LightSource | null>(() => {
  const p = world.player
  let best: LightSource | null = null
  for (const s of lightSources.value) {
    if (s.kind !== 'holding' && s.kind !== 'gathering') continue
    if (dist(s.x, s.y, p.x, p.y) <= s.r) {
      if (!best || s.r > best.r) best = s
    }
  }
  return best
})

export function lightTitle(s: LightSource): string {
  if (s.kind === 'holding') return world.holdings.find((h) => h.id === s.id)?.title ?? ''
  if (s.kind === 'gathering') return world.gatherings.find((g) => g.id === s.id)?.title ?? ''
  return ''
}

/** 探知開著時，同一盞燈下也開著探知的人（4.5）。 */
export const detectedStrangers = computed<Stranger[]>(() => {
  const light = currentLight.value
  if (!world.player.detectOn || !light) return []
  return world.strangers.filter((s) => s.detectOn && dist(s.x, s.y, light.x, light.y) <= light.r)
})

export function toggleDetect() {
  const p = world.player
  if (p.detectOn) {
    p.detectOn = false
    return
  }
  if (!currentLight.value) return
  p.detectOn = true
}

/* ---------- 火把 ---------- */

export function torchById(id: string | null): Torch | undefined {
  return id ? world.torches.find((t) => t.id === id) : undefined
}

export function addTorch(input: Omit<Torch, 'eff' | 'litAt' | 'id'> & { id?: string }): Torch {
  const t: Torch = {
    ...input,
    id: input.id ?? uid('t_'),
    eff: input.baseR,
    litAt: input.lit ? world.now : null,
  }
  world.torches.push(t)
  if (t.lit) memorize(t.x, t.y, t.eff)
  return t
}

export function setTorchLit(id: string, lit: boolean) {
  const t = torchById(id)
  if (!t || t.lit === lit) return
  t.lit = lit
  t.litAt = lit ? world.now : null
  if (lit) memorize(t.x, t.y, t.eff)
}

export function torchCrowd(t: Torch): number {
  return crowdOf(t, world.torches)
}

/** 火把在哪家的圈裡（4.7 認火把）：回傳最近的燃燒中商家火把 */
export function merchantTorchAt(x: number, y: number): Torch | undefined {
  let best: Torch | undefined
  let bestD = Infinity
  for (const t of world.torches) {
    if (!t.lit || t.temporary) continue
    const d = dist(t.x, t.y, x, y)
    if (d <= t.eff && d < bestD) {
      best = t
      bestD = d
    }
  }
  return best
}

/* ---------- 物資（4.4） ---------- */

export function addSupply(input: Omit<Supply, 'id' | 'total'>): Supply {
  const s: Supply = { ...input, id: uid('s_'), total: input.remaining }
  world.supplies.push(s)
  return s
}

function hasFormedReservationAt(torchId: string): boolean {
  const me = world.player.id
  return world.gatherings.some(
    (g) => g.status === 'formed' && g.torchId === torchId && me in g.joined,
  )
}

export function supplyLocked(s: Supply): boolean {
  return s.requirement === 'reservation' && !hasFormedReservationAt(s.torchId)
}

function tryPickup() {
  const p = world.player
  for (const s of world.supplies) {
    if (s.remaining <= 0) continue
    if (dist(s.x, s.y, p.x, p.y) > SUPPLY_PICKUP_R) continue
    if (!isVisible(s.x, s.y)) continue
    if (supplyLocked(s)) continue
    const already = p.backpack.supplies.filter((b) => b.supplyId === s.id).length
    if (already >= s.perPerson) continue
    s.remaining -= 1
    const torch = torchById(s.torchId)
    p.backpack.supplies.push({
      id: uid('b_'),
      supplyId: s.id,
      kind: s.kind,
      label: s.label,
      rare: s.rare,
      torchName: torch?.name ?? '',
      pickedAt: world.now,
      used: false,
    })
    toast(tr('supply.picked', { label: s.label }), 'zk')
  }
}

export function useSupply(bagId: string) {
  const item = world.player.backpack.supplies.find((b) => b.id === bagId)
  if (!item || item.used) return
  item.used = true
  if (item.kind === 'lamp') {
    world.player.lampBoostUntil = world.now + 60 * 60 * 1000
    toast(tr('supply.lampOn'), 'fire')
  } else {
    toast(tr('supply.redeemed', { label: item.label }), 'zk')
  }
}

/* ---------- Holding Group ---------- */

export function addHolding(input: Omit<HoldingGroup, 'id' | 'joined' | 'joinedByMe' | 'completedByMe'> & { joined?: number }): HoldingGroup {
  const h: HoldingGroup = { ...input, id: uid('h_'), joined: input.joined ?? 0, joinedByMe: false, completedByMe: false }
  world.holdings.push(h)
  return h
}

export function joinHolding(id: string) {
  const h = world.holdings.find((x) => x.id === id)
  if (!h || h.joinedByMe) return
  if (h.joined >= h.capacity) {
    toast(tr('event.full'), 'pinky')
    return
  }
  h.joined += 1
  h.joinedByMe = true
  toast(tr('event.joinedToast', { title: h.title }), 'pinky')
}

export function completeTask(holdingId: string, taskId: string) {
  const h = world.holdings.find((x) => x.id === holdingId)
  const t = h?.tasks.find((x) => x.id === taskId)
  if (!h || !t || t.done) return
  const torch = torchById(h.torchId)
  if (!torch) return
  if (dist(torch.x, torch.y, world.player.x, world.player.y) > holdingLightR(h)) {
    toast(tr('event.taskNeedPresence'), 'fire')
    return
  }
  t.done = true
  if (t.id.endsWith('checkin')) {
    world.player.backpack.proofs.push({ id: uid('p_'), kind: 'checkin', label: tr('proof.checkin', { name: torch.name }), at: world.now })
  }
  if (h.tasks.every((x) => x.done) && !h.completedByMe) {
    h.completedByMe = true
    grantEventCompletion(torch.name, torch.x, torch.y, torch.eff)
  }
}

/** 4.9：完成火把事件 → 經驗值 + 開啟火把照明範圍的探索 */
function grantEventCompletion(name: string, x: number, y: number, r: number) {
  world.player.xp += XP_PER_EVENT
  persistIdentityPatch()
  memorize(x, y, r)
  world.player.backpack.proofs.push({ id: uid('p_'), kind: 'event', label: tr('proof.event', { name }), at: world.now })
  toast(tr('event.completedToast', { xp: XP_PER_EVENT, name }), 'fire')
}

/* ---------- 自發聚集（4.6、4.7） ---------- */

export interface GatheringInput {
  title: string
  placeName: string
  district: string | null
  lat: number
  lng: number
  startAt: number
  builtIn: number
  cap: number | null
  needMore: number
  passphrase: string
  hostPays: boolean
}

export function activeReservationCount(userId = world.player.id): number {
  return world.gatherings.filter((g) => g.status !== 'dissolved' && userId in g.joined).length
}

export function canTakeReservation(): boolean {
  return activeReservationCount() < MAX_ACTIVE_RESERVATIONS
}

export function createGathering(input: GatheringInput): Gathering | { error: string } {
  const { x, y } = toWorld(input.lat, input.lng)
  if (!inWorld(x, y)) return { error: 'out-of-world' }
  if (!canTakeReservation()) return { error: 'too-many' }
  const g: Gathering = {
    id: uid('g_'),
    hostId: world.player.id,
    title: input.title.trim() || input.placeName,
    placeName: input.placeName,
    district: input.district,
    x,
    y,
    lat: input.lat,
    lng: input.lng,
    startAt: input.startAt,
    deadline: input.startAt,
    builtIn: input.builtIn,
    cap: input.cap,
    needMore: input.needMore,
    passphrase: input.passphrase,
    hostPays: input.hostPays,
    joined: { [world.player.id]: passphraseSuffix() },
    status: 'pending',
    torchId: null,
    tempTorchId: null,
    completedByHost: false,
    dissolvedAt: null,
  }
  world.gatherings.push(g)
  evaluateGathering(g)
  return g
}

export function needOf(g: Gathering): number {
  return g.builtIn + g.needMore
}

/** 已加入人數 = 內建人數（含主辦）+ 後來加入的人 */
export function joinedCount(g: Gathering): number {
  return g.builtIn + Object.keys(g.joined).length - 1
}

export function joinGathering(id: string, userId = world.player.id): string | null {
  const g = world.gatherings.find((x) => x.id === id)
  if (!g || g.status === 'dissolved') return 'gone'
  if (userId in g.joined) return null
  if (g.cap !== null && joinedCount(g) >= g.cap) return 'full'
  if (userId === world.player.id && !canTakeReservation()) return 'too-many'
  g.joined[userId] = passphraseSuffix()
  evaluateGathering(g)
  return null
}

function evaluateGathering(g: Gathering) {
  if (g.status !== 'pending') return
  if (joinedCount(g) >= needOf(g)) formGathering(g)
}

function formGathering(g: Gathering) {
  g.status = 'formed'
  const merchant = merchantTorchAt(g.x, g.y)
  if (merchant) {
    g.torchId = merchant.id
  } else {
    // 4.7：單純無商家事件會是暫時的火把（事件結束即消失）
    const t = addTorch({
      name: g.title,
      ownerId: g.hostId,
      x: g.x,
      y: g.y,
      baseR: TORCH_MIN,
      lit: true,
      temporary: true,
      burnHours: null,
    })
    g.tempTorchId = t.id
  }
  memorize(g.x, g.y, gatheringLightR(g))
  if (world.player.id in g.joined) {
    world.formedPending.push(g.id)
    toast(tr('formed.title'), 'lilac')
  }
}

function dissolveGathering(g: Gathering) {
  g.status = 'dissolved'
  g.dissolvedAt = world.now
  if (world.player.id in g.joined) world.dissolvedPending.push(g.id)
}

/** 主辦在成立後按「完成」（4.9） */
export function completeGathering(id: string) {
  const g = world.gatherings.find((x) => x.id === id)
  if (!g || g.status !== 'formed' || g.hostId !== world.player.id || g.completedByHost) return
  g.completedByHost = true
  grantEventCompletion(g.title, g.x, g.y, gatheringLightR(g))
  endGathering(g)
}

function endGathering(g: Gathering) {
  if (g.tempTorchId) {
    const i = world.torches.findIndex((t) => t.id === g.tempTorchId)
    if (i >= 0) world.torches.splice(i, 1)
    g.tempTorchId = null
  }
}

/** 原型專用：模擬一個陌生人加入（正式版沒有這個按鈕） */
export function simulateJoin(id: string) {
  const g = world.gatherings.find((x) => x.id === id)
  if (!g) return
  const s = world.strangers[Math.floor(Math.random() * world.strangers.length)]
  const who = s ? s.id : 'npc_' + randomHex(3)
  const r = joinGathering(id, who)
  if (r === 'full') toast(tr('event.full'), 'lilac')
}

export function dismissDissolved(id: string) {
  world.dissolvedPending = world.dissolvedPending.filter((x) => x !== id)
}
export function dismissFormed(id: string) {
  world.formedPending = world.formedPending.filter((x) => x !== id)
}

/* ---------- 每幀更新 ---------- */

let lastTick = Date.now()

export function tick() {
  const now = Date.now()
  const dt = now - lastTick
  lastTick = now
  world.now = now

  // 火把有效半徑：目標由群聚決定，實際值緩慢跟上
  for (const t of world.torches) {
    if (t.burnHours !== null && t.lit && t.litAt !== null && now - t.litAt > t.burnHours * 3_600_000) {
      setTorchLit(t.id, false)
    }
    const target = t.lit ? effectiveTarget(t.baseR, torchCrowd(t)) : t.eff
    t.eff = smoothToward(t.eff, target, dt)
  }

  // 虛擬預約：到截止仍未達標 → 消失；成立且開始超過 3 小時 → 結束
  for (const g of world.gatherings) {
    if (g.status === 'pending' && now >= g.deadline) dissolveGathering(g)
    if (g.status === 'formed' && now >= g.startAt + 3 * 3_600_000) {
      endGathering(g)
      g.status = 'dissolved'
    }
  }

  // 探知：走出光圈自動關閉（4.5 規則 2）
  if (world.player.detectOn && !currentLight.value) {
    world.player.detectOn = false
    toast(tr('detect.autoOff'), 'lilac')
  }

  tryPickup()
}

/* ---------- 走路 ---------- */

const walk = { targetX: 0, targetY: 0, active: false }
const WALK_SPEED = 90 // m/s，原型加速；真實世界由 GPS 決定

export function walkTo(x: number, y: number) {
  walk.targetX = x
  walk.targetY = y
  walk.active = true
}

export function stepWalk(dtMs: number) {
  if (!walk.active) return
  const p = world.player
  const dx = walk.targetX - p.x
  const dy = walk.targetY - p.y
  const d = Math.hypot(dx, dy)
  const step = (WALK_SPEED * dtMs) / 1000
  if (d <= step) {
    p.x = walk.targetX
    p.y = walk.targetY
    walk.active = false
  } else {
    p.x += (dx / d) * step
    p.y += (dy / d) * step
  }
  memorize(p.x, p.y, playerRadius())
}

export function isWalking() {
  return walk.active
}

/** 真實定位回報的位置：直接放人、取消模擬走路、寫進記憶 */
export function setPlayerPosition(x: number, y: number) {
  walk.active = false
  world.player.x = x
  world.player.y = y
  memorize(x, y, playerRadius())
}

/* ---------- 初始化 ---------- */

export async function bootWorld(seed: (w: WorldState) => void) {
  let idn = loadIdentity()
  const fresh = !idn
  if (!idn) {
    idn = await createIdentity()
  }
  applyIdentity(idn)
  world.memories = loadMemories()
  seed(world)
  memorize(world.player.x, world.player.y, playerRadius())
  return fresh
}
