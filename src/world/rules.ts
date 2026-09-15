/**
 * 世界規則常數。所有數字都來自 memo.md 第 4 節與第 10 節；
 * memo 內互相矛盾的地方採用哪個值，記錄在 memo.md 的開發記事區。
 * 單位：公尺（世界座標 1 單位 = 1 公尺）。
 */

/** 使用者自己的探索半徑（4.2、§10） */
export const PLAYER_R = 100

/** 火把有效半徑下限（§10）：永遠比使用者自己大 */
export const TORCH_MIN = 200

/** 火把群聚後的有效半徑上限（4.3：「四、五支擠在同一條街 → 增加到 350 m 上限」） */
export const TORCH_MAX = 350

/** 每一單位 crowd 讓半徑成長 5%（4.3：「每次 ×105%」） */
export const CROWD_GROWTH = 1.05

/** 群聚成長的倍率上限（4.3：「最大至 130%」） */
export const CROWD_MAX_MULT = 1.3

/**
 * 有效半徑朝目標值靠近的時間常數（毫秒）。
 * 4.3：「別人熄燈，你的光會隨時間緩慢變小」。原型用 20 秒，正式版要拉長（例如 15 分鐘）。
 */
export const TORCH_SMOOTH_TAU_MS = 20_000

/** 已成立事件的照明半徑（4.2） */
export const LIGHT_R = {
  holding: 220,
  gathering: 150,
} as const

/** 物資自動拾取距離（4.4） */
export const SUPPLY_PICKUP_R = 100

/** 同一使用者同時最多擁有的虛擬預約數（4.6） */
export const MAX_ACTIVE_RESERVATIONS = 2

/** 密語最長字數（4.6 步驟 2） */
export const PASSPHRASE_MAX = 24

/** 自發聚集表單預設值（4.6 步驟 2） */
export const GATHERING_DEFAULTS = {
  hour: 17,
  minute: 0,
  builtIn: 1,
  cap: 6,
  needMore: 1,
} as const

/** 完成火把事件得到的經驗值（4.9 只說「獲得經驗值」，數字是原型暫定） */
export const XP_PER_EVENT = 40

/** 三層迷霧的顏色（4.1、§9） */
export const FOG = {
  unexplored: '#04040A',
  memory: 'rgba(8,8,20,0.70)',
  memoryLabelAlpha: 0.42,
} as const

export const PALETTE = {
  void: '#06060D',
  ink: '#0B0912',
  land: '#1B1538',
  panel: '#191527',
  line: '#302843',
  paper: '#F3EEF9',
  haze: '#9A91B4',
  pinky: '#FF4F9A',
  fire: '#FF9A3C',
  zk: '#5FE0CE',
  lilac: '#C9BEF0',
  amber: '#FFC54D',
} as const
