import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { getServiceAddressLabel } from '../lib/discovery';
import type {
    ApiEnvelope,
    BookingDetailRecord,
    BookingMessageRecord,
    BookingMessagesMeta,
} from '../lib/types';

type ReadFilter = 'all' | 'unread' | 'read';

type BookingMessagesResponse = ApiEnvelope<BookingMessageRecord[]> & {
    meta?: BookingMessagesMeta;
};

function normalizeReadFilter(value: string | null): ReadFilter {
    if (value === 'read' || value === 'unread') {
        return value;
    }

    return 'all';
}

function statusLabel(status: string): string {
    switch (status) {
        case 'payment_authorizing':
            return '与信確認中';
        case 'requested':
            return '承諾待ち';
        case 'accepted':
            return '予約確定';
        case 'moving':
            return '移動中';
        case 'arrived':
            return '到着';
        case 'in_progress':
            return '施術中';
        case 'therapist_completed':
            return '利用者の完了確認待ち';
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
            return status;
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

function formatDateTime(value: string | null): string {
    if (!value) {
        return '未設定';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '未設定';
    }

    return new Intl.DateTimeFormat('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

function buildPrimaryTime(booking: BookingDetailRecord): string {
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

function readFilterLabel(filter: ReadFilter): string {
    switch (filter) {
        case 'unread':
            return '未読のみ';
        case 'read':
            return '既読のみ';
        default:
            return 'すべて';
    }
}

function stageHint(status: string): string {
    switch (status) {
        case 'accepted':
            return '移動前の連絡を確認できる状態です。';
        case 'moving':
            return '到着前のやり取りが中心です。';
        case 'arrived':
            return '入室や開始前の確認に使います。';
        case 'in_progress':
            return '施術中の連絡履歴です。';
        case 'therapist_completed':
            return '利用者の完了確認待ちです。';
        case 'completed':
            return '完了後の履歴として確認できます。';
        default:
            return '予約状況に応じた連絡履歴を確認できます。';
    }
}

export function TherapistBookingMessagesPage() {
    const { publicId } = useParams();
    const { token } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const readFilter = normalizeReadFilter(searchParams.get('read_status'));

    const [booking, setBooking] = useState<BookingDetailRecord | null>(null);
    const [messages, setMessages] = useState<BookingMessageRecord[]>([]);
    const [meta, setMeta] = useState<BookingMessagesMeta | null>(null);
    const [draft, setDraft] = useState('');
    const [pageError, setPageError] = useState<string | null>(null);
    const [composeError, setComposeError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [pendingReadIds, setPendingReadIds] = useState<number[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSending, setIsSending] = useState(false);

    usePageTitle(
        booking
            ? `${booking.counterparty?.display_name ?? meta?.counterparty?.display_name ?? '予約'}とのメッセージ`
            : '予約メッセージ',
    );

    const loadData = useCallback(async (nextIsRefresh = false) => {
        if (!token || !publicId) {
            setIsLoading(false);
            return;
        }

        if (nextIsRefresh) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }

        setSuccessMessage(null);

        try {
            const query = readFilter === 'all' ? '' : `?read_status=${readFilter}`;
            const [bookingPayload, messagesPayload] = await Promise.all([
                apiRequest<ApiEnvelope<BookingDetailRecord>>(`/bookings/${publicId}`, {
                    token,
                }),
                apiRequest<BookingMessagesResponse>(`/bookings/${publicId}/messages${query}`, {
                    token,
                }),
            ]);

            setBooking(unwrapData(bookingPayload));
            setMessages(unwrapData(messagesPayload));
            setMeta(messagesPayload.meta ?? null);
            setPageError(null);
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '予約メッセージの取得に失敗しました。';

            setPageError(message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [publicId, readFilter, token]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const counterpartyName = booking?.counterparty?.display_name
        ?? meta?.counterparty?.display_name
        ?? '利用者を確認中';

    const unreadIncomingCount = useMemo(
        () => messages.filter((message) => !message.is_own && !message.is_read).length,
        [messages],
    );

    async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token || !publicId || !draft.trim()) {
            return;
        }

        setIsSending(true);
        setComposeError(null);
        setPageError(null);
        setSuccessMessage(null);

        try {
            await apiRequest<ApiEnvelope<BookingMessageRecord>>(`/bookings/${publicId}/messages`, {
                method: 'POST',
                token,
                body: {
                    body: draft.trim(),
                },
            });

            setDraft('');
            setSuccessMessage('メッセージを送信しました。');
            await loadData(true);
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : 'メッセージの送信に失敗しました。';

            setComposeError(message);
        } finally {
            setIsSending(false);
        }
    }

    async function markAsRead(messageId: number) {
        if (!token || !publicId) {
            return;
        }

        setPendingReadIds((current) => [...current, messageId]);
        setPageError(null);
        setSuccessMessage(null);

        try {
            await apiRequest<ApiEnvelope<BookingMessageRecord>>(`/bookings/${publicId}/messages/${messageId}/read`, {
                method: 'POST',
                token,
            });

            await loadData(true);
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '既読更新に失敗しました。';

            setPageError(message);
        } finally {
            setPendingReadIds((current) => current.filter((id) => id !== messageId));
        }
    }

    if (isLoading) {
        return <LoadingScreen title="予約メッセージを読み込み中" message="利用者との連絡内容と未読状況を確認しています。" />;
    }

    if (!booking) {
        return (
            <div className="space-y-6">
                <section className="rounded-[28px] border border-[#f1d4b5] bg-[#fff4e8] px-6 py-5 text-sm text-[#9a4b35]">
                    {pageError ?? '予約メッセージを表示できませんでした。'}
                </section>
                <div className="flex flex-wrap gap-3">
                    <Link
                        to="/therapist/bookings"
                        className="inline-flex items-center rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/6"
                    >
                        予約一覧へ戻る
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[32px] bg-[linear-gradient(117deg,#17202b_0%,#243447_52%,#2b4158_100%)] p-7 text-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(booking.status)}`}>
                                {statusLabel(booking.status)}
                            </span>
                            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90">
                                {readFilterLabel(readFilter)}
                            </span>
                            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90">
                                受信未読 {meta?.unread_count ?? unreadIncomingCount}件
                            </span>
                        </div>
                        <div className="space-y-2">
                            <h1 className="text-3xl font-semibold">{counterpartyName}とのメッセージ</h1>
                            <p className="max-w-3xl text-sm leading-7 text-slate-300">
                                {booking.therapist_menu
                                    ? `${booking.therapist_menu.name} / ${booking.therapist_menu.duration_minutes}分`
                                    : 'メニュー情報を確認中'} ・ {buildPrimaryTime(booking)}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                void loadData(true);
                            }}
                            disabled={isRefreshing}
                            className="inline-flex items-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isRefreshing ? '更新中...' : '更新'}
                        </button>
                        <Link
                            to={`/therapist/bookings/${booking.public_id}`}
                            className="inline-flex items-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8"
                        >
                            予約詳細へ戻る
                        </Link>
                    </div>
                </div>
            </section>

            {pageError ? (
                <section className="rounded-[24px] border border-[#f1d4b5] bg-[#fff4e8] px-5 py-4 text-sm text-[#9a4b35]">
                    {pageError}
                </section>
            ) : null}


            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                    <div className="flex flex-col gap-4 border-b border-[#efe5d7] pb-5 md:flex-row md:items-end md:justify-between">
                        <div>
                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">メッセージ履歴</p>
                            <h2 className="mt-2 text-2xl font-semibold text-[#17202b]">やり取り一覧</h2>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {[
                                ['all', 'すべて'],
                                ['unread', '未読のみ'],
                                ['read', '既読のみ'],
                            ].map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => {
                                        setSearchParams((previous) => {
                                            const next = new URLSearchParams(previous);

                                            if (value === 'all') {
                                                next.delete('read_status');
                                            } else {
                                                next.set('read_status', value);
                                            }

                                            return next;
                                        });
                                    }}
                                    className={[
                                        'rounded-full px-4 py-2 text-sm font-semibold transition',
                                        readFilter === value
                                            ? 'bg-[#17202b] text-white'
                                            : 'bg-[#f5efe4] text-[#48505a] hover:bg-[#ebe2d3]',
                                    ].join(' ')}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mt-6 space-y-4">
                        {messages.length > 0 ? messages.map((message) => {
                            const isPendingRead = pendingReadIds.includes(message.id);

                            return (
                                <article
                                    key={message.id}
                                    className={`rounded-[24px] px-5 py-4 ${
                                        message.is_own
                                            ? 'bg-[#17202b] text-white'
                                            : 'bg-[#f8f4ed] text-[#17202b]'
                                    }`}
                                >
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="space-y-1">
                                            <p className={`text-sm font-semibold ${message.is_own ? 'text-white' : 'text-[#17202b]'}`}>
                                                {message.sender?.display_name ?? (message.is_own ? 'あなた' : '利用者')}
                                            </p>
                                            <p className={`text-sm leading-7 ${message.is_own ? 'text-slate-200' : 'text-[#48505a]'}`}>
                                                {message.body}
                                            </p>
                                        </div>

                                        <div className={`flex flex-col items-start gap-2 text-xs sm:items-end ${message.is_own ? 'text-slate-300' : 'text-[#68707a]'}`}>
                                            <span>{formatDateTime(message.sent_at)}</span>
                                            {!message.is_own && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        void markAsRead(message.id);
                                                    }}
                                                    disabled={message.is_read || isPendingRead}
                                                    className={`rounded-full px-3 py-1 font-semibold transition ${
                                                        message.is_read
                                                            ? 'bg-white/70 text-[#68707a]'
                                                            : 'bg-[#17202b] text-white hover:bg-[#243447]'
                                                    } disabled:cursor-not-allowed disabled:opacity-60`}
                                                >
                                                    {message.is_read ? '既読' : isPendingRead ? '更新中...' : '既読にする'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </article>
                            );
                        }) : (
                            <div className="rounded-[24px] border border-dashed border-[#e4d7c2] bg-[#fffaf3] px-5 py-8 text-center">
                                <p className="text-sm font-semibold text-[#17202b]">メッセージはまだありません。</p>
                                <p className="mt-2 text-sm leading-7 text-[#68707a]">
                                    待ち合わせ場所や待ち合わせ方法の確認が必要なら、ここから最初の連絡を送れます。
                                </p>
                            </div>
                        )}
                    </div>

                    <form onSubmit={handleSendMessage} className="mt-6 space-y-3 border-t border-[#efe5d7] pt-5">
                        <div className="space-y-2">
                            <label htmlFor="therapist-message-body" className="text-sm font-semibold text-[#17202b]">
                                メッセージを送る
                            </label>
                            <textarea
                                id="therapist-message-body"
                                value={draft}
                                onChange={(event) => {
                                    setDraft(event.target.value);
                                }}
                                rows={4}
                                placeholder="例: 到着予定時刻や入室方法があれば教えてください。"
                                className="w-full rounded-[18px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm leading-7 text-[#17202b] outline-none transition focus:border-[#c6a16a]"
                            />
                        </div>

                        {composeError ? (
                            <p className="text-sm text-[#9a4b35]">{composeError}</p>
                        ) : null}

                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-xs leading-6 text-[#68707a]">
                                連絡先交換につながる文言は送れません。待ち合わせ・待ち合わせ場所・タイミング確認に絞って使います。
                            </p>
                            <button
                                type="submit"
                                disabled={isSending || !draft.trim()}
                                className="inline-flex items-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243447] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isSending ? '送信中...' : '送信する'}
                            </button>
                        </div>
                    </form>
                </section>

                <aside className="space-y-5">
                    <section className="rounded-[28px] bg-[#fffcf7] p-6 shadow-[0_18px_36px_rgba(23,32,43,0.1)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">予約情報</p>
                        <div className="mt-4 space-y-4 text-sm text-[#48505a]">
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">予約状況</p>
                                <p className="mt-1">
                                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(booking.status)}`}>
                                        {statusLabel(booking.status)}
                                    </span>
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">利用者</p>
                                <p className="mt-1 font-semibold text-[#17202b]">{counterpartyName}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">日時</p>
                                <p className="mt-1 font-semibold text-[#17202b]">{buildPrimaryTime(booking)}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">待ち合わせ場所</p>
                                <p className="mt-1 font-semibold text-[#17202b]">
                                    {booking.service_address ? getServiceAddressLabel(booking.service_address) : '未設定'}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">運用メモ</p>
                                <p className="mt-1 text-sm leading-7 text-[#48505a]">{stageHint(booking.status)}</p>
                            </div>
                        </div>

                        <div className="mt-6 space-y-3">
                            <Link
                                to={`/therapist/bookings/${booking.public_id}`}
                                className="inline-flex w-full items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243447]"
                            >
                                予約詳細へ戻る
                            </Link>
                            <Link
                                to="/therapist/bookings"
                                className="inline-flex w-full items-center justify-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                            >
                                予約一覧へ戻る
                            </Link>
                        </div>
                    </section>
                </aside>
            </div>
        </div>
    );
}
