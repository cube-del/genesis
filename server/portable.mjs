import { readFile } from 'node:fs/promises';

let offlineEngine;
function html(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
}

// This function is embedded in each postcard. It uses only local files and browser APIs.
async function openPostcard(engineURL) {
  const day = JSON.parse(document.getElementById('day').textContent);
  const byId = id => document.getElementById(id);
  const photo = byId('photo');
  const status = byId('status');
  const music = byId('music');
  const voice = byId('voice');
  const track = day.track;
  const engine = await import(engineURL);
  let current = 0, playing = false, soundtrack, narration, utterance, timeout;
  function select(i) {
    current = (i + day.photos.length) % day.photos.length;
    photo.src = day.photos[current].src;
    photo.alt = day.photos[current].name;
    byId('count').textContent = (current + 1) + ' / ' + day.photos.length;
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
    byId('scene').classList.remove('playing');
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
      if (playing) byId('scene').classList.add('playing');
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
  window.addEventListener('pagehide', () => { endVoice(); endMusic(); });
}

const css = `
*{box-sizing:border-box}html{color-scheme:light}body{margin:0;background:#f6f5f1;color:#282b23;font:16px/1.55 system-ui,sans-serif}
main{max-width:1100px;padding:clamp(18px,5vw,60px);margin:auto}header{padding-bottom:20px;border-bottom:1px solid #d7d9d0;font-size:18px;font-weight:700}
article{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,.87fr);gap:clamp(28px,5vw,70px);margin-top:36px;align-items:center}
figure{margin:0}#scene{position:relative;aspect-ratio:4/5;overflow:hidden;border-radius:16px;background:#222a24;color:#fff;isolation:isolate}
#photo{height:100%;width:100%;object-fit:cover;display:block}#scene:after{content:"";position:absolute;inset:35% 0 0;background:linear-gradient(transparent,#09110ed6);z-index:0}
#scene.calm img{filter:saturate(.8) contrast(.94)}#scene.dream img{filter:sepia(.15) contrast(1.1)}#scene.joy img{filter:saturate(1.15) brightness(1.04)}#scene.energy img{filter:saturate(1.2) contrast(1.1)}
.playing img{animation:pan 15s ease-in-out infinite alternate}@keyframes pan{to{transform:scale(1.06) translateX(1%)}}@media(prefers-reduced-motion:reduce){.playing img{animation:none}}
blockquote{position:absolute;bottom:7%;left:8%;right:8%;z-index:1;margin:0;font:italic clamp(22px,3vw,38px)/1.22 Georgia,serif;text-wrap:balance;overflow-wrap:anywhere}
figcaption,.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px}figcaption{justify-content:center}
h1{margin:7px 0 18px;font:clamp(31px,4.2vw,52px)/1.1 Georgia,serif}h2{font-size:17px;margin:22px 0 6px}.meta,#status{font-size:14px;color:#535d52}
.chips{display:flex;gap:4px;margin:14px 0}.chips span{width:27px;height:13px;border-radius:3px;border:1px solid #0002}
.text{white-space:pre-wrap;overflow-wrap:anywhere}.track{margin:0}button,a{font:inherit;font-size:14px;padding:9px 14px;border-radius:40px;border:1px solid #a4ac9d;background:transparent;color:#263529;text-decoration:none;cursor:pointer}
button:hover,a:hover{background:#e4e9dd}button:focus-visible,a:focus-visible{outline:3px solid #358050;outline-offset:3px}#music{background:#344b39;color:white}
details{margin-top:24px}summary{cursor:pointer;font-weight:600}footer{border-top:1px solid #d7d9d0;margin-top:32px;padding-top:14px;font-size:13px}
@media(max-width:700px){article{grid-template-columns:1fr;gap:20px;margin-top:24px}figure{max-width:450px;width:100%;margin:auto}}
`;

export async function portablePage(day) {
  offlineEngine ||= readFile(new URL('../public/media.js', import.meta.url)).then(data => 'data:text/javascript;base64,' + data.toString('base64'));
  const source = await offlineEngine;
  const date = new Intl.DateTimeFormat('ru-RU', {dateStyle:'long', timeZone:'UTC'}).format(new Date(day.date));
  const mood = {calm:'Спокойствие', joy:'Радость', dream:'Мечтательность', energy:'Энергия'}[day.mood];
  const safe = JSON.stringify(day).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${html(day.title)} · DayTrace</title><style>${css}</style>
<main><header>DayTrace</header><article><figure><div id="scene" class="${html(day.mood)}">
<img id="photo" src="${html(day.photos[0].src)}" alt="${html(day.photos[0].name)}"><blockquote>«${html(day.quote)}»</blockquote></div>
${day.photos.length > 1 ? '<figcaption><button id="previous" aria-label="Предыдущая фотография">Назад</button><span id="count">1 / ' + day.photos.length + '</span><button id="next">Далее</button></figcaption>' : ''}</figure>
<section><p class="meta">${html(date)} · ${html(mood)}</p><h1>${html(day.title)}</h1><p>${html(day.weather)}</p>
<div class="chips" aria-label="Палитра фотографий">${day.palette.map(color => '<span style="background:' + html(color) + '" title="' + html(color) + '"></span>').join('')}</div>
<h2>Запись дня</h2><p class="text">${html(day.text)}</p><h2>Музыка дня</h2><p class="track">${html(day.track.title)} · ${html(day.track.artist)}</p>
<div class="row">${day.track.kind !== 'link' ? '<button id="music" aria-pressed="false">Слушать фрагмент</button>' : ''}${day.track.url ? '<a target="_blank" rel="noopener noreferrer" href="' + html(day.track.url) + '">Открыть трек</a>' : ''}${day.voice ? '<button id="voice" aria-pressed="false">Прочесть цитату</button>' : ''}</div>
<p id="status" role="status"></p>${day.explanation.length ? '<details><summary>Почему день выглядит так?</summary><ul>' + day.explanation.map(line => '<li>' + html(line) + '</li>').join('') + '</ul></details>' : ''}</section></article>
<footer>Личный дневник атмосферы дня</footer></main><script type="application/json" id="day">${safe}</script>
<script type="module">(${openPostcard.toString()})(${JSON.stringify(source)})</script></html>`;
}
