import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatDateTime } from '../lib/therapist';
import type {
    AdminPlatformFeeSettingRecord,
    ApiEnvelope,
} from '../lib/types';

type ActiveFilter = 'all' | '1' | '0';

function normalizeActiveFilter(value: string | null): ActiveFilter {
    if (value === '1' || value === '0') {
        return value;
    }

    return 'all';
}

function buildSelectedLink(searchParams: URLSearchParams, id: number): string {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('selected', String(id));
    const query = nextParams.toString();

    return query ? `/admin/platform-fee-settings?${query}` : '/admin/platform-fee-settings';
}

function defaultValueJson(): string {
    return JSON.stringify({
        rate_percent: 10,
        fixed_fee_amount: 0,
    }, null, 2);
}

function toIsoOrNull(value: string): string | null {
    if (!value.trim()) {
        return null;
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function AdminPlatformFeeSettingsPage() {
    const { token } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [settings, setSettings] = useState<AdminPlatformFeeSettingRecord[]>([]);
    const [pageError, setPageError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [settingKeyInput, setSettingKeyInput] = useState(searchParams.get('setting_key') ?? '');
    const [createSettingKey, setCreateSettingKey] = useState('therapist_platform_fee');
    const [valueJsonInput, setValueJsonInput] = useState(defaultValueJson());
    const [activeFromInput, setActiveFromInput] = useState('');
    const [activeUntilInput, setActiveUntilInput] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const selectedId = searchParams.get('selected');
    const activeFilter = normalizeActiveFilter(searchParams.get('is_active'));
    const settingKey = searchParams.get('setting_key')?.trim() ?? '';

    usePageTitle('プラットフォーム料設定');
    useToastOnMessage(successMessage, 'success');

    const selectedSetting = useMemo(
        () => settings.find((setting) => String(setting.id) === selectedId) ?? null,
        [settings, selectedId],
    );

    const summary = useMemo(() => {
        const now = Date.now();

        return {
            total: settings.length,
            active: settings.filter((setting) => setting.is_active).length,
            scheduled: settings.filter((setting) => setting.active_from && new Date(setting.active_from).getTime() > now).length,
            expired: settings.filter((setting) => setting.active_until && new Date(setting.active_until).getTime() < now).length,
            uniqueKeys: new Set(settings.map((setting) => setting.setting_key)).size,
        };
    }, [settings]);

    const loadSettings = useCallback(async (refresh = false) => {
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

        if (settingKey) {
            params.set('setting_key', settingKey);
        }

        if (activeFilter !== 'all') {
            params.set('is_active', activeFilter);
        }

        try {
            const payload = await apiRequest<ApiEnvelope<AdminPlatformFeeSettingRecord[]>>(`/admin/platform-fee-settings?${params.toString()}`, { token });
            setSettings(unwrapData(payload));
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : 'プラットフォーム料設定の取得に失敗しました。';

            setPageError(message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [activeFilter, settingKey, token]);

    useEffect(() => {
        void loadSettings();
    }, [loadSettings]);

    function updateFilters(next: Partial<Record<'setting_key' | 'is_active' | 'selected', string | null>>) {
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

    async function handleCreate(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token || !createSettingKey.trim()) {
            return;
        }

        setIsSubmitting(true);
        setActionError(null);
        setSuccessMessage(null);

        let parsedValue: Record<string, unknown>;

        try {
            parsedValue = JSON.parse(valueJsonInput) as Record<string, unknown>;
        } catch {
            setActionError('`value_json` は JSON 形式で入力してください。');
            setIsSubmitting(false);
            return;
        }

        try {
            const payload = await apiRequest<ApiEnvelope<AdminPlatformFeeSettingRecord>>('/admin/platform-fee-settings', {
                method: 'POST',
                token,
                body: {
                    setting_key: createSettingKey.trim(),
                    value_json: parsedValue,
                    active_from: toIsoOrNull(activeFromInput) ?? undefined,
                    active_until: toIsoOrNull(activeUntilInput) ?? undefined,
                },
            });

            const created = unwrapData(payload);
            setSuccessMessage('プラットフォーム料設定を追加しました。');
            setCreateSettingKey(created.setting_key);
            setActiveFromInput('');
            setActiveUntilInput('');
            setValueJsonInput(defaultValueJson());
            updateFilters({ selected: String(created.id) });
            await loadSettings(true);
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : 'プラットフォーム料設定の追加に失敗しました。';

            setActionError(message);
        } finally {
            setIsSubmitting(false);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="プラットフォーム料設定を読み込み中" message="現在値と将来適用予定を集約しています。" />;
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_16px_34px_rgba(2,6,23,0.14)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">PLATFORM FEE CONFIGURATION</p>
                        <h2 className="text-2xl font-semibold text-white sm:text-[2rem]">プラットフォーム料設定</h2>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            適用中の料金設定と将来の切り替え予定を一覧管理できます。
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            void loadSettings(true);
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
                    { label: '有効', value: summary.active, hint: '今すぐ適用中' },
                    { label: '予約済み', value: summary.scheduled, hint: 'active_from が未来' },
                    { label: '期限切れ', value: summary.expired, hint: 'active_until が過去' },
                    { label: '設定キー数', value: summary.uniqueKeys, hint: '重複管理の見通し' },
                ].map((item) => (
                    <article key={item.label} className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">{item.label}</p>
                        <p className="mt-3 text-3xl font-semibold text-white">{item.value}</p>
                        <p className="mt-2 text-sm text-slate-400">{item.hint}</p>
                    </article>
                ))}
            </section>

            <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">設定キー</span>
                        <input
                            value={settingKeyInput}
                            onChange={(event) => setSettingKeyInput(event.target.value)}
                            onBlur={() => updateFilters({ setting_key: settingKeyInput.trim() || null, selected: null })}
                            placeholder="booking_fee_v1"
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition placeholder:text-[#9aa3ad] focus:border-[#b5894d]"
                        />
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">有効状態</span>
                        <select
                            value={activeFilter}
                            onChange={(event) => updateFilters({ is_active: event.target.value, selected: null })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="all">すべて</option>
                            <option value="1">有効のみ</option>
                            <option value="0">無効のみ</option>
                        </select>
                    </label>
                </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="space-y-6">
                    <div className="rounded-[28px] bg-white p-5 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <div className="flex items-center justify-between gap-4 border-b border-[#ece3d4] pb-4">
                            <div>
                                <h3 className="text-lg font-semibold text-[#17202b]">設定一覧</h3>
                                <p className="mt-1 text-sm text-[#68707a]">同じキーでも期間違いで履歴を管理できます。</p>
                            </div>
                            <p className="text-sm font-semibold text-[#7d6852]">{settings.length}件</p>
                        </div>

                        <div className="mt-4 space-y-3">
                            {settings.length > 0 ? settings.map((setting) => {
                                const isSelected = String(setting.id) === selectedId;

                                return (
                                    <Link
                                        key={setting.id}
                                        to={buildSelectedLink(searchParams, setting.id)}
                                        className={`block rounded-[24px] border px-4 py-4 transition ${
                                            isSelected
                                                ? 'border-[#b5894d] bg-[#fff8ef] shadow-[0_14px_30px_rgba(181,137,77,0.16)]'
                                                : 'border-[#ece3d4] bg-[#fffcf6] hover:border-[#d8c2a0] hover:bg-[#fff8ef]'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-base font-semibold text-[#17202b]">{setting.setting_key}</p>
                                                <p className="mt-1 text-xs text-[#7d6852]">登録 {formatDateTime(setting.created_at)}</p>
                                            </div>
                                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${setting.is_active ? 'bg-[#e8f4ea] text-[#24553a]' : 'bg-[#f3efe7] text-[#55606d]'}`}>
                                                {setting.is_active ? '有効' : '無効'}
                                            </span>
                                        </div>

                                        <div className="mt-3 text-sm text-[#55606d]">
                                            <p>適用開始 <span className="font-medium text-[#17202b]">{formatDateTime(setting.active_from)}</span></p>
                                            <p className="mt-1">適用終了 <span className="font-medium text-[#17202b]">{formatDateTime(setting.active_until)}</span></p>
                                        </div>
                                    </Link>
                                );
                            }) : (
                                <div className="rounded-[24px] border border-dashed border-[#d9c9ae] bg-[#fffdf8] px-5 py-8 text-center text-sm text-[#7d6852]">
                                    条件に合う設定はありません。
                                </div>
                            )}
                        </div>
                    </div>

                    <form onSubmit={handleCreate} className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <div className="border-b border-[#ece3d4] pb-4">
                            <h3 className="text-lg font-semibold text-[#17202b]">新しい料金設定を追加</h3>
                            <p className="mt-1 text-sm text-[#68707a]">値は JSON で保存され、active window で切り替わります。</p>
                        </div>

                        {actionError ? (
                            <div className="mt-4 rounded-[22px] border border-[#f1d4b5] bg-[#fff4e8] px-4 py-3 text-sm text-[#9a4b35]">
                                {actionError}
                            </div>
                        ) : null}


                        <div className="mt-4 grid gap-4">
                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">設定キー</span>
                                <input
                                    value={createSettingKey}
                                    onChange={(event) => setCreateSettingKey(event.target.value)}
                                    className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                />
                            </label>

                            <div className="grid gap-4 md:grid-cols-2">
                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-[#17202b]">適用開始</span>
                                    <input
                                        type="datetime-local"
                                        value={activeFromInput}
                                        onChange={(event) => setActiveFromInput(event.target.value)}
                                        className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                    />
                                </label>

                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-[#17202b]">適用終了</span>
                                    <input
                                        type="datetime-local"
                                        value={activeUntilInput}
                                        onChange={(event) => setActiveUntilInput(event.target.value)}
                                        className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                    />
                                </label>
                            </div>

                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">value_json</span>
                                <textarea
                                    value={valueJsonInput}
                                    onChange={(event) => setValueJsonInput(event.target.value)}
                                    rows={10}
                                    className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 font-mono text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                />
                            </label>
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting || !createSettingKey.trim()}
                            className="mt-5 inline-flex rounded-full bg-[#17202b] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#223243] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isSubmitting ? '保存中...' : '設定を追加'}
                        </button>
                    </form>
                </div>

                <div className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                    {selectedSetting ? (
                        <div className="space-y-6">
                            <div className="border-b border-[#ece3d4] pb-5">
                                <p className="text-xs font-semibold tracking-wide text-[#b5894d]">FEE SETTING DETAIL</p>
                                <h3 className="mt-2 text-2xl font-semibold text-[#17202b]">{selectedSetting.setting_key}</h3>
                                <p className="mt-2 text-sm text-[#68707a]">作成 {formatDateTime(selectedSetting.created_at)}</p>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <article className="rounded-[22px] border border-[#ece3d4] bg-[#fffcf6] p-4 text-sm text-[#55606d]">
                                    <p className="text-xs font-semibold tracking-wide text-[#b5894d]">適用期間</p>
                                    <p className="mt-2 font-semibold text-[#17202b]">{selectedSetting.is_active ? '現在有効' : '現在無効'}</p>
                                    <p className="mt-1">開始 {formatDateTime(selectedSetting.active_from)}</p>
                                    <p className="mt-1">終了 {formatDateTime(selectedSetting.active_until)}</p>
                                </article>

                                <article className="rounded-[22px] border border-[#ece3d4] bg-[#fffcf6] p-4 text-sm text-[#55606d]">
                                    <p className="text-xs font-semibold tracking-wide text-[#b5894d]">作成者</p>
                                    <p className="mt-2 font-semibold text-[#17202b]">{selectedSetting.created_by_account?.display_name ?? selectedSetting.created_by_account?.public_id ?? '未設定'}</p>
                                    <p className="mt-1">{selectedSetting.created_by_account?.email ?? 'メール未設定'}</p>
                                    <p className="mt-1">更新 {formatDateTime(selectedSetting.updated_at)}</p>
                                </article>
                            </div>

                            <section className="rounded-[24px] border border-[#ece3d4] bg-[#fffcf6] p-5">
                                <p className="text-sm font-semibold text-[#17202b]">設定値</p>
                                <pre className="mt-3 overflow-x-auto rounded-[18px] bg-[#17202b] p-4 text-xs leading-6 text-slate-100">
                                    {JSON.stringify(selectedSetting.value_json, null, 2)}
                                </pre>
                            </section>
                        </div>
                    ) : (
                        <div className="flex min-h-[420px] items-center justify-center rounded-[24px] border border-dashed border-[#d9c9ae] bg-[#fffdf8] px-6 text-center text-sm leading-7 text-[#7d6852]">
                            左の一覧から設定を選ぶと、適用期間と JSON の中身を確認できます。
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
