import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { buildBookingMessagesDetailPath } from '../lib/bookingMessages';
import { formatJstDateTime } from '../lib/datetime';
import { getServiceAddressLabel } from '../lib/discovery';
import type { ApiEnvelope, BookingListRecord, RoleName } from '../lib/types';

interface BookingMessagesPageProps {
    role: Extract<RoleName, 'user' | 'therapist'>;
}

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

function threadTimestamp(booking: BookingListRecord): number {
    return new Date(
        booking.latest_incoming_message_sent_at
        ?? booking.latest_message_sent_at
        ?? booking.created_at,
    ).getTime();
}

function latestActivityLabel(booking: BookingListRecord): string {
    return booking.latest_incoming_message_sent_at ? '最終受信' : '最終メッセージ';
}

function latestActivityValue(booking: BookingListRecord): string {
    return formatDateTime(booking.latest_incoming_message_sent_at ?? booking.latest_message_sent_at);
}

function unreadBadgeLabel(unreadCount: number): string {
    return unreadCount > 99 ? '99+' : String(unreadCount);
}

function latestMessagePreview(
    booking: BookingListRecord,
    role: Extract<RoleName, 'user' | 'therapist'>,
): string {
    const excerpt = booking.latest_message_summary?.excerpt ?? 'メッセージを確認できます。';

    if (booking.latest_message_summary?.sender_role === role) {
        return `あなた: ${excerpt}`;
    }

    return excerpt;
}

export function BookingMessagesPage({ role }: BookingMessagesPageProps) {
    const { token } = useAuth();
    const [bookings, setBookings] = useState<BookingListRecord[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

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
            const payload = await apiRequest<ApiEnvelope<BookingListRecord[]>>(`/bookings?role=${role}&sort=updated_at&direction=desc`, {
                token,
            });
            const nextBookings = unwrapData(payload);

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
        void loadThreads();
    }, [role, token]);

    const threads = [...bookings]
        .filter((booking) => booking.latest_message_summary || booking.latest_message_sent_at)
        .sort((left, right) => {
            const difference = threadTimestamp(right) - threadTimestamp(left);

            if (difference !== 0) {
                return difference;
            }

            return new Date(right.latest_message_sent_at ?? right.created_at).getTime()
                - new Date(left.latest_message_sent_at ?? left.created_at).getTime();
        });
    const unreadMessageCount = threads.reduce((total, booking) => total + booking.unread_message_count, 0);
    const unreadThreadCount = threads.filter((booking) => booking.unread_message_count > 0).length;
    const roleLabel = role === 'user' ? 'タチキャストとの' : '利用者との';

    if (isLoading) {
        return <LoadingScreen title="メッセージ一覧を読み込み中" message={`${roleLabel}連絡履歴を確認しています。`} />;
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[32px] border border-[#eadfd0] bg-white px-6 py-6 shadow-[0_20px_55px_rgba(15,23,42,0.08)] sm:px-7">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-3">
                        <span className="inline-flex items-center rounded-full bg-[#f6ede2] px-3 py-1 text-xs font-semibold tracking-[0.18em] text-[#8a5c2f]">
                            Messages
                        </span>
                        <div className="space-y-2">
                            <h1 className="text-[1.8rem] font-semibold leading-tight text-[#17202b] sm:text-[2rem]">
                                メッセージ一覧
                            </h1>
                            <p className="max-w-2xl text-sm leading-7 text-slate-600">
                                予約ごとの最新連絡をまとめて確認できます。未読があるスレッドから優先して戻れるようにしています。
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            void loadThreads(true);
                        }}
                        className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#d7c6b2] bg-[#f8f1e8] px-4 py-2 text-sm font-semibold text-[#704a22] transition hover:bg-[#f1e4d4]"
                        disabled={isRefreshing}
                    >
                        {isRefreshing ? '更新中…' : '更新する'}
                    </button>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    <article className="rounded-[24px] border border-[#efe4d6] bg-[#fcf8f2] px-5 py-4">
                        <p className="text-xs font-semibold tracking-[0.16em] text-slate-500">スレッド</p>
                        <p className="mt-3 text-2xl font-semibold text-[#17202b]">{threads.length}</p>
                    </article>
                    <article className="rounded-[24px] border border-[#efe4d6] bg-[#fcf8f2] px-5 py-4">
                        <p className="text-xs font-semibold tracking-[0.16em] text-slate-500">未読メッセージ</p>
                        <p className="mt-3 text-2xl font-semibold text-[#17202b]">{unreadMessageCount}</p>
                    </article>
                    <article className="rounded-[24px] border border-[#efe4d6] bg-[#fcf8f2] px-5 py-4">
                        <p className="text-xs font-semibold tracking-[0.16em] text-slate-500">未読スレッド</p>
                        <p className="mt-3 text-2xl font-semibold text-[#17202b]">{unreadThreadCount}</p>
                    </article>
                </div>
            </section>

            <section className="rounded-[32px] border border-[#eadfd0] bg-white p-4 shadow-[0_20px_55px_rgba(15,23,42,0.08)] sm:p-5">
                <div className="flex items-center justify-between gap-3 px-2 pb-4">
                    <div>
                        <h2 className="text-lg font-semibold text-[#17202b]">スレッド一覧</h2>
                        <p className="mt-1 text-sm text-slate-500">
                            新しく届いた連絡がある予約から順番に表示しています。
                        </p>
                    </div>
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
                                to={buildBookingMessagesDetailPath(role, booking.public_id)}
                                className="group block rounded-[28px] border border-[#ece1d3] bg-[#fffdfa] p-5 transition hover:-translate-y-0.5 hover:border-[#d8bf9b] hover:shadow-[0_18px_35px_rgba(23,32,43,0.08)]"
                            >
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="min-w-0 flex-1 space-y-4">
                                        <div className="space-y-1">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">from</p>
                                            <p className="text-base font-semibold text-[#17202b]">{buildScheduleLine(booking)}</p>
                                            <p className="text-sm text-slate-500">{buildBookingMetaLine(booking) || '関連予約情報を確認中'}</p>
                                        </div>

                                        <div className="space-y-1">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">poster</p>
                                            <p className="text-sm font-semibold text-[#243244]">{buildCounterpartyName(booking)}</p>
                                        </div>

                                        <div className="space-y-1">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">latest message</p>
                                            <p className="line-clamp-2 text-sm leading-7 text-slate-600">
                                                {latestMessagePreview(booking, role)}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-3 self-start lg:flex-col lg:items-end">
                                        <div className="text-right">
                                            <p className="text-[11px] font-semibold tracking-[0.16em] text-slate-400">{latestActivityLabel(booking)}</p>
                                            <p className="mt-1 text-sm font-semibold text-[#243244]">{latestActivityValue(booking)}</p>
                                        </div>
                                        {booking.unread_message_count > 0 ? (
                                            <span className="inline-flex min-h-8 items-center justify-center rounded-full bg-[#d67c7c] px-3 text-xs font-bold text-white shadow-[0_10px_24px_rgba(214,124,124,0.28)]">
                                                未読 {unreadBadgeLabel(booking.unread_message_count)}
                                            </span>
                                        ) : null}
                                        <span className="text-xl text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500">
                                            ›
                                        </span>
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
