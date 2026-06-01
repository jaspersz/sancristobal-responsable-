// ═══════════════════════════════════════════════════════
//  San Cristóbal Responsable — Service Worker
//  Estrategia:
//  - HTML / página principal: Network-first con timeout
//  - Internet bueno: carga versión nueva
//  - Internet lento o sin internet: usa caché
//  - Imágenes y fuentes: cache-first para ahorrar datos
// ═══════════════════════════════════════════════════════

// IMPORTANTE:
// Cada vez que hagas cambios fuertes en index.html, puedes subir la versión:
// sc-responsable-v2 → sc-responsable-v3 → sc-responsable-v4
const CACHE_NAME = 'sc-responsable-v2';
const IMG_CACHE = 'sc-images-v2';

// Tiempo máximo de espera para cargar la página desde internet.
// Si tarda más de 3 segundos y ya existe caché, muestra caché.
const NETWORK_TIMEOUT = 3000;

// Archivos principales de la página
const SHELL = [
  './',
  './index.html',
  './manifest.json',

  // Fuentes de Google
  'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Plus+Jakarta+Sans:wght@400;600;800&display=swap',
  'https://fonts.gstatic.com/s/dmserifdisplay/v16/-nFnOHM81r4j6k0gjALR8uVMpNt9-WkBGBe4.woff2',
  'https://fonts.gstatic.com/s/plusjakartasans/v8/LDIoaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA.woff2'
];

// Imágenes principales de la guía
const IMAGES = [
  'https://commons.wikimedia.org/wiki/Special:FilePath/Galapagos2007--53--08-23-07.JPG?width=1280',
  'https://commons.wikimedia.org/wiki/Special:FilePath/Isla_de_San_Crist%C3%B3bal%2C_islas_Gal%C3%A1pagos%2C_Ecuador%2C_2015-07-24%2C_DD_88.JPG?width=1280',
  'https://commons.wikimedia.org/wiki/Special:FilePath/La_Loberia.jpg?width=1280',
  'https://commons.wikimedia.org/wiki/Special:FilePath/Le%C3%B3n_Durmiente%2C_isla_de_San_Crist%C3%B3bal%2C_islas_Gal%C3%A1pagos%2C_Ecuador%2C_2015-07-25%2C_DD_08.JPG?width=1280',
  'https://commons.wikimedia.org/wiki/Special:FilePath/Piquero_patiazul_%28Sula_nebouxii%29%2C_Punta_Pitt%2C_isla_de_San_Crist%C3%B3bal%2C_islas_Gal%C3%A1pagos%2C_Ecuador%2C_2015-07-24%2C_DD_66.JPG?width=1280',
  'https://commons.wikimedia.org/wiki/Special:FilePath/Tortoise_nursery_in_Galapaguera_de_Cerro_Colorado%2C_Galapagos_Islands_2.JPG?width=1280',
  'https://commons.wikimedia.org/wiki/Special:FilePath/Galapagos2007--01--07-13-07.JPG?width=1280',
  'https://commons.wikimedia.org/wiki/Special:FilePath/Fragata_com%C3%BAn_%28Fregata_minor%29%2C_isla_de_San_Crist%C3%B3bal%2C_islas_Gal%C3%A1pagos%2C_Ecuador%2C_2015-07-24%2C_DD_93.JPG?width=1280'
];

// ─────────────────────────────────────────────────────
// Función: guardar archivos sin romper la instalación
// Si una fuente o imagen falla, no daña toda la PWA.
// ─────────────────────────────────────────────────────
async function addAllSafe(cacheName, urls) {
  const cache = await caches.open(cacheName);

  await Promise.allSettled(
    urls.map(async function(url) {
      try {
        await cache.add(url);
      } catch (err) {
        console.warn('[SW] No se pudo cachear:', url, err);
      }
    })
  );
}

// ─────────────────────────────────────────────────────
// Función: network-first con timeout
// Sirve para index.html y navegación principal.
// ─────────────────────────────────────────────────────
async function networkFirstWithTimeout(request) {
  const cache = await caches.open(CACHE_NAME);

  const cached =
    await cache.match(request) ||
    await cache.match('./index.html') ||
    await cache.match('./');

  const networkFetch = fetch(request)
    .then(function(response) {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(function() {
      return cached;
    });

  // Si no hay caché todavía, toca esperar la red.
  // Esto pasa la primera vez que alguien entra.
  if (!cached) {
    return networkFetch;
  }

  // Si ya hay caché, esperamos red solo unos segundos.
  const timeout = new Promise(function(resolve) {
    setTimeout(function() {
      resolve(cached);
    }, NETWORK_TIMEOUT);
  });

  return Promise.race([networkFetch, timeout]);
}

// ─────────────────────────────────────────────────────
// INSTALL
// ─────────────────────────────────────────────────────
self.addEventListener('install', function(event) {
  event.waitUntil(
    Promise.all([
      addAllSafe(CACHE_NAME, SHELL),
      addAllSafe(IMG_CACHE, IMAGES)
    ]).then(function() {
      return self.skipWaiting();
    })
  );
});

// ─────────────────────────────────────────────────────
// ACTIVATE
// Limpia cachés viejas, por ejemplo v1.
// ─────────────────────────────────────────────────────
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys()
      .then(function(keys) {
        return Promise.all(
          keys
            .filter(function(key) {
              return key !== CACHE_NAME && key !== IMG_CACHE;
            })
            .map(function(key) {
              console.log('[SW] Eliminando caché vieja:', key);
              return caches.delete(key);
            })
        );
      })
      .then(function() {
        return self.clients.claim();
      })
  );
});

// ─────────────────────────────────────────────────────
// FETCH
// ─────────────────────────────────────────────────────
self.addEventListener('fetch', function(event) {
  const request = event.request;
  const url = new URL(request.url);

  // Solo manejar GET
  if (request.method !== 'GET') return;

  // ───────────────────────────────────────────────────
  // 1. Página principal / HTML:
  // Network-first con timeout.
  // ───────────────────────────────────────────────────
  if (
    request.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('.html')
  ) {
    event.respondWith(networkFirstWithTimeout(request));
    return;
  }

  // ───────────────────────────────────────────────────
  // 2. Manifest:
  // Network-first, pero con caché si falla.
  // ───────────────────────────────────────────────────
  if (url.pathname.endsWith('manifest.json')) {
    event.respondWith(networkFirstWithTimeout(request));
    return;
  }

  // ───────────────────────────────────────────────────
  // 3. Imágenes:
  // Cache-first para ahorrar datos y cargar rápido.
  // Si no está en caché, intenta descargarla.
  // ───────────────────────────────────────────────────
  if (
    url.hostname.includes('commons.wikimedia.org') ||
    url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)
  ) {
    event.respondWith(
      caches.open(IMG_CACHE).then(function(cache) {
        return cache.match(request).then(function(cached) {
          if (cached) return cached;

          return fetch(request, { mode: 'no-cors' })
            .then(function(response) {
              cache.put(request, response.clone());
              return response;
            })
            .catch(function() {
              return new Response('', {
                status: 408,
                statusText: 'Imagen no disponible sin conexión'
              });
            });
        });
      })
    );
    return;
  }

  // ───────────────────────────────────────────────────
  // 4. Fuentes:
  // Cache-first para no gastar datos cada vez.
  // ───────────────────────────────────────────────────
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(request).then(function(cached) {
          if (cached) return cached;

          return fetch(request)
            .then(function(response) {
              if (response && response.ok) {
                cache.put(request, response.clone());
              }
              return response;
            })
            .catch(function() {
              return cached || new Response('', { status: 408 });
            });
        });
      })
    );
    return;
  }

  // ───────────────────────────────────────────────────
  // 5. Todo lo demás:
  // Red normal, fallback a caché.
  // ───────────────────────────────────────────────────
  event.respondWith(
    fetch(request).catch(function() {
      return caches.match(request);
    })
  );
});
