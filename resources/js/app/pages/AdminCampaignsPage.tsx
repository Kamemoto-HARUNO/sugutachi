import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, getFieldError, unwrapData } from '../lib/api';
import {
    buildCurrentJstDateTimeLocalValue,
    formatJstDateTime,
    formatJstDateTimeLocalValue,
    parseJstDateTimeLocalInput,
} from '../lib/datetime';
import { formatCurrency } from '../lib/discovery';
import type {
    AdminCampaignRecord,
    ApiEnvelope,
    RoleName,
} from '../lib/types';

type CampaignTargetRole = Exclude<RoleName, 'admin'>;
type CampaignStateFilter = 'all' | 'active' | 'scheduled' | 'inactive';
type CampaignTriggerType =
    | 'therapist_registration'
    | 'therapist_booking'
    | 'user_first_booking'
    | 'user_booking';
type CampaignBenefitType = 'fixed_amount' | 'percentage';

interface CampaignFormState {
    target_role: CampaignTargetRole;
    trigger_type: CampaignTriggerType;
    benefit_type: CampaignBenefitType;
    benefit_value: string;
    offer_text: string;
    starts_at: string;
    ends_at: string;
    offer_valid_days: string;
    is_enabled: boolean;
}

function normalizeTargetRole(value: string | null): CampaignTargetRole | 'all' {
    if (value === 'therapist' || value === 'user') {
        return value;
    }

    return 'all';
}

function normalizeStateFilter(value: string | null): CampaignStateFilter {
    if (value === 'active' || value === 'scheduled' || value === 'inactive') {
        return value;
    }

    return 'all';
}

function normalizeTriggerType(value: string | null): CampaignTriggerType | 'all' {
    if (
        value === 'therapist_registration'
        || value === 'therapist_booking'
        || value === 'user_first_booking'
        || value === 'user_booking'
    ) {
        return value;
    }

    return 'all';
}

function triggerOptionsForRole(role: CampaignTargetRole): Array<{ value: CampaignTriggerType; label: string }> {
    if (role === 'therapist') {
        return [
            { value: 'therapist_registration', label: '本人確認完了で残高付与' },
            { value: 'therapist_booking', label: '予約確定ごとに残高付与' },
        ];
    }

    return [
        { value: 'user_first_booking', label: '初回予約割引' },
        { value: 'user_booking', label: '期間中の予約割引' },
    ];
}

function buildEmptyForm(targetRole: CampaignTargetRole = 'therapist'): CampaignFormState {
    return {
        target_role: targetRole,
        trigger_type: targetRole === 'therapist' ? 'therapist_registration' : 'user_first_booking',
        benefit_type: 'fixed_amount',
        benefit_value: '',
        offer_text: '',
        starts_at: buildCurrentJstDateTimeLocalValue(),
        ends_at: '',
        offer_valid_days: '',
        is_enabled: true,
    };
}

function buildFormFromCampaign(campaign: AdminCampaignRecord): CampaignFormState {
    return {
        target_role: campaign.target_role,
        trigger_type: campaign.trigger_type as CampaignTriggerType,
        benefit_type: campaign.benefit_type as CampaignBenefitType,
        benefit_value: String(campaign.benefit_value),
        offer_text: campaign.offer_text,
        starts_at: formatJstDateTimeLocalValue(campaign.starts_at),
        ends_at: formatJstDateTimeLocalValue(campaign.ends_at),
        offer_valid_days: campaign.offer_valid_days ? String(campaign.offer_valid_days) : '',
        is_enabled: campaign.is_enabled,
    };
}

function statusTone(campaign: AdminCampaignRecord): string {
    if (campaign.is_active) {
        return 'bg-[#e8f4ea] text-[#24553a]';
    }

    if (campaign.is_enabled) {
        return new Date(campaign.starts_at ?? '').getTime() > Date.now()
            ? 'bg-[#edf4ff] text-[#34557f]'
            : 'bg-[#fff2dd] text-[#8b5a16]';
    }

    return 'bg-[#f1efe8] text-[#48505a]';
}

function statusLabel(campaign: AdminCampaignRecord): string {
    if (campaign.is_active) {
        return '適用中';
    }

    if (campaign.is_enabled) {
        return new Date(campaign.starts_at ?? '').getTime() > Date.now() ? '開始待ち' : '終了済み';
    }

    return '無効';
}

function triggerGroupLabel(role: CampaignTargetRole): string {
    return role === 'therapist' ? 'タチキャスト向け' : '利用者向け';
}

function serializeDateTimeLocal(value: string): string | null {
    if (!value) {
        return null;
    }

    return parseJstDateTimeLocalInput(value)?.toISOString() ?? null;
}

export function AdminCampaignsPage() {
    const { token } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [campaigns, setCampaigns] = useState<AdminCampaignRecord[]>([]);
    const [form, setForm] = useState<CampaignFormState>(() => buildEmptyForm());
    const [pageError, setPageError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const targetRoleFilter = normalizeTargetRole(searchParams.get('target_role'));
    const stateFilter = normalizeStateFilter(searchParams.get('state'));
    const triggerTypeFilter = normalizeTriggerType(searchParams.get('trigger_type'));
    const selectedCampaignId = searchParams.get('campaign_id');

    usePageTitle('キャンペーン管理');
    useToastOnMessage(successMessage, 'success');

    const selectedCampaign = useMemo(
        () => campaigns.find((campaign) => String(campaign.id) === selectedCampaignId) ?? null,
        [campaigns, selectedCampaignId],
    );

    const availableTriggerOptions = useMemo(() => {
        if (targetRoleFilter === 'therapist' || targetRoleFilter === 'user') {
            return triggerOptionsForRole(targetRoleFilter);
        }

        return [
            ...triggerOptionsForRole('therapist'),
            ...triggerOptionsForRole('user'),
        ];
    }, [targetRoleFilter]);

    const summary = useMemo(() => ({
        total: campaigns.length,
        active: campaigns.filter((campaign) => campaign.is_active).length,
        scheduled: campaigns.filter((campaign) => campaign.is_enabled && !campaign.is_active && new Date(campaign.starts_at ?? '').getTime() > Date.now()).length,
        inactive: campaigns.filter((campaign) => !campaign.is_enabled || new Date(campaign.ends_at ?? '').getTime() < Date.now()).length,
    }), [campaigns]);

    const loadCampaigns = useCallback(async (refresh = false) => {
        if (!token) {
            return;
        }

        if (refresh) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }

        setPageError(null);

        try {
            const params = new URLSearchParams();

            if (targetRoleFilter !== 'all') {
                params.set('target_role', targetRoleFilter);
            }

            if (triggerTypeFilter !== 'all') {
                params.set('trigger_type', triggerTypeFilter);
            }

            if (stateFilter !== 'all') {
                params.set('state', stateFilter);
            }

            const path = params.toString() ? `/admin/campaigns?${params.toString()}` : '/admin/campaigns';
            const payload = await apiRequest<ApiEnvelope<AdminCampaignRecord[]>>(path, { token });
            setCampaigns(unwrapData(payload));
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : 'キャンペーン一覧の取得に失敗しました。';

            setPageError(message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [stateFilter, targetRoleFilter, token, triggerTypeFilter]);

    useEffect(() => {
        void loadCampaigns();
    }, [loadCampaigns]);

    useEffect(() => {
        if (selectedCampaign) {
            setForm(buildFormFromCampaign(selectedCampaign));
            setFormError(null);
            return;
        }

        setForm((current) => {
            if (selectedCampaignId) {
                return current;
            }

            return buildEmptyForm(current.target_role);
        });
    }, [selectedCampaign, selectedCampaignId]);

    const triggerOptions = useMemo(
        () => triggerOptionsForRole(form.target_role),
        [form.target_role],
    );
    const canDeleteSelectedCampaign = Boolean(selectedCampaign?.can_delete);

    const adminFieldClass = 'w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]';
    const adminFieldWithPlaceholderClass = `${adminFieldClass} placeholder:text-[#9aa3ad]`;

    const handleTargetRoleChange = (targetRole: CampaignTargetRole) => {
        const nextTriggerType = triggerOptionsForRole(targetRole)[0]?.value ?? form.trigger_type;
        setForm((current) => ({
            ...current,
            target_role: targetRole,
            trigger_type: nextTriggerType,
            benefit_type: targetRole === 'therapist' ? 'fixed_amount' : current.benefit_type,
            offer_valid_days: targetRole === 'user' && nextTriggerType === 'user_first_booking'
                ? current.offer_valid_days
                : '',
        }));
    };

    const handleCreateNew = () => {
        setSearchParams((previous) => {
            const next = new URLSearchParams(previous);
            next.delete('campaign_id');

            return next;
        }, { replace: true });
        setForm(buildEmptyForm(form.target_role));
        setFormError(null);
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!token) {
            return;
        }

        setFormError(null);
        setSuccessMessage(null);

        const startsAt = serializeDateTimeLocal(form.starts_at);
        const endsAt = form.ends_at ? serializeDateTimeLocal(form.ends_at) : null;

        if (!startsAt) {
            setFormError('開始日時を正しく入力してください。');
            return;
        }

        if (form.ends_at && !endsAt) {
            setFormError('終了日時を正しく入力してください。');
            return;
        }

        setIsSubmitting(true);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminCampaignRecord>>(
                selectedCampaign ? `/admin/campaigns/${selectedCampaign.id}` : '/admin/campaigns',
                {
                    method: selectedCampaign ? 'PATCH' : 'POST',
                    token,
                    body: {
                        target_role: form.target_role,
                        trigger_type: form.trigger_type,
                        benefit_type: form.target_role === 'therapist' ? 'fixed_amount' : form.benefit_type,
                        benefit_value: Number(form.benefit_value),
                        offer_text: form.offer_text,
                        starts_at: startsAt,
                        ends_at: endsAt,
                        offer_valid_days: form.target_role === 'user' && form.trigger_type === 'user_first_booking' && form.offer_valid_days
                            ? Number(form.offer_valid_days)
                            : null,
                        is_enabled: form.is_enabled,
                    },
                },
            );

            const savedCampaign = unwrapData(payload);
            setSuccessMessage(selectedCampaign ? 'キャンペーンを更新しました。' : 'キャンペーンを作成しました。');
            setSearchParams((previous) => {
                const next = new URLSearchParams(previous);
                next.set('campaign_id', String(savedCampaign.id));

                return next;
            }, { replace: true });
            await loadCampaigns(true);
        } catch (requestError) {
            if (requestError instanceof ApiError) {
                setFormError(
                    getFieldError(requestError, 'starts_at')
                    ?? getFieldError(requestError, 'ends_at')
                    ?? getFieldError(requestError, 'trigger_type')
                    ?? getFieldError(requestError, 'benefit_value')
                    ?? getFieldError(requestError, 'offer_valid_days')
                    ?? getFieldError(requestError, 'offer_text')
                    ?? requestError.message,
                );
            } else {
                setFormError('キャンペーンの保存に失敗しました。');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!token || !selectedCampaign || !canDeleteSelectedCampaign || isDeleting) {
            return;
        }

        const confirmed = window.confirm('このキャンペーンを削除しますか？');

        if (!confirmed) {
            return;
        }

        setFormError(null);
        setSuccessMessage(null);
        setIsDeleting(true);

        try {
            await apiRequest(`/admin/campaigns/${selectedCampaign.id}`, {
                method: 'DELETE',
                token,
            });

            setSuccessMessage('キャンペーンを削除しました。');
            setSearchParams((previous) => {
                const next = new URLSearchParams(previous);
                next.delete('campaign_id');

                return next;
            }, { replace: true });
            setForm(buildEmptyForm(form.target_role));
            await loadCampaigns(true);
        } catch (requestError) {
            if (requestError instanceof ApiError) {
                setFormError(requestError.message);
            } else {
                setFormError('キャンペーンの削除に失敗しました。');
            }
        } finally {
            setIsDeleting(false);
        }
    };

    if (isLoading) {
        return <LoadingScreen title="キャンペーン一覧を読み込み中" message="公開中の特典設定と適用状況をまとめています。" />;
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_16px_34px_rgba(2,6,23,0.14)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">CAMPAIGN CONTROL</p>
                        <h2 className="text-2xl font-semibold text-white sm:text-[2rem]">キャンペーン管理</h2>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            登録特典、初回予約割引、期間限定割引をここでまとめて管理します。対象ロールと適用条件ごとに期間重複を防ぎながら運用でき、初回予約オファーの有効期限も設定できます。
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                void loadCampaigns(true);
                            }}
                            disabled={isRefreshing}
                            className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isRefreshing ? '更新中...' : '最新化'}
                        </button>
                        <button
                            type="button"
                            onClick={handleCreateNew}
                            className="inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#17202b] transition hover:bg-[#f6ead6]"
                        >
                            新規キャンペーン
                        </button>
                    </div>
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-4">
                <article className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_16px_34px_rgba(2,6,23,0.12)]">
                    <p className="text-xs font-semibold tracking-wide text-[#d2b179]">TOTAL</p>
                    <p className="mt-3 text-3xl font-semibold text-white">{summary.total.toLocaleString('ja-JP')}</p>
                    <p className="mt-2 text-sm text-slate-300">表示中のキャンペーン件数</p>
                </article>
                <article className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_16px_34px_rgba(2,6,23,0.12)]">
                    <p className="text-xs font-semibold tracking-wide text-[#d2b179]">ACTIVE</p>
                    <p className="mt-3 text-3xl font-semibold text-white">{summary.active.toLocaleString('ja-JP')}</p>
                    <p className="mt-2 text-sm text-slate-300">現在ユーザーへ表示中</p>
                </article>
                <article className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_16px_34px_rgba(2,6,23,0.12)]">
                    <p className="text-xs font-semibold tracking-wide text-[#d2b179]">SCHEDULED</p>
                    <p className="mt-3 text-3xl font-semibold text-white">{summary.scheduled.toLocaleString('ja-JP')}</p>
                    <p className="mt-2 text-sm text-slate-300">開始待ち</p>
                </article>
                <article className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_16px_34px_rgba(2,6,23,0.12)]">
                    <p className="text-xs font-semibold tracking-wide text-[#d2b179]">INACTIVE</p>
                    <p className="mt-3 text-3xl font-semibold text-white">{summary.inactive.toLocaleString('ja-JP')}</p>
                    <p className="mt-2 text-sm text-slate-300">無効または終了済み</p>
                </article>
            </section>

            <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                <div className="grid gap-4 lg:grid-cols-3">
                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">対象ロール</span>
                        <select
                            value={targetRoleFilter}
                            onChange={(event) => {
                                setSearchParams((previous) => {
                                    const next = new URLSearchParams(previous);
                                    if (event.target.value === 'all') {
                                        next.delete('target_role');
                                        next.delete('trigger_type');
                                    } else {
                                        next.set('target_role', event.target.value);
                                        next.delete('trigger_type');
                                    }

                                    return next;
                                }, { replace: true });
                            }}
                            className={adminFieldClass}
                        >
                            <option value="all">すべて</option>
                            <option value="therapist">タチキャスト</option>
                            <option value="user">利用者</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">適用状態</span>
                        <select
                            value={stateFilter}
                            onChange={(event) => {
                                setSearchParams((previous) => {
                                    const next = new URLSearchParams(previous);
                                    if (event.target.value === 'all') {
                                        next.delete('state');
                                    } else {
                                        next.set('state', event.target.value);
                                    }

                                    return next;
                                }, { replace: true });
                            }}
                            className={adminFieldClass}
                        >
                            <option value="all">すべて</option>
                            <option value="active">適用中</option>
                            <option value="scheduled">開始待ち</option>
                            <option value="inactive">無効・終了済み</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">適用条件</span>
                        <select
                            value={triggerTypeFilter}
                            onChange={(event) => {
                                setSearchParams((previous) => {
                                    const next = new URLSearchParams(previous);
                                    if (event.target.value === 'all') {
                                        next.delete('trigger_type');
                                    } else {
                                        next.set('trigger_type', event.target.value);
                                    }

                                    return next;
                                }, { replace: true });
                            }}
                            className={adminFieldClass}
                        >
                            <option value="all">すべて</option>
                            {availableTriggerOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>

                {pageError ? (
                    <p className="mt-4 text-sm text-rose-600">{pageError}</p>
                ) : null}
            </section>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
                <div className="space-y-4">
                    {campaigns.length > 0 ? (
                        campaigns.map((campaign) => {
                            const isSelected = selectedCampaign?.id === campaign.id;

                            return (
                                <button
                                    key={campaign.id}
                                    type="button"
                                    onClick={() => {
                                        setSearchParams((previous) => {
                                            const next = new URLSearchParams(previous);
                                            next.set('campaign_id', String(campaign.id));

                                            return next;
                                        }, { replace: true });
                                    }}
                                    className={[
                                        'w-full rounded-[28px] border p-6 text-left shadow-[0_16px_34px_rgba(2,6,23,0.12)] transition',
                                        isSelected
                                            ? 'border-[#d2b179] bg-[#fffaf3]'
                                            : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.06]',
                                    ].join(' ')}
                                >
                                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                        <div className="space-y-3">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(campaign)}`}>
                                                    {statusLabel(campaign)}
                                                </span>
                                                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                                    isSelected ? 'bg-[#17202b] text-white' : 'bg-white/10 text-slate-200'
                                                }`}>
                                                    {campaign.target_label}
                                                </span>
                                                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                                    isSelected ? 'bg-[#f4ead8] text-[#8b5a16]' : 'bg-white/10 text-slate-200'
                                                }`}>
                                                    {campaign.benefit_summary}
                                                </span>
                                            </div>
                                            <div>
                                                <p className={`text-lg font-semibold ${isSelected ? 'text-[#17202b]' : 'text-white'}`}>
                                                    {campaign.trigger_label}
                                                </p>
                                                <p className={`mt-2 text-sm leading-7 ${isSelected ? 'text-[#48505a]' : 'text-slate-300'}`}>
                                                    {campaign.offer_text}
                                                </p>
                                            </div>
                                        </div>

                                        <div className={`grid gap-2 text-sm ${isSelected ? 'text-[#48505a]' : 'text-slate-300'}`}>
                                            <div className="flex items-center justify-between gap-4">
                                                <span>開始</span>
                                                <span className={isSelected ? 'font-semibold text-[#17202b]' : 'font-semibold text-white'}>
                                                    {formatJstDateTime(campaign.starts_at) ?? '未設定'}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between gap-4">
                                                <span>終了</span>
                                                <span className={isSelected ? 'font-semibold text-[#17202b]' : 'font-semibold text-white'}>
                                                    {formatJstDateTime(campaign.ends_at) ?? '終了なし'}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between gap-4">
                                                <span>適用件数</span>
                                                <span className={isSelected ? 'font-semibold text-[#17202b]' : 'font-semibold text-white'}>
                                                    {campaign.applications_count.toLocaleString('ja-JP')}
                                                </span>
                                            </div>
                                            {campaign.offer_valid_days ? (
                                                <div className="flex items-center justify-between gap-4">
                                                    <span>有効期限</span>
                                                    <span className={isSelected ? 'font-semibold text-[#17202b]' : 'font-semibold text-white'}>
                                                        付与後 {campaign.offer_valid_days} 日
                                                    </span>
                                                </div>
                                            ) : null}
                                            <div className="flex items-center justify-between gap-4">
                                                <span>適用総額</span>
                                                <span className={isSelected ? 'font-semibold text-[#17202b]' : 'font-semibold text-white'}>
                                                    {formatCurrency(campaign.total_applied_amount)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            );
                        })
                    ) : (
                        <div className="rounded-[28px] border border-dashed border-white/10 bg-white/[0.04] p-8 text-center">
                            <p className="text-lg font-semibold text-white">条件に合うキャンペーンはありません。</p>
                            <p className="mt-2 text-sm leading-7 text-slate-300">
                                新規キャンペーンを作成するか、フィルターを解除して既存設定を確認してください。
                            </p>
                        </div>
                    )}
                </div>

                <aside className="space-y-5">
                    <section className="rounded-[28px] bg-[#fffdf8] p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <div className="space-y-2">
                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">
                                {selectedCampaign ? 'EDIT CAMPAIGN' : 'NEW CAMPAIGN'}
                            </p>
                            <h3 className="text-2xl font-semibold text-[#17202b]">
                                {selectedCampaign ? 'キャンペーンを編集' : 'キャンペーンを作成'}
                            </h3>
                            <p className="text-sm leading-7 text-[#68707a]">
                                同じ対象ロールと同じ適用条件では、有効期間を重複できません。タチキャスト向け特典は固定額付与のみです。
                            </p>
                            <p className="text-xs leading-6 text-[#8c7454]">
                                適用数が 0 件のキャンペーンだけ削除できます。
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                            <div className="space-y-3">
                                <span className="text-sm font-semibold text-[#17202b]">対象ロール</span>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    {(['therapist', 'user'] as CampaignTargetRole[]).map((role) => (
                                        <button
                                            key={role}
                                            type="button"
                                            onClick={() => {
                                                handleTargetRoleChange(role);
                                            }}
                                            className={[
                                                'rounded-[20px] border px-4 py-4 text-left transition',
                                                form.target_role === role
                                                    ? 'border-[#d2b179] bg-[#fff8ee]'
                                                    : 'border-[#e8dfd2] bg-white hover:bg-[#fff9f1]',
                                            ].join(' ')}
                                        >
                                            <p className="text-sm font-semibold text-[#17202b]">{triggerGroupLabel(role)}</p>
                                            <p className="mt-1 text-xs leading-6 text-[#68707a]">
                                                {role === 'therapist'
                                                    ? '登録特典と予約成立特典を管理します。'
                                                    : '初回予約割引、保有オファー期限、期間限定予約割引を管理します。'}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">適用条件</span>
                                <select
                                    value={form.trigger_type}
                                    onChange={(event) => {
                                        setForm((current) => ({
                                            ...current,
                                            trigger_type: event.target.value as CampaignTriggerType,
                                            offer_valid_days: event.target.value === 'user_first_booking'
                                                ? current.offer_valid_days
                                                : '',
                                        }));
                                    }}
                                    className={adminFieldClass}
                                >
                                    {triggerOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            {form.target_role === 'user' ? (
                                <div className="space-y-3">
                                    <span className="text-sm font-semibold text-[#17202b]">割引種別</span>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        {([
                                            { value: 'fixed_amount' as const, label: '固定金額割引', body: '予約料金から指定額を差し引きます。' },
                                            { value: 'percentage' as const, label: 'パーセント割引', body: '予約料金から割合で割引します。' },
                                        ]).map((option) => (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() => {
                                                    setForm((current) => ({
                                                        ...current,
                                                        benefit_type: option.value,
                                                    }));
                                                }}
                                                className={[
                                                    'rounded-[20px] border px-4 py-4 text-left transition',
                                                    form.benefit_type === option.value
                                                        ? 'border-[#d2b179] bg-[#fff8ee]'
                                                        : 'border-[#e8dfd2] bg-white hover:bg-[#fff9f1]',
                                                ].join(' ')}
                                            >
                                                <p className="text-sm font-semibold text-[#17202b]">{option.label}</p>
                                                <p className="mt-1 text-xs leading-6 text-[#68707a]">{option.body}</p>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">
                                    {form.target_role === 'therapist'
                                        ? '付与金額'
                                        : form.benefit_type === 'percentage'
                                            ? '割引率'
                                            : '割引金額'}
                                </span>
                                <div className="relative">
                                    <input
                                        type="number"
                                        min={1}
                                        max={1000000}
                                        value={form.benefit_value}
                                        onChange={(event) => {
                                            setForm((current) => ({
                                                ...current,
                                                benefit_value: event.target.value,
                                            }));
                                        }}
                                        className={`${adminFieldWithPlaceholderClass} pr-16`}
                                        placeholder={form.benefit_type === 'percentage' ? '10' : '3000'}
                                        required
                                    />
                                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#68707a]">
                                        {form.target_role === 'user' && form.benefit_type === 'percentage' ? '%' : '円'}
                                    </span>
                                </div>
                            </label>

                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">オファー内容テキスト</span>
                                <textarea
                                    value={form.offer_text}
                                    onChange={(event) => {
                                        setForm((current) => ({
                                            ...current,
                                            offer_text: event.target.value,
                                        }));
                                    }}
                                    rows={4}
                                    className={adminFieldWithPlaceholderClass}
                                    placeholder="本人確認完了で売上残高3,000円をプレゼント"
                                    required
                                />
                            </label>

                            {form.target_role === 'user' && form.trigger_type === 'user_first_booking' ? (
                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-[#17202b]">オファー有効期限（日数）</span>
                                    <input
                                        type="number"
                                        min={1}
                                        max={365}
                                        value={form.offer_valid_days}
                                        onChange={(event) => {
                                            setForm((current) => ({
                                                ...current,
                                                offer_valid_days: event.target.value,
                                            }));
                                        }}
                                        className={adminFieldWithPlaceholderClass}
                                        placeholder="14"
                                    />
                                    <p className="text-xs leading-6 text-[#68707a]">
                                        本人確認承認後に保有オファーとして付与され、ここで指定した日数を過ぎると期限切れになります。空欄なら期限なしです。
                                    </p>
                                </label>
                            ) : null}

                            <div className="grid gap-4 sm:grid-cols-2">
                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-[#17202b]">開始日時</span>
                                    <input
                                        type="datetime-local"
                                        value={form.starts_at}
                                        onChange={(event) => {
                                            setForm((current) => ({
                                                ...current,
                                                starts_at: event.target.value,
                                            }));
                                        }}
                                        className={adminFieldClass}
                                        required
                                    />
                                </label>
                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-[#17202b]">終了日時</span>
                                    <input
                                        type="datetime-local"
                                        value={form.ends_at}
                                        onChange={(event) => {
                                            setForm((current) => ({
                                                ...current,
                                                ends_at: event.target.value,
                                            }));
                                        }}
                                        className={adminFieldClass}
                                    />
                                </label>
                            </div>

                            <label className="flex items-center gap-3 rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-4">
                                <input
                                    type="checkbox"
                                    checked={form.is_enabled}
                                    onChange={(event) => {
                                        setForm((current) => ({
                                            ...current,
                                            is_enabled: event.target.checked,
                                        }));
                                    }}
                                    className="h-4 w-4 rounded border-[#c6a16a]"
                                />
                                <span className="text-sm font-semibold text-[#17202b]">保存後すぐ有効化する</span>
                            </label>

                            {formError ? (
                                <p className="text-sm text-[#b45309]">{formError}</p>
                            ) : null}

                            <div className="flex flex-col gap-3">
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isSubmitting
                                        ? '保存中...'
                                        : selectedCampaign
                                            ? 'キャンペーンを更新'
                                            : 'キャンペーンを作成'}
                                </button>
                                {selectedCampaign ? (
                                    <>
                                        {canDeleteSelectedCampaign ? (
                                            <button
                                                type="button"
                                                onClick={handleDelete}
                                                disabled={isDeleting}
                                                className="inline-flex min-h-11 items-center justify-center rounded-full border border-rose-200 px-5 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {isDeleting ? '削除中...' : '削除'}
                                            </button>
                                        ) : null}
                                        <button
                                            type="button"
                                            onClick={handleCreateNew}
                                            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#ddcfb4] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                                        >
                                            新規作成に切り替える
                                        </button>
                                    </>
                                ) : null}
                            </div>
                        </form>
                    </section>
                </aside>
            </section>
        </div>
    );
}
