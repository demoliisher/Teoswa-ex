"""一键合并所有区县 -> 一张「潮汕」合成地图快照（构建读取的单一文件）。

用途
----
主地图构建（``map_ex.geo.build.prepare``）读取的是**单一合并版**
``data/geojson/polygons/merged_teoswa.geojson``，而不是逐县文件——正如内河用
单一合并版 ``lines/inland_rivers.geojson`` 一样。区县手工编辑仍落在本目录
（``data/geojson/polygons/county/*.geojson``），编辑后运行本脚本即把当前全部
区县重新烘焙成那张合并快照，之后重建即可。

说明
----
* 源文件（``data/geojson/polygons/county/*.geojson``）**不会被修改**。
* 只扫描本目录顶层的 ``*.geojson``（不进入 ``excluded/`` 等子目录）。
* 每个 feature 保留其当前几何，属性归一化为 ``{name, adcode, parent, outer}``
  （adcode/parent/outer 直接取自源文件 properties——merged 快照保留这些元属性给人看，
  构建实际只读 ``name`` 与 ``outer``：``outer`` 决定「今属他市」的灰底虚边样式，全区县显式标注）。
* 输出统一写入 ``data/geojson/polygons/merged_teoswa.geojson``。
* 县源文件是裸 ``Feature``（饶平等多部件县为单 Feature + MultiPolygon）。

用法
----
    uv run python -X utf8 data/geojson/polygons/county/generate_merged_teoswa.py
"""

import json
from collections import Counter
from pathlib import Path

# 输出统一命名。
OUT_NAME = "merged_teoswa"
# 输出落在上一级 polygons/（本脚本在 data/geojson/polygons/county）。
OUT = Path(__file__).resolve().parents[1] / f"{OUT_NAME}.geojson"
# 区县源目录：本脚本所在目录（data/geojson/polygons/county）。
SRC_DIR = Path(__file__).resolve().parent


def read_feature(path, name):
    """读一个县源文件，返回一个归一化 Feature（含元属性，供他人查看）。

    兼容裸 Feature / 单 feature 的 FeatureCollection；属性一律按
    (name, adcode, parent, outer?) 归一化——adcode/parent/outer 原样照搬源文件，
    不参与几何逻辑。
    """
    raw = json.loads(path.read_text(encoding="utf-8"))
    feats = raw["features"] if raw.get("type") == "FeatureCollection" else [raw]
    if len(feats) != 1:
        raise ValueError(f"{path.name}: expected a single bare Feature")
    f = feats[0]
    geom = f.get("geometry")
    if geom is None:
        raise ValueError(f"{path.name}: feature 缺 geometry")
    p = f.get("properties", {})
    props = {
        "name": name,
        "adcode": p.get("adcode", ""),
        "parent": p.get("parent", ""),
        "outer": bool(p.get("outer")),
    }
    return {
        "type": "Feature",
        "properties": props,
        "geometry": geom,
    }


def main():
    # 只扫本目录顶层 *.geojson（排除 excluded/ 等子目录），按文件名稳定排序。
    files = sorted(SRC_DIR.glob("*.geojson"))

    out_features = []
    for path in files:
        name = path.stem
        out_features.append(read_feature(path, name))

    fc = {
        "type": "FeatureCollection",
        "name": OUT_NAME,
        "properties": {
            "description": (
                "潮汕所有区县当前轮廓合并快照（构建读取的单一文件），"
                "源自 data/geojson/polygons/county/ 各文件；源文件未改动。"
            ),
        },
        "features": out_features,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(fc, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"merged {len(out_features)} features -> {OUT} ({OUT.stat().st_size} bytes)")

    # sanity：几何类型统计
    print("geometry types:", dict(Counter(f["geometry"]["type"] for f in out_features)))


if __name__ == "__main__":
    main()
