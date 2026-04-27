import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatBankAccountType, formatDateTime, formatStripeRequirementField, formatStripeStatus } from '../lib/therapist';
import type {
    ApiEnvelope,
    StripeConnectedAccountStatus,
} from '../lib/types';

type AccountTypeOption = 'ordinary' | 'checking' | 'savings';

interface PayoutFormState {
    bank_name: string;
    bank_branch_name: string;
    bank_account_type: AccountTypeOption;
    bank_account_number: string;
    bank_account_holder_name: string;
}

const defaultFormState: PayoutFormState = {
    bank_name: '',
    bank_branch_name: '',
    bank_account_type: 'ordinary',
    bank_account_number: '',
    bank_account_holder_name: '',
};

function requirementTone(isReady: boolean): string {
    return isReady
        ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
        : 'border-amber-300/30 bg-amber-300/10 text-amber-100';
}

export function TherapistStripeConnectPage() {
    const { token } = useAuth();
    const [payoutStatus, setPayoutStatus] = useState<StripeConnectedAccountStatus | null>(null);
    const [form, setForm] = useState<PayoutFormState>(defaultFormState);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    usePageTitle('受取設定');
    useToastOnMessage(error, 'error');
    useToastOnMessage(successMessage, 'success');

    const applyForm = useCallback((status: StripeConnectedAccountStatus | null) => {
        setForm({
            bank_name: status?.bank_account?.bank_name ?? '',
            bank_branch_name: status?.bank_account?.branch_name ?? '',
            bank_account_type: (status?.bank_account?.account_type as AccountTypeOption | null) ?? 'ordinary',
            bank_account_number: status?.bank_account?.account_number ?? '',
            bank_account_holder_name: status?.bank_account?.account_holder_name ?? '',
        });
    }, []);

    const loadPayoutStatus = useCallback(async (refresh = false) => {
        if (!token) {
            return;
        }

        if (refresh) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }

        try {
            const payload = await apiRequest<ApiEnvelope<StripeConnectedAccountStatus>>('/me/stripe-connect', {
                token,
            });

            const nextStatus = unwrapData(payload);
            setPayoutStatus(nextStatus);
            applyForm(nextStatus);
            setError(null);
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '受取設定の取得に失敗しました。';

            setError(message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [applyForm, token]);

    useEffect(() => {
        void loadPayoutStatus();
    }, [loadPayoutStatus]);

    const isReady = payoutStatus?.is_payout_ready ?? false;
    const missingRequirements = payoutStatus?.requirements_currently_due ?? [];
    const isLegacyStripeAccount = payoutStatus?.payout_method === 'stripe_connect' && Boolean(payoutStatus.stripe_account_id);

    const summaryItems = useMemo(() => ([
        {
            label: '現在の状態',
            value: formatStripeStatus(payoutStatus?.status),
            hint: isReady ? '出金申請に進める状態です。' : '銀行口座の入力を完了すると出金申請に進めます。',
        },
        {
            label: '登録口座',
            value: payoutStatus?.bank_account?.account_number_masked
                ? `${payoutStatus.bank_account.bank_name ?? '銀行名未設定'} / ${payoutStatus.bank_account.account_number_masked}`
                : '未設定',
            hint: payoutStatus?.bank_account?.branch_name
                ? `${payoutStatus.bank_account.branch_name} / ${formatBankAccountType(payoutStatus.bank_account.account_type)}`
                : '銀行名、支店名、口座番号を登録します。',
        },
        {
            label: '最終更新',
            value: formatDateTime(payoutStatus?.last_synced_at),
            hint: '保存後は売上と出金申請の画面に反映されます。',
        },
    ]), [isReady, payoutStatus]);

    async function savePayoutSettings() {
        if (!token || isSaving) {
            return;
        }

        setIsSaving(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<StripeConnectedAccountStatus>>('/me/stripe-connect', {
                method: 'PUT',
                token,
                body: form,
            });

            const nextStatus = unwrapData(payload);
            setPayoutStatus(nextStatus);
            applyForm(nextStatus);
            setSuccessMessage(nextStatus.is_payout_ready
                ? '受取口座を保存しました。出金申請に進める状態です。'
                : '受取口座を保存しました。残りの項目を確認してください。');
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '受取口座の保存に失敗しました。';

            setError(message);
        } finally {
            setIsSaving(false);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="受取設定を確認中" message="受取口座の登録状況を読み込んでいます。" />;
    }

    return (
        <div className="space-y-8">
            <section className="space-y-4 rounded-[28px] border border-white/10 bg-white/5 p-6 md:p-8">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">受取設定</p>
                        <h1 className="text-3xl font-semibold text-white">受取口座を登録する</h1>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            セラピスト売上は、ここで登録した口座へ出金申請ベースで振込します。売上は完了後に保留へ入り、解放されたぶんだけ出金申請できます。
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                void loadPayoutStatus(true);
                            }}
                            disabled={isRefreshing}
                            className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isRefreshing ? '更新中...' : '最新の状態を確認'}
                        </button>
                        <Link
                            to="/therapist/balance"
                            className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                        >
                            売上画面へ
                        </Link>
                        <Link
                            to="/therapist/onboarding"
                            className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                        >
                            準備状況へ戻る
                        </Link>
                    </div>
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-3">
                {summaryItems.map((item) => (
                    <article key={item.label} className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">{item.label}</p>
                        <p className="mt-3 text-lg font-semibold text-white">{item.value}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-300">{item.hint}</p>
                    </article>
                ))}
            </section>

            <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
                <article className="space-y-5 rounded-[24px] border border-white/10 bg-white/5 p-6">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">口座情報</p>
                        <h2 className="text-xl font-semibold text-white">振込先口座を入力</h2>
                        <p className="text-sm leading-7 text-slate-300">
                            口座情報はアプリ内で保存し、運営が出金申請を確認したあとに手動で振込します。口座名義は、銀行側で登録している表記に合わせて入力してください。
                        </p>
                    </div>

                    {isLegacyStripeAccount ? (
                        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-7 text-amber-100">
                            以前の Stripe Connect 連携情報が残っています。今後はこの画面で登録した受取口座を優先して使います。
                        </div>
                    ) : null}

                    <div className="grid gap-4 md:grid-cols-2">
                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-white">銀行名</span>
                            <input
                                value={form.bank_name}
                                onChange={(event) => setForm((current) => ({ ...current, bank_name: event.target.value }))}
                                placeholder="例: 三井住友銀行"
                                className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-200/60"
                            />
                        </label>

                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-white">支店名</span>
                            <input
                                value={form.bank_branch_name}
                                onChange={(event) => setForm((current) => ({ ...current, bank_branch_name: event.target.value }))}
                                placeholder="例: 新宿支店"
                                className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-200/60"
                            />
                        </label>

                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-white">口座種別</span>
                            <select
                                value={form.bank_account_type}
                                onChange={(event) => setForm((current) => ({ ...current, bank_account_type: event.target.value as AccountTypeOption }))}
                                className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-200/60"
                            >
                                <option value="ordinary">普通</option>
                                <option value="checking">当座</option>
                                <option value="savings">貯蓄</option>
                            </select>
                        </label>

                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-white">口座番号</span>
                            <input
                                inputMode="numeric"
                                value={form.bank_account_number}
                                onChange={(event) => setForm((current) => ({
                                    ...current,
                                    bank_account_number: event.target.value.replace(/\D+/g, '').slice(0, 8),
                                }))}
                                placeholder="1234567"
                                className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-200/60"
                            />
                        </label>
                    </div>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-white">口座名義</span>
                        <input
                            value={form.bank_account_holder_name}
                            onChange={(event) => setForm((current) => ({ ...current, bank_account_holder_name: event.target.value }))}
                            placeholder="例: ヤマダ タロウ"
                            className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-200/60"
                        />
                        <p className="text-xs text-slate-400">
                            銀行口座側の登録名義に合わせて入力してください。カナ表記での登録がおすすめです。
                        </p>
                    </label>

                    <div className="flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                void savePayoutSettings();
                            }}
                            disabled={isSaving}
                            className="inline-flex items-center rounded-full bg-rose-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isSaving ? '保存中...' : '受取口座を保存する'}
                        </button>
                    </div>
                </article>

                <aside className="space-y-5">
                    <article className="space-y-4 rounded-[24px] border border-white/10 bg-white/5 p-6">
                        <div className="space-y-2">
                            <p className="text-xs font-semibold tracking-wide text-rose-200">準備状況</p>
                            <h2 className="text-xl font-semibold text-white">出金申請までの流れ</h2>
                        </div>

                        <div className="space-y-3">
                            {[
                                {
                                    title: '1. 口座情報を保存',
                                    body: '銀行名、支店名、口座種別、口座番号、口座名義を登録します。',
                                    complete: payoutStatus?.has_account ?? false,
                                },
                                {
                                    title: '2. 売上が解放される',
                                    body: '完了した予約の売上は保留後、解放されると出金可能額に移ります。',
                                    complete: isReady,
                                },
                                {
                                    title: '3. 出金申請を送る',
                                    body: '売上画面から申請すると、運営確認後に指定口座へ振込します。',
                                    complete: false,
                                },
                            ].map((step) => (
                                <div key={step.title} className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="space-y-1">
                                            <p className="text-sm font-semibold text-white">{step.title}</p>
                                            <p className="text-xs leading-6 text-slate-300">{step.body}</p>
                                        </div>
                                        <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold ${requirementTone(step.complete)}`}>
                                            {step.complete ? 'OK' : '未完了'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </article>

                    <article className="space-y-4 rounded-[24px] border border-white/10 bg-white/5 p-6">
                        <div className="space-y-2">
                            <p className="text-xs font-semibold tracking-wide text-rose-200">確認項目</p>
                            <h2 className="text-xl font-semibold text-white">まだ不足している内容</h2>
                        </div>

                        {missingRequirements.length > 0 ? (
                            <div className="space-y-2 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3">
                                {missingRequirements.map((requirement) => (
                                    <p key={requirement} className="text-sm text-amber-100">
                                        - {formatStripeRequirementField(requirement)}
                                    </p>
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm leading-7 text-emerald-100">
                                受取設定は完了しています。売上が解放されたら、売上画面から出金申請できます。
                            </div>
                        )}
                    </article>
                </aside>
            </section>
        </div>
    );
}
