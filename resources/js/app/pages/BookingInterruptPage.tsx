import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import {
    canOpenBookingInterruptFlow,
    getBookingInterruptUnavailableReason,
    type BookingTroubleActorRole,
} from '../lib/bookingTrouble';
import { formatJstDateTime } from '../lib/datetime';
import { formatCurrency, getServiceAddressLabel } from '../lib/discovery';
import type { ApiEnvelope, BookingDetailRecord } from '../lib/types';

interface BookingInterruptPageProps {
    actorRole: BookingTroubleActorRole;
}

const reasonOptions = [
    { value: 'safety_concern', label: '安全上の不安' },
    { value: 'boundary_violation', label: '対応範囲・境界の違反' },
    { value: 'prohibited_request', label: '禁止行為の要求' },
    { value: 'medical_emergency', label: '体調急変・救護が必要' },
    { value: 'other', label: 'その他' },
];

const responsibilityOptions = [
    { value: 'user', label: '利用者都合' },
    { value: 'therapist', label: 'タチキャスト都合' },
    { value: 'shared', label: '双方要因' },
    { value: 'force_majeure', label: 'やむを得ない事情' },
    { value: 'unknown', label: 'まだ判断できない' },
];

const severityOptions = [
    { value: 'medium', label: '通常' },
    { value: 'high', label: '高い' },
    { value: 'critical', label: '緊急' },
];

function formatDateTime(value: string | null): string {
    return formatJstDateTime(value, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }) ?? '未設定';
}

function statusLabel(status: string): string {
    switch (status) {
        case 'accepted':
            return '予約確定';
        case 'moving':
            return '移動中';
        case 'arrived':
            return '到着';
        case 'in_progress':
            return '対応中';
        case 'interrupted':
            return '中断';
        case 'canceled':
            return 'キャンセル';
        case 'completed':
            return '完了';
        default:
            return status;
    }
}

function headingText(actorRole: BookingTroubleActorRole): string {
    return actorRole === 'user' ? '対応を中断する' : '対応を中断して記録する';
}

function descriptionText(actorRole: BookingTroubleActorRole): string {
    return actorRole === 'user'
        ? '危険を感じた、対応継続が難しい、体調が急変したなどのときは、ここから予約の中断を記録できます。'
        : '危険を感じた、利用者対応の継続が難しい、体調急変やトラブル対応が必要などのときは、ここから予約の中断を記録できます。';
}

function outcomeSummary(actorRole: BookingTroubleActorRole): string {
    return actorRole === 'user'
        ? '送信すると予約は中断となり、状況に応じて決済整理と運営確認を進めます。'
        : '送信すると予約は中断となり、状況に応じて決済整理と運営確認を進めます。未着申告の確認待ちがある場合は、先にその返答を確認してください。';
}

export function BookingInterruptPage({ actorRole }: BookingInterruptPageProps) {
    const { publicId } = useParams<{ publicId: string }>();
    const { token } = useAuth();
    const [booking, setBooking] = useState<BookingDetailRecord | null>(null);
    const [reasonCode, setReasonCode] = useState(reasonOptions[0]?.value ?? 'safety_concern');
    const [responsibility, setResponsibility] = useState(actorRole === 'user' ? 'therapist' : 'user');
    const [severity, setSeverity] = useState('high');
    const [detail, setDetail] = useState('');
    const [confirmed, setConfirmed] = useState(false);
    const [pageError, setPageError] = useState<string | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    usePageTitle(headingText(actorRole));
    useToastOnMessage(submitError, 'error');
    useToastOnMessage(successMessage, 'success');

    const bookingDetailPath = actorRole === 'user'
        ? `/user/bookings/${publicId ?? ''}`
        : `/therapist/bookings/${publicId ?? ''}`;
    const bookingListPath = actorRole === 'user' ? '/user/bookings' : '/therapist/bookings';
    const reportPath = actorRole === 'user'
        ? `/user/bookings/${publicId ?? ''}/report`
        : `/therapist/bookings/${publicId ?? ''}/report`;

    const loadBooking = useCallback(async () => {
        if (!token || !publicId) {
            return;
        }

        const payload = await apiRequest<ApiEnvelope<BookingDetailRecord>>(`/bookings/${publicId}`, { token });
        setBooking(unwrapData(payload));
    }, [publicId, token]);

    useEffect(() => {
        let isMounted = true;

        void loadBooking()
            .catch((requestError: unknown) => {
                if (!isMounted) {
                    return;
                }

                const message = requestError instanceof ApiError
                    ? requestError.message
                    : '中断画面の準備に失敗しました。';

                setPageError(message);
            })
            .finally(() => {
                if (isMounted) {
                    setIsLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [loadBooking]);

    const isEligible = useMemo(
        () => (booking ? canOpenBookingInterruptFlow(booking) : false),
        [booking],
    );
    const unavailableReason = useMemo(
        () => (booking ? getBookingInterruptUnavailableReason(booking, actorRole) : ''),
        [actorRole, booking],
    );

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token || !booking || !isEligible || isSubmitting) {
            return;
        }

        if (!confirmed) {
            setSubmitError('状況確認のチェックを入れてください。');
            return;
        }

        if (detail.trim().length === 0) {
            setSubmitError('状況メモを入力してください。');
            return;
        }

        setIsSubmitting(true);
        setSubmitError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<{
                booking: BookingDetailRecord;
                interruption: {
                    payment_action: string;
                    reason_code: string;
                    responsibility: string;
                };
            }>>(`/bookings/${booking.public_id}/interrupt`, {
                method: 'POST',
                token,
                body: {
                    reason_code: reasonCode,
                    reason_note: detail.trim(),
                    responsibility,
                    severity,
                },
            });

            const next = unwrapData(payload);
            setBooking(next.booking);
            setSuccessMessage(
                actorRole === 'user'
                    ? '対応中断を記録しました。予約状態と決済処理を更新しています。'
                    : '対応中断を記録しました。予約状態と決済処理を更新しています。',
            );
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '中断の記録に失敗しました。';

            setSubmitError(message);
        } finally {
            setIsSubmitting(false);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="中断画面を準備中" message="予約状態と決済条件を確認しています。" />;
    }

    if (!booking) {
        return (
            <div className="space-y-6 rounded-[28px] bg-white p-6 text-[#17202b] shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                <p className="text-sm font-semibold text-[#9a7a49]">安全対応</p>
                <h1 className="text-3xl font-semibold">予約情報を確認できませんでした</h1>
                <p className="text-sm leading-7 text-[#68707a]">
                    {pageError ?? '対象の予約を確認できませんでした。予約詳細へ戻って状態を確認してください。'}
                </p>
                <div className="flex flex-wrap gap-3">
                    <Link
                        to={bookingDetailPath}
                        className="inline-flex min-h-11 items-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140]"
                    >
                        予約詳細へ戻る
                    </Link>
                    <Link
                        to={bookingListPath}
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
                <p className="text-xs font-semibold tracking-wide text-[#f3dec0]">安全対応</p>
                <h1 className="mt-4 text-3xl font-semibold">{headingText(actorRole)}</h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">{descriptionText(actorRole)}</p>
            </section>

            <section className="rounded-[28px] border border-[#f0d6a4] bg-[#fff7e8] p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">緊急時の優先連絡先</p>
                        <h2 className="mt-2 text-2xl font-semibold text-[#17202b]">身の危険や体調急変がある場合は先に外部へ連絡</h2>
                        <p className="mt-3 max-w-3xl text-sm leading-7 text-[#48505a]">
                            アプリ内の記録よりも、まず警察・救急への連絡を優先してください。安全確保が済んだあとで、この画面から中断や通報の記録を残せます。
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <a
                            href="tel:110"
                            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140]"
                        >
                            警察 110
                        </a>
                        <a
                            href="tel:119"
                            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#d9c9ae] bg-white px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                        >
                            救急 119
                        </a>
                    </div>
                </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                <section className="space-y-5">
                    {!isEligible ? (
                        <article className="rounded-[28px] border border-[#f1d4b5] bg-[#fff4e8] p-6 text-sm text-[#9a4b35] shadow-[0_18px_36px_rgba(23,32,43,0.08)]">
                            {unavailableReason}
                        </article>
                    ) : null}

                    <form
                        onSubmit={(event) => void handleSubmit(event)}
                        className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]"
                    >
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">中断内容</p>
                        <h2 className="mt-2 text-2xl font-semibold text-[#17202b]">状況を記録して対応を中断する</h2>
                        <p className="mt-3 text-sm leading-7 text-[#68707a]">
                            {outcomeSummary(actorRole)}
                        </p>

                        <div className="mt-6 grid gap-5 md:grid-cols-2">
                            <label className="block space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">カテゴリ</span>
                                <select
                                    value={reasonCode}
                                    onChange={(event) => setReasonCode(event.target.value)}
                                    className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                >
                                    {reasonOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="block space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">緊急度</span>
                                <select
                                    value={severity}
                                    onChange={(event) => setSeverity(event.target.value)}
                                    className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                >
                                    {severityOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <label className="mt-5 block space-y-2">
                            <span className="text-sm font-semibold text-[#17202b]">主な要因</span>
                            <select
                                value={responsibility}
                                onChange={(event) => setResponsibility(event.target.value)}
                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                            >
                                {responsibilityOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="mt-5 block space-y-2">
                            <span className="text-sm font-semibold text-[#17202b]">状況メモ</span>
                            <textarea
                                value={detail}
                                onChange={(event) => setDetail(event.target.value)}
                                rows={6}
                                placeholder="例: 待ち合わせ後に規約外の要求があり、安全確保のためその場を離れました。"
                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm leading-7 text-[#17202b] outline-none transition focus:border-[#b5894d]"
                            />
                        </label>

                        <label className="mt-5 flex items-start gap-3 rounded-[20px] border border-[#ebe2d3] bg-[#f8f4ed] px-4 py-4">
                            <input
                                type="checkbox"
                                checked={confirmed}
                                onChange={(event) => setConfirmed(event.target.checked)}
                                className="mt-1 h-4 w-4 rounded border-[#cdb697] text-[#17202b] focus:ring-[#b5894d]"
                            />
                            <span className="text-sm leading-7 text-[#48505a]">
                                緊急時は外部連絡を優先することを確認し、この内容で予約を中断して運営確認用の記録を残します。
                            </span>
                        </label>

                        {submitError ? (
                            <div className="mt-5 rounded-[20px] border border-amber-300/40 bg-amber-50 px-4 py-3 text-sm text-[#8b5a16]">
                                {submitError}
                            </div>
                        ) : null}

                        <div className="mt-6 flex flex-wrap gap-3">
                            <button
                                type="submit"
                                disabled={isSubmitting || !isEligible}
                                className="inline-flex min-h-11 items-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isSubmitting ? '送信中...' : '対応を中断して記録する'}
                            </button>
                            <Link
                                to={bookingDetailPath}
                                className="inline-flex min-h-11 items-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                            >
                                予約詳細へ戻る
                            </Link>
                        </div>
                    </form>
                </section>

                <aside className="space-y-5">
                    <section className="rounded-[28px] bg-[#fffcf7] p-6 shadow-[0_18px_36px_rgba(23,32,43,0.1)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">予約情報</p>
                        <div className="mt-4 space-y-4 text-sm text-[#48505a]">
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">予約ステータス</p>
                                <p className="mt-1 font-semibold text-[#17202b]">{statusLabel(booking.status)}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">予約日時</p>
                                <p className="mt-1 font-semibold text-[#17202b]">
                                    {formatDateTime(booking.scheduled_start_at ?? booking.requested_start_at)}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">待ち合わせ場所</p>
                                <p className="mt-1 font-semibold text-[#17202b]">
                                    {booking.service_address ? getServiceAddressLabel(booking.service_address) : '未設定'}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">支払い予定額</p>
                                <p className="mt-1 font-semibold text-[#17202b]">{formatCurrency(booking.total_amount)}</p>
                            </div>
                        </div>

                        <div className="mt-6 space-y-3">
                            <Link
                                to={reportPath}
                                className="inline-flex w-full items-center justify-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                            >
                                通報する
                            </Link>
                            <Link
                                to={bookingListPath}
                                className="inline-flex w-full items-center justify-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:brightness-105"
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

export function UserBookingInterruptPage() {
    return <BookingInterruptPage actorRole="user" />;
}

export function TherapistBookingInterruptPage() {
    return <BookingInterruptPage actorRole="therapist" />;
}
