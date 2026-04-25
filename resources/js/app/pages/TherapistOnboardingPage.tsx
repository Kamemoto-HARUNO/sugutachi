import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import {
    formatDateTime,
    formatIdentityVerificationStatus,
    formatProfileStatus,
    formatRejectionReason,
    formatStripeStatus,
} from '../lib/therapist';
import type {
    ApiEnvelope,
    IdentityVerificationRecord,
    StripeConnectedAccountStatus,
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

export function TherapistOnboardingPage() {
    const { token } = useAuth();
    const [reviewStatus, setReviewStatus] = useState<TherapistReviewStatus | null>(null);
    const [stripeStatus, setStripeStatus] = useState<StripeConnectedAccountStatus | null>(null);
    const [identityVerification, setIdentityVerification] = useState<IdentityVerificationRecord | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmittingReview, setIsSubmittingReview] = useState(false);

    usePageTitle('セラピスト準備状況');

    const loadData = useCallback(async () => {
        if (!token) {
            return;
        }

        setError(null);

        try {
            const [reviewPayload, stripePayload, identityPayload] = await Promise.all([
                apiRequest<ApiEnvelope<TherapistReviewStatus>>('/me/therapist-profile/review-status', { token }),
                apiRequest<ApiEnvelope<StripeConnectedAccountStatus>>('/me/stripe-connect', { token }),
                apiRequest<ApiEnvelope<IdentityVerificationRecord>>('/me/identity-verification', { token }).catch((requestError: unknown) => {
                    if (requestError instanceof ApiError && requestError.status === 404) {
                        return null;
                    }

                    throw requestError;
                }),
            ]);

            setReviewStatus(unwrapData(reviewPayload));
            setStripeStatus(unwrapData(stripePayload));
            setIdentityVerification(identityPayload ? unwrapData(identityPayload) : null);
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
            && stripeStatus.details_submitted
            && (stripeStatus.payouts_enabled || stripeStatus.charges_enabled),
        );

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
                description: '公開名、紹介文、研修状況、提供メニューを整えて審査に備えます。',
                value: reviewStatus ? `${reviewStatus.active_menu_count}件の有効メニュー / ${formatProfileStatus(reviewStatus.profile.profile_status)}` : '未設定',
                isComplete: hasProfileBasics,
                to: '/therapist/profile',
                actionLabel: hasProfileBasics ? '編集する' : '入力する',
            },
            {
                key: 'stripe',
                title: '売上受取設定',
                description: 'Stripe Connect で本人情報と受取口座を登録します。',
                value: formatStripeStatus(stripeStatus?.status),
                isComplete: isStripeReady,
                to: '/therapist/stripe-connect',
                actionLabel: stripeStatus?.has_account ? '状態を確認' : '連携を始める',
            },
        ];
    }, [identityVerification, reviewStatus, stripeStatus]);

    const requirementMap = useMemo(() => {
        return new Map((reviewStatus?.requirements ?? []).map((requirement) => [requirement.key, requirement]));
    }, [reviewStatus]);

    const completedStepCount = setupSteps.filter((step) => step.isComplete).length;
    const canSubmit = reviewStatus?.can_submit ?? false;
    const profileStatus = reviewStatus?.profile.profile_status ?? null;

    async function submitReview() {
        if (!token || !canSubmit) {
            return;
        }

        setIsSubmittingReview(true);
        setError(null);

        try {
            await apiRequest<ApiEnvelope<unknown>>('/me/therapist-profile/submit-review', {
                method: 'POST',
                token,
            });

            await loadData();
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '審査提出に失敗しました。';

            setError(message);
        } finally {
            setIsSubmittingReview(false);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="準備状況を確認中" message="本人確認、プロフィール、売上受取設定を読み込んでいます。" />;
    }

    return (
        <div className="space-y-8">
            <section className="space-y-5 rounded-[28px] border border-white/10 bg-white/5 p-6 md:p-8">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">ONBOARDING</p>
                        <div className="space-y-2">
                            <h1 className="text-3xl font-semibold text-white">セラピスト準備状況</h1>
                            <p className="max-w-3xl text-sm leading-7 text-slate-300">
                                必要な設定を順番に埋めれば、このまま公開審査まで進めます。1つのアカウントのまま、利用者モードと行き来して使えます。
                            </p>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#111923] px-5 py-4 text-sm text-slate-200">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">SETUP SCORE</p>
                        <p className="mt-2 text-3xl font-semibold text-white">{completedStepCount} / {setupSteps.length}</p>
                        <p className="mt-2 text-sm text-slate-300">主要ステップの完了数</p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/10 px-3 py-1 text-sm text-slate-200">
                        プロフィール: {formatProfileStatus(profileStatus)}
                    </span>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-sm text-slate-200">
                        本人確認: {formatIdentityVerificationStatus(identityVerification?.status)}
                    </span>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-sm text-slate-200">
                        Stripe: {formatStripeStatus(stripeStatus?.status)}
                    </span>
                </div>

                {error ? (
                    <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                        {error}
                    </div>
                ) : null}

                {reviewStatus?.profile.rejected_reason_code ? (
                    <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-7 text-amber-100">
                        前回の差し戻し理由: {formatRejectionReason(reviewStatus.profile.rejected_reason_code)}
                    </div>
                ) : null}
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
                {setupSteps.map((step) => (
                    <article key={step.key} className="rounded-[24px] border border-white/10 bg-white/5 p-6">
                        <div className="flex items-start justify-between gap-3">
                            <div className="space-y-2">
                                <p className="text-sm font-semibold text-white">{step.title}</p>
                                <p className="text-sm leading-7 text-slate-300">{step.description}</p>
                            </div>
                            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(step.isComplete)}`}>
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
                            <p className="text-xs font-semibold tracking-wide text-rose-200">REVIEW CHECKLIST</p>
                            <h2 className="text-xl font-semibold text-white">公開審査の条件</h2>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                void submitReview();
                            }}
                            disabled={!canSubmit || isSubmittingReview || profileStatus === 'pending' || profileStatus === 'approved'}
                            className="inline-flex items-center rounded-full bg-rose-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isSubmittingReview ? '提出中...' : profileStatus === 'pending' ? '審査中です' : profileStatus === 'approved' ? '承認済みです' : '審査へ提出'}
                        </button>
                    </div>

                    <div className="mt-5 space-y-3">
                        {(reviewStatus?.requirements ?? []).map((requirement: TherapistReviewRequirement) => (
                            <div
                                key={requirement.key}
                                className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#111923] px-4 py-3"
                            >
                                <div>
                                    <p className="text-sm font-semibold text-white">{requirement.label}</p>
                                    <p className="text-xs text-slate-400">{requirement.key}</p>
                                </div>
                                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(requirement.is_satisfied)}`}>
                                    {requirement.is_satisfied ? 'OK' : '要対応'}
                                </span>
                            </div>
                        ))}
                    </div>
                </article>

                <article className="space-y-4 rounded-[24px] border border-white/10 bg-white/5 p-6">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">CURRENT STATUS</p>
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
                            有効メニュー: {reviewStatus?.active_menu_count ?? 0}件
                        </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                        <p className="text-sm font-semibold text-white">Stripe Connect</p>
                        <p className="mt-2 text-sm text-slate-300">{formatStripeStatus(stripeStatus?.status)}</p>
                        {stripeStatus?.requirements_currently_due?.length ? (
                            <ul className="mt-3 space-y-1 text-xs text-slate-400">
                                {stripeStatus.requirements_currently_due.slice(0, 4).map((requirement) => (
                                    <li key={requirement}>- {requirement}</li>
                                ))}
                            </ul>
                        ) : (
                            <p className="mt-2 text-xs text-slate-400">
                                {stripeStatus?.has_account ? '現在追加提出中の項目はありません。' : 'まだ受取設定が作成されていません。'}
                            </p>
                        )}
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
                            Stripeを確認
                        </Link>
                    </div>
                </article>
            </section>

            <section className="rounded-[24px] border border-white/10 bg-white/5 p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">NEXT ACTION</p>
                        <h2 className="text-xl font-semibold text-white">次に進むときのおすすめ</h2>
                        <p className="text-sm leading-7 text-slate-300">
                            本人確認とメニューが揃ったら審査提出、その後は写真と空き枠の準備へ進むのがスムーズです。
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Link
                            to="/therapist/photos"
                            className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                        >
                            写真審査へ
                        </Link>
                        <Link
                            to="/therapist/availability"
                            className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                        >
                            空き枠へ進む
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
