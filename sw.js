const CACHE = 'smazak-v53';   // bump: 3D funkční (window.player fix, sprite navrch, build tag)
const FILES = [
  './',
  './index.html',
  './style.css',
  './game.js',
  './render3d.js',
  './assets/mapdata.js',
  './assets/mapvec.js',
  './assets/mappoi.js',
  './assets/three.min.js',
  './manifest.json',
  './assets/simmy_char.png',
  './assets/menu_bg.png',
  './assets/icon.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// NETWORK-FIRST: vždy zkus síť (aktuální verze), cache jen jako offline záloha.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return resp;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
