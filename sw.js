// ═══════════════════════════════════════════════════════
//  San Cristóbal Responsable — Service Worker
//  Estrategia: Cache-first para el HTML/fuentes,
//              Network-first con fallback para imágenes
// ═══════════════════════════════════════════════════════

const CACHE_NAME    = 'sc-responsable-v1';
const IMG_CACHE     = 'sc-images-v1';

// Archivos del "app shell" — se cachean en la instalación
const SHELL = [
  './san-cristobal-responsable-corregido.html',
  './manifest.json',
  // Fuentes de Google (se cachean en la primera visita)
  'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Plus+Jakarta+Sans:wght@400;600;800&display=swap',
  'https://fonts.gstatic.com/s/dmserifdisplay/v16/-nFnOHM81r4j6k0gjALR8uVMpNt9-WkBGBe4.woff2',
  'https://fonts.gstatic.com/s/plusjakartasans/v8/LDIoaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA.woff2'
];

// URLs de imágenes a pre-cachear (las que aparecen en la guía)
const IMAGES = [
  // Hero y language gate
  'https://commons.wikimedia.org/wiki/Special:FilePath/Galapagos2007--53--08-23-07.JPG?width=1280',
  'https://commons.wikimedia.org/wiki/Special:FilePath/Isla_de_San_Crist%C3%B3bal%2C_islas_Gal%C3%A1pagos%2C_Ecuador%2C_2015-07-24%2C_DD_88.JPG?width=1280',
  // Lugares
  'https://commons.wikimedia.org/wiki/Special:FilePath/La_Loberia.jpg?width=1280',
  'https://commons.wikimedia.org/wiki/Special:FilePath/Le%C3%B3n_Durmiente%2C_isla_de_San_Crist%C3%B3bal%2C_islas_Gal%C3%A1pagos%2C_Ecuador%2C_2015-07-25%2C_DD_08.JPG?width=1280',
  'https://commons.wikimedia.org/wiki/Special:FilePath/Piquero_patiazul_%28Sula_nebouxii%29%2C_Punta_Pitt%2C_isla_de_San_Crist%C3%B3bal%2C_islas_Gal%C3%A1pagos%2C_Ecuador%2C_2015-07-24%2C_DD_66.JPG?width=1280',
  'https://commons.wikimedia.org/wiki/Special:FilePath/Tortoise_nursery_in_Galapaguera_de_Cerro_Colorado%2C_Galapagos_Islands_2.JPG?width=1280',
  'https://commons.wikimedia.org/wiki/Special:FilePath/Galapagos2007--01--07-13-07.JPG?width=1280',
  'https://commons.wikimedia.org/wiki/Special:FilePath/Fragata_com%C3%BAn_%28Fregata_minor%29%2C_isla_de_San_Crist%C3%B3bal%2C_islas_Gal%C3%A1pagos%2C_Ecuador%2C_2015-07-24%2C_DD_93.JPG?width=1280'
];

// ── INSTALL: cachear el app shell ──────────────────────
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      // Cachear shell obligatorio
      return cache.addAll(SHELL).catch(function(err) {
        console.warn('[SW] No se pudo cachear algún archivo del shell:', err);
      });
    }).then(function() {
      // Cachear imágenes en segundo plano (sin bloquear la instalación)
      caches.open(IMG_CACHE).then(function(imgCache) {
        IMAGES.forEach(function(url) {
          fetch(url, { mode: 'no-cors' })
            .then(function(res) { imgCache.put(url, res); })
            .catch(function() { /* imagen no disponible, no bloquea */ });
        });
      });
      return self.skipWaiting();
    })
  );
});

// ── ACTIVATE: limpiar cachés viejas ───────────────────
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) {
          return k !== CACHE_NAME && k !== IMG_CACHE;
        }).map(function(k) {
          console.log('[SW] Eliminando caché vieja:', k);
          return caches.delete(k);
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ── FETCH: estrategia por tipo de recurso ─────────────
self.addEventListener('fetch', function(e) {
  var url = e.request.url;

  // Solo manejar GET
  if (e.request.method !== 'GET') return;

  // ── Imágenes: cache-first, con fallback a red ──
  if (url.includes('commons.wikimedia.org') ||
      url.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i)) {
    e.respondWith(
      caches.open(IMG_CACHE).then(function(cache) {
        return cache.match(e.request).then(function(cached) {
          if (cached) return cached;
          return fetch(e.request, { mode: 'no-cors' }).then(function(res) {
            // Guardar para la próxima vez
            cache.put(e.request, res.clone());
            return res;
          }).catch(function() {
            // Sin imagen y sin red → devolver respuesta vacía
            return new Response('', { status: 408 });
          });
        });
      })
    );
    return;
  }

  // ── Fuentes de Google: cache-first ──
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(e.request).then(function(cached) {
          if (cached) return cached;
          return fetch(e.request).then(function(res) {
            cache.put(e.request, res.clone());
            return res;
          }).catch(function() {
            return cached || new Response('', { status: 408 });
          });
        });
      })
    );
    return;
  }

  // ── HTML y archivos locales: cache-first, actualiza en background ──
  if (url.includes('san-cristobal') || url.endsWith('.html') || url.endsWith('manifest.json')) {
    e.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(e.request).then(function(cached) {
          var networkFetch = fetch(e.request).then(function(res) {
            if (res.ok) cache.put(e.request, res.clone());
            return res;
          }).catch(function() { return null; });

          // Devolver cache inmediatamente si existe, y actualizar en segundo plano
          return cached || networkFetch;
        });
      })
    );
    return;
  }

  // Todo lo demás: red normal con fallback a caché
  e.respondWith(
    fetch(e.request).catch(function() {
      return caches.match(e.request);
    })
  );
});
