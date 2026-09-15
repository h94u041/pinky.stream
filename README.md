# Pinky

Vue 3 + TypeScript + Vite，UI 使用 [Element Plus](https://element-plus.org/zh-TW/)。

## 開始

```powershell
npm install      # 第一次或 package.json 有變動時
npm run dev      # 開發伺服器，預設 http://localhost:5173
npm run build    # 型別檢查 + 打包到 dist/
npm run preview  # 預覽打包結果
```

## 結構

```
src/
  main.ts        進入點，註冊 Element Plus 圖示
  App.vue        根元件
  components/    自訂元件
  style.css      全域樣式
vite.config.ts   Element Plus 元件/API 自動匯入設定、`@` 指向 src/
```

Element Plus 的元件（`<el-button>` 等）與 Vue API（`ref`、`computed` 等）都已設定自動匯入，
不需要手動 import；圖示直接用元件名，例如 `<el-icon><User /></el-icon>`。
