# 数据目录 `data/` — 潮汕实例

本目录是**潮汕制霸（Teoswa-ex）**这一实例的源数据与配置。通用的 schema、配置键与目录约定见引擎的 [`docs/data-contract.md`](https://github.com/demoliisher/map-ex/blob/main/docs/data-contract.md)——本文只讲本实例自己的东西。

> **许可**：本目录下的 GeoJSON 与 `config.json` 采用 CC BY-NC-SA 4.0（见仓库根 `LICENSE`）；其中区县边界、海岸线与水系是在 OpenStreetMap 数据上人工描制的产物，另受 ODbL 1.0 约束（署名 © OpenStreetMap contributors），第三方义务统一记在 `THIRD-PARTY.md`。页面代码（`dist/assets/`）来自引擎，为 PolyForm Noncommercial 1.0.0。

## 本实例的数据

- `config.json` —— 唯一配置（`svg` 图内 + `html` 页面）。
- `geojson/polygons/county/` —— 17 个可点单位，一县一文件；`excluded/东山.geojson` 是暂时不纳入的备选（构建不读）。
- `geojson/polygons/merged_teoswa.geojson` —— 由县文件烘焙的合并地图（构建只读它）。
- `geojson/lines/inland_rivers.geojson` —— 内河合并版；`geojson/lines/rivers/` 是按水系分组的分段源数据（供 `river-join` 逐段编辑，构建不读）。
- `geojson/lines/railways.geojson` —— 三条客运铁路的合并版；`geojson/lines/railways/{线名}.geojson` 是源线，**站序 `properties.stations` 只写在源文件里**。
- `geojson/points/transports.json` —— 客运枢纽点（三市全部客运火车站 + 揭阳潮汕国际机场，外加厦深铁路福建段的诏安站），`properties = {name, type, city, county, sites[]}`；`sites[]` 是悬停卡片显示的条目（`type`、`name`、`platforms?`、`tracks?`、`note?`）。「揭阳潮汕国际机场」与「揭阳机场站」相距仅数像素，按约定合并为单点，故该点有两项 `sites`。
- `icons/` —— 机场与车站的图标 SVG。

### 三市的取舍

- 主体是潮汕三市（汕头、潮州、揭阳）15 个区县；另纳入 2 个今属他市的单位（`outer`，灰底虚边）：**三甲**（汕尾陆丰）与**诏安**（福建漳州）——它们与潮汕地缘相接，纳入后地图不缺一角。
- 地名一律用短名（省略「（县级）市/区/县」），标签字号上限 35，只有大县用 35。
- 面向外海的区县（潮阳、潮南、澄海、饶平、惠来、诏安、三甲）海侧弧为人工描制精确岸线；饶平用 `MultiPolygon` 补齐海岛（海山南北岛、汛洲岛、西澳岛等），南澳为纯海岛县。
- 以河流为界的县界已挪移上岸（沿一侧河岸行进），入海口挖空、把水域交给背景染色；相邻区县在接缝处共用同一组边界顶点。

## 数据来源

本仓库所有区县轮廓均为**人工描制（「硬核手搓」）**产物：在 [geojson.io](https://geojson.io/) 的 OSM 图层上逐点描出（水系另叠加卫星图核对），对相邻区县逐一复核共享边界。

- 铁路线数据参考自[《中国铁路地图》](https://cnrail.geogv.org/)；站序与共点/共弧整理后的线形见 `geojson/lines/railways/`。
- 客运站点坐标初版来自[维基数据](https://www.wikidata.org/)，经正交投影插入铁路线（`geojson/points/project_sites_to_railways.py`）。
- 两个字体（教育部標準楷書 / 教育部隸書）来自[中華民國教育部](https://language.moe.gov.tw/)，以子集形式交付并自动加载。

## 维护约定

- 改几何直接编辑 `county/` 对应区县文件，改完重跑 `polygons/county/generate_merged_teoswa.py` 烘焙合并图再构建；海侧弧精修按 `shared-edge-splice` 的「线对环」教程。
- 改铁路源线或站点后**按顺序**重跑：`points/project_sites_to_railways.py --write` → `lines/railways/merge_railways.py`。
- 改站点或铁路后合并版不手改；`transports.json` 的坐标已是线上共点，不要再手工微调。
- 构建与校验命令见仓库根 `AGENTS.md`；契约与配置键见引擎的 `docs/data-contract.md`。
