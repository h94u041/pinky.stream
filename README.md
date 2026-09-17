# Pinky

真實的城市地圖預設蓋著戰爭迷霧；店家點火把、投物資，任何人貼一個 Google 地圖連結就能開一攤。
互動原型，Vue 3 + TypeScript + Vite，UI 使用 [Element Plus](https://element-plus.org/zh-TW/)。
產品規格與設計語言見 [memo2.md](memo2.md)（[memo.md](memo.md) 是原始版）。

## 開始

```powershell
npm install      # 第一次或 package.json 有變動時
npm run dev      # 開發伺服器 http://localhost:5173/
npm test         # 單元測試（vitest）
npm run build    # 型別檢查 + 打包到 dist/
```

- `/` 參與者端（手機框）
- `/#/console` 店家後台（桌機）

## 圖資

內建 `src/data/map.json` 是真實圖資：台中市里界（[g0v/twgeojson](https://github.com/g0v/twgeojson) twVillage1982，CC0，只取世界範圍內 312 個里）＋ 台中捷運綠線 18 站（OpenStreetMap relation 11330355，ODbL，已轉成 `data-src/taichung_mrt.geojson`）。

重建（里界 GeoJSON 太大不進 repo，從 g0v 下載）：

```powershell
node scripts/build-map-data.mjs <twVillage1982.geo.json> data-src/taichung_mrt.geojson
```

沒有圖資時可用 `npm run map:placeholder` 產生示意底圖。

## 結構

```
src/
  world/     規則常數、火把公式、世界狀態、Google 連結解析、示範資料
  map/       迷霧地圖 canvas 繪製、圖資載入
  views/     ParticipantView（參與者）、ConsoleView（店家後台）
  components/ 事件 sheet、探知面板、發起一攤、背包、身分…
  i18n/      zh-TW / en
  styles/    設計語言（色票、字體、Element Plus 深色變數）
scripts/     圖資轉換
tests/       vitest
```
