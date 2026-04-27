import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatDateTime, formatStripeRequirementField, formatStripeStatus } from '../lib/therapist';
import type {
    ApiEnvelope,
    StripeAccountLink,
    StripeConnectedAccountStatus,
} from '../lib/types';

export function TherapistStripeConnectPage() {
    const { token } = useAuth();
    const [stripeStatus, setStripeStatus] = useState<StripeConnectedAccountStatus | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreatingAccount, setIsCreatingAccount] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLaunching, setIsLaunching] = useState(false);

    usePageTitle('受取設定');
    useToastOnMessage(error, 'error');

    const loadStripeStatus = useCallback(async () => {
        if (!token) {
            return;
        }

        const payload = await apiRequest<ApiEnvelope<StripeConnectedAccountStatus>>('/me/stripe-connect', {
            token,
        });

        setStripeStatus(unwrapData(payload));
    }, [token]);

    useEffect(() => {
        let isMounted = true;

        void loadStripeStatus()
            .catch((requestError: unknown) => {
                if (!isMounted) {
                    return;
                }

                const message =
                    requestError instanceof ApiError
                        ? requestError.message
                        : 'Stripe Connect の状態取得に失敗しました。';

                setError(message);
            })
            .finally(() => {
                if (isMounted) {
                    setIsLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [loadStripeStatus]);

    const isReady = useMemo(() => {
        return Boolean(
            stripeStatus?.has_account
            && stripeStatus.details_submitted
            && stripeStatus.payouts_enabled,
        );
    }, [stripeStatus]);

    async function createAccount() {
        if (!token) {
            return;
        }

        setIsCreatingAccount(true);
        setError(null);

        try {
            const payload = await apiRequest<ApiEnvelope<StripeConnectedAccountStatus>>('/me/stripe-connect/accounts', {
                method: 'POST',
                token,
            });

            setStripeStatus(unwrapData(payload));
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : 'Stripe Connect アカウントの作成に失敗しました。';

            setError(message);
        } finally {
            setIsCreatingAccount(false);
        }
    }

    async function refreshStatus() {
        if (!token || !stripeStatus?.has_account) {
            return;
        }

        setIsRefreshing(true);
        setError(null);

        try {
            const payload = await apiRequest<ApiEnvelope<StripeConnectedAccountStatus>>('/me/stripe-connect/refresh', {
                method: 'POST',
                token,
            });

            setStripeStatus(unwrapData(payload));
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : 'Stripe 状態の同期に失敗しました。';

            setError(message);
        } finally {
            setIsRefreshing(false);
        }
    }

    async function launchOnboarding() {
        if (!token || !stripeStatus?.has_account) {
            return;
        }

        setIsLaunching(true);
        setError(null);

        try {
            const payload = await apiRequest<ApiEnvelope<StripeAccountLink>>('/me/stripe-connect/account-link', {
                method: 'POST',
                token,
            });

            const accountLink = unwrapData(payload);
            window.location.assign(accountLink.url);
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : 'Stripe オンボーディングURLの取得に失敗しました。';

            setError(message);
            setIsLaunching(false);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="受取設定を確認中" message="受取設定と提出状況を読み込んでいます。" />;
    }

    return (
        <div className="space-y-8">
            <section className="space-y-4 rounded-[28px] border border-white/10 bg-white/5 p-6 md:p-8">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">受取設定</p>
                        <h1 className="text-3xl font-semibold text-white">売上受取設定</h1>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            売上の受け取りには Stripe Connect の登録が必要です。本人情報と銀行口座の登録は Stripe の案内画面で進めます。
                        </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#111923] px-5 py-4 text-sm text-slate-200">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">現在の状態</p>
                        <p className="mt-2 text-2xl font-semibold text-white">{formatStripeStatus(stripeStatus?.status)}</p>
                        <p className="mt-2 text-xs text-slate-400">
                            {isReady ? '出金準備が整っています。' : '追加対応が必要な可能性があります。'}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-3">
                    <Link
                        to="/therapist/onboarding"
                        className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                    >
                        準備状況へ戻る
                    </Link>
                    <Link
                        to="/therapist/profile"
                        className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                    >
                        プロフィールへ
                    </Link>
                </div>

            </section>

            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
                <article className="space-y-5 rounded-[24px] border border-white/10 bg-white/5 p-6">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">進め方</p>
                        <h2 className="text-xl font-semibold text-white">受取設定を進める</h2>
                    </div>

                    {!stripeStatus?.has_account ? (
                        <div className="space-y-4">
                            <p className="text-sm leading-7 text-slate-300">
                                まだ Stripe Connect アカウントがありません。最初にアカウントを作成してから、Stripe の入力画面へ進みます。
                            </p>
                            <button
                                type="button"
                                onClick={() => {
                                    void createAccount();
                                }}
                                disabled={isCreatingAccount}
                                className="inline-flex items-center rounded-full bg-rose-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isCreatingAccount ? '作成中...' : '受取設定を始める'}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                                <p className="text-sm font-semibold text-white">Stripe アカウントID</p>
                                <p className="mt-2 break-all text-sm text-slate-300">{stripeStatus.stripe_account_id}</p>
                            </div>

                            <div className="flex flex-wrap gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        void launchOnboarding();
                                    }}
                                    disabled={isLaunching}
                                    className="inline-flex items-center rounded-full bg-rose-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isLaunching ? '移動中...' : stripeStatus.details_submitted ? '受取設定画面をもう一度開く' : '受取設定を進める'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        void refreshStatus();
                                    }}
                                    disabled={isRefreshing}
                                    className="inline-flex items-center rounded-full border border-white/10 px-5 py-3 text-sm text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isRefreshing ? '同期中...' : '状態を同期する'}
                                </button>
                            </div>

                            <p className="text-sm leading-7 text-slate-300">
                                Stripe で入力を終えたあとにこの画面へ戻ったら、「状態を同期する」で最新状態を取り込みます。
                            </p>
                        </div>
                    )}
                </article>

                <article className="space-y-4 rounded-[24px] border border-white/10 bg-white/5 p-6">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">連携状況</p>
                        <h2 className="text-xl font-semibold text-white">現在の連携状況</h2>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                        <p className="text-sm font-semibold text-white">状態</p>
                        <p className="mt-2 text-sm text-slate-300">{formatStripeStatus(stripeStatus?.status)}</p>
                        <p className="mt-2 text-xs text-slate-400">
                            最終同期: {formatDateTime(stripeStatus?.last_synced_at)}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                        <p className="text-sm font-semibold text-white">提出・利用可否</p>
                        <ul className="mt-3 space-y-2 text-sm text-slate-300">
                            <li>詳細情報提出: {stripeStatus?.details_submitted ? '完了' : '未完了'}</li>
                            <li>支払い受付: {stripeStatus?.charges_enabled ? '利用可' : '未対応'}</li>
                            <li>出金: {stripeStatus?.payouts_enabled ? '利用可' : '未対応'}</li>
                        </ul>
                    </div>

                    {stripeStatus?.requirements_currently_due?.length ? (
                        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3">
                            <p className="text-sm font-semibold text-amber-100">現在不足している項目</p>
                            <ul className="mt-3 space-y-1 text-sm text-amber-100">
                                {stripeStatus.requirements_currently_due.map((requirement) => (
                                    <li key={requirement}>- {formatStripeRequirementField(requirement)}</li>
                                ))}
                            </ul>
                        </div>
                    ) : null}

                    {stripeStatus?.requirements_past_due?.length ? (
                        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3">
                            <p className="text-sm font-semibold text-amber-100">期限超過の項目</p>
                            <ul className="mt-3 space-y-1 text-sm text-amber-100">
                                {stripeStatus.requirements_past_due.map((requirement) => (
                                    <li key={requirement}>- {formatStripeRequirementField(requirement)}</li>
                                ))}
                            </ul>
                        </div>
                    ) : null}

                    {stripeStatus?.disabled_reason ? (
                        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-7 text-amber-100">
                            Stripe からの停止理由: {stripeStatus.disabled_reason}
                        </div>
                    ) : null}
                </article>
            </section>
        </div>
    );
}
