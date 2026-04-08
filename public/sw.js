/**
 * CricTrack Service Worker
 * Strategy:
 *   • /_next/static/  → Cache-first (content-addressed, safe to cache forever)
 *   • /logos/, /icons/ → Cache-first  (static assets)
 *   • Supabase API calls → Network-only (real-time data, never cache)
 *   • HTML navigations  → Network-first, offline.html fallback
 *   • Everything else   → Network-first
 */

const CACHE_NAME = 'crictrack-v1';
const OFFLINE_URL = '/offline.html';

// Assets pre-fetched and cached on install
const PRECACHE = [
  '/offline.html',
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests over http(s)
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // ── Supabase: network-only (real-time data must never be stale) ──
  if (url.hostname.includes('supabase.co')) return;

  // ── Next.js static chunks: cache-first (hashed filenames = safe forever) ──
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // ── Static image assets: cache-first ────────────────────────────────────
  if (url.pathname.startsWith('/logos/') ||
      url.pathname.startsWith('/icons/') ||
      url.pathname.match(/\.(png|jpg|jpeg|svg|ico|webp|woff2?)$/)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // ── HTML navigations: network-first w/ offline fallback ─────────────────
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  // ── Everything else: network-first ──────────────────────────────────────
  event.respondWith(networkFirst(request));
});

// ── Strategy helpers ─────────────────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 408 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('', { status: 503 });
  }
}

async function networkFirstWithOfflineFallback(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    // Return the cached offline page when navigation fails
    const offlinePage = await caches.match(OFFLINE_URL);
    return offlinePage || new Response('<h1>Offline</h1>', {
      headers: { 'Content-Type': 'text/html' },
    });
  }
}
