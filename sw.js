const CACHE_NAME = 'ahk-academy-shell-v2';
const BASE_URL = new URL('./', self.registration.scope);
const toUrl = path => new URL(path, BASE_URL).toString();
const CORE_ASSETS = [
  './', './index.html', './manifest.json', './assets/css/app.css',
  './assets/js/app.js', './assets/js/core/progress-store.js',
  './assets/js/core/curriculum-service.js', './engines/sql-engine.js',
  './curriculum/index.json', './datasets/index.json'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(CORE_ASSETS.map(path => cache.add(toUrl(path)).catch(() => undefined)));
    try {
      const manifest = await (await fetch(toUrl('./manifest.json'))).json();
      const index = await (await fetch(toUrl('./curriculum/index.json'))).json();
      const datasets = await (await fetch(toUrl('./datasets/index.json'))).json();
      const contentPaths = (index.days || [])
        .filter(day => day.day <= manifest.release_control.published_through_day)
        .map(day => './curriculum/' + day.file);
      for (const dataset of datasets.datasets || []) {
        if (dataset.status === 'active') {
          contentPaths.push('./' + dataset.data, './' + dataset.schema);
        }
      }
      await Promise.all(contentPaths.map(path => cache.add(toUrl(path)).catch(() => undefined)));
    } catch {
      // Keep the application shell usable when pre-caching content is interrupted.
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('ahk-academy-') && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const cacheKey = new Request(url.origin + url.pathname);
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response && response.ok) await cache.put(cacheKey, response.clone());
      return response;
    } catch {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const shell = await cache.match(toUrl('./index.html'));
        if (shell) return shell;
      }
      return new Response('This resource is not available offline yet.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});