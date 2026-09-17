import { Hono, type Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { passphraseSuffix } from '../../src/world/codename'
import { dist, inWorld, toWorld } from '../../src/world/geo'
import { lightRadius, MAX_ACTIVE_RESERVATIONS, PASSPHRASE_MAX, SUPPLY_PICKUP_R, TORCH_MIN, XP_PER_EVENT } from '../../src/world/rules'
import { crowdOf, effectiveTarget } from '../../src/world/torch'
import { hashPassword, randomToken, SESSION_TTL_MS, verifyPassword } from './auth'
import type { Ctx } from './env'
import { runMaintenance } from './maintenance'
import { gatheringRow, holdingRow, supplyRow, torchRow, type GatheringRow, type HoldingRow, type SupplyRow, type TorchRow } from './rows'

const app = new Hono<Ctx>()

const now = () => Date.now()
const uid = (p: string) => p + randomToken(6)
const bad = (c: Context<Ctx>, msg: string, status: ContentfulStatusCode = 400) => c.json({ error: msg }, status)

/* ---------- 身分 ----------
 * 參與者：header X-Pinky-Commit（承諾值）。原型採「先到先信」：伺服器無法驗證承諾值是誰的，
 * 只保證同一個承諾值的資料只有持有者看得到。正式版換成 ZK 證明後這裡不用改介面。
 * 店家：Bearer session token。
 */
app.use('/api/*', async (c, next) => {
  const commit = c.req.header('X-Pinky-Commit')
  c.set('commit', commit && /^[0-9a-f]{16,64}$/i.test(commit) ? commit.toLowerCase() : null)
  c.set('merchantId', null)
  const auth = c.req.header('Authorization')
  if (auth?.startsWith('Bearer ')) {
    const row = await c.env.DB.prepare('SELECT merchant_id, expires_at FROM sessions WHERE token = ?')
      .bind(auth.slice(7))
      .first<{ merchant_id: string; expires_at: number }>()
    if (row && row.expires_at > now()) c.set('merchantId', row.merchant_id)
  }
  await next()
})

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'internal', detail: String(err?.message ?? err) }, 500)
})

/* ---------- 世界 ---------- */

app.get('/api/world', async (c) => {
  await runMaintenance(c.env.DB)
  const db = c.env.DB
  const t = now()
  const [torches, holdings, supplies, gatherings, hJoins, gJoins] = await Promise.all([
    db.prepare('SELECT * FROM torches').all<TorchRow>(),
    db.prepare('SELECT * FROM holdings').all<HoldingRow>(),
    db.prepare('SELECT * FROM supplies WHERE remaining > 0').all<SupplyRow>(),
    // 進行中的攤全部給；已消失／已結束的只給我有加入的（讓前端能顯示 🥺 與背包灰卡）
    db.prepare("SELECT * FROM gatherings WHERE status IN ('pending','formed') OR (id IN (SELECT gathering_id FROM gathering_joins WHERE commit_hash = ?) AND created_at > ?)").bind(c.get('commit') ?? '', t - 7 * 86_400_000).all<GatheringRow>(),
    db.prepare('SELECT holding_id, COUNT(*) AS n FROM holding_joins GROUP BY holding_id').all<{ holding_id: string; n: number }>(),
    db.prepare('SELECT gathering_id, COUNT(*) AS n FROM gathering_joins GROUP BY gathering_id').all<{ gathering_id: string; n: number }>(),
  ])
  const hCount = new Map(hJoins.results.map((r) => [r.holding_id, r.n]))
  const gCount = new Map(gJoins.results.map((r) => [r.gathering_id, r.n]))
  const torchList = torches.results.map(torchRow)
  // 有效半徑目標值（4.3）：平滑交給前端
  for (const tr of torchList) tr.eff = tr.lit ? effectiveTarget(tr.baseR, crowdOf(tr, torchList)) : tr.baseR

  const me = c.get('commit')
  let mine: unknown = null
  if (me) {
    const [myH, myG, myP, myC] = await Promise.all([
      db.prepare('SELECT holding_id, done_tasks, completed FROM holding_joins WHERE commit_hash = ?').bind(me).all<{ holding_id: string; done_tasks: string; completed: number }>(),
      db.prepare('SELECT j.gathering_id, j.suffix, g.passphrase FROM gathering_joins j JOIN gatherings g ON g.id = j.gathering_id WHERE j.commit_hash = ?').bind(me).all<{ gathering_id: string; suffix: string; passphrase: string }>(),
      db.prepare('SELECT supply_id, count FROM pickups WHERE commit_hash = ?').bind(me).all<{ supply_id: string; count: number }>(),
      db.prepare('SELECT event_title, xp FROM completions WHERE commit_hash = ? ORDER BY at').bind(me).all<{ event_title: string; xp: number }>(),
    ])
    mine = {
      holdings: myH.results.map((r) => ({ holdingId: r.holding_id, doneTasks: JSON.parse(r.done_tasks) as string[], completed: !!r.completed })),
      gatherings: myG.results.map((r) => ({ gatheringId: r.gathering_id, suffix: r.suffix, passphrase: r.passphrase })),
      pickups: myP.results.map((r) => ({ supplyId: r.supply_id, count: r.count })),
      xp: myC.results.reduce((a, r) => a + r.xp, 0),
      completions: myC.results.map((r) => r.event_title),
    }
  }

  return c.json({
    now: t,
    torches: torchList,
    holdings: holdings.results.map((h) => holdingRow(h, hCount.get(h.id) ?? 0)),
    supplies: supplies.results.map(supplyRow),
    gatherings: gatherings.results.map((g) => gatheringRow(g, gCount.get(g.id) ?? 0, me)),
    me: mine,
  })
})

/* ---------- Holding Group：報名、任務 ---------- */

app.post('/api/holdings/:id/join', async (c) => {
  const me = c.get('commit')
  if (!me) return bad(c, 'no-identity', 401)
  const h = await c.env.DB.prepare('SELECT * FROM holdings WHERE id = ?').bind(c.req.param('id')).first<HoldingRow>()
  if (!h) return bad(c, 'not-found', 404)
  const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM holding_joins WHERE holding_id = ?').bind(h.id).first<{ n: number }>()
  if ((n?.n ?? 0) >= h.capacity) return bad(c, 'full', 409)
  await c.env.DB.prepare('INSERT OR IGNORE INTO holding_joins (holding_id, commit_hash, joined_at) VALUES (?, ?, ?)').bind(h.id, me, now()).run()
  return c.json({ ok: true })
})

app.post('/api/holdings/:id/tasks/:taskId/complete', async (c) => {
  const me = c.get('commit')
  if (!me) return bad(c, 'no-identity', 401)
  const { x, y } = await c.req.json<{ x: number; y: number }>()
  const db = c.env.DB
  const h = await db.prepare('SELECT * FROM holdings WHERE id = ?').bind(c.req.param('id')).first<HoldingRow>()
  if (!h) return bad(c, 'not-found', 404)
  const torch = await db.prepare('SELECT * FROM torches WHERE id = ?').bind(h.torch_id).first<TorchRow>()
  if (!torch) return bad(c, 'not-found', 404)
  const join = await db.prepare('SELECT done_tasks, completed FROM holding_joins WHERE holding_id = ? AND commit_hash = ?').bind(h.id, me).first<{ done_tasks: string; completed: number }>()
  if (!join) return bad(c, 'not-joined', 403)
  const joined = (await db.prepare('SELECT COUNT(*) AS n FROM holding_joins WHERE holding_id = ?').bind(h.id).first<{ n: number }>())?.n ?? 0
  // 4.9：要在現場（照明範圍內）才能完成任務。位置由客戶端自報，是已知的洞（memo2 9.2）。
  if (dist(torch.x, torch.y, x, y) > lightRadius(joined)) return bad(c, 'not-on-site', 409)
  const tasks = JSON.parse(h.tasks) as { id: string }[]
  const taskId = c.req.param('taskId')
  if (!tasks.some((t) => t.id === taskId)) return bad(c, 'no-such-task', 404)
  const done = new Set(JSON.parse(join.done_tasks) as string[])
  done.add(taskId)
  const completed = tasks.every((t) => done.has(t.id))
  const stmts = [
    db.prepare('UPDATE holding_joins SET done_tasks = ?, completed = ? WHERE holding_id = ? AND commit_hash = ?').bind(JSON.stringify([...done]), completed ? 1 : 0, h.id, me),
  ]
  if (completed && !join.completed) {
    stmts.push(db.prepare('INSERT INTO completions (commit_hash, event_title, xp, at) VALUES (?, ?, ?, ?)').bind(me, h.title, XP_PER_EVENT, now()))
  }
  await db.batch(stmts)
  return c.json({ ok: true, doneTasks: [...done], completed, memorize: completed ? { x: torch.x, y: torch.y, r: effectiveTarget(torch.base_r, 0) } : null })
})

/* ---------- 物資（4.4）：伺服器裁定撿不撿得到 ---------- */

app.post('/api/supplies/:id/pickup', async (c) => {
  const me = c.get('commit')
  if (!me) return bad(c, 'no-identity', 401)
  const { x, y } = await c.req.json<{ x: number; y: number }>()
  const db = c.env.DB
  const s = await db.prepare('SELECT * FROM supplies WHERE id = ?').bind(c.req.param('id')).first<SupplyRow>()
  if (!s || s.remaining <= 0) return bad(c, 'gone', 409)
  if (dist(s.x, s.y, x, y) > SUPPLY_PICKUP_R) return bad(c, 'too-far', 409)
  if (s.requirement === 'reservation') {
    const r = await db.prepare("SELECT 1 FROM gatherings g JOIN gathering_joins j ON j.gathering_id = g.id WHERE g.status = 'formed' AND g.torch_id = ? AND j.commit_hash = ? LIMIT 1").bind(s.torch_id, me).first()
    if (!r) return bad(c, 'locked', 409)
  }
  const mine = await db.prepare('SELECT count FROM pickups WHERE supply_id = ? AND commit_hash = ?').bind(s.id, me).first<{ count: number }>()
  if ((mine?.count ?? 0) >= s.per_person) return bad(c, 'limit', 409)
  const res = await db.prepare('UPDATE supplies SET remaining = remaining - 1 WHERE id = ? AND remaining > 0').bind(s.id).run()
  if (!res.meta.changes) return bad(c, 'gone', 409)
  await db.prepare('INSERT INTO pickups (supply_id, commit_hash, count, last_at) VALUES (?, ?, 1, ?) ON CONFLICT(supply_id, commit_hash) DO UPDATE SET count = count + 1, last_at = excluded.last_at').bind(s.id, me, now()).run()
  const torch = await db.prepare('SELECT name FROM torches WHERE id = ?').bind(s.torch_id).first<{ name: string }>()
  return c.json({ ok: true, supply: supplyRow({ ...s, remaining: s.remaining - 1 }), torchName: torch?.name ?? '' })
})

/* ---------- 自發聚集（4.6、4.7） ---------- */

interface GatheringInput {
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

async function activeCount(db: D1Database, commit: string) {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM gathering_joins j JOIN gatherings g ON g.id = j.gathering_id WHERE j.commit_hash = ? AND g.status IN ('pending','formed')").bind(commit).first<{ n: number }>()
  return r?.n ?? 0
}

/** 湊齊 → 成立：認火把或自成暫時火把，回傳成立與否 */
async function evaluate(db: D1Database, g: GatheringRow): Promise<boolean> {
  if (g.status !== 'pending') return false
  const joins = (await db.prepare('SELECT COUNT(*) AS n FROM gathering_joins WHERE gathering_id = ?').bind(g.id).first<{ n: number }>())?.n ?? 0
  const joinedCount = g.built_in + joins - 1
  if (joinedCount < g.built_in + g.need_more) return false
  const torches = (await db.prepare('SELECT * FROM torches WHERE lit = 1 AND temporary = 0').all<TorchRow>()).results.map(torchRow)
  for (const tr of torches) tr.eff = effectiveTarget(tr.baseR, crowdOf(tr, torches))
  const merchant = torches.filter((t) => dist(t.x, t.y, g.x, g.y) <= t.eff).sort((a, b) => dist(a.x, a.y, g.x, g.y) - dist(b.x, b.y, g.x, g.y))[0]
  const stmts: D1PreparedStatement[] = []
  let tempId: string | null = null
  if (!merchant) {
    tempId = uid('t_')
    stmts.push(db.prepare('INSERT INTO torches (id, merchant_id, name, x, y, base_r, lit, burn_hours, lit_at, temporary, created_at) VALUES (?, NULL, ?, ?, ?, ?, 1, NULL, ?, 1, ?)').bind(tempId, g.title, g.x, g.y, TORCH_MIN, now(), now()))
  }
  stmts.push(db.prepare("UPDATE gatherings SET status = 'formed', torch_id = ?, temp_torch_id = ? WHERE id = ?").bind(merchant?.id ?? null, tempId, g.id))
  await db.batch(stmts)
  return true
}

app.post('/api/gatherings', async (c) => {
  const me = c.get('commit')
  if (!me) return bad(c, 'no-identity', 401)
  const b = await c.req.json<GatheringInput>()
  const { x, y } = toWorld(Number(b.lat), Number(b.lng))
  if (!Number.isFinite(x) || !inWorld(x, y)) return bad(c, 'out-of-world')
  const pass = String(b.passphrase ?? '').trim().slice(0, PASSPHRASE_MAX)
  if (!pass) return bad(c, 'passphrase')
  const builtIn = Math.max(1, Math.floor(Number(b.builtIn) || 1))
  const cap = b.cap === null ? null : Math.max(1, Math.floor(Number(b.cap) || 1))
  const needMore = Math.max(0, Math.floor(Number(b.needMore) || 0))
  if (cap !== null && (builtIn > cap || builtIn + needMore > cap)) return bad(c, 'cap')
  const startAt = Number(b.startAt)
  if (!Number.isFinite(startAt) || startAt <= now()) return bad(c, 'time-passed')
  if ((await activeCount(c.env.DB, me)) >= MAX_ACTIVE_RESERVATIONS) return bad(c, 'too-many', 409)
  const id = uid('g_')
  const placeName = String(b.placeName ?? '').slice(0, 80) || '?'
  const title = String(b.title ?? '').trim().slice(0, 30) || placeName
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO gatherings (id, host_commit, title, place_name, district, x, y, lat, lng, start_at, deadline, built_in, cap, need_more, passphrase, host_pays, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, me, title, placeName, b.district ?? null, x, y, Number(b.lat), Number(b.lng), startAt, startAt, builtIn, cap, needMore, pass, b.hostPays ? 1 : 0, 'pending', now()),
    c.env.DB.prepare('INSERT INTO gathering_joins (gathering_id, commit_hash, suffix, joined_at) VALUES (?, ?, ?, ?)').bind(id, me, passphraseSuffix(), now()),
  ])
  const g = (await c.env.DB.prepare('SELECT * FROM gatherings WHERE id = ?').bind(id).first<GatheringRow>())!
  const formed = await evaluate(c.env.DB, g)
  return c.json({ ok: true, id, formed })
})

app.post('/api/gatherings/:id/join', async (c) => {
  const me = c.get('commit')
  if (!me) return bad(c, 'no-identity', 401)
  const db = c.env.DB
  const g = await db.prepare('SELECT * FROM gatherings WHERE id = ?').bind(c.req.param('id')).first<GatheringRow>()
  if (!g || g.status === 'dissolved' || g.status === 'ended') return bad(c, 'gone', 409)
  const already = await db.prepare('SELECT suffix FROM gathering_joins WHERE gathering_id = ? AND commit_hash = ?').bind(g.id, me).first<{ suffix: string }>()
  if (already) return c.json({ ok: true, suffix: already.suffix, passphrase: g.passphrase, formed: g.status === 'formed' })
  const joins = (await db.prepare('SELECT COUNT(*) AS n FROM gathering_joins WHERE gathering_id = ?').bind(g.id).first<{ n: number }>())?.n ?? 0
  if (g.cap !== null && g.built_in + joins - 1 >= g.cap) return bad(c, 'full', 409)
  if ((await activeCount(db, me)) >= MAX_ACTIVE_RESERVATIONS) return bad(c, 'too-many', 409)
  const suffix = passphraseSuffix()
  await db.prepare('INSERT INTO gathering_joins (gathering_id, commit_hash, suffix, joined_at) VALUES (?, ?, ?, ?)').bind(g.id, me, suffix, now()).run()
  const formed = await evaluate(db, g)
  return c.json({ ok: true, suffix, passphrase: g.passphrase, formed: formed || g.status === 'formed' })
})

/** 主辦按「完成」（4.9）：經驗值 + 結束事件 */
app.post('/api/gatherings/:id/complete', async (c) => {
  const me = c.get('commit')
  if (!me) return bad(c, 'no-identity', 401)
  const db = c.env.DB
  const g = await db.prepare('SELECT * FROM gatherings WHERE id = ?').bind(c.req.param('id')).first<GatheringRow>()
  if (!g || g.host_commit !== me) return bad(c, 'not-host', 403)
  if (g.status !== 'formed' || g.completed) return bad(c, 'not-formed', 409)
  const stmts = [
    db.prepare("UPDATE gatherings SET completed = 1, status = 'ended' WHERE id = ?").bind(g.id),
    db.prepare('INSERT INTO completions (commit_hash, event_title, xp, at) VALUES (?, ?, ?, ?)').bind(me, g.title, XP_PER_EVENT, now()),
  ]
  if (g.temp_torch_id) stmts.push(db.prepare('DELETE FROM torches WHERE id = ?').bind(g.temp_torch_id))
  await db.batch(stmts)
  const joins = (await db.prepare('SELECT COUNT(*) AS n FROM gathering_joins WHERE gathering_id = ?').bind(g.id).first<{ n: number }>())?.n ?? 0
  return c.json({ ok: true, memorize: { x: g.x, y: g.y, r: lightRadius(g.built_in + joins - 1) } })
})

/* ---------- 探知（4.5）：雙向、只在燈下、關掉即刪 ---------- */

app.post('/api/presence', async (c) => {
  const me = c.get('commit')
  if (!me) return bad(c, 'no-identity', 401)
  const b = await c.req.json<{ codename: string; x: number; y: number; lightId: string; badges: string[] }>()
  const db = c.env.DB
  const hist = (await db.prepare('SELECT DISTINCT event_title FROM completions WHERE commit_hash = ?').bind(me).all<{ event_title: string }>()).results.map((r) => r.event_title)
  await db.prepare('INSERT INTO presence (commit_hash, codename, x, y, light_id, since, badges, history, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(commit_hash) DO UPDATE SET codename = excluded.codename, x = excluded.x, y = excluded.y, light_id = excluded.light_id, since = CASE WHEN presence.light_id = excluded.light_id THEN presence.since ELSE excluded.since END, badges = excluded.badges, history = excluded.history, updated_at = excluded.updated_at')
    .bind(me, String(b.codename).slice(0, 24), Number(b.x), Number(b.y), String(b.lightId), now(), JSON.stringify(b.badges ?? []), JSON.stringify(hist), now())
    .run()
  const others = await db.prepare('SELECT commit_hash, codename, x, y, since, badges, history FROM presence WHERE light_id = ? AND commit_hash != ? AND updated_at > ?').bind(String(b.lightId), me, now() - 120_000).all<{ commit_hash: string; codename: string; x: number; y: number; since: number; badges: string; history: string }>()
  return c.json({
    strangers: others.results.map((r) => ({
      id: 'p_' + r.commit_hash.slice(0, 12),
      codename: r.codename,
      x: r.x,
      y: r.y,
      detectOn: true,
      since: r.since,
      tags: [],
      badges: JSON.parse(r.badges),
      history: JSON.parse(r.history),
    })),
  })
})

app.delete('/api/presence', async (c) => {
  const me = c.get('commit')
  if (me) await c.env.DB.prepare('DELETE FROM presence WHERE commit_hash = ?').bind(me).run()
  return c.json({ ok: true })
})

/* ---------- 店家 ---------- */

app.post('/api/merchant/register', async (c) => {
  const b = await c.req.json<{ name: string; email: string; password: string; invite: string }>()
  if (b.invite !== c.env.MERCHANT_INVITE_CODE) return bad(c, 'invite', 403)
  const email = String(b.email ?? '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || String(b.password ?? '').length < 8 || !String(b.name ?? '').trim()) return bad(c, 'invalid')
  const salt = randomToken(16)
  const id = uid('m_')
  try {
    await c.env.DB.prepare('INSERT INTO merchants (id, name, email, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, String(b.name).trim().slice(0, 40), email, await hashPassword(b.password, salt), salt, now()).run()
  } catch {
    return bad(c, 'exists', 409)
  }
  return c.json({ ok: true })
})

app.post('/api/merchant/login', async (c) => {
  const b = await c.req.json<{ email: string; password: string }>()
  const m = await c.env.DB.prepare('SELECT * FROM merchants WHERE email = ?').bind(String(b.email ?? '').trim().toLowerCase()).first<{ id: string; name: string; pass_hash: string; salt: string }>()
  if (!m || !(await verifyPassword(String(b.password ?? ''), m.salt, m.pass_hash))) return bad(c, 'credentials', 401)
  const token = randomToken()
  await c.env.DB.prepare('INSERT INTO sessions (token, merchant_id, expires_at) VALUES (?, ?, ?)').bind(token, m.id, now() + SESSION_TTL_MS).run()
  return c.json({ token, merchant: { id: m.id, name: m.name } })
})

app.use('/api/merchant/*', async (c, next) => {
  if (c.req.path.endsWith('/login') || c.req.path.endsWith('/register')) return next()
  if (!c.get('merchantId')) return bad(c, 'unauthorized', 401)
  await next()
})

app.get('/api/merchant/me', async (c) => {
  const m = await c.env.DB.prepare('SELECT id, name, email FROM merchants WHERE id = ?').bind(c.get('merchantId')).first()
  return c.json({ merchant: m })
})

app.post('/api/merchant/torches', async (c) => {
  const b = await c.req.json<{ name: string; x: number; y: number; baseR: number; burnHours: number | null }>()
  if (!inWorld(Number(b.x), Number(b.y))) return bad(c, 'out-of-world')
  const id = uid('t_')
  await c.env.DB.prepare('INSERT INTO torches (id, merchant_id, name, x, y, base_r, lit, burn_hours, lit_at, temporary, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, 0, ?)')
    .bind(id, c.get('merchantId'), String(b.name ?? '').trim().slice(0, 40) || 'Torch', Number(b.x), Number(b.y), Math.max(TORCH_MIN, Number(b.baseR) || TORCH_MIN), b.burnHours ?? null, now(), now())
    .run()
  return c.json({ ok: true, id })
})

app.patch('/api/merchant/torches/:id', async (c) => {
  const b = await c.req.json<{ lit?: boolean }>()
  const t = await c.env.DB.prepare('SELECT * FROM torches WHERE id = ? AND merchant_id = ?').bind(c.req.param('id'), c.get('merchantId')).first<TorchRow>()
  if (!t) return bad(c, 'not-found', 404)
  if (typeof b.lit === 'boolean' && b.lit !== !!t.lit) {
    await c.env.DB.prepare('UPDATE torches SET lit = ?, lit_at = ? WHERE id = ?').bind(b.lit ? 1 : 0, b.lit ? now() : null, t.id).run()
  }
  return c.json({ ok: true })
})

app.post('/api/merchant/supplies', async (c) => {
  const b = await c.req.json<{ torchId: string; x: number; y: number; label: string; rare: boolean; count: number; requirement: 'none' | 'reservation'; kind?: string }>()
  const t = await c.env.DB.prepare('SELECT id FROM torches WHERE id = ? AND merchant_id = ?').bind(b.torchId, c.get('merchantId')).first()
  if (!t) return bad(c, 'not-found', 404)
  if (!inWorld(Number(b.x), Number(b.y))) return bad(c, 'out-of-world')
  const count = Math.min(999, Math.max(1, Math.floor(Number(b.count) || 1)))
  const id = uid('s_')
  await c.env.DB.prepare('INSERT INTO supplies (id, torch_id, x, y, kind, label, rare, total, remaining, per_person, requirement, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)')
    .bind(id, b.torchId, Number(b.x), Number(b.y), b.kind ?? (b.rare ? 'rare' : 'discount'), String(b.label ?? '').trim().slice(0, 30) || '?', b.rare ? 1 : 0, count, count, b.requirement === 'reservation' ? 'reservation' : 'none', now())
    .run()
  return c.json({ ok: true, id })
})

app.post('/api/merchant/holdings', async (c) => {
  const b = await c.req.json<{ torchId: string; title: string; startAt: number; capacity: number; entry: string | null; tasks: { id: string; label: string; reward: string }[] }>()
  const t = await c.env.DB.prepare('SELECT id FROM torches WHERE id = ? AND merchant_id = ?').bind(b.torchId, c.get('merchantId')).first()
  if (!t) return bad(c, 'not-found', 404)
  const tasks = (Array.isArray(b.tasks) ? b.tasks : []).slice(0, 8).map((x, i) => ({ id: String(x.id || `t_${i}`), label: String(x.label ?? '').slice(0, 40), reward: String(x.reward ?? '').slice(0, 40) }))
  if (!tasks.length) tasks.push({ id: 't_checkin', label: '在門口感應報到', reward: '解鎖今晚的火把物資' })
  const id = uid('h_')
  await c.env.DB.prepare('INSERT INTO holdings (id, torch_id, title, start_at, capacity, entry, tasks, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, b.torchId, String(b.title ?? '').trim().slice(0, 40) || '?', Number(b.startAt) || now(), Math.max(1, Math.floor(Number(b.capacity) || 10)), b.entry ?? null, JSON.stringify(tasks), now())
    .run()
  return c.json({ ok: true, id })
})

/** 店家儀表板：全部是聚合數字（memo2 §7） */
app.get('/api/merchant/dashboard', async (c) => {
  const db = c.env.DB
  const mid = c.get('merchantId')
  const torches = (await db.prepare('SELECT * FROM torches WHERE merchant_id = ?').bind(mid).all<TorchRow>()).results.map(torchRow)
  const all = (await db.prepare('SELECT * FROM torches WHERE lit = 1').all<TorchRow>()).results.map(torchRow)
  for (const tr of torches) tr.eff = tr.lit ? effectiveTarget(tr.baseR, crowdOf(tr, all)) : tr.baseR
  const ids = torches.map((t) => t.id)
  const placeholders = ids.map(() => '?').join(',') || "''"
  const supplies = (await db.prepare(`SELECT * FROM supplies WHERE torch_id IN (${placeholders})`).bind(...ids).all<SupplyRow>()).results.map(supplyRow)
  const holdings = (await db.prepare(`SELECT * FROM holdings WHERE torch_id IN (${placeholders})`).bind(...ids).all<HoldingRow>()).results
  const hCount = new Map((await db.prepare('SELECT holding_id, COUNT(*) AS n FROM holding_joins GROUP BY holding_id').all<{ holding_id: string; n: number }>()).results.map((r) => [r.holding_id, r.n]))
  const gatherings = (await db.prepare("SELECT * FROM gatherings WHERE status IN ('pending','formed')").all<GatheringRow>()).results
  const gCount = new Map((await db.prepare('SELECT gathering_id, COUNT(*) AS n FROM gathering_joins GROUP BY gathering_id').all<{ gathering_id: string; n: number }>()).results.map((r) => [r.gathering_id, r.n]))
  const inCircle = gatherings
    .map((g) => ({ g, torch: torches.find((t) => t.lit && dist(t.x, t.y, g.x, g.y) <= t.eff) }))
    .filter((r) => r.torch)
    .map((r) => ({ torchId: r.torch!.id, torchName: r.torch!.name, startAt: r.g.start_at, status: r.g.status, people: r.g.built_in + (gCount.get(r.g.id) ?? 0) - 1 }))
  return c.json({
    torches,
    supplies,
    holdings: holdings.map((h) => holdingRow(h, hCount.get(h.id) ?? 0)),
    gatheringsInCircle: inCircle,
    pickups: supplies.reduce((a, s) => a + (s.total - s.remaining), 0),
    participants: holdings.reduce((a, h) => a + (hCount.get(h.id) ?? 0), 0),
  })
})

app.get('/api/health', (c) => c.json({ ok: true, now: now() }))
app.all('/api/*', (c) => c.json({ error: 'not-found' }, 404))

// 非 /api 的請求：靜態資產（run_worker_first 只涵蓋 /api/*，這裡是保險）
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default app
