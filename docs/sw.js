// 오프라인 캐시. 앱 파일을 바꾸면 CACHE 버전을 올려 주세요.
const CACHE = 'gagyebu-v1.2.0';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './notif.js',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 캐시 우선 + 백그라운드 갱신 (다음 실행 때 새 버전 반영)
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const key = req.mode === 'navigate' ? './' : req;
      const cached = await cache.match(key, { ignoreSearch: true });
      const network = fetch(req)
        .then(res => {
          if (res.ok) cache.put(key, res.clone());
          return res;
        })
        .catch(() => cached);
      if (cached) {
        e.waitUntil(network);
        return cached;
      }
      return network;
    })
  );
});
