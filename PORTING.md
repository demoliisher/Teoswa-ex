# PORTING.md — 换一个地区

本仓库是**潮汕**这一个实例，不含引擎代码。要换地区重制，请用引擎 [`map-ex`](https://github.com/demoliisher/map-ex)：

1. 读引擎的 [`PORTING.md`](https://github.com/demoliisher/map-ex/blob/main/PORTING.md)（换地区全流程）与 [`docs/data-contract.md`](https://github.com/demoliisher/map-ex/blob/main/docs/data-contract.md)（数据与配置的权威定义）；
2. 新建一个实例仓库，放 `data/`、字体 `fonts/` 与部署配置，`dist/` 由引擎生成后入库；
3. 本仓库的 `data/` 可直接当**活示例**参考（潮汕 17 个可点区县，铁路、站点、水系俱全）。
