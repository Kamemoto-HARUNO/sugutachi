import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest } from '../lib/api';
import { formatJstDateTime } from '../lib/datetime';
import {
    buildNotificationPreview,
    formatNotificationTypeLabel,
    formatNotificationRoleLabel,
    notificationRoleBadgeClass,
    notificationRoleCardClass,
    resolveNotificationRole,
    resolveNotificationPath,
} from '../lib/notifications';
import type { ApiEnvelope, AppNotificationRecord, NotificationListMeta } from '../lib/types';

type ReadFilter = 'all' | 'unread';
type RoleFilter = 'all' | 'user' | 'therapist' | 'admin';

function filterButtonClass(isActive: boolean, tone: 'dark' | 'role' = 'dark'): string {
    return [
        'rounded-full px-4 py-2 text-sm font-semibold transition',
        isActive
            ? tone === 'role'
                ? 'bg-[#d2b179] text-[#17202b]'
                : 'bg-[#17202b] text-white'
            : 'bg-[#f4ede3] text-[#516072] hover:bg-[#eadfce]',
    ].join(' ');
}

export function NotificationsPage() {
    const { account, activeRole, token } = useAuth();
    const {
        disablePushNotifications,
        enablePushNotifications,
        isPushConfigReady,
        isPushConfigured,
        isPushEnabled,
        isPushLoading,
        isPushSupported,
        pushPermission,
        refreshNotificationSummary,
        refreshPushSubscription,
    } = useNotifications();
    const [notifications, setNotifications] = useState<AppNotificationRecord[]>([]);
    const [meta, setMeta] = useState<NotificationListMeta | null>(null);
    const [readFilter, setReadFilter] = useState<ReadFilter>('all');
    const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
    const [markingId, setMarkingId] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    usePageTitle('通知一覧');
    useToastOnMessage(error, 'error');
    useToastOnMessage(successMessage, 'success');

    const loadNotifications = useCallback(async (refresh = false) => {
        if (!token) {
            return;
        }

        if (refresh) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }

        try {
            const query = readFilter === 'unread'
                ? '/notifications?limit=100&read_status=unread'
                : '/notifications?limit=100';

            const payload = await apiRequest<{ data: AppNotificationRecord[]; meta?: NotificationListMeta }>(query, { token });

            setNotifications(payload.data);
            setMeta(payload.meta ?? null);
            setError(null);
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '通知の取得に失敗しました。';

            setError(message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [readFilter, token]);

    useEffect(() => {
        void loadNotifications();
    }, [loadNotifications]);

    const pushSummary = useMemo(() => {
        if (!isPushSupported) {
            return 'この端末やブラウザでは Push 通知を利用できません。通知一覧で最新状況をご確認ください。';
        }

        if (isPushConfigReady && !isPushConfigured) {
            return 'Push通知のサーバ設定はまだ準備中です。設定が完了するまで、最新状況はこの通知一覧でご確認ください。';
        }

        if (pushPermission === 'denied') {
            return 'Push通知はブラウザまたは端末側で拒否されています。設定画面から通知を許可すると有効にできます。';
        }

        if (isPushConfigReady && !isPushEnabled && pushPermission === 'default') {
            return 'Push通知を有効にすると、予約進行や運営からのお知らせをホーム画面の PWA にも届けられます。';
        }

        if (isPushEnabled) {
            return 'Push通知は有効です。アプリを閉じていても、予約やお知らせの更新を受け取れます。';
        }

        return 'Push通知は現在オフです。必要な更新だけを端末へ受け取りたいときに有効化できます。';
    }, [isPushConfigReady, isPushConfigured, isPushEnabled, isPushSupported, pushPermission]);

    const unreadCount = meta?.unread_count ?? notifications.filter((notification) => !notification.is_read).length;

    const visibleNotifications = useMemo(() => (
        notifications.filter((notification) => (
            roleFilter === 'all' || resolveNotificationRole(notification) === roleFilter
        ))
    ), [notifications, roleFilter]);

    const pageSummary = useMemo(() => {
        if (notifications.length === 0) {
            return readFilter === 'unread' ? '未読の通知はありません。' : '新しい通知はありません。';
        }

        const roleSummary = roleFilter === 'all'
            ? ''
            : `${formatNotificationRoleLabel(roleFilter)}向けの`;

        if (visibleNotifications.length === 0) {
            return `${roleSummary}通知は見つかりませんでした。`;
        }

        if (readFilter === 'unread') {
            return `${roleSummary}未読 ${visibleNotifications.length}件を表示しています。`;
        }

        return `${roleSummary}未読 ${unreadCount}件を含む最新 ${visibleNotifications.length}件を表示しています。`;
    }, [notifications.length, readFilter, roleFilter, unreadCount, visibleNotifications.length]);

    async function markNotificationRead(notification: AppNotificationRecord) {
        if (!token || notification.is_read) {
            return;
        }

        setMarkingId(notification.id);

        try {
            await apiRequest<ApiEnvelope<AppNotificationRecord>>(`/notifications/${notification.id}/read`, {
                method: 'POST',
                token,
            });

            setNotifications((current) => {
                const nextItems = current.map((item) => (
                    item.id === notification.id
                        ? {
                            ...item,
                            is_read: true,
                            status: 'read',
                            read_at: new Date().toISOString(),
                        }
                        : item
                ));

                return readFilter === 'unread'
                    ? nextItems.filter((item) => !item.is_read)
                    : nextItems;
            });
            setMeta((current) => current ? { ...current, unread_count: Math.max(0, current.unread_count - 1) } : current);
            await refreshNotificationSummary();
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '通知の既読更新に失敗しました。';

            setError(message);
        } finally {
            setMarkingId(null);
        }
    }

    async function markAllRead() {
        if (!token || unreadCount === 0) {
            return;
        }

        setIsMarkingAllRead(true);

        try {
            await apiRequest<{ data: { updated_count: number; unread_count: number } }>('/notifications/read-all', {
                method: 'POST',
                token,
            });

            setNotifications((current) => readFilter === 'unread'
                ? []
                : current.map((item) => ({
                    ...item,
                    is_read: true,
                    status: 'read',
                    read_at: item.read_at ?? new Date().toISOString(),
                })));
            setMeta((current) => current ? { ...current, unread_count: 0 } : current);
            setSuccessMessage('通知をすべて既読にしました。');
            await refreshNotificationSummary();
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '通知の一括既読に失敗しました。';

            setError(message);
        } finally {
            setIsMarkingAllRead(false);
        }
    }

    async function handleEnablePush() {
        try {
            setError(null);
            setSuccessMessage(null);
            await enablePushNotifications();
            await refreshPushSubscription();
            setSuccessMessage('Push通知を有効にしました。');
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : 'Push通知の有効化に失敗しました。');
        }
    }

    async function handleDisablePush() {
        try {
            setError(null);
            setSuccessMessage(null);
            await disablePushNotifications();
            setSuccessMessage('Push通知を停止しました。');
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : 'Push通知の停止に失敗しました。');
        }
    }

    if (isLoading) {
        return <LoadingScreen title="通知を読み込み中" message="未読件数と最新の通知をまとめています。" />;
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[32px] border border-white/10 bg-[linear-gradient(120deg,rgba(23,32,43,0.96)_0%,rgba(31,45,61,0.94)_100%)] p-6 text-white shadow-[0_26px_60px_rgba(15,23,42,0.22)] sm:p-7">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-3">
                        <span className="text-xs font-semibold tracking-[0.18em] text-[#e8d5b2]">通知センター</span>
                        <div className="space-y-2">
                            <h1 className="text-[2rem] font-semibold leading-[1.4] text-white sm:text-[2.3rem]">通知一覧</h1>
                            <p className="max-w-3xl text-sm leading-7 text-slate-300">
                                利用者・タチキャスト・運営の役割に関係なく、このアカウントに届いた通知をまとめて確認できます。
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm font-semibold text-slate-100">
                            未読 {unreadCount}件
                        </span>
                        <button
                            type="button"
                            onClick={() => {
                                void loadNotifications(true);
                            }}
                            disabled={isRefreshing}
                            className="rounded-full border border-white/12 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isRefreshing ? '更新中...' : '最新に更新'}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                void markAllRead();
                            }}
                            disabled={isMarkingAllRead || unreadCount === 0}
                            className="rounded-full bg-[#e8d5b2] px-4 py-2 text-sm font-semibold text-[#17202b] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isMarkingAllRead ? '既読にしています...' : 'すべて既読'}
                        </button>
                    </div>
                </div>
            </section>

            <section className="rounded-[32px] border border-[#e7dccd] bg-[#fffaf2] p-5 shadow-[0_18px_40px_rgba(23,32,43,0.06)] sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold tracking-[0.14em] text-[#8f7a58]">PWA の Push 通知</span>
                            <span
                                className={[
                                    'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
                                    isPushEnabled
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-[#f1e4cf] text-[#8f7a58]',
                                ].join(' ')}
                            >
                                {isPushEnabled ? '有効' : 'オフ'}
                            </span>
                        </div>
                        <p className="max-w-3xl text-sm leading-7 text-[#516072]">{pushSummary}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {isPushEnabled ? (
                            <button
                                type="button"
                                onClick={() => {
                                    void handleDisablePush();
                                }}
                                disabled={isPushLoading}
                                className="rounded-full border border-[#d8c7ae] px-4 py-2 text-sm font-semibold text-[#17202b] transition hover:bg-[#f1e4cf] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isPushLoading ? '停止しています...' : 'Push通知を停止'}
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => {
                                    void handleEnablePush();
                                }}
                                disabled={isPushLoading || !isPushSupported || (isPushConfigReady && !isPushConfigured)}
                                className="rounded-full bg-[#17202b] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isPushLoading ? '有効化しています...' : 'Push通知を有効にする'}
                            </button>
                        )}
                    </div>
                </div>
            </section>

            <section className="rounded-[32px] border border-[#e7dccd] bg-[#f7f2e8] p-5 shadow-[0_18px_40px_rgba(23,32,43,0.06)] sm:p-6">
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex flex-col gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-semibold tracking-[0.14em] text-[#8f7a58]">表示条件</span>
                                <button type="button" onClick={() => setReadFilter('all')} className={filterButtonClass(readFilter === 'all')}>
                                    すべて
                                </button>
                                <button type="button" onClick={() => setReadFilter('unread')} className={filterButtonClass(readFilter === 'unread')}>
                                    未読のみ
                                </button>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-semibold tracking-[0.14em] text-[#8f7a58]">対象ロール</span>
                                <button type="button" onClick={() => setRoleFilter('all')} className={filterButtonClass(roleFilter === 'all', 'role')}>
                                    すべて
                                </button>
                                <button type="button" onClick={() => setRoleFilter('user')} className={filterButtonClass(roleFilter === 'user', 'role')}>
                                    利用者
                                </button>
                                <button type="button" onClick={() => setRoleFilter('therapist')} className={filterButtonClass(roleFilter === 'therapist', 'role')}>
                                    タチキャスト
                                </button>
                                <button type="button" onClick={() => setRoleFilter('admin')} className={filterButtonClass(roleFilter === 'admin', 'role')}>
                                    運営
                                </button>
                            </div>
                        </div>
                        <p className="text-sm text-[#5b6879]">{pageSummary}</p>
                    </div>
                </div>
            </section>

            {visibleNotifications.length === 0 ? (
                <section className="rounded-[32px] border border-dashed border-[#d9cbb6] bg-white/75 p-8 text-center shadow-[0_16px_35px_rgba(23,32,43,0.04)]">
                    <h2 className="text-lg font-semibold text-[#17202b]">表示できる通知はありません</h2>
                    <p className="mt-3 text-sm leading-7 text-[#5b6879]">
                        {notifications.length === 0
                            ? '予約の進行、公開条件の更新、返金結果などの通知はここにまとまります。'
                            : '現在の絞り込み条件に一致する通知はありません。'}
                    </p>
                </section>
            ) : (
                <section className="space-y-4">
                    {visibleNotifications.map((notification) => {
                        const targetPath = resolveNotificationPath(notification, account, activeRole);
                        const notificationRole = resolveNotificationRole(notification);
                        const content = (
                            <div className={['rounded-[28px] border p-5 transition', notificationRoleCardClass(notificationRole, notification.is_read)].join(' ')}>
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="space-y-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={['rounded-full px-3 py-1 text-xs font-semibold', notificationRoleBadgeClass(notificationRole)].join(' ')}>
                                                {formatNotificationRoleLabel(notificationRole)}
                                            </span>
                                            <span className="rounded-full bg-[#17202b] px-3 py-1 text-xs font-semibold text-white">
                                                {formatNotificationTypeLabel(notification.notification_type)}
                                            </span>
                                            {notification.is_read ? (
                                                <span className="rounded-full bg-[#ebe5db] px-3 py-1 text-xs font-semibold text-[#64748b]">
                                                    既読
                                                </span>
                                            ) : (
                                                <span className="rounded-full bg-[#fde8e2] px-3 py-1 text-xs font-semibold text-[#b44d3a]">
                                                    未読
                                                </span>
                                            )}
                                        </div>
                                        <div className="space-y-2">
                                            <h2 className="text-lg font-semibold text-[#17202b]">{notification.title}</h2>
                                            <p className="text-sm leading-7 text-[#516072]">{buildNotificationPreview(notification)}</p>
                                        </div>
                                    </div>

                                    <div className="flex flex-col items-start gap-3 lg:items-end">
                                        <span className="text-xs font-medium text-[#7b8794]">
                                            {formatJstDateTime(notification.sent_at ?? notification.created_at, {
                                                year: 'numeric',
                                                month: 'numeric',
                                                day: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            }) ?? '時刻不明'}
                                        </span>
                                        <div className="flex flex-wrap gap-2">
                                            {!notification.is_read ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        void markNotificationRead(notification);
                                                    }}
                                                    disabled={markingId === notification.id}
                                                    className="rounded-full border border-[#d7ccb9] px-4 py-2 text-sm font-semibold text-[#3c4b5d] transition hover:bg-[#efe5d7] disabled:cursor-not-allowed disabled:opacity-60"
                                                >
                                                    {markingId === notification.id ? '既読中...' : '既読にする'}
                                                </button>
                                            ) : null}
                                            {targetPath ? (
                                                <Link
                                                    to={targetPath}
                                                    onClick={() => {
                                                        void markNotificationRead(notification);
                                                    }}
                                                    className="rounded-full bg-[#17202b] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#223248]"
                                                >
                                                    詳細を開く
                                                </Link>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );

                        return <div key={notification.id}>{content}</div>;
                    })}
                </section>
            )}
        </div>
    );
}
