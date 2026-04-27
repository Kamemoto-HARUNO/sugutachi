self.addEventListener('push', (event) => {
    if (!event.data) {
        return;
    }

    let payload = {};

    try {
        payload = event.data.json();
    } catch (_error) {
        payload = {
            title: '新しい通知があります',
            body: event.data.text(),
            data: {
                target_path: '/notifications',
            },
        };
    }

    const title = payload.title || '新しい通知があります';
    const options = {
        body: payload.body || '通知センターで内容をご確認ください。',
        icon: payload.icon || '/apple-touch-icon.png',
        badge: payload.badge || '/apple-touch-icon.png',
        tag: payload.tag || undefined,
        renotify: Boolean(payload.renotify),
        data: payload.data || { target_path: '/notifications' },
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const targetPath = event.notification.data?.target_path || '/notifications';
    const targetUrl = new URL(targetPath, self.location.origin).toString();

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client && client.url.startsWith(self.location.origin)) {
                    if ('navigate' in client) {
                        return client.navigate(targetUrl).then(() => client.focus());
                    }

                    return client.focus();
                }
            }

            if (self.clients.openWindow) {
                return self.clients.openWindow(targetUrl);
            }

            return undefined;
        }),
    );
});
