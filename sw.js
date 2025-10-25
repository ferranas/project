const CACHE_NAME = 'image-cropper-cache-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/index.tsx',
  '/icon.svg',
  '/manifest.json',
  'https://cdn.tailwindcss.com',
  'https://aistudiocdn.com/react@^19.2.0',
  'https://aistudiocdn.com/react-dom@^19.2.0/client.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        // Use addAll with a fetch that has cache-busting for external resources
        const cachePromises = urlsToCache.map(urlToCache => {
            const request = new Request(urlToCache, {cache: 'reload'});
            return fetch(request).then(response => {
                if (response.status === 200) {
                    return cache.put(urlToCache, response);
                }
                return Promise.resolve();
            }).catch(error => {
                console.error(`Failed to cache ${urlToCache}:`, error);
            });
        });
        return Promise.all(cachePromises);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request).then(
            (response) => {
              // Check if we received a valid response
              if(!response || response.status !== 200 || response.type !== 'basic' && response.type !== 'cors') {
                return response;
              }

              // IMPORTANT: Clone the response. A response is a stream
              // and because we want the browser to consume the response
              // as well as the cache consuming the response, we need
              // to clone it so we have two streams.
              const responseToCache = response.clone();

              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                });

              return response;
            }
          );
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});