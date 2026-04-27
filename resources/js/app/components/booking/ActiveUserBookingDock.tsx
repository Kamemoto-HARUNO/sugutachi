import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { ApiError, apiRequest, unwrapData } from '../../lib/api';
import { formatJstDateTime } from '../../lib/datetime';
import type { ApiEnvelope, BookingListRecord } from '../../lib/types';

const REFRESH_INTERVAL_MS = 30_000;
const MAX_VISIBLE_BOOKINGS = 2;

const TRACKED_STATUSES = new Set([
    'payment_authorizing',
    'requested',
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

function statusLabel(status: string): string {
    switch (status) {
        case 'payment_authorizing':
            return '与信確認中';
        case 'requested':
            return '承認待ち';
        case 'accepted':
            return '予約確定';
        case 'moving':
            return '移動中';
        case 'arrived':
            return '到着';
        case 'in_progress':
            return '施術中';
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

function bookingActionLabel(status: string): string {
    return WAITING_STATUSES.has(status) ? '承認待ちを確認' : '予約を開く';
}

function bookingActionPath(booking: BookingListRecord): string {
    return `/user/bookings/${booking.public_id}`;
}

function primaryTimeLabel(booking: BookingListRecord): string {
    if (booking.scheduled_start_at) {
        return `開始 ${formatJstDateTime(booking.scheduled_start_at, {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }) ?? '未設定'}`;
    }

    return `受付 ${formatJstDateTime(booking.created_at, {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }) ?? '未設定'}`;
}

function compareBookings(left: BookingListRecord, right: BookingListRecord): number {
    const leftPriority = STATUS_PRIORITY[left.status] ?? 99;
    const rightPriority = STATUS_PRIORITY[right.status] ?? 99;

    if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
    }

    const leftTime = new Date(left.scheduled_start_at ?? left.created_at).getTime();
    const rightTime = new Date(right.scheduled_start_at ?? right.created_at).getTime();

    return leftTime - rightTime;
}

function summaryLabel(bookings: BookingListRecord[]): string {
    const waitingCount = bookings.filter((booking) => WAITING_STATUSES.has(booking.status)).length;
    const progressingCount = bookings.length - waitingCount;

    if (progressingCount > 0 && waitingCount > 0) {
        return `進行中${progressingCount}件・承認待ち${waitingCount}件`;
    }

    if (progressingCount > 0) {
        return progressingCount === 1 ? '進行中の予約があります' : `進行中の予約 ${progressingCount}件`;
    }

    return waitingCount === 1 ? '承認待ちの予約があります' : `承認待ちの予約 ${waitingCount}件`;
}

export function ActiveUserBookingDock() {
    const { token, hasRole, isAuthenticated, isBootstrapping } = useAuth();
    const location = useLocation();
    const [bookings, setBookings] = useState<BookingListRecord[]>([]);
    const [isExpanded, setIsExpanded] = useState(false);

    const shouldShow = isAuthenticated && hasRole('user');

    const loadBookings = useCallback(async () => {
        if (!token || !shouldShow) {
            setBookings([]);
            return;
        }

        try {
            const payload = await apiRequest<ApiEnvelope<BookingListRecord[]>>('/bookings?role=user&sort=scheduled_start_at&direction=asc', {
                token,
            });

            const nextBookings = unwrapData(payload)
                .filter((booking) => TRACKED_STATUSES.has(booking.status))
                .sort(compareBookings)
                .slice(0, MAX_VISIBLE_BOOKINGS);

            setBookings(nextBookings);
        } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
                setBookings([]);
                return;
            }
        }
    }, [shouldShow, token]);

    useEffect(() => {
        if (!shouldShow || isBootstrapping) {
            setBookings([]);
            return;
        }

        void loadBookings();

        const intervalHandle = window.setInterval(() => {
            void loadBookings();
        }, REFRESH_INTERVAL_MS);

        const handleFocus = () => {
            void loadBookings();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                void loadBookings();
            }
        };

        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.clearInterval(intervalHandle);
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isBootstrapping, loadBookings, shouldShow]);

    useEffect(() => {
        setIsExpanded(false);
    }, [location.pathname, location.search]);

    const summary = useMemo(() => summaryLabel(bookings), [bookings]);

    if (!shouldShow || bookings.length === 0) {
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
                            {bookings.map((booking) => (
                                <article key={booking.public_id} className="rounded-[22px] border border-[#efe4d3] bg-white px-4 py-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusTone(booking.status)}`}>
                                                {statusLabel(booking.status)}
                                            </span>
                                            <p className="mt-3 truncate text-sm font-semibold text-[#17202b]">
                                                {booking.counterparty?.display_name ?? 'セラピスト'}
                                            </p>
                                            <p className="mt-1 text-xs leading-6 text-[#68707a]">{primaryTimeLabel(booking)}</p>
                                        </div>
                                        <Link
                                            to={bookingActionPath(booking)}
                                            className="inline-flex shrink-0 items-center rounded-full bg-[#17202b] px-4 py-2 text-xs font-semibold text-white"
                                        >
                                            {bookingActionLabel(booking.status)}
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
                                <p className="text-xs leading-6 text-[#68707a]">どの画面からでも、利用者予約の状態をここから確認できます。</p>
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

                        {bookings.map((booking) => (
                            <article key={booking.public_id} className="rounded-[24px] border border-[#efe4d3] bg-white px-4 py-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusTone(booking.status)}`}>
                                            {statusLabel(booking.status)}
                                        </span>
                                        <p className="mt-3 truncate text-sm font-semibold text-[#17202b]">
                                            {booking.counterparty?.display_name ?? 'セラピスト'}
                                        </p>
                                        <p className="mt-1 text-xs leading-6 text-[#68707a]">{primaryTimeLabel(booking)}</p>
                                    </div>
                                    <Link
                                        to={bookingActionPath(booking)}
                                        className="inline-flex shrink-0 items-center rounded-full bg-[#17202b] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#243140]"
                                    >
                                        {bookingActionLabel(booking.status)}
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
                                {bookings[0] ? `${statusLabel(bookings[0].status)} / ${bookingActionLabel(bookings[0].status)}` : '予約を確認'}
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
