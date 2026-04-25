import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import {
    formatCurrency,
    formatWalkingTimeRange,
    getServiceAddressLabel,
} from '../lib/discovery';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import type {
    ApiEnvelope,
    BookingQuoteRecord,
    ServiceAddress,
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

export function UserBookingQuotePage() {
    const { token } = useAuth();
    const [searchParams] = useSearchParams();
    const [therapistDetail, setTherapistDetail] = useState<TherapistDetail | null>(null);
    const [serviceAddresses, setServiceAddresses] = useState<ServiceAddress[]>([]);
    const [quote, setQuote] = useState<BookingQuoteRecord | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const therapistId = searchParams.get('therapist_id');
    const therapistMenuId = searchParams.get('therapist_menu_id');
    const serviceAddressId = searchParams.get('service_address_id');
    const availabilitySlotId = searchParams.get('availability_slot_id');
    const requestedStartAt = searchParams.get('requested_start_at');
    const durationMinutes = normalizeDuration(searchParams.get('menu_duration_minutes'));

    usePageTitle('見積もり確認');

    const selectedAddress = useMemo(
        () => serviceAddresses.find((address) => address.public_id === serviceAddressId) ?? null,
        [serviceAddresses, serviceAddressId],
    );

    const selectedMenu = useMemo<TherapistMenu | null>(() => {
        if (!therapistDetail) {
            return null;
        }

        return therapistDetail.menus.find((menu) => menu.public_id === therapistMenuId)
            ?? therapistDetail.menus.find((menu) => menu.duration_minutes === durationMinutes)
            ?? therapistDetail.menus[0]
            ?? null;
    }, [durationMinutes, therapistDetail, therapistMenuId]);

    useEffect(() => {
        let isMounted = true;

        async function bootstrap() {
            if (
                !token
                || !therapistId
                || !therapistMenuId
                || !serviceAddressId
                || !availabilitySlotId
                || !requestedStartAt
            ) {
                setIsLoading(false);
                return;
            }

            try {
                const [detailPayload, addressPayload, quotePayload] = await Promise.all([
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
                ]);

                if (!isMounted) {
                    return;
                }

                setTherapistDetail(unwrapData(detailPayload));
                setServiceAddresses(unwrapData(addressPayload));
                setQuote(unwrapData(quotePayload));
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
    }, [availabilitySlotId, durationMinutes, requestedStartAt, serviceAddressId, therapistId, therapistMenuId, token]);

    if (!therapistId || !therapistMenuId || !serviceAddressId || !availabilitySlotId || !requestedStartAt) {
        return <Navigate to="/user/therapists" replace />;
    }

    if (isLoading) {
        return <LoadingScreen title="見積もりを作成中" message="料金内訳と徒歩目安を計算しています。" />;
    }

    const requestPath = `/user/booking-request?${searchParams.toString()}`;
    const availabilityPath = `/user/therapists/${therapistId}/availability?${searchParams.toString()}`;
    const hasPrerequisites = Boolean(selectedAddress && selectedMenu && quote);

    return (
        <div className="mx-auto max-w-6xl space-y-6">
            <section className="rounded-[32px] bg-[linear-gradient(117deg,#17202b_0%,#243447_52%,#2b4158_100%)] p-7 text-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">QUOTE PREVIEW</p>
                        <div className="space-y-2">
                            <h1 className="text-3xl font-semibold">見積もりを確認</h1>
                            <p className="max-w-3xl text-sm leading-7 text-slate-300">
                                金額はこの内容で計算されています。空き枠や施術場所の条件が変わると再計算になるので、
                                変更したい場合は前の画面へ戻って選び直してください。
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Link
                            to={requestPath}
                            className="inline-flex items-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8"
                        >
                            内容を修正
                        </Link>
                        <Link
                            to={availabilityPath}
                            className="inline-flex items-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8"
                        >
                            空き時間へ戻る
                        </Link>
                    </div>
                </div>
            </section>

            {error ? (
                <section className="rounded-[24px] border border-[#f1d4b5] bg-[#fff4e8] px-5 py-4 text-sm text-[#9a4b35]">
                    {error}
                </section>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(340px,0.75fr)]">
                <section className="space-y-5">
                    <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div>
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">BOOKING</p>
                                <h2 className="mt-3 text-2xl font-semibold text-[#17202b]">
                                    {therapistDetail?.public_name ?? 'セラピストを確認中'}
                                </h2>
                                <p className="mt-3 text-sm leading-7 text-[#68707a]">
                                    {selectedMenu ? `${selectedMenu.name} / ${selectedMenu.duration_minutes}分` : 'メニューを確認中'}
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
                                    ['プラットフォーム料', quote.amounts.platform_fee_amount],
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
                </section>

                <aside className="space-y-5">
                    <section className="rounded-[28px] bg-[#fffcf7] p-6 shadow-[0_18px_36px_rgba(23,32,43,0.1)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">SUMMARY</p>
                        <div className="mt-4 space-y-4 text-sm text-[#48505a]">
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">施術場所</p>
                                <p className="mt-1 font-semibold text-[#17202b]">
                                    {selectedAddress ? getServiceAddressLabel(selectedAddress) : '未選択'}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">見積もり有効期限</p>
                                <p className="mt-1 font-semibold text-[#17202b]">
                                    {formatExpiresAt(quote?.expires_at ?? null)}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">空き枠</p>
                                <p className="mt-1 font-semibold text-[#17202b]">{availabilitySlotId}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">予約方法</p>
                                <p className="mt-1 font-semibold text-[#17202b]">予定予約リクエスト</p>
                            </div>
                        </div>

                        <div className="mt-6 rounded-[22px] bg-[#f8f4ed] px-4 py-4 text-sm leading-7 text-[#68707a]">
                            カード与信のフロント導線は次に接続します。いまは見積もりまでを実データで確認できる状態です。
                        </div>

                        <div className="mt-6 space-y-3">
                            <button
                                type="button"
                                disabled
                                className="inline-flex w-full items-center justify-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-semibold text-[#17202b] opacity-60"
                            >
                                {hasPrerequisites ? '次にカード与信をつなぎます' : '内容を見直してください'}
                            </button>
                            <p className="text-xs leading-6 text-[#7d6852]">
                                ここまでで、公開プロフィール → 空き時間 → 予約内容 → 見積もり確認までプレビューできます。
                            </p>
                        </div>
                    </section>
                </aside>
            </div>
        </div>
    );
}
