import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatCurrency } from '../lib/discovery';
import { formatDate, formatDateTime, formatStripeStatus } from '../lib/therapist';
import type {
    ApiEnvelope,
    PayoutRequestRecord,
    StripeConnectedAccountStatus,
    TherapistBalanceRecord,
    TherapistLedgerEntryRecord,
    TherapistLedgerPayload,
} from '../lib/types';

function payoutStatusLabel(status: string): string {
    switch (status) {
        case 'payout_requested':
            return '申請受付';
        case 'held':
            return '保留';
        case 'processing':
            return '処理中';
        case 'paid':
            return '支払済み';
        case 'failed':
            return '失敗';
        default:
            return status;
    }
}

function payoutStatusTone(status: string): string {
    switch (status) {
        case 'payout_requested':
            return 'bg-[#fff2dd] text-[#8b5a16]';
        case 'held':
            return 'bg-[#f7e7e3] text-[#8c4738]';
        case 'processing':
            return 'bg-[#eaf2ff] text-[#30527a]';
        case 'paid':
            return 'bg-[#e9f4ea] text-[#24553a]';
        case 'failed':
            return 'bg-[#f7e7e3] text-[#8c4738]';
        default:
            return 'bg-[#f1efe8] text-[#48505a]';
    }
}

function ledgerStatusLabel(status: string): string {
    switch (status) {
        case 'pending':
            return '保留中';
        case 'available':
            return '出金可能';
        case 'payout_requested':
            return '出金申請中';
        case 'paid':
            return '支払済み';
        case 'held':
            return '保留';
        default:
            return status;
    }
}

function ledgerEntryTypeLabel(type: string): string {
    switch (type) {
        case 'booking_sale':
            return '予約売上';
        case 'refund_adjustment':
            return '返金調整';
        default:
            return type;
    }
}

function buildPayoutHint(
    stripeStatus: StripeConnectedAccountStatus | null,
    balance: TherapistBalanceRecord | null,
): string {
    if (!stripeStatus?.has_account) {
        return 'まずは受取口座を登録して、振込先を設定します。';
    }

    if (!stripeStatus.is_payout_ready || stripeStatus.status !== 'active') {
        return '受取口座の入力がまだ完了していません。銀行名、支店名、口座情報を確認してください。';
    }

    if ((balance?.active_payout_request_count ?? 0) > 0) {
        return '進行中の出金申請があります。処理日までは新しい申請を受け付けません。';
    }

    if ((balance?.requestable_amount ?? 0) <= 0) {
        return 'いま出金できる残高はありません。売上が解放されるとここに反映されます。';
    }

    return 'いま出金できる残高をまとめて申請できます。申請後は次回の処理日まで結果をお待ちください。';
}

function HelpTooltipButton({
    label,
    body,
}: {
    label: string;
    body: string;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLSpanElement | null>(null);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        function handlePointerDown(event: MouseEvent) {
            if (!containerRef.current?.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }

        document.addEventListener('mousedown', handlePointerDown);

        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
        };
    }, [isOpen]);

    return (
        <span
            ref={containerRef}
            className="relative inline-flex items-center"
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
        >
            <button
                type="button"
                aria-label={label}
                aria-expanded={isOpen}
                onClick={() => setIsOpen((current) => !current)}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#d2b179]/50 text-[11px] font-semibold text-[#d2b179] transition hover:border-[#d2b179] hover:text-white"
            >
                ?
            </button>
            <span
                className={`pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-64 -translate-x-1/2 rounded-2xl border border-white/10 bg-[#101824] px-4 py-3 text-left text-xs font-normal leading-6 text-slate-200 shadow-[0_18px_40px_rgba(15,23,42,0.28)] transition ${
                    isOpen ? 'visible opacity-100' : 'invisible opacity-0'
                }`}
                role="tooltip"
            >
                {body}
            </span>
        </span>
    );
}

export function TherapistBalancePage() {
    const { token } = useAuth();
    const [balance, setBalance] = useState<TherapistBalanceRecord | null>(null);
    const [ledgerEntries, setLedgerEntries] = useState<TherapistLedgerEntryRecord[]>([]);
    const [payoutRequests, setPayoutRequests] = useState<PayoutRequestRecord[]>([]);
    const [stripeStatus, setStripeStatus] = useState<StripeConnectedAccountStatus | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSubmittingPayout, setIsSubmittingPayout] = useState(false);

    usePageTitle('売上と出金');
    useToastOnMessage(successMessage, 'success');
    useToastOnMessage(error, 'error');

    const loadData = useCallback(async (nextIsRefresh = false) => {
        if (!token) {
            return;
        }

        if (nextIsRefresh) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }

        try {
            const [balancePayload, ledgerPayload, payoutPayload, stripePayload] = await Promise.all([
                apiRequest<ApiEnvelope<TherapistBalanceRecord>>('/me/therapist/balance', { token }),
                apiRequest<ApiEnvelope<TherapistLedgerPayload>>('/me/therapist/ledger', { token }),
                apiRequest<ApiEnvelope<PayoutRequestRecord[]>>('/me/therapist/payout-requests', { token }),
                apiRequest<ApiEnvelope<StripeConnectedAccountStatus>>('/me/stripe-connect', { token }),
            ]);

            setBalance(unwrapData(balancePayload));
            setLedgerEntries(unwrapData(ledgerPayload).entries);
            setPayoutRequests(unwrapData(payoutPayload));
            setStripeStatus(unwrapData(stripePayload));
            setError(null);
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '売上情報の取得に失敗しました。';

            setError(message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [token]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const recentEntries = useMemo(() => ledgerEntries.slice(0, 6), [ledgerEntries]);
    const recentPayoutRequests = useMemo(() => payoutRequests.slice(0, 5), [payoutRequests]);

    const canRequestPayout = Boolean(
        stripeStatus?.has_account
        && stripeStatus.is_payout_ready
        && stripeStatus.status === 'active'
        && (balance?.requestable_amount ?? 0) > 0
        && (balance?.active_payout_request_count ?? 0) === 0,
    );

    async function requestPayout() {
        if (!token || !canRequestPayout || isSubmittingPayout) {
            return;
        }

        setIsSubmittingPayout(true);
        setError(null);
        setSuccessMessage(null);

        try {
            await apiRequest<ApiEnvelope<PayoutRequestRecord>>('/me/therapist/payout-requests', {
                method: 'POST',
                token,
                body: {
                    requested_amount: balance?.requestable_amount ?? 0,
                },
            });

            await loadData(true);
            setSuccessMessage('出金申請を受け付けました。次回処理予定日までこの画面で状況を確認できます。');
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '出金申請に失敗しました。';

            setError(message);
        } finally {
            setIsSubmittingPayout(false);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="売上情報を読み込み中" message="残高、出金申請、台帳の状況をまとめています。" />;
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[32px] bg-[linear-gradient(117deg,#17202b_0%,#243447_52%,#2b4158_100%)] p-7 text-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">売上管理</p>
                        <div className="space-y-2">
                            <h1 className="text-3xl font-semibold">売上と出金</h1>
                            <p className="max-w-3xl text-sm leading-7 text-slate-300">
                                予約完了後の売上状況、出金できる金額、進行中の出金申請をここでまとめて確認できます。
                                出金申請は現在、出金可能額をまとめて受け付けており、処理日は 5日・15日・25日 のサイクルで管理しています。
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
                            to="/therapist/stripe-connect"
                            className="inline-flex items-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8"
                        >
                            受取設定へ
                        </Link>
                        <button
                            type="button"
                            onClick={() => {
                                void requestPayout();
                            }}
                            disabled={!canRequestPayout || isSubmittingPayout}
                            className="inline-flex items-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isSubmittingPayout ? '申請中...' : '出金申請する'}
                        </button>
                    </div>
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                    { label: '出金可能額', value: formatCurrency(balance?.requestable_amount), hint: 'いま出金申請に使える残高' },
                    { label: '保留中売上', value: formatCurrency(balance?.pending_amount), hint: '完了後3日間の確認期間中', helpBody: '予約が完了した売上は、返金やトラブル確認のため3日間だけ保留されます。期間を過ぎると自動で出金可能額へ移ります。' },
                    { label: '申請中', value: formatCurrency(balance?.payout_requested_amount), hint: '現在処理を待っている出金申請' },
                    { label: '累計支払済み', value: formatCurrency(balance?.paid_amount), hint: 'これまでに支払済みになった総額' },
                ].map((item) => (
                    <article
                        key={item.label}
                        className="rounded-[24px] border border-white/10 bg-white/5 p-5 shadow-[0_12px_28px_rgba(15,23,42,0.08)]"
                    >
                        <div className="flex items-center gap-2">
                            <p className="text-xs font-semibold tracking-wide text-[#d2b179]">{item.label}</p>
                            {item.helpBody ? (
                                <HelpTooltipButton
                                    label={`${item.label}について`}
                                    body={item.helpBody}
                                />
                            ) : null}
                        </div>
                        <p className="mt-3 text-3xl font-semibold text-white">{item.value}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-300">{item.hint}</p>
                    </article>
                ))}
            </section>



            <section className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.85fr)]">
                <div className="space-y-6">
                    <article className="rounded-[28px] bg-white p-5 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">出金状況</p>
                                <h2 className="mt-2 text-2xl font-semibold text-[#17202b]">出金準備状況</h2>
                            </div>
                            <div className="rounded-2xl bg-[#f8f4ed] px-4 py-3 text-right">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">受取設定</p>
                                <p className="mt-2 text-lg font-semibold text-[#17202b]">{formatStripeStatus(stripeStatus?.status)}</p>
                            </div>
                        </div>

                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                            <div className="rounded-[24px] bg-[#fffaf3] p-4">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">受取設定</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                    {stripeStatus?.is_payout_ready ? '出金申請に進めます' : '口座入力が必要です'}
                                </p>
                                <p className="mt-2 text-sm leading-7 text-[#68707a]">{buildPayoutHint(stripeStatus, balance)}</p>
                            </div>
                            <div className="rounded-[24px] bg-[#fffaf3] p-4">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">次回処理予定日</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                    {balance?.next_scheduled_process_date ? formatDate(balance.next_scheduled_process_date) : '未定'}
                                </p>
                                <p className="mt-2 text-sm leading-7 text-[#68707a]">
                                    進行中の申請がある場合、その申請に紐づく次回処理日を表示します。
                                </p>
                            </div>
                        </div>
                    </article>

                    <article className="rounded-[28px] bg-white p-5 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">申請履歴</p>
                                <h2 className="mt-2 text-2xl font-semibold text-[#17202b]">最近の出金申請</h2>
                            </div>
                            <span className="text-sm text-[#68707a]">{recentPayoutRequests.length}件表示</span>
                        </div>

                        {recentPayoutRequests.length > 0 ? (
                            <div className="mt-5 grid gap-4">
                                {recentPayoutRequests.map((request) => (
                                    <article key={request.public_id} className="rounded-[24px] bg-[#fffcf7] p-4">
                                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                            <div className="space-y-2">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${payoutStatusTone(request.status)}`}>
                                                        {payoutStatusLabel(request.status)}
                                                    </span>
                                                </div>
                                                <p className="text-lg font-semibold text-[#17202b]">{formatCurrency(request.net_amount)}</p>
                                                <p className="text-sm text-[#68707a]">
                                                    申請 {formatDateTime(request.requested_at)} / 処理予定 {formatDate(request.scheduled_process_date)}
                                                </p>
                                            </div>

                                            <div className="grid gap-2 text-sm text-[#48505a]">
                                                <div className="flex items-center justify-between gap-4">
                                                    <span>申請額</span>
                                                    <span className="font-semibold text-[#17202b]">{formatCurrency(request.requested_amount)}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-4">
                                                    <span>手数料</span>
                                                    <span className="font-semibold text-[#17202b]">{formatCurrency(request.fee_amount)}</span>
                                                </div>
                                                {request.failure_reason ? (
                                                    <p className="max-w-xs text-xs leading-6 text-[#9a4b35]">理由: {request.failure_reason}</p>
                                                ) : null}
                                            </div>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        ) : (
                            <div className="mt-5 rounded-[24px] border border-dashed border-[#e5d7c0] bg-[#fffaf3] p-6 text-center">
                                <p className="text-sm font-semibold text-[#17202b]">まだ出金申請はありません。</p>
                                <p className="mt-2 text-sm leading-7 text-[#68707a]">
                                    出金可能額がたまったら、この画面から申請して履歴を確認できます。
                                </p>
                            </div>
                        )}
                    </article>
                </div>

                <div className="space-y-6">
                    <article className="rounded-[28px] border border-white/10 bg-white/5 p-6">
                        <div>
                            <p className="text-xs font-semibold tracking-wide text-[#d2b179]">台帳サマリー</p>
                            <h2 className="mt-2 text-2xl font-semibold text-white">最近の台帳</h2>
                        </div>

                        {recentEntries.length > 0 ? (
                            <div className="mt-5 grid gap-3">
                                {recentEntries.map((entry) => (
                                    <article key={entry.id} className="rounded-[22px] border border-white/10 bg-[#17202b] p-4">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="space-y-2">
                                                <p className="text-sm font-semibold text-white">{ledgerEntryTypeLabel(entry.entry_type)}</p>
                                            </div>
                                            <p className={`text-sm font-semibold ${
                                                entry.amount_signed >= 0 ? 'text-emerald-200' : 'text-rose-200'
                                            }`}>
                                                {entry.amount_signed >= 0 ? '+' : '-'}{formatCurrency(Math.abs(entry.amount_signed))}
                                            </p>
                                        </div>

                                        <div className="mt-4 grid gap-2 text-xs text-slate-400">
                                            <div className="flex items-center justify-between gap-4">
                                                <span>状態</span>
                                                <span className="text-slate-200">{ledgerStatusLabel(entry.status)}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-4">
                                                <span>記録日時</span>
                                                <span className="text-slate-200">{formatDateTime(entry.created_at)}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-4">
                                                <span>解放予定</span>
                                                <span className="text-slate-200">{formatDateTime(entry.available_at)}</span>
                                            </div>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        ) : (
                            <div className="mt-5 rounded-[24px] border border-dashed border-white/10 bg-[#17202b] p-6 text-center">
                                <p className="text-sm font-semibold text-white">まだ台帳エントリはありません。</p>
                                <p className="mt-2 text-sm leading-7 text-slate-300">
                                    予約完了後に売上が発生すると、ここに保留中・出金可能・支払済みの履歴が積み上がっていきます。
                                </p>
                            </div>
                        )}
                    </article>

                    <article className="rounded-[28px] border border-white/10 bg-white/5 p-6">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">次のおすすめ</p>
                        <div className="mt-3 space-y-3">
                            <h2 className="text-2xl font-semibold text-white">売上まわりの次の一手</h2>
                            <p className="text-sm leading-7 text-slate-300">
                                出金できない場合は受取口座の入力不足か、売上の解放待ちが主な原因です。必要なら受取設定と予約完了状況を見直します。
                            </p>
                        </div>

                        <div className="mt-5 grid gap-3">
                            <Link
                                to="/therapist/stripe-connect"
                                className="inline-flex items-center justify-center rounded-full bg-white px-4 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#f6ead6]"
                            >
                                受取設定を確認
                            </Link>
                            <Link
                                to="/therapist/bookings"
                                className="inline-flex items-center justify-center rounded-full border border-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/6"
                            >
                                予約一覧を確認
                            </Link>
                        </div>
                    </article>
                </div>
            </section>
        </div>
    );
}
