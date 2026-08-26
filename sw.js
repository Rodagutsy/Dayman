/* Dayspeak service worker — cache the shell, serve offline. */
var CACHE = 'dayspeak-v15';
var SHELL = [
  './',
  './index.html',
  './styles.css',
  './js/app.js',
  './js/utils.js',
  './js/state.js',
  './js/parsing.js',
  './js/speech.js',
  './js/gamification.js',
  './js/platform.js',
  './js/session.js',
  './js/screens.js',
  './js/audio.js',
  './js/confetti.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(SHELL.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (ks) {
      return Promise.all(ks.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
        }
        return res;
      }).catch(function () {
        return hit || caches.match('./index.html');
      });
      return hit || net;
    })
  );
});
