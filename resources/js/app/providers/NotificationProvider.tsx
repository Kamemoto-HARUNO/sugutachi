import {
    createContext,
    useCallback,
    useEffect,
    useMemo,
    useState,
    type PropsWithChildren,
} from 'react';
import { useAuth } from '../hooks/useAuth';
import { ApiError, apiRequest } from '../lib/api';
import type { AppNotificationRecord, NotificationListMeta } from '../lib/types';

interface NotificationContextValue {
    unreadCount: number;
    isLoading: boolean;
    refreshNotificationSummary: () => Promise<void>;
}

interface NotificationSummaryResponse {
    data: AppNotificationRecord[];
    meta?: NotificationListMeta;
}

export const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export function NotificationProvider({ children }: PropsWithChildren) {
    const { isAuthenticated, token } = useAuth();
    const [unreadCount, setUnreadCount] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

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

    useEffect(() => {
        if (!isAuthenticated || !token) {
            setUnreadCount(0);
            setIsLoading(false);
            return;
        }

        void refreshNotificationSummary();

        const intervalId = window.setInterval(() => {
            void refreshNotificationSummary();
        }, 60_000);

        const handleFocus = () => {
            void refreshNotificationSummary();
        };

        window.addEventListener('focus', handleFocus);

        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener('focus', handleFocus);
        };
    }, [isAuthenticated, refreshNotificationSummary, token]);

    const value = useMemo<NotificationContextValue>(() => ({
        unreadCount,
        isLoading,
        refreshNotificationSummary,
    }), [isLoading, refreshNotificationSummary, unreadCount]);

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    );
}
