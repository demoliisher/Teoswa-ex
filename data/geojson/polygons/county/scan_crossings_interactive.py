"""Interactive geometry-conflict checker for admin-division geojson files.

Run inside the folder that holds all the *.geojson admin files (or pass a
folder as argv[1]); it lists every file as `idx. [name]` (name from
properties.name), asks which objects to check (multi-select: space-separated
indexes, empty = all), then reports:

  * self-crossings per selected object;
  * proper crossings between the selected object(s) and EVERY other file
    (deduplicated across selections), formatted as
    `A[DR] vs B[DR]` where DR is the rough compass direction (N/NE/E/SE/S/
    SW/W/NW) of the conflict relative to each object's centroid;
  * containment / penetration: vertices of one ring lying strictly INSIDE
    another ring (shared-boundary vertices are excluded). Proper segment
    crossings alone cannot see a ring that pokes into its neighbour's interior
    through a collinear seam, so this second test is what catches that.

Only geometry conflicts are checked (proper segment crossings with
`eps<t<1-eps`, `eps<u<1-eps`, `den==0` skipped so coincident shared edges
never count, plus the strict-inside containment test). No splice / no arc-shift.

Usage:
    uv run python -X utf8 scan_crossings_interactive.py            # scan this folder
    uv run python -X utf8 scan_crossings_interactive.py <dir>      # scan another folder
"""
import glob
import json
import math
import os
import sys

EPS = 1e-9
SECTORS = ["E", "NE", "N", "NW", "W", "SW", "S", "SE"]
TOL = 1e-9  # degree tolerance for "on boundary" containment exclusion


# ------------------------------------------------------------------- loading
def load_file(path):
    """Return (name, [open outer rings]) — all polygon parts' outer rings."""
    raw = json.loads(open(path, encoding="utf-8").read())
    f = raw["features"][0] if raw.get("type") == "FeatureCollection" else raw
    g = f["geometry"]
    if g["type"] == "MultiPolygon":
        parts = g["coordinates"]
    else:
        parts = [g["coordinates"]]
    rings = []
    for poly in parts:
        outer = poly[0]
        if outer[0] == outer[-1]:
            outer = outer[:-1]
        rings.append(outer)
    name = (f.get("properties") or {}).get("name") or os.path.basename(path)
    return name, rings


def bbox(ring):
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return min(xs), min(ys), max(xs), max(ys)


def rings_bbox(rings):
    bb = bbox(rings[0])
    for r in rings[1:]:
        b = bbox(r)
        bb = (min(bb[0], b[0]), min(bb[1], b[1]),
              max(bb[2], b[2]), max(bb[3], b[3]))
    return bb


def bbox_overlap(a, b):
    return not (a[2] < b[0] or b[2] < a[0] or a[3] < b[1] or b[3] < a[1])


def centroid(ring):
    """(cx, cy) of a ring by shoelace; falls back to vertex mean."""
    n = len(ring)
    if n < 3:
        return sum(p[0] for p in ring) / n, sum(p[1] for p in ring) / n
    a2 = cx = cy = 0.0
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[(i + 1) % n]
        cr = xi * yj - xj * yi
        a2 += cr
        cx += (xi + xj) * cr
        cy += (yi + yj) * cr
    if a2 == 0:
        return sum(p[0] for p in ring) / n, sum(p[1] for p in ring) / n
    return cx / (3 * a2), cy / (3 * a2)


def rings_centroid(rings):
    """Area-weighted centroid across all outer rings."""
    tx = ty = tw = 0.0
    for ring in rings:
        cx, cy = centroid(ring)
        a2 = 0.0
        for i in range(len(ring)):
            xi, yi = ring[i]
            xj, yj = ring[(i + 1) % len(ring)]
            a2 += xi * yj - xj * yi
        w = abs(a2) / 2
        tx += cx * w
        ty += cy * w
        tw += w
    if tw == 0:
        pts = [p for r in rings for p in r]
        return (sum(p[0] for p in pts) / len(pts),
                sum(p[1] for p in pts) / len(pts))
    return tx / tw, ty / tw


def sector(dx, dy):
    if dx == 0 and dy == 0:
        return "?"
    ang = math.degrees(math.atan2(dy, dx))
    if ang < 0:
        ang += 360
    return SECTORS[int((ang + 22.5) // 45) % 8]


# ----------------------------------------------------------------- crossing
def proper_cross(p1, p2, q1, q2):
    (x1, y1), (x2, y2) = p1, p2
    (x3, y3), (x4, y4) = q1, q2
    den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if den == 0:
        return None
    t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
    u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den
    if EPS < t < 1 - EPS and EPS < u < 1 - EPS:
        return (round(x1 + t * (x2 - x1), 6), round(y1 + t * (y2 - y1), 6))
    return None


def ring_crossings(r1, r2):
    """Proper crossing points between two open rings (may be same ring)."""
    out = []
    for i in range(len(r1) - 1):
        for j in range(len(r2) - 1):
            if r1 is r2 and j <= i:
                continue
            c = proper_cross(r1[i], r1[i + 1], r2[j], r2[j + 1])
            if c and c not in out:
                out.append(c)
    return out


# ------------------------------------------------------------- containment
def point_on_edge(pt, ring, tol=1e-9):
    """Is pt collinear-and-within any edge of ring? (tol in degrees).

    Traverses the ring CLOSED (i -> (i+1)%n) so the closing edge is included
    whether the ring list still carries a duplicated first==last point or not.
    """
    x, y = pt
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        cross = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1)
        if abs(cross) > tol * max(1.0, abs(x2 - x1), abs(y2 - y1)):
            continue
        if (min(x1, x2) - tol <= x <= max(x1, x2) + tol and
                min(y1, y2) - tol <= y <= max(y1, y2) + tol):
            return True
    return False


def point_strictly_inside(pt, ring):
    """True iff pt is strictly inside the ring (boundary treated as outside).

    Uses the standard even-odd ray cast over the ring traversed CLOSED
    (i -> (i+1)%n). The closing edge MUST be included: a ring whose list no
    longer carries a duplicated closing point (or whose last edge crosses the
    test latitude) yields a wrong parity for points near the boundary. Open
    and closed ring lists are both handled.
    """
    if point_on_edge(pt, ring, TOL):
        return False
    x, y = pt
    inside = False
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            xs = x1 + (y - y1) / (y2 - y1) * (x2 - x1)
            if xs > x:
                inside = not inside
    return inside


def contained_vertices(rings_a, rings_b, min_run=3, min_depth=1e-4):
    """Vertices of rings_a that lie strictly inside rings_b, consolidated into
    CONTIGUOUS RUNS that represent a real penetration (a block of the a ring
    poking into b's interior).

    A lone vertex floating a hair across the shared boundary (rounding / point
    density) is noise, not penetration. A real intrusion is a run of >=min_run
    consecutive a-vertices that are all strictly inside b AND whose run's
    deepest vertex sits >=min_depth degrees inside b. This is what distinguishes
    三甲's ~2km-deep intrusion into 惠来 (31 consecutive vertices) from a
    boundary-adjacent rounding artifact.

    Returns a list of deepest points, one per qualifying run.
    """
    out = []
    for ra in rings_a:
        def inside_any(p):
            for rb in rings_b:
                if point_strictly_inside(p, rb):
                    return True
            return False
        flags = [inside_any(p) for p in ra]
        n = len(ra)
        i = 0
        while i < n:
            if not flags[i]:
                i += 1
                continue
            j = i
            while j + 1 < n and flags[j + 1]:
                j += 1
            run = ra[i:j + 1]
            if len(run) >= min_run:
                # minimum depth from any b boundary = max over run of the
                # min planar distance from the point to b's boundary
                depth = max(_min_dist_to_boundary(p, rings_b) for p in run)
                if depth >= min_depth:
                    deepest = max(run, key=lambda p: _min_dist_to_boundary(
                        p, rings_b))
                    out.append(tuple(deepest))
            i = j + 1
    return out


def _min_dist_to_boundary(pt, rings_b):
    """Minimum planar distance from pt to the boundary edges of rings_b."""
    best = 1e300
    for rb in rings_b:
        n = len(rb)
        for k in range(n):
            x1, y1 = rb[k]
            x2, y2 = rb[(k + 1) % n]
            dx, dy = x2 - x1, y2 - y1
            l2 = dx * dx + dy * dy
            t = 0.0 if l2 == 0 else max(0.0, min(1.0,
                ((pt[0] - x1) * dx + (pt[1] - y1) * dy) / l2))
            qx, qy = x1 + t * dx, y1 + t * dy
            best = min(best, ((pt[0] - qx) ** 2 + (pt[1] - qy) ** 2) ** 0.5)
    return best


def rings_crossings(rings_a, rings_b):
    """Crossing points between every ring of A and every ring of B.

    Same object (rings_a is rings_b): also catches ring-vs-other-ring of a
    MultiPolygon (its parts must not overlap each other either).
    """
    out = []
    same = rings_a is rings_b
    for ia, ra in enumerate(rings_a):
        for ib, rb in enumerate(rings_b):
            if same and ib < ia:
                continue
            out.extend(ring_crossings(ra, rb))
    dedup = []
    for c in out:
        if c not in dedup:
            dedup.append(c)
    return dedup


# -------------------------------------------------------------------- main
def main():
    folder = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(
        os.path.abspath(__file__))
    files = sorted(glob.glob(os.path.join(folder, "*.geojson")))
    if not files:
        print("no *.geojson found in", folder)
        sys.exit(2)

    objs = []
    for p in files:
        try:
            objs.append((os.path.basename(p), *load_file(p)))
        except Exception as e:  # noqa: BLE001 - skip unreadable, keep going
            print(f"skip {os.path.basename(p)}: {e}")
    n = len(objs)

    print(f"发现 {n} 个多边形/多多边形：")
    for i, (fn, name, _rings) in enumerate(objs):
        print(f"  {i}. [{name}]")

    raw = input("输入索引（空格分隔；1个=vs其余全部，多个=所选两两，回车=全部两两）: ").strip()
    if raw == "":
        picks = list(range(n))          # all rings -> all pairwise
    else:
        picks = sorted({int(t) for t in raw.split() if t.isdigit()
                        and 0 <= int(t) < n})
        if not picks:
            print("无效输入，退出。")
            sys.exit(2)
    print(f"检查 {len(picks)} 个对象: "
          + ", ".join(objs[i][1] for i in picks))
    print("...")

    # precompute bbox + centroid
    meta = [None] * n
    for i, (_fn, _name, rings) in enumerate(objs):
        c = rings_centroid(rings)
        meta[i] = (rings_bbox(rings), c, rings)

    conflicts = []   # (nameA, dirA, nameB, dirB, pts)
    self_bad = []    # (name, pts)
    seen_pairs = set()

    for si in picks:
        name_s, (_bb, _c, rings_s) = objs[si][1], meta[si]
        sc = rings_crossings(rings_s, rings_s)
        if sc:
            self_bad.append((name_s, sc))

        # 1 pick -> vs every other file; 2+ picks -> pairwise among picks only
        if len(picks) == 1:
            others = range(n)
        else:
            others = [oj for oj in picks if oj > si]

        for oj in others:
            if oj == si:
                continue
            key = (min(si, oj), max(si, oj))
            if key in seen_pairs:
                continue
            seen_pairs.add(key)
            bb_o, c_o, rings_o = meta[oj]
            if not bbox_overlap(_bb, bb_o):
                continue
            xs = rings_crossings(rings_s, rings_o)
            # containment: rings_s pokes into rings_o (or vice versa)
            perv = contained_vertices(rings_o, rings_s)   # o's pts inside s
            per1 = contained_vertices(rings_s, rings_o)   # s's pts inside o
            penet = perv + per1
            if not xs and not penet:
                continue
            xs += penet   # report penetration as a conflict point too
            mx = sum(p[0] for p in xs) / len(xs)
            my = sum(p[1] for p in xs) / len(xs)
            dx_s, dy_s = mx - _c[0], my - _c[1]
            dx_o, dy_o = mx - c_o[0], my - c_o[1]
            conflicts.append((objs[si][1], sector(dx_s, dy_s),
                              objs[oj][1], sector(dx_o, dy_o), xs,
                              len(penet)))

    print("\n== 检查结果 ==")
    if self_bad:
        for name, sc in self_bad:
            print(f"{name}[self] 自交 {len(sc)} 处: "
                  + ", ".join(f"({x:.6f},{y:.6f})" for x, y in sc[:5]))
    if conflicts:
        for na, da, nb, db, xs, np_ in conflicts:
            kind = f"交叉+侵入" if np_ else "交叉"
            print(f"{na}[{da}] vs {nb}[{db}]  {kind} {len(xs)} 处: "
                  + ", ".join(f"({x:.6f},{y:.6f})" for x, y in xs[:5])
                  + (f"  [侵入 {np_}]" if np_ else ""))
    if not self_bad and not conflicts:
        print("全部干净：无自交、无交叉冲突。")
    else:
        print(f"共 {len(self_bad)} 个对象自交、{len(conflicts)} 对冲突。")
    sys.exit(0 if not self_bad and not conflicts else 1)


if __name__ == "__main__":
    main()
