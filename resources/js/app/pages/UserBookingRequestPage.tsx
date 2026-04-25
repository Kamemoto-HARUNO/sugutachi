import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import {
    formatCurrency,
    formatWalkingTimeRange,
    getDefaultServiceAddress,
    getServiceAddressLabel,
} from '../lib/discovery';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import type {
    ApiEnvelope,
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

function normalizeDuration(value: string | null): number {
    const parsed = Number(value);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
}

export function UserBookingRequestPage() {
    const { token } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [therapistDetail, setTherapistDetail] = useState<TherapistDetail | null>(null);
    const [serviceAddresses, setServiceAddresses] = useState<ServiceAddress[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const therapistId = searchParams.get('therapist_id');
    const therapistMenuId = searchParams.get('therapist_menu_id');
    const serviceAddressId = searchParams.get('service_address_id');
    const availabilitySlotId = searchParams.get('availability_slot_id');
    const requestedStartAt = searchParams.get('requested_start_at');
    const requestedDate = searchParams.get('date');
    const durationMinutes = normalizeDuration(searchParams.get('menu_duration_minutes'));

    usePageTitle('予約内容の確認');

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
            if (!token || !therapistId) {
                setIsLoading(false);
                return;
            }

            try {
                const [detailPayload, addressPayload] = await Promise.all([
                    apiRequest<ApiEnvelope<TherapistDetail>>(`/therapists/${therapistId}`, { token }),
                    apiRequest<ApiEnvelope<ServiceAddress[]>>('/me/service-addresses', { token }),
                ]);

                if (!isMounted) {
                    return;
                }

                const nextAddresses = unwrapData(addressPayload);
                setTherapistDetail(unwrapData(detailPayload));
                setServiceAddresses(nextAddresses);

                if (!serviceAddressId) {
                    const fallback = getDefaultServiceAddress(nextAddresses);

                    if (fallback) {
                        setSearchParams((previous) => {
                            const next = new URLSearchParams(previous);
                            next.set('service_address_id', fallback.public_id);

                            return next;
                        }, { replace: true });
                    }
                }
            } catch (requestError) {
                if (!isMounted) {
                    return;
                }

                const message =
                    requestError instanceof ApiError
                        ? requestError.message
                        : '予約情報の読み込みに失敗しました。';

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
    }, [serviceAddressId, setSearchParams, therapistId, token]);

    if (!therapistId || !therapistMenuId || !availabilitySlotId || !requestedStartAt) {
        return <Navigate to="/user/therapists" replace />;
    }

    if (isLoading) {
        return <LoadingScreen title="予約内容を確認中" message="選択したセラピスト、メニュー、施術場所を読み込んでいます。" />;
    }

    const availabilityPath = therapistId
        ? `/user/therapists/${therapistId}/availability?${searchParams.toString()}`
        : '/user/therapists';
    const quotePath = selectedMenu && selectedAddress
        ? `/user/booking-request/quote?${searchParams.toString()}`
        : null;

    return (
        <div className="mx-auto max-w-6xl space-y-6">
            <section className="rounded-[32px] bg-[linear-gradient(117deg,#17202b_0%,#243447_52%,#2b4158_100%)] p-7 text-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">BOOKING REQUEST</p>
                        <div className="space-y-2">
                            <h1 className="text-3xl font-semibold">予定予約の内容を確認</h1>
                            <p className="max-w-3xl text-sm leading-7 text-slate-300">
                                この次の画面で概算金額と徒歩目安を確定します。施術場所を変えた場合は、
                                公開枠の条件が変わることがあるので、その場合は空き時間画面へ戻って選び直してください。
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
                            to="/user/service-addresses"
                            className="inline-flex items-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8"
                        >
                            施術場所を管理
                        </Link>
                    </div>
                </div>
            </section>

            {error ? (
                <section className="rounded-[24px] border border-[#f1d4b5] bg-[#fff4e8] px-5 py-4 text-sm text-[#9a4b35]">
                    {error}
                </section>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(340px,0.78fr)]">
                <section className="space-y-5">
                    <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">THERAPIST</p>
                        <h2 className="mt-3 text-2xl font-semibold text-[#17202b]">
                            {therapistDetail?.public_name ?? 'セラピストを確認中'}
                        </h2>
                        <p className="mt-3 text-sm leading-7 text-[#68707a]">
                            {therapistDetail?.bio ?? 'プロフィール内容を読み込んでいます。'}
                        </p>
                    </article>

                    <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div>
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">MENU</p>
                                <h2 className="mt-3 text-2xl font-semibold text-[#17202b]">
                                    {selectedMenu ? `${selectedMenu.name} / ${selectedMenu.duration_minutes}分` : 'メニュー未選択'}
                                </h2>
                                <p className="mt-3 text-sm leading-7 text-[#68707a]">
                                    {selectedMenu?.description ?? 'メニュー説明はまだ設定されていません。'}
                                </p>
                            </div>

                            <div className="rounded-[22px] bg-[#f8f4ed] px-5 py-4 text-right">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">BASE PRICE</p>
                                <p className="mt-2 text-lg font-semibold text-[#17202b]">
                                    {selectedMenu ? formatCurrency(selectedMenu.base_price_amount) : '未設定'}
                                </p>
                            </div>
                        </div>
                    </article>

                    <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">SERVICE ADDRESS</p>
                        <div className="mt-4 grid gap-3">
                            {serviceAddresses.length > 0 ? (
                                serviceAddresses.map((address) => (
                                    <button
                                        key={address.public_id}
                                        type="button"
                                        onClick={() => {
                                            setSearchParams((previous) => {
                                                const next = new URLSearchParams(previous);
                                                next.set('service_address_id', address.public_id);

                                                return next;
                                            });
                                        }}
                                        className={[
                                            'rounded-[22px] border px-5 py-4 text-left transition',
                                            selectedAddress?.public_id === address.public_id
                                                ? 'border-[#d2b179] bg-[#fff8ee]'
                                                : 'border-[#ebe2d3] bg-[#fffdf8] hover:bg-[#fff9f1]',
                                        ].join(' ')}
                                    >
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-sm font-semibold text-[#17202b]">
                                                {getServiceAddressLabel(address)}
                                            </span>
                                            {address.is_default ? (
                                                <span className="rounded-full bg-[#17202b] px-3 py-1 text-xs font-semibold text-white">
                                                    既定
                                                </span>
                                            ) : null}
                                        </div>
                                        <p className="mt-2 text-sm leading-7 text-[#68707a]">
                                            {[address.prefecture, address.city, address.address_line, address.building].filter(Boolean).join(' ')}
                                        </p>
                                    </button>
                                ))
                            ) : (
                                <div className="rounded-[22px] border border-dashed border-[#d9c9ae] bg-[#fffaf2] px-5 py-5 text-sm leading-7 text-[#68707a]">
                                    施術場所がまだありません。先に住所を追加すると予約リクエストに進めます。
                                </div>
                            )}
                        </div>
                    </article>
                </section>

                <aside className="space-y-5">
                    <section className="rounded-[28px] bg-[#fffcf7] p-6 shadow-[0_18px_36px_rgba(23,32,43,0.1)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">REQUEST SUMMARY</p>
                        <div className="mt-4 space-y-4 text-sm text-[#48505a]">
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">予約方法</p>
                                <p className="mt-1 font-semibold text-[#17202b]">予定予約リクエスト</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">開始希望</p>
                                <p className="mt-1 font-semibold text-[#17202b]">{formatDateTime(requestedStartAt)}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">空き枠の日付</p>
                                <p className="mt-1 font-semibold text-[#17202b]">{requestedDate ?? '当日'}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">施術場所</p>
                                <p className="mt-1 font-semibold text-[#17202b]">
                                    {selectedAddress ? getServiceAddressLabel(selectedAddress) : '未選択'}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">徒歩目安</p>
                                <p className="mt-1 font-semibold text-[#17202b]">
                                    {formatWalkingTimeRange(therapistDetail?.walking_time_range)}
                                </p>
                            </div>
                        </div>

                        <div className="mt-6 space-y-3">
                            {quotePath ? (
                                <Link
                                    to={quotePath}
                                    className="inline-flex w-full items-center justify-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:brightness-105"
                                >
                                    見積もりを確認する
                                </Link>
                            ) : (
                                <Link
                                    to="/user/service-addresses"
                                    className="inline-flex w-full items-center justify-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:brightness-105"
                                >
                                    施術場所を追加する
                                </Link>
                            )}
                            <p className="text-xs leading-6 text-[#7d6852]">
                                まだ予約は送信されません。次の画面で概算料金と受付条件を確認します。
                            </p>
                        </div>
                    </section>
                </aside>
            </div>
        </div>
    );
}
