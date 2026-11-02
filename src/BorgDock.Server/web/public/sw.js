// Dispatch service worker: shows push notifications and opens the item they are about. No offline cache:
// stale work data would be worse than an error.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  const message = event.data ? event.data.json() : { title: 'Dispatch', body: '' };
  event.waitUntil(self.registration.showNotification(message.title, {
    body: message.body,
    tag: message.tag,
    data: message.data,
    icon: '/icon-192.png',
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const itemId = event.notification.data && event.notification.data.itemId;
  const url = itemId ? `/?item=${itemId}` : '/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    for (const w of windows) {
      if ('focus' in w) {
        w.navigate(url);
        return w.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
