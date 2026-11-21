import { readFile } from 'node:fs/promises';
import { frameComposition } from '../public/composition.js';
import { spotifyLinks } from '../public/media.js';
import { photoInterval, tempoLabel } from '../public/rhythm.js';
import { contactSheetLayout, drawPostcardDesign, drawSoundSignature, postcardLayout, signatureHitBox } from '../public/postcard.js';
import { buildVisualRecipe } from '../public/visual-recipe.js';

let offlineEngine;
function html(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
}

// This function is embedded in each standalone Contact Sheet. It uses only local files and browser APIs.
async function openPostcard(engineURL, drawDesign, recipe) {
  const day = JSON.parse(document.getElementById('day').textContent);
  const byId = id => document.getElementById(id);
  const status = byId('status');
  const music = byId('music');
  const voice = byId('voice');
  const track = day.track;
  const ornament = byId('ornament');
  const octx = ornament.getContext('2d');
  drawDesign(octx, ornament.width, ornament.height, recipe, day.photos.length);
  if (typeof drawSoundSignature === 'function') drawSoundSignature(octx, ornament.width, ornament.height, recipe, 0, null, -1, day.photos.length);
  const engine = await import(engineURL);
  const scene = byId('scene');
  const motion = byId('motion');
  const slots = [...scene.querySelectorAll('.plate')];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const interval = recipe.intervalMs || 8000;
  let current = 0, playing = false, soundtrack, narration, utterance, timeout, advance;
  let animating = !reduce.matches;
  const panDuration = Math.max(8, Math.min(48, 26 / Math.max(.25, recipe.motionSpeed || 1)));
  scene.style.setProperty('--pan-duration', panDuration.toFixed(1) + 's');
  function schedule() {
    clearTimeout(advance);
    if (animating && day.photos.length > 1 && !document.hidden) advance = setTimeout(() => select(current + 1), interval);
  }
  function setMotion(on) {
    animating = on;
    scene.classList.toggle('playing', animating);
    for (const vid of scene.querySelectorAll('video')) {
      if (animating) vid.play().catch(() => {});
      else vid.pause();
    }
    motion.textContent = animating ? 'Пауза движения' : 'Включить движение';
    motion.setAttribute('aria-pressed', String(!animating));
    schedule();
  }
  motion.onclick = () => setMotion(!animating);
  reduce.addEventListener('change', () => setMotion(!reduce.matches));
  document.addEventListener('visibilitychange', schedule);
  setMotion(animating);

  function select(i) {
    current = (i + day.photos.length) % day.photos.length;
    slots.forEach((el, idx) => el.classList.toggle('is-active', idx === current));
    if (byId('count')) byId('count').textContent = (current + 1) + ' / ' + day.photos.length;
    schedule();
  }
  slots.forEach((el, idx) => { el.onpointerenter = () => select(idx); });
  if (byId('previous')) {
    byId('previous').onclick = () => select(current - 1);
    byId('next').onclick = () => select(current + 1);
  }
  function setVolume(reading) {
    engine.setDucking(reading);
    if (soundtrack) soundtrack.volume = reading ? .2 : .85;
  }
  function endMusic() {
    playing = false;
    clearTimeout(timeout);
    if (soundtrack) { soundtrack.pause(); soundtrack = null; }
    engine.stopTrack();
    if (music) { music.textContent = 'Слушать фрагмент'; music.setAttribute('aria-pressed', 'false'); }
  }
  if (music) music.onclick = async () => {
    if (playing) return endMusic();
    playing = true;
    music.textContent = 'Остановить музыку';
    music.setAttribute('aria-pressed', 'true');
    status.textContent = '';
    try {
      if (track.kind === 'ambient') await engine.playTrack(day, endMusic);
      else {
        soundtrack = new Audio(track.src);
        soundtrack.onended = endMusic;
        soundtrack.onerror = () => { endMusic(); status.textContent = 'Фрагмент недоступен.'; };
        setVolume(Boolean(narration || utterance));
        await soundtrack.play();
        timeout = setTimeout(endMusic, 30000);
      }
    } catch { endMusic(); status.textContent = 'Не удалось воспроизвести фрагмент.'; }
  };
  function endVoice() {
    if (narration) { narration.pause(); narration = null; }
    if (utterance) { utterance = null; window.speechSynthesis?.cancel(); }
    setVolume(false);
    if (voice) { voice.textContent = 'Послушать запись'; voice.setAttribute('aria-pressed', 'false'); }
  }
  if (voice) voice.onclick = async () => {
    if (narration || utterance) return endVoice();
    status.textContent = '';
    voice.textContent = 'Остановить голос';
    voice.setAttribute('aria-pressed', 'true');
    setVolume(true);
    const preferMale = recipe.voice?.gender === 'male';
    const pickVoice = neuralOnly => {
      const ru = (window.speechSynthesis?.getVoices?.() || []).filter(v => /^ru\b/i.test(v.lang || ''));
      const pool = neuralOnly ? ru.filter(v => /natural|neural|online|google|siri|milena/i.test(v.name || '')) : ru;
      if (!pool.length) return null;
      const match = v => preferMale ? /dmitry|pavel|yuri|male/i.test(v.name || '') : /svetlana|dariya|irina|milena|female/i.test(v.name || '');
      return pool.find(match) || pool[0];
    };
    const neural = 'speechSynthesis' in window ? pickVoice(true) : null;
    if (!neural && day.voiceSrc) {
      narration = new Audio(day.voiceSrc);
      narration.onended = endVoice;
      try { await narration.play(); return; } catch { narration = null; }
    }
    if ('speechSynthesis' in window) {
      utterance = new SpeechSynthesisUtterance(day.text || day.quote);
      utterance.lang = 'ru-RU';
      const chosen = neural || pickVoice(false);
      if (chosen) utterance.voice = chosen;
      utterance.rate = recipe.voice?.rate || (day.energy > .7 ? 1.04 : .94);
      utterance.pitch = recipe.voice?.pitch || 0.98;
      utterance.onend = endVoice;
      utterance.onerror = event => {
        if (!['interrupted','canceled'].includes(event.error)) status.textContent = 'Русская озвучка недоступна в этом браузере.';
        endVoice();
      };
      speechSynthesis.speak(utterance);
    } else { endVoice(); status.textContent = 'Озвучка недоступна в этом браузере.'; }
  };
  window.addEventListener('pagehide', () => { clearTimeout(advance); endVoice(); endMusic(); });
  window.addEventListener('pageshow', schedule);
}

const css = `
*{box-sizing:border-box}html{color-scheme:dark}
body{--paper:#1b1d19;--ink:#f2efe8;--muted:rgba(242,239,232,.66);--edge:rgba(242,239,232,.16);--accent:#e2b98a;
  margin:0;min-height:100vh;background:var(--day-bg,var(--paper));color:var(--ink);font:16px/1.6 system-ui,sans-serif}
main{max-width:1140px;padding:clamp(18px,5vw,64px);margin:auto}
header{display:flex;justify-content:space-between;align-items:center;gap:12px;padding-bottom:14px;border-bottom:1px solid var(--edge);font:500 22px Georgia,serif}
header time{font:500 .72rem ui-monospace,monospace;text-transform:uppercase;letter-spacing:.1em;color:var(--muted)}
article{display:grid;grid-template-columns:minmax(0,1.06fr) minmax(0,.84fr);gap:clamp(28px,6vw,80px);margin-top:clamp(24px,4.5vw,52px);align-items:start}
figure{margin:0;min-width:0}
#scene{position:relative;aspect-ratio:4/5;overflow:hidden;border-radius:2px;background:var(--card-paper,#d4cfc3);color:var(--card-ink,#1d1f1b);border:1px solid var(--card-border,var(--edge));isolation:isolate}
.sheet-head{position:absolute;left:4.2%;right:4.2%;top:0;height:5.8%;display:flex;align-items:center;justify-content:space-between;font:600 .66rem/1 ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;z-index:3;pointer-events:none}
.plate{position:absolute;overflow:hidden;border:1px solid var(--card-border,rgba(255,255,255,.18));transition:opacity .45s ease,filter .45s ease;opacity:.76}
.plate.is-active{opacity:1;z-index:2;outline:1px solid var(--card-highlight,var(--card-ink,#1d1f1b))}
.plate img,.plate video{height:100%;width:100%;object-fit:cover;display:block;filter:var(--photo-filter,none)}
.plate-idx{position:absolute;left:5px;top:5px;padding:1px 4px;background:var(--card-paper,#1a1c19);color:var(--card-ink,#f5f2eb);border:1px solid var(--card-border,transparent);font:600 .6rem/1.2 ui-monospace,monospace}
#ornament{position:absolute;inset:0;display:block;width:100%;height:100%;z-index:2;pointer-events:none}
.playing .plate.is-active img{animation:pan var(--pan-duration,26s) ease-in-out infinite alternate}@keyframes pan{to{transform:scale(1.032) translateX(.5%)}}@media(prefers-reduced-motion:reduce){.playing .plate.is-active img{animation:none}}
.sheet-foot{position:absolute;left:4.2%;right:4.2%;top:76.8%;bottom:5.8%;z-index:3;pointer-events:none}
.sheet-title{margin:0 0 4px;font:500 clamp(18px,2.2vw,28px)/1.08 Georgia,serif}
#scene.is-angular .sheet-title{font-family:system-ui,sans-serif;font-weight:700;letter-spacing:-.03em}
.cover-caption{margin:0;font:italic clamp(13px,1.4vw,18px)/1.28 Georgia,serif;opacity:.76;overflow-wrap:anywhere}
#scene.is-angular .cover-caption{font-family:system-ui,sans-serif;font-style:normal}
figcaption,.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px}figcaption{justify-content:center}
h1{margin:9px 0 20px;font:500 clamp(34px,4.6vw,62px)/1.02 Georgia,serif;letter-spacing:-.025em;overflow-wrap:anywhere;text-wrap:balance}
h2{font:.76rem ui-monospace,monospace;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin:24px 0 8px}
.meta,#status{font:.78rem ui-monospace,monospace;color:var(--muted);letter-spacing:.05em}
.meta{display:flex;gap:9px;align-items:center;margin:0;color:var(--accent);text-transform:uppercase}
.meta span{width:3px;height:3px;background:currentColor}
.chips{display:flex;gap:4px;margin:16px 0 20px}.chips span{width:24px;height:10px;border:1px solid var(--edge)}
.techniques{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 18px}.techniques span{font:.72rem ui-monospace,monospace;padding:3px 8px;border:1px solid var(--edge);color:var(--muted)}
.text{margin-top:0;white-space:pre-wrap;overflow-wrap:anywhere;font:1.05rem/1.72 Georgia,serif}.track{margin:0}
.story,.music{border-top:1px solid var(--edge)}
button,a{font:.78rem ui-monospace,monospace;text-transform:uppercase;letter-spacing:.06em;padding:8px 13px;border-radius:2px;border:1px solid var(--edge);background:transparent;color:var(--ink);text-decoration:none;cursor:pointer}
button:hover,a:hover{border-color:var(--accent);color:var(--accent)}button:focus-visible,a:focus-visible{outline:1.5px solid var(--accent);outline-offset:3px}#music{background:var(--ink);color:var(--day-bg,#1b1d19);border-color:var(--ink)}
details{margin-top:24px}summary{cursor:pointer;font:.8rem ui-monospace,monospace;text-transform:uppercase;letter-spacing:.07em}footer{border-top:1px solid var(--edge);margin-top:42px;padding-top:14px;font:.74rem ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
@media(max-width:700px){article{grid-template-columns:1fr;gap:20px;margin-top:24px}figure{max-width:450px;width:100%;margin:auto}}
`;

export async function portablePage(day) {
  const spotify = spotifyLinks(day.track);
  if (spotify) {
    day = { ...day, track: { ...day.track, kind: 'link', url: spotify.url } };
    delete day.track.src;
  }
  const recipe = buildVisualRecipe(day);
  const layout = contactSheetLayout(880, 1100, recipe, day.photos.length);
  const sepia = Math.min(.28, recipe.amberShift / 28);
  const photoFilter = `saturate(${recipe.saturation.toFixed(2)}) contrast(${recipe.contrast.toFixed(2)}) brightness(${recipe.exposure.toFixed(2)})` +
    (sepia > .01 ? ` sepia(${sepia.toFixed(2)})` : '');
  const sceneStyle = [
    `--card-paper:${recipe.sheetBg}`,
    `--card-ink:${recipe.sheetInk}`,
    `--card-border:${recipe.frameBorder}`,
    `--card-highlight:${recipe.frameHighlight}`,
    `--photo-filter:${photoFilter}`,
    `--type-weight:${recipe.typeWeight}`,
    `--plate-w:${(layout.slots[0].w / 8.8).toFixed(2)}%`
  ].join(';');
  const portableRecipe = {
    whitespace: recipe.whitespace, ink: recipe.ink, palette: recipe.palette,
    sheetBg: recipe.sheetBg, sheetInk: recipe.sheetInk, sheetRule: recipe.sheetRule, sheetDark: recipe.sheetDark,
    frameBorder: recipe.frameBorder, frameHighlight: recipe.frameHighlight,
    halation: recipe.halation, mist: recipe.mist, grain: recipe.grain, geometry: recipe.geometry,
    signatureStyle: recipe.signatureStyle, envelope: recipe.envelope,
    intervalMs: photoInterval(day.track), motionSpeed: recipe.motionSpeed, voice: recipe.voice
  };
  offlineEngine ||= readFile(new URL('../public/media.js', import.meta.url)).then(data => 'data:text/javascript;base64,' + data.toString('base64'));
  const source = await offlineEngine;
  const date = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(day.date));
  const shortStamp = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' }).format(new Date(day.date));
  const mood = { calm: 'Спокойствие', joy: 'Радость', dream: 'Мечтательность', energy: 'Энергия' }[day.mood];
  const safe = JSON.stringify(day).replace(/</g, '\\u003c');
  const safeRecipe = JSON.stringify(portableRecipe).replace(/</g, '\\u003c');
  const caption = day.coverText
    ? '<p class="cover-caption">' + html(day.coverText) + '</p>'
    : '<blockquote class="cover-caption">«' + html(day.quote) + '»</blockquote>';
  const platesHTML = layout.slots.map((slot, idx) => {
    const img = day.photos[slot.index] || day.photos[0];
    const pos = `left:${(slot.x / 8.8).toFixed(2)}%;top:${(slot.y / 11).toFixed(2)}%;width:${(slot.w / 8.8).toFixed(2)}%;height:${(slot.h / 11).toFixed(2)}%`;
    const comp = frameComposition(img, day.mood, slot.w / Math.max(1, slot.h));
    const focalStyle = img.focus ? ` style="object-position:${(comp.x * 100).toFixed(1)}% ${(comp.y * 100).toFixed(1)}%"` : '';
    const isVideo = img.kind === 'video' || /\.(?:mp4|webm|mov|m4v|ogv)$/i.test(img.src || '');
    const mediaTag = isVideo
      ? `<video ${idx === 0 ? 'id="photo" ' : ''}${focalStyle} src="${html(img.src)}"${img.poster ? ' poster="' + html(img.poster) + '"' : ''} muted loop playsinline autoplay></video>`
      : `<img ${idx === 0 ? 'id="photo" ' : ''}${focalStyle} src="${html(img.src)}" alt="${html(img.name)}">`;
    return `<div class="plate${idx === 0 ? ' is-active' : ''}" style="${pos}">${mediaTag}<span class="plate-idx">${slot.label}${isVideo ? ' ▶' : ''}</span></div>`;
  }).join('');
  const notes = [
    recipe.explanation.composition,
    recipe.explanation.color,
    recipe.explanation.texture,
    recipe.explanation.rhythm,
    recipe.explanation.weather,
    recipe.explanation.voice
  ];
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${html(day.title)} · DayTrace</title><style>${css}</style><body data-mood="${html(day.mood)}" style="--day-bg:${recipe.backdrop}">
<main><header>DayTrace <time datetime="${html(day.date)}">${html(date)}</time></header><article><figure><div id="scene" class="${recipe.typeWeight >= 540 ? 'is-angular' : ''}" style="${sceneStyle}">
<div class="sheet-head"><span>№01 · ${html(shortStamp)}</span><span>${html(recipe.weatherLabel)}</span><span></span></div>${platesHTML}<canvas id="ornament" width="880" height="1100" aria-hidden="true"></canvas><div class="sheet-foot"><p class="sheet-title">${html(day.title)}</p>${caption}</div></div>
<figcaption><button id="motion">Пауза движения</button>${day.photos.length > 1 ? '<button id="previous" aria-label="Предыдущая фотография">Назад</button><span id="count">1 / ' + day.photos.length + '</span><button id="next">Далее</button>' : ''}</figcaption></figure>
<section><p class="meta">${html(mood)}<span aria-hidden="true"></span>${html(recipe.weatherLabel)}</p><h1>${html(day.title)}</h1>
<div class="chips" aria-label="Палитра открытки">${recipe.palette.map(color => '<span style="background:' + html(color) + '" title="' + html(color) + '"></span>').join('')}</div>
<div class="techniques">${recipe.artTechniques.map(t => '<span title="' + html(t.ref) + '">' + html(t.name) + '</span>').join('')}</div>
<section class="story"><h2>Запись дня</h2><p class="text">${html(day.text)}</p></section>
<section class="music"><h2>Музыка дня</h2><p class="track">${html(day.track.title)} · ${html(day.track.artist)}</p><p class="meta">${html(tempoLabel(day.track))}</p>
<div class="row">${day.track.kind !== 'link' ? '<button id="music" aria-pressed="false">Слушать фрагмент</button>' : ''}${day.track.url ? '<a target="_blank" rel="noopener noreferrer" href="' + html(day.track.url) + '">' + (spotify ? 'Открыть в Spotify' : 'Открыть трек') + '</a>' : ''}${day.voice ? '<button id="voice" aria-pressed="false">Послушать запись</button>' : ''}</div>
<p id="status" role="status"></p></section><details><summary>Почему день выглядит так?</summary><ul>${notes.map(line => '<li>' + html(line) + '</li>').join('')}</ul></details></section></article>
<footer>Архивный контактный лист · DayTrace</footer></main><script type="application/json" id="day">${safe}</script>
<script type="module">const contactSheetLayout=${contactSheetLayout.toString()};const postcardLayout=${postcardLayout.toString()};const signatureHitBox=${signatureHitBox.toString()};const drawSoundSignature=${drawSoundSignature.toString()};const drawPostcardDesign=${drawPostcardDesign.toString()};(${openPostcard.toString()})(${JSON.stringify(source)}, drawPostcardDesign, ${safeRecipe})</script></body></html>`;
}
