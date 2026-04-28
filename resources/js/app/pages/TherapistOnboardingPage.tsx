import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import {
    formatDateTime,
    formatIdentityVerificationStatus,
    formatProfileStatus,
    formatRejectionReason,
    formatStripeRequirementField,
    formatStripeStatus,
    formatTherapistRequirementKey,
} from '../lib/therapist';
import type {
    ApiEnvelope,
    IdentityVerificationRecord,
    StripeConnectedAccountStatus,
    TherapistAvailabilitySlotRecord,
    TherapistBookingSettingRecord,
    TherapistPricingRuleRecord,
    TherapistReviewRequirement,
    TherapistReviewStatus,
} from '../lib/types';

interface SetupStep {
    key: string;
    title: string;
    description: string;
    value: string;
    isComplete: boolean;
    to: string;
    actionLabel: string;
}

function statusTone(isComplete: boolean): string {
    return isComplete
        ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
        : 'border-amber-300/30 bg-amber-300/10 text-amber-100';
}

function badgeClassName(isComplete: boolean): string {
    return `inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(isComplete)}`;
}

function photoReviewLabel(status: string | null | undefined): string {
    switch (status) {
        case 'approved':
            return '公開中';
        case 'pending':
            return '確認中';
        case 'rejected':
            return '非公開';
        default:
            return '未提出';
    }
}

function leadTimeLabel(minutes: number | null | undefined): string {
    if (!minutes) {
        return '未設定';
    }

    if (minutes % 60 === 0) {
        return `${minutes / 60}時間前まで`;
    }

    return `${minutes}分前まで`;
}

export function TherapistOnboardingPage() {
    const { token } = useAuth();
    const [reviewStatus, setReviewStatus] = useState<TherapistReviewStatus | null>(null);
    const [stripeStatus, setStripeStatus] = useState<StripeConnectedAccountStatus | null>(null);
    const [identityVerification, setIdentityVerification] = useState<IdentityVerificationRecord | null>(null);
    const [bookingSetting, setBookingSetting] = useState<TherapistBookingSettingRecord | null>(null);
    const [availabilitySlots, setAvailabilitySlots] = useState<TherapistAvailabilitySlotRecord[]>([]);
    const [pricingRules, setPricingRules] = useState<TherapistPricingRuleRecord[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    usePageTitle('タチキャスト準備状況');
    useToastOnMessage(error, 'error');

    const loadData = useCallback(async () => {
        if (!token) {
            return;
        }

        setError(null);

        try {
            const [reviewPayload, stripePayload, identityPayload, bookingSettingPayload, availabilityPayload, pricingPayload] = await Promise.all([
                apiRequest<ApiEnvelope<TherapistReviewStatus>>('/me/therapist-profile/review-status', { token }),
                apiRequest<ApiEnvelope<StripeConnectedAccountStatus>>('/me/stripe-connect', { token }),
                apiRequest<ApiEnvelope<IdentityVerificationRecord>>('/me/identity-verification', { token }).catch((requestError: unknown) => {
                    if (requestError instanceof ApiError && requestError.status === 404) {
                        return null;
                    }

                    throw requestError;
                }),
                apiRequest<ApiEnvelope<TherapistBookingSettingRecord>>('/me/therapist/scheduled-booking-settings', { token }),
                apiRequest<ApiEnvelope<TherapistAvailabilitySlotRecord[]>>('/me/therapist/availability-slots', { token }),
                apiRequest<ApiEnvelope<TherapistPricingRuleRecord[]>>('/me/therapist/pricing-rules?is_active=1', { token }),
            ]);

            setReviewStatus(unwrapData(reviewPayload));
            setStripeStatus(unwrapData(stripePayload));
            setIdentityVerification(identityPayload ? unwrapData(identityPayload) : null);
            setBookingSetting(unwrapData(bookingSettingPayload));
            setAvailabilitySlots(unwrapData(availabilityPayload));
            setPricingRules(unwrapData(pricingPayload));
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '準備状況の取得に失敗しました。';

            setError(message);
        } finally {
            setIsLoading(false);
        }
    }, [token]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const setupSteps = useMemo<SetupStep[]>(() => {
        const profileRequirements = reviewStatus?.requirements ?? [];
        const hasProfileBasics = profileRequirements
            .filter((requirement) => ['public_name', 'active_menu'].includes(requirement.key))
            .every((requirement) => requirement.is_satisfied);
        const isIdentityApproved = identityVerification?.status === 'approved';
        const isStripeReady = Boolean(
            stripeStatus?.has_account
            && stripeStatus.is_payout_ready,
        );
        const hasPublishedSlots = availabilitySlots.some((slot) => slot.status === 'published');
        const hasActivePricingRule = pricingRules.some((rule) => rule.is_active);
        const isPhotoReady = reviewStatus?.profile.photo_review_status === 'approved' || reviewStatus?.profile.photo_review_status === 'pending';

        return [
            {
                key: 'identity',
                title: '本人確認・年齢確認',
                description: '書類画像とセルフィーを提出して、18歳以上確認を進めます。',
                value: formatIdentityVerificationStatus(identityVerification?.status),
                isComplete: isIdentityApproved,
                to: '/therapist/identity-verification',
                actionLabel: isIdentityApproved ? '確認する' : '提出する',
            },
            {
                key: 'profile',
                title: 'プロフィールとメニュー',
                description: '公開名、紹介文、研修状況、提供メニューを整えて公開条件を満たします。',
                value: reviewStatus ? `${reviewStatus.active_menu_count}件の有効メニュー / ${formatProfileStatus(reviewStatus.profile.profile_status)}` : '未設定',
                isComplete: hasProfileBasics,
                to: '/therapist/profile',
                actionLabel: hasProfileBasics ? '編集する' : '入力する',
            },
            {
                key: 'photos',
                title: 'プロフィール写真',
                description: '顔や雰囲気が分かる写真を追加して、そのまま公開プロフィールに反映します。',
                value: photoReviewLabel(reviewStatus?.profile.photo_review_status),
                isComplete: Boolean(isPhotoReady),
                to: '/therapist/profile#profile-photos',
                actionLabel: isPhotoReady ? '状態を確認' : '写真を追加',
            },
            {
                key: 'stripe',
                title: '売上受取設定',
                description: '受取設定で振込先の口座情報を登録します。',
                value: formatStripeStatus(stripeStatus?.status),
                isComplete: isStripeReady,
                to: '/therapist/stripe-connect',
                actionLabel: stripeStatus?.has_account ? '状態を確認' : '口座を登録する',
            },
            {
                key: 'availability',
                title: '予定予約の空き枠',
                description: '予定予約の受付締切と出動拠点を決めて、公開する枠を作ります。',
                value: hasPublishedSlots
                    ? `公開枠 ${availabilitySlots.filter((slot) => slot.status === 'published').length}件 / 締切 ${leadTimeLabel(bookingSetting?.booking_request_lead_time_minutes)}`
                    : `未公開 / 締切 ${leadTimeLabel(bookingSetting?.booking_request_lead_time_minutes)}`,
                isComplete: Boolean(bookingSetting?.can_publish_scheduled_bookings && hasPublishedSlots),
                to: '/therapist/availability',
                actionLabel: hasPublishedSlots ? '空き枠を確認' : '空き枠を作成',
            },
            {
                key: 'pricing',
                title: '料金ルール',
                description: '属性別・時間帯別の動的料金を設定して、見積もりの調整を行います。',
                value: hasActivePricingRule ? `有効ルール ${pricingRules.filter((rule) => rule.is_active).length}件` : '未設定',
                isComplete: hasActivePricingRule,
                to: '/therapist/pricing',
                actionLabel: hasActivePricingRule ? 'ルールを確認' : 'ルールを追加',
            },
        ];
    }, [availabilitySlots, bookingSetting?.booking_request_lead_time_minutes, bookingSetting?.can_publish_scheduled_bookings, identityVerification, pricingRules, reviewStatus, stripeStatus]);

    const completedStepCount = setupSteps.filter((step) => step.isComplete).length;
    const profileStatus = reviewStatus?.profile.profile_status ?? null;
    const publishedSlotCount = availabilitySlots.filter((slot) => slot.status === 'published').length;
    const activePricingRuleCount = pricingRules.filter((rule) => rule.is_active).length;

    if (isLoading) {
        return <LoadingScreen title="準備状況を確認中" message="本人確認、プロフィール、売上受取設定を読み込んでいます。" />;
    }

    return (
        <div className="space-y-8">
            <section className="space-y-5 rounded-[28px] border border-white/10 bg-white/5 p-6 md:p-8">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">準備状況</p>
                        <div className="space-y-2">
                            <h1 className="text-3xl font-semibold text-white">タチキャスト準備状況</h1>
                            <p className="max-w-3xl text-sm leading-7 text-slate-300">
                                必要な設定を順番に埋めれば、条件が揃った時点で公開できるようになります。1つのアカウントのまま、利用者モードと行き来して使えます。
                            </p>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#111923] px-5 py-4 text-sm text-slate-200">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">進捗</p>
                        <p className="mt-2 text-3xl font-semibold text-white">{completedStepCount} / {setupSteps.length}</p>
                        <p className="mt-2 text-sm text-slate-300">主要ステップの完了数</p>
                    </div>
                </div>


                {reviewStatus?.profile.rejected_reason_code ? (
                    <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-7 text-amber-100">
                        前回の差し戻し理由: {formatRejectionReason(reviewStatus.profile.rejected_reason_code)}
                    </div>
                ) : null}
            </section>

            <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {setupSteps.map((step) => (
                    <article key={step.key} className="rounded-[24px] border border-white/10 bg-white/5 p-6">
                        <div className="flex items-start justify-between gap-3">
                            <div className="space-y-2">
                                <p className="text-sm font-semibold text-white">{step.title}</p>
                                <p className="text-sm leading-7 text-slate-300">{step.description}</p>
                            </div>
                            <span className={badgeClassName(step.isComplete)}>
                                {step.isComplete ? '完了' : '未完了'}
                            </span>
                        </div>
                        <p className="mt-5 text-sm font-medium text-rose-100">{step.value}</p>
                        <Link
                            to={step.to}
                            className="mt-6 inline-flex items-center rounded-full bg-rose-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-rose-200"
                        >
                            {step.actionLabel}
                        </Link>
                    </article>
                ))}
            </section>

            <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                <article className="rounded-[24px] border border-white/10 bg-white/5 p-6">
                    <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                            <p className="text-xs font-semibold tracking-wide text-rose-200">公開チェック</p>
                            <h2 className="text-xl font-semibold text-white">公開に必要な条件</h2>
                        </div>
                        <span className={badgeClassName(Boolean(reviewStatus?.can_submit))}>
                            {reviewStatus?.can_submit ? '公開可能' : '未完了'}
                        </span>
                    </div>

                    <div className="mt-5 space-y-3">
                        {(reviewStatus?.requirements ?? []).map((requirement: TherapistReviewRequirement) => (
                            <div
                                key={requirement.key}
                                className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#111923] px-4 py-3"
                            >
                                <div>
                                    <p className="text-sm font-semibold text-white">{requirement.label}</p>
                                    <p className="text-xs text-slate-400">確認項目: {formatTherapistRequirementKey(requirement.key)}</p>
                                </div>
                                <span className={badgeClassName(requirement.is_satisfied)}>
                                    {requirement.is_satisfied ? 'OK' : '要対応'}
                                </span>
                            </div>
                        ))}

                        <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                            <div>
                                <p className="text-sm font-semibold text-white">プロフィール写真</p>
                                <p className="text-xs text-slate-400">公開プロフィールに表示する写真の登録状況です。</p>
                            </div>
                            <span className={badgeClassName(reviewStatus?.profile.photo_review_status === 'approved' || reviewStatus?.profile.photo_review_status === 'pending')}>
                                {photoReviewLabel(reviewStatus?.profile.photo_review_status)}
                            </span>
                        </div>

                        <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                            <div>
                                <p className="text-sm font-semibold text-white">空き枠の公開</p>
                                <p className="text-xs text-slate-400">公開中の予定予約枠と出動拠点の準備です。</p>
                            </div>
                            <span className={badgeClassName(Boolean(bookingSetting?.can_publish_scheduled_bookings && publishedSlotCount > 0))}>
                                {bookingSetting?.can_publish_scheduled_bookings && publishedSlotCount > 0 ? `公開中 ${publishedSlotCount}件` : '要対応'}
                            </span>
                        </div>
                    </div>
                </article>

                <article className="space-y-4 rounded-[24px] border border-white/10 bg-white/5 p-6">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">現在の状態</p>
                        <h2 className="text-xl font-semibold text-white">いまの状態</h2>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                        <p className="text-sm font-semibold text-white">本人確認</p>
                        <p className="mt-2 text-sm text-slate-300">{formatIdentityVerificationStatus(identityVerification?.status)}</p>
                        <p className="mt-2 text-xs text-slate-400">
                            提出日時: {formatDateTime(identityVerification?.submitted_at)}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                        <p className="text-sm font-semibold text-white">プロフィール</p>
                        <p className="mt-2 text-sm text-slate-300">{formatProfileStatus(profileStatus)}</p>
                        <p className="mt-2 text-xs text-slate-400">
                            有効メニュー: {reviewStatus?.active_menu_count ?? 0}件 / 写真: {photoReviewLabel(reviewStatus?.profile.photo_review_status)}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                        <p className="text-sm font-semibold text-white">受取設定</p>
                        <p className="mt-2 text-sm text-slate-300">{formatStripeStatus(stripeStatus?.status)}</p>
                        {stripeStatus?.requirements_currently_due?.length ? (
                            <ul className="mt-3 space-y-1 text-xs text-slate-400">
                                {stripeStatus.requirements_currently_due.slice(0, 4).map((requirement) => (
                                    <li key={requirement}>- {formatStripeRequirementField(requirement)}</li>
                                ))}
                            </ul>
                        ) : (
                            <p className="mt-2 text-xs text-slate-400">
                                {stripeStatus?.has_account ? '現在追加提出中の項目はありません。' : 'まだ受取設定が作成されていません。'}
                            </p>
                        )}
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                        <p className="text-sm font-semibold text-white">予定予約の設定</p>
                        <p className="mt-2 text-sm text-slate-300">
                            {bookingSetting?.has_scheduled_base_location ? '出動拠点あり' : '出動拠点未設定'}
                        </p>
                        <p className="mt-2 text-xs text-slate-400">
                            受付締切: {leadTimeLabel(bookingSetting?.booking_request_lead_time_minutes)} / 公開枠: {publishedSlotCount}件
                        </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                        <p className="text-sm font-semibold text-white">料金ルール</p>
                        <p className="mt-2 text-sm text-slate-300">{activePricingRuleCount > 0 ? `${activePricingRuleCount}件の有効ルール` : '未設定'}</p>
                        <p className="mt-2 text-xs text-slate-400">
                            {activePricingRuleCount > 0 ? '属性別や時間帯別の調整が有効です。' : 'まずはメニュー基準のままでも始められます。'}
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-3 pt-2">
                        <Link
                            to="/therapist/profile"
                            className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                        >
                            プロフィールを編集
                        </Link>
                        <Link
                            to="/therapist/stripe-connect"
                            className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                        >
                            受取設定を確認
                        </Link>
                        <Link
                            to="/therapist/availability"
                            className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                        >
                            空き枠を確認
                        </Link>
                    </div>
                </article>
            </section>
        </div>
    );
}
