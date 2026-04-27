import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import type {
    ApiEnvelope,
    TherapistMenu,
    TherapistPricingRuleRecord,
    TherapistProfileRecord,
} from '../lib/types';

type StatusFilter = 'all' | 'active' | 'inactive';
type RuleScope = 'profile' | 'menu';

interface PricingRuleDraft {
    id: number | null;
    scope: RuleScope;
    therapist_menu_id: string | null;
    rule_type: string;
    field: string;
    operator: string;
    single_value: string;
    multi_values: string[];
    range_start: string;
    range_end: string;
    start_hour: string;
    end_hour: string;
    adjustment_type: string;
    adjustment_amount: string;
    min_price_amount: string;
    max_price_amount: string;
    priority: string;
    is_active: boolean;
}

interface SelectOption {
    value: string;
    label: string;
}

const RULE_TYPE_OPTIONS: SelectOption[] = [
    { value: 'user_profile_attribute', label: '利用者プロフィール条件' },
    { value: 'time_band', label: '時間帯' },
    { value: 'walking_time_range', label: '徒歩目安' },
    { value: 'demand_level', label: '需要レベル' },
];

const PROFILE_FIELD_OPTIONS: SelectOption[] = [
    { value: 'age_range', label: '年代' },
    { value: 'body_type', label: '体型' },
    { value: 'height_cm', label: '身長' },
    { value: 'weight_range', label: '体重帯' },
    { value: 'sexual_orientation', label: '指向' },
    { value: 'gender_identity', label: '性自認' },
];

const PROFILE_FIELD_VALUE_OPTIONS: Record<string, SelectOption[]> = {
    age_range: [
        { value: '18_24', label: '18-24歳' },
        { value: '20s', label: '20代' },
        { value: '30s', label: '30代' },
        { value: '40s', label: '40代' },
        { value: '50s', label: '50代' },
        { value: '60_plus', label: '60歳以上' },
    ],
    body_type: [
        { value: 'slim', label: '細身' },
        { value: 'average', label: '普通' },
        { value: 'muscular', label: '筋肉質' },
        { value: 'chubby', label: 'ぽっちゃり' },
        { value: 'large', label: '大柄' },
        { value: 'other', label: 'その他' },
    ],
    weight_range: [
        { value: '40_49', label: '40-49kg' },
        { value: '50_59', label: '50-59kg' },
        { value: '60_69', label: '60-69kg' },
        { value: '70_79', label: '70-79kg' },
        { value: '80_89', label: '80-89kg' },
        { value: '90_plus', label: '90kg以上' },
    ],
    sexual_orientation: [
        { value: 'gay', label: 'ゲイ' },
        { value: 'bi', label: 'バイ' },
        { value: 'straight', label: 'ストレート' },
        { value: 'other', label: 'その他' },
        { value: 'no_answer', label: '回答しない' },
    ],
    gender_identity: [
        { value: 'cis_male', label: 'シス男性' },
        { value: 'trans_male', label: 'トランス男性' },
        { value: 'other', label: 'その他' },
        { value: 'no_answer', label: '回答しない' },
    ],
};

const HEIGHT_OPERATOR_OPTIONS: SelectOption[] = [
    { value: 'equals', label: '等しい' },
    { value: 'not_equals', label: '等しくない' },
    { value: 'gte', label: '以上' },
    { value: 'lte', label: '以下' },
    { value: 'between', label: '範囲指定' },
];

const CATEGORICAL_OPERATOR_OPTIONS: SelectOption[] = [
    { value: 'equals', label: '等しい' },
    { value: 'not_equals', label: '等しくない' },
    { value: 'in', label: 'いずれかに一致' },
    { value: 'not_in', label: 'いずれにも一致しない' },
];

const DISCRETE_OPERATOR_OPTIONS: SelectOption[] = [
    { value: 'equals', label: '等しい' },
    { value: 'not_equals', label: '等しくない' },
    { value: 'in', label: 'いずれかに一致' },
    { value: 'not_in', label: 'いずれにも一致しない' },
];

const WALKING_TIME_OPTIONS: SelectOption[] = [
    { value: 'within_15_min', label: '徒歩15分以内' },
    { value: 'within_30_min', label: '徒歩30分以内' },
    { value: 'within_60_min', label: '徒歩60分以内' },
    { value: 'outside_area', label: '対応外相当' },
];

const DEMAND_LEVEL_OPTIONS: SelectOption[] = [
    { value: 'normal', label: '通常' },
    { value: 'busy', label: '混雑' },
    { value: 'peak', label: 'ピーク' },
];

const ADJUSTMENT_TYPE_OPTIONS: SelectOption[] = [
    { value: 'fixed_amount', label: '固定金額' },
    { value: 'percentage', label: 'パーセント' },
];

function formatCurrency(amount: number | null | undefined): string {
    if (amount === null || amount === undefined) {
        return '-';
    }

    return new Intl.NumberFormat('ja-JP', {
        style: 'currency',
        currency: 'JPY',
        maximumFractionDigits: 0,
    }).format(amount);
}

function ruleTypeLabel(ruleType: string): string {
    return RULE_TYPE_OPTIONS.find((option) => option.value === ruleType)?.label ?? ruleType;
}

function fieldLabel(field: string): string {
    return PROFILE_FIELD_OPTIONS.find((option) => option.value === field)?.label ?? field;
}

function operatorLabel(operator: string): string {
    switch (operator) {
        case 'equals':
            return '等しい';
        case 'not_equals':
            return '等しくない';
        case 'in':
            return 'いずれかに一致';
        case 'not_in':
            return 'いずれにも一致しない';
        case 'gte':
            return '以上';
        case 'lte':
            return '以下';
        case 'between':
            return '範囲指定';
        default:
            return operator;
    }
}

function adjustmentLabel(rule: TherapistPricingRuleRecord): string {
    if (rule.adjustment_type === 'percentage') {
        const prefix = rule.adjustment_amount >= 0 ? '+' : '';
        return `${prefix}${rule.adjustment_amount}%`;
    }

    const prefix = rule.adjustment_amount >= 0 ? '+' : '-';
    return `${prefix}${formatCurrency(Math.abs(rule.adjustment_amount))}`;
}

function badgeTone(isActive: boolean): string {
    return isActive
        ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
        : 'border-white/10 bg-white/5 text-slate-300';
}

function optionLabel(options: SelectOption[], value: string): string {
    return options.find((option) => option.value === value)?.label ?? value;
}

function formatConditionSummary(rule: TherapistPricingRuleRecord): string {
    const condition = rule.condition ?? {};

    if (rule.rule_type === 'time_band') {
        const startHour = typeof condition.start_hour === 'number' ? condition.start_hour : 0;
        const endHour = typeof condition.end_hour === 'number' ? condition.end_hour : 0;
        return `${String(startHour).padStart(2, '0')}:00 - ${String(endHour).padStart(2, '0')}:00`;
    }

    if (rule.rule_type === 'walking_time_range') {
        const operator = typeof condition.operator === 'string' ? condition.operator : 'equals';
        const value = typeof condition.value === 'string' ? optionLabel(WALKING_TIME_OPTIONS, condition.value) : null;
        const values = Array.isArray(condition.values) ? condition.values.map((item) => optionLabel(WALKING_TIME_OPTIONS, String(item))) : [];

        return `${operatorLabel(operator)} ${value ?? values.join(' / ')}`;
    }

    if (rule.rule_type === 'demand_level') {
        const operator = typeof condition.operator === 'string' ? condition.operator : 'equals';
        const value = typeof condition.value === 'string' ? optionLabel(DEMAND_LEVEL_OPTIONS, condition.value) : null;
        const values = Array.isArray(condition.values) ? condition.values.map((item) => optionLabel(DEMAND_LEVEL_OPTIONS, String(item))) : [];

        return `${operatorLabel(operator)} ${value ?? values.join(' / ')}`;
    }

    const field = typeof condition.field === 'string' ? condition.field : 'age_range';
    const operator = typeof condition.operator === 'string' ? condition.operator : 'equals';

    if (field === 'height_cm') {
        if (Array.isArray(condition.values)) {
            return `${fieldLabel(field)} ${operatorLabel(operator)} ${condition.values.join(' - ')}cm`;
        }

        return `${fieldLabel(field)} ${operatorLabel(operator)} ${condition.value ?? '-'}cm`;
    }

    const options = PROFILE_FIELD_VALUE_OPTIONS[field] ?? [];
    const value = typeof condition.value === 'string' ? optionLabel(options, condition.value) : null;
    const values = Array.isArray(condition.values) ? condition.values.map((item) => optionLabel(options, String(item))) : [];

    return `${fieldLabel(field)} ${operatorLabel(operator)} ${value ?? values.join(' / ')}`;
}

function createDraft(menus: TherapistMenu[]): PricingRuleDraft {
    const firstMenu = menus[0] ?? null;

    return {
        id: null,
        scope: 'profile',
        therapist_menu_id: firstMenu?.public_id ?? null,
        rule_type: 'user_profile_attribute',
        field: 'age_range',
        operator: 'equals',
        single_value: '20s',
        multi_values: ['20s'],
        range_start: '170',
        range_end: '180',
        start_hour: '20',
        end_hour: '23',
        adjustment_type: 'fixed_amount',
        adjustment_amount: '1000',
        min_price_amount: '',
        max_price_amount: '',
        priority: '100',
        is_active: true,
    };
}

function createDraftFromRule(rule: TherapistPricingRuleRecord, menus: TherapistMenu[]): PricingRuleDraft {
    const draft = createDraft(menus);
    const condition = rule.condition ?? {};

    const nextDraft: PricingRuleDraft = {
        ...draft,
        id: rule.id,
        scope: rule.therapist_menu_id ? 'menu' : 'profile',
        therapist_menu_id: rule.therapist_menu_id,
        rule_type: rule.rule_type,
        adjustment_type: rule.adjustment_type,
        adjustment_amount: String(rule.adjustment_amount),
        min_price_amount: rule.min_price_amount === null ? '' : String(rule.min_price_amount),
        max_price_amount: rule.max_price_amount === null ? '' : String(rule.max_price_amount),
        priority: String(rule.priority),
        is_active: rule.is_active,
    };

    if (rule.rule_type === 'time_band') {
        return {
            ...nextDraft,
            start_hour: String(condition.start_hour ?? 20),
            end_hour: String(condition.end_hour ?? 23),
        };
    }

    if (rule.rule_type === 'walking_time_range' || rule.rule_type === 'demand_level') {
        return {
            ...nextDraft,
            operator: typeof condition.operator === 'string' ? condition.operator : 'equals',
            single_value: typeof condition.value === 'string' ? condition.value : draft.single_value,
            multi_values: Array.isArray(condition.values) ? condition.values.map((value) => String(value)) : draft.multi_values,
        };
    }

    const field = typeof condition.field === 'string' ? condition.field : draft.field;
    const operator = typeof condition.operator === 'string' ? condition.operator : draft.operator;

    if (field === 'height_cm') {
        if (Array.isArray(condition.values)) {
            return {
                ...nextDraft,
                field,
                operator,
                range_start: String(condition.values[0] ?? draft.range_start),
                range_end: String(condition.values[1] ?? draft.range_end),
            };
        }

        return {
            ...nextDraft,
            field,
            operator,
            single_value: String(condition.value ?? draft.single_value),
        };
    }

    return {
        ...nextDraft,
        field,
        operator,
        single_value: typeof condition.value === 'string' ? condition.value : draft.single_value,
        multi_values: Array.isArray(condition.values) ? condition.values.map((value) => String(value)) : draft.multi_values,
    };
}

function isNumericProfileField(field: string): boolean {
    return field === 'height_cm';
}

function isMultiValueOperator(operator: string): boolean {
    return operator === 'in' || operator === 'not_in';
}

export function TherapistPricingPage() {
    const { token } = useAuth();
    const [profile, setProfile] = useState<TherapistProfileRecord | null>(null);
    const [rules, setRules] = useState<TherapistPricingRuleRecord[]>([]);
    const [draft, setDraft] = useState<PricingRuleDraft>(createDraft([]));
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [typeFilter, setTypeFilter] = useState('all');
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [deletingRuleId, setDeletingRuleId] = useState<number | null>(null);

    usePageTitle('料金ルール');
    useToastOnMessage(error, 'error');
    useToastOnMessage(successMessage, 'success');

    const loadData = useCallback(async () => {
        if (!token) {
            return;
        }

        const [profilePayload, rulesPayload] = await Promise.all([
            apiRequest<ApiEnvelope<TherapistProfileRecord>>('/me/therapist-profile', { token }),
            apiRequest<ApiEnvelope<TherapistPricingRuleRecord[]>>('/me/therapist/pricing-rules', { token }),
        ]);

        const nextProfile = unwrapData(profilePayload);
        const nextRules = unwrapData(rulesPayload);

        setProfile(nextProfile);
        setRules(nextRules);
        setDraft((current) => (current.id === null ? createDraft(nextProfile.menus) : current));
    }, [token]);

    useEffect(() => {
        let mounted = true;

        void loadData()
            .catch((requestError: unknown) => {
                if (!mounted) {
                    return;
                }

                const message = requestError instanceof ApiError ? requestError.message : '料金ルールの取得に失敗しました。';
                setError(message);
            })
            .finally(() => {
                if (mounted) {
                    setIsLoading(false);
                }
            });

        return () => {
            mounted = false;
        };
    }, [loadData]);

    const filteredRules = useMemo(() => (
        rules.filter((rule) => {
            if (statusFilter === 'active' && !rule.is_active) {
                return false;
            }

            if (statusFilter === 'inactive' && rule.is_active) {
                return false;
            }

            if (typeFilter !== 'all' && rule.rule_type !== typeFilter) {
                return false;
            }

            return true;
        })
    ), [rules, statusFilter, typeFilter]);

    const activeRuleCount = rules.filter((rule) => rule.is_active).length;
    const inactiveRuleCount = rules.filter((rule) => !rule.is_active).length;
    const menuScopedRuleCount = rules.filter((rule) => rule.therapist_menu_id).length;
    const profileScopedRuleCount = rules.filter((rule) => !rule.therapist_menu_id).length;
    const activeMenus = profile?.menus.filter((menu) => menu.is_active) ?? [];

    const profileFieldOptions = useMemo(
        () => PROFILE_FIELD_VALUE_OPTIONS[draft.field] ?? [],
        [draft.field],
    );

    const profileOperatorOptions = useMemo(
        () => (isNumericProfileField(draft.field) ? HEIGHT_OPERATOR_OPTIONS : CATEGORICAL_OPERATOR_OPTIONS),
        [draft.field],
    );

    const discreteOptions = useMemo(() => {
        if (draft.rule_type === 'walking_time_range') {
            return WALKING_TIME_OPTIONS;
        }

        if (draft.rule_type === 'demand_level') {
            return DEMAND_LEVEL_OPTIONS;
        }

        return [];
    }, [draft.rule_type]);

    function resetDraft() {
        setDraft(createDraft(profile?.menus ?? []));
        setSuccessMessage(null);
        setError(null);
    }

    function updateDraft(patch: Partial<PricingRuleDraft>) {
        setDraft((current) => ({ ...current, ...patch }));
    }

    function handleRuleTypeChange(nextRuleType: string) {
        const baseDraft = createDraft(profile?.menus ?? []);

        setDraft((current) => ({
            ...current,
            rule_type: nextRuleType,
            field: nextRuleType === 'user_profile_attribute' ? baseDraft.field : current.field,
            operator: nextRuleType === 'user_profile_attribute' ? baseDraft.operator : 'equals',
            single_value: nextRuleType === 'demand_level'
                ? 'normal'
                : nextRuleType === 'walking_time_range'
                    ? 'within_15_min'
                    : baseDraft.single_value,
            multi_values: nextRuleType === 'demand_level'
                ? ['normal']
                : nextRuleType === 'walking_time_range'
                    ? ['within_15_min']
                    : baseDraft.multi_values,
            start_hour: baseDraft.start_hour,
            end_hour: baseDraft.end_hour,
            range_start: baseDraft.range_start,
            range_end: baseDraft.range_end,
        }));
    }

    function handleFieldChange(nextField: string) {
        const defaultOption = PROFILE_FIELD_VALUE_OPTIONS[nextField]?.[0]?.value ?? '20s';

        setDraft((current) => ({
            ...current,
            field: nextField,
            operator: isNumericProfileField(nextField) ? 'equals' : 'equals',
            single_value: isNumericProfileField(nextField) ? '180' : defaultOption,
            multi_values: isNumericProfileField(nextField) ? [] : [defaultOption],
            range_start: '170',
            range_end: '180',
        }));
    }

    function handleOperatorChange(nextOperator: string) {
        const defaultOption = profileFieldOptions[0]?.value ?? '20s';
        const defaultDiscreteOption = discreteOptions[0]?.value ?? 'normal';

        setDraft((current) => ({
            ...current,
            operator: nextOperator,
            multi_values: current.rule_type === 'user_profile_attribute'
                ? (isMultiValueOperator(nextOperator) ? (current.multi_values.length > 0 ? current.multi_values : [defaultOption]) : current.multi_values)
                : (isMultiValueOperator(nextOperator) ? (current.multi_values.length > 0 ? current.multi_values : [defaultDiscreteOption]) : current.multi_values),
        }));
    }

    function handleMultiValueChange(event: ChangeEvent<HTMLSelectElement>) {
        const selectedValues = Array.from(event.target.selectedOptions, (option) => option.value);
        updateDraft({ multi_values: selectedValues });
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token) {
            return;
        }

        if (draft.scope === 'menu' && !draft.therapist_menu_id) {
            setError('メニュー個別ルールにする場合は対象メニューを選択してください。');
            return;
        }

        setIsSaving(true);
        setError(null);
        setSuccessMessage(null);

        const payload: Record<string, unknown> = {
            therapist_menu_id: draft.scope === 'menu' ? draft.therapist_menu_id : null,
            rule_type: draft.rule_type,
            adjustment_type: draft.adjustment_type,
            adjustment_amount: Number(draft.adjustment_amount),
            min_price_amount: draft.min_price_amount ? Number(draft.min_price_amount) : null,
            max_price_amount: draft.max_price_amount ? Number(draft.max_price_amount) : null,
            priority: draft.priority ? Number(draft.priority) : 100,
            is_active: draft.is_active,
        };

        if (draft.rule_type === 'time_band') {
            payload.condition = {
                start_hour: Number(draft.start_hour),
                end_hour: Number(draft.end_hour),
            };
        } else if (draft.rule_type === 'walking_time_range' || draft.rule_type === 'demand_level') {
            payload.condition = isMultiValueOperator(draft.operator)
                ? { operator: draft.operator, values: draft.multi_values }
                : { operator: draft.operator, value: draft.single_value };
        } else if (draft.field === 'height_cm') {
            payload.condition = draft.operator === 'between'
                ? {
                    field: draft.field,
                    operator: draft.operator,
                    values: [Number(draft.range_start), Number(draft.range_end)],
                }
                : {
                    field: draft.field,
                    operator: draft.operator,
                    value: Number(draft.single_value),
                };
        } else {
            payload.condition = isMultiValueOperator(draft.operator)
                ? {
                    field: draft.field,
                    operator: draft.operator,
                    values: draft.multi_values,
                }
                : {
                    field: draft.field,
                    operator: draft.operator,
                    value: draft.single_value,
                };
        }

        try {
            if (draft.id === null) {
                await apiRequest<ApiEnvelope<TherapistPricingRuleRecord>>('/me/therapist/pricing-rules', {
                    method: 'POST',
                    token,
                    body: payload,
                });
            } else {
                await apiRequest<ApiEnvelope<TherapistPricingRuleRecord>>(`/me/therapist/pricing-rules/${draft.id}`, {
                    method: 'PATCH',
                    token,
                    body: payload,
                });
            }

            await loadData();
            setSuccessMessage(draft.id === null ? '料金ルールを追加しました。' : '料金ルールを更新しました。');
            setDraft(createDraft(profile?.menus ?? []));
        } catch (requestError) {
            const message = requestError instanceof ApiError ? requestError.message : '料金ルールの保存に失敗しました。';
            setError(message);
        } finally {
            setIsSaving(false);
        }
    }

    async function handleDelete(ruleId: number) {
        if (!token || !window.confirm('この料金ルールを削除しますか？')) {
            return;
        }

        setDeletingRuleId(ruleId);
        setError(null);
        setSuccessMessage(null);

        try {
            await apiRequest(`/me/therapist/pricing-rules/${ruleId}`, {
                method: 'DELETE',
                token,
            });

            await loadData();
            if (draft.id === ruleId) {
                setDraft(createDraft(profile?.menus ?? []));
            }
            setSuccessMessage('料金ルールを削除しました。');
        } catch (requestError) {
            const message = requestError instanceof ApiError ? requestError.message : '料金ルールの削除に失敗しました。';
            setError(message);
        } finally {
            setDeletingRuleId(null);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="料金ルールを確認中" message="メニューと現在の調整ルールを読み込んでいます。" />;
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_16px_34px_rgba(2,6,23,0.14)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">料金ルール</p>
                        <h2 className="text-2xl font-semibold text-white sm:text-[2rem]">料金ルール</h2>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            属性別、時間帯別、徒歩目安別の調整をここで管理します。プロフィール共通ルールとメニュー個別ルールを組み合わせて、
                            見積もりの自動計算を整えられます。
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Link
                            to="/therapist/profile"
                            className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
                        >
                            プロフィールへ戻る
                        </Link>
                        <Link
                            to="/therapist/onboarding"
                            className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
                        >
                            準備状況を確認
                        </Link>
                    </div>
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                    { label: '有効ルール', value: `${activeRuleCount}件`, hint: '見積もりへ反映中' },
                    { label: '停止中', value: `${inactiveRuleCount}件`, hint: '一時停止したルール' },
                    { label: 'メニュー個別', value: `${menuScopedRuleCount}件`, hint: '優先適用される調整' },
                    { label: 'プロフィール共通', value: `${profileScopedRuleCount}件`, hint: '全メニューに適用' },
                ].map((card) => (
                    <article key={card.label} className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_14px_30px_rgba(2,6,23,0.12)]">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">{card.label}</p>
                        <p className="mt-3 text-2xl font-semibold text-white">{card.value}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-300">{card.hint}</p>
                    </article>
                ))}
            </section>

            <section className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_420px]">
                <div className="space-y-4">
                    <article className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_14px_30px_rgba(2,6,23,0.12)]">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                            <div className="space-y-2">
                                <p className="text-xs font-semibold tracking-wide text-[#d2b179]">ルール一覧</p>
                                <h3 className="text-xl font-semibold text-white">現在のルール</h3>
                                <p className="text-sm leading-7 text-slate-300">
                                    メニュー個別ルールはプロフィール共通ルールより先に評価されます。priority が小さいほど先に適用されます。
                                </p>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="space-y-2 text-sm text-slate-300">
                                    <span className="text-xs font-semibold tracking-wide text-slate-400">表示状態</span>
                                    <select
                                        value={statusFilter}
                                        onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                                        className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white"
                                    >
                                        <option value="all">すべて</option>
                                        <option value="active">有効のみ</option>
                                        <option value="inactive">停止中のみ</option>
                                    </select>
                                </label>

                                <label className="space-y-2 text-sm text-slate-300">
                                    <span className="text-xs font-semibold tracking-wide text-slate-400">ルール種別</span>
                                    <select
                                        value={typeFilter}
                                        onChange={(event) => setTypeFilter(event.target.value)}
                                        className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white"
                                    >
                                        <option value="all">すべて</option>
                                        {RULE_TYPE_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                        </div>
                    </article>

                    {filteredRules.length > 0 ? (
                        filteredRules.map((rule) => (
                            <article
                                key={rule.id}
                                className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_14px_30px_rgba(2,6,23,0.12)]"
                            >
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="space-y-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeTone(rule.is_active)}`}>
                                                {rule.is_active ? '有効' : '停止中'}
                                            </span>
                                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">
                                                {rule.therapist_menu ? `メニュー: ${rule.therapist_menu.name}` : 'プロフィール共通'}
                                            </span>
                                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">
                                                {ruleTypeLabel(rule.rule_type)}
                                            </span>
                                        </div>

                                        <div className="space-y-2">
                                            <p className="text-lg font-semibold text-white">{formatConditionSummary(rule)}</p>
                                            <p className="text-sm leading-7 text-slate-300">
                                                調整: <span className="font-semibold text-white">{adjustmentLabel(rule)}</span>
                                                {' '} / priority {rule.priority}
                                            </p>
                                            <p className="text-sm leading-7 text-slate-400">
                                                価格下限: {formatCurrency(rule.min_price_amount)} / 価格上限: {formatCurrency(rule.max_price_amount)}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-3">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setDraft(createDraftFromRule(rule, profile?.menus ?? []));
                                                setError(null);
                                                setSuccessMessage(null);
                                            }}
                                            className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
                                        >
                                            編集
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                void handleDelete(rule.id);
                                            }}
                                            disabled={deletingRuleId === rule.id}
                                            className="inline-flex items-center rounded-full border border-rose-300/20 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-300/10 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {deletingRuleId === rule.id ? '削除中...' : '削除'}
                                        </button>
                                    </div>
                                </div>
                            </article>
                        ))
                    ) : (
                        <article className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] p-6 text-sm leading-7 text-slate-300">
                            条件に一致する料金ルールはまだありません。まずはプロフィール共通ルールから 1 件作ると、見積もり差分を試しやすいです。
                        </article>
                    )}
                </div>

                <article className="space-y-5 rounded-[24px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_14px_30px_rgba(2,6,23,0.12)] lg:sticky lg:top-6 lg:self-start">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">ルール編集</p>
                        <h3 className="text-xl font-semibold text-white">
                            {draft.id === null ? '料金ルールを追加' : `ルール #${draft.id} を編集`}
                        </h3>
                        <p className="text-sm leading-7 text-slate-300">
                            利用者プロフィール、時間帯、徒歩目安、需要レベルに応じた調整をここで設定します。
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <label className="block space-y-2">
                            <span className="text-sm font-semibold text-white">適用範囲</span>
                            <select
                                value={draft.scope}
                                onChange={(event) => updateDraft({ scope: event.target.value as RuleScope })}
                                className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white"
                            >
                                <option value="profile">プロフィール共通</option>
                                <option value="menu">メニュー個別</option>
                            </select>
                        </label>

                        {draft.scope === 'menu' ? (
                            <label className="block space-y-2">
                                <span className="text-sm font-semibold text-white">対象メニュー</span>
                                <select
                                    value={draft.therapist_menu_id ?? ''}
                                    onChange={(event) => updateDraft({ therapist_menu_id: event.target.value || null })}
                                    className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white"
                                >
                                    <option value="">メニューを選択</option>
                                    {(profile?.menus ?? []).map((menu) => (
                                        <option key={menu.public_id} value={menu.public_id}>
                                            {menu.name}{menu.is_active ? '' : ' (停止中)'}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        ) : null}

                        <label className="block space-y-2">
                            <span className="text-sm font-semibold text-white">ルール種別</span>
                            <select
                                value={draft.rule_type}
                                onChange={(event) => handleRuleTypeChange(event.target.value)}
                                className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white"
                            >
                                {RULE_TYPE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </label>

                        {draft.rule_type === 'user_profile_attribute' ? (
                            <>
                                <label className="block space-y-2">
                                    <span className="text-sm font-semibold text-white">対象属性</span>
                                    <select
                                        value={draft.field}
                                        onChange={(event) => handleFieldChange(event.target.value)}
                                        className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white"
                                    >
                                        {PROFILE_FIELD_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </label>

                                <label className="block space-y-2">
                                    <span className="text-sm font-semibold text-white">条件</span>
                                    <select
                                        value={draft.operator}
                                        onChange={(event) => handleOperatorChange(event.target.value)}
                                        className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white"
                                    >
                                        {profileOperatorOptions.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </label>

                                {isNumericProfileField(draft.field) ? (
                                    draft.operator === 'between' ? (
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <label className="space-y-2">
                                                <span className="text-sm font-semibold text-white">下限 (cm)</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={draft.range_start}
                                                    onChange={(event) => updateDraft({ range_start: event.target.value })}
                                                    className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white"
                                                />
                                            </label>
                                            <label className="space-y-2">
                                                <span className="text-sm font-semibold text-white">上限 (cm)</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={draft.range_end}
                                                    onChange={(event) => updateDraft({ range_end: event.target.value })}
                                                    className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white"
                                                />
                                            </label>
                                        </div>
                                    ) : (
                                        <label className="block space-y-2">
                                            <span className="text-sm font-semibold text-white">値 (cm)</span>
                                            <input
                                                type="number"
                                                min="0"
                                                value={draft.single_value}
                                                onChange={(event) => updateDraft({ single_value: event.target.value })}
                                                className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white"
                                            />
                                        </label>
                                    )
                                ) : isMultiValueOperator(draft.operator) ? (
                                    <label className="block space-y-2">
                                        <span className="text-sm font-semibold text-white">候補値</span>
                                        <select
                                            multiple
                                            size={Math.min(6, Math.max(3, profileFieldOptions.length))}
                                            value={draft.multi_values}
                                            onChange={handleMultiValueChange}
                                            className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white"
                                        >
                                            {profileFieldOptions.map((option) => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                        </select>
                                    </label>
                                ) : (
                                    <label className="block space-y-2">
                                        <span className="text-sm font-semibold text-white">値</span>
                                        <select
                                            value={draft.single_value}
                                            onChange={(event) => updateDraft({ single_value: event.target.value })}
                                            className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white"
                                        >
                                            {profileFieldOptions.map((option) => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                        </select>
                                    </label>
                                )}
                            </>
                        ) : null}

                        {draft.rule_type === 'time_band' ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-white">開始時刻</span>
                                    <select
                                        value={draft.start_hour}
                                        onChange={(event) => updateDraft({ start_hour: event.target.value })}
                                        className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white"
                                    >
                                        {Array.from({ length: 24 }, (_, index) => (
                                            <option key={index} value={String(index)}>
                                                {String(index).padStart(2, '0')}:00
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-white">終了時刻</span>
                                    <select
                                        value={draft.end_hour}
                                        onChange={(event) => updateDraft({ end_hour: event.target.value })}
                                        className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white"
                                    >
                                        {Array.from({ length: 24 }, (_, index) => (
                                            <option key={index} value={String(index)}>
                                                {String(index).padStart(2, '0')}:00
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                        ) : null}

                        {(draft.rule_type === 'walking_time_range' || draft.rule_type === 'demand_level') ? (
                            <>
                                <label className="block space-y-2">
                                    <span className="text-sm font-semibold text-white">条件</span>
                                    <select
                                        value={draft.operator}
                                        onChange={(event) => handleOperatorChange(event.target.value)}
                                        className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white"
                                    >
                                        {DISCRETE_OPERATOR_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </label>

                                {isMultiValueOperator(draft.operator) ? (
                                    <label className="block space-y-2">
                                        <span className="text-sm font-semibold text-white">候補値</span>
                                        <select
                                            multiple
                                            size={Math.min(5, Math.max(3, discreteOptions.length))}
                                            value={draft.multi_values}
                                            onChange={handleMultiValueChange}
                                            className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white"
                                        >
                                            {discreteOptions.map((option) => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                        </select>
                                    </label>
                                ) : (
                                    <label className="block space-y-2">
                                        <span className="text-sm font-semibold text-white">値</span>
                                        <select
                                            value={draft.single_value}
                                            onChange={(event) => updateDraft({ single_value: event.target.value })}
                                            className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white"
                                        >
                                            {discreteOptions.map((option) => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                        </select>
                                    </label>
                                )}
                            </>
                        ) : null}

                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-white">調整方法</span>
                                <select
                                    value={draft.adjustment_type}
                                    onChange={(event) => updateDraft({ adjustment_type: event.target.value })}
                                    className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white"
                                >
                                    {ADJUSTMENT_TYPE_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-white">
                                    調整量 {draft.adjustment_type === 'percentage' ? '(%)' : '(円)'}
                                </span>
                                <input
                                    type="number"
                                    value={draft.adjustment_amount}
                                    onChange={(event) => updateDraft({ adjustment_amount: event.target.value })}
                                    className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white"
                                />
                            </label>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-white">価格下限 (任意)</span>
                                <input
                                    type="number"
                                    min="0"
                                    value={draft.min_price_amount}
                                    onChange={(event) => updateDraft({ min_price_amount: event.target.value })}
                                    className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white"
                                />
                            </label>
                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-white">価格上限 (任意)</span>
                                <input
                                    type="number"
                                    min="0"
                                    value={draft.max_price_amount}
                                    onChange={(event) => updateDraft({ max_price_amount: event.target.value })}
                                    className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white"
                                />
                            </label>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-white">priority</span>
                                <input
                                    type="number"
                                    min="0"
                                    max="1000"
                                    value={draft.priority}
                                    onChange={(event) => updateDraft({ priority: event.target.value })}
                                    className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white"
                                />
                            </label>
                            <label className="flex items-center justify-between rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3">
                                <span className="text-sm font-semibold text-white">有効にする</span>
                                <input
                                    type="checkbox"
                                    checked={draft.is_active}
                                    onChange={(event) => updateDraft({ is_active: event.target.checked })}
                                    className="h-5 w-5 rounded border-white/10 bg-transparent text-rose-300 focus:ring-rose-300"
                                />
                            </label>
                        </div>

                        <div className="flex flex-wrap gap-3 pt-2">
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="inline-flex items-center rounded-full bg-rose-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isSaving ? '保存中...' : draft.id === null ? '料金ルールを追加' : '変更を保存'}
                            </button>
                            <button
                                type="button"
                                onClick={resetDraft}
                                className="inline-flex items-center rounded-full border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
                            >
                                編集をやめる
                            </button>
                        </div>
                    </form>

                    <div className="rounded-[20px] border border-white/10 bg-[#111923] p-4 text-sm leading-7 text-slate-300">
                        <p className="font-semibold text-white">メモ</p>
                        <ul className="mt-3 space-y-2">
                            <li>・メニュー個別ルールは、同じ priority ならプロフィール共通ルールより先に評価されます。</li>
                            <li>・価格下限 / 上限を入れると、調整後の小計をその範囲に丸めます。</li>
                            <li>・有効メニューが {activeMenus.length} 件あるので、まずは共通ルールから始めても大丈夫です。</li>
                        </ul>
                    </div>
                </article>
            </section>
        </div>
    );
}
