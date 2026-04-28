import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatBankAccountType, formatDate, formatDateTime, formatStripeStatus } from '../lib/therapist';
import type {
    AdminPayoutRequestRecord,
    ApiEnvelope,
} from '../lib/types';

type PayoutStatusFilter = 'all' | 'payout_requested' | 'held' | 'processing' | 'paid' | 'failed';
type SortField = 'created_at' | 'requested_at' | 'scheduled_process_date' | 'requested_amount' | 'net_amount' | 'processed_at';
type SortDirection = 'asc' | 'desc';

function normalizeStatusFilter(value: string | null): PayoutStatusFilter {
    if (value === 'payout_requested' || value === 'held' || value === 'processing' || value === 'paid' || value === 'failed') {
        return value;
    }

    return 'all';
}

function normalizeSortField(value: string | null): SortField {
    if (value === 'requested_at' || value === 'scheduled_process_date' || value === 'requested_amount' || value === 'net_amount' || value === 'processed_at') {
        return value;
    }

    return 'created_at';
}

function normalizeSortDirection(value: string | null): SortDirection {
    return value === 'asc' ? 'asc' : 'desc';
}

function payoutStatusLabel(status: string): string {
    switch (status) {
        case 'held':
            return '保留中';
        case 'processing':
            return '処理中';
        case 'paid':
            return '支払済み';
        case 'failed':
            return '失敗';
        default:
            return '申請中';
    }
}

function payoutStatusTone(status: string): string {
    switch (status) {
        case 'paid':
            return 'bg-[#e8f4ea] text-[#24553a]';
        case 'processing':
            return 'bg-[#edf4ff] text-[#34557f]';
        case 'held':
            return 'bg-[#fff3e3] text-[#8f5c22]';
        case 'failed':
            return 'bg-[#f8e8e5] text-[#8f4337]';
        default:
            return 'bg-[#f3efe7] text-[#55606d]';
    }
}

function amountLabel(value: number | null): string {
    if (value == null) {
        return '未設定';
    }

    return `${value.toLocaleString('ja-JP')}円`;
}

function displayTherapistName(payout: AdminPayoutRequestRecord): string {
    return payout.therapist_account?.display_name?.trim()
        || payout.therapist_account?.public_id
        || payout.public_id;
}

function payoutMethodLabel(payout: AdminPayoutRequestRecord): string {
    return payout.stripe_connected_account?.payout_method === 'manual_bank_transfer'
        ? '手動振込'
        : 'Stripe送金';
}

function payoutDestinationSummary(payout: AdminPayoutRequestRecord): string {
    if (payout.stripe_connected_account?.payout_method === 'manual_bank_transfer') {
        const bankName = payout.stripe_connected_account.bank_name ?? '銀行名未設定';
        const branchName = payout.stripe_connected_account.bank_branch_name ?? '支店名未設定';
        const masked = payout.stripe_connected_account.bank_account_number_masked ?? '口座番号未設定';

        return `${bankName} ${branchName} / ${masked}`;
    }

    return payout.stripe_connected_account?.stripe_account_id ?? '未設定';
}

function buildSelectedLink(searchParams: URLSearchParams, publicId: string): string {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('selected', publicId);
    const query = nextParams.toString();

    return query ? `/admin/payout-requests?${query}` : '/admin/payout-requests';
}

export function AdminPayoutRequestsPage() {
    const { token } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [payouts, setPayouts] = useState<AdminPayoutRequestRecord[]>([]);
    const [pageError, setPageError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [therapistInput, setTherapistInput] = useState(searchParams.get('therapist_account_id') ?? '');
    const [scheduledFromInput, setScheduledFromInput] = useState(searchParams.get('scheduled_from') ?? '');
    const [scheduledToInput, setScheduledToInput] = useState(searchParams.get('scheduled_to') ?? '');
    const [forceProcess, setForceProcess] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSubmittingHold, setIsSubmittingHold] = useState(false);
    const [isSubmittingRelease, setIsSubmittingRelease] = useState(false);
    const [isSubmittingProcess, setIsSubmittingProcess] = useState(false);

    const selectedId = searchParams.get('selected');
    const statusFilter = normalizeStatusFilter(searchParams.get('status'));
    const sortField = normalizeSortField(searchParams.get('sort'));
    const direction = normalizeSortDirection(searchParams.get('direction'));
    const therapistAccountId = searchParams.get('therapist_account_id')?.trim() ?? '';
    const scheduledFrom = searchParams.get('scheduled_from')?.trim() ?? '';
    const scheduledTo = searchParams.get('scheduled_to')?.trim() ?? '';

    usePageTitle('出金申請管理');
    useToastOnMessage(successMessage, 'success');

    const selectedPayout = useMemo(
        () => payouts.find((payout) => payout.public_id === selectedId) ?? null,
        [payouts, selectedId],
    );

    const summary = useMemo(() => ({
        total: payouts.length,
        requested: payouts.filter((payout) => payout.status === 'payout_requested').length,
        held: payouts.filter((payout) => payout.status === 'held').length,
        processing: payouts.filter((payout) => payout.status === 'processing').length,
        totalNet: payouts.reduce((sum, payout) => sum + (payout.net_amount ?? 0), 0),
    }), [payouts]);

    const loadPayouts = useCallback(async (refresh = false) => {
        if (!token) {
            return;
        }

        if (refresh) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }

        setPageError(null);

        const params = new URLSearchParams();

        if (statusFilter !== 'all') {
            params.set('status', statusFilter);
        }

        if (therapistAccountId) {
            params.set('therapist_account_id', therapistAccountId);
        }

        if (scheduledFrom) {
            params.set('scheduled_from', scheduledFrom);
        }

        if (scheduledTo) {
            params.set('scheduled_to', scheduledTo);
        }

        params.set('sort', sortField);
        params.set('direction', direction);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminPayoutRequestRecord[]>>(`/admin/payout-requests?${params.toString()}`, { token });
            setPayouts(unwrapData(payload));
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '出金申請一覧の取得に失敗しました。';

            setPageError(message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [direction, scheduledFrom, scheduledTo, sortField, statusFilter, therapistAccountId, token]);

    useEffect(() => {
        void loadPayouts();
    }, [loadPayouts]);

    function updateFilters(next: Partial<Record<'status' | 'sort' | 'direction' | 'therapist_account_id' | 'scheduled_from' | 'scheduled_to' | 'selected', string | null>>) {
        const params = new URLSearchParams(searchParams);

        Object.entries(next).forEach(([key, value]) => {
            if (!value || value === 'all') {
                params.delete(key);
                return;
            }

            params.set(key, value);
        });

        setSearchParams(params, { replace: true });
    }

    async function handleHold() {
        if (!token || !selectedPayout) {
            return;
        }

        setIsSubmittingHold(true);
        setActionError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminPayoutRequestRecord>>(`/admin/payout-requests/${selectedPayout.public_id}/hold`, {
                method: 'POST',
                token,
            });

            const updated = unwrapData(payload);
            setPayouts((current) => current.map((payout) => payout.public_id === updated.public_id ? updated : payout));
            setSuccessMessage('出金申請を保留にしました。');
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '出金申請の保留に失敗しました。';

            setActionError(message);
        } finally {
            setIsSubmittingHold(false);
        }
    }

    async function handleRelease() {
        if (!token || !selectedPayout) {
            return;
        }

        setIsSubmittingRelease(true);
        setActionError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminPayoutRequestRecord>>(`/admin/payout-requests/${selectedPayout.public_id}/release`, {
                method: 'POST',
                token,
            });

            const updated = unwrapData(payload);
            setPayouts((current) => current.map((payout) => payout.public_id === updated.public_id ? updated : payout));
            setSuccessMessage('出金申請を保留解除しました。');
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '出金申請の保留解除に失敗しました。';

            setActionError(message);
        } finally {
            setIsSubmittingRelease(false);
        }
    }

    async function handleProcess() {
        if (!token || !selectedPayout) {
            return;
        }

        setIsSubmittingProcess(true);
        setActionError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminPayoutRequestRecord>>(`/admin/payout-requests/${selectedPayout.public_id}/process`, {
                method: 'POST',
                token,
                body: forceProcess ? { force: true } : {},
            });

            const updated = unwrapData(payload);
            setPayouts((current) => current.map((payout) => payout.public_id === updated.public_id ? updated : payout));
            setSuccessMessage(
                selectedPayout.stripe_connected_account?.payout_method === 'manual_bank_transfer'
                    ? '振込済みとして記録しました。'
                    : '出金処理を実行しました。'
            );
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '出金処理の実行に失敗しました。';

            setActionError(message);
        } finally {
            setIsSubmittingProcess(false);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="出金申請を読み込み中" message="保留・処理対象の出金申請を集約しています。" />;
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_16px_34px_rgba(2,6,23,0.14)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">出金運用</p>
                        <h2 className="text-2xl font-semibold text-white sm:text-[2rem]">出金申請管理</h2>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            タチキャストの出金申請を確認し、保留、解除、振込完了の記録までを進められます。
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            void loadPayouts(true);
                        }}
                        disabled={isRefreshing}
                        className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isRefreshing ? '更新中...' : '最新化'}
                    </button>
                </div>
            </section>

            {pageError ? (
                <section className="rounded-[24px] border border-[#f1d4b5] bg-[#fff4e8] px-5 py-4 text-sm text-[#9a4b35]">
                    {pageError}
                </section>
            ) : null}

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                {[
                    { label: '総件数', value: summary.total, hint: '現在の表示対象' },
                    { label: '申請中', value: summary.requested, hint: '処理待ち' },
                    { label: '保留中', value: summary.held, hint: '要レビュー' },
                    { label: '処理中', value: summary.processing, hint: '振込処理中' },
                    { label: '純支払総額', value: `${summary.totalNet.toLocaleString('ja-JP')}円`, hint: '一覧の net_amount 合計' },
                ].map((item) => (
                    <article key={item.label} className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">{item.label}</p>
                        <p className="mt-3 text-3xl font-semibold text-white">{item.value}</p>
                        <p className="mt-2 text-sm text-slate-400">{item.hint}</p>
                    </article>
                ))}
            </section>

            <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">状態</span>
                        <select
                            value={statusFilter}
                            onChange={(event) => updateFilters({ status: event.target.value, selected: null })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="all">すべて</option>
                            <option value="payout_requested">申請中</option>
                            <option value="held">保留中</option>
                            <option value="processing">処理中</option>
                            <option value="paid">支払済み</option>
                            <option value="failed">失敗</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">タチキャストアカウント</span>
                        <input
                            value={therapistInput}
                            onChange={(event) => setTherapistInput(event.target.value)}
                            onBlur={() => updateFilters({ therapist_account_id: therapistInput.trim() || null, selected: null })}
                            placeholder="会員番号で絞り込み"
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        />
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">予定処理日（開始）</span>
                        <input
                            type="date"
                            value={scheduledFromInput}
                            onChange={(event) => setScheduledFromInput(event.target.value)}
                            onBlur={() => updateFilters({ scheduled_from: scheduledFromInput || null, selected: null })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        />
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">予定処理日（終了）</span>
                        <input
                            type="date"
                            value={scheduledToInput}
                            onChange={(event) => setScheduledToInput(event.target.value)}
                            onBlur={() => updateFilters({ scheduled_to: scheduledToInput || null, selected: null })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        />
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">並び替え</span>
                        <select
                            value={sortField}
                            onChange={(event) => updateFilters({ sort: event.target.value, selected: null })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="created_at">登録日時</option>
                            <option value="requested_at">申請日時</option>
                            <option value="scheduled_process_date">予定処理日</option>
                            <option value="requested_amount">申請額</option>
                            <option value="net_amount">純支払額</option>
                            <option value="processed_at">処理日時</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">順序</span>
                        <select
                            value={direction}
                            onChange={(event) => updateFilters({ direction: event.target.value, selected: null })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="desc">新しい順</option>
                            <option value="asc">古い順</option>
                        </select>
                    </label>
                </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(360px,0.88fr)]">
                <section className="space-y-4">
                    {payouts.length > 0 ? payouts.map((payout) => {
                        const isSelected = payout.public_id === selectedId;

                        return (
                            <Link
                                key={payout.public_id}
                                to={buildSelectedLink(searchParams, payout.public_id)}
                                className={[
                                    'block rounded-[24px] border p-5 shadow-[0_16px_30px_rgba(23,32,43,0.08)] transition',
                                    isSelected
                                        ? 'border-[#d2b179] bg-[#fff8ee]'
                                        : 'border-[#efe5d7] bg-white hover:bg-[#fffdf8]',
                                ].join(' ')}
                            >
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="text-lg font-semibold text-[#17202b]">{displayTherapistName(payout)}</h3>
                                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${payoutStatusTone(payout.status)}`}>
                                                {payoutStatusLabel(payout.status)}
                                            </span>
                                        </div>
                                        <p className="text-sm text-[#68707a]">申請番号 {payout.public_id}</p>
                                        <p className="text-xs text-[#7d6852]">会員番号 {payout.therapist_account?.public_id ?? '未設定'}</p>
                                    </div>

                                    <div className="text-right">
                                        <p className="text-lg font-semibold text-[#17202b]">{amountLabel(payout.net_amount)}</p>
                                        <p className="mt-1 text-xs text-[#68707a]">申請額 {amountLabel(payout.requested_amount)}</p>
                                    </div>
                                </div>

                                <div className="mt-4 grid gap-3 md:grid-cols-3">
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">予定処理日</p>
                                        <p className="mt-1 text-sm font-semibold text-[#17202b]">{formatDate(payout.scheduled_process_date)}</p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">{payoutMethodLabel(payout)}</p>
                                        <p className="mt-1 text-sm font-semibold text-[#17202b]">{payoutDestinationSummary(payout)}</p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">処理日時</p>
                                        <p className="mt-1 text-sm font-semibold text-[#17202b]">{formatDateTime(payout.processed_at)}</p>
                                    </div>
                                </div>
                            </Link>
                        );
                    }) : (
                        <section className="rounded-[28px] bg-white px-6 py-10 text-center shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                            <p className="text-sm leading-7 text-[#68707a]">条件に合う出金申請はありません。</p>
                        </section>
                    )}
                </section>

                <aside className="space-y-5">
                    {actionError ? (
                        <section className="rounded-[24px] border border-[#f1d4b5] bg-[#fff4e8] px-5 py-4 text-sm text-[#9a4b35]">
                            {actionError}
                        </section>
                    ) : null}

                    {selectedPayout ? (
                        <section className="space-y-5">
                            <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">出金詳細</p>
                                        <h3 className="mt-2 text-2xl font-semibold text-[#17202b]">{displayTherapistName(selectedPayout)}</h3>
                                        <p className="mt-2 text-sm text-[#68707a]">申請番号 {selectedPayout.public_id}</p>
                                        <p className="mt-1 text-xs text-[#7d6852]">会員番号 {selectedPayout.therapist_account?.public_id ?? '未設定'}</p>
                                    </div>
                                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${payoutStatusTone(selectedPayout.status)}`}>
                                        {payoutStatusLabel(selectedPayout.status)}
                                    </span>
                                </div>

                                <div className="mt-5 grid gap-3">
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3 text-sm text-[#48505a]">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">金額</p>
                                        <p className="mt-1 font-semibold text-[#17202b]">申請額 {amountLabel(selectedPayout.requested_amount)}</p>
                                        <p className="mt-1">手数料 {amountLabel(selectedPayout.fee_amount)}</p>
                                        <p className="mt-1">純支払額 {amountLabel(selectedPayout.net_amount)}</p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3 text-sm text-[#48505a]">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">受取先</p>
                                        <p className="mt-1 font-semibold text-[#17202b]">{payoutMethodLabel(selectedPayout)}</p>
                                        {selectedPayout.stripe_connected_account?.payout_method === 'manual_bank_transfer' ? (
                                            <>
                                                <p className="mt-1">銀行 {selectedPayout.stripe_connected_account?.bank_name ?? '未設定'}</p>
                                                <p className="mt-1">支店 {selectedPayout.stripe_connected_account?.bank_branch_name ?? '未設定'}</p>
                                                <p className="mt-1">
                                                    口座 {formatBankAccountType(selectedPayout.stripe_connected_account?.bank_account_type)} / {selectedPayout.stripe_connected_account?.bank_account_number ?? '未設定'}
                                                </p>
                                                <p className="mt-1">名義 {selectedPayout.stripe_connected_account?.bank_account_holder_name ?? '未設定'}</p>
                                            </>
                                        ) : (
                                            <>
                                                <p className="mt-1">{selectedPayout.stripe_connected_account?.stripe_account_id ?? '未設定'}</p>
                                                <p className="mt-1">状態 {formatStripeStatus(selectedPayout.stripe_connected_account?.status)}</p>
                                            </>
                                        )}
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3 text-sm text-[#48505a]">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">処理ログ</p>
                                        <p className="mt-1 font-semibold text-[#17202b]">申請日時 {formatDateTime(selectedPayout.requested_at)}</p>
                                        <p className="mt-1">予定処理日 {formatDate(selectedPayout.scheduled_process_date)}</p>
                                        <p className="mt-1">処理日時 {formatDateTime(selectedPayout.processed_at)}</p>
                                        <p className="mt-1">失敗理由 {selectedPayout.failure_reason ?? 'なし'}</p>
                                    </div>
                                </div>

                                {selectedPayout.ledger_entries && selectedPayout.ledger_entries.length > 0 ? (
                                    <div className="mt-4 rounded-[18px] bg-[#101720] px-4 py-4">
                                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">台帳エントリ</p>
                                        <div className="mt-3 space-y-3">
                                            {selectedPayout.ledger_entries.map((entry) => (
                                                <div key={entry.id} className="rounded-[16px] bg-white/[0.04] px-4 py-3 text-sm text-slate-200">
                                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                                        <p className="font-semibold text-white">{entry.entry_type}</p>
                                                        <p>{entry.amount_signed.toLocaleString('ja-JP')}円</p>
                                                    </div>
                                                    <p className="mt-1 text-xs text-slate-400">
                                                        状態 {entry.status}
                                                        {' / '}
                                                        予約番号 {entry.booking_public_id ?? '未設定'}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                            </article>

                            <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">出金アクション</p>
                                <div className="mt-4 space-y-4">
                                    {selectedPayout.status === 'payout_requested' ? (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    void handleHold();
                                                }}
                                                disabled={isSubmittingHold}
                                                className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#f8f4ed] disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {isSubmittingHold ? '保留中...' : '保留にする'}
                                            </button>

                                            <label className="flex items-center gap-3 rounded-[18px] bg-[#f8f4ed] px-4 py-3 text-sm text-[#17202b]">
                                                <input
                                                    type="checkbox"
                                                    checked={forceProcess}
                                                    onChange={(event) => setForceProcess(event.target.checked)}
                                                    className="h-4 w-4 rounded border-[#c8b08b]"
                                                />
                                                予定日を無視して強制処理する
                                            </label>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    void handleProcess();
                                                }}
                                                disabled={isSubmittingProcess}
                                                className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140] disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {isSubmittingProcess
                                                    ? '処理中...'
                                                    : selectedPayout.stripe_connected_account?.payout_method === 'manual_bank_transfer'
                                                        ? '振込済みにする'
                                                        : 'Stripe送金を実行'}
                                            </button>
                                        </>
                                    ) : selectedPayout.status === 'held' ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                void handleRelease();
                                            }}
                                            disabled={isSubmittingRelease}
                                            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140] disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {isSubmittingRelease ? '解除中...' : '保留を解除'}
                                        </button>
                                    ) : (
                                        <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3 text-sm text-[#48505a]">
                                            現在の状態では追加操作はありません。
                                        </div>
                                    )}
                                </div>
                            </article>
                        </section>
                    ) : (
                        <section className="rounded-[28px] bg-white px-6 py-10 text-center shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                            <p className="text-sm leading-7 text-[#68707a]">
                                一覧から出金申請を選ぶと、ここに処理詳細とアクションが表示されます。
                            </p>
                        </section>
                    )}
                </aside>
            </div>
        </div>
    );
}
