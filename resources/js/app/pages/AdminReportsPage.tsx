import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatDateTime } from '../lib/therapist';
import type {
    AdminReportRecord,
    ApiEnvelope,
    ReportRecord,
} from '../lib/types';

type StatusFilter = 'all' | 'open' | 'resolved';
type SeverityFilter = 'all' | 'low' | 'medium' | 'high' | 'critical';
type SourceFilter = 'all' | 'with_source' | 'without_source';
type SortField = 'created_at' | 'resolved_at';
type SortDirection = 'asc' | 'desc';

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

function normalizeSourceFilter(value: string | null): SourceFilter {
    if (value === 'with_source' || value === 'without_source') {
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

function reportStatusLabel(status: string): string {
    return status === 'resolved' ? '解決済み' : '対応中';
}

function reportStatusTone(status: string): string {
    return status === 'resolved'
        ? 'bg-[#e8f4ea] text-[#205738]'
        : 'bg-[#fff1df] text-[#91571b]';
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
            return 'bg-[#f8e6e3] text-[#8f4337]';
        case 'high':
            return 'bg-[#fff0e0] text-[#9e5a27]';
        case 'medium':
            return 'bg-[#edf4ff] text-[#34557f]';
        default:
            return 'bg-[#f3efe7] text-[#55606d]';
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
            return '施術中断';
        case 'contact_exchange':
            return '連絡先交換';
        default:
            return category.replaceAll('_', ' ');
    }
}

function displayAccountName(account: { display_name: string | null; public_id?: string | null } | null): string {
    if (!account) {
        return '未設定';
    }

    return account.display_name?.trim() || account.public_id || '未設定';
}

export function AdminReportsPage() {
    const { token } = useAuth();
    const { publicId } = useParams<{ publicId: string }>();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const [reports, setReports] = useState<ReportRecord[]>([]);
    const [selectedReport, setSelectedReport] = useState<AdminReportRecord | null>(null);
    const [pageError, setPageError] = useState<string | null>(null);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [actionType, setActionType] = useState('contacted_reporter');
    const [actionNote, setActionNote] = useState('');
    const [resolutionNote, setResolutionNote] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    const [isSubmittingAction, setIsSubmittingAction] = useState(false);
    const [isSubmittingResolve, setIsSubmittingResolve] = useState(false);
    const [bookingInput, setBookingInput] = useState(searchParams.get('booking_id') ?? '');
    const [reporterInput, setReporterInput] = useState(searchParams.get('reporter_account_id') ?? '');
    const [targetInput, setTargetInput] = useState(searchParams.get('target_account_id') ?? '');

    const statusFilter = normalizeStatusFilter(searchParams.get('status'));
    const severityFilter = normalizeSeverityFilter(searchParams.get('severity'));
    const sourceFilter = normalizeSourceFilter(searchParams.get('source'));
    const sortField = normalizeSortField(searchParams.get('sort'));
    const direction = normalizeSortDirection(searchParams.get('direction'));
    const categoryFilter = searchParams.get('category') ?? '';
    const bookingFilter = searchParams.get('booking_id') ?? '';
    const reporterFilter = searchParams.get('reporter_account_id') ?? '';
    const targetFilter = searchParams.get('target_account_id') ?? '';

    usePageTitle('通報管理');
    useToastOnMessage(successMessage, 'success');

    const loadReports = useCallback(async (refresh = false) => {
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

        if (bookingFilter.trim()) {
            params.set('booking_id', bookingFilter.trim());
        }

        if (reporterFilter.trim()) {
            params.set('reporter_account_id', reporterFilter.trim());
        }

        if (targetFilter.trim()) {
            params.set('target_account_id', targetFilter.trim());
        }

        if (statusFilter !== 'all') {
            params.set('status', statusFilter);
        }

        if (severityFilter !== 'all') {
            params.set('severity', severityFilter);
        }

        if (categoryFilter.trim()) {
            params.set('category', categoryFilter.trim());
        }

        if (sourceFilter === 'with_source') {
            params.set('has_source_booking_message', '1');
        } else if (sourceFilter === 'without_source') {
            params.set('has_source_booking_message', '0');
        }

        params.set('sort', sortField);
        params.set('direction', direction);

        try {
            const payload = await apiRequest<ApiEnvelope<ReportRecord[]>>(`/admin/reports?${params.toString()}`, { token });
            setReports(unwrapData(payload));
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '通報一覧の取得に失敗しました。';

            setPageError(message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [bookingFilter, categoryFilter, direction, reporterFilter, severityFilter, sortField, sourceFilter, statusFilter, targetFilter, token]);

    const loadDetail = useCallback(async () => {
        if (!token || !publicId) {
            setSelectedReport(null);
            setDetailError(null);
            return;
        }

        setIsLoadingDetail(true);
        setDetailError(null);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminReportRecord>>(`/admin/reports/${publicId}`, { token });
            setSelectedReport(unwrapData(payload));
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '通報詳細の取得に失敗しました。';

            setDetailError(message);
            setSelectedReport(null);
        } finally {
            setIsLoadingDetail(false);
        }
    }, [publicId, token]);

    useEffect(() => {
        void loadReports();
    }, [loadReports]);

    useEffect(() => {
        void loadDetail();
    }, [loadDetail]);

    const summary = useMemo(() => ({
        total: reports.length,
        open: reports.filter((report) => report.status === 'open').length,
        resolved: reports.filter((report) => report.status === 'resolved').length,
        severe: reports.filter((report) => report.severity === 'high' || report.severity === 'critical').length,
        messageOrigin: reports.filter((report) => report.source_booking_message).length,
    }), [reports]);

    const selectedListReport = useMemo(
        () => reports.find((report) => report.public_id === publicId) ?? null,
        [publicId, reports],
    );

    function updateFilters(next: Partial<Record<'booking_id' | 'reporter_account_id' | 'target_account_id' | 'status' | 'severity' | 'category' | 'source' | 'sort' | 'direction', string | null>>) {
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

    async function handleAddAction(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token || !selectedReport) {
            return;
        }

        setIsSubmittingAction(true);
        setActionError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminReportRecord>>(`/admin/reports/${selectedReport.public_id}/actions`, {
                method: 'POST',
                token,
                body: {
                    action_type: actionType,
                    note: actionNote.trim() || null,
                },
            });

            setSelectedReport(unwrapData(payload));
            setActionNote('');
            setSuccessMessage('対応履歴を追加しました。');
            void loadReports(true);
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '対応履歴の追加に失敗しました。';

            setActionError(message);
        } finally {
            setIsSubmittingAction(false);
        }
    }

    async function handleResolve(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token || !selectedReport) {
            return;
        }

        setIsSubmittingResolve(true);
        setActionError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminReportRecord>>(`/admin/reports/${selectedReport.public_id}/resolve`, {
                method: 'POST',
                token,
                body: {
                    resolution_note: resolutionNote.trim() || null,
                },
            });

            setSelectedReport(unwrapData(payload));
            setResolutionNote('');
            setSuccessMessage('通報を解決済みに更新しました。');
            void loadReports(true);
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '通報の解決に失敗しました。';

            setActionError(message);
        } finally {
            setIsSubmittingResolve(false);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="通報一覧を読み込み中" message="未解決通報と運営対応履歴を集約しています。" />;
    }

    const activeDetail = selectedReport;

    return (
        <div className="space-y-6">
            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_16px_34px_rgba(2,6,23,0.14)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">REPORT MODERATION</p>
                        <h2 className="text-2xl font-semibold text-white sm:text-[2rem]">通報管理</h2>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            通報の受付状況、メッセージ起点の安全案件、対応履歴、解決判断までを一続きで扱います。
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            void loadReports(true);
                            void loadDetail();
                        }}
                        disabled={isRefreshing || isLoadingDetail}
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
                    { label: '未解決', value: summary.open, hint: '対応継続が必要' },
                    { label: '解決済み', value: summary.resolved, hint: 'クローズ済み' },
                    { label: '重大 / 高', value: summary.severe, hint: '優先確認推奨' },
                    { label: 'メッセージ起点', value: summary.messageOrigin, hint: '危険メッセージ由来' },
                ].map((item) => (
                    <article key={item.label} className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">{item.label}</p>
                        <p className="mt-3 text-3xl font-semibold text-white">{item.value}</p>
                        <p className="mt-2 text-sm text-slate-400">{item.hint}</p>
                    </article>
                ))}
            </section>

            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_16px_34px_rgba(2,6,23,0.12)]">
                <div className="grid gap-4 xl:grid-cols-[repeat(8,minmax(0,1fr))]">
                    <label className="space-y-2 xl:col-span-1">
                        <span className="text-xs font-semibold tracking-wide text-slate-300">ステータス</span>
                        <select
                            value={statusFilter}
                            onChange={(event) => updateFilters({ status: event.target.value })}
                            className="w-full rounded-2xl border border-white/10 bg-[#121a24] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d2b179]/60"
                        >
                            <option value="all">すべて</option>
                            <option value="open">未解決</option>
                            <option value="resolved">解決済み</option>
                        </select>
                    </label>

                    <label className="space-y-2 xl:col-span-1">
                        <span className="text-xs font-semibold tracking-wide text-slate-300">重要度</span>
                        <select
                            value={severityFilter}
                            onChange={(event) => updateFilters({ severity: event.target.value })}
                            className="w-full rounded-2xl border border-white/10 bg-[#121a24] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d2b179]/60"
                        >
                            <option value="all">すべて</option>
                            <option value="critical">重大</option>
                            <option value="high">高</option>
                            <option value="medium">中</option>
                            <option value="low">低</option>
                        </select>
                    </label>

                    <label className="space-y-2 xl:col-span-1">
                        <span className="text-xs font-semibold tracking-wide text-slate-300">起点</span>
                        <select
                            value={sourceFilter}
                            onChange={(event) => updateFilters({ source: event.target.value })}
                            className="w-full rounded-2xl border border-white/10 bg-[#121a24] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d2b179]/60"
                        >
                            <option value="all">すべて</option>
                            <option value="with_source">メッセージ起点</option>
                            <option value="without_source">通常通報</option>
                        </select>
                    </label>

                    <label className="space-y-2 xl:col-span-2">
                        <span className="text-xs font-semibold tracking-wide text-slate-300">カテゴリ</span>
                        <input
                            type="text"
                            value={categoryFilter}
                            onChange={(event) => updateFilters({ category: event.target.value || null })}
                            placeholder="boundary_violation"
                            className="w-full rounded-2xl border border-white/10 bg-[#121a24] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-[#d2b179]/60"
                        />
                    </label>

                    <label className="space-y-2 xl:col-span-1">
                        <span className="text-xs font-semibold tracking-wide text-slate-300">予約ID</span>
                        <input
                            type="text"
                            value={bookingInput}
                            onChange={(event) => setBookingInput(event.target.value)}
                            onBlur={() => updateFilters({ booking_id: bookingInput.trim() || null })}
                            placeholder="book_xxx"
                            className="w-full rounded-2xl border border-white/10 bg-[#121a24] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-[#d2b179]/60"
                        />
                    </label>

                    <label className="space-y-2 xl:col-span-1">
                        <span className="text-xs font-semibold tracking-wide text-slate-300">通報者</span>
                        <input
                            type="text"
                            value={reporterInput}
                            onChange={(event) => setReporterInput(event.target.value)}
                            onBlur={() => updateFilters({ reporter_account_id: reporterInput.trim() || null })}
                            placeholder="acc_xxx"
                            className="w-full rounded-2xl border border-white/10 bg-[#121a24] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-[#d2b179]/60"
                        />
                    </label>

                    <label className="space-y-2 xl:col-span-1">
                        <span className="text-xs font-semibold tracking-wide text-slate-300">対象アカウント</span>
                        <input
                            type="text"
                            value={targetInput}
                            onChange={(event) => setTargetInput(event.target.value)}
                            onBlur={() => updateFilters({ target_account_id: targetInput.trim() || null })}
                            placeholder="acc_xxx"
                            className="w-full rounded-2xl border border-white/10 bg-[#121a24] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-[#d2b179]/60"
                        />
                    </label>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
                    <label className="space-y-2">
                        <span className="text-xs font-semibold tracking-wide text-slate-300">並び順</span>
                        <select
                            value={sortField}
                            onChange={(event) => updateFilters({ sort: event.target.value })}
                            className="rounded-2xl border border-white/10 bg-[#121a24] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d2b179]/60"
                        >
                            <option value="created_at">作成日時</option>
                            <option value="resolved_at">解決日時</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-xs font-semibold tracking-wide text-slate-300">順序</span>
                        <select
                            value={direction}
                            onChange={(event) => updateFilters({ direction: event.target.value })}
                            className="rounded-2xl border border-white/10 bg-[#121a24] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d2b179]/60"
                        >
                            <option value="desc">新しい順</option>
                            <option value="asc">古い順</option>
                        </select>
                    </label>
                </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(380px,0.9fr)]">
                <div className="space-y-4">
                    {reports.length === 0 ? (
                        <section className="rounded-[28px] border border-dashed border-white/10 bg-white/[0.03] px-6 py-12 text-center text-sm text-slate-400">
                            条件に合う通報はありません。
                        </section>
                    ) : (
                        reports.map((report) => {
                            const isActive = report.public_id === publicId;
                            const detailPath = `/admin/reports/${report.public_id}${location.search}`;

                            return (
                                <Link
                                    key={report.public_id}
                                    to={detailPath}
                                    className={[
                                        'block rounded-[28px] border p-5 transition',
                                        isActive
                                            ? 'border-[#d2b179]/45 bg-[#17202b] shadow-[0_18px_38px_rgba(2,6,23,0.22)]'
                                            : 'border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.06]',
                                    ].join(' ')}
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="space-y-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={['rounded-full px-2.5 py-1 text-xs font-semibold', reportStatusTone(report.status)].join(' ')}>
                                                    {reportStatusLabel(report.status)}
                                                </span>
                                                <span className={['rounded-full px-2.5 py-1 text-xs font-semibold', severityTone(report.severity)].join(' ')}>
                                                    {severityLabel(report.severity)}
                                                </span>
                                                {report.source_booking_message ? (
                                                    <span className="rounded-full bg-[#edf4ff] px-2.5 py-1 text-xs font-semibold text-[#34557f]">
                                                        メッセージ起点
                                                    </span>
                                                ) : null}
                                            </div>
                                            <h3 className="text-lg font-semibold text-white">{categoryLabel(report.category)}</h3>
                                            <p className="text-sm text-slate-300">
                                                通報者: {displayAccountName(report.reporter_account)} / 対象: {displayAccountName(report.target_account)}
                                            </p>
                                        </div>

                                        <div className="text-right text-xs text-slate-400">
                                            <p>{formatDateTime(report.created_at)}</p>
                                            {report.booking_public_id ? <p className="mt-1">予約 {report.booking_public_id}</p> : null}
                                        </div>
                                    </div>

                                    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                                        <span>通報ID: {report.public_id}</span>
                                        {report.resolved_at ? <span>解決: {formatDateTime(report.resolved_at)}</span> : null}
                                    </div>
                                </Link>
                            );
                        })
                    )}
                </div>

                <div className="space-y-4">

                    {actionError ? (
                        <section className="rounded-[22px] border border-[#f1d4b5] bg-[#fff4e8] px-5 py-4 text-sm text-[#9a4b35]">
                            {actionError}
                        </section>
                    ) : null}

                    {detailError ? (
                        <section className="rounded-[22px] border border-[#f1d4b5] bg-[#fff4e8] px-5 py-4 text-sm text-[#9a4b35]">
                            {detailError}
                        </section>
                    ) : null}

                    {!publicId ? (
                        <section className="rounded-[28px] border border-dashed border-white/10 bg-white/[0.03] px-6 py-12 text-center text-sm text-slate-400">
                            左の一覧から通報を選ぶと、本文と対応履歴を確認できます。
                        </section>
                    ) : isLoadingDetail && !activeDetail ? (
                        <LoadingScreen title="通報詳細を読み込み中" message="本文と対応履歴を確認しています。" />
                    ) : activeDetail ? (
                        <>
                            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_16px_34px_rgba(2,6,23,0.12)]">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={['rounded-full px-2.5 py-1 text-xs font-semibold', reportStatusTone(activeDetail.status)].join(' ')}>
                                                {reportStatusLabel(activeDetail.status)}
                                            </span>
                                            <span className={['rounded-full px-2.5 py-1 text-xs font-semibold', severityTone(activeDetail.severity)].join(' ')}>
                                                {severityLabel(activeDetail.severity)}
                                            </span>
                                        </div>
                                        <h3 className="text-2xl font-semibold text-white">{categoryLabel(activeDetail.category)}</h3>
                                        <p className="text-sm text-slate-300">
                                            通報ID: {activeDetail.public_id}
                                            {activeDetail.booking_public_id ? ` / 予約 ${activeDetail.booking_public_id}` : ''}
                                        </p>
                                    </div>

                                    <div className="text-right text-sm text-slate-300">
                                        <p>受付: {formatDateTime(activeDetail.created_at)}</p>
                                        <p>担当: {displayAccountName(activeDetail.assigned_admin)}</p>
                                        {activeDetail.resolved_at ? <p>解決: {formatDateTime(activeDetail.resolved_at)}</p> : null}
                                    </div>
                                </div>

                                <div className="mt-6 grid gap-4 md:grid-cols-2">
                                    <article className="rounded-[22px] bg-[#101720] p-4">
                                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">通報者</p>
                                        <p className="mt-2 text-sm font-semibold text-white">{displayAccountName(activeDetail.reporter_account)}</p>
                                        <p className="mt-1 text-xs text-slate-400">{activeDetail.reporter_account?.email ?? 'メール未取得'}</p>
                                    </article>
                                    <article className="rounded-[22px] bg-[#101720] p-4">
                                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">対象アカウント</p>
                                        <p className="mt-2 text-sm font-semibold text-white">{displayAccountName(activeDetail.target_account)}</p>
                                        <p className="mt-1 text-xs text-slate-400">{activeDetail.target_account?.email ?? 'メール未取得'}</p>
                                    </article>
                                </div>

                                <article className="mt-4 rounded-[22px] bg-[#101720] p-5">
                                    <p className="text-xs font-semibold tracking-wide text-[#d2b179]">通報本文</p>
                                    <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-100">
                                        {activeDetail.detail || '本文はありません。'}
                                    </p>
                                </article>

                                {activeDetail.source_booking_message ? (
                                    <article className="mt-4 rounded-[22px] bg-[#101720] p-5">
                                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">起点メッセージ</p>
                                        <div className="mt-3 grid gap-3 text-sm text-slate-200 md:grid-cols-2">
                                            <p>送信者: {activeDetail.source_booking_message.sender_account_public_id ?? '未設定'}</p>
                                            <p>種別: {activeDetail.source_booking_message.message_type ?? 'text'}</p>
                                            <p>監視状態: {activeDetail.source_booking_message.moderation_status}</p>
                                            <p>送信日時: {formatDateTime(activeDetail.source_booking_message.sent_at)}</p>
                                        </div>
                                        {activeDetail.source_booking_message.detected_contact_exchange ? (
                                            <p className="mt-3 text-xs font-semibold text-[#f3dec0]">連絡先交換検知あり</p>
                                        ) : null}
                                    </article>
                                ) : null}
                            </section>

                            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_16px_34px_rgba(2,6,23,0.12)]">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">ACTION LOG</p>
                                        <h4 className="mt-2 text-xl font-semibold text-white">対応履歴</h4>
                                    </div>
                                    <span className="text-sm text-slate-400">{activeDetail.actions.length}件</span>
                                </div>

                                <div className="mt-5 space-y-3">
                                    {activeDetail.actions.length === 0 ? (
                                        <div className="rounded-[22px] border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-400">
                                            まだ対応履歴はありません。
                                        </div>
                                    ) : (
                                        activeDetail.actions.map((action) => (
                                            <article key={action.id} className="rounded-[22px] bg-[#101720] p-4">
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div>
                                                        <p className="text-sm font-semibold text-white">{action.action_type}</p>
                                                        <p className="mt-1 text-xs text-slate-400">
                                                            {displayAccountName(action.admin)} / {formatDateTime(action.created_at)}
                                                        </p>
                                                    </div>
                                                </div>
                                                {action.note ? (
                                                    <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-200">{action.note}</p>
                                                ) : null}
                                            </article>
                                        ))
                                    )}
                                </div>
                            </section>

                            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_16px_34px_rgba(2,6,23,0.12)]">
                                <div className="grid gap-6 xl:grid-cols-2">
                                    <form onSubmit={handleAddAction} className="space-y-4 rounded-[24px] bg-[#101720] p-5">
                                        <div>
                                            <p className="text-xs font-semibold tracking-wide text-[#d2b179]">ADD ACTION</p>
                                            <h4 className="mt-2 text-lg font-semibold text-white">対応履歴を追加</h4>
                                        </div>

                                        <label className="space-y-2">
                                            <span className="text-xs font-semibold tracking-wide text-slate-300">アクション種別</span>
                                            <select
                                                value={actionType}
                                                onChange={(event) => setActionType(event.target.value)}
                                                className="w-full rounded-2xl border border-white/10 bg-[#0d141d] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d2b179]/60"
                                            >
                                                <option value="contacted_reporter">通報者へ確認</option>
                                                <option value="reviewed_evidence">証跡確認</option>
                                                <option value="requested_follow_up">追加確認依頼</option>
                                                <option value="account_warned">アカウント警告</option>
                                                <option value="escalated_to_suspension">停止判断へエスカレーション</option>
                                            </select>
                                        </label>

                                        <label className="space-y-2">
                                            <span className="text-xs font-semibold tracking-wide text-slate-300">メモ</span>
                                            <textarea
                                                value={actionNote}
                                                onChange={(event) => setActionNote(event.target.value)}
                                                rows={5}
                                                placeholder="確認内容や次の対応を残します。"
                                                className="w-full rounded-2xl border border-white/10 bg-[#0d141d] px-4 py-3 text-sm leading-7 text-white outline-none transition placeholder:text-slate-500 focus:border-[#d2b179]/60"
                                            />
                                        </label>

                                        <button
                                            type="submit"
                                            disabled={isSubmittingAction}
                                            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#f3dec0] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#f7e7cd] disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {isSubmittingAction ? '保存中...' : '対応履歴を追加'}
                                        </button>
                                    </form>

                                    <form onSubmit={handleResolve} className="space-y-4 rounded-[24px] bg-[#101720] p-5">
                                        <div>
                                            <p className="text-xs font-semibold tracking-wide text-[#d2b179]">RESOLVE REPORT</p>
                                            <h4 className="mt-2 text-lg font-semibold text-white">通報を解決する</h4>
                                        </div>

                                        <p className="text-sm leading-7 text-slate-300">
                                            解決時は自動で現在の管理者が担当として紐づきます。解決理由を残しておくと、あとから監査しやすくなります。
                                        </p>

                                        <label className="space-y-2">
                                            <span className="text-xs font-semibold tracking-wide text-slate-300">解決メモ</span>
                                            <textarea
                                                value={resolutionNote}
                                                onChange={(event) => setResolutionNote(event.target.value)}
                                                rows={5}
                                                placeholder="例: 警告送付後、再発防止を確認。"
                                                className="w-full rounded-2xl border border-white/10 bg-[#0d141d] px-4 py-3 text-sm leading-7 text-white outline-none transition placeholder:text-slate-500 focus:border-[#d2b179]/60"
                                            />
                                        </label>

                                        <button
                                            type="submit"
                                            disabled={isSubmittingResolve || activeDetail.status === 'resolved'}
                                            className="inline-flex min-h-11 items-center justify-center rounded-full border border-emerald-300/30 bg-emerald-300/12 px-5 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-300/18 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {activeDetail.status === 'resolved'
                                                ? 'すでに解決済み'
                                                : isSubmittingResolve
                                                    ? '解決中...'
                                                    : '解決済みにする'}
                                        </button>
                                    </form>
                                </div>
                            </section>
                        </>
                    ) : selectedListReport ? (
                        <section className="rounded-[28px] border border-white/10 bg-white/[0.04] px-6 py-8 text-sm text-slate-300">
                            {selectedListReport.public_id} の詳細を読み込めませんでした。
                        </section>
                    ) : null}
                </div>
            </section>
        </div>
    );
}
