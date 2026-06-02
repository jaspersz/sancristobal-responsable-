// ═══════════════════════════════════════════════════════
//  San Cristóbal Responsable — Service Worker
//  Versión: v6 (sin pantalla de bienvenida)
//
//  Estrategia:
//  - index.html y manifest.json: network-first con timeout
//  - Si hay internet bueno: carga la versión nueva
//  - Si hay internet lento o no hay conexión: usa caché
//  - Imágenes y fuentes: cache-first para ahorrar datos
// ═══════════════════════════════════════════════════════

const CACHE_VERSION = 'v6';
const CACHE_NAME = 'sc-responsable-' + CACHE_VERSION;
const IMG_CACHE = 'sc-images-' + CACHE_VERSION;
const FONT_CACHE = 'sc-fonts-' + CACHE_VERSION;

// Tiempo máximo para esperar internet antes de usar caché.
// 3000 = 3 segundos. Puedes subirlo a 4000 si quieres esperar más.
const NETWORK_TIMEOUT = 3000;

// Archivos principales del sitio.
// Mantén estos nombres si en GitHub tienes: index.html, manifest.json y sw.js.
const SHELL = [
  './',
  './index.html',
  './manifest.json'
];

// Fuentes usadas por la página.
const FONTS = [
  'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Plus+Jakarta+Sans:wght@400;600;800&display=swap',
  'https://fonts.gstatic.com/s/dmserifdisplay/v16/-nFnOHM81r4j6k0gjALR8uVMpNt9-WkBGBe4.woff2',
  'https://fonts.gstatic.com/s/plusjakartasans/v8/LDIoaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA.woff2'
];

// Imágenes principales de la guía.
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

function isHtmlRequest(request, url) {
  return (
    request.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('.html')
  );
}

function isImageRequest(request, url) {
  return (
    request.destination === 'image' ||
    url.hostname.includes('commons.wikimedia.org') ||
    /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url.pathname)
  );
}

function isFontRequest(request, url) {
  return (
    request.destination === 'font' ||
    request.destination === 'style' ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  );
}

async function safeCacheUrls(cacheName, urls) {
  const cache = await caches.open(cacheName);

  await Promise.allSettled(
    urls.map(async function(url) {
      try {
        const response = await fetch(url, { cache: 'reload' });
        if (response && (response.ok || response.type === 'opaque')) {
          await cache.put(url, response.clone());
        }
      } catch (err) {
        console.warn('[SW] No se pudo guardar en caché:', url, err);
      }
    })
  );
}

async function networkFirstWithTimeout(request) {
  const cache = await caches.open(CACHE_NAME);

  const cached =
    await cache.match(request) ||
    await cache.match('./index.html') ||
    await cache.match('./');

  const networkFetch = fetch(request, { cache: 'reload' })
    .then(function(response) {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(function() {
      return cached;
    });

  // Primera visita: si todavía no hay caché, debe esperar internet.
  if (!cached) return networkFetch;

  // Visitas siguientes: espera internet un poco; si está lento, usa caché.
  const timeout = new Promise(function(resolve) {
    setTimeout(function() {
      resolve(cached);
    }, NETWORK_TIMEOUT);
  });

  return Promise.race([networkFetch, timeout]);
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && (response.ok || response.type === 'opaque')) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return new Response('', {
      status: 408,
      statusText: 'Recurso no disponible sin conexión'
    });
  }
}

self.addEventListener('install', function(event) {
  event.waitUntil(
    Promise.all([
      safeCacheUrls(CACHE_NAME, SHELL),
      safeCacheUrls(FONT_CACHE, FONTS),
      safeCacheUrls(IMG_CACHE, IMAGES)
    ]).then(function() {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys()
      .then(function(keys) {
        return Promise.all(
          keys
            .filter(function(key) {
              return key.startsWith('sc-responsable-') ||
                     key.startsWith('sc-images-') ||
                     key.startsWith('sc-fonts-');
            })
            .filter(function(key) {
              return key !== CACHE_NAME && key !== IMG_CACHE && key !== FONT_CACHE;
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

self.addEventListener('fetch', function(event) {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Página principal y rutas HTML: intenta red primero, con respaldo a caché.
  if (isHtmlRequest(request, url)) {
    event.respondWith(networkFirstWithTimeout(request));
    return;
  }

  // Manifest: también red primero, para que se actualice si cambias íconos o nombre.
  if (url.pathname.endsWith('/manifest.json') || url.pathname.endsWith('manifest.json')) {
    event.respondWith(networkFirstWithTimeout(request));
    return;
  }

  // Imágenes: caché primero.
  if (isImageRequest(request, url)) {
    event.respondWith(cacheFirst(request, IMG_CACHE));
    return;
  }

  // Fuentes y CSS de Google Fonts: caché primero.
  if (isFontRequest(request, url)) {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  // Otros recursos: red normal, si falla intenta caché.
  event.respondWith(
    fetch(request).catch(function() {
      return caches.match(request);
    })
  );
});
