'use strict';
// Picture questions use free photos from Wikimedia Commons (the photo library behind Wikipedia).
// For a Wikipedia article title (e.g. "Chocolate Hills"), we take the article's main photo,
// but ONLY if it is hosted on Commons, which means it has a free license. Non-free images
// (movie posters, logos, most celebrity photos) are skipped automatically.
// Photos are served from our own server at /img/<id>, so the file name can't give the answer away.
const crypto = require('crypto');

const UA = process.env.WIKI_USER_AGENT || 'BuzzdTrivia/1.0 (https://buzzd.onrender.com)';
const OK_TTL = 24 * 3600 * 1000;
const FAIL_TTL = 3600 * 1000;
const MAX_IMAGES = 300;
const MAX_BYTES = 1.5 * 1024 * 1024;

const byTitle = new Map(); // title -> { status: 'pending' | 'ok' | 'fail', id, t, promise }
const byId = new Map();    // id -> { buf, type, credit, source, t }

const strip = (html) => String(html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

async function getJSON(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function load(title) {
  const wiki = await getJSON('https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1'
    + `&prop=pageimages&piprop=name&titles=${encodeURIComponent(title)}`);
  const name = wiki.query && wiki.query.pages && wiki.query.pages[0] && wiki.query.pages[0].pageimage;
  if (!name) throw new Error('article has no main image');
  if (/\.svg$/i.test(name)) throw new Error('drawing or map, not a photo');

  const commons = await getJSON('https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2'
    + `&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=720&titles=${encodeURIComponent(`File:${name}`)}`);
  const page = commons.query && commons.query.pages && commons.query.pages[0];
  const info = page && !page.missing && page.imageinfo && page.imageinfo[0];
  if (!info) throw new Error('not a free Commons image');

  const meta = info.extmetadata || {};
  const artist = strip(meta.Artist && meta.Artist.value).slice(0, 60) || 'Unknown author';
  const license = strip(meta.LicenseShortName && meta.LicenseShortName.value);

  const res = await fetch(info.thumburl || info.url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
  const type = res.headers.get('content-type') || '';
  if (!res.ok || !type.startsWith('image/')) throw new Error('could not download image');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error('image too large');

  const id = crypto.createHash('sha1').update(title).digest('hex').slice(0, 16);
  byId.set(id, { buf, type, credit: `Photo: ${artist}${license ? `, ${license}` : ''}, via Wikimedia Commons`, source: info.descriptionurl, t: Date.now() });
  if (byId.size > MAX_IMAGES) byId.delete(byId.keys().next().value); // drop the oldest
  return id;
}

// Start (or reuse) loading the photo for a Wikipedia article title. Resolves to true/false.
function prepare(title) {
  const e = byTitle.get(title);
  if (e) {
    if (e.status === 'pending') return e.promise;
    const fresh = Date.now() - e.t < (e.status === 'ok' ? OK_TTL : FAIL_TTL);
    if (fresh && (e.status === 'fail' || byId.has(e.id))) return Promise.resolve(e.status === 'ok');
  }
  const entry = { status: 'pending', t: Date.now() };
  entry.promise = load(title)
    .then((id) => { Object.assign(entry, { status: 'ok', id, t: Date.now() }); return true; })
    .catch((err) => {
      Object.assign(entry, { status: 'fail', t: Date.now() });
      console.warn(`[images] skipped "${title}": ${err.message}`);
      return false;
    });
  byTitle.set(title, entry);
  return entry.promise;
}

// Photo info if it is already loaded, otherwise null (and loading starts in the background).
function ready(title) {
  const e = byTitle.get(title);
  if (e && e.status === 'ok' && byId.has(e.id)) {
    const img = byId.get(e.id);
    return { url: `/img/${e.id}`, credit: img.credit, source: img.source };
  }
  prepare(title);
  return null;
}

// Load a list of titles a few at a time, politely.
async function warm(titles, concurrency = 3) {
  const queue = [...new Set(titles)];
  const worker = async () => { while (queue.length) await prepare(queue.shift()); };
  await Promise.all(Array.from({ length: concurrency }, worker));
}

// Express handler for /img/:id
function serve(req, res) {
  const img = byId.get(req.params.id);
  if (!img) return res.status(404).end();
  res.set('Content-Type', img.type);
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(img.buf);
}

module.exports = { prepare, ready, warm, serve };
