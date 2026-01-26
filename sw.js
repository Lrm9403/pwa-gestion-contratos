// Service Worker básico
self.addEventListener('install', (event) => {
    console.log('Service Worker instalado');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('Service Worker activado');
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Pasar todas las solicitudes a la red
    event.respondWith(fetch(event.request));
});
