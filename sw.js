// Financico service worker — caches the app shell so it opens offline.
// It deliberately ignores POSTs and cross-origin requests, so the entry
// submission to the Apps Script endpoint always goes straight to the network.
//
// Bump CACHE on every shell change so phones drop the stale version.

var CACHE = 'financico-v5';
var ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './db.js',
  './manifest.webmanifest',
  './income/',
  './income/index.html',
  './income/manifest-income.webmanifest',
  './expense/',
  './expense/index.html',
  './expense/manifest-expense.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-expense.png',
  './icons/icon-512-expense.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  // Only handle same-origin GETs (the app shell). Everything else — including
  // the POST to Apps Script — falls through to the network untouched.
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then(function (r) { return r || fetch(e.request); })
  );
});
