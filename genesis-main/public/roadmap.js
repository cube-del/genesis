import {buildVisualRecipe} from './visual-recipe.js';

const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, text = null) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== null) node.textContent = text;
  return node;
}

function fullDate(iso) {
  if (!iso) return '';
  const parts = String(iso).split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function shortDate(iso) {
  if (!iso) return '';
  const parts = String(iso).split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}.${parts[1]}`;
}

// Centripetal Catmull-Rom (alpha = 0.5) converted to SVG cubic Bezier path.
// Guaranteed free of cusps, kinks and overshoots even when control points have uneven spacing.
function centripetalBezierSegments(pts, closed = false) {
  if (!pts || pts.length < 2) return [];
  const p = closed
    ? [pts[pts.length - 1], ...pts, pts[0], pts[1]]
    : [
        [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]],
        ...pts,
        [2 * pts[pts.length - 1][0] - pts[pts.length - 2][0], 2 * pts[pts.length - 1][1] - pts[pts.length - 2][1]]
      ];
  const segs = [];
  const count = closed ? pts.length : pts.length - 1;
  const distPow = (a, b) => Math.max(1e-3, Math.hypot(b[0] - a[0], b[1] - a[1])) ** 0.5;

  for (let i = 1; i <= count; i++) {
    const p0 = p[i - 1], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2];
    const d1 = distPow(p0, p1);
    const d2 = distPow(p1, p2);
    const d3 = distPow(p2, p3);

    const d1sq = d1 * d1, d2sq = d2 * d2, d3sq = d3 * d3;
    const b1x = (d1sq * p2[0] - d2sq * p0[0] + (2 * d1sq + 3 * d1 * d2 + d2sq) * p1[0]) / (3 * d1 * (d1 + d2));
    const b1y = (d1sq * p2[1] - d2sq * p0[1] + (2 * d1sq + 3 * d1 * d2 + d2sq) * p1[1]) / (3 * d1 * (d1 + d2));
    const b2x = (d3sq * p1[0] - d2sq * p3[0] + (2 * d3sq + 3 * d3 * d2 + d2sq) * p2[0]) / (3 * d3 * (d3 + d2));
    const b2y = (d3sq * p1[1] - d2sq * p3[1] + (2 * d3sq + 3 * d3 * d2 + d2sq) * p2[1]) / (3 * d3 * (d3 + d2));

    segs.push([p1, [b1x, b1y], [b2x, b2y], p2]);
  }
  return segs;
}

function segmentsToPath(segs, closed = false) {
  if (!segs.length) return '';
  let d = `M ${segs[0][0][0].toFixed(1)} ${segs[0][0][1].toFixed(1)}`;
  for (const [, c1, c2, p2] of segs) {
    d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return closed ? d + ' Z' : d;
}

function smoothPath(pts, closed = false) {
  return segmentsToPath(centripetalBezierSegments(pts, closed), closed);
}

// Sample a list of cubic Bezier segments into dense smooth points + exact analytical normals
function sampleCurveWithNormals(segs, stepPx = 14) {
  const samples = [];
  for (let s = 0; s < segs.length; s++) {
    const [p0, c1, c2, p3] = segs[s];
    const approxLen =
      Math.hypot(c1[0] - p0[0], c1[1] - p0[1]) +
      Math.hypot(c2[0] - c1[0], c2[1] - c1[1]) +
      Math.hypot(p3[0] - c2[0], p3[1] - c2[1]);
    const steps = Math.max(4, Math.ceil(approxLen / stepPx));
    const startIdx = s === 0 ? 0 : 1;
    for (let k = startIdx; k <= steps; k++) {
      const t = k / steps;
      const mt = 1 - t;
      const x = mt * mt * mt * p0[0] + 3 * mt * mt * t * c1[0] + 3 * mt * t * t * c2[0] + t * t * t * p3[0];
      const y = mt * mt * mt * p0[1] + 3 * mt * mt * t * c1[1] + 3 * mt * t * t * c2[1] + t * t * t * p3[1];
      let dx = 3 * mt * mt * (c1[0] - p0[0]) + 6 * mt * t * (c2[0] - c1[0]) + 3 * t * t * (p3[0] - c2[0]);
      let dy = 3 * mt * mt * (c1[1] - p0[1]) + 6 * mt * t * (c2[1] - c1[1]) + 3 * t * t * (p3[1] - c2[1]);
      const len = Math.hypot(dx, dy) || 1;
      samples.push({x, y, nx: -dy / len, ny: dx / len});
    }
  }
  return samples;
}

function offsetCurvePath(samples, dist) {
  if (samples.length < 2) return '';
  const shifted = samples.map(s => [s.x + s.nx * dist, s.y + s.ny * dist]);
  return smoothPath(shifted, false);
}

// Smooth organic closed topographic contour loop (low-frequency lobes, never jagged)
function organicContourLoop(cx, cy, rx, ry, seed = 0, steps = 36) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const mod = 1 + 0.13 * Math.sin(a * 2 + seed) + 0.07 * Math.cos(a * 3 - seed * 1.1);
    pts.push([cx + Math.cos(a) * rx * mod, cy + Math.sin(a) * ry * mod]);
  }
  return smoothPath(pts, true);
}

// Smooth concentric elliptic C-turn points from (edgeX, yStart) around side*R to (edgeX, yEnd)
function buildTurnArc(edgeX, yStart, yEnd, radiusX, side = 1, steps = 8) {
  const midY = (yStart + yEnd) / 2;
  const ry = (yEnd - yStart) / 2;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const theta = -Math.PI / 2 + (i / steps) * Math.PI;
    pts.push([edgeX + side * radiusX * Math.cos(theta), midY + ry * Math.sin(theta)]);
  }
  return pts;
}

function drawFlag(parent, x, y, flip = false, accent = false, meta = null) {
  const g = el('g', {
    class: meta ? 'rm-flag rm-interactive' : 'rm-flag',
    transform: `translate(${x.toFixed(1)},${y.toFixed(1)})`
  });
  if (meta?.dayIndex !== undefined) g.dataset.jumpIndex = String(meta.dayIndex);
  if (meta?.tip) {
    g.dataset.tip = meta.tip;
    g.appendChild(el('title', {}, meta.tip));
  }
  g.appendChild(el('circle', {cx: 0, cy: 0, r: 9, fill: 'transparent'}));
  g.appendChild(el('circle', {cx: 0, cy: 0, r: 2.6, fill: accent ? '#D2402A' : '#1A1714'}));
  g.appendChild(el('line', {x1: 0, y1: -1, x2: 0, y2: -16, stroke: '#1A1714', 'stroke-width': 1.35, 'stroke-linecap': 'round'}));
  const dir = flip ? -1 : 1;
  const flagD = `M 0 -16 Q ${(dir * 5.2).toFixed(1)} -17.5 ${(dir * 10.5).toFixed(1)} -15.3 L ${(dir * 9.8).toFixed(1)} -9.8 Q ${(dir * 5).toFixed(1)} -11.6 0 -10.2 Z`;
  g.appendChild(el('path', {d: flagD, fill: accent ? '#D2402A' : '#1A1714'}));
  parent.appendChild(g);
}

function drawNode(parent, x, y, r = 2.6, meta = null) {
  const g = el('g', {
    class: meta ? 'rm-node rm-interactive' : 'rm-node',
    transform: `translate(${x.toFixed(1)},${y.toFixed(1)})`
  });
  if (meta?.dayIndex !== undefined) g.dataset.jumpIndex = String(meta.dayIndex);
  if (meta?.tip) {
    g.dataset.tip = meta.tip;
    g.appendChild(el('title', {}, meta.tip));
  }
  g.appendChild(el('circle', {cx: 0, cy: 0, r: 9, fill: 'transparent'}));
  g.appendChild(el('circle', {
    cx: 0, cy: 0, r,
    fill: '#ECE5D5',
    stroke: '#1A1714',
    'stroke-width': 1.4
  }));
  parent.appendChild(g);
}

function drawPill(parent, x, y, text, align = 'middle') {
  if (!text) return;
  const upper = text.toUpperCase();
  const padX = 7;
  const charW = 5.9;
  const w = Math.max(46, Math.round(upper.length * charW + padX * 2));
  const h = 18;
  const rx = align === 'end' ? x - w : align === 'start' ? x : x - w / 2;
  const g = el('g', {class: 'rm-pill'});
  g.appendChild(el('rect', {
    x: rx.toFixed(1),
    y: (y - h / 2).toFixed(1),
    width: w,
    height: h,
    rx: 3,
    fill: '#DFD7C4',
    stroke: 'rgba(20,20,20,0.16)',
    'stroke-width': 0.8
  }));
  g.appendChild(el('text', {
    x: (rx + w / 2).toFixed(1),
    y: (y + 3.2).toFixed(1),
    'text-anchor': 'middle',
    class: 'rm-pill-text'
  }, upper));
  parent.appendChild(g);
}

function drawLabel(parent, x, y, text, align = 'middle', cls = 'rm-meta-text') {
  if (!text) return;
  parent.appendChild(el('text', {
    x: x.toFixed(1),
    y: y.toFixed(1),
    'text-anchor': align,
    class: cls
  }, text));
}

function transitionTip(dayA, dayB) {
  if (!dayA || !dayB) return '';
  const rA = buildVisualRecipe(dayA), rB = buildVisualRecipe(dayB);
  const parts = [`${shortDate(dayA.date)} → ${shortDate(dayB.date)}`];
  if (rA.bpm && rB.bpm) parts.push(`${Math.round(rA.bpm)} → ${Math.round(rB.bpm)} BPM`);
  if (rA.weatherLabel !== rB.weatherLabel) parts.push(`${rA.weatherLabel} → ${rB.weatherLabel}`);
  else parts.push(rB.weatherLabel);
  return parts.join(' · ');
}

// Silky-smooth topographic trail rendered from analytical Bezier segments & exact normal offsets
function drawSmoothTrailFromSegments(parent, segs, opts = {}) {
  const {
    echoOffsets = [-11, 12],
    main = true,
    dots = true,
    echoOpacity = 0.21
  } = opts;
  if (!segs.length) return;

  const samples = sampleCurveWithNormals(segs, 16);

  echoOffsets.forEach((off, idx) => {
    parent.appendChild(el('path', {
      d: offsetCurvePath(samples, off),
      fill: 'none',
      stroke: `rgba(26, 22, 18, ${(idx % 2 === 0 ? echoOpacity : echoOpacity * 0.78).toFixed(3)})`,
      'stroke-width': '0.95',
      'stroke-linecap': 'round'
    }));
  });

  if (dots) {
    parent.appendChild(el('path', {
      d: offsetCurvePath(samples, 4.4),
      class: 'rm-trail-dots'
    }));
  }

  if (main) {
    parent.appendChild(el('path', {
      d: segmentsToPath(segs, false),
      class: 'rm-trail-main'
    }));
  }
}

function drawContourTrail(parent, pts, opts = {}) {
  drawSmoothTrailFromSegments(parent, centripetalBezierSegments(pts, false), opts);
}

function addTopographicContours(svg, vw, h) {
  const g = el('g', {class: 'topo-lines'});

  const bandStep = 260;
  const bandCount = Math.max(3, Math.ceil(h / bandStep) + 1);
  for (let b = 0; b < bandCount; b++) {
    const baseY = 120 + b * bandStep;
    const basePts = [];
    const segsCount = 10;
    for (let s = 0; s <= segsCount; s++) {
      const t = s / segsCount;
      const x = -28 + t * (vw + 56);
      const wave =
        Math.sin(t * Math.PI * 1.85 + b * 1.25) * 30 +
        Math.cos(t * Math.PI * 3.0 - b * 0.7) * 10;
      basePts.push([x, baseY + wave]);
    }
    const segs = centripetalBezierSegments(basePts, false);
    const samples = sampleCurveWithNormals(segs, 22);
    [-16, 0, 17].forEach((off, idx) => {
      const isCenter = idx === 1;
      g.appendChild(el('path', {
        d: off === 0 ? segmentsToPath(segs, false) : offsetCurvePath(samples, off),
        fill: 'none',
        stroke: `rgba(28, 22, 16, ${(isCenter ? 0.095 : 0.058).toFixed(3)})`,
        'stroke-width': isCenter ? '1.0' : '0.8'
      }));
    });
  }

  const clusters = Math.max(2, Math.ceil(h / 470) + 1);
  for (let c = 0; c < clusters; c++) {
    const cyLeft = 175 + c * 470 + (c % 2 ? 26 : -12);
    const cyRight = 350 + c * 470 + (c % 2 ? -22 : 18);

    for (let ring = 0; ring < 7; ring++) {
      const rx = 44 + ring * 30;
      const ry = 70 + ring * 40;
      const isIndex = ring % 3 === 0;
      const op = isIndex ? 0.13 : Math.max(0.055, 0.105 - ring * 0.007);
      const sw = isIndex ? '1.1' : '0.82';

      g.appendChild(el('path', {
        d: organicContourLoop(-22, cyLeft, rx, ry, c * 1.9 + ring * 0.16, 36),
        fill: 'none',
        stroke: `rgba(28, 22, 16, ${op.toFixed(3)})`,
        'stroke-width': sw
      }));

      g.appendChild(el('path', {
        d: organicContourLoop(vw + 22, cyRight, rx + 8, ry + 8, c * 1.6 + 1.1 + ring * 0.16, 36),
        fill: 'none',
        stroke: `rgba(28, 22, 16, ${op.toFixed(3)})`,
        'stroke-width': sw
      }));
    }
  }

  svg.appendChild(g);
}

export function renderTopoBackdrop(archiveEl) {
  if (!archiveEl) return;
  let svg = archiveEl.querySelector(':scope > .topo-bg');
  if (!svg) {
    svg = el('svg', {class: 'topo-bg', 'aria-hidden': 'true'});
    archiveEl.prepend(svg);
  }
  const vw = document.documentElement.clientWidth;
  const rect = archiveEl.getBoundingClientRect();
  const h = Math.max(archiveEl.offsetHeight, window.innerHeight);
  const sig = `${vw}|${Math.round(rect.left)}|${Math.round(h)}`;
  if (svg.dataset.topoSig === sig) return;
  svg.dataset.topoSig = sig;
  svg.style.left = `${-rect.left}px`;
  svg.style.width = `${vw}px`;
  svg.style.height = `${h}px`;
  svg.setAttribute('viewBox', `0 0 ${vw} ${h}`);
  svg.innerHTML = '';
  addTopographicContours(svg, vw, h);
}

// Compute the closest length along an SVGPathElement to target (tx, ty)
function closestLengthOnPath(pathEl, tx, ty, startLen = 0, totalLen = null) {
  const total = totalLen ?? pathEl.getTotalLength();
  const step = Math.max(12, total / 180);
  let bestLen = startLen, bestDist = Infinity;
  for (let l = startLen; l <= total; l += step) {
    const pt = pathEl.getPointAtLength(l);
    const d = Math.hypot(pt.x - tx, pt.y - ty);
    if (d < bestDist) { bestDist = d; bestLen = l; }
  }
  const lo = Math.max(startLen, bestLen - step);
  const hi = Math.min(total, bestLen + step);
  for (let l = lo; l <= hi; l += 2) {
    const pt = pathEl.getPointAtLength(l);
    const d = Math.hypot(pt.x - tx, pt.y - ty);
    if (d < bestDist) { bestDist = d; bestLen = l; }
  }
  return bestLen;
}

const journeyRegistry = new WeakMap();

export function getRoadmapJourney(stageEl) {
  return stageEl ? journeyRegistry.get(stageEl) || null : null;
}

export function renderRoadmap(stageEl, gridEl, days) {
  if (!stageEl || !gridEl) return null;
  const svg = stageEl.querySelector('#roadmap-svg');
  if (!svg) return null;

  const cards = [...gridEl.querySelectorAll('.record-sleeve')];
  if (!cards.length || !days?.length) {
    svg.innerHTML = '';
    delete svg.dataset.rmSig;
    journeyRegistry.delete(stageEl);
    return null;
  }

  const vw = document.documentElement.clientWidth;
  const stageRect = stageEl.getBoundingClientRect();
  const svgH = Math.max(stageEl.offsetHeight, 320);

  const rects = cards.map((cardEl, idx) => {
    const r = cardEl.getBoundingClientRect();
    return {
      idx, cardEl,
      left: r.left, right: r.right,
      top: r.top - stageRect.top,
      bottom: r.bottom - stageRect.top
    };
  });
  const sig = `${vw}|${Math.round(stageRect.left)}|${Math.round(svgH)}|` +
    rects.map(r => `${r.cardEl.dataset.card}:${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.bottom)}`).join(';');
  if (svg.dataset.rmSig === sig) return journeyRegistry.get(stageEl) || null;
  svg.dataset.rmSig = sig;

  svg.innerHTML = '';
  svg.style.left = `${-stageRect.left}px`;
  svg.style.width = `${vw}px`;
  svg.style.height = `${svgH}px`;
  svg.setAttribute('viewBox', `0 0 ${vw} ${svgH}`);

  // Group cards into visual rows even with vertical zig-zag staggering
  const byId = new Map(days.map(d => [d.id, d]));
  const rows = [];
  for (const r of rects) {
    const item = {
      idx: r.idx,
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      h: r.bottom - r.top,
      cx: (r.left + r.right) / 2,
      day: byId.get(r.cardEl.dataset.card) || null
    };
    const lastRow = rows.at(-1);
    const prevItem = lastRow?.items.at(-1);
    if (lastRow && prevItem && item.left > prevItem.left + 8) {
      lastRow.items.push(item);
      lastRow.top = Math.min(lastRow.top, item.top);
      lastRow.bottom = Math.max(lastRow.bottom, item.bottom);
      lastRow.left = Math.min(lastRow.left, item.left);
      lastRow.right = Math.max(lastRow.right, item.right);
    } else {
      rows.push({top: item.top, bottom: item.bottom, left: item.left, right: item.right, items: [item]});
    }
  }
  if (!rows.length) return null;

  const leftMargin = rows[0].left;
  const rightMargin = vw - rows[0].right;
  const showSideLabels = leftMargin >= 86 && rightMargin >= 86;
  const rightRadius = Math.max(30, Math.min(72, rightMargin * 0.46));
  const leftRadius = Math.max(30, Math.min(72, leftMargin * 0.46));

  const bridgesLayer = el('g', {class: 'rm-bridges'});
  const trailsLayer = el('g', {class: 'rm-trails'});
  const journeyLayer = el('g', {class: 'rm-journey-layer'});
  const markersLayer = el('g', {class: 'rm-markers'});

  // Collect ordered continuous segments for the animated Journey Mode path!
  const masterSegs = [];
  const cardAnchorTargets = [];

  // --- 1. Silky Left Viewport Entry into Row 0 Card 0 ---
  const c0 = rows[0].items[0];
  const entryY = c0.top + c0.h * 0.30;
  const enterCardY = c0.top + c0.h * 0.36;
  const entryFlagX = Math.max(30, leftMargin * 0.56);
  const entryFlagY = entryY - 8;
  const entryPts = [
    [-18, entryY + 8],
    [leftMargin * 0.24, entryY + 3],
    [entryFlagX, entryFlagY],
    [c0.left + 3, enterCardY]
  ];
  const entrySegs = centripetalBezierSegments(entryPts, false);
  drawSmoothTrailFromSegments(trailsLayer, entrySegs, {echoOffsets: [-11, 12], echoOpacity: 0.2});
  masterSegs.push(...entrySegs);

  if (leftMargin >= 34) {
    drawFlag(markersLayer, entryFlagX, entryFlagY, false, Boolean(c0.day?.favorite), {
      dayIndex: 0,
      tip: c0.day ? `Старт маршрута · ${c0.day.title}` : ''
    });
    if (showSideLabels && c0.day) {
      const recipe0 = buildVisualRecipe(c0.day);
      const rightAlignX = Math.max(66, leftMargin - 12);
      drawLabel(markersLayer, Math.max(48, leftMargin * 0.32), entryY + 30, fullDate(c0.day.date), 'middle', 'rm-date-text');
      if (recipe0.bpm) drawLabel(markersLayer, rightAlignX, entryY + 52, `${Math.round(recipe0.bpm)} BPM`, 'end', 'rm-bpm-text');
      drawPill(markersLayer, rightAlignX, entryY + 71, recipe0.weatherLabel, 'end');
    }
  }

  // --- 2. Process Every Row: Pure S-Curve Card Bridges + Silky Serpentine Valley ---
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];

    // Record journey stops across row r & build smooth row traversal in masterSegs
    for (let i = 0; i < row.items.length; i++) {
      const a = row.items[i];
      const yA = a.top + a.h * 0.44;
      const prevPt = masterSegs.at(-1)?.[3] || [a.left, yA];
      // Glide behind card from left edge to right edge for continuous journey beacon travel
      masterSegs.push([
        prevPt,
        [prevPt[0] + (a.cx - prevPt[0]) * 0.6, prevPt[1]],
        [a.cx - (a.right - a.cx) * 0.4, yA],
        [a.cx, yA]
      ]);
      cardAnchorTargets.push({idx: a.idx, x: a.cx, y: yA});

      const endX = a.right - 2;
      masterSegs.push([
        [a.cx, yA],
        [a.cx + (endX - a.cx) * 0.5, yA],
        [endX - (endX - a.cx) * 0.25, i === row.items.length - 1 ? a.top + a.h * 0.36 : yA],
        [endX, i === row.items.length - 1 ? a.top + a.h * 0.36 : yA]
      ]);

      if (i < row.items.length - 1) {
        const b = row.items[i + 1];
        const x1 = a.right - 2;
        const x2 = b.left + 2;
        const gx = (x1 + x2) / 2;
        const yB = b.top + b.h * 0.44;
        const midY = (yA + yB) / 2;

        const sCurve = [[[x1, yA], [gx, yA], [gx, yB], [x2, yB]]];
        drawSmoothTrailFromSegments(bridgesLayer, sCurve, {
          echoOffsets: [-9.5, 10.5],
          main: true,
          dots: true,
          echoOpacity: 0.22
        });
        masterSegs.push(...sCurve);
        drawNode(markersLayer, gx, midY, 2.7, {
          dayIndex: b.idx,
          tip: transitionTip(a.day, b.day)
        });
      }
    }

    const lastCard = row.items.at(-1);
    const lastDay = lastCard?.day;
    const lastRecipe = lastDay ? buildVisualRecipe(lastDay) : null;
    const exitY = lastCard.top + lastCard.h * 0.36;

    if (r < rows.length - 1) {
      const nextRow = rows[r + 1];
      const nextFirst = nextRow.items[0];
      const nextLast = nextRow.items[row.items.length - 1];

      const rawColY = row.items.map((upCard, i) => {
        const downCard = nextRow.items[i];
        return downCard ? upCard.bottom * 0.46 + downCard.top * 0.54 : upCard.bottom + 42;
      });
      const avgGapY = rawColY.reduce((s, y) => s + y, 0) / rawColY.length;
      const smoothColY = rawColY.map(y => y * 0.68 + avgGapY * 0.32);

      const rightGapY = nextLast ? smoothColY[row.items.length - 1] : lastCard.bottom + 42;
      const leftGapY = smoothColY[0];

      const rightArc = buildTurnArc(lastCard.right - 2, exitY, rightGapY, rightRadius, 1, 8);
      const rfPt = rightArc[3];

      const valleyMidPts = [];
      const colFlags = [];
      for (let i = row.items.length - 1; i >= 0; i--) {
        valleyMidPts.push([row.items[i].cx, smoothColY[i]]);
        if (i > 0) {
          const gapX = (row.items[i - 1].right + row.items[i].left) / 2;
          const gapMidY = (smoothColY[i] + smoothColY[i - 1]) / 2;
          colFlags.push({x: gapX, y: gapMidY, flip: i % 2 === 1});
        }
      }

      const nextEnterY = nextFirst.top + nextFirst.h * 0.32;
      const leftArc = buildTurnArc(nextFirst.left + 2, leftGapY, nextEnterY, leftRadius, -1, 8);
      const lfPt = leftArc[4];

      const fullValleyPts = [...rightArc, ...valleyMidPts, ...leftArc];
      const valleySegs = centripetalBezierSegments(fullValleyPts, false);
      drawSmoothTrailFromSegments(trailsLayer, valleySegs, {
        echoOffsets: [-12, 13],
        main: true,
        dots: true,
        echoOpacity: 0.21
      });
      masterSegs.push(...valleySegs);

      const rowTransTip = transitionTip(lastDay, nextFirst?.day);
      if (rightMargin >= 34) {
        drawFlag(markersLayer, rfPt[0], rfPt[1], false, Boolean(lastDay?.favorite), {
          dayIndex: lastCard.idx,
          tip: rowTransTip || lastDay?.title || ''
        });
        if (showSideLabels && lastRecipe) {
          const tx = Math.min(vw - 88, rfPt[0] + 18);
          if (lastRecipe.bpm) drawLabel(markersLayer, tx, rfPt[1] + 12, `${Math.round(lastRecipe.bpm)} BPM`, 'start', 'rm-bpm-text');
          drawPill(markersLayer, tx, rfPt[1] + 31, lastRecipe.weatherLabel, 'start');
        }
      }

      if (colFlags.length) {
        const pickA = colFlags[Math.floor(colFlags.length / 2)];
        drawFlag(markersLayer, pickA.x, pickA.y, pickA.flip, false, {
          dayIndex: nextFirst.idx,
          tip: rowTransTip
        });
        if (colFlags.length >= 3) {
          const pickB = colFlags[0];
          drawFlag(markersLayer, pickB.x, pickB.y, pickB.flip, false, {
            dayIndex: lastCard.idx,
            tip: rowTransTip
          });
        }
      }

      if (leftMargin >= 34 && nextFirst?.day) {
        const nextRecipe = buildVisualRecipe(nextFirst.day);
        drawFlag(markersLayer, lfPt[0], lfPt[1], false, Boolean(nextFirst.day.favorite), {
          dayIndex: nextFirst.idx,
          tip: `${nextFirst.day.title} · ${nextRecipe.weatherLabel}`
        });
        if (showSideLabels) {
          const lx = Math.max(76, lfPt[0] - 14);
          if (nextRecipe.bpm) drawLabel(markersLayer, lx, leftGapY + 14, `${Math.round(nextRecipe.bpm)} BPM`, 'end', 'rm-bpm-text');
          drawLabel(markersLayer, lx, lfPt[1] + 24, fullDate(nextFirst.day.date), 'end', 'rm-date-text');
          drawPill(markersLayer, lx, lfPt[1] + 44, nextRecipe.weatherLabel, 'end');
        }
      }
    } else {
      const midX = lastCard.right + rightMargin * 0.46;
      const exitPts = [
        [lastCard.right - 2, exitY],
        [midX, exitY + 4],
        [lastCard.right + rightMargin * 0.78, exitY + 14],
        [vw + 18, exitY + 10]
      ];
      const exitSegs = centripetalBezierSegments(exitPts, false);
      drawSmoothTrailFromSegments(trailsLayer, exitSegs, {
        echoOffsets: [-11, 12],
        main: true,
        dots: true,
        echoOpacity: 0.2
      });
      masterSegs.push(...exitSegs);

      if (rightMargin >= 34) {
        drawFlag(markersLayer, midX, exitY + 4, false, Boolean(lastDay?.favorite), {
          dayIndex: lastCard.idx,
          tip: lastDay ? `Финиш маршрута · ${lastDay.title}` : ''
        });
        if (showSideLabels && lastRecipe) {
          const tx = Math.min(vw - 88, midX + 14);
          if (lastRecipe.bpm) drawLabel(markersLayer, tx, exitY + 24, `${Math.round(lastRecipe.bpm)} BPM`, 'start', 'rm-bpm-text');
          drawPill(markersLayer, tx, exitY + 43, lastRecipe.weatherLabel, 'start');
        }
      }
    }
  }

  // Build live Journey Mode glowing progress trail & animated needle beacon
  const masterD = segmentsToPath(masterSegs, false);
  const glowPath = el('path', {d: masterD, class: 'rm-journey-glow'});
  const beacon = el('g', {class: 'rm-beacon', opacity: '0'});
  beacon.appendChild(el('circle', {cx: 0, cy: 0, r: 12, class: 'rm-beacon-halo'}));
  beacon.appendChild(el('circle', {cx: 0, cy: 0, r: 5.2, class: 'rm-beacon-core'}));
  journeyLayer.appendChild(glowPath);
  journeyLayer.appendChild(beacon);

  svg.appendChild(bridgesLayer);
  svg.appendChild(trailsLayer);
  svg.appendChild(journeyLayer);
  svg.appendChild(markersLayer);

  const totalLength = glowPath.getTotalLength();
  glowPath.style.strokeDasharray = `${totalLength.toFixed(1)} ${totalLength.toFixed(1)}`;
  glowPath.style.strokeDashoffset = `${totalLength.toFixed(1)}`;

  let cursorLen = 0;
  const stopLengths = cardAnchorTargets.map(target => {
    const l = closestLengthOnPath(glowPath, target.x, target.y, cursorLen, totalLength);
    cursorLen = l;
    return l;
  });

  const controller = {
    totalLength,
    stopLengths,
    setProgress(len) {
      const clamped = Math.max(0, Math.min(totalLength, len));
      glowPath.style.strokeDashoffset = (totalLength - clamped).toFixed(1);
      const pt = glowPath.getPointAtLength(clamped);
      beacon.setAttribute('transform', `translate(${pt.x.toFixed(1)},${pt.y.toFixed(1)})`);
    },
    showBeacon(on) {
      beacon.setAttribute('opacity', on ? '1' : '0');
      glowPath.classList.toggle('is-active', Boolean(on));
      if (!on) glowPath.style.strokeDashoffset = totalLength.toFixed(1);
    }
  };
  journeyRegistry.set(stageEl, controller);
  return controller;
}
