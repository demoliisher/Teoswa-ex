# THIRD-PARTY.md — 第三方内容与来源声明（潮汕实例）

## 许可总览

本仓库**限商业使用**。具法律效力的是 `LICENSE` 一份全文（内含代码与数据两部分），下表只是索引；商业使用（以本仓库数据或产物提供收费服务、集成进商业产品等）请联系 <https://github.com/demoliisher/Teoswa-ex/issues>。

| 部分 | 覆盖对象 | 许可 | 义务 |
| :--- | :--- | :--- | :--- |
| 数据与制图产物 | `data/` 下的 GeoJSON 与 `config.json`、`fonts/`、`dist/` 产物、`cover.png`、导出的 PNG | **CC BY-NC-SA 4.0**（[`LICENSE`](LICENSE) 第二部分） | 署名 + **非商业** + 衍生作品同协议共享 |
| 交付物中的引擎代码 | `dist/index.html` 外壳、`dist/assets/css/app.css`、`dist/assets/js/app.js`（由引擎 [map-ex](https://github.com/demoliisher/map-ex) 生成） | **PolyForm Noncommercial 1.0.0**（[`LICENSE`](LICENSE) 第一部分） | 署名 + 随附协议全文 + **不得商用** |
| OSM 衍生几何 | `data/geojson/polygons/county/*`、`polygons/merged_teoswa.geojson`、`lines/rivers/*`、`lines/inland_rivers.geojson` | **ODbL 1.0**（见下节） | 署名 `© OpenStreetMap contributors` + 该数据库以 ODbL 共享（**不得叠 NC**） |
| 字体子集 | `fonts/*.woff2`、`dist/assets/fonts/*` | **CC BY-ND**（见下节） | 署名「中華民國教育部」+ 不得改作（该许可本身允许商用） |

本文件其余部分列出**不在**上述许可覆盖之内、或另有署名义务的第三方内容。

## 字体：教育部標準楷書 / 教育部隸書

- **来源与授权**：中华民国教育部「[國字標準字體字型檔](https://language.moe.gov.tw/material/info?m=9fe3fe82-8bbf-44c0-961d-873ea079e284)」，以「創用 CC 姓名標示-禁止改作」（CC BY-ND，台湾版）授权；官方要求引用时标示「中華民國教育部」。
- **本仓库的用法**：`fonts/kai-tc.woff2`（楷书，地名标签）与 `li-tc.woff2`（隶书，标题/图例等文案）由引擎的 `map_ex.web.fonts` 从本机安装的 `教育部標準楷書.ttf` / `教育部隸書.ttf` **子集化**得到——只保留页面用字集（TTF → WOFF2 格式转换 + 字集裁剪），**未改动任何字形设计**；子集产物入库，构建不依赖源字体。
- **注意（禁止改作条款）**：字集裁剪与格式转换是否构成「改作」，在不同法域存在解释空间；本仓库视其为网页传输所需的技术性处理。你若继续分发 `dist/`（内含这两个字体子集），请保留本条署名；若有顾虑，删去两个 `.woff2` 即可——页面会沿回退字体链（本机书法体/衬线体）显示，地理、交互与打分功能不受影响。
- **其他用法**：MOE 页面写明 CC 授权可作商业使用（前提是遵守姓名标示-禁止改作）；如需其他使用方式，须以书面方式向教育部终身教育司申请。

## OpenStreetMap 与 geojson.io

- **本仓库的 OSM 衍生内容**：区县边界、海岸线与水系是在 [geojson.io](https://geojson.io/) 的 OSM 图层上人工逐点描制（水系另叠卫星影像核对）的产物；个别站点坐标直接取自 OSM 节点，例如诏安站取自 [OSM node 2990496476](https://www.openstreetmap.org/node/2990496476)。
- **署名义务**：OSM 数据以 [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) 提供，署名为 **© OpenStreetMap contributors**。若上述描制结果被认定为 OSM 的**衍生数据库**，则该部分仍受 ODbL 的「相同方式共享」约束，**不能仅以本仓库的 CC BY-NC-SA 4.0 再许可**（ODbL 不允许附加非商业性限制）；本仓库的做法是对这部分内容同时保留 ODbL 的署名与义务，其余原创数据以 CC BY-NC-SA 4.0 授权。
- geojson.io 只是编辑工具，不对其图层数据主张权利；本仓库也不含任何从 OSM 批量导出的原始数据文件。

## 铁路与站点资料

- **事实性资料**参考 [中国铁路网](https://tool.huiruisoft.com/)（如诏安站 2 台 5 线、厦深铁路福建段最后一站）——站台数、线路走向等事实本身不构成受版权保护的表达，此处仅作来源致谢。
- **玩法与命名惯例**致敬 [中国制霸生成器 @itorr](https://github.com/itorr/china-ex)、[大湾区制霸生成器 @yusancky](https://github.com/yusancky/GBA-ex)、[（日本）制縣傳說 @ukyouz](https://github.com/ukyouz/JapanEx)：本仓库与之无隶属关系，实现（Python 生成管线 + 前端）为本项目引擎 [map-ex](https://github.com/demoliisher/map-ex) 原创。
