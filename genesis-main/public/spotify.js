import { stopTrack } from './media.js';
import { esc, icon, modal } from './ui.js';

function embed(track, links) {
  return `<iframe class="dt-spotify-embed" title="${esc(track.title || 'Музыка дня')} · Spotify" src="${links.embed}" width="100%" height="152" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
}

let apiRequest;
function loadSpotifyEmbedAPI() {
  apiRequest ||= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const failed = () => {
      clearTimeout(timeout);
      script.remove();
      delete window.onSpotifyIframeApiReady;
      apiRequest = null;
      reject(Error('Не удалось загрузить Spotify'));
    };
    const timeout = setTimeout(failed, 9000);
    window.onSpotifyIframeApiReady = api => {
      clearTimeout(timeout);
      delete window.onSpotifyIframeApiReady;
      resolve(api);
    };
    script.src = 'https://open.spotify.com/embed/iframe-api/v1';
    script.async = true;
    script.addEventListener('error', failed, { once: true });
    document.head.append(script);
  });
  return apiRequest;
}

export function mountSpotifyPlayer(host, track, links) {
  const status = host.querySelector('[role="status"]');
  const slot = host.querySelector('[data-spotify-frame]');
  const playHint = 'Если музыка ещё не началась, нажмите ▶ в плеере.';
  let controller, ready = false, stopped = false, degraded = false, shouldPlay = true, readyTimer, hintTimer;
  function fallback(showEmbed) {
    if (stopped || degraded) return;
    degraded = true;
    clearTimeout(readyTimer);
    controller?.destroy();
    controller = null;
    if (showEmbed) {
      slot.innerHTML = embed(track, links);
      status.textContent = playHint;
    } else {
      slot.replaceChildren();
      status.textContent = 'Встроенный плеер Spotify недоступен.';
    }
  }
  loadSpotifyEmbedAPI().then(api => {
    if (stopped) return;
    const placeholder = document.createElement('div');
    slot.append(placeholder);
    readyTimer = setTimeout(() => fallback(true), 12000);
    api.createController(placeholder, { url: links.url, width: '100%', height: 152 }, player => {
      if (stopped || degraded) { player.destroy(); return; }
      controller = player;
      player.addListener('ready', () => {
        if (stopped || degraded || ready) return;
        ready = true;
        clearTimeout(readyTimer);
        hintTimer = setTimeout(() => { status.textContent = playHint; }, 3800);
        if (shouldPlay) player.play();
      });
      const onPlay = () => {
        if (stopped) return;
        clearTimeout(hintTimer);
        status.textContent = '';
      };
      player.addListener('playback_started', onPlay);
      player.addListener('playback_update', ({ data }) => {
        if (data?.isPaused === false && !data.isBuffering && data.position > 0) onPlay();
      });
    });
  }).catch(() => fallback(false));
  return {
    pause() {
      shouldPlay = false;
      if (ready) controller.pause();
    },
    destroy() {
      stopped = true;
      clearTimeout(readyTimer);
      clearTimeout(hintTimer);
      controller?.destroy();
      slot.replaceChildren();
    }
  };
}

export function showSpotifyPlayer(track, links) {
  stopTrack();
  modal('Плеер Spotify', `${embed(track, links)}
    <a class="button secondary" href="${links.url}" target="_blank" rel="noopener noreferrer">Открыть в Spotify ${icon('external-link',15)}</a>`);
}
