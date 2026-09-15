# Pinky

真實的城市地圖預設蓋著戰爭迷霧；店家點火把、投物資，任何人貼一個 Google 地圖連結就能開一攤。
互動原型，Vue 3 + TypeScript + Vite，UI 使用 [Element Plus](https://element-plus.org/zh-TW/)。
產品規格與設計語言見 [memo.md](memo.md)。

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

目前內建的是示意底圖（`npm run map:placeholder` 產生）。要換成台中市真實里界與捷運：

```powershell
node scripts/build-map-data.mjs <台中里界.geojson> [捷運.geojson]
```

會輸出 `src/data/map.json`，畫面自動改用。

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
