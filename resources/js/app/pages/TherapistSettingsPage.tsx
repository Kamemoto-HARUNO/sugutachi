import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatNotificationTypeLabel } from '../lib/notifications';
import {
    formatDateTime,
    formatIdentityVerificationStatus,
    formatProfileStatus,
    formatStripeRequirementField,
    formatStripeStatus,
} from '../lib/therapist';
import type {
    AppNotificationRecord,
    ApiEnvelope,
    NotificationListMeta,
    StripeConnectedAccountStatus,
    TherapistBookingSettingRecord,
    TherapistProfileRecord,
    TherapistReviewStatus,
} from '../lib/types';

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

    return profile.is_online ? '受付中' : '公開中';
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

function buildNotificationHint(notification: AppNotificationRecord): string {
    if (notification.notification_type === 'travel_request_received') {
        return '需要通知として届いたメッセージです。必要に応じて出張リクエスト一覧で確認します。';
    }

    if (notification.notification_type === 'travel_request_warning' || notification.notification_type === 'travel_request_restricted') {
        return '運営からの注意・制限に関する通知です。内容を確認してから利用を続けてください。';
    }

    return notification.body;
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

export function TherapistSettingsPage() {
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
    const [markingNotificationId, setMarkingNotificationId] = useState<number | null>(null);

    usePageTitle('稼働設定');
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
            setSuccessMessage(isListed
                ? 'プロフィールを公開しました。'
                : 'プロフィールを非公開にしました。');
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
            setSuccessMessage(nextState === 'online'
                ? 'オンライン受付を開始しました。'
                : 'オンライン受付を停止しました。');
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

    async function updateCurrentLocation() {
        if (!token) {
            return;
        }

        if (!navigator.geolocation) {
            setError('このブラウザでは現在地取得に対応していません。');
            return;
        }

        setIsUpdatingLocation(true);
        setError(null);
        setSuccessMessage(null);

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
            setSuccessMessage('現在地を更新しました。オンライン受付の準備にも使われます。');
            await loadData(true);
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : requestError && typeof requestError === 'object' && 'code' in requestError
                    ? '現在地の取得に失敗しました。位置情報の許可設定をご確認ください。'
                    : '現在地の更新に失敗しました。';

            setError(message);
        } finally {
            setIsUpdatingLocation(false);
        }
    }

    async function markNotificationRead(notification: AppNotificationRecord) {
        if (!token || notification.is_read) {
            return;
        }

        setMarkingNotificationId(notification.id);
        setError(null);

        try {
            await apiRequest<ApiEnvelope<AppNotificationRecord>>(`/notifications/${notification.id}/read`, {
                method: 'POST',
                token,
            });

            await loadData(true);
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '通知の既読更新に失敗しました。';

            setError(message);
        } finally {
            setMarkingNotificationId(null);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="設定を読み込み中" message="稼働状態、現在地、通知の状況をまとめています。" />;
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[32px] bg-[linear-gradient(117deg,#17202b_0%,#243447_52%,#2b4158_100%)] p-7 text-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">設定</p>
                        <div className="space-y-2">
                            <h1 className="text-3xl font-semibold">稼働設定</h1>
                            <p className="max-w-3xl text-sm leading-7 text-slate-300">
                                公開・非公開の切り替え、オンライン受付の開始、現在地の更新、最近の通知確認をまとめた画面です。
                                公開プロフィールの見え方と出動準備をここで調整できます。
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                void loadData(true);
                            }}
                            disabled={isRefreshing}
                            className="inline-flex items-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isRefreshing ? '更新中...' : '更新'}
                        </button>
                        <Link
                            to="/therapist/onboarding"
                            className="inline-flex items-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8"
                        >
                            準備状況へ
                        </Link>
                    </div>
                </div>
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

            <section className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(360px,0.88fr)]">
                <div className="space-y-6">
                    <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">公開と受付</p>
                                <h2 className="mt-2 text-2xl font-semibold text-[#17202b]">公開プロフィールとオンライン状態</h2>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${onlineStatusTone(profile)}`}>
                                {onlineStatusLabel(profile)}
                            </span>
                        </div>

                        <div className="mt-5 grid gap-4 md:grid-cols-3">
                            <div className="rounded-[24px] bg-[#fffaf3] p-4">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">公開プロフィール</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">{formatProfileStatus(profile?.profile_status)}</p>
                                <p className="mt-2 text-sm leading-7 text-[#68707a]">
                                    本人確認・年齢確認と必須情報が揃うと公開できます。非公開にすると検索や詳細ページには表示されません。
                                </p>
                            </div>

                            <div className="rounded-[24px] bg-[#fffaf3] p-4">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">公開設定</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">{profile?.is_listed ? '公開中' : '非公開'}</p>
                                <p className="mt-2 text-sm leading-7 text-[#68707a]">
                                    公開中は利用者にプロフィールが表示されます。今すぐ受付を止めても、予定予約の案内は継続できます。
                                </p>
                            </div>

                            <div className="rounded-[24px] bg-[#fffaf3] p-4">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">現在地の更新</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">{formatDateTime(profile?.last_location_updated_at)}</p>
                                <p className="mt-2 text-sm leading-7 text-[#68707a]">
                                    オンライン受付には検索に使える現在地が必要です。出動前に更新しておくと安心です。
                                </p>
                            </div>
                        </div>

                        <div className="mt-5 flex flex-wrap gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    void updateListingState(true);
                                }}
                                disabled={!canListProfile || isUpdatingListing}
                                className="inline-flex items-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#223243] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isUpdatingListing && canListProfile ? '切り替え中...' : 'プロフィールを公開する'}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    void updateListingState(false);
                                }}
                                disabled={!canHideProfile || isUpdatingListing}
                                className="inline-flex items-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff6ea] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isUpdatingListing && canHideProfile ? '切り替え中...' : 'プロフィールを非公開にする'}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    void updateOnlineState('online');
                                }}
                                disabled={!canGoOnline || isUpdatingOnline}
                                className="inline-flex items-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#223243] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isUpdatingOnline && canGoOnline ? '切り替え中...' : 'オンライン受付を開始'}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    void updateOnlineState('offline');
                                }}
                                disabled={!canGoOffline || isUpdatingOnline}
                                className="inline-flex items-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff6ea] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isUpdatingOnline && canGoOffline ? '切り替え中...' : 'オンライン受付を停止'}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    void updateCurrentLocation();
                                }}
                                disabled={isUpdatingLocation}
                                className="inline-flex items-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff6ea] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isUpdatingLocation ? '取得中...' : '現在地を更新'}
                            </button>
                        </div>
                    </article>

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
                </div>

                <div className="space-y-6">
                    <article className="rounded-[28px] border border-white/10 bg-white/5 p-6">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-xs font-semibold tracking-wide text-[#d2b179]">通知</p>
                                <h2 className="mt-2 text-2xl font-semibold text-white">最近の連絡</h2>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-slate-200">
                                    未読 {unreadNotifications}件
                                </span>
                                <Link
                                    to="/notifications"
                                    className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:bg-white/6"
                                >
                                    通知一覧へ
                                </Link>
                            </div>
                        </div>

                        {notifications.length > 0 ? (
                            <div className="mt-5 grid gap-3">
                                {notifications.map((notification) => (
                                    <article key={notification.id} className="rounded-[22px] border border-white/10 bg-[#17202b] p-4">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="space-y-2">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                                        notification.is_read
                                                            ? 'bg-white/10 text-slate-300'
                                                            : 'bg-[#f6e7cb] text-[#17202b]'
                                                    }`}>
                                                        {notification.is_read ? '既読' : '未読'}
                                                    </span>
                                                    <span className="text-xs text-slate-400">{formatNotificationTypeLabel(notification.notification_type)}</span>
                                                </div>
                                                <p className="text-sm font-semibold text-white">{notification.title}</p>
                                                <p className="text-sm leading-7 text-slate-300">{buildNotificationHint(notification)}</p>
                                                <p className="text-xs text-slate-400">受信 {formatDateTime(notification.sent_at ?? notification.created_at)}</p>
                                            </div>

                                            {!notification.is_read ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        void markNotificationRead(notification);
                                                    }}
                                                    disabled={markingNotificationId === notification.id}
                                                    className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-60"
                                                >
                                                    {markingNotificationId === notification.id ? '更新中...' : '既読にする'}
                                                </button>
                                            ) : null}
                                        </div>
                                    </article>
                                ))}
                            </div>
                        ) : (
                            <div className="mt-5 rounded-[24px] border border-dashed border-white/10 bg-[#17202b] p-6 text-center">
                                <p className="text-sm font-semibold text-white">まだ通知はありません。</p>
                                <p className="mt-2 text-sm leading-7 text-slate-300">
                                    出張リクエストや運営連絡が届くと、この画面でまとめて確認できます。
                                </p>
                            </div>
                        )}
                    </article>

                    <article className="rounded-[28px] border border-white/10 bg-white/5 p-6">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">次に開く場所</p>
                        <div className="mt-4 grid gap-3">
                            <Link
                                to="/therapist/profile"
                                className="rounded-[22px] border border-white/10 bg-[#17202b] px-4 py-4 transition hover:bg-[#1d2a36]"
                            >
                                <p className="text-sm font-semibold text-white">プロフィールを整える</p>
                                <p className="mt-2 text-sm leading-6 text-slate-300">公開名、紹介文、写真、メニューの見直しに進みます。</p>
                            </Link>
                            <Link
                                to="/therapist/travel-requests"
                                className="rounded-[22px] border border-white/10 bg-[#17202b] px-4 py-4 transition hover:bg-[#1d2a36]"
                            >
                                <p className="text-sm font-semibold text-white">出張リクエストを見る</p>
                                <p className="mt-2 text-sm leading-6 text-slate-300">需要が集まっているエリアや未読通知の元を確認できます。</p>
                            </Link>
                            <Link
                                to="/therapist/balance"
                                className="rounded-[22px] border border-white/10 bg-[#17202b] px-4 py-4 transition hover:bg-[#1d2a36]"
                            >
                                <p className="text-sm font-semibold text-white">売上と出金を確認する</p>
                                <p className="mt-2 text-sm leading-6 text-slate-300">受取口座の準備状況や出金申請の進み具合を見直せます。</p>
                            </Link>
                        </div>
                    </article>
                </div>
            </section>
        </div>
    );
}
