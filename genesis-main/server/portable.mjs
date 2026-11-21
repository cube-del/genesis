import { readFile } from 'node:fs/promises';
import { spotifyLinks } from '../public/media.js';
import { photoInterval, rhythmDescription, tempoLabel } from '../public/rhythm.js';
import { drawPostcardDesign } from '../public/postcard.js';

let offlineEngine;
function html(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
}

// This function is embedded in each postcard. It uses only local files and browser APIs.
async function openPostcard(engineURL, drawDesign, interval) {
  const day = JSON.parse(document.getElementById('day').textContent);
  const byId = id => document.getElementById(id);
  const photo = byId('photo');
  const status = byId('status');
  const music = byId('music');
  const voice = byId('voice');
  const track = day.track;
  const ornament = byId('ornament');
  drawDesign(ornament.getContext('2d'), ornament.width, ornament.height, day.mood);
  const engine = await import(engineURL);
  const scene = byId('scene');
  const motion = byId('motion');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let current = 0, playing = false, soundtrack, narration, utterance, timeout, advance;
  let animating = !reduce.matches;
  if (day.photos.length === 1) scene.style.setProperty('--pan-duration', 29 * interval / 8000 + 's');
  function schedule() {
    clearTimeout(advance);
    if (animating && day.photos.length > 1 && !document.hidden) advance = setTimeout(() => select(current + 1), interval);
  }
  function setMotion(on) {
    animating = on;
    scene.classList.toggle('playing', animating);
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
    photo.src = day.photos[current].src;
    photo.alt = day.photos[current].name;
    byId('count').textContent = (current + 1) + ' / ' + day.photos.length;
    schedule();
  }
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
    if (voice) { voice.textContent = 'Прочесть цитату'; voice.setAttribute('aria-pressed', 'false'); }
  }
  if (voice) voice.onclick = async () => {
    if (narration || utterance) return endVoice();
    status.textContent = '';
    voice.textContent = 'Остановить голос';
    voice.setAttribute('aria-pressed', 'true');
    setVolume(true);
    if (day.voiceSrc) {
      narration = new Audio(day.voiceSrc);
      narration.onended = endVoice;
      try { await narration.play(); return; } catch { narration = null; }
    }
    if ('speechSynthesis' in window) {
      utterance = new SpeechSynthesisUtterance(day.quote);
      utterance.lang = 'ru-RU';
      utterance.rate = day.energy > .7 ? 1.04 : .94;
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
*{box-sizing:border-box}html{color-scheme:light}
body{--paper:#eeeee4;--ink:#252d24;--muted:#4b5a4b;--edge:#b9c3ae;--accent:#385b46;--glow:#fcfaed;
  margin:0;min-height:100vh;background:radial-gradient(ellipse at 18% 0%,var(--glow),transparent 55%),var(--paper);color:var(--ink);font:16px/1.6 system-ui,sans-serif}
body[data-mood=dream]{color-scheme:dark;--paper:#242439;--ink:#f2edf7;--muted:#cec3dc;--edge:#666079;--accent:#e0c5ff;--glow:#41344f}
body[data-mood=joy]{--paper:#fff0d9;--ink:#332a1f;--muted:#72533b;--edge:#d8b78e;--accent:#94451f;--glow:#fffdf4}
body[data-mood=energy]{--paper:#ebebe7;--ink:#211e1a;--muted:#524d47;--edge:#aaa399;--accent:#a43119;--glow:#faf9f3}
main{max-width:1140px;padding:clamp(18px,5vw,64px);margin:auto}
header{display:flex;justify-content:space-between;align-items:center;gap:12px;padding-bottom:16px;border-bottom:1px solid var(--edge);font:700 22px Georgia,serif}
header time{font:500 .74rem system-ui,sans-serif;color:var(--muted)}
article{display:grid;grid-template-columns:minmax(0,1.04fr) minmax(0,.86fr);gap:clamp(28px,6vw,85px);margin-top:clamp(25px,5vw,56px);align-items:start}
figure{margin:0;min-width:0}
#scene{position:relative;aspect-ratio:4/5;overflow:hidden;border-radius:7px;background:#222a24;color:#fff;isolation:isolate;box-shadow:0 18px 42px #19191540,0 2px 8px #19191533}
#photo{height:100%;width:100%;object-fit:cover;display:block}#scene:after{content:"";position:absolute;inset:35% 0 0;background:linear-gradient(transparent,#09110ed6);z-index:0}
#ornament{position:absolute;inset:0;display:block;width:100%;height:100%;z-index:1;pointer-events:none}
#scene.calm img{filter:saturate(.8) contrast(.94)}#scene.dream img{filter:sepia(.15) contrast(1.1)}#scene.joy img{filter:saturate(1.15) brightness(1.04)}#scene.energy img{filter:saturate(1.2) contrast(1.1)}
.playing img{animation:pan var(--pan-duration,29s) ease-in-out infinite alternate}@keyframes pan{to{transform:scale(1.018) translateX(.3%)}}@media(prefers-reduced-motion:reduce){.playing img{animation:none}}
.cover-caption{position:absolute;bottom:8%;left:9%;right:9%;z-index:2;margin:0;font:italic clamp(22px,3vw,38px)/1.22 Georgia,serif;text-wrap:balance;overflow-wrap:anywhere;text-shadow:0 2px 16px #0009}
body[data-mood=energy] .cover-caption{font-family:system-ui,sans-serif;font-style:normal;font-weight:650;letter-spacing:-.045em}
figcaption,.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px}figcaption{justify-content:center}
h1{margin:9px 0 20px;font:clamp(36px,5vw,66px)/.99 Georgia,serif;letter-spacing:-.055em;overflow-wrap:anywhere;text-wrap:balance}
h2{font-size:1rem;margin:24px 0 6px}.meta,#status{font-size:.83rem;color:var(--muted)}
.meta{display:flex;gap:9px;align-items:center;margin:0;color:var(--accent);font-weight:650}
.meta span{width:4px;height:4px;border-radius:50%;background:currentColor}
.chips{display:flex;gap:5px;margin:17px 0 24px}.chips span{width:30px;height:9px;border-radius:9px;border:1px solid #0002}
.text{margin-top:0;white-space:pre-wrap;overflow-wrap:anywhere}.track{margin:0}
.story,.music{border-top:1px solid var(--edge)}
button,a{font:inherit;font-size:.85rem;padding:8px 13px;border-radius:40px;border:1px solid var(--edge);background:transparent;color:var(--ink);text-decoration:none;cursor:pointer}
button:hover,a:hover{border-color:var(--accent);color:var(--accent)}button:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:3px}#music{background:var(--accent);color:var(--paper)}
details{margin-top:24px}summary{cursor:pointer;font-weight:600}footer{border-top:1px solid var(--edge);margin-top:42px;padding-top:14px;font-size:.8rem;color:var(--muted)}
@media(max-width:700px){article{grid-template-columns:1fr;gap:20px;margin-top:24px}figure{max-width:450px;width:100%;margin:auto}}
`;

export async function portablePage(day) {
  const spotify=spotifyLinks(day.track);
  if (spotify) {
    day={...day,track:{...day.track,kind:'link',url:spotify.url}};
    delete day.track.src;
  }
  offlineEngine ||= readFile(new URL('../public/media.js', import.meta.url)).then(data => 'data:text/javascript;base64,' + data.toString('base64'));
  const source = await offlineEngine;
  const date = new Intl.DateTimeFormat('ru-RU', {dateStyle:'long', timeZone:'UTC'}).format(new Date(day.date));
  const mood = {calm:'Спокойствие', joy:'Радость', dream:'Мечтательность', energy:'Энергия'}[day.mood];
  const safe = JSON.stringify(day).replace(/</g, '\\u003c');
  const caption = day.coverText
    ? '<p class="cover-caption">' + html(day.coverText) + '</p>'
    : '<blockquote class="cover-caption">«' + html(day.quote) + '»</blockquote>';
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${html(day.title)} · DayTrace</title><style>${css}</style><body data-mood="${html(day.mood)}">
<main><header>DayTrace <time datetime="${html(day.date)}">${html(date)}</time></header><article><figure><div id="scene" class="${html(day.mood)}">
<img id="photo" src="${html(day.photos[0].src)}" alt="${html(day.photos[0].name)}"><canvas id="ornament" width="880" height="1100" aria-hidden="true"></canvas>${caption}</div>
<figcaption><button id="motion">Пауза движения</button>${day.photos.length > 1 ? '<button id="previous" aria-label="Предыдущая фотография">Назад</button><span id="count">1 / ' + day.photos.length + '</span><button id="next">Далее</button>' : ''}</figcaption></figure>
<section><p class="meta">${html(mood)}<span aria-hidden="true"></span>${html(day.weather)}</p><h1>${html(day.title)}</h1>
<div class="chips" aria-label="Палитра фотографий">${day.palette.map(color => '<span style="background:' + html(color) + '" title="' + html(color) + '"></span>').join('')}</div>
<section class="story"><h2>Запись дня</h2><p class="text">${html(day.text)}</p></section>
<section class="music"><h2>Музыка дня</h2><p class="track">${html(day.track.title)} · ${html(day.track.artist)}</p><p class="meta">${html(tempoLabel(day.track))}</p>
<div class="row">${day.track.kind !== 'link' ? '<button id="music" aria-pressed="false">Слушать фрагмент</button>' : ''}${day.track.url ? '<a target="_blank" rel="noopener noreferrer" href="' + html(day.track.url) + '">' + (spotify?'Открыть в Spotify':'Открыть трек') + '</a>' : ''}${day.voice ? '<button id="voice" aria-pressed="false">Прочесть цитату</button>' : ''}</div>
<p id="status" role="status"></p></section><details><summary>Почему день выглядит так?</summary><ul>${[...day.explanation.slice(0, 3), rhythmDescription(day)].map(line => '<li>' + html(line) + '</li>').join('')}</ul></details></section></article>
<footer>Личный дневник атмосферы дня</footer></main><script type="application/json" id="day">${safe}</script>
<script type="module">(${openPostcard.toString()})(${JSON.stringify(source)}, ${drawPostcardDesign.toString()}, ${photoInterval(day.track)})</script></body></html>`;
}
