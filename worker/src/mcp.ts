/**
 * MCP 端點（/mcp，Streamable HTTP，無狀態）：讓 Claude / ChatGPT 等直接查 Pinky。
 * 只讀、只有店家端資料（火把、Holding Group、物資）。search / fetch 兩個工具是 ChatGPT connector 的必要條件。
 */
import { StreamableHTTPTransport } from '@hono/mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Context } from 'hono'
import { z } from 'zod'
import type { Ctx } from './env'
import { fmtTaipei, loadPublic, SITE, type PublicWorld } from './public'

const text = (obj: unknown) => ({ content: [{ type: 'text' as const, text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] })

function inDay(ts: number, day: 'today' | 'tomorrow' | undefined, now: number): boolean {
  if (!day) return true
  const d0 = new Date(now + 8 * 3_600_000)
  d0.setUTCHours(0, 0, 0, 0)
  const start = d0.getTime() - 8 * 3_600_000 + (day === 'tomorrow' ? 86_400_000 : 0)
  return ts >= start && ts < start + 86_400_000
}

function docFor(w: PublicWorld, id: string) {
  const t = w.torches.find((x) => x.id === id)
  if (t) {
    const hs = w.holdings.filter((h) => h.torchId === t.id)
    const ss = w.supplies.filter((s) => s.torchId === t.id)
    return {
      id: t.id,
      title: `${t.name}（Pinky 火把）`,
      url: t.url,
      text: [
        `${t.name} 是 Pinky 地圖上的店家火把，位置 ${t.lat}, ${t.lng}（台中）。`,
        t.lit ? `目前燃燒中，有效半徑 ${t.effR} 公尺${t.hoursLeft !== null ? `，還能燒約 ${t.hoursLeft} 小時` : ''}。` : '目前未點燈。',
        hs.length ? `活動：${hs.map((h) => `「${h.title}」${fmtTaipei(h.startAt)}，${h.joined}/${h.capacity} 人${h.entry ? `，入場門檻 ${h.entry}` : ''}`).join('；')}。` : '目前沒有活動。',
        ss.length ? `物資：${ss.map((s) => `${s.label}（剩 ${s.remaining} 份${s.requirement === 'reservation' ? '，需已成立的虛擬預約' : ''}）`).join('、')}。` : '目前沒有物資。',
      ].join('\n'),
      metadata: { type: 'torch', lit: t.lit, effR: t.effR, lat: t.lat, lng: t.lng },
    }
  }
  const h = w.holdings.find((x) => x.id === id)
  if (h) {
    return {
      id: h.id,
      title: `${h.title}（${h.torchName}）`,
      url: h.url,
      text: [
        `「${h.title}」是 ${h.torchName} 在 Pinky 發起的 Holding Group，${fmtTaipei(h.startAt)} 開始，名額 ${h.capacity} 人、已報名 ${h.joined} 人。`,
        h.entry ? `入場門檻：${h.entry}。` : '沒有入場門檻。',
        `現場任務：${h.tasks.map((x) => `${x.label} → ${x.reward}`).join('；')}。`,
        `活動照明半徑目前 ${h.lightR} 公尺；站在裡面才能開探知。報名不需要註冊，在 Pinky App 匿名報名。`,
      ].join('\n'),
      metadata: { type: 'holding', startAt: h.startAt, torchId: h.torchId, lat: h.lat, lng: h.lng },
    }
  }
  return null
}

function buildServer(db: D1Database) {
  const server = new McpServer({ name: 'pinky', version: '0.2.0' }, {
    instructions:
      'Pinky 是台中的戰爭迷霧地圖社交平台。這裡只能查店家端的公開資料：火把（店家光源）、Holding Group（店家活動）、物資（優惠）。' +
      '使用者自己開的攤、燈下的人、任何個人資料都查不到，也不要嘗試。描述時用 Pinky 的用語：火把、物資、探知、虛擬預約。網站：https://pinky.stream',
  })

  server.registerTool(
    'list_torches',
    {
      title: '列出火把',
      description: '目前在 Pinky 地圖上的店家火把：名稱、座標、是否燃燒中、有效半徑、還能燒多久。',
      inputSchema: { lit_only: z.boolean().optional().describe('只列燃燒中的（預設 true）') },
    },
    async ({ lit_only }) => {
      const w = await loadPublic(db)
      return text(w.torches.filter((t) => (lit_only ?? true ? t.lit : true)))
    },
  )

  server.registerTool(
    'list_holdings',
    {
      title: '列出店家活動（Holding Group）',
      description: '店家在 Pinky 發起的活動：標題、店家、開始時間、名額、已報名、入場門檻、現場任務。',
      inputSchema: { day: z.enum(['today', 'tomorrow']).optional().describe('只列今天或明天（台北時間）') },
    },
    async ({ day }) => {
      const w = await loadPublic(db)
      return text(w.holdings.filter((h) => inDay(h.startAt, day, w.now)).map((h) => ({ ...h, startAtText: fmtTaipei(h.startAt) })))
    },
  )

  server.registerTool(
    'list_supplies',
    {
      title: '列出物資',
      description: '某支火把附近的物資（優惠／道具）與剩餘份數。不給 torch_id 就列全部。',
      inputSchema: { torch_id: z.string().optional() },
    },
    async ({ torch_id }) => {
      const w = await loadPublic(db)
      return text(w.supplies.filter((s) => !torch_id || s.torchId === torch_id))
    },
  )

  server.registerTool(
    'search',
    {
      title: '搜尋',
      description: '用關鍵字搜尋 Pinky 的店家火把與活動。回傳 results: [{id, title, url}]，之後用 fetch 取得全文。',
      inputSchema: { query: z.string().describe('關鍵字，例如「爵士」「一中」「桌遊」') },
    },
    async ({ query }) => {
      const w = await loadPublic(db)
      const q = query.trim().toLowerCase()
      const results: { id: string; title: string; url: string }[] = []
      for (const t of w.torches) if (!q || t.name.toLowerCase().includes(q)) results.push({ id: t.id, title: `${t.name}（火把）`, url: t.url })
      for (const h of w.holdings) if (!q || h.title.toLowerCase().includes(q) || h.torchName.toLowerCase().includes(q)) results.push({ id: h.id, title: `${h.title}（${h.torchName}）`, url: h.url })
      return text({ results: results.slice(0, 20) })
    },
  )

  server.registerTool(
    'fetch',
    {
      title: '取得全文',
      description: '用 search 回傳的 id 取得該火把或活動的完整說明。',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const w = await loadPublic(db)
      const doc = docFor(w, id)
      if (!doc) return { ...text({ error: 'not-found', id }), isError: true }
      return text(doc)
    },
  )

  server.registerResource('about', `${SITE}/llms.txt`, { title: 'Pinky 是什麼', description: '站點摘要與用語指引', mimeType: 'text/plain' }, async () => ({
    contents: [{ uri: `${SITE}/llms.txt`, mimeType: 'text/plain', text: '請直接讀取 https://pinky.stream/llms.txt 與 https://pinky.stream/llms-full.txt' }],
  }))

  return server
}

export async function handleMcp(c: Context<Ctx>): Promise<Response> {
  const server = buildServer(c.env.DB)
  const transport = new StreamableHTTPTransport({ sessionIdGenerator: undefined })
  await server.connect(transport)
  const res = await transport.handleRequest(c)
  return res ?? c.json({ error: 'mcp' }, 500)
}
