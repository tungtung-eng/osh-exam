/* 離線可用：先用快取，背景再更新（改版時把 VER 加 1） */
const VER = 'osh-202610231629';
const FILES = ['./', 'index.html', 'app.js', 'calc.js', 'sync.js', 'config.js', 'manifest.webmanifest',
  'icon-180.png', 'icon-512.png', 'data/bank.json', 'data/explain.json', 'data/notes.json', 'data/refs.json', 'data/laws.json',
  'img/90008-03-013.png', 'img/90009-04-002.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;  // 雲端同步不快取
  e.respondWith(caches.open(VER).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
