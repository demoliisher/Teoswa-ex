"""一键合并全部客运铁路分段 -> `lines/railways.geojson`（构建读取的单一文件）。

用途
----
客运铁路以「单线一个文件」为源数据（`data/geojson/lines/railways/` 下
`{线名}.geojson`，文件名即线名，metadata 里 `name` 记全称 +「（局部）」、
`slice` 记本段两端，每条为一条穿过潮汕并两端拖尾出界（进入/离开相邻县）的
LineString，供 layout/render 直接描线）；构建读取的是**单一文件**
`data/geojson/lines/railways.geojson`。本脚本把当前全部线路打包成一个扁平
FeatureCollection，作为该文件的再生成器：新增/手改任何一条线路后重跑一次即可。

说明
----
* 源文件（`lines/railways/*.geojson`）不会被修改，仍是开源主数据。
* 合并版就是扁平的 LineString 集合：每条 feature 保留其原始 `properties`
  （`name`/`slice`/`railtype`/`description` 等），几何必须是 LineString。
* 输出顺序按目录内文件名稳定排序，diff 可复现。

用法
----
    uv run python -X utf8 data/geojson/lines/railways/merge_railways.py
"""

import json
from pathlib import Path

RAIL_DIR = Path(__file__).resolve().parent
OUT = RAIL_DIR.parent / "railways.geojson"  # data/geojson/lines/


def main():
    paths = sorted(
        RAIL_DIR.glob("*.geojson"), key=lambda p: p.name
    )
    feats = []
    for p in paths:
        raw = json.loads(p.read_text(encoding="utf-8"))
        items = raw["features"] if raw.get("type") == "FeatureCollection" else [raw]
        for f in items:
            geom = f.get("geometry")
            if geom is None or geom["type"] != "LineString":
                raise ValueError(f"{p.name}: 只收 LineString，实际 {geom and geom.get('type')}")
            props = dict(f.get("properties") or {})
            props.setdefault("name", p.stem)
            feats.append({"type": "Feature", "properties": props, "geometry": geom})

    fc = {
        "type": "FeatureCollection",
        "name": "railways",
        "properties": {
            "description": (
                "潮汕境内客运铁路合并版（杭深铁路厦深段/广梅汕铁路/甬广铁路汕广段，两端拖尾出界）；"
                "由 merge_railways.py 从 lines/railways/ 各线路生成，源文件未改动。"
            ),
        },
        "features": feats,
    }
    OUT.write_text(json.dumps(fc, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"merged {len(feats)} lines -> {OUT} ({OUT.stat().st_size} bytes)")
    for f in feats:
        print("  ", f["properties"].get("name"), f["geometry"]["type"])


if __name__ == "__main__":
    main()
