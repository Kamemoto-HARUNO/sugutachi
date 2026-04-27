import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatDateTime, formatRejectionReason } from '../lib/therapist';
import type {
    AdminRefundRequestRecord,
    ApiEnvelope,
} from '../lib/types';

type RefundStatusFilter = 'all' | 'requested' | 'approved' | 'rejected' | 'processed';
type SortField = 'created_at' | 'requested_amount' | 'reviewed_at' | 'processed_at';
type SortDirection = 'asc' | 'desc';

function normalizeStatusFilter(value: string | null): RefundStatusFilter {
    if (value === 'requested' || value === 'approved' || value === 'rejected' || value === 'processed') {
        return value;
    }

    return 'all';
}

function normalizeSortField(value: string | null): SortField {
    if (value === 'requested_amount' || value === 'reviewed_at' || value === 'processed_at') {
        return value;
    }

    return 'created_at';
}

function normalizeSortDirection(value: string | null): SortDirection {
    return value === 'asc' ? 'asc' : 'desc';
}

function refundStatusLabel(status: string): string {
    switch (status) {
        case 'processed':
            return '処理完了';
        case 'approved':
            return '承認済み';
        case 'rejected':
            return '却下';
        default:
            return '申請中';
    }
}

function refundStatusTone(status: string): string {
    switch (status) {
        case 'processed':
            return 'bg-[#e8f4ea] text-[#24553a]';
        case 'approved':
            return 'bg-[#edf4ff] text-[#34557f]';
        case 'rejected':
            return 'bg-[#f8e8e5] text-[#8f4337]';
        default:
            return 'bg-[#fff3e3] text-[#8f5c22]';
    }
}

function amountLabel(value: number | null): string {
    if (value == null) {
        return '未設定';
    }

    return `${value.toLocaleString('ja-JP')}円`;
}

function buildSelectedLink(searchParams: URLSearchParams, publicId: string): string {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('selected', publicId);
    const query = nextParams.toString();

    return query ? `/admin/refund-requests?${query}` : '/admin/refund-requests';
}

export function AdminRefundRequestsPage() {
    const { token } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [refunds, setRefunds] = useState<AdminRefundRequestRecord[]>([]);
    const [pageError, setPageError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [bookingInput, setBookingInput] = useState(searchParams.get('booking_id') ?? '');
    const [requestedByInput, setRequestedByInput] = useState(searchParams.get('requested_by_account_id') ?? '');
    const [approvedAmount, setApprovedAmount] = useState('');
    const [rejectionReason, setRejectionReason] = useState('not_eligible');
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSubmittingApprove, setIsSubmittingApprove] = useState(false);
    const [isSubmittingReject, setIsSubmittingReject] = useState(false);

    const selectedId = searchParams.get('selected');
    const statusFilter = normalizeStatusFilter(searchParams.get('status'));
    const sortField = normalizeSortField(searchParams.get('sort'));
    const direction = normalizeSortDirection(searchParams.get('direction'));
    const bookingId = searchParams.get('booking_id')?.trim() ?? '';
    const requestedById = searchParams.get('requested_by_account_id')?.trim() ?? '';

    usePageTitle('返金申請管理');
    useToastOnMessage(successMessage, 'success');

    const selectedRefund = useMemo(
        () => refunds.find((refund) => refund.public_id === selectedId) ?? null,
        [refunds, selectedId],
    );

    const summary = useMemo(() => ({
        total: refunds.length,
        requested: refunds.filter((refund) => refund.status === 'requested').length,
        processed: refunds.filter((refund) => refund.status === 'processed').length,
        rejected: refunds.filter((refund) => refund.status === 'rejected').length,
        amountRequested: refunds.reduce((sum, refund) => sum + (refund.requested_amount ?? 0), 0),
    }), [refunds]);

    const loadRefunds = useCallback(async (refresh = false) => {
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

        if (bookingId) {
            params.set('booking_id', bookingId);
        }

        if (requestedById) {
            params.set('requested_by_account_id', requestedById);
        }

        params.set('sort', sortField);
        params.set('direction', direction);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminRefundRequestRecord[]>>(`/admin/refund-requests?${params.toString()}`, { token });
            setRefunds(unwrapData(payload));
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '返金申請一覧の取得に失敗しました。';

            setPageError(message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [bookingId, direction, requestedById, sortField, statusFilter, token]);

    useEffect(() => {
        void loadRefunds();
    }, [loadRefunds]);

    useEffect(() => {
        if (selectedRefund) {
            setApprovedAmount(selectedRefund.requested_amount?.toString() ?? '');
        }
    }, [selectedRefund]);

    function updateFilters(next: Partial<Record<'status' | 'sort' | 'direction' | 'booking_id' | 'requested_by_account_id' | 'selected', string | null>>) {
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

    async function handleApprove() {
        if (!token || !selectedRefund) {
            return;
        }

        setIsSubmittingApprove(true);
        setActionError(null);
        setSuccessMessage(null);

        const parsedAmount = Number.parseInt(approvedAmount, 10);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminRefundRequestRecord>>(`/admin/refund-requests/${selectedRefund.public_id}/approve`, {
                method: 'POST',
                token,
                body: Number.isNaN(parsedAmount) ? {} : { approved_amount: parsedAmount },
            });

            const updated = unwrapData(payload);
            setRefunds((current) => current.map((refund) => refund.public_id === updated.public_id ? updated : refund));
            setSuccessMessage('返金申請を承認しました。');
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '返金申請の承認に失敗しました。';

            setActionError(message);
        } finally {
            setIsSubmittingApprove(false);
        }
    }

    async function handleReject() {
        if (!token || !selectedRefund || !rejectionReason.trim()) {
            return;
        }

        setIsSubmittingReject(true);
        setActionError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminRefundRequestRecord>>(`/admin/refund-requests/${selectedRefund.public_id}/reject`, {
                method: 'POST',
                token,
                body: { reason_code: rejectionReason.trim() },
            });

            const updated = unwrapData(payload);
            setRefunds((current) => current.map((refund) => refund.public_id === updated.public_id ? updated : refund));
            setSuccessMessage('返金申請を却下しました。');
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '返金申請の却下に失敗しました。';

            setActionError(message);
        } finally {
            setIsSubmittingReject(false);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="返金申請を読み込み中" message="申請中の返金と処理状況を集約しています。" />;
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_16px_34px_rgba(2,6,23,0.14)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">REFUND OPERATIONS</p>
                        <h2 className="text-2xl font-semibold text-white sm:text-[2rem]">返金申請管理</h2>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            利用者からの返金申請を確認し、承認額の調整と却下判断を行います。
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            void loadRefunds(true);
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
                    { label: '申請中', value: summary.requested, hint: '要判断' },
                    { label: '処理完了', value: summary.processed, hint: 'Stripe 完了' },
                    { label: '却下', value: summary.rejected, hint: '返金なし' },
                    { label: '申請総額', value: `${summary.amountRequested.toLocaleString('ja-JP')}円`, hint: '一覧の requested_amount 合計' },
                ].map((item) => (
                    <article key={item.label} className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">{item.label}</p>
                        <p className="mt-3 text-3xl font-semibold text-white">{item.value}</p>
                        <p className="mt-2 text-sm text-slate-400">{item.hint}</p>
                    </article>
                ))}
            </section>

            <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">状態</span>
                        <select
                            value={statusFilter}
                            onChange={(event) => updateFilters({ status: event.target.value, selected: null })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="all">すべて</option>
                            <option value="requested">申請中</option>
                            <option value="approved">承認済み</option>
                            <option value="processed">処理完了</option>
                            <option value="rejected">却下</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">予約ID</span>
                        <input
                            value={bookingInput}
                            onChange={(event) => setBookingInput(event.target.value)}
                            onBlur={() => updateFilters({ booking_id: bookingInput.trim() || null, selected: null })}
                            placeholder="book_xxx"
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        />
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">申請者アカウント</span>
                        <input
                            value={requestedByInput}
                            onChange={(event) => setRequestedByInput(event.target.value)}
                            onBlur={() => updateFilters({ requested_by_account_id: requestedByInput.trim() || null, selected: null })}
                            placeholder="acc_xxx"
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
                            <option value="requested_amount">申請額</option>
                            <option value="reviewed_at">判断日時</option>
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
                    {refunds.length > 0 ? refunds.map((refund) => {
                        const isSelected = refund.public_id === selectedId;

                        return (
                            <Link
                                key={refund.public_id}
                                to={buildSelectedLink(searchParams, refund.public_id)}
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
                                            <h3 className="text-lg font-semibold text-[#17202b]">{refund.public_id}</h3>
                                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${refundStatusTone(refund.status)}`}>
                                                {refundStatusLabel(refund.status)}
                                            </span>
                                        </div>
                                        <p className="text-sm text-[#68707a]">予約 {refund.booking_public_id ?? '未設定'}</p>
                                        <p className="text-xs text-[#7d6852]">申請者 {refund.requested_by_account_id ?? '未設定'}</p>
                                    </div>

                                    <div className="text-right">
                                        <p className="text-lg font-semibold text-[#17202b]">{amountLabel(refund.requested_amount)}</p>
                                        <p className="mt-1 text-xs text-[#68707a]">承認額 {amountLabel(refund.approved_amount)}</p>
                                    </div>
                                </div>

                                <div className="mt-4 grid gap-3 md:grid-cols-3">
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">理由コード</p>
                                        <p className="mt-1 text-sm font-semibold text-[#17202b]">{refund.reason_code ?? '未設定'}</p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">判断日時</p>
                                        <p className="mt-1 text-sm font-semibold text-[#17202b]">{formatDateTime(refund.reviewed_at)}</p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">処理日時</p>
                                        <p className="mt-1 text-sm font-semibold text-[#17202b]">{formatDateTime(refund.processed_at)}</p>
                                    </div>
                                </div>
                            </Link>
                        );
                    }) : (
                        <section className="rounded-[28px] bg-white px-6 py-10 text-center shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                            <p className="text-sm leading-7 text-[#68707a]">条件に合う返金申請はありません。</p>
                        </section>
                    )}
                </section>

                <aside className="space-y-5">
                    {actionError ? (
                        <section className="rounded-[24px] border border-[#f1d4b5] bg-[#fff4e8] px-5 py-4 text-sm text-[#9a4b35]">
                            {actionError}
                        </section>
                    ) : null}

                    {selectedRefund ? (
                        <section className="space-y-5">
                            <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">REFUND DETAIL</p>
                                        <h3 className="mt-2 text-2xl font-semibold text-[#17202b]">{selectedRefund.public_id}</h3>
                                        <p className="mt-2 text-sm text-[#68707a]">予約 {selectedRefund.booking_public_id ?? '未設定'}</p>
                                        <p className="mt-1 text-xs text-[#7d6852]">申請者 {selectedRefund.requested_by_account_id ?? '未設定'}</p>
                                    </div>
                                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${refundStatusTone(selectedRefund.status)}`}>
                                        {refundStatusLabel(selectedRefund.status)}
                                    </span>
                                </div>

                                <div className="mt-5 grid gap-3">
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3 text-sm text-[#48505a]">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">金額</p>
                                        <p className="mt-1 font-semibold text-[#17202b]">申請額 {amountLabel(selectedRefund.requested_amount)}</p>
                                        <p className="mt-1">承認額 {amountLabel(selectedRefund.approved_amount)}</p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3 text-sm text-[#48505a]">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">判断ログ</p>
                                        <p className="mt-1 font-semibold text-[#17202b]">レビュー担当 {selectedRefund.reviewed_by_account_id ?? '未設定'}</p>
                                        <p className="mt-1">レビュー日時 {formatDateTime(selectedRefund.reviewed_at)}</p>
                                        <p className="mt-1">処理日時 {formatDateTime(selectedRefund.processed_at)}</p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3 text-sm text-[#48505a]">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">理由コード</p>
                                        <p className="mt-1 font-semibold text-[#17202b]">{formatRejectionReason(selectedRefund.reason_code)}</p>
                                        <p className="mt-1">Stripe refund {selectedRefund.stripe_refund_id ?? '未発行'}</p>
                                    </div>
                                </div>
                            </article>

                            <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">REFUND ACTION</p>
                                {selectedRefund.status === 'requested' ? (
                                    <div className="mt-4 space-y-4">
                                        <label className="block space-y-2">
                                            <span className="text-sm font-semibold text-[#17202b]">承認額</span>
                                            <input
                                                type="number"
                                                inputMode="numeric"
                                                min={1}
                                                value={approvedAmount}
                                                onChange={(event) => setApprovedAmount(event.target.value)}
                                                placeholder={selectedRefund.requested_amount?.toString() ?? '5000'}
                                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                            />
                                        </label>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                void handleApprove();
                                            }}
                                            disabled={isSubmittingApprove}
                                            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140] disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {isSubmittingApprove ? '承認中...' : '返金を承認'}
                                        </button>

                                        <label className="block space-y-2">
                                            <span className="text-sm font-semibold text-[#17202b]">却下理由コード</span>
                                            <input
                                                value={rejectionReason}
                                                onChange={(event) => setRejectionReason(event.target.value)}
                                                placeholder="not_eligible"
                                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                            />
                                        </label>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                void handleReject();
                                            }}
                                            disabled={isSubmittingReject || !rejectionReason.trim()}
                                            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#f8f4ed] disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {isSubmittingReject ? '却下中...' : '申請を却下'}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="mt-4 rounded-[18px] bg-[#f8f4ed] px-4 py-3 text-sm text-[#48505a]">
                                        この返金申請はすでに判断済みです。
                                    </div>
                                )}
                            </article>
                        </section>
                    ) : (
                        <section className="rounded-[28px] bg-white px-6 py-10 text-center shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                            <p className="text-sm leading-7 text-[#68707a]">
                                一覧から返金申請を選ぶと、ここに詳細と判断アクションが表示されます。
                            </p>
                        </section>
                    )}
                </aside>
            </div>
        </div>
    );
}
