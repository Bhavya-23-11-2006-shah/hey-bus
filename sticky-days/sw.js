/* Sticky Days — offline app shell.
   The app is one HTML file; notes live in the phone's local storage and photos in
   its own IndexedDB database, so this worker only keeps the shell cached.

   Important: the app shell is cached under "./" (the root). "/index.html" answers
   with a redirect, and a redirected response may NOT be returned for a navigation
   request — doing that makes the browser fail the page load. */
const CACHE = 'sticky-days-shell-v18';
const SHELL = [
  './',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

// Pages other than the app itself (like /install) must not be replaced by the app.
const APP_PATHS = new Set(['/', '/index.html']);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // Cache what we can; a single failure must not block the install.
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function cacheable(res) {
  return res && res.ok && !res.redirected;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    // The app itself: cached shell first, so it opens with no network.
    if (url.origin === self.location.origin && APP_PATHS.has(url.pathname)) {
      event.respondWith(
        caches.match('./', { ignoreSearch: true })
          .then((hit) => {
            if (hit) return hit;
            return fetch(request).then((res) => {
              if (cacheable(res)) {
                const copy = res.clone();
                caches.open(CACHE).then((cache) => cache.put('./', copy)).catch(() => {});
              }
              return res;
            });
          })
          .catch(() => fetch(request))
      );
      return;
    }
    // Any other page: the network first, and only fall back to what we have.
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (cacheable(res)) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('./')))
    );
    return;
  }

  // Same-origin assets: cache first, refresh in the background.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((hit) => {
        const network = fetch(request)
          .then((res) => {
            if (cacheable(res)) {
              const copy = res.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => hit);
        return hit || network;
      })
    );
    return;
  }

  // Fonts and other off-origin requests: network, cached copy as a fallback.
  event.respondWith(
    fetch(request).catch(() => caches.match(request)).catch(() => Response.error())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
