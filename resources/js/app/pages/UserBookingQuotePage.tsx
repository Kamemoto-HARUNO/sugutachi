import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { BookingFlowSteps } from '../components/booking/BookingFlowSteps';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToast } from '../hooks/useToast';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import {
    formatCurrency,
    formatMenuHourlyRateLabel,
    formatMenuMinimumDurationLabel,
    formatWalkingTimeRange,
    getMenuMinimumDurationMinutes,
    getServiceAddressLabel,
} from '../lib/discovery';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import {
    createStripeInstance,
    type StripeCardElement,
    type StripeElements,
    type StripeInstance,
} from '../lib/stripe';
import type {
    ApiEnvelope,
    BookingDetailRecord,
    BookingQuoteRecord,
    PaymentIntentRecord,
    ServiceAddress,
    ServiceMeta,
    TherapistDetail,
    TherapistMenu,
} from '../lib/types';

function normalizeDuration(value: string | null): number {
    const parsed = Number(value);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
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

function formatExpiresAt(value: string | null): string {
    if (!value) {
        return '有効期限を確認中';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '有効期限を確認中';
    }

    return new Intl.DateTimeFormat('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

function friendlyCardError(error: unknown): string {
    if (error instanceof ApiError) {
        if (error.message.includes('Stripe')) {
            return 'カード決済の設定が未完了のため、この環境ではカード確認を開始できません。';
        }

        return error.message;
    }

    if (error instanceof Error && error.message) {
        return error.message;
    }

    return 'カード情報の確認に失敗しました。';
}

export function UserBookingQuotePage() {
    const { token } = useAuth();
    const navigate = useNavigate();
    const { showError } = useToast();
    const [searchParams, setSearchParams] = useSearchParams();
    const [therapistDetail, setTherapistDetail] = useState<TherapistDetail | null>(null);
    const [serviceAddresses, setServiceAddresses] = useState<ServiceAddress[]>([]);
    const [serviceMeta, setServiceMeta] = useState<ServiceMeta | null>(null);
    const [quote, setQuote] = useState<BookingQuoteRecord | null>(null);
    const [booking, setBooking] = useState<BookingDetailRecord | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [cardError, setCardError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isPreparingCard, setIsPreparingCard] = useState(false);
    const [isCardComplete, setIsCardComplete] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const cardMountRef = useRef<HTMLDivElement | null>(null);
    const stripeRef = useRef<StripeInstance | null>(null);
    const elementsRef = useRef<StripeElements | null>(null);
    const cardElementRef = useRef<StripeCardElement | null>(null);

    const therapistId = searchParams.get('therapist_id');
    const therapistMenuId = searchParams.get('therapist_menu_id');
    const serviceAddressId = searchParams.get('service_address_id');
    const availabilitySlotId = searchParams.get('availability_slot_id');
    const requestedStartAt = searchParams.get('requested_start_at');
    const bookingId = searchParams.get('booking_id');
    const durationMinutes = normalizeDuration(searchParams.get('menu_duration_minutes'));

    usePageTitle('見積もり確認とカード入力');
    useToastOnMessage(error, 'error');

    const selectedAddress = useMemo(
        () => serviceAddresses.find((address) => address.public_id === serviceAddressId) ?? null,
        [serviceAddresses, serviceAddressId],
    );

    const selectedMenu = useMemo<TherapistMenu | null>(() => {
        if (!therapistDetail) {
            return null;
        }

        return therapistDetail.menus.find((menu) => menu.public_id === therapistMenuId)
            ?? therapistDetail.menus.find((menu) => getMenuMinimumDurationMinutes(menu) <= durationMinutes)
            ?? therapistDetail.menus[0]
            ?? null;
    }, [durationMinutes, therapistDetail, therapistMenuId]);

    const waitingPath = booking ? `/user/booking-request/waiting?booking_id=${encodeURIComponent(booking.public_id)}` : null;
    const availabilityPath = therapistId
        ? `/user/therapists/${therapistId}/availability?${searchParams.toString()}`
        : '/user/therapists';
    const detailPath = therapistId ? `/therapists/${therapistId}` : '/user/therapists';
    const stripePublishableKey = serviceMeta?.payment?.stripe_publishable_key ?? null;
    const hasAuthorizedRequest = booking != null
        && (booking.status === 'requested' || booking.current_payment_intent?.status === 'requires_capture');

    useEffect(() => {
        let isMounted = true;

        async function bootstrap() {
            if (!token || !therapistId || !therapistMenuId || !serviceAddressId || !availabilitySlotId || !requestedStartAt) {
                setIsLoading(false);
                return;
            }

            try {
                const requests: Promise<unknown>[] = [
                    apiRequest<ApiEnvelope<TherapistDetail>>(`/therapists/${therapistId}`, { token }),
                    apiRequest<ApiEnvelope<ServiceAddress[]>>('/me/service-addresses', { token }),
                    apiRequest<ApiEnvelope<BookingQuoteRecord>>('/booking-quotes', {
                        method: 'POST',
                        token,
                        body: {
                            therapist_profile_id: therapistId,
                            therapist_menu_id: therapistMenuId,
                            service_address_id: serviceAddressId,
                            duration_minutes: durationMinutes,
                            is_on_demand: false,
                            availability_slot_id: availabilitySlotId,
                            requested_start_at: requestedStartAt,
                        },
                    }),
                    apiRequest<ApiEnvelope<ServiceMeta>>('/service-meta'),
                ];

                if (bookingId) {
                    requests.push(apiRequest<ApiEnvelope<BookingDetailRecord>>(`/bookings/${bookingId}`, { token }));
                }

                const [detailPayload, addressPayload, quotePayload, metaPayload, bookingPayload] = await Promise.all(requests);

                if (!isMounted) {
                    return;
                }

                setTherapistDetail(unwrapData(detailPayload as ApiEnvelope<TherapistDetail>));
                setServiceAddresses(unwrapData(addressPayload as ApiEnvelope<ServiceAddress[]>));
                setQuote(unwrapData(quotePayload as ApiEnvelope<BookingQuoteRecord>));
                setServiceMeta(unwrapData(metaPayload as ApiEnvelope<ServiceMeta>));

                if (bookingPayload) {
                    const nextBooking = unwrapData(bookingPayload as ApiEnvelope<BookingDetailRecord>);
                    setBooking(nextBooking);
                }
            } catch (requestError) {
                if (!isMounted) {
                    return;
                }

                const message =
                    requestError instanceof ApiError
                        ? requestError.message
                        : '見積もりの取得に失敗しました。';

                setError(message);
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
    }, [availabilitySlotId, bookingId, durationMinutes, requestedStartAt, serviceAddressId, therapistId, therapistMenuId, token]);

    useEffect(() => {
        if (!stripePublishableKey || !cardMountRef.current) {
            return;
        }

        let isMounted = true;
        let mountedCardElement: StripeCardElement | null = null;

        setIsPreparingCard(true);
        setCardError(null);

        void createStripeInstance(stripePublishableKey)
            .then((stripe) => {
                if (!isMounted || !cardMountRef.current) {
                    return;
                }

                const elements = stripe.elements();
                const cardElement = elements.create('card', {
                    hidePostalCode: true,
                    style: {
                        base: {
                            color: '#17202b',
                            fontFamily: 'inherit',
                            fontSize: '16px',
                            '::placeholder': {
                                color: '#94a3b8',
                            },
                        },
                        invalid: {
                            color: '#c2410c',
                        },
                    },
                });

                cardElement.on('change', (event) => {
                    if (!isMounted) {
                        return;
                    }

                    setIsCardComplete(event.complete && !event.empty);
                    setCardError(event.error?.message ?? null);
                });

                cardElement.mount(cardMountRef.current);
                stripeRef.current = stripe;
                elementsRef.current = elements;
                cardElementRef.current = cardElement;
                mountedCardElement = cardElement;
                setIsPreparingCard(false);
            })
            .catch((stripeError) => {
                if (!isMounted) {
                    return;
                }

                setCardError(stripeError instanceof Error ? stripeError.message : 'カード入力を準備できませんでした。');
                setIsPreparingCard(false);
            });

        return () => {
            isMounted = false;
            mountedCardElement?.destroy();
            if (cardElementRef.current === mountedCardElement) {
                cardElementRef.current = null;
            }
            elementsRef.current = null;
            stripeRef.current = null;
        };
    }, [stripePublishableKey]);

    if (!token) {
        return <Navigate to="/login" replace />;
    }

    if (!therapistId || !therapistMenuId || !serviceAddressId || !availabilitySlotId || !requestedStartAt) {
        return <Navigate to="/user/therapists" replace />;
    }

    if (isLoading) {
        return <LoadingScreen title="見積もりを作成中" message="料金内訳とカード入力の準備を進めています。" />;
    }

    async function handleSubmitRequest() {
        if (!token || !quote) {
            return;
        }

        if (!stripeRef.current || !cardElementRef.current) {
            showError('カード入力の準備がまだ完了していません。');
            return;
        }

        if (!isCardComplete) {
            setCardError('カード番号、有効期限、CVC を入力してください。');
            return;
        }

        setIsSubmitting(true);
        setCardError(null);

        try {
            let activeBooking = booking;

            if (!activeBooking) {
                const bookingPayload = await apiRequest<ApiEnvelope<BookingDetailRecord>>('/bookings', {
                    method: 'POST',
                    token,
                    body: { quote_id: quote.quote_id },
                });

                activeBooking = unwrapData(bookingPayload);
                setBooking(activeBooking);
                setSearchParams((current) => {
                    const next = new URLSearchParams(current);
                    next.set('booking_id', activeBooking?.public_id ?? '');

                    return next;
                }, { replace: true });
            }

            const paymentIntentPayload = await apiRequest<ApiEnvelope<PaymentIntentRecord>>(
                `/bookings/${activeBooking.public_id}/payment-intents`,
                {
                    method: 'POST',
                    token,
                },
            );
            const nextPaymentIntent = unwrapData(paymentIntentPayload);

            if (!nextPaymentIntent.client_secret) {
                throw new Error('カード確認を開始できませんでした。');
            }

            const confirmation = await stripeRef.current.confirmCardPayment(nextPaymentIntent.client_secret, {
                payment_method: {
                    card: cardElementRef.current,
                },
            });

            if (confirmation.error?.message) {
                throw new Error(confirmation.error.message);
            }

            const syncPayload = await apiRequest<ApiEnvelope<{ booking: BookingDetailRecord; payment_intent: PaymentIntentRecord | null }>>(
                `/bookings/${activeBooking.public_id}/payment-sync`,
                {
                    method: 'POST',
                    token,
                },
            );
            const synced = unwrapData(syncPayload);
            setBooking(synced.booking);
            navigate(`/user/booking-request/waiting?booking_id=${encodeURIComponent(synced.booking.public_id)}`);
        } catch (submitRequestError) {
            const message = friendlyCardError(submitRequestError);
            setCardError(message);
            showError(message);
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[32px] bg-[linear-gradient(117deg,#17202b_0%,#243447_52%,#2b4158_100%)] p-7 text-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">STEP 1</p>
                        <div className="space-y-2">
                            <h1 className="text-3xl font-semibold">見積もり確認とカード入力</h1>
                            <p className="max-w-3xl text-sm leading-7 text-slate-300">
                                金額を確認したあと、この画面のままカード情報を入力して依頼を送れます。内容を変えたいときは空き時間画面へ戻って選び直してください。
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Link
                            to={availabilityPath}
                            className="inline-flex items-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8"
                        >
                            空き時間へ戻る
                        </Link>
                        <Link
                            to={detailPath}
                            className="inline-flex items-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8"
                        >
                            プロフィールへ戻る
                        </Link>
                    </div>
                </div>
            </section>

            <BookingFlowSteps current="quote" />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.78fr)]">
                <section className="space-y-5">
                    <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div>
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">BOOKING</p>
                                <h2 className="mt-3 text-2xl font-semibold text-[#17202b]">
                                    {therapistDetail?.public_name ?? 'セラピストを確認中'}
                                </h2>
                                <p className="mt-3 text-sm leading-7 text-[#68707a]">
                                    {selectedMenu ? `${selectedMenu.name} / ${durationMinutes}分` : '対応内容を確認中'}
                                </p>
                                <p className="mt-2 text-xs text-[#68707a]">
                                    {selectedMenu ? `${formatMenuMinimumDurationLabel(selectedMenu)} / ${formatMenuHourlyRateLabel(selectedMenu)}` : '料金条件を確認中'}
                                </p>
                            </div>
                            <div className="rounded-[22px] bg-[#f8f4ed] px-5 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">REQUEST START</p>
                                <p className="mt-2 text-lg font-semibold text-[#17202b]">{formatDateTime(requestedStartAt)}</p>
                            </div>
                        </div>
                    </article>

                    <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">PRICE BREAKDOWN</p>
                        {quote ? (
                            <div className="mt-5 space-y-4">
                                {[
                                    ['基本料金', quote.amounts.base_amount],
                                    ['移動費', quote.amounts.travel_fee_amount],
                                    ['深夜料金', quote.amounts.night_fee_amount],
                                    ['需要加算', quote.amounts.demand_fee_amount],
                                    ['プロフィール加算', quote.amounts.profile_adjustment_amount],
                                    ['マッチング手数料', quote.amounts.matching_fee_amount],
                                ].map(([label, amount]) => (
                                    <div key={label} className="flex items-center justify-between gap-4 text-sm text-[#48505a]">
                                        <span>{label}</span>
                                        <span className="font-semibold text-[#17202b]">{formatCurrency(Number(amount))}</span>
                                    </div>
                                ))}

                                <div className="border-t border-[#efe5d7] pt-4">
                                    <div className="flex items-center justify-between gap-4">
                                        <span className="text-base font-semibold text-[#17202b]">お支払い予定額</span>
                                        <span className="text-2xl font-semibold text-[#17202b]">
                                            {formatCurrency(quote.amounts.total_amount)}
                                        </span>
                                    </div>
                                    <p className="mt-2 text-sm leading-7 text-[#68707a]">
                                        徒歩目安: {formatWalkingTimeRange(quote.walking_time_range)}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <p className="mt-4 text-sm leading-7 text-[#68707a]">
                                見積もりを取得できませんでした。
                            </p>
                        )}
                    </article>

                    <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <div className="space-y-3">
                            <div>
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">CARD</p>
                                <h2 className="mt-2 text-2xl font-semibold text-[#17202b]">カード情報を入力</h2>
                                <p className="mt-2 text-sm leading-7 text-[#68707a]">
                                    依頼を送るときに、このカードへ与信を確保します。承諾前は仮押さえ扱いで、辞退や期限切れなら取消対象です。
                                </p>
                            </div>
                        </div>

                        {!stripePublishableKey ? (
                            <div className="mt-5 rounded-[22px] border border-dashed border-[#d9c9ae] bg-[#fffaf2] px-5 py-5 text-sm leading-7 text-[#68707a]">
                                カード入力に必要な Stripe 公開鍵が未設定です。`STRIPE_PUBLISHABLE_KEY` を設定すると、この画面でカード確認を進められます。
                            </div>
                        ) : (
                            <div className="mt-5 space-y-4">
                                <div className="rounded-[22px] border border-[#e8dfd2] bg-[#fffdf8] px-4 py-4">
                                    {isPreparingCard ? (
                                        <p className="text-sm text-[#68707a]">カード入力欄を準備しています...</p>
                                    ) : (
                                        <div ref={cardMountRef} />
                                    )}
                                </div>

                                {cardError ? (
                                    <p className="text-sm text-[#b45309]">{cardError}</p>
                                ) : (
                                    <p className="text-xs leading-6 text-[#7d6852]">
                                        カード番号、有効期限、CVC を入力してください。保存済みカードではなく、その場で毎回入力する前提です。
                                    </p>
                                )}
                            </div>
                        )}
                    </article>
                </section>

                <aside className="space-y-5">
                    <section className="rounded-[28px] bg-[#fffcf7] p-6 shadow-[0_18px_36px_rgba(23,32,43,0.1)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">SUMMARY</p>
                        <div className="mt-4 space-y-4 text-sm text-[#48505a]">
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">待ち合わせ場所</p>
                                <p className="mt-1 font-semibold text-[#17202b]">
                                    {selectedAddress ? getServiceAddressLabel(selectedAddress) : '未選択'}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">予約方法</p>
                                <p className="mt-1 font-semibold text-[#17202b]">予約リクエスト</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">徒歩目安</p>
                                <p className="mt-1 font-semibold text-[#17202b]">
                                    {formatWalkingTimeRange(quote?.walking_time_range)}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">見積もり有効期限</p>
                                <p className="mt-1 font-semibold text-[#17202b]">
                                    {formatExpiresAt(quote?.expires_at ?? null)}
                                </p>
                            </div>
                            {booking ? (
                                <div>
                                    <p className="text-xs font-semibold text-[#7d6852]">予約ID</p>
                                    <p className="mt-1 font-semibold text-[#17202b]">{booking.public_id}</p>
                                </div>
                            ) : null}
                        </div>

                        <div className="mt-6 space-y-3">
                            {hasAuthorizedRequest && waitingPath ? (
                                <Link
                                    to={waitingPath}
                                    className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140]"
                                >
                                    承諾待ちを確認する
                                </Link>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => void handleSubmitRequest()}
                                    disabled={isSubmitting || isPreparingCard || !stripePublishableKey || !isCardComplete}
                                    className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-bold text-[#1a2430] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isSubmitting ? 'カード確認と依頼送信を進めています...' : 'カードを確認して依頼を送る'}
                                </button>
                            )}
                            <p className="text-xs leading-6 text-[#7d6852]">
                                このボタンで予約作成、与信確保、依頼送信まで進みます。完了後は承諾待ちの画面へ切り替わります。
                            </p>
                        </div>
                    </section>
                </aside>
            </div>
        </div>
    );
}
