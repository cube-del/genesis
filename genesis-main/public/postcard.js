// Deterministic 4:5 Archival Contact Sheet geometry shared across the live canvas,
// archive grid, standalone portable postcard (memory.html) and tests.
export function contactSheetLayout(width, height, recipe, photoCount = 1) {
  const count = Math.max(1, Math.min(5, Math.round(Number(photoCount) || 1)));
  const style = recipe.signatureStyle || 'impressionism';
  const pad = Math.round(width * .028);
  const headerH = Math.round(height * .058);
  const footerH = Math.round(height * .232);
  const stageY = headerH;
  const stageH = height - headerH - footerH;
  const stage = { x: 0, y: stageY, w: width, h: stageH };
  const footer = { x: pad, y: stageY + stageH, w: width - pad * 2, h: footerH };
  const header = { x: pad, y: 0, w: width - pad * 2, h: headerH };

  // Optical 35mm soundtrack claims a slim vertical strip along the right side of the film stage.
  const opticalW = style === 'film' ? Math.round(width * .054) : 0;
  const vPad = Math.round(height * .014);
  const work = { x: pad, y: stageY + vPad, w: width - pad * 2 - opticalW, h: stageH - vPad * 2 };
  const rect = (rx, ry, rw, rh) => ({
    x: Math.round(work.x + work.w * rx),
    y: Math.round(work.y + work.h * ry),
    w: Math.max(16, Math.round(work.w * rw)),
    h: Math.max(16, Math.round(work.h * rh))
  });

  const slots = [];
  let powerCell = null;
  const ws = Math.max(.045, Math.min(.45, Number(recipe.whitespace) || .2));

  if (count === 1) {
    if (style === 'film') {
      const fh = Math.min(work.h * .92, work.w * .94);
      const fy = (work.h - fh) * .5 / work.h;
      slots.push({ ...rect(.015, fy, .97, fh / work.h), index: 0, label: '[01]', timecode: '00:00:08' });
    } else if (style === 'constructivism') {
      const inset = Math.min(.032, ws * .10);
      slots.push({ ...rect(inset, inset, .80 - inset, 1 - inset * 2), index: 0, label: '[01]' });
      powerCell = rect(.812, inset, .188 - inset, 1 - inset * 2);
    } else {
      // Passe-partout mat driven by whitespace while keeping the photograph commanding and large.
      const mat = style === 'ma'
        ? (.028 + Math.min(.075, ws * .15))
        : (.008 + Math.min(.038, ws * .09));
      slots.push({
        ...rect(mat, mat * .92, 1 - mat * 2, 1 - mat * 1.84),
        index: 0, label: '[01]', softEdge: style === 'impressionism'
      });
    }
  } else if (style === 'film') {
    // Cinema 35mm Storyboard: commanding wide hero frame + generous storyboard frames below.
    const gap = .018;
    if (count === 2) {
      slots.push({ ...rect(.015, .012, .97, .545), index: 0, label: '[01]', timecode: '00:00:04' });
      slots.push({ ...rect(.015, .578, .97, .410), index: 1, label: '[02]', timecode: '00:00:12' });
    } else if (count === 5) {
      slots.push({ ...rect(.015, .012, .625, .555), index: 0, label: '[01]', timecode: '00:00:04' });
      slots.push({ ...rect(.658, .012, .327, .555), index: 1, label: '[02]', timecode: '00:00:11' });
      const itemW = (.97 - gap * 2) / 3;
      for (let i = 0; i < 3; i++) {
        slots.push({
          ...rect(.015 + i * (itemW + gap), .588, itemW, .400),
          index: i + 2, label: `[0${i + 3}]`, timecode: `00:00:${String(18 + i * 7).padStart(2, '0')}`
        });
      }
    } else {
      const heroH = .565;
      slots.push({ ...rect(.015, .012, .97, heroH), index: 0, label: '[01]', timecode: '00:00:04' });
      const rest = count - 1;
      const itemW = (.97 - gap * (rest - 1)) / rest;
      const stripY = .012 + heroH + .022;
      const stripH = .988 - stripY;
      for (let i = 0; i < rest; i++) {
        slots.push({
          ...rect(.015 + i * (itemW + gap), stripY, itemW, stripH),
          index: i + 1, label: `[0${i + 2}]`, timecode: `00:00:${String(12 + i * 7).padStart(2, '0')}`
        });
      }
    }
  } else if (style === 'constructivism') {
    // Bauhaus / Kandinsky jagged 1px-line asymmetry + compact empty powerCell for beat geometry.
    const g = .012;
    if (count === 2) {
      slots.push({ ...rect(0, 0, .64, 1), index: 0, label: '[01]' });
      powerCell = rect(.64 + g, 0, .36 - g, .25);
      slots.push({ ...rect(.64 + g, .25 + g, .36 - g, .75 - g), index: 1, label: '[02]' });
    } else if (count === 3) {
      slots.push({ ...rect(0, 0, .64, .62), index: 0, label: '[01]' });
      powerCell = rect(.64 + g, 0, .36 - g, .24);
      slots.push({ ...rect(.64 + g, .24 + g, .36 - g, .76 - g), index: 1, label: '[02]' });
      slots.push({ ...rect(0, .62 + g, .64, .38 - g), index: 2, label: '[03]' });
    } else if (count === 4) {
      slots.push({ ...rect(0, 0, .61, .60), index: 0, label: '[01]' });
      powerCell = rect(.61 + g, 0, .39 - g, .21);
      slots.push({ ...rect(.61 + g, .21 + g, .39 - g, .39 - g), index: 1, label: '[02]' });
      slots.push({ ...rect(0, .60 + g, .45, .40 - g), index: 2, label: '[03]' });
      slots.push({ ...rect(.45 + g, .60 + g, .55 - g, .40 - g), index: 3, label: '[04]' });
    } else {
      slots.push({ ...rect(0, 0, .59, .57), index: 0, label: '[01]' });
      powerCell = rect(.59 + g, 0, .41 - g, .19);
      slots.push({ ...rect(.59 + g, .19 + g, .41 - g, .38 - g), index: 1, label: '[02]' });
      slots.push({ ...rect(0, .57 + g, .33, .43 - g), index: 2, label: '[03]' });
      slots.push({ ...rect(.33 + g, .57 + g, .32, .43 - g), index: 3, label: '[04]' });
      slots.push({ ...rect(.65 + g, .57 + g, .35 - g, .43 - g), index: 4, label: '[05]' });
    }
  } else if (style === 'ma') {
    // Japanese minimalism (Wabi-sabi / Ma): calm negative space with large, well-proportioned plates.
    const air = .026 + Math.min(.042, ws * .085);
    const span = 1 - air * 2;
    if (count === 2) {
      slots.push({ ...rect(air * .65, air * .55, span * .74, span * .62), index: 0, label: '[01]' });
      slots.push({ ...rect(1 - air * .65 - span * .68, 1 - air * .55 - span * .56, span * .68, span * .56), index: 1, label: '[02]' });
    } else if (count === 3) {
      slots.push({ ...rect(air * .7, air * .6, span * .63, span * .56), index: 0, label: '[01]' });
      slots.push({ ...rect(air * .7 + span * .66, air * .6 + span * .05, span * .34, span * .51), index: 1, label: '[02]' });
      slots.push({ ...rect(air * .7 + span * .20, air * .6 + span * .60, span * .80, span * .40), index: 2, label: '[03]' });
    } else if (count === 4) {
      const cw = (span - .032) / 2, ch = (span - .038) / 2;
      slots.push({ ...rect(air, air * .7, cw, ch), index: 0, label: '[01]' });
      slots.push({ ...rect(air + cw + .032, air * .7 + .025, cw, ch * .96), index: 1, label: '[02]' });
      slots.push({ ...rect(air + .015, air * .7 + ch + .032, cw * .97, ch * .96), index: 2, label: '[03]' });
      slots.push({ ...rect(air + cw + .032, air * .7 + ch + .044, cw, ch * .94), index: 3, label: '[04]' });
    } else {
      slots.push({ ...rect(air * .7, air * .6, span * .60, span * .54), index: 0, label: '[01]' });
      slots.push({ ...rect(air * .7 + span * .63, air * .6 + .02, span * .37, span * .52), index: 1, label: '[02]' });
      const sw = (span - .044) / 3;
      const sy = air * .6 + span * .575;
      for (let i = 0; i < 3; i++) {
        slots.push({ ...rect(air * .7 + i * (sw + .022), sy + (i === 1 ? .018 : 0), sw, span * .41), index: i + 2, label: `[0${i + 3}]` });
      }
    }
  } else {
    // Impressionism (Monet): bold overlapping painterly studies filling the stage richly.
    if (count === 2) {
      slots.push({ ...rect(.01, .01, .75, .72), index: 0, label: '[01]', softEdge: true });
      slots.push({ ...rect(.25, .27, .74, .72), index: 1, label: '[02]', softEdge: true });
    } else if (count === 3) {
      slots.push({ ...rect(.01, .02, .68, .68), index: 0, label: '[01]', softEdge: true });
      slots.push({ ...rect(.51, .01, .48, .50), index: 1, label: '[02]', softEdge: true });
      slots.push({ ...rect(.37, .48, .62, .51), index: 2, label: '[03]', softEdge: true });
    } else if (count === 4) {
      slots.push({ ...rect(.01, .01, .60, .58), index: 0, label: '[01]', softEdge: true });
      slots.push({ ...rect(.49, .02, .50, .48), index: 1, label: '[02]', softEdge: true });
      slots.push({ ...rect(.02, .50, .51, .49), index: 2, label: '[03]', softEdge: true });
      slots.push({ ...rect(.45, .44, .54, .55), index: 3, label: '[04]', softEdge: true });
    } else {
      slots.push({ ...rect(.16, .10, .64, .56), index: 0, label: '[01]', softEdge: true });
      slots.push({ ...rect(.01, .01, .42, .40), index: 1, label: '[02]', softEdge: true });
      slots.push({ ...rect(.57, .01, .42, .42), index: 2, label: '[03]', softEdge: true });
      slots.push({ ...rect(.01, .52, .48, .47), index: 3, label: '[04]', softEdge: true });
      slots.push({ ...rect(.49, .51, .50, .48), index: 4, label: '[05]', softEdge: true });
    }
  }

  // Clickable Sound Signature bounding box: vertical 35mm optical strip on right OR bottom footer track.
  const sigBox = style === 'film'
    ? { x: width - pad - opticalW + Math.round(opticalW * .16), y: work.y + Math.round(work.h * .03), w: Math.round(opticalW * .76), h: Math.round(work.h * .94), vertical: true }
    : { x: footer.x, y: height - Math.round(height * .060), w: Math.round(footer.w * .62), h: Math.round(height * .038), vertical: false };

  return {
    style, header, stage, work, footer, slots, powerCell, sigBox,
    filmPerforations: style === 'film',
    pad,
    // Backward-compatible frame aliases for code expecting { x, y, w, h, margin, captionBottom, footerY, footerOnPaper }
    x: slots[0].x, y: slots[0].y, w: slots[0].w, h: slots[0].h,
    margin: Math.round(width * .042),
    captionBottom: footer.y + Math.round(footer.h * .68),
    footerY: height - Math.round(height * .036),
    footerOnPaper: true
  };
}

export function postcardLayout(width, height, recipe, photoCount = 1) {
  return contactSheetLayout(width, height, recipe, photoCount);
}

export function signatureHitBox(width, height, recipe, photoCount = 1) {
  return contactSheetLayout(width, height, recipe, photoCount).sigBox;
}

// Artistic "Sound Signature" embedded directly inside the 4:5 Contact Sheet.
export function drawSoundSignature(ctx, width, height, recipe, playProgress = 0, bands = null, hoverProgress = -1, photoCount = 1) {
  const env = Array.isArray(recipe.envelope) && recipe.envelope.length ? recipe.envelope : null;
  if (!env) return;
  const box = signatureHitBox(width, height, recipe, photoCount);
  const unit = width / 880;
  const style = recipe.signatureStyle || 'impressionism';
  const bass = bands?.bass || 0, mid = bands?.mid || 0, high = bands?.high || 0;
  const dark = Boolean(recipe.sheetDark);
  const ink = recipe.sheetInk || (dark ? '#f2efe8' : recipe.ink || '#1d1f1b');
  const accent = (recipe.palette && recipe.palette[recipe.palette.length - 1]) || '#d67c4a';
  const count = env.length;
  ctx.save();

  if (style === 'film') {
    // 35mm optical variable-area soundtrack along the right margin of the film strip.
    const cx = box.x + box.w * .5;
    ctx.fillStyle = 'rgba(10, 8, 7, 0.72)';
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeStyle = 'rgba(255, 214, 158, 0.28)';
    ctx.lineWidth = Math.max(.75, unit);
    ctx.strokeRect(box.x + .5, box.y + .5, box.w - 1, box.h - 1);
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const py = box.y + t * box.h;
      const amp = (.12 + env[i] * .88) * (1 + bass * .26 + mid * .16);
      const halfW = Math.min(box.w * .43, box.w * .40 * amp);
      const played = playProgress > 0 && t <= playProgress;
      ctx.fillStyle = played ? '#ffcb7d' : 'rgba(255, 224, 180, 0.52)';
      const barH = Math.max(1.6 * unit, box.h / count - .8 * unit);
      ctx.fillRect(cx - halfW, py - barH * .5, halfW * 2, barH);
    }
    if (playProgress > 0) {
      const py = box.y + playProgress * box.h;
      ctx.strokeStyle = '#ff9852';
      ctx.lineWidth = 1.6 * unit;
      ctx.beginPath(); ctx.moveTo(box.x - 4 * unit, py); ctx.lineTo(box.x + box.w + 4 * unit, py); ctx.stroke();
    }
    if (hoverProgress >= 0) {
      const hy = box.y + hoverProgress * box.h;
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = unit;
      ctx.beginPath(); ctx.moveTo(box.x, hy); ctx.lineTo(box.x + box.w, hy); ctx.stroke();
    }
  } else if (style === 'constructivism') {
    const baseY = box.y + box.h * .66;
    ctx.strokeStyle = recipe.sheetRule || 'rgba(255,255,255,0.28)';
    ctx.lineWidth = Math.max(1, unit);
    ctx.beginPath(); ctx.moveTo(box.x, baseY); ctx.lineTo(box.x + box.w, baseY); ctx.stroke();
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const px = box.x + t * box.w;
      const v = env[i];
      const played = playProgress > 0 && t <= playProgress;
      const lift = v * box.h * .62 * (1 + bass * .36);
      ctx.strokeStyle = played ? accent : ink;
      ctx.globalAlpha = played ? .98 : .48;
      ctx.lineWidth = (v > .65 ? 1.7 : .95) * unit;
      ctx.beginPath();
      ctx.moveTo(px, baseY);
      ctx.lineTo(px, baseY - (i % 3 === 0 ? lift : -lift * .32));
      ctx.stroke();
      if (v > .74 && i % 3 === 0) {
        ctx.fillStyle = played ? '#ffffff' : accent;
        ctx.beginPath(); ctx.arc(px, baseY - lift, (1.8 + v * 2 + bass * 2.2) * unit, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    if (playProgress > 0) {
      const hx = box.x + playProgress * box.w;
      ctx.strokeStyle = ink; ctx.lineWidth = 1.6 * unit;
      ctx.beginPath(); ctx.moveTo(hx, box.y); ctx.lineTo(hx, box.y + box.h); ctx.stroke();
    }
  } else if (style === 'ma') {
    const midY = box.y + box.h * .52;
    const pts = [];
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const px = box.x + t * box.w;
      const wave = (env[i] - .42) * box.h * .68 * (1 + mid * .26) * Math.sin(i * 1.15 + .4);
      pts.push([px, midY + wave, env[i]]);
    }
    for (let i = 1; i < pts.length; i++) {
      const t = i / (pts.length - 1);
      const played = playProgress > 0 && t <= playProgress;
      ctx.strokeStyle = ink;
      ctx.globalAlpha = played ? .95 : .42;
      ctx.lineWidth = (.7 + pts[i][2] * 4.4 * (1 + bass * .32)) * unit;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (playProgress > 0) {
      const idx = Math.min(pts.length - 1, Math.round(playProgress * (pts.length - 1)));
      ctx.fillStyle = ink;
      ctx.beginPath(); ctx.arc(pts[idx][0], pts[idx][1], (3 + bass * 2) * unit, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    // Impressionism (Monet): luminous watercolor horizon & gentle brushstroke glints.
    const midY = box.y + box.h * .54;
    ctx.beginPath();
    ctx.moveTo(box.x, midY);
    for (let i = 0; i < count; i++) ctx.lineTo(box.x + (i / (count - 1)) * box.w, midY - env[i] * box.h * .44 * (1 + mid * .32));
    for (let i = count - 1; i >= 0; i--) ctx.lineTo(box.x + (i / (count - 1)) * box.w, midY + env[i] * box.h * .28 * (1 + bass * .22));
    ctx.closePath();
    ctx.fillStyle = (recipe.palette && recipe.palette[1]) || accent;
    ctx.globalAlpha = .20 + mid * .15;
    ctx.fill();
    ctx.globalAlpha = 1;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const px = box.x + t * box.w;
      const v = env[i];
      const played = playProgress > 0 && t <= playProgress;
      const dabW = (box.w / count) * (1.2 + v * .85);
      const oy = Math.sin(i * 1.9) * box.h * .15 * v;
      ctx.strokeStyle = ink;
      ctx.globalAlpha = played ? .90 : .38;
      ctx.lineWidth = (1 + v * 2.2 + high * 1.1) * unit;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(px - dabW * .5, midY + oy); ctx.lineTo(px + dabW * .5, midY + oy); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (playProgress > 0) {
      const hx = box.x + playProgress * box.w;
      ctx.fillStyle = ink;
      ctx.beginPath(); ctx.arc(hx, midY, (2.8 + mid * 1.8) * unit, 0, Math.PI * 2); ctx.fill();
    }
  }

  if (!box.vertical && hoverProgress >= 0) {
    const hx = box.x + hoverProgress * box.w;
    ctx.strokeStyle = ink;
    ctx.globalAlpha = .55;
    ctx.lineWidth = Math.max(1, unit);
    ctx.beginPath(); ctx.moveTo(hx, box.y); ctx.lineTo(hx, box.y + box.h); ctx.stroke();
  }
  ctx.restore();
}

// Draws the permanent Archival Contact Sheet structural frame, hairlines, calibration scale,
// film perforations, and Kandinsky powerCell geometry (used by live canvas & portable memory.html).
export function drawPostcardDesign(ctx, width, height, recipe, photoCount = 1, bands = null) {
  const layout = contactSheetLayout(width, height, recipe, photoCount);
  const { style, header, stage, footer, slots, powerCell, pad } = layout;
  const unit = width / 880;
  const dark = Boolean(recipe.sheetDark);
  const ink = recipe.sheetInk || (dark ? '#f2efe8' : recipe.ink || '#1d1f1b');
  const rule = recipe.frameBorder || recipe.sheetRule || (dark ? 'rgba(242,239,232,0.18)' : 'rgba(30,32,27,0.16)');
  const accent = (recipe.palette && recipe.palette[recipe.palette.length - 1]) || ink;
  const bass = bands?.bass || 0;
  ctx.save();

  // Outer archival 1px plate border & horizontal section hairlines (top index bar + bottom footer).
  ctx.strokeStyle = rule;
  ctx.lineWidth = Math.max(1, unit);
  ctx.strokeRect(.5, .5, width - 1, height - 1);
  ctx.beginPath();
  ctx.moveTo(0, stage.y + .5); ctx.lineTo(width, stage.y + .5);
  ctx.moveTo(0, footer.y + .5); ctx.lineTo(width, footer.y + .5);
  ctx.stroke();

  // Calibration color scale (4 real K-Means palette squares) in the right corner of the index header.
  const swatches = (recipe.palette || []).slice(0, 4);
  const sq = Math.round(13 * unit), gap = Math.round(4 * unit);
  const sy = Math.round((header.h - sq) / 2);
  swatches.forEach((color, i) => {
    const sx = width - pad - (swatches.length - i) * sq - (swatches.length - 1 - i) * gap;
    ctx.fillStyle = color;
    ctx.fillRect(sx, sy, sq, sq);
    ctx.strokeStyle = rule;
    ctx.strokeRect(sx + .5, sy + .5, sq - 1, sq - 1);
  });

  // Film 35mm sprocket perforations & dark cinematic film strip bed.
  if (style === 'film') {
    const perfW = Math.round(7 * unit), perfH = Math.round(11 * unit);
    const leftX = Math.round(pad * .34);
    ctx.fillStyle = 'rgba(255, 224, 180, 0.24)';
    const steps = 16;
    for (let i = 0; i < steps; i++) {
      const py = stage.y + Math.round(stage.h * ((i + .5) / steps)) - perfH / 2;
      ctx.fillRect(leftX, py, perfW, perfH);
    }
  }

  // Constructivist / Kandinsky 1px grid rules & beat-reactive geometry inside the dedicated powerCell.
  if (style === 'constructivism' && powerCell) {
    const { x, y, w, h } = powerCell;
    ctx.strokeStyle = rule;
    ctx.lineWidth = Math.max(1, unit);
    ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
    const cx = x + w * .52, cy = y + h * .50;
    const r = Math.min(w, h) * (.22 + .09 * bass);
    ctx.strokeStyle = ink;
    ctx.globalAlpha = .35 + .40 * bass;
    ctx.beginPath();
    ctx.moveTo(x + w * .08, y + h * .84); ctx.lineTo(x + w * .92, y + h * .14);
    ctx.moveTo(cx, y + h * .08); ctx.lineTo(cx, y + h * .92);
    ctx.moveTo(x + w * .10, cy); ctx.lineTo(x + w * .90, cy);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.globalAlpha = .28 + .42 * bass;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = ink;
    ctx.globalAlpha = .65 + .30 * bass;
    ctx.lineWidth = (1.3 + bass * 1.2) * unit;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.42, -.3 * Math.PI, 1.15 * Math.PI); ctx.stroke();
    ctx.fillStyle = ink;
    ctx.globalAlpha = .55;
    ctx.fillRect(x + w * .12, y + h * .14, w * (.28 + .18 * bass), Math.max(2, 3 * unit));
    ctx.globalAlpha = 1;
  }

  // Japanese minimalism (Ma): delicate print crop marks framing the photo slots.
  if (style === 'ma') {
    const tick = Math.round(9 * unit), tgap = Math.round(3 * unit);
    ctx.strokeStyle = ink;
    ctx.globalAlpha = .34;
    ctx.lineWidth = Math.max(.75, unit);
    for (const s of slots) {
      for (const [cx, dx] of [[s.x, -1], [s.x + s.w, 1]]) {
        for (const [cy, dy] of [[s.y, -1], [s.y + s.h, 1]]) {
          ctx.beginPath();
          ctx.moveTo(cx + dx * tgap, cy); ctx.lineTo(cx + dx * tick, cy);
          ctx.moveTo(cx, cy + dy * tgap); ctx.lineTo(cx, cy + dy * tick);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}
