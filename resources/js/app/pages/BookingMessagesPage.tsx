import { useConversationSearch } from '../hooks/useConversationSearch';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError } from '../lib/api';
import {
    type BookingInboxRecord,
    buildBookingMessagesDetailPath,
    fetchBookingInboxThreads,
} from '../lib/bookingMessages';
import { formatJstDateTime } from '../lib/datetime';
import type { BookingListRecord } from '../lib/types';

function requestTypeLabel(value: BookingListRecord['request_type']): string {
    return value === 'scheduled' ? '予定予約' : '今すぐ';
}

function formatDateTime(value: string | null): string {
    return (
        formatJstDateTime(value, {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }) ?? '未設定'
    );
}

function buildScheduleLine(booking: BookingListRecord): string {
    if (booking.request_type === 'on_demand') {
        return booking.accepted_at
            ? `確定 ${formatDateTime(booking.accepted_at)}`
            : `受付 ${formatDateTime(booking.created_at)}`;
    }

    if (!booking.scheduled_start_at) {
        return '開始時刻を確認中';
    }

    return `${formatDateTime(booking.scheduled_start_at)} - ${formatDateTime(booking.scheduled_end_at)}`;
}

function buildCounterpartyName(booking: BookingListRecord): string {
    if (booking.counterparty?.display_name) {
        return booking.counterparty.display_name;
    }

    if (booking.therapist_profile?.public_name) {
        return booking.therapist_profile.public_name;
    }

    return '相手を確認中';
}

function buildCounterpartyAvatarLabel(booking: BookingListRecord): string {
    const name = buildCounterpartyName(booking).trim();

    return name.length > 0 ? name.slice(0, 1).toUpperCase() : '?';
}

function threadTimestamp(booking: BookingListRecord): number {
    return new Date(
        booking.latest_incoming_message_sent_at ??
            booking.latest_message_sent_at ??
            booking.created_at,
    ).getTime();
}

function latestMessagePreview(
    booking: BookingListRecord,
    role: BookingInboxRecord['inbox_role'],
): string {
    const excerpt =
        booking.latest_message_summary?.excerpt ?? 'メッセージを確認できます。';

    if (booking.latest_message_summary?.sender_role === role) {
        return `あなた: ${excerpt}`;
    }

    return excerpt;
}

export function BookingMessagesPage({ role }: { role: 'user' | 'therapist' }) {
    const { token } = useAuth();
    const location = useLocation();
    const { search, setSearch, query, pending } = useConversationSearch();
    const requestAbort = useRef<AbortController | null>(null);
    const [bookings, setBookings] = useState<BookingInboxRecord[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const availableInboxRoles = useMemo(() => [role], [role]);

    useToastOnMessage(error, 'error');

    async function loadThreads(
        nextIsRefresh = false,
        signal = requestAbort.current?.signal,
    ) {
        if (!token) {
            return;
        }

        if (nextIsRefresh) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }

        try {
            const nextBookings = await fetchBookingInboxThreads(
                token,
                availableInboxRoles,
                { query, signal },
            );

            if (signal?.aborted) return;
            setBookings(nextBookings);
            setError(null);
        } catch (requestError) {
            if (signal?.aborted) return;
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : 'メッセージ一覧の取得に失敗しました。';

            setError(message);
        } finally {
            if (!signal?.aborted) {
                setIsLoading(false);
                setIsRefreshing(false);
            }
        }
    }

    useEffect(() => {
        if (!token) {
            setBookings([]);
            setIsLoading(false);
            return;
        }

        const abort = new AbortController();
        requestAbort.current = abort;
        setBookings([]);
        void loadThreads(false, abort.signal);
        const refresh = () => {
            if (!document.hidden) void loadThreads(true);
        };
        const timer = window.setInterval(refresh, 30000);
        window.addEventListener('booking-message-summary:refresh', refresh);
        return () => {
            abort.abort();
            clearInterval(timer);
            window.removeEventListener(
                'booking-message-summary:refresh',
                refresh,
            );
        };
    }, [availableInboxRoles, token, query]);

    const threads = [...bookings]
        .filter(
            (booking) =>
                booking.message_thread.can_view &&
                (booking.latest_message_summary ||
                    booking.latest_message_sent_at),
        )
        .sort((left, right) => {
            const difference = threadTimestamp(right) - threadTimestamp(left);

            if (difference !== 0) {
                return difference;
            }

            return (
                new Date(
                    right.latest_message_sent_at ?? right.created_at,
                ).getTime() -
                new Date(
                    left.latest_message_sent_at ?? left.created_at,
                ).getTime()
            );
        });

    const visibleThreads = threads;
    return (
        <section>
            <div className="space-y-2 px-4 pb-3">
                <input
                    aria-label="会話を検索"
                    type="search"
                    maxLength={100}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="会話を検索"
                    className="min-h-11 w-full rounded-full border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#b5894d]"
                />
                <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>予約ごとのやり取り</span>
                    <button
                        type="button"
                        onClick={() => void loadThreads(true)}
                        disabled={isRefreshing}
                        className="min-h-10 px-2 font-semibold"
                    >
                        {isRefreshing ? '更新中…' : '更新'}
                    </button>
                </div>
            </div>
            {error && (
                <p role="alert" className="px-4 py-2 text-sm text-red-700">
                    {error}
                </p>
            )}
            {isLoading || pending ? (
                <p
                    className="p-6 text-center text-sm text-slate-500"
                    role="status"
                >
                    {search.trim() ? '検索中…' : '予約の連絡を読み込み中…'}
                </p>
            ) : visibleThreads.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-slate-500">
                    {search
                        ? '一致する会話がありません。'
                        : 'まだ予約の連絡はありません。'}
                </p>
            ) : (
                <div className="divide-y divide-slate-100">
                    {visibleThreads.map((booking) => {
                        const path = buildBookingMessagesDetailPath(
                            role,
                            booking.public_id,
                        );
                        const selected = location.pathname === path;
                        return (
                            <Link
                                key={booking.public_id}
                                to={path}
                                aria-current={selected ? 'page' : undefined}
                                className={`flex gap-3 border-l-2 px-4 py-4 transition ${selected ? 'border-[#b5894d] bg-[#faf5ee]' : 'border-transparent hover:bg-slate-50'}`}
                            >
                                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#f3e5d1] font-semibold text-[#6f4b26]">
                                    {buildCounterpartyAvatarLabel(booking)}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <p className="truncate font-semibold">
                                            {buildCounterpartyName(booking)}
                                        </p>
                                        {booking.unread_message_count > 0 && (
                                            <span className="shrink-0 text-xs font-semibold text-red-700">
                                                未読{' '}
                                                {booking.unread_message_count}
                                            </span>
                                        )}
                                    </div>
                                    <p className="mt-0.5 truncate text-xs text-slate-400">
                                        {buildScheduleLine(booking)}
                                    </p>
                                    <p
                                        className={`mt-1 ${booking.search_preview ? 'line-clamp-2' : 'truncate'} text-sm text-slate-600`}
                                    >
                                        {booking.search_preview ??
                                            latestMessagePreview(booking, role)}
                                    </p>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
