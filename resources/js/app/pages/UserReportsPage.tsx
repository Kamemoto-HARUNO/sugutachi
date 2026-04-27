import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatJstDateTime } from '../lib/datetime';
import type {
    ApiEnvelope,
    ReportListMeta,
    ReportRecord,
} from '../lib/types';

type StatusFilter = 'all' | 'open' | 'resolved';
type SeverityFilter = 'all' | 'low' | 'medium' | 'high' | 'critical';
type SortField = 'created_at' | 'resolved_at';
type SortDirection = 'asc' | 'desc';

type ReportListResponse = ApiEnvelope<ReportRecord[]> & {
    meta?: ReportListMeta;
};

function normalizeStatusFilter(value: string | null): StatusFilter {
    if (value === 'open' || value === 'resolved') {
        return value;
    }

    return 'all';
}

function normalizeSeverityFilter(value: string | null): SeverityFilter {
    if (value === 'low' || value === 'medium' || value === 'high' || value === 'critical') {
        return value;
    }

    return 'all';
}

function normalizeSortField(value: string | null): SortField {
    return value === 'resolved_at' ? 'resolved_at' : 'created_at';
}

function normalizeSortDirection(value: string | null): SortDirection {
    return value === 'asc' ? 'asc' : 'desc';
}

function formatDateTime(value: string | null): string {
    return formatJstDateTime(value, {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }) ?? '未設定';
}

function statusLabel(status: string): string {
    return status === 'resolved' ? '対応完了' : '対応中';
}

function statusTone(status: string): string {
    return status === 'resolved'
        ? 'bg-[#e9f4ea] text-[#24553a]'
        : 'bg-[#fff2dd] text-[#8b5a16]';
}

function severityLabel(severity: string): string {
    switch (severity) {
        case 'critical':
            return '重大';
        case 'high':
            return '高';
        case 'medium':
            return '中';
        case 'low':
            return '低';
        default:
            return severity;
    }
}

function severityTone(severity: string): string {
    switch (severity) {
        case 'critical':
            return 'bg-[#f7e7e3] text-[#8c4738]';
        case 'high':
            return 'bg-[#fff0e3] text-[#9a5b2f]';
        case 'medium':
            return 'bg-[#eef4ff] text-[#30527a]';
        default:
            return 'bg-[#f1efe8] text-[#48505a]';
    }
}

function categoryLabel(category: string): string {
    switch (category) {
        case 'prohibited_request':
            return '禁止事項の依頼';
        case 'violence':
            return '暴力・威圧';
        case 'boundary_violation':
            return '境界違反';
        case 'booking_interrupted':
            return '対応中断';
        default:
            return category.replaceAll('_', ' ');
    }
}

export function UserReportsPage() {
    const { token } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [reports, setReports] = useState<ReportRecord[]>([]);
    const [meta, setMeta] = useState<ReportListMeta | null>(null);
    const [selectedReport, setSelectedReport] = useState<ReportRecord | null>(null);
    const [pageError, setPageError] = useState<string | null>(null);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);

    const statusFilter = normalizeStatusFilter(searchParams.get('status'));
    const severityFilter = normalizeSeverityFilter(searchParams.get('severity'));
    const sortField = normalizeSortField(searchParams.get('sort'));
    const direction = normalizeSortDirection(searchParams.get('direction'));
    const categoryFilter = searchParams.get('category') ?? '';
    const selectedReportId = searchParams.get('report');

    usePageTitle('通報履歴');

    const loadReports = useCallback(async (nextIsRefresh = false) => {
        if (!token) {
            setIsLoading(false);
            return;
        }

        if (nextIsRefresh) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }

        try {
            const query = new URLSearchParams();

            if (statusFilter !== 'all') {
                query.set('status', statusFilter);
            }

            if (severityFilter !== 'all') {
                query.set('severity', severityFilter);
            }

            if (categoryFilter.trim()) {
                query.set('category', categoryFilter.trim());
            }

            query.set('sort', sortField);
            query.set('direction', direction);

            const payload = await apiRequest<ReportListResponse>(`/reports?${query.toString()}`, {
                token,
            });

            const nextReports = unwrapData(payload);
            setReports(nextReports);
            setMeta(payload.meta ?? null);
            setPageError(null);

            if (nextReports.length === 0) {
                setSelectedReport(null);
                setSearchParams((previous) => {
                    const next = new URLSearchParams(previous);
                    next.delete('report');
                    return next;
                }, { replace: true });
                return;
            }

            const fallbackReport = nextReports.find((report) => report.public_id === selectedReportId) ?? nextReports[0];

            if (fallbackReport.public_id !== selectedReportId) {
                setSearchParams((previous) => {
                    const next = new URLSearchParams(previous);
                    next.set('report', fallbackReport.public_id);
                    return next;
                }, { replace: true });
            }
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '通報履歴の取得に失敗しました。';

            setPageError(message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [categoryFilter, direction, selectedReportId, setSearchParams, severityFilter, sortField, statusFilter, token]);

    useEffect(() => {
        void loadReports();
    }, [loadReports]);

    useEffect(() => {
        let isMounted = true;

        async function loadDetail() {
            if (!token || !selectedReportId) {
                setSelectedReport(null);
                setDetailError(null);
                return;
            }

            setIsLoadingDetail(true);
            setDetailError(null);

            try {
                const payload = await apiRequest<ApiEnvelope<ReportRecord>>(`/reports/${selectedReportId}`, {
                    token,
                });

                if (!isMounted) {
                    return;
                }

                setSelectedReport(unwrapData(payload));
            } catch (requestError) {
                if (!isMounted) {
                    return;
                }

                const message =
                    requestError instanceof ApiError
                        ? requestError.message
                        : '通報詳細の取得に失敗しました。';

                setDetailError(message);
            } finally {
                if (isMounted) {
                    setIsLoadingDetail(false);
                }
            }
        }

        void loadDetail();

        return () => {
            isMounted = false;
        };
    }, [selectedReportId, token]);

    const visibleCountLabel = `${reports.length}件表示`;

    const summary = useMemo(() => ({
        total: meta?.total_count ?? reports.length,
        open: meta?.open_count ?? reports.filter((report) => report.status === 'open').length,
        resolved: meta?.resolved_count ?? reports.filter((report) => report.status === 'resolved').length,
    }), [meta, reports]);

    if (isLoading) {
        return <LoadingScreen title="通報履歴を読み込み中" message="自分が送った通報と対応状況を確認しています。" />;
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[32px] bg-[linear-gradient(117deg,#17202b_0%,#243447_52%,#2b4158_100%)] p-7 text-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">REPORT HISTORY</p>
                        <div className="space-y-2">
                            <h1 className="text-3xl font-semibold">通報履歴</h1>
                            <p className="max-w-3xl text-sm leading-7 text-slate-300">
                                自分が送った通報の一覧と、いまの対応状況をここで確認します。
                                必要に応じて、どの予約について何を送ったかも見返せます。
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                void loadReports(true);
                            }}
                            disabled={isRefreshing}
                            className="inline-flex items-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isRefreshing ? '更新中...' : '更新'}
                        </button>
                        <Link
                            to="/user/bookings"
                            className="inline-flex items-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:brightness-105"
                        >
                            予約一覧へ
                        </Link>
                    </div>
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-3">
                {[
                    { label: '総件数', value: summary.total, hint: '自分が送った通報' },
                    { label: '対応中', value: summary.open, hint: 'まだオープンの通報' },
                    { label: '対応完了', value: summary.resolved, hint: '解決済みの通報' },
                ].map((item) => (
                    <article
                        key={item.label}
                        className="rounded-[24px] border border-white/10 bg-white/5 p-5 shadow-[0_12px_28px_rgba(15,23,42,0.08)]"
                    >
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">{item.label}</p>
                        <p className="mt-3 text-3xl font-semibold text-white">{item.value}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-300">{item.hint}</p>
                    </article>
                ))}
            </section>

            <section className="rounded-[28px] bg-white p-5 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                    <div className="space-y-4">
                        <div>
                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">FILTERS</p>
                            <h2 className="mt-2 text-2xl font-semibold text-[#17202b]">表示条件</h2>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {[
                                ['all', 'すべて'],
                                ['open', '対応中'],
                                ['resolved', '対応完了'],
                            ].map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => {
                                        setSearchParams((previous) => {
                                            const next = new URLSearchParams(previous);

                                            if (value === 'all') {
                                                next.delete('status');
                                            } else {
                                                next.set('status', value);
                                            }

                                            return next;
                                        });
                                    }}
                                    className={[
                                        'rounded-full px-4 py-2 text-sm font-semibold transition',
                                        statusFilter === value
                                            ? 'bg-[#17202b] text-white'
                                            : 'bg-[#f5efe4] text-[#48505a] hover:bg-[#ebe2d3]',
                                    ].join(' ')}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3 xl:min-w-[640px]">
                        <div className="space-y-2">
                            <label htmlFor="severity-filter" className="text-sm font-semibold text-[#17202b]">
                                重要度
                            </label>
                            <select
                                id="severity-filter"
                                value={severityFilter}
                                onChange={(event) => {
                                    setSearchParams((previous) => {
                                        const next = new URLSearchParams(previous);

                                        if (event.target.value === 'all') {
                                            next.delete('severity');
                                        } else {
                                            next.set('severity', event.target.value);
                                        }

                                        return next;
                                    });
                                }}
                                className="w-full rounded-[16px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#c6a16a]"
                            >
                                <option value="all">すべて</option>
                                <option value="low">低</option>
                                <option value="medium">中</option>
                                <option value="high">高</option>
                                <option value="critical">重大</option>
                            </select>
                        </div>

                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-[#17202b]">カテゴリ</span>
                            <input
                                value={categoryFilter}
                                onChange={(event) => {
                                    setSearchParams((previous) => {
                                        const next = new URLSearchParams(previous);

                                        if (event.target.value.trim()) {
                                            next.set('category', event.target.value);
                                        } else {
                                            next.delete('category');
                                        }

                                        return next;
                                    });
                                }}
                                className="w-full rounded-[16px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#c6a16a]"
                                placeholder="prohibited_request"
                            />
                        </label>

                        <div className="space-y-2">
                            <label htmlFor="sort-field" className="text-sm font-semibold text-[#17202b]">
                                並び順
                            </label>
                            <div className="flex gap-2">
                                <select
                                    id="sort-field"
                                    value={sortField}
                                    onChange={(event) => {
                                        setSearchParams((previous) => {
                                            const next = new URLSearchParams(previous);
                                            next.set('sort', event.target.value);
                                            return next;
                                        });
                                    }}
                                    className="min-w-0 flex-1 rounded-[16px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#c6a16a]"
                                >
                                    <option value="created_at">作成日時</option>
                                    <option value="resolved_at">解決日時</option>
                                </select>
                                <select
                                    value={direction}
                                    onChange={(event) => {
                                        setSearchParams((previous) => {
                                            const next = new URLSearchParams(previous);
                                            next.set('direction', event.target.value);
                                            return next;
                                        });
                                    }}
                                    className="w-[120px] rounded-[16px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#c6a16a]"
                                >
                                    <option value="desc">新しい順</option>
                                    <option value="asc">古い順</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-6 flex items-center justify-between gap-4 border-t border-[#efe5d7] pt-5">
                    <p className="text-sm text-[#68707a]">{visibleCountLabel}</p>
                    <button
                        type="button"
                        onClick={() => {
                            setSearchParams((previous) => {
                                const next = new URLSearchParams(previous);
                                const currentReport = next.get('report');
                                next.forEach((_, key) => next.delete(key));
                                if (currentReport) {
                                    next.set('report', currentReport);
                                }
                                return next;
                            });
                        }}
                        className="text-sm font-semibold text-[#7c5a28] transition hover:text-[#5d421d]"
                    >
                        フィルタをリセット
                    </button>
                </div>
            </section>

            {pageError ? (
                <section className="rounded-[24px] border border-[#f1d4b5] bg-[#fff4e8] px-5 py-4 text-sm text-[#9a4b35]">
                    {pageError}
                </section>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                <section className="space-y-4">
                    {reports.length > 0 ? reports.map((report) => {
                        const isSelected = report.public_id === selectedReportId;

                        return (
                            <button
                                key={report.public_id}
                                type="button"
                                onClick={() => {
                                    setSearchParams((previous) => {
                                        const next = new URLSearchParams(previous);
                                        next.set('report', report.public_id);
                                        return next;
                                    });
                                }}
                                className={[
                                    'w-full rounded-[28px] px-5 py-5 text-left transition shadow-[0_18px_36px_rgba(23,32,43,0.12)]',
                                    isSelected
                                        ? 'bg-[#fff8ee] ring-2 ring-[#d2b179]'
                                        : 'bg-white hover:bg-[#fffcf7]',
                                ].join(' ')}
                            >
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="space-y-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(report.status)}`}>
                                                {statusLabel(report.status)}
                                            </span>
                                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${severityTone(report.severity)}`}>
                                                {severityLabel(report.severity)}
                                            </span>
                                        </div>

                                        <div className="space-y-1">
                                            <h3 className="text-xl font-semibold text-[#17202b]">{categoryLabel(report.category)}</h3>
                                            <p className="text-sm text-[#68707a]">
                                                対象: {report.target_account?.display_name ?? report.target_account_id ?? '未設定'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid gap-3 text-sm text-[#48505a] md:grid-cols-2 lg:min-w-[280px]">
                                        <div>
                                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">予約</p>
                                            <p className="mt-1 font-semibold text-[#17202b]">
                                                {report.booking_public_id ?? '予約紐づけなし'}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">送信日時</p>
                                            <p className="mt-1 font-semibold text-[#17202b]">{formatDateTime(report.created_at)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">対応状況</p>
                                            <p className="mt-1 font-semibold text-[#17202b]">{statusLabel(report.status)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">解決日時</p>
                                            <p className="mt-1 font-semibold text-[#17202b]">{formatDateTime(report.resolved_at)}</p>
                                        </div>
                                    </div>
                                </div>
                            </button>
                        );
                    }) : (
                        <section className="rounded-[28px] bg-white px-6 py-10 text-center shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                            <p className="text-lg font-semibold text-[#17202b]">通報履歴はまだありません。</p>
                            <p className="mt-3 text-sm leading-7 text-[#68707a]">
                                予約中に気になることがあったときは、予約詳細から通報を送れます。
                            </p>
                            <div className="mt-6">
                                <Link
                                    to="/user/bookings"
                                    className="inline-flex items-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:brightness-105"
                                >
                                    予約一覧を見る
                                </Link>
                            </div>
                        </section>
                    )}
                </section>

                <aside className="space-y-5">
                    <section className="rounded-[28px] bg-[#fffcf7] p-6 shadow-[0_18px_36px_rgba(23,32,43,0.1)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">DETAIL</p>
                        {isLoadingDetail ? (
                            <div className="mt-4 space-y-3">
                                <div className="h-4 w-24 animate-pulse rounded bg-[#e9dec8]" />
                                <div className="h-20 animate-pulse rounded-[20px] bg-[#f5efe4]" />
                            </div>
                        ) : detailError ? (
                            <div className="mt-4 rounded-[20px] border border-[#f1d4b5] bg-[#fff4e8] px-4 py-3 text-sm text-[#9a4b35]">
                                {detailError}
                            </div>
                        ) : selectedReport ? (
                            <div className="mt-4 space-y-4 text-sm text-[#48505a]">
                                <div>
                                    <p className="text-xs font-semibold text-[#7d6852]">カテゴリ</p>
                                    <p className="mt-1 font-semibold text-[#17202b]">{categoryLabel(selectedReport.category)}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-[#7d6852]">対象アカウント</p>
                                    <p className="mt-1 font-semibold text-[#17202b]">
                                        {selectedReport.target_account?.display_name ?? selectedReport.target_account_id ?? '未設定'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-[#7d6852]">予約ID</p>
                                    <p className="mt-1 font-semibold text-[#17202b]">{selectedReport.booking_public_id ?? '予約紐づけなし'}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-[#7d6852]">本文</p>
                                    <div className="mt-2 rounded-[20px] border border-[#ebe2d3] bg-white px-4 py-4 text-sm leading-7 text-[#48505a]">
                                        {selectedReport.detail ?? '本文はありません。'}
                                    </div>
                                </div>
                                {selectedReport.source_booking_message ? (
                                    <div>
                                        <p className="text-xs font-semibold text-[#7d6852]">関連メッセージ</p>
                                        <div className="mt-2 rounded-[20px] border border-[#ebe2d3] bg-white px-4 py-4">
                                            <p className="font-semibold text-[#17202b]">
                                                送信者: {selectedReport.source_booking_message.sender?.display_name ?? '不明'}
                                            </p>
                                            <p className="mt-1 text-sm text-[#68707a]">
                                                送信日時: {formatDateTime(selectedReport.source_booking_message.sent_at)}
                                            </p>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                <span className="rounded-full bg-[#f5efe4] px-3 py-1 text-xs font-semibold text-[#48505a]">
                                                    {selectedReport.source_booking_message.moderation_status}
                                                </span>
                                                {selectedReport.source_booking_message.detected_contact_exchange ? (
                                                    <span className="rounded-full bg-[#fff0e3] px-3 py-1 text-xs font-semibold text-[#9a5b2f]">
                                                        連絡先検知あり
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        ) : (
                            <p className="mt-4 text-sm leading-7 text-[#68707a]">
                                左の一覧から通報を選ぶと、送信内容の詳細を確認できます。
                            </p>
                        )}
                    </section>
                </aside>
            </div>
        </div>
    );
}
