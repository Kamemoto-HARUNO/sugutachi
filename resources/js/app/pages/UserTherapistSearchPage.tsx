import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DiscoveryFooter } from '../components/discovery/DiscoveryFooter';
import { DiscoveryHeroShell } from '../components/discovery/DiscoveryHeroShell';
import { TherapistDiscoveryCard } from '../components/discovery/TherapistDiscoveryCard';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import {
    buildEstimatedPriceLabel,
    formatRelativeUpdatedAt,
    getDefaultServiceAddress,
    getServiceAddressLabel,
    matchesPriceRange,
    resolveWalkingTimeMaxMinutes,
    type BookingStartType,
    type DiscoveryPriceRange,
    type DiscoverySort,
} from '../lib/discovery';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import type {
    ApiEnvelope,
    ServiceAddress,
    TherapistSearchResult,
} from '../lib/types';

const durationOptions = [60, 90, 120];

function normalizeStartType(value: string | null): BookingStartType {
    return value === 'scheduled' ? 'scheduled' : 'now';
}

function normalizeSort(value: string | null): DiscoverySort {
    if (value === 'soonest' || value === 'rating') {
        return value;
    }

    return 'recommended';
}

function formatScheduledValue(value: string): string {
    if (!value) {
        return '';
    }

    return value.slice(0, 16);
}

function formatScheduledApiValue(value: string): string {
    if (!value) {
        return '';
    }

    return `${value.replace('T', ' ')}:00`;
}

export function UserTherapistSearchPage() {
    const { token } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [serviceAddresses, setServiceAddresses] = useState<ServiceAddress[]>([]);
    const [therapists, setTherapists] = useState<TherapistSearchResult[]>([]);
    const [serviceMeta, setServiceMeta] = useState<{ domain: string; support_email: string } | null>(null);
    const [isBootstrapping, setIsBootstrapping] = useState(true);
    const [isLoadingResults, setIsLoadingResults] = useState(false);
    const [addressError, setAddressError] = useState<string | null>(null);
    const [resultsError, setResultsError] = useState<string | null>(null);
    const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
    const [trainingOnly, setTrainingOnly] = useState(true);
    const [ratingOnly, setRatingOnly] = useState(false);
    const [walkingOnly, setWalkingOnly] = useState(false);
    const [priceRange, setPriceRange] = useState<DiscoveryPriceRange>('all');

    usePageTitle('セラピスト検索');

    const selectedAddressId = searchParams.get('service_address_id');
    const selectedDuration = Number(searchParams.get('menu_duration_minutes') ?? '60');
    const selectedStartType = normalizeStartType(searchParams.get('start_type'));
    const selectedSort = normalizeSort(searchParams.get('sort'));
    const scheduledStartAt = searchParams.get('scheduled_start_at') ?? '';

    const selectedAddress = useMemo(
        () => serviceAddresses.find((address) => address.public_id === selectedAddressId) ?? null,
        [selectedAddressId, serviceAddresses],
    );
    const queryString = searchParams.toString();

    useEffect(() => {
        let isMounted = true;

        async function bootstrap() {
            if (!token) {
                return;
            }

            try {
                const [addressPayload, metaPayload] = await Promise.all([
                    apiRequest<ApiEnvelope<ServiceAddress[]>>('/me/service-addresses', { token }),
                    apiRequest<ApiEnvelope<{ domain: string; support_email: string }>>('/service-meta'),
                ]);

                if (!isMounted) {
                    return;
                }

                const nextAddresses = unwrapData(addressPayload);
                setServiceAddresses(nextAddresses);
                setServiceMeta(unwrapData(metaPayload));

                if (!selectedAddressId) {
                    const fallbackAddress = getDefaultServiceAddress(nextAddresses);

                    if (fallbackAddress) {
                        setSearchParams((previous) => {
                            const next = new URLSearchParams(previous);
                            next.set('service_address_id', fallbackAddress.public_id);
                            next.set('menu_duration_minutes', String(durationOptions.includes(selectedDuration) ? selectedDuration : 60));
                            next.set('start_type', selectedStartType);
                            next.set('sort', selectedSort);

                            return next;
                        }, { replace: true });
                    }
                }
            } catch (requestError) {
                if (!isMounted) {
                    return;
                }

                const message =
                    requestError instanceof ApiError ? requestError.message : '施術場所の取得に失敗しました。';

                setAddressError(message);
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
    }, [selectedAddressId, selectedDuration, selectedSort, selectedStartType, setSearchParams, token]);

    useEffect(() => {
        let isMounted = true;

        async function fetchResults() {
            if (!token || !selectedAddressId) {
                setTherapists([]);
                return;
            }

            if (selectedStartType === 'scheduled' && !scheduledStartAt) {
                setTherapists([]);
                setResultsError(null);
                return;
            }

            setIsLoadingResults(true);
            setResultsError(null);

            try {
                const params = new URLSearchParams({
                    service_address_id: selectedAddressId,
                    menu_duration_minutes: String(durationOptions.includes(selectedDuration) ? selectedDuration : 60),
                    start_type: selectedStartType,
                    sort: selectedSort,
                });

                if (selectedStartType === 'scheduled' && scheduledStartAt) {
                    params.set('scheduled_start_at', formatScheduledApiValue(scheduledStartAt));
                }

                const payload = await apiRequest<ApiEnvelope<TherapistSearchResult[]>>(`/therapists?${params.toString()}`, {
                    token,
                });

                if (!isMounted) {
                    return;
                }

                setTherapists(unwrapData(payload));
                setLastUpdatedAt(new Date());
            } catch (requestError) {
                if (!isMounted) {
                    return;
                }

                const message =
                    requestError instanceof ApiError ? requestError.message : '検索結果の取得に失敗しました。';

                setResultsError(message);
                setTherapists([]);
            } finally {
                if (isMounted) {
                    setIsLoadingResults(false);
                }
            }
        }

        void fetchResults();

        return () => {
            isMounted = false;
        };
    }, [refreshKey, scheduledStartAt, selectedAddressId, selectedDuration, selectedSort, selectedStartType, token]);

    const filteredTherapists = useMemo(() => {
        return therapists.filter((therapist) => {
            if (trainingOnly && therapist.training_status !== 'completed') {
                return false;
            }

            if (ratingOnly && therapist.rating_average < 4.5) {
                return false;
            }

            if (walkingOnly && resolveWalkingTimeMaxMinutes(therapist.walking_time_range) > 30) {
                return false;
            }

            if (!matchesPriceRange(therapist.estimated_total_amount, priceRange)) {
                return false;
            }

            return true;
        });
    }, [priceRange, ratingOnly, therapists, trainingOnly, walkingOnly]);

    const updateSearchParam = (updates: Record<string, string | null>) => {
        setSearchParams((previous) => {
            const next = new URLSearchParams(previous);

            Object.entries(updates).forEach(([key, value]) => {
                if (value == null || value === '') {
                    next.delete(key);
                    return;
                }

                next.set(key, value);
            });

            return next;
        });
    };

    const filterPanel = (
        <div className="space-y-5">
            <div className="space-y-3">
                <p className="text-xs font-semibold tracking-wide text-[#8a8f97]">時間</p>
                <div className="flex flex-wrap gap-2">
                    {[
                        { value: 'now', label: '今すぐ' },
                        { value: 'scheduled', label: '日時指定' },
                    ].map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => updateSearchParam({
                                start_type: option.value,
                                scheduled_start_at: option.value === 'scheduled' ? scheduledStartAt : null,
                            })}
                            className={[
                                'rounded-full px-4 py-2 text-sm font-semibold transition',
                                selectedStartType === option.value
                                    ? 'bg-[#17202b] text-white'
                                    : 'bg-[#f6f1e7] text-[#17202b] hover:bg-[#ede2cf]',
                            ].join(' ')}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
                {selectedStartType === 'scheduled' ? (
                    <input
                        type="datetime-local"
                        value={formatScheduledValue(scheduledStartAt)}
                        onChange={(event) => updateSearchParam({ scheduled_start_at: event.target.value || null })}
                        className="w-full rounded-[20px] border border-[#e5d8c4] bg-white px-4 py-3 text-sm text-[#17202b] outline-none"
                    />
                ) : null}
            </div>

            <div className="space-y-3">
                <p className="text-xs font-semibold tracking-wide text-[#8a8f97]">認証・条件</p>
                <div className="flex flex-wrap gap-2">
                    {[
                        { active: trainingOnly, label: '研修済み', onClick: () => setTrainingOnly((value) => !value) },
                        { active: ratingOnly, label: '星4.5以上', onClick: () => setRatingOnly((value) => !value) },
                        { active: walkingOnly, label: '徒歩30分以内', onClick: () => setWalkingOnly((value) => !value) },
                    ].map((chip) => (
                        <button
                            key={chip.label}
                            type="button"
                            onClick={chip.onClick}
                            className={[
                                'rounded-full px-4 py-2 text-sm font-semibold transition',
                                chip.active
                                    ? 'border border-[#ddcfb4] bg-[#f5ebd5] text-[#17202b]'
                                    : 'bg-[#f6f1e7] text-[#17202b] hover:bg-[#ede2cf]',
                            ].join(' ')}
                        >
                            {chip.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-3">
                <p className="text-xs font-semibold tracking-wide text-[#8a8f97]">時間コース</p>
                <div className="grid grid-cols-3 gap-2">
                    {durationOptions.map((duration) => (
                        <button
                            key={duration}
                            type="button"
                            onClick={() => updateSearchParam({ menu_duration_minutes: String(duration) })}
                            className={[
                                'rounded-[18px] px-4 py-3 text-sm font-semibold transition',
                                selectedDuration === duration
                                    ? 'bg-[#17202b] text-white'
                                    : 'bg-[#f6f1e7] text-[#17202b] hover:bg-[#ede2cf]',
                            ].join(' ')}
                        >
                            {duration}分
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-3">
                <p className="text-xs font-semibold tracking-wide text-[#8a8f97]">料金目安</p>
                <div className="grid gap-2">
                    {[
                        { value: 'all', label: 'すべて' },
                        { value: 'under_12000', label: '¥12,000未満' },
                        { value: 'between_12000_20000', label: '¥12,000 - ¥20,000' },
                        { value: 'over_20000', label: '¥20,000超' },
                    ].map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => setPriceRange(option.value as DiscoveryPriceRange)}
                            className={[
                                'rounded-[18px] px-4 py-3 text-left text-sm font-semibold transition',
                                priceRange === option.value
                                    ? 'bg-[#17202b] text-white'
                                    : 'bg-[#f6f1e7] text-[#17202b] hover:bg-[#ede2cf]',
                            ].join(' ')}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="rounded-[24px] bg-[#17202b] p-5 text-white">
                <p className="text-xs font-semibold tracking-wide text-[#d2b179]">SAFETY NOTE</p>
                <p className="mt-2 text-sm leading-7 text-[#d8d3ca]">
                    表示されるのは徒歩目安レンジだけです。正確な位置や住所は検索一覧に公開されません。
                </p>
            </div>
        </div>
    );

    if (isBootstrapping) {
        return <LoadingScreen title="検索準備中" message="施術場所と公開情報を確認しています。" />;
    }

    return (
        <div className="min-h-screen bg-[#f6f1e7] text-[#17202b]">
            <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-16 px-6 py-10 md:px-10 md:py-14 xl:gap-[60px] xl:px-0">
                <DiscoveryHeroShell
                    domain={serviceMeta?.domain ?? 'sugutachi.com'}
                    title="今すぐ会える、近くで探せる。"
                    description="デフォルトの施術場所を基準に、徒歩目安レンジと概算料金で比較できます。予定予約は日時を入れると、その条件で見積もりを揃えます。"
                    topBadge="本人確認済みタチのみ掲載"
                    bullets={['18歳以上確認済み', '位置情報は概算表示', '直接取引禁止']}
                    primaryAction={{ label: '利用者ダッシュボード', to: '/user' }}
                    secondaryAction={{ label: '予約一覧', to: '/user/bookings' }}
                >
                    <div className="rounded-[32px] border border-white/12 bg-[linear-gradient(109deg,rgba(255,249,241,0.18)_2.98%,rgba(255,255,255,0.04)_101.1%)] p-6 text-white shadow-[0_24px_60px_rgba(0,0,0,0.16)] md:p-8">
                        <div className="space-y-1">
                            <h2 className="text-[1.35rem] font-semibold">条件を指定して探す</h2>
                            <p className="text-sm text-[#c8c2b6]">施術場所、予約タイプ、時間コースを決めて一覧を更新できます。</p>
                        </div>

                        <div className="mt-5 space-y-3">
                            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                                <label className="rounded-[24px] bg-white px-5 py-3 text-[#121a23]">
                                    <span className="block text-xs font-semibold text-[#69707a]">施術場所</span>
                                    <select
                                        value={selectedAddressId ?? ''}
                                        onChange={(event) => updateSearchParam({ service_address_id: event.target.value || null })}
                                        className="mt-1 w-full bg-transparent text-lg font-semibold outline-none"
                                    >
                                        {serviceAddresses.length === 0 ? (
                                            <option value="">施術場所を追加してください</option>
                                        ) : null}
                                        {serviceAddresses.map((address) => (
                                            <option key={address.public_id} value={address.public_id}>
                                                {getServiceAddressLabel(address)}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <div className="rounded-[24px] bg-white px-5 py-3 text-[#121a23]">
                                    <p className="text-xs font-semibold text-[#69707a]">予約タイプ</p>
                                    <div className="mt-1 flex gap-2 text-sm font-semibold">
                                        {[
                                            { value: 'now', label: '今すぐ' },
                                            { value: 'scheduled', label: '日時指定' },
                                        ].map((option) => (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() => updateSearchParam({
                                                    start_type: option.value,
                                                    scheduled_start_at: option.value === 'scheduled' ? scheduledStartAt : null,
                                                })}
                                                className={[
                                                    'rounded-full px-3 py-1 transition',
                                                    selectedStartType === option.value
                                                        ? 'bg-[#17202b] text-white'
                                                        : 'bg-[#f3ede4] text-[#17202b]',
                                                ].join(' ')}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {selectedStartType === 'scheduled' ? (
                                <input
                                    type="datetime-local"
                                    value={formatScheduledValue(scheduledStartAt)}
                                    onChange={(event) => updateSearchParam({ scheduled_start_at: event.target.value || null })}
                                    className="w-full rounded-[24px] border border-transparent bg-white px-5 py-3 text-sm font-medium text-[#17202b] outline-none"
                                />
                            ) : null}

                            <div className="flex flex-wrap gap-2">
                                {durationOptions.map((duration) => (
                                    <button
                                        key={duration}
                                        type="button"
                                        onClick={() => updateSearchParam({ menu_duration_minutes: String(duration) })}
                                        className={[
                                            'rounded-full border px-4 py-2 text-xs font-bold transition',
                                            selectedDuration === duration
                                                ? 'border-transparent bg-[#d2b179] text-[#1a2430]'
                                                : 'border-white/14 bg-white/8 text-[#f0e9de]',
                                        ].join(' ')}
                                    >
                                        {buildEstimatedPriceLabel(duration, null).replace('料金は詳細で確認', `${duration}分`)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <button
                                type="button"
                                onClick={() => setRefreshKey((value) => value + 1)}
                                className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-6 py-3 text-sm font-bold text-[#1a2430] transition hover:brightness-105"
                            >
                                セラピストを再検索
                            </button>
                            <p className="text-xs text-[#c8c2b6]">
                                {selectedAddress ? `${getServiceAddressLabel(selectedAddress)} を基準に検索しています。` : '施術場所が必要です。'}
                            </p>
                        </div>
                    </div>
                </DiscoveryHeroShell>

                <section className="grid gap-4 md:grid-cols-3">
                    {[
                        {
                            label: 'LISTING RULE',
                            title: '掲載条件',
                            body: '本人確認と審査を完了したセラピストのみ表示。ブロック中の相手や停止アカウントは一覧に出ません。',
                        },
                        {
                            label: 'DISTANCE',
                            title: '表示ロジック',
                            body: '一覧では徒歩目安レンジだけを表示し、距離や正確な位置は出しません。比較しやすさと安全性を両立しています。',
                        },
                        {
                            label: 'PAYMENT',
                            title: '決済前提',
                            body: 'カード決済のみ対応です。予定予約では与信を確保したうえでセラピスト承認待ちになります。',
                        },
                    ].map((card) => (
                        <article key={card.title} className="rounded-[24px] bg-[#fffdf8] p-6 shadow-[0_10px_24px_rgba(23,32,43,0.06)]">
                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">{card.label}</p>
                            <h2 className="mt-1 text-[1.35rem] font-semibold text-[#17202b]">{card.title}</h2>
                            <p className="mt-3 text-sm leading-7 text-[#5b6470]">{card.body}</p>
                        </article>
                    ))}
                </section>

                <section className="space-y-6">
                    <div className="space-y-1">
                        <h2 className="text-[2rem] font-semibold text-[#17202b] md:text-[2.2rem]">
                            近くのセラピスト {filteredTherapists.length}名
                        </h2>
                        <p className="text-sm text-[#68707a] md:text-base">
                            徒歩目安レンジ、料金、レビューを見ながら比較できます。
                        </p>
                    </div>

                    <div className="flex items-center justify-between gap-4 lg:hidden">
                        <button
                            type="button"
                            onClick={() => setIsFilterSheetOpen(true)}
                            className="inline-flex items-center gap-2 rounded-[24px] bg-[#fffcf7] px-5 py-4 text-lg font-semibold text-[#17202b] shadow-[0_10px_24px_rgba(23,32,43,0.08)]"
                        >
                            絞り込み
                        </button>
                        <p className="text-sm text-[#68707a]">最終更新 {formatRelativeUpdatedAt(lastUpdatedAt)}</p>
                    </div>

                    <div className="grid gap-8 lg:grid-cols-[304px_minmax(0,1fr)]">
                        <aside className="hidden rounded-[32px] bg-[#fffcf7] p-6 shadow-[0_10px_24px_rgba(23,32,43,0.08)] lg:block">
                            {filterPanel}
                        </aside>

                        <div className="space-y-5">
                            <div className="rounded-[28px] bg-[#fffcf7] p-4 shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                                    <div className="flex flex-wrap gap-2">
                                        {[
                                            { value: 'recommended', label: 'おすすめ順' },
                                            { value: 'soonest', label: '徒歩が近い順' },
                                            { value: 'rating', label: '評価順' },
                                        ].map((option) => (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() => updateSearchParam({ sort: option.value })}
                                                className={[
                                                    'rounded-full px-4 py-2 text-sm font-semibold transition',
                                                    selectedSort === option.value
                                                        ? 'bg-[#17202b] text-white'
                                                        : 'bg-[#f6f1e7] text-[#17202b] hover:bg-[#ede2cf]',
                                                ].join(' ')}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-3 text-sm text-[#68707a]">
                                        <span>{selectedAddress ? getServiceAddressLabel(selectedAddress) : '施術場所未設定'}</span>
                                        <span>最終更新 {formatRelativeUpdatedAt(lastUpdatedAt)}</span>
                                    </div>
                                </div>
                            </div>

                            {addressError ? (
                                <div className="rounded-[28px] bg-[#fffcf7] p-6 text-sm text-[#9a4b35] shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                                    {addressError}
                                </div>
                            ) : null}

                            {!addressError && serviceAddresses.length === 0 ? (
                                <div className="rounded-[28px] bg-[#fffcf7] p-8 shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                                    <h3 className="text-xl font-semibold text-[#17202b]">まず施術場所を追加してください</h3>
                                    <p className="mt-3 text-sm leading-7 text-[#5b6470]">
                                        検索には、来てほしい場所の登録が必要です。ホテル、自宅、オフィスなどを追加すると近さと料金が計算できます。
                                    </p>
                                    <div className="mt-5 flex flex-wrap gap-3">
                                        <Link
                                            to="/user/service-addresses"
                                            className="rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-bold text-[#1a2430]"
                                        >
                                            施術場所を追加
                                        </Link>
                                        <Link to="/user" className="rounded-full border border-[#ddcfb4] px-5 py-3 text-sm font-semibold text-[#17202b]">
                                            ダッシュボードへ戻る
                                        </Link>
                                    </div>
                                </div>
                            ) : null}

                            {selectedStartType === 'scheduled' && !scheduledStartAt && serviceAddresses.length > 0 ? (
                                <div className="rounded-[28px] bg-[#fffcf7] p-6 text-sm text-[#5b6470] shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                                    日時指定で探すときは、開始日時を入力すると一覧が更新されます。
                                </div>
                            ) : null}

                            {resultsError ? (
                                <div className="rounded-[28px] bg-[#fffcf7] p-6 text-sm text-[#9a4b35] shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                                    {resultsError}
                                </div>
                            ) : null}

                            {isLoadingResults ? (
                                <div className="rounded-[28px] bg-[#fffcf7] p-6 text-sm text-[#5b6470] shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                                    一覧を更新しています…
                                </div>
                            ) : null}

                            {!isLoadingResults && filteredTherapists.length === 0 && serviceAddresses.length > 0 && !resultsError ? (
                                <div className="rounded-[28px] bg-[#fffcf7] p-8 shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                                    <h3 className="text-xl font-semibold text-[#17202b]">条件に合うセラピストが見つかりませんでした</h3>
                                    <p className="mt-3 text-sm leading-7 text-[#5b6470]">
                                        予約タイプや時間コース、料金目安を少し広げると見つかりやすくなります。
                                    </p>
                                </div>
                            ) : null}

                            <div className="grid gap-5 xl:grid-cols-2">
                                {filteredTherapists.map((therapist) => (
                                    <TherapistDiscoveryCard
                                        key={therapist.public_id}
                                        name={therapist.public_name}
                                        ratingAverage={therapist.rating_average}
                                        reviewCount={therapist.review_count}
                                        walkingTimeRange={therapist.walking_time_range}
                                        estimatedTotalAmount={therapist.estimated_total_amount}
                                        durationMinutes={durationOptions.includes(selectedDuration) ? selectedDuration : 60}
                                        trainingStatus={therapist.training_status}
                                        therapistCancellationCount={therapist.therapist_cancellation_count}
                                        bioExcerpt={therapist.bio_excerpt}
                                        photoUrl={therapist.photos[0]?.url ?? null}
                                        to={`/user/therapists/${therapist.public_id}${queryString ? `?${queryString}` : ''}`}
                                        footerHint="タップして詳細を見る"
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            {isFilterSheetOpen ? (
                <div className="fixed inset-0 z-50 bg-[#17202b]/45 px-4 py-6 lg:hidden">
                    <div className="mx-auto flex h-full max-w-lg flex-col rounded-[32px] bg-[#fffcf7] p-6 shadow-[0_18px_36px_rgba(23,32,43,0.14)]">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-semibold text-[#17202b]">絞り込み</h3>
                            <button
                                type="button"
                                onClick={() => setIsFilterSheetOpen(false)}
                                className="rounded-full bg-[#f6f1e7] px-4 py-2 text-sm font-semibold text-[#17202b]"
                            >
                                閉じる
                            </button>
                        </div>
                        <div className="mt-5 flex-1 overflow-y-auto pr-1">{filterPanel}</div>
                    </div>
                </div>
            ) : null}

            <DiscoveryFooter
                domain={serviceMeta?.domain ?? 'sugutachi.com'}
                description="施術場所を登録しておけば、近さと料金の見え方をそろえた検索一覧からそのまま予約フローへ進めます。"
                primaryAction={{ label: '利用者ダッシュボード', to: '/user' }}
                secondaryAction={{ label: '予約一覧', to: '/user/bookings' }}
                supportEmail={serviceMeta?.support_email ?? null}
            />
        </div>
    );
}
