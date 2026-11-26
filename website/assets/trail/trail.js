/*
 * Frigg hero "trail" backdrop.
 *
 * Ported from lefthook.com (apps/marketing-site/components/homepage/hero-backdrops/
 * TrailBackdrop.tsx + trail-geometry.ts) to plain browser JS: no build, no modules.
 *
 *   <link rel="stylesheet" href="assets/trail/trail.css">
 *   <script src="assets/trail/icons.js" defer></script>
 *   <script src="assets/trail/trail.js" defer></script>
 *   var t = window.FriggTrail.mount(el, { avoid: ['.hero-copy', '.term'] });
 *   t.destroy();
 *
 * Concept: three routes run from off-screen to off-screen through drifting app
 * chips. Each carries one pulse of light (Frigg green, dawn orange, a muted
 * blue) with a comet tail. When a pulse reaches a chip it SPLITS, runs around
 * both sides of the tile's rounded border, and rejoins on the far side.
 *
 * Mechanics: one requestAnimationFrame loop (paused when the backdrop is
 * off-screen or the tab is hidden, never started under prefers-reduced-motion)
 * moves every chip parametrically and rebuilds each route's two fork paths
 * (`over` and `under`) in pixel space. The light itself is pure CSS: every fork
 * is a <path pathLength=1000> in <defs>, drawn by four <use> strokes (head,
 * halo, two tails) animating stroke-dashoffset over a 1400-unit period, so the
 * pulse spends the last ~30% of each cycle beyond the path's end (off-screen)
 * and never wraps onto itself.
 *
 * Frigg-specific: chips keep out of a "reading well" around the elements named
 * by `options.avoid` (measured live), so the headline and terminal stay legible
 * whatever the viewport. A chip that cannot be placed clear of them is hidden
 * and dropped from its route. Colours come from the page's CSS custom
 * properties and are re-read on theme change (`recolor()`; also exposed as
 * window.__weaveRecolor for the site's existing theme toggle).
 *
 * Chips are tappable: a tap pops the tile, shows the app's brand colour and
 * name, and restarts that route's pulse at the tapped chip.
 */
(function () {
  'use strict';

  // ---------- geometry (trail-geometry.ts) ----------

  /** How far outside the tile border the light runs. */
  var GAP = 5;
  /** Tile corner radius at scale 1. */
  var TILE_RADIUS = 16;
  /** Head dash length in normalised path units. */
  var HEAD = 18;
  /** Dash period in normalised path units (paths are pathLength=1000). */
  var PERIOD = 1400;

  /** Sides in clockwise order; index arithmetic below relies on this order. */
  var SIDES = ['left', 'top', 'right', 'bottom'];
  /** Direction of clockwise travel ALONG each side. */
  var ALONG = { left: { x: 0, y: -1 }, top: { x: 1, y: 0 }, right: { x: 0, y: 1 }, bottom: { x: -1, y: 0 } };
  /** Outward normal of each side. */
  var OUT = { left: { x: -1, y: 0 }, top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 } };

  function mid(c, h, side) { return { x: c.x + OUT[side].x * h, y: c.y + OUT[side].y * h }; }
  function add(p, d, k) { return { x: p.x + d.x * k, y: p.y + d.y * k }; }
  function fmt(p) { return p.x.toFixed(1) + ' ' + p.y.toFixed(1); }
  function opposite(side) { return SIDES[(SIDES.indexOf(side) + 2) % 4]; }

  /** Which side the light enters a chip on, given where it is coming from. */
  function entrySide(from, c) {
    var dx = c.x - from.x;
    var dy = c.y - from.y;
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'left' : 'right';
    return dy >= 0 ? 'top' : 'bottom';
  }

  /** Half the rounded-square border, entry midpoint to opposite midpoint, clockwise or not. */
  function halfPerimeter(c, h, r, entry, cw) {
    var i = SIDES.indexOf(entry);
    var step = cw ? 1 : 3;
    var s1 = SIDES[(i + step) % 4];
    var s2 = SIDES[(i + 2 * step) % 4];
    var sgn = cw ? 1 : -1;
    var sweep = cw ? 1 : 0;
    var p1 = add(mid(c, h, entry), ALONG[entry], sgn * (h - r));
    var p2 = add(mid(c, h, s1), ALONG[s1], -sgn * (h - r));
    var p3 = add(mid(c, h, s1), ALONG[s1], sgn * (h - r));
    var p4 = add(mid(c, h, s2), ALONG[s2], -sgn * (h - r));
    return 'L ' + fmt(p1) + ' A ' + r + ' ' + r + ' 0 0 ' + sweep + ' ' + fmt(p2) +
      ' L ' + fmt(p3) + ' A ' + r + ' ' + r + ' 0 0 ' + sweep + ' ' + fmt(p4) +
      ' L ' + fmt(mid(c, h, s2));
  }

  /** Smooth connector leaving `from` along `outDir` and arriving at `to` along `inDir`. */
  function connector(from, outDir, to, inDir) {
    var dist = Math.hypot(to.x - from.x, to.y - from.y);
    var k = Math.max(36, dist * 0.45);
    return 'C ' + fmt(add(from, outDir, k)) + ', ' + fmt(add(to, inDir, -k)) + ', ' + fmt(to);
  }

  /**
   * spec: { start, end, axisDir, centres[], halves[], radii[] }
   * returns { over, under, prefixes[] } — `prefixes[i]` is the over fork cut at
   * chip i's entry point (used to find where along the route a chip sits).
   */
  function buildRoute(spec) {
    var over = 'M ' + fmt(spec.start);
    var under = over;
    var prefixes = [];
    var cursor = spec.start;
    var outDir = spec.axisDir;
    spec.centres.forEach(function (c, i) {
      var h = spec.halves[i];
      var entry = entrySide(cursor, c);
      var exitS = opposite(entry);
      var entryPt = mid(c, h, entry);
      var inDir = { x: -OUT[entry].x, y: -OUT[entry].y };
      var seg = ' ' + connector(cursor, outDir, entryPt, inDir) + ' ';
      over += seg;
      under += seg;
      prefixes.push(over);
      var r = Math.min(spec.radii[i], h);
      over += halfPerimeter(c, h, r, entry, true);
      under += halfPerimeter(c, h, r, entry, false);
      cursor = mid(c, h, exitS);
      outDir = OUT[exitS];
    });
    var tail = ' ' + connector(cursor, outDir, spec.end, spec.axisDir);
    return { over: over + tail, under: under + tail, prefixes: prefixes };
  }

  /**
   * animation-delay (s) for one stroke of a pulse whose head currently sits at
   * `fraction` (0..1) of the path. Always negative: a positive delay would hold
   * the stroke at offset 0 and paint its dash at the path's start until it began.
   */
  function strokeDelay(seconds, dash, fraction) {
    var headPhase = ((fraction || 0) * 1000) / PERIOD;
    var lag = (dash - HEAD) / PERIOD;
    var delay = -seconds * (headPhase - lag);
    while (delay > 0) delay -= seconds;
    return delay;
  }

  // ---------- configuration ----------

  var OFFSCREEN = 70; // px beyond the edge where a route starts/ends
  var DRIFT_SCALE = 1.2; // multiplies every chip's drift amplitude
  var NARROW_DRIFT = 0.55; // extra drift multiplier in the narrow layout
  var NARROW_SCALE = 0.78; // tile scale in the narrow layout
  var LABEL_MS = 3500;
  var AVOID_PAD = 14; // px of clearance between a chip's drift box and an avoided rect
  var WELL_PAD = 26; // px the reading well extends past each avoided rect

  var SIZE = {
    near: { tile: 60, icon: 36, opacity: 0.9 },
    mid: { tile: 50, icon: 30, opacity: 0.72 },
  };

  /**
   * Routes. `at` = wide anchor, % of the backdrop. `m` = narrow anchor:
   * [x %, y px] where y >= 0 is px from the top and y < 0 is px from the
   * bottom (the narrow layout only has a top and a bottom band); no `m` hides
   * the chip there. `narrow` = [enter, exit] in the same y encoding, or null to
   * hide the whole route there. `drift` = [ax, ay, px, py]: amplitudes (px)
   * and periods (s). `color` names a CSS custom property (or is a colour).
   * `still` = the chip whose split the reduced-motion frame shows.
   */
  var LINES = [
    {
      id: 'a',
      color: ['--trail-a', '--falcon', '#71a087'],
      seconds: 14,
      axis: 'x',
      enter: 50,
      exit: 22,
      narrow: [34, 34],
      still: 2,
      chips: [
        { slug: 'hubspot', layer: 'near', at: [4.6, 62], drift: [10, 22, 13, 9], accent: true },
        { slug: 'salesforce', layer: 'mid', at: [4.6, 33], drift: [10, 16, 10, 17] },
        { slug: 'stripe', layer: 'near', at: [20, 7], m: [12, 34], drift: [18, 8, 15, 11] },
        { slug: 'pipedrive', layer: 'mid', at: [39, 5], m: [37, 30], drift: [26, 6, 19, 12] },
        { slug: 'slack', layer: 'near', at: [60, 9], m: [63, 34], drift: [14, 8, 9, 14], accent: true },
        { slug: 'linear', layer: 'mid', at: [80, 7], m: [88, 30], drift: [14, 8, 16, 10] },
      ],
    },
    {
      id: 'b',
      color: ['--trail-b', '--dawn', '#e0530a'],
      seconds: 18,
      axis: 'x',
      enter: 90,
      exit: 74,
      narrow: [-32, -32],
      still: 2,
      chips: [
        { slug: 'microsoft-teams', layer: 'mid', at: [4.6, 88], m: [10, -30], drift: [10, 12, 11, 16] },
        { slug: 'contentful', layer: 'near', at: [57, 79], m: [35, -34], drift: [20, 12, 17, 9] },
        { slug: 'zoho', layer: 'mid', at: [67, 93], drift: [12, 8, 8, 13] },
        { slug: 'asana', layer: 'near', at: [77, 78], m: [62, -30], drift: [22, 12, 21, 12] },
        { slug: 'frontify', layer: 'mid', at: [87, 92], m: [88, -34], drift: [14, 8, 12, 19] },
        { slug: 'connectwise', layer: 'near', at: [95.5, 74], drift: [8, 18, 14, 10] },
      ],
    },
    {
      id: 'c',
      color: ['--trail-c', null, { light: '#4f84b4', dark: '#79acd6' }],
      seconds: 11,
      axis: 'y',
      enter: 95,
      exit: 96.5,
      narrow: null,
      still: 0,
      chips: [
        { slug: 'ironclad', layer: 'mid', at: [95.5, 32], drift: [8, 16, 12, 15], accent: true },
        { slug: 'google-drive', layer: 'near', at: [95.5, 50], drift: [8, 12, 9, 11] },
      ],
    },
  ];

  /** Chips that fill space without being visited by a route. */
  var LOOSE = [
    { slug: 'google-calendar', layer: 'mid', at: [4.6, 9], drift: [16, 6, 13, 17] },
    { slug: 'zoom', layer: 'near', at: [44, 96], drift: [14, 6, 15, 10] },
  ];

  var SVGNS = 'http://www.w3.org/2000/svg';
  var XLINK = 'http://www.w3.org/1999/xlink';

  var STROKES = [
    { cls: 'ftrail-tail-far', dash: 150 },
    { cls: 'ftrail-tail-near', dash: 70 },
    { cls: 'ftrail-halo', dash: 18 },
    { cls: 'ftrail-head', dash: 18 },
  ];

  // ---------- colour helpers ----------

  function parseColor(str) {
    if (!str) return null;
    str = String(str).trim();
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(str);
    if (m) {
      var h = m[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i.exec(str);
    if (m) return [+m[1], +m[2], +m[3]];
    return null;
  }
  function luminance(rgb) {
    var c = rgb.map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) {
    var la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  function toHex(rgb) {
    return '#' + rgb.map(function (v) { var s = Math.round(v).toString(16); return s.length < 2 ? '0' + s : s; }).join('');
  }
  /** Nudge a brand colour toward black/white until it reads on `bg` (the tile face). */
  function legible(hex, bg, dark) {
    var c = parseColor('#' + hex);
    if (!c || !bg) return '#' + hex;
    var target = dark ? [255, 255, 255] : [0, 0, 0];
    for (var k = 0; k < 10 && contrast(c, bg) < 2.6; k++) {
      c = c.map(function (v, i) { return v + (target[i] - v) * 0.18; });
    }
    return toHex(c);
  }

  // ---------- misc ----------

  function track(event, props) {
    try {
      if (window.posthog && typeof window.posthog.capture === 'function') window.posthog.capture(event, props);
    } catch (e) { /* analytics must never break the page */ }
  }

  function mq(q) {
    return window.matchMedia ? window.matchMedia(q) : { matches: false, addEventListener: function () {}, removeEventListener: function () {} };
  }
  function onMq(m, fn) { if (m.addEventListener) m.addEventListener('change', fn); else if (m.addListener) m.addListener(fn); }
  function offMq(m, fn) { if (m.removeEventListener) m.removeEventListener('change', fn); else if (m.removeListener) m.removeListener(fn); }

  var instances = [];
  var uid = 0;

  // ---------- mount ----------

  /**
   * options:
   *   avoid        selectors (or {selector, well:false}) whose boxes chips keep out of; a soft
   *                "reading well" is drawn behind each unless well:false. Resolved within
   *                `scope` (default: the container's parent).
   *   narrowQuery  media query for the band layout (default '(max-width: 1279px)')
   *   icons        slug -> {title, hex, path} (default window.FriggTrailIcons)
   *   hrefFor      fn(slug) -> url|null for the tapped chip's label
   *   trackEvent   event name for taps (default 'hero_logo_tap'); sent to window.posthog if present
   */
  function mount(container, options) {
    if (!container) return { destroy: function () {}, recolor: function () {} };
    var opts = options || {};
    var icons = opts.icons || window.FriggTrailIcons || {};
    var scope = opts.scope || container.parentElement || document;
    var avoid = (opts.avoid || []).map(function (a) { return typeof a === 'string' ? { selector: a, well: true } : { selector: a.selector, well: a.well !== false }; });
    var tapEvent = opts.trackEvent || 'hero_logo_tap';
    var id = 'ftrail' + (++uid);

    var reduce = mq('(prefers-reduced-motion: reduce)');
    var narrow = mq(opts.narrowQuery || '(max-width: 1279px)');
    var darkMq = mq('(prefers-color-scheme: dark)');

    container.classList.add('ftrail');
    container.setAttribute('aria-hidden', 'true');

    // --- DOM ---
    var chipsLayer = document.createElement('div');
    chipsLayer.className = 'ftrail-chips';
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'ftrail-svg');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('viewBox', '0 0 1440 800');
    var defs = document.createElementNS(SVGNS, 'defs');
    svg.appendChild(defs);
    var scratch = document.createElementNS(SVGNS, 'path'); // measuring stick for tap-restarts; never drawn
    defs.appendChild(scratch);
    var wellsLayer = document.createElement('div');
    wellsLayer.className = 'ftrail-wells';
    container.appendChild(chipsLayer);
    container.appendChild(svg);
    container.appendChild(wellsLayer);

    // Build chips (route chips first, then loose ones), skipping unknown icons.
    var chips = [];
    function makeChip(spec, line, index) {
      var icon = icons[spec.slug];
      if (!icon) return null;
      var el = document.createElement('div');
      el.className = 'ftrail-chip' + (spec.accent ? ' ftrail-chip--accent' : '');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.tabIndex = -1;
      btn.className = 'ftrail-tile';
      btn.setAttribute('aria-label', icon.title);
      var s;
      if (icon.src) {
        // Raster module icon shipped with the site (assets/img/<module>-icon.*).
        s = document.createElement('img');
        s.src = icon.src;
        s.alt = '';
        s.decoding = 'async';
        s.draggable = false;
      } else {
        s = document.createElementNS(SVGNS, 'svg');
        s.setAttribute('viewBox', '0 0 24 24');
        s.setAttribute('fill', 'currentColor');
        s.setAttribute('aria-hidden', 'true');
        var p = document.createElementNS(SVGNS, 'path');
        p.setAttribute('d', icon.path);
        s.appendChild(p);
      }
      btn.appendChild(s);
      el.appendChild(btn);
      chipsLayer.appendChild(el);
      var chip = {
        spec: spec, icon: icon, line: line, el: el, btn: btn, svg: s, index: index,
        rest: null, visible: false, scale: 1, tile: 0, hx: 0, hy: 0, label: null,
      };
      btn.addEventListener('click', function () { onTap(chip); });
      chips.push(chip);
      return chip;
    }

    var lines = LINES.map(function (def) {
      var line = { def: def, chips: [], paths: {}, beams: [], g: null, route: null, routeChips: [] };
      def.chips.forEach(function (spec) {
        var c = makeChip(spec, line, chips.length);
        if (c) line.chips.push(c);
      });
      var g = document.createElementNS(SVGNS, 'g');
      g.setAttribute('class', 'ftrail-line ftrail-line--' + def.id);
      ['over', 'under'].forEach(function (side) {
        var path = document.createElementNS(SVGNS, 'path');
        path.setAttribute('id', id + '-' + def.id + '-' + side);
        path.setAttribute('pathLength', '1000');
        defs.appendChild(path);
        line.paths[side] = path;
        var sg = document.createElementNS(SVGNS, 'g');
        var routeUse = document.createElementNS(SVGNS, 'use');
        routeUse.setAttribute('href', '#' + path.id);
        routeUse.setAttributeNS(XLINK, 'xlink:href', '#' + path.id);
        routeUse.setAttribute('class', 'ftrail-route');
        sg.appendChild(routeUse);
        STROKES.forEach(function (st) {
          var u = document.createElementNS(SVGNS, 'use');
          u.setAttribute('href', '#' + path.id);
          u.setAttributeNS(XLINK, 'xlink:href', '#' + path.id);
          u.setAttribute('class', 'ftrail-beam ' + st.cls);
          u.style.animationDuration = def.seconds + 's';
          u.style.animationDelay = strokeDelay(def.seconds, st.dash, 0).toFixed(3) + 's';
          sg.appendChild(u);
          line.beams.push({ el: u, dash: st.dash });
        });
        g.appendChild(sg);
      });
      svg.appendChild(g);
      line.g = g;
      return line;
    });
    LOOSE.forEach(function (spec) { makeChip(spec, null, chips.length); });

    // --- state ---
    var W = 0, H = 0, raf = 0, running = false, inView = true, destroyed = false;
    var isNarrow = narrow.matches;
    var t0 = performance.now();
    var labelTimer = 0;
    var activeChip = null;
    var wells = [];

    function avoidRects() {
      var base = container.getBoundingClientRect();
      var out = [];
      avoid.forEach(function (a) {
        var nodes = scope.querySelectorAll ? scope.querySelectorAll(a.selector) : [];
        Array.prototype.forEach.call(nodes, function (n) {
          var r = n.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) return;
          out.push({ left: r.left - base.left, top: r.top - base.top, right: r.right - base.left, bottom: r.bottom - base.top, well: a.well });
        });
      });
      return out;
    }

    function overlaps(x, y, hx, hy, r) {
      return x + hx > r.left && x - hx < r.right && y + hy > r.top && y - hy < r.bottom;
    }

    /** Move a rest point the least distance that clears every rect; null if it cannot be placed. */
    function place(x, y, hx, hy, rects, edge) {
      var ax = x, ay = y;
      for (var iter = 0; iter < 8; iter++) {
        var hit = null;
        for (var i = 0; i < rects.length; i++) if (overlaps(x, y, hx, hy, rects[i])) { hit = rects[i]; break; }
        if (!hit) return { x: x, y: y };
        var cands = [
          { x: hit.left - hx, y: y }, { x: hit.right + hx, y: y },
          { x: x, y: hit.top - hy }, { x: x, y: hit.bottom + hy },
        ].filter(function (c) { return c.x >= edge && c.x <= W - edge && c.y >= edge && c.y <= H - edge; });
        if (!cands.length) return null;
        cands.sort(function (p, q) { return Math.hypot(p.x - ax, p.y - ay) - Math.hypot(q.x - ax, q.y - ay); });
        x = cands[0].x;
        y = cands[0].y;
      }
      return null;
    }

    function anchorPx(chip) {
      if (!isNarrow) return chip.spec.at ? { x: (chip.spec.at[0] / 100) * W, y: (chip.spec.at[1] / 100) * H } : null;
      var m = chip.spec.m;
      if (!m) return null;
      return { x: (m[0] / 100) * W, y: m[1] >= 0 ? m[1] : H + m[1] };
    }

    function driftK() { return DRIFT_SCALE * (isNarrow ? NARROW_DRIFT : 1); }

    /** Measure the backdrop and avoided boxes, size tiles, and settle every chip's rest point. */
    function measure() {
      var r = container.getBoundingClientRect();
      W = r.width;
      H = r.height;
      isNarrow = narrow.matches;
      if (W <= 0 || H <= 0) return;
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      var rects = avoidRects();
      var padded = rects.map(function (q) {
        return { left: q.left - AVOID_PAD, top: q.top - AVOID_PAD, right: q.right + AVOID_PAD, bottom: q.bottom + AVOID_PAD };
      });
      var k = driftK();
      var scale = isNarrow ? NARROW_SCALE : 1;
      var placed = []; // chips already settled are obstacles too, so tiles never pile up
      chips.forEach(function (c) {
        var size = SIZE[c.spec.layer];
        c.scale = scale;
        c.tile = Math.round(size.tile * scale);
        var icon = Math.round(size.icon * scale);
        c.el.style.width = c.el.style.height = c.tile + 'px';
        c.btn.style.borderRadius = Math.round(TILE_RADIUS * scale) + 'px';
        c.btn.style.opacity = size.opacity;
        c.svg.setAttribute('width', icon);
        c.svg.setAttribute('height', icon);
        var a = anchorPx(c);
        c.hx = c.tile / 2 + GAP + k * c.spec.drift[0];
        c.hy = c.tile / 2 + GAP + k * c.spec.drift[1];
        c.rest = a ? place(a.x, a.y, c.hx, c.hy, padded.concat(placed), c.tile * 0.3) : null;
        if (c.rest) {
          var ox = c.tile / 2 + 0.5 * k * c.spec.drift[0] + 6;
          var oy = c.tile / 2 + 0.5 * k * c.spec.drift[1] + 6;
          placed.push({ left: c.rest.x - ox, top: c.rest.y - oy, right: c.rest.x + ox, bottom: c.rest.y + oy });
        }
        c.visible = !!c.rest;
        c.el.style.display = c.visible ? '' : 'none';
      });
      lines.forEach(function (l) {
        var on = !isNarrow || !!l.def.narrow;
        l.g.style.display = on ? '' : 'none';
      });
      // Reading wells behind the avoided boxes.
      wells.forEach(function (w) { w.remove(); });
      wells = [];
      rects.forEach(function (q) {
        if (!q.well) return;
        var w = document.createElement('div');
        w.className = 'ftrail-well';
        w.style.left = (q.left - WELL_PAD) + 'px';
        w.style.top = (q.top - WELL_PAD) + 'px';
        w.style.width = (q.right - q.left + 2 * WELL_PAD) + 'px';
        w.style.height = (q.bottom - q.top + 2 * WELL_PAD) + 'px';
        wellsLayer.appendChild(w);
        wells.push(w);
      });
    }

    function layout(now) {
      if (W <= 0 || H <= 0) return;
      var t = (now - t0) / 1000;
      var still = reduce.matches;
      var k = driftK();
      var centres = new Map();
      chips.forEach(function (c, i) {
        if (!c.visible) return;
        var d = c.spec.drift;
        var phase = i * 1.7;
        var dx = still ? 0 : k * d[0] * Math.sin((2 * Math.PI * t) / d[2] + phase);
        var dy = still ? 0 : k * d[1] * Math.sin((2 * Math.PI * t) / d[3] + phase * 0.6);
        var cx = c.rest.x + dx;
        var cy = c.rest.y + dy;
        c.el.style.transform = 'translate(' + cx.toFixed(1) + 'px, ' + cy.toFixed(1) + 'px) translate(-50%, -50%)';
        centres.set(c, { x: cx, y: cy });
      });
      lines.forEach(function (l) {
        var def = l.def;
        if (isNarrow && !def.narrow) return;
        var start, end, axisDir;
        if (isNarrow) {
          var ey = def.narrow[0] >= 0 ? def.narrow[0] : H + def.narrow[0];
          var xy = def.narrow[1] >= 0 ? def.narrow[1] : H + def.narrow[1];
          axisDir = { x: 1, y: 0 };
          start = { x: -OFFSCREEN, y: ey };
          end = { x: W + OFFSCREEN, y: xy };
        } else if (def.axis === 'x') {
          axisDir = { x: 1, y: 0 };
          start = { x: -OFFSCREEN, y: (def.enter / 100) * H };
          end = { x: W + OFFSCREEN, y: (def.exit / 100) * H };
        } else {
          axisDir = { x: 0, y: 1 };
          start = { x: (def.enter / 100) * W, y: -OFFSCREEN };
          end = { x: (def.exit / 100) * W, y: H + OFFSCREEN };
        }
        var visible = l.chips.filter(function (c) { return centres.has(c); });
        var route = buildRoute({
          start: start,
          end: end,
          axisDir: axisDir,
          centres: visible.map(function (c) { return centres.get(c); }),
          halves: visible.map(function (c) { return c.tile / 2 + GAP; }),
          radii: visible.map(function (c) { return TILE_RADIUS * c.scale + GAP; }),
        });
        l.route = route;
        l.routeChips = visible;
        l.paths.over.setAttribute('d', route.over);
        l.paths.under.setAttribute('d', route.under);
      });
    }

    /** Where along its route the light meets `chip` (0..1), or null. */
    function fractionAt(line, chip) {
      if (!line.route) return null;
      var i = line.routeChips.indexOf(chip);
      if (i < 0) return null;
      scratch.setAttribute('d', line.route.prefixes[i]);
      var upTo = scratch.getTotalLength();
      scratch.setAttribute('d', line.route.over);
      var total = scratch.getTotalLength();
      return total > 0 ? Math.min(1, upTo / total) : null;
    }

    /** Re-phase every stroke of `line` so its head is at `fraction` of the route right now. */
    function rephase(line, fraction) {
      var beams = line.beams;
      if (!beams.length) return;
      beams.forEach(function (b) { b.el.style.animationName = 'none'; });
      void getComputedStyle(beams[0].el).animationName; // flush, so the next line starts fresh
      beams.forEach(function (b) {
        b.el.style.animationDelay = strokeDelay(line.def.seconds, b.dash, fraction).toFixed(3) + 's';
        b.el.style.animationName = '';
      });
    }

    /** Reduced motion: a composed still — each pulse frozen as it splits around one chip. */
    function composeStill() {
      lines.forEach(function (l) {
        var c = l.routeChips[Math.min(l.def.still || 0, l.routeChips.length - 1)];
        var f = c ? fractionAt(l, c) : null;
        rephase(l, f === null ? 0.35 : Math.min(0.98, f + 0.025));
      });
    }

    function onTap(chip) {
      if (chip.line) {
        var f = fractionAt(chip.line, chip);
        if (f !== null && !reduce.matches) rephase(chip.line, f);
      }
      if (!reduce.matches && chip.btn.animate) {
        chip.btn.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.14)', offset: 0.35 }, { transform: 'scale(1)' }],
          { duration: 520, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
        );
      }
      showLabel(chip);
      track(tapEvent, { platform: chip.spec.slug, line: chip.line ? chip.line.def.id : null });
    }

    function hideLabel() {
      if (!activeChip) return;
      activeChip.el.classList.remove('ftrail-chip--active');
      activeChip.btn.classList.remove('ftrail-tile--active');
      if (activeChip.label) activeChip.label.remove();
      activeChip.label = null;
      activeChip = null;
    }

    function showLabel(chip) {
      hideLabel();
      var href = typeof opts.hrefFor === 'function' ? opts.hrefFor(chip.spec.slug) : null;
      var label = document.createElement(href ? 'a' : 'span');
      label.className = 'ftrail-label' + (href ? ' ftrail-label--link' : '');
      label.textContent = chip.icon.title;
      if (href) {
        label.href = href;
        label.tabIndex = -1;
        label.appendChild(document.createTextNode(' →'));
        label.addEventListener('click', function () { track(tapEvent + '_link', { platform: chip.spec.slug, href: href }); });
      }
      chip.el.appendChild(label);
      chip.el.classList.add('ftrail-chip--active');
      chip.btn.classList.add('ftrail-tile--active');
      chip.label = label;
      activeChip = chip;
      window.clearTimeout(labelTimer);
      labelTimer = window.setTimeout(hideLabel, LABEL_MS);
    }

    /** Re-read colours from the page's custom properties (theme change). */
    function recolor() {
      if (destroyed) return;
      var cs = getComputedStyle(container);
      var paper = parseColor(cs.getPropertyValue('--paper')) || parseColor(getComputedStyle(document.body).backgroundColor);
      var dark = paper ? luminance(paper) < 0.2 : darkMq.matches;
      container.classList.toggle('ftrail--dark', dark);
      lines.forEach(function (l) {
        var spec = l.def.color;
        var val = '';
        for (var i = 0; i < 2 && !val; i++) if (spec[i]) val = cs.getPropertyValue(spec[i]).trim();
        if (!val) val = typeof spec[2] === 'string' ? spec[2] : spec[2][dark ? 'dark' : 'light'];
        l.g.style.setProperty('--beam', val);
      });
      var face = parseColor(cs.getPropertyValue('--surface')) || (dark ? [17, 27, 22] : [255, 255, 255]);
      chips.forEach(function (c) { c.el.style.setProperty('--brand', legible(c.icon.hex, face, dark)); });
    }

    // --- loop ---
    function tick(now) {
      layout(now);
      raf = running ? requestAnimationFrame(tick) : 0;
    }
    function start() {
      if (running || reduce.matches || destroyed) return;
      running = true;
      raf = requestAnimationFrame(tick);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
    function sync() {
      var live = inView && !document.hidden;
      container.classList.toggle('ftrail--paused', !live);
      if (live) start(); else stop();
    }
    function refresh() {
      measure();
      layout(performance.now());
      if (reduce.matches) composeStill();
    }

    container.classList.toggle('ftrail--still', reduce.matches);
    recolor();
    refresh();
    sync();

    var ro = typeof ResizeObserver === 'function' ? new ResizeObserver(function () { refresh(); }) : null;
    if (ro) {
      ro.observe(container);
      avoid.forEach(function (a) {
        Array.prototype.forEach.call(scope.querySelectorAll ? scope.querySelectorAll(a.selector) : [], function (n) { ro.observe(n); });
      });
    } else {
      window.addEventListener('resize', refresh);
    }
    var io = typeof IntersectionObserver === 'function' ? new IntersectionObserver(function (entries) {
      inView = entries[entries.length - 1].isIntersecting;
      sync();
    }) : null;
    if (io) io.observe(container);
    document.addEventListener('visibilitychange', sync);
    var onReduce = function () {
      stop();
      container.classList.toggle('ftrail--still', reduce.matches);
      if (reduce.matches) {
        refresh();
      } else {
        lines.forEach(function (l) { rephase(l, 0); });
        layout(performance.now());
      }
      sync();
    };
    onMq(reduce, onReduce);
    var onNarrow = function () { refresh(); };
    onMq(narrow, onNarrow);
    var onScheme = function () { recolor(); };
    onMq(darkMq, onScheme);
    var mo = typeof MutationObserver === 'function' ? new MutationObserver(function () { requestAnimationFrame(recolor); }) : null;
    if (mo) mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    // Fonts settle the headline's size after first paint.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (!destroyed) refresh(); });

    var api = {
      recolor: recolor,
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        stop();
        if (ro) ro.disconnect(); else window.removeEventListener('resize', refresh);
        if (io) io.disconnect();
        if (mo) mo.disconnect();
        document.removeEventListener('visibilitychange', sync);
        offMq(reduce, onReduce);
        offMq(narrow, onNarrow);
        offMq(darkMq, onScheme);
        window.clearTimeout(labelTimer);
        chipsLayer.remove();
        svg.remove();
        wellsLayer.remove();
        container.classList.remove('ftrail', 'ftrail--dark', 'ftrail--paused', 'ftrail--still');
        var at = instances.indexOf(api);
        if (at >= 0) instances.splice(at, 1);
      },
    };
    instances.push(api);
    return api;
  }

  function recolorAll() { instances.forEach(function (i) { i.recolor(); }); }

  window.FriggTrail = {
    mount: mount,
    recolor: recolorAll,
    // Exposed for tests / tinkering.
    _geometry: { buildRoute: buildRoute, strokeDelay: strokeDelay, entrySide: entrySide, PERIOD: PERIOD, HEAD: HEAD, GAP: GAP },
  };
  // The site's theme toggle calls this after switching themes (it used to repaint the weave canvas).
  window.__weaveRecolor = recolorAll;
})();
