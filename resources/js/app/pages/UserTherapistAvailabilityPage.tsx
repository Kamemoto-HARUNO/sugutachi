import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { DiscoveryFooter } from '../components/discovery/DiscoveryFooter';
import { DiscoveryHeroShell } from '../components/discovery/DiscoveryHeroShell';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import {
    formatCurrency,
    formatTrainingStatus,
    formatWalkingTimeRange,
    getDefaultServiceAddress,
    getServiceAddressLabel,
} from '../lib/discovery';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import type {
    ApiEnvelope,
    PublicTherapistAvailability,
    PublicTherapistAvailabilityWindow,
    ServiceAddress,
    ServiceMeta,
    TherapistDetail,
    TherapistMenu,
} from '../lib/types';

const QUARTER_HOUR_MS = 15 * 60 * 1000;
const DEFAULT_MENU_DURATION = 60;

interface StartOption {
    requested_start_at: string;
    label: string;
    end_label: string;
}

function todayDateValue(): string {
    const today = new Date();

    return [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0'),
    ].join('-');
}

function normalizeDateValue(value: string | null): string {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }

    return todayDateValue();
}

function formatDateLabel(value: string): string {
    const [year, month, day] = value.split('-').map((part) => Number(part));
    const date = new Date(year, (month || 1) - 1, day || 1);

    if (Number.isNaN(date.getTime())) {
        return '日付を選択';
    }

    return new Intl.DateTimeFormat('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        weekday: 'short',
    }).format(date);
}

function formatTimeLabel(value: string): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '--:--';
    }

    return new Intl.DateTimeFormat('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

function formatDateTimeLabel(value: string): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '日時未定';
    }

    return new Intl.DateTimeFormat('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

function formatWindowLength(startAt: string, endAt: string): string {
    const diffMinutes = Math.max(0, Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000));

    if (diffMinutes === 0) {
        return '所要時間を確認中';
    }

    return `${diffMinutes}分の連続空き時間`;
}

function buildAmountRangeLabel(
    amountRange: PublicTherapistAvailability['estimated_total_amount_range'],
    menu: TherapistMenu | null,
): string {
    if (!amountRange) {
        return '概算料金は予約時に確認';
    }

    const prefix = menu ? `${menu.duration_minutes}分 ` : '';

    if (amountRange.min === amountRange.max) {
        return `${prefix}${formatCurrency(amountRange.min)}`;
    }

    return `${prefix}${formatCurrency(amountRange.min)}〜${formatCurrency(amountRange.max)}`;
}

function enumerateStartOptions(
    window: PublicTherapistAvailabilityWindow,
    durationMinutes: number,
): StartOption[] {
    if (!durationMinutes) {
        return [];
    }

    const startAt = new Date(window.start_at);
    const endAt = new Date(window.end_at);
    const latestStartAt = new Date(endAt.getTime() - durationMinutes * 60000);

    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || latestStartAt.getTime() < startAt.getTime()) {
        return [];
    }

    const options: StartOption[] = [];

    for (let currentTime = startAt.getTime(); currentTime <= latestStartAt.getTime(); currentTime += QUARTER_HOUR_MS) {
        const current = new Date(currentTime);
        const end = new Date(currentTime + durationMinutes * 60000);

        options.push({
            requested_start_at: current.toISOString(),
            label: formatTimeLabel(current.toISOString()),
            end_label: formatTimeLabel(end.toISOString()),
        });
    }

    return options;
}

export function UserTherapistAvailabilityPage() {
    const { publicId } = useParams();
    const { token } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [serviceMeta, setServiceMeta] = useState<ServiceMeta | null>(null);
    const [serviceAddresses, setServiceAddresses] = useState<ServiceAddress[]>([]);
    const [therapistDetail, setTherapistDetail] = useState<TherapistDetail | null>(null);
    const [availability, setAvailability] = useState<PublicTherapistAvailability | null>(null);
    const [bootstrapError, setBootstrapError] = useState<string | null>(null);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [availabilityError, setAvailabilityError] = useState<string | null>(null);
    const [isBootstrapping, setIsBootstrapping] = useState(true);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);

    const selectedAddressId = searchParams.get('service_address_id');
    const selectedMenuId = searchParams.get('therapist_menu_id');
    const selectedDate = normalizeDateValue(
        searchParams.get('date') ?? searchParams.get('scheduled_start_at')?.slice(0, 10) ?? null,
    );
    const selectedDuration = Number(searchParams.get('menu_duration_minutes') ?? String(DEFAULT_MENU_DURATION));

    const selectedAddress = useMemo(
        () => serviceAddresses.find((address) => address.public_id === selectedAddressId) ?? null,
        [selectedAddressId, serviceAddresses],
    );

    const selectedMenu = useMemo(() => {
        if (!therapistDetail) {
            return null;
        }

        return therapistDetail.menus.find((menu) => menu.public_id === selectedMenuId)
            ?? therapistDetail.menus.find((menu) => menu.duration_minutes === selectedDuration)
            ?? therapistDetail.menus[0]
            ?? null;
    }, [selectedDuration, selectedMenuId, therapistDetail]);

    const quickDateOptions = useMemo(() => {
        const options = new Set<string>();
        const baseDate = new Date();

        for (let index = 0; index < 4; index += 1) {
            const nextDate = new Date(baseDate);
            nextDate.setDate(baseDate.getDate() + index);
            options.add([
                nextDate.getFullYear(),
                String(nextDate.getMonth() + 1).padStart(2, '0'),
                String(nextDate.getDate()).padStart(2, '0'),
            ].join('-'));
        }

        options.add(selectedDate);

        return Array.from(options).sort();
    }, [selectedDate]);

    const availabilityCards = useMemo(() => {
        if (!availability || !selectedMenu) {
            return [];
        }

        return availability.windows
            .map((window) => ({
                ...window,
                startOptions: enumerateStartOptions(window, selectedMenu.duration_minutes),
            }))
            .filter((window) => window.startOptions.length > 0);
    }, [availability, selectedMenu]);

    usePageTitle(therapistDetail ? `${therapistDetail.public_name}の空き時間` : '空き時間選択');

    const updateSearchParam = (updates: Record<string, string | null>) => {
        setSearchParams((previous) => {
            const next = new URLSearchParams(previous);

            Object.entries(updates).forEach(([key, value]) => {
                if (!value) {
                    next.delete(key);
                    return;
                }

                next.set(key, value);
            });

            return next;
        });
    };

    useEffect(() => {
        let isMounted = true;

        async function bootstrap() {
            if (!token) {
                setIsBootstrapping(false);
                return;
            }

            try {
                const [metaPayload, addressPayload] = await Promise.all([
                    apiRequest<ApiEnvelope<ServiceMeta>>('/service-meta'),
                    apiRequest<ApiEnvelope<ServiceAddress[]>>('/me/service-addresses', { token }),
                ]);

                if (!isMounted) {
                    return;
                }

                setServiceMeta(unwrapData(metaPayload));
                setServiceAddresses(unwrapData(addressPayload));
            } catch (requestError) {
                if (!isMounted) {
                    return;
                }

                const message =
                    requestError instanceof ApiError ? requestError.message : '施術場所の取得に失敗しました。';

                setBootstrapError(message);
            } finally {
                if (isMounted) {
                    setIsBootstrapping(false);
                }
            }
        }

        void bootstrap();

        return () => {
            isMounted = false;
        };
    }, [token]);

    useEffect(() => {
        if (!publicId) {
            return;
        }

        const fallbackAddress = selectedAddress
            ?? getDefaultServiceAddress(serviceAddresses);
        const hasValidStartType = searchParams.get('start_type') === 'scheduled';
        const nextMenu = selectedMenu ?? null;

        if (!fallbackAddress && serviceAddresses.length > 0) {
            return;
        }

        const nextParams = new URLSearchParams(searchParams);
        let changed = false;

        if (!hasValidStartType) {
            nextParams.set('start_type', 'scheduled');
            changed = true;
        }

        if (nextParams.get('date') !== selectedDate) {
            nextParams.set('date', selectedDate);
            changed = true;
        }

        if ((!selectedAddressId || !selectedAddress) && fallbackAddress) {
            nextParams.set('service_address_id', fallbackAddress.public_id);
            changed = true;
        }

        if (nextMenu && nextParams.get('therapist_menu_id') !== nextMenu.public_id) {
            nextParams.set('therapist_menu_id', nextMenu.public_id);
            changed = true;
        }

        if (nextMenu && nextParams.get('menu_duration_minutes') !== String(nextMenu.duration_minutes)) {
            nextParams.set('menu_duration_minutes', String(nextMenu.duration_minutes));
            changed = true;
        }

        if (changed) {
            setSearchParams(nextParams, { replace: true });
        }
    }, [
        publicId,
        searchParams,
        selectedAddress,
        selectedAddressId,
        selectedDate,
        selectedMenu,
        serviceAddresses,
        setSearchParams,
    ]);

    useEffect(() => {
        let isMounted = true;

        async function loadDetail() {
            if (!publicId || !token) {
                return;
            }

            setIsLoadingDetail(true);
            setDetailError(null);

            try {
                const params = new URLSearchParams({
                    start_type: 'scheduled',
                    menu_duration_minutes: String(Number.isNaN(selectedDuration) ? DEFAULT_MENU_DURATION : selectedDuration),
                });

                if (selectedAddressId) {
                    params.set('service_address_id', selectedAddressId);
                }

                const payload = await apiRequest<ApiEnvelope<TherapistDetail>>(`/therapists/${publicId}?${params.toString()}`, {
                    token,
                });

                if (!isMounted) {
                    return;
                }

                setTherapistDetail(unwrapData(payload));
            } catch (requestError) {
                if (!isMounted) {
                    return;
                }

                const message =
                    requestError instanceof ApiError ? requestError.message : 'プロフィールの取得に失敗しました。';

                setDetailError(message);
                setTherapistDetail(null);
            } finally {
                if (isMounted) {
                    setIsLoadingDetail(false);
                }
            }
        }

        void loadDetail();

        return () => {
            isMounted = false;
        };
    }, [publicId, selectedAddressId, selectedDuration, token]);

    useEffect(() => {
        let isMounted = true;

        async function loadAvailability() {
            if (!publicId || !token || !selectedAddressId || !selectedMenu) {
                setAvailability(null);
                return;
            }

            setIsLoadingAvailability(true);
            setAvailabilityError(null);

            try {
                const params = new URLSearchParams({
                    service_address_id: selectedAddressId,
                    therapist_menu_id: selectedMenu.public_id,
                    date: selectedDate,
                });

                const payload = await apiRequest<ApiEnvelope<PublicTherapistAvailability>>(
                    `/therapists/${publicId}/availability?${params.toString()}`,
                    { token },
                );

                if (!isMounted) {
                    return;
                }

                setAvailability(unwrapData(payload));
            } catch (requestError) {
                if (!isMounted) {
                    return;
                }

                const message =
                    requestError instanceof ApiError ? requestError.message : '空き時間の取得に失敗しました。';

                setAvailabilityError(message);
                setAvailability(null);
            } finally {
                if (isMounted) {
                    setIsLoadingAvailability(false);
                }
            }
        }

        void loadAvailability();

        return () => {
            isMounted = false;
        };
    }, [publicId, selectedAddressId, selectedDate, selectedMenu, token]);

    if (isBootstrapping) {
        return <LoadingScreen title="空き時間の準備中" message="施術場所と公開情報を確認しています。" />;
    }

    if (isLoadingDetail && !therapistDetail) {
        return <LoadingScreen title="空き時間を準備中" message="セラピスト情報と予約可能枠を読み込んでいます。" />;
    }

    const heroTitle = therapistDetail ? `${therapistDetail.public_name} の空き時間` : '空き時間選択';
    const detailPath = therapistDetail ? `/therapists/${therapistDetail.public_id}?${searchParams.toString()}` : '/user/therapists';
    const listPath = `/user/therapists${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
    const footerDescription = '15分単位の開始候補から予約リクエストを作成できます。リクエスト後は仮押さえになり、承認または期限切れまで与信を保持します。';

    return (
        <div className="min-h-screen bg-[#f6f1e7] text-[#17202b]">
            <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-16 px-6 py-10 md:px-10 md:py-14 xl:gap-[60px] xl:px-0">
                <DiscoveryHeroShell
                    domain={serviceMeta?.domain ?? 'sugutachi.com'}
                    title={heroTitle}
                    description="日時指定の公開枠から、希望の開始時刻を選んで予約リクエストへ進めます。正確な位置は出さず、公開エリア名と徒歩目安だけを見ながら比較できます。"
                    topBadge={therapistDetail?.training_status ? formatTrainingStatus(therapistDetail.training_status) : '予定予約受付中'}
                    bullets={[
                        selectedAddress ? `${getServiceAddressLabel(selectedAddress)} 基準` : '施術場所を選択してください',
                        selectedMenu ? `${selectedMenu.name} / ${selectedMenu.duration_minutes}分` : 'メニューを選択',
                        availability ? formatWalkingTimeRange(availability.walking_time_range) : '徒歩目安を確認',
                    ]}
                    primaryAction={{ label: 'プロフィールに戻る', to: detailPath }}
                    secondaryAction={{ label: '検索一覧へ', to: listPath, variant: 'secondary' }}
                >
                    <div className="rounded-[32px] border border-white/12 bg-[linear-gradient(109deg,rgba(255,249,241,0.18)_2.98%,rgba(255,255,255,0.04)_101.1%)] p-6 text-white shadow-[0_24px_60px_rgba(0,0,0,0.16)] md:p-8">
                        <div className="space-y-5">
                            <div className="space-y-1">
                                <h2 className="text-[1.35rem] font-semibold">予約条件を決める</h2>
                                <p className="text-sm text-[#c8c2b6]">住所、メニュー、日付を切り替えると公開中の空き時間が更新されます。</p>
                            </div>

                            <div className="grid gap-3 md:grid-cols-3">
                                <label className="rounded-[24px] bg-white px-5 py-4 text-[#121a23]">
                                    <span className="text-xs font-semibold text-[#69707a]">施術場所</span>
                                    <select
                                        value={selectedAddressId ?? ''}
                                        onChange={(event) => updateSearchParam({ service_address_id: event.target.value || null })}
                                        className="mt-2 w-full bg-transparent text-sm font-semibold outline-none"
                                    >
                                        {!selectedAddressId ? <option value="">施術場所を選択</option> : null}
                                        {serviceAddresses.map((address) => (
                                            <option key={address.public_id} value={address.public_id}>
                                                {getServiceAddressLabel(address)}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label className="rounded-[24px] bg-white px-5 py-4 text-[#121a23]">
                                    <span className="text-xs font-semibold text-[#69707a]">日付</span>
                                    <input
                                        type="date"
                                        min={todayDateValue()}
                                        value={selectedDate}
                                        onChange={(event) => updateSearchParam({ date: event.target.value || todayDateValue() })}
                                        className="mt-2 w-full bg-transparent text-sm font-semibold outline-none"
                                    />
                                </label>

                                <div className="rounded-[24px] bg-white px-5 py-4 text-[#121a23]">
                                    <p className="text-xs font-semibold text-[#69707a]">この条件の概算</p>
                                    <p className="mt-2 text-sm font-semibold">
                                        {buildAmountRangeLabel(availability?.estimated_total_amount_range ?? null, selectedMenu)}
                                    </p>
                                    <p className="mt-2 text-xs text-[#69707a]">
                                        {availability ? formatWalkingTimeRange(availability.walking_time_range) : '徒歩目安を確認'}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <p className="text-xs font-semibold tracking-wide text-[#d2b179]">メニュー</p>
                                <div className="flex flex-wrap gap-2">
                                    {therapistDetail?.menus.map((menu) => (
                                        <button
                                            key={menu.public_id}
                                            type="button"
                                            onClick={() => updateSearchParam({
                                                therapist_menu_id: menu.public_id,
                                                menu_duration_minutes: String(menu.duration_minutes),
                                            })}
                                            className={[
                                                'rounded-full px-4 py-2 text-sm font-semibold transition',
                                                selectedMenu?.public_id === menu.public_id
                                                    ? 'bg-[#d2b179] text-[#1a2430]'
                                                    : 'bg-white/10 text-[#f4efe5]',
                                            ].join(' ')}
                                        >
                                            {menu.name} / {menu.duration_minutes}分
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {quickDateOptions.map((option) => (
                                    <button
                                        key={option}
                                        type="button"
                                        onClick={() => updateSearchParam({ date: option })}
                                        className={[
                                            'rounded-full px-4 py-2 text-xs font-bold transition',
                                            option === selectedDate
                                                ? 'bg-[#e8f1eb] text-[#2d5b3d]'
                                                : 'bg-white/8 text-[#f0e9de]',
                                        ].join(' ')}
                                    >
                                        {formatDateLabel(option)}
                                    </button>
                                ))}
                            </div>

                            <div className="rounded-[20px] border border-white/10 bg-white/6 px-4 py-3 text-xs leading-6 text-[#d8d3ca]">
                                予定予約のリクエストは仮押さえ扱いです。承認前でも、同じセラピストには同時に複数リクエストできません。
                            </div>
                        </div>
                    </div>
                </DiscoveryHeroShell>

                {bootstrapError || detailError || availabilityError ? (
                    <div className="rounded-[28px] bg-[#fffcf7] p-6 text-sm text-[#9a4b35] shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                        {bootstrapError ?? detailError ?? availabilityError}
                    </div>
                ) : null}

                {serviceAddresses.length === 0 ? (
                    <section className="rounded-[32px] bg-[#fffdf8] p-6 shadow-[0_10px_24px_rgba(23,32,43,0.08)] md:p-8">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                            <div className="space-y-2">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">SERVICE ADDRESS</p>
                                <h2 className="text-2xl font-semibold text-[#17202b]">先に施術場所を登録してください</h2>
                                <p className="text-sm leading-7 text-[#68707a]">
                                    空き時間の距離と概算料金は、保存済みの施術場所を基準に計算します。
                                </p>
                            </div>

                            <Link
                                to="/user/service-addresses"
                                className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-6 py-3 text-sm font-bold text-[#1a2430] transition hover:brightness-105"
                            >
                                施術場所を追加
                            </Link>
                        </div>
                    </section>
                ) : null}

                {serviceAddresses.length > 0 ? (
                    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
                        <div className="space-y-6">
                            <section className="rounded-[32px] bg-[#fffdf8] p-6 shadow-[0_10px_24px_rgba(23,32,43,0.08)] md:p-8">
                                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                                    <div>
                                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">AVAILABLE WINDOWS</p>
                                        <h2 className="mt-1 text-2xl font-semibold text-[#17202b]">
                                            {formatDateLabel(availability?.date ?? selectedDate)} の空き時間
                                        </h2>
                                    </div>

                                    <p className="text-sm text-[#68707a]">
                                        開始候補は15分単位で表示します。
                                    </p>
                                </div>

                                {isLoadingAvailability ? (
                                    <div className="mt-6 grid gap-4">
                                        {[0, 1].map((index) => (
                                            <div
                                                key={index}
                                                className="h-[184px] animate-pulse rounded-[24px] bg-[#f6f1e7]"
                                            />
                                        ))}
                                    </div>
                                ) : availabilityCards.length > 0 ? (
                                    <div className="mt-6 grid gap-4">
                                        {availabilityCards.map((window) => (
                                            <article
                                                key={`${window.availability_slot_id}-${window.start_at}`}
                                                className="rounded-[28px] border border-[#efe5d7] bg-white p-5"
                                            >
                                                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                                    <div className="space-y-2">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="rounded-full bg-[#f5efe4] px-3 py-1 text-xs font-semibold text-[#48505a]">
                                                                {window.dispatch_area_label ?? '公開エリア調整中'}
                                                            </span>
                                                            <span className="rounded-full bg-[#eef4ff] px-3 py-1 text-xs font-semibold text-[#30527a]">
                                                                {formatWindowLength(window.start_at, window.end_at)}
                                                            </span>
                                                        </div>
                                                        <h3 className="text-xl font-semibold text-[#17202b]">
                                                            {formatTimeLabel(window.start_at)} - {formatTimeLabel(window.end_at)}
                                                        </h3>
                                                        <p className="text-sm leading-7 text-[#68707a]">
                                                            受付締切 {formatDateTimeLabel(window.booking_deadline_at)}
                                                        </p>
                                                    </div>

                                                    <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-3 text-sm text-[#48505a] md:min-w-[220px]">
                                                        {buildAmountRangeLabel(availability?.estimated_total_amount_range ?? null, selectedMenu)}
                                                    </div>
                                                </div>

                                                <div className="mt-5 space-y-3">
                                                    <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">開始時刻を選ぶ</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {window.startOptions.map((option) => {
                                                            const bookingParams = new URLSearchParams({
                                                                mode: 'scheduled',
                                                                therapist_id: therapistDetail?.public_id ?? publicId ?? '',
                                                                therapist_menu_id: selectedMenu?.public_id ?? '',
                                                                menu_duration_minutes: String(selectedMenu?.duration_minutes ?? DEFAULT_MENU_DURATION),
                                                                service_address_id: selectedAddress?.public_id ?? '',
                                                                availability_slot_id: window.availability_slot_id,
                                                                requested_start_at: option.requested_start_at,
                                                                date: selectedDate,
                                                                start_type: 'scheduled',
                                                            });

                                                            return (
                                                                <Link
                                                                    key={option.requested_start_at}
                                                                    to={`/user/booking-request?${bookingParams.toString()}`}
                                                                    className="inline-flex min-w-[110px] flex-col items-center justify-center rounded-[18px] border border-[#ddcfb4] px-4 py-3 text-center transition hover:border-[#c6a16a] hover:bg-[#fff8ee]"
                                                                >
                                                                    <span className="text-sm font-bold text-[#17202b]">{option.label}</span>
                                                                    <span className="mt-1 text-xs text-[#68707a]">終了 {option.end_label}</span>
                                                                </Link>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="mt-6 rounded-[24px] bg-[#f8f4ed] p-6">
                                        <h3 className="text-lg font-semibold text-[#17202b]">この日は公開中の枠がありません</h3>
                                        <p className="mt-2 text-sm leading-7 text-[#68707a]">
                                            別の日付を選ぶか、プロフィールに戻って条件を変えてみてください。セラピストが現在オンデマンド稼働中のときは、直近6時間以内の枠が非表示になります。
                                        </p>
                                    </div>
                                )}
                            </section>
                        </div>

                        <aside className="space-y-5">
                            <section className="rounded-[32px] bg-[#fffcf7] p-6 shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">BOOKING SUMMARY</p>
                                <div className="mt-4 space-y-4 text-sm text-[#48505a]">
                                    <div>
                                        <p className="text-xs font-semibold text-[#7d6852]">施術場所</p>
                                        <p className="mt-1 font-semibold text-[#17202b]">
                                            {selectedAddress ? getServiceAddressLabel(selectedAddress) : '未選択'}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-[#7d6852]">メニュー</p>
                                        <p className="mt-1 font-semibold text-[#17202b]">
                                            {selectedMenu ? `${selectedMenu.name} / ${selectedMenu.duration_minutes}分` : '未選択'}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-[#7d6852]">概算料金</p>
                                        <p className="mt-1 font-semibold text-[#17202b]">
                                            {buildAmountRangeLabel(availability?.estimated_total_amount_range ?? null, selectedMenu)}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-[#7d6852]">徒歩目安</p>
                                        <p className="mt-1 font-semibold text-[#17202b]">
                                            {availability ? formatWalkingTimeRange(availability.walking_time_range) : '取得待ち'}
                                        </p>
                                    </div>
                                </div>
                            </section>

                            <section className="rounded-[32px] bg-[#17202b] p-6 text-white shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                                <p className="text-xs font-semibold tracking-wide text-[#d2b179]">REQUEST RULE</p>
                                <ul className="mt-4 space-y-3 text-sm leading-7 text-[#d8d3ca]">
                                    <li>リクエスト送信後は仮押さえ扱いになり、承認または期限切れまで保持されます。</li>
                                    <li>同じセラピストには同時に複数の予定予約リクエストを送れません。</li>
                                    <li>承認時にセラピストが前後バッファを設定し、確定後の前後時間は別予約できません。</li>
                                </ul>
                            </section>
                        </aside>
                    </div>
                ) : null}
            </div>

            <DiscoveryFooter
                domain={serviceMeta?.domain}
                description={footerDescription}
                primaryAction={{ label: 'プロフィールに戻る', to: detailPath }}
                secondaryAction={{ label: '検索一覧へ', to: listPath }}
                supportEmail={serviceMeta?.support_email}
            />
        </div>
    );
}
