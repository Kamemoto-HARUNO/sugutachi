import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { DiscoveryFooter } from '../components/discovery/DiscoveryFooter';
import { DiscoveryHeroShell } from '../components/discovery/DiscoveryHeroShell';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import {
    buildEstimatedPriceLabel,
    formatCurrency,
    formatTrainingStatus,
    formatWalkingTimeRange,
    getDefaultServiceAddress,
    getServiceAddressLabel,
    type BookingStartType,
    type DiscoverySort,
} from '../lib/discovery';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import type {
    ApiEnvelope,
    ReviewSummary,
    ServiceAddress,
    TherapistDetail,
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

function formatScheduledLabel(value: string): string {
    if (!value) {
        return '開始日時を未指定';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '開始日時を未指定';
    }

    return new Intl.DateTimeFormat('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

function formatReviewDate(value: string): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '日付不明';
    }

    return new Intl.DateTimeFormat('ja-JP', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
    }).format(date);
}

function buildReviewMeta(review: ReviewSummary): string {
    const labels = [
        review.rating_manners ? `対応 ${review.rating_manners}/5` : null,
        review.rating_skill ? `施術 ${review.rating_skill}/5` : null,
        review.rating_cleanliness ? `清潔感 ${review.rating_cleanliness}/5` : null,
        review.rating_safety ? `安心感 ${review.rating_safety}/5` : null,
    ].filter(Boolean);

    return labels.length > 0 ? labels.join(' / ') : '総合評価を反映しています。';
}

export function UserTherapistDetailPage() {
    const { publicId } = useParams();
    const { isAuthenticated, token } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [serviceAddresses, setServiceAddresses] = useState<ServiceAddress[]>([]);
    const [therapistDetail, setTherapistDetail] = useState<TherapistDetail | null>(null);
    const [reviews, setReviews] = useState<ReviewSummary[]>([]);
    const [serviceMeta, setServiceMeta] = useState<{ domain: string; support_email: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isBootstrapping, setIsBootstrapping] = useState(true);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);

    const selectedAddressId = searchParams.get('service_address_id');
    const selectedDuration = Number(searchParams.get('menu_duration_minutes') ?? '60');
    const selectedStartType = normalizeStartType(searchParams.get('start_type'));
    const selectedSort = normalizeSort(searchParams.get('sort'));
    const scheduledStartAt = searchParams.get('scheduled_start_at') ?? '';

    const selectedAddress = useMemo(
        () => serviceAddresses.find((address) => address.public_id === selectedAddressId) ?? null,
        [selectedAddressId, serviceAddresses],
    );

    const highlightedMenu = useMemo(() => {
        if (!therapistDetail) {
            return null;
        }

        const exactDurationMatch = therapistDetail.menus.find(
            (menu) => menu.duration_minutes === selectedDuration,
        );

        if (exactDurationMatch) {
            return exactDurationMatch;
        }

        return therapistDetail.menus[0] ?? null;
    }, [selectedDuration, therapistDetail]);

    const queryString = searchParams.toString();
    const listPath = isAuthenticated ? `/user/therapists${queryString ? `?${queryString}` : ''}` : '/';
    const availabilityPath = therapistDetail && isAuthenticated
        ? `/user/therapists/${therapistDetail.public_id}/availability${queryString ? `?${queryString}` : ''}`
        : '/login';
    const serviceAddressPath = isAuthenticated ? '/user/service-addresses' : '/register';
    const primaryAction = isAuthenticated
        ? { label: '空き時間を見る', to: availabilityPath }
        : { label: 'ログインして空き時間を見る', to: '/login' };
    const secondaryAction = isAuthenticated
        ? { label: '一覧へ戻る', to: listPath, variant: 'secondary' as const }
        : { label: '無料登録する', to: '/register', variant: 'secondary' as const };

    usePageTitle(therapistDetail ? `${therapistDetail.public_name}の詳細` : 'セラピスト詳細');

    useEffect(() => {
        let isMounted = true;

        async function bootstrap() {
            try {
                const [metaPayload, addressPayload] = await Promise.all([
                    apiRequest<ApiEnvelope<{ domain: string; support_email: string }>>('/service-meta'),
                    token
                        ? apiRequest<ApiEnvelope<ServiceAddress[]>>('/me/service-addresses', { token })
                        : Promise.resolve(null),
                ]);

                if (!isMounted) {
                    return;
                }

                setServiceMeta(unwrapData(metaPayload));
                const nextAddresses = addressPayload ? unwrapData(addressPayload) : [];
                setServiceAddresses(nextAddresses);

                if (token && !selectedAddressId) {
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

                setError(message);
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
    }, [publicId, selectedAddressId, selectedDuration, selectedSort, selectedStartType, setSearchParams, token]);

    useEffect(() => {
        let isMounted = true;

        async function loadDetail() {
            if (!publicId) {
                setTherapistDetail(null);
                setReviews([]);
                setError('プロフィールが見つかりませんでした。');
                return;
            }

            setIsLoadingDetail(true);
            setError(null);

            try {
                const detailParams = new URLSearchParams();

                if (isAuthenticated && selectedAddressId) {
                    detailParams.set('service_address_id', selectedAddressId);
                }

                detailParams.set('menu_duration_minutes', String(durationOptions.includes(selectedDuration) ? selectedDuration : 60));
                detailParams.set('start_type', selectedStartType);

                if (selectedStartType === 'scheduled' && scheduledStartAt) {
                    detailParams.set('scheduled_start_at', formatScheduledApiValue(scheduledStartAt));
                }

                const detailPath = detailParams.toString()
                    ? `/therapists/${publicId}?${detailParams.toString()}`
                    : `/therapists/${publicId}`;

                const [detailPayload, reviewPayload] = await Promise.all([
                    apiRequest<ApiEnvelope<TherapistDetail>>(detailPath, { token }),
                    apiRequest<ApiEnvelope<ReviewSummary[]>>(`/therapists/${publicId}/reviews`, { token }),
                ]);

                if (!isMounted) {
                    return;
                }

                setTherapistDetail(unwrapData(detailPayload));
                setReviews(unwrapData(reviewPayload));
            } catch (requestError) {
                if (!isMounted) {
                    return;
                }

                const message =
                    requestError instanceof ApiError
                        ? requestError.message
                        : 'プロフィールの取得に失敗しました。';

                setError(message);
                setTherapistDetail(null);
                setReviews([]);
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
    }, [isAuthenticated, publicId, scheduledStartAt, selectedAddressId, selectedDuration, selectedStartType, token]);

    if (isBootstrapping) {
        return <LoadingScreen title="プロフィール準備中" message="施術場所と公開情報を確認しています。" />;
    }

    if (isLoadingDetail && !therapistDetail) {
        return <LoadingScreen title="プロフィール読込中" message="セラピストの詳細とレビューを取得しています。" />;
    }

    const heroDescription = therapistDetail?.bio
        ? therapistDetail.bio
        : 'プロフィール詳細はこれから反映されます。料金とレビューを見ながら判断できます。';

    return (
        <div className="min-h-screen bg-[#f6f1e7] text-[#17202b]">
            <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-16 px-6 py-10 md:px-10 md:py-14 xl:gap-[60px] xl:px-0">
                <DiscoveryHeroShell
                    domain={serviceMeta?.domain ?? 'sugutachi.com'}
                    title={therapistDetail ? `${therapistDetail.public_name} のプロフィール` : 'セラピスト詳細'}
                    description={heroDescription}
                    topBadge={therapistDetail?.training_status ? formatTrainingStatus(therapistDetail.training_status) : '掲載審査済み'}
                    bullets={[
                        therapistDetail ? `総合 ★${therapistDetail.rating_average.toFixed(1)}（${therapistDetail.review_count}件）` : 'レビューを確認',
                        therapistDetail ? formatWalkingTimeRange(therapistDetail.walking_time_range) : '徒歩目安を確認',
                        selectedAddress ? `${getServiceAddressLabel(selectedAddress)} 基準` : isAuthenticated ? '施術場所未設定でも閲覧可能' : 'ログイン後に施術場所を指定',
                    ]}
                    primaryAction={primaryAction}
                    secondaryAction={secondaryAction}
                >
                    <div className="rounded-[32px] border border-white/12 bg-[linear-gradient(109deg,rgba(255,249,241,0.18)_2.98%,rgba(255,255,255,0.04)_101.1%)] p-6 text-white shadow-[0_24px_60px_rgba(0,0,0,0.16)] md:p-8">
                        <div className="space-y-4">
                            <div className="flex items-start gap-4">
                                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[28px] bg-[#ede2cf]">
                                    {therapistDetail?.photos[0]?.url ? (
                                        <img
                                            src={therapistDetail.photos[0].url}
                                            alt=""
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(160deg,#e8d5b2_0%,#cbb08a_100%)] text-4xl font-semibold text-[#17202b]">
                                            {therapistDetail?.public_name.slice(0, 1).toUpperCase() ?? '?'}
                                        </div>
                                    )}
                                </div>

                                <div className="min-w-0 flex-1 space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h2 className="text-[1.9rem] font-semibold leading-none text-white">
                                            {therapistDetail?.public_name ?? '読み込み中'}
                                        </h2>
                                        {therapistDetail?.is_online ? (
                                            <span className="rounded-full bg-[#e8f1eb] px-2.5 py-1 text-xs font-medium text-[#2d5b3d]">
                                                オンライン
                                            </span>
                                        ) : (
                                            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-[#f4efe5]">
                                                予定予約中心
                                            </span>
                                        )}
                                    </div>

                                    <p className="text-sm text-[#d8d3ca]">
                                        {therapistDetail
                                            ? `セラピスト都合キャンセル ${therapistDetail.therapist_cancellation_count}回`
                                            : 'プロフィール情報を取得中'}
                                    </p>
                                </div>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="rounded-[24px] bg-white px-5 py-4 text-[#121a23]">
                                    <p className="text-xs font-semibold text-[#69707a]">この条件での目安</p>
                                    <p className="mt-1 text-lg font-semibold">
                                        {highlightedMenu
                                            ? buildEstimatedPriceLabel(highlightedMenu.duration_minutes, highlightedMenu.estimated_total_amount)
                                            : '料金を計算中'}
                                    </p>
                                    <p className="mt-2 text-sm text-[#69707a]">
                                        {therapistDetail ? formatWalkingTimeRange(therapistDetail.walking_time_range) : '徒歩目安を確認'}
                                    </p>
                                </div>

                                <div className="rounded-[24px] bg-white px-5 py-4 text-[#121a23]">
                                    <p className="text-xs font-semibold text-[#69707a]">検索条件</p>
                                    <p className="mt-1 text-lg font-semibold">
                                        {selectedStartType === 'scheduled' ? '日時指定' : '今すぐ'}
                                    </p>
                                    <p className="mt-2 text-sm text-[#69707a]">
                                        {selectedStartType === 'scheduled'
                                            ? formatScheduledLabel(scheduledStartAt)
                                            : `${durationOptions.includes(selectedDuration) ? selectedDuration : 60}分コースで比較`}
                                    </p>
                                </div>
                            </div>

                            <div className="rounded-[20px] border border-white/10 bg-white/6 px-4 py-3 text-xs text-[#d8d3ca]">
                                施術場所: {selectedAddress ? getServiceAddressLabel(selectedAddress) : isAuthenticated ? '未設定' : 'ログイン後に指定'}
                            </div>
                        </div>
                    </div>
                </DiscoveryHeroShell>

                {error ? (
                    <div className="rounded-[28px] bg-[#fffcf7] p-6 text-sm text-[#9a4b35] shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                        {error}
                    </div>
                ) : null}

                {therapistDetail ? (
                    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
                        <div className="space-y-8">
                            <section className="rounded-[32px] bg-[#fffdf8] p-6 shadow-[0_10px_24px_rgba(23,32,43,0.08)] md:p-8">
                                <div className="flex flex-col gap-6">
                                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                        <div>
                                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">PROFILE</p>
                                            <h2 className="mt-1 text-2xl font-semibold text-[#17202b]">プロフィール</h2>
                                        </div>
                                        <Link
                                            to={listPath}
                                            className="inline-flex items-center rounded-full border border-[#ddcfb4] px-4 py-2 text-sm font-semibold text-[#17202b]"
                                        >
                                            {isAuthenticated ? '一覧に戻る' : 'トップへ戻る'}
                                        </Link>
                                    </div>

                                    {therapistDetail.photos.length > 0 ? (
                                        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_160px]">
                                            <div className="overflow-hidden rounded-[28px] bg-[#ede2cf]">
                                                <img
                                                    src={therapistDetail.photos[0].url}
                                                    alt=""
                                                    className="h-full max-h-[420px] w-full object-cover"
                                                />
                                            </div>
                                            <div className="grid grid-cols-3 gap-3 md:grid-cols-1">
                                                {therapistDetail.photos.slice(1, 4).map((photo) => (
                                                    <div
                                                        key={photo.sort_order}
                                                        className="overflow-hidden rounded-[20px] bg-[#ede2cf]"
                                                    >
                                                        <img
                                                            src={photo.url}
                                                            alt=""
                                                            className="h-full w-full object-cover"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}

                                    <div className="grid gap-4 md:grid-cols-3">
                                        <article className="rounded-[24px] bg-[#f6f1e7] p-5">
                                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">REVIEW</p>
                                            <p className="mt-2 text-2xl font-semibold text-[#17202b]">
                                                ★{therapistDetail.rating_average.toFixed(1)}
                                            </p>
                                            <p className="mt-1 text-sm text-[#68707a]">{therapistDetail.review_count}件のレビュー</p>
                                        </article>
                                        <article className="rounded-[24px] bg-[#f6f1e7] p-5">
                                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">DISTANCE</p>
                                            <p className="mt-2 text-lg font-semibold text-[#17202b]">
                                                {formatWalkingTimeRange(therapistDetail.walking_time_range)}
                                            </p>
                                            <p className="mt-1 text-sm text-[#68707a]">正確な位置は一覧と詳細に表示しません。</p>
                                        </article>
                                        <article className="rounded-[24px] bg-[#f6f1e7] p-5">
                                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">POLICY</p>
                                            <p className="mt-2 text-lg font-semibold text-[#17202b]">
                                                セラピスト都合キャンセル {therapistDetail.therapist_cancellation_count}回
                                            </p>
                                            <p className="mt-1 text-sm text-[#68707a]">利用前に確認できる公開指標です。</p>
                                        </article>
                                    </div>

                                    <div className="space-y-3">
                                        <h3 className="text-xl font-semibold text-[#17202b]">紹介文</h3>
                                        <p className="whitespace-pre-wrap text-sm leading-8 text-[#48505a]">
                                            {therapistDetail.bio ?? 'プロフィール文はこれから反映されます。'}
                                        </p>
                                    </div>
                                </div>
                            </section>

                            <section className="rounded-[32px] bg-[#fffdf8] p-6 shadow-[0_10px_24px_rgba(23,32,43,0.08)] md:p-8">
                                <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                                    <div>
                                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">COURSES</p>
                                        <h2 className="mt-1 text-2xl font-semibold text-[#17202b]">対応メニュー</h2>
                                    </div>
                                    <p className="text-sm text-[#68707a]">
                                        検索条件に近いコースを上に表示しています。
                                    </p>
                                </div>

                                <div className="mt-6 grid gap-4">
                                    {therapistDetail.menus.map((menu) => {
                                        const isHighlighted = highlightedMenu?.public_id === menu.public_id;

                                        return (
                                            <article
                                                key={menu.public_id}
                                                className={[
                                                    'rounded-[24px] border p-5 transition',
                                                    isHighlighted
                                                        ? 'border-[#d2b179] bg-[#fff8ee]'
                                                        : 'border-[#efe5d7] bg-white',
                                                ].join(' ')}
                                            >
                                                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                                    <div className="space-y-2">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <h3 className="text-xl font-semibold text-[#17202b]">{menu.name}</h3>
                                                            <span className="rounded-full bg-[#f5efe4] px-3 py-1 text-xs text-[#48505a]">
                                                                {menu.duration_minutes}分
                                                            </span>
                                                            {isHighlighted ? (
                                                                <span className="rounded-full bg-[#17202b] px-3 py-1 text-xs text-white">
                                                                    この条件でおすすめ
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                        <p className="text-sm leading-7 text-[#48505a]">
                                                            {menu.description ?? '詳細説明はこれから反映されます。'}
                                                        </p>
                                                    </div>

                                                    <div className="space-y-1 md:min-w-[180px] md:text-right">
                                                        <p className="text-xl font-bold text-[#17202b]">
                                                            {buildEstimatedPriceLabel(menu.duration_minutes, menu.estimated_total_amount)}
                                                        </p>
                                                        <p className="text-sm text-[#68707a]">
                                                            基本料金 {formatCurrency(menu.base_price_amount)}
                                                        </p>
                                                    </div>
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>
                            </section>

                            <section className="rounded-[32px] bg-[#fffdf8] p-6 shadow-[0_10px_24px_rgba(23,32,43,0.08)] md:p-8">
                                <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                                    <div>
                                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">REVIEWS</p>
                                        <h2 className="mt-1 text-2xl font-semibold text-[#17202b]">レビュー</h2>
                                    </div>
                                    <p className="text-sm text-[#68707a]">
                                        公開中の利用者レビューだけを表示しています。
                                    </p>
                                </div>

                                <div className="mt-6 space-y-4">
                                    {reviews.length > 0 ? (
                                        reviews.map((review) => (
                                            <article key={review.id} className="rounded-[24px] border border-[#efe5d7] bg-white p-5">
                                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                    <div className="space-y-2">
                                                        <div className="flex flex-wrap items-center gap-3">
                                                            <p className="text-lg font-semibold text-[#17202b]">
                                                                ★{review.rating_overall.toFixed(1)}
                                                            </p>
                                                            <p className="text-sm text-[#68707a]">{formatReviewDate(review.created_at)}</p>
                                                        </div>
                                                        <p className="text-sm text-[#68707a]">{buildReviewMeta(review)}</p>
                                                    </div>
                                                    {review.booking_public_id ? (
                                                        <span className="rounded-full bg-[#f5efe4] px-3 py-1 text-xs text-[#48505a]">
                                                            予約 {review.booking_public_id}
                                                        </span>
                                                    ) : null}
                                                </div>
                                                <p className="mt-4 text-sm leading-7 text-[#48505a]">
                                                    {review.public_comment ?? 'コメントは未入力です。'}
                                                </p>
                                            </article>
                                        ))
                                    ) : (
                                        <div className="rounded-[24px] border border-dashed border-[#ddcfb4] bg-[#fff8ee] p-5 text-sm leading-7 text-[#68707a]">
                                            まだ公開レビューはありません。プロフィール文とメニューを見ながら判断できます。
                                        </div>
                                    )}
                                </div>
                            </section>
                        </div>

                        <aside className="space-y-6">
                            <section className="rounded-[32px] bg-[#fffcf7] p-6 shadow-[0_10px_24px_rgba(23,32,43,0.08)] lg:sticky lg:top-6">
                                <div className="space-y-5">
                                    <div>
                                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">BOOKING CONTEXT</p>
                                        <h2 className="mt-1 text-2xl font-semibold text-[#17202b]">この条件で予約を考える</h2>
                                    </div>

                                    <div className="space-y-3 text-sm text-[#48505a]">
                                        <div className="rounded-[20px] bg-[#f6f1e7] p-4">
                                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">施術場所</p>
                                            <p className="mt-2 font-semibold text-[#17202b]">
                                                {selectedAddress ? getServiceAddressLabel(selectedAddress) : isAuthenticated ? '未設定' : 'ログイン後に指定'}
                                            </p>
                                            {!selectedAddress ? (
                                                <Link
                                                    to={serviceAddressPath}
                                                    className="mt-3 inline-flex text-xs font-semibold text-[#9a7a49] underline underline-offset-4"
                                                >
                                                    {isAuthenticated ? '施術場所を追加する' : '無料登録して施術場所を設定する'}
                                                </Link>
                                            ) : null}
                                        </div>

                                        <div className="rounded-[20px] bg-[#f6f1e7] p-4">
                                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">予約タイプ</p>
                                            <p className="mt-2 font-semibold text-[#17202b]">
                                                {selectedStartType === 'scheduled' ? '日時指定' : '今すぐ'}
                                            </p>
                                            <p className="mt-1 text-xs text-[#68707a]">
                                                {selectedStartType === 'scheduled'
                                                    ? formatScheduledLabel(scheduledStartAt)
                                                    : `${durationOptions.includes(selectedDuration) ? selectedDuration : 60}分コースで比較中`}
                                            </p>
                                        </div>

                                        <div className="rounded-[20px] bg-[#17202b] p-5 text-white">
                                            <p className="text-xs font-semibold tracking-wide text-[#d2b179]">NEXT STEP</p>
                                            <p className="mt-2 text-sm leading-7 text-[#d8d3ca]">
                                                {isAuthenticated
                                                    ? '空き時間を確認すると、予定予約のリクエスト導線へ進めます。今すぐ予約との比較もここから続けられます。'
                                                    : 'プロフィール、メニュー、レビューはこのまま確認できます。空き時間確認と予約リクエストはログイン後に利用できます。'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <Link
                                            to={primaryAction.to}
                                            className="inline-flex w-full items-center justify-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-bold text-[#1a2430] transition hover:brightness-105"
                                        >
                                            {primaryAction.label}
                                        </Link>
                                        <Link
                                            to={secondaryAction.to}
                                            className="inline-flex w-full items-center justify-center rounded-full border border-[#ddcfb4] px-5 py-3 text-sm font-semibold text-[#17202b]"
                                        >
                                            {secondaryAction.label}
                                        </Link>
                                    </div>
                                </div>
                            </section>
                        </aside>
                    </div>
                ) : null}
            </div>

            <DiscoveryFooter
                domain={serviceMeta?.domain ?? 'sugutachi.com'}
                description={isAuthenticated
                    ? 'プロフィール、料金、レビューを確認したうえで、空き時間や予約導線へ進めます。'
                    : 'プロフィールとレビューは公開で確認でき、空き時間確認と予約導線はログイン後に続けられます。'}
                primaryAction={primaryAction}
                secondaryAction={secondaryAction}
                supportEmail={serviceMeta?.support_email ?? null}
            />
        </div>
    );
}
