import {
    createContext,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type PropsWithChildren,
} from 'react';
import { useAuth } from '../hooks/useAuth';
import { ApiError, apiRequest } from '../lib/api';
import {
    clearPushOptOut,
    ensureBrowserPushSubscription,
    getPushPermission,
    isPushOptedOut,
    isWebPushSupported,
    requestPushPermission,
    syncPushSubscriptionToServer,
    unsubscribeBrowserPushSubscription,
    type BrowserPushPermission,
} from '../lib/push';
import type { AppNotificationRecord, NotificationListMeta, ServiceMeta } from '../lib/types';

interface NotificationContextValue {
    unreadCount: number;
    isLoading: boolean;
    refreshNotificationSummary: () => Promise<void>;
    isPushSupported: boolean;
    pushPermission: BrowserPushPermission;
    isPushEnabled: boolean;
    isPushLoading: boolean;
    isPushConfigReady: boolean;
    isPushConfigured: boolean;
    enablePushNotifications: () => Promise<void>;
    disablePushNotifications: () => Promise<void>;
    refreshPushSubscription: () => Promise<void>;
}

interface NotificationSummaryResponse {
    data: AppNotificationRecord[];
    meta?: NotificationListMeta;
}

interface ServiceMetaResponse {
    data: ServiceMeta;
}

export const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export function NotificationProvider({ children }: PropsWithChildren) {
    const { account, isAuthenticated, token } = useAuth();
    const [unreadCount, setUnreadCount] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [pushPermission, setPushPermission] = useState<BrowserPushPermission>(getPushPermission());
    const [isPushEnabled, setIsPushEnabled] = useState(false);
    const [isPushLoading, setIsPushLoading] = useState(false);
    const [pushPublicKey, setPushPublicKey] = useState<string | null>(null);
    const [isPushConfigReady, setIsPushConfigReady] = useState(false);
    const pushConfigPromiseRef = useRef<Promise<string | null> | null>(null);

    const refreshNotificationSummary = useCallback(async () => {
        if (!isAuthenticated || !token) {
            setUnreadCount(0);
            return;
        }

        setIsLoading(true);

        try {
            const payload = await apiRequest<NotificationSummaryResponse>('/notifications?limit=1', { token });

            setUnreadCount(payload.meta?.unread_count ?? 0);
        } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
                setUnreadCount(0);
            }
        } finally {
            setIsLoading(false);
        }
    }, [isAuthenticated, token]);

    const loadPushConfig = useCallback(async (): Promise<string | null> => {
        if (isPushConfigReady) {
            return pushPublicKey;
        }

        if (!pushConfigPromiseRef.current) {
            pushConfigPromiseRef.current = apiRequest<ServiceMetaResponse>('/service-meta')
                .then((payload) => {
                    const publicKey = payload.data.push?.web_push_public_key ?? null;
                    setPushPublicKey(publicKey);
                    setIsPushConfigReady(true);

                    return publicKey;
                })
                .catch(() => {
                    setPushPublicKey(null);
                    setIsPushConfigReady(true);

                    return null;
                })
                .finally(() => {
                    pushConfigPromiseRef.current = null;
                });
        }

        return pushConfigPromiseRef.current;
    }, [isPushConfigReady, pushPublicKey]);

    const refreshPushSubscription = useCallback(async () => {
        const supported = isWebPushSupported();
        const permission = getPushPermission();
        const accountPublicId = account?.public_id ?? null;
        const optedOut = isPushOptedOut(accountPublicId);

        setPushPermission(permission);

        if (!supported) {
            setIsPushEnabled(false);
            return;
        }

        if (!isAuthenticated || !token || !accountPublicId) {
            setIsPushEnabled(false);
            return;
        }

        const publicKey = await loadPushConfig();

        if (!publicKey || permission !== 'granted' || optedOut) {
            if (optedOut) {
                await unsubscribeBrowserPushSubscription(token, accountPublicId, { rememberOptOut: true });
            }

            setIsPushEnabled(false);
            return;
        }

        try {
            const subscription = await ensureBrowserPushSubscription(publicKey);
            await syncPushSubscriptionToServer(token, subscription);
            setIsPushEnabled(true);
        } catch {
            setIsPushEnabled(false);
        }
    }, [account?.public_id, isAuthenticated, loadPushConfig, token]);

    const enablePushNotifications = useCallback(async () => {
        const accountPublicId = account?.public_id ?? null;

        if (!isWebPushSupported()) {
            throw new Error('この端末やブラウザでは Push 通知を利用できません。');
        }

        if (!isAuthenticated || !token || !accountPublicId) {
            throw new Error('Push通知を有効にするにはログインが必要です。');
        }

        setIsPushLoading(true);

        try {
            const publicKey = await loadPushConfig();

            if (!publicKey) {
                throw new Error('Push通知のサーバ設定がまだ完了していません。');
            }

            const permission = await requestPushPermission();
            setPushPermission(permission);

            if (permission !== 'granted') {
                throw new Error(
                    permission === 'denied'
                        ? 'Push通知が拒否されています。ブラウザまたは端末の設定から通知を許可してください。'
                        : 'Push通知を有効にするには通知の許可が必要です。',
                );
            }

            clearPushOptOut(accountPublicId);

            const subscription = await ensureBrowserPushSubscription(publicKey);
            await syncPushSubscriptionToServer(token, subscription);
            setIsPushEnabled(true);
        } finally {
            setIsPushLoading(false);
        }
    }, [account?.public_id, isAuthenticated, loadPushConfig, token]);

    const disablePushNotifications = useCallback(async () => {
        const accountPublicId = account?.public_id ?? null;

        if (!isAuthenticated || !token || !accountPublicId) {
            setIsPushEnabled(false);
            setPushPermission(getPushPermission());
            return;
        }

        setIsPushLoading(true);

        try {
            await unsubscribeBrowserPushSubscription(token, accountPublicId, { rememberOptOut: true });
            setIsPushEnabled(false);
            setPushPermission(getPushPermission());
        } finally {
            setIsPushLoading(false);
        }
    }, [account?.public_id, isAuthenticated, token]);

    useEffect(() => {
        if (!isAuthenticated || !token) {
            setUnreadCount(0);
            setIsLoading(false);
            setIsPushEnabled(false);
            setPushPermission(getPushPermission());
            return;
        }

        void refreshNotificationSummary();
        void refreshPushSubscription();

        const intervalId = window.setInterval(() => {
            void refreshNotificationSummary();
        }, 60_000);

        const handleFocus = () => {
            void refreshNotificationSummary();
            void refreshPushSubscription();
        };

        window.addEventListener('focus', handleFocus);

        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener('focus', handleFocus);
        };
    }, [isAuthenticated, refreshNotificationSummary, refreshPushSubscription, token]);

    const value = useMemo<NotificationContextValue>(() => ({
        unreadCount,
        isLoading,
        refreshNotificationSummary,
        isPushSupported: isWebPushSupported(),
        pushPermission,
        isPushEnabled,
        isPushLoading,
        isPushConfigReady,
        isPushConfigured: Boolean(pushPublicKey),
        enablePushNotifications,
        disablePushNotifications,
        refreshPushSubscription,
    }), [
        disablePushNotifications,
        enablePushNotifications,
        isLoading,
        isPushConfigReady,
        pushPublicKey,
        isPushEnabled,
        isPushLoading,
        pushPermission,
        refreshNotificationSummary,
        refreshPushSubscription,
        unreadCount,
    ]);

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    );
}
