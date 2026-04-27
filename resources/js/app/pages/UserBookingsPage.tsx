import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatJstDateTime } from '../lib/datetime';
import { formatCurrency, getServiceAddressLabel } from '../lib/discovery';
import type { ApiEnvelope, BookingListRecord } from '../lib/types';

type BookingGroup = 'all' | 'active' | 'completed' | 'closed';
type RequestTypeFilter = 'all' | 'on_demand' | 'scheduled';
type SortMode = 'upcoming' | 'recent';

const activeStatuses = new Set([
    'payment_authorizing',
    'requested',
    'accepted',
    'moving',
    'arrived',
    'in_progress',
    'therapist_completed',
]);

const closedStatuses = new Set([
    'rejected',
    'expired',
    'payment_canceled',
    'canceled',
    'interrupted',
]);

function normalizeGroup(value: string | null): BookingGroup {
    if (value === 'all' || value === 'active' || value === 'completed' || value === 'closed') {
        return value;
    }

    return 'active';
}

function normalizeRequestType(value: string | null): RequestTypeFilter {
    if (value === 'on_demand' || value === 'scheduled') {
        return value;
    }

    return 'all';
}

function normalizeSort(value: string | null): SortMode {
    return value === 'recent' ? 'recent' : 'upcoming';
}

function statusLabel(booking: Pick<BookingListRecord, 'status' | 'pending_adjustment_proposal'>): string {
    switch (booking.status) {
        case 'payment_authorizing':
            return '与信確認中';
        case 'requested':
            return booking.pending_adjustment_proposal ? '時間変更の確認待ち' : '承諾待ち';
        case 'accepted':
            return '予約確定';
        case 'moving':
            return '移動中';
        case 'arrived':
            return '到着';
        case 'in_progress':
            return '施術中';
        case 'therapist_completed':
            return 'あなたの完了確認待ち';
        case 'completed':
            return '完了';
        case 'rejected':
            return '辞退';
        case 'expired':
            return '期限切れ';
        case 'payment_canceled':
            return '与信取消';
        case 'canceled':
            return 'キャンセル';
        case 'interrupted':
            return '中断';
        default:
            return booking.status;
    }
}

function statusTone(status: string): string {
    switch (status) {
        case 'completed':
            return 'bg-[#e9f4ea] text-[#24553a]';
        case 'requested':
        case 'payment_authorizing':
        case 'therapist_completed':
            return 'bg-[#fff2dd] text-[#8b5a16]';
        case 'accepted':
        case 'moving':
        case 'arrived':
        case 'in_progress':
            return 'bg-[#eaf2ff] text-[#30527a]';
        case 'rejected':
        case 'expired':
        case 'payment_canceled':
        case 'canceled':
        case 'interrupted':
            return 'bg-[#f7e7e3] text-[#8c4738]';
        default:
            return 'bg-[#f1efe8] text-[#48505a]';
    }
}

function requestTypeLabel(value: BookingListRecord['request_type']): string {
    return value === 'scheduled' ? '予定予約' : '今すぐ';
}

function paymentStatusLabel(value: string | null | undefined): string {
    switch (value) {
        case 'requires_capture':
            return '与信確保済み';
        case 'succeeded':
            return '決済完了';
        case 'canceled':
            return '与信取消';
        default:
            return '未作成';
    }
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

    const start = formatDateTime(booking.scheduled_start_at);
    const end = formatDateTime(booking.scheduled_end_at);

    return `${start} - ${end}`;
}

function sortBookings(bookings: BookingListRecord[], sortMode: SortMode): BookingListRecord[] {
    return [...bookings].sort((left, right) => {
        const leftPrimary = sortMode === 'upcoming'
            ? new Date(left.scheduled_start_at ?? left.requested_start_at ?? left.created_at).getTime()
            : new Date(left.created_at).getTime();
        const rightPrimary = sortMode === 'upcoming'
            ? new Date(right.scheduled_start_at ?? right.requested_start_at ?? right.created_at).getTime()
            : new Date(right.created_at).getTime();

        if (sortMode === 'upcoming') {
            return leftPrimary - rightPrimary;
        }

        return rightPrimary - leftPrimary;
    });
}

function matchesGroup(booking: BookingListRecord, group: BookingGroup): boolean {
    if (group === 'all') {
        return true;
    }

    if (group === 'active') {
        return activeStatuses.has(booking.status);
    }

    if (group === 'completed') {
        return booking.status === 'completed';
    }

    return closedStatuses.has(booking.status);
}

function buildAttentionLabel(booking: BookingListRecord): string | null {
    if (booking.status === 'therapist_completed') {
        return '施術完了の確認が必要です';
    }

    if (booking.status === 'requested') {
        return booking.pending_adjustment_proposal ? '時間変更の確認が必要です' : 'セラピスト承諾待ち';
    }

    if (booking.status === 'payment_authorizing') {
        return 'カード与信の確定待ち';
    }

    if (booking.unread_message_count > 0) {
        return `未読メッセージ ${booking.unread_message_count}件`;
    }

    if (booking.open_report_count > 0) {
        return `未解決の通報 ${booking.open_report_count}件`;
    }

    return null;
}

export function UserBookingsPage() {
    const { token } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [bookings, setBookings] = useState<BookingListRecord[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const group = normalizeGroup(searchParams.get('group'));
    const requestType = normalizeRequestType(searchParams.get('request_type'));
    const sortMode = normalizeSort(searchParams.get('sort'));

    usePageTitle('予約一覧');
    useToastOnMessage(error, 'error');

    async function loadBookings(nextIsRefresh = false) {
        if (!token) {
            return;
        }

        if (nextIsRefresh) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }

        try {
            const payload = await apiRequest<ApiEnvelope<BookingListRecord[]>>('/bookings?role=user&sort=scheduled_start_at&direction=asc', {
                token,
            });

            setBookings(unwrapData(payload));
            setError(null);
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '予約一覧の取得に失敗しました。';

            setError(message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }

    useEffect(() => {
        void loadBookings();
    }, [token]);

    const summary = useMemo(() => ({
        active: bookings.filter((booking) => activeStatuses.has(booking.status)).length,
        requested: bookings.filter((booking) => booking.status === 'requested').length,
        unread: bookings.reduce((total, booking) => total + booking.unread_message_count, 0),
        completed: bookings.filter((booking) => booking.status === 'completed').length,
    }), [bookings]);

    const filteredBookings = useMemo(() => {
        const next = bookings.filter((booking) => {
            if (!matchesGroup(booking, group)) {
                return false;
            }

            if (requestType !== 'all' && booking.request_type !== requestType) {
                return false;
            }

            return true;
        });

        return sortBookings(next, sortMode);
    }, [bookings, group, requestType, sortMode]);

    const visibleCountLabel = `${filteredBookings.length}件表示`;

    if (isLoading) {
        return <LoadingScreen title="予約一覧を読み込み中" message="進行中の予約、承諾待ち、完了履歴を確認しています。" />;
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[32px] bg-[linear-gradient(117deg,#17202b_0%,#243447_52%,#2b4158_100%)] p-7 text-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">BOOKINGS</p>
                        <div className="space-y-2">
                            <h1 className="text-3xl font-semibold">予約一覧</h1>
                            <p className="max-w-3xl text-sm leading-7 text-slate-300">
                                承諾待ち、進行中、完了、キャンセルまでをここでまとめて確認します。
                                状況の変化が追いやすいように、未読メッセージや返金・通報の件数も一覧に出します。
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                void loadBookings(true);
                            }}
                            disabled={isRefreshing}
                            className="inline-flex items-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isRefreshing ? '更新中...' : '更新'}
                        </button>
                        <Link
                            to="/user/therapists"
                            className="inline-flex items-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:brightness-105"
                        >
                            新しく探す
                        </Link>
                    </div>
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                    { label: '進行中', value: summary.active, hint: '承諾待ちや施術中を含む' },
                    { label: '承諾待ち', value: summary.requested, hint: 'セラピストの応答待ち' },
                    { label: '未読', value: summary.unread, hint: 'メッセージ未読件数' },
                    { label: '完了', value: summary.completed, hint: 'レビュー導線の対象' },
                ].map((item) => (
                    <article
                        key={item.label}
                        className="rounded-[24px] border border-white/10 bg-white/5 p-5 shadow-[0_12px_28px_rgba(15,23,42,0.08)]"
                    >
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">{item.label}</p>
                        <p className="mt-3 text-3xl font-semibold text-white">{item.value}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-300">{item.hint}</p>
                    </article>
                ))}
            </section>

            <section className="rounded-[28px] bg-white p-5 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                    <div className="space-y-4">
                        <div>
                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">FILTERS</p>
                            <h2 className="mt-2 text-2xl font-semibold text-[#17202b]">表示条件</h2>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {[
                                ['all', 'すべて'],
                                ['active', '進行中'],
                                ['completed', '完了'],
                                ['closed', '終了'],
                            ].map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => {
                                        setSearchParams((previous) => {
                                            const next = new URLSearchParams(previous);
                                            next.set('group', value);

                                            return next;
                                        });
                                    }}
                                    className={[
                                        'rounded-full px-4 py-2 text-sm font-semibold transition',
                                        group === value
                                            ? 'bg-[#17202b] text-white'
                                            : 'bg-[#f5efe4] text-[#48505a] hover:bg-[#ebe2d3]',
                                    ].join(' ')}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <label htmlFor="request-type-filter" className="text-sm font-semibold text-[#17202b]">
                                予約タイプ
                            </label>
                            <select
                                id="request-type-filter"
                                value={requestType}
                                onChange={(event) => {
                                    setSearchParams((previous) => {
                                        const next = new URLSearchParams(previous);
                                        next.set('request_type', event.target.value);

                                        return next;
                                    });
                                }}
                                className="w-full rounded-[16px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#c6a16a]"
                            >
                                <option value="all">すべて</option>
                                <option value="scheduled">予定予約</option>
                                <option value="on_demand">今すぐ</option>
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="sort-mode" className="text-sm font-semibold text-[#17202b]">
                                並び順
                            </label>
                            <select
                                id="sort-mode"
                                value={sortMode}
                                onChange={(event) => {
                                    setSearchParams((previous) => {
                                        const next = new URLSearchParams(previous);
                                        next.set('sort', event.target.value);

                                        return next;
                                    });
                                }}
                                className="w-full rounded-[16px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#c6a16a]"
                            >
                                <option value="upcoming">開始が近い順</option>
                                <option value="recent">新しい順</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="mt-6 flex items-center justify-between gap-4 border-t border-[#efe5d7] pt-5">
                    <p className="text-sm text-[#68707a]">{visibleCountLabel}</p>
                    <p className="text-sm text-[#68707a]">
                        未読や返金、通報の件数も一覧で確認できます。
                    </p>
                </div>
            </section>


            {filteredBookings.length > 0 ? (
                <section className="grid gap-4">
                    {filteredBookings.map((booking) => {
                        const attention = buildAttentionLabel(booking);
                        const displayName =
                            booking.therapist_profile?.public_name
                            ?? booking.counterparty?.display_name
                            ?? '相手を確認中';

                        return (
                            <article
                                key={booking.public_id}
                                className="rounded-[28px] bg-[#fffcf7] p-5 shadow-[0_18px_36px_rgba(23,32,43,0.12)]"
                            >
                                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                                    <div className="space-y-4">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(booking.status)}`}>
                                                {statusLabel(booking)}
                                            </span>
                                            <span className="rounded-full bg-[#f5efe4] px-3 py-1 text-xs font-semibold text-[#48505a]">
                                                {requestTypeLabel(booking.request_type)}
                                            </span>
                                            {attention ? (
                                                <span className="rounded-full bg-[#eef4ff] px-3 py-1 text-xs font-semibold text-[#30527a]">
                                                    {attention}
                                                </span>
                                            ) : null}
                                        </div>

                                        <div className="space-y-2">
                                            <h3 className="text-2xl font-semibold text-[#17202b]">{displayName}</h3>
                                            <p className="text-sm leading-7 text-[#68707a]">
                                                {booking.therapist_menu
                                                    ? `${booking.therapist_menu.name} / ${booking.therapist_menu.duration_minutes}分`
                                                    : 'メニュー情報を確認中'}
                                            </p>
                                        </div>

                                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                            <div>
                                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">日時</p>
                                                <p className="mt-2 text-sm font-semibold text-[#17202b]">{buildScheduleLine(booking)}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">待ち合わせ場所</p>
                                                <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                                    {booking.service_address ? getServiceAddressLabel(booking.service_address) : '未設定'}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">支払い予定額</p>
                                                <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                                    {formatCurrency(booking.total_amount)}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">決済状態</p>
                                                <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                                    {paymentStatusLabel(booking.current_payment_intent?.status)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="xl:min-w-[240px]">
                                        <div className="rounded-[24px] bg-[#f8f4ed] p-4">
                                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">STATUS</p>
                                            <div className="mt-4 grid gap-3 text-sm text-[#48505a]">
                                                <div className="flex items-center justify-between gap-4">
                                                    <span>未読メッセージ</span>
                                                    <span className="font-semibold text-[#17202b]">{booking.unread_message_count}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-4">
                                                    <span>返金件数</span>
                                                    <span className="font-semibold text-[#17202b]">{booking.refund_count}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-4">
                                                    <span>未解決通報</span>
                                                    <span className="font-semibold text-[#17202b]">{booking.open_report_count}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-4">
                                                    <span>最新メッセージ</span>
                                                    <span className="font-semibold text-[#17202b]">
                                                        {booking.latest_message_sent_at ? formatDateTime(booking.latest_message_sent_at) : 'なし'}
                                                    </span>
                                                </div>
                                                {booking.request_expires_at ? (
                                                    <div className="flex items-center justify-between gap-4">
                                                        <span>応答期限</span>
                                                        <span className="font-semibold text-[#17202b]">
                                                            {formatDateTime(booking.request_expires_at)}
                                                        </span>
                                                    </div>
                                                ) : null}
                                            </div>

                                            <div className="mt-5 grid gap-2">
                                                <Link
                                                    to={`/user/bookings/${booking.public_id}`}
                                                    className="inline-flex w-full items-center justify-center rounded-full bg-[#17202b] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#243447]"
                                                >
                                                    詳細を見る
                                                </Link>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </section>
            ) : (
                <section className="rounded-[28px] border border-dashed border-white/15 bg-white/5 p-8 text-center">
                    <h2 className="text-2xl font-semibold text-white">条件に合う予約はありません</h2>
                    <p className="mt-3 text-sm leading-7 text-slate-300">
                        新しい予約を探すか、表示条件をゆるめて見直してみてください。
                    </p>
                    <Link
                        to="/user/therapists"
                        className="mt-6 inline-flex items-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:brightness-105"
                    >
                        セラピストを探す
                    </Link>
                </section>
            )}
        </div>
    );
}
