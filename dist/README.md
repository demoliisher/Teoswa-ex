# 交付目录（dist/）

本目录由引擎（`map-ex build`）生成，是**部署/交付单元**：

- `index.html`：页面外壳（地图 `map.svg` 由脚本运行时注入）；
- `map.svg`：地图资产（只装地图，投影参数随构建直接烧入）；
- `assets/legend.svg`：图例片段（构建生成）——图例只在控制面板与导出图里出现，故不进 `map.svg`；页面取回它造面板图例，导出 PNG 时把它拼进图里；
- `assets/`：样式、脚本、字体等静态资源（含构建生成的 `assets/data/rail-data.json`——铁路乘車區間表（每个区间带着它跨过的特例段开关）、腿表与「鐵路特例」表，属数据、不属图；页面启动时与 `map.svg`、`assets/legend.svg` 一起取回）；
- `LICENSE` / `THIRD-PARTY.md`：许可（代码 + 数据两部分）与署名（由构建自**实例**仓库根拷入）。

## 许可与署名

- **代码**：PolyForm Noncommercial 1.0.0（`LICENSE`）——`index.html` 外壳、`assets/` 下的 css/js。
- **数据与制图产物**：CC BY-NC-SA 4.0（`LICENSE` 第二部分）——`map.svg`、`assets/legend.svg`、`assets/data/rail-data.json`、页面文案与地名/铁路资料。
- **第三方内容**：见 `THIRD-PARTY.md`——字体（教育部標準楷書 / 教育部隸書，CC BY-ND，须署名「中華民國教育部」）、OpenStreetMap 衍生内容的 ODbL 署名义务（© OpenStreetMap contributors）。
- 转载、截图或再分发请保留署名：**潮汕制霸 Teoswa-ex — © 2026 demoliisher — CC BY-NC-SA 4.0**（数据）／ PolyForm Noncommercial 1.0.0（代码）。

要修改数据请改实例的 `data/`、改样式请改引擎的 `frontend/`，然后重新构建；**不要**直接手改本目录的产物文件（含上面的 `LICENSE` 与 `THIRD-PARTY.md`——它们由构建自实例仓库根拷入）。
