const CACHE_NAME = 'gestion-contratos-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/app.js',
    '/js/database.js',
    '/js/export.js',
    '/js/sync.js',
    '/manifest.json',
    '/icons/icon-72x72.png',
    '/icons/icon-96x96.png',
    '/icons/icon-128x128.png',
    '/icons/icon-144x144.png',
    '/icons/icon-512x512.png',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Instalación del Service Worker
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Cache abierto');
                return cache.addAll(STATIC_ASSETS);
            })
    );
});

// Activación del Service Worker
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Eliminando cache antigua:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Estrategia de cache: Network First con fallback a cache
self.addEventListener('fetch', (event) => {
    // No cachear solicitudes de datos de la API
    if (event.request.url.includes('/api/')) {
        return;
    }
    
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Si la respuesta es válida, la guardamos en cache
                if (response && response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Si falla la red, intentamos servir desde cache
                return caches.match(event.request);
            })
    );
});

// Manejo de sincronización en segundo plano
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-data') {
        event.waitUntil(
            syncDataWithServer()
        );
    }
});

async function syncDataWithServer() {
    // Aquí iría la lógica de sincronización con el servidor
    console.log('Sincronizando datos en segundo plano...');
    
    // Simulamos una sincronización
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Enviar notificación de éxito
    self.registration.showNotification('Datos sincronizados', {
        body: 'La sincronización se completó correctamente',
        icon: '/icons/icon-72x72.png'
    });
}
