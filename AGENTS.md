# AGENTS.md — Teoswa-ex（实例）

本仓库是**实例**：「潮汕制霸」这一张图。它只含数据（`data/`）、产物（`dist/`，**入库**）与部署配置，**不含 Python 代码**——构建由引擎 [`map-ex`](../map-ex) 完成。

> 工作区级的通用规则（语言、沟通、git、两个仓库的关系）在上一级目录的 `AGENTS.md`；引擎的代码规范、技能手册与构建细节在 `../map-ex/`。

## 构建与校验（命令都跑引擎的脚本）

```bash
# 重建：引擎指向本实例
uv run --project ../map-ex python -X utf8 ../map-ex/build.py \
    --data ./data --out ./dist --fonts ./fonts

# 几何 / 文案 / 交互三项校验
uv run --project ../map-ex python -X utf8 ../map-ex/scripts/verify_map.py dist/map.svg
uv run --project ../map-ex python -X utf8 ../map-ex/scripts/check_ui_text.py --data ./data --fonts ./fonts
uv run --project ../map-ex python -X utf8 ../map-ex/scripts/check_interaction.py dist/index.html
```

- 远程版（引擎发布后）：`uvx --from map-ex==X.Y.Z map-ex build --data ./data --out ./dist --fonts ./fonts`——**版本号写死**，否则重建结果会随引擎升级而变。
- 视觉呈现不做自动化断言：在 `dist/` 里起任意 http 服务目检（`python -m http.server -d dist`）。
- 三项校验必须全绿才交付。

## 数据编辑约定

- 改几何直接编辑 `data/geojson/polygons/county/{区县}.geojson`，改完先烘焙合并图再构建：`python -X utf8 data/geojson/polygons/county/generate_merged_teoswa.py`。
- 改铁路源线或站点后按顺序跑（后两个要用引擎包，加 `uv run --with map-ex python -X utf8`）：`data/geojson/points/project_sites_to_railways.py --write` → `data/geojson/lines/railways/merge_railways.py`。
- 操作前若发现数据已有未提交的改动，那是用户在编辑器里的微调：信任它，完成后一并提交。
- 改完运行几何检查并汇报；无论有无错误都不再改文件，交由用户目视判断，等待下一轮命令。
- 一切批量、文本处理或易错逻辑先写成 Python 临时脚本（本仓库用 `tmp/`，gitignored）跑完即删；不在 shell 里做字符串批量替换。

## git 提交

- 用户不主动 commit；agent 完成一轮操作后自行 `git add -A` + commit，一并纳入用户未提交的手改，不询问、不丢弃用户改动。
- 本工作区有两个仓库：**一律带 `-C`**（`git -C Teoswa-ex …` / `git -C map-ex …`），别把引擎的改动提交进实例。
- `dist/` 是交付物，**入库**；构建产物变了就跟着提交。
