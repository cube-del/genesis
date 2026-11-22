import { quoteFragments } from './memory.js';
import { analyzeTextStructure, buildVisualRecipe } from './visual-recipe.js';
import { photoInterval } from './rhythm.js';
import { storyTerms } from './story-terms.js';
import { esc } from './ui.js';

const turnBoundary = /(?<!\p{L})(?:но(?!\s+и(?!\p{L}))|зато|однако|а\s+потом|после\s+этого|и\s+вдруг|к\s+вечеру|к\s+утру|под\s+конец)(?!\p{L})/giu;
const reliefCue = /(?:отпустил|отлегл|легче|выдохнул|отступа|наконец\s+(?:получил|собира|закончил)|спокойнее)/iu;
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

export function suggestTurn(day) {
  if (!day.photos?.length || !day.text) return null;
  for (const hit of day.text.matchAll(turnBoundary)) {
    const before = quoteFragments(day.text.slice(0, hit.index).trim().replace(/[,;:–—]+$/u, '')).at(-1);
    const after = quoteFragments(day.text.slice(hit.index).trim())[0];
    if (before?.match(/\p{L}/gu)?.length >= 8 && after?.match(/\p{L}/gu)?.length >= 8) {
      return {
        before: { quote: before, photoIndex: 0 },
        after: { quote: after, photoIndex: day.photos.length - 1 }
      };
    }
  }
  return null;
}

export function buildTurnFrame(day, part) {
  const signals = analyzeTextStructure(part.quote);
  const cues = Array.from(storyTerms(part.quote)).filter(term => !term.negatedPhrase).map(term => term.token);
  const relief = Number(reliefCue.test(cues.join(' ')));
  const urgency = signals.strained * (1 - .88 * relief);
  const energy = clamp(.27 + urgency * .53 + signals.joyful * .18 + (1 - signals.sentenceFlow) * .16 - relief * .16);
  const recipe = buildVisualRecipe({ ...day, text: part.quote, energy });
  const warmth = .08 + relief * .25 + Math.min(.22, recipe.amberShift / 42);
  return {
    photo: day.photos[part.photoIndex],
    palette: recipe.palette,
    treatment: urgency > .35 ? 'Резче свет и тени' : relief ? 'Мягче свет и тени' : 'Свет и цвет по фразе',
    filter: `saturate(${recipe.saturation.toFixed(2)}) contrast(${clamp(recipe.contrast + urgency * .25 - relief * .09, .66, 1.55).toFixed(2)}) brightness(${(recipe.exposure - urgency * .15 + relief * .19).toFixed(2)}) sepia(${warmth.toFixed(2)})`
  };
}

export function turnFigure(day, turn) {
  const sides = [['before', 'До'], ['after', 'После']];
  const frames = sides.map(([key, label]) => {
    const part = turn[key];
    return { key, label, ...part, ...buildTurnFrame(day, part) };
  });
  const pictures = frames.map(({key, photo, filter}) => {
    const position = photo.focus ? `${photo.focus.x * 100}% ${photo.focus.y * 100}%` : '50% 50%';
    const media = photo.kind === 'video' && !photo.poster
      ? `<video aria-hidden="true" muted preload="metadata" playsinline src="${esc(photo.src)}"></video>`
      : `<img alt="" src="${esc(photo.poster || photo.src)}">`;
    return `<div class="turn-layer turn-layer-${key}" style="--turn-filter:${filter};--turn-focus:${position}">${media}</div>`;
  }).join('');
  const captions = frames.map(({key, label, quote, palette, treatment}, index) =>
    `<button type="button" class="turn-caption" data-turn-side="${key}" aria-pressed="${index === 0}">
      <span class="turn-phase"><span>${label}</span><span class="turn-inks" aria-hidden="true">${palette.slice(0, 4).map(color => `<i style="background:${color}"></i>`).join('')}</span></span>
      <span class="turn-quote">«${esc(quote)}»</span><span class="turn-treatment">${treatment}</span>
    </button>`).join('');
  const duration = Math.round(clamp(photoInterval(day.track), 2200, 6400));
  return `<div class="turn-experience" data-turn data-duration="${duration}">
    <figure class="turn-view" aria-label="Кадры и цвет до и после поворота">${pictures}</figure>
    <div class="turn-slider"><span aria-hidden="true">До</span><input type="range" data-turn-position min="0" max="100" value="0" aria-label="Переход от первой фразы ко второй"><span aria-hidden="true">После</span></div>
    <div class="turn-captions">${captions}</div>
    <button class="turn-play" type="button" data-turn-play>Проиграть переход</button>
  </div>`;
}

// Invoked on the day page and in exported HTML.
export function mountTurn(host, {onPlay} = {}) {
  const slider = host.querySelector('[data-turn-position]');
  const sides = [...host.querySelectorAll('[data-turn-side]')];
  const play = host.querySelector('[data-turn-play]');
  let animation = 0;
  function paint() {
    const value = slider.valueAsNumber;
    host.style.setProperty('--turn-position', value + '%');
    slider.setAttribute('aria-valuetext', value === 0 ? 'До' : value === 100 ? 'После' : `Переход ${value}%`);
    sides[0].setAttribute('aria-pressed', String(value === 0));
    sides[1].setAttribute('aria-pressed', String(value === 100));
  }
  const setPosition = value => { slider.value = value; paint(); };
  const stop = () => cancelAnimationFrame(animation);
  slider.oninput = () => { stop(); paint(); };
  for (const [index, side] of sides.entries()) side.onclick = () => { stop(); setPosition(index * 100); };
  play.onclick = () => {
    stop();
    onPlay?.();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setPosition(100); return; }
    setPosition(0);
    const duration = Number(host.dataset.duration) || 4200;
    const start = performance.now();
    function move(now) {
      const elapsed = (now - start) / duration;
      const progress = Math.min(1, Math.max(0, (elapsed - .18) / .65));
      setPosition(Math.round(progress * progress * (3 - 2 * progress) * 100));
      if (elapsed < 1) animation = requestAnimationFrame(move);
    }
    animation = requestAnimationFrame(move);
  };
  paint();
  return stop;
}
