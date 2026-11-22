import {icon, esc, modal, closeModal, moods, dateLabel} from './ui.js';
import {buildVisualRecipe} from './visual-recipe.js';

const W = 1400, H = 1750;
const CX = W * 0.5, CY = H * 0.455;
const R_LABEL = 152;
const R_INNER = 192;
const R_OUTER = 552;

function shortDate(iso) {
  if (!iso) return '';
  const p = String(iso).split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0].slice(2)}` : iso;
}

function mixHex(hexA, hexB, t) {
  const parse = h => [1, 3, 5].map(i => parseInt((/^#[0-9a-f]{6}$/i.test(h) ? h : '#888074').slice(i, i + 2), 16));
  const a = parse(hexA), b = parse(hexB);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return '#' + c.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}

function drawPoster(ctx, entries, {theme = 'dark', hoverIndex = -1, title = 'ЯЩИК С ПЛАСТИНКАМИ'} = {}) {
  const dark = theme === 'dark';
  const bg = dark ? '#141210' : '#EFE8D8';
  const ink = dark ? '#F2ECE0' : '#141414';
  const muted = dark ? 'rgba(242,236,224,0.56)' : 'rgba(20,20,20,0.54)';
  const rule = dark ? 'rgba(242,236,224,0.16)' : 'rgba(20,20,20,0.16)';
  const accent = '#D2402A';

  ctx.save();
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle architectural topographic rings in poster corners
  ctx.strokeStyle = dark ? 'rgba(242,236,224,0.055)' : 'rgba(20,20,20,0.065)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    ctx.ellipse(-40, 260, 120 + i * 48, 170 + i * 62, 0.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(W + 40, H - 380, 130 + i * 50, 180 + i * 64, -0.25, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Outer museum print border & header index bar
  const pad = 64;
  ctx.strokeStyle = rule;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(pad, pad, W - pad * 2, H - pad * 2);

  const headY = pad + 56;
  ctx.beginPath();
  ctx.moveTo(pad, headY);
  ctx.lineTo(W - pad, headY);
  ctx.stroke();

  const dates = entries.map(e => e.day.date).filter(Boolean).sort();
  const spanLabel = dates.length > 1
    ? `${shortDate(dates[0])} — ${shortDate(dates[dates.length - 1])}`
    : (dates[0] ? shortDate(dates[0]) : '2026');
  const bpms = entries.map(e => e.recipe.bpm).filter(Boolean);
  const avgBpm = bpms.length ? Math.round(bpms.reduce((s, v) => s + v, 0) / bpms.length) : null;

  ctx.fillStyle = ink;
  ctx.font = '700 21px Consolas, monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(`DAYTRACE · ARCHIVE LP`, pad + 24, pad + 29);

  ctx.textAlign = 'center';
  ctx.fillStyle = muted;
  ctx.font = '600 18px Consolas, monospace';
  ctx.fillText(`${entries.length} ДНЕЙ · ${spanLabel}${avgBpm ? ` · СРЕДНИЙ ТЕМП ${avgBpm} BPM` : ''}`, W * 0.5, pad + 29);

  ctx.textAlign = 'right';
  ctx.fillStyle = accent;
  ctx.font = '700 18px Consolas, monospace';
  ctx.fillText(dark ? 'COLLECTOR PRESSING' : 'GALLERY PRINT', W - pad - 24, pad + 29);

  // Base vinyl disc plate behind the topographic grooves
  const discGrad = ctx.createRadialGradient(CX - 90, CY - 110, 40, CX, CY, R_OUTER + 28);
  if (dark) {
    discGrad.addColorStop(0, '#25211D');
    discGrad.addColorStop(0.55, '#191614');
    discGrad.addColorStop(1, '#0E0D0C');
  } else {
    discGrad.addColorStop(0, '#F7F2E6');
    discGrad.addColorStop(0.7, '#EAE2CF');
    discGrad.addColorStop(1, '#DFD6C0');
  }
  ctx.beginPath();
  ctx.arc(CX, CY, R_OUTER + 26, 0, Math.PI * 2);
  ctx.fillStyle = discGrad;
  ctx.fill();
  ctx.strokeStyle = dark ? 'rgba(242,236,224,0.22)' : 'rgba(20,20,20,0.28)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Subtle sheen wedges on vinyl surface
  ctx.save();
  ctx.beginPath();
  ctx.arc(CX, CY, R_OUTER + 24, 0, Math.PI * 2);
  ctx.clip();
  for (const angle of [-0.65, 2.49]) {
    ctx.beginPath();
    ctx.moveTo(CX, CY);
    ctx.arc(CX, CY, R_OUTER + 32, angle - 0.22, angle + 0.22);
    ctx.closePath();
    ctx.fillStyle = dark ? 'rgba(255,248,232,0.032)' : 'rgba(255,255,255,0.24)';
    ctx.fill();
  }
  ctx.restore();

  // Concentric Topographic Data-Art Grooves — 1 band per day!
  const n = Math.max(1, entries.length);
  const bandSpan = (R_OUTER - R_INNER) / n;
  const ringMetrics = [];

  for (let idx = 0; idx < entries.length; idx++) {
    const {day, recipe, code} = entries[idx];
    const rCenter = R_INNER + (idx + 0.5) * bandSpan;
    const rMin = R_INNER + idx * bandSpan;
    const rMax = rMin + bandSpan;
    ringMetrics.push({idx, rMin, rMax, rCenter});

    const isHover = idx === hoverIndex;
    const isDim = hoverIndex >= 0 && !isHover;
    const env = recipe.envelope || [];
    const bpm = recipe.bpm || 84;
    const energy = Number.isFinite(day.energy) ? day.energy : 0.45;
    const motion = Number.isFinite(day.videoMotion) ? day.videoMotion : 0;
    const palette = recipe.palette?.length ? recipe.palette : ['#D2402A', '#887F72'];
    const primaryColor = palette[palette.length - 1] || accent;
    const secondaryColor = palette[Math.floor(palette.length / 2)] || primaryColor;

    // Gentle band tint wash when hovered
    if (isHover) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(CX, CY, rMax, 0, Math.PI * 2);
      ctx.arc(CX, CY, rMin, 0, Math.PI * 2, true);
      ctx.fillStyle = dark ? 'rgba(210,64,42,0.16)' : 'rgba(210,64,42,0.12)';
      ctx.fill();
      ctx.restore();
    }

    // Draw 3 nested topographic micro-grooves per day modulated by real audio envelope, BPM & energy
    const subLines = Math.min(4, Math.max(2, Math.round(bandSpan / 11)));
    const steps = 180;
    const maxAmp = Math.min(bandSpan * 0.36, 7 + energy * 11 + motion * 6);
    const freq = Math.max(3, Math.min(14, Math.round(bpm / 15)));
    const phase = idx * 1.13;

    for (let s = 0; s < subLines; s++) {
      const frac = subLines === 1 ? 0 : (s / (subLines - 1) - 0.5);
      const rBase = rCenter + frac * bandSpan * 0.54;
      const isMain = s === Math.floor(subLines / 2);
      ctx.beginPath();
      for (let k = 0; k <= steps; k++) {
        const theta = (k / steps) * Math.PI * 2 - Math.PI / 2;
        const envIdx = Math.floor(((k % steps) / steps) * env.length);
        const envVal = env.length ? env[envIdx] : 0.5;
        const harmonic =
          Math.sin(theta * freq + phase + s * 0.35) * (0.45 + energy * 0.55) +
          Math.cos(theta * (freq * 2 - 1) - phase) * (0.18 + motion * 0.35);
        const dr = ((envVal - 0.45) * 1.35 + harmonic * 0.52) * maxAmp * (isMain ? 1 : 0.68);
        const r = rBase + dr;
        const px = CX + Math.cos(theta) * r;
        const py = CY + Math.sin(theta) * r;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      const strokeCol = isHover
        ? accent
        : isMain
          ? (dark ? mixHex(primaryColor, '#F2ECE0', 0.22) : mixHex(primaryColor, '#141414', 0.32))
          : (dark ? mixHex(secondaryColor, '#F2ECE0', 0.1) : mixHex(secondaryColor, '#141414', 0.2));

      ctx.strokeStyle = strokeCol;
      ctx.globalAlpha = isDim ? 0.24 : (isHover ? 1 : (isMain ? 0.92 : 0.44));
      ctx.lineWidth = isHover ? (isMain ? 3.4 : 1.7) : (isMain ? Math.max(1.8, Math.min(3.0, bandSpan * 0.08)) : 1.0);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Radial azimuth marker for each day around the outer dial
    const markerAngle = -Math.PI * 0.72 + (idx / Math.max(1, entries.length)) * Math.PI * 1.65;
    const x0 = CX + Math.cos(markerAngle) * rCenter;
    const y0 = CY + Math.sin(markerAngle) * rCenter;
    const x1 = CX + Math.cos(markerAngle) * (R_OUTER + 34);
    const y1 = CY + Math.sin(markerAngle) * (R_OUTER + 34);

    ctx.beginPath();
    ctx.arc(x0, y0, isHover ? 5.5 : 3.4, 0, Math.PI * 2);
    ctx.fillStyle = isHover ? accent : (dark ? '#F2ECE0' : '#141414');
    ctx.fill();

    if (entries.length <= 16 || isHover) {
      ctx.beginPath();
      ctx.moveTo(CX + Math.cos(markerAngle) * (R_OUTER + 18), CY + Math.sin(markerAngle) * (R_OUTER + 18));
      ctx.lineTo(x1, y1);
      ctx.strokeStyle = isHover ? accent : rule;
      ctx.lineWidth = isHover ? 2 : 1;
      ctx.stroke();

      const lx = CX + Math.cos(markerAngle) * (R_OUTER + 44);
      const ly = CY + Math.sin(markerAngle) * (R_OUTER + 44);
      ctx.font = isHover ? '700 17px Consolas, monospace' : '600 14px Consolas, monospace';
      ctx.fillStyle = isHover ? accent : muted;
      ctx.textAlign = Math.cos(markerAngle) >= 0 ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${code} · ${shortDate(day.date)}`, lx, ly);
    }
  }

  // Center Blue Note Vinyl Label with Emotional Proportions Ring
  ctx.beginPath();
  ctx.arc(CX, CY, R_LABEL, 0, Math.PI * 2);
  ctx.fillStyle = dark ? '#EFE8D8' : '#161412';
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Mood proportions arc right inside the label rim
  const moodCounts = {};
  for (const {day} of entries) moodCounts[day.mood] = (moodCounts[day.mood] || 0) + 1;
  let arcStart = -Math.PI / 2;
  for (const [mKey, mInfo] of Object.entries(moods)) {
    const cnt = moodCounts[mKey] || 0;
    if (!cnt) continue;
    const sweep = (cnt / entries.length) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(CX, CY, R_LABEL - 12, arcStart + 0.03, arcStart + sweep - 0.03);
    ctx.strokeStyle = mInfo.color;
    ctx.lineWidth = 7;
    ctx.stroke();
    arcStart += sweep;
  }

  const labelInk = dark ? '#141414' : '#EFE8D8';
  ctx.fillStyle = labelInk;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 24px Oswald, "Arial Narrow", sans-serif';
  ctx.fillText('DAYTRACE', CX, CY - 56);
  ctx.fillStyle = accent;
  ctx.font = '700 15px Consolas, monospace';
  ctx.fillText(`${entries.length} TRACKS · LP`, CX, CY - 30);

  ctx.fillStyle = labelInk;
  ctx.font = '600 14px Consolas, monospace';
  ctx.fillText(spanLabel, CX, CY + 42);
  if (avgBpm) {
    ctx.fillStyle = dark ? '#5A554B' : 'rgba(239,232,216,0.68)';
    ctx.font = '700 15px Consolas, monospace';
    ctx.fillText(`${avgBpm} BPM AVG`, CX, CY + 66);
  }

  // Spindle hole
  ctx.beginPath();
  ctx.arc(CX, CY, 16, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = dark ? 'rgba(20,20,20,0.45)' : 'rgba(239,232,216,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Bottom Editorial Section: Title + Season Color DNA Barcode + Mood Stats
  const footTop = H - 318;
  ctx.strokeStyle = rule;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pad, footTop);
  ctx.lineTo(W - pad, footTop);
  ctx.stroke();

  // Archive Color DNA Bar (every day's native palette side-by-side)
  const dnaX = pad + 24;
  const dnaY = footTop + 26;
  const dnaW = W - (pad + 24) * 2;
  const dnaH = 26;
  const allSwatches = entries.flatMap(e => (e.recipe.palette || []).slice(0, 3));
  const swW = dnaW / Math.max(1, allSwatches.length);
  allSwatches.forEach((col, i) => {
    ctx.fillStyle = col;
    ctx.fillRect(dnaX + i * swW, dnaY, Math.ceil(swW) + 0.5, dnaH);
  });
  ctx.strokeStyle = rule;
  ctx.lineWidth = 1;
  ctx.strokeRect(dnaX, dnaY, dnaW, dnaH);

  // Poster Title & Description
  ctx.fillStyle = ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '700 58px Oswald, "Arial Narrow", sans-serif';
  ctx.fillText(`СЛЕПОК: ${title.toUpperCase()}`, dnaX, dnaY + 106, dnaW * 0.68);

  ctx.fillStyle = muted;
  ctx.font = 'italic 400 22px Literata, Georgia, serif';
  ctx.fillText('Каждое кольцо — один день: цвет палитры K-Means, волна музыки и рельеф ритма.', dnaX, dnaY + 144, dnaW * 0.72);

  // Right-aligned mood breakdown legend
  ctx.textAlign = 'right';
  let ly = dnaY + 76;
  for (const [mKey, mInfo] of Object.entries(moods)) {
    const cnt = moodCounts[mKey] || 0;
    if (!cnt) continue;
    const pct = Math.round((cnt / entries.length) * 100);
    ctx.fillStyle = ink;
    ctx.font = '700 17px Consolas, monospace';
    ctx.fillText(`${mInfo.label.toUpperCase()} · ${cnt} (${pct}%)`, W - pad - 24, ly);
    ctx.fillStyle = mInfo.color;
    ctx.fillRect(W - pad - 24 - ctx.measureText(`${mInfo.label.toUpperCase()} · ${cnt} (${pct}%)`).width - 20, ly - 12, 11, 11);
    ly += 27;
  }

  // Colophon footer line
  ctx.strokeStyle = rule;
  ctx.beginPath();
  ctx.moveTo(pad, H - pad - 48);
  ctx.lineTo(W - pad, H - pad - 48);
  ctx.stroke();

  ctx.textBaseline = 'middle';
  ctx.font = '600 15px Consolas, monospace';
  ctx.fillStyle = muted;
  ctx.textAlign = 'left';
  ctx.fillText('MAKE THE INVISIBLE VISIBLE · GENERATIVE VINYL TOPOGRAPHY', dnaX, H - pad - 24);
  ctx.textAlign = 'right';
  ctx.fillText(`DT-LP-${new Date().getFullYear()}`, W - pad - 24, H - pad - 24);

  ctx.restore();
  return ringMetrics;
}

export function openVinylPosterModal(days, {title = 'Ящик с пластинками', catalogCode, onSelectDay} = {}) {
  if (!days?.length) return;
  const entries = [...days]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((day, idx) => ({
      day,
      recipe: buildVisualRecipe(day),
      code: catalogCode ? catalogCode(day) : `ДТ ${4001 + idx}`
    }));

  const body = modal('Слепок архива · Виниловый постер', `
    <div class="lp-poster-wrap">
      <div class="lp-poster-bar">
        <div class="lp-theme-toggle" role="group" aria-label="Оформление печати">
          <button type="button" class="sort-pill selected" data-lp-theme="dark">Тёмный винил</button>
          <button type="button" class="sort-pill" data-lp-theme="light">Бумажный оттиск</button>
        </div>
        <button type="button" class="button primary" data-lp-download>${icon('download', 15)} Скачать постер PNG</button>
      </div>
      <div class="lp-stage">
        <canvas class="lp-canvas" width="${W}" height="${H}" aria-label="Генеративный виниловый слепок архива"></canvas>
      </div>
      <div class="lp-readout" data-lp-readout>
        <span>Наведите на любую бороздку пластинки, чтобы увидеть день — или нажмите, чтобы открыть его.</span>
      </div>
    </div>
  `, {wide: true});

  const canvas = body.querySelector('.lp-canvas');
  const ctx = canvas.getContext('2d');
  const readout = body.querySelector('[data-lp-readout]');
  let theme = 'dark';
  let hoverIndex = -1;
  let rings = [];

  function render() {
    rings = drawPoster(ctx, entries, {theme, hoverIndex, title});
    if (hoverIndex >= 0 && entries[hoverIndex]) {
      const {day, recipe, code} = entries[hoverIndex];
      const mLabel = moods[day.mood]?.label || day.mood;
      const bpmTxt = recipe.bpm ? `${Math.round(recipe.bpm)} BPM` : 'свободный темп';
      readout.innerHTML =
        `<strong class="lp-ro-code">${esc(code)} · Дорожка ${String(hoverIndex + 1).padStart(2, '0')}</strong>` +
        `<span class="lp-ro-title">${esc(day.title)}</span>` +
        `<span class="lp-ro-meta">${esc(dateLabel(day.date))} · ${esc(mLabel)} · ${esc(bpmTxt)} · ${esc(recipe.weatherLabel)}</span>` +
        `<span class="lp-ro-hint">Нажмите, чтобы открыть →</span>`;
    } else {
      readout.innerHTML = '<span>Наведите на любую бороздку пластинки, чтобы увидеть день — или нажмите, чтобы открыть его.</span>';
    }
  }

  function hitRing(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (W / Math.max(1, rect.width));
    const y = (e.clientY - rect.top) * (H / Math.max(1, rect.height));
    const dist = Math.hypot(x - CX, y - CY);
    const hit = rings.find(r => dist >= r.rMin && dist <= r.rMax);
    return hit ? hit.idx : -1;
  }

  canvas.addEventListener('pointermove', e => {
    const next = hitRing(e);
    canvas.style.cursor = next >= 0 ? 'pointer' : 'default';
    if (next !== hoverIndex) {
      hoverIndex = next;
      render();
    }
  });
  canvas.addEventListener('pointerleave', () => {
    if (hoverIndex !== -1) {
      hoverIndex = -1;
      canvas.style.cursor = 'default';
      render();
    }
  });
  canvas.addEventListener('click', e => {
    const idx = hitRing(e);
    if (idx >= 0 && entries[idx]) {
      const targetDay = entries[idx].day;
      closeModal();
      onSelectDay?.(targetDay);
    }
  });

  body.querySelectorAll('[data-lp-theme]').forEach(btn => {
    btn.addEventListener('click', () => {
      theme = btn.dataset.lpTheme;
      body.querySelectorAll('[data-lp-theme]').forEach(b => b.classList.toggle('selected', b === btn));
      render();
    });
  });

  body.querySelector('[data-lp-download]').addEventListener('click', () => {
    const prev = hoverIndex;
    hoverIndex = -1;
    render();
    canvas.toBlob(blob => {
      hoverIndex = prev;
      render();
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `daytrace-archive-lp-${theme}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    }, 'image/png');
  });

  document.fonts?.ready?.then(() => render());
  render();
}
