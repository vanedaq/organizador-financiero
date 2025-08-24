self.addEventListener('install', e=>{
  e.waitUntil(
    caches.open('finanzas-v1').then(cache=>{
      return cache.addAll(['./','./index.html','./style.app.css','./app.app.js','./manifest.json']);
    })
  );
});

self.addEventListener('fetch', e=>{
  e.respondWith(
    caches.match(e.request).then(res=>res||fetch(e.request))
  );
});
