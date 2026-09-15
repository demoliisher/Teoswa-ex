# 潮汕制霸生成器

[![潮汕制霸：以潮汕三市 15 个区县为单位的足迹图](cover.png)](https://teoswa-ex.netlify.app/)

**在线体验**：[Netlify](https://teoswa-ex.netlify.app/) ｜ [Vercel](https://teoswa-ex.vercel.app/)

一句话简介：这是一个以县级行政区为基础标记单位的潮汕地区足迹地图生成器。

> **English**：**Teoswa-ex** is a footprint-map maker for the Chaoshan (潮汕) region of eastern Guangdong — Shantou, Chaozhou and Jieyang (only prefecture-level cities listed) — where you click to mark what you have experienced (lived in / stayed / visited / passed through). Marks stay in your browser; you can export a PNG. The rest of this document is Chinese only; sorry for the inconvenience.

## 基础功能

- **制霸**：可分别制霸区县/客运站点，详见「等级标准」，支持改档或取消；
- **计分**：实时累加所有制霸点分数，不设上下限；
- **重置**：慎用，会清空标记恢复初始化状态；
- **导出**：可将制霸结果保存成 PNG 图片，多端格式一致（图例只含等级和外市）；
- **多端适配**：随浏览器宽度自适应调整布局，当宽度 ≤820px 时自动切换为纵向布局，单指拖动、双指缩放、双击复位。

## 特色功能

- **可开关图层**：「内陆河流」与「对外客运设施」（铁路 + 站点）分设两个开关，默认关闭，可自定义开启；
- **客运站点信息**：三市全部客运火车站与揭阳潮汕国际机场，鼠标悬停出信息卡，显示名称 + 属地 + 台线信息；
- **铁路切片点亮**：一条铁路区间的两端站都有标记，该区间就变绿泛光（机场两支与四条出界尾段由「铁路特例」开关单独控制）。

另有两个简单的自动算法如下：

- **中间站点自动补「驶过」**：一条铁路区间的两端站都标了，中间站自动补成驶过（可按需手工重标「没经过」）；
- **站点抬县**：标记了站点，若其所在的县级行政区尚未制霸，自动补成「路过」，已手工选过的档位不动。

## 等级标准

### 区县

- 居住 5：住过一年以上
- 短居 4：住过一个月以上
- 游玩 3：旅行过
- 出差 2：去过但因行动范围受限，完全没玩
- 路过 1：任意交通方式经过但未曾留步

### 客运站点

- 出入 3：在此站点有过进出站行为
- 换乘 2：在此**枢纽**客运站点进行过换线/空铁互转
- 驶过 1：坐火车经过此站但未下车

> 枢纽站点包括：汕头站、潮汕站、揭阳潮汕国际机场（揭阳机场站），仅此三站点可标记「换乘」。

## 地图说明

- 含潮汕三市 15 个县级行政区，以及今属邻市（外围）的 2 地，共 **17 个单位**；
- 外围区域灰底虚线边，即使被标记上色也保留虚边以作区分；
- 地名标注采用短名，省略「（县级）市/区/县」；
- 精确化海岸线但对岛屿进行了一定取舍；
- 不设周边参照县市，17 个单位占满画布；
- 字形说明：界面文字全部采用台标繁体字，但保留大陆用词习惯；
- 字体说明：地名标签楷书（简繁映射），其余全部隶书。

## 提示

- 标记可缓存在本地：换设备、换浏览器、换链接以及重置都会导致丢失记录；
- 想分享或备份，可请用「保存成图片」导出的 PNG，手机端可能需要长按保存，但实测 Via 可正常弹出下载；
- 两个体验站点都在境外，实测广东电信可直连访问 netlify 部署版，vercel 部署版则不行。本作者不想和 GFW 打交道，网络问题请自行解决，欢迎有能力的人帮忙在中国大陆的服务器上部署，或上线为小程序，在遵守许可的情况下，无需告知（除非你希望你的部署版可以被纳入本文档）。

## 构建

本仓库只含**数据与产物**，不含 Python 代码；构建由引擎 [`map-ex`](https://github.com/demoliisher/map-ex) 完成：

```bash
uvx --from map-ex==0.1.0 map-ex build --data ./data --out ./dist --fonts ./fonts
```

`dist/` 是可直接托管的静态站点（已入库，平台侧零构建）。改数据编辑 `data/`，改样式与交互请去引擎仓库；本地预览在 `dist/` 里起任意 http 服务（`python -m http.server -d dist`）。

## 数据来源、授权与参与

- **数据**：
  - 行政区边界、内陆水系为人工描制，使用工具为 [geojson.io](geojson.io)；
  - 铁路线数据参考自[《中国铁路地图》](cnrail.geogv.org)；
  - 客运站点坐标初版来自[维基数据](wikidata.org)，经过正交投影插入铁路线；
  - 两个字体均来自[中華民國教育部](edu.tw)，子集形式交付并自动加载；
- **授权**：代码 [PolyForm Noncommercial 1.0.0](LICENSE)，数据与制图产物 [CC BY-NC-SA 4.0](LICENSE)；转载、截图或二次创作请保留署名 **潮汕制霸 Teoswa-ex — © 2026 demoliisher**。
- **参与**：本仓库是「潮汕」这一个实例——引擎、换地区教程与开发文档都在 [`map-ex`](https://github.com/demoliisher/map-ex)（`CONTRIBUTING.md`、`PORTING.md`、`docs/`）；本仓库的构建与数据编辑约定见 [`AGENTS.md`](AGENTS.md)；版图之议与新想法去 Discussions，可验证的缺陷与数据出入请开 issue。

## 参考

- [中国制霸生成器 @itorr](https://github.com/itorr/china-ex)
- [大湾区制霸生成器 @yusancky](https://github.com/yusancky/GBA-ex)
- [（日本）制縣傳說 @ukyouz](https://github.com/ukyouz/JapanEx)
