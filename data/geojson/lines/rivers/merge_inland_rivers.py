"""一键合并全部河流分段 -> 主地图读取的 `inland_rivers.geojson`。

用途
----
河流以「按水系分组的单个分段文件」为源数据（`data/geojson/lines/rivers/`
下 `[上游]-[本级]-[下游].json`，供 river-join 逐段编辑）；构建读取的是
**单一文件** `data/geojson/lines/inland_rivers.geojson`。本脚本把当前
全部分段合并成一个扁平 FeatureCollection，作为该文件的再生成器：
手工编辑任何分段后重跑一次即可。

说明
----
* 源分段文件（`lines/rivers/**/*.geojson`）**不会被修改**，仍是开源主数据。
* 合并版不呈现层级/水系关系，就是**扁平的 LineString 集合**：
  每个 feature 保留其原始 `properties`（`name` 即分段名，缺省补文件名），
  几何必须是 LineString（多部件/其他类型会报错提醒）。
* 输出顺序按目录内文件名稳定排序，diff 可复现。

用法
----
    uv run python -X utf8 data/geojson/lines/rivers/merge_inland_rivers.py
"""

import json
from collections import Counter
from pathlib import Path

RIVERS_DIR = Path(__file__).resolve().parent
OUT = RIVERS_DIR.parent / "inland_rivers.geojson"  # data/geojson/lines/


def read_segment(path):
    """读一个分段文件，返回保留原 properties 的 Feature（兼容裸 Feature）。"""
    raw = json.loads(path.read_text(encoding="utf-8"))
    feats = raw["features"] if raw.get("type") == "FeatureCollection" else [raw]
    if len(feats) != 1:
        raise ValueError(f"{path.name}: expected a single Feature")
    f = feats[0]
    geom = f.get("geometry")
    if geom is None:
        raise ValueError(f"{path.name}: feature 缺 geometry")
    if geom["type"] != "LineString":
        raise ValueError(f"{path.name}: 合并版只收 LineString，实际 {geom['type']}")
    props = dict(f.get("properties") or {})
    props.setdefault("name", path.stem)  # name = 分段文件名（源数据均已带）
    return {"type": "Feature", "properties": props, "geometry": geom}


def main():
    paths = sorted(RIVERS_DIR.rglob("*.geojson"), key=lambda p: p.relative_to(RIVERS_DIR).as_posix())
    feats = [read_segment(p) for p in paths]

    fc = {
        "type": "FeatureCollection",
        "name": "inland_rivers",
        "properties": {
            "description": (
                "潮汕内河合并版（扁平 LineString 集合，不分层级）；"
                "由 merge_inland_rivers.py 从 lines/rivers/ 各分段生成，源文件未改动。"
            ),
        },
        "features": feats,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(fc, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"merged {len(feats)} segments -> {OUT} ({OUT.stat().st_size} bytes)")
    print("geometry types:", dict(Counter(f["geometry"]["type"] for f in feats)))
    names = [f["properties"].get("name", "") for f in feats]
    assert all(names), "存在缺 name 的分段"


if __name__ == "__main__":
    main()
