/* Claude Fantasy works offline: every file is fetched fresh when there's a connection, and the last copy is kept for
   when there isn't (the crew's data stays locked in that copy too). */
const CACHE = 'claude-fantasy-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  // only this app's old copies: Claude Trade's mirror and PowerStats live on the same site (smarrano24.github.io)
  for (const k of await caches.keys()) if (k.startsWith('claude-fantasy-') && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const key = req.url.replace(/[?#].*$/, '');  // data.json?t=123 and data.json are one copy
    try {
      const res = await fetch(req);
      if (res.ok) (await caches.open(CACHE)).put(key, res.clone());
      return res;
    } catch (err) {
      const hit = await caches.match(key);
      if (hit) return hit;
      throw err;
    }
  })());
});

/* Notifications from the crew (fantasy/push.py): show each one, and open the right screen when it's tapped. */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Claude Fantasy', {
    body: d.body || '', tag: d.tag || undefined, data: { url: d.url || './' }, icon: 'icon-180.png', badge: 'icon-180.png' }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data || {}).url || './', self.registration.scope).href;
  e.waitUntil((async () => {
    for (const w of await clients.matchAll({ type: 'window', includeUncontrolled: true })) {
      if ('focus' in w) {
        await w.focus();
        return 'navigate' in w ? w.navigate(url) : undefined;
      }
    }
    return clients.openWindow(url);
  })());
});
