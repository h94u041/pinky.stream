# Pinky

Python 3.12 專案，用 uv 管理。所有指令都透過 `uv run` 執行，不要直接呼叫 python/pip。

- 程式碼在 `src/pinky/`，測試在 `tests/`（pytest）。
- 改完程式後執行 `uv run pytest` 與 `uv run ruff check .`，兩者都要通過。
- 新增相依套件用 `uv add <pkg>`，開發用工具用 `uv add --dev <pkg>`。
