const CACHE = 'smazak-v84';   // bump: proceduální textury (tráva/asfalt/beton) + šipka nad hráčem
const FILES = [
  './',
  './index.html',
  './manifest.json',
  './assets/simmy_char.png',
  './assets/simmy_walk.png',
  './assets/menu_bg.png',
  './assets/npc/man_phone.png',
  './assets/npc/tourist.png',
  './assets/npc/babka.png',
  './assets/npc/teenager.png',
  './assets/npc/mama.png',
  './assets/npc/vendor.png',
  './assets/enemy/gen/somrak.png',
  './assets/enemy/gen/gauner.png',
  './assets/props/strom_clean.png',
  './assets/props/gen/ker.png',
  './assets/props/gen/lampa.png',
  './assets/props/gen/zastavka.png',
  './assets/props/gen/kytky.png',
  './assets/props/gen/kos.png',
  './assets/props/gen/popelnice.png',
  './assets/music.mp3',
  './assets/sfx/click.wav',
  './assets/sfx/shoot.wav',
  './assets/sfx/hit.wav',
  './assets/sfx/kill.wav',
  './assets/sfx/pickup.wav',
  './assets/sfx/hurt.wav',
  './assets/sfx/boom.wav',
  './assets/sfx/wave.wav',
  './assets/sfx/gameover.wav',
  './assets/icon.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png',
];

// ODOLNÝ install: každý soubor zvlášť (allSettled) → jedno chybějící/pomalé
// stažení NEPOLOŽÍ celou instalaci service workeru (dřív addAll = vše nebo nic).
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(FILES.map(f => c.add(f))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// NETWORK-FIRST jen pro VLASTNÍ zdroje (fonty apod. nechá na prohlížeči).
// Cache slouží jako offline záloha; navigace fallbackuje na index.html.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // cizí origin (Google Fonts) neřešíme

  e.respondWith(
    fetch(req)
      .then(resp => {
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return resp;
      })
      .catch(() =>
        caches.match(req).then(r =>
          r || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())
        )
      )
  );
});
