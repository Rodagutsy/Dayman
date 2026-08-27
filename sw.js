/* Dayman service worker — cache the shell, serve offline. */
var CACHE = 'dayman-v4';
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
  './js/splash.js',
  './js/supabase-config.js',
  './js/supabase.js',
  './js/auth.js',
  './js/sync.js',
  './js/notify.js',
  './js/leaderboard.js',
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

self.addEventListener('message', function (e) {
  if (e.data === 'skip') self.skipWaiting();
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

self.addEventListener('push', function (e) {
  var data = { title: 'Dayman', body: '' };
  try { data = e.data ? e.data.json() : data; } catch (err) {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: data.tag || 'dayman',
      renotify: true,
      data: data.data || {}
    })
  );
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ('focus' in list[i]) return list[i].focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});
