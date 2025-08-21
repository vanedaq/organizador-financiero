// sw.js – caché básico y modo offline
const CACHE_NAME = 'finanzas-cache-v1';
const APP_SHELL = [
'./',
'./index.html',
'./manifest.json',
'./icons/icon-192.png',
'./icons/icon-512.png'
];


self.addEventListener('install', (event) => {
event.waitUntil(
caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
);
self.skipWaiting();
});


self.addEventListener('activate', (event) => {
event.waitUntil(
caches.keys().then((keys) =>
Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
)
);
self.clients.claim();
});


self.addEventListener('fetch', (event) => {
const { request } = event;
// Network-first para HTML, cache-first para estáticos
if (request.mode === 'navigate') {
event.respondWith(
fetch(request).catch(() => caches.match('./index.html'))
);
return;
}
event.respondWith(
caches.match(request).then((cached) =>
cached || fetch(request).then((res) => {
const copy = res.clone();
caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
return res;
}).catch(() => cached)
)
);
});
