self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  event.waitUntil(self.registration.showNotification(data.title || 'Notification', {
    body: data.body || '',
    data: { linkPath: data.linkPath || '/notifications' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = event.notification.data && event.notification.data.linkPath
  event.waitUntil(self.clients.openWindow(path || '/notifications'))
})
