import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { ApiError, apiRequest, unwrapData } from '../../lib/api';
import { formatJstDateTime } from '../../lib/datetime';
import type {
    ApiEnvelope,
    BookingListRecord,
    TherapistBookingRequestRecord,
} from '../../lib/types';

const REFRESH_INTERVAL_MS = 30_000;
const MAX_VISIBLE_ITEMS = 2;

const USER_TRACKED_STATUSES = new Set([
    'payment_authorizing',
    'requested',
    'accepted',
    'moving',
    'arrived',
    'in_progress',
    'therapist_completed',
]);

const THERAPIST_ACTIVE_STATUSES = new Set([
    'accepted',
    'moving',
    'arrived',
    'in_progress',
    'therapist_completed',
]);

const WAITING_STATUSES = new Set(['payment_authorizing', 'requested']);

const STATUS_PRIORITY: Record<string, number> = {
    in_progress: 0,
    arrived: 1,
    moving: 2,
    therapist_completed: 3,
    accepted: 4,
    payment_authorizing: 5,
    requested: 6,
};

type DockMode = 'user' | 'therapist';

type DockItemCategory = 'request' | 'booking';

interface DockItem {
    id: string;
    status: string;
    hasPendingAdjustment?: boolean;
    hasPendingNoShow?: boolean;
    title: string;
    subtitle: string;
    path: string;
    actionLabel: string;
    sortTime: number;
    category: DockItemCategory;
}

function statusLabel(status: string, hasPendingAdjustment = false, hasPendingNoShow = false, mode: DockMode = 'user'): string {
    if (hasPendingNoShow) {
        return mode === 'therapist' ? '利用者の返答待ち' : '未着申告の確認待ち';
    }

    switch (status) {
        case 'payment_authorizing':
            return '与信確認中';
        case 'requested':
            return hasPendingAdjustment ? '時間変更の確認待ち' : '承認待ち';
        case 'accepted':
            return '予約確定';
        case 'moving':
            return '移動中';
        case 'arrived':
            return '到着';
        case 'in_progress':
            return '対応中';
        case 'therapist_completed':
            return '完了確認待ち';
        default:
            return status;
    }
}

function statusTone(status: string): string {
    if (WAITING_STATUSES.has(status)) {
        return 'bg-[#fff2dd] text-[#8b5a16]';
    }

    return 'bg-[#e9f4ea] text-[#24553a]';
}

function bookingActionLabel(status: string, hasPendingNoShow = false): string {
    if (hasPendingNoShow) {
        return '内容を確認';
    }

    return WAITING_STATUSES.has(status) ? '内容を確認' : '予約を開く';
}

function therapistActionLabel(category: DockItemCategory, hasPendingAdjustment = false, hasPendingNoShow = false): string {
    if (hasPendingNoShow) {
        return '返答を確認';
    }

    if (category === 'request') {
        return hasPendingAdjustment ? '提案状況を見る' : '依頼を確認';
    }

    return '予約を開く';
}

function bookingActionPath(booking: BookingListRecord): string {
    return `/user/bookings/${booking.public_id}`;
}

function formatScheduleDateTime(value: string | null): string {
    return formatJstDateTime(value, {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }) ?? '未設定';
}

function primaryUserTimeLabel(booking: BookingListRecord): string {
    if (booking.scheduled_start_at) {
        return `開始 ${formatScheduleDateTime(booking.scheduled_start_at)}`;
    }

    return `受付 ${formatScheduleDateTime(booking.created_at)}`;
}

function primaryTherapistRequestLabel(request: TherapistBookingRequestRecord): string {
    if (request.scheduled_start_at) {
        return `開始 ${formatScheduleDateTime(request.scheduled_start_at)}`;
    }

    return `受付 ${formatScheduleDateTime(request.created_at)}`;
}

function compareUserBookings(left: BookingListRecord, right: BookingListRecord): number {
    if (left.pending_no_show_report?.reported_by_role === 'therapist' || right.pending_no_show_report?.reported_by_role === 'therapist') {
        if (left.pending_no_show_report?.reported_by_role === 'therapist' && right.pending_no_show_report?.reported_by_role !== 'therapist') {
            return -1;
        }

        if (right.pending_no_show_report?.reported_by_role === 'therapist' && left.pending_no_show_report?.reported_by_role !== 'therapist') {
            return 1;
        }
    }

    const leftPriority = STATUS_PRIORITY[left.status] ?? 99;
    const rightPriority = STATUS_PRIORITY[right.status] ?? 99;

    if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
    }

    const leftTime = new Date(left.scheduled_start_at ?? left.created_at).getTime();
    const rightTime = new Date(right.scheduled_start_at ?? right.created_at).getTime();

    return leftTime - rightTime;
}

function compareDockItems(left: DockItem, right: DockItem): number {
    if (left.hasPendingNoShow || right.hasPendingNoShow) {
        if (left.hasPendingNoShow && !right.hasPendingNoShow) {
            return -1;
        }

        if (right.hasPendingNoShow && !left.hasPendingNoShow) {
            return 1;
        }
    }

    if (left.category !== right.category) {
        return left.category === 'request' ? -1 : 1;
    }

    if (left.category === 'booking' && right.category === 'booking') {
        const leftPriority = STATUS_PRIORITY[left.status] ?? 99;
        const rightPriority = STATUS_PRIORITY[right.status] ?? 99;

        if (leftPriority !== rightPriority) {
            return leftPriority - rightPriority;
        }
    }

    return left.sortTime - right.sortTime;
}

function summaryLabel(items: DockItem[], mode: DockMode): string {
    const pendingNoShowCount = items.filter((item) => item.hasPendingNoShow).length;

    if (pendingNoShowCount > 0) {
        return mode === 'therapist'
            ? (pendingNoShowCount === 1 ? '未着申告の返答待ちがあります' : `未着申告の返答待ち ${pendingNoShowCount}件`)
            : (pendingNoShowCount === 1 ? '未着申告の確認が必要です' : `未着申告の確認が必要な予約 ${pendingNoShowCount}件`);
    }

    if (mode === 'therapist') {
        const requestCount = items.filter((item) => item.category === 'request').length;
        const progressingCount = items.filter((item) => item.category === 'booking').length;

        if (requestCount > 0 && progressingCount > 0) {
            return `承認待ち${requestCount}件・進行中${progressingCount}件`;
        }

        if (requestCount > 0) {
            return requestCount === 1 ? '承認待ちのリクエストがあります' : `承認待ちのリクエスト ${requestCount}件`;
        }

        return progressingCount === 1 ? '進行中の予約があります' : `進行中の予約 ${progressingCount}件`;
    }

    const waitingCount = items.filter((item) => WAITING_STATUSES.has(item.status)).length;
    const progressingCount = items.length - waitingCount;

    if (progressingCount > 0 && waitingCount > 0) {
        return `進行中${progressingCount}件・承認待ち${waitingCount}件`;
    }

    if (progressingCount > 0) {
        return progressingCount === 1 ? '進行中の予約があります' : `進行中の予約 ${progressingCount}件`;
    }

    return waitingCount === 1 ? '承認待ちの予約があります' : `承認待ちの予約 ${waitingCount}件`;
}

function buildCollapsedDetail(item: DockItem, mode: DockMode): string {
    return `${statusLabel(item.status, item.hasPendingAdjustment, item.hasPendingNoShow, mode)} / ${item.actionLabel}`;
}

export function ActiveUserBookingDock() {
    const { token, activeRole, hasRole, isAuthenticated, isBootstrapping } = useAuth();
    const location = useLocation();
    const [items, setItems] = useState<DockItem[]>([]);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isHiddenAtPageBottom, setIsHiddenAtPageBottom] = useState(false);

    const mode: DockMode | null = useMemo(() => {
        if (!isAuthenticated) {
            return null;
        }

        if (activeRole === 'therapist' && hasRole('therapist')) {
            return 'therapist';
        }

        if (hasRole('user')) {
            return 'user';
        }

        return null;
    }, [activeRole, hasRole, isAuthenticated]);

    const shouldShow = mode !== null;

    const loadItems = useCallback(async () => {
        if (!token || !shouldShow || !mode) {
            setItems([]);
            return;
        }

        try {
            if (mode === 'therapist') {
                const [requestsPayload, bookingsPayload] = await Promise.all([
                    apiRequest<ApiEnvelope<TherapistBookingRequestRecord[]>>('/me/therapist/booking-requests', { token }),
                    apiRequest<ApiEnvelope<BookingListRecord[]>>('/bookings?role=therapist&sort=scheduled_start_at&direction=asc', { token }),
                ]);

                const requestItems = unwrapData(requestsPayload).map<DockItem>((request) => ({
                    id: request.public_id,
                    status: request.status,
                    hasPendingAdjustment: Boolean(request.pending_adjustment_proposal),
                    hasPendingNoShow: false,
                    title: request.menu.name || '予約リクエスト',
                    subtitle: primaryTherapistRequestLabel(request),
                    path: `/therapist/requests/${request.public_id}`,
                    actionLabel: therapistActionLabel('request', Boolean(request.pending_adjustment_proposal)),
                    sortTime: new Date(request.request_expires_at ?? request.created_at).getTime(),
                    category: 'request',
                }));

                const activeBookingItems = unwrapData(bookingsPayload)
                    .filter((booking) => THERAPIST_ACTIVE_STATUSES.has(booking.status))
                    .map<DockItem>((booking) => ({
                        id: booking.public_id,
                        status: booking.status,
                        hasPendingAdjustment: Boolean(booking.pending_adjustment_proposal),
                        hasPendingNoShow: booking.pending_no_show_report?.reported_by_role === 'therapist',
                        title: booking.counterparty?.display_name ?? '利用者',
                        subtitle: primaryUserTimeLabel(booking),
                        path: `/therapist/bookings/${booking.public_id}`,
                        actionLabel: therapistActionLabel('booking', Boolean(booking.pending_adjustment_proposal), booking.pending_no_show_report?.reported_by_role === 'therapist'),
                        sortTime: new Date(booking.scheduled_start_at ?? booking.created_at).getTime(),
                        category: 'booking',
                    }));

                setItems(
                    [...requestItems, ...activeBookingItems]
                        .sort(compareDockItems)
                        .slice(0, MAX_VISIBLE_ITEMS),
                );
                return;
            }

            const payload = await apiRequest<ApiEnvelope<BookingListRecord[]>>('/bookings?role=user&sort=scheduled_start_at&direction=asc', {
                token,
            });

            setItems(
                unwrapData(payload)
                    .filter((booking) => USER_TRACKED_STATUSES.has(booking.status))
                    .sort(compareUserBookings)
                    .slice(0, MAX_VISIBLE_ITEMS)
                    .map<DockItem>((booking) => ({
                        id: booking.public_id,
                        status: booking.status,
                        hasPendingAdjustment: Boolean(booking.pending_adjustment_proposal),
                        hasPendingNoShow: booking.pending_no_show_report?.reported_by_role === 'therapist',
                        title: booking.counterparty?.display_name ?? 'タチキャスト',
                        subtitle: primaryUserTimeLabel(booking),
                        path: bookingActionPath(booking),
                        actionLabel: bookingActionLabel(booking.status, booking.pending_no_show_report?.reported_by_role === 'therapist'),
                        sortTime: new Date(booking.scheduled_start_at ?? booking.created_at).getTime(),
                        category: 'booking',
                    })),
            );
        } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
                setItems([]);
            }
        }
    }, [mode, shouldShow, token]);

    useEffect(() => {
        if (!shouldShow || isBootstrapping) {
            setItems([]);
            return;
        }

        void loadItems();

        const intervalHandle = window.setInterval(() => {
            void loadItems();
        }, REFRESH_INTERVAL_MS);

        const handleFocus = () => {
            void loadItems();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                void loadItems();
            }
        };

        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.clearInterval(intervalHandle);
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isBootstrapping, loadItems, shouldShow]);

    useEffect(() => {
        setIsExpanded(false);
    }, [location.pathname, location.search]);

    useEffect(() => {
        if (!shouldShow) {
            setIsHiddenAtPageBottom(false);
            return;
        }

        const updateVisibility = () => {
            const documentHeight = document.documentElement.scrollHeight;
            const viewportHeight = window.innerHeight;
            const scrollTop = window.scrollY;
            const maxScrollTop = Math.max(0, documentHeight - viewportHeight);
            const isScrollable = maxScrollTop > 120;
            const reachedBottom = scrollTop + viewportHeight >= documentHeight - 24;

            setIsHiddenAtPageBottom(isScrollable && reachedBottom);
        };

        updateVisibility();
        window.addEventListener('scroll', updateVisibility, { passive: true });
        window.addEventListener('resize', updateVisibility);

        return () => {
            window.removeEventListener('scroll', updateVisibility);
            window.removeEventListener('resize', updateVisibility);
        };
    }, [shouldShow]);

    const summary = useMemo(() => (mode ? summaryLabel(items, mode) : ''), [items, mode]);

    if (!shouldShow || items.length === 0 || !mode || isHiddenAtPageBottom) {
        return null;
    }

    return (
        <>
            <section className="fixed bottom-4 left-4 right-4 z-[110] md:hidden">
                {isExpanded ? (
                    <div className="mb-3 space-y-3 rounded-[28px] border border-[#17202b]/10 bg-[#fffdf8] p-4 shadow-[0_22px_45px_rgba(23,32,43,0.22)]">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold text-[#17202b]">{summary}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsExpanded(false);
                                }}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d8c9b2] text-sm font-semibold text-[#48505a]"
                                aria-label="予約状況を閉じる"
                            >
                                ×
                            </button>
                        </div>

                        <div className="space-y-3">
                            {items.map((item) => (
                                <article key={`${item.category}-${item.id}`} className="rounded-[22px] border border-[#efe4d3] bg-white px-4 py-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${item.hasPendingNoShow ? 'bg-[#fff2dd] text-[#8b5a16]' : statusTone(item.status)}`}>
                                                {statusLabel(item.status, item.hasPendingAdjustment, item.hasPendingNoShow, mode)}
                                            </span>
                                            <p className="mt-3 truncate text-sm font-semibold text-[#17202b]">
                                                {item.title}
                                            </p>
                                            <p className="mt-1 text-xs leading-6 text-[#68707a]">{item.subtitle}</p>
                                        </div>
                                        <Link
                                            to={item.path}
                                            className="inline-flex shrink-0 items-center rounded-full bg-[#17202b] px-4 py-2 text-xs font-semibold text-white"
                                        >
                                            {item.actionLabel}
                                        </Link>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </div>
                ) : null}

                <button
                    type="button"
                    onClick={() => {
                        setIsExpanded((current) => !current);
                    }}
                    className="flex w-full items-center justify-between rounded-full border border-[#17202b]/10 bg-[#fffdf8] px-4 py-3 text-left shadow-[0_18px_36px_rgba(23,32,43,0.18)]"
                >
                    <p className="min-w-0 truncate text-sm font-semibold text-[#17202b]">{summary}</p>
                    <span className="inline-flex min-w-[3rem] justify-center rounded-full bg-[#17202b] px-3 py-1 text-xs font-semibold text-white">
                        {isExpanded ? '閉じる' : '開く'}
                    </span>
                </button>
            </section>

            <aside className="fixed bottom-6 left-6 z-[110] hidden w-[min(22rem,calc(100vw-3rem))] md:block">
                {isExpanded ? (
                    <div className="space-y-3 rounded-[30px] border border-[#17202b]/10 bg-[#fffdf8] p-4 shadow-[0_24px_48px_rgba(23,32,43,0.22)]">
                        <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                                <p className="text-sm font-semibold text-[#17202b]">{summary}</p>
                                <p className="text-xs leading-6 text-[#68707a]">
                                    {mode === 'therapist'
                                        ? 'どの画面からでも、承認待ちの依頼や進行中の予約をここから確認できます。'
                                        : 'どの画面からでも、利用者予約の状態をここから確認できます。'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsExpanded(false);
                                }}
                                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d8c9b2] text-sm font-semibold text-[#48505a]"
                                aria-label="予約状況を閉じる"
                            >
                                ×
                            </button>
                        </div>

                        {items.map((item) => (
                            <article key={`${item.category}-${item.id}`} className="rounded-[24px] border border-[#efe4d3] bg-white px-4 py-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${item.hasPendingNoShow ? 'bg-[#fff2dd] text-[#8b5a16]' : statusTone(item.status)}`}>
                                            {statusLabel(item.status, item.hasPendingAdjustment, item.hasPendingNoShow, mode)}
                                        </span>
                                        <p className="mt-3 truncate text-sm font-semibold text-[#17202b]">
                                            {item.title}
                                        </p>
                                        <p className="mt-1 text-xs leading-6 text-[#68707a]">{item.subtitle}</p>
                                    </div>
                                    <Link
                                        to={item.path}
                                        className="inline-flex shrink-0 items-center rounded-full bg-[#17202b] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#243140]"
                                    >
                                        {item.actionLabel}
                                    </Link>
                                </div>
                            </article>
                        ))}
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => {
                            setIsExpanded(true);
                        }}
                        className="flex w-full items-center justify-between rounded-[24px] border border-[#17202b]/10 bg-[#fffdf8] px-4 py-4 text-left shadow-[0_20px_40px_rgba(23,32,43,0.2)]"
                    >
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#17202b]">{summary}</p>
                            <p className="mt-1 text-xs leading-6 text-[#68707a]">
                                {items[0] ? buildCollapsedDetail(items[0], mode) : '予約を確認'}
                            </p>
                        </div>
                        <span className="inline-flex shrink-0 items-center rounded-full bg-[#17202b] px-4 py-2 text-xs font-semibold text-white">
                            開く
                        </span>
                    </button>
                )}
            </aside>
        </>
    );
}
