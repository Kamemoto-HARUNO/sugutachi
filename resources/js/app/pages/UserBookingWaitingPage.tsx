import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { BookingFlowSteps } from '../components/booking/BookingFlowSteps';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatJstDateTime } from '../lib/datetime';
import { formatCurrency, getServiceAddressLabel } from '../lib/discovery';
import type {
    ApiEnvelope,
    BookingDetailRecord,
    PaymentIntentRecord,
} from '../lib/types';

const pollingStatuses = new Set(['payment_authorizing', 'requested']);

function bookingStatusLabel(status: string): string {
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
            return '対応中';
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
            return status;
    }
}

function bookingStatusTone(status: string): string {
    switch (status) {
        case 'accepted':
        case 'moving':
        case 'arrived':
        case 'in_progress':
            return 'bg-[#eaf2ff] text-[#30527a]';
        case 'completed':
            return 'bg-[#e9f4ea] text-[#24553a]';
        case 'payment_authorizing':
        case 'requested':
        case 'therapist_completed':
            return 'bg-[#fff2dd] text-[#8b5a16]';
        default:
            return 'bg-[#f7e7e3] text-[#8c4738]';
    }
}

function requestStatusLabel(booking: BookingDetailRecord): string {
    if (booking.status === 'requested' && booking.pending_adjustment_proposal) {
        return '時間変更の確認待ち';
    }

    return bookingStatusLabel(booking.status);
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
            return '確認中';
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

function waitingHeadline(booking: BookingDetailRecord): string {
    switch (booking.status) {
        case 'payment_authorizing':
            return booking.current_payment_intent?.status === 'requires_capture'
                ? 'カード与信は確保済みです'
                : 'カード与信を確認しています';
        case 'requested':
            return booking.pending_adjustment_proposal
                ? 'セラピストから時間変更の提案が届いています'
                : 'セラピストの承諾を待っています';
        case 'accepted':
            return '予約が確定しました';
        case 'rejected':
            return '今回は辞退されました';
        case 'expired':
            return 'リクエスト期限が過ぎました';
        case 'payment_canceled':
            return '与信は取り消されました';
        case 'canceled':
            return '予約はキャンセルされました';
        default:
            return '予約状態を確認しています';
    }
}

function waitingDescription(booking: BookingDetailRecord): string {
    switch (booking.status) {
        case 'payment_authorizing':
            return booking.current_payment_intent?.status === 'requires_capture'
                ? 'カード与信は確保済みです。承諾待ちへ切り替わるまで、この画面でそのままお待ちください。'
                : 'カード与信の確認が終わると、承諾待ちへ進みます。';
        case 'requested':
            return booking.pending_adjustment_proposal
                ? '開始時間、終了時間、金額の変更案が届いています。内容を確認して、この条件で進めるか見送るかを選んでください。'
                : '承諾されるまで仮押さえ状態です。期限切れや辞退になった場合は与信取消の対象です。';
        case 'accepted':
            return 'メッセージや予約詳細から、当日の連絡と進行確認を続けられます。';
        case 'rejected':
        case 'expired':
        case 'payment_canceled':
        case 'canceled':
            return '別の日時や別のセラピストで検索を続けられます。';
        default:
            return '予約詳細と支払い状態をこの画面で追えます。';
    }
}

export function UserBookingWaitingPage() {
    const { token } = useAuth();
    const [searchParams] = useSearchParams();
    const [booking, setBooking] = useState<BookingDetailRecord | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isResolvingAdjustment, setIsResolvingAdjustment] = useState(false);

    const bookingId = searchParams.get('booking_id');

    usePageTitle('予約待機');
    useToastOnMessage(error, 'error');
    useToastOnMessage(successMessage, 'success');

    const loadBooking = useCallback(async (refreshOnly = false) => {
        if (!token || !bookingId) {
            return;
        }

        if (refreshOnly) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }

        try {
            const payload = await apiRequest<ApiEnvelope<{ booking: BookingDetailRecord; payment_intent: PaymentIntentRecord | null }>>(
                `/bookings/${bookingId}/payment-sync`,
                {
                    method: 'POST',
                    token,
                },
            );
            const synced = unwrapData(payload);
            setBooking(synced.booking);
            setError(null);
        } catch (requestError) {
            const nextMessage = requestError instanceof ApiError
                ? requestError.message
                : '予約状態の取得に失敗しました。';

            setError(nextMessage);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [bookingId, token]);

    useEffect(() => {
        void loadBooking();
    }, [loadBooking]);

    useEffect(() => {
        if (!booking || !pollingStatuses.has(booking.status)) {
            return;
        }

        const intervalId = window.setInterval(() => {
            void loadBooking(true);
        }, 15000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [booking, loadBooking]);

    async function handleAcceptAdjustment() {
        if (!token || !booking?.pending_adjustment_proposal || isResolvingAdjustment) {
            return;
        }

        setIsResolvingAdjustment(true);
        setError(null);
        setSuccessMessage(null);

        try {
            await apiRequest<ApiEnvelope<BookingDetailRecord>>(`/bookings/${booking.public_id}/adjustment-accept`, {
                method: 'POST',
                token,
            });
            await loadBooking(true);
            setSuccessMessage('時間変更の内容を確認しました。この条件で予約が確定しています。');
        } catch (requestError) {
            const nextMessage = requestError instanceof ApiError
                ? requestError.message
                : '時間変更の確認に失敗しました。';

            setError(nextMessage);
        } finally {
            setIsResolvingAdjustment(false);
        }
    }

    async function handleRejectAdjustment() {
        if (!token || !booking?.pending_adjustment_proposal || isResolvingAdjustment) {
            return;
        }

        const confirmed = window.confirm('この時間変更案を見送ると、この予約リクエストは取り下げになります。よろしいですか？');

        if (!confirmed) {
            return;
        }

        setIsResolvingAdjustment(true);
        setError(null);
        setSuccessMessage(null);

        try {
            await apiRequest<ApiEnvelope<BookingDetailRecord>>(`/bookings/${booking.public_id}/adjustment-reject`, {
                method: 'POST',
                token,
            });
            await loadBooking(true);
            setSuccessMessage('時間変更案を見送りました。予約リクエストは取り下げになります。');
        } catch (requestError) {
            const nextMessage = requestError instanceof ApiError
                ? requestError.message
                : '時間変更案の見送りに失敗しました。';

            setError(nextMessage);
        } finally {
            setIsResolvingAdjustment(false);
        }
    }

    const timelineRows = useMemo(() => {
        if (!booking) {
            return [];
        }

        return [
            { label: '予約作成', value: formatDateTime(booking.created_at) },
            { label: '承諾期限', value: formatDateTime(booking.request_expires_at) },
            { label: '承諾時刻', value: formatDateTime(booking.accepted_at) },
            { label: 'キャンセル時刻', value: formatDateTime(booking.canceled_at) },
        ].filter((row) => row.value !== '未設定');
    }, [booking]);

    if (!bookingId) {
        return <Navigate to="/user/bookings" replace />;
    }

    if (isLoading) {
        return <LoadingScreen title="予約待機画面を準備中" message="最新の予約状態と支払い状況を読み込んでいます。" />;
    }

    if (!booking) {
        return (
            <div className="space-y-6 rounded-[28px] bg-white p-6 text-[#17202b] shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                <p className="text-sm font-semibold text-[#9a7a49]">BOOKING WAITING</p>
                <h1 className="text-3xl font-semibold">待機中の予約を開けませんでした</h1>
                <p className="text-sm leading-7 text-[#68707a]">
                    {error ?? '予約状態を確認できませんでした。予約一覧に戻って対象の予約を開き直してください。'}
                </p>
                <div className="flex flex-wrap gap-3">
                    <Link
                        to="/user/bookings"
                        className="inline-flex min-h-11 items-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140]"
                    >
                        予約一覧へ
                    </Link>
                </div>
            </div>
        );
    }

    const bookingDetailPath = `/user/bookings/${booking.public_id}`;
    const messagesPath = `${bookingDetailPath}/messages`;
    const cancelPath = `${bookingDetailPath}/cancel`;

    return (
        <div className="space-y-8">
            <section className="rounded-[32px] bg-[linear-gradient(140deg,#17202b_0%,#223245_100%)] p-6 text-white shadow-[0_24px_60px_rgba(15,23,42,0.28)] sm:p-8">
                <p className="text-xs font-semibold tracking-wide text-[#f3dec0]">STEP 2</p>
                <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-3">
                        <h1 className="text-3xl font-semibold">{waitingHeadline(booking)}</h1>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            {waitingDescription(booking)}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void loadBooking(true)}
                        disabled={isRefreshing}
                        className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isRefreshing ? '更新しています...' : '最新状態を更新'}
                    </button>
                </div>
            </section>

            <BookingFlowSteps current="waiting" />


            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_360px]">
                <section className="space-y-6">
                    <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">BOOKING</p>
                                <h2 className="mt-2 text-2xl font-semibold text-[#17202b]">
                                    {booking.therapist_profile?.public_name ?? booking.counterparty?.display_name ?? '予約相手を確認中'}
                                </h2>
                                <p className="mt-3 text-sm leading-7 text-[#68707a]">
                                    {booking.therapist_menu
                                        ? `${booking.therapist_menu.name} / ${booking.therapist_menu.duration_minutes}分`
                                        : 'メニュー情報を確認中'}
                                </p>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${bookingStatusTone(booking.status)}`}>
                                {requestStatusLabel(booking)}
                            </span>
                        </div>

                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                            <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#7d6852]">開始予定</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                    {formatDateTime(booking.scheduled_start_at ?? booking.requested_start_at)}
                                </p>
                            </div>
                            <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#7d6852]">待ち合わせ場所</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                    {booking.service_address ? getServiceAddressLabel(booking.service_address) : '未設定'}
                                </p>
                            </div>
                            <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#7d6852]">支払い予定額</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                    {formatCurrency(booking.total_amount)}
                                </p>
                            </div>
                            <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#7d6852]">カード与信状態</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                    {paymentStatusLabel(booking.current_payment_intent?.status)}
                                </p>
                            </div>
                        </div>
                    </article>

                    {booking.status === 'requested' && booking.pending_adjustment_proposal ? (
                        <article className="rounded-[28px] border border-[#d7e5ff] bg-[#f6f9ff] p-6 shadow-[0_18px_36px_rgba(23,32,43,0.08)]">
                            <p className="text-xs font-semibold tracking-wide text-[#5472a0]">時間変更の提案</p>
                            <h2 className="mt-2 text-2xl font-semibold text-[#17202b]">この条件で進めるか確認してください</h2>
                            <p className="mt-2 text-sm leading-7 text-[#68707a]">
                                セラピストから時間調整の提案が届いています。問題なければこの条件で予約を確定できます。
                            </p>
                            <div className="mt-5 grid gap-4 md:grid-cols-2">
                                <div className="rounded-[20px] bg-white px-4 py-4">
                                    <p className="text-xs font-semibold tracking-wide text-[#7d6852]">あなたの希望時間</p>
                                    <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                        {formatDateTime(booking.scheduled_start_at ?? booking.requested_start_at)} - {formatDateTime(booking.scheduled_end_at)}
                                    </p>
                                </div>
                                <div className="rounded-[20px] bg-white px-4 py-4">
                                    <p className="text-xs font-semibold tracking-wide text-[#7d6852]">セラピストの提案時間</p>
                                    <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                        {formatDateTime(booking.pending_adjustment_proposal.scheduled_start_at)} - {formatDateTime(booking.pending_adjustment_proposal.scheduled_end_at)}
                                    </p>
                                </div>
                                <div className="rounded-[20px] bg-white px-4 py-4">
                                    <p className="text-xs font-semibold tracking-wide text-[#7d6852]">もとの金額</p>
                                    <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                        {formatCurrency(booking.total_amount)}
                                    </p>
                                </div>
                                <div className="rounded-[20px] bg-white px-4 py-4">
                                    <p className="text-xs font-semibold tracking-wide text-[#7d6852]">提案後の金額</p>
                                    <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                        {formatCurrency(booking.pending_adjustment_proposal.total_amount)}
                                    </p>
                                </div>
                            </div>
                            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                                <button
                                    type="button"
                                    onClick={() => void handleAcceptAdjustment()}
                                    disabled={isResolvingAdjustment}
                                    className="inline-flex items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isResolvingAdjustment ? '確認中...' : 'この条件で進める'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void handleRejectAdjustment()}
                                    disabled={isResolvingAdjustment}
                                    className="inline-flex items-center justify-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    今回は見送る
                                </button>
                            </div>
                        </article>
                    ) : null}

                    <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">TIMELINE</p>
                        <div className="mt-5 space-y-3">
                            {timelineRows.length > 0 ? (
                                timelineRows.map((row) => (
                                    <div key={row.label} className="flex items-center justify-between gap-4 rounded-[18px] bg-[#f8f4ed] px-4 py-3 text-sm">
                                        <span className="text-[#68707a]">{row.label}</span>
                                        <span className="font-semibold text-[#17202b]">{row.value}</span>
                                    </div>
                                ))
                            ) : (
                                <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4 text-sm leading-7 text-[#68707a]">
                                    まだ表示できる履歴がありません。最新状態の到着を待っています。
                                </div>
                            )}
                        </div>
                    </article>
                </section>

                <aside className="space-y-5">
                    <section className="rounded-[28px] bg-[#fffcf7] p-6 shadow-[0_18px_36px_rgba(23,32,43,0.1)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">NEXT ACTION</p>
                        <div className="mt-4 space-y-3">
                            <Link
                                to={bookingDetailPath}
                                className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140]"
                            >
                                予約詳細を見る
                            </Link>
                            <Link
                                to={messagesPath}
                                className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                            >
                                メッセージを開く
                            </Link>
                            {(booking.status === 'payment_authorizing' || booking.status === 'requested' || booking.status === 'accepted') ? (
                                <Link
                                    to={cancelPath}
                                    className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                                >
                                    キャンセル条件を見る
                                </Link>
                            ) : null}
                        </div>
                    </section>

                    <section className="rounded-[28px] bg-[#17202b] p-6 text-white shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">STATUS NOTE</p>
                        <p className="mt-3 text-sm leading-7 text-[#d8d3ca]">
                            カード確認の直後は、承諾待ちへ切り替わるまで数秒かかることがあります。
                            自動で切り替わらないときは、この画面の更新ボタンでもう一度確認できます。
                        </p>
                    </section>
                </aside>
            </div>
        </div>
    );
}
