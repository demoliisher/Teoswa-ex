(function () {
    'use strict';

    var STORE_KEY = 'teoswa-ex-levels';
    var FILE_NAME = '潮汕制霸.png';
    var VIEW_BOX = null;
    var MARGIN = 6;
    var MAP_URL = 'assets/svg/map.svg';   // the drawing: an asset, fetch-injected
    var RAIL_URL = 'assets/rail-data.json';   // the rail tables (data, not a script)
    var LEGEND_URL = 'assets/svg/legend.svg';   // the legend: drawer source + shot artwork

    var doc = document;
    var root = doc.documentElement;
    // map DOM refs are filled by initMap() once boot() has injected map.svg
    var svg = null;
    var regionsGroup = null;
    var regionPaths = [];
    var scoreText = null;
    var popup = doc.getElementById('level-popup');
    var popupTitle = popup.querySelector('h2');
    var popupLinks = popup.querySelectorAll('a');
    var saveBtn = doc.getElementById('save');
    var resetBtn = doc.getElementById('reset');
    var output = doc.getElementById('output');
    var outputImg = output.querySelector('img');
    var closeBtn = output.querySelector('a');
    var layersBar = doc.getElementById('layers');
    var layerState = {};        // {data-layer name: bool}
    // The legend is not part of map.svg: it arrives as its own asset and is kept as a
    // DETACHED <svg> here — the drawer is built from its rows, the site tiers are read
    // off them, and 「保存成圖片」 splices #legend out of it into the PNG.
    var legendRoot = null;

    // ---- narrow-screen layout + pinch zoom -------------------------------
    // Under NARROW_Q the page replaces the in-SVG title with HTML chrome (top bar
    // + collapsible legend drawer) and crops the map viewBox to the drawing
    // itself. The legend is not in the map at all — it ships as assets/svg/legend.svg
    // and is spliced into the shot — while the SVG keeps its own header, hidden by
    // an external stylesheet rule: it never shows on screen but is still
    // serialised for the export, whose canvas comes from the fragment's
    // data-canvas-* (falling back to VIEW_BOX) — zooming mutates the live root
    // viewBox attribute only.
    var NARROW_Q = window.matchMedia('(max-width: 820px)');
    var SVG_NS = 'http://www.w3.org/2000/svg';
    var ZOOM_MAX = 6;
    var topbar = doc.getElementById('topbar');
    var tbTitle = topbar.querySelector('.tb-title');
    var tbSub = topbar.querySelector('.tb-sub');
    var tbScore = doc.getElementById('score-top');
    var lockEl = doc.getElementById('site-lock');
    var noteEl = doc.getElementById('site-note');
    var noteHead = noteEl.querySelector('.sn-head');
    var noteBody = noteEl.querySelector('.sn-body');
    var noteFoot = noteEl.querySelector('.sn-foot');
    var drawer = doc.getElementById('legend-drawer');
    var drawerBar = drawer.querySelector('.drawer-bar');
    var drawerBody = drawer.querySelector('.drawer-body');
    var drawerLegend = drawer.querySelector('.drawer-legend');
    var narrow = false;
    var homeVB = null;          // home view of the current layout mode
    var zoom = 1;
    var center = { x: 0, y: 0 };
    var pointers = {};          // pointerId -> {x,y} in client coords
    var captured = {};           // pointerId -> true once the gesture captured it
    var pinch = null;           // {d0, zoom0, prevMid}
    var panStart = null;        // {cx, cy, kx, ky, center} — absolute drag anchor
    var downAt = null;          // pointerdown position (client) for tap detection
    var suppressClick = false;  // swallow the click that follows a drag/pinch
    var touchSequence = false;  // the current pointer sequence came from a touch
    var lastTap = null;
    var DRAWER_KEY = STORE_KEY + ':legend';

    // Font faces are **optional**: the build fills this array in from
    // config.json's svg.fonts.faces (see fonts.py) and leaves it empty for an
    // map that declares none — the page's own @font-face rules come from
    // style.css, and the export then just keeps the system font stack.
    // The PNG export re-embeds every declared face as a base64 data URI: the
    // exported SVG snapshot is rendered as an image, which may not fetch any
    // external resource. fetch() resolves the woff2 relative to the page (works
    // under http(s) and local file:// alike); when it fails, the export silently
    // falls back to the system font stack.
    var FONT_FACES = [
        { family: 'KaiTC', file: 'assets/fonts/kai-tc.woff2' },
        { family: 'LiTC', file: 'assets/fonts/li-tc.woff2' }
    ];
    // The page's *dynamic* wording (score line, station card, dialogs, the failure
    // notice) is filled in by the build from config.json's writing system and its
    // html.copy overrides — see wording.py. The shell's static wording arrives as
    // {{COPY:<key>}} tokens in index.html, so nothing here is a hardcoded string.
    var COPY = {"drawer_label": "控制面板", "legend_title": "圖例", "layers_title": "開關", "rail_special_title": "鐵路特例", "tools_title": "功能", "reset": "重置", "save": "保存成圖片", "close": "關閉", "save_hint": "手機端可長按圖片保存", "score_prefix": "分數：", "home_prefix": "屬地：", "card_scales": "（{platforms}台{tracks}線）", "clear_label": "沒經過", "confirm_reset": "確定要重置所有行政區與站點標記嗎？", "map_load_failed": "地圖加載失敗", "map_load_hint": "：請通過 http(s) 訪問本站，或以 Chrome/Edge 打開本地文件。", "fetch_unavailable": "fetch 不可用", "legend_note_outer": "今屬他市", "transport_title": "民用運輸機場 + 客運火車站", "transport_count_suffix": "個標註點", "transport_title_open": "（", "transport_title_close": "）"};
    var exportFonts = Promise.resolve(''); // resolves to <style> body ('' when none)
    function loadExportFonts() {
        if (!window.fetch) return; // export falls back to system fonts
        function bytesToBase64(buf) {
            var bytes = new Uint8Array(buf);
            var bin = '';
            var CHUNK = 0x8000;
            for (var i = 0; i < bytes.length; i += CHUNK) {
                bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
            }
            return btoa(bin);
        }
        exportFonts = Promise.all(FONT_FACES.map(function (f) {
            return fetch(f.file)
                .then(function (r) { return r.ok ? r.arrayBuffer() : null; })
                .then(function (buf) {
                    if (!buf) return '';
                    return "@font-face{font-family:'" + f.family + "';" +
                        "src:url(data:font/woff2;base64," + bytesToBase64(buf) +
                        ") format('woff2');font-display:swap;}";
                })
                .catch(function () { return ''; });
        })).then(function (rules) {
            return rules.join('');
        });
    }

    // ---- map boot: the map SVG is fetch-injected ---------------------------
    // dist/ ships index.html (shell only) with everything it fetches under assets/;
    // boot() fetches the drawing — plus the legend fragment and the rail tables — and
    // injects it, which is why the page must be served over http(s). Only the drawing
    // is load-bearing:
    // a failing rail-data.json leaves the map working with empty tables (no lit legs,
    // no 鐵路特例 switches) and a failing legend.svg costs the panel's legend + the
    // shot's, instead of costing the whole page.
    function boot() {
        if (!window.fetch) { failMap(COPY.fetch_unavailable); return; }
        var mapReq = fetch(MAP_URL).then(function (r) {
            if (!r.ok) throw new Error('map fetch ' + r.status);
            return r.text();
        });
        var railReq = fetch(RAIL_URL)
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; });
        var legendReq = fetch(LEGEND_URL)
            .then(function (r) { return r.ok ? r.text() : null; })
            .catch(function () { return null; });
        Promise.all([mapReq, railReq, legendReq])
            .then(function (res) {
                if (res[1]) {
                    RAIL_DATA = res[1];
                    window.RAIL_DATA = RAIL_DATA;   // handle for tools / tests
                }
                if (res[2]) {
                    // Imported into *this* document: the fragment's <use> symbols
                    // resolve against the injected map's <defs>, and its style element
                    // is what the shot splices next to the map's own.
                    try {
                        var parsed = new DOMParser().parseFromString(res[2], 'image/svg+xml');
                        legendRoot = doc.importNode(parsed.documentElement, true);
                        window.LEGEND_ROOT = legendRoot;   // handle for tools / tests
                    } catch (e) { legendRoot = null; }
                }
                doc.body.insertAdjacentHTML('afterbegin', res[0]);
                var el = doc.body.firstElementChild;
                if (!el || el.tagName !== 'svg') throw new Error('map inject failed');
                initMap(el);
            })
            .catch(function (e) { failMap(e && e.message); });
    }

    function failMap(reason) {
        // e.g. non-Chrome file:// opens where local fetch is blocked.
        root.removeAttribute('data-loading');
        var msg = doc.createElement('div');
        msg.id = 'map-error';
        msg.textContent = COPY.map_load_failed + (reason ? '（' + reason + '）' : '') +
            COPY.map_load_hint;
        doc.body.appendChild(msg);
    }

    function initMap(el) {
        svg = el;
        regionsGroup = doc.getElementById('regions');
        regionPaths = Array.prototype.slice.call(regionsGroup.children);
        scoreText = doc.getElementById('score');
        var vb = svg.getAttribute('viewBox').split(/\s+/).map(Number);
        VIEW_BOX = { w: vb[2], h: vb[3] };

        regionsGroup.addEventListener('click', onRegionClick);
        buildChrome();
        bindView();
        applyLevels();
        collectSites();
        buildChooser();
        loadSiteStates();
        loadRailOff();
        readSpecialOpen();
        buildRailSwitches();   // 特例开关状态先就绪，下面 paintRail 才画得对
        applySiteStates();
        updateScore();
        collectLayers();
        applyLayers();
        if (railSpecialTitle) {
            railSpecialTitle.addEventListener('click', function () {
                specialOpen = !specialOpen;
                try {
                    localStorage.setItem(RAIL_SPECIAL_OPEN_KEY, specialOpen ? '1' : '0');
                } catch (e) {}
                applySpecialOpen();
                sizeDrawer();      // 展开/收起会改变面板宽度，把手靠它定位
            });
        }
        // Both layouts now frame the *counties* (see measureVB): the burnt-in
        // title stays in svg.innerHTML for the export (the legend ships as its own
        // fragment) but reserves no screen room, so the drawing sits centred.
        if (NARROW_Q.matches) enterNarrow();
        else { homeVB = measureVB(); resetView(); }
        sizeDrawer();
        // The panel now carries a min-width, so a face that swaps in late would leave
        // that width stale (and the handle off its edge): re-measure once fonts are in.
        if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { sizeDrawer(); });
        if (NARROW_Q.addEventListener) NARROW_Q.addEventListener('change', applyNarrowMode);
        else if (NARROW_Q.addListener) NARROW_Q.addListener(applyNarrowMode);
        window.addEventListener('resize', applyNarrowMode);   // belt and braces
        loadExportFonts();
        root.removeAttribute('data-loading');
    }

    // ---- toggleable overlay layers ----
    // The map svg carries one <g data-layer="name" data-layer-label="…"
    // data-layer-on="on|off"> per overlay (emitted from config.json's svg.layers);
    // the buttons are built from those groups, and toggling hides the map group plus
    // the panel's legend items tagged with the same data-layer. The choice persists
    // locally.
    function layerStoreKey() {
        return STORE_KEY + ':layers';
    }
    function collectLayers() {
        var groups = [];
        var seen = {};
        for (var i = 0; i < svg.children.length; i++) {
            var g = svg.children[i];
            var key = g.getAttribute && g.getAttribute('data-layer');
            // one switch per layer *name*: a merged layer (對外客運設施) owns two
            // map groups (the railways and the airport/station markers)
            if (!key || seen[key]) continue;
            seen[key] = 1;
            groups.push(g);
        }
        if (!layersBar) return;
        var saved = {};
        try { saved = JSON.parse(localStorage.getItem(layerStoreKey()) || '{}') || {}; } catch (e) {}
        layerState = {};
        layersBar.innerHTML = '';
        groups.forEach(function (g) {
            var name = g.getAttribute('data-layer');
            var on = (name in saved) ? !!saved[name] : g.getAttribute('data-layer-on') !== 'off';
            var text = g.getAttribute('data-layer-label') || name;
            layerState[name] = on;
            var sw = doc.createElement('a');
            sw.className = 'layer-switch' + (on ? ' on' : '');
            sw.setAttribute('role', 'switch');
            sw.setAttribute('aria-checked', on ? 'true' : 'false');
            sw.title = text;
            var label = doc.createElement('span');
            label.className = 'layer-label';
            label.textContent = text;
            var track = doc.createElement('span');
            track.className = 'track';
            var knob = doc.createElement('span');
            knob.className = 'knob';
            track.appendChild(knob);
            // the switch comes first, its label after it (both layouts)
            sw.appendChild(track);
            sw.appendChild(label);
            sw.addEventListener('click', function () {
                layerState[name] = !layerState[name];
                sw.classList.toggle('on', layerState[name]);
                sw.setAttribute('aria-checked', layerState[name] ? 'true' : 'false');
                try { localStorage.setItem(layerStoreKey(), JSON.stringify(layerState)); } catch (e) {}
                applyLayers();
            });
            layersBar.appendChild(sw);
        });
        layersBar.hidden = groups.length === 0;
    }
    function applyLayers() {
        Object.keys(layerState).forEach(function (name) {
            var on = layerState[name];
            // document-wide: the map groups and the drawer items both carry the same
            // data-layer (the legend fragment itself is detached — it never shows on
            // screen, and the shot drops its operator rows regardless of the state)
            var nodes = doc.querySelectorAll('[data-layer="' + name + '"]');
            Array.prototype.forEach.call(nodes, function (n) {
                n.style.display = on ? '' : 'none';
            });
        });
        siteBoxes = null;                       // the marker boxes moved
        if (!layerState.transit) unlockSite();
    }
    // ---- station hover: radar lock + note card (desktop) ------------------
    // The transport markers stay pointer-events:none, so county clicks are never
    // swallowed; hover is resolved in JS against the markers' *screen* boxes, so
    // zooming the map cannot drift the hit area. The lock ring and the card are
    // HTML overlays pinned to the same screen point: they never enter
    // svg.innerHTML and therefore never reach the exported PNG.
    var SITE_STATE_KEY = STORE_KEY + ':sites';
    var LOCK_R = 13;          // px: enter the lock radius (the icon's radius is 8,
                              // so the snap only covers the icon + a small margin)
    var UNLOCK_R = 20;        // px: keep it, and hand over to a *nearer* marker —
                              // the band between the two radii is the hysteresis
                              // that also lets two markers close together (机场 /
                              // 潮汕站 are 40px apart) swap exactly at their midpoint
    var NOTE_GAP = 38;        // px between the marker centre and the card edge:
                              // clears the 30px lock ring so the two never overlap
    var NOTE_HOVER_PAD = 16;  // px the card's keep-alive rect is inflated by, so
                              // the walk from the marker to its buttons is solid
    var TAP_R = 15;           // px: narrow tap radius for picking a station — the
                              // marker is only ~6.6px across on a 390px screen, so
                              // the tap zone is what makes it hittable at all (the
                              // closest pair, 机场/潮汕站, is 15.4px apart, so a tap
                              // between them still hands over at their midpoint)
    var SHEET_GAP = 8;        // px between the narrow card sheet and the drawer
    var sheetPan = false;     // guard: the sheet's one-shot view lift
    var SITE_POINTS = {};     // {state: points}, filled from the legend's mark rows
    var SITE_MARKS = [];      // [{state, label, points, color, only:[…]}] — the legend rows
    var siteNodes = [];       // baked <g class="site"> markers of #transport
    var siteBoxes = null;     // cached [{node, name, x, y}] in client coords
    var lockedSite = null;    // the marker the ring is locked onto
    var siteStates = {};      // {marker name: any scoring tier key}; absent = 沒經過
    var RAIL_OFF_KEY = STORE_KEY + ':railoff';
    var RAIL_SPECIAL_KEY = STORE_KEY + ':railspecial';
    // filled by boot() from assets/rail-data.json (empty until then — nothing
    // reads it before initMap)
    var RAIL_DATA = {segments: [], legs: [], special: [], bypass: []};
    var railSegs = {};        // {"汕头站|葵潭站": {mid: ["潮安站",…], need: [开关标签…]}}
    var railSegsNodes = [];   // <g class="rseg"> legs of #railways, in DOM (cut) order
    var railLegs = [];        // RAIL_DATA.legs — [[a, b], …], paired with the nodes above
    var railOff = {};         // {station: true} — hand-cleared: never auto-filled
    var railSpecial = {};     // {leg index: switch label} — 特例段：只认面板开关
    var railSpecialEnds = {}; // {switch label: [具名端…]} — 那一截的两个端站名
    var specialOn = {};       // {switch label: true|false} — 鐵路特例 开关状态
    var railBypass = {};      // {station: true} — 纯手动标记的站（机场），不进自动填充
    var railSpecialBar = doc.getElementById('rail-special');
    var railSpecialTitle = doc.getElementById('rail-special-title');
    var RAIL_SPECIAL_OPEN_KEY = STORE_KEY + ':railopen';
    var specialOpen = false;  // 鐵路特例 小节展开否（默认收起，见 applySpecialOpen）

    // The scoring tiers are baked into the legend fragment (they must read like the
    // county levels there); the card's chooser is generated from those very rows, so
    // label / colour / points have exactly one definition. A row may name the
    // stations it belongs to (`only`): 換乘 is a hub affair — 汕头站 / 潮汕站 /
    // 揭阳潮汕国际机场（线路换乘或空铁互转），别处不出这个按钮。
    function readSiteMarks() {
        SITE_MARKS = [];
        SITE_POINTS = {};
        if (!legendRoot) return;
        Array.prototype.forEach.call(
            legendRoot.querySelectorAll('#legend-rows > .lg-row[data-site-state]'),
            function (row) {
                var t = row.querySelector('text');
                var rect = row.querySelector('rect.lg-band');
                var only = row.getAttribute('data-site-only') || '';
                var m = {
                    state: row.getAttribute('data-site-state'),
                    // the legend lists the tier without the "+", the chooser keeps it
                    label: row.getAttribute('data-site-btn') || (t ? t.textContent : ''),
                    points: parseFloat(row.getAttribute('data-site-points')) || 0,
                    color: (rect && rect.getAttribute('fill')) || '#888',
                    only: only ? only.split('|') : []
                };
                SITE_MARKS.push(m);
                SITE_POINTS[m.state] = m.points;
            }
        );
    }

    function collectSites() {
        siteNodes = svg ? Array.prototype.slice.call(svg.querySelectorAll('#transport .site')) : [];
        siteBoxes = null;
        readSiteMarks();
        readRailSegments();
        readRailLegs();
    }

    // A station counts as marked in **any scoring tier** (出入 / 換乘 / 駛過，点数 > 0
    // 即是标记）。沒經過 is stored by *deleting* the key, so a value left behind by a
    // hand edit (the sites map lives in localStorage) must not read as "marked" either.
    // Every judgement goes through here, so the main-line test and the tail test can
    // never drift apart: a two-state whitelist would drop the 換乘 tier out of the
    // railway lighting.
    function isMarkedState(st) {
        return !!st && SITE_POINTS[st] > 0;
    }

    function isMarked(name) {
        return isMarkedState(siteStates[name]);
    }

    // paint the markers: an unmarked station stays blue (no attribute), a marked
    // one gets data-state -> the hue-rotation rule baked into the SVG stylesheet
    function applySiteStates() {
        siteNodes.forEach(function (n) {
            var st = siteStates[n.getAttribute('data-name')];
            if (isMarkedState(st)) n.setAttribute('data-state', st);
            else n.removeAttribute('data-state');
        });
        paintRail();
    }

    // ---- 已點亮的區間：兩個相鄰站都標了，那一小段鐵路就換成綠色並泛光 ----
    // The build cut every line at its station vertices, so each leg is its own
    // anonymous `<g class="rseg">` holding the very same track symbol (two side
    // rails + dashed tie band). The SVG carries no station names: the build writes
    // the legs to assets/rail-data.json **in that same cut order**, and the two
    // are paired by DOM order here. Nothing is re-stroked — the leg only gains
    // `.lit`, and the SVG's own stylesheet turns that symbol green and gives it a
    // glow, which is also why the exported PNG carries the colouring. Paint is
    // driven from the one place every mark change funnels through
    // (`applySiteStates`), so 駛過 自動 fills light their legs too.
    //
    // Two kinds of piece, and only two:
    // * an **ordinary piece** lights when both of its end stations carry a mark;
    // * a **特例段** (RAIL_DATA.special / railSpecial) needs its own panel switch
    //   **and** every named end it has to be lit (出入 / 換乘 / 駛過 alike) — see
    //   specialLit(). A **tail** has one named end (the outermost station); 机场那两截
    //   have two (机场 + 揭阳站 / 潮汕站). The switch says "I rode this piece"; a station
    //   mark says "I did reach this station" — both, or the piece stays grey. Handing
    //   a piece to a switch is about the *marks not being enough* to infer it, never
    //   about the switch alone being enough to draw it.
    // 特例段点亮 = 开关开着 **且它每个具名端都亮着**：拖尾只有一个具名端（那一站），
    // 机场那两截有两个（机场 + 揭阳站 / 潮汕站）。开关说的是「这段我坐过」，站点标记
    // 说的是「确实到过这一站」——两头都得成立：只把开关推上去（比如人是飞到机场的、
    // 或者压根没到过潮汕站），那两截就还是灰的。机场是纯手动标记站（`railBypass`），
    // 所以「机场有没有标记」这件事只有用户自己说了算，页面不会替他补。
    function specialLit(label, leg) {
        if (!specialOn[label]) return false;
        for (var i = 0; i < 2; i++) {
            var nm = leg ? leg[i] : null;
            if (nm != null && !isMarked(nm)) return false;
        }
        return true;
    }

    function paintRail() {
        railSegsNodes.forEach(function (g, i) {
            var leg = railLegs[i], lit = false;
            var special = railSpecial[i];
            if (special != null) {
                lit = specialLit(special, leg);
            } else if (leg && leg[0] != null && leg[1] != null) {
                lit = isMarked(leg[0]) && isMarked(leg[1]);
            }
            // a null-ended piece no switch owns stays grey — the build refuses to
            // ship one (rail.assert_tails_switched)
            g.classList.toggle('lit', lit);
        });
    }

    function readRailLegs() {
        railSegsNodes = svg
            ? Array.prototype.slice.call(svg.querySelectorAll('#railways .rseg'))
            : [];
        railLegs = RAIL_DATA.legs || [];
        // A mismatch means the drawing and the data came from different builds:
        // paint nothing rather than light the wrong piece of railway.
        if (railSegsNodes.length !== railLegs.length) {
            if (window.console) {
                console.warn('rail legs mismatch: svg ' + railSegsNodes.length +
                             ' vs data ' + railLegs.length);
            }
            railLegs = [];
        }
        // 特例段：构建期已把每个开关解析成腿表里那一截，这里只按索引记住它，
        // 外加每个开关那一截的**两个具名端**（`railSpecialEnds`，端名从腿表读），
        // 供 `segOpen()` 判断这条路线上那一截到底能不能亮。
        railSpecial = {};
        railSpecialEnds = {};
        (RAIL_DATA.special || []).forEach(function (item) {
            if (item && item.leg != null && item.label) {
                railSpecial[item.leg] = item.label;
                railSpecialEnds[item.label] = railLegs[item.leg] || [];
            }
        });
        // 纯手动标记的站（机场）：构建期从表里推导，见 rail.inference_exempt
        railBypass = {};
        (RAIL_DATA.bypass || []).forEach(function (n) { railBypass[n] = true; });
    }

    // ---- 鐵路特例：不由站點標記推斷，只認面板開關 --------------------------
    // The drawer's 鐵路特例 section, built like the 開關 section above it (same
    // .layer-switch markup and CSS) but driving `paintRail()` instead of layer
    // visibility. The pieces it owns come from config.json's
    // `svg.lines.railways.special` via RAIL_DATA.special, so label and piece have
    // one definition, in the build.
    function buildRailSwitches() {
        if (!railSpecialBar) return;
        var saved = {};
        try { saved = JSON.parse(localStorage.getItem(RAIL_SPECIAL_KEY) || '{}') || {}; } catch (e) {}
        specialOn = {};
        railSpecialBar.innerHTML = '';
        (RAIL_DATA.special || []).forEach(function (item) {
            var label = item.label;
            var on = !!saved[label];
            specialOn[label] = on;
            var sw = doc.createElement('a');
            sw.className = 'layer-switch' + (on ? ' on' : '');
            sw.setAttribute('role', 'switch');
            sw.setAttribute('aria-checked', on ? 'true' : 'false');
            sw.setAttribute('data-special', label);
            sw.title = label;
            var labelEl = doc.createElement('span');
            labelEl.className = 'layer-label';
            labelEl.textContent = label;
            var track = doc.createElement('span');
            track.className = 'track';
            var knob = doc.createElement('span');
            knob.className = 'knob';
            track.appendChild(knob);
            // the switch comes first, its label after it (both layouts)
            sw.appendChild(track);
            sw.appendChild(labelEl);
            sw.addEventListener('click', function () {
                specialOn[label] = !specialOn[label];
                sw.classList.toggle('on', specialOn[label]);
                sw.setAttribute('aria-checked', specialOn[label] ? 'true' : 'false');
                try { localStorage.setItem(RAIL_SPECIAL_KEY, JSON.stringify(specialOn)); } catch (e) {}
                // 开关是把一截路**打开**，而区间推断只走亮着的路（segOpen）：所以打开
                // 之后要按新路线再补一次駛過——否则「先标站、后开开关」就补不上了。
                // 关上不回滚（填充是一次性的），只是从此不再补新的。
                fillPassBetween();
                paintRail();
                if (lockedSite) renderNoteButtons(lockedSite.getAttribute('data-name'));
            });
            railSpecialBar.appendChild(sw);
        });
        applySpecialOpen();
    }

    // 鐵路特例 是一节**可折叠**的开关组：标题常驻，六个开关默认收起。展开时面板
    // 会比视口高出近 100px（打开「對外客運設施」后图例还多三行），逼出滚动条、连
    // 带破坏「面板贴内容 / 图例居中」两条约定；收起则一切如常。展开与否记在本机。
    function readSpecialOpen() {
        try { specialOpen = localStorage.getItem(RAIL_SPECIAL_OPEN_KEY) === '1'; }
        catch (e) { specialOpen = false; }
    }

    function applySpecialOpen() {
        if (railSpecialBar) railSpecialBar.classList.toggle('collapsed', !specialOpen);
        if (railSpecialTitle) {
            railSpecialTitle.classList.toggle('collapsed', !specialOpen);
            railSpecialTitle.setAttribute('aria-expanded', specialOpen ? 'true' : 'false');
        }
    }

    function siteBoxesNow() {
        if (siteBoxes) return siteBoxes;
        siteBoxes = [];
        siteNodes.forEach(function (n) {
            var r = n.getBoundingClientRect();
            if (!r.width && !r.height) return;   // layer hidden -> not hittable
            siteBoxes.push({
                node: n, name: n.getAttribute('data-name') || '',
                x: r.left + r.width / 2, y: r.top + r.height / 2,
                r: r
            });
        });
        return siteBoxes;
    }

    // Fresh hit test — reads the live rects every time, never the `siteBoxes`
    // cache. Opening the legend drawer, a URL bar sliding away or a window
    // resize all re-centre the drawing through pure CSS, so no applyView() runs
    // and a cached box can point at where the marker *used* to be (the tap then
    // falls through to the county underneath). Twelve rect reads per tap is
    // nothing next to a miss.
    function hitSite(cx, cy, radius) {
        var best = null;
        siteNodes.forEach(function (n) {
            var r = n.getBoundingClientRect();
            if (!r.width && !r.height) return;   // layer hidden -> not hittable
            var b = {
                node: n, name: n.getAttribute('data-name') || '',
                x: r.left + r.width / 2, y: r.top + r.height / 2, r: r
            };
            var d = Math.sqrt(Math.pow(b.x - cx, 2) + Math.pow(b.y - cy, 2));
            if (d <= radius && (!best || d < best.d)) best = { d: d, box: b };
        });
        return best ? best.box : null;
    }

    // nearest marker regardless of distance — the hand-over rule ranks by this
    function nearestSite(cx, cy) {
        var best = null;
        siteBoxesNow().forEach(function (b) {
            var d = Math.sqrt(Math.pow(b.x - cx, 2) + Math.pow(b.y - cy, 2));
            if (!best || d < best.d) best = { d: d, box: b };
        });
        return best;
    }

    function siteInfo(node) {
        var sites = [];
        try { sites = JSON.parse(node.getAttribute('data-sites') || '[]') || []; } catch (e) {}
        if (!sites.length) {
            sites = [{ type: node.getAttribute('data-type') || 'station', name: node.getAttribute('data-name') || '' }];
        }
        return {
            name: node.getAttribute('data-name') || '',
            // the 屬地 line and the site names are *display* strings: the build bakes
            // them in Traditional (data-home / sites[].display) while data-name and
            // data-county stay the Simplified keys the page marks by.
            home: node.getAttribute('data-home') || node.getAttribute('data-county') || '',
            sites: sites
        };
    }

    // the card reuses the map's own icon <defs> (same document -> <use> works)
    function siteIcon(type, size) {
        var key = type === 'airport' ? 'airport' : 'station';
        var s = doc.createElementNS(SVG_NS, 'svg');
        s.setAttribute('class', 'sn-ico sn-ico-' + key);
        s.setAttribute('viewBox', '0 0 100 100');
        s.setAttribute('width', size);
        s.setAttribute('height', size);
        var u = doc.createElementNS(SVG_NS, 'use');
        u.setAttribute('href', '#ico-' + key);
        u.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#ico-' + key);
        s.appendChild(u);
        return s;
    }

    // Every button carries the tier's `only` list (if any); showing a card only
    // reveals the tiers allowed on **that** station, so 換乘 never shows up on a
    // station that is not a hub — and the card re-measures itself when it changes.
    function renderNoteButtons(name) {
        var cur = siteStates[name] || 'none';
        Array.prototype.forEach.call(noteEl.querySelectorAll('.sn-btn'), function (b) {
            b.classList.toggle('current', b.getAttribute('data-state') === cur);
            var only = b.getAttribute('data-only');
            b.style.display = !only || only.split('|').indexOf(name) >= 0 ? '' : 'none';
        });
    }

    // The chooser keeps the scoring tiers side by side at the title bar's height,
    // with the clearing row underneath — all of it comes from the same config list
    // the legend is built from (colours, labels and the 0-point tier included), so
    // 沒經過 is simply that list's 0-point entry. A tier restricted to a few stations
    // (`only`) still gets its button here: renderNoteButtons() decides per station
    // whether it is shown, so one chooser serves every card.
    function buildChooser() {
        noteFoot.innerHTML = '';
        var row = doc.createElement('div');
        row.className = 'sn-row';
        SITE_MARKS.forEach(function (m) {
            if (!m.points) return;                    // the clearing tier goes below
            var a = doc.createElement('a');
            a.className = 'sn-btn sn-mark';
            a.setAttribute('data-state', m.state);
            if (m.only && m.only.length) a.setAttribute('data-only', m.only.join('|'));
            a.style.background = m.color;
            a.textContent = m.label;
            row.appendChild(a);
        });
        noteFoot.appendChild(row);
        var clear = SITE_MARKS.filter(function (m) { return !m.points; })[0];
        var none = doc.createElement('a');
        none.className = 'sn-btn sn-none';
        none.setAttribute('data-state', clear ? clear.state : 'none');
        none.textContent = clear ? clear.label : COPY.clear_label;
        noteFoot.appendChild(none);
    }

    function renderNote(box) {
        var info = siteInfo(box.node);
        noteHead.innerHTML = '';
        info.sites.forEach(function (s) { noteHead.appendChild(siteIcon(s.type, 26)); });
        noteBody.innerHTML = '';
        var home = doc.createElement('div');
        home.className = 'sn-home';
        home.textContent = COPY.home_prefix + info.home;
        noteBody.appendChild(home);
        info.sites.forEach(function (s) {
            var line = doc.createElement('div');
            line.className = 'sn-line';
            line.appendChild(siteIcon(s.type, 18));
            var nm = doc.createElement('span');
            nm.className = 'sn-name';
            nm.textContent = s.display || s.name;
            line.appendChild(nm);
            if (s.platforms && s.tracks) {
                var sc = doc.createElement('span');
                sc.className = 'sn-scale';
                sc.textContent = COPY.card_scales
                    .replace('{platforms}', s.platforms)
                    .replace('{tracks}', s.tracks);
                line.appendChild(sc);
            }
            noteBody.appendChild(line);
        });
        renderNoteButtons(info.name);
    }

    function placeNote(box) {
        var r = lockedSite ? lockedSite.getBoundingClientRect() : box.r;
        var cx = r.left + r.width / 2;
        var cy = r.top + r.height / 2;
        lockEl.style.left = Math.round(root.scrollLeft + cx) + 'px';
        lockEl.style.top = Math.round(root.scrollTop + cy) + 'px';
        noteEl.hidden = false;
        if (narrow) { placeSheet(); return; }
        var nw = noteEl.offsetWidth, nh = noteEl.offsetHeight;
        var left = Math.round(root.scrollLeft + cx - nw / 2);
        left = Math.min(Math.max(left, MARGIN), Math.max(MARGIN, doc.body.offsetWidth - nw - MARGIN));
        var top = Math.round(root.scrollTop + cy - r.height / 2 - NOTE_GAP - nh);
        if (top < MARGIN) top = Math.round(root.scrollTop + cy + r.height / 2 + NOTE_GAP);
        noteEl.style.left = left + 'px';
        noteEl.style.top = top + 'px';
    }

    // Narrow twin of the bubble: a full-width sheet just above the legend drawer.
    // The map pane is deliberately NOT re-fitted (the drawing would shrink under
    // the finger); if the tapped marker ends up behind the sheet we lift the view
    // by exactly the overlap — which only has an effect while zoomed in, since
    // the fitted view is clamped to its own box.
    function placeSheet() {
        var w = doc.documentElement.clientWidth || window.innerWidth;
        noteEl.style.width = Math.max(0, w - 2 * MARGIN) + 'px';
        noteEl.style.left = MARGIN + 'px';
        var nh = noteEl.offsetHeight;
        // the drawer is an overlay on every layout now, so the sheet parks at the
        // foot of the *screen* rather than above the drawer's handle
        var vh = window.innerHeight || doc.documentElement.clientHeight;
        var top = Math.round(vh - SHEET_GAP - nh);
        var floor = Math.round(topbar.getBoundingClientRect().bottom) + SHEET_GAP;
        if (top < floor) top = floor;
        noteEl.style.top = top + 'px';
        if (sheetPan || !lockedSite) return;
        var m = svg.getScreenCTM();
        var need = lockedSite.getBoundingClientRect().bottom + SHEET_GAP - top;
        if (m && m.d && need > 0) {
            sheetPan = true;
            center.y += Math.min(need, 240) / m.d;
            applyView();          // re-enters here with sheetPan set -> one shot
            sheetPan = false;
        }
    }

    function lockSite(box) {
        if (lockedSite !== box.node) {
            if (lockedSite) lockedSite.classList.remove('hot');
            lockedSite = box.node;
            lockedSite.classList.add('hot');
            renderNote(box);
        }
        lockEl.hidden = false;
        placeNote(box);
        lockEl.classList.add('show');
        noteEl.classList.add('show');
    }

    // Retraction is immediate — the pointer only has to step clear of the marker
    // (UNLOCK_R) and of the card. A grace timer here looked harmless but was not:
    // while the mouse keeps travelling every move re-armed it, so a card could
    // never be shaken off mid-journey and the station the pointer was heading to
    // stayed locked out. The overlays still fade out (CSS), they just stop being
    // "the open card" the moment the pointer leaves.
    function unlockSite() {
        if (lockedSite) { lockedSite.classList.remove('hot'); lockedSite = null; }
        lockEl.classList.remove('show');
        noteEl.classList.remove('show');
        setTimeout(function () {
            if (!lockedSite) { lockEl.hidden = true; noteEl.hidden = true; }
        }, 200);
    }

    function siteDistance(node, cx, cy) {
        var d = Infinity;
        siteBoxesNow().forEach(function (b) {
            if (b.node !== node) return;
            d = Math.sqrt(Math.pow(b.x - cx, 2) + Math.pow(b.y - cy, 2));
        });
        return d;
    }

    // Ranking, in order: (1) the card's own rect — it is a rectangle and often
    // covers a neighbouring marker, so a pointer on it must never hand over;
    // (2) the nearest marker within UNLOCK_R — that is what makes two markers
    // sitting close together swap exactly at their midpoint; (3) the marker the
    // ring is locked on, while the pointer stays inside its UNLOCK_R (hysteresis);
    // (4) the card's walking corridor, keep-alive only — it must NOT outrank (2),
    // because a neighbouring marker often sits right in that corridor (机场 lies
    // in 潮汕站's corridor), and blocking there made the hand-over impossible.
    function maybeLock(cx, cy) {
        if (narrow || !layerState.transit) {
            if (lockedSite) unlockSite();
            return;
        }
        if (lockedSite && overCard(cx, cy)) return;
        var near = nearestSite(cx, cy);
        if (!lockedSite) {
            if (near && near.d <= LOCK_R) lockSite(near.box);
            return;
        }
        if (near && near.box.node !== lockedSite && near.d <= UNLOCK_R) {
            unlockSite();
            lockSite(near.box);
            return;
        }
        var d = siteDistance(lockedSite, cx, cy);
        if (d <= UNLOCK_R || nearNote(cx, cy)) {
            if (d <= LOCK_R) placeNote(null);   // keep the ring glued to it
            return;
        }
        unlockSite();
    }

    // the card's own rect, inflated a little: the one region that outranks the
    // nearest-marker rule
    function overCard(x, y) {
        var r = noteRect();
        return !!r && x >= r.left - NOTE_HOVER_PAD && x <= r.right + NOTE_HOVER_PAD
            && y >= r.top - NOTE_HOVER_PAD && y <= r.bottom + NOTE_HOVER_PAD;
    }

    // Keep-alive only: the card plus the straight corridor from the card down to
    // its own marker, so the trip to the buttons never crosses a dead band (the
    // marker's UNLOCK_R and the card's padded edge do not quite meet). It does not
    // grant priority — see maybeLock().
    function nearNote(x, y) {
        if (overCard(x, y)) return true;
        var r = noteRect();
        if (!r) return false;
        var m = null;
        siteBoxesNow().forEach(function (b) { if (b.node === lockedSite) m = b; });
        if (!m) return false;
        var x0 = Math.min(r.left, m.x), x1 = Math.max(r.right, m.x);
        var y0 = Math.min(r.top, m.y), y1 = Math.max(r.bottom, m.y);
        return x >= x0 && x <= x1 && y >= y0 && y <= y1;
    }

    function noteRect() {
        if (noteEl.hidden || !noteEl.classList.contains('show')) return null;
        return noteEl.getBoundingClientRect();
    }

    // The probe rides the document in the capture phase: while the card is up,
    // moves inside it target the card, not the svg — and those are exactly the
    // moves that must not retract it.
    doc.addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'mouse' || narrow || pointerCount() > 0) return;
        maybeLock(e.clientX, e.clientY);
    }, true);
    doc.addEventListener('mouseleave', function () {
        // A touch tap ends with a *synthesized* mouseleave on the document, which
        // must never retract the card that very tap just opened.
        if (narrow || touchSequence) return;
        if (lockedSite) unlockSite();
    });

    noteEl.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('.sn-btn') : null;
        if (!btn || !lockedSite) return;
        e.stopPropagation();
        var name = lockedSite.getAttribute('data-name');
        var st = btn.getAttribute('data-state');
        if (st === 'none' || siteStates[name] === st) {
            delete siteStates[name];
            // a hand-cleared station is off limits to 駛過 自動 from now on
            if (st === 'none') { railOff[name] = true; saveRailOff(); }
        } else {
            siteStates[name] = st;
            bumpCountiesOf([name]);   // a marked station lifts its county off 沒去過
        }
        saveSiteStates();
        applySiteStates();
        renderNoteButtons(name);
        updateScore();
        fillPassBetween();          // two marked stations fill the leg between them
        renderNoteButtons(name);    // …which may have marked this very card's station
        unlockSite();   // a picked tier (沒去過 included) retracts the card at once
    });

    function siteStateKey() { return SITE_STATE_KEY; }
    function loadSiteStates() {
        try { siteStates = JSON.parse(localStorage.getItem(siteStateKey()) || '{}') || {}; } catch (e) { siteStates = {}; }
    }
    function saveSiteStates() {
        try { localStorage.setItem(siteStateKey(), JSON.stringify(siteStates)); } catch (e) {}
    }

    // A station mark means you have been inside the county that station sits in, so
    // leaving that county at 沒去過 contradicts it — 路過 (the 1-point floor) is the
    // honest tier. The station data already carries the county name (`data-county`,
    // the same 简体 string as the region path's `id`), so this is a lookup, not a
    // spatial test.
    //
    // Only ever raises from 0: a hand-picked tier (including 沒去過 → 0) is never
    // overwritten, and clearing the station mark does not roll it back — same policy
    // as 駛過 自動, the mark once made is the user's own.
    function bumpCountyOf(name) {
        var county = '';
        for (var i = 0; i < siteNodes.length; i++) {
            if (siteNodes[i].getAttribute('data-name') === name) {
                county = siteNodes[i].getAttribute('data-county') || '';
                break;
            }
        }
        var p = county ? doc.getElementById(county) : null;
        if (!p || regionPaths.indexOf(p) < 0 || (p.getAttribute('level') || '0') !== '0') return false;
        p.setAttribute('level', '1');
        return true;
    }
    function bumpCountiesOf(names) {
        var hit = false;
        names.forEach(function (nm) { hit = bumpCountyOf(nm) || hit; });
        if (hit) saveLevels();
        return hit;
    }

    // ---- cross-station 駛過 (a convenience, never a rule) -------------------
    // 乘車區間表 comes from the build as **data** — `RAIL_DATA.segments`, read from
    // assets/rail-data.json (the map SVG itself carries no station
    // names): every station pair that has stations between it, as
    // [end, end, [中間站…], [開關…]]. Two stations meeting at a hub (潮汕站 joins
    // 广梅汕 with 杭深, 汕头站 joins 广梅汕 with 甬广) therefore sit in one entry, so a
    // route may change line — no graph search lives in the page.
    //
    // Whenever **two** stations carry a mark, the entry's 中間站 are filled
    // with 駛過 — but only where there is no mark of the user's own. A station
    // the user cleared by hand (沒去過) is remembered in `railOff` and is never
    // auto-filled again: the convenience never overrules a decision.
    function readRailSegments() {
        railSegs = {};
        (RAIL_DATA.segments || []).forEach(function (seg) {
            if (!seg || seg.length < 3) return;
            railSegs[railKey(seg[0], seg[1])] = { mid: seg[2], need: seg[3] || [] };
        });
    }

    function railKey(a, b) {
        return a < b ? a + '|' + b : b + '|' + a;
    }

    function loadRailOff() {
        try {
            railOff = JSON.parse(localStorage.getItem(RAIL_OFF_KEY) || '{}') || {};
        } catch (e) { railOff = {}; }
    }

    function saveRailOff() {
        try { localStorage.setItem(RAIL_OFF_KEY, JSON.stringify(railOff)); } catch (e) {}
    }

    // 揭阳潮汕国际机场 is **marking-only**: it neither seeds the fill nor gets filled
    // by it (`railBypass`, computed at build time from the tables — see
    // rail.inference_exempt). A mark on the airport says the user reached the
    // airport, by plane or by car, and nothing about riding the railway, so it must
    // not pull 潮汕站/潮安站 into 駛過 nor be pulled in itself.
    //
    // 一条区间要走得通，还得**沿途每一截都真的亮着**（`segOpen`）——推断只走地图画
    // 得出来的路，不替一条地图上是灰的路作证：
    // * `need`（构建期写进区间表第四项）是这条路线跨过的**特例段**开关。特例段之所
    //   以交给开关，正是因为站点标记说不了话（机场那两截——到过机场不等于坐梅汕线
    //   走过），所以标记再全也不能把一截关着的开关当成「经过」。少了这一条，饶平站
    //   + 揭阳站会沿「饶平—潮汕—机场—揭阳」把潮汕站填成駛過、连 饶平—潮汕 也点亮，
    //   而中间那两截机场线在图上正是灰的（用户报告的洞）。
    // * 中间站里有用户亲手清过的「沒去過」同样断路：他都说了没到过这一站，就没法
    //   从它身上穿过去（机场除外——它是纯手动标记站，双向豁免，见 railBypass）。
    // * 跨过的那一截还得**真亮得起来**：特例段两端具名站里，凡**填充不会去点**的那个
    //   （纯手动标记的机场）必须已经点亮——填充永远不碰它（双向豁免），缺了它那一截
    //   无论开关怎么拨都是灰的，那这条路就不该被推断（否则又回到「推断走过一截画成
    //   灰的路」）。另一端（揭阳站 / 潮汕站）本身就在这条路上，标记与填充自然会点亮它。
    //
    // Note the fill is **one-shot and never rolls back**: 开关事后关掉、或把某个中间站
    // 手工清掉，都不会撤销已经补上去的駛過标记（same as `railOff` itself）——自动填充
    // 只是便利，落下的标记从此算用户自己的。
    function segOpen(seg) {
        for (var i = 0; i < seg.need.length; i++) {
            var label = seg.need[i];
            if (!specialOn[label]) return false;
            var ends = railSpecialEnds[label] || [];
            for (var k = 0; k < ends.length; k++) {
                if (railBypass[ends[k]] && !isMarked(ends[k])) return false;
            }
        }
        for (var j = 0; j < seg.mid.length; j++) {
            if (!railBypass[seg.mid[j]] && railOff[seg.mid[j]]) return false;
        }
        return true;
    }

    function fillPassBetween() {
        var marked = Object.keys(siteStates).filter(function (nm) {
            return isMarked(nm) && !railBypass[nm];
        });
        var filled = false;
        var fresh = [];   // the stations this call actually added, for the county bump
        for (var i = 0; i < marked.length; i++) {
            for (var j = i + 1; j < marked.length; j++) {
                var seg = railSegs[railKey(marked[i], marked[j])];
                if (!seg || !segOpen(seg)) continue;
                seg.mid.forEach(function (nm) {
                    if (railBypass[nm] || isMarked(nm) || railOff[nm]) return;
                    siteStates[nm] = 'pass';
                    fresh.push(nm);
                    filled = true;
                });
            }
        }
        if (!filled) return false;
        bumpCountiesOf(fresh);
        saveSiteStates();
        applySiteStates();
        updateScore();
        return true;
    }

    // ---- view control: drag / pinch / wheel zoom over the map -------------
    // The whole map canvas, burnt-in title included: only ever a fallback (nothing
    // to measure), because on screen both layouts frame the counties — the export
    // still serialises the full canvas, and its size comes from the legend
    // fragment's data-canvas-* (falling back to VIEW_BOX), not from whatever the
    // element's viewBox happens to be.
    function fullVB() {
        return { x: 0, y: 0, w: VIEW_BOX.w, h: VIEW_BOX.h };
    }

    // Both layouts frame the *counties* — that plus the labels and station icons
    // is all the fit looks at, so the drawing sits centred and the burnt-in title
    // reserves no screen space (it stays in svg.innerHTML for the export; the
    // legend ships separately). The toggleable line overlays are excluded on
    // purpose: they are drawn beyond the region (韩江 is traced north to its
    // source, the railway tails run off both ends), so letting them drive the
    // box would either reserve empty sea or push the map off-centre; switched on,
    // their stray tails simply run past the edge. The revealed layers are restored
    // (applyLayers) before returning, so a toggle never punches a hole here.
    var FIT_GROUPS = { regions: 1, labels: 1, transport: 1 };
    function measureVB() {
        var box = null;
        Array.prototype.forEach.call(svg.querySelectorAll('[data-layer]'), function (n) {
            n.style.display = '';
        });
        for (var i = 0; i < svg.children.length; i++) {
            var el = svg.children[i];
            if (!FIT_GROUPS[el.id]) continue;
            var b;
            try { b = el.getBBox(); } catch (e) { b = null; }
            if (!b || !b.width || !b.height) continue;
            if (!box) box = { x: b.x, y: b.y, x2: b.x + b.width, y2: b.y + b.height };
            else {
                box.x = Math.min(box.x, b.x);
                box.y = Math.min(box.y, b.y);
                box.x2 = Math.max(box.x2, b.x + b.width);
                box.y2 = Math.max(box.y2, b.y + b.height);
            }
        }
        applyLayers();   // restore the layer visibility the user asked for
        if (!box) return fullVB();
        // breathing room, in canvas units: ~11px at phone width, ~23px on a tablet
        var pad = 28;
        return {
            x: box.x - pad, y: box.y - pad,
            w: box.x2 - box.x + 2 * pad, h: box.y2 - box.y + 2 * pad
        };
    }

    function applyView() {
        var w = homeVB.w / zoom, h = homeVB.h / zoom;
        var x = Math.min(Math.max(center.x - w / 2, homeVB.x), homeVB.x + homeVB.w - w);
        var y = Math.min(Math.max(center.y - h / 2, homeVB.y), homeVB.y + homeVB.h - h);
        center.x = x + w / 2;
        center.y = y + h / 2;
        svg.setAttribute('viewBox', x + ' ' + y + ' ' + w + ' ' + h);
        root.classList.toggle('zoomed', zoom > 1.001);
        siteBoxes = null;                       // screen boxes moved with the map
        if (lockedSite) placeNote(null);        // keep the ring glued to its marker
        // (the drawer's width is a layout quantity — see sizeDrawer: zooming and
        // panning must never resize the panel, so nothing about it happens here)
    }

    function resetView() {
        zoom = 1;
        center.x = homeVB.x + homeVB.w / 2;
        center.y = homeVB.y + homeVB.h / 2;
        applyView();
        rebasePan();
    }

    // keep `anchor` (user units) pinned under the finger / cursor while zooming
    function setZoomAnchored(z, anchor) {
        z = Math.min(Math.max(z, 1), ZOOM_MAX);
        var oldW = homeVB.w / zoom, oldH = homeVB.h / zoom;
        var newW = homeVB.w / z, newH = homeVB.h / z;
        if (anchor) {
            var fx = (anchor.x - (center.x - oldW / 2)) / oldW;
            var fy = (anchor.y - (center.y - oldH / 2)) / oldH;
            center.x = anchor.x + (0.5 - fx) * newW;
            center.y = anchor.y + (0.5 - fy) * newH;
        }
        zoom = z;
        applyView();
        rebasePan();   // a zoom mid-drag invalidates the pan snapshot
    }

    function toUser(clientX, clientY) {
        var m = svg.getScreenCTM();
        if (!m) return null;
        var p = svg.createSVGPoint ? svg.createSVGPoint() : new DOMPoint();
        p.x = clientX;
        p.y = clientY;
        var q = p.matrixTransform(m.inverse());
        return { x: q.x, y: q.y };
    }

    function toggleZoomAt(clientX, clientY) {
        closePopup();
        if (zoom > 1.001) { resetView(); return; }
        setZoomAnchored(2.5, toUser(clientX, clientY));
    }

    // Pan against an *absolute* anchor instead of frame-to-frame deltas: the
    // grabbed point stays exactly under the cursor, and clamping can never
    // desync the two (turning around at an edge responds at once). Client
    // pixels are turned into user units with the CTM's scale, so nothing here
    // reads the live viewBox — with deltas the anchor has to be re-projected
    // after every applyView(), and getting that wrong makes the map advance in
    // alternating jumps (move, hold, move, hold) at half speed.
    function startPan(clientX, clientY) {
        var m = svg.getScreenCTM();
        panStart = m
            ? {
                cx: clientX, cy: clientY,
                kx: m.a || 1, ky: m.d || 1,
                center: { x: center.x, y: center.y }
            }
            : null;
    }

    // re-anchor mid-gesture: after a zoom change the snapshot above is stale
    function rebasePan() {
        var ids = Object.keys(pointers);
        if (panStart && ids.length === 1) startPan(pointers[ids[0]].x, pointers[ids[0]].y);
    }

    function panTo(clientX, clientY) {
        if (!panStart) return;
        center.x = panStart.center.x - (clientX - panStart.cx) / panStart.kx;
        center.y = panStart.center.y - (clientY - panStart.cy) / panStart.ky;
        applyView();
    }

    function pointerCount() { return Object.keys(pointers).length; }
    function midClient() {
        var ids = Object.keys(pointers);
        var a = pointers[ids[0]], b = pointers[ids[1]];
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
    function spread() {
        var ids = Object.keys(pointers);
        var a = pointers[ids[0]], b = pointers[ids[1]];
        return Math.max(1, Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2)));
    }

    // Lazy pointer capture: capturing on pointerdown makes the follow-up `click`
    // target the capturing element (the root <svg>), which killed county picking
    // — the click never reached #regions. Capture is taken only once a real
    // drag/pinch starts (that click is swallowed anyway), so a plain click/tap
    // still lands on the region path while drags stay robust off the map.
    function capturePointers() {
        if (!svg.setPointerCapture) return;
        Object.keys(pointers).forEach(function (id) {
            if (captured[id]) return;
            try { svg.setPointerCapture(+id); captured[id] = true; } catch (err) {}
        });
    }

    function onPointerDown(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        // desktop: any press dismisses the station card. Narrow: the *tap*
        // handler decides, otherwise a tap on a station would blink the sheet
        // off on pointerdown and straight back on pointerup.
        if (lockedSite && !narrow) unlockSite();
        touchSequence = e.pointerType !== 'mouse';
        suppressClick = false;
        pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        if (pointerCount() === 1) {
            downAt = { x: e.clientX, y: e.clientY };
            startPan(e.clientX, e.clientY);
        } else if (pointerCount() === 2) {
            if (lockedSite) unlockSite();   // a pinch puts the narrow sheet away
            var mc = midClient();
            pinch = { d0: spread(), zoom0: zoom, prevMid: toUser(mc.x, mc.y) };
            capturePointers();
        }
        svg.classList.add('dragging');
        root.classList.add('dragging');
    }

    function onPointerMove(e) {
        if (!pointers[e.pointerId]) return;
        // A mouse released outside the browser window never delivers its
        // pointerup, so it would stay tracked and the next hover would pan the
        // map. `buttons` is the ground truth for a mouse (0 = no button down).
        if (e.pointerType === 'mouse' && e.buttons === 0) { dropGesture(e.pointerId); return; }
        pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        if (pointerCount() >= 2 && pinch) {
            var mc = midClient();
            var m = toUser(mc.x, mc.y);
            if (m && pinch.prevMid) {
                center.x -= m.x - pinch.prevMid.x;
                center.y -= m.y - pinch.prevMid.y;
                pinch.prevMid = m;
            }
            setZoomAnchored(pinch.zoom0 * (spread() / pinch.d0), m);
            suppressClick = true;
            return;
        }
        if (pointerCount() === 1 && panStart) {
            var moved = downAt
                ? Math.sqrt(Math.pow(e.clientX - downAt.x, 2) + Math.pow(e.clientY - downAt.y, 2))
                : 0;
            if (moved > 6) {
                suppressClick = true;   // a swipe must not select a county
                if (narrow && lockedSite) unlockSite();
                capturePointers();
            }
            panTo(e.clientX, e.clientY);
        }
    }

    // Forget one pointer (and, unless a single finger is left, the whole gesture)
    // **without** running the tap / double-tap half of onPointerUp: this also
    // fires for a mouse that is merely hovering with no button down, and a hover
    // must never count as a tap. One finger left means the caller is mid-gesture
    // (a pinch that just became a drag) and keeps the anchor.
    function dropGesture(pointerId) {
        delete pointers[pointerId];
        delete captured[pointerId];
        if (pointerCount() === 1) return;
        pinch = null;
        panStart = null;
        downAt = null;
        svg.classList.remove('dragging');
        root.classList.remove('dragging');
    }

    function onPointerUp(e) {
        if (!pointers[e.pointerId]) return;
        delete pointers[e.pointerId];
        if (captured[e.pointerId]) {
            delete captured[e.pointerId];
            if (svg.releasePointerCapture) { try { svg.releasePointerCapture(e.pointerId); } catch (err) {} }
        }
        if (pointerCount() === 1) {
            // a pinch just became a one-finger drag: re-anchor on the live view
            var id = Object.keys(pointers)[0];
            downAt = { x: pointers[id].x, y: pointers[id].y };
            pinch = null;
            startPan(pointers[id].x, pointers[id].y);
            return;
        }
        dropGesture(e.pointerId);
        if (suppressClick) return;
        if (e.pointerType === 'mouse' && !narrow) return;   // desktop mouse uses hover + dblclick
        // narrow: a tap on a station opens its sheet — and that same tap must not
        // also count toward the double-tap zoom (the station wins outright).
        // Hover is off under narrow, so a mouse in a merely narrowed window must not
        // fall between the two paths: this branch takes it, and the mouse leaves before
        // the touch double-tap below.
        if (narrow) {
            var tapped = hitSite(e.clientX, e.clientY, TAP_R);
            if (tapped) {
                lastTap = null;
                suppressClick = true;    // the tap belongs to the station, not the county
                lockSite(tapped);
                return;
            }
            if (lockedSite) unlockSite();   // a tap on the map puts the sheet away
            if (e.pointerType === 'mouse') return;   // no double-tap for a mouse: dblclick zooms
        }
        var now = Date.now();                                     // touch double-tap
        if (lastTap && now - lastTap.t < 320 &&
            Math.sqrt(Math.pow(e.clientX - lastTap.x, 2) + Math.pow(e.clientY - lastTap.y, 2)) < 36) {
            lastTap = null;
            suppressClick = true;   // the zoom must not also open the level popup
            toggleZoomAt(e.clientX, e.clientY);
        } else {
            lastTap = { t: now, x: e.clientX, y: e.clientY };
        }
    }

    function bindView() {
        svg.addEventListener('pointerdown', onPointerDown);
        svg.addEventListener('pointermove', onPointerMove);
        // The end of a gesture is bound on `window`, not on the svg: capture is
        // lazy (`capturePointers()` only runs once a drag passes 6px), so a press
        // that barely moved and was released *off* the map sent its pointerup to
        // whatever element sat under the cursor — the svg never heard it, and the
        // stranded `pointers` entry plus `panStart` turned the next plain hover
        // into a live drag. Captured pointers are retargeted to the svg and bubble
        // up here, so one handler still covers both paths.
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
        // The drawer is an overlay and never resizes the pane, but the pane does
        // change size with the window: the drawing re-centres through **pure CSS**
        // — no applyView() runs, so the reticle has to be re-placed here or it hangs
        // where the marker was.
        if (window.ResizeObserver) {
            new ResizeObserver(function () {
                if (narrow && lockedSite) placeNote(null);
            }).observe(svg);
        }
        svg.addEventListener('dblclick', function (e) {
            // A double *tap* is already handled in onPointerUp (a synthesized
            // dblclick follows it too — acting on both zoomed and then instantly
            // reset). Mouse has no tap handler, so it uses dblclick.
            if (touchSequence) return;
            e.preventDefault();
            toggleZoomAt(e.clientX, e.clientY);
        });
        svg.addEventListener('wheel', function (e) {
            e.preventDefault();
            var step = e.deltaMode === 1 ? 0.05 : 0.0016;
            setZoomAnchored(zoom * Math.exp(-e.deltaY * step), toUser(e.clientX, e.clientY));
        }, { passive: false });
        // a swipe/pinch ends with a click on the map: swallow exactly that one
        doc.addEventListener('click', function (e) {
            if (!suppressClick) return;
            suppressClick = false;
            e.stopPropagation();
            e.preventDefault();
        }, true);
    }

    // A colour band's label is white ink on the saturated tiers but dark ink on a
    // pale one (the 0-point 沒經過 band) — brightness decides, so config.json stays
    // free to recolour a tier without stranding its text.
    function bandIsLight(color) {
        var m = /^#?([0-9a-f]{6})$/i.exec(String(color || '').trim());
        if (!m) return false;
        var n = parseInt(m[1], 16);
        return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) >= 150;
    }

    // ---- narrow-screen chrome: top bar + collapsible legend drawer --------
    function buildChrome() {
        var t = svg.querySelector('#header .title');
        var s = svg.querySelector('#header .subtitle');
        tbTitle.textContent = t ? t.textContent : '';
        tbSub.textContent = s ? s.textContent : '';
        // the drawer is the page's whole control panel now, not just the legend; its
        // label and section titles come from the build ({{COPY:…}} tokens)
        buildDrawer();
        var saved = null;
        try { saved = localStorage.getItem(DRAWER_KEY); } catch (e) {}
        setDrawer(saved === '1');
    }

    // The drawer is built from the legend fragment's rows (text + symbol, cloned so
    // the icons keep sharing the map's one <defs>) as three columns: the county bands,
    // the station tiers, and everything else — 今屬他市 + the toggleable rows. Wide
    // screens read them as three stacked blocks (`.drawer-legend` is
    // `flex-direction: column` there), phones put the three side by side. Colour rows
    // (the six county levels, the four tiers, 今屬他市) are drawn as bands with the
    // label inside, like the fragment's own legend; symbol rows keep their mark.
    function buildDrawer() {
        if (!drawerLegend || drawerLegend.children.length) return;
        var rows = legendRoot
            ? legendRoot.querySelectorAll('#legend-rows > .lg-row')
            : [];
        var colLevel = doc.createElement('div');
        colLevel.className = 'lg-col lg-col-level';
        var colSite = doc.createElement('div');
        colSite.className = 'lg-col lg-col-site';
        var colRest = doc.createElement('div');
        colRest.className = 'lg-col lg-col-rest';
        drawerLegend.appendChild(colLevel);
        drawerLegend.appendChild(colSite);
        drawerLegend.appendChild(colRest);
        var group = null;
        var box = null;
        Array.prototype.forEach.call(rows, function (row) {
            var textEl = row.querySelector('text');
            var g = row.getAttribute('data-lg-group') || 'other';
            if (!textEl || g === 'divider') return;
            var host = g === 'level' ? colLevel : (g === 'sitelevel' ? colSite : colRest);
            if (!box || g !== group || box.parentNode !== host) {
                group = g;
                box = doc.createElement('div');
                box.className = 'lg-group';
                box.setAttribute('data-group', g);
                host.appendChild(box);
            }
            var item = doc.createElement('span');
            item.className = 'lg-item';
            var layer = row.getAttribute('data-layer');
            if (layer) item.setAttribute('data-layer', layer);
            var label = doc.createElement('span');
            label.className = 'lg-text';
            label.textContent = textEl.textContent;

            var bandFill = null;
            Array.prototype.forEach.call(row.querySelectorAll('rect'), function (r) {
                var f = r.getAttribute('fill');
                if (!bandFill && f && f !== 'none') bandFill = f;
            });
            if (bandFill && (g === 'level' || g === 'note' || g === 'sitelevel')) {
                item.className = 'lg-item lg-band'
                    + (g === 'note' ? ' lg-band-note' : '')
                    // white ink on the saturated tiers, dark ink on a pale one
                    + (g === 'sitelevel' && !bandIsLight(bandFill) ? ' lg-band-strong' : '');
                item.style.background = bandFill;
                item.appendChild(label);
                box.appendChild(item);
                return;
            }

            var vbW = 46, vbH = 46;
            Array.prototype.forEach.call(row.querySelectorAll('rect'), function (r) {
                if (r.getAttribute('fill') === 'none' && r.getAttribute('stroke') === 'none') {
                    vbW = parseFloat(r.getAttribute('width')) || vbW;
                    vbH = parseFloat(r.getAttribute('height')) || vbH;
                }
            });
            var mark = doc.createElementNS(SVG_NS, 'svg');
            mark.setAttribute('class', 'lg-mark');
            mark.setAttribute('viewBox', '0 0 ' + vbW + ' ' + vbH);
            Array.prototype.forEach.call(row.children, function (ch) {
                var tag = ch.tagName.toLowerCase();
                if (tag === 'text') return;
                if (tag === 'rect' && ch.getAttribute('fill') === 'none' && ch.getAttribute('stroke') === 'none') return;
                // importNode, not cloneNode: the row belongs to the fragment's own
                // (detached) document, and the <use> it carries has to resolve against
                // the injected map's <defs> once it is in *this* document
                mark.appendChild(doc.importNode(ch, true));
            });
            item.appendChild(mark);
            item.appendChild(label);
            box.appendChild(item);
        });
    }

    // Wide screens: the panel hugs its content (CSS gives .drawer-body
    // `width: max-content`), so all this does is publish that width as --drawer-w,
    // which is what the handle's ride-out measures itself by. It is a **layout**
    // quantity: nothing here reads the map's zoom or the canvas' legend column, so
    // zooming/panning never resizes the panel and no slack is left on its right.
    // On a phone the drawer is a footer block: no width.
    function sizeDrawer() {
        if (!drawer) return;
        if (narrow || !drawerBody) {
            // narrow is a footer block: no width, and the wide measurement's min-width
            // must go with it or the slab would stay wider than a 240px screen
            if (drawerBody) drawerBody.style.minWidth = '';
            drawer.style.removeProperty('--drawer-w');
            return;
        }
        drawerBody.style.minWidth = '';   // measure the natural width first
        // Measure with *every* row laid out: the panel has to fit 對外客運設施 and the
        // unfolded 鐵路特例 even while either is hidden, otherwise flipping a switch
        // would resize the rail. (Hidden rows carry an inline display:none.)
        var off = [];
        Array.prototype.forEach.call(drawerBody.querySelectorAll('[data-layer]'), function (n) {
            if (n.style.display === 'none') { off.push(n); n.style.display = ''; }
        });
        // 收起的 鐵路特例 也按展开态量：否则一展开面板就变宽，把手跟着跳
        var folded = !!(railSpecialBar && railSpecialBar.classList.contains('collapsed'));
        if (folded) railSpecialBar.classList.remove('collapsed');
        var w = Math.round(drawerBody.getBoundingClientRect().width);
        if (folded) railSpecialBar.classList.add('collapsed');
        off.forEach(function (n) { n.style.display = 'none'; });
        // That width has to be published **twice**: as --drawer-w (how far the handle
        // rides out) *and* as the panel's min-width, so the two can never disagree.
        // The measured number is the *unfolded* panel's, scrollbar and all — style.css
        // reserves that lane with `scrollbar-gutter: stable` so folding the section
        // back does not shrink the box, and this pin covers engines that do not
        // implement the gutter (pre-18.2 WebKit, i.e. most in-app browsers).
        if (w > 160) {
            drawerBody.style.minWidth = w + 'px';
            drawer.style.setProperty('--drawer-w', w + 'px');
        } else {
            drawerBody.style.minWidth = '';
            drawer.style.removeProperty('--drawer-w');
        }
    }

    function setDrawer(open) {
        drawer.classList.toggle('open', open);
        drawerBar.setAttribute('aria-expanded', open ? 'true' : 'false');
        try { localStorage.setItem(DRAWER_KEY, open ? '1' : '0'); } catch (e) {}
        sizeDrawer();
        siteBoxes = null;   // the pane may have moved: hover boxes are stale
    }

    drawerBar.addEventListener('click', function () {
        setDrawer(!drawer.classList.contains('open'));
    });

    function enterNarrow() {
        if (narrow) return;
        narrow = true;
        root.setAttribute('data-narrow', '');
        // The drawing simply centres in the map pane (default preserveAspectRatio
        // xMidYMid): the pane spans the free area above the drawer's handle, and the
        // drawer overlays rather than re-fits, so opening/closing it leaves the map
        // exactly where it was — even margins, no touching the title/score.
        svg.removeAttribute('preserveAspectRatio');
        homeVB = measureVB();
        resetView();
        siteBoxes = null;    // hover is desktop-only; drop any live lock
        if (lockedSite) unlockSite();
    }

    function exitNarrow() {
        if (!narrow) return;
        narrow = false;
        root.removeAttribute('data-narrow');
        svg.removeAttribute('preserveAspectRatio');
        homeVB = measureVB();   // wide screens frame the counties too (no legend column)
        resetView();
        applyLayers();       // the layer switches are layout-independent: re-apply anyway
        siteBoxes = null;
    }

    function applyNarrowMode() {
        if (NARROW_Q.matches) enterNarrow();
        else exitNarrow();
        sizeDrawer();
        siteBoxes = null;   // the pane just changed size: hover boxes are stale
    }

    // 禁止 ctrl/⌘ + 滚轮 与 双指捏合缩放整页（避免图例/页脚文字被放大缩小）。
    root.addEventListener('wheel', function (e) {
        if (e.ctrlKey || e.metaKey) e.preventDefault();
    }, { passive: false });
    root.addEventListener('touchmove', function (e) {
        if (e.scale !== 1) e.preventDefault();
    }, { passive: false });

    function getLevels() {
        return regionPaths.map(function (p) { return p.getAttribute('level') || '0'; });
    }
    // Marks are keyed by county **name**, not by position: adding, removing or
    // re-ordering a county would otherwise shift every stored mark one slot and land
    // them on their neighbours. `p.id` is the county name the rest of the page
    // already keys on (`#regions path` ids, the stations' `data-county`).
    function saveLevels() {
        var out = {};
        regionPaths.forEach(function (p) {
            var v = p.getAttribute('level') || '0';
            if (p.id && v !== '0') out[p.id] = v;
        });
        try { localStorage.setItem(STORE_KEY, JSON.stringify(out)); } catch (e) {}
    }
    function readLevels() {
        var raw = '';
        try { raw = localStorage.getItem(STORE_KEY) || ''; } catch (e) { return {}; }
        if (!raw || raw.charAt(0) !== '{') return {};
        try { return JSON.parse(raw) || {}; } catch (e) { return {}; }
    }
    function applyLevels() {
        var saved = readLevels();
        regionPaths.forEach(function (p) {
            p.setAttribute('level', (p.id && saved[p.id]) || '0');
        });
    }
    function updateScore() {
        var levels = getLevels().map(Number);
        var sum = levels.reduce(function (a, b) { return a + b; }, 0);
        var count = levels.filter(function (v) { return v > 0; }).length;
        // station marks add their own points (出入 +3 / 換乘 +2 / 駛過 +1); stale keys
        // of a renamed station are ignored by walking the live markers instead
        var siteSum = 0, siteCount = 0;
        siteNodes.forEach(function (n) {
            var st = siteStates[n.getAttribute('data-name')];
            if (isMarkedState(st)) { siteSum += SITE_POINTS[st]; siteCount += 1; }
        });
        scoreText.textContent = COPY.score_prefix + (sum + siteSum);
        if (tbScore) tbScore.textContent = scoreText.textContent;
        updateResetState(count > 0 || siteCount > 0);
    }

    // 「重置」借叠层开关的灰黑两态：全 0（初始化状态）置虚不可点，有标记置黑可点。
    function updateResetState(anyMarked) {
        if (!resetBtn) return;
        resetBtn.classList.toggle('off', !anyMarked);
        resetBtn.setAttribute('aria-disabled', anyMarked ? 'false' : 'true');
    }

    // The county popup speaks the same language as the station card: `hidden`
    // plus `.show`, with opacity/translateY in CSS, so the menu rises out of the
    // county and sinks back the moment a tier is picked — instead of the old
    // hard display:block / display:none switch, which was the one chooser in the
    // page with no float-in at all.
    function closePopup() {
        if (popup.hidden) return;
        popup.classList.remove('show');
        clearTimeout(popup._hideTimer);
        popup._hideTimer = setTimeout(function () {
            popup.hidden = true;
            popupTitle.textContent = '';
        }, 200);
    }

    function onRegionClick(e) {
        e.stopPropagation();
        var el = e.target;
        while (el && el.tagName !== 'path') el = el.parentNode;
        if (!el || !el.id) return;
        popup._target = el;
        var cur = el.getAttribute('level') || '0';
        var open = !popup.hidden && popup.classList.contains('show');
        popupTitle.textContent = el.getAttribute('data-label') || el.id;
        Array.prototype.forEach.call(popupLinks, function (a) {
            a.classList.toggle('current', a.getAttribute('data-level') === cur);
        });
        clearTimeout(popup._hideTimer);
        popup.hidden = false;
        if (!open) popup.classList.remove('show');   // always fade in from 0
        var r = el.getBoundingClientRect();
        // reading the rect forces a reflow, i.e. the opacity:0 state is committed
        // before .show lands — without it the transition is skipped
        var p = popup.getBoundingClientRect();
        var left = Math.round(root.scrollLeft + r.left + r.width / 2 - p.width / 2);
        left = Math.min(left, doc.body.offsetWidth - p.width - MARGIN);
        left = Math.max(left, MARGIN);
        var top = Math.round(root.scrollTop + r.top + r.height / 2 - p.height / 2);
        top = Math.min(top, doc.body.offsetHeight - p.height - MARGIN);
        top = Math.max(top, MARGIN);
        popup.style.left = left + 'px';
        popup.style.top = top + 'px';
        popup.classList.add('show');
    }

    doc.addEventListener('click', closePopup);

    popup.addEventListener('click', function (e) {
        e.stopPropagation();
        var lv = e.target.getAttribute('data-level');
        if (lv === null) return;
        var target = popup._target;
        if (!target) return;
        target.setAttribute('level', lv);
        updateScore();
        saveLevels();
        closePopup();
    });

    // ---- 保存成图片 ----
    function download(url, name) {
        var a = doc.createElement('a');
        if (!/weibo|qq/i.test(navigator.userAgent)) a.download = name;
        a.href = url;
        a.click();
    }

    // The exported picture is a thing to share, not the operator's panel: it keeps
    // only the two 制霸等级 stacks + 今屬他市 — the fragment's rows carrying a
    // data-layer (內陸河流 / 客運鐵路 / 机场 / 车站) are dropped. Every number is
    // baked at build time: the rows already sit in the shot's single column at the
    // bottom-right corner, and the fragment root carries the shot's canvas size
    // (data-canvas-*) — the map canvas alone is narrower than the legend block needs.
    // So this measures nothing; the panel, meanwhile, lists all 15 rows.
    function shotLegend() {
        if (!legendRoot) return null;
        var g = legendRoot.querySelector('#legend');
        if (!g) return null;
        g = g.cloneNode(true);
        Array.prototype.forEach.call(g.querySelectorAll('.lg-row[data-layer]'), function (row) {
            row.parentNode.removeChild(row);   // operator-only row: not in the shot
        });
        return g;
    }

    function shotSize() {
        if (!legendRoot) return null;
        var w = parseFloat(legendRoot.getAttribute('data-canvas-w'));
        var h = parseFloat(legendRoot.getAttribute('data-canvas-h'));
        return (w && h) ? { w: w, h: h } : null;
    }

    // Every exit from saveImage must release the busy lock: `html[data-running]
    // body` is `pointer-events: none`, so a shot whose image never loads (or whose
    // canvas refuses to serialise) must not leave the page dead.
    function saveImage() {
        if (!svg || !VIEW_BOX) return; // map not ready yet
        unlockSite();                  // never bake the hover overlays into a shot
        root.setAttribute('data-running', '');
        var released = false;
        function finish() {
            if (released) return;
            released = true;
            root.removeAttribute('data-running');
        }
        // the shot's canvas comes from the legend fragment (falls back to the map's)
        var size = shotSize();
        var W = (size && size.w) || VIEW_BOX.w;
        var H = (size && size.h) || VIEW_BOX.h;
        var shot = svg.cloneNode(true);
        var legendEl = shotLegend();
        var legendStyle = legendRoot && legendRoot.querySelector('style');
        exportFonts.then(function (fontCss) {
            var styleTag = fontCss ? '<style>' + fontCss + '</style>' : '';
            var xml = '<?xml version="1.0" encoding="utf-8"?>' +
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + 'px" height="' + H + 'px">' +
                styleTag + (legendStyle ? legendStyle.outerHTML : '') + shot.innerHTML +
                (legendEl ? new XMLSerializer().serializeToString(legendEl) : '') +
                '</svg>';
            var url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }));
            var img = new Image();
            img.onerror = function () { URL.revokeObjectURL(url); finish(); };
            img.onload = function () {
                // the bitmap is in hand: the source blob can go. The PNG's own URL
                // stays alive — the output panel keeps showing it.
                URL.revokeObjectURL(url);
                var canvas = doc.createElement('canvas');
                var scale = 2;
                canvas.width = W * scale;
                canvas.height = H * scale;
                var ctx = canvas.getContext('2d');
                // The page background, read back off the computed style rather than
                // repeated here: a canvas has no CSS, but the one flat colour
                // style.css `html` paints is all there is to carry over. Reading it
                // keeps that rule the single source — a colour copied into this file
                // would drift the moment the stylesheet changes.
                ctx.fillStyle = getComputedStyle(document.documentElement).backgroundColor;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, W, H, 0, 0, W * scale, H * scale);
                canvas.toBlob(function (blob) {
                    if (!blob) { finish(); return; }   // un-serialisable canvas
                    var outUrl = URL.createObjectURL(blob);
                    outputImg.src = outUrl;
                    output.hidden = false;
                    setTimeout(function () {
                        download(outUrl, FILE_NAME);
                        finish();
                    }, 50);
                });
            };
            img.src = url;
        }).catch(finish);   // a throw anywhere above must not keep the lock
    }

    // 「重置」清的只是**标记**：所有点亮的行政区与站点一起归零，连「这个站我手工清过」
    // 的记忆（`railOff`）也一并忘掉。它**不动视图态**——控制面板抽屉保持原样，八个开关
    // （內陸河流 / 對外客運設施 + 六个 鐵路特例）的开关状态一个都不改。
    //
    // 开关本来也无须归零：特例段要点亮必须「开关开着 **且** 每个具名端都有标记」
    // （specialLit），标记全清之后它们自然全灰。所以这里既不删 `RAIL_SPECIAL_KEY`
    // 也不重建开关——那会把用户推上去的开关一并抹掉。
    function resetAll() {
        if (!regionPaths.length) return; // map not ready yet
        if (resetBtn.classList.contains('off')) return; // nothing marked -> disabled
        if (!window.confirm(COPY.confirm_reset)) return;
        try { localStorage.removeItem(STORE_KEY); } catch (e) {}
        try { localStorage.removeItem(siteStateKey()); } catch (e) {}
        try { localStorage.removeItem(RAIL_OFF_KEY); } catch (e) {}
        railOff = {};
        regionPaths.forEach(function (p) { p.setAttribute('level', '0'); });
        siteStates = {};
        applySiteStates();   // also repaints the railway: no mark -> every piece grey
        if (lockedSite) renderNoteButtons(lockedSite.getAttribute('data-name'));
        updateScore(); // 歸零後重置鈕自動回到置虛態
    }

    saveBtn.addEventListener('click', saveImage);
    resetBtn.addEventListener('click', resetAll);
    closeBtn.addEventListener('click', function () { output.hidden = true; });

    boot();
})();
