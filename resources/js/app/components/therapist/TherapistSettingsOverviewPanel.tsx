import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useToastOnMessage } from '../../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../../lib/api';
import {
    formatDateTime,
    formatIdentityVerificationStatus,
    formatStripeRequirementField,
    formatStripeStatus,
} from '../../lib/therapist';
import type {
    ApiEnvelope,
    AppNotificationRecord,
    NotificationListMeta,
    StripeConnectedAccountStatus,
    TherapistBookingSettingRecord,
    TherapistProfileRecord,
    TherapistReviewStatus,
} from '../../lib/types';

function onlineStatusLabel(profile: TherapistProfileRecord | null): string {
    if (!profile) {
        return '確認中';
    }

    if (profile.profile_status !== 'approved') {
        return '公開準備中';
    }

    if (!profile.is_listed) {
        return '非公開';
    }

    return profile.is_online ? '今すぐ受付中' : '公開中';
}

function onlineStatusTone(profile: TherapistProfileRecord | null): string {
    if (!profile) {
        return 'bg-[#f1efe8] text-[#48505a]';
    }

    if (profile.profile_status !== 'approved') {
        return 'bg-[#fff2dd] text-[#8b5a16]';
    }

    if (!profile.is_listed) {
        return 'bg-[#f3ece4] text-[#6a5642]';
    }

    return profile.is_online
        ? 'bg-[#e9f4ea] text-[#24553a]'
        : 'bg-[#eaf2ff] text-[#30527a]';
}

function formatRequirementCount(status: TherapistReviewStatus | null): string {
    if (!status) {
        return '確認中';
    }

    const total = status.requirements.length;
    const completed = status.requirements.filter((requirement) => requirement.is_satisfied).length;

    return `${completed} / ${total} 項目`;
}

function formatTravelMode(value: TherapistBookingSettingRecord['travel_mode'] | null | undefined): string {
    switch (value) {
        case 'bicycle':
            return '自転車';
        case 'transit':
            return '公共交通機関';
        case 'car':
            return '車';
        default:
            return '徒歩';
    }
}

export function TherapistSettingsOverviewPanel() {
    const { token } = useAuth();
    const [profile, setProfile] = useState<TherapistProfileRecord | null>(null);
    const [reviewStatus, setReviewStatus] = useState<TherapistReviewStatus | null>(null);
    const [stripeStatus, setStripeStatus] = useState<StripeConnectedAccountStatus | null>(null);
    const [bookingSetting, setBookingSetting] = useState<TherapistBookingSettingRecord | null>(null);
    const [notifications, setNotifications] = useState<AppNotificationRecord[]>([]);
    const [notificationMeta, setNotificationMeta] = useState<NotificationListMeta | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isUpdatingOnline, setIsUpdatingOnline] = useState(false);
    const [isUpdatingListing, setIsUpdatingListing] = useState(false);
    const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);
    useToastOnMessage(error, 'error');
    useToastOnMessage(successMessage, 'success');

    const loadData = useCallback(async (refresh = false) => {
        if (!token) {
            return;
        }

        if (refresh) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }

        try {
            const [profilePayload, reviewPayload, stripePayload, bookingPayload, notificationPayload] = await Promise.all([
                apiRequest<ApiEnvelope<TherapistProfileRecord>>('/me/therapist-profile', { token }),
                apiRequest<ApiEnvelope<TherapistReviewStatus>>('/me/therapist-profile/review-status', { token }),
                apiRequest<ApiEnvelope<StripeConnectedAccountStatus>>('/me/stripe-connect', { token }),
                apiRequest<ApiEnvelope<TherapistBookingSettingRecord>>('/me/therapist/scheduled-booking-settings', { token }),
                apiRequest<{ data: AppNotificationRecord[]; meta: NotificationListMeta }>('/notifications?limit=8', { token }),
            ]);

            setProfile(unwrapData(profilePayload));
            setReviewStatus(unwrapData(reviewPayload));
            setStripeStatus(unwrapData(stripePayload));
            setBookingSetting(unwrapData(bookingPayload));
            setNotifications(notificationPayload.data);
            setNotificationMeta(notificationPayload.meta ?? null);
            setError(null);
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '設定情報の取得に失敗しました。';

            setError(message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [token]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const unreadNotifications = notificationMeta?.unread_count ?? notifications.filter((notification) => !notification.is_read).length;
    const activeStripeRequirements = stripeStatus?.requirements_currently_due ?? [];
    const canGoOnline = Boolean(profile?.profile_status === 'approved' && profile.is_listed && !profile.is_online);
    const canGoOffline = Boolean(profile?.is_online);
    const canListProfile = Boolean(profile?.profile_status === 'approved' && !profile.is_listed);
    const canHideProfile = Boolean(profile?.profile_status === 'approved' && profile.is_listed);
    const canShowLocationTools = Boolean(profile?.is_online);
    const currentLocation = profile?.location ?? null;
    const currentLocationMapSrc = useMemo(() => {
        if (!currentLocation) {
            return null;
        }

        return `https://maps.google.com/maps?q=${currentLocation.lat},${currentLocation.lng}&z=15&output=embed`;
    }, [currentLocation]);

    const summary = useMemo(() => ({
        online: onlineStatusLabel(profile),
        unreadNotifications,
        reviewProgress: formatRequirementCount(reviewStatus),
        stripe: formatStripeStatus(stripeStatus?.status),
    }), [profile, reviewStatus, stripeStatus, unreadNotifications]);

    async function updateListingState(isListed: boolean) {
        if (!token) {
            return;
        }

        setIsUpdatingListing(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<TherapistProfileRecord>>('/me/therapist/listing', {
                method: 'PUT',
                token,
                body: {
                    is_listed: isListed,
                },
            });

            setProfile(unwrapData(payload));
            setSuccessMessage(isListed ? 'プロフィールを公開しました。' : 'プロフィールを非公開にしました。');
            await loadData(true);
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '公開設定の更新に失敗しました。';

            setError(message);
        } finally {
            setIsUpdatingListing(false);
        }
    }

    async function updateOnlineState(nextState: 'online' | 'offline') {
        if (!token || !profile) {
            return;
        }

        setIsUpdatingOnline(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<TherapistProfileRecord>>(
                nextState === 'online' ? '/me/therapist/online' : '/me/therapist/offline',
                {
                    method: 'POST',
                    token,
                },
            );

            setProfile(unwrapData(payload));
            setSuccessMessage(nextState === 'online' ? '今すぐ受付を開始しました。' : '今すぐ受付を停止しました。');
            await loadData(true);
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '稼働状態の更新に失敗しました。';

            setError(message);
        } finally {
            setIsUpdatingOnline(false);
        }
    }

    async function updateCurrentLocation(options?: { suppressSuccessMessage?: boolean; refresh?: boolean }) {
        if (!token) {
            return false;
        }

        if (!navigator.geolocation) {
            setError('このブラウザでは現在地取得に対応していません。');
            return false;
        }

        const suppressSuccessMessage = options?.suppressSuccessMessage ?? false;
        const refresh = options?.refresh ?? true;

        setIsUpdatingLocation(true);
        setError(null);

        if (!suppressSuccessMessage) {
            setSuccessMessage(null);
        }

        try {
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 10000,
                });
            });

            const payload = await apiRequest<ApiEnvelope<TherapistProfileRecord>>('/me/therapist/location', {
                method: 'PUT',
                token,
                body: {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy_m: Math.round(position.coords.accuracy),
                    source: 'browser',
                },
            });

            setProfile(unwrapData(payload));
            if (!suppressSuccessMessage) {
                setSuccessMessage('現在地を更新しました。今すぐ受付の検索にも使われます。');
            }
            if (refresh) {
                await loadData(true);
            }
            return true;
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : requestError && typeof requestError === 'object' && 'code' in requestError
                    ? '現在地の取得に失敗しました。位置情報の許可設定をご確認ください。'
                    : '現在地の更新に失敗しました。';

            setError(message);
            return false;
        } finally {
            setIsUpdatingLocation(false);
        }
    }

    async function enableOnlineReception() {
        if (!profile) {
            return;
        }

        const locationUpdated = await updateCurrentLocation({
            suppressSuccessMessage: true,
            refresh: false,
        });

        if (!locationUpdated) {
            return;
        }

        await updateOnlineState('online');
    }

    return (
        <div id="settings-overview" className="space-y-6">
            {isLoading ? (
                <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_16px_34px_rgba(2,6,23,0.14)]">
                    <p className="text-sm font-semibold text-white">設定情報を読み込み中です。</p>
                    <p className="mt-2 text-sm leading-7 text-slate-300">
                        公開状態、今すぐ受付、受取設定をまとめています。
                    </p>
                </section>
            ) : (
                <>
                    <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">公開と受付</p>
                                <h2 className="mt-2 text-2xl font-semibold text-[#17202b]">公開プロフィールと今すぐ受付</h2>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${onlineStatusTone(profile)}`}>
                                    {onlineStatusLabel(profile)}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        void loadData(true);
                                    }}
                                    disabled={isRefreshing}
                                    className="inline-flex items-center rounded-full border border-[#d9c9ae] px-4 py-2 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff6ea] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isRefreshing ? '更新中...' : '更新'}
                                </button>
                            </div>
                        </div>

                        <div className="mt-6 grid gap-4">
                            <div className="rounded-[24px] bg-[#fffaf3] p-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="space-y-2">
                                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">プロフィールの公開</p>
                                        <p className="text-base font-semibold text-[#17202b]">{profile?.is_listed ? '公開中' : '非公開'}</p>
                                        <p className="text-sm leading-7 text-[#68707a]">
                                            公開中は利用者にプロフィールが表示されます。今すぐ受付を止めても、予定予約の案内は継続できます。
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={profile?.is_listed ?? false}
                                        aria-label="プロフィール公開を切り替える"
                                        onClick={() => {
                                            if (isUpdatingListing || !profile) {
                                                return;
                                            }

                                            if (profile.is_listed && canHideProfile) {
                                                void updateListingState(false);
                                                return;
                                            }

                                            if (!profile.is_listed && canListProfile) {
                                                void updateListingState(true);
                                            }
                                        }}
                                        disabled={isUpdatingListing || (!profile?.is_listed && !canListProfile) || (Boolean(profile?.is_listed) && !canHideProfile)}
                                        className={[
                                            'relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-60',
                                            profile?.is_listed
                                                ? 'border-[#17202b] bg-[#17202b]'
                                                : 'border-[#d8c6a8] bg-[#efe3cf]',
                                        ].join(' ')}
                                    >
                                        <span
                                            className={[
                                                'inline-block h-6 w-6 rounded-full bg-white shadow-sm transition',
                                                profile?.is_listed ? 'translate-x-7' : 'translate-x-1',
                                            ].join(' ')}
                                        />
                                    </button>
                                </div>
                            </div>

                            <div className="rounded-[24px] bg-[#fffaf3] p-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="space-y-2">
                                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">今すぐ受付</p>
                                        <p className="text-base font-semibold text-[#17202b]">{profile?.is_online ? '受付中' : '停止中'}</p>
                                        <p className="text-sm leading-7 text-[#68707a]">
                                            オンにすると現在地を更新したうえで、利用者の「今すぐ」検索に表示されます。
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={profile?.is_online ?? false}
                                        aria-label="今すぐ受付を切り替える"
                                        onClick={() => {
                                            if (isUpdatingOnline || isUpdatingLocation || !profile) {
                                                return;
                                            }

                                            if (profile.is_online) {
                                                void updateOnlineState('offline');
                                                return;
                                            }

                                            if (canGoOnline) {
                                                void enableOnlineReception();
                                            }
                                        }}
                                        disabled={isUpdatingOnline || isUpdatingLocation || (!profile?.is_online && !canGoOnline) || (Boolean(profile?.is_online) && !canGoOffline)}
                                        className={[
                                            'relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-60',
                                            profile?.is_online
                                                ? 'border-[#17202b] bg-[#17202b]'
                                                : 'border-[#d8c6a8] bg-[#efe3cf]',
                                        ].join(' ')}
                                    >
                                        <span
                                            className={[
                                                'inline-block h-6 w-6 rounded-full bg-white shadow-sm transition',
                                                profile?.is_online ? 'translate-x-7' : 'translate-x-1',
                                            ].join(' ')}
                                        />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {canShowLocationTools ? (
                            <div className="mt-6 rounded-[24px] border border-[#ead8b8] bg-[#fff8ec] p-5">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="space-y-2">
                                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">現在地の更新</p>
                                        <p className="text-base font-semibold text-[#17202b]">{formatDateTime(profile?.last_location_updated_at)}</p>
                                        <p className="text-sm leading-7 text-[#68707a]">
                                            今すぐ受付に使う検索位置です。出動場所が変わったときは、ここで更新してください。
                                        </p>
                                        {currentLocation ? (
                                            <p className="text-xs text-[#68707a]">
                                                緯度 {currentLocation.lat.toFixed(6)} / 経度 {currentLocation.lng.toFixed(6)}
                                            </p>
                                        ) : null}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            void updateCurrentLocation();
                                        }}
                                        disabled={isUpdatingLocation}
                                        className="inline-flex items-center self-start rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff1da] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {isUpdatingLocation ? '取得中...' : '現在地を更新'}
                                    </button>
                                </div>

                                {currentLocationMapSrc ? (
                                    <div className="mt-5 overflow-hidden rounded-[24px] border border-[#ead8b8] bg-white">
                                        <iframe
                                            title="現在地マップ"
                                            src={currentLocationMapSrc}
                                            className="h-[280px] w-full border-0"
                                            loading="lazy"
                                            referrerPolicy="no-referrer-when-downgrade"
                                        />
                                    </div>
                                ) : (
                                    <div className="mt-5 rounded-[24px] border border-dashed border-[#ead8b8] bg-white p-5">
                                        <p className="text-sm font-semibold text-[#17202b]">現在地はまだ反映されていません。</p>
                                        <p className="mt-2 text-sm leading-7 text-[#68707a]">
                                            位置情報の取得に成功すると、ここにマップが表示されます。
                                        </p>
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </section>

                    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {[
                            { label: '公開状態', value: summary.online, hint: '公開と受付の現在地' },
                            { label: '未読通知', value: `${summary.unreadNotifications}件`, hint: 'アプリ内通知の未読数' },
                            { label: '公開条件', value: summary.reviewProgress, hint: '公開に必要な項目の充足数' },
                            { label: '受取設定', value: summary.stripe, hint: '受取口座の準備状況' },
                        ].map((item) => (
                            <article
                                key={item.label}
                                className="rounded-[24px] border border-white/10 bg-white/5 p-5 shadow-[0_12px_28px_rgba(15,23,42,0.08)]"
                            >
                                <p className="text-xs font-semibold tracking-wide text-[#d2b179]">{item.label}</p>
                                <p className="mt-3 text-2xl font-semibold text-white">{item.value}</p>
                                <p className="mt-2 text-sm leading-6 text-slate-300">{item.hint}</p>
                            </article>
                        ))}
                    </section>

                    <section className="space-y-6">
                        <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                            <div>
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">公開前チェック</p>
                                <h2 className="mt-2 text-2xl font-semibold text-[#17202b]">準備状況の要点</h2>
                            </div>

                            <div className="mt-5 grid gap-4 md:grid-cols-2">
                                <div className="rounded-[24px] bg-[#fffaf3] p-4">
                                    <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">本人確認</p>
                                    <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                        {formatIdentityVerificationStatus(reviewStatus?.latest_identity_verification_status)}
                                    </p>
                                    <Link
                                        to="/therapist/identity-verification"
                                        className="mt-4 inline-flex text-sm font-semibold text-[#8f5c22] hover:text-[#6f4718]"
                                    >
                                        本人確認を開く
                                    </Link>
                                </div>

                                <div className="rounded-[24px] bg-[#fffaf3] p-4">
                                    <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">受取設定</p>
                                    <p className="mt-2 text-sm font-semibold text-[#17202b]">{formatStripeStatus(stripeStatus?.status)}</p>
                                    <p className="mt-2 text-sm leading-7 text-[#68707a]">
                                        {stripeStatus?.is_payout_ready ? '出金申請まで進める状態です。' : '口座情報の追加入力が必要です。'}
                                    </p>
                                    <Link
                                        to="/therapist/stripe-connect"
                                        className="mt-4 inline-flex text-sm font-semibold text-[#8f5c22] hover:text-[#6f4718]"
                                    >
                                        受取設定を開く
                                    </Link>
                                </div>

                                <div className="rounded-[24px] bg-[#fffaf3] p-4">
                                    <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">予定予約の準備</p>
                                    <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                        {bookingSetting?.has_scheduled_base_location ? '出動拠点あり' : '出動拠点未設定'}
                                    </p>
                                    <p className="mt-2 text-sm leading-7 text-[#68707a]">
                                        受付締切 {bookingSetting?.booking_request_lead_time_minutes ? `${bookingSetting.booking_request_lead_time_minutes}分前まで` : '未設定'}
                                        <br />
                                        {formatTravelMode(bookingSetting?.travel_mode)} / {bookingSetting?.max_travel_minutes ?? 120}分以内
                                    </p>
                                    <Link
                                        to="/therapist/availability"
                                        className="mt-4 inline-flex text-sm font-semibold text-[#8f5c22] hover:text-[#6f4718]"
                                    >
                                        空き枠設定を開く
                                    </Link>
                                </div>

                                <div className="rounded-[24px] bg-[#fffaf3] p-4">
                                    <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">公開条件</p>
                                    <p className="mt-2 text-sm font-semibold text-[#17202b]">{formatRequirementCount(reviewStatus)}</p>
                                    <p className="mt-2 text-sm leading-7 text-[#68707a]">
                                        {reviewStatus?.can_submit ? '必要項目が揃っています。' : 'まだ埋める項目があります。'}
                                    </p>
                                    <Link
                                        to="/therapist/onboarding"
                                        className="mt-4 inline-flex text-sm font-semibold text-[#8f5c22] hover:text-[#6f4718]"
                                    >
                                        準備状況を開く
                                    </Link>
                                </div>
                            </div>

                            {activeStripeRequirements.length > 0 ? (
                                <section className="mt-5 rounded-[24px] border border-[#e5d7c0] bg-[#fffaf3] p-5">
                                    <p className="text-sm font-semibold text-[#17202b]">受取設定で追加入力が必要な項目</p>
                                    <ul className="mt-3 grid gap-2 text-sm text-[#68707a]">
                                        {activeStripeRequirements.slice(0, 6).map((requirement) => (
                                            <li key={requirement}>- {formatStripeRequirementField(requirement)}</li>
                                        ))}
                                    </ul>
                                </section>
                            ) : null}
                        </article>
                    </section>
                </>
            )}
        </div>
    );
}
