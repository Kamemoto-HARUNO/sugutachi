import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { DiscoveryFooter } from '../components/discovery/DiscoveryFooter';
import { StickyHeroHeader } from '../components/discovery/StickyHeroHeader';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import {
    formatCurrency,
    formatMenuMinimumDurationLabel,
    formatWalkingTimeRange,
    getDefaultServiceAddress,
    getPendingScheduledRequestActionLabel,
    getPendingScheduledRequestNotice,
    getServiceAddressLabel,
    type BookingStartType,
    type DiscoverySort,
} from '../lib/discovery';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { addDaysToJstDateValue, buildCurrentJstDateValue, formatJstDate, formatJstDateTime } from '../lib/datetime';
import type {
    ApiEnvelope,
    ReviewSummary,
    ServiceAddress,
    TherapistDetail,
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

function formatScheduledLabel(value: string): string {
    return formatJstDateTime(value, {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }) ?? '開始日時を未指定';
}

function formatPendingScheduledRequestLabel(value: string | null): string | null {
    if (!value) {
        return null;
    }

    return formatJstDateTime(value, {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function resolveAvailabilityDate(value: string): string {
    if (value) {
        return value.slice(0, 10);
    }

    return addDaysToJstDateValue(buildCurrentJstDateValue(), 1);
}

function formatReviewDate(value: string): string {
    return formatJstDate(value, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
    }) ?? '日付不明';
}

function buildReviewMeta(review: ReviewSummary): string {
    const labels = [
        review.rating_manners ? `対応 ${review.rating_manners}/5` : null,
        review.rating_skill ? `対応 ${review.rating_skill}/5` : null,
        review.rating_cleanliness ? `清潔感 ${review.rating_cleanliness}/5` : null,
        review.rating_safety ? `安心感 ${review.rating_safety}/5` : null,
    ].filter(Boolean);

    return labels.length > 0 ? labels.join(' / ') : '総合評価を反映しています。';
}

function disabledActionClass(): string {
    return 'inline-flex w-full cursor-not-allowed items-center justify-center rounded-full border border-[#ded4c5] bg-[#f4efe6] px-5 py-3 text-sm font-semibold text-[#97a0aa] opacity-80';
}

function wrapPhotoIndex(index: number, count: number): number {
    if (count <= 0) {
        return 0;
    }

    return ((index % count) + count) % count;
}

interface PhotoDragState {
    element: HTMLDivElement;
    pointerId: number;
    startX: number;
    currentX: number;
    viewportWidth: number;
    moved: boolean;
}

export function UserTherapistDetailPage() {
    const { publicId } = useParams();
    const { account, hasRole, isAuthenticated, token } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [serviceAddresses, setServiceAddresses] = useState<ServiceAddress[]>([]);
    const [therapistDetail, setTherapistDetail] = useState<TherapistDetail | null>(null);
    const [reviews, setReviews] = useState<ReviewSummary[]>([]);
    const [serviceMeta, setServiceMeta] = useState<{ domain: string; support_email: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isBootstrapping, setIsBootstrapping] = useState(true);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    const [activePhotoIndex, setActivePhotoIndex] = useState(0);
    const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
    const [photoDragOffsetX, setPhotoDragOffsetX] = useState(0);
    const [isPhotoDragging, setIsPhotoDragging] = useState(false);
    const [photoSnapDirection, setPhotoSnapDirection] = useState<-1 | 0 | 1>(0);
    const [isPhotoTrackAnimating, setIsPhotoTrackAnimating] = useState(false);
    const photoDragRef = useRef<PhotoDragState | null>(null);
    const photoAnimationHandledRef = useRef(true);
    const suppressMainPhotoClickRef = useRef(false);

    const selectedAddressId = searchParams.get('service_address_id');
    const selectedStartType = normalizeStartType(searchParams.get('start_type'));
    const selectedSort = normalizeSort(searchParams.get('sort'));
    const scheduledStartAt = searchParams.get('scheduled_start_at') ?? '';

    const selectedAddress = useMemo(
        () => serviceAddresses.find((address) => address.public_id === selectedAddressId) ?? null,
        [selectedAddressId, serviceAddresses],
    );
    const queryString = searchParams.toString();
    const listPath = isAuthenticated ? `/user/therapists${queryString ? `?${queryString}` : ''}` : '/';
    const intendedAvailabilityPath = useMemo(() => {
        if (!therapistDetail) {
            return null;
        }

        const nextParams = new URLSearchParams(searchParams);
        nextParams.set('start_type', 'scheduled');
        nextParams.set('date', resolveAvailabilityDate(scheduledStartAt));
        nextParams.delete('therapist_menu_id');
        nextParams.delete('menu_duration_minutes');

        const nextQueryString = nextParams.toString();

        return `/user/therapists/${therapistDetail.public_id}/availability${nextQueryString ? `?${nextQueryString}` : ''}`;
    }, [scheduledStartAt, searchParams, therapistDetail]);
    const intendedTravelRequestPath = useMemo(() => {
        if (!therapistDetail) {
            return null;
        }

        const nextParams = new URLSearchParams(searchParams);

        if (selectedAddress?.prefecture) {
            nextParams.set('prefecture', selectedAddress.prefecture);
        }

        const nextQueryString = nextParams.toString();

        return `/user/therapists/${therapistDetail.public_id}/travel-request${nextQueryString ? `?${nextQueryString}` : ''}`;
    }, [searchParams, selectedAddress?.prefecture, therapistDetail]);
    const canUseUserFlows = isAuthenticated && hasRole('user');
    const isUserVerificationReady = Boolean(
        account?.latest_identity_verification?.status === 'approved'
        && account.latest_identity_verification.is_age_verified,
    );
    const pendingScheduledRequest = therapistDetail?.pending_scheduled_request ?? null;
    const pendingScheduledRequestPath = pendingScheduledRequest ? `/user/bookings/${pendingScheduledRequest.public_id}` : '/user/bookings';
    const loginAvailabilityPath = intendedAvailabilityPath
        ? `/login?return_to=${encodeURIComponent(intendedAvailabilityPath)}`
        : '/login';
    const registerAvailabilityPath = intendedAvailabilityPath
        ? `/register?return_to=${encodeURIComponent(intendedAvailabilityPath)}`
        : '/register';
    const enableUserRolePath = intendedAvailabilityPath
        ? `/role-select?add_role=user&return_to=${encodeURIComponent(intendedAvailabilityPath)}`
        : '/role-select?add_role=user&return_to=%2Fuser';
    const availabilityPath = canUseUserFlows ? intendedAvailabilityPath ?? '/user/therapists' : loginAvailabilityPath;
    const travelRequestLoginPath = intendedTravelRequestPath
        ? `/login?return_to=${encodeURIComponent(intendedTravelRequestPath)}`
        : '/login';
    const travelRequestRegisterPath = intendedTravelRequestPath
        ? `/register?return_to=${encodeURIComponent(intendedTravelRequestPath)}`
        : '/register';
    const travelRequestEnableRolePath = intendedTravelRequestPath
        ? `/role-select?add_role=user&return_to=${encodeURIComponent(intendedTravelRequestPath)}`
        : '/role-select?add_role=user&return_to=%2Fuser';
    const travelRequestAction = canUseUserFlows
        ? { label: '出張リクエストを送る', to: intendedTravelRequestPath ?? '/user/therapists' }
        : isAuthenticated
            ? { label: '利用者モードを追加して出張リクエストを送る', to: travelRequestEnableRolePath }
            : { label: 'ログインして出張リクエストを送る', to: travelRequestLoginPath };
    const serviceAddressPath = canUseUserFlows
        ? '/user/service-addresses'
        : isAuthenticated
            ? '/role-select?add_role=user&return_to=%2Fuser%2Fservice-addresses'
            : '/register';
    const primaryAction = canUseUserFlows
        ? !isUserVerificationReady
            ? { label: '本人確認・年齢確認を完了する', to: '/user/identity-verification' }
            : {
                label: pendingScheduledRequest
                    ? getPendingScheduledRequestActionLabel(pendingScheduledRequest)
                    : '空き時間を見る',
                to: pendingScheduledRequest ? pendingScheduledRequestPath : availabilityPath,
            }
        : isAuthenticated
            ? { label: '利用者モードを追加して空き時間を見る', to: enableUserRolePath }
            : { label: 'ログインして空き時間を見る', to: loginAvailabilityPath };
    const secondaryAction = canUseUserFlows
        ? { label: '一覧へ戻る', to: listPath, variant: 'secondary' as const }
        : isAuthenticated
            ? { label: '利用モードを管理する', to: '/role-select', variant: 'secondary' as const }
        : { label: '無料登録する', to: registerAvailabilityPath, variant: 'secondary' as const };

    usePageTitle(therapistDetail ? `${therapistDetail.public_name}の詳細` : 'セラピスト詳細');
    useToastOnMessage(error, 'error');

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
    }, [publicId, selectedAddressId, selectedSort, selectedStartType, setSearchParams, token]);

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
    }, [isAuthenticated, publicId, selectedAddressId, token]);

    useEffect(() => {
        setActivePhotoIndex(0);
        setIsPhotoModalOpen(false);
    }, [therapistDetail?.public_id]);

    useEffect(() => {
        if (!therapistDetail) {
            return;
        }

        setActivePhotoIndex((current) => Math.min(current, Math.max(therapistDetail.photos.length - 1, 0)));
    }, [therapistDetail]);

    useEffect(() => {
        if (!isPhotoModalOpen) {
            return;
        }

        const previousOverflow = document.body.style.overflow;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsPhotoModalOpen(false);
            }
        };

        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isPhotoModalOpen]);

    useEffect(() => {
        setPhotoDragOffsetX(0);
        setIsPhotoDragging(false);
        setPhotoSnapDirection(0);
        setIsPhotoTrackAnimating(false);
        photoDragRef.current = null;
    }, [activePhotoIndex, isPhotoModalOpen, therapistDetail?.public_id]);

    if (isBootstrapping) {
        return <LoadingScreen title="プロフィール準備中" message="待ち合わせ場所と公開情報を確認しています。" />;
    }

    if (isLoadingDetail && !therapistDetail) {
        return <LoadingScreen title="プロフィール読込中" message="セラピストの詳細とレビューを取得しています。" />;
    }

    const profileSummary = therapistDetail ? [
        therapistDetail.height_cm != null ? String(therapistDetail.height_cm) : null,
        therapistDetail.weight_kg != null ? String(therapistDetail.weight_kg) : null,
        therapistDetail.age != null ? String(therapistDetail.age) : null,
        therapistDetail.p_size_cm != null ? `P${therapistDetail.p_size_cm}` : null,
    ].filter((value): value is string => value !== null).join(' / ') : '';
    const isSelfPreview = therapistDetail?.is_self_view ?? false;
    const photoCount = therapistDetail?.photos.length ?? 0;
    const wrappedActivePhotoIndex = wrapPhotoIndex(activePhotoIndex, photoCount);
    const mainPhoto = therapistDetail?.photos[wrappedActivePhotoIndex] ?? null;
    const loopedPhotos = therapistDetail
        ? [
            therapistDetail.photos[wrapPhotoIndex(wrappedActivePhotoIndex - 1, photoCount)],
            therapistDetail.photos[wrappedActivePhotoIndex],
            therapistDetail.photos[wrapPhotoIndex(wrappedActivePhotoIndex + 1, photoCount)],
        ].filter((photo): photo is NonNullable<typeof photo> => Boolean(photo))
        : [];
    const thumbnailPhotos = therapistDetail
        ? therapistDetail.photos
            .map((photo, index) => ({ photo, index }))
            .filter(({ index }) => index !== wrappedActivePhotoIndex)
            .slice(0, 3)
        : [];
    const bookingTimingNote = selectedStartType === 'scheduled' && scheduledStartAt
        ? `${formatScheduledLabel(scheduledStartAt)} を起点に空き時間を確認できます。`
        : '空き時間画面で日付と希望時間を選べます。';
    const photoTrackBasePercent = photoSnapDirection === 1 ? -200 : photoSnapDirection === -1 ? 0 : -100;
    const pendingScheduledRequestLabel = formatPendingScheduledRequestLabel(
        pendingScheduledRequest?.scheduled_start_at ?? pendingScheduledRequest?.requested_start_at ?? null,
    );

    const animatePhotoSlide = (direction: 1 | -1) => {
        if (!therapistDetail || therapistDetail.photos.length <= 1 || isPhotoTrackAnimating) {
            return;
        }

        photoAnimationHandledRef.current = false;
        setPhotoDragOffsetX(0);
        setIsPhotoDragging(false);
        setPhotoSnapDirection(direction);
        setIsPhotoTrackAnimating(true);
    };

    const handlePhotoPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!therapistDetail || therapistDetail.photos.length <= 1 || isPhotoTrackAnimating) {
            return;
        }

        if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
        }

        const rect = event.currentTarget.getBoundingClientRect();

        photoDragRef.current = {
            element: event.currentTarget,
            pointerId: event.pointerId,
            startX: event.clientX,
            currentX: event.clientX,
            viewportWidth: rect.width,
            moved: false,
        };
        suppressMainPhotoClickRef.current = false;
        setPhotoDragOffsetX(0);
        setIsPhotoDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const handlePhotoPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        const dragState = photoDragRef.current;

        if (!dragState || event.pointerId !== dragState.pointerId) {
            return;
        }

        const deltaX = event.clientX - dragState.startX;
        dragState.currentX = event.clientX;

        if (Math.abs(deltaX) > 6) {
            dragState.moved = true;
        }

        setPhotoDragOffsetX(deltaX);
    };

    const handlePhotoPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
        const dragState = photoDragRef.current;

        if (!dragState || event.pointerId !== dragState.pointerId) {
            return;
        }

        const deltaX = dragState.currentX - dragState.startX;
        const threshold = Math.min(120, Math.max(42, dragState.viewportWidth * 0.18));

        if (Math.abs(deltaX) >= threshold) {
            animatePhotoSlide(deltaX < 0 ? 1 : -1);
        } else {
            photoAnimationHandledRef.current = false;
            setPhotoDragOffsetX(0);
            setIsPhotoTrackAnimating(true);
        }

        if (dragState.element.hasPointerCapture?.(dragState.pointerId)) {
            try {
                dragState.element.releasePointerCapture(dragState.pointerId);
            } catch {
                // Pointer capture may already be released by the browser.
            }
        }

        suppressMainPhotoClickRef.current = dragState.moved;
        photoDragRef.current = null;
        setIsPhotoDragging(false);
    };

    const handlePhotoPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
        const dragState = photoDragRef.current;

        if (!dragState || event.pointerId !== dragState.pointerId) {
            return;
        }

        if (dragState.element.hasPointerCapture?.(dragState.pointerId)) {
            try {
                dragState.element.releasePointerCapture(dragState.pointerId);
            } catch {
                // Pointer capture may already be released by the browser.
            }
        }

        photoDragRef.current = null;
        setPhotoDragOffsetX(0);
        setIsPhotoDragging(false);
    };

    const handlePhotoTrackTransitionEnd = () => {
        if (!isPhotoTrackAnimating || photoAnimationHandledRef.current) {
            return;
        }

        photoAnimationHandledRef.current = true;

        if (photoSnapDirection !== 0 && therapistDetail) {
            setActivePhotoIndex((current) => wrapPhotoIndex(current + photoSnapDirection, therapistDetail.photos.length));
        }

        setPhotoSnapDirection(0);
        setPhotoDragOffsetX(0);
        setIsPhotoTrackAnimating(false);
    };

    const handleMainPhotoActivate = () => {
        if (suppressMainPhotoClickRef.current) {
            suppressMainPhotoClickRef.current = false;
            return;
        }

        setIsPhotoModalOpen(true);
    };

    const handleMainPhotoKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }

        event.preventDefault();
        handleMainPhotoActivate();
    };

    return (
        <div className="min-h-screen bg-[#f6f1e7] text-[#17202b]">
            <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-16 px-6 py-10 md:px-10 md:py-14 xl:gap-[60px] xl:px-0">
                <section className="rounded-[32px] bg-[linear-gradient(107deg,#17202b_3.49%,#1d2a39_53.96%,#27364a_93.62%)] px-6 py-5 shadow-[0_24px_60px_rgba(23,32,43,0.16)] md:px-8">
                    <StickyHeroHeader actions={isSelfPreview ? [secondaryAction] : [primaryAction, secondaryAction]} />
                </section>

                {therapistDetail ? (
                    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
                        <div className="space-y-8">
                            <section className="rounded-[32px] bg-[#fffdf8] p-6 shadow-[0_10px_24px_rgba(23,32,43,0.08)] md:p-8">
                                <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                                    <div className="space-y-5">
                                        <div className="space-y-3">
                                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">PROFILE</p>
                                            <div className="space-y-2">
                                                <div className="flex flex-wrap items-center gap-3">
                                                    <h1 className="text-3xl font-semibold text-[#17202b] md:text-4xl">
                                                        {therapistDetail.public_name}
                                                    </h1>
                                                    {therapistDetail.is_online ? (
                                                        <span className="rounded-full bg-[#e8f1eb] px-3 py-1 text-xs font-semibold text-[#2d5b3d]">
                                                            オンライン
                                                        </span>
                                                    ) : (
                                                        <span className="rounded-full bg-[#f3eee4] px-3 py-1 text-xs font-semibold text-[#48505a]">
                                                            予約のみ受付中
                                                        </span>
                                                    )}
                                                </div>
                                                {profileSummary ? (
                                                    <p className="text-sm font-medium tracking-wide text-[#68707a]">
                                                        {profileSummary}
                                                    </p>
                                                ) : null}
                                            </div>
                                        </div>

                                        {mainPhoto ? (
                                            <div className="space-y-4">
                                                <div
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={handleMainPhotoActivate}
                                                    onKeyDown={handleMainPhotoKeyDown}
                                                    onPointerDown={handlePhotoPointerDown}
                                                    onPointerMove={handlePhotoPointerMove}
                                                    onPointerUp={handlePhotoPointerUp}
                                                    onPointerCancel={handlePhotoPointerCancel}
                                                    className="group relative block touch-pan-y overflow-hidden rounded-[28px] bg-[#ede2cf] text-left outline-none"
                                                    aria-label="写真を拡大表示"
                                                >
                                                    <div className="aspect-square">
                                                        <div
                                                            className={[
                                                                'flex h-full',
                                                                isPhotoTrackAnimating && !isPhotoDragging ? 'transition-transform duration-300 ease-out' : '',
                                                            ].join(' ')}
                                                            onTransitionEnd={handlePhotoTrackTransitionEnd}
                                                            style={{
                                                                transform: `translateX(calc(${photoTrackBasePercent}% + ${photoDragOffsetX}px))`,
                                                            }}
                                                        >
                                                            {loopedPhotos.map((photo, index) => (
                                                                <div key={`${photo.sort_order}-${index}`} className="min-w-full">
                                                                    <img
                                                                        src={photo.url}
                                                                        alt={`${therapistDetail.public_name}の写真 ${wrapPhotoIndex(wrappedActivePhotoIndex + index - 1, photoCount) + 1}`}
                                                                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                                                                        draggable={false}
                                                                    />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    {photoCount > 1 ? (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    animatePhotoSlide(-1);
                                                                }}
                                                                className="absolute left-3 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-[rgba(23,32,43,0.68)] text-lg font-semibold text-white transition hover:bg-[rgba(23,32,43,0.88)]"
                                                                aria-label="前の写真へ"
                                                            >
                                                                ‹
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    animatePhotoSlide(1);
                                                                }}
                                                                className="absolute right-3 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-[rgba(23,32,43,0.68)] text-lg font-semibold text-white transition hover:bg-[rgba(23,32,43,0.88)]"
                                                                aria-label="次の写真へ"
                                                            >
                                                                ›
                                                            </button>
                                                            <span className="absolute right-4 top-4 rounded-full bg-[rgba(23,32,43,0.72)] px-3 py-1 text-xs font-semibold text-white">
                                                                {wrappedActivePhotoIndex + 1} / {photoCount}
                                                            </span>
                                                        </>
                                                    ) : null}
                                                </div>

                                                {thumbnailPhotos.length > 0 ? (
                                                    <div className="grid grid-cols-3 gap-3">
                                                        {thumbnailPhotos.map(({ photo, index }) => (
                                                            <button
                                                                key={`${photo.sort_order}-${index}`}
                                                                type="button"
                                                                onClick={() => setActivePhotoIndex(index)}
                                                                className="overflow-hidden rounded-[20px] bg-[#ede2cf] text-left transition hover:opacity-90"
                                                                aria-label={`${therapistDetail.public_name}の写真 ${index + 1} を表示`}
                                                            >
                                                                <div className="aspect-square">
                                                                    <img
                                                                        src={photo.url}
                                                                        alt=""
                                                                        className="h-full w-full object-cover"
                                                                    />
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                ) : null}
                                            </div>
                                        ) : (
                                            <div className="flex aspect-square items-center justify-center rounded-[28px] bg-[linear-gradient(160deg,#e8d5b2_0%,#cbb08a_100%)] text-6xl font-semibold text-[#17202b]">
                                                {therapistDetail.public_name.slice(0, 1).toUpperCase()}
                                            </div>
                                        )}

                                        <div className="space-y-4">
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
                                    </div>

                                    <div className="space-y-5">
                                        <div className="space-y-3">
                                            <h2 className="text-xl font-semibold text-[#17202b]">紹介文</h2>
                                            <p className="whitespace-pre-wrap text-sm leading-8 text-[#48505a]">
                                                {therapistDetail.bio ?? 'プロフィール文は準備中です。予約前のやり取りで詳しく確認できます。'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section className="rounded-[32px] bg-[#fffdf8] p-6 shadow-[0_10px_24px_rgba(23,32,43,0.08)] md:p-8">
                                <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                                    <div>
                                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">SERVICE STYLE</p>
                                        <h2 className="mt-1 text-2xl font-semibold text-[#17202b]">対応内容</h2>
                                    </div>
                                    <p className="text-sm text-[#68707a]">
                                        空き時間を確認したあと、希望する対応内容と予約時間を選べます。
                                    </p>
                                </div>

                                <div className="mt-6 space-y-4">
                                    <div className="grid gap-4">
                                    {therapistDetail.menus.map((menu) => {
                                        return (
                                            <article
                                                key={menu.public_id}
                                                className="rounded-[24px] border border-[#efe5d7] bg-white p-5"
                                            >
                                                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                                    <div className="space-y-2">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <h3 className="text-xl font-semibold text-[#17202b]">{menu.name}</h3>
                                                            <span className="rounded-full bg-[#f5efe4] px-3 py-1 text-xs text-[#48505a]">
                                                                {formatMenuMinimumDurationLabel(menu)}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm leading-7 text-[#48505a]">
                                                            {menu.description ?? '対応内容の詳細は予約前のやり取りで確認できます。'}
                                                        </p>
                                                    </div>

                                                    <div className="space-y-1 md:min-w-[180px] md:text-right">
                                                        <p className="text-xl font-bold text-[#17202b]">
                                                            60分 {formatCurrency(menu.hourly_rate_amount)}〜
                                                        </p>
                                                    </div>
                                                </div>
                                            </article>
                                        );
                                    })}
                                    </div>
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
                                                </div>
                                                <p className="mt-4 text-sm leading-7 text-[#48505a]">
                                                    {review.public_comment ?? 'コメントは未入力です。'}
                                                </p>
                                            </article>
                                        ))
                                    ) : (
                                        <div className="rounded-[24px] border border-dashed border-[#ddcfb4] bg-[#fff8ee] p-5 text-sm leading-7 text-[#68707a]">
                                            まだ公開レビューはありません。プロフィール文と対応内容を見ながら判断できます。
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
                                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">待ち合わせ場所</p>
                                            <p className="mt-2 font-semibold text-[#17202b]">
                                                {selectedAddress ? getServiceAddressLabel(selectedAddress) : isAuthenticated ? '未設定' : 'ログイン後に指定'}
                                            </p>
                                            {!selectedAddress ? (
                                                <Link
                                                    to={serviceAddressPath}
                                                    className="mt-3 inline-flex text-xs font-semibold text-[#9a7a49] underline underline-offset-4"
                                                >
                                                    {isAuthenticated ? '待ち合わせ場所を追加する' : '無料登録して待ち合わせ場所を設定する'}
                                                </Link>
                                            ) : null}
                                        </div>

                                        <div className="rounded-[20px] bg-[#f6f1e7] p-4">
                                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">予約タイプ</p>
                                            <p className="mt-2 font-semibold text-[#17202b]">
                                                {selectedStartType === 'scheduled' ? '日時指定' : '今すぐ'}
                                            </p>
                                            <p className="mt-1 text-xs text-[#68707a]">
                                                {bookingTimingNote}
                                            </p>
                                        </div>

                                        <div className="rounded-[20px] bg-[#f6f1e7] p-4">
                                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">対応内容</p>
                                            <p className="mt-2 font-semibold text-[#17202b]">
                                                {therapistDetail.menus.length}件の対応内容を公開中
                                            </p>
                                            <p className="mt-1 text-xs text-[#68707a]">
                                                空き時間の確認後に、希望する内容と予約時間を選べます。
                                            </p>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        {isSelfPreview ? (
                                            <div className="rounded-[20px] border border-[#d8ccb9] bg-[#f7f1e7] p-4 text-sm leading-7 text-[#5d6774]">
                                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">自分のページを確認中です</p>
                                                <p className="mt-2 font-semibold text-[#17202b]">
                                                    自分のページのため予約は行えません。
                                                </p>
                                                <p className="mt-2 text-xs text-[#68707a]">
                                                    公開プロフィールの見え方を確認できます。予約や出張リクエストは利用者側の画面からのみ行えます。
                                                </p>
                                            </div>
                                        ) : null}
                                        {!isSelfPreview && canUseUserFlows && !isUserVerificationReady ? (
                                            <div className="rounded-[20px] border border-[#e7d5b3] bg-[#fff8ec] p-4 text-sm leading-7 text-[#6f5a38]">
                                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">予約前の確認が必要です</p>
                                                <p className="mt-2 font-semibold text-[#17202b]">
                                                    本人確認・年齢確認の承認が終わるまで、予約リクエストは送れません。
                                                </p>
                                                <p className="mt-2 text-xs text-[#7d6852]">
                                                    未成年の利用防止とトラブル時の対応のため、利用者側も本人確認が必須です。
                                                </p>
                                            </div>
                                        ) : null}
                                        {!isSelfPreview && pendingScheduledRequest ? (
                                            <div className="rounded-[20px] border border-[#e7d5b3] bg-[#fff8ec] p-4 text-sm leading-7 text-[#6f5a38]">
                                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">
                                                    {pendingScheduledRequest.status === 'payment_authorizing' ? '送信中の予約リクエスト' : '承認待ちの予約リクエスト'}
                                                </p>
                                                <p className="mt-2 font-semibold text-[#17202b]">
                                                    {getPendingScheduledRequestNotice(pendingScheduledRequest)}
                                                </p>
                                                {pendingScheduledRequestLabel ? (
                                                    <p className="mt-2 text-xs text-[#7d6852]">
                                                        現在の予約候補: {pendingScheduledRequestLabel}
                                                    </p>
                                                ) : null}
                                            </div>
                                        ) : null}
                                        {isSelfPreview ? (
                                            <>
                                                <span className={disabledActionClass()}>
                                                    空き時間を見る
                                                </span>
                                                <span className={disabledActionClass()}>
                                                    出張リクエストを送る
                                                </span>
                                                <p className="text-xs leading-6 text-[#68707a]">
                                                    このプレビューでは予約や出張リクエストは送信できません。
                                                </p>
                                            </>
                                        ) : (
                                            <>
                                                <Link
                                                    to={primaryAction.to}
                                                    className="inline-flex w-full items-center justify-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-bold text-[#1a2430] transition hover:brightness-105"
                                                >
                                                    {primaryAction.label}
                                                </Link>
                                                <Link
                                                    to={travelRequestAction.to}
                                                    className="inline-flex w-full items-center justify-center rounded-full border border-[#ddcfb4] px-5 py-3 text-sm font-semibold text-[#17202b]"
                                                >
                                                    {travelRequestAction.label}
                                                </Link>
                                                <p className="text-xs leading-6 text-[#68707a]">
                                                    空き枠が合わないときは、希望エリアや希望日時を添えて出張リクエストを送れます。
                                                </p>
                                                {!canUseUserFlows && !isAuthenticated ? (
                                                    <Link
                                                        to={travelRequestRegisterPath}
                                                        className="inline-flex w-full items-center justify-center rounded-full border border-[#ddcfb4] px-5 py-3 text-sm font-semibold text-[#17202b]"
                                                    >
                                                        無料登録してあとで送る
                                                    </Link>
                                                ) : null}
                                            </>
                                        )}
                                        <Link
                                            to={listPath}
                                            className="inline-flex w-full items-center justify-center rounded-full border border-[#ddcfb4] px-5 py-3 text-sm font-semibold text-[#17202b]"
                                        >
                                            一覧へ戻る
                                        </Link>
                                    </div>
                                </div>
                            </section>
                        </aside>
                    </div>
                ) : null}
            </div>

            {therapistDetail && mainPhoto && isPhotoModalOpen ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(12,16,24,0.84)] px-4 py-6"
                    onClick={() => setIsPhotoModalOpen(false)}
                >
                    <div
                        className="relative w-full max-w-[920px]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <button
                            type="button"
                            onClick={() => setIsPhotoModalOpen(false)}
                            className="absolute right-3 top-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[rgba(23,32,43,0.76)] text-xl font-semibold text-white transition hover:bg-[rgba(23,32,43,0.92)]"
                            aria-label="拡大表示を閉じる"
                        >
                            ×
                        </button>
                        <div
                            className="relative overflow-hidden rounded-[28px] bg-[#111822] shadow-[0_24px_60px_rgba(0,0,0,0.36)]"
                            onPointerDown={handlePhotoPointerDown}
                            onPointerMove={handlePhotoPointerMove}
                            onPointerUp={handlePhotoPointerUp}
                            onPointerCancel={handlePhotoPointerCancel}
                        >
                            <div className="aspect-square max-h-[85vh] w-full touch-pan-y">
                                <div
                                    className={[
                                        'flex h-full',
                                        isPhotoTrackAnimating && !isPhotoDragging ? 'transition-transform duration-300 ease-out' : '',
                                    ].join(' ')}
                                    onTransitionEnd={handlePhotoTrackTransitionEnd}
                                    style={{
                                        transform: `translateX(calc(${photoTrackBasePercent}% + ${photoDragOffsetX}px))`,
                                    }}
                                >
                                    {loopedPhotos.map((photo, index) => (
                                        <div key={`${photo.sort_order}-${index}-modal`} className="min-w-full">
                                            <img
                                                src={photo.url}
                                                alt={`${therapistDetail.public_name}の写真 ${wrapPhotoIndex(wrappedActivePhotoIndex + index - 1, photoCount) + 1}`}
                                                className="h-full w-full object-contain"
                                                draggable={false}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                            {photoCount > 1 ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            animatePhotoSlide(-1);
                                        }}
                                        className="absolute left-4 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[rgba(23,32,43,0.76)] text-xl font-semibold text-white transition hover:bg-[rgba(23,32,43,0.92)]"
                                        aria-label="前の写真へ"
                                    >
                                        ‹
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            animatePhotoSlide(1);
                                        }}
                                        className="absolute right-4 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[rgba(23,32,43,0.76)] text-xl font-semibold text-white transition hover:bg-[rgba(23,32,43,0.92)]"
                                        aria-label="次の写真へ"
                                    >
                                        ›
                                    </button>
                                    <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-[rgba(23,32,43,0.72)] px-3 py-1 text-xs font-semibold text-white">
                                        {wrappedActivePhotoIndex + 1} / {photoCount}
                                    </span>
                                </>
                            ) : null}
                        </div>
                    </div>
                </div>
            ) : null}

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
