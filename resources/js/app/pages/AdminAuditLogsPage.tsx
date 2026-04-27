import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatDateTime } from '../lib/therapist';
import type {
    AdminAuditLogRecord,
    ApiEnvelope,
} from '../lib/types';

function buildSelectedLink(searchParams: URLSearchParams, id: number): string {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('selected', String(id));
    const query = nextParams.toString();

    return query ? `/admin/audit-logs?${query}` : '/admin/audit-logs';
}

function shortTargetType(targetType: string): string {
    const segments = targetType.split('\\');

    return segments.at(-1) ?? targetType;
}

function formatPayload(payload: Record<string, unknown> | null): string {
    if (!payload) {
        return 'なし';
    }

    return JSON.stringify(payload, null, 2);
}

export function AdminAuditLogsPage() {
    const { token } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [logs, setLogs] = useState<AdminAuditLogRecord[]>([]);
    const [pageError, setPageError] = useState<string | null>(null);
    const [actorInput, setActorInput] = useState(searchParams.get('actor_account_id') ?? '');
    const [actionInput, setActionInput] = useState(searchParams.get('action') ?? '');
    const [targetTypeInput, setTargetTypeInput] = useState(searchParams.get('target_type') ?? '');
    const [targetIdInput, setTargetIdInput] = useState(searchParams.get('target_id') ?? '');
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const selectedId = searchParams.get('selected');
    const actorAccountId = searchParams.get('actor_account_id')?.trim() ?? '';
    const action = searchParams.get('action')?.trim() ?? '';
    const targetType = searchParams.get('target_type')?.trim() ?? '';
    const targetId = searchParams.get('target_id')?.trim() ?? '';

    usePageTitle('監査ログ');

    const selectedLog = useMemo(
        () => logs.find((log) => String(log.id) === selectedId) ?? null,
        [logs, selectedId],
    );

    const summary = useMemo(() => ({
        total: logs.length,
        accountActions: logs.filter((log) => log.action.startsWith('account.')).length,
        travelRequestActions: logs.filter((log) => log.action.startsWith('travel_request.')).length,
        reportActions: logs.filter((log) => log.action.startsWith('report.')).length,
        latestAt: logs[0]?.created_at ?? null,
    }), [logs]);

    const loadLogs = useCallback(async (refresh = false) => {
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

        if (actorAccountId) {
            params.set('actor_account_id', actorAccountId);
        }

        if (action) {
            params.set('action', action);
        }

        if (targetType) {
            params.set('target_type', targetType);
        }

        if (targetId) {
            params.set('target_id', targetId);
        }

        try {
            const payload = await apiRequest<ApiEnvelope<AdminAuditLogRecord[]>>(`/admin/audit-logs?${params.toString()}`, { token });
            setLogs(unwrapData(payload));
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '監査ログの取得に失敗しました。';

            setPageError(message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [action, actorAccountId, targetId, targetType, token]);

    useEffect(() => {
        void loadLogs();
    }, [loadLogs]);

    function updateFilters(next: Partial<Record<'actor_account_id' | 'action' | 'target_type' | 'target_id' | 'selected', string | null>>) {
        const params = new URLSearchParams(searchParams);

        Object.entries(next).forEach(([key, value]) => {
            if (!value) {
                params.delete(key);
                return;
            }

            params.set(key, value);
        });

        setSearchParams(params, { replace: true });
    }

    if (isLoading) {
        return <LoadingScreen title="監査ログを読み込み中" message="管理操作の履歴を集約しています。" />;
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_16px_34px_rgba(2,6,23,0.14)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">ADMIN AUDIT TRAIL</p>
                        <h2 className="text-2xl font-semibold text-white sm:text-[2rem]">監査ログ</h2>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            管理者が行った操作の before / after を確認し、判断履歴を追跡できます。
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            void loadLogs(true);
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
                    { label: 'アカウント操作', value: summary.accountActions, hint: 'account.*' },
                    { label: '出張監視操作', value: summary.travelRequestActions, hint: 'travel_request.*' },
                    { label: '通報操作', value: summary.reportActions, hint: 'report.*' },
                    { label: '最新操作', value: summary.latestAt ? formatDateTime(summary.latestAt) : 'なし', hint: '先頭レコード基準' },
                ].map((item) => (
                    <article key={item.label} className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">{item.label}</p>
                        <p className="mt-3 text-2xl font-semibold text-white">{item.value}</p>
                        <p className="mt-2 text-sm text-slate-400">{item.hint}</p>
                    </article>
                ))}
            </section>

            <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">操作管理者</span>
                        <input
                            value={actorInput}
                            onChange={(event) => setActorInput(event.target.value)}
                            onBlur={() => updateFilters({ actor_account_id: actorInput.trim() || null, selected: null })}
                            placeholder="acc_admin_xxx"
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition placeholder:text-[#9aa3ad] focus:border-[#b5894d]"
                        />
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">アクション</span>
                        <input
                            value={actionInput}
                            onChange={(event) => setActionInput(event.target.value)}
                            onBlur={() => updateFilters({ action: actionInput.trim() || null, selected: null })}
                            placeholder="account.suspend"
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition placeholder:text-[#9aa3ad] focus:border-[#b5894d]"
                        />
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">対象タイプ</span>
                        <input
                            value={targetTypeInput}
                            onChange={(event) => setTargetTypeInput(event.target.value)}
                            onBlur={() => updateFilters({ target_type: targetTypeInput.trim() || null, selected: null })}
                            placeholder="App\\Models\\Account"
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition placeholder:text-[#9aa3ad] focus:border-[#b5894d]"
                        />
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">対象ID</span>
                        <input
                            value={targetIdInput}
                            onChange={(event) => setTargetIdInput(event.target.value)}
                            onBlur={() => updateFilters({ target_id: targetIdInput.trim() || null, selected: null })}
                            placeholder="123"
                            inputMode="numeric"
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition placeholder:text-[#9aa3ad] focus:border-[#b5894d]"
                        />
                    </label>
                </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
                <div className="rounded-[28px] bg-white p-5 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                    <div className="flex items-center justify-between gap-4 border-b border-[#ece3d4] pb-4">
                        <div>
                            <h3 className="text-lg font-semibold text-[#17202b]">操作履歴</h3>
                            <p className="mt-1 text-sm text-[#68707a]">before / after の差分を開ける一覧です。</p>
                        </div>
                        <p className="text-sm font-semibold text-[#7d6852]">{logs.length}件</p>
                    </div>

                    <div className="mt-4 space-y-3">
                        {logs.length > 0 ? logs.map((log) => {
                            const isSelected = String(log.id) === selectedId;

                            return (
                                <Link
                                    key={log.id}
                                    to={buildSelectedLink(searchParams, log.id)}
                                    className={`block rounded-[24px] border px-4 py-4 transition ${
                                        isSelected
                                            ? 'border-[#b5894d] bg-[#fff8ef] shadow-[0_14px_30px_rgba(181,137,77,0.16)]'
                                            : 'border-[#ece3d4] bg-[#fffcf6] hover:border-[#d8c2a0] hover:bg-[#fff8ef]'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-base font-semibold text-[#17202b]">{log.action}</p>
                                            <p className="mt-1 text-xs text-[#7d6852]">
                                                {log.actor_account?.display_name ?? log.actor_account?.public_id ?? 'システム'} / {formatDateTime(log.created_at)}
                                            </p>
                                        </div>
                                        <span className="rounded-full bg-[#f3efe7] px-3 py-1 text-xs font-semibold text-[#55606d]">
                                            {shortTargetType(log.target_type)}
                                        </span>
                                    </div>

                                    <div className="mt-3 text-sm text-[#55606d]">
                                        <p>対象ID <span className="font-medium text-[#17202b]">{log.target_id ?? '未設定'}</span></p>
                                    </div>
                                </Link>
                            );
                        }) : (
                            <div className="rounded-[24px] border border-dashed border-[#d9c9ae] bg-[#fffdf8] px-5 py-8 text-center text-sm text-[#7d6852]">
                                条件に合う監査ログはありません。
                            </div>
                        )}
                    </div>
                </div>

                <div className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                    {selectedLog ? (
                        <div className="space-y-6">
                            <div className="border-b border-[#ece3d4] pb-5">
                                <p className="text-xs font-semibold tracking-wide text-[#b5894d]">AUDIT DETAIL</p>
                                <h3 className="mt-2 text-2xl font-semibold text-[#17202b]">{selectedLog.action}</h3>
                                <p className="mt-2 text-sm text-[#68707a]">
                                    {selectedLog.actor_account?.display_name ?? selectedLog.actor_account?.public_id ?? 'システム'} / {formatDateTime(selectedLog.created_at)}
                                </p>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <article className="rounded-[22px] border border-[#ece3d4] bg-[#fffcf6] p-4 text-sm text-[#55606d]">
                                    <p className="text-xs font-semibold tracking-wide text-[#b5894d]">対象</p>
                                    <p className="mt-2 font-semibold text-[#17202b]">{shortTargetType(selectedLog.target_type)}</p>
                                    <p className="mt-1">ID {selectedLog.target_id ?? '未設定'}</p>
                                    <p className="mt-1">IP hash {selectedLog.ip_hash ?? '未設定'}</p>
                                    <p className="mt-1">UA hash {selectedLog.user_agent_hash ?? '未設定'}</p>
                                </article>

                                <article className="rounded-[22px] border border-[#ece3d4] bg-[#fffcf6] p-4 text-sm text-[#55606d]">
                                    <p className="text-xs font-semibold tracking-wide text-[#b5894d]">操作者</p>
                                    <p className="mt-2 font-semibold text-[#17202b]">{selectedLog.actor_account?.display_name ?? selectedLog.actor_account?.public_id ?? 'システム'}</p>
                                    <p className="mt-1">{selectedLog.actor_account?.email ?? 'メール未設定'}</p>
                                    <p className="mt-1">実行日時 {formatDateTime(selectedLog.created_at)}</p>
                                </article>
                            </div>

                            <div className="grid gap-4 xl:grid-cols-2">
                                <section className="rounded-[24px] border border-[#ece3d4] bg-[#fffcf6] p-5">
                                    <p className="text-sm font-semibold text-[#17202b]">Before</p>
                                    <pre className="mt-3 overflow-x-auto rounded-[18px] bg-[#17202b] p-4 text-xs leading-6 text-slate-100">
                                        {formatPayload(selectedLog.before)}
                                    </pre>
                                </section>

                                <section className="rounded-[24px] border border-[#ece3d4] bg-[#fffcf6] p-5">
                                    <p className="text-sm font-semibold text-[#17202b]">After</p>
                                    <pre className="mt-3 overflow-x-auto rounded-[18px] bg-[#17202b] p-4 text-xs leading-6 text-slate-100">
                                        {formatPayload(selectedLog.after)}
                                    </pre>
                                </section>
                            </div>
                        </div>
                    ) : (
                        <div className="flex min-h-[420px] items-center justify-center rounded-[24px] border border-dashed border-[#d9c9ae] bg-[#fffdf8] px-6 text-center text-sm leading-7 text-[#7d6852]">
                            左の一覧からログを選ぶと、before / after と操作者情報を確認できます。
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
