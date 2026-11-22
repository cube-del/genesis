const skies = [
  'mist', 'warm_haze', 'rain_glass', 'wind_sparks', 'clear_light',
  'snow_drift', 'starlight', 'amber_bokeh', 'petal_drift', 'neon_pulse'
];
const tau = 2 * Math.PI;
const duration = 7800;
const frameTime = 1000 / 30;

export function skyFor(day) {
  const code = day.weatherType || day.weather?.effect_type;
  if (skies.includes(code)) return code;
  const label = String(day.weather?.label || day.weather || '').toLowerCase();
  if (/дожд|ливень|rain/.test(label)) return 'rain_glass';
  if (/снег|мороз|зима|snow/.test(label)) return 'snow_drift';
  if (/зв[её]зд|лун|космос|star/.test(label)) return 'starlight';
  if (/неон|мегаполис|витрин|neon/.test(label)) return 'neon_pulse';
  if (/боке|огни|фонар|свеч|bokeh/.test(label)) return 'amber_bokeh';
  if (/лист|лепест|petal/.test(label)) return 'petal_drift';
  if (/ветер|ветр|искр|статик|wind/.test(label)) return 'wind_sparks';
  if (/туман|mist|fog/.test(label)) return 'mist';
  if (/дымк|т[её]пл|haze/.test(label)) return 'warm_haze';
  return 'clear_light';
}

function seededRandom(key) {
  let state = 2166136261;
  for (const letter of key) state = Math.imul(state ^ letter.charCodeAt(0), 16777619);
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const smooth = t => t * t * (3 - 2 * t);
const mix = (a, b, t) => a + (b - a) * t;

function cloudTexture(random, warm) {
  // Paint the noise field once, then drift the bitmap across the viewport.
  const tile = document.createElement('canvas');
  tile.width = 224;
  tile.height = 160;
  const context = tile.getContext('2d');
  if (!context) return null;
  const pixels = context.createImageData(tile.width, tile.height);
  const lattice = Float32Array.from({length: 32 * 32}, random);
  const light = warm ? [255, 224, 181] : [229, 239, 237];
  const shade = warm ? [198, 148, 114] : [129, 152, 156];
  const sample = (x, y) => lattice[(y & 31) * 32 + (x & 31)];
  function noise(x, y) {
    const i = Math.floor(x), j = Math.floor(y);
    const u = smooth(x - i), v = smooth(y - j);
    return mix(mix(sample(i, j), sample(i + 1, j), u), mix(sample(i, j + 1), sample(i + 1, j + 1), u), v);
  }
  for (let y = 0; y < tile.height; y++) {
    for (let x = 0; x < tile.width; x++) {
      const mid = y / tile.height;
      const a = x / 55 + 3.8, b = y / 18 + 4.6 + Math.sin(x / 47) * .9;
      const noiseValue = noise(a, b) * .62 + noise(a * 2.4, b * 2.1) * .27 + noise(a * 4.8, b * 3.2) * .11;
      const density = Math.min(1, Math.max(0, (noiseValue - .28) * 2.05));
      const offset = 4 * (y * tile.width + x);
      const lighting = smooth(Math.min(1, Math.max(0, (noiseValue - .38) / .36)));
      pixels.data[offset] = mix(shade[0], light[0], lighting);
      pixels.data[offset + 1] = mix(shade[1], light[1], lighting);
      pixels.data[offset + 2] = mix(shade[2], light[2], lighting);
      pixels.data[offset + 3] = Math.round(130 * density * Math.sin(mid * Math.PI) ** .6);
    }
  }
  context.putImageData(pixels, 0, 0);
  return tile;
}

function drawClouds(ctx, texture, w, h, time, warm) {
  if (!texture) return;
  const shift = Math.sin(time * .22) * w * .085;
  ctx.globalAlpha = warm ? .56 : .76;
  ctx.drawImage(texture, -w * .38 + shift, -h * .22 + time * h * .007, w * 1.8, h * .99);
  ctx.globalAlpha = warm ? .33 : .51;
  ctx.drawImage(texture, -w * .22 - shift * .55, h * .27 - time * h * .007, w * 1.6, h * .76);
  ctx.globalAlpha = 1;
}

function drawRain(ctx, drops, w, h, time) {
  ctx.lineCap = 'round';
  for (const p of drops) {
    const y = (p.y * (h + 70) + time * (240 + 210 * p.depth)) % (h + 70) - 35;
    const x = ((p.x * w - y * .11) % (w + 20) + w + 20) % (w + 20) - 10;
    const len = 8 + p.depth * 22;
    ctx.strokeStyle = 'rgba(53,81,90,' + (.12 + p.depth * .25) + ')';
    ctx.lineWidth = .65 + p.depth * .65;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len * .11, y - len); ctx.stroke();
    ctx.strokeStyle = 'rgba(243,250,246,' + (.25 + p.depth * .42) + ')';
    ctx.beginPath(); ctx.moveTo(x + 1, y); ctx.lineTo(x + .8 + len * .07, y - len * .67); ctx.stroke();
  }
}

function drawWind(ctx, particles, w, h, time, accent) {
  for (const [i, p] of particles.entries()) {
    const reach = 15 + 37 * p.depth;
    const x = (p.x * (w + 2 * reach) + time * (69 + 112 * p.depth)) % (w + 2 * reach) - reach;
    const wave = x / w * 4.4 + p.phase + time * .6;
    const y = p.y * h + Math.sin(wave) * (8 + p.depth * 15);
    if (i % 4 === 0) {
      ctx.strokeStyle = 'rgba(104,117,104,' + (.20 + .14 * p.depth) + ')';
      ctx.lineWidth = .8 + p.depth * .42;
      ctx.beginPath(); ctx.moveTo(x - reach, y + 5);
      ctx.bezierCurveTo(x - reach * .45, y + Math.sin(wave + 1) * 9, x - 8, y - 4, x, y);
      ctx.stroke();
    } else {
      const size = 1.35 + p.depth * 1.8;
      ctx.fillStyle = i % 3 === 0 ? accent : 'rgb(158,129,82)';
      ctx.globalAlpha = (.29 + .29 * p.depth) * (.5 + .5 * Math.abs(Math.cos(wave)));
      ctx.beginPath(); ctx.ellipse(x, y, size * 1.4, size * .52, wave * .92, 0, tau); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

function drawMotes(ctx, particles, w, h, time, warm) {
  for (const p of particles) {
    const x = (p.x * w + time * (2 + 3.5 * p.depth)) % w;
    const y = ((p.y * h - time * (3 + 5 * p.depth) + h) % h + h) % h + Math.sin(time * .46 + p.phase) * 3;
    const size = .65 + p.depth * (warm ? 2.55 : 1.35);
    const shimmer = .18 + .3 * (Math.sin(time * .62 + p.phase) * .5 + .5);
    ctx.fillStyle = warm ? 'rgba(201,144,75,' + shimmer + ')' : 'rgba(183,157,102,' + shimmer + ')';
    ctx.beginPath(); ctx.arc(x, y, size, 0, tau); ctx.fill();
    ctx.fillStyle = 'rgba(255,250,222,' + (.3 + shimmer) + ')';
    ctx.beginPath(); ctx.arc(x - size * .15, y - size * .36, size * .58, 0, tau); ctx.fill();
  }
}

function drawSnow(ctx, particles, w, h, time) {
  for (const p of particles) {
    const y = (p.y * (h + 40) + time * (24 + 46 * p.depth)) % (h + 40) - 20;
    const sway = Math.sin(time * (.55 + p.depth * .65) + p.phase) * (14 + 26 * p.depth);
    const x = ((p.x * w + sway + time * (6 + 9 * p.depth)) % (w + 30) + w + 30) % (w + 30) - 15;
    const r = 1.1 + p.depth * 3.1;
    const alpha = .28 + p.depth * .56;
    ctx.fillStyle = `rgba(225,240,252,${(alpha * .45).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(x, y, r * 1.9, 0, tau); ctx.fill();
    ctx.fillStyle = `rgba(252,254,255,${alpha.toFixed(3)})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, tau); ctx.fill();
  }
}

function drawStarlight(ctx, particles, w, h, time) {
  const anchors = [];
  for (const [i, p] of particles.entries()) {
    const x = ((p.x * w + time * (.4 + .6 * p.depth)) % w + w) % w;
    const y = p.y * h * .86;
    const twinkle = .22 + .78 * (Math.sin(time * (1.2 + p.depth * 2.2) + p.phase) * .5 + .5);
    const r = .65 + p.depth * 1.9;
    ctx.fillStyle = i % 5 === 0
      ? `rgba(182,216,255,${(twinkle * .85).toFixed(3)})`
      : `rgba(255,248,230,${(twinkle * .9).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, tau); ctx.fill();
    if (p.depth > .76) {
      anchors.push([x, y, twinkle]);
      ctx.strokeStyle = `rgba(255,250,236,${(twinkle * .42).toFixed(3)})`;
      ctx.lineWidth = .7;
      ctx.beginPath();
      ctx.moveTo(x - r * 3.2, y); ctx.lineTo(x + r * 3.2, y);
      ctx.moveTo(x, y - r * 3.2); ctx.lineTo(x, y + r * 3.2);
      ctx.stroke();
    }
  }
  ctx.lineWidth = .65;
  for (let i = 0; i < Math.min(anchors.length, 16); i++) {
    for (let j = i + 1; j < Math.min(anchors.length, 16); j++) {
      const d = Math.hypot(anchors[i][0] - anchors[j][0], anchors[i][1] - anchors[j][1]);
      if (d < 160) {
        ctx.strokeStyle = `rgba(210,226,255,${((1 - d / 160) * .16).toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(anchors[i][0], anchors[i][1]); ctx.lineTo(anchors[j][0], anchors[j][1]); ctx.stroke();
      }
    }
  }
  const cycle = (time * .28) % 1;
  if (cycle < .24) {
    const k = cycle / .24;
    const sx = w * (.18 + k * .42), sy = h * (.10 + k * .18);
    const grad = ctx.createLinearGradient(sx, sy, sx - 90, sy - 38);
    grad.addColorStop(0, `rgba(255,252,240,${Math.sin(k * Math.PI) * .75})`);
    grad.addColorStop(1, 'rgba(255,252,240,0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - 90, sy - 38); ctx.stroke();
  }
}

function drawBokeh(ctx, particles, w, h, time, palette) {
  const colors = ['#ffb85c', '#ffd78a', '#e88b47', ...palette.slice(-2)];
  const subset = particles.slice(0, Math.min(particles.length, 46));
  for (const [i, p] of subset.entries()) {
    const x = ((p.x * w + Math.sin(time * .32 + p.phase) * 28 + time * (3 + 4 * p.depth)) % (w + 90) + w + 90) % (w + 90) - 45;
    const y = ((p.y * h - time * (6 + 11 * p.depth)) % (h + 90) + h + 90) % (h + 90) - 45;
    const r = 10 + p.depth * 34;
    const pulse = .11 + .17 * (Math.sin(time * .9 + p.phase) * .5 + .5);
    const col = colors[i % colors.length];
    const g = ctx.createRadialGradient(x, y, r * .12, x, y, r);
    g.addColorStop(0, col);
    g.addColorStop(.68, col);
    g.addColorStop(1, 'rgba(255,190,100,0)');
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, tau); ctx.fill();
    ctx.restore();
  }
}

function drawPetals(ctx, particles, w, h, time, palette) {
  const tones = palette.length ? palette : ['#d68c4a', '#c9a66b', '#8fa67a', '#e4b899'];
  const subset = particles.slice(0, Math.min(particles.length, 58));
  for (const [i, p] of subset.entries()) {
    const x = ((p.x * (w + 80) + time * (26 + 38 * p.depth)) % (w + 80)) - 40;
    const y = ((p.y * (h + 80) + time * (16 + 26 * p.depth) + Math.sin(time * 1.1 + p.phase) * 24) % (h + 80)) - 40;
    const rot = p.phase + time * (.7 + p.depth * .9);
    const size = 4 + p.depth * 6.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(1, .48 + .32 * Math.abs(Math.sin(time * 1.6 + p.phase)));
    ctx.globalAlpha = .34 + p.depth * .42;
    ctx.fillStyle = tones[i % tones.length];
    ctx.beginPath();
    ctx.moveTo(-size, 0);
    ctx.quadraticCurveTo(0, -size * .9, size, 0);
    ctx.quadraticCurveTo(0, size * .9, -size, 0);
    ctx.fill();
    ctx.restore();
  }
}

function drawNeonPulse(ctx, particles, w, h, time, palette) {
  const hues = ['#34d6e8', '#f04e98', '#ff9b42', ...palette.slice(-2)];
  const subset = particles.slice(0, Math.min(particles.length, 44));
  ctx.lineCap = 'round';
  for (const [i, p] of subset.entries()) {
    const dir = i % 2 === 0 ? 1 : -1;
    const len = 36 + p.depth * 135;
    const x = ((p.x * (w + len * 2) + dir * time * (75 + 145 * p.depth)) % (w + len * 2) + w + len * 2) % (w + len * 2) - len;
    const y = p.y * h + Math.sin(time * .6 + p.phase) * 6;
    const col = hues[i % hues.length];
    const grad = ctx.createLinearGradient(x - dir * len, y, x, y);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, col);
    ctx.save();
    ctx.globalAlpha = .16 + p.depth * .34;
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.2 + p.depth * 2.6;
    ctx.beginPath(); ctx.moveTo(x - dir * len, y); ctx.lineTo(x, y); ctx.stroke();
    ctx.restore();
  }
}

export function mountDayWeather(host, day, recipe) {
  const sky = recipe.weatherType;
  let speed=recipe.particleSpeed;
  const random = seededRandom(String(day.id || day.date || '') + sky);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: true });
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const validPalette = (recipe.palette || day.palette || []).filter(color => /^#[\da-f]{6}$/i.test(color));
  const accent = validPalette[0] || '#767969';
  const texture = context && ['warm_haze','mist'].includes(sky) ? cloudTexture(random, sky === 'warm_haze') : null;
  const particles = Array.from({length: 190}, () => ({ x: random(), y: random(), phase: random() * tau, depth: random() }));
  let width = 0, height = 0, visible = [], frame = 0, timer = 0, last = -Infinity, done = false;
  let sizeObserver, highBoost = 0, smoothBoost = 0, simTime = 0, lastSimNow = performance.now();
  const cursor = { x: 0, y: 0, strength: 0, target: 0 };
  const start = performance.now();
  host.classList.add('dt-day-weather');
  host.dataset.sky = sky;
  host.setAttribute('aria-hidden', 'true');
  host.append(canvas);

  function paint(seconds) {
    if (!context || width <= 0 || height <= 0) return;
    context.clearRect(0, 0, width, height);
    if (sky === 'rain_glass') drawRain(context, visible, width, height, seconds);
    else if (sky === 'wind_sparks') drawWind(context, visible, width, height, seconds, accent);
    else if (sky === 'snow_drift') drawSnow(context, visible, width, height, seconds);
    else if (sky === 'starlight') drawStarlight(context, visible, width, height, seconds);
    else if (sky === 'amber_bokeh') drawBokeh(context, visible, width, height, seconds, validPalette);
    else if (sky === 'petal_drift') drawPetals(context, visible, width, height, seconds, validPalette);
    else if (sky === 'neon_pulse') drawNeonPulse(context, visible, width, height, seconds, validPalette);
    else {
      if (texture) drawClouds(context, texture, width, height, seconds, sky === 'warm_haze');
      if (sky !== 'mist') drawMotes(context, visible, width, height, seconds, sky === 'warm_haze');
    }
    cursor.strength += (cursor.target - cursor.strength) * .16;
    if (cursor.strength > .02) {
      context.save();
      context.globalCompositeOperation = 'destination-out';
      const radius = Math.min(width, height) * .22;
      const hole = context.createRadialGradient(cursor.x, cursor.y, radius * .12, cursor.x, cursor.y, radius);
      hole.addColorStop(0, `rgba(0,0,0,${(.92 * cursor.strength).toFixed(3)})`);
      hole.addColorStop(.55, `rgba(0,0,0,${(.45 * cursor.strength).toFixed(3)})`);
      hole.addColorStop(1, 'rgba(0,0,0,0)');
      context.fillStyle = hole;
      context.beginPath(); context.arc(cursor.x, cursor.y, radius, 0, tau); context.fill();
      context.restore();
    }
  }
  function size() {
    const rect = host.getBoundingClientRect();
    width = Math.round(rect.width); height = Math.round(rect.height);
    // The weather texture remains soft at a lower resolution on ultrawide screens.
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(2400000 / Math.max(1, width * height)));
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    context?.setTransform(ratio, 0, 0, ratio, 0, 0);
    visible = particles.slice(0, Math.max(16, Math.round(width * height / (sky === 'rain_glass' ? 6800 : 12500))));
    paint(reduced.matches ? 0 : simTime);
  }
  function destroy() {
    if (done) return;
    done = true;
    window.clearTimeout(timer);
    window.cancelAnimationFrame(frame);
    document.removeEventListener('visibilitychange', resume);
    reduced.removeEventListener('change', resume);
    window.removeEventListener('resize', size);
    sizeObserver?.disconnect();
    canvas.remove();
    canvas.width = canvas.height = 1;
    if (texture) texture.width = texture.height = 1;
    delete host.dataset.sky;
    host.classList.remove('dt-day-weather');
    host.style.removeProperty('opacity');
  }
  function animate(now) {
    frame = 0;
    if (done || document.hidden) return;
    const elapsed = now - start;
    if (elapsed >= duration) return destroy();
    if (now - last >= frameTime - 1) {
      const dt = Math.min(0.1, Math.max(0, (now - lastSimNow) / 1000));
      lastSimNow = now;
      last = now;
      smoothBoost += (highBoost - smoothBoost) * 0.14;
      simTime += dt * speed * (1 + smoothBoost * 0.35);
      const enter = smooth(Math.min(1, elapsed / 680));
      const leave = smooth(Math.min(1, Math.max(0, (duration - elapsed) / 2600)));
      host.style.opacity = String((.16 + .84 * enter) * leave);
      paint(simTime);
    }
    frame = window.requestAnimationFrame(animate);
  }
  function resume() {
    window.cancelAnimationFrame(frame);
    if (done || document.hidden) return;
    if (performance.now() - start >= duration) return destroy();
    lastSimNow = performance.now();
    if (reduced.matches || !context) {
      host.style.opacity = '.27';
      paint(0);
    } else animate(performance.now());
  }
  size();
  if (window.ResizeObserver) {
    sizeObserver = new ResizeObserver(size);
    sizeObserver.observe(host);
  } else window.addEventListener('resize', size);
  document.addEventListener('visibilitychange', resume);
  reduced.addEventListener('change', resume);
  timer = window.setTimeout(destroy, duration + 30);
  resume();
  return {
    destroy,
    setSpeed(value) { speed = value; },
    setHighBoost(value) { highBoost = Math.max(0, Math.min(1, Number(value) || 0)); },
    setCursor(x, y, active) { cursor.x = x; cursor.y = y; cursor.target = active ? 1 : 0; }
  };
}
