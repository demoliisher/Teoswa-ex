"""把交通枢纽点正交投影到铁路线上，使站点几何上真的落在线里。

用途
----
铁路线与站点坐标来源不同，二者只在**视觉上**相交：图标压在线上，垂足却
不在线，线上也没有对应顶点。本脚本把每个站点投到**最近**的一条铁路源线
（`lines/railways/*.geojson`），并把：

* 垂足插入该线所在的**线段**（成为线上一个顶点）——线因此真的穿过站点；
* 站点坐标替换为该垂足（8 位小数圆整），与线上顶点**严格相等**（共点）。

这样后续按站点给铁路线分段/局部变色时，可以直接用站点坐标在线上定位。

投影在**投影平面**里做（等距圆柱近似，x 乘 cos(23.5°)），所以「正交」是屏幕
意义上的垂直；几何原语来自 `map_ex.geo.edit.snap`（构建永不 import 的编辑
层），不依赖 shapely。

注意
----
* 改的是**源线**（`lines/railways/*.geojson`），合并版 `lines/railways.geojson`
  随后由 `lines/railways/merge_railways.py` 重新生成——两步都要跑。
* 插入的是**共线点**，线的形状不变（渲染出的轨道只多一个采样点）；站点会
  移动「它到线」的那段距离（本站最大约 590 m ≈ 3 px）。
* 脚本**幂等**：重跑时所有垂足距离都是 0 m，报 `vertex =`（不插入新点）。
* 同一条线上多站点插入按「段号降序、段内参数 t 降序」执行，否则先插的点会
  挪动后续段号（river-join 踩过同一个坑）。

用法
----
    uv run python -X utf8 data/geojson/points/project_sites_to_railways.py            # dry-run
    uv run python -X utf8 data/geojson/points/project_sites_to_railways.py --write
    uv run python -X utf8 data/geojson/lines/railways/merge_railways.py              # 再生成合并版
"""

import argparse
import json
import math
import pathlib

from map_ex.geo.edit import snap

ROOT = pathlib.Path(__file__).resolve().parents[1]   # data/geojson
RAIL_DIR = ROOT / "lines" / "railways"
TRANS = ROOT / "points" / "transports.json"
CLAT = math.cos(math.radians(23.5))
M_PER_DEG = 111320.0


def plane(pt):
    return (pt[0] * CLAT, pt[1])


def geo(pt):
    return (pt[0] / CLAT, pt[1])


def load_rails():
    rails = []
    for p in sorted(RAIL_DIR.glob("*.geojson")):
        raw = json.loads(p.read_text(encoding="utf-8"))
        items = raw["features"] if raw.get("type") == "FeatureCollection" else [raw]
        for f in items:
            rails.append({"path": p, "raw": raw, "feat": f})
    return rails


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="落盘（默认 dry-run）")
    args = ap.parse_args()

    rails = load_rails()
    planes = [[plane(tuple(c[:2])) for c in r["feat"]["geometry"]["coordinates"]] for r in rails]
    doc = json.loads(TRANS.read_text(encoding="utf-8"))

    plan = []
    for f in doc["features"]:
        p = tuple(f["geometry"]["coordinates"][:2])
        pp = plane(p)
        best = None
        for ri, pl in enumerate(planes):
            foot, d, seg_i = snap.nearest_on_polyline(pp, pl)
            if best is None or d < best[1]:
                best = (ri, d, seg_i, foot)
        ri, d, seg_i, foot = best
        _, _, t = snap.seg_proj(pp, planes[ri][seg_i], planes[ri][seg_i + 1])
        foot_geo = snap.r8(geo(foot))
        plan.append(
            {
                "name": f["properties"]["name"],
                "type": f["properties"].get("type", "station"),
                "old": snap.r8(p),
                "rail": ri,
                "seg_i": seg_i,
                "t": t,
                "d_m": d * M_PER_DEG,
                "foot": foot_geo,
            }
        )

    for e in plan:
        print(
            f"{e['name']:10s} ({e['type']:7s}) {e['old'][0]:.6f},{e['old'][1]:.6f}"
            f"  ->  {rails[e['rail']]['path'].stem:8s} seg#{e['seg_i']:3d} t={e['t']:.3f}"
            f" d={e['d_m']:7.1f}m  foot={e['foot'][0]:.6f},{e['foot'][1]:.6f}"
        )

    print()
    for ri, r in enumerate(rails):
        got = [e["name"] for e in plan if e["rail"] == ri]
        print(f"  {r['path'].stem:8s} <- {len(got)} sites: {got}")

    if not args.write:
        print("\ndry-run only — 加 --write 落盘")
        return

    coords = [list(r["feat"]["geometry"]["coordinates"]) for r in rails]
    for ri in range(len(rails)):
        items = [e for e in plan if e["rail"] == ri]
        items.sort(key=lambda e: (e["seg_i"], e["t"]), reverse=True)
        for e in items:
            added = snap.insert_vertex(coords[ri], e["seg_i"], list(e["foot"]))
            print(
                f"  vertex {'+' if added else '='} {rails[ri]['path'].stem} "
                f"seg#{e['seg_i']} {e['name']} {e['foot']}"
            )
    for ri, r in enumerate(rails):
        r["feat"]["geometry"]["coordinates"] = coords[ri]
        r["path"].write_text(json.dumps(r["raw"], ensure_ascii=False, indent=4), encoding="utf-8")

    for f, e in zip(doc["features"], plan):
        f["geometry"]["coordinates"] = [e["foot"][0], e["foot"][1]]
    TRANS.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nwrote {len(rails)} rail sources + {TRANS}")


if __name__ == "__main__":
    main()
