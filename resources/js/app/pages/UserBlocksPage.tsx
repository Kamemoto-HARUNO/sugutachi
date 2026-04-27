import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatDateTime } from '../lib/therapist';
import type {
    AccountBlockRecord,
    ApiEnvelope,
} from '../lib/types';

type ReasonFilter = 'all' | 'unsafe' | 'external_contact' | 'boundary_violation';

function normalizeReasonFilter(value: string | null): ReasonFilter {
    if (value === 'unsafe' || value === 'external_contact' || value === 'boundary_violation') {
        return value;
    }

    return 'all';
}

function blockReasonLabel(reasonCode: string | null | undefined): string {
    switch (reasonCode) {
        case 'unsafe':
            return '安全上の不安';
        case 'external_contact':
            return '連絡先交換の誘導';
        case 'boundary_violation':
            return '境界違反';
        default:
            return reasonCode ?? '未設定';
    }
}

export function UserBlocksPage() {
    const { token } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [blocks, setBlocks] = useState<AccountBlockRecord[]>([]);
    const [query, setQuery] = useState(searchParams.get('q') ?? '');
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [pendingBlockId, setPendingBlockId] = useState<number | null>(null);

    const reasonFilter = normalizeReasonFilter(searchParams.get('reason_code'));

    usePageTitle('ブロック一覧');
    useToastOnMessage(successMessage, 'success');
    useToastOnMessage(error, 'error');

    const loadBlocks = useCallback(async (showRefreshing = false) => {
        if (!token) {
            return;
        }

        if (showRefreshing) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }

        setError(null);

        const queryParams = new URLSearchParams();

        if (reasonFilter !== 'all') {
            queryParams.set('reason_code', reasonFilter);
        }

        if (query.trim()) {
            queryParams.set('q', query.trim());
        }

        try {
            const payload = await apiRequest<ApiEnvelope<AccountBlockRecord[]>>(`/accounts/blocks?${queryParams.toString()}`, {
                token,
            });

            setBlocks(unwrapData(payload));
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : 'ブロック一覧の取得に失敗しました。';

            setError(message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [query, reasonFilter, token]);

    useEffect(() => {
        void loadBlocks();
    }, [loadBlocks]);

    const summary = useMemo(() => ({
        total: blocks.length,
        unsafe: blocks.filter((block) => block.reason_code === 'unsafe').length,
        contact: blocks.filter((block) => block.reason_code === 'external_contact').length,
    }), [blocks]);

    async function handleUnblock(block: AccountBlockRecord) {
        if (!token || !block.blocked_account_id) {
            return;
        }

        setPendingBlockId(block.id);
        setSuccessMessage(null);
        setError(null);

        try {
            await apiRequest<null>(`/accounts/${block.blocked_account_id}/block`, {
                method: 'DELETE',
                token,
            });

            setBlocks((current) => current.filter((item) => item.id !== block.id));
            setSuccessMessage('ブロックを解除しました。');
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : 'ブロック解除に失敗しました。';

            setError(message);
        } finally {
            setPendingBlockId(null);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="ブロック一覧を読み込み中" message="ブロック中の相手と理由を確認しています。" />;
    }

    return (
        <div className="space-y-8">
            <section className="rounded-[32px] bg-[linear-gradient(140deg,#17202b_0%,#223245_100%)] p-6 text-white shadow-[0_24px_60px_rgba(15,23,42,0.28)] sm:p-8">
                <p className="text-xs font-semibold tracking-wide text-[#f3dec0]">BLOCK LIST</p>
                <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-3">
                        <h1 className="text-3xl font-semibold">ブロック一覧</h1>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            表示したくない相手や、安全上の理由で避けたい相手を確認できます。解除すると再び一覧や導線に戻る可能性があります。
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            void loadBlocks(true);
                        }}
                        className="inline-flex min-h-11 items-center rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/6"
                    >
                        {isRefreshing ? '更新中...' : '再読み込み'}
                    </button>
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-3">
                <article className="rounded-[24px] bg-white p-5 shadow-[0_16px_30px_rgba(23,32,43,0.1)]">
                    <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">TOTAL</p>
                    <p className="mt-3 text-3xl font-semibold text-[#17202b]">{summary.total}</p>
                    <p className="mt-2 text-sm text-[#68707a]">現在ブロック中の相手</p>
                </article>
                <article className="rounded-[24px] bg-white p-5 shadow-[0_16px_30px_rgba(23,32,43,0.1)]">
                    <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">SAFETY</p>
                    <p className="mt-3 text-3xl font-semibold text-[#17202b]">{summary.unsafe}</p>
                    <p className="mt-2 text-sm text-[#68707a]">安全上の理由</p>
                </article>
                <article className="rounded-[24px] bg-white p-5 shadow-[0_16px_30px_rgba(23,32,43,0.1)]">
                    <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">CONTACT</p>
                    <p className="mt-3 text-3xl font-semibold text-[#17202b]">{summary.contact}</p>
                    <p className="mt-2 text-sm text-[#68707a]">連絡先交換の誘導</p>
                </article>
            </section>

            <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">FILTERS</p>
                        <h2 className="text-2xl font-semibold text-[#17202b]">絞り込み</h2>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[560px]">
                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-[#17202b]">理由</span>
                            <select
                                value={reasonFilter}
                                onChange={(event) => {
                                    const next = new URLSearchParams(searchParams);

                                    if (event.target.value === 'all') {
                                        next.delete('reason_code');
                                    } else {
                                        next.set('reason_code', event.target.value);
                                    }

                                    setSearchParams(next, { replace: true });
                                }}
                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                            >
                                <option value="all">すべて</option>
                                <option value="unsafe">安全上の不安</option>
                                <option value="external_contact">連絡先交換の誘導</option>
                                <option value="boundary_violation">境界違反</option>
                            </select>
                        </label>

                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-[#17202b]">検索</span>
                            <div className="flex gap-2">
                                <input
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder="表示名で検索"
                                    className="min-w-0 flex-1 rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        const next = new URLSearchParams(searchParams);

                                        if (query.trim()) {
                                            next.set('q', query.trim());
                                        } else {
                                            next.delete('q');
                                        }

                                        setSearchParams(next, { replace: true });
                                    }}
                                    className="inline-flex min-h-11 items-center rounded-full bg-[#17202b] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#243140]"
                                >
                                    適用
                                </button>
                            </div>
                        </label>
                    </div>
                </div>



                <div className="mt-6 space-y-4">
                    {blocks.length > 0 ? blocks.map((block) => (
                        <article key={block.id} className="rounded-[22px] border border-[#ebe2d3] bg-[#fffcf7] p-5">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-lg font-semibold text-[#17202b]">
                                            {block.blocked_account?.display_name ?? block.blocked_account_id ?? '相手を確認中'}
                                        </p>
                                        <span className="rounded-full bg-[#f1efe8] px-3 py-1 text-xs font-semibold text-[#48505a]">
                                            {blockReasonLabel(block.reason_code)}
                                        </span>
                                    </div>
                                    <p className="text-sm text-[#68707a]">
                                        ブロック日時: {formatDateTime(block.created_at)}
                                    </p>
                                    <p className="text-sm text-[#68707a]">
                                        アカウント状態: {block.blocked_account?.status ?? '不明'}
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => {
                                        void handleUnblock(block);
                                    }}
                                    disabled={pendingBlockId === block.id}
                                    className="inline-flex min-h-11 items-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {pendingBlockId === block.id ? '解除中...' : 'ブロックを解除'}
                                </button>
                            </div>
                        </article>
                    )) : (
                        <div className="rounded-[24px] border border-dashed border-[#d9c9ae] px-6 py-8 text-center">
                            <h3 className="text-xl font-semibold text-[#17202b]">ブロック中の相手はいません</h3>
                            <p className="mt-3 text-sm leading-7 text-[#68707a]">
                                予約詳細や通報画面からブロックした相手がここに並びます。
                            </p>
                            <div className="mt-5 flex justify-center">
                                <Link
                                    to="/user/bookings"
                                    className="inline-flex min-h-11 items-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140]"
                                >
                                    予約一覧へ
                                </Link>
                            </div>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
