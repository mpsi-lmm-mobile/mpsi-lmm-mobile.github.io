const STATIC_CACHE = 'pwa-static-v1';
const DYNAMIC_CACHE = 'pwa-dynamic-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/offline.html'
];

// Cache statique à l'installation
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[Service Worker] Caching static assets');
        return cache.addAll(urlsToCache);
      })
  );
});

// Nettoyage des anciens caches à l'activation
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
          .map(name => caches.delete(name))
      )
    )
  );
});

// Intercepter les requêtes
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(res => {
        return caches.open(DYNAMIC_CACHE).then(cache => {
          // Mise en cache dynamique
          cache.put(event.request.url, res.clone());
          return res;
        });
      })
      .catch(() => {
        // Si fetch échoue (hors ligne), on regarde dans le cache
        return caches.match(event.request)
          .then(cachedResponse => {
            return cachedResponse || caches.match('/offline.html');
          });
      })
  );
});




// Fonction pour scanner le cache et obtenir les URLs des PDFs
async function getPdfUrlsFromCache() {
  const cacheNames = await caches.keys();
  let pdfUrls = [];

  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();

    for (const request of keys) {
      if (request.url.endsWith('.pdf')) {
        pdfUrls.push(request.url);
      }
    }
  }

  return pdfUrls;
}

// Fonction pour supprimer les fichiers PDF du cache
async function deletePdfsFromCache(pdfUrls) {
  for (const cacheName of await caches.keys()) {
    const cache = await caches.open(cacheName);
    for (const url of pdfUrls) {
      await cache.delete(url);
    }
  }
}

// Fonction pour retélécharger les fichiers PDF et les remettre dans le cache
async function reDownloadPdfs(pdfUrls) {
  const cache = await caches.open(DYNAMIC_CACHE);
  for (const url of pdfUrls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        await cache.put(url, response.clone());
      }
    } catch (error) {
      console.error(`Failed to fetch and cache ${url}:`, error);
    }
  }
}

// Fonction principale pour mettre à jour les PDFs dans le cache
async function updatePdfsInCache() {
  try {
    const pdfUrls = await getPdfUrlsFromCache();
    await deletePdfsFromCache(pdfUrls);
    await reDownloadPdfs(pdfUrls);
    console.log('PDFs have been updated in the cache.');
  } catch (error) {
    console.error('Error updating PDFs in cache:', error);
  }
}

// Écouter les messages du client
self.addEventListener('message', async event => {
  if (event.data.action === 'updatePdfs') {
    try {
      const pdfUrls = await getPdfUrlsFromCache();
      await deletePdfsFromCache(pdfUrls);
      await reDownloadPdfs(pdfUrls);
      event.source.postMessage({ success: true, message: 'PDFs have been updated in the cache.' });
    } catch (error) {
      event.source.postMessage({ success: false, message: 'Error updating PDFs in cache: ' + error });
    }
  }
});
