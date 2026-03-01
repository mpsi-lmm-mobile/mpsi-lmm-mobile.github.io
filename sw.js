const STATIC_CACHE = 'pwa-static-v3.1';
const DYNAMIC_CACHE = 'pwa-dynamic-v3.1';
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




 

// --- Fonctions de gestion du cache corrigées ---

/**
 * 💾 Fonction pour scanner TOUS les caches et obtenir les informations des PDFs.
 * Retourne : [{ url: string, cacheName: string }, ...]
 */
async function getPdfInfoFromCache() {
  const cacheNames = await caches.keys();
  let pdfInfo = [];

  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();

    for (const request of keys) {
      if (request.url.endsWith('.pdf')) {
        // IMPORTANT : On enregistre l'URL ET le nom du cache où il a été trouvé
        pdfInfo.push({ url: request.url, cacheName: cacheName });
      }
    }
  }

  return pdfInfo;
}

/**
 * 🗑️ Fonction pour supprimer les fichiers PDF des caches spécifiques.
 */
async function deletePdfsFromCache(pdfInfo) {
  // pdfInfo est une liste d'objets { url, cacheName }
  for (const item of pdfInfo) {
    // On ouvre SEULEMENT le cache qui contient l'élément
    try {
      const cache = await caches.open(item.cacheName);
      const deleted = await cache.delete(item.url);
      if (deleted) {
        console.log(`Successfully deleted old PDF: ${item.url} from ${item.cacheName}`);
      }
    } catch (error) {
      console.error(`Failed to delete cache item ${item.url} from ${item.cacheName}:`, error);
    }
  }
}

/**
 * 🔄 Fonction pour retélécharger les fichiers PDF et les remettre dans le cache DYNAMIQUE.
 */
async function reDownloadPdfs(pdfUrls) {
  // Ouvre le cache où les nouvelles versions doivent être stockées
  const cache = await caches.open(DYNAMIC_CACHE);
  
  for (const url of pdfUrls) {
    try {
      // Pour éviter les versions périmées, on ajoute un paramètre de requête pour contourner le cache HTTP
      const response = await fetch(url, { cache: 'no-cache' }); 
      
      if (response.ok) {
        await cache.put(url, response.clone());
        console.log(`Successfully re-cached new PDF version: ${url}`);
      } else {
        console.warn(`Failed to fetch new PDF ${url}. Status: ${response.status}`);
      }
    } catch (error) {
      console.error(`Failed to fetch and cache ${url}:`, error);
    }
  }
}

// --- Listener principal du Service Worker (écoute des messages du client) ---

self.addEventListener('message', async event => {
  if (event.data.action === 'updatePdfs') {
    try {
      // 1. Récupérer les informations complètes (URL et CacheName)
      const pdfInfo = await getPdfInfoFromCache();
      
      // 2. Extraire la liste des URLs à retélécharger
      const pdfUrlsToUpdate = pdfInfo.map(info => info.url);

      if (pdfUrlsToUpdate.length === 0) {
        event.source.postMessage({ success: true, message: 'No PDFs found to update in cache.' });
        return;
      }
      
      // 3. Supprimer les anciennes versions de leur cache respectif
      await deletePdfsFromCache(pdfInfo);
      
      // 4. Télécharger et mettre en cache les nouvelles versions (dans DYNAMIC_CACHE)
      await reDownloadPdfs(pdfUrlsToUpdate);
      
      event.source.postMessage({ success: true, message: 'PDFs have been successfully updated in the cache.' });
    } catch (error) {
      console.error('Fatal error updating PDFs in cache:', error);
      event.source.postMessage({ success: false, message: 'Error updating PDFs in cache: ' + error });
    }
  }
});
