/* 離線可用＋改版馬上生效：
   程式和題目資料「先上網抓最新的」（3 秒抓不到才用手機裡的備份）；
   法規全文、圖片很少變，直接用備份。VER 由 tools/build.py 自動更新。 */
const VER = 'osh-202610241753';
const FILES = ['./', 'index.html', 'app.js', 'calc.js', 'sync.js', 'config.js', 'manifest.webmanifest',
  'icon-180.png', 'icon-512.png', 'data/bank.json', 'data/explain.json', 'data/notes.json', 'data/refs.json', 'data/laws.json',
  'img/90008-03-013.png', 'img/90009-04-002.png'];
const CACHE_FIRST = /data\/laws\.json|\.png$/;

self.addEventListener('install', e => {
  // cache:'reload' 跳過瀏覽器自己的快取，確定抓到的是新版
  e.waitUntil(caches.open(VER).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;  // 雲端同步不經過這裡
  e.respondWith(caches.open(VER).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    if (hit && CACHE_FIRST.test(u.pathname)) return hit;
    const net = fetch(e.request, { cache: 'no-cache' }).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; });
    if (!hit) return net;
    const timeout = new Promise(ok => setTimeout(() => ok(hit), 3000));
    return Promise.race([net.catch(() => hit), timeout]);
  }));
});
