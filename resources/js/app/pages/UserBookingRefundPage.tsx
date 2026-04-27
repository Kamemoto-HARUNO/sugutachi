import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatCurrency, getServiceAddressLabel } from '../lib/discovery';
import { formatDateTime } from '../lib/therapist';
import type {
    ApiEnvelope,
    BookingDetailRecord,
    RefundRequestRecord,
} from '../lib/types';

const refundReasonOptions = [
    { value: 'service_not_delivered', label: '施術が提供されなかった' },
    { value: 'service_issue', label: '施術内容に問題があった' },
    { value: 'billing_issue', label: '請求内容を確認したい' },
    { value: 'therapist_cancel', label: 'セラピスト都合キャンセル分の確認' },
    { value: 'other', label: 'その他' },
];

function refundStatusLabel(status: string): string {
    switch (status) {
        case 'requested':
            return '申請中';
        case 'approved':
            return '承認済み';
        case 'processed':
            return '返金完了';
        case 'rejected':
            return '却下';
        default:
            return status;
    }
}

function refundStatusTone(status: string): string {
    switch (status) {
        case 'processed':
            return 'bg-[#e9f4ea] text-[#24553a]';
        case 'approved':
            return 'bg-[#eaf2ff] text-[#30527a]';
        case 'requested':
            return 'bg-[#fff2dd] text-[#8b5a16]';
        case 'rejected':
            return 'bg-[#f7e7e3] text-[#8c4738]';
        default:
            return 'bg-[#f1efe8] text-[#48505a]';
    }
}

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
            return status;
    }
}

export function UserBookingRefundPage() {
    const { publicId } = useParams<{ publicId: string }>();
    const { token } = useAuth();
    const [booking, setBooking] = useState<BookingDetailRecord | null>(null);
    const [refunds, setRefunds] = useState<RefundRequestRecord[]>([]);
    const [reasonCode, setReasonCode] = useState(refundReasonOptions[0]?.value ?? 'service_not_delivered');
    const [requestedAmount, setRequestedAmount] = useState('');
    const [detail, setDetail] = useState('');
    const [pageError, setPageError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    usePageTitle('返金申請');
    useToastOnMessage(successMessage, 'success');

    const loadPage = useCallback(async () => {
        if (!token || !publicId) {
            return;
        }

        setPageError(null);

        try {
            const [bookingPayload, refundsPayload] = await Promise.all([
                apiRequest<ApiEnvelope<BookingDetailRecord>>(`/bookings/${publicId}`, { token }),
                apiRequest<ApiEnvelope<RefundRequestRecord[]>>(`/bookings/${publicId}/refund-requests`, { token }),
            ]);

            setBooking(unwrapData(bookingPayload));
            setRefunds(unwrapData(refundsPayload));
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '返金情報の取得に失敗しました。';

            setPageError(message);
        } finally {
            setIsLoading(false);
        }
    }, [publicId, token]);

    useEffect(() => {
        void loadPage();
    }, [loadPage]);

    const hasOpenRequest = useMemo(
        () => refunds.some((refund) => refund.status === 'requested' || refund.status === 'approved'),
        [refunds],
    );

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token || !publicId || !booking) {
            return;
        }

        setIsSubmitting(true);
        setFormError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<RefundRequestRecord>>(`/bookings/${publicId}/refund-requests`, {
                method: 'POST',
                token,
                body: {
                    reason_code: reasonCode,
                    detail: detail.trim() || null,
                    requested_amount: requestedAmount.trim() ? Number(requestedAmount) : null,
                },
            });

            const created = unwrapData(payload);
            setRefunds((current) => [created, ...current]);
            setSuccessMessage('返金申請を送信しました。運営確認後の結果はこの画面で追えます。');
            setDetail('');
            setRequestedAmount('');
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '返金申請の送信に失敗しました。';

            setFormError(message);
        } finally {
            setIsSubmitting(false);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="返金情報を読み込み中" message="予約状態と既存の返金申請を確認しています。" />;
    }

    if (!booking) {
        return (
            <div className="space-y-6 rounded-[28px] bg-white p-6 text-[#17202b] shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                <p className="text-sm font-semibold text-[#9a7a49]">REFUND REQUEST</p>
                <h1 className="text-3xl font-semibold">返金申請画面を開けませんでした</h1>
                <p className="text-sm leading-7 text-[#68707a]">
                    {pageError ?? '対象予約の返金情報を確認できませんでした。予約詳細へ戻って状態を確認してください。'}
                </p>
                <div className="flex flex-wrap gap-3">
                    <Link
                        to={publicId ? `/user/bookings/${publicId}` : '/user/bookings'}
                        className="inline-flex min-h-11 items-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140]"
                    >
                        予約詳細へ戻る
                    </Link>
                    <Link
                        to="/user/bookings"
                        className="inline-flex min-h-11 items-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                    >
                        予約一覧へ
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <section className="rounded-[32px] bg-[linear-gradient(140deg,#17202b_0%,#223245_100%)] p-6 text-white shadow-[0_24px_60px_rgba(15,23,42,0.28)] sm:p-8">
                <p className="text-xs font-semibold tracking-wide text-[#f3dec0]">REFUND REQUEST</p>
                <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-3">
                        <h1 className="text-3xl font-semibold">返金申請</h1>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            完了後の不備確認や、キャンセルに伴う返金状況をこの画面で追えます。進行中の申請がある場合は重複して送信できません。
                        </p>
                    </div>
                    <div className="rounded-[22px] border border-white/10 bg-white/5 px-5 py-4 text-sm text-slate-200">
                        <p className="text-xs font-semibold tracking-wide text-slate-400">現在の予約状態</p>
                        <p className="mt-2 text-lg font-semibold text-white">{bookingStatusLabel(booking.status)}</p>
                    </div>
                </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_380px]">
                <section className="space-y-6">
                    <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">BOOKING SUMMARY</p>
                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                            <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#7d6852]">相手</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                    {booking.counterparty?.display_name ?? booking.therapist_profile?.public_name ?? '確認中'}
                                </p>
                            </div>
                            <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#7d6852]">待ち合わせ場所</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                    {booking.service_address ? getServiceAddressLabel(booking.service_address) : '未設定'}
                                </p>
                            </div>
                            <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#7d6852]">総額</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">{formatCurrency(booking.total_amount)}</p>
                            </div>
                            <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#7d6852]">既存返金件数</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">{refunds.length}件</p>
                            </div>
                        </div>
                    </article>

                    <form onSubmit={(event) => void handleSubmit(event)} className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">REQUEST FORM</p>
                        <h2 className="mt-2 text-2xl font-semibold text-[#17202b]">新しい返金申請を送る</h2>
                        <p className="mt-3 text-sm leading-7 text-[#68707a]">
                            金額を空欄にすると予約総額で申請します。すでに進行中の申請がある場合は、結果が出るまで待ってください。
                        </p>

                        <div className="mt-6 space-y-5">
                            <label className="block space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">理由</span>
                                <select
                                    value={reasonCode}
                                    onChange={(event) => setReasonCode(event.target.value)}
                                    disabled={hasOpenRequest}
                                    className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {refundReasonOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="block space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">希望返金額（任意）</span>
                                <input
                                    value={requestedAmount}
                                    onChange={(event) => setRequestedAmount(event.target.value.replace(/[^\d]/g, ''))}
                                    inputMode="numeric"
                                    placeholder={`上限 ${booking.total_amount.toLocaleString('ja-JP')}`}
                                    disabled={hasOpenRequest}
                                    className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d] disabled:cursor-not-allowed disabled:opacity-60"
                                />
                            </label>

                            <label className="block space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">詳細</span>
                                <textarea
                                    value={detail}
                                    onChange={(event) => setDetail(event.target.value)}
                                    rows={5}
                                    disabled={hasOpenRequest}
                                    placeholder="返金を希望する理由や確認したい点を入力"
                                    className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm leading-7 text-[#17202b] outline-none transition focus:border-[#b5894d] disabled:cursor-not-allowed disabled:opacity-60"
                                />
                            </label>
                        </div>

                        {hasOpenRequest ? (
                            <div className="mt-5 rounded-[20px] border border-amber-300/40 bg-amber-50 px-4 py-3 text-sm text-[#8b5a16]">
                                進行中の返金申請があるため、新しい申請は送れません。下の一覧で状況を確認してください。
                            </div>
                        ) : null}

                        {formError ? (
                            <div className="mt-5 rounded-[20px] border border-amber-300/40 bg-amber-50 px-4 py-3 text-sm text-[#8b5a16]">
                                {formError}
                            </div>
                        ) : null}


                        <div className="mt-6 flex flex-wrap gap-3">
                            <button
                                type="submit"
                                disabled={hasOpenRequest || isSubmitting}
                                className="inline-flex min-h-11 items-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isSubmitting ? '送信中...' : '返金申請を送る'}
                            </button>
                            <Link
                                to={`/user/bookings/${booking.public_id}`}
                                className="inline-flex min-h-11 items-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                            >
                                予約詳細へ戻る
                            </Link>
                        </div>
                    </form>
                </section>

                <aside className="space-y-5">
                    <section className="rounded-[28px] bg-[#fffcf7] p-6 shadow-[0_18px_36px_rgba(23,32,43,0.1)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">REQUEST HISTORY</p>
                        <h2 className="mt-2 text-2xl font-semibold text-[#17202b]">申請履歴</h2>
                        <div className="mt-5 space-y-3">
                            {refunds.length > 0 ? refunds.map((refund) => (
                                <div key={refund.public_id} className="rounded-[20px] border border-[#ebe2d3] bg-white px-4 py-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${refundStatusTone(refund.status)}`}>
                                            {refundStatusLabel(refund.status)}
                                        </span>
                                        <p className="text-xs text-[#7d6852]">{formatDateTime(refund.processed_at ?? refund.created_at)}</p>
                                    </div>
                                    <p className="mt-3 text-sm font-semibold text-[#17202b]">
                                        {formatCurrency(refund.approved_amount ?? refund.requested_amount ?? booking.total_amount)}
                                    </p>
                                    <p className="mt-1 text-sm text-[#68707a]">理由: {refund.reason_code ?? '未設定'}</p>
                                </div>
                            )) : (
                                <p className="text-sm leading-7 text-[#68707a]">まだ返金申請はありません。</p>
                            )}
                        </div>
                    </section>
                </aside>
            </div>
        </div>
    );
}
