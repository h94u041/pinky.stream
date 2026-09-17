/**
 * 伺服器端輸出的公開頁（給搜尋引擎與 AI 引用）：
 *   /torches/        店家火把列表
 *   /torch/:id       店家頁（LocalBusiness JSON-LD）
 *   /events/         活動列表
 *   /event/:id       活動頁（Event JSON-LD）
 *   /sitemap.xml     動態 sitemap（靜態頁 + 以上全部）
 * 只有店家端資料。樣式沿用 /site.css。
 */
import type { Context } from 'hono'
import type { Ctx } from './env'
import { esc, fmtTaipei, isoTaipei, loadPublic, SITE, type PublicHolding, type PublicTorch, type PublicWorld } from './public'

const NAV = `<nav class="site" aria-label="站內"><a href="/about/">是什麼</a><a href="/how-it-works/">怎麼運作</a><a href="/torches/">店家</a><a href="/events/">活動</a><a href="/faq/">常見問題</a><a href="/">打開地圖</a></nav>`
const FOOT = `<footer class="site"><p>Pinky · 台中 · 走到現場才看得到的匿名社交。</p><p><a href="/about/">是什麼</a> · <a href="/how-it-works/">怎麼運作</a> · <a href="/torches/">店家</a> · <a href="/events/">活動</a> · <a href="/faq/">常見問題</a> · <a href="/merchants/">給店家</a> · <a href="/llms.txt">llms.txt</a> · <a href="/mcp">MCP</a></p><p>地圖資料：臺中市里界（g0v/twgeojson，CC0）、台中捷運（© OpenStreetMap 貢獻者，ODbL）。</p></footer>`

function layout(o: { title: string; description: string; path: string; jsonld: unknown; body: string; kicker: string; h1: string; lede?: string; noindex?: boolean }) {
  const url = SITE + o.path
  return `<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}" />
<link rel="canonical" href="${url}" />
${o.noindex ? '<meta name="robots" content="noindex" />' : ''}
<meta property="og:type" content="website" /><meta property="og:site_name" content="Pinky" />
<meta property="og:title" content="${esc(o.title)}" /><meta property="og:description" content="${esc(o.description)}" />
<meta property="og:url" content="${url}" /><meta property="og:locale" content="zh_TW" /><meta name="twitter:card" content="summary" />
<meta name="theme-color" content="#0B0912" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700&family=DM+Mono:wght@400&family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/site.css" />
<script type="application/ld+json">${JSON.stringify(o.jsonld)}</script>
</head>
<body><div class="wrap">
<header class="top"><a class="brand" href="/"><span class="dot"></span>Pinky</a>${NAV}</header>
<main><p class="kicker">${esc(o.kicker)}</p><h1>${esc(o.h1)}</h1>${o.lede ? `<p class="lede">${o.lede}</p>` : ''}${o.body}</main>
${FOOT}
</div></body></html>`
}

const html = (c: Context<Ctx>, body: string, status = 200) =>
  c.body(body, status as 200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60' })

function torchCard(t: PublicTorch, w: PublicWorld) {
  const hs = w.holdings.filter((h) => h.torchId === t.id)
  return `<div class="card"><h3 style="margin-top:0"><a href="/torch/${t.id}">${esc(t.name)}</a> <span class="chip ${t.lit ? 'fire' : ''}">${t.lit ? `🔥 燃燒中 · ${t.effR} m` : '未點燈'}</span></h3>
<p class="meta">${t.lat}, ${t.lng}${hs.length ? ` · ${hs.length} 場活動` : ''}${t.hoursLeft !== null ? ` · 還能燒約 ${t.hoursLeft} 小時` : ''}</p></div>`
}

function holdingCard(h: PublicHolding) {
  return `<div class="card"><h3 style="margin-top:0"><a href="/event/${h.id}">${esc(h.title)}</a></h3>
<p class="meta"><span class="fire">${esc(h.torchName)}</span> · ${fmtTaipei(h.startAt)} · ${h.joined}/${h.capacity} 人${h.entry ? ` · 門檻 ${esc(h.entry)}` : ''}</p></div>`
}

export async function torchesPage(c: Context<Ctx>) {
  const w = await loadPublic(c.env.DB)
  const lit = w.torches.filter((t) => t.lit)
  const body = `<h2>燃燒中 · ${lit.length}</h2>${lit.map((t) => torchCard(t, w)).join('') || '<p class="haze">現在沒有火把在燒。</p>'}
<h2>未點燈</h2>${w.torches.filter((t) => !t.lit).map((t) => torchCard(t, w)).join('') || '<p class="haze">—</p>'}`
  return html(
    c,
    layout({
      title: '台中的 Pinky 店家火把｜現在誰在發光',
      description: `Pinky 地圖上目前有 ${lit.length} 支火把在台中燃燒。火把是店家點的光源，有效半徑 220–350 公尺，走進去才看得到店、活動與物資。`,
      path: '/torches/',
      kicker: 'Torches',
      h1: '店家火把',
      lede: `現在有 <strong class="fire">${lit.length}</strong> 支火把在台中燃燒。每一支都是一家願意讓陌生人走進來的店。`,
      jsonld: {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'Pinky 店家火把',
        numberOfItems: w.torches.length,
        itemListElement: w.torches.map((t, i) => ({ '@type': 'ListItem', position: i + 1, url: t.url, name: t.name })),
      },
      body,
    }),
  )
}

export async function torchPage(c: Context<Ctx>) {
  const w = await loadPublic(c.env.DB)
  const t = w.torches.find((x) => x.id === c.req.param('id'))
  if (!t) return html(c, layout({ title: '找不到這支火把｜Pinky', description: '', path: c.req.path, kicker: '404', h1: '找不到這支火把', jsonld: {}, body: '<p><a href="/torches/">看全部火把</a></p>', noindex: true }), 404)
  const hs = w.holdings.filter((h) => h.torchId === t.id)
  const ss = w.supplies.filter((s) => s.torchId === t.id)
  const body = `
<div class="table-wrap"><table><tbody>
<tr><th>狀態</th><td>${t.lit ? `<span class="fire">🔥 燃燒中</span>，有效半徑 ${t.effR} m（基礎 ${t.baseR} m）${t.hoursLeft !== null ? `，還能燒約 ${t.hoursLeft} 小時` : ''}` : '未點燈'}</td></tr>
<tr><th>位置</th><td class="mono">${t.lat}, ${t.lng} · <a href="https://www.google.com/maps?q=${t.lat},${t.lng}" rel="noopener">Google 地圖</a></td></tr>
</tbody></table></div>
<h2>活動</h2>${hs.map(holdingCard).join('') || '<p class="haze">目前沒有活動。</p>'}
<h2>物資</h2>${
    ss.length
      ? `<ul>${ss.map((s) => `<li><span class="${s.rare ? 'pinky' : 'zk'}">◆ ${esc(s.label)}</span> · 剩 ${s.remaining} 份${s.requirement === 'reservation' ? ' · 需已成立的虛擬預約' : ''}</li>`).join('')}</ul><p class="haze">走進 100 公尺內且在視野內自動撿取。</p>`
      : '<p class="haze">目前沒有物資。</p>'
  }
<div class="card promise">在 Pinky 你不需要註冊。打開地圖、走到這支火把的光圈裡，就看得到這裡活的東西。</div>
<p><a class="cta" href="/">打開地圖</a><a class="cta ghost" href="/torches/">全部火把</a></p>`
  return html(
    c,
    layout({
      title: `${t.name}｜Pinky 火把 · 台中`,
      description: `${t.name} 是 Pinky 地圖上的店家火把${t.lit ? `，目前燃燒中、有效半徑 ${t.effR} 公尺` : '，目前未點燈'}。${hs.length ? `活動：${hs.map((h) => h.title).join('、')}。` : ''}${ss.length ? `物資：${ss.map((s) => s.label).join('、')}。` : ''}`,
      path: `/torch/${t.id}`,
      kicker: 'Torch',
      h1: t.name,
      jsonld: {
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        '@id': t.url,
        name: t.name,
        url: t.url,
        geo: { '@type': 'GeoCoordinates', latitude: t.lat, longitude: t.lng },
        address: { '@type': 'PostalAddress', addressLocality: '臺中市', addressCountry: 'TW' },
        event: hs.map((h) => ({ '@type': 'Event', name: h.title, startDate: isoTaipei(h.startAt), url: h.url })),
        isPartOf: { '@id': `${SITE}/#site` },
      },
      body,
    }),
  )
}

export async function eventsPage(c: Context<Ctx>) {
  const w = await loadPublic(c.env.DB)
  const upcoming = w.holdings.filter((h) => h.startAt + 3 * 3_600_000 > w.now)
  return html(
    c,
    layout({
      title: '台中今晚的 Pinky 活動｜店家 Holding Group',
      description: `Pinky 上即將開始的店家活動 ${upcoming.length} 場。匿名報名、不留手機號，到場完成任務換火把資源。`,
      path: '/events/',
      kicker: 'Events',
      h1: '店家活動',
      lede: `即將開始 <strong class="pinky">${upcoming.length}</strong> 場。報名不需要註冊；到場才算數。`,
      jsonld: { '@context': 'https://schema.org', '@type': 'ItemList', name: 'Pinky 店家活動', itemListElement: upcoming.map((h, i) => ({ '@type': 'ListItem', position: i + 1, url: h.url, name: h.title })) },
      body: upcoming.map(holdingCard).join('') || '<p class="haze">目前沒有即將開始的活動。</p>',
    }),
  )
}

export async function eventPage(c: Context<Ctx>) {
  const w = await loadPublic(c.env.DB)
  const h = w.holdings.find((x) => x.id === c.req.param('id'))
  if (!h) return html(c, layout({ title: '找不到這場活動｜Pinky', description: '', path: c.req.path, kicker: '404', h1: '找不到這場活動', jsonld: {}, body: '<p><a href="/events/">看全部活動</a></p>', noindex: true }), 404)
  const ended = h.startAt + 3 * 3_600_000 < w.now
  const body = `
<div class="table-wrap"><table><tbody>
<tr><th>店家</th><td><a href="/torch/${h.torchId}">${esc(h.torchName)}</a></td></tr>
<tr><th>開始</th><td>${fmtTaipei(h.startAt)}（台北時間）${ended ? ' · 已結束' : ''}</td></tr>
<tr><th>名額</th><td>${h.joined} / ${h.capacity} 人</td></tr>
<tr><th>入場門檻</th><td>${h.entry ? `<span class="zk">${esc(h.entry)}</span>（零知識徽章，只證明符合、不揭露身分）` : '沒有'}</td></tr>
<tr><th>照明半徑</th><td>${h.lightR} m（隨人數變大，最大 375 m）</td></tr>
</tbody></table></div>
<h2>現場任務</h2><div class="table-wrap"><table><thead><tr><th>任務</th><th>完成獎勵</th></tr></thead><tbody>${h.tasks.map((t) => `<tr><td>${esc(t.label)}</td><td>${esc(t.reward)}</td></tr>`).join('')}</tbody></table></div>
<h2>怎麼參加</h2><ol><li>打開 <a href="/">Pinky 地圖</a>，不用註冊，裝置會給你一個代號。</li><li>走進 ${esc(h.torchName)} 的火把圈，點活動，按「我要去」。</li><li>到場完成任務。全部完成得到經驗值，這支火把的照明範圍永久進入你的記憶。</li><li>站在照明裡打開探知，看得到同一盞燈下也開著探知的人。</li></ol>
<div class="card promise">店家看得到報名人數，看不到你是誰。</div>
<p><a class="cta" href="/">打開地圖</a><a class="cta ghost" href="/events/">全部活動</a></p>`
  return html(
    c,
    layout({
      title: `${h.title}｜${h.torchName} · ${fmtTaipei(h.startAt)}｜Pinky`,
      description: `${h.torchName} 的活動「${h.title}」，${fmtTaipei(h.startAt)} 開始，${h.joined}/${h.capacity} 人${h.entry ? `，入場門檻 ${h.entry}` : ''}。在 Pinky 匿名報名，到場完成任務換火把資源。`,
      path: `/event/${h.id}`,
      kicker: 'Holding Group',
      h1: h.title,
      jsonld: {
        '@context': 'https://schema.org',
        '@type': 'Event',
        '@id': h.url,
        name: h.title,
        url: h.url,
        startDate: isoTaipei(h.startAt),
        endDate: isoTaipei(h.startAt + 3 * 3_600_000),
        eventStatus: ended ? 'https://schema.org/EventScheduled' : 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: { '@type': 'Place', name: h.torchName, geo: { '@type': 'GeoCoordinates', latitude: h.lat, longitude: h.lng }, address: { '@type': 'PostalAddress', addressLocality: '臺中市', addressCountry: 'TW' } },
        organizer: { '@type': 'LocalBusiness', '@id': `${SITE}/torch/${h.torchId}`, name: h.torchName },
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'TWD', availability: h.joined < h.capacity ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut', url: `${SITE}/` },
        maximumAttendeeCapacity: h.capacity,
        description: `入場門檻：${h.entry ?? '無'}。現場任務：${h.tasks.map((t) => t.label).join('、')}。`,
      },
      body,
    }),
  )
}

export async function sitemap(c: Context<Ctx>) {
  const w = await loadPublic(c.env.DB)
  const today = new Date().toISOString().slice(0, 10)
  const url = (loc: string, lastmod: string, freq: string, pri: string) => `<url><loc>${loc}</loc><lastmod>${lastmod}</lastmod><changefreq>${freq}</changefreq><priority>${pri}</priority></url>`
  const items = [
    url(`${SITE}/`, today, 'daily', '1.0'),
    url(`${SITE}/about/`, '2026-09-17', 'monthly', '0.9'),
    url(`${SITE}/how-it-works/`, '2026-09-17', 'monthly', '0.9'),
    url(`${SITE}/faq/`, '2026-09-17', 'monthly', '0.8'),
    url(`${SITE}/merchants/`, '2026-09-17', 'monthly', '0.8'),
    url(`${SITE}/torches/`, today, 'hourly', '0.8'),
    url(`${SITE}/events/`, today, 'hourly', '0.8'),
    ...w.torches.map((t) => url(t.url, today, 'daily', '0.7')),
    ...w.holdings.filter((h) => h.startAt + 3 * 3_600_000 > w.now).map((h) => url(h.url, today, 'daily', '0.7')),
  ]
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items.join('')}</urlset>`, 200, {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=600',
  })
}
