import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { formatRoleLabel } from '../lib/account';
import { ApiError } from '../lib/api';
import {
    type BookingInboxRecord,
    buildBookingMessagesDetailPath,
    fetchBookingInboxThreads,
} from '../lib/bookingMessages';
import { formatJstDateTime } from '../lib/datetime';
import { getServiceAddressLabel } from '../lib/discovery';
import type { BookingListRecord } from '../lib/types';

function requestTypeLabel(value: BookingListRecord['request_type']): string {
    return value === 'scheduled' ? '予定予約' : '今すぐ';
}

function formatDateTime(value: string | null): string {
    return formatJstDateTime(value, {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }) ?? '未設定';
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

function buildBookingMetaLine(booking: BookingListRecord): string {
    return [
        requestTypeLabel(booking.request_type),
        booking.therapist_menu?.name ?? null,
        getServiceAddressLabel(booking.service_address),
    ].filter((value): value is string => Boolean(value)).join(' ・ ');
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
        booking.latest_incoming_message_sent_at
        ?? booking.latest_message_sent_at
        ?? booking.created_at,
    ).getTime();
}

function latestActivityValue(booking: BookingListRecord): string {
    return formatDateTime(booking.latest_incoming_message_sent_at ?? booking.latest_message_sent_at);
}

function buildThreadSummaryLine(booking: BookingListRecord): string {
    const bookingMeta = buildBookingMetaLine(booking);

    if (!bookingMeta) {
        return buildScheduleLine(booking);
    }

    return `${buildScheduleLine(booking)} ・ ${bookingMeta}`;
}

function latestMessagePreview(
    booking: BookingListRecord,
    role: BookingInboxRecord['inbox_role'],
): string {
    const excerpt = booking.latest_message_summary?.excerpt ?? 'メッセージを確認できます。';

    if (booking.latest_message_summary?.sender_role === role) {
        return `あなた: ${excerpt}`;
    }

    return excerpt;
}

export function BookingMessagesPage({role}: {role: 'user' | 'therapist'}) {
    const { token } = useAuth();
    const [bookings, setBookings] = useState<BookingInboxRecord[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const availableInboxRoles = useMemo(
        () => [role],
        [role],
    );
    const showRoleBadge = availableInboxRoles.length > 1;

    usePageTitle('メッセージ一覧');
    useToastOnMessage(error, 'error');

    async function loadThreads(nextIsRefresh = false) {
        if (!token) {
            return;
        }

        if (nextIsRefresh) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }

        try {
            const nextBookings = await fetchBookingInboxThreads(token, availableInboxRoles);

            setBookings(nextBookings);
            setError(null);
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : 'メッセージ一覧の取得に失敗しました。';

            setError(message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }

    useEffect(() => {
        if (!token) {
            setBookings([]);
            setIsLoading(false);
            return;
        }

        void loadThreads();
    }, [availableInboxRoles, token]);

    const threads = [...bookings]
        .filter((booking) => booking.message_thread.can_view && (booking.latest_message_summary || booking.latest_message_sent_at))
        .sort((left, right) => {
            const difference = threadTimestamp(right) - threadTimestamp(left);

            if (difference !== 0) {
                return difference;
            }

            return new Date(right.latest_message_sent_at ?? right.created_at).getTime()
                - new Date(left.latest_message_sent_at ?? left.created_at).getTime();
        });

    if (isLoading) {
        return <LoadingScreen title="メッセージ一覧を読み込み中" message="この役割の予約の連絡を確認しています。" />;
    }

    return (
        <div>
            <section className="rounded-[32px] border border-[#eadfd0] bg-white p-4 shadow-[0_20px_55px_rgba(15,23,42,0.08)] sm:p-5">
                <div className="flex items-center justify-between gap-3 px-2 pb-4">
                    <h1 className="text-lg font-semibold text-[#17202b]">メッセージ一覧</h1>
                    <button
                        type="button"
                        onClick={() => {
                            void loadThreads(true);
                        }}
                        className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#ddd0bf] bg-[#faf5ee] px-4 py-2 text-sm font-semibold text-[#6b4a27] transition hover:bg-[#f2e7d9]"
                        disabled={isRefreshing}
                    >
                        {isRefreshing ? '更新中…' : '更新'}
                    </button>
                </div>

                {threads.length === 0 ? (
                    <div className="rounded-[28px] border border-dashed border-[#d8c8b5] bg-[#fcf7f0] px-6 py-10 text-center">
                        <p className="text-base font-semibold text-[#17202b]">まだメッセージはありません。</p>
                        <p className="mt-2 text-sm leading-7 text-slate-500">
                            予約ごとのやり取りが始まると、ここに最新メッセージが並びます。
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {threads.map((booking) => (
                            <Link
                                key={booking.public_id}
                                to={buildBookingMessagesDetailPath(booking.inbox_role, booking.public_id)}
                                className={[
                                    'group block rounded-[26px] border p-4 transition',
                                    booking.unread_message_count > 0
                                        ? 'border-[#d9c19e] bg-[#fffaf3] shadow-[0_14px_30px_rgba(23,32,43,0.06)]'
                                        : 'border-[#ece1d3] bg-[#fffdfa] hover:border-[#d8bf9b] hover:bg-[#fffaf3] hover:shadow-[0_16px_32px_rgba(23,32,43,0.06)]',
                                ].join(' ')}
                            >
                                <div className="flex items-start gap-4">
                                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle_at_top,#f3e5d1_0%,#ead6b8_55%,#dbc09a_100%)] text-lg font-semibold text-[#6f4b26] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                                        {buildCounterpartyAvatarLabel(booking)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-start gap-3">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <p className="truncate text-[1rem] font-semibold text-[#17202b]">
                                                        {buildCounterpartyName(booking)}
                                                    </p>
                                                    {showRoleBadge ? (
                                                        <span className={[
                                                            'inline-flex h-6 shrink-0 items-center justify-center rounded-full px-2.5 text-[11px] font-semibold',
                                                            booking.inbox_role === 'user'
                                                                ? 'bg-[#fff3d8] text-[#8a6516]'
                                                                : 'bg-[#e7f5ec] text-[#2d7048]',
                                                        ].join(' ')}>
                                                            {formatRoleLabel(booking.inbox_role)}
                                                        </span>
                                                    ) : null}
                                                    {booking.unread_message_count > 0 ? (
                                                        <span className="inline-flex h-6 shrink-0 items-center justify-center rounded-full bg-[#d67c7c] px-2.5 text-[11px] font-bold text-white shadow-[0_8px_18px_rgba(214,124,124,0.24)]">
                                                            未読
                                                        </span>
                                                    ) : null}
                                                </div>
                                                <p className="mt-1 truncate text-[13px] text-slate-500">
                                                    {buildThreadSummaryLine(booking)}
                                                </p>
                                            </div>
                                            <div className="shrink-0 pl-2 text-right">
                                                <p className="text-xs font-medium text-slate-400">
                                                    {latestActivityValue(booking)}
                                                </p>
                                            </div>
                                        </div>
                                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
                                            {latestMessagePreview(booking, booking.inbox_role)}
                                        </p>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
