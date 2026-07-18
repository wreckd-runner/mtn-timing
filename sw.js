// MTN Service Worker
// Cache-first strategy for the app shell, network-first for Supabase/CDN

const CACHE = 'mtn-v1';

// Files to cache on install — the app shell
const PRECACHE = [
  '/',
  '/index.html',
];

// CDN resources to cache when first fetched
const CDN_HOSTS = [
  'cdn.jsdelivr.net',
  'unpkg.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  // Clear old caches
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never intercept Supabase — always needs network for real-time
  if (url.hostname.includes('supabase.co')) return;

  // CDN resources — cache on first fetch, serve from cache offline
  if (CDN_HOSTS.some(h => url.hostname.includes(h))) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        }).catch(() => cached); // offline fallback
      })
    );
    return;
  }

  // App shell — cache first, network fallback
  if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        // Try network in background to update cache
        const networkFetch = fetch(e.request).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        }).catch(() => null);
        // Return cache immediately, network updates for next time
        return cached || networkFetch;
      })
    );
    return;
  }
});
