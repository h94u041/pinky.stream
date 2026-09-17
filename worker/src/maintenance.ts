/**
 * 懶惰的世界時鐘：每次有人讀 /api/world 就順手做一次。
 *  - 候補中的攤到截止仍未達標 → dissolved（4.7 的承諾）
 *  - 已成立的攤開始後 3 小時 → ended，暫時火把移除
 *  - 火把燒滿時數 → 熄滅
 *  - 探知 2 分鐘沒更新 → 視同離開
 * 每 10 秒最多跑一次（同一個 isolate 內）。
 */
let lastRun = 0

export async function runMaintenance(db: D1Database) {
  const now = Date.now()
  if (now - lastRun < 10_000) return
  lastRun = now
  const threeH = 3 * 3_600_000
  await db.batch([
    db.prepare("UPDATE gatherings SET status = 'dissolved', dissolved_at = ? WHERE status = 'pending' AND deadline <= ?").bind(now, now),
    db.prepare("DELETE FROM torches WHERE temporary = 1 AND id IN (SELECT temp_torch_id FROM gatherings WHERE status = 'formed' AND start_at + ? <= ? AND temp_torch_id IS NOT NULL)").bind(threeH, now),
    db.prepare("UPDATE gatherings SET status = 'ended' WHERE status = 'formed' AND start_at + ? <= ?").bind(threeH, now),
    db.prepare('UPDATE torches SET lit = 0, lit_at = NULL WHERE lit = 1 AND burn_hours IS NOT NULL AND lit_at IS NOT NULL AND lit_at + burn_hours * 3600000 <= ?').bind(now),
    db.prepare('DELETE FROM presence WHERE updated_at < ?').bind(now - 120_000),
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
  ])
}
