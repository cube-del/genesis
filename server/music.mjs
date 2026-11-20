const recommendations = {
  calm: [['Ólafur Arnalds', 'Near Light'], ['Bill Evans', 'Peace Piece'], ['Helios', 'Bless This Morning Year'], ['Nils Frahm', 'Ambre']],
  dream: [['Hania Rani', 'Glass'], ['Brian Eno', 'An Ending (Ascent)'], ['Ryuichi Sakamoto', 'Aqua'], ['Portico Quartet', 'Prickly Pear']],
  joy: [['Khruangbin', 'Friday Morning'], ['Men I Trust', 'Show Me How'], ['Herbie Hancock', 'Cantaloupe Island'], ['Tom Misch', 'Movie']],
  energy: [['Tycho', 'Awake'], ['Bonobo', 'Cirrus'], ['Four Tet', 'Two Thousand and Seventeen'], ['Caribou', 'Odessa']],
};

let token = '';
let expires = 0;
let authentication;
const cache = new Map();

async function accessToken() {
  if (token && expires > Date.now()) return token;
  if (authentication) return authentication;
  const { SPOTIFY_CLIENT_ID: id, SPOTIFY_CLIENT_SECRET: secret } = process.env;
  if (!id || !secret) return null;
  authentication = (async () => {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(id + ':' + secret).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(2800),
    });
    if (!response.ok) return null;
    const result = await response.json();
    token = result.access_token;
    expires = Date.now() + (result.expires_in - 60) * 1000;
    return token;
  })();
  try { return await authentication; } finally { authentication = undefined; }
}

export async function resolveTrack(url) {
  const requestedMood = url.searchParams.get('mood');
  const mood = Object.hasOwn(recommendations, requestedMood) ? requestedMood : 'calm';
  const list = recommendations[mood];
  const variant = Math.abs(parseInt(url.searchParams.get('variant'), 10) || 0) % list.length;
  const key = mood + variant;
  const stored = cache.get(key);
  if (stored?.expires > Date.now()) return stored.result;
  try {
    const bearer = await accessToken();
    if (!bearer) return { track: null };
    const [artist, title] = list[variant];
    const params = new URLSearchParams({ q: 'track:' + title + ' artist:' + artist, type: 'track', limit: '3', market: 'KZ' });
    const response = await fetch('https://api.spotify.com/v1/search?' + params, {
      headers: { Authorization: 'Bearer ' + bearer }, signal: AbortSignal.timeout(2800),
    });
    if (response.status === 401) expires = 0;
    if (!response.ok) return { track: null };
    const results = (await response.json()).tracks?.items || [];
    const item = results.find(item => item?.preview_url?.startsWith('https://') && item.external_urls?.spotify);
    const result = { track: item ? {
      kind: 'preview', title: item.name, artist: item.artists.map(artist => artist.name).join(', '),
      src: item.preview_url, url: item.external_urls.spotify, bpm: null, variant,
    } : null };
    cache.set(key, { result, expires: Date.now() + 1800000 });
    return result;
  } catch {
    return { track: null };
  }
}
