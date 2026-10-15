/* ============================================================
   GasGuarenas · Service Worker (sw.js)
   Versión: 1.0.0
   ------------------------------------------------------------
   - Cachea el shell de la app para funcionar offline
   - Sirve archivos desde caché cuando no hay red
   - NO cachea llamadas a PocketBase (los datos siempre frescos)
   - Soporta notificaciones push
   - Estrategia:
       · HTML/JS/CSS → Cache First con revalidación (Stale-While-Revalidate)
       · Imágenes/videos → Cache First
       · API PocketBase → Network Only
   ============================================================ */

const CACHE_VERSION = 'gasguarenas-v1.0.0';
const CACHE_STATIC  = `${CACHE_VERSION}-static`;
const CACHE_IMAGES  = `${CACHE_VERSION}-images`;
const CACHE_RUNTIME = `${CACHE_VERSION}-runtime`;

/* Archivos mínimos que SIEMPRE se cachean al instalar */
const ARCHIVOS_ESENCIALES = [
  './',
  './index.html',
  './config.js',
  './manifest.json',
  './offline.html',           // página de respaldo si no hay nada en caché
  'https://cdn-icons-png.flaticon.com/512/2933/2933933.png',
];

/* Dominios que NUNCA se cachean (datos en vivo) */
const NO_CACHEAR = [
  '/api/',
  'pocketbase',
  'fly.dev',
  'railway.app',
  'onrender.com',
  'netlify/functions',
];

/* ============================================================
   1) INSTALL · Guarda archivos esenciales en caché
   ============================================================ */
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando...', CACHE_VERSION);

  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then((cache) => {
        return Promise.all(
          ARCHIVOS_ESENCIALES.map((url) =>
            cache.add(url).catch((err) =>
              console.warn('[SW] No se pudo cachear:', url, err)
            )
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

/* ============================================================
   2) ACTIVATE · Limpia cachés viejas
   ============================================================ */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activando...', CACHE_VERSION);

  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) =>
              key.startsWith('gasguarenas-') &&
              key !== CACHE_STATIC &&
              key !== CACHE_IMAGES &&
              key !== CACHE_RUNTIME
            )
            .map((key) => {
              console.log('[SW] Borrando caché vieja:', key);
              return caches.delete(key);
            })
        )
      )
      .then(() => self.clients.claim())
  );
});

/* ============================================================
   3) FETCH · Intercepta peticiones y decide estrategia
   ============================================================ */
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Ignorar métodos que no sean GET
  if (request.method !== 'GET') return;

  // Ignorar esquemas raros (chrome-extension://, etc.)
  if (!request.url.startsWith('http')) return;

  const url = request.url;

  // 🔴 1. Datos de PocketBase / API → siempre red (nunca caché)
  if (NO_CACHEAR.some((patron) => url.includes(patron))) {
    event.respondWith(fetch(request));
    return;
  }

  // 🟢 2. Imágenes / videos → Cache First
  if (
    request.destination === 'image' ||
    request.destination === 'video' ||
    /\.(png|jpe?g|gif|webp|svg|ico|mp4|webm|mov|ogg)(\?.*)?$/i.test(url)
  ) {
    event.respondWith(cacheFirst(request, CACHE_IMAGES));
    return;
  }

  // 🟡 3. HTML / JS / CSS / fuentes → Stale-While-Revalidate
  if (
    request.destination === 'document' ||
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font' ||
    /\.(html?|js|mjs|css|woff2?|ttf)(\?.*)?$/i.test(url)
  ) {
    event.respondWith(staleWhileRevalidate(request, CACHE_STATIC));
    return;
  }

  // ⚪ 4. Todo lo demás → Network con respaldo en caché
  event.respondWith(networkWithCacheFallback(request));
});

/* ============================================================
   Estrategias de caché
   ============================================================ */

// 1. Cache First: mira la caché primero; si no hay, va a la red y guarda
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Sin red y sin caché → imagen de respaldo
    if (request.destination === 'image') {
      return caches.match('https://cdn-icons-png.flaticon.com/512/2933/2933933.png');
    }
    throw err;
  }
}

// 2. Stale-While-Revalidate: sirve rápido desde caché y actualiza en segundo plano
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached); // si falla la red, devuelve lo cacheado

  return cached || fetchPromise;
}

// 3. Network con respaldo en caché (para navegación normal)
async function networkWithCacheFallback(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && request.method === 'GET') {
      const cache = await caches.open(CACHE_RUNTIME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;

    // Si es navegación, devolver offline.html
    if (request.mode === 'navigate') {
      const offline = await caches.match('./offline.html');
      if (offline) return offline;
      return caches.match('./index.html');
    }
    throw err;
  }
}

/* ============================================================
   4) MESSAGE · Permite que la app envíe comandos al SW
   ============================================================ */
self.addEventListener('message', (event) => {
  const data = event.data || {};

  // Actualizar el Service Worker inmediatamente
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // Limpiar todas las cachés (útil tras un deploy grande)
  if (data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((keys) =>
        Promise.all(keys.map((k) => caches.delete(k)))
      ).then(() => {
        event.source?.postMessage({ type: 'CACHE_CLEARED' });
      })
    );
  }

  // Ver la versión activa
  if (data.type === 'GET_VERSION') {
    event.source?.postMessage({ type: 'VERSION', version: CACHE_VERSION });
  }
});

/* ============================================================
   5) PUSH · Notificaciones push (cuando las actives)
   ============================================================ */
self.addEventListener('push', (event) => {
  let payload = { title: 'GasGuarenas', body: 'Tienes una nueva notificación' };

  try {
    if (event.data) payload = event.data.json();
  } catch (e) {
    payload.body = event.data ? event.data.text() : payload.body;
  }

  const opciones = {
    body: payload.body,
    icon: 'https://cdn-icons-png.flaticon.com/512/2933/2933933.png',
    badge: 'https://cdn-icons-png.flaticon.com/512/2933/2933933.png',
    vibrate: [200, 100, 200],
    tag: payload.tag || 'gasguarenas',
    data: payload.data || { url: './' },
    actions: payload.actions || [
      { action: 'abrir', title: 'Abrir app' },
      { action: 'cerrar', title: 'Cerrar' },
    ],
  };

  event.waitUntil(self.registration.showNotification(payload.title, opciones));
});

/* ============================================================
   6) NOTIFICATION CLICK · Al tocar la notificación
   ============================================================ */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'cerrar') return;

  const url = event.notification.data?.url || './';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientes) => {
        // Si la app ya está abierta, enfocarla
        for (const cliente of clientes) {
          if (cliente.url.includes(self.location.origin)) {
            cliente.focus();
            return cliente.navigate(url);
          }
        }
        // Si no, abrirla
        return self.clients.openWindow(url);
      })
  );
});

/* ============================================================
   7) BACKGROUND SYNC · Reintenta pedidos offline (opcional)
   ============================================================ */
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pedidos') {
    event.waitUntil(reenviarPedidosPendientes());
  }
});

async function reenviarPedidosPendientes() {
  try {
    const cache = await caches.open(CACHE_RUNTIME);
    const pendientes = await cache.match('/pedidos-pendientes');
    if (!pendientes) return;

    const lista = await pendientes.json();
    for (const pedido of lista) {
      try {
        await fetch('/api/pb/api/collections/pedidos/records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pedido),
        });
      } catch (e) {
        console.warn('[SW] No se pudo reenviar pedido', e);
      }
    }
    await cache.delete('/pedidos-pendientes');
  } catch (e) {
    console.warn('[SW] Error en background sync', e);
  }
}