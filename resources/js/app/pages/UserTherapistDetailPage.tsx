import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BannerPlacementSection } from '../components/banners/BannerPlacementSection';
import { DiscoveryFooter } from '../components/discovery/DiscoveryFooter';
import { StickyHeroHeader, type StickyHeroHeaderAction } from '../components/discovery/StickyHeroHeader';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToast } from '../hooks/useToast';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { getMyPageEntryPath } from '../lib/account';
import {
    DISCOVERY_BOOKING_TYPE_LABEL,
    DISCOVERY_BOOKING_TYPE_OPTIONS,
    formatCurrency,
    formatMenuHourlyRateLabel,
    formatMenuMinimumDurationLabel,
    formatTravelModeLabel,
    formatTravelTimeEstimate,
    formatWalkingTimeRange,
    getDefaultServiceAddress,
    getMenuMinimumDurationMinutes,
    getPendingScheduledRequestActionLabel,
    getPendingScheduledRequestNotice,
    getServiceAddressLabel,
    isFreeMenu,
    type BookingStartType,
    type DiscoverySort,
} from '../lib/discovery';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { addDaysToJstDateValue, buildCurrentJstDateValue, formatJstDate, formatJstDateTime } from '../lib/datetime';
import type {
    ApiEnvelope,
    PrivatePhotoSession,
    ReviewSummary,
    ServiceAddress,
    ServiceMeta,
    TherapistMenu,
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

function normalizeDuration(value: string | null): number {
    const parsed = Number(value);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
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

function buildCompactTravelSummary(
    travelMode: 'walking' | 'bicycle' | 'transit' | 'car' | null | undefined,
    range: string | null | undefined,
): string {
    const timeLabel = formatWalkingTimeRange(range);

    if (timeLabel === '到着目安は準備中' || timeLabel === '対応エリア外') {
        return timeLabel;
    }

    return `${formatTravelModeLabel(travelMode)}で ${timeLabel}に到着`;
}

function buildShareableTherapistUrl(publicId: string): string {
    const path = `/therapists/${publicId}`;

    if (typeof window === 'undefined') {
        return path;
    }

    return new URL(path, window.location.origin).toString();
}

function formatFavoriteCount(value: number): string {
    return value >= 1000 ? `${Math.floor(value / 100) / 10}k` : String(value);
}

async function copyTextToClipboard(value: string): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return;
    }

    if (typeof document === 'undefined') {
        throw new Error('Clipboard API is unavailable.');
    }

    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);

    if (!copied) {
        throw new Error('Unable to copy text.');
    }
}

function disabledActionClass(): string {
    return 'inline-flex w-full cursor-not-allowed items-center justify-center rounded-full border border-[#ded4c5] bg-[#f4efe6] px-5 py-3 text-sm font-semibold text-[#97a0aa] opacity-80';
}

function getDurationStepMinutes(menu: TherapistMenu | null): number {
    return Math.max(15, menu?.duration_step_minutes ?? 15);
}

function buildDurationValues(
    minimumDurationMinutes: number,
    maximumDurationMinutes: number,
    stepMinutes: number,
): number[] {
    if (maximumDurationMinutes < minimumDurationMinutes) {
        return [];
    }

    const values = new Set<number>();

    for (let duration = minimumDurationMinutes; duration <= maximumDurationMinutes; duration += stepMinutes) {
        values.add(duration);
    }

    values.add(maximumDurationMinutes);

    return Array.from(values).sort((left, right) => left - right);
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

interface PrivateViewerPhoto {
    id: number;
    sort_order: number;
    url: string;
}

async function fetchPrivatePhotoBlob(
    sessionToken: string,
    photoId: number,
    token: string,
): Promise<{ url: string; lockedUntil: string | null }> {
    const response = await fetch(`/api/private-photo-sessions/${sessionToken}/photos/${photoId}/file`, {
        headers: {
            Accept: 'image/*',
            Authorization: `Bearer ${token}`,
        },
        credentials: 'same-origin',
    });

    if (!response.ok) {
        throw new ApiError(response.status, '非公開写真の取得に失敗しました。');
    }

    const blob = await response.blob();

    return {
        url: URL.createObjectURL(blob),
        lockedUntil: response.headers.get('X-Private-Photo-Locked-Until'),
    };
}

export function UserTherapistDetailPage() {
    const { publicId } = useParams();
    const { account, hasRole, isAuthenticated, token } = useAuth();
    const navigate = useNavigate();
    const { showError, showSuccess } = useToast();
    const [searchParams, setSearchParams] = useSearchParams();
    const [serviceAddresses, setServiceAddresses] = useState<ServiceAddress[]>([]);
    const [therapistDetail, setTherapistDetail] = useState<TherapistDetail | null>(null);
    const [reviews, setReviews] = useState<ReviewSummary[]>([]);
    const [serviceMeta, setServiceMeta] = useState<ServiceMeta | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isBootstrapping, setIsBootstrapping] = useState(true);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    const [isTogglingFavorite, setIsTogglingFavorite] = useState(false);
    const [activePhotoIndex, setActivePhotoIndex] = useState(0);
    const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
    const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
    const [isPrivatePhotoConfirmOpen, setIsPrivatePhotoConfirmOpen] = useState(false);
    const [isPrivatePhotoLoading, setIsPrivatePhotoLoading] = useState(false);
    const [isPrivatePhotoViewerOpen, setIsPrivatePhotoViewerOpen] = useState(false);
    const [privatePhotoSessionToken, setPrivatePhotoSessionToken] = useState<string | null>(null);
    const [privatePhotoSessionPhotos, setPrivatePhotoSessionPhotos] = useState<PrivateViewerPhoto[]>([]);
    const [privatePhotoActiveIndex, setPrivatePhotoActiveIndex] = useState(0);
    const [privatePhotoCloseAt, setPrivatePhotoCloseAt] = useState<number | null>(null);
    const [photoDragOffsetX, setPhotoDragOffsetX] = useState(0);
    const [isPhotoDragging, setIsPhotoDragging] = useState(false);
    const [photoSnapDirection, setPhotoSnapDirection] = useState<-1 | 0 | 1>(0);
    const [isPhotoTrackAnimating, setIsPhotoTrackAnimating] = useState(false);
    const photoDragRef = useRef<PhotoDragState | null>(null);
    const photoAnimationHandledRef = useRef(true);
    const suppressMainPhotoClickRef = useRef(false);
    const previousTherapistPublicIdRef = useRef<string | null>(null);

    const selectedAddressId = searchParams.get('service_address_id');
    const selectedMenuId = searchParams.get('therapist_menu_id');
    const selectedStartType = normalizeStartType(searchParams.get('start_type'));
    const selectedSort = normalizeSort(searchParams.get('sort'));
    const scheduledStartAt = searchParams.get('scheduled_start_at') ?? '';
    const preferredDurationMinutes = normalizeDuration(searchParams.get('menu_duration_minutes'));

    const selectedAddress = useMemo(
        () => serviceAddresses.find((address) => address.public_id === selectedAddressId) ?? null,
        [selectedAddressId, serviceAddresses],
    );
    const selectedMenu = useMemo(() => {
        if (!therapistDetail) {
            return null;
        }

        return therapistDetail.menus.find((menu) => menu.public_id === selectedMenuId)
            ?? therapistDetail.menus.find((menu) => getMenuMinimumDurationMinutes(menu) <= preferredDurationMinutes)
            ?? therapistDetail.menus[0]
            ?? null;
    }, [preferredDurationMinutes, selectedMenuId, therapistDetail]);
    const selectedDurationMinutes = selectedMenu
        ? Math.max(preferredDurationMinutes, getMenuMinimumDurationMinutes(selectedMenu))
        : preferredDurationMinutes;
    const instantDurationOptions = useMemo(() => {
        if (!selectedMenu) {
            return [];
        }

        return buildDurationValues(
            getMenuMinimumDurationMinutes(selectedMenu),
            240,
            getDurationStepMinutes(selectedMenu),
        );
    }, [selectedMenu]);
    const queryString = searchParams.toString();
    const detailReturnPath = publicId ? `/therapists/${publicId}${queryString ? `?${queryString}` : ''}` : '/';
    const myPagePath = getMyPageEntryPath(account);
    const listPath = isAuthenticated ? `/user/therapists${queryString ? `?${queryString}` : ''}` : '/';
    const intendedAvailabilityPath = useMemo(() => {
        if (!therapistDetail) {
            return null;
        }

        const nextParams = new URLSearchParams(searchParams);
        nextParams.set('start_type', 'scheduled');
        nextParams.set('date', resolveAvailabilityDate(scheduledStartAt));

        const nextQueryString = nextParams.toString();

        return `/user/therapists/${therapistDetail.public_id}/availability${nextQueryString ? `?${nextQueryString}` : ''}`;
    }, [scheduledStartAt, searchParams, therapistDetail]);
    const intendedInstantQuotePath = useMemo(() => {
        if (!therapistDetail || !selectedMenu || !selectedAddressId) {
            return null;
        }

        const nextParams = new URLSearchParams();
        nextParams.set('therapist_id', therapistDetail.public_id);
        nextParams.set('therapist_menu_id', selectedMenu.public_id);
        nextParams.set('service_address_id', selectedAddressId);
        nextParams.set('menu_duration_minutes', String(selectedDurationMinutes));
        nextParams.set('start_type', 'now');

        return `/user/booking-request/quote?${nextParams.toString()}`;
    }, [selectedAddressId, selectedDurationMinutes, selectedMenu, therapistDetail]);
    const intendedPrimaryActionPath = selectedStartType === 'scheduled'
        ? intendedAvailabilityPath
        : intendedInstantQuotePath;
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
    const scheduledAvailabilityUnavailableMessage = 'このセラピストは空き枠が設定されていないのでリクエストを送ることができません。';
    const shouldBlockOfflineNowRequest = Boolean(
        therapistDetail
        && !therapistDetail.is_online
        && selectedStartType === 'now'
        && canUseUserFlows
        && selectedAddress
        && isUserVerificationReady
        && !pendingScheduledRequest,
    );
    const handleOfflineNowRequestClick = useCallback(() => {
        showError('このタチキャストは現在オフラインです');
    }, [showError]);
    const shouldBlockScheduledRequestWithoutAvailability = Boolean(
        therapistDetail
        && selectedStartType === 'scheduled'
        && !therapistDetail.has_published_availability_slots
        && !pendingScheduledRequest,
    );
    const handleUnavailableScheduledRequestClick = useCallback(() => {
        showError(scheduledAvailabilityUnavailableMessage);
    }, [scheduledAvailabilityUnavailableMessage, showError]);
    const loginAvailabilityPath = intendedPrimaryActionPath
        ? `/login?return_to=${encodeURIComponent(intendedPrimaryActionPath)}`
        : '/login';
    const privatePhotoLoginPath = `/login?return_to=${encodeURIComponent(detailReturnPath)}`;
    const registerAvailabilityPath = intendedPrimaryActionPath
        ? `/register?return_to=${encodeURIComponent(intendedPrimaryActionPath)}`
        : '/register';
    const enableUserRolePath = intendedPrimaryActionPath
        ? `/role-select?add_role=user&return_to=${encodeURIComponent(intendedPrimaryActionPath)}`
        : '/role-select?add_role=user&return_to=%2Fuser';
    const availabilityPath = canUseUserFlows ? intendedPrimaryActionPath ?? '/user/therapists' : loginAvailabilityPath;
    const travelRequestLoginPath = intendedTravelRequestPath
        ? `/login?return_to=${encodeURIComponent(intendedTravelRequestPath)}`
        : '/login';
    const travelRequestRegisterPath = intendedTravelRequestPath
        ? `/register?return_to=${encodeURIComponent(intendedTravelRequestPath)}`
        : '/register';
    const travelRequestEnableRolePath = intendedTravelRequestPath
        ? `/role-select?add_role=user&return_to=${encodeURIComponent(intendedTravelRequestPath)}`
        : '/role-select?add_role=user&return_to=%2Fuser';
    const travelRequestAction: StickyHeroHeaderAction = canUseUserFlows
        ? { label: '出張リクエストを送る', to: intendedTravelRequestPath ?? '/user/therapists' }
        : isAuthenticated
            ? { label: '利用者モードを追加して出張リクエストを送る', to: travelRequestEnableRolePath }
            : { label: 'ログインして出張リクエストを送る', to: travelRequestLoginPath };
    const serviceAddressPath = canUseUserFlows
        ? '/user/service-addresses'
        : isAuthenticated
            ? '/role-select?add_role=user&return_to=%2Fuser%2Fservice-addresses'
            : '/register';
    const primaryAction: StickyHeroHeaderAction = canUseUserFlows
        ? !selectedAddress
            ? { label: '待ち合わせ場所を設定する', to: serviceAddressPath }
            : !isUserVerificationReady
            ? { label: '本人確認・年齢確認を完了する', to: '/user/identity-verification' }
            : shouldBlockScheduledRequestWithoutAvailability
            ? {
                label: '空き時間を見る',
                to: availabilityPath,
                disabled: true,
                onClick: handleUnavailableScheduledRequestClick,
            }
            : shouldBlockOfflineNowRequest
            ? {
                label: '依頼をリクエストする',
                to: availabilityPath,
                disabled: true,
                onClick: handleOfflineNowRequestClick,
            }
            : {
                label: pendingScheduledRequest
                    ? getPendingScheduledRequestActionLabel(pendingScheduledRequest)
                    : selectedStartType === 'scheduled'
                        ? '空き時間を見る'
                        : '依頼をリクエストする',
                to: pendingScheduledRequest ? pendingScheduledRequestPath : availabilityPath,
            }
        : shouldBlockScheduledRequestWithoutAvailability
            ? {
                label: '空き時間を見る',
                to: loginAvailabilityPath,
                disabled: true,
                onClick: handleUnavailableScheduledRequestClick,
            }
        : isAuthenticated
            ? {
                label: selectedStartType === 'scheduled'
                    ? '利用者モードを追加して空き時間を見る'
                    : '利用者モードを追加して依頼をリクエストする',
                to: enableUserRolePath,
            }
            : {
                label: selectedStartType === 'scheduled'
                    ? 'ログインして空き時間を見る'
                    : 'ログインして依頼をリクエストする',
                to: loginAvailabilityPath,
            };
    const secondaryAction: StickyHeroHeaderAction = canUseUserFlows
        ? { label: '一覧へ戻る', to: listPath, variant: 'secondary' as const }
        : isAuthenticated
            ? { label: '利用モードを管理する', to: '/role-select', variant: 'secondary' as const }
        : { label: '無料登録する', to: registerAvailabilityPath, variant: 'secondary' as const };
    const headerActions = useMemo<StickyHeroHeaderAction[]>(() => {
        if (isAuthenticated) {
            return [
                {
                    label: 'マイページ',
                    to: myPagePath,
                    icon: 'mypage',
                },
            ];
        }

        return [
            {
                label: 'ログイン',
                to: `/login?return_to=${encodeURIComponent(detailReturnPath)}`,
                icon: 'login',
            },
            {
                label: '会員登録',
                to: `/register?return_to=${encodeURIComponent(detailReturnPath)}`,
                variant: 'secondary',
                icon: 'register',
            },
        ];
    }, [detailReturnPath, isAuthenticated, myPagePath]);
    const activeUserBookingCampaign = useMemo(
        () => serviceMeta?.campaigns.find((campaign) => (
            campaign.target_role === 'user'
            && campaign.placements.includes('therapist_detail')
        )) ?? null,
        [serviceMeta],
    );
    const shareUrl = therapistDetail ? buildShareableTherapistUrl(therapistDetail.public_id) : null;

    usePageTitle(therapistDetail ? `${therapistDetail.public_name}の詳細` : 'タチキャスト詳細');
    useToastOnMessage(error, 'error');

    useEffect(() => {
        let isMounted = true;

        async function bootstrap() {
            try {
                const [metaPayload, addressPayload] = await Promise.all([
                    apiRequest<ApiEnvelope<ServiceMeta>>('/service-meta'),
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
        setIsReviewModalOpen(false);
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
        if (!isReviewModalOpen) {
            return;
        }

        const previousOverflow = document.body.style.overflow;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsReviewModalOpen(false);
            }
        };

        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isReviewModalOpen]);

    useEffect(() => {
        setPhotoDragOffsetX(0);
        setIsPhotoDragging(false);
        setPhotoSnapDirection(0);
        setIsPhotoTrackAnimating(false);
        photoDragRef.current = null;
    }, [activePhotoIndex, isPhotoModalOpen, therapistDetail?.public_id]);

    const applyPrivatePhotoCooldown = useCallback((nextAvailableAt: string | null) => {
        if (!nextAvailableAt) {
            return;
        }

        setTherapistDetail((current) => {
            if (!current?.private_photo_summary) {
                return current;
            }

            return {
                ...current,
                private_photo_summary: {
                    ...current.private_photo_summary,
                    can_view: false,
                    next_available_at: nextAvailableAt,
                },
            };
        });
    }, []);

    const revokePrivatePhotoUrls = useCallback((photos: PrivateViewerPhoto[]) => {
        photos.forEach((photo) => {
            URL.revokeObjectURL(photo.url);
        });
    }, []);

    const closePrivatePhotoViewer = useCallback(async (
        closeReason: 'auto_hidden' | 'fetch_failed' | 'manual' | 'navigated' | 'tab_hidden' = 'manual',
    ) => {
        const currentPhotos = privatePhotoSessionPhotos;
        const sessionToken = privatePhotoSessionToken;

        setIsPrivatePhotoViewerOpen(false);
        setIsPrivatePhotoConfirmOpen(false);
        setPrivatePhotoSessionToken(null);
        setPrivatePhotoSessionPhotos([]);
        setPrivatePhotoActiveIndex(0);
        setPrivatePhotoCloseAt(null);
        revokePrivatePhotoUrls(currentPhotos);

        if (!token || !sessionToken) {
            return;
        }

        try {
            const payload = await apiRequest<ApiEnvelope<{ closed_at: string | null; next_available_at: string | null }>>(
                `/private-photo-sessions/${sessionToken}/close`,
                {
                    method: 'POST',
                    token,
                    body: {
                        close_reason: closeReason,
                    },
                },
            );

            applyPrivatePhotoCooldown(unwrapData(payload).next_available_at);
        } catch {
            // The session may already be closed or expired; the local UI is already reset.
        }
    }, [applyPrivatePhotoCooldown, privatePhotoSessionPhotos, privatePhotoSessionToken, revokePrivatePhotoUrls, token]);

    useEffect(() => {
        return () => {
            revokePrivatePhotoUrls(privatePhotoSessionPhotos);
        };
    }, [privatePhotoSessionPhotos, revokePrivatePhotoUrls]);

    useEffect(() => {
        if (!isPrivatePhotoViewerOpen && !isPrivatePhotoConfirmOpen) {
            return;
        }

        const previousOverflow = document.body.style.overflow;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') {
                return;
            }

            if (isPrivatePhotoViewerOpen) {
                void closePrivatePhotoViewer('manual');
                return;
            }

            setIsPrivatePhotoConfirmOpen(false);
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState !== 'visible' && isPrivatePhotoViewerOpen) {
                void closePrivatePhotoViewer('tab_hidden');
            }
        };
        const handlePageHide = () => {
            if (isPrivatePhotoViewerOpen) {
                void closePrivatePhotoViewer('navigated');
            }
        };

        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKeyDown);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('pagehide', handlePageHide);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('pagehide', handlePageHide);
        };
    }, [closePrivatePhotoViewer, isPrivatePhotoConfirmOpen, isPrivatePhotoViewerOpen]);

    useEffect(() => {
        if (!isPrivatePhotoViewerOpen || privatePhotoCloseAt === null) {
            return;
        }

        const remainingMs = privatePhotoCloseAt - Date.now();

        if (remainingMs <= 0) {
            void closePrivatePhotoViewer('auto_hidden');
            return;
        }

        const timer = window.setTimeout(() => {
            void closePrivatePhotoViewer('auto_hidden');
        }, remainingMs);

        return () => {
            window.clearTimeout(timer);
        };
    }, [closePrivatePhotoViewer, isPrivatePhotoViewerOpen, privatePhotoCloseAt]);

    useEffect(() => {
        const nextPublicId = therapistDetail?.public_id ?? null;
        const previousPublicId = previousTherapistPublicIdRef.current;

        previousTherapistPublicIdRef.current = nextPublicId;

        if (previousPublicId === null || previousPublicId === nextPublicId) {
            return;
        }

        setIsPrivatePhotoConfirmOpen(false);

        if (isPrivatePhotoViewerOpen) {
            void closePrivatePhotoViewer('navigated');
        }
    }, [closePrivatePhotoViewer, isPrivatePhotoViewerOpen, therapistDetail?.public_id]);

    if (isBootstrapping) {
        return <LoadingScreen title="プロフィール準備中" message="待ち合わせ場所と公開情報を確認しています。" />;
    }

    if (isLoadingDetail && !therapistDetail) {
        return <LoadingScreen title="プロフィール読込中" message="タチキャストの詳細とレビューを取得しています。" />;
    }

    const profileSummary = therapistDetail ? [
        therapistDetail.height_cm != null ? String(therapistDetail.height_cm) : null,
        therapistDetail.weight_kg != null ? String(therapistDetail.weight_kg) : null,
        therapistDetail.age != null ? String(therapistDetail.age) : null,
        therapistDetail.p_size_cm != null ? `P${therapistDetail.p_size_cm}` : null,
    ].filter((value): value is string => value !== null).join(' / ') : '';
    const isSelfPreview = therapistDetail?.is_self_view ?? false;
    const privatePhotoSummary = therapistDetail?.private_photo_summary ?? null;
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
    const photoTrackBasePercent = photoSnapDirection === 1 ? -200 : photoSnapDirection === -1 ? 0 : -100;
    const pendingScheduledRequestLabel = formatPendingScheduledRequestLabel(
        pendingScheduledRequest?.scheduled_start_at ?? pendingScheduledRequest?.requested_start_at ?? null,
    );
    const privatePhotoCount = privatePhotoSessionPhotos.length;
    const wrappedPrivatePhotoIndex = wrapPhotoIndex(privatePhotoActiveIndex, privatePhotoCount);
    const activePrivatePhoto = privatePhotoSessionPhotos[wrappedPrivatePhotoIndex] ?? null;
    const compactTravelSummary = therapistDetail
        ? buildCompactTravelSummary(therapistDetail.travel_mode, therapistDetail.walking_time_range)
        : '到着目安は準備中';

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

    const handleShareButtonClick = async () => {
        if (!shareUrl) {
            showError('共有URLを作成できませんでした。');
            return;
        }

        try {
            await copyTextToClipboard(shareUrl);
            showSuccess('コピーしました。');
        } catch {
            showError('URLのコピーに失敗しました。');
        }
    };

    const handleFavoriteButtonClick = async () => {
        if (!therapistDetail || isTogglingFavorite) {
            return;
        }

        if (!isAuthenticated || !token) {
            navigate('/login');
            return;
        }

        setIsTogglingFavorite(true);

        try {
            const payload = await apiRequest<ApiEnvelope<{ is_favorited: boolean; favorite_count: number }>>(
                `/therapists/${therapistDetail.public_id}/favorite`,
                {
                    method: therapistDetail.is_favorited ? 'DELETE' : 'POST',
                    token,
                },
            );
            const next = unwrapData(payload);

            setTherapistDetail((current) => current
                ? {
                    ...current,
                    is_favorited: next.is_favorited,
                    favorite_count: next.favorite_count,
                }
                : current);
            showSuccess(next.is_favorited ? 'お気に入りに追加しました。' : 'お気に入りから外しました。');
        } catch (requestError) {
            showError(requestError instanceof ApiError
                ? requestError.message
                : 'お気に入りの更新に失敗しました。');
        } finally {
            setIsTogglingFavorite(false);
        }
    };

    const handlePrivatePhotoOpen = async () => {
        if (!token || !therapistDetail?.private_photo_summary?.can_view) {
            return;
        }

        let sessionToken: string | null = null;
        let nextAvailableAt: string | null = null;
        const loadedPhotos: PrivateViewerPhoto[] = [];

        setIsPrivatePhotoLoading(true);

        try {
            const payload = await apiRequest<ApiEnvelope<PrivatePhotoSession>>(
                `/therapists/${therapistDetail.public_id}/private-photo-sessions`,
                {
                    method: 'POST',
                    token,
                },
            );
            const session = unwrapData(payload);
            sessionToken = session.session_token;

            const fetchedPhotos = await Promise.all(
                session.photos.map(async (photo) => {
                    const result = await fetchPrivatePhotoBlob(session.session_token, photo.id, token);
                    nextAvailableAt ??= result.lockedUntil;

                    return {
                        id: photo.id,
                        sort_order: photo.sort_order,
                        url: result.url,
                    };
                }),
            );

            loadedPhotos.push(...fetchedPhotos);
            setPrivatePhotoSessionToken(session.session_token);
            setPrivatePhotoSessionPhotos(fetchedPhotos);
            setPrivatePhotoActiveIndex(0);
            setPrivatePhotoCloseAt(null);
            setIsPrivatePhotoConfirmOpen(false);
            setIsPrivatePhotoViewerOpen(true);
            applyPrivatePhotoCooldown(nextAvailableAt);
        } catch (requestError) {
            revokePrivatePhotoUrls(loadedPhotos);

            if (sessionToken) {
                try {
                    await apiRequest<null>(`/private-photo-sessions/${sessionToken}/close`, {
                        method: 'POST',
                        token,
                        body: {
                            close_reason: 'fetch_failed',
                        },
                    });
                } catch {
                    // Best-effort cleanup only.
                }
            }

            const message = requestError instanceof ApiError
                ? requestError.message
                : '非公開写真の表示に失敗しました。';

            showError(message);
        } finally {
            setIsPrivatePhotoLoading(false);
        }
    };

    const handlePrivatePhotoImageLoad = () => {
        if (privatePhotoCloseAt !== null) {
            return;
        }

        setPrivatePhotoCloseAt(Date.now() + 5000);
    };

    return (
        <div className="min-h-screen bg-[#f6f1e7] text-[#17202b]">
            <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-16 px-6 py-10 md:px-10 md:py-14 xl:gap-[60px] xl:px-0">
                <section className="rounded-[32px] bg-[linear-gradient(107deg,#17202b_3.49%,#1d2a39_53.96%,#27364a_93.62%)] px-6 py-5 shadow-[0_24px_60px_rgba(23,32,43,0.16)] md:px-8">
                    <StickyHeroHeader actions={headerActions} />
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
                                                <div className="flex items-start justify-between gap-3">
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
                                                    <button
                                                        type="button"
                                                        onClick={handleShareButtonClick}
                                                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#ddcfb4] bg-white text-[#17202b] shadow-[0_10px_24px_rgba(23,32,43,0.08)] transition hover:-translate-y-0.5 hover:bg-[#f8f2e8] focus:outline-none focus:ring-2 focus:ring-[#9a7a49] focus:ring-offset-2 focus:ring-offset-[#fffdf8]"
                                                        aria-label="この詳細ページのURLをコピーして共有"
                                                    >
                                                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                            <circle cx="18" cy="5" r="3" />
                                                            <circle cx="6" cy="12" r="3" />
                                                            <circle cx="18" cy="19" r="3" />
                                                            <path d="M8.7 10.7 15.3 6.3" />
                                                            <path d="m8.7 13.3 6.6 4.4" />
                                                        </svg>
                                                    </button>
                                                </div>
                                                {profileSummary ? (
                                                    <p className="text-sm font-medium tracking-wide text-[#68707a]">
                                                        {profileSummary}
                                                    </p>
                                                ) : null}
                                                <div className="flex flex-wrap items-center gap-2 pt-2 text-sm font-medium text-[#48505a]">
                                                    <span className="font-semibold text-[#17202b]">
                                                        ⭐️{therapistDetail.rating_average.toFixed(1)}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsReviewModalOpen(true)}
                                                        className="font-semibold text-[#17202b] underline decoration-[#c8b389] underline-offset-4 transition hover:text-[#8f5c22]"
                                                        aria-label={`レビュー${therapistDetail.review_count}件を表示`}
                                                    >
                                                        （{therapistDetail.review_count}）
                                                    </button>
                                                    <span className="text-[#b6a78f]">｜</span>
                                                    <span className="inline-flex items-center gap-1 font-semibold text-[#17202b]" aria-label={`保存${therapistDetail.favorite_count}件`}>
                                                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                            <path d="M6.5 4.75A2.25 2.25 0 0 1 8.75 2.5h6.5a2.25 2.25 0 0 1 2.25 2.25v16.1l-5.5-3.2-5.5 3.2V4.75Z" />
                                                        </svg>
                                                        {formatFavoriteCount(therapistDetail.favorite_count)}
                                                    </span>
                                                    <span className="text-[#b6a78f]">｜</span>
                                                    <span>{compactTravelSummary}</span>
                                                    <span className="text-[#b6a78f]">｜</span>
                                                    <span>キャンセル{therapistDetail.therapist_cancellation_count}回</span>
                                                </div>
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

                                        {!therapistDetail.is_self_view ? (
                                            <div className="rounded-[24px] bg-[#f6f1e7] p-4">
                                                <button
                                                    type="button"
                                                    onClick={handleFavoriteButtonClick}
                                                    disabled={isTogglingFavorite}
                                                    className={[
                                                        'inline-flex w-full min-h-12 items-center justify-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold shadow-[0_10px_24px_rgba(23,32,43,0.08)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#9a7a49] focus:ring-offset-2 focus:ring-offset-[#f6f1e7] disabled:cursor-not-allowed disabled:opacity-60',
                                                        therapistDetail.is_favorited
                                                            ? 'border-[#17202b] bg-[#17202b] text-white'
                                                            : 'border-[#ddcfb4] bg-white text-[#17202b] hover:bg-[#fffaf1]',
                                                    ].join(' ')}
                                                    aria-label={therapistDetail.is_favorited ? 'お気に入りから外す' : 'お気に入りに追加'}
                                                >
                                                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill={therapistDetail.is_favorited ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                        <path d="M6.5 4.75A2.25 2.25 0 0 1 8.75 2.5h6.5a2.25 2.25 0 0 1 2.25 2.25v16.1l-5.5-3.2-5.5 3.2V4.75Z" />
                                                    </svg>
                                                    {therapistDetail.is_favorited ? 'お気に入りから外す' : 'お気に入りに追加'}
                                                </button>
                                                <p className="mt-3 text-xs leading-5 text-[#68707a]">
                                                    お気に入りに追加すると、このタチキャストがオンラインになった時や空き枠を公開した時に通知を受け取れます。
                                                </p>
                                            </div>
                                        ) : null}

                                        {privatePhotoSummary ? (
                                            <article className="rounded-[28px] border border-[#e6dbc9] bg-[#fbf7f0] p-5">
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div>
                                                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">PRIVATE PHOTO</p>
                                                        <h2 className="mt-1 text-xl font-semibold text-[#17202b]">非公開写真</h2>
                                                    </div>
                                                    <span className="rounded-full bg-[#efe3cf] px-3 py-1 text-xs font-semibold text-[#6c5431]">
                                                        {privatePhotoSummary.count}枚
                                                    </span>
                                                </div>

                                                <div className="mt-4 overflow-hidden rounded-[24px] border border-[#eadfce] bg-[#d8c3a0]">
                                                    <div className="relative aspect-[4/3] bg-[radial-gradient(circle_at_top,#ead8bc_0%,#cfb18a_45%,#b58a56_100%)]">
                                                        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.22),rgba(23,32,43,0.18))]" />
                                                        <div className="absolute inset-0 backdrop-blur-[3px]" />
                                                        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                                                            <span className="rounded-full bg-[rgba(23,32,43,0.72)] px-4 py-2 text-xs font-semibold tracking-wide text-white">
                                                                本人確認済み会員限定
                                                            </span>
                                                            <p className="max-w-[24rem] text-sm leading-7 text-[#fffaf2]">
                                                                保存・共有・スクリーンショットは禁止です。表示時には透かしが入り、閲覧履歴が記録されます。
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="mt-4 space-y-3">
                                                    {privatePhotoSummary.can_view ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => setIsPrivatePhotoConfirmOpen(true)}
                                                            disabled={isPrivatePhotoLoading}
                                                            className="inline-flex w-full items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#223142] disabled:cursor-not-allowed disabled:opacity-60"
                                                        >
                                                            {isPrivatePhotoLoading ? '準備中...' : '表示する'}
                                                        </button>
                                                    ) : privatePhotoSummary.requires_login ? (
                                                        <Link
                                                            to={privatePhotoLoginPath}
                                                            className="inline-flex w-full items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#223142]"
                                                        >
                                                            ログインして表示条件を確認
                                                        </Link>
                                                    ) : privatePhotoSummary.requires_identity_verification ? (
                                                        <Link
                                                            to="/identity-verification"
                                                            className="inline-flex w-full items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#223142]"
                                                        >
                                                            本人確認を完了する
                                                        </Link>
                                                    ) : privatePhotoSummary.next_available_at ? (
                                                        <div className="rounded-[20px] border border-[#eadfce] bg-white px-4 py-4 text-sm leading-7 text-[#5f564a]">
                                                            <p className="font-semibold text-[#17202b]">表示は終了しました</p>
                                                            <p className="mt-2">
                                                                次回表示可能: {formatJstDateTime(privatePhotoSummary.next_available_at, {
                                                                    month: 'numeric',
                                                                    day: 'numeric',
                                                                    hour: '2-digit',
                                                                    minute: '2-digit',
                                                                }) ?? '確認中'}
                                                            </p>
                                                        </div>
                                                    ) : (
                                                        <div className="rounded-[20px] border border-[#eadfce] bg-white px-4 py-4 text-sm leading-7 text-[#5f564a]">
                                                            本人確認済み会員のみ、一定時間ごとに表示できます。
                                                        </div>
                                                    )}
                                                </div>
                                            </article>
                                        ) : null}
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
                                                            {isFreeMenu(menu) ? '無料' : `60分 ${formatCurrency(menu.hourly_rate_amount)}〜`}
                                                        </p>
                                                    </div>
                                                </div>
                                            </article>
                                        );
                                    })}
                                    </div>
                                </div>
                            </section>

                        </div>

                        <aside className="space-y-6">
                            <section className="rounded-[32px] bg-[#fffcf7] p-6 shadow-[0_10px_24px_rgba(23,32,43,0.08)] lg:sticky lg:top-6">
                                <div className="space-y-5">
                                    <div>
                                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">予約条件</p>
                                        <h2 className="mt-1 text-2xl font-semibold text-[#17202b]">この条件で予約を考える</h2>
                                    </div>

                                    {activeUserBookingCampaign ? (
                                        <div className="campaign-offer-float campaign-offer-banner-light rounded-[22px] p-4" style={{ animationDelay: '0.4s' }}>
                                            <p className="text-xs font-semibold tracking-wide text-[#9a661c]">期間限定キャンペーン適用中</p>
                                            <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                                {activeUserBookingCampaign.offer_text}
                                            </p>
                                            <p className="mt-2 text-xs leading-6 text-[#5d4724]">
                                                {activeUserBookingCampaign.benefit_summary}。見積もり確認画面で割引内訳が表示されます。
                                            </p>
                                        </div>
                                    ) : null}

                                    <div className="space-y-3 text-sm text-[#48505a]">
                                        <div className="rounded-[20px] bg-[#f6f1e7] p-4">
                                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">{DISCOVERY_BOOKING_TYPE_LABEL}</p>
                                            <div className="mt-3 flex flex-nowrap gap-2 text-sm font-semibold">
                                                {([
                                                    { value: 'now' as const, label: DISCOVERY_BOOKING_TYPE_OPTIONS.now },
                                                    { value: 'scheduled' as const, label: DISCOVERY_BOOKING_TYPE_OPTIONS.scheduled },
                                                ]).map((option) => (
                                                    <button
                                                        key={option.value}
                                                        type="button"
                                                        onClick={() => {
                                                            setSearchParams((previous) => {
                                                                const next = new URLSearchParams(previous);
                                                                next.set('start_type', option.value);

                                                                return next;
                                                            }, { replace: true });
                                                        }}
                                                        className={[
                                                            'whitespace-nowrap rounded-full px-3 py-1 transition',
                                                            selectedStartType === option.value
                                                                ? 'bg-[#17202b] text-white'
                                                                : 'bg-white text-[#17202b]',
                                                        ].join(' ')}
                                                    >
                                                        {option.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="rounded-[20px] bg-[#f6f1e7] p-4">
                                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">待ち合わせ場所</p>
                                            {selectedAddress ? (
                                                <label className="mt-2 block">
                                                    <span className="sr-only">待ち合わせ場所を選択</span>
                                                    <select
                                                        value={selectedAddressId ?? ''}
                                                        onChange={(event) => {
                                                            setSearchParams((previous) => {
                                                                const next = new URLSearchParams(previous);
                                                                next.set('service_address_id', event.target.value);

                                                                return next;
                                                            }, { replace: true });
                                                        }}
                                                        className="w-full rounded-[16px] border border-[#d8ccb9] bg-white px-4 py-3 text-sm font-semibold text-[#17202b] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] outline-none transition focus:border-[#c7a770] focus:ring-2 focus:ring-[#e2c998]"
                                                    >
                                                        {serviceAddresses.map((address) => (
                                                            <option key={address.public_id} value={address.public_id}>
                                                                {getServiceAddressLabel(address)}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                            ) : (
                                                <p className="mt-2 font-semibold text-[#17202b]">
                                                    {isAuthenticated ? '未設定' : 'ログイン後に指定'}
                                                </p>
                                            )}
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
                                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">到着時間</p>
                                            <p className="mt-2 font-semibold text-[#17202b]">
                                                {formatTravelTimeEstimate(
                                                    therapistDetail.travel_mode,
                                                    therapistDetail.walking_time_range,
                                                )}
                                            </p>
                                            <p className="mt-1 text-xs text-[#68707a]">
                                                選択した待ち合わせ場所を基準に、タチキャストの拠点からの移動時間目安を表示しています。
                                            </p>
                                        </div>

                                        {selectedStartType === 'now' ? (
                                            <>
                                                <div className="rounded-[20px] bg-[#f6f1e7] p-4">
                                                    <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">対応内容</p>
                                                    <div className="mt-3 space-y-2">
                                                        {therapistDetail.menus.map((menu) => (
                                                            <button
                                                                key={menu.public_id}
                                                                type="button"
                                                                onClick={() => {
                                                                    setSearchParams((previous) => {
                                                                        const next = new URLSearchParams(previous);
                                                                        next.set('therapist_menu_id', menu.public_id);
                                                                        next.set(
                                                                            'menu_duration_minutes',
                                                                            String(Math.max(selectedDurationMinutes, getMenuMinimumDurationMinutes(menu))),
                                                                        );

                                                                        return next;
                                                                    }, { replace: true });
                                                                }}
                                                                className={[
                                                                    'w-full rounded-[18px] border px-4 py-4 text-left transition',
                                                                    selectedMenu?.public_id === menu.public_id
                                                                        ? 'border-[#d2b179] bg-[#fff8ee]'
                                                                        : 'border-[#e8dfd2] bg-white hover:bg-[#fff9f1]',
                                                                ].join(' ')}
                                                            >
                                                                <div className="flex items-start justify-between gap-3">
                                                                    <div className="space-y-1">
                                                                        <p className="text-sm font-semibold text-[#17202b]">{menu.name}</p>
                                                                        <p className="text-xs text-[#68707a]">
                                                                            {formatMenuMinimumDurationLabel(menu)} / {formatMenuHourlyRateLabel(menu)}
                                                                        </p>
                                                                    </div>
                                                                    {selectedMenu?.public_id === menu.public_id ? (
                                                                        <span className="inline-flex shrink-0 whitespace-nowrap rounded-full bg-[#17202b] px-3 py-1 text-[11px] font-semibold text-white">
                                                                            選択中
                                                                        </span>
                                                                    ) : null}
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="rounded-[20px] bg-[#f6f1e7] p-4">
                                                    <label htmlFor="detail-request-duration" className="text-xs font-semibold tracking-wide text-[#9a7a49]">
                                                        希望時間
                                                    </label>
                                                    <select
                                                        id="detail-request-duration"
                                                        value={String(selectedDurationMinutes)}
                                                        onChange={(event) => {
                                                            setSearchParams((previous) => {
                                                                const next = new URLSearchParams(previous);
                                                                next.set('menu_duration_minutes', event.target.value);

                                                                return next;
                                                            }, { replace: true });
                                                        }}
                                                        className="mt-3 w-full rounded-[16px] border border-[#d8ccb9] bg-white px-4 py-3 text-sm font-semibold text-[#17202b] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] outline-none transition focus:border-[#c7a770] focus:ring-2 focus:ring-[#e2c998]"
                                                    >
                                                        {instantDurationOptions.map((duration) => (
                                                            <option key={duration} value={duration}>
                                                                {duration}分
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="rounded-[20px] border border-dashed border-[#dbcdb8] bg-[#fbf7f0] px-4 py-4 text-sm leading-7 text-[#6c6458]">
                                                日時指定では、次の画面で1週間分の空き時間を見ながら開始時刻と希望時間を選べます。
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-3">
                                        {!isSelfPreview && (therapistDetail.consultation_enabled || therapistDetail.existing_direct_message_id) && <Link to={therapistDetail.existing_direct_message_id ? `/user/direct-messages/${therapistDetail.existing_direct_message_id}` : `/user/direct-messages/new?therapist_id=${encodeURIComponent(therapistDetail.public_id)}`} className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#ddcfb4] px-5 py-3 text-sm font-semibold text-[#17202b]">{therapistDetail.existing_direct_message_id ? 'DMを開く' : '予約前に質問する'}</Link>}
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
                                        {!isSelfPreview && shouldBlockScheduledRequestWithoutAvailability ? (
                                            <div className="rounded-[20px] border border-[#e7d5b3] bg-[#fff8ec] p-4 text-sm leading-7 text-[#6f5a38]">
                                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">空き枠が未設定です</p>
                                                <p className="mt-2 font-semibold text-[#17202b]">
                                                    {scheduledAvailabilityUnavailableMessage}
                                                </p>
                                                <p className="mt-2 text-xs text-[#7d6852]">
                                                    空き枠が公開されるまでは、希望エリアや希望日時を添えて出張リクエストをご利用ください。
                                                </p>
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
                                                {primaryAction.onClick ? (
                                                    <button
                                                        type="button"
                                                        onClick={primaryAction.onClick}
                                                        aria-disabled={primaryAction.disabled || undefined}
                                                        className={[
                                                            'inline-flex w-full items-center justify-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-bold text-[#1a2430] shadow-[0_16px_30px_rgba(232,213,178,0.18)]',
                                                            primaryAction.disabled ? 'cursor-not-allowed opacity-60' : 'transition hover:brightness-105',
                                                        ].join(' ')}
                                                    >
                                                        {primaryAction.label}
                                                    </button>
                                                ) : (
                                                    <Link
                                                        to={primaryAction.to}
                                                        className="inline-flex w-full items-center justify-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-bold text-[#1a2430] transition hover:brightness-105"
                                                    >
                                                        {primaryAction.label}
                                                    </Link>
                                                )}
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

            {therapistDetail && isPrivatePhotoConfirmOpen ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(12,16,24,0.72)] px-4"
                    onClick={() => {
                        if (!isPrivatePhotoLoading) {
                            setIsPrivatePhotoConfirmOpen(false);
                        }
                    }}
                >
                    <div
                        className="w-full max-w-[520px] rounded-[28px] bg-[#fffdf8] p-6 shadow-[0_24px_60px_rgba(23,32,43,0.22)]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">PRIVATE PHOTO</p>
                        <h2 className="mt-2 text-2xl font-semibold text-[#17202b]">非公開写真を表示します。</h2>
                        <div className="mt-5 space-y-4 rounded-[24px] bg-[#f6f1e7] p-5 text-sm leading-7 text-[#48505a]">
                            <p>この写真は本人確認済み会員限定です。</p>
                            <p>
                                保存・共有・スクリーンショットは禁止です。
                                <br />
                                写真には透かしが表示され、閲覧履歴は記録されます。
                            </p>
                        </div>
                        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                            <button
                                type="button"
                                onClick={() => setIsPrivatePhotoConfirmOpen(false)}
                                disabled={isPrivatePhotoLoading}
                                className="inline-flex w-full items-center justify-center rounded-full border border-[#ddcfb4] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#f6f1e7] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                キャンセル
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    void handlePrivatePhotoOpen();
                                }}
                                disabled={isPrivatePhotoLoading}
                                className="inline-flex w-full items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#223142] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isPrivatePhotoLoading ? '準備中...' : '表示する'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {therapistDetail && isReviewModalOpen ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(12,16,24,0.72)] px-4 py-6"
                    onClick={() => setIsReviewModalOpen(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="therapist-review-modal-title"
                        className="w-full max-w-[760px] rounded-[28px] bg-[#fffdf8] p-6 shadow-[0_24px_60px_rgba(23,32,43,0.22)] md:p-8"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">REVIEWS</p>
                                <h2 id="therapist-review-modal-title" className="mt-2 text-2xl font-semibold text-[#17202b]">
                                    レビュー
                                </h2>
                                <p className="mt-2 text-sm text-[#68707a]">
                                    公開中の利用者レビューだけを表示しています。
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsReviewModalOpen(false)}
                                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#17202b] text-xl font-semibold text-white transition hover:bg-[#223142]"
                                aria-label="レビューを閉じる"
                            >
                                ×
                            </button>
                        </div>

                        <div className="mt-6 max-h-[70vh] space-y-4 overflow-y-auto pr-1">
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
                    </div>
                </div>
            ) : null}

            {isPrivatePhotoViewerOpen && activePrivatePhoto ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(12,16,24,0.92)] px-4 py-6"
                    onClick={() => {
                        void closePrivatePhotoViewer('manual');
                    }}
                >
                    <div
                        className="relative w-full max-w-[960px]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <button
                            type="button"
                            onClick={() => {
                                void closePrivatePhotoViewer('manual');
                            }}
                            className="absolute right-3 top-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[rgba(23,32,43,0.76)] text-xl font-semibold text-white transition hover:bg-[rgba(23,32,43,0.92)]"
                            aria-label="非公開写真を閉じる"
                        >
                            ×
                        </button>
                        <div className="overflow-hidden rounded-[28px] bg-[#111822] shadow-[0_24px_60px_rgba(0,0,0,0.36)]">
                            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 text-white">
                                <div>
                                    <p className="text-xs font-semibold tracking-wide text-[#d2b179]">PRIVATE PHOTO</p>
                                    <p className="mt-1 text-sm text-white/80">透かし入りの時限表示です</p>
                                </div>
                                {privatePhotoCount > 1 ? (
                                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
                                        {wrappedPrivatePhotoIndex + 1} / {privatePhotoCount}
                                    </span>
                                ) : null}
                            </div>
                            <div className="relative bg-[#0f1620]">
                                <div className="flex max-h-[80vh] min-h-[320px] items-center justify-center">
                                    <img
                                        src={activePrivatePhoto.url}
                                        alt={`${therapistDetail?.public_name ?? 'タチキャスト'}の非公開写真 ${wrappedPrivatePhotoIndex + 1}`}
                                        className="max-h-[80vh] w-full object-contain"
                                        draggable={false}
                                        onLoad={handlePrivatePhotoImageLoad}
                                    />
                                </div>
                                {privatePhotoCount > 1 ? (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => setPrivatePhotoActiveIndex((current) => wrapPhotoIndex(current - 1, privatePhotoCount))}
                                            className="absolute left-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[rgba(23,32,43,0.76)] text-xl font-semibold text-white transition hover:bg-[rgba(23,32,43,0.92)]"
                                            aria-label="前の非公開写真へ"
                                        >
                                            ‹
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPrivatePhotoActiveIndex((current) => wrapPhotoIndex(current + 1, privatePhotoCount))}
                                            className="absolute right-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[rgba(23,32,43,0.76)] text-xl font-semibold text-white transition hover:bg-[rgba(23,32,43,0.92)]"
                                            aria-label="次の非公開写真へ"
                                        >
                                            ›
                                        </button>
                                    </>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

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

            <BannerPlacementSection placement="therapist_detail" className="pb-12" />

            <DiscoveryFooter
                domain={serviceMeta?.domain ?? 'sugutachi.com'}
                description={isAuthenticated
                    ? 'プロフィール、料金、レビューを確認したうえで、空き時間や予約導線へ進めます。'
                    : 'プロフィールとレビューは公開で確認でき、空き時間確認と予約導線はログイン後に続けられます。'}
                primaryAction={primaryAction}
                secondaryAction={secondaryAction}
            />
        </div>
    );
}
