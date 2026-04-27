import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { usePageTitle } from '../hooks/usePageTitle';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import {
    canOpenBookingNoShowFlow,
    getBookingNoShowUnavailableReason,
    getBookingPlannedStartAt,
    type BookingTroubleActorRole,
} from '../lib/bookingTrouble';
import { formatJstDateTime } from '../lib/datetime';
import { formatCurrency, getServiceAddressLabel } from '../lib/discovery';
import type { ApiEnvelope, BookingDetailRecord } from '../lib/types';

interface BookingNoShowPageProps {
    actorRole: BookingTroubleActorRole;
}

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
    return actorRole === 'user'
        ? 'セラピストが来ない・連絡が取れない'
        : '利用者が来ない・連絡が取れない';
}

function descriptionText(actorRole: BookingTroubleActorRole): string {
    return actorRole === 'user'
        ? '予定時刻を過ぎてもセラピストが来ない、または連絡が取れないときはこちらから記録してください。予約を中断して、与信や通報記録を整理します。'
        : '待ち合わせ場所に向かったのに利用者と会えない、または連絡が取れないときはこちらから記録してください。予約を中断して、決済と通報記録を整理します。';
}

function confirmationLabel(actorRole: BookingTroubleActorRole): string {
    return actorRole === 'user'
        ? '予定時刻を過ぎてもセラピストと会えず、メッセージや連絡でも状況確認ができていません。'
        : '待ち合わせ場所に向かい、予定時刻を過ぎても利用者と会えず、メッセージや連絡でも状況確認ができていません。';
}

function outcomeSummary(actorRole: BookingTroubleActorRole): string {
    return actorRole === 'user'
        ? 'この操作で予約は「中断」になり、与信は取り消されます。必要な記録は運営確認用に残ります。'
        : 'この操作で予約は「中断」になり、利用者都合の未着として現在の予約金額を確定します。必要な記録は運営確認用に残ります。';
}

function reasonCode(actorRole: BookingTroubleActorRole): string {
    return actorRole === 'user' ? 'therapist_no_show' : 'user_no_show';
}

function responsibility(actorRole: BookingTroubleActorRole): string {
    return actorRole === 'user' ? 'therapist' : 'user';
}

export function BookingNoShowPage({ actorRole }: BookingNoShowPageProps) {
    const { publicId } = useParams<{ publicId: string }>();
    const { token } = useAuth();
    const [booking, setBooking] = useState<BookingDetailRecord | null>(null);
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
    const messagePath = actorRole === 'user'
        ? `/user/bookings/${publicId ?? ''}/messages`
        : `/therapist/bookings/${publicId ?? ''}/messages`;

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
                    : 'トラブル対応画面の準備に失敗しました。';

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
        () => (booking ? canOpenBookingNoShowFlow(booking, actorRole) : false),
        [actorRole, booking],
    );
    const unavailableReason = useMemo(
        () => (booking ? getBookingNoShowUnavailableReason(booking, actorRole) : ''),
        [actorRole, booking],
    );
    const plannedStartAt = useMemo(
        () => (booking ? getBookingPlannedStartAt(booking) : null),
        [booking],
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
                    reason_code: reasonCode(actorRole),
                    reason_note: detail.trim(),
                    responsibility: responsibility(actorRole),
                    severity: 'high',
                },
            });

            setBooking(unwrapData(payload).booking);
            setSuccessMessage(
                actorRole === 'user'
                    ? '未着トラブルを記録しました。予約は中断となり、与信を解除しています。'
                    : '未着トラブルを記録しました。予約は中断となり、決済と運営確認記録を更新しています。',
            );
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : 'トラブルの記録に失敗しました。';

            setSubmitError(message);
        } finally {
            setIsSubmitting(false);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="トラブル対応画面を準備中" message="予約状態と決済条件を確認しています。" />;
    }

    if (!booking) {
        return (
            <div className="space-y-6 rounded-[28px] bg-white p-6 text-[#17202b] shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                <p className="text-sm font-semibold text-[#9a7a49]">トラブル対応</p>
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

    if (successMessage) {
        return (
            <div className="space-y-8">
                <section className="rounded-[32px] bg-[linear-gradient(140deg,#17202b_0%,#223245_100%)] p-6 text-white shadow-[0_24px_60px_rgba(15,23,42,0.28)] sm:p-8">
                    <p className="text-xs font-semibold tracking-wide text-[#f3dec0]">トラブル対応</p>
                    <h1 className="mt-4 text-3xl font-semibold">{headingText(actorRole)}</h1>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">{successMessage}</p>
                </section>

                <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">現在の状態</p>
                            <p className="mt-2 text-2xl font-semibold text-[#17202b]">{statusLabel(booking.status)}</p>
                        </div>
                        <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3 text-sm text-[#48505a]">
                            <p className="text-xs font-semibold tracking-wide text-[#7d6852]">予約ID</p>
                            <p className="mt-1 font-semibold text-[#17202b]">{booking.public_id}</p>
                        </div>
                    </div>

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                        <Link
                            to={bookingDetailPath}
                            className="inline-flex items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140]"
                        >
                            予約詳細へ戻る
                        </Link>
                        <Link
                            to={messagePath}
                            className="inline-flex items-center justify-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                        >
                            メッセージを確認
                        </Link>
                    </div>
                </section>
            </div>
        );
    }

    if (!isEligible) {
        return (
            <div className="space-y-8">
                <section className="rounded-[32px] bg-[linear-gradient(140deg,#17202b_0%,#223245_100%)] p-6 text-white shadow-[0_24px_60px_rgba(15,23,42,0.28)] sm:p-8">
                    <p className="text-xs font-semibold tracking-wide text-[#f3dec0]">トラブル対応</p>
                    <h1 className="mt-4 text-3xl font-semibold">{headingText(actorRole)}</h1>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">{descriptionText(actorRole)}</p>
                </section>

                <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                    <p className="text-sm font-semibold text-[#9a4b35]">この予約ではまだ利用できません</p>
                    <p className="mt-3 text-sm leading-7 text-[#68707a]">{unavailableReason || pageError}</p>

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                        <Link
                            to={bookingDetailPath}
                            className="inline-flex items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140]"
                        >
                            予約詳細へ戻る
                        </Link>
                        <Link
                            to={messagePath}
                            className="inline-flex items-center justify-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                        >
                            メッセージを確認
                        </Link>
                    </div>
                </section>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <section className="rounded-[32px] bg-[linear-gradient(140deg,#17202b_0%,#223245_100%)] p-6 text-white shadow-[0_24px_60px_rgba(15,23,42,0.28)] sm:p-8">
                <p className="text-xs font-semibold tracking-wide text-[#f3dec0]">トラブル対応</p>
                <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-3">
                        <h1 className="text-3xl font-semibold">{headingText(actorRole)}</h1>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">{descriptionText(actorRole)}</p>
                    </div>
                    <div className="rounded-[22px] border border-white/10 bg-white/5 px-5 py-4 text-sm text-slate-200">
                        <p className="text-xs font-semibold tracking-wide text-slate-400">現在の状態</p>
                        <p className="mt-2 text-lg font-semibold text-white">{statusLabel(booking.status)}</p>
                    </div>
                </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_360px]">
                <section className="space-y-6">
                    <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">予約情報</p>
                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                            <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#7d6852]">相手</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                    {booking.counterparty?.display_name ?? booking.therapist_profile?.public_name ?? '確認中'}
                                </p>
                            </div>
                            <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#7d6852]">予定時刻</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">{formatDateTime(plannedStartAt)}</p>
                            </div>
                            <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#7d6852]">待ち合わせ場所</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                    {booking.service_address ? getServiceAddressLabel(booking.service_address) : '未設定'}
                                </p>
                            </div>
                            <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#7d6852]">予約金額</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">{formatCurrency(booking.total_amount)}</p>
                            </div>
                        </div>
                    </article>

                    <article className="rounded-[28px] border border-[#f0d6a4] bg-[#fff7e8] p-6 shadow-[0_18px_36px_rgba(23,32,43,0.08)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">この操作で行うこと</p>
                        <h2 className="mt-2 text-2xl font-semibold text-[#17202b]">未着トラブルとして予約を中断する</h2>
                        <p className="mt-3 text-sm leading-7 text-[#475569]">{outcomeSummary(actorRole)}</p>

                        <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 space-y-5">
                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">状況メモ</span>
                                <textarea
                                    value={detail}
                                    onChange={(event) => {
                                        setDetail(event.target.value);
                                    }}
                                    rows={5}
                                    placeholder={actorRole === 'user'
                                        ? '例: 20:05 になっても来ず、メッセージにも返信がありません。'
                                        : '例: 19:55 に現地へ到着し、20:10 まで待機しましたが利用者と連絡が取れません。'}
                                    className="w-full rounded-[18px] border border-[#d8c39b] bg-white px-4 py-3 text-sm leading-7 text-[#17202b] outline-none transition focus:border-[#b38a44]"
                                />
                            </label>

                            <label className="flex items-start gap-3 rounded-[18px] border border-[#e6dccd] bg-white px-4 py-4">
                                <input
                                    type="checkbox"
                                    checked={confirmed}
                                    onChange={(event) => {
                                        setConfirmed(event.target.checked);
                                    }}
                                    className="mt-1 h-4 w-4 rounded border-[#ccb790] text-[#17202b] focus:ring-[#b38a44]"
                                />
                                <span className="text-sm leading-7 text-[#48505a]">{confirmationLabel(actorRole)}</span>
                            </label>

                            <div className="flex flex-col gap-3 sm:flex-row">
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="inline-flex items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isSubmitting ? '処理中...' : 'この内容で記録する'}
                                </button>
                                <Link
                                    to={bookingDetailPath}
                                    className="inline-flex items-center justify-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                                >
                                    予約詳細へ戻る
                                </Link>
                            </div>
                        </form>
                    </article>
                </section>

                <aside className="space-y-5">
                    <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">先にできること</p>
                        <div className="mt-4 space-y-3 text-sm leading-7 text-[#68707a]">
                            <p>まずはメッセージで状況確認を試してください。返信がないまま予定時刻を過ぎたときに、この導線を使うのが安全です。</p>
                            <p>送信後は予約が中断になり、返金や決済の状態は予約詳細から確認できます。</p>
                        </div>

                        <div className="mt-6 space-y-3">
                            <Link
                                to={messagePath}
                                className="inline-flex w-full items-center justify-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:brightness-105"
                            >
                                メッセージを見る
                            </Link>
                            <Link
                                to={bookingDetailPath}
                                className="inline-flex w-full items-center justify-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                            >
                                予約詳細へ戻る
                            </Link>
                        </div>
                    </section>
                </aside>
            </div>
        </div>
    );
}

export function UserBookingNoShowPage() {
    return <BookingNoShowPage actorRole="user" />;
}

export function TherapistBookingNoShowPage() {
    return <BookingNoShowPage actorRole="therapist" />;
}
