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
import type { RoleName, ServiceMeta } from '../lib/types';

interface NotificationContextValue {
    unreadCount: number;
    messageUnreadCount: number;
    totalUnreadCount: number;
    unreadByRole: Partial<Record<RoleName, RoleUnreadSummary>>;
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

interface RoleUnreadSummary {
    messages: number;
    notifications: number;
    total: number;
}

interface NotificationSummaryResponse {
    data: { roles: Partial<Record<RoleName, RoleUnreadSummary>> };
}

interface ServiceMetaResponse {
    data: ServiceMeta;
}

export const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export function NotificationProvider({ children }: PropsWithChildren) {
    const { account, activeRole, isAuthenticated, token } = useAuth();
    const [unreadByRole, setUnreadByRole] = useState<Partial<Record<RoleName, RoleUnreadSummary>>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [pushPermission, setPushPermission] = useState<BrowserPushPermission>(getPushPermission());
    const [isPushEnabled, setIsPushEnabled] = useState(false);
    const [isPushLoading, setIsPushLoading] = useState(false);
    const [pushPublicKey, setPushPublicKey] = useState<string | null>(null);
    const [isPushConfigReady, setIsPushConfigReady] = useState(false);
    const pushConfigPromiseRef = useRef<Promise<string | null> | null>(null);

    const summarySequence = useRef(0);
    const notificationScope = `${account?.public_id}:${token}:${account?.roles.map(role => `${role.role}:${role.status}`).join(",")}`;
    const currentScope = useRef(notificationScope);
    currentScope.current = notificationScope;
    const [summaryScope, setSummaryScope] = useState(notificationScope);

    const refreshNotificationSummary = useCallback(async () => {
        if (!isAuthenticated || !token) {
            setUnreadByRole({});
            return;
        }

        const sequence = ++summarySequence.current;
        setIsLoading(true);

        try {
            const payload = await apiRequest<NotificationSummaryResponse>('/me/unread-summary', { token });

            if (currentScope.current !== notificationScope || sequence !== summarySequence.current) return;
            setSummaryScope(notificationScope);
            setUnreadByRole(payload.data.roles);
        } catch (error) {
            if (currentScope.current !== notificationScope || sequence !== summarySequence.current) return;
            if (error instanceof ApiError && [401, 403].includes(error.status)) {
                setUnreadByRole({});
            }
        } finally {
            if (sequence === summarySequence.current) setIsLoading(false);
        }
    }, [isAuthenticated, token, notificationScope]);

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
            throw new Error('この端末やブラウザではプッシュ通知を利用できません。');
        }

        if (!isAuthenticated || !token || !accountPublicId) {
            throw new Error('プッシュ通知を有効にするにはログインが必要です。');
        }

        setIsPushLoading(true);

        try {
            const publicKey = await loadPushConfig();

            if (!publicKey) {
                throw new Error('プッシュ通知のサーバ設定がまだ完了していません。');
            }

            const permission = await requestPushPermission();
            setPushPermission(permission);

            if (permission !== 'granted') {
                throw new Error(
                    permission === 'denied'
                        ? 'プッシュ通知が拒否されています。ブラウザまたは端末の設定から通知を許可してください。'
                        : 'プッシュ通知を有効にするには通知の許可が必要です。',
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
            setUnreadByRole({});
            setIsLoading(false);
            setIsPushEnabled(false);
            setPushPermission(getPushPermission());
            return;
        }

        void refreshNotificationSummary();
        void refreshPushSubscription();

        const intervalId = window.setInterval(() => {
            if (!document.hidden) void refreshNotificationSummary();
        }, 30_000);

        const handleFocus = () => {
            void refreshNotificationSummary();
            void refreshPushSubscription();
        };

        window.addEventListener('focus', handleFocus);
        const messageRead = () => { void refreshNotificationSummary(); };
        window.addEventListener('booking-message-summary:refresh', messageRead);
        const visible = () => { if (!document.hidden) void refreshNotificationSummary(); };
        document.addEventListener('visibilitychange', visible);

        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener('booking-message-summary:refresh', messageRead);
            document.removeEventListener('visibilitychange', visible);
        };
    }, [isAuthenticated, refreshNotificationSummary, refreshPushSubscription, token]);

    const visibleSummary = isAuthenticated && summaryScope === notificationScope ? unreadByRole : {};
    const currentUnread = activeRole ? visibleSummary[activeRole] : undefined;

    const value = useMemo<NotificationContextValue>(() => ({
        unreadCount: currentUnread?.notifications ?? 0,
        messageUnreadCount: currentUnread?.messages ?? 0,
        totalUnreadCount: currentUnread?.total ?? 0,
        unreadByRole: visibleSummary,
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
        currentUnread, visibleSummary,
    ]);

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    );
}
