# Pinky

Vue 3 + TypeScript + Vite 前端專案，UI 庫是 Element Plus。套件管理用 npm。

- **產品規格在 `memo.md`**。要動機制先讀第 4 節；memo 內互相矛盾處與我採用的解讀，記在 memo 最底部的「開發記事區」。
- **memo.md 只能改「開發記事區」**（兩條 `-----` 分隔線之間）；其他區域是使用者的規格，不可擅動。有異動、新增、要溝通的事都寫進開發記事區。
- 程式碼在 `src/`，`@` 別名指向 `src/`：
  - `src/world/rules.ts` 規則常數（memo §4／§10 的數字）、`torch.ts` 火把公式、`store.ts` 世界狀態（參與者端與店家後台共用）、`seed.ts` 示範資料
  - `src/map/renderer.ts` 迷霧地圖 canvas 繪製、`src/data/map.json` 圖資（`scripts/` 產生）
  - `src/views/` 兩個入口（參與者 `/`、店家後台 `/console`）、`src/components/` 元件、`src/i18n/` 繁中／英文
- Element Plus 元件、Vue API（ref/computed/watch…）已透過 unplugin 自動匯入，不要手動 import；
  自動產生的 `src/auto-imports.d.ts`、`src/components.d.ts` 不要手改。
- 改完程式後執行 `npm test`（vitest）與 `npm run build`（含 vue-tsc 型別檢查），兩者都要通過。
- 元件用 `<script setup lang="ts">`；所有文案走 i18n（`src/i18n/zh-TW.ts` 為主、`en.ts` 同步），不要在程式裡寫死字串。
- 畫面一律照 memo §9 設計語言（單一深色主題、色票語意：暖橘＝地方、冷白／淡紫＝人、粉＝品牌、青＝物資／ZK）。
- 四條不能默默拿掉的承諾（memo §10）：探知雙向、走出光圈自動關探知、虛擬預約湊不到人自己消失並告知「沒有人白跑一趟」、火把有效半徑永遠 ≥ 200 m。
