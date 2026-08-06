/**
 * ============================================================================
 * ⚡ ALL TOOLS KYY — API Backend
 * Developer : Rifkyy sensei
 * ----------------------------------------------------------------------------
 * Semua route /api/* ditangani di sini.
 * Handler ini dipakai bareng oleh:
 *   - Netlify Functions (file ini langsung jadi serverless function)
 *   - server.js (adapter Node HTTP biasa -> Railway / VPS / shared hosting)
 *
 * Scraper downloader di-PORT dari bot WhatsApp "NEW OURIN EDIT GWE":
 *   - src/scraper/aio.js      -> pola detectPlatform() + router + fallback
 *   - src/scraper/tiktok.js   -> TikTok (tikwm.com API + musicaldown + yuulabs)
 *   - src/scraper/ig.js       -> Instagram (fastdl.app HMAC signature)
 *   - src/scraper/ytdl.js     -> YouTube (ymcdn convert flow)
 *   - src/scraper/fbdown.js   -> pola wrapper API publik sederhana
 * ============================================================================
 */

const axios = require('axios');
const crypto = require('crypto');
const QRCode = require('qrcode');
const cheerio = require('cheerio');

/* ============================== KONFIGURASI =============================== */

const UA_ANDROID =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36';
const UA_DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const AXIOS_OPTS = { timeout: 25000, maxRedirects: 5 };

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};

/* ================================ HELPERS ================================= */

const ok = (payload, statusCode = 200) => ({
  statusCode,
  headers: CORS_HEADERS,
  body: JSON.stringify({ status: true, ...payload }),
});

const fail = (message, statusCode = 400) => ({
  statusCode,
  headers: CORS_HEADERS,
  body: JSON.stringify({ status: false, error: message }),
});

function parseBody(event) {
  try {
    if (!event.body) return {};
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readParams(event) {
  const out = {};
  const m = (event.rawUrl || event.path || '').match(/\?(.*)$/);
  if (m) { try { new URLSearchParams(m[1]).forEach((v, k) => { out[k] = v; }); } catch { /* abaikan */ } }
  Object.assign(out, event.queryStringParameters || {});
  return out;
}

function isValidHttpUrl(str) {
  if (!str || typeof str !== 'string' || str.length > 2000) return false;
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function getClientIp(event) {
  const h = event.headers || {};
  const pick = (k) => h[k] || h[k.toLowerCase()];
  return (
    pick('x-nf-client-connection-ip') ||
    (pick('x-forwarded-for') || '').split(',')[0].trim() ||
    pick('client-ip') ||
    '127.0.0.1'
  );
}

/* ------------------------- Rate limiter sederhana ------------------------- */
const rateBuckets = new Map();
function rateLimit(key, limit = 20, windowMs = 60_000) {
  const now = Date.now();
  const b = rateBuckets.get(key) || { count: 0, reset: now + windowMs };
  if (now > b.reset) {
    b.count = 0;
    b.reset = now + windowMs;
  }
  b.count += 1;
  rateBuckets.set(key, b);
  if (rateBuckets.size > 2000) rateBuckets.clear();
  return b.count <= limit;
}

/* ==================== PLATFORM DETECT (PORT dari aio.js) ================== */

const PLATFORM_DETECT = [
  { key: 'instagram', patterns: ['instagram.com', 'instagr.am'] },
  { key: 'youtube', patterns: ['youtube.com', 'youtu.be'] },
  { key: 'tiktok', patterns: ['tiktok.com', 'vt.tiktok.com', 'vm.tiktok.com'] },
  { key: 'facebook', patterns: ['facebook.com', 'fb.watch', 'fb.com'] },
  { key: 'pinterest', patterns: ['pinterest.com', 'pin.it'] },
  { key: 'twitter', patterns: ['twitter.com', 'x.com'] },
  { key: 'threads', patterns: ['threads.net'] },
  { key: 'reddit', patterns: ['reddit.com'] },
  { key: 'terabox', patterns: ['terabox.com', '1024terabox', 'teraboxapp', 'freeterabox', 'terabox.fun', 'mirrobox', 'nephobox', 'momerybox', 'tibibox'] },
  { key: 'mediafire', patterns: ['mediafire.com'] },
  { key: 'sfile', patterns: ['sfile.mobi', 'sfile.co'] },
];

function detectPlatform(url) {
  const lower = (url || '').toLowerCase();
  for (const p of PLATFORM_DETECT) {
    if (p.patterns.some((pat) => lower.includes(pat))) return p.key;
  }
  return null;
}

/* ==================== TIKTOK (PORT dari tiktok.js/aio.js) =================
 * Sumber utama : tikwm.com/api  (no watermark + HD + MP3)  <- dari aio.js
 * Fallback 1   : musicaldown.com (scraping form + cheerio) <- dari tiktok.js
 * Fallback 2   : yuulabs API    (wrapper API publik)       <- dari tiktok.js
 * ========================================================================== */

// tikwm kadang mengembalikan path relatif "/video/..." -> jadikan absolut
const asTikwmUrl = (u) =>
  !u ? null : u.startsWith('http') ? u : 'https://www.tikwm.com' + (u.startsWith('/') ? u : '/' + u);

async function tiktokFromTikwm(url) {
  const { data } = await axios.post(
    'https://www.tikwm.com/api/',
    {},
    {
      ...AXIOS_OPTS,
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Origin: 'https://www.tikwm.com',
        Referer: 'https://www.tikwm.com/',
        'User-Agent': UA_ANDROID,
        'X-Requested-With': 'XMLHttpRequest',
      },
      params: { url, count: 12, cursor: 0, web: 1, hd: 1 },
    }
  );

  const res = data?.data;
  if (!res) throw new Error('tikwm tidak mengembalikan data');

  const media = [];
  if (res.duration === 0 && Array.isArray(res.images) && res.images.length) {
    res.images.forEach((v) => media.push({ type: 'image', url: asTikwmUrl(v) }));
  } else {
    if (res.hdplay) media.push({ type: 'video', quality: 'HD', url: asTikwmUrl(res.hdplay) });
    if (res.play) media.push({ type: 'video', quality: 'NoWM', url: asTikwmUrl(res.play) });
    if (res.wmplay) media.push({ type: 'video', quality: 'WM', url: asTikwmUrl(res.wmplay) });
  }
  if (res.music) media.push({ type: 'audio', quality: 'MP3', url: asTikwmUrl(res.music) });
  if (!media.length) throw new Error('tikwm: tidak ada media');

  return {
    platform: 'tiktok',
    source: 'tikwm',
    title: res.title || 'TikTok Video',
    author: res.author?.nickname || res.author?.unique_id || null,
    duration: res.duration || 0,
    thumbnail: asTikwmUrl(res.cover),
    stats: {
      plays: res.play_count || 0,
      likes: res.digg_count || 0,
      comments: res.comment_count || 0,
      shares: res.share_count || 0,
    },
    media,
  };
}

async function tiktokFromMusicaldown(url) {
  const client = axios.create(AXIOS_OPTS);
  const { data: html, headers } = await client.get('https://musicaldown.com/en', {
    headers: { 'user-agent': UA_ANDROID },
  });
  const $ = cheerio.load(html);

  const payload = {};
  $('#submit-form input').each((_, el) => {
    const name = $(el).attr('name');
    const value = $(el).attr('value');
    if (name) payload[name] = value || '';
  });
  const urlField = Object.keys(payload).find((k) => !payload[k]);
  if (urlField) payload[urlField] = url;

  const cookieHeader = Array.isArray(headers['set-cookie'])
    ? headers['set-cookie'].map((c) => c.split(';')[0]).join('; ')
    : '';

  const { data } = await client.post(
    'https://musicaldown.com/download',
    new URLSearchParams(payload).toString(),
    {
      headers: {
        'user-agent': UA_ANDROID,
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        cookie: cookieHeader,
        origin: 'https://musicaldown.com',
        referer: 'https://musicaldown.com/',
      },
    }
  );

  const $$ = cheerio.load(data);
  const media = [];
  $$('a.download').each((_, el) => {
    const e = $$(el);
    const href = e.attr('href');
    if (!href) return;
    let type = String(e.data('event') || '').replace('_download_click', '');
    const isAudio = /mp3|music|audio/i.test(type + ' ' + e.text());
    media.push({
      type: isAudio ? 'audio' : 'video',
      quality: type || e.text().trim(),
      label: e.text().trim(),
      url: href,
    });
  });
  if (!media.length) throw new Error('musicaldown: tidak ada media');

  const style = $$('.video-header').attr('style') || '';
  const cover = style.match(/url\((.*?)\)/)?.[1] || null;

  return {
    platform: 'tiktok',
    source: 'musicaldown',
    title: $$('.video-desc').text().trim() || 'TikTok Video',
    author: $$('.video-author b').text().trim() || null,
    duration: 0,
    thumbnail: cover,
    stats: null,
    media,
  };
}

async function tiktokFromYuulabs(url) {
  const { data } = await axios.get(
    `https://api.yuulabs.web.id/api/downloader/tiktok?url=${encodeURIComponent(url)}`,
    { ...AXIOS_OPTS, headers: { 'user-agent': UA_ANDROID } }
  );
  if (!data?.status || !data?.result) throw new Error('yuulabs: response invalid');
  const r = data.result;
  const media = [];
  if (r.hdVideo) media.push({ type: 'video', quality: 'HD', url: r.hdVideo });
  if (r.videoUrl) media.push({ type: 'video', quality: 'NoWM', url: r.videoUrl });
  if (r.audioUrl) media.push({ type: 'audio', quality: 'MP3', url: r.audioUrl });
  if (!media.length) throw new Error('yuulabs: tidak ada media');
  return {
    platform: 'tiktok',
    source: 'yuulabs',
    title: r.description || 'TikTok Video',
    author: r.author || null,
    duration: 0,
    thumbnail: null,
    stats: null,
    media,
  };
}

async function handleTiktok(url) {
  const errors = [];
  for (const fn of [tiktokFromTikwm, tiktokFromMusicaldown, tiktokFromYuulabs]) {
    try {
      return await fn(url);
    } catch (e) {
      errors.push(e.message);
    }
  }
  throw new Error('Semua sumber TikTok gagal: ' + errors.join(' | '));
}

/* ==================== INSTAGRAM (PORT dari ig.js) =========================
 * fastdl.app dengan signature HMAC-SHA256 (reverse-engineer API privat).
 * Alur: ambil cookie -> ambil server time (/msec) -> ts = msec*1000 - 450
 *       -> sign = HMAC_SHA256(cleanUrl + ts, secretKeyHex) -> POST /api/convert
 * Fallback : savefbs.com (pola fallback dari aio.js)
 * ========================================================================== */

const FASTDL = {
  secretKeyHex:
    '34ac9a1aa6aaa7d69a7075611898f16a85d496b1d8f1c7aaa5640a2d93d7af80',
  appVersionTS: '1770240123231',
  userAgent:
    'Mozilla/5.0 (Linux; Android 10; RMX2185 Build/QP1A.190711.020) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.7559.109 Mobile Safari/537.36',
};

async function instagramFromFastdl(igUrl) {
  const isStory = igUrl.includes('/stories/');
  let cleanUrl = igUrl.split('?')[0];
  if (!cleanUrl.endsWith('/')) cleanUrl += '/';

  const homeRes = await axios.get('https://fastdl.app/id', {
    ...AXIOS_OPTS,
    headers: { 'User-Agent': FASTDL.userAgent },
  });
  const cookieStr = (homeRes.headers['set-cookie'] || [])
    .map((c) => c.split(';')[0])
    .join('; ');

  const msecRes = await axios.get('https://fastdl.app/msec', {
    ...AXIOS_OPTS,
    headers: { 'User-Agent': FASTDL.userAgent, Cookie: cookieStr },
  });
  const serverTime = Math.floor(Number(msecRes.data.msec) * 1000);
  const ts = serverTime - 450;

  const signatureSource = isStory
    ? JSON.stringify({ url: cleanUrl }) + ts
    : cleanUrl + ts;
  const signature = crypto
    .createHmac('sha256', Buffer.from(FASTDL.secretKeyHex, 'hex'))
    .update(signatureSource)
    .digest('hex');

  let response;
  if (isStory) {
    response = await axios.post(
      'https://api-wh.fastdl.app/api/v1/instagram/story',
      { url: cleanUrl, ts, _ts: FASTDL.appVersionTS, _tsc: 0, _sv: 2, _s: signature },
      {
        ...AXIOS_OPTS,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': FASTDL.userAgent,
          Origin: 'https://fastdl.app',
          Referer: 'https://fastdl.app/id/story-saver',
          Cookie: cookieStr,
        },
      }
    );
  } else {
    const params = new URLSearchParams();
    params.append('sf_url', cleanUrl);
    params.append('ts', String(ts));
    params.append('_ts', FASTDL.appVersionTS);
    params.append('_tsc', '0');
    params.append('_sv', '2');
    params.append('_s', signature);
    response = await axios.post(
      'https://api-wh.fastdl.app/api/convert',
      params.toString(),
      {
        ...AXIOS_OPTS,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': FASTDL.userAgent,
          Origin: 'https://fastdl.app',
          Referer: 'https://fastdl.app/id',
          Cookie: cookieStr,
        },
      }
    );
  }

  const data = response.data;
  const media = [];

  if (isStory && Array.isArray(data?.result) && data.result[0]) {
    const r = data.result[0];
    if (r.video_versions?.length)
      media.push({ type: 'video', url: r.video_versions[0].url_wrapped || r.video_versions[0].url });
    else if (r.image_versions2?.candidates?.length)
      media.push({
        type: 'image',
        url: r.image_versions2.candidates[0].url_wrapped || r.image_versions2.candidates[0].url,
      });
    if (!media.length) throw new Error('fastdl(story): tidak ada media');
    return {
      platform: 'instagram',
      source: 'fastdl',
      title: `Story @${r.user?.username || 'instagram'}`,
      author: r.user?.username || null,
      thumbnail: r.user?.profile_pic_url || null,
      media,
    };
  }

  const items = Array.isArray(data) ? data : data ? [data] : [];
  for (const item of items) {
    if (item?.url?.length) {
      media.push({ type: item.url[0].type === 'image' ? 'image' : 'video', url: item.url[0].url });
    } else if (item?.hd || item?.sd) {
      media.push({ type: 'video', quality: item.hd ? 'HD' : 'SD', url: item.hd || item.sd });
    }
  }
  if (!media.length) throw new Error('fastdl: tidak ada media');

  const first = items[0] || {};
  const meta = first.meta || {};
  return {
    platform: 'instagram',
    source: 'fastdl',
    title: meta.title || 'Instagram Media',
    author: meta.username || null,
    thumbnail: first.thumb || null,
    stats: { likes: meta.like_count || 0, comments: meta.comment_count || 0 },
    media,
  };
}

/* --------- Fallback universal: savefbs.com (PORT pola aio.js) ------------
 * Versi struktur 2026: /html kini langsung mengembalikan link unduhan
 * <a href="https://dl.tiktokio.com/download?token=...">Download (720p)</a>
 * (Parser lama dua-langkah format/token sudah usang -> disesuaikan.)
 * ========================================================================== */

const SAVEFBS_HEADERS = {
  accept: '*/*',
  'content-type': 'application/json',
  referer: 'https://savefbs.com/all-in-one-video-downloader/',
  'user-agent':
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
};

async function downloadFromSavefbs(url, preferAudio = false) {
  const { data } = await axios.post(
    'https://savefbs.com/api/v1/aio/html',
    { vid: url, prefix: 'savefbs.com', ex: '', format: '' },
    { ...AXIOS_OPTS, headers: SAVEFBS_HEADERS }
  );
  const html = typeof data === 'string' ? data : JSON.stringify(data);
  const $ = cheerio.load(html);

  const title = $('h3.text-sm').first().text().trim() || $('h3').first().text().trim();

  // Kumpulkan semua link unduhan langsung (dedupe per URL)
  const media = [];
  const seen = new Set();
  $('a[href*="download?token="]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || seen.has(href)) return;
    seen.add(href);
    const label = $(el).text().trim();
    const isAudio = /mp3|audio/i.test(label) || /sf=\.mp3/.test(href);
    const quality =
      label.replace(/^download/i, '').replace(/[()]/g, '').trim() ||
      (isAudio ? 'MP3' : 'original');
    media.push({ type: isAudio ? 'audio' : 'video', quality, url: href });
  });
  if (!media.length) throw new Error('savefbs: tidak ada link unduhan');

  // Urutkan: default video dulu, audio terakhir (kecuali preferAudio)
  const rank = (m) => (m.type === 'audio' ? (preferAudio ? 0 : 1) : preferAudio ? 1 : 0);
  media.sort((a, b) => rank(a) - rank(b));

  return {
    platform: detectPlatform(url) || 'savefbs',
    source: 'savefbs',
    title: title || 'Downloaded Media',
    author: null,
    thumbnail: null,
    media,
  };
}

/* -------- Sumber IG tambahan (wrapper API publik, pola fbdown.js) -------- */

function sniffMediaType(u) {
  try {
    const m = String(u).match(/token=([^&]+)/);
    if (m) {
      const decoded = Buffer.from(decodeURIComponent(m[1]), 'base64').toString('utf8');
      if (/\.mp4|\.mov|video/i.test(decoded)) return 'video';
      if (/\.jpe?g|\.png|\.webp|\.heic/i.test(decoded)) return 'image';
    }
  } catch {}
  if (/\.jpe?g|\.png|\.webp/i.test(String(u))) return 'image';
  return 'video';
}

async function instagramFromYuulabs(igUrl) {
  const { data } = await axios.get(
    `https://api.yuulabs.web.id/api/downloader/instagram?url=${encodeURIComponent(igUrl)}`,
    { ...AXIOS_OPTS, headers: { 'user-agent': UA_ANDROID } }
  );
  const r = data?.result;
  if (!r?.status || !Array.isArray(r.medias) || !r.medias.length)
    throw new Error('yuulabs: tidak ada media');
  return {
    platform: 'instagram',
    source: 'yuulabs',
    title: (r.title || 'Instagram Media').split('\n')[0].slice(0, 120),
    author: r.owner || null,
    thumbnail: r.thumbnail || null,
    media: r.medias.map((u) => ({ type: sniffMediaType(u), url: u })),
  };
}

async function instagramFromAzbry(igUrl) {
  const { data } = await axios.get(
    `https://api.azbry.com/api/download/instagram?url=${encodeURIComponent(igUrl)}`,
    { ...AXIOS_OPTS, headers: { 'user-agent': UA_ANDROID } }
  );
  if (!data?.status) throw new Error(data?.message || 'azbry: status false');
  const urls = data.videos || data.images || (data.url ? [data.url] : []);
  if (!urls.length) throw new Error('azbry: tidak ada media');
  return {
    platform: 'instagram',
    source: 'azbry',
    title: data.title || 'Instagram Media',
    author: null,
    thumbnail: data.thumb || null,
    media: urls.map((u) => ({ type: data.type === 'video' ? 'video' : sniffMediaType(u), url: u })),
  };
}

async function handleInstagram(url) {
  const errors = [];
  const sources = [
    instagramFromYuulabs,
    instagramFromAzbry,
    () => instagramFromFastdl(url),
    () => downloadFromSavefbs(url),
  ];
  for (const fn of sources) {
    try {
      const out = await fn(url);
      if (out?.media?.length) return out;
    } catch (e) {
      errors.push(e.message);
    }
  }
  throw new Error('Semua sumber Instagram gagal: ' + errors.join(' | '));
}

/* ==================== YOUTUBE (PORT dari ytdl.js) =========================
 * Alur ymcdn: /api/v1/init -> convertURL -> poll progressURL -> downloadURL
 * Metadata   : YouTube oEmbed (title/author/thumbnail)
 * Fallback   : savefbs.com
 * ========================================================================== */

const YT_ID_REGEX =
  /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=|shorts\/)|youtu\.be\/)([^"&?\/\s]{11})/;

function extractVideoId(url) {
  return String(url || '').match(YT_ID_REGEX)?.[1] || null;
}

async function ytMetadata(url, videoId) {
  try {
    const { data } = await axios.get('https://www.youtube.com/oembed', {
      ...AXIOS_OPTS,
      params: { url: `https://www.youtube.com/watch?v=${videoId}`, format: 'json' },
    });
    return {
      title: data.title || 'YouTube Video',
      author: data.author_name || null,
      thumbnail: data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  } catch {
    return {
      title: 'YouTube Video',
      author: null,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  }
}

async function ytConvertYmcdn(videoId, format) {
  const client = axios.create({
    timeout: 55000,
    headers: { 'User-Agent': UA_ANDROID, Referer: 'https://id.ytmp3.mobi/' },
  });

  const { data: init } = await client.get('https://d.ymcdn.org/api/v1/init', {
    params: { p: 'y', 23: '1llum1n471', _: Math.random() },
  });
  if (!init?.convertURL) throw new Error('ymcdn: init gagal');

  const { data: convert } = await client.get(init.convertURL, {
    params: { v: videoId, f: format, _: Math.random() },
  });
  if (!convert?.progressURL || !convert?.downloadURL)
    throw new Error('ymcdn: konversi gagal');

  let progress = 0;
  let title = convert.title || '';
  let attempts = 0;
  const maxAttempts = 15;
  while (progress < 3 && attempts < maxAttempts) {
    const { data } = await client.get(convert.progressURL);
    if ((data?.error || 0) > 0) throw new Error(`ymcdn: error server ${data.error}`);
    progress = Number(data?.progress || 0);
    title = data?.title || title;
    if (progress < 3) {
      attempts += 1;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  return { title, download: convert.downloadURL, format };
}

async function handleYoutube(url) {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error('URL YouTube tidak valid / ID tidak ditemukan');

  const meta = await ytMetadata(url, videoId);

  // Coba mp4 & mp3 paralel (pola aio.js handleYoutube, tapi fail-safe)
  const [mp4, mp3] = await Promise.allSettled([
    ytConvertYmcdn(videoId, 'mp4'),
    ytConvertYmcdn(videoId, 'mp3'),
  ]);

  const media = [];
  if (mp4.status === 'fulfilled' && mp4.value?.download)
    media.push({ type: 'video', quality: 'MP4', url: mp4.value.download });
  if (mp3.status === 'fulfilled' && mp3.value?.download)
    media.push({ type: 'audio', quality: 'MP3', url: mp3.value.download });

  // Fallback sumber cadangan (pola aio.js) bila ymcdn gagal total
  if (!media.length) {
    try {
      const v = await downloadFromSavefbs(url, false);
      media.push(...v.media);
      try {
        const a = await downloadFromSavefbs(url, true);
        if (a.media[0]?.type === 'audio') media.push(...a.media);
      } catch {}
    } catch (e) {
      throw new Error('Semua sumber YouTube gagal: ' + e.message);
    }
  }

  return {
    platform: 'youtube',
    source: media.length ? 'ymcdn/savefbs' : 'ymcdn',
    title: (mp4.status === 'fulfilled' && mp4.value?.title) || meta.title,
    author: meta.author,
    thumbnail: meta.thumbnail,
    videoId,
    media,
  };
}

/* ==================== AIO ROUTER (PORT pola aio.js) ======================= */

async function handleAio(url) {
  const platform = detectPlatform(url);
  if (!platform) throw new Error('Platform tidak dikenali / belum didukung');

  const handlers = {
    tiktok: () => handleTiktok(url),
    instagram: () => handleInstagram(url),
    youtube: () => handleYoutube(url),
  };

  if (handlers[platform]) return handlers[platform]();

  // facebook / twitter / threads / reddit / pinterest dll -> savefbs
  try {
    return await downloadFromSavefbs(url);
  } catch (e) {
    throw new Error(`Gagal memproses ${platform}: ${e.message}`);
  }
}


/* ==================== EXPORT (WaxAllDl Dark Knight) ======================= */
module.exports = {
  detectPlatform,
  isValidHttpUrl,
  handleAio,
  handleTiktok,
  handleInstagram,
  handleYoutube,
  downloadFromSavefbs,
};
