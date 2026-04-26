import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatCurrency, formatWalkingTimeRange, getServiceAddressLabel } from '../lib/discovery';
import type {
    ApiEnvelope,
    BookingDetailRecord,
    PaymentIntentRecord,
    ServiceAddress,
    TherapistDetail,
    TherapistMenu,
} from '../lib/types';

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

function formatPaymentStatus(value: string | null | undefined): string {
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

function friendlyPaymentError(error: unknown): string {
    if (error instanceof ApiError) {
        if (error.message.includes('Stripe')) {
            return 'Stripe 設定が未完了のため、ローカルではカード与信を開始できません。鍵設定後に再試行してください。';
        }

        return error.message;
    }

    return 'カード与信の作成に失敗しました。';
}

export function UserBookingPaymentPage() {
    const { token } = useAuth();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [therapistDetail, setTherapistDetail] = useState<TherapistDetail | null>(null);
    const [serviceAddresses, setServiceAddresses] = useState<ServiceAddress[]>([]);
    const [booking, setBooking] = useState<BookingDetailRecord | null>(null);
    const [pageError, setPageError] = useState<string | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const therapistId = searchParams.get('therapist_id');
    const therapistMenuId = searchParams.get('therapist_menu_id');
    const serviceAddressId = searchParams.get('service_address_id');
    const availabilitySlotId = searchParams.get('availability_slot_id');
    const requestedStartAt = searchParams.get('requested_start_at');
    const quoteId = searchParams.get('quote_id');
    const bookingId = searchParams.get('booking_id');
    const quoteTotalAmount = Number(searchParams.get('quote_total_amount') ?? '0');
    const quoteExpiresAt = searchParams.get('quote_expires_at');
    const walkingTimeRange = searchParams.get('walking_time_range');

    usePageTitle('支払い確認');

    const selectedAddress = useMemo(
        () => serviceAddresses.find((address) => address.public_id === serviceAddressId) ?? null,
        [serviceAddresses, serviceAddressId],
    );

    const selectedMenu = useMemo<TherapistMenu | null>(() => {
        if (!therapistDetail) {
            return null;
        }

        return therapistDetail.menus.find((menu) => menu.public_id === therapistMenuId)
            ?? therapistDetail.menus[0]
            ?? null;
    }, [therapistDetail, therapistMenuId]);

    const baseParams = useMemo(() => {
        const next = new URLSearchParams(searchParams);
        next.delete('quote_id');
        next.delete('quote_total_amount');
        next.delete('quote_expires_at');
        next.delete('walking_time_range');
        next.delete('booking_id');

        return next;
    }, [searchParams]);

    useEffect(() => {
        let isMounted = true;

        async function bootstrap() {
            if (!token || !therapistId || !serviceAddressId) {
                setIsLoading(false);
                return;
            }

            try {
                const requests: Promise<unknown>[] = [
                    apiRequest<ApiEnvelope<TherapistDetail>>(`/therapists/${therapistId}`, { token }),
                    apiRequest<ApiEnvelope<ServiceAddress[]>>('/me/service-addresses', { token }),
                ];

                if (bookingId) {
                    requests.push(
                        apiRequest<ApiEnvelope<BookingDetailRecord>>(`/bookings/${bookingId}`, { token }),
                    );
                }

                const [detailPayload, addressPayload, bookingPayload] = await Promise.all(requests);

                if (!isMounted) {
                    return;
                }

                setTherapistDetail(unwrapData(detailPayload as ApiEnvelope<TherapistDetail>));
                setServiceAddresses(unwrapData(addressPayload as ApiEnvelope<ServiceAddress[]>));

                if (bookingPayload) {
                    setBooking(unwrapData(bookingPayload as ApiEnvelope<BookingDetailRecord>));
                }
            } catch (requestError) {
                if (!isMounted) {
                    return;
                }

                const nextMessage = requestError instanceof ApiError
                    ? requestError.message
                    : '支払い確認画面の準備に失敗しました。';

                setPageError(nextMessage);
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        }

        void bootstrap();

        return () => {
            isMounted = false;
        };
    }, [bookingId, serviceAddressId, therapistId, token]);

    if (!token) {
        return <Navigate to="/login" replace />;
    }

    if (!therapistId || !therapistMenuId || !serviceAddressId || !availabilitySlotId || !requestedStartAt) {
        return <Navigate to="/user/booking-request" replace />;
    }

    if (!quoteId && !bookingId) {
        return <Navigate to={`/user/booking-request/quote?${baseParams.toString()}`} replace />;
    }

    async function handleCreatePayment() {
        if (!token || (!quoteId && !bookingId)) {
            return;
        }

        setIsSubmitting(true);
        setSubmitError(null);

        try {
            let activeBooking = booking;

            if (!activeBooking) {
                const bookingPayload = await apiRequest<ApiEnvelope<BookingDetailRecord>>('/bookings', {
                    method: 'POST',
                    token,
                    body: { quote_id: quoteId },
                });

                activeBooking = unwrapData(bookingPayload);
                setBooking(activeBooking);

                setSearchParams((current) => {
                    const next = new URLSearchParams(current);
                    next.set('booking_id', activeBooking?.public_id ?? '');

                    return next;
                }, { replace: true });
            }

            await apiRequest<ApiEnvelope<PaymentIntentRecord>>(`/bookings/${activeBooking.public_id}/payment-intents`, {
                method: 'POST',
                token,
            });

            const syncPayload = await apiRequest<ApiEnvelope<{ booking: BookingDetailRecord; payment_intent: PaymentIntentRecord | null }>>(
                `/bookings/${activeBooking.public_id}/payment-sync`,
                {
                    method: 'POST',
                    token,
                },
            );

            const synced = unwrapData(syncPayload).booking;
            setBooking(synced);
            navigate(`/user/booking-request/waiting?booking_id=${encodeURIComponent(synced.public_id)}`);
        } catch (requestError) {
            setSubmitError(friendlyPaymentError(requestError));
        } finally {
            setIsSubmitting(false);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="支払い確認を準備中" message="予約内容と支払い前提を確認しています。" />;
    }

    const quotePath = `/user/booking-request/quote?${baseParams.toString()}`;
    const requestPath = `/user/booking-request?${baseParams.toString()}`;
    const waitingPath = booking ? `/user/booking-request/waiting?booking_id=${booking.public_id}` : null;
    const hasExistingPaymentIntent = Boolean(booking?.current_payment_intent);

    return (
        <div className="space-y-8">
            <section className="rounded-[32px] bg-[linear-gradient(140deg,#17202b_0%,#223245_100%)] p-6 text-white shadow-[0_24px_60px_rgba(15,23,42,0.28)] sm:p-8">
                <p className="text-xs font-semibold tracking-wide text-[#f3dec0]">PAYMENT AUTHORIZATION</p>
                <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-3">
                        <h1 className="text-3xl font-semibold">カード与信を確保して依頼を送る</h1>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            予定予約は、与信確保後にセラピスト承諾待ちへ進みます。承諾前は仮押さえで、期限切れや辞退時は与信取消の対象です。
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <Link
                            to={quotePath}
                            className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8"
                        >
                            見積もりへ戻る
                        </Link>
                        <Link
                            to={requestPath}
                            className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8"
                        >
                            内容を修正
                        </Link>
                    </div>
                </div>
            </section>

            {pageError ? (
                <section className="rounded-[24px] border border-[#f1d4b5] bg-[#fff4e8] px-5 py-4 text-sm text-[#9a4b35]">
                    {pageError}
                </section>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.02fr)_360px]">
                <section className="space-y-6">
                    <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">BOOKING SUMMARY</p>
                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                            <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#7d6852]">セラピスト</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                    {therapistDetail?.public_name ?? '確認中'}
                                </p>
                            </div>
                            <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#7d6852]">メニュー</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                    {selectedMenu ? `${selectedMenu.name} / ${selectedMenu.duration_minutes}分` : '確認中'}
                                </p>
                            </div>
                            <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#7d6852]">開始予定</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                    {formatDateTime(requestedStartAt)}
                                </p>
                            </div>
                            <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#7d6852]">施術場所</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                    {selectedAddress ? getServiceAddressLabel(selectedAddress) : '確認中'}
                                </p>
                            </div>
                        </div>
                    </article>

                    <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">PAYMENT STATUS</p>
                        <div className="mt-4 space-y-4 text-sm text-[#48505a]">
                            <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#7d6852]">現在の与信状態</p>
                                <p className="mt-2 text-base font-semibold text-[#17202b]">
                                    {formatPaymentStatus(booking?.current_payment_intent?.status)}
                                </p>
                            </div>

                            <div className="rounded-[20px] border border-[#efe5d7] bg-[#fffdf8] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#7d6852]">この画面で行うこと</p>
                                <ul className="mt-3 space-y-2 leading-7 text-[#68707a]">
                                    <li>1. 見積もり済みの予約内容から予約レコードを作成します。</li>
                                    <li>2. カード与信を作成して、承諾待ちの待機画面へ進みます。</li>
                                    <li>3. 以後の状態変化は待機画面または予約一覧で追えます。</li>
                                </ul>
                            </div>

                            {submitError ? (
                                <div className="rounded-[20px] border border-[#f1d4b5] bg-[#fff4e8] px-4 py-3 text-sm text-[#9a4b35]">
                                    {submitError}
                                </div>
                            ) : null}
                        </div>
                    </article>
                </section>

                <aside className="space-y-5">
                    <section className="rounded-[28px] bg-[#fffcf7] p-6 shadow-[0_18px_36px_rgba(23,32,43,0.1)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">SUMMARY</p>
                        <div className="mt-4 space-y-4 text-sm text-[#48505a]">
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">見積もり総額</p>
                                <p className="mt-1 text-xl font-semibold text-[#17202b]">
                                    {formatCurrency(quoteTotalAmount)}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">徒歩目安</p>
                                <p className="mt-1 font-semibold text-[#17202b]">
                                    {formatWalkingTimeRange(walkingTimeRange)}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">見積もり有効期限</p>
                                <p className="mt-1 font-semibold text-[#17202b]">
                                    {formatDateTime(quoteExpiresAt)}
                                </p>
                            </div>
                            {booking ? (
                                <div>
                                    <p className="text-xs font-semibold text-[#7d6852]">作成済み予約ID</p>
                                    <p className="mt-1 font-semibold text-[#17202b]">{booking.public_id}</p>
                                </div>
                            ) : null}
                        </div>

                        <div className="mt-6 rounded-[22px] bg-[#f8f4ed] px-4 py-4 text-sm leading-7 text-[#68707a]">
                            ローカルで Stripe 設定が未完了のときは、この画面で停止することがあります。その場合も予約作成の成否はメッセージで確認できます。
                        </div>

                        <div className="mt-6 space-y-3">
                            {hasExistingPaymentIntent && waitingPath ? (
                                <Link
                                    to={waitingPath}
                                    className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140]"
                                >
                                    待機画面へ進む
                                </Link>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => void handleCreatePayment()}
                                    disabled={isSubmitting || !!pageError}
                                    className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-bold text-[#1a2430] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isSubmitting
                                        ? '与信を作成しています...'
                                        : booking
                                            ? '与信を再試行して待機へ進む'
                                            : 'カード与信を確保して依頼を送る'}
                                </button>
                            )}
                            <p className="text-xs leading-6 text-[#7d6852]">
                                ここでカード情報入力UIはまだ載せておらず、まずは予約作成と与信ステータス遷移をつないでいます。
                            </p>
                        </div>
                    </section>
                </aside>
            </div>
        </div>
    );
}
