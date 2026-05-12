import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatJstDateTime } from '../lib/datetime';
import { formatSupportCategory, supportCategories } from '../lib/supportTickets';
import type {
    ApiEnvelope,
    SupportStepDeliveryRecord,
    SupportStepIdentityStatus,
    SupportStepPreviewRecord,
    SupportStepScenarioRecord,
    SupportStepScenarioStatus,
    SupportStepTargetRole,
} from '../lib/types';

type FormState = {
    name: string;
    status: Exclude<SupportStepScenarioStatus, 'archived'>;
    target_role: SupportStepTargetRole;
    identity_verification_status: SupportStepIdentityStatus;
    elapsed_days: '1' | '3' | '7';
    send_time: string;
    priority: string;
    ticket_title: string;
    ticket_category: string;
    message_body: string;
    internal_notes: string;
};

const defaultForm: FormState = {
    name: '',
    status: 'draft',
    target_role: 'user',
    identity_verification_status: 'unverified',
    elapsed_days: '1',
    send_time: '20:00',
    priority: '100',
    ticket_title: '',
    ticket_category: 'account',
    message_body: '',
    internal_notes: '',
};

const fieldClass = 'w-full rounded-[8px] border border-[#d7d5cf] bg-white px-3 py-2 text-sm text-[#17202b] outline-none placeholder:text-[#8a8f97] focus:border-[#b5894d] disabled:bg-[#f5efe4]';
const inlineFieldClass = 'rounded-[8px] border border-[#d7d5cf] bg-white px-3 py-2 text-sm text-[#17202b] outline-none placeholder:text-[#8a8f97] focus:border-[#b5894d]';

function targetRoleLabel(value: SupportStepTargetRole | string): string {
    if (value === 'therapist') return 'タチキャスト';
    if (value === 'both') return '両方';
    return '利用者';
}

function identityStatusLabel(value: SupportStepIdentityStatus | string): string {
    if (value === 'approved') return '承認済み';
    if (value === 'rejected') return '却下済み';
    return '未実施';
}

function scenarioStatusLabel(value: SupportStepScenarioStatus | string): string {
    if (value === 'active') return '有効';
    if (value === 'archived') return 'アーカイブ';
    return '下書き';
}

function deliveryStatusLabel(value: string): string {
    if (value === 'sent') return '送信済み';
    if (value === 'failed') return '失敗';
    return 'スキップ';
}

function deliveryTypeLabel(value: string): string {
    if (value === 'manual') return '手動実行';
    if (value === 'test') return 'テスト送信';
    return '自動送信';
}

function skipReasonLabel(value: string | null): string {
    if (value === 'already_sent') return '同一シナリオ送信済み';
    if (value === 'daily_limit') return '同日送信上限により見送り';
    if (value === 'scenario_archived') return 'シナリオがアーカイブ済み';
    if (value === 'existing_ticket_title') return '同名チケットが既に存在';
    return value ?? '';
}

function formFromScenario(scenario: SupportStepScenarioRecord): FormState {
    return {
        name: scenario.name,
        status: scenario.status === 'active' ? 'active' : 'draft',
        target_role: scenario.target_role,
        identity_verification_status: scenario.identity_verification_status,
        elapsed_days: String(scenario.elapsed_days) as FormState['elapsed_days'],
        send_time: scenario.send_time,
        priority: String(scenario.priority),
        ticket_title: scenario.ticket_title,
        ticket_category: scenario.ticket_category,
        message_body: scenario.message_body,
        internal_notes: scenario.internal_notes ?? '',
    };
}

export function AdminSupportStepScenariosPage() {
    const { token } = useAuth();
    const { publicId } = useParams();
    const navigate = useNavigate();
    const [scenarios, setScenarios] = useState<SupportStepScenarioRecord[]>([]);
    const [selected, setSelected] = useState<SupportStepScenarioRecord | null>(null);
    const [deliveries, setDeliveries] = useState<SupportStepDeliveryRecord[]>([]);
    const [preview, setPreview] = useState<SupportStepPreviewRecord | null>(null);
    const [statusFilter, setStatusFilter] = useState('all');
    const [query, setQuery] = useState('');
    const [form, setForm] = useState<FormState>(defaultForm);
    const [isEditing, setIsEditing] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const isArchived = selected?.status === 'archived';
    const canSubmit = form.name.trim() && form.ticket_title.trim() && form.message_body.trim();
    const selectedPath = selected ? `/admin/support-step-scenarios/${selected.public_id}` : '/admin/support-step-scenarios';

    const sortedScenarios = useMemo(() => scenarios, [scenarios]);

    useToastOnMessage(notice, 'success');

    async function loadScenarios(nextSelectedId = publicId) {
        if (!token) return;
        setIsLoading(true);
        setError(null);
        const params = new URLSearchParams();
        params.set('status', statusFilter);
        if (query.trim()) params.set('q', query.trim());

        try {
            const payload = await apiRequest<ApiEnvelope<SupportStepScenarioRecord[]>>(`/admin/support-step-scenarios?${params.toString()}`, { token });
            const next = unwrapData(payload);
            setScenarios(next);
            const nextSelected = next.find((scenario) => scenario.public_id === nextSelectedId) ?? next[0] ?? null;
            setSelected(nextSelected);
            if (!publicId && nextSelected) {
                navigate(`/admin/support-step-scenarios/${nextSelected.public_id}`, { replace: true });
            }
        } catch (loadError) {
            setError(loadError instanceof ApiError ? loadError.message : 'サポートステップ配信を取得できませんでした。');
        } finally {
            setIsLoading(false);
        }
    }

    async function loadSelected(id: string) {
        if (!token) return;
        try {
            const payload = await apiRequest<ApiEnvelope<SupportStepScenarioRecord>>(`/admin/support-step-scenarios/${id}`, { token });
            const scenario = unwrapData(payload);
            setSelected(scenario);
            setForm(formFromScenario(scenario));
            setIsEditing(false);
        } catch (loadError) {
            setError(loadError instanceof ApiError ? loadError.message : 'シナリオ詳細を取得できませんでした。');
        }
    }

    async function loadPreview(id: string) {
        if (!token) return;
        const payload = await apiRequest<ApiEnvelope<SupportStepPreviewRecord>>(`/admin/support-step-scenarios/${id}/preview`, { token });
        setPreview(unwrapData(payload));
    }

    async function loadDeliveries(id: string) {
        if (!token) return;
        const payload = await apiRequest<ApiEnvelope<SupportStepDeliveryRecord[]>>(`/admin/support-step-scenarios/${id}/deliveries`, { token });
        setDeliveries(unwrapData(payload));
    }

    useEffect(() => {
        void loadScenarios();
    }, [token, statusFilter]);

    useEffect(() => {
        if (publicId) {
            void loadSelected(publicId);
            void loadPreview(publicId);
            void loadDeliveries(publicId);
        } else {
            setSelected(null);
            setForm(defaultForm);
            setDeliveries([]);
            setPreview(null);
        }
    }, [publicId, token]);

    async function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        await loadScenarios();
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!token || !canSubmit || (selected && isArchived)) return;
        setIsSaving(true);
        setError(null);
        setNotice(null);

        const body = {
            ...form,
            elapsed_days: Number(form.elapsed_days),
            priority: Number(form.priority || 100),
            name: form.name.trim(),
            ticket_title: form.ticket_title.trim(),
            message_body: form.message_body.trim(),
            internal_notes: form.internal_notes.trim() || null,
        };
        const path = selected && isEditing ? `/admin/support-step-scenarios/${selected.public_id}` : '/admin/support-step-scenarios';

        try {
            const payload = await apiRequest<ApiEnvelope<SupportStepScenarioRecord>>(path, {
                method: selected && isEditing ? 'PATCH' : 'POST',
                token,
                body,
            });
            const scenario = unwrapData(payload);
            setNotice(selected && isEditing ? 'シナリオを更新しました。' : 'シナリオを作成しました。');
            await loadScenarios(scenario.public_id);
            navigate(`/admin/support-step-scenarios/${scenario.public_id}`);
        } catch (saveError) {
            setError(saveError instanceof ApiError ? saveError.message : 'シナリオを保存できませんでした。');
        } finally {
            setIsSaving(false);
        }
    }

    async function handleArchive() {
        if (!token || !selected || !window.confirm('このシナリオをアーカイブします。以後、自動送信されません。')) return;
        setIsSaving(true);
        try {
            await apiRequest<ApiEnvelope<SupportStepScenarioRecord>>(`/admin/support-step-scenarios/${selected.public_id}/archive`, { method: 'POST', token });
            setNotice('シナリオをアーカイブしました。');
            await loadScenarios(selected.public_id);
            await loadSelected(selected.public_id);
        } catch (archiveError) {
            setError(archiveError instanceof ApiError ? archiveError.message : 'アーカイブできませんでした。');
        } finally {
            setIsSaving(false);
        }
    }

    async function handleDelete() {
        if (!token || !selected || !window.confirm('送信履歴がないシナリオを削除します。')) return;
        setIsSaving(true);
        try {
            await apiRequest<ApiEnvelope<{ deleted: boolean }>>(`/admin/support-step-scenarios/${selected.public_id}`, { method: 'DELETE', token });
            setNotice('シナリオを削除しました。');
            navigate('/admin/support-step-scenarios');
            await loadScenarios('');
        } catch (deleteError) {
            setError(deleteError instanceof ApiError ? deleteError.message : '削除できませんでした。');
        } finally {
            setIsSaving(false);
        }
    }

    async function handleTestSend() {
        if (!token || !selected || !window.confirm('操作中の運営アカウント宛にテスト送信します。')) return;
        setIsSaving(true);
        try {
            await apiRequest<ApiEnvelope<SupportStepDeliveryRecord>>(`/admin/support-step-scenarios/${selected.public_id}/test-send`, { method: 'POST', token });
            setNotice('テスト送信を記録しました。');
            await loadDeliveries(selected.public_id);
        } catch (testError) {
            setError(testError instanceof ApiError ? testError.message : 'テスト送信できませんでした。');
        } finally {
            setIsSaving(false);
        }
    }

    async function handleManualRun() {
        if (!token || !selected || !preview) return;
        const confirmed = window.confirm(`現在送信可能な ${preview.sendable_count} 件を対象に手動実行します。よろしいですか？`);
        if (!confirmed) return;
        setIsSaving(true);
        try {
            const payload = await apiRequest<ApiEnvelope<{ sent: number; skipped: number; failed: number }>>(`/admin/support-step-scenarios/${selected.public_id}/run`, { method: 'POST', token });
            const result = unwrapData(payload);
            setNotice(`手動実行しました。送信 ${result.sent} 件 / スキップ ${result.skipped} 件 / 失敗 ${result.failed} 件`);
            await loadSelected(selected.public_id);
            await loadPreview(selected.public_id);
            await loadDeliveries(selected.public_id);
            await loadScenarios(selected.public_id);
        } catch (runError) {
            setError(runError instanceof ApiError ? runError.message : '手動実行できませんでした。');
        } finally {
            setIsSaving(false);
        }
    }

    function startCreate() {
        setSelected(null);
        setForm(defaultForm);
        setPreview(null);
        setDeliveries([]);
        setIsEditing(false);
        navigate('/admin/support-step-scenarios');
    }

    function startEdit() {
        if (!selected) return;
        setForm(formFromScenario(selected));
        setIsEditing(true);
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[8px] border border-[#eadfca] bg-white p-5 shadow-[0_14px_35px_rgba(23,32,43,0.08)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-xs font-semibold tracking-wide text-[#8f5c22]">サポート自動化</p>
                        <h1 className="mt-1 text-2xl font-semibold text-[#17202b]">サポートステップ配信</h1>
                    </div>
                    <form onSubmit={handleFilterSubmit} className="flex flex-wrap gap-2">
                        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={inlineFieldClass}>
                            <option value="all">すべて</option>
                            <option value="active">有効</option>
                            <option value="draft">下書き</option>
                            <option value="archived">アーカイブ</option>
                        </select>
                        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="シナリオ名/タイトル" className={inlineFieldClass} />
                        <button type="submit" className="rounded-full bg-[#17202b] px-4 py-2 text-sm font-semibold text-white">絞り込み</button>
                        <button type="button" onClick={startCreate} className="rounded-full border border-[#d7d5cf] px-4 py-2 text-sm font-semibold text-[#17202b]">新規作成</button>
                    </form>
                </div>
            </section>

            {error ? <div className="rounded-[8px] border border-[#f0c7b8] bg-[#fff1ec] px-4 py-3 text-sm text-[#8a3d2c]">{error}</div> : null}
            <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
                <div className="space-y-3">
                    {isLoading ? <p className="text-sm text-[#68707a]">読み込み中です。</p> : null}
                    {sortedScenarios.map((scenario) => (
                        <button
                            type="button"
                            key={scenario.public_id}
                            onClick={() => navigate(`/admin/support-step-scenarios/${scenario.public_id}`)}
                            className={[
                                'w-full rounded-[8px] border bg-white p-4 text-left transition hover:border-[#c8a46d]',
                                selected?.public_id === scenario.public_id ? 'border-[#b5894d] shadow-[0_10px_24px_rgba(23,32,43,0.08)]' : 'border-[#eadfca]',
                            ].join(' ')}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm font-semibold text-[#17202b]">{scenario.name}</p>
                                    <p className="mt-1 text-xs text-[#68707a]">{scenario.ticket_title}</p>
                                </div>
                                <span className="shrink-0 rounded-full bg-[#f5efe4] px-2 py-1 text-xs font-semibold text-[#8f5c22]">{scenarioStatusLabel(scenario.status)}</span>
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-[#68707a]">
                                <span>{targetRoleLabel(scenario.target_role)}</span>
                                <span>{scenario.elapsed_days}日後</span>
                                <span>{scenario.send_time}</span>
                            </div>
                            <div className="mt-3 flex justify-between text-xs text-[#68707a]">
                                <span>優先度 {scenario.priority}</span>
                                <span>累計 {scenario.summary.sent_total} 件</span>
                            </div>
                        </button>
                    ))}
                    {sortedScenarios.length === 0 && !isLoading ? (
                        <div className="rounded-[8px] border border-dashed border-[#d7d5cf] bg-white p-4 text-sm text-[#68707a]">シナリオはまだありません。</div>
                    ) : null}
                </div>

                <div className="space-y-5">
                    <article className="rounded-[8px] border border-[#eadfca] bg-white p-5">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div>
                                <p className="text-xs font-semibold tracking-wide text-[#8f5c22]">{selected ? 'シナリオ詳細' : '新規シナリオ'}</p>
                                <h2 className="mt-1 text-xl font-semibold text-[#17202b]">{selected?.name ?? 'サポートステップ配信を作成'}</h2>
                            </div>
                            {selected ? (
                                <div className="flex flex-wrap gap-2">
                                    <button type="button" onClick={startEdit} disabled={isArchived} className="rounded-full border border-[#b5894d] bg-[#fff6e8] px-4 py-2 text-sm font-semibold text-[#7a4b15] shadow-sm transition hover:bg-[#f5e1bf] disabled:opacity-50">編集</button>
                                    <button type="button" onClick={handleTestSend} disabled={isSaving || isArchived} className="rounded-full border border-[#2f6f73] bg-[#e8f6f4] px-4 py-2 text-sm font-semibold text-[#215457] shadow-sm transition hover:bg-[#d4eeeb] disabled:opacity-50">テスト送信</button>
                                    <button type="button" onClick={handleManualRun} disabled={isSaving || isArchived || !preview?.sendable_count} className="rounded-full bg-[#17202b] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">手動実行</button>
                                </div>
                            ) : null}
                        </div>

                        {selected && !isEditing ? (
                            <div className="mt-5 grid gap-3 md:grid-cols-4">
                                <SummaryTile label="累計" value={`${selected.summary.sent_total}件`} />
                                <SummaryTile label="今日" value={`${selected.summary.sent_today}件`} />
                                <SummaryTile label="直近7日" value={`${selected.summary.sent_last_7_days}件`} />
                                <SummaryTile label="直近30日" value={`${selected.summary.sent_last_30_days}件`} />
                            </div>
                        ) : null}

                        {selected && preview ? (
                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                                <SummaryTile label="条件一致数" value={`${preview.condition_match_count}件`} />
                                <SummaryTile label="送信可能数" value={`${preview.sendable_count}件`} />
                            </div>
                        ) : null}

                        {(!selected || isEditing) ? (
                            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                                <div className="grid gap-3 md:grid-cols-2">
                                    <label className="space-y-1 text-sm font-semibold text-[#17202b]">
                                        <span>シナリオ名</span>
                                        <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={fieldClass} maxLength={120} />
                                    </label>
                                    <label className="space-y-1 text-sm font-semibold text-[#17202b]">
                                        <span>状態</span>
                                        <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as FormState['status'] })} className={fieldClass}>
                                            <option value="draft">下書き</option>
                                            <option value="active">有効</option>
                                        </select>
                                    </label>
                                </div>

                                <div className="grid gap-3 md:grid-cols-3">
                                    <fieldset className="space-y-2 rounded-[8px] border border-[#eadfca] p-3">
                                        <legend className="px-1 text-sm font-semibold text-[#17202b]">対象種別</legend>
                                        {(['user', 'therapist', 'both'] as SupportStepTargetRole[]).map((value) => (
                                            <label key={value} className="flex items-center gap-2 text-sm text-[#17202b]">
                                                <input type="radio" checked={form.target_role === value} onChange={() => setForm({ ...form, target_role: value })} />
                                                {targetRoleLabel(value)}
                                            </label>
                                        ))}
                                    </fieldset>
                                    <label className="space-y-1 text-sm font-semibold text-[#17202b]">
                                        <span>本人確認</span>
                                        <select value={form.identity_verification_status} onChange={(event) => setForm({ ...form, identity_verification_status: event.target.value as SupportStepIdentityStatus })} className={fieldClass}>
                                            <option value="unverified">未実施</option>
                                            <option value="approved">承認済み</option>
                                            <option value="rejected">却下済み</option>
                                        </select>
                                    </label>
                                    <label className="space-y-1 text-sm font-semibold text-[#17202b]">
                                        <span>登録からの経過日数</span>
                                        <select value={form.elapsed_days} onChange={(event) => setForm({ ...form, elapsed_days: event.target.value as FormState['elapsed_days'] })} className={fieldClass}>
                                            <option value="1">1日</option>
                                            <option value="3">3日</option>
                                            <option value="7">7日</option>
                                        </select>
                                    </label>
                                </div>

                                <div className="grid gap-3 md:grid-cols-3">
                                    <label className="space-y-1 text-sm font-semibold text-[#17202b]">
                                        <span>送信時間</span>
                                        <input type="time" value={form.send_time} onChange={(event) => setForm({ ...form, send_time: event.target.value })} className={fieldClass} />
                                    </label>
                                    <label className="space-y-1 text-sm font-semibold text-[#17202b]">
                                        <span>優先度</span>
                                        <input type="number" min="1" max="999" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} className={fieldClass} />
                                    </label>
                                    <label className="space-y-1 text-sm font-semibold text-[#17202b]">
                                        <span>カテゴリ</span>
                                        <select value={form.ticket_category} onChange={(event) => setForm({ ...form, ticket_category: event.target.value })} className={fieldClass}>
                                            {supportCategories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
                                        </select>
                                    </label>
                                </div>

                                <label className="space-y-1 text-sm font-semibold text-[#17202b]">
                                    <span>チケットタイトル</span>
                                    <input value={form.ticket_title} onChange={(event) => setForm({ ...form, ticket_title: event.target.value })} className={fieldClass} maxLength={160} />
                                </label>

                                <label className="space-y-1 text-sm font-semibold text-[#17202b]">
                                    <span>メッセージ</span>
                                    <textarea value={form.message_body} onChange={(event) => setForm({ ...form, message_body: event.target.value })} rows={8} className={`${fieldClass} leading-6`} maxLength={5000} />
                                    <span className="block text-xs font-normal text-[#68707a]">最大5000文字。変数: {'{user_name}'} / {'{user_type}'} / {'{registered_date}'} / {'{verification_url}'}。現在 {form.message_body.length}/5000 文字</span>
                                </label>

                                <label className="space-y-1 text-sm font-semibold text-[#17202b]">
                                    <span>管理メモ</span>
                                    <textarea value={form.internal_notes} onChange={(event) => setForm({ ...form, internal_notes: event.target.value })} rows={3} className={`${fieldClass} leading-6`} maxLength={5000} />
                                </label>

                                <div className="flex flex-wrap gap-2">
                                    <button type="submit" disabled={isSaving || !canSubmit} className="rounded-full bg-[#17202b] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
                                        {selected && isEditing ? '更新する' : '作成する'}
                                    </button>
                                    {isEditing ? <button type="button" onClick={() => setIsEditing(false)} className="rounded-full border border-[#d7d5cf] px-5 py-2 text-sm font-semibold">キャンセル</button> : null}
                                </div>
                            </form>
                        ) : selected ? (
                            <div className="mt-5 space-y-5">
                                <div className="grid gap-3 md:grid-cols-3">
                                    <Detail label="状態" value={scenarioStatusLabel(selected.status)} />
                                    <Detail label="対象" value={targetRoleLabel(selected.target_role)} />
                                    <Detail label="本人確認" value={identityStatusLabel(selected.identity_verification_status)} />
                                    <Detail label="登録経過" value={`${selected.elapsed_days}日`} />
                                    <Detail label="送信時間" value={selected.send_time} />
                                    <Detail label="優先度" value={String(selected.priority)} />
                                    <Detail label="カテゴリ" value={formatSupportCategory(selected.ticket_category)} />
                                    <Detail label="タイトル" value={selected.ticket_title} />
                                    <Detail label="作成日" value={formatJstDateTime(selected.created_at) ?? '-'} />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-[#17202b]">メッセージ</p>
                                    <div className="mt-2 whitespace-pre-wrap rounded-[8px] border border-[#eadfca] bg-[#fffaf2] p-4 text-sm leading-6 text-[#17202b]">{selected.message_body}</div>
                                </div>
                                {selected.internal_notes ? (
                                    <div>
                                        <p className="text-sm font-semibold text-[#17202b]">管理メモ</p>
                                        <div className="mt-2 whitespace-pre-wrap rounded-[8px] border border-[#eadfca] bg-white p-4 text-sm leading-6 text-[#68707a]">{selected.internal_notes}</div>
                                    </div>
                                ) : null}
                                <div className="flex flex-wrap gap-2">
                                    <button type="button" onClick={handleArchive} disabled={isSaving || isArchived} className="rounded-full border border-[#d7d5cf] px-4 py-2 text-sm font-semibold disabled:opacity-50">アーカイブ</button>
                                    <button type="button" onClick={handleDelete} disabled={isSaving || !selected.can_delete} className="rounded-full border border-[#d7d5cf] px-4 py-2 text-sm font-semibold text-[#8a3d2c] disabled:opacity-50">削除</button>
                                </div>
                            </div>
                        ) : null}
                    </article>

                    {selected ? (
                        <article className="rounded-[8px] border border-[#eadfca] bg-white p-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold tracking-wide text-[#8f5c22]">履歴</p>
                                    <h2 className="mt-1 text-lg font-semibold text-[#17202b]">送信・スキップ履歴</h2>
                                </div>
                                <button type="button" onClick={() => void loadDeliveries(selected.public_id)} className="rounded-full border border-[#d7d5cf] px-3 py-2 text-sm font-semibold">更新</button>
                            </div>
                            <div className="mt-4 overflow-x-auto">
                                <table className="min-w-full divide-y divide-[#eadfca] text-sm">
                                    <thead>
                                        <tr className="text-left text-xs font-semibold text-[#68707a]">
                                            <th className="px-3 py-2">日時</th>
                                            <th className="px-3 py-2">種別</th>
                                            <th className="px-3 py-2">状態</th>
                                            <th className="px-3 py-2">送信先</th>
                                            <th className="px-3 py-2">チケット</th>
                                            <th className="px-3 py-2">理由</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#f0e7d8]">
                                        {deliveries.map((delivery) => (
                                            <tr key={delivery.id}>
                                                <td className="px-3 py-3 text-[#68707a]">{formatJstDateTime(delivery.sent_at ?? delivery.attempted_at ?? delivery.created_at)}</td>
                                                <td className="px-3 py-3">{deliveryTypeLabel(delivery.delivery_type)}</td>
                                                <td className="px-3 py-3">{deliveryStatusLabel(delivery.status)}</td>
                                                <td className="px-3 py-3">
                                                    <div className="font-semibold text-[#17202b]">{delivery.account?.display_name || delivery.account?.email || delivery.account?.public_id || '不明'}</div>
                                                    <div className="text-xs text-[#68707a]">{targetRoleLabel(delivery.requester_role)}</div>
                                                </td>
                                                <td className="px-3 py-3">
                                                    {delivery.support_ticket ? (
                                                        <a href={`/admin/support-tickets/${delivery.support_ticket.public_id}`} className="font-semibold text-[#8f5c22] hover:underline">{delivery.support_ticket.title}</a>
                                                    ) : <span className="text-[#8a8f97]">-</span>}
                                                </td>
                                                <td className="px-3 py-3 text-[#68707a]">{delivery.error_message || skipReasonLabel(delivery.skip_reason) || '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {deliveries.length === 0 ? <p className="py-6 text-sm text-[#68707a]">履歴はまだありません。</p> : null}
                            </div>
                        </article>
                    ) : null}
                </div>
            </section>
        </div>
    );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-[8px] border border-[#eadfca] bg-[#fffaf2] p-3">
            <p className="text-xs font-semibold text-[#8f5c22]">{label}</p>
            <p className="mt-1 text-lg font-semibold text-[#17202b]">{value}</p>
        </div>
    );
}

function Detail({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-[8px] border border-[#eadfca] bg-white p-3">
            <p className="text-xs font-semibold text-[#68707a]">{label}</p>
            <p className="mt-1 text-sm font-semibold text-[#17202b]">{value}</p>
        </div>
    );
}
