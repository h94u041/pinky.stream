# Pinky 上線步驟：Cloudflare 託管 + 後端 + MCP + GEO

> 給專案擁有者照著做的清單。標「**你做**」的步驟需要你本人（登入、付款、按授權）；標「**AI 做**」的是程式碼與指令，可以交給 Claude。
> 預估費用：網域約 NT$ 330／年，其他在有真實流量之前都是 $0。

---

## 階段 0 · 準備（約 20 分鐘）

| # | 步驟 | 誰 |
|---|---|---|
| 0.1 | 註冊 [GitHub](https://github.com/signup)（已有就跳過） | 你做 |
| 0.2 | 註冊 [Cloudflare](https://dash.cloudflare.com/sign-up)，選 **Free** 方案 | 你做 |
| 0.3 | 安裝 GitHub CLI：`winget install GitHub.cli`，重開終端機後 `gh auth login`（選 GitHub.com → HTTPS → 用瀏覽器登入） | 你做 |
| 0.4 | 決定網域名稱（例如 `pinky.tw`、`pinky.app`）。先到 Cloudflare 左側 **Domain Registration → Register Domains** 查有沒有人用、多少錢 | 你做 |

---

> **2026-09-18 更新：已上線。** 網域 `pinky.stream`，用 wrangler 直接上傳（不經 GitHub）。之後每次更新只要 `npm run deploy`。階段 1–2 的 GitHub / Pages 連結流程改為選配（想要 push 自動部署再做）。設定檔在 `wrangler.jsonc`。

## 階段 1 · 程式碼推上 GitHub（選配）

```powershell
cd C:\Users\h94u0\Documents\Pinky
git branch -M main                                   # 把 master 改名為 main
gh repo create Pinky --private --source . --push     # 建私有 repo 並推上去
```

完成後 `gh repo view --web` 會開瀏覽器確認。
之後每次改完程式：`git add -A; git commit -m "..."; git push`，Cloudflare 就會自動重新部署。

> 沒裝 gh 的替代做法：在 github.com 按 New repository 建空 repo（不要勾 README），然後
> `git remote add origin https://github.com/<帳號>/Pinky.git` → `git push -u origin main`。

---

## 階段 2 · 前端上線到 Cloudflare Pages（約 15 分鐘）

**2.1 連結 repo（你做）**
1. Cloudflare 儀表板 → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. 授權 Cloudflare 存取 GitHub，選 `Pinky` repo
3. 設定：
   - Framework preset：**Vue** 或 **Vite**
   - Build command：`npm run build`
   - Build output directory：`dist`
   - Environment variables → 新增 `NODE_VERSION` = `24`
4. **Save and Deploy**。一兩分鐘後拿到 `pinky-xxx.pages.dev`，打開確認地圖有出來。

**2.2 綁網域（你做）**
1. Domain Registration → Register Domains → 買下 0.4 決定的網域（Cloudflare 賣成本價，.tw 約 NT$ 330／年、.com 約 US$ 10／年）
2. 回到 Pages 專案 → **Custom domains** → **Set up a custom domain** → 輸入網域 → 它會自動加 DNS 紀錄
3. 等 SSL 憑證簽好（通常 5 分鐘內），`https://你的網域` 就能開

**2.3 打開 AI 爬蟲（你做，GEO 關鍵）**
Cloudflare 對新網域**預設封鎖 AI 爬蟲**，不關掉的話 ChatGPT／Perplexity 永遠進不來。
1. 儀表板 → 選你的網域 → **AI Crawl Control**（舊版在 Security → Bots → Block AI bots）
2. 把 GPTBot、OAI-SearchBot、ClaudeBot、Claude-SearchBot、PerplexityBot、Google-Extended、Bingbot 全部設為 **Allow**
3. 「Block AI bots」總開關設為 **Off**

**2.4 分析（選配，你做）**
網域 → **Web Analytics** → Enable。免費、不用 cookie、不用改程式。

---

## 階段 3 · 後端：Workers + D1（AI 做，需要你按幾次授權）

沒有這一步，每個人看到的都是自己瀏覽器裡的示範世界；A 開的攤 B 看不到。

**3.1 建立 Worker 專案（AI 做）**
- repo 內新增 `worker/`（Hono + TypeScript），用 `wrangler` 管理
- `npx wrangler login`（**你做**：瀏覽器跳出來按 Allow）
- `npx wrangler d1 create pinky`（建免費 SQLite 資料庫）

**3.2 資料表（AI 做）**
```
torches      店家火把：id, name, lat, lng, base_r, lit, burn_hours, lit_at, owner_id
holdings     Holding Group：id, torch_id, title, start_at, capacity, joined, entry
supplies     物資：id, torch_id, lat, lng, label, kind, rare, total, remaining, requirement
gatherings   自發聚集：id, host_commit, title, place, lat, lng, start_at, need, cap, status
joins        誰加入了哪一攤：gathering_id, commit, suffix     ← 只存承諾值，不存身分
merchants    店家帳號：id, name, email, password_hash
```
memo2 §7 的隱私承諾在這裡落地：`joins` 只有承諾值；`gatherings` 對店家 API 只回傳時間與人數。

**3.3 API（AI 做）**
```
GET  /api/world                 火把、Holding Group、物資（公開）
GET  /api/gatherings?bbox=      視野內的攤（公開，不含誰加入）
POST /api/gatherings            開攤（帶承諾值）
POST /api/gatherings/:id/join   加入 → 回密語 + 附加號碼
POST /api/merchant/login        店家登入
POST /api/merchant/torches      點燈／熄滅／投放
```
前端 `src/world/store.ts` 改成打這些 API，身分（金鑰、記憶）仍留在裝置本機。

**3.4 部署（AI 做）**
- `npx wrangler deploy` → `pinky-api.<你的帳號>.workers.dev`
- Worker → Settings → Domains & Routes → 加 `api.你的網域`（**你做**：按一下 Add）
- 前端環境變數 `VITE_API_BASE=https://api.你的網域`，重新部署 Pages

**3.5 費用**
Workers 免費 10 萬請求／天、D1 免費 5 GB + 每日 500 萬讀取。超過再升 Workers Paid US$ 5／月。

---

## 階段 4 · MCP server（AI 做，約半天）

讓 Claude／ChatGPT 能直接「查 Pinky」。跑在同一個 Worker 上，不另外花錢。

**4.1 實作（AI 做）**
- 用 Cloudflare **Agents SDK**（`npm i agents @modelcontextprotocol/sdk`），`class PinkyMCP extends McpAgent`
- 端點：`https://api.你的網域/mcp`（Streamable HTTP）與 `/sse`（舊客戶端相容）
- 工具（**只讀、只有店家端資料**，這是隱私界線）：

| 工具 | 用途 |
|---|---|
| `list_torches(area?)` | 現在燃燒中的火把：店名、位置、有效半徑、還能燒多久 |
| `list_holdings(date?, area?)` | Holding Group：標題、時間、名額、入場門檻 |
| `list_supplies(torch_id)` | 某火把的物資與剩餘份數 |
| `search(query)` / `fetch(id)` | ChatGPT connector **強制**要有這兩個名稱的工具才能上架 |

自發聚集、燈下的人、承諾值、任何個人資料**一律不進 MCP**。

**4.2 測試（AI 做）**
`npx @modelcontextprotocol/inspector` → 連 `https://api.你的網域/mcp` → 逐一呼叫工具。

**4.3 掛到 AI 平台（你做）**
- **Claude**：claude.ai → Settings → Connectors → **Add custom connector** → 貼 `/mcp` 網址
- **ChatGPT**：Settings → Connectors → Advanced → Developer mode → Add → 貼網址（目前需 Plus／Pro）
- **上架目錄**（讓不認識你的人也能裝）：OpenAI Apps 提交、Anthropic Connector Directory 申請、[Smithery](https://smithery.ai) / [mcp.so](https://mcp.so) / [PulseMCP](https://www.pulsemcp.com) 登錄

---

## 階段 5 · GEO：讓 AI 搜尋引擎找到並引用（AI 做 + 你提交）

現在的 App 對爬蟲來說是一片黑的 canvas。分數來自**可爬的公開內容頁**。

**5.1 公開內容頁（AI 做）**
由 Worker 直接輸出真正的 HTML（不是 SPA）：
```
/                         首頁：一句話 + 今晚台中有 N 支火把、M 場活動（每小時更新）
/torch/<店家slug>          店家頁：名稱、地址、營業時段、目前活動、物資
/event/<id>               活動頁：時間、地點、名額、入場門檻、怎麼參加
/about、/how-it-works      機制說明（迷霧、火把、探知、零知識）——AI 最愛引用這種「解釋型」內容
/faq                      問答形式，一題一段
```
每頁：`<title>`、`<meta description>`、Open Graph、`<link rel=canonical>`。

**5.2 結構化資料（AI 做）**
- 活動頁：JSON-LD `Event`（name、startDate、location、offers、organizer）
- 店家頁：JSON-LD `LocalBusiness`（name、address、geo、openingHours）
- FAQ 頁：JSON-LD `FAQPage`
- 首頁：`Organization` + `WebSite`

**5.3 給爬蟲的檔案（AI 做）**
```
/robots.txt        允許 GPTBot, OAI-SearchBot, ClaudeBot, Claude-SearchBot,
                   PerplexityBot, Google-Extended, Googlebot, Bingbot；
                   Disallow: /api/, /#/（App 本體）
/sitemap.xml       從 D1 動態產生，含所有店家頁與未來 7 天的活動頁
/llms.txt          給 LLM 看的站點摘要：Pinky 是什麼、主要頁面、MCP 端點
/llms-full.txt     機制說明全文（memo2 §1–4 改寫成公開版）
```

**5.4 提交索引（你做）**
1. [Google Search Console](https://search.google.com/search-console) → 新增網域 → 提交 sitemap
2. [Bing Webmaster Tools](https://www.bing.com/webmasters) → 新增網域 → 提交 sitemap（**Bing 供應 ChatGPT search 和 Copilot**，這個比 Google 更關鍵）
3. 在 Bing Webmaster 開 **IndexNow**，之後每新增一個活動頁 Worker 自動 ping（AI 做）

**5.5 驗證分數（你做，上線後 2–4 週）**
- 到 ChatGPT（開搜尋）、Perplexity、Claude 問：「台中今晚有什麼匿名交友活動」「Pinky 火把是什麼」，看有沒有引用你的網址
- Bing Webmaster → **Search Performance** 看 AI 相關來源
- 免費檢查工具：Google Rich Results Test（驗 JSON-LD）、`curl -A "GPTBot" https://你的網域/` 確認沒被擋

**5.6 內容才是分數來源**
上面都是基礎建設。真正拉分的是：每個店家頁有獨特的文字（不是模板）、活動頁有明確的時間地點、機制說明頁寫得比競品清楚。這部分需要你或店家持續提供內容。

---

## 階段 6 · 真機上線前必做

| # | 項目 | 誰 |
|---|---|---|
| 6.1 | 接 GPS：`navigator.geolocation.watchPosition`，取代點地圖走路；保留原型走路當「模擬模式」 | AI 做 |
| 6.2 | PWA：`manifest.json` + service worker，讓手機可「加到主畫面」全螢幕 | AI 做 |
| 6.3 | 光圈邊界 hysteresis（memo2 9.10），不然探知會在邊緣一直開開關關 | AI 做 |
| 6.4 | 服務條款、隱私政策頁（memo2 §7 改寫成對外版本；主辦買單「不經手金流」要寫進去） | 你做初稿，AI 排版 |
| 6.5 | 檢舉入口（memo2 9.14）——上線給陌生人用之前至少要有一個 email 或表單 | 你決定形式 |

---

## 費用總覽

| 項目 | 免費額度 | 超過後 |
|---|---|---|
| Cloudflare Pages（前端） | 無限流量、每月 500 次 build | — |
| Workers（API + MCP + 公開頁） | 10 萬請求／天 | US$ 5／月（1,000 萬請求） |
| D1（資料庫） | 5 GB、500 萬讀／天 | 極低 |
| Web Analytics | 免費 | — |
| 網域 | — | .tw 約 NT$ 330／年、.com 約 US$ 10／年 |
| GitHub 私有 repo | 免費 | — |

**上線第一年預估：只有網域費。**

---

## 順序與時程

```
階段 0–2   今天：註冊、推 GitHub、Pages 上線、關 AI 封鎖        ← 半天，大部分你做
階段 3     後端 + D1                                             ← 2–3 天 AI 做
階段 4     MCP                                                   ← 半天 AI 做
階段 5     公開頁 + JSON-LD + sitemap + llms.txt，提交 Google/Bing ← 1–2 天 AI 做，提交你做
階段 6     GPS、PWA、條款、檢舉                                  ← 真機測試前
```

階段 0–2 做完就有一個可以分享的網址；階段 3 做完才是「真的多人」。

---

## 附錄 · 已產出的靜態 SEO/GEO 內容（2026-09-17）

放在 `public/`，build 後原樣進 `dist/`，Pages 上線即生效：

| 路徑 | 內容 | 結構化資料 |
|---|---|---|
| `/about/` | Pinky 是什麼：問題、賭注、三個反向設計、匿名的定位、隱私承諾 | Organization、WebSite、AboutPage、BreadcrumbList |
| `/how-it-works/` | 完整機制與所有數字、公式 | TechArticle |
| `/faq/` | 16 題問答 | FAQPage（AI 搜尋最常直接引用） |
| `/merchants/` | 給店家 | WebPage、Service |
| `/` | App 本體，已加 meta、JSON-LD（WebApplication）、`<noscript>` 摘要 | Organization、WebSite、WebApplication |
| `/robots.txt` | 放行所有主流 AI 爬蟲，擋 `/api/` | — |
| `/sitemap.xml` | 靜態版（上後端後改動態） | — |
| `/llms.txt`、`/llms-full.txt` | 給 LLM 的站點摘要與全文 | — |

**綁好網域後要做一件事**：把所有檔案裡的 `https://pinky.stream` 換成正式網址（一行指令）：

```powershell
Get-ChildItem index.html, public -Recurse -File -Include *.html,*.txt,*.xml | ForEach-Object { (Get-Content $_ -Raw) -replace 'https://pinky\.example', 'https://你的網域' | Set-Content $_ -Encoding utf8 -NoNewline }
```
