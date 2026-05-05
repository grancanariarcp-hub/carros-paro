// public/sw.js
// Service Worker mínimo para Web Push.
// Recibe el evento `push` del navegador (lanzado cuando llega un mensaje
// del servidor de push del browser) y muestra una notificación nativa.
//
// El payload viene encriptado por la edge function send-push y el navegador
// ya lo descifra antes de entregárnoslo aquí. Lo recibimos como JSON.

self.addEventListener('install', (event) => {
  // Activar inmediatamente sin esperar a que se cierren las pestañas viejas
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    if (event.data) data = event.data.json()
  } catch (_) {
    try { data = { title: 'ÁSTOR', body: event.data?.text() || '' } } catch (_) { /* ignore */ }
  }

  const title = data.title || 'ÁSTOR'
  const opts = {
    body:  data.body  || '',
    icon:  '/icon-192.png',
    badge: '/icon-192.png',
    tag:   data.tag || 'astor',
    renotify: true,
    requireInteraction: data.severidad === 'critica',
    vibrate: data.severidad === 'critica' ? [200, 100, 200, 100, 200] : [100, 50, 100],
    data: { url: data.url || '/admin', alerta_id: data.alerta_id || null },
  }
  event.waitUntil(self.registration.showNotification(title, opts))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/admin'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      // Si ya hay una pestaña abierta con la app, la enfocamos y navegamos
      if ('focus' in c) {
        try {
          await c.focus()
          if ('navigate' in c) await c.navigate(url)
          return
        } catch (_) { /* ignore */ }
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(url)
  })())
})
