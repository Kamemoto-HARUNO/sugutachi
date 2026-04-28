import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatDate, formatDateTime } from '../lib/therapist';
import type {
    AdminStripeDisputeRecord,
    ApiEnvelope,
} from '../lib/types';

type StatusGroupFilter = 'all' | 'open' | 'closed';
type DisputeStatusFilter = 'all' | 'needs_response' | 'under_review' | 'won' | 'lost';
type SortField = 'created_at' | 'updated_at' | 'evidence_due_by' | 'amount';
type SortDirection = 'asc' | 'desc';

function normalizeStatusGroupFilter(value: string | null): StatusGroupFilter {
    if (value === 'open' || value === 'closed') {
        return value;
    }

    return 'all';
}

function normalizeDisputeStatusFilter(value: string | null): DisputeStatusFilter {
    if (value === 'needs_response' || value === 'under_review' || value === 'won' || value === 'lost') {
        return value;
    }

    return 'all';
}

function normalizeSortField(value: string | null): SortField {
    if (value === 'updated_at' || value === 'evidence_due_by' || value === 'amount') {
        return value;
    }

    return 'created_at';
}

function normalizeSortDirection(value: string | null): SortDirection {
    return value === 'asc' ? 'asc' : 'desc';
}

function disputeStatusLabel(status: string): string {
    switch (status) {
        case 'needs_response':
            return '要回答';
        case 'under_review':
            return '審査中';
        case 'won':
            return '勝訴';
        case 'lost':
            return '敗訴';
        default:
            return status;
    }
}

function disputeStatusTone(status: string): string {
    switch (status) {
        case 'won':
            return 'bg-[#e8f4ea] text-[#24553a]';
        case 'under_review':
            return 'bg-[#edf4ff] text-[#34557f]';
        case 'lost':
            return 'bg-[#f8e8e5] text-[#8f4337]';
        default:
            return 'bg-[#fff3e3] text-[#8f5c22]';
    }
}

function amountLabel(value: number): string {
    return `${value.toLocaleString('ja-JP')}円`;
}

function buildSelectedLink(searchParams: URLSearchParams, disputeId: string): string {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('selected', disputeId);
    const query = nextParams.toString();

    return query ? `/admin/stripe-disputes?${query}` : '/admin/stripe-disputes';
}

export function AdminStripeDisputesPage() {
    const { token } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [disputes, setDisputes] = useState<AdminStripeDisputeRecord[]>([]);
    const [pageError, setPageError] = useState<string | null>(null);
    const [bookingInput, setBookingInput] = useState(searchParams.get('booking_id') ?? '');
    const [therapistInput, setTherapistInput] = useState(searchParams.get('therapist_account_id') ?? '');
    const [evidenceDueToInput, setEvidenceDueToInput] = useState(searchParams.get('evidence_due_to') ?? '');
    const [queryInput, setQueryInput] = useState(searchParams.get('q') ?? '');
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const selectedId = searchParams.get('selected');
    const statusGroupFilter = normalizeStatusGroupFilter(searchParams.get('status_group'));
    const statusFilter = normalizeDisputeStatusFilter(searchParams.get('status'));
    const sortField = normalizeSortField(searchParams.get('sort'));
    const direction = normalizeSortDirection(searchParams.get('direction'));
    const bookingId = searchParams.get('booking_id')?.trim() ?? '';
    const therapistAccountId = searchParams.get('therapist_account_id')?.trim() ?? '';
    const evidenceDueTo = searchParams.get('evidence_due_to')?.trim() ?? '';
    const query = searchParams.get('q')?.trim() ?? '';

    usePageTitle('チャージバック管理');

    const selectedDispute = useMemo(
        () => disputes.find((dispute) => dispute.stripe_dispute_id === selectedId) ?? null,
        [disputes, selectedId],
    );

    const summary = useMemo(() => ({
        total: disputes.length,
        open: disputes.filter((dispute) => dispute.status === 'needs_response' || dispute.status === 'under_review').length,
        needsResponse: disputes.filter((dispute) => dispute.status === 'needs_response').length,
        lost: disputes.filter((dispute) => dispute.status === 'lost').length,
        totalAmount: disputes.reduce((sum, dispute) => sum + dispute.amount, 0),
    }), [disputes]);

    const loadDisputes = useCallback(async (refresh = false) => {
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

        if (statusGroupFilter !== 'all') {
            params.set('status_group', statusGroupFilter);
        }

        if (statusFilter !== 'all') {
            params.set('status', statusFilter);
        }

        if (bookingId) {
            params.set('booking_id', bookingId);
        }

        if (therapistAccountId) {
            params.set('therapist_account_id', therapistAccountId);
        }

        if (evidenceDueTo) {
            params.set('evidence_due_to', evidenceDueTo);
        }

        if (query) {
            params.set('q', query);
        }

        params.set('sort', sortField);
        params.set('direction', direction);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminStripeDisputeRecord[]>>(`/admin/stripe-disputes?${params.toString()}`, { token });
            setDisputes(unwrapData(payload));
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : 'チャージバック一覧の取得に失敗しました。';

            setPageError(message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [bookingId, direction, evidenceDueTo, query, sortField, statusFilter, statusGroupFilter, therapistAccountId, token]);

    useEffect(() => {
        void loadDisputes();
    }, [loadDisputes]);

    function updateFilters(next: Partial<Record<'status_group' | 'status' | 'booking_id' | 'therapist_account_id' | 'evidence_due_to' | 'q' | 'sort' | 'direction' | 'selected', string | null>>) {
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

    if (isLoading) {
        return <LoadingScreen title="チャージバック一覧を読み込み中" message="チャージバックと証跡期限を集約しています。" />;
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_16px_34px_rgba(2,6,23,0.14)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">チャージバック監視</p>
                        <h2 className="text-2xl font-semibold text-white sm:text-[2rem]">チャージバック管理</h2>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            期限が近いチャージバック、予約単位の関連情報、勝敗結果を一覧で監視できます。
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            void loadDisputes(true);
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
                    { label: 'オープン', value: summary.open, hint: '要監視中' },
                    { label: '要回答', value: summary.needsResponse, hint: '証跡提出が必要' },
                    { label: '敗訴', value: summary.lost, hint: '損失確定' },
                    { label: '争議総額', value: amountLabel(summary.totalAmount), hint: '一覧の amount 合計' },
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
                        <span className="text-sm font-semibold text-[#17202b]">ステータス群</span>
                        <select
                            value={statusGroupFilter}
                            onChange={(event) => updateFilters({ status_group: event.target.value, selected: null })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="all">すべて</option>
                            <option value="open">オープン</option>
                            <option value="closed">クローズ</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">詳細ステータス</span>
                        <select
                            value={statusFilter}
                            onChange={(event) => updateFilters({ status: event.target.value, selected: null })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="all">すべて</option>
                            <option value="needs_response">要回答</option>
                            <option value="under_review">審査中</option>
                            <option value="won">勝訴</option>
                            <option value="lost">敗訴</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">予約ID</span>
                        <input
                            value={bookingInput}
                            onChange={(event) => setBookingInput(event.target.value)}
                            onBlur={() => updateFilters({ booking_id: bookingInput.trim() || null, selected: null })}
                            placeholder="予約番号で絞り込み"
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition placeholder:text-[#9aa3ad] focus:border-[#b5894d]"
                        />
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">タチキャスト</span>
                        <input
                            value={therapistInput}
                            onChange={(event) => setTherapistInput(event.target.value)}
                            onBlur={() => updateFilters({ therapist_account_id: therapistInput.trim() || null, selected: null })}
                            placeholder="会員番号で絞り込み"
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition placeholder:text-[#9aa3ad] focus:border-[#b5894d]"
                        />
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">証跡期限</span>
                        <input
                            type="date"
                            value={evidenceDueToInput}
                            onChange={(event) => setEvidenceDueToInput(event.target.value)}
                            onBlur={() => updateFilters({ evidence_due_to: evidenceDueToInput || null, selected: null })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        />
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">検索</span>
                        <input
                            value={queryInput}
                            onChange={(event) => setQueryInput(event.target.value)}
                            onBlur={() => updateFilters({ q: queryInput.trim() || null, selected: null })}
                            placeholder="チャージバック番号 / 予約番号 / 決済番号"
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition placeholder:text-[#9aa3ad] focus:border-[#b5894d]"
                        />
                    </label>

                    <div className="grid gap-3 sm:grid-cols-2 xl:col-span-2">
                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-[#17202b]">並び順</span>
                            <select
                                value={sortField}
                                onChange={(event) => updateFilters({ sort: event.target.value, selected: null })}
                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                            >
                                <option value="created_at">作成日時</option>
                                <option value="updated_at">更新日時</option>
                                <option value="evidence_due_by">証跡期限</option>
                                <option value="amount">金額</option>
                            </select>
                        </label>

                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-[#17202b]">方向</span>
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
                </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="rounded-[28px] bg-white p-5 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                    <div className="flex items-center justify-between gap-4 border-b border-[#ece3d4] pb-4">
                        <div>
                            <h3 className="text-lg font-semibold text-[#17202b]">争議一覧</h3>
                            <p className="mt-1 text-sm text-[#68707a]">期限と予約単位の影響範囲を優先して見られます。</p>
                        </div>
                        <p className="text-sm font-semibold text-[#7d6852]">{disputes.length}件</p>
                    </div>

                    <div className="mt-4 space-y-3">
                        {disputes.length > 0 ? disputes.map((dispute) => {
                            const isSelected = dispute.stripe_dispute_id === selectedId;

                            return (
                                <Link
                                    key={dispute.stripe_dispute_id}
                                    to={buildSelectedLink(searchParams, dispute.stripe_dispute_id)}
                                    className={`block rounded-[24px] border px-4 py-4 transition ${
                                        isSelected
                                            ? 'border-[#b5894d] bg-[#fff8ef] shadow-[0_14px_30px_rgba(181,137,77,0.16)]'
                                            : 'border-[#ece3d4] bg-[#fffcf6] hover:border-[#d8c2a0] hover:bg-[#fff8ef]'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-base font-semibold text-[#17202b]">チャージバック番号 {dispute.stripe_dispute_id}</p>
                                            <p className="mt-1 text-xs text-[#7d6852]">予約番号 {dispute.booking_public_id ?? '未設定'}</p>
                                        </div>
                                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${disputeStatusTone(dispute.status)}`}>
                                            {disputeStatusLabel(dispute.status)}
                                        </span>
                                    </div>

                                    <div className="mt-3 grid gap-2 text-sm text-[#55606d] sm:grid-cols-2">
                                        <p>金額: <span className="font-medium text-[#17202b]">{amountLabel(dispute.amount)}</span></p>
                                        <p>期限: <span className="font-medium text-[#17202b]">{formatDate(dispute.evidence_due_by)}</span></p>
                                        <p>理由: <span className="font-medium text-[#17202b]">{dispute.reason ?? '未設定'}</span></p>
                                        <p>決済ID: <span className="font-medium text-[#17202b]">{dispute.payment_intent?.stripe_payment_intent_id ?? '未設定'}</span></p>
                                    </div>
                                </Link>
                            );
                        }) : (
                            <div className="rounded-[24px] border border-dashed border-[#d9c9ae] bg-[#fffdf8] px-5 py-8 text-center text-sm text-[#7d6852]">
                                条件に合うチャージバック案件はありません。
                            </div>
                        )}
                    </div>
                </div>

                <div className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                    {selectedDispute ? (
                        <div className="space-y-6">
                            <div className="flex flex-col gap-4 border-b border-[#ece3d4] pb-5 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                    <p className="text-xs font-semibold tracking-wide text-[#b5894d]">案件詳細</p>
                                    <h3 className="mt-2 text-2xl font-semibold text-[#17202b]">チャージバック番号 {selectedDispute.stripe_dispute_id}</h3>
                                    <p className="mt-2 text-sm text-[#68707a]">予約番号 {selectedDispute.booking_public_id ?? '未設定'}</p>
                                    <p className="mt-1 text-xs text-[#7d6852]">作成 {formatDateTime(selectedDispute.created_at)}</p>
                                </div>

                                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${disputeStatusTone(selectedDispute.status)}`}>
                                    {disputeStatusLabel(selectedDispute.status)}
                                </span>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <article className="rounded-[22px] border border-[#ece3d4] bg-[#fffcf6] p-4 text-sm text-[#55606d]">
                                    <p className="text-xs font-semibold tracking-wide text-[#b5894d]">争議情報</p>
                                    <p className="mt-2 font-semibold text-[#17202b]">{amountLabel(selectedDispute.amount)}</p>
                                    <p className="mt-1">理由 {selectedDispute.reason ?? '未設定'}</p>
                                    <p className="mt-1">結果 {selectedDispute.outcome ?? '未確定'}</p>
                                    <p className="mt-1">証跡期限 {formatDateTime(selectedDispute.evidence_due_by)}</p>
                                </article>

                                <article className="rounded-[22px] border border-[#ece3d4] bg-[#fffcf6] p-4 text-sm text-[#55606d]">
                                    <p className="text-xs font-semibold tracking-wide text-[#b5894d]">関連決済</p>
                                    <p className="mt-2 font-semibold text-[#17202b]">{selectedDispute.payment_intent?.stripe_payment_intent_id ?? '未設定'}</p>
                                    <p className="mt-1">PaymentIntent 状態 {selectedDispute.payment_intent?.status ?? '未設定'}</p>
                                    <p className="mt-1">Stripe event {selectedDispute.last_stripe_event_id ?? '未設定'}</p>
                                    <p className="mt-1">更新 {formatDateTime(selectedDispute.updated_at)}</p>
                                </article>

                                <article className="rounded-[22px] border border-[#ece3d4] bg-[#fffcf6] p-4 text-sm text-[#55606d]">
                                    <p className="text-xs font-semibold tracking-wide text-[#b5894d]">関連予約</p>
                                    <p className="mt-2 font-semibold text-[#17202b]">{selectedDispute.booking_public_id ?? '未設定'}</p>
                                    <p className="mt-1">利用者会員番号 {selectedDispute.user_account_id ?? '未設定'}</p>
                                    <p className="mt-1">タチキャスト会員番号 {selectedDispute.therapist_account_id ?? '未設定'}</p>
                                    {selectedDispute.booking_public_id ? (
                                        <Link className="mt-3 inline-flex text-sm font-semibold text-[#8f5c22] hover:text-[#6f4718]" to={`/admin/bookings/${selectedDispute.booking_public_id}`}>
                                            予約詳細へ
                                        </Link>
                                    ) : null}
                                </article>

                                <article className="rounded-[22px] border border-[#ece3d4] bg-[#fffcf6] p-4 text-sm text-[#55606d]">
                                    <p className="text-xs font-semibold tracking-wide text-[#b5894d]">運営メモ</p>
                                    <p className="mt-2 leading-7 text-[#17202b]">
                                        この画面ではチャージバックの優先順位づけと関連予約の確認を行えます。証跡提出や決済事業者への回答は、実運用フローに合わせて別途処理してください。
                                    </p>
                                </article>
                            </div>
                        </div>
                    ) : (
                        <div className="flex min-h-[420px] items-center justify-center rounded-[24px] border border-dashed border-[#d9c9ae] bg-[#fffdf8] px-6 text-center text-sm leading-7 text-[#7d6852]">
                            左の一覧から案件を選ぶと、関連予約と期限情報を確認できます。
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
