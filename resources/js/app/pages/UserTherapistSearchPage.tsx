import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DiscoveryFilterPanel } from '../components/discovery/DiscoveryFilterPanel';
import { DiscoveryInfoCards } from '../components/discovery/DiscoveryInfoCards';
import { DiscoveryFooter } from '../components/discovery/DiscoveryFooter';
import { DiscoveryHeroShell } from '../components/discovery/DiscoveryHeroShell';
import { DiscoverySearchPanel } from '../components/discovery/DiscoverySearchPanel';
import { DiscoverySortBar } from '../components/discovery/DiscoverySortBar';
import { TherapistDiscoveryGrid } from '../components/discovery/TherapistDiscoveryGrid';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import {
    buildDiscoverySearchParams,
    buildDefaultDiscoveryScheduledStartAt,
    DISCOVERY_HERO_BULLETS,
    DISCOVERY_HERO_TITLE,
    DISCOVERY_LOCATION_LABEL,
    DISCOVERY_TOP_BADGE,
    formatDiscoveryScheduledApiValue,
    formatRelativeUpdatedAt,
    getDefaultServiceAddress,
    getServiceAddressLabel,
    matchesPriceRange,
    normalizeDiscoveryDuration,
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

function normalizeStartType(value: string | null): BookingStartType {
    return value === 'scheduled' ? 'scheduled' : 'now';
}

function normalizeSort(value: string | null): DiscoverySort {
    if (value === 'soonest' || value === 'rating') {
        return value;
    }

    return 'recommended';
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
    const [trainingOnly, setTrainingOnly] = useState(false);
    const [ratingOnly, setRatingOnly] = useState(false);
    const [walkingOnly, setWalkingOnly] = useState(false);
    const [priceRange, setPriceRange] = useState<DiscoveryPriceRange>('all');

    usePageTitle('セラピスト検索');

    const selectedAddressId = searchParams.get('service_address_id');
    const selectedDuration = normalizeDiscoveryDuration(Number(searchParams.get('menu_duration_minutes') ?? '60'));
    const selectedStartType = normalizeStartType(searchParams.get('start_type'));
    const selectedSort = normalizeSort(searchParams.get('sort'));
    const scheduledStartAt = searchParams.get('scheduled_start_at') ?? '';

    const selectedAddress = useMemo(
        () => serviceAddresses.find((address) => address.public_id === selectedAddressId) ?? null,
        [selectedAddressId, serviceAddresses],
    );
    const queryString = buildDiscoverySearchParams({
        serviceAddressId: selectedAddressId,
        durationMinutes: selectedDuration,
        startType: selectedStartType,
        scheduledStartAt,
        sort: selectedSort,
    }).toString();

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
                            next.set('menu_duration_minutes', String(selectedDuration));
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
                    requestError instanceof ApiError ? requestError.message : '待ち合わせ場所の取得に失敗しました。';

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
                const params = buildDiscoverySearchParams({
                    serviceAddressId: selectedAddressId,
                    durationMinutes: selectedDuration,
                    startType: selectedStartType,
                    scheduledStartAt: selectedStartType === 'scheduled'
                        ? formatDiscoveryScheduledApiValue(scheduledStartAt)
                        : null,
                    sort: selectedSort,
                });

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
    const handleSelectStartType = (startType: BookingStartType) => {
        updateSearchParam({
            start_type: startType,
            scheduled_start_at: startType === 'scheduled'
                ? (scheduledStartAt || buildDefaultDiscoveryScheduledStartAt())
                : null,
        });
    };

    const filterPanel = (
        <DiscoveryFilterPanel
            selectedStartType={selectedStartType}
            onSelectStartType={handleSelectStartType}
            scheduledStartAt={scheduledStartAt}
            onScheduledStartAtChange={(value) => updateSearchParam({ scheduled_start_at: value || null })}
            trainingOnly={trainingOnly}
            onToggleTraining={() => setTrainingOnly((value) => !value)}
            ratingOnly={ratingOnly}
            onToggleRating={() => setRatingOnly((value) => !value)}
            walkingOnly={walkingOnly}
            onToggleWalking={() => setWalkingOnly((value) => !value)}
            priceRange={priceRange}
            onSelectPriceRange={setPriceRange}
        />
    );

    if (isBootstrapping) {
        return <LoadingScreen title="検索準備中" message="待ち合わせ場所と公開情報を確認しています。" />;
    }

    return (
        <div className="min-h-screen bg-[#f6f1e7] text-[#17202b]">
            <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-16 px-6 py-10 md:px-10 md:py-14 xl:gap-[60px] xl:px-0">
                <DiscoveryHeroShell
                    domain={serviceMeta?.domain ?? 'sugutachi.com'}
                    title={DISCOVERY_HERO_TITLE}
                    description="デフォルトの待ち合わせ場所を基準に、徒歩目安レンジと概算料金で比較できます。予定予約は日時を入れると、その条件で見積もりを揃えます。"
                    topBadge={DISCOVERY_TOP_BADGE}
                    bullets={[...DISCOVERY_HERO_BULLETS]}
                    primaryAction={{ label: 'マイページ', to: '/user' }}
                    secondaryAction={{ label: '予約一覧', to: '/user/bookings' }}
                >
                    <DiscoverySearchPanel
                        description="待ち合わせ場所と予約タイプを決めて一覧を更新できます。"
                        addressField={(
                            <label className="rounded-[24px] bg-white px-5 py-3 text-[#121a23]">
                                <span className="block text-xs font-semibold text-[#69707a]">{DISCOVERY_LOCATION_LABEL}</span>
                                <select
                                    value={selectedAddressId ?? ''}
                                    onChange={(event) => updateSearchParam({ service_address_id: event.target.value || null })}
                                    className="mt-1 w-full bg-transparent text-lg font-semibold outline-none"
                                >
                                    {serviceAddresses.length === 0 ? (
                                        <option value="">待ち合わせ場所を追加してください</option>
                                    ) : null}
                                    {serviceAddresses.map((address) => (
                                        <option key={address.public_id} value={address.public_id}>
                                            {getServiceAddressLabel(address)}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                        selectedStartType={selectedStartType}
                        onSelectStartType={handleSelectStartType}
                        scheduledStartAt={scheduledStartAt}
                        onScheduledStartAtChange={(value) => updateSearchParam({ scheduled_start_at: value || null })}
                        action={{
                            label: 'セラピストを再検索',
                            onClick: () => setRefreshKey((value) => value + 1),
                        }}
                        helperText={selectedAddress ? `${getServiceAddressLabel(selectedAddress)} を基準に検索しています。` : '待ち合わせ場所が必要です。'}
                    />
                </DiscoveryHeroShell>

                <DiscoveryInfoCards
                    cards={[
                        {
                            label: '掲載条件',
                            title: '掲載条件',
                            body: '本人確認が完了し、公開条件を満たしたセラピストのみ表示。ブロック中の相手や停止アカウントは一覧に出ません。',
                        },
                        {
                            label: '距離表示',
                            title: '表示ロジック',
                            body: '一覧では徒歩目安レンジだけを表示し、距離や正確な位置は出しません。比較しやすさと安全性を両立しています。',
                        },
                        {
                            label: '決済の流れ',
                            title: '決済前提',
                            body: 'カード決済のみ対応です。予定予約では与信を確保したうえでセラピスト承認待ちになります。',
                        },
                    ]}
                />

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
                            <DiscoverySortBar
                                selectedSort={selectedSort}
                                onSelectSort={(sort) => updateSearchParam({ sort })}
                                aside={(
                                    <>
                                        <span>{selectedAddress ? getServiceAddressLabel(selectedAddress) : '待ち合わせ場所未設定'}</span>
                                        <span>最終更新 {formatRelativeUpdatedAt(lastUpdatedAt)}</span>
                                    </>
                                )}
                            />

                            {addressError ? (
                                <div className="rounded-[28px] bg-[#fffcf7] p-6 text-sm text-[#9a4b35] shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                                    {addressError}
                                </div>
                            ) : null}

                            {!addressError && serviceAddresses.length === 0 ? (
                                <div className="rounded-[28px] bg-[#fffcf7] p-8 shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                                    <h3 className="text-xl font-semibold text-[#17202b]">まず待ち合わせ場所を追加してください</h3>
                                    <p className="mt-3 text-sm leading-7 text-[#5b6470]">
                                        検索には、来てほしい場所の登録が必要です。ホテル、自宅、オフィスなどを追加すると近さと料金が計算できます。
                                    </p>
                                    <div className="mt-5 flex flex-wrap gap-3">
                                        <Link
                                            to="/user/service-addresses"
                                            className="rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-bold text-[#1a2430]"
                                        >
                                            待ち合わせ場所を追加
                                        </Link>
                                        <Link to="/user" className="rounded-full border border-[#ddcfb4] px-5 py-3 text-sm font-semibold text-[#17202b]">
                                            マイページへ
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
                                        予約タイプや料金目安を少し広げると見つかりやすくなります。
                                    </p>
                                </div>
                            ) : null}

                            <TherapistDiscoveryGrid
                                therapists={filteredTherapists}
                                durationMinutes={selectedDuration}
                                footerHint="タップして詳細を見る"
                                buildLink={(therapist) => `/therapists/${therapist.public_id}${queryString ? `?${queryString}` : ''}`}
                            />
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
                description="待ち合わせ場所を登録しておけば、近さと料金の見え方をそろえた検索一覧からそのまま予約フローへ進めます。"
                primaryAction={{ label: 'マイページ', to: '/user' }}
                secondaryAction={{ label: '予約一覧', to: '/user/bookings' }}
                supportEmail={serviceMeta?.support_email ?? null}
            />
        </div>
    );
}
