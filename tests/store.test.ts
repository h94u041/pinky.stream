import { beforeEach, describe, expect, it } from 'vitest'
import { toLatLng } from '../src/world/geo'
import { LIGHT_R, MAX_ACTIVE_RESERVATIONS, SUPPLY_PICKUP_R, TORCH_MIN } from '../src/world/rules'
import {
  addHolding,
  addSupply,
  addTorch,
  applyIdentity,
  canTakeReservation,
  completeTask,
  createGathering,
  currentLight,
  joinGathering,
  joinHolding,
  lightSources,
  memorize,
  tick,
  toggleDetect,
  walkTo,
  stepWalk,
  world,
  type GatheringInput,
} from '../src/world/store'

function reset() {
  world.torches.splice(0)
  world.supplies.splice(0)
  world.holdings.splice(0)
  world.gatherings.splice(0)
  world.strangers.splice(0)
  world.memories.splice(0)
  world.toasts.splice(0)
  world.dissolvedPending.splice(0)
  world.formedPending.splice(0)
  applyIdentity({ id: 'u_me', codename: '薄荷#4172', sk: 'x', salt: 'y', commit: 'z', badges: ['真人'], shownBadges: [], xp: 0 })
  world.player.x = 0
  world.player.y = 0
  world.player.detectOn = false
  world.player.backpack = { supplies: [], proofs: [] }
  world.now = Date.now()
}

function gatheringAt(x: number, y: number, extra: Partial<GatheringInput> = {}): GatheringInput {
  const { lat, lng } = toLatLng(x, y)
  return {
    title: '',
    placeName: '華山',
    district: null,
    lat,
    lng,
    startAt: Date.now() + 60 * 60 * 1000,
    builtIn: 1,
    cap: 6,
    needMore: 1,
    passphrase: '今天有帶傘',
    hostPays: false,
    ...extra,
  }
}

beforeEach(reset)

describe('虛擬預約生命週期（4.7）', () => {
  it('開攤只是候補；湊齊才成立、發 150 m 照明、沒店家時自成暫時火把', () => {
    const g = createGathering(gatheringAt(3000, 3000))
    if ('error' in g) throw new Error(g.error)
    expect(g.status).toBe('pending')
    expect(g.title).toBe('華山') // 名稱留白就用地點名
    expect(lightSources.value.some((s) => s.id === g.id)).toBe(false)

    expect(joinGathering(g.id, 'npc_1')).toBeNull()
    expect(g.status).toBe('formed')
    expect(g.tempTorchId).not.toBeNull()
    const temp = world.torches.find((t) => t.id === g.tempTorchId)!
    expect(temp.temporary).toBe(true)
    expect(temp.baseR).toBe(TORCH_MIN)
    expect(lightSources.value.find((s) => s.id === g.id)?.r).toBe(LIGHT_R.gathering)
    // 成立 → 那塊地方進入記憶
    expect(world.memories.some((m) => m.x === g.x && m.y === g.y && m.r === LIGHT_R.gathering)).toBe(true)
  })

  it('落在燃燒中店家火把圈內 → 認火把，不另生暫時火把', () => {
    addTorch({ name: '霧室', ownerId: 'm', x: 0, y: 0, baseR: 260, lit: true, temporary: false, burnHours: 6 })
    const g = createGathering(gatheringAt(50, 50))
    if ('error' in g) throw new Error(g.error)
    joinGathering(g.id, 'npc_1')
    expect(g.status).toBe('formed')
    expect(g.torchId).not.toBeNull()
    expect(g.tempTorchId).toBeNull()
  })

  it('到截止還沒湊齊 → 消失，並通知主辦', () => {
    const g = createGathering(gatheringAt(3000, 3000, { startAt: Date.now() + 1000 }))
    if ('error' in g) throw new Error(g.error)
    tick()
    expect(g.status).toBe('pending')
    g.deadline = Date.now() - 1
    tick()
    expect(g.status).toBe('dissolved')
    expect(world.dissolvedPending).toContain(g.id)
  })

  it('每個加入者拿到不同的密語附加號碼（4.8）', () => {
    const g = createGathering(gatheringAt(3000, 3000, { needMore: 3 }))
    if ('error' in g) throw new Error(g.error)
    joinGathering(g.id, 'a')
    joinGathering(g.id, 'b')
    const codes = Object.values(g.joined)
    expect(codes).toHaveLength(3)
    expect(codes.every((c) => /^[A-Z]\d[A-Z]$/.test(c))).toBe(true)
  })

  it('人數上限與「最多同時 2 個虛擬預約」（4.6）', () => {
    const g = createGathering(gatheringAt(3000, 3000, { cap: 2, needMore: 5 }))
    if ('error' in g) throw new Error(g.error)
    expect(joinGathering(g.id, 'a')).toBeNull()
    expect(joinGathering(g.id, 'b')).toBe('full')

    createGathering(gatheringAt(-3000, 3000))
    expect(canTakeReservation()).toBe(false)
    expect(MAX_ACTIVE_RESERVATIONS).toBe(2)
    const third = createGathering(gatheringAt(-3000, -3000))
    expect(third).toEqual({ error: 'too-many' })
  })

  it('地圖範圍外要明確拒絕', () => {
    expect(createGathering(gatheringAt(50_000, 0))).toEqual({ error: 'out-of-world' })
  })
})

describe('探知（4.5）', () => {
  it('不在照明裡開不了；走出光圈自動關閉', () => {
    const torch = addTorch({ name: '霧室', ownerId: 'm', x: 0, y: 0, baseR: 260, lit: true, temporary: false, burnHours: 6 })
    addHolding({ torchId: torch.id, title: '舞會', startAt: Date.now(), capacity: 10, entry: null, tasks: [] })
    world.player.x = 1000
    toggleDetect()
    expect(world.player.detectOn).toBe(false)

    world.player.x = 50
    expect(currentLight.value?.kind).toBe('holding')
    toggleDetect()
    expect(world.player.detectOn).toBe(true)

    world.player.x = LIGHT_R.holding + 50
    tick()
    expect(world.player.detectOn).toBe(false)
  })
})

describe('物資（4.4）', () => {
  it('走進 100 m 且在視野內自動撿起；需要虛擬預約的撿不起來', () => {
    const torch = addTorch({ name: '霧室', ownerId: 'm', x: 0, y: 0, baseR: 260, lit: true, temporary: false, burnHours: 6 })
    const free = addSupply({ torchId: torch.id, x: 120, y: 0, kind: 'discount', label: '調酒 −35%', rare: false, remaining: 2, perPerson: 1, requirement: 'none' })
    const locked = addSupply({ torchId: torch.id, x: -120, y: 0, kind: 'rare', label: '雙人 shot', rare: true, remaining: 1, perPerson: 1, requirement: 'reservation' })
    world.player.x = 120 + SUPPLY_PICKUP_R + 10
    tick()
    expect(free.remaining).toBe(2)
    world.player.x = 120
    tick()
    expect(free.remaining).toBe(1)
    expect(world.player.backpack.supplies.map((s) => s.label)).toEqual(['調酒 −35%'])
    tick()
    expect(free.remaining).toBe(1) // 每人限領 1
    world.player.x = -120
    tick()
    expect(locked.remaining).toBe(1)
  })
})

describe('Holding Group 任務（4.9）', () => {
  it('報名後在現場完成全部任務 → 經驗值 + 火把照明範圍進入記憶', () => {
    const torch = addTorch({ name: '霧室', ownerId: 'm', x: 5000, y: 0, baseR: 260, lit: true, temporary: false, burnHours: 6 })
    const h = addHolding({
      torchId: torch.id,
      title: '舞會',
      startAt: Date.now(),
      capacity: 10,
      entry: null,
      tasks: [{ id: 't_checkin', label: '報到', reward: '解鎖', done: false }],
    })
    joinHolding(h.id)
    expect(h.joinedByMe).toBe(true)
    world.player.x = 5000
    world.memories.splice(0) // 點火把時已記過一次；這裡只看完成事件本身有沒有寫入
    completeTask(h.id, 't_checkin')
    expect(h.completedByMe).toBe(true)
    expect(world.player.xp).toBeGreaterThan(0)
    expect(world.memories.some((m) => m.x === 5000 && m.y === 0 && m.r === torch.eff)).toBe(true)
    expect(world.player.backpack.proofs.some((p) => p.kind === 'checkin')).toBe(true)
  })
})

describe('走路與記憶', () => {
  it('走路會把腳下寫進記憶，記憶只增不減', () => {
    memorize(0, 0, 100)
    const n0 = world.memories.length
    walkTo(500, 0)
    for (let i = 0; i < 20; i++) stepWalk(200)
    expect(world.player.x).toBeGreaterThan(0)
    expect(world.memories.length).toBeGreaterThan(n0)
  })
})
