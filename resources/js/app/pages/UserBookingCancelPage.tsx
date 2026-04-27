import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatCurrency, getServiceAddressLabel } from '../lib/discovery';
import { formatDateTime } from '../lib/therapist';
import type {
    ApiEnvelope,
    BookingCancellationPreview,
    BookingDetailRecord,
} from '../lib/types';

const cancelReasonOptions = [
    { value: 'schedule_conflict', label: '予定の都合がつかない' },
    { value: 'location_issue', label: '場所の都合を見直したい' },
    { value: 'health_issue', label: '体調不良' },
    { value: 'safety_concern', label: '安全上の不安がある' },
    { value: 'emergency', label: '急な事情' },
    { value: 'other', label: 'その他' },
];

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

function paymentActionLabel(action: string): string {
    switch (action) {
        case 'void_authorization':
            return '与信を取り消して請求しません';
        case 'capture_full_amount':
            return '予約金額全額を確定します';
        case 'capture_cancel_fee_and_refund_remaining':
            return 'キャンセル料を確定し、残額を返金します';
        default:
            return action;
    }
}

function policyNote(preview: BookingCancellationPreview): string {
    switch (preview.policy_code) {
        case 'before_acceptance_free':
            return 'セラピスト承諾前なので無料で取り下げられます。';
        case 'accepted_before_24_hours_matching_fee':
            return '承諾後24時間前までは、マッチング手数料のみ差し引かれます。';
        case 'within_24_hours_half':
            return '開始24時間前を過ぎているため、一部キャンセル料が発生します。';
        case 'within_3_hours_full':
            return '開始3時間前以降のため、全額がキャンセル料扱いになります。';
        default:
            return '現在の予約状態に応じたキャンセル条件を適用します。';
    }
}

export function UserBookingCancelPage() {
    const { publicId } = useParams<{ publicId: string }>();
    const navigate = useNavigate();
    const { token } = useAuth();
    const [booking, setBooking] = useState<BookingDetailRecord | null>(null);
    const [preview, setPreview] = useState<BookingCancellationPreview | null>(null);
    const [reasonCode, setReasonCode] = useState(cancelReasonOptions[0]?.value ?? 'schedule_conflict');
    const [reasonNote, setReasonNote] = useState('');
    const [pageError, setPageError] = useState<string | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    usePageTitle('予約キャンセル');
    useToastOnMessage(successMessage, 'success');

    const loadPage = useCallback(async () => {
        if (!token || !publicId) {
            return;
        }

        setPageError(null);
        setSuccessMessage(null);

        try {
            const [bookingPayload, previewPayload] = await Promise.all([
                apiRequest<ApiEnvelope<BookingDetailRecord>>(`/bookings/${publicId}`, { token }),
                apiRequest<ApiEnvelope<BookingCancellationPreview>>(`/bookings/${publicId}/cancel-preview`, {
                    method: 'POST',
                    token,
                }),
            ]);

            setBooking(unwrapData(bookingPayload));
            setPreview(unwrapData(previewPayload));
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : 'キャンセル条件の確認に失敗しました。';

            setPageError(message);
        } finally {
            setIsLoading(false);
        }
    }, [publicId, token]);

    useEffect(() => {
        void loadPage();
    }, [loadPage]);

    const canSubmit = Boolean(booking && preview && !successMessage);
    const startAt = booking?.scheduled_start_at ?? booking?.requested_start_at ?? null;

    const summaryRows = useMemo(() => {
        if (!preview) {
            return [];
        }

        return [
            { label: 'キャンセル料', value: formatCurrency(preview.cancel_fee_amount) },
            { label: '返金予定額', value: formatCurrency(preview.refund_amount) },
            { label: '決済処理', value: paymentActionLabel(preview.payment_action) },
        ];
    }, [preview]);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token || !publicId || !canSubmit) {
            return;
        }

        setIsSubmitting(true);
        setSubmitError(null);

        try {
            const payload = await apiRequest<ApiEnvelope<{ booking: BookingDetailRecord; cancellation: BookingCancellationPreview }>>(
                `/bookings/${publicId}/cancel`,
                {
                    method: 'POST',
                    token,
                    body: {
                        reason_code: reasonCode,
                        reason_note: reasonNote.trim() || null,
                    },
                },
            );

            const nextBooking = unwrapData(payload).booking;
            setBooking(nextBooking);
            setSuccessMessage('キャンセル処理が完了しました。返金や決済状態は予約詳細でそのまま確認できます。');
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : 'キャンセル処理に失敗しました。';

            setSubmitError(message);
        } finally {
            setIsSubmitting(false);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="キャンセル条件を確認中" message="予約状態と返金・請求条件を読み込んでいます。" />;
    }

    if (!booking || !preview) {
        return (
            <div className="space-y-6 rounded-[28px] bg-white p-6 text-[#17202b] shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                <p className="text-sm font-semibold text-[#9a7a49]">BOOKING CANCEL</p>
                <h1 className="text-3xl font-semibold">この予約はキャンセル画面を開けません</h1>
                <p className="text-sm leading-7 text-[#68707a]">
                    {pageError ?? '現在の状態ではキャンセル条件を確認できませんでした。予約詳細へ戻って状態を確認してください。'}
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
                <p className="text-xs font-semibold tracking-wide text-[#f3dec0]">BOOKING CANCEL</p>
                <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-3">
                        <h1 className="text-3xl font-semibold">予約キャンセル</h1>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            キャンセル前に、現在の予約状態と返金・請求条件を確認できます。処理後は予約詳細で返金状況まで追えます。
                        </p>
                    </div>
                    <div className="rounded-[22px] border border-white/10 bg-white/5 px-5 py-4 text-sm text-slate-200">
                        <p className="text-xs font-semibold tracking-wide text-slate-400">現在の状態</p>
                        <p className="mt-2 text-lg font-semibold text-white">{bookingStatusLabel(booking.status)}</p>
                    </div>
                </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_360px]">
                <section className="space-y-6">
                    <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">BOOKING SUMMARY</p>
                                <h2 className="mt-2 text-2xl font-semibold text-[#17202b]">
                                    {booking.therapist_profile?.public_name ?? booking.counterparty?.display_name ?? '予約相手を確認中'}
                                </h2>
                            </div>
                            <span className="rounded-full bg-[#f1efe8] px-3 py-1 text-xs font-semibold text-[#48505a]">
                                {booking.request_type === 'scheduled' ? '予定予約' : '今すぐ予約'}
                            </span>
                        </div>

                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                            <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#7d6852]">開始予定</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">{formatDateTime(startAt)}</p>
                            </div>
                            <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#7d6852]">待ち合わせ場所</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                    {booking.service_address ? getServiceAddressLabel(booking.service_address) : '未設定'}
                                </p>
                            </div>
                            <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#7d6852]">コース</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                    {booking.therapist_menu?.name ?? '未設定'} / {booking.duration_minutes}分
                                </p>
                            </div>
                            <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#7d6852]">予約金額</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">{formatCurrency(booking.total_amount)}</p>
                            </div>
                        </div>
                    </article>

                    <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">CANCELLATION POLICY</p>
                        <h2 className="mt-2 text-2xl font-semibold text-[#17202b]">{preview.policy_label}</h2>
                        <p className="mt-3 text-sm leading-7 text-[#68707a]">{policyNote(preview)}</p>

                        <div className="mt-6 grid gap-4 md:grid-cols-3">
                            {summaryRows.map((row) => (
                                <div key={row.label} className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                    <p className="text-xs font-semibold tracking-wide text-[#7d6852]">{row.label}</p>
                                    <p className="mt-2 text-sm font-semibold text-[#17202b]">{row.value}</p>
                                </div>
                            ))}
                        </div>
                    </article>

                    <form onSubmit={(event) => void handleSubmit(event)} className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">CANCEL FORM</p>
                        <h2 className="mt-2 text-2xl font-semibold text-[#17202b]">理由を入力してキャンセルする</h2>
                        <p className="mt-3 text-sm leading-7 text-[#68707a]">
                            セラピスト側には理由コードが共有されます。必要があれば補足を入れてください。
                        </p>

                        <div className="mt-6 space-y-5">
                            <label className="block space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">理由</span>
                                <select
                                    value={reasonCode}
                                    onChange={(event) => setReasonCode(event.target.value)}
                                    className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                >
                                    {cancelReasonOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="block space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">補足メモ</span>
                                <textarea
                                    value={reasonNote}
                                    onChange={(event) => setReasonNote(event.target.value)}
                                    rows={5}
                                    placeholder="必要なら補足事情を入力"
                                    className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm leading-7 text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                />
                            </label>
                        </div>

                        {submitError ? (
                            <div className="mt-5 rounded-[20px] border border-amber-300/40 bg-amber-50 px-4 py-3 text-sm text-[#8b5a16]">
                                {submitError}
                            </div>
                        ) : null}


                        <div className="mt-6 flex flex-wrap gap-3">
                            <button
                                type="submit"
                                disabled={!canSubmit || isSubmitting}
                                className="inline-flex min-h-11 items-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isSubmitting ? 'キャンセル処理中...' : 'この内容でキャンセルする'}
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate(`/user/bookings/${booking.public_id}`)}
                                className="inline-flex min-h-11 items-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                            >
                                予約詳細へ戻る
                            </button>
                        </div>
                    </form>
                </section>

                <aside className="space-y-5">
                    <section className="rounded-[28px] bg-[#fffcf7] p-6 shadow-[0_18px_36px_rgba(23,32,43,0.1)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">AFTER CANCEL</p>
                        <div className="mt-4 space-y-4 text-sm leading-7 text-[#48505a]">
                            <p>処理後は予約詳細で、返金件数、決済状態、キャンセル理由の反映まで確認できます。</p>
                            <p>安全上の理由や相手とのやり取りに懸念がある場合は、キャンセル後に通報画面から内容を残せます。</p>
                        </div>
                        <div className="mt-6 space-y-3">
                            <Link
                                to={`/user/bookings/${booking.public_id}/report`}
                                className="inline-flex w-full items-center justify-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                            >
                                通報画面へ
                            </Link>
                            <Link
                                to={`/user/bookings/${booking.public_id}`}
                                className="inline-flex w-full items-center justify-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:brightness-105"
                            >
                                予約詳細を見る
                            </Link>
                        </div>
                    </section>
                </aside>
            </div>
        </div>
    );
}
