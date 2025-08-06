const CACHE_NAME = 'organizador-financiero-v2';
const urlsToCache = [
    './',
    './index.html',
    './manifest.json'
];

// Instalación del Service Worker
self.addEventListener('install', (event) => {
    console.log('[SW] Instalando Service Worker');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Archivos cacheados');
                return cache.addAll(urlsToCache);
            })
            .catch((error) => {
                console.error('[SW] Error al cachear:', error);
            })
    );
    self.skipWaiting();
});

// Activación del Service Worker
self.addEventListener('activate', (event) => {
    console.log('[SW] Service Worker activado');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Eliminando cache antiguo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Interceptar peticiones de red
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Devolver desde cache si existe
                if (response) {
                    return response;
                }
                
                // Si no está en cache, hacer petición de red
                return fetch(event.request)
                    .then((response) => {
                        // Verificar si es una respuesta válida
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        
                        // Clonar la respuesta
                        const responseToCache = response.clone();
                        
                        // Añadir al cache
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            });
                        
                        return response;
                    })
                    .catch(() => {
                        // Si falla la red, devolver página offline básica
                        if (event.request.destination === 'document') {
                            return new Response(`
                                <!DOCTYPE html>
                                <html>
                                <head>
                                    <meta charset="UTF-8">
                                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                    <title>Sin conexión - Organizador Financiero</title>
                                    <style>
                                        body {
                                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                            min-height: 100vh;
                                            display: flex;
                                            align-items: center;
                                            justify-content: center;
                                            margin: 0;
                                            color: white;
                                            text-align: center;
                                            padding: 20px;
                                        }
                                        .container {
                                            background: rgba(255,255,255,0.1);
                                            padding: 40px;
                                            border-radius: 20px;
                                            backdrop-filter: blur(10px);
                                            max-width: 400px;
                                        }
                                        h1 { font-size: 2em; margin-bottom: 20px; }
                                        p { font-size: 1.1em; margin-bottom: 30px; opacity: 0.9; }
                                        button {
                                            background: white;
                                            color: #667eea;
                                            border: none;
                                            padding: 15px 30px;
                                            border-radius: 25px;
                                            font-weight: bold;
                                            cursor: pointer;
                                            font-size: 1em;
                                        }
                                    </style>
                                </head>
                                <body>
                                    <div class="container">
                                        <h1>📱 Sin conexión</h1>
                                        <p>No tienes conexión a internet, pero puedes seguir usando la aplicación con los datos guardados localmente.</p>
                                        <button onclick="window.location.reload()">🔄 Reintentar</button>
                                    </div>
                                </body>
                                </html>
                            `, {
                                headers: {
                                    'Content-Type': 'text/html'
                                }
                            });
                        }
                    });
            })
    );
});

// Manejo de mensajes
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Sincronización en segundo plano
self.addEventListener('sync', (event) => {
    if (event.tag === 'background-sync') {
        console.log('[SW] Sincronización en segundo plano');
        event.waitUntil(doBackgroundSync());
    }
});

async function doBackgroundSync() {
    try {
        // Aquí puedes implementar lógica de sincronización
        console.log('[SW] Ejecutando sincronización...');
    } catch (error) {
        console.error('[SW] Error en sincronización:', error);
    }
}