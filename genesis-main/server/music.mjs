// Canonical Spotify track IDs and titles checked against Spotify's public oEmbed.
// Warmth and energy are editorial matching weights, not measured audio features.
const catalog = {
  calm: [
    ['5haFS5A336MN7GexZUPcv6', 'Peace Piece', 'Bill Evans', .79, .16],
    ['71BqXMUdoiYHohiDlMihIR', 'Ambre', 'Nils Frahm', .59, .09],
    ['6Xajr512QEGAZ20bqAWkyT', 'Near Light', 'Ólafur Arnalds', .36, .32],
    ['0sQNqu37YQQSI3K0ueswyA', 'A Walk', 'Tycho', .70, .54]
  ],
  dream: [
    ['68z70C4XhaXYr0UXMCmn56', 'An Ending (Ascent) - Remastered', 'Brian Eno', .44, .09],
    ['18j0hGMYXyc296ZRw73ZAm', 'Porcelain', 'Moby', .36, .49],
    ['0DAsxISzun85PbsqAfIzeC', 'Intro', 'The xx', .20, .65],
    ['75IQVo8hqI1iwVZyvkN2VT', 'Show Me How', 'Men I Trust', .74, .32]
  ],
  joy: [
    ['2M45IIrFLjMgsNSSxee31h', 'Friday Morning', 'Khruangbin', .84, .35],
    ['6pxElwU80zhjbCC77Vn8EI', 'Movie', 'Tom Misch', .63, .43],
    ['3tsyvCHCbKdQMrJvgvGLq0', 'Tadow', 'Masego, FKJ', .71, .67],
    ['663EKm2UaVIpWzUIlQ8jfQ', 'Get Lucky (feat. Pharrell Williams and Nile Rodgers)', 'Daft Punk, Pharrell Williams, Nile Rodgers', .91, .91]
  ],
  energy: [
    ['2t805HJ6cLjFfxstV88h5G', 'Cirrus', 'Bonobo', .44, .70],
    ['0LPU5eeJqiujVUSck5ghpO', 'Odessa', 'Caribou', .68, .79],
    ['3W2ZcrRsInZbjWylOi6KhZ', 'You & Me - Flume Remix', 'Disclosure, Eliza Doolittle, Flume', .33, .93],
    ['2E9IkdYwFCx0yBvUxn01gc', 'D.A.N.C.E. (WWW)', 'Justice', .88, .95]
  ]
};
const moods = {
  calm: ['спокойствия', .62, .26], dream: ['мечтательности', .42, .31],
  joy: ['радости', .78, .62], energy: ['энергичного дня', .54, .84]
};
const validId = value => typeof value === 'string' && /^[A-Za-z0-9]{22}$/.test(value);
const spotifyUrl = id => 'https://open.spotify.com/track/' + id;

export function spotifyTrackId(value) {
  if (typeof value !== 'string' || !value || value.length > 512) return null;
  if (validId(value)) return value;
  const uri = /^spotify:track:([A-Za-z0-9]{22})$/.exec(value);
  if (uri) return uri[1];
  try {
    const url = new URL(value);
    if (url.origin === 'https://open.spotify.com' && !url.username && !url.password) return /^\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]{22})\/?$/i.exec(url.pathname)?.[1] || null;
  } catch { /* Ignore values outside Spotify's canonical ID and link formats. */ }
  return null;
}

function ratio(value, fallback) {
  const number = value == null || value.trim() === '' ? NaN : Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
}

function preferences(params) {
  const mood = Object.hasOwn(catalog, params.get('mood')) ? params.get('mood') : 'calm';
  const [, defaultWarmth, defaultEnergy] = moods[mood];
  const warmth = ratio(params.get('warmth'), defaultWarmth);
  const energy = ratio(params.get('energy'), defaultEnergy);
  const rawVariant = Number(params.get('variant'));
  const variant = Number.isSafeInteger(rawVariant) ? Math.abs(rawVariant) % 4 : 0;
  const previous = spotifyTrackId(params.get('previous'));
  const history = new Set(params.getAll('recent').flatMap(item => item.split(',')).slice(0, 32).map(spotifyTrackId).filter(Boolean));
  const distance = ([, , , w, e]) => (energy - e) ** 2 + .7 * (warmth - w) ** 2;
  const ranked = [...catalog[mood]].sort((a, b) => distance(a) - distance(b));
  const rotated = [...ranked.slice(variant), ...ranked.slice(0, variant)].filter(([id]) => id !== previous);
  const candidate = rotated.find(([id]) => !history.has(id)) || rotated[0];
  return { mood, variant, previous, history, candidate };
}

function fromAPI(item, market) {
  if (!item || !validId(item.id) || item.is_local || item.is_playable === false || item.restrictions?.reason) return null;
  if (Array.isArray(item.available_markets) && !item.available_markets.includes(market)) return null;
  if (item.external_urls?.spotify && spotifyTrackId(item.external_urls.spotify) !== item.id) return null;
  const title = typeof item.name === 'string' ? item.name.trim() : '';
  const artists = Array.isArray(item.artists) ? item.artists.map(a => a?.name).filter(a => typeof a === 'string' && a.trim()) : [];
  if (!title || !artists.length) return null;
  return { id: item.id, title, artist: artists.join(', '), artists };
}

export function createMusicResolver({ fetchImpl = fetch, env = process.env, now = Date.now } = {}) {
  let access = '', renewAt = 0, availableAt = 0, signingIn = null;
  const searchCache = new Map();
  const market = /^[A-Z]{2}$/.test(env.SPOTIFY_MARKET || '') ? env.SPOTIFY_MARKET : 'KZ';

  function cooldown(response) {
    const retryAfter = Number(response.headers?.get('retry-after'));
    const seconds = response.status === 429 && retryAfter > 0 ? retryAfter : 12;
    availableAt = now() + Math.min(seconds, 86400) * 1000;
  }
  async function token() {
    if (access && now() < renewAt) return access;
    if (signingIn) return signingIn;
    signingIn = (async () => {
      const auth = Buffer.from(env.SPOTIFY_CLIENT_ID + ':' + env.SPOTIFY_CLIENT_SECRET).toString('base64');
      const response = await fetchImpl('https://accounts.spotify.com/api/token', {
        method: 'POST', headers: {Authorization: 'Basic ' + auth, 'Content-Type':'application/x-www-form-urlencoded'},
        body: 'grant_type=client_credentials', signal: AbortSignal.timeout(2000)
      });
      if (!response.ok) { cooldown(response); return null; }
      const result = await response.json();
      if (typeof result.access_token !== 'string' || !result.access_token) return null;
      access = result.access_token;
      renewAt = now() + Math.max(0, (Number(result.expires_in) || 3600) - 60) * 1000;
      return access;
    })();
    try { return await signingIn; } finally { signingIn = null; }
  }
  async function search(candidate) {
    const [id, , artist] = candidate;
    const cached = searchCache.get(id);
    if (cached && cached.until > now()) return cached.tracks;
    if (availableAt > now()) return [];
    const bearer = await token();
    if (!bearer) return [];
    // Search the real market-specific catalog. Prefer the matched recording and
    // allow other recordings by the selected artist when the first is unavailable.
    const primaryArtist = artist.split(', ')[0];
    const query = new URLSearchParams({q:'artist:"' + primaryArtist + '"', type:'track', limit:'10', market});
    const response = await fetchImpl('https://api.spotify.com/v1/search?' + query, {
      headers: { Authorization: 'Bearer ' + bearer }, signal: AbortSignal.timeout(2200)
    });
    if (!response.ok) {
      if (response.status === 401) { access = ''; renewAt = 0; }
      cooldown(response);
      return [];
    }
    const raw = (await response.json()).tracks?.items;
    if (!Array.isArray(raw)) return [];
    const tracks = raw.map(item => fromAPI(item, market)).filter(item => item &&
      item.artists.some(name => name.localeCompare(primaryArtist, undefined, {sensitivity:'base'}) === 0));
    searchCache.set(id, {tracks, until: now() + 900000});
    return tracks;
  }
  return async function resolve(url) {
    const {mood, variant, previous, history, candidate} = preferences(url.searchParams);
    const [id, title, artist] = candidate;
    const configured = Boolean(env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET);
    let live = [];
    if (configured) {
      try { live = (await search(candidate)).filter(item => item.id !== previous && !history.has(item.id)); }
      catch { availableAt = now() + 12000; }
    }
    const match = live.find(item => item.id === id) || live.find(item => item.title === title) || live[variant % (live.length || 1)];
    const source = match ? 'spotify-api' : 'spotify-catalog';
    const origin = match ? 'Найдено в каталоге Spotify.' : configured ? 'Использована локальная подборка ссылок Spotify.' : 'Из локальной подборки Spotify.';
    const chosenId = match?.id || id;
    return { track: {
      id: chosenId, source, title: match?.title || title, artist: match?.artist || artist,
      url: spotifyUrl(chosenId), kind: 'link',
      bpm: null, variant, reason: origin + ' Выбор для ' + moods[mood][0] + ' учитывает теплоту фотографий и энергию записи.'
    }};
  };
}

export const resolveTrack = createMusicResolver();

export async function deezerTempo(id, fetchImpl = fetch) {
  if (!/^[1-9]\d{0,14}$/.test(id)) return { bpm: null };
  try {
    const reply = await fetchImpl('https://api.deezer.com/track/' + id, { redirect: 'error', signal: AbortSignal.timeout(3500) });
    if (!reply.ok) return { bpm: null };
    const song = await reply.json();
    if (String(song.id) !== id || !Number.isFinite(song.bpm) || song.bpm < 40 || song.bpm > 240) return { bpm: null };
    return { bpm: song.bpm, ...(song.title ? {title: String(song.title).slice(0, 200)} : {}),
      ...(song.artist?.name ? {artist: String(song.artist.name).slice(0, 200)} : {}) };
  } catch { return { bpm: null }; }
}
