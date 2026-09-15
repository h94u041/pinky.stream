# Pinky

Python 3.12 專案，使用 [uv](https://docs.astral.sh/uv/) 管理環境與套件。

## 開始

```powershell
uv sync          # 建立 .venv 並安裝所有相依套件
uv run pinky     # 執行程式
uv run pytest    # 跑測試
uv run ruff check . && uv run ruff format .   # lint / 格式化
```

## 結構

```
src/pinky/   程式碼（套件名 pinky，進入點 pinky.main）
tests/       pytest 測試
```
