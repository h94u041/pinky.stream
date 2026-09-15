# Pinky

Vue 3 + TypeScript + Vite 前端專案，UI 庫是 Element Plus。套件管理用 npm。

- 程式碼在 `src/`，`@` 別名指向 `src/`。
- Element Plus 元件、Vue API（ref/computed/watch…）已透過 unplugin 自動匯入，不要手動 import；
  自動產生的 `src/auto-imports.d.ts`、`src/components.d.ts` 不要手改。
- 改完程式後執行 `npm run build`（含 vue-tsc 型別檢查），必須通過。
- 元件用 `<script setup lang="ts">`；文案用繁體中文。
