export function quoteFragments(text) {
  const result = [];
  // The model selects an index. This keeps every displayed quote traceable to
  // the author's words, even when the model would paraphrase their wording.
  for (const { segment } of new Intl.Segmenter('ru', { granularity: 'sentence' }).segment(text)) {
    let left = segment.trim();
    while (left.length > 220) {
      const boundary = left.slice(0, 220).search(/\s+\S*$/u);
      const cut = boundary >= 90 ? boundary : 220;
      result.push(left.slice(0, cut).trim());
      left = left.slice(cut).trim();
    }
    if (left) result.push(left);
  }
  return result;
}

export function coverCaption(day) {
  return day.authorLook?.quote || day.coverText || day.quote || day.title;
}

export function defaultMoment(day) {
  const quote = day.quote && day.text.includes(day.quote) && day.quote.length <= 220
    ? day.quote : quoteFragments(day.text)[0];
  const phrase = quote.split(/[,;:.!?…—]/u).find(part => part.trim()) || quote;
  const title = phrase.trim().split(/\s+/u).slice(0, 7).join(' ').slice(0, 64);
  return { title, quote, photoIndex: 0, startSeconds: 0 };
}

export function momentLink(track, seconds = 0) {
  if (!track.url) return null;
  const url = new URL(track.url);
  const youtube = ['www.youtube.com','youtube.com','m.youtube.com','music.youtube.com'].includes(url.hostname);
  const video = url.hostname === 'youtu.be' ? url.pathname.slice(1) : youtube && (
    url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:shorts|embed)\/([\w-]+)\/?$/)?.[1]
  );
  if (video && /^[\w-]{11}$/.test(video)) {
    url.searchParams.delete('start'); url.searchParams.set('t', seconds + 's');
    return { href:url.href, timed:true, embed:'https://www.youtube-nocookie.com/embed/' + video + '?start=' + seconds + '&end=' + (seconds + 8) + '&autoplay=1', height:214 };
  }
  const spotify = url.hostname === 'open.spotify.com' && url.pathname.match(/\/(?:track)\/([a-zA-Z0-9]{22})\/?$/);
  return { href:url.href, timed:false, embed:spotify ? 'https://open.spotify.com/embed/track/' + spotify[1] : null, height:152 };
}

// Used by both the live day and the standalone HTML. Each play starts the same excerpt.
export function mountMomentPlayback(host, day, engine, {autoplay = true} = {}) {
  const iframe = host.querySelector('[data-moment-embed]');
  if (iframe) {
    iframe.src = iframe.dataset.momentEmbed;
    return () => iframe.removeAttribute('src');
  }
  const button = host.querySelector('[data-fragment]');
  if (!button) return () => {};
  const status = host.querySelector('[data-fragment-status]');
  let source, timer, generation = 0, active = false;
  function stop() {
    generation++;
    active = false;
    clearTimeout(timer);
    if (source) {
      source.onended = source.onerror = null;
      source.pause();
      source = null;
    }
    if (day.track.kind === 'ambient' && engine.playingDay() === day.id) engine.stopTrack();
    button.textContent = 'Послушать фрагмент';
    button.setAttribute('aria-pressed', 'false');
  }
  async function play() {
    if (active) { stop(); return; }
    const seq = ++generation;
    const offset = day.moment.startSeconds;
    active = true;
    status.textContent = '';
    button.textContent = 'Остановить фрагмент';
    button.setAttribute('aria-pressed', 'true');
    try {
      if (day.track.kind === 'ambient') {
        await engine.playTrack(day, () => { if (generation === seq) stop(); }, { offsetSeconds: offset });
      } else {
        source = new Audio(day.track.src);
        source.currentTime = offset;
        source.onended = stop;
        source.onerror = () => { stop(); status.textContent = 'Фрагмент недоступен.'; };
        await source.play();
      }
      if (generation === seq) timer = setTimeout(stop, 8000);
    } catch {
      if (generation === seq) { stop(); status.textContent = 'Нажмите, чтобы попробовать воспроизведение ещё раз.'; }
    }
  }
  button.onclick = play;
  if (autoplay) play();
  return () => { button.onclick = null; stop(); };
}
