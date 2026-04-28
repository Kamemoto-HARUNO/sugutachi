import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import {
    formatDateTime,
    formatIdentityVerificationStatus,
    formatProfileStatus,
} from '../lib/therapist';
import type {
    AdminAccountRecord,
    ApiEnvelope,
} from '../lib/types';

type AccountStatusFilter = 'all' | 'active' | 'suspended';
type AccountRoleFilter = 'all' | 'user' | 'therapist' | 'admin';
type AccountSortField = 'created_at' | 'display_name' | 'email';
type AccountSortDirection = 'asc' | 'desc';

function normalizeStatusFilter(value: string | null): AccountStatusFilter {
    if (value === 'active' || value === 'suspended') {
        return value;
    }

    return 'all';
}

function normalizeRoleFilter(value: string | null): AccountRoleFilter {
    if (value === 'user' || value === 'therapist' || value === 'admin') {
        return value;
    }

    return 'all';
}

function normalizeSortField(value: string | null): AccountSortField {
    if (value === 'display_name' || value === 'email') {
        return value;
    }

    return 'created_at';
}

function normalizeSortDirection(value: string | null): AccountSortDirection {
    return value === 'asc' ? 'asc' : 'desc';
}

function accountStatusLabel(status: string): string {
    return status === 'suspended' ? '停止中' : '稼働中';
}

function accountStatusTone(status: string): string {
    return status === 'suspended'
        ? 'bg-[#f7e7e3] text-[#8c4738]'
        : 'bg-[#e9f4ea] text-[#24553a]';
}

function roleLabel(role: string): string {
    switch (role) {
        case 'user':
            return '利用者';
        case 'therapist':
            return 'タチキャスト';
        case 'admin':
            return '運営';
        default:
            return role;
    }
}

function profilePhotoReviewLabel(status: string | null | undefined): string {
    switch (status) {
        case 'approved':
            return '承認済み';
        case 'pending':
            return '審査待ち';
        case 'rejected':
            return '差し戻し';
        default:
            return '未提出';
    }
}

function displayName(account: AdminAccountRecord): string {
    return account.display_name?.trim() || account.email;
}

export function AdminAccountsPage() {
    const { token } = useAuth();
    const { publicId } = useParams<{ publicId: string }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const [accounts, setAccounts] = useState<AdminAccountRecord[]>([]);
    const [selectedAccount, setSelectedAccount] = useState<AdminAccountRecord | null>(null);
    const [queryInput, setQueryInput] = useState(searchParams.get('q') ?? '');
    const [pageError, setPageError] = useState<string | null>(null);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [suspensionReason, setSuspensionReason] = useState('policy_violation');
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const statusFilter = normalizeStatusFilter(searchParams.get('status'));
    const roleFilter = normalizeRoleFilter(searchParams.get('role'));
    const sortField = normalizeSortField(searchParams.get('sort'));
    const direction = normalizeSortDirection(searchParams.get('direction'));
    const query = searchParams.get('q')?.trim() ?? '';

    usePageTitle('アカウント管理');
    useToastOnMessage(successMessage, 'success');

    const selectedListAccount = useMemo(
        () => accounts.find((account) => account.public_id === publicId) ?? null,
        [accounts, publicId],
    );

    const summary = useMemo(() => ({
        total: accounts.length,
        active: accounts.filter((account) => account.status === 'active').length,
        suspended: accounts.filter((account) => account.status === 'suspended').length,
        therapists: accounts.filter((account) => account.roles?.some((role) => role.role === 'therapist' && role.status === 'active')).length,
    }), [accounts]);

    const loadAccounts = useCallback(async (refresh = false) => {
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

        if (roleFilter !== 'all') {
            params.set('role', roleFilter);
        }

        if (query) {
            params.set('q', query);
        }

        params.set('sort', sortField);
        params.set('direction', direction);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminAccountRecord[]>>(`/admin/accounts?${params.toString()}`, { token });
            setAccounts(unwrapData(payload));
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : 'アカウント一覧の取得に失敗しました。';

            setPageError(message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [direction, query, roleFilter, sortField, statusFilter, token]);

    const loadDetail = useCallback(async () => {
        if (!token || !publicId) {
            setSelectedAccount(null);
            setDetailError(null);
            return;
        }

        setIsLoadingDetail(true);
        setDetailError(null);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminAccountRecord>>(`/admin/accounts/${publicId}`, { token });
            setSelectedAccount(unwrapData(payload));
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : 'アカウント詳細の取得に失敗しました。';

            setDetailError(message);
            setSelectedAccount(null);
        } finally {
            setIsLoadingDetail(false);
        }
    }, [publicId, token]);

    useEffect(() => {
        void loadAccounts();
    }, [loadAccounts]);

    useEffect(() => {
        void loadDetail();
    }, [loadDetail]);

    async function handleSuspend(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token || !selectedAccount) {
            return;
        }

        setIsSubmitting(true);
        setActionError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminAccountRecord>>(`/admin/accounts/${selectedAccount.public_id}/suspend`, {
                method: 'POST',
                token,
                body: { reason_code: suspensionReason },
            });

            const updated = unwrapData(payload);
            setSelectedAccount(updated);
            setAccounts((current) => current.map((account) => account.public_id === updated.public_id ? updated : account));
            setSuccessMessage('アカウントを停止しました。');
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : 'アカウント停止に失敗しました。';

            setActionError(message);
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleRestore() {
        if (!token || !selectedAccount) {
            return;
        }

        setIsSubmitting(true);
        setActionError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminAccountRecord>>(`/admin/accounts/${selectedAccount.public_id}/restore`, {
                method: 'POST',
                token,
            });

            const updated = unwrapData(payload);
            setSelectedAccount(updated);
            setAccounts((current) => current.map((account) => account.public_id === updated.public_id ? updated : account));
            setSuccessMessage('アカウントを復旧しました。');
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : 'アカウント復旧に失敗しました。';

            setActionError(message);
        } finally {
            setIsSubmitting(false);
        }
    }

    function updateFilters(next: Partial<Record<'status' | 'role' | 'sort' | 'direction' | 'q', string | null>>) {
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

    if (isLoading) {
        return <LoadingScreen title="アカウント一覧を読み込み中" message="停止・復旧判断に必要なアカウント情報を集計しています。" />;
    }

    const detailAccount = selectedAccount ?? selectedListAccount;

    return (
        <div className="space-y-6">
            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_16px_34px_rgba(2,6,23,0.14)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">ACCOUNT MODERATION</p>
                        <h2 className="text-2xl font-semibold text-white sm:text-[2rem]">アカウント管理</h2>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            利用者・タチキャスト・運営アカウントを横断で確認し、停止や復旧、本人確認状況の把握まで行えます。
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            void loadAccounts(true);
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

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_16px_34px_rgba(2,6,23,0.12)]">
                    <p className="text-xs font-semibold tracking-wide text-[#d2b179]">TOTAL</p>
                    <p className="mt-3 text-3xl font-semibold text-white">{summary.total}</p>
                    <p className="mt-2 text-sm text-slate-300">現在の一覧件数</p>
                </article>
                <article className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_16px_34px_rgba(2,6,23,0.12)]">
                    <p className="text-xs font-semibold tracking-wide text-[#d2b179]">ACTIVE</p>
                    <p className="mt-3 text-3xl font-semibold text-white">{summary.active}</p>
                    <p className="mt-2 text-sm text-slate-300">稼働中</p>
                </article>
                <article className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_16px_34px_rgba(2,6,23,0.12)]">
                    <p className="text-xs font-semibold tracking-wide text-[#d2b179]">SUSPENDED</p>
                    <p className="mt-3 text-3xl font-semibold text-white">{summary.suspended}</p>
                    <p className="mt-2 text-sm text-slate-300">停止中</p>
                </article>
                <article className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_16px_34px_rgba(2,6,23,0.12)]">
                    <p className="text-xs font-semibold tracking-wide text-[#d2b179]">THERAPISTS</p>
                    <p className="mt-3 text-3xl font-semibold text-white">{summary.therapists}</p>
                    <p className="mt-2 text-sm text-slate-300">タチキャストロールを持つ件数</p>
                </article>
            </section>

            <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">FILTERS</p>
                        <h3 className="text-2xl font-semibold text-[#17202b]">絞り込み</h3>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5 xl:min-w-[920px]">
                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-[#17202b]">状態</span>
                            <select
                                value={statusFilter}
                                onChange={(event) => updateFilters({ status: event.target.value })}
                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                            >
                                <option value="all">すべて</option>
                                <option value="active">稼働中</option>
                                <option value="suspended">停止中</option>
                            </select>
                        </label>

                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-[#17202b]">ロール</span>
                            <select
                                value={roleFilter}
                                onChange={(event) => updateFilters({ role: event.target.value })}
                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                            >
                                <option value="all">すべて</option>
                                <option value="user">利用者</option>
                                <option value="therapist">タチキャスト</option>
                                <option value="admin">運営</option>
                            </select>
                        </label>

                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-[#17202b]">並び替え</span>
                            <select
                                value={sortField}
                                onChange={(event) => updateFilters({ sort: event.target.value })}
                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                            >
                                <option value="created_at">登録日時</option>
                                <option value="display_name">表示名</option>
                                <option value="email">メール</option>
                            </select>
                        </label>

                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-[#17202b]">順序</span>
                            <select
                                value={direction}
                                onChange={(event) => updateFilters({ direction: event.target.value })}
                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                            >
                                <option value="desc">新しい順</option>
                                <option value="asc">古い順</option>
                            </select>
                        </label>

                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                updateFilters({ q: queryInput.trim() || null });
                            }}
                            className="space-y-2"
                        >
                            <span className="block text-sm font-semibold text-[#17202b]">検索</span>
                            <div className="flex gap-2">
                                <input
                                    value={queryInput}
                                    onChange={(event) => setQueryInput(event.target.value)}
                                    placeholder="メール、表示名、public_id"
                                    className="min-w-0 flex-1 rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                />
                                <button
                                    type="submit"
                                    className="inline-flex items-center rounded-[18px] bg-[#17202b] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#243140]"
                                >
                                    絞る
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(360px,0.88fr)]">
                <section className="space-y-4">
                    {accounts.length > 0 ? accounts.map((account) => {
                        const search = searchParams.toString();
                        const detailPath = `/admin/accounts/${account.public_id}${search ? `?${search}` : ''}`;
                        const isSelected = publicId === account.public_id;

                        return (
                            <Link
                                key={account.public_id}
                                to={detailPath}
                                className={[
                                    'block rounded-[24px] border p-5 shadow-[0_16px_30px_rgba(23,32,43,0.08)] transition',
                                    isSelected
                                        ? 'border-[#d2b179] bg-[#fff8ee]'
                                        : 'border-[#efe5d7] bg-white hover:bg-[#fffdf8]',
                                ].join(' ')}
                            >
                                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="text-lg font-semibold text-[#17202b]">{displayName(account)}</h3>
                                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${accountStatusTone(account.status)}`}>
                                                {accountStatusLabel(account.status)}
                                            </span>
                                        </div>
                                        <p className="text-sm text-[#68707a]">{account.email}</p>
                                        <p className="text-xs text-[#7d6852]">{account.public_id}</p>
                                    </div>

                                    <div className="flex flex-wrap gap-2 md:max-w-[45%] md:justify-end">
                                        {account.roles?.map((role) => (
                                            <span
                                                key={`${account.public_id}-${role.role}`}
                                                className="rounded-full bg-[#f5efe4] px-3 py-1 text-xs font-semibold text-[#48505a]"
                                            >
                                                {roleLabel(role.role)}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className="mt-4 grid gap-3 md:grid-cols-3">
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">本人確認</p>
                                        <p className="mt-1 text-sm font-semibold text-[#17202b]">
                                            {formatIdentityVerificationStatus(account.latest_identity_verification?.status)}
                                        </p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">利用者プロフィール</p>
                                        <p className="mt-1 text-sm font-semibold text-[#17202b]">
                                            {formatProfileStatus(account.user_profile?.profile_status)}
                                        </p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">タチキャスト</p>
                                        <p className="mt-1 text-sm font-semibold text-[#17202b]">
                                            {account.therapist_profile
                                                ? formatProfileStatus(account.therapist_profile.profile_status)
                                                : '未作成'}
                                        </p>
                                    </div>
                                </div>
                            </Link>
                        );
                    }) : (
                        <section className="rounded-[28px] bg-white px-6 py-10 text-center shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                            <p className="text-sm leading-7 text-[#68707a]">条件に合うアカウントはありません。</p>
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

                    {isLoadingDetail && publicId ? (
                        <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                            <LoadingScreen title="アカウント詳細を読み込み中" message="停止・復旧判断に必要な詳細を取得しています。" />
                        </section>
                    ) : detailAccount ? (
                        <section className="space-y-5">
                            <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">ACCOUNT DETAIL</p>
                                        <h3 className="mt-2 text-2xl font-semibold text-[#17202b]">{displayName(detailAccount)}</h3>
                                        <p className="mt-2 text-sm text-[#68707a]">{detailAccount.email}</p>
                                        <p className="mt-1 text-xs text-[#7d6852]">{detailAccount.public_id}</p>
                                    </div>
                                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${accountStatusTone(detailAccount.status)}`}>
                                        {accountStatusLabel(detailAccount.status)}
                                    </span>
                                </div>

                                <div className="mt-5 space-y-3 text-sm text-[#48505a]">
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">電話番号</p>
                                        <p className="mt-1 font-semibold text-[#17202b]">{detailAccount.phone_e164 ?? '未設定'}</p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">最終利用モード</p>
                                        <p className="mt-1 font-semibold text-[#17202b]">{detailAccount.last_active_role ? roleLabel(detailAccount.last_active_role) : '未設定'}</p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">登録日時</p>
                                        <p className="mt-1 font-semibold text-[#17202b]">{formatDateTime(detailAccount.created_at)}</p>
                                    </div>
                                </div>

                                <div className="mt-5 flex flex-wrap gap-2">
                                    {detailAccount.roles?.map((role) => (
                                        <span
                                            key={`${detailAccount.public_id}-${role.role}`}
                                            className="rounded-full bg-[#f5efe4] px-3 py-1 text-xs font-semibold text-[#48505a]"
                                        >
                                            {roleLabel(role.role)}
                                        </span>
                                    ))}
                                </div>
                            </article>

                            <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">READINESS</p>
                                <div className="mt-4 grid gap-3">
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">本人確認</p>
                                        <p className="mt-1 font-semibold text-[#17202b]">
                                            {formatIdentityVerificationStatus(detailAccount.latest_identity_verification?.status)}
                                        </p>
                                        <p className="mt-1 text-xs text-[#68707a]">
                                            年齢確認 {detailAccount.latest_identity_verification?.is_age_verified ? '済み' : '未確認'}
                                        </p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">利用者プロフィール</p>
                                        <p className="mt-1 font-semibold text-[#17202b]">
                                            {formatProfileStatus(detailAccount.user_profile?.profile_status)}
                                        </p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">タチキャストプロフィール</p>
                                        <p className="mt-1 font-semibold text-[#17202b]">
                                            {detailAccount.therapist_profile
                                                ? formatProfileStatus(detailAccount.therapist_profile.profile_status)
                                                : '未作成'}
                                        </p>
                                        {detailAccount.therapist_profile ? (
                                            <p className="mt-1 text-xs text-[#68707a]">
                                                写真審査 {profilePhotoReviewLabel(detailAccount.therapist_profile.photo_review_status)}
                                                {' / '}
                                                {detailAccount.therapist_profile.is_online ? 'オンライン' : 'オフライン'}
                                            </p>
                                        ) : null}
                                    </div>
                                </div>
                            </article>

                            <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">TRAVEL REQUEST SAFETY</p>
                                <div className="mt-4 space-y-3 text-sm text-[#48505a]">
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">警告回数</p>
                                        <p className="mt-1 font-semibold text-[#17202b]">{detailAccount.travel_request_warning_count}回</p>
                                        <p className="mt-1 text-xs text-[#68707a]">
                                            最終警告 {formatDateTime(detailAccount.travel_request_last_warned_at)}
                                        </p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">送信制限</p>
                                        <p className="mt-1 font-semibold text-[#17202b]">
                                            {detailAccount.travel_request_restricted_until
                                                ? `制限中 (${formatDateTime(detailAccount.travel_request_restricted_until)} まで)`
                                                : '制限なし'}
                                        </p>
                                        <p className="mt-1 text-xs text-[#68707a]">
                                            {detailAccount.travel_request_restriction_reason ?? detailAccount.travel_request_last_warning_reason ?? '理由未設定'}
                                        </p>
                                    </div>
                                </div>
                            </article>

                            <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">MODERATION ACTION</p>

                                {detailAccount.status === 'active' ? (
                                    <form onSubmit={(event) => void handleSuspend(event)} className="mt-4 space-y-4">
                                        <label className="block space-y-2">
                                            <span className="text-sm font-semibold text-[#17202b]">停止理由コード</span>
                                            <input
                                                value={suspensionReason}
                                                onChange={(event) => setSuspensionReason(event.target.value)}
                                                placeholder="policy_violation"
                                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                            />
                                        </label>

                                        <button
                                            type="submit"
                                            disabled={isSubmitting || !suspensionReason.trim()}
                                            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140] disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {isSubmitting ? '停止しています...' : 'このアカウントを停止'}
                                        </button>
                                    </form>
                                ) : (
                                    <div className="mt-4 space-y-4">
                                        <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3 text-sm text-[#48505a]">
                                            <p className="font-semibold text-[#17202b]">停止理由</p>
                                            <p className="mt-1">{detailAccount.suspension_reason ?? '未設定'}</p>
                                            <p className="mt-1 text-xs text-[#68707a]">停止日時 {formatDateTime(detailAccount.suspended_at)}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                void handleRestore();
                                            }}
                                            disabled={isSubmitting}
                                            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140] disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {isSubmitting ? '復旧しています...' : 'このアカウントを復旧'}
                                        </button>
                                    </div>
                                )}
                            </article>
                        </section>
                    ) : (
                        <section className="rounded-[28px] bg-white px-6 py-10 text-center shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                            <p className="text-sm leading-7 text-[#68707a]">
                                一覧からアカウントを選ぶと、ここに詳細と停止・復旧導線が表示されます。
                            </p>
                        </section>
                    )}
                </aside>
            </div>
        </div>
    );
}
