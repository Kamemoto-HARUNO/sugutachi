import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatDateTime, formatProfileStatus } from '../lib/therapist';
import type {
    AdminAccountRecord,
    AdminTravelRequestRecord,
    ApiEnvelope,
} from '../lib/types';

type TravelStatusFilter = 'all' | 'unread' | 'read' | 'archived';
type MonitoringStatusFilter = 'all' | 'unreviewed' | 'under_review' | 'reviewed' | 'escalated';
type SenderStatusFilter = 'all' | 'active' | 'suspended';
type RestrictionStatusFilter = 'all' | 'restricted' | 'clear';
type BooleanFilter = 'all' | '1' | '0';
type SortField = 'created_at' | 'read_at' | 'archived_at' | 'monitored_at' | 'prefecture';
type SortDirection = 'asc' | 'desc';

function normalizeTravelStatusFilter(value: string | null): TravelStatusFilter {
    if (value === 'unread' || value === 'read' || value === 'archived') {
        return value;
    }

    return 'all';
}

function normalizeMonitoringStatusFilter(value: string | null): MonitoringStatusFilter {
    if (value === 'unreviewed' || value === 'under_review' || value === 'reviewed' || value === 'escalated') {
        return value;
    }

    return 'all';
}

function normalizeSenderStatusFilter(value: string | null): SenderStatusFilter {
    if (value === 'active' || value === 'suspended') {
        return value;
    }

    return 'all';
}

function normalizeRestrictionStatusFilter(value: string | null): RestrictionStatusFilter {
    if (value === 'restricted' || value === 'clear') {
        return value;
    }

    return 'all';
}

function normalizeBooleanFilter(value: string | null): BooleanFilter {
    if (value === '1' || value === '0') {
        return value;
    }

    return 'all';
}

function normalizeSortField(value: string | null): SortField {
    if (value === 'read_at' || value === 'archived_at' || value === 'monitored_at' || value === 'prefecture') {
        return value;
    }

    return 'created_at';
}

function normalizeSortDirection(value: string | null): SortDirection {
    return value === 'asc' ? 'asc' : 'desc';
}

function requestStatusLabel(status: string): string {
    switch (status) {
        case 'read':
            return '既読';
        case 'archived':
            return 'アーカイブ';
        default:
            return '未読';
    }
}

function requestStatusTone(status: string): string {
    switch (status) {
        case 'read':
            return 'bg-[#edf4ff] text-[#34557f]';
        case 'archived':
            return 'bg-[#f3efe7] text-[#55606d]';
        default:
            return 'bg-[#fff3e3] text-[#8f5c22]';
    }
}

function monitoringStatusLabel(status: string): string {
    switch (status) {
        case 'under_review':
            return '確認中';
        case 'reviewed':
            return '確認済み';
        case 'escalated':
            return 'エスカレーション';
        default:
            return '未確認';
    }
}

function monitoringStatusTone(status: string): string {
    switch (status) {
        case 'reviewed':
            return 'bg-[#e8f4ea] text-[#24553a]';
        case 'under_review':
            return 'bg-[#edf4ff] text-[#34557f]';
        case 'escalated':
            return 'bg-[#f8e8e5] text-[#8f4337]';
        default:
            return 'bg-[#fff3e3] text-[#8f5c22]';
    }
}

function senderStatusLabel(status: string | null | undefined): string {
    return status === 'suspended' ? '停止中' : '稼働中';
}

function displaySenderName(travelRequest: AdminTravelRequestRecord): string {
    return travelRequest.sender?.display_name?.trim()
        || travelRequest.sender?.email
        || travelRequest.sender?.public_id
        || travelRequest.public_id;
}

function buildDetailPath(publicId: string, search: string): string {
    return search ? `/admin/travel-requests/${publicId}${search}` : `/admin/travel-requests/${publicId}`;
}

function defaultRestrictionUntil(): string {
    const target = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000));

    return target.toISOString().slice(0, 16);
}

export function AdminTravelRequestsPage() {
    const { token } = useAuth();
    const { publicId } = useParams<{ publicId: string }>();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const [travelRequests, setTravelRequests] = useState<AdminTravelRequestRecord[]>([]);
    const [selectedTravelRequest, setSelectedTravelRequest] = useState<AdminTravelRequestRecord | null>(null);
    const [pageError, setPageError] = useState<string | null>(null);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [prefectureInput, setPrefectureInput] = useState(searchParams.get('prefecture') ?? '');
    const [queryInput, setQueryInput] = useState(searchParams.get('q') ?? '');
    const [noteInput, setNoteInput] = useState('');
    const [monitoringStatusInput, setMonitoringStatusInput] = useState<Exclude<MonitoringStatusFilter, 'all'>>('under_review');
    const [monitoringNote, setMonitoringNote] = useState('');
    const [warningReason, setWarningReason] = useState('policy_warning');
    const [warningNote, setWarningNote] = useState('');
    const [restrictionReason, setRestrictionReason] = useState('cooldown_required');
    const [restrictionUntilInput, setRestrictionUntilInput] = useState(defaultRestrictionUntil());
    const [restrictionNote, setRestrictionNote] = useState('');
    const [suspendReason, setSuspendReason] = useState('policy_violation');
    const [suspendNote, setSuspendNote] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    const [isSubmittingNote, setIsSubmittingNote] = useState(false);
    const [isSubmittingMonitoring, setIsSubmittingMonitoring] = useState(false);
    const [isSubmittingWarn, setIsSubmittingWarn] = useState(false);
    const [isSubmittingRestrict, setIsSubmittingRestrict] = useState(false);
    const [isSubmittingSuspend, setIsSubmittingSuspend] = useState(false);

    const statusFilter = normalizeTravelStatusFilter(searchParams.get('status'));
    const monitoringStatusFilter = normalizeMonitoringStatusFilter(searchParams.get('monitoring_status'));
    const senderStatusFilter = normalizeSenderStatusFilter(searchParams.get('sender_status'));
    const restrictionStatusFilter = normalizeRestrictionStatusFilter(searchParams.get('sender_restriction_status'));
    const hasNotesFilter = normalizeBooleanFilter(searchParams.get('has_notes'));
    const hasWarningFilter = normalizeBooleanFilter(searchParams.get('has_sender_warning'));
    const contactExchangeFilter = normalizeBooleanFilter(searchParams.get('detected_contact_exchange'));
    const sortField = normalizeSortField(searchParams.get('sort'));
    const direction = normalizeSortDirection(searchParams.get('direction'));
    const prefecture = searchParams.get('prefecture')?.trim() ?? '';
    const query = searchParams.get('q')?.trim() ?? '';

    usePageTitle('出張リクエスト監視');
    useToastOnMessage(successMessage, 'success');

    const selectedListTravelRequest = useMemo(
        () => travelRequests.find((travelRequest) => travelRequest.public_id === publicId) ?? null,
        [publicId, travelRequests],
    );

    const summary = useMemo(() => ({
        total: travelRequests.length,
        unread: travelRequests.filter((travelRequest) => travelRequest.status === 'unread').length,
        escalated: travelRequests.filter((travelRequest) => travelRequest.monitoring_status === 'escalated').length,
        warned: travelRequests.filter((travelRequest) => (travelRequest.sender?.travel_request_warning_count ?? 0) > 0).length,
        restricted: travelRequests.filter((travelRequest) => Boolean(travelRequest.sender?.travel_request_restricted_until)).length,
    }), [travelRequests]);

    const loadTravelRequests = useCallback(async (refresh = false) => {
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

        if (monitoringStatusFilter !== 'all') {
            params.set('monitoring_status', monitoringStatusFilter);
        }

        if (senderStatusFilter !== 'all') {
            params.set('sender_status', senderStatusFilter);
        }

        if (restrictionStatusFilter !== 'all') {
            params.set('sender_restriction_status', restrictionStatusFilter);
        }

        if (hasNotesFilter !== 'all') {
            params.set('has_notes', hasNotesFilter);
        }

        if (hasWarningFilter !== 'all') {
            params.set('has_sender_warning', hasWarningFilter);
        }

        if (contactExchangeFilter !== 'all') {
            params.set('detected_contact_exchange', contactExchangeFilter);
        }

        if (prefecture) {
            params.set('prefecture', prefecture);
        }

        if (query) {
            params.set('q', query);
        }

        params.set('sort', sortField);
        params.set('direction', direction);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminTravelRequestRecord[]>>(`/admin/travel-requests?${params.toString()}`, { token });
            setTravelRequests(unwrapData(payload));
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '出張リクエスト一覧の取得に失敗しました。';

            setPageError(message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [contactExchangeFilter, direction, hasNotesFilter, hasWarningFilter, monitoringStatusFilter, prefecture, query, restrictionStatusFilter, senderStatusFilter, sortField, statusFilter, token]);

    const loadDetail = useCallback(async () => {
        if (!token || !publicId) {
            setSelectedTravelRequest(null);
            setDetailError(null);
            return;
        }

        setIsLoadingDetail(true);
        setDetailError(null);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminTravelRequestRecord>>(`/admin/travel-requests/${publicId}`, { token });
            setSelectedTravelRequest(unwrapData(payload));
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '出張リクエスト詳細の取得に失敗しました。';

            setDetailError(message);
            setSelectedTravelRequest(null);
        } finally {
            setIsLoadingDetail(false);
        }
    }, [publicId, token]);

    useEffect(() => {
        void loadTravelRequests();
    }, [loadTravelRequests]);

    useEffect(() => {
        void loadDetail();
    }, [loadDetail]);

    useEffect(() => {
        if (!selectedTravelRequest) {
            return;
        }

        setMonitoringStatusInput(selectedTravelRequest.monitoring_status as Exclude<MonitoringStatusFilter, 'all'>);
    }, [selectedTravelRequest]);

    function updateFilters(
        next: Partial<Record<'status' | 'monitoring_status' | 'sender_status' | 'sender_restriction_status' | 'has_notes' | 'has_sender_warning' | 'detected_contact_exchange' | 'prefecture' | 'q' | 'sort' | 'direction', string | null>>,
    ) {
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

    async function refreshDetailAndList() {
        await Promise.all([
            loadTravelRequests(true),
            loadDetail(),
        ]);
    }

    async function handleAddNote(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token || !selectedTravelRequest || !noteInput.trim()) {
            return;
        }

        setIsSubmittingNote(true);
        setActionError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminTravelRequestRecord>>(`/admin/travel-requests/${selectedTravelRequest.public_id}/notes`, {
                method: 'POST',
                token,
                body: { note: noteInput.trim() },
            });

            const updated = unwrapData(payload);
            setSelectedTravelRequest(updated);
            setTravelRequests((current) => current.map((travelRequest) => travelRequest.public_id === updated.public_id ? { ...travelRequest, ...updated } : travelRequest));
            setNoteInput('');
            setSuccessMessage('内部メモを追加しました。');
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '内部メモの追加に失敗しました。';

            setActionError(message);
        } finally {
            setIsSubmittingNote(false);
        }
    }

    async function handleMonitoring(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token || !selectedTravelRequest) {
            return;
        }

        setIsSubmittingMonitoring(true);
        setActionError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminTravelRequestRecord>>(`/admin/travel-requests/${selectedTravelRequest.public_id}/monitoring`, {
                method: 'POST',
                token,
                body: {
                    monitoring_status: monitoringStatusInput,
                    note: monitoringNote.trim() || undefined,
                },
            });

            const updated = unwrapData(payload);
            setSelectedTravelRequest(updated);
            setTravelRequests((current) => current.map((travelRequest) => travelRequest.public_id === updated.public_id ? { ...travelRequest, ...updated } : travelRequest));
            setMonitoringNote('');
            setSuccessMessage('監視ステータスを更新しました。');
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '監視ステータスの更新に失敗しました。';

            setActionError(message);
        } finally {
            setIsSubmittingMonitoring(false);
        }
    }

    async function handleWarnSender(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token || !selectedTravelRequest || !warningReason.trim()) {
            return;
        }

        setIsSubmittingWarn(true);
        setActionError(null);
        setSuccessMessage(null);

        try {
            await apiRequest<ApiEnvelope<AdminAccountRecord>>(`/admin/travel-requests/${selectedTravelRequest.public_id}/warn-sender`, {
                method: 'POST',
                token,
                body: {
                    reason_code: warningReason.trim(),
                    note: warningNote.trim() || undefined,
                },
            });

            setWarningNote('');
            await refreshDetailAndList();
            setSuccessMessage('送信者へ警告を記録しました。');
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '送信者への警告記録に失敗しました。';

            setActionError(message);
        } finally {
            setIsSubmittingWarn(false);
        }
    }

    async function handleRestrictSender(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token || !selectedTravelRequest || !restrictionReason.trim() || !restrictionUntilInput.trim()) {
            return;
        }

        const restrictedUntil = new Date(restrictionUntilInput);

        if (Number.isNaN(restrictedUntil.getTime())) {
            setActionError('送信制限の日時が不正です。');
            return;
        }

        setIsSubmittingRestrict(true);
        setActionError(null);
        setSuccessMessage(null);

        try {
            await apiRequest<ApiEnvelope<AdminAccountRecord>>(`/admin/travel-requests/${selectedTravelRequest.public_id}/restrict-sender`, {
                method: 'POST',
                token,
                body: {
                    reason_code: restrictionReason.trim(),
                    restricted_until: restrictedUntil.toISOString(),
                    note: restrictionNote.trim() || undefined,
                },
            });

            setRestrictionNote('');
            await refreshDetailAndList();
            setSuccessMessage('送信制限を設定しました。');
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '送信制限の設定に失敗しました。';

            setActionError(message);
        } finally {
            setIsSubmittingRestrict(false);
        }
    }

    async function handleSuspendSender(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token || !selectedTravelRequest || !suspendReason.trim()) {
            return;
        }

        setIsSubmittingSuspend(true);
        setActionError(null);
        setSuccessMessage(null);

        try {
            await apiRequest<ApiEnvelope<AdminAccountRecord>>(`/admin/travel-requests/${selectedTravelRequest.public_id}/suspend-sender`, {
                method: 'POST',
                token,
                body: {
                    reason_code: suspendReason.trim(),
                    note: suspendNote.trim() || undefined,
                },
            });

            setSuspendNote('');
            await refreshDetailAndList();
            setSuccessMessage('送信者アカウントを停止しました。');
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '送信者アカウントの停止に失敗しました。';

            setActionError(message);
        } finally {
            setIsSubmittingSuspend(false);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="出張リクエスト監視を読み込み中" message="需要通知と送信者リスクを集約しています。" />;
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_16px_34px_rgba(2,6,23,0.14)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">TRAVEL REQUEST OPERATIONS</p>
                        <h2 className="text-2xl font-semibold text-white sm:text-[2rem]">出張リクエスト監視</h2>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            エリア需要の監視、送信者の警告管理、制限や停止までをまとめて進められます。
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            void loadTravelRequests(true);
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
                    { label: '未読', value: summary.unread, hint: '初回確認待ち' },
                    { label: 'エスカレーション', value: summary.escalated, hint: '追加対応が必要' },
                    { label: '警告済み送信者', value: summary.warned, hint: 'warning_count > 0' },
                    { label: '制限中送信者', value: summary.restricted, hint: '送信停止期間あり' },
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
                            onChange={(event) => updateFilters({ status: event.target.value })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="all">すべて</option>
                            <option value="unread">未読</option>
                            <option value="read">既読</option>
                            <option value="archived">アーカイブ</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">監視状態</span>
                        <select
                            value={monitoringStatusFilter}
                            onChange={(event) => updateFilters({ monitoring_status: event.target.value })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="all">すべて</option>
                            <option value="unreviewed">未確認</option>
                            <option value="under_review">確認中</option>
                            <option value="reviewed">確認済み</option>
                            <option value="escalated">エスカレーション</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">送信者状態</span>
                        <select
                            value={senderStatusFilter}
                            onChange={(event) => updateFilters({ sender_status: event.target.value })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="all">すべて</option>
                            <option value="active">稼働中</option>
                            <option value="suspended">停止中</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">送信制限</span>
                        <select
                            value={restrictionStatusFilter}
                            onChange={(event) => updateFilters({ sender_restriction_status: event.target.value })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="all">すべて</option>
                            <option value="restricted">制限中</option>
                            <option value="clear">制限なし</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">連絡先交換検知</span>
                        <select
                            value={contactExchangeFilter}
                            onChange={(event) => updateFilters({ detected_contact_exchange: event.target.value })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="all">すべて</option>
                            <option value="1">あり</option>
                            <option value="0">なし</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">警告済み</span>
                        <select
                            value={hasWarningFilter}
                            onChange={(event) => updateFilters({ has_sender_warning: event.target.value })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="all">すべて</option>
                            <option value="1">警告あり</option>
                            <option value="0">警告なし</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">内部メモ</span>
                        <select
                            value={hasNotesFilter}
                            onChange={(event) => updateFilters({ has_notes: event.target.value })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="all">すべて</option>
                            <option value="1">メモあり</option>
                            <option value="0">メモなし</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">都道府県</span>
                        <input
                            value={prefectureInput}
                            onChange={(event) => setPrefectureInput(event.target.value)}
                            onBlur={() => updateFilters({ prefecture: prefectureInput.trim() || null })}
                            placeholder="福岡県"
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition placeholder:text-[#9aa3ad] focus:border-[#b5894d]"
                        />
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">検索</span>
                        <input
                            value={queryInput}
                            onChange={(event) => setQueryInput(event.target.value)}
                            onBlur={() => updateFilters({ q: queryInput.trim() || null })}
                            placeholder="送信者名 / タチキャスト名 / public_id"
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition placeholder:text-[#9aa3ad] focus:border-[#b5894d]"
                        />
                    </label>

                    <div className="grid gap-3 sm:grid-cols-2 xl:col-span-2">
                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-[#17202b]">並び順</span>
                            <select
                                value={sortField}
                                onChange={(event) => updateFilters({ sort: event.target.value })}
                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                            >
                                <option value="created_at">受付日時</option>
                                <option value="read_at">既読日時</option>
                                <option value="archived_at">アーカイブ日時</option>
                                <option value="monitored_at">監視更新日時</option>
                                <option value="prefecture">都道府県</option>
                            </select>
                        </label>

                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-[#17202b]">方向</span>
                            <select
                                value={direction}
                                onChange={(event) => updateFilters({ direction: event.target.value })}
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
                <div className="space-y-4">
                    <div className="rounded-[28px] bg-white p-5 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <div className="flex items-center justify-between gap-4 border-b border-[#ece3d4] pb-4">
                            <div>
                                <h3 className="text-lg font-semibold text-[#17202b]">受信一覧</h3>
                                <p className="mt-1 text-sm text-[#68707a]">送信者リスクと需要の偏りを一覧で確認できます。</p>
                            </div>
                            <p className="text-sm font-semibold text-[#7d6852]">{travelRequests.length}件</p>
                        </div>

                        <div className="mt-4 space-y-3">
                            {travelRequests.length > 0 ? travelRequests.map((travelRequest) => {
                                const isSelected = travelRequest.public_id === publicId;

                                return (
                                    <Link
                                        key={travelRequest.public_id}
                                        to={buildDetailPath(travelRequest.public_id, location.search)}
                                        className={`block rounded-[24px] border px-4 py-4 transition ${
                                            isSelected
                                                ? 'border-[#b5894d] bg-[#fff8ef] shadow-[0_14px_30px_rgba(181,137,77,0.16)]'
                                                : 'border-[#ece3d4] bg-[#fffcf6] hover:border-[#d8c2a0] hover:bg-[#fff8ef]'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-base font-semibold text-[#17202b]">{displaySenderName(travelRequest)}</p>
                                                <p className="mt-1 text-xs text-[#7d6852]">{travelRequest.sender?.public_id ?? '送信者未設定'}</p>
                                            </div>
                                            <div className="flex flex-wrap justify-end gap-2">
                                                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${requestStatusTone(travelRequest.status)}`}>
                                                    {requestStatusLabel(travelRequest.status)}
                                                </span>
                                                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${monitoringStatusTone(travelRequest.monitoring_status)}`}>
                                                    {monitoringStatusLabel(travelRequest.monitoring_status)}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="mt-3 grid gap-2 text-sm text-[#55606d] sm:grid-cols-2">
                                            <p>都道府県: <span className="font-medium text-[#17202b]">{travelRequest.prefecture}</span></p>
                                            <p>受付: <span className="font-medium text-[#17202b]">{formatDateTime(travelRequest.created_at)}</span></p>
                                            <p>担当: <span className="font-medium text-[#17202b]">{travelRequest.therapist_profile?.public_name ?? '未設定'}</span></p>
                                            <p>メモ: <span className="font-medium text-[#17202b]">{travelRequest.admin_note_count ?? 0}件</span></p>
                                        </div>

                                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#7d6852]">
                                            {travelRequest.detected_contact_exchange ? (
                                                <span className="rounded-full bg-[#f8e8e5] px-3 py-1 font-semibold text-[#8f4337]">連絡先交換検知</span>
                                            ) : null}
                                            {(travelRequest.sender?.travel_request_warning_count ?? 0) > 0 ? (
                                                <span className="rounded-full bg-[#fff3e3] px-3 py-1 font-semibold text-[#8f5c22]">
                                                    警告 {travelRequest.sender?.travel_request_warning_count}回
                                                </span>
                                            ) : null}
                                            {travelRequest.sender?.travel_request_restricted_until ? (
                                                <span className="rounded-full bg-[#edf4ff] px-3 py-1 font-semibold text-[#34557f]">送信制限中</span>
                                            ) : null}
                                        </div>
                                    </Link>
                                );
                            }) : (
                                <div className="rounded-[24px] border border-dashed border-[#d9c9ae] bg-[#fffdf8] px-5 py-8 text-center text-sm text-[#7d6852]">
                                    条件に合う出張リクエストはありません。
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                    {!publicId ? (
                        <div className="flex min-h-[420px] items-center justify-center rounded-[24px] border border-dashed border-[#d9c9ae] bg-[#fffdf8] px-6 text-center text-sm leading-7 text-[#7d6852]">
                            左の一覧から出張リクエストを選ぶと、本文、運営メモ、送信者アクションを確認できます。
                        </div>
                    ) : isLoadingDetail ? (
                        <div className="flex min-h-[420px] items-center justify-center text-sm text-[#7d6852]">
                            詳細を読み込んでいます...
                        </div>
                    ) : detailError ? (
                        <div className="rounded-[24px] border border-[#f1d4b5] bg-[#fff4e8] px-5 py-4 text-sm text-[#9a4b35]">
                            {detailError}
                        </div>
                    ) : selectedTravelRequest ? (
                        <div className="space-y-6">
                            <div className="flex flex-col gap-4 border-b border-[#ece3d4] pb-5 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                    <p className="text-xs font-semibold tracking-wide text-[#b5894d]">TRAVEL REQUEST DETAIL</p>
                                    <h3 className="mt-2 text-2xl font-semibold text-[#17202b]">{displaySenderName(selectedTravelRequest)}</h3>
                                    <p className="mt-2 text-sm text-[#68707a]">リクエストID {selectedTravelRequest.public_id}</p>
                                    <p className="mt-1 text-xs text-[#7d6852]">受付 {formatDateTime(selectedTravelRequest.created_at)}</p>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${requestStatusTone(selectedTravelRequest.status)}`}>
                                        {requestStatusLabel(selectedTravelRequest.status)}
                                    </span>
                                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${monitoringStatusTone(selectedTravelRequest.monitoring_status)}`}>
                                        {monitoringStatusLabel(selectedTravelRequest.monitoring_status)}
                                    </span>
                                </div>
                            </div>

                            {actionError ? (
                                <div className="rounded-[22px] border border-[#f1d4b5] bg-[#fff4e8] px-4 py-3 text-sm text-[#9a4b35]">
                                    {actionError}
                                </div>
                            ) : null}


                            <div className="grid gap-4 md:grid-cols-2">
                                <article className="rounded-[22px] border border-[#ece3d4] bg-[#fffcf6] p-4 text-sm text-[#55606d]">
                                    <p className="text-xs font-semibold tracking-wide text-[#b5894d]">送信者</p>
                                    <p className="mt-2 font-semibold text-[#17202b]">{displaySenderName(selectedTravelRequest)}</p>
                                    <p className="mt-1">{selectedTravelRequest.sender?.email ?? 'メール未設定'}</p>
                                    <p className="mt-1">状態 {senderStatusLabel(selectedTravelRequest.sender?.status)}</p>
                                    <p className="mt-1">警告回数 {selectedTravelRequest.sender?.travel_request_warning_count ?? 0}</p>
                                    <p className="mt-1">最終警告 {formatDateTime(selectedTravelRequest.sender?.travel_request_last_warned_at)}</p>
                                    <p className="mt-1">送信制限 {formatDateTime(selectedTravelRequest.sender?.travel_request_restricted_until)}</p>
                                    {selectedTravelRequest.sender?.public_id ? (
                                        <Link className="mt-3 inline-flex text-sm font-semibold text-[#8f5c22] hover:text-[#6f4718]" to={`/admin/accounts/${selectedTravelRequest.sender.public_id}`}>
                                            アカウント詳細へ
                                        </Link>
                                    ) : null}
                                </article>

                                <article className="rounded-[22px] border border-[#ece3d4] bg-[#fffcf6] p-4 text-sm text-[#55606d]">
                                    <p className="text-xs font-semibold tracking-wide text-[#b5894d]">対象タチキャスト</p>
                                    <p className="mt-2 font-semibold text-[#17202b]">{selectedTravelRequest.therapist_profile?.public_name ?? '未設定'}</p>
                                    <p className="mt-1">{selectedTravelRequest.therapist_profile?.account?.display_name ?? selectedTravelRequest.therapist_profile?.account?.email ?? 'アカウント未設定'}</p>
                                    <p className="mt-1">プロフィール {formatProfileStatus(selectedTravelRequest.therapist_profile?.profile_status)}</p>
                                    <p className="mt-1">都道府県 {selectedTravelRequest.prefecture}</p>
                                    {selectedTravelRequest.therapist_profile?.public_id ? (
                                        <Link className="mt-3 inline-flex text-sm font-semibold text-[#8f5c22] hover:text-[#6f4718]" to={`/admin/therapist-profiles/${selectedTravelRequest.therapist_profile.public_id}`}>
                                            プロフィール審査へ
                                        </Link>
                                    ) : null}
                                </article>

                                <article className="rounded-[22px] border border-[#ece3d4] bg-[#fffcf6] p-4 text-sm text-[#55606d]">
                                    <p className="text-xs font-semibold tracking-wide text-[#b5894d]">監視情報</p>
                                    <p className="mt-2 font-semibold text-[#17202b]">{monitoringStatusLabel(selectedTravelRequest.monitoring_status)}</p>
                                    <p className="mt-1">監視更新 {formatDateTime(selectedTravelRequest.monitored_at)}</p>
                                    <p className="mt-1">担当 {selectedTravelRequest.monitored_by_admin?.display_name ?? selectedTravelRequest.monitored_by_admin?.public_id ?? '未設定'}</p>
                                    <p className="mt-1">内部メモ {selectedTravelRequest.admin_note_count ?? 0}件</p>
                                </article>

                                <article className="rounded-[22px] border border-[#ece3d4] bg-[#fffcf6] p-4 text-sm text-[#55606d]">
                                    <p className="text-xs font-semibold tracking-wide text-[#b5894d]">リスクシグナル</p>
                                    <p className="mt-2 font-semibold text-[#17202b]">
                                        {selectedTravelRequest.detected_contact_exchange ? '連絡先交換の検知あり' : '明確な検知なし'}
                                    </p>
                                    <p className="mt-1">停止理由 {selectedTravelRequest.sender?.suspension_reason ?? 'なし'}</p>
                                    <p className="mt-1">制限理由 {selectedTravelRequest.sender?.travel_request_restriction_reason ?? 'なし'}</p>
                                    <p className="mt-1">最終警告理由 {selectedTravelRequest.sender?.travel_request_last_warning_reason ?? 'なし'}</p>
                                </article>
                            </div>

                            <section className="rounded-[24px] border border-[#ece3d4] bg-[#fffcf6] p-5">
                                <p className="text-xs font-semibold tracking-wide text-[#b5894d]">送信本文</p>
                                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#17202b]">
                                    {selectedTravelRequest.message?.trim() || '本文はありません。'}
                                </p>
                            </section>

                            <section className="grid gap-4 xl:grid-cols-2">
                                <form onSubmit={handleAddNote} className="rounded-[24px] border border-[#ece3d4] bg-[#fffcf6] p-5">
                                    <p className="text-sm font-semibold text-[#17202b]">内部メモ追加</p>
                                    <textarea
                                        value={noteInput}
                                        onChange={(event) => setNoteInput(event.target.value)}
                                        rows={4}
                                        placeholder="確認メモや次の対応方針を残します。"
                                        className="mt-3 w-full rounded-[18px] border border-[#d9c9ae] bg-white px-4 py-3 text-sm text-[#17202b] outline-none transition placeholder:text-[#9aa3ad] focus:border-[#b5894d]"
                                    />
                                    <button
                                        type="submit"
                                        disabled={isSubmittingNote || !noteInput.trim()}
                                        className="mt-3 inline-flex rounded-full bg-[#17202b] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#223243] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {isSubmittingNote ? '保存中...' : 'メモを追加'}
                                    </button>
                                </form>

                                <form onSubmit={handleMonitoring} className="rounded-[24px] border border-[#ece3d4] bg-[#fffcf6] p-5">
                                    <p className="text-sm font-semibold text-[#17202b]">監視ステータス更新</p>
                                    <select
                                        value={monitoringStatusInput}
                                        onChange={(event) => setMonitoringStatusInput(event.target.value as Exclude<MonitoringStatusFilter, 'all'>)}
                                        className="mt-3 w-full rounded-[18px] border border-[#d9c9ae] bg-white px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                    >
                                        <option value="unreviewed">未確認</option>
                                        <option value="under_review">確認中</option>
                                        <option value="reviewed">確認済み</option>
                                        <option value="escalated">エスカレーション</option>
                                    </select>
                                    <textarea
                                        value={monitoringNote}
                                        onChange={(event) => setMonitoringNote(event.target.value)}
                                        rows={3}
                                        placeholder="監視更新の背景があれば記録します。"
                                        className="mt-3 w-full rounded-[18px] border border-[#d9c9ae] bg-white px-4 py-3 text-sm text-[#17202b] outline-none transition placeholder:text-[#9aa3ad] focus:border-[#b5894d]"
                                    />
                                    <button
                                        type="submit"
                                        disabled={isSubmittingMonitoring}
                                        className="mt-3 inline-flex rounded-full bg-[#8f5c22] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#74460f] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {isSubmittingMonitoring ? '更新中...' : '監視状態を更新'}
                                    </button>
                                </form>
                            </section>

                            {selectedTravelRequest.notes && selectedTravelRequest.notes.length > 0 ? (
                                <section className="rounded-[24px] border border-[#ece3d4] bg-[#fffcf6] p-5">
                                    <p className="text-sm font-semibold text-[#17202b]">内部メモ履歴</p>
                                    <div className="mt-4 space-y-3">
                                        {selectedTravelRequest.notes.map((note) => (
                                            <article key={note.id} className="rounded-[18px] border border-[#ece3d4] bg-white px-4 py-3 text-sm text-[#55606d]">
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#7d6852]">
                                                    <span>{note.author?.display_name ?? note.author?.public_id ?? '運営'}</span>
                                                    <span>{formatDateTime(note.created_at)}</span>
                                                </div>
                                                <p className="mt-2 whitespace-pre-wrap leading-6 text-[#17202b]">{note.note}</p>
                                            </article>
                                        ))}
                                    </div>
                                </section>
                            ) : null}

                            <section className="grid gap-4 xl:grid-cols-3">
                                <form onSubmit={handleWarnSender} className="rounded-[24px] border border-[#ece3d4] bg-[#fffcf6] p-5">
                                    <p className="text-sm font-semibold text-[#17202b]">警告を記録</p>
                                    <input
                                        value={warningReason}
                                        onChange={(event) => setWarningReason(event.target.value)}
                                        placeholder="policy_warning"
                                        className="mt-3 w-full rounded-[18px] border border-[#d9c9ae] bg-white px-4 py-3 text-sm text-[#17202b] outline-none transition placeholder:text-[#9aa3ad] focus:border-[#b5894d]"
                                    />
                                    <textarea
                                        value={warningNote}
                                        onChange={(event) => setWarningNote(event.target.value)}
                                        rows={4}
                                        placeholder="警告理由や注意した内容を残します。"
                                        className="mt-3 w-full rounded-[18px] border border-[#d9c9ae] bg-white px-4 py-3 text-sm text-[#17202b] outline-none transition placeholder:text-[#9aa3ad] focus:border-[#b5894d]"
                                    />
                                    <button
                                        type="submit"
                                        disabled={isSubmittingWarn || !warningReason.trim()}
                                        className="mt-3 inline-flex rounded-full bg-[#8f5c22] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#74460f] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {isSubmittingWarn ? '記録中...' : '警告する'}
                                    </button>
                                </form>

                                <form onSubmit={handleRestrictSender} className="rounded-[24px] border border-[#ece3d4] bg-[#fffcf6] p-5">
                                    <p className="text-sm font-semibold text-[#17202b]">送信制限</p>
                                    <input
                                        value={restrictionReason}
                                        onChange={(event) => setRestrictionReason(event.target.value)}
                                        placeholder="cooldown_required"
                                        className="mt-3 w-full rounded-[18px] border border-[#d9c9ae] bg-white px-4 py-3 text-sm text-[#17202b] outline-none transition placeholder:text-[#9aa3ad] focus:border-[#b5894d]"
                                    />
                                    <input
                                        type="datetime-local"
                                        value={restrictionUntilInput}
                                        onChange={(event) => setRestrictionUntilInput(event.target.value)}
                                        className="mt-3 w-full rounded-[18px] border border-[#d9c9ae] bg-white px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                    />
                                    <textarea
                                        value={restrictionNote}
                                        onChange={(event) => setRestrictionNote(event.target.value)}
                                        rows={3}
                                        placeholder="制限期間の理由や解除条件を残します。"
                                        className="mt-3 w-full rounded-[18px] border border-[#d9c9ae] bg-white px-4 py-3 text-sm text-[#17202b] outline-none transition placeholder:text-[#9aa3ad] focus:border-[#b5894d]"
                                    />
                                    <button
                                        type="submit"
                                        disabled={isSubmittingRestrict || !restrictionReason.trim() || !restrictionUntilInput.trim()}
                                        className="mt-3 inline-flex rounded-full bg-[#34557f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#274261] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {isSubmittingRestrict ? '設定中...' : '制限を設定'}
                                    </button>
                                </form>

                                <form onSubmit={handleSuspendSender} className="rounded-[24px] border border-[#f0c9c3] bg-[#fff7f5] p-5">
                                    <p className="text-sm font-semibold text-[#17202b]">アカウント停止</p>
                                    <input
                                        value={suspendReason}
                                        onChange={(event) => setSuspendReason(event.target.value)}
                                        placeholder="policy_violation"
                                        className="mt-3 w-full rounded-[18px] border border-[#e1b5ad] bg-white px-4 py-3 text-sm text-[#17202b] outline-none transition placeholder:text-[#9aa3ad] focus:border-[#c9796d]"
                                    />
                                    <textarea
                                        value={suspendNote}
                                        onChange={(event) => setSuspendNote(event.target.value)}
                                        rows={4}
                                        placeholder="停止判断の根拠を残します。"
                                        className="mt-3 w-full rounded-[18px] border border-[#e1b5ad] bg-white px-4 py-3 text-sm text-[#17202b] outline-none transition placeholder:text-[#9aa3ad] focus:border-[#c9796d]"
                                    />
                                    <button
                                        type="submit"
                                        disabled={isSubmittingSuspend || !suspendReason.trim()}
                                        className="mt-3 inline-flex rounded-full bg-[#8f4337] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#703128] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {isSubmittingSuspend ? '停止中...' : '停止する'}
                                    </button>
                                </form>
                            </section>
                        </div>
                    ) : (
                        <div className="flex min-h-[420px] items-center justify-center rounded-[24px] border border-dashed border-[#d9c9ae] bg-[#fffdf8] px-6 text-center text-sm leading-7 text-[#7d6852]">
                            選択した出張リクエストの詳細を表示できませんでした。
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
