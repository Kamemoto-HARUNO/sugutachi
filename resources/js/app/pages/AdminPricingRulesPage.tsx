import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatDateTime, formatProfileStatus } from '../lib/therapist';
import type {
    AdminPricingRuleRecord,
    ApiEnvelope,
} from '../lib/types';

type AdjustmentBucketFilter = 'all' | 'profile_adjustment' | 'demand_fee';
type MonitoringFlagFilter = 'all' | 'inactive_menu' | 'extreme_percentage' | 'menu_price_override';
type MonitoringStatusFilter = 'all' | 'unreviewed' | 'under_review' | 'reviewed' | 'escalated';
type ScopeFilter = 'all' | 'profile' | 'menu';
type BooleanFilter = 'all' | '1' | '0';
type SortField = 'priority' | 'created_at' | 'updated_at' | 'adjustment_amount';
type SortDirection = 'asc' | 'desc';

function normalizeAdjustmentBucketFilter(value: string | null): AdjustmentBucketFilter {
    if (value === 'profile_adjustment' || value === 'demand_fee') {
        return value;
    }

    return 'all';
}

function normalizeMonitoringFlagFilter(value: string | null): MonitoringFlagFilter {
    if (value === 'inactive_menu' || value === 'extreme_percentage' || value === 'menu_price_override') {
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

function normalizeScopeFilter(value: string | null): ScopeFilter {
    if (value === 'profile' || value === 'menu') {
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
    if (value === 'created_at' || value === 'updated_at' || value === 'adjustment_amount') {
        return value;
    }

    return 'priority';
}

function normalizeSortDirection(value: string | null): SortDirection {
    return value === 'desc' ? 'desc' : 'asc';
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
            return 'bg-[#fff3e3] text-[#8f5c22]';
        case 'escalated':
            return 'bg-[#f8e8e5] text-[#8f4337]';
        default:
            return 'bg-[#edf4ff] text-[#34557f]';
    }
}

function ruleTypeLabel(ruleType: string): string {
    switch (ruleType) {
        case 'user_profile_attribute':
            return 'プロフィール属性';
        case 'time_band':
            return '時間帯';
        case 'walking_time_range':
            return '移動時間';
        case 'demand_level':
            return '需要レベル';
        default:
            return ruleType;
    }
}

function scopeLabel(scope: string): string {
    return scope === 'menu' ? 'メニュー単位' : 'プロフィール全体';
}

function monitoringFlagLabel(flag: string): string {
    switch (flag) {
        case 'inactive_menu':
            return '非公開メニューに適用';
        case 'extreme_percentage':
            return '極端な割合調整';
        case 'menu_price_override':
            return 'メニュー価格超過';
        default:
            return flag;
    }
}

function adjustmentLabel(rule: AdminPricingRuleRecord): string {
    if (rule.adjustment_type === 'fixed_amount') {
        return `${rule.adjustment_amount.toLocaleString('ja-JP')}円`;
    }

    return `${rule.adjustment_amount}%`;
}

function priceLabel(value: number | null): string {
    if (value == null) {
        return '未設定';
    }

    return `${value.toLocaleString('ja-JP')}円`;
}

function displayRuleOwner(rule: AdminPricingRuleRecord): string {
    return rule.therapist_profile?.public_name?.trim()
        || rule.therapist_profile?.account?.display_name?.trim()
        || rule.therapist_profile?.account?.email
        || rule.therapist_profile?.public_id
        || `Rule #${rule.id}`;
}

export function AdminPricingRulesPage() {
    const { token } = useAuth();
    const { id } = useParams<{ id: string }>();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const [rules, setRules] = useState<AdminPricingRuleRecord[]>([]);
    const [selectedRule, setSelectedRule] = useState<AdminPricingRuleRecord | null>(null);
    const [pageError, setPageError] = useState<string | null>(null);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [noteInput, setNoteInput] = useState('');
    const [monitoringStatusInput, setMonitoringStatusInput] = useState<Exclude<MonitoringStatusFilter, 'all'>>('unreviewed');
    const [monitoringNote, setMonitoringNote] = useState('');
    const [queryInput, setQueryInput] = useState(searchParams.get('q') ?? '');
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    const [isSubmittingNote, setIsSubmittingNote] = useState(false);
    const [isSubmittingMonitoring, setIsSubmittingMonitoring] = useState(false);

    const adjustmentBucketFilter = normalizeAdjustmentBucketFilter(searchParams.get('adjustment_bucket'));
    const monitoringFlagFilter = normalizeMonitoringFlagFilter(searchParams.get('monitoring_flag'));
    const monitoringStatusFilter = normalizeMonitoringStatusFilter(searchParams.get('monitoring_status'));
    const scopeFilter = normalizeScopeFilter(searchParams.get('scope'));
    const activeFilter = normalizeBooleanFilter(searchParams.get('is_active'));
    const hasNotesFilter = normalizeBooleanFilter(searchParams.get('has_notes'));
    const hasFlagsFilter = normalizeBooleanFilter(searchParams.get('has_monitoring_flags'));
    const sortField = normalizeSortField(searchParams.get('sort'));
    const direction = normalizeSortDirection(searchParams.get('direction'));
    const query = searchParams.get('q')?.trim() ?? '';

    usePageTitle('料金ルール監視');
    useToastOnMessage(successMessage, 'success');

    const selectedListRule = useMemo(
        () => rules.find((rule) => String(rule.id) === id) ?? null,
        [rules, id],
    );

    const summary = useMemo(() => ({
        total: rules.length,
        flagged: rules.filter((rule) => rule.has_monitoring_flags).length,
        underReview: rules.filter((rule) => rule.monitoring_status === 'under_review').length,
        escalated: rules.filter((rule) => rule.monitoring_status === 'escalated').length,
        inactive: rules.filter((rule) => !rule.is_active).length,
    }), [rules]);

    const loadRules = useCallback(async (refresh = false) => {
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

        if (adjustmentBucketFilter !== 'all') {
            params.set('adjustment_bucket', adjustmentBucketFilter);
        }

        if (monitoringFlagFilter !== 'all') {
            params.set('monitoring_flag', monitoringFlagFilter);
        }

        if (monitoringStatusFilter !== 'all') {
            params.set('monitoring_status', monitoringStatusFilter);
        }

        if (scopeFilter !== 'all') {
            params.set('scope', scopeFilter);
        }

        if (activeFilter !== 'all') {
            params.set('is_active', activeFilter);
        }

        if (hasNotesFilter !== 'all') {
            params.set('has_notes', hasNotesFilter);
        }

        if (hasFlagsFilter !== 'all') {
            params.set('has_monitoring_flags', hasFlagsFilter);
        }

        if (query) {
            params.set('q', query);
        }

        params.set('sort', sortField);
        params.set('direction', direction);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminPricingRuleRecord[]>>(`/admin/pricing-rules?${params.toString()}`, { token });
            setRules(unwrapData(payload));
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '料金ルール一覧の取得に失敗しました。';

            setPageError(message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [activeFilter, adjustmentBucketFilter, direction, hasFlagsFilter, hasNotesFilter, monitoringFlagFilter, monitoringStatusFilter, query, scopeFilter, sortField, token]);

    const loadDetail = useCallback(async () => {
        if (!token || !id) {
            setSelectedRule(null);
            setDetailError(null);
            return;
        }

        setIsLoadingDetail(true);
        setDetailError(null);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminPricingRuleRecord>>(`/admin/pricing-rules/${id}`, { token });
            setSelectedRule(unwrapData(payload));
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '料金ルール詳細の取得に失敗しました。';

            setDetailError(message);
            setSelectedRule(null);
        } finally {
            setIsLoadingDetail(false);
        }
    }, [id, token]);

    useEffect(() => {
        void loadRules();
    }, [loadRules]);

    useEffect(() => {
        void loadDetail();
    }, [loadDetail]);

    useEffect(() => {
        if (selectedRule) {
            setMonitoringStatusInput(selectedRule.monitoring_status as Exclude<MonitoringStatusFilter, 'all'>);
        }
    }, [selectedRule]);

    function updateFilters(
        next: Partial<Record<'adjustment_bucket' | 'monitoring_flag' | 'monitoring_status' | 'scope' | 'is_active' | 'has_notes' | 'has_monitoring_flags' | 'sort' | 'direction' | 'q', string | null>>,
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

    async function handleAddNote(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token || !selectedRule) {
            return;
        }

        setIsSubmittingNote(true);
        setActionError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminPricingRuleRecord>>(`/admin/pricing-rules/${selectedRule.id}/notes`, {
                method: 'POST',
                token,
                body: { note: noteInput.trim() },
            });

            const updated = unwrapData(payload);
            setSelectedRule(updated);
            setRules((current) => current.map((rule) => rule.id === updated.id ? updated : rule));
            setNoteInput('');
            setSuccessMessage('料金ルールに運営メモを追加しました。');
            void loadRules(true);
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '料金ルールメモの追加に失敗しました。';

            setActionError(message);
        } finally {
            setIsSubmittingNote(false);
        }
    }

    async function handleMonitoringUpdate(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token || !selectedRule) {
            return;
        }

        setIsSubmittingMonitoring(true);
        setActionError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminPricingRuleRecord>>(`/admin/pricing-rules/${selectedRule.id}/monitoring`, {
                method: 'POST',
                token,
                body: {
                    monitoring_status: monitoringStatusInput,
                    note: monitoringNote.trim() || null,
                },
            });

            const updated = unwrapData(payload);
            setSelectedRule(updated);
            setRules((current) => current.map((rule) => rule.id === updated.id ? updated : rule));
            setMonitoringNote('');
            setSuccessMessage('監視ステータスを更新しました。');
            void loadRules(true);
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '監視ステータスの更新に失敗しました。';

            setActionError(message);
        } finally {
            setIsSubmittingMonitoring(false);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="料金ルール一覧を読み込み中" message="危険な調整や監視フラグの状況を確認しています。" />;
    }

    const detailRule = selectedRule ?? selectedListRule;

    return (
        <div className="space-y-6">
            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_16px_34px_rgba(2,6,23,0.14)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">PRICING MONITORING</p>
                        <h2 className="text-2xl font-semibold text-white sm:text-[2rem]">料金ルール監視</h2>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            極端な調整、非公開メニューへの適用、価格上書きリスクをまとめて確認し、運営メモと監視ステータスを残せます。
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            void loadRules(true);
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
                    { label: '監視フラグあり', value: summary.flagged, hint: '重点確認' },
                    { label: '確認中', value: summary.underReview, hint: '運営レビュー中' },
                    { label: 'エスカレーション', value: summary.escalated, hint: '強い対応が必要' },
                    { label: '非アクティブ', value: summary.inactive, hint: '現在は未適用' },
                ].map((item) => (
                    <article key={item.label} className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">{item.label}</p>
                        <p className="mt-3 text-3xl font-semibold text-white">{item.value}</p>
                        <p className="mt-2 text-sm text-slate-400">{item.hint}</p>
                    </article>
                ))}
            </section>

            <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">調整カテゴリ</span>
                        <select
                            value={adjustmentBucketFilter}
                            onChange={(event) => updateFilters({ adjustment_bucket: event.target.value })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="all">すべて</option>
                            <option value="profile_adjustment">プロフィール属性</option>
                            <option value="demand_fee">需要系加算</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">監視フラグ</span>
                        <select
                            value={monitoringFlagFilter}
                            onChange={(event) => updateFilters({ monitoring_flag: event.target.value })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="all">すべて</option>
                            <option value="inactive_menu">非公開メニューに適用</option>
                            <option value="extreme_percentage">極端な割合調整</option>
                            <option value="menu_price_override">メニュー価格超過</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">監視ステータス</span>
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
                        <span className="text-sm font-semibold text-[#17202b]">適用範囲</span>
                        <select
                            value={scopeFilter}
                            onChange={(event) => updateFilters({ scope: event.target.value })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="all">すべて</option>
                            <option value="profile">プロフィール全体</option>
                            <option value="menu">メニュー単位</option>
                        </select>
                    </label>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">有効状態</span>
                        <select
                            value={activeFilter}
                            onChange={(event) => updateFilters({ is_active: event.target.value })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="all">すべて</option>
                            <option value="1">有効のみ</option>
                            <option value="0">無効のみ</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">運営メモ</span>
                        <select
                            value={hasNotesFilter}
                            onChange={(event) => updateFilters({ has_notes: event.target.value })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="all">すべて</option>
                            <option value="1">あり</option>
                            <option value="0">なし</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">監視フラグ有無</span>
                        <select
                            value={hasFlagsFilter}
                            onChange={(event) => updateFilters({ has_monitoring_flags: event.target.value })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="all">すべて</option>
                            <option value="1">フラグあり</option>
                            <option value="0">フラグなし</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">並び順</span>
                        <div className="grid grid-cols-2 gap-3">
                            <select
                                value={sortField}
                                onChange={(event) => updateFilters({ sort: event.target.value })}
                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                            >
                                <option value="priority">優先度</option>
                                <option value="created_at">作成日時</option>
                                <option value="updated_at">更新日時</option>
                                <option value="adjustment_amount">調整量</option>
                            </select>
                            <select
                                value={direction}
                                onChange={(event) => updateFilters({ direction: event.target.value })}
                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                            >
                                <option value="asc">昇順</option>
                                <option value="desc">降順</option>
                            </select>
                        </div>
                    </label>
                </div>

                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        updateFilters({ q: queryInput.trim() || null });
                    }}
                    className="mt-4 flex gap-2"
                >
                    <input
                        value={queryInput}
                        onChange={(event) => setQueryInput(event.target.value)}
                        placeholder="タチキャスト名 / メール / rule id"
                        className="min-w-0 flex-1 rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                    />
                    <button
                        type="submit"
                        className="inline-flex items-center rounded-[18px] bg-[#17202b] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#243140]"
                    >
                        絞る
                    </button>
                </form>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(360px,0.88fr)]">
                <section className="space-y-4">
                    {rules.length > 0 ? rules.map((rule) => {
                        const isSelected = String(rule.id) === id;
                        const detailPath = `/admin/pricing-rules/${rule.id}${location.search}`;

                        return (
                            <Link
                                key={rule.id}
                                to={detailPath}
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
                                            <h3 className="text-lg font-semibold text-[#17202b]">{displayRuleOwner(rule)}</h3>
                                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${monitoringStatusTone(rule.monitoring_status)}`}>
                                                {monitoringStatusLabel(rule.monitoring_status)}
                                            </span>
                                        </div>
                                        <p className="text-sm text-[#68707a]">
                                            {ruleTypeLabel(rule.rule_type)}
                                            {' / '}
                                            {scopeLabel(rule.scope)}
                                            {rule.therapist_menu?.name ? ` / ${rule.therapist_menu.name}` : ''}
                                        </p>
                                        <p className="text-xs text-[#7d6852]">Rule #{rule.id}</p>
                                    </div>

                                    <div className="text-right">
                                        <p className="text-lg font-semibold text-[#17202b]">{adjustmentLabel(rule)}</p>
                                        <p className="mt-1 text-xs text-[#68707a]">優先度 {rule.priority}</p>
                                    </div>
                                </div>

                                <div className="mt-4 flex flex-wrap gap-2">
                                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${rule.is_active ? 'bg-[#e8f4ea] text-[#24553a]' : 'bg-[#f3efe7] text-[#55606d]'}`}>
                                        {rule.is_active ? '有効' : '無効'}
                                    </span>
                                    {rule.monitoring_flags.map((flag) => (
                                        <span key={`${rule.id}-${flag}`} className="rounded-full bg-[#f8e8e5] px-3 py-1 text-xs font-semibold text-[#8f4337]">
                                            {monitoringFlagLabel(flag)}
                                        </span>
                                    ))}
                                    {rule.monitoring_flags.length === 0 ? (
                                        <span className="rounded-full bg-[#edf4ff] px-3 py-1 text-xs font-semibold text-[#34557f]">
                                            監視フラグなし
                                        </span>
                                    ) : null}
                                </div>

                                <div className="mt-4 grid gap-3 md:grid-cols-3">
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">条件</p>
                                        <p className="mt-1 text-sm font-semibold text-[#17202b]">{rule.condition_summary ?? '複合条件'}</p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">運営メモ</p>
                                        <p className="mt-1 text-sm font-semibold text-[#17202b]">{rule.admin_note_count ?? 0}件</p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">更新日時</p>
                                        <p className="mt-1 text-sm font-semibold text-[#17202b]">{formatDateTime(rule.updated_at)}</p>
                                    </div>
                                </div>
                            </Link>
                        );
                    }) : (
                        <section className="rounded-[28px] bg-white px-6 py-10 text-center shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                            <p className="text-sm leading-7 text-[#68707a]">条件に合う料金ルールはありません。</p>
                        </section>
                    )}
                </section>

                <aside className="space-y-5">
                    {actionError ? (
                        <section className="rounded-[24px] border border-[#f1d4b5] bg-[#fff4e8] px-5 py-4 text-sm text-[#9a4b35]">
                            {actionError}
                        </section>
                    ) : null}
                    {detailError ? (
                        <section className="rounded-[24px] border border-[#f1d4b5] bg-[#fff4e8] px-5 py-4 text-sm text-[#9a4b35]">
                            {detailError}
                        </section>
                    ) : null}

                    {isLoadingDetail && id ? (
                        <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                            <LoadingScreen title="料金ルール詳細を読み込み中" message="監視フラグと内部メモを確認しています。" />
                        </section>
                    ) : detailRule ? (
                        <section className="space-y-5">
                            <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">RULE DETAIL</p>
                                        <h3 className="mt-2 text-2xl font-semibold text-[#17202b]">{displayRuleOwner(detailRule)}</h3>
                                        <p className="mt-2 text-sm text-[#68707a]">
                                            {ruleTypeLabel(detailRule.rule_type)}
                                            {' / '}
                                            {scopeLabel(detailRule.scope)}
                                        </p>
                                        <p className="mt-1 text-xs text-[#7d6852]">Rule #{detailRule.id}</p>
                                    </div>
                                    <div className="text-right">
                                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${monitoringStatusTone(detailRule.monitoring_status)}`}>
                                            {monitoringStatusLabel(detailRule.monitoring_status)}
                                        </span>
                                        <p className="mt-3 text-lg font-semibold text-[#17202b]">{adjustmentLabel(detailRule)}</p>
                                    </div>
                                </div>

                                <div className="mt-5 grid gap-3">
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3 text-sm text-[#48505a]">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">条件サマリー</p>
                                        <p className="mt-1 font-semibold text-[#17202b]">{detailRule.condition_summary ?? '複合条件'}</p>
                                        <p className="mt-1">最低価格 {priceLabel(detailRule.min_price_amount)} / 最高価格 {priceLabel(detailRule.max_price_amount)}</p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3 text-sm text-[#48505a]">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">適用先</p>
                                        <p className="mt-1 font-semibold text-[#17202b]">
                                            {detailRule.therapist_profile?.public_name ?? detailRule.therapist_profile?.public_id ?? '未設定'}
                                        </p>
                                        <p className="mt-1">{detailRule.therapist_menu?.name ?? 'プロフィール全体へ適用'}</p>
                                        <p className="mt-1 text-xs text-[#68707a]">
                                            {formatProfileStatus(detailRule.therapist_profile?.profile_status)}
                                            {' / '}
                                            {detailRule.therapist_profile?.account?.email ?? 'メール未取得'}
                                        </p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3 text-sm text-[#48505a]">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">監視フラグ</p>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {detailRule.monitoring_flags.length > 0 ? detailRule.monitoring_flags.map((flag) => (
                                                <span key={`${detailRule.id}-detail-${flag}`} className="rounded-full bg-[#f8e8e5] px-3 py-1 text-xs font-semibold text-[#8f4337]">
                                                    {monitoringFlagLabel(flag)}
                                                </span>
                                            )) : (
                                                <span className="rounded-full bg-[#edf4ff] px-3 py-1 text-xs font-semibold text-[#34557f]">監視フラグなし</span>
                                            )}
                                        </div>
                                        <p className="mt-2 text-xs text-[#68707a]">
                                            担当 {detailRule.monitored_by_admin?.display_name ?? detailRule.monitored_by_admin?.public_id ?? '未設定'}
                                            {' / '}
                                            監視更新 {formatDateTime(detailRule.monitored_at)}
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-4 rounded-[18px] bg-[#101720] px-4 py-4">
                                    <p className="text-xs font-semibold tracking-wide text-[#d2b179]">条件 JSON</p>
                                    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-slate-200">
                                        {JSON.stringify(detailRule.condition ?? {}, null, 2)}
                                    </pre>
                                </div>
                            </article>

                            <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">内部メモ</p>
                                        <h4 className="mt-2 text-xl font-semibold text-[#17202b]">運営メモ</h4>
                                    </div>
                                    <span className="text-sm text-[#68707a]">{detailRule.notes?.length ?? detailRule.admin_note_count ?? 0}件</span>
                                </div>

                                <div className="mt-4 space-y-3">
                                    {detailRule.notes && detailRule.notes.length > 0 ? detailRule.notes.map((note) => (
                                        <article key={note.id} className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <p className="text-sm font-semibold text-[#17202b]">{note.author?.display_name ?? note.author?.public_id ?? '運営'}</p>
                                                <p className="text-xs text-[#68707a]">{formatDateTime(note.created_at)}</p>
                                            </div>
                                            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#48505a]">{note.note}</p>
                                        </article>
                                    )) : (
                                        <div className="rounded-[18px] border border-dashed border-[#d9c9ae] px-4 py-5 text-sm text-[#68707a]">
                                            まだ運営メモはありません。
                                        </div>
                                    )}
                                </div>
                            </article>

                            <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                                <div className="grid gap-6 xl:grid-cols-2">
                                    <form onSubmit={handleAddNote} className="space-y-4 rounded-[24px] bg-[#f8f4ed] p-5">
                                        <div>
                                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">メモ追加</p>
                                            <h4 className="mt-2 text-lg font-semibold text-[#17202b]">運営メモを追加</h4>
                                        </div>

                                        <label className="space-y-2">
                                            <span className="text-sm font-semibold text-[#17202b]">メモ</span>
                                            <textarea
                                                value={noteInput}
                                                onChange={(event) => setNoteInput(event.target.value)}
                                                rows={6}
                                                placeholder="確認内容や判断保留理由を残します。"
                                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-white px-4 py-3 text-sm leading-7 text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                            />
                                        </label>

                                        <button
                                            type="submit"
                                            disabled={isSubmittingNote || !noteInput.trim()}
                                            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140] disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {isSubmittingNote ? '保存中...' : 'メモを追加'}
                                        </button>
                                    </form>

                                    <form onSubmit={handleMonitoringUpdate} className="space-y-4 rounded-[24px] bg-[#f8f4ed] p-5">
                                        <div>
                                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">MONITORING STATUS</p>
                                            <h4 className="mt-2 text-lg font-semibold text-[#17202b]">監視ステータスを更新</h4>
                                        </div>

                                        <label className="space-y-2">
                                            <span className="text-sm font-semibold text-[#17202b]">ステータス</span>
                                            <select
                                                value={monitoringStatusInput}
                                                onChange={(event) => setMonitoringStatusInput(event.target.value as Exclude<MonitoringStatusFilter, 'all'>)}
                                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-white px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                            >
                                                <option value="unreviewed">未確認</option>
                                                <option value="under_review">確認中</option>
                                                <option value="reviewed">確認済み</option>
                                                <option value="escalated">エスカレーション</option>
                                            </select>
                                        </label>

                                        <label className="space-y-2">
                                            <span className="text-sm font-semibold text-[#17202b]">補足メモ</span>
                                            <textarea
                                                value={monitoringNote}
                                                onChange={(event) => setMonitoringNote(event.target.value)}
                                                rows={6}
                                                placeholder="判断理由や次に確認したい点"
                                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-white px-4 py-3 text-sm leading-7 text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                            />
                                        </label>

                                        <button
                                            type="submit"
                                            disabled={isSubmittingMonitoring}
                                            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {isSubmittingMonitoring ? '更新中...' : '監視ステータスを保存'}
                                        </button>
                                    </form>
                                </div>
                            </article>
                        </section>
                    ) : (
                        <section className="rounded-[28px] bg-white px-6 py-10 text-center shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                            <p className="text-sm leading-7 text-[#68707a]">
                                一覧から料金ルールを選ぶと、ここに条件詳細と監視メモが表示されます。
                            </p>
                        </section>
                    )}
                </aside>
            </div>
        </div>
    );
}
