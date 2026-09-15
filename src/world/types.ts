import type { Badge } from './codename'

export interface Torch {
  id: string
  /** 店家名稱；暫時火把（由自發聚集成立而生）用事件名 */
  name: string
  ownerId: string
  x: number
  y: number
  baseR: number
  /** 目前有效半徑（平滑後） */
  eff: number
  lit: boolean
  /** 4.7：無商家的已成立事件會變成暫時火把，事件結束即消失 */
  temporary: boolean
  /** 燃燒時數上限（小時），null 為不限 */
  burnHours: number | null
  litAt: number | null
}

export type SupplyKind = 'arrow' | 'lamp' | 'discount' | 'rare'

export interface Supply {
  id: string
  torchId: string
  x: number
  y: number
  kind: SupplyKind
  label: string
  rare: boolean
  /** 投放總數；remaining 是還沒被撿走的 */
  total: number
  remaining: number
  perPerson: number
  /** §1：「需要滿足條件才能拾起例如兩個人」→ 'reservation' 表示要在該火把有已成立的虛擬預約 */
  requirement: 'none' | 'reservation'
}

export interface Task {
  id: string
  label: string
  reward: string
  done: boolean
}

export interface HoldingGroup {
  id: string
  torchId: string
  title: string
  startAt: number
  capacity: number
  joined: number
  joinedByMe: boolean
  entry: string | null
  tasks: Task[]
  completedByMe: boolean
}

export type GatheringStatus = 'pending' | 'formed' | 'dissolved'

export interface Gathering {
  id: string
  hostId: string
  title: string
  placeName: string
  district: string | null
  x: number
  y: number
  lat: number
  lng: number
  startAt: number
  /** 成立截止時間；memo 4.6 目前 = 開始時間 */
  deadline: number
  builtIn: number
  cap: number | null
  needMore: number
  passphrase: string
  hostPays: boolean
  /** 已加入者（含主辦）id → 密語附加號碼 */
  joined: Record<string, string>
  status: GatheringStatus
  /** 認到的商家火把；null 表示自成暫時火把 */
  torchId: string | null
  tempTorchId: string | null
  completedByHost: boolean
  dissolvedAt: number | null
}

export interface Stranger {
  id: string
  codename: string
  x: number
  y: number
  detectOn: boolean
  since: number
  tags: string[]
  badges: Badge[]
  /** 曾完成的火把事件（4.2：探索時能看到的唯一訊息） */
  history: string[]
}

export interface PickedSupply {
  id: string
  supplyId: string
  kind: SupplyKind
  label: string
  rare: boolean
  torchName: string
  pickedAt: number
  used: boolean
}

export interface Proof {
  id: string
  kind: 'checkin' | 'event'
  label: string
  at: number
}

export interface Player {
  id: string
  codename: string
  commit: string
  badges: Badge[]
  shownBadges: Badge[]
  x: number
  y: number
  detectOn: boolean
  xp: number
  /** 照明燈物資：探索半徑 +35% 到此時間為止 */
  lampBoostUntil: number | null
  backpack: {
    supplies: PickedSupply[]
    proofs: Proof[]
  }
}

export interface Memory {
  x: number
  y: number
  r: number
}

export interface Toast {
  id: number
  text: string
  tone: 'info' | 'fire' | 'zk' | 'lilac' | 'pinky'
}
