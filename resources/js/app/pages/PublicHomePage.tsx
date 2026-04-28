import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DiscoveryFilterPanel } from '../components/discovery/DiscoveryFilterPanel';
import { DiscoveryInfoCards } from '../components/discovery/DiscoveryInfoCards';
import { DiscoveryFooter } from '../components/discovery/DiscoveryFooter';
import { DiscoveryHeroShell } from '../components/discovery/DiscoveryHeroShell';
import { DiscoverySearchPanel } from '../components/discovery/DiscoverySearchPanel';
import { DiscoverySortBar } from '../components/discovery/DiscoverySortBar';
import { TherapistDiscoveryGrid } from '../components/discovery/TherapistDiscoveryGrid';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import {
    DISCOVERY_HERO_BULLETS,
    DISCOVERY_LOCATION_LABEL,
    DISCOVERY_LOCATION_PRIVACY_NOTE,
    DISCOVERY_TOP_BADGE,
    DEFAULT_DISCOVERY_DURATION,
    buildDiscoverySearchParams,
    buildDefaultDiscoveryScheduledStartAt,
    formatDiscoveryScheduledApiValue,
    getDefaultServiceAddress,
    getServiceAddressLabel,
    matchesPriceRange,
    resolveWalkingTimeMaxMinutes,
    type BookingStartType,
    type DiscoveryPriceRange,
    type DiscoverySort,
    sortTherapistSearchResults,
} from '../lib/discovery';
import type { ApiEnvelope, ServiceAddress, ServiceMeta, TherapistSearchResult } from '../lib/types';

export function PublicHomePage() {
    const { account, hasRole, isAuthenticated, token } = useAuth();
    const [serviceMeta, setServiceMeta] = useState<ServiceMeta | null>(null);
    const [serviceAddresses, setServiceAddresses] = useState<ServiceAddress[]>([]);
    const [previewTherapists, setPreviewTherapists] = useState<TherapistSearchResult[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [addressError, setAddressError] = useState<string | null>(null);
    const [isLoadingAddresses, setIsLoadingAddresses] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);
    const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
    const [selectedDuration, setSelectedDuration] = useState<number>(DEFAULT_DISCOVERY_DURATION);
    const [selectedStartType, setSelectedStartType] = useState<BookingStartType>('now');
    const [scheduledStartAt, setScheduledStartAt] = useState('');
    const [trainingOnly, setTrainingOnly] = useState(false);
    const [ratingOnly, setRatingOnly] = useState(false);
    const [walkingOnly, setWalkingOnly] = useState(false);
    const [priceRange, setPriceRange] = useState<DiscoveryPriceRange>('all');
    const [selectedSort, setSelectedSort] = useState<DiscoverySort>('recommended');
    const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
    const nearbyTherapistsSectionRef = useRef<HTMLElement | null>(null);

    usePageTitle('ホーム');
    useToastOnMessage(error, 'error');

    const canUseUserMode = isAuthenticated && hasRole('user');
    const canUseTherapistMode = isAuthenticated && hasRole('therapist');
    const selectedAddress = useMemo(
        () => serviceAddresses.find((address) => address.public_id === selectedAddressId) ?? null,
        [selectedAddressId, serviceAddresses],
    );
    const previewQueryString = useMemo(() => buildDiscoverySearchParams({
        serviceAddressId: selectedAddressId,
        durationMinutes: selectedDuration,
        startType: selectedStartType,
        scheduledStartAt,
        sort: selectedSort,
    }).toString(), [scheduledStartAt, selectedAddressId, selectedDuration, selectedSort, selectedStartType]);
    const previewDetailQueryString = canUseUserMode ? previewQueryString : '';
    const filteredPreviewTherapists = useMemo(() => {
        const filtered = previewTherapists.filter((therapist) => {
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

        return sortTherapistSearchResults(filtered, selectedSort);
    }, [previewTherapists, priceRange, ratingOnly, selectedSort, trainingOnly, walkingOnly]);

    useEffect(() => {
        let isMounted = true;

        void apiRequest<ApiEnvelope<ServiceMeta>>('/service-meta')
            .then((metaPayload) => {
                if (!isMounted) {
                    return;
                }

                setServiceMeta(unwrapData(metaPayload));
            })
            .catch((requestError: unknown) => {
                if (!isMounted) {
                    return;
                }

                const message =
                    requestError instanceof ApiError ? requestError.message : '公開トップの読み込みに失敗しました。';

                setError(message);
            });

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        let isMounted = true;

        if (!canUseUserMode || !token) {
            setServiceAddresses([]);
            setSelectedAddressId(null);
            setAddressError(null);
            setIsLoadingAddresses(false);
            return () => {
                isMounted = false;
            };
        }

        setIsLoadingAddresses(true);
        setAddressError(null);

        void apiRequest<ApiEnvelope<ServiceAddress[]>>('/me/service-addresses', { token })
            .then((addressPayload) => {
                if (!isMounted) {
                    return;
                }

                const nextAddresses = unwrapData(addressPayload);
                setServiceAddresses(nextAddresses);

                const hasCurrentAddress = nextAddresses.some((address) => address.public_id === selectedAddressId);

                if (!hasCurrentAddress) {
                    setSelectedAddressId(getDefaultServiceAddress(nextAddresses)?.public_id ?? null);
                }
            })
            .catch((requestError: unknown) => {
                if (!isMounted) {
                    return;
                }

                const message =
                    requestError instanceof ApiError ? requestError.message : '待ち合わせ場所の取得に失敗しました。';

                setAddressError(message);
                setServiceAddresses([]);
                setSelectedAddressId(null);
            })
            .finally(() => {
                if (isMounted) {
                    setIsLoadingAddresses(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [canUseUserMode, token]);

    useEffect(() => {
        let isMounted = true;

        async function loadPreview() {
            setPreviewError(null);

            if (!canUseUserMode) {
                setIsLoadingPreview(true);

                try {
                    const therapistPayload = await apiRequest<ApiEnvelope<TherapistSearchResult[]>>('/public-therapists?limit=4', { token });

                    if (!isMounted) {
                        return;
                    }

                    setPreviewTherapists(unwrapData(therapistPayload));
                } catch (requestError) {
                    if (!isMounted) {
                        return;
                    }

                    const message =
                        requestError instanceof ApiError ? requestError.message : '公開プロフィールの読み込みに失敗しました。';

                    setPreviewError(message);
                    setPreviewTherapists([]);
                } finally {
                    if (isMounted) {
                        setIsLoadingPreview(false);
                    }
                }

                return;
            }

            if (!selectedAddressId) {
                setPreviewTherapists([]);
                return;
            }

            if (selectedStartType === 'scheduled' && !scheduledStartAt) {
                setPreviewTherapists([]);
                return;
            }

            setIsLoadingPreview(true);

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
                const therapistPayload = await apiRequest<ApiEnvelope<TherapistSearchResult[]>>(`/therapists?${params.toString()}`, { token });

                if (!isMounted) {
                    return;
                }

                setPreviewTherapists(unwrapData(therapistPayload).slice(0, 4));
            } catch (requestError) {
                if (!isMounted) {
                    return;
                }

                const message =
                    requestError instanceof ApiError ? requestError.message : '候補の読み込みに失敗しました。';

                setPreviewError(message);
                setPreviewTherapists([]);
            } finally {
                if (isMounted) {
                    setIsLoadingPreview(false);
                }
            }
        }

        void loadPreview();

        return () => {
            isMounted = false;
        };
    }, [canUseUserMode, scheduledStartAt, selectedAddressId, selectedDuration, selectedSort, selectedStartType, token]);

    const primaryAction = useMemo(() => {
        if (canUseUserMode) {
            return {
                label: 'マイページ',
                to: '/user',
            };
        }

        if (isAuthenticated) {
            return {
                label: '利用者モードを追加',
                to: '/role-select?add_role=user&return_to=%2Fuser%2Ftherapists',
            };
        }

        return {
            label: 'ログイン・無料登録',
            to: '/register',
        };
    }, [canUseUserMode, isAuthenticated]);

    const secondaryAction = useMemo(() => {
        if (canUseUserMode) {
            return {
                label: '予約一覧',
                to: '/user/bookings',
            };
        }

        if (canUseTherapistMode) {
            return {
                label: 'マイページ',
                to: '/therapist',
            };
        }

        return {
            label: isAuthenticated ? 'タチキャストモードを追加' : 'タチキャストとして登録',
            to: isAuthenticated ? '/role-select?add_role=therapist&return_to=%2Ftherapist%2Fonboarding' : '/register',
        };
    }, [canUseTherapistMode, canUseUserMode, isAuthenticated]);

    const footerPrimaryAction = canUseUserMode
        ? { label: 'マイページ', to: '/user' }
        : isAuthenticated
            ? { label: '利用者モードを追加', to: '/role-select?add_role=user&return_to=%2Fuser' }
            : { label: 'ログイン・無料登録', to: '/register' };

    const footerSecondaryAction = canUseUserMode
        ? { label: '予約一覧', to: '/user/bookings' }
        : canUseTherapistMode
            ? { label: 'マイページ', to: '/therapist' }
        : isAuthenticated
            ? { label: 'タチキャストモードを追加', to: '/role-select?add_role=therapist&return_to=%2Ftherapist%2Fonboarding' }
            : { label: 'タチキャストとして登録', to: '/register' };

    const panelAction = useMemo(() => {
        if (canUseUserMode) {
            if (isLoadingAddresses) {
                return {
                    label: '待ち合わせ場所を確認中',
                    disabled: true,
                };
            }

            if (serviceAddresses.length === 0) {
                return {
                    label: '待ち合わせ場所を追加',
                    to: '/user/service-addresses',
                };
            }

            return {
                label: 'タチキャストを検索',
                onClick: () => {
                    nearbyTherapistsSectionRef.current?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                    });
                },
            };
        }

        if (isAuthenticated) {
            return {
                label: '利用者モードを追加',
                to: '/role-select?add_role=user&return_to=%2Fuser%2Ftherapists',
            };
        }

        return {
            label: 'ログインして検索',
            to: '/register',
        };
    }, [canUseUserMode, isAuthenticated, isLoadingAddresses, serviceAddresses.length]);

    const panelHelperText = useMemo(() => {
        if (!canUseUserMode) {
            return DISCOVERY_LOCATION_PRIVACY_NOTE;
        }

        if (serviceAddresses.length === 0) {
            return '待ち合わせ場所を登録すると、近さと料金を見ながら探せます。';
        }

        if (selectedStartType === 'scheduled' && !scheduledStartAt) {
            return `${selectedAddress ? getServiceAddressLabel(selectedAddress) : '待ち合わせ場所'} を基準に、開始日時を入れると候補が表示されます。`;
        }

        return `${selectedAddress ? getServiceAddressLabel(selectedAddress) : '待ち合わせ場所'} を基準に候補を表示しています。`;
    }, [canUseUserMode, scheduledStartAt, selectedAddress, selectedStartType, serviceAddresses.length]);
    const handleSelectStartType = (startType: BookingStartType) => {
        setSelectedStartType(startType);

        if (startType === 'scheduled' && !scheduledStartAt) {
            setScheduledStartAt(buildDefaultDiscoveryScheduledStartAt());
        }
    };
    const discoverySectionTitle = '近くのタチキャスト';
    const discoverySectionDescription = canUseUserMode
        ? serviceAddresses.length > 0
            ? `待ち合わせ場所、予約タイプ、料金目安を変えながら、近さとレビューで候補を絞り込めます。現在 ${filteredPreviewTherapists.length}名を表示しています。`
            : '待ち合わせ場所を追加すると、あなたの条件に合う候補をこの画面で確認できます。'
        : 'ログイン後は、徒歩目安レンジ、料金、レビューを見ながら自分の条件で比較できます。';
    const filterPanel = (
        <DiscoveryFilterPanel
            selectedStartType={selectedStartType}
            onSelectStartType={handleSelectStartType}
            scheduledStartAt={scheduledStartAt}
            onScheduledStartAtChange={setScheduledStartAt}
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

    return (
        <div className="min-h-screen bg-[#f6f1e7] text-[#17202b]">
            <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-16 px-6 py-10 md:px-10 md:py-14 xl:gap-[60px] xl:px-0">
                <DiscoveryHeroShell
                    domain={serviceMeta?.domain}
                    title={(
                        <>
                            今すぐ会える、
                            <span className="inline-block">近くで探せる。</span>
                        </>
                    )}
                    description="リラクゼーション / ボディケア / もみほぐし目的のマッチングサービスです。徒歩目安、料金、レビューを見ながら、自分に合う相手を落ち着いて探せます。"
                    topBadge={DISCOVERY_TOP_BADGE}
                    bullets={[...DISCOVERY_HERO_BULLETS]}
                    primaryAction={primaryAction}
                    secondaryAction={secondaryAction}
                >
                    <DiscoverySearchPanel
                        description="待ち合わせ場所と予約タイプを決めて一覧を更新できます。"
                        addressField={canUseUserMode && serviceAddresses.length > 0 ? (
                            <label className="rounded-[24px] bg-white px-5 py-3 text-[#121a23]">
                                <span className="block text-xs font-semibold text-[#69707a]">{DISCOVERY_LOCATION_LABEL}</span>
                                <select
                                    value={selectedAddressId ?? ''}
                                    onChange={(event) => setSelectedAddressId(event.target.value || null)}
                                    className="mt-1 w-full bg-transparent text-lg font-semibold outline-none"
                                >
                                    {serviceAddresses.map((address) => (
                                        <option key={address.public_id} value={address.public_id}>
                                            {getServiceAddressLabel(address)}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        ) : (
                            <div className="rounded-[24px] bg-white px-5 py-3 text-[#121a23]">
                                <p className="text-xs font-semibold text-[#69707a]">{DISCOVERY_LOCATION_LABEL}</p>
                                <p className="mt-1 text-lg font-semibold">
                                    {canUseUserMode
                                        ? isLoadingAddresses
                                            ? '待ち合わせ場所を確認中'
                                            : 'まずは待ち合わせ場所を追加'
                                        : 'ログイン後に待ち合わせ場所を選択'}
                                </p>
                            </div>
                        )}
                        selectedStartType={selectedStartType}
                        onSelectStartType={handleSelectStartType}
                        scheduledStartAt={scheduledStartAt}
                        onScheduledStartAtChange={setScheduledStartAt}
                        action={panelAction}
                        helperText={panelHelperText}
                    />
                </DiscoveryHeroShell>

                <DiscoveryInfoCards
                    cards={[
                        {
                            label: '掲載条件',
                            title: '掲載条件',
                            body: '本人確認が完了し、公開条件を満たしたタチキャストのみ表示。安心感を損なうアカウントは掲載対象外です。',
                        },
                        {
                            label: '距離表示',
                            title: '表示ロジック',
                            body: '位置情報は徒歩目安レンジで表示し、正確な地点は非公開。比較しやすさと安全性を両立します。',
                        },
                        {
                            label: 'ご利用上の注意',
                            title: '禁止事項',
                            body: '医療・治療・性的サービスを想起させる表現は使わず、リラクゼーション目的としてご利用ください。',
                        },
                    ]}
                />


                <section ref={nearbyTherapistsSectionRef} className="space-y-6">
                    <div className="space-y-1">
                        <h2 className="text-[2rem] font-semibold text-[#17202b] md:text-[2.2rem]">
                            {discoverySectionTitle}
                        </h2>
                        <p className="text-sm text-[#68707a] md:text-base">
                            {discoverySectionDescription}
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
                        <p className="text-sm text-[#68707a]">{filteredPreviewTherapists.length}名を表示</p>
                    </div>

                    <div className="grid gap-8 lg:grid-cols-[304px_minmax(0,1fr)] lg:items-start">
                        <aside className="hidden rounded-[32px] bg-[#fffcf7] p-6 shadow-[0_10px_24px_rgba(23,32,43,0.08)] lg:block">
                            {filterPanel}
                        </aside>

                        <div className="space-y-5">
                            <DiscoverySortBar
                                selectedSort={selectedSort}
                                onSelectSort={setSelectedSort}
                                aside={(
                                    <>
                                        <span>{canUseUserMode ? (selectedAddress ? getServiceAddressLabel(selectedAddress) : '待ち合わせ場所未設定') : '公開プロフィールから表示'}</span>
                                        <span>{canUseUserMode ? `${filteredPreviewTherapists.length}名を表示` : `${filteredPreviewTherapists.length}名を表示`}</span>
                                    </>
                                )}
                            />

                            {addressError ? (
                                <div className="rounded-[28px] bg-[#fffcf7] p-6 text-sm text-[#9a4b35] shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                                    {addressError}
                                </div>
                            ) : null}

                            {previewError ? (
                                <div className="rounded-[28px] bg-[#fffcf7] p-6 text-sm text-[#9a4b35] shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                                    {previewError}
                                </div>
                            ) : null}

                            {canUseUserMode && !isLoadingAddresses && serviceAddresses.length === 0 && !addressError ? (
                                <div className="rounded-[28px] bg-[#fffcf7] p-8 shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                                    <h3 className="text-xl font-semibold text-[#17202b]">まず待ち合わせ場所を追加してください</h3>
                                    <p className="mt-3 text-sm leading-7 text-[#5b6470]">
                                        近さと料金を正しく出すには、来てほしい場所の登録が必要です。ホテル、自宅、オフィスなどを追加すると候補が絞り込まれます。
                                    </p>
                                    <div className="mt-5">
                                        <Link
                                            to="/user/service-addresses"
                                            className="inline-flex rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-bold text-[#1a2430]"
                                        >
                                            待ち合わせ場所を追加
                                        </Link>
                                    </div>
                                </div>
                            ) : null}

                            {canUseUserMode && selectedStartType === 'scheduled' && !scheduledStartAt && serviceAddresses.length > 0 ? (
                                <div className="rounded-[28px] bg-[#fffcf7] p-6 text-sm text-[#5b6470] shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                                    日時指定で探すときは、開始日時を入れると候補が表示されます。
                                </div>
                            ) : null}

                            {isLoadingAddresses || isLoadingPreview ? (
                                <div className="rounded-[28px] bg-[#fffcf7] p-6 text-sm text-[#5b6470] shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                                    {isLoadingAddresses ? '待ち合わせ場所を確認しています…' : 'タチキャスト候補を更新しています…'}
                                </div>
                            ) : null}

                            {!addressError && !previewError && !isLoadingAddresses && !isLoadingPreview ? (
                                <TherapistDiscoveryGrid
                                    therapists={filteredPreviewTherapists}
                                    durationMinutes={selectedDuration}
                                    footerHint="公開プロフィールを見る"
                                    buildLink={(therapist) => `/therapists/${therapist.public_id}${previewDetailQueryString ? `?${previewDetailQueryString}` : ''}`}
                                    emptyState={(
                                        <article className="rounded-[28px] bg-[#fffcf7] p-8 text-sm leading-7 text-[#5b6470] shadow-[0_10px_24px_rgba(23,32,43,0.08)] xl:col-span-2">
                                            {canUseUserMode
                                                ? '条件に合うタチキャストが見つかりませんでした。フィルターや日時を少し広げると表示されやすくなります。'
                                                : '現在、公開中のプロフィールを準備しています。しばらくしてから再度ご確認ください。'}
                                        </article>
                                    )}
                                />
                            ) : null}
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
                description="リラクゼーション目的の出張タチキャストを、近さ・料金・レビューから比較できる公開トップです。ログイン後は一覧検索、予約、メッセージまでそのまま進めます。"
                primaryAction={footerPrimaryAction}
                secondaryAction={footerSecondaryAction}
            />
        </div>
    );
}
