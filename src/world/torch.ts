import { CROWD_GROWTH, CROWD_MAX_MULT, TORCH_MAX, TORCH_MIN, TORCH_SMOOTH_TAU_MS } from './rules'

export interface TorchLike {
  id: string
  x: number
  y: number
  baseR: number
  lit: boolean
}

/**
 * 4.3 的 crowd(t)：對所有其他「燃燒中」的火把，距離愈近貢獻愈大，
 * 超過兩者基礎半徑之和就沒有貢獻。
 */
export function crowdOf(self: TorchLike, others: readonly TorchLike[]): number {
  let crowd = 0
  for (const o of others) {
    if (o === self || o.id === self.id || !o.lit) continue
    const d = Math.hypot(o.x - self.x, o.y - self.y)
    crowd += Math.max(0, 1 - d / (self.baseR + o.baseR))
  }
  return crowd
}

/**
 * 有效半徑的目標值（4.3 規則二，群聚版）：
 *   mult = min(1.30, 1.05^crowd)
 *   eff  = clamp(R_base × mult, TORCH_MIN, TORCH_MAX)
 * 規則一由 TORCH_MIN 保證：永遠 ≥ 200 m > 使用者的 100 m。
 */
export function effectiveTarget(baseR: number, crowd: number): number {
  const mult = Math.min(CROWD_MAX_MULT, Math.pow(CROWD_GROWTH, crowd))
  return clamp(baseR * mult, TORCH_MIN, TORCH_MAX)
}

/** 一階平滑：eff 每幀朝 target 靠近，dtMs 為距上一幀的毫秒數。 */
export function smoothToward(current: number, target: number, dtMs: number): number {
  if (!Number.isFinite(current)) return target
  const k = 1 - Math.exp(-dtMs / TORCH_SMOOTH_TAU_MS)
  const next = current + (target - current) * k
  return Math.abs(target - next) < 0.05 ? target : next
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
