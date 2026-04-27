import { apiRequest } from './api';

export type BrowserPushPermission = NotificationPermission | 'unsupported';

const SERVICE_WORKER_URL = '/service-worker.js';
const PUSH_OPT_OUT_STORAGE_PREFIX = 'sugutachi.push-optout:';

export function isWebPushSupported(): boolean {
    return typeof window !== 'undefined'
        && window.isSecureContext
        && 'Notification' in window
        && 'serviceWorker' in navigator
        && 'PushManager' in window;
}

export function getPushPermission(): BrowserPushPermission {
    if (!isWebPushSupported()) {
        return 'unsupported';
    }

    return Notification.permission;
}

export async function requestPushPermission(): Promise<BrowserPushPermission> {
    if (!isWebPushSupported()) {
        return 'unsupported';
    }

    return Notification.requestPermission();
}

export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!isWebPushSupported()) {
        return null;
    }

    const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/' });

    return navigator.serviceWorker.ready.then(() => registration);
}

export async function getBrowserPushSubscription(): Promise<PushSubscription | null> {
    const registration = await registerPushServiceWorker();

    if (!registration) {
        return null;
    }

    return registration.pushManager.getSubscription();
}

export async function ensureBrowserPushSubscription(vapidPublicKey: string): Promise<PushSubscription> {
    const registration = await registerPushServiceWorker();

    if (!registration) {
        throw new Error('このブラウザではPush通知を利用できません。');
    }

    const existing = await registration.pushManager.getSubscription();

    if (existing) {
        return existing;
    }

    return registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    });
}

export async function syncPushSubscriptionToServer(token: string, subscription: PushSubscription): Promise<void> {
    const payload = serializePushSubscription(subscription);

    await apiRequest('/push-subscriptions', {
        method: 'POST',
        token,
        body: {
            ...payload,
            permission_status: 'granted',
        },
    });
}

export async function revokePushSubscriptionOnServer(token: string, endpoint: string): Promise<void> {
    await apiRequest('/push-subscriptions/current', {
        method: 'DELETE',
        token,
        body: { endpoint },
    });
}

export async function unsubscribeBrowserPushSubscription(
    token: string | null,
    accountPublicId: string | null | undefined,
    options?: { rememberOptOut?: boolean },
): Promise<void> {
    const subscription = await getBrowserPushSubscription();

    if (subscription && token) {
        try {
            await revokePushSubscriptionOnServer(token, subscription.endpoint);
        } catch {
            // best effort
        }
    }

    if (subscription) {
        try {
            await subscription.unsubscribe();
        } catch {
            // best effort
        }
    }

    if (accountPublicId && options?.rememberOptOut) {
        window.localStorage.setItem(pushOptOutStorageKey(accountPublicId), '1');
    }
}

export function clearPushOptOut(accountPublicId: string | null | undefined): void {
    if (!accountPublicId) {
        return;
    }

    window.localStorage.removeItem(pushOptOutStorageKey(accountPublicId));
}

export function isPushOptedOut(accountPublicId: string | null | undefined): boolean {
    if (!accountPublicId) {
        return false;
    }

    return window.localStorage.getItem(pushOptOutStorageKey(accountPublicId)) === '1';
}

function serializePushSubscription(subscription: PushSubscription): { endpoint: string; keys: { p256dh: string; auth: string } } {
    const payload = subscription.toJSON();

    if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys?.auth) {
        throw new Error('Push通知の購読情報を取得できませんでした。');
    }

    return {
        endpoint: payload.endpoint,
        keys: {
            p256dh: payload.keys.p256dh,
            auth: payload.keys.auth,
        },
    };
}

function pushOptOutStorageKey(accountPublicId: string): string {
    return `${PUSH_OPT_OUT_STORAGE_PREFIX}${accountPublicId}`;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let index = 0; index < rawData.length; index += 1) {
        outputArray[index] = rawData.charCodeAt(index);
    }

    return outputArray;
}
