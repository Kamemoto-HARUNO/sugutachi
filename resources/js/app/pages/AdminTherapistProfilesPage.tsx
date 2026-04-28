import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import {
    formatDateTime,
    formatIdentityVerificationStatus,
    formatProfileStatus,
    formatRejectionReason,
    formatStripeStatus,
} from '../lib/therapist';
import type {
    AdminTherapistProfileRecord,
    ApiEnvelope,
} from '../lib/types';

type TherapistStatusFilter = 'all' | 'draft' | 'pending' | 'approved' | 'rejected' | 'suspended';
type PhotoStatusFilter = 'all' | 'pending' | 'approved' | 'rejected';
type IdentityStatusFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'none';
type StripeStatusFilter = 'all' | 'pending' | 'requirements_due' | 'active' | 'restricted' | 'none';
type BooleanFilter = 'all' | '1' | '0';
type SortField = 'created_at' | 'approved_at' | 'rating_average' | 'review_count';
type SortDirection = 'asc' | 'desc';
type ModerationAction = 'approve' | 'reject' | 'suspend' | 'restore';

function normalizeStatusFilter(value: string | null): TherapistStatusFilter {
    if (value === 'draft' || value === 'pending' || value === 'approved' || value === 'rejected' || value === 'suspended') {
        return value;
    }

    return 'all';
}

function normalizePhotoStatusFilter(value: string | null): PhotoStatusFilter {
    if (value === 'pending' || value === 'approved' || value === 'rejected') {
        return value;
    }

    return 'all';
}

function normalizeIdentityStatusFilter(value: string | null): IdentityStatusFilter {
    if (value === 'pending' || value === 'approved' || value === 'rejected' || value === 'none') {
        return value;
    }

    return 'all';
}

function normalizeStripeStatusFilter(value: string | null): StripeStatusFilter {
    if (value === 'pending' || value === 'requirements_due' || value === 'active' || value === 'restricted' || value === 'none') {
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
    if (value === 'approved_at' || value === 'rating_average' || value === 'review_count') {
        return value;
    }

    return 'created_at';
}

function normalizeSortDirection(value: string | null): SortDirection {
    return value === 'asc' ? 'asc' : 'desc';
}

function displayTherapistName(profile: AdminTherapistProfileRecord): string {
    return profile.public_name?.trim()
        || profile.account?.display_name?.trim()
        || profile.account?.email
        || profile.public_id;
}

function trainingStatusLabel(status: string | null | undefined): string {
    switch (status) {
        case 'completed':
            return '完了';
        case 'pending':
            return '準備中';
        default:
            return status ?? '未設定';
    }
}

function badgeTone(status: string): string {
    switch (status) {
        case 'approved':
        case 'active':
            return 'bg-[#e8f4ea] text-[#24553a]';
        case 'pending':
        case 'requirements_due':
            return 'bg-[#fff3e3] text-[#8f5c22]';
        case 'rejected':
        case 'restricted':
        case 'suspended':
            return 'bg-[#f8e8e5] text-[#8f4337]';
        default:
            return 'bg-[#f3efe7] text-[#55606d]';
    }
}

function photoUsageLabel(value: string): string {
    return value.replaceAll('_', ' ');
}

export function AdminTherapistProfilesPage() {
    const { token } = useAuth();
    const { publicId } = useParams<{ publicId: string }>();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const [profiles, setProfiles] = useState<AdminTherapistProfileRecord[]>([]);
    const [selectedProfile, setSelectedProfile] = useState<AdminTherapistProfileRecord | null>(null);
    const [pageError, setPageError] = useState<string | null>(null);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [moderationReason, setModerationReason] = useState('profile_policy_review');
    const [queryInput, setQueryInput] = useState(searchParams.get('q') ?? '');
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const statusFilter = normalizeStatusFilter(searchParams.get('status'));
    const photoStatusFilter = normalizePhotoStatusFilter(searchParams.get('photo_review_status'));
    const identityStatusFilter = normalizeIdentityStatusFilter(searchParams.get('latest_identity_verification_status'));
    const stripeStatusFilter = normalizeStripeStatusFilter(searchParams.get('stripe_connected_account_status'));
    const onlineFilter = normalizeBooleanFilter(searchParams.get('is_online'));
    const hasMenuFilter = normalizeBooleanFilter(searchParams.get('has_active_menu'));
    const hasLocationFilter = normalizeBooleanFilter(searchParams.get('has_searchable_location'));
    const sortField = normalizeSortField(searchParams.get('sort'));
    const direction = normalizeSortDirection(searchParams.get('direction'));
    const query = searchParams.get('q')?.trim() ?? '';

    usePageTitle('タチキャスト審査');
    useToastOnMessage(successMessage, 'success');

    const selectedListProfile = useMemo(
        () => profiles.find((profile) => profile.public_id === publicId) ?? null,
        [profiles, publicId],
    );

    const summary = useMemo(() => ({
        total: profiles.length,
        pending: profiles.filter((profile) => profile.profile_status === 'pending').length,
        approved: profiles.filter((profile) => profile.profile_status === 'approved').length,
        suspended: profiles.filter((profile) => profile.profile_status === 'suspended').length,
        online: profiles.filter((profile) => profile.is_online).length,
    }), [profiles]);

    const loadProfiles = useCallback(async (refresh = false) => {
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

        if (photoStatusFilter !== 'all') {
            params.set('photo_review_status', photoStatusFilter);
        }

        if (identityStatusFilter !== 'all') {
            params.set('latest_identity_verification_status', identityStatusFilter);
        }

        if (stripeStatusFilter !== 'all') {
            params.set('stripe_connected_account_status', stripeStatusFilter);
        }

        if (onlineFilter !== 'all') {
            params.set('is_online', onlineFilter);
        }

        if (hasMenuFilter !== 'all') {
            params.set('has_active_menu', hasMenuFilter);
        }

        if (hasLocationFilter !== 'all') {
            params.set('has_searchable_location', hasLocationFilter);
        }

        if (query) {
            params.set('q', query);
        }

        params.set('sort', sortField);
        params.set('direction', direction);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminTherapistProfileRecord[]>>(`/admin/therapist-profiles?${params.toString()}`, { token });
            setProfiles(unwrapData(payload));
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : 'タチキャスト一覧の取得に失敗しました。';

            setPageError(message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [direction, hasLocationFilter, hasMenuFilter, identityStatusFilter, onlineFilter, photoStatusFilter, query, sortField, statusFilter, stripeStatusFilter, token]);

    const loadDetail = useCallback(async () => {
        if (!token || !publicId) {
            setSelectedProfile(null);
            setDetailError(null);
            return;
        }

        setIsLoadingDetail(true);
        setDetailError(null);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminTherapistProfileRecord>>(`/admin/therapist-profiles/${publicId}`, { token });
            setSelectedProfile(unwrapData(payload));
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : 'タチキャスト詳細の取得に失敗しました。';

            setDetailError(message);
            setSelectedProfile(null);
        } finally {
            setIsLoadingDetail(false);
        }
    }, [publicId, token]);

    useEffect(() => {
        void loadProfiles();
    }, [loadProfiles]);

    useEffect(() => {
        void loadDetail();
    }, [loadDetail]);

    function updateFilters(
        next: Partial<Record<'status' | 'photo_review_status' | 'latest_identity_verification_status' | 'stripe_connected_account_status' | 'is_online' | 'has_active_menu' | 'has_searchable_location' | 'sort' | 'direction' | 'q', string | null>>,
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

    async function handleModeration(action: ModerationAction) {
        if (!token || !selectedProfile) {
            return;
        }

        if ((action === 'reject' || action === 'suspend') && !moderationReason.trim()) {
            setActionError('理由コードを入力してください。');
            return;
        }

        setIsSubmitting(true);
        setActionError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminTherapistProfileRecord>>(`/admin/therapist-profiles/${selectedProfile.public_id}/${action}`, {
                method: 'POST',
                token,
                body: action === 'reject' || action === 'suspend'
                    ? { rejected_reason_code: moderationReason.trim() }
                    : undefined,
            });

            const updated = unwrapData(payload);
            setSelectedProfile(updated);
            setProfiles((current) => current.map((profile) => profile.public_id === updated.public_id ? updated : profile));
            setSuccessMessage(
                action === 'approve'
                    ? 'タチキャストプロフィールを承認しました。'
                    : action === 'reject'
                        ? 'タチキャストプロフィールを差し戻しました。'
                        : action === 'suspend'
                            ? 'タチキャストプロフィールを停止しました。'
                            : 'タチキャストプロフィールを下書きへ戻しました。',
            );
            void loadProfiles(true);
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : 'プロフィール審査操作に失敗しました。';

            setActionError(message);
        } finally {
            setIsSubmitting(false);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="タチキャスト審査一覧を読み込み中" message="本人確認、写真審査、受取設定をまとめています。" />;
    }

    const detailProfile = selectedProfile ?? selectedListProfile;

    return (
        <div className="space-y-6">
            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_16px_34px_rgba(2,6,23,0.14)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">THERAPIST REVIEW</p>
                        <h2 className="text-2xl font-semibold text-white sm:text-[2rem]">タチキャストプロフィール審査</h2>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            プロフィール、写真、本人確認、受取設定まで横断して確認し、承認や停止の判断を進められます。
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            void loadProfiles(true);
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
                    { label: '審査待ち', value: summary.pending, hint: '優先確認' },
                    { label: '承認済み', value: summary.approved, hint: '公開候補' },
                    { label: '停止中', value: summary.suspended, hint: '復旧判断対象' },
                    { label: 'オンライン', value: summary.online, hint: '現在稼働中' },
                ].map((item) => (
                    <article key={item.label} className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">{item.label}</p>
                        <p className="mt-3 text-3xl font-semibold text-white">{item.value}</p>
                        <p className="mt-2 text-sm text-slate-400">{item.hint}</p>
                    </article>
                ))}
            </section>

            <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                <div className="flex flex-col gap-4">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">FILTERS</p>
                        <h3 className="text-2xl font-semibold text-[#17202b]">絞り込み</h3>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-[#17202b]">プロフィール状態</span>
                            <select
                                value={statusFilter}
                                onChange={(event) => updateFilters({ status: event.target.value })}
                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                            >
                                <option value="all">すべて</option>
                                <option value="pending">審査待ち</option>
                                <option value="approved">承認済み</option>
                                <option value="suspended">停止中</option>
                                <option value="rejected">差し戻し</option>
                                <option value="draft">下書き</option>
                            </select>
                        </label>

                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-[#17202b]">写真審査</span>
                            <select
                                value={photoStatusFilter}
                                onChange={(event) => updateFilters({ photo_review_status: event.target.value })}
                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                            >
                                <option value="all">すべて</option>
                                <option value="pending">審査待ち</option>
                                <option value="approved">承認済み</option>
                                <option value="rejected">差し戻し</option>
                            </select>
                        </label>

                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-[#17202b]">本人確認</span>
                            <select
                                value={identityStatusFilter}
                                onChange={(event) => updateFilters({ latest_identity_verification_status: event.target.value })}
                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                            >
                                <option value="all">すべて</option>
                                <option value="pending">審査待ち</option>
                                <option value="approved">承認済み</option>
                                <option value="rejected">差し戻し</option>
                                <option value="none">未提出</option>
                            </select>
                        </label>

                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-[#17202b]">受取設定</span>
                            <select
                                value={stripeStatusFilter}
                                onChange={(event) => updateFilters({ stripe_connected_account_status: event.target.value })}
                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                            >
                                <option value="all">すべて</option>
                                <option value="pending">準備中</option>
                                <option value="requirements_due">追加情報が必要</option>
                                <option value="active">利用可能</option>
                                <option value="restricted">制限あり</option>
                                <option value="none">未連携</option>
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
                                    placeholder="公開名 / メール / public_id"
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

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-[#17202b]">オンライン</span>
                            <select
                                value={onlineFilter}
                                onChange={(event) => updateFilters({ is_online: event.target.value })}
                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                            >
                                <option value="all">すべて</option>
                                <option value="1">オンラインのみ</option>
                                <option value="0">オフラインのみ</option>
                            </select>
                        </label>

                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-[#17202b]">有効メニュー</span>
                            <select
                                value={hasMenuFilter}
                                onChange={(event) => updateFilters({ has_active_menu: event.target.value })}
                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                            >
                                <option value="all">すべて</option>
                                <option value="1">あり</option>
                                <option value="0">なし</option>
                            </select>
                        </label>

                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-[#17202b]">検索可能位置</span>
                            <select
                                value={hasLocationFilter}
                                onChange={(event) => updateFilters({ has_searchable_location: event.target.value })}
                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                            >
                                <option value="all">すべて</option>
                                <option value="1">あり</option>
                                <option value="0">なし</option>
                            </select>
                        </label>

                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-[#17202b]">並び替え</span>
                            <select
                                value={sortField}
                                onChange={(event) => updateFilters({ sort: event.target.value })}
                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                            >
                                <option value="created_at">作成日時</option>
                                <option value="approved_at">承認日時</option>
                                <option value="rating_average">評価平均</option>
                                <option value="review_count">レビュー件数</option>
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
                    </div>
                </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(360px,0.88fr)]">
                <section className="space-y-4">
                    {profiles.length > 0 ? profiles.map((profile) => {
                        const isSelected = publicId === profile.public_id;
                        const detailPath = `/admin/therapist-profiles/${profile.public_id}${location.search}`;

                        return (
                            <Link
                                key={profile.public_id}
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
                                            <h3 className="text-lg font-semibold text-[#17202b]">{displayTherapistName(profile)}</h3>
                                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeTone(profile.profile_status)}`}>
                                                {formatProfileStatus(profile.profile_status)}
                                            </span>
                                        </div>
                                        <p className="text-sm text-[#68707a]">{profile.account?.email ?? 'メール未設定'}</p>
                                        <p className="text-xs text-[#7d6852]">{profile.public_id}</p>
                                    </div>

                                    <div className="text-right text-xs text-[#68707a]">
                                        <p>{profile.is_online ? 'オンライン' : 'オフライン'}</p>
                                        <p className="mt-1">最終位置更新 {formatDateTime(profile.last_location_updated_at)}</p>
                                    </div>
                                </div>

                                <div className="mt-4 flex flex-wrap gap-2">
                                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeTone(profile.photo_review_status)}`}>
                                        写真 {formatProfileStatus(profile.photo_review_status)}
                                    </span>
                                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeTone(profile.latest_identity_verification_status ?? 'none')}`}>
                                        本人確認 {profile.latest_identity_verification_status ? formatIdentityVerificationStatus(profile.latest_identity_verification_status) : '未提出'}
                                    </span>
                                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeTone(profile.stripe_connected_account_status ?? 'none')}`}>
                                        受取設定 {profile.stripe_connected_account_status ? formatStripeStatus(profile.stripe_connected_account_status) : '未連携'}
                                    </span>
                                </div>

                                <div className="mt-4 grid gap-3 md:grid-cols-4">
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">メニュー</p>
                                        <p className="mt-1 text-sm font-semibold text-[#17202b]">{profile.active_menu_count ?? 0}件</p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">位置公開</p>
                                        <p className="mt-1 text-sm font-semibold text-[#17202b]">{profile.has_searchable_location ? 'あり' : 'なし'}</p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">レビュー</p>
                                        <p className="mt-1 text-sm font-semibold text-[#17202b]">{profile.review_count}件</p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">研修</p>
                                        <p className="mt-1 text-sm font-semibold text-[#17202b]">{trainingStatusLabel(profile.training_status)}</p>
                                    </div>
                                </div>
                            </Link>
                        );
                    }) : (
                        <section className="rounded-[28px] bg-white px-6 py-10 text-center shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                            <p className="text-sm leading-7 text-[#68707a]">条件に合うタチキャストプロフィールはありません。</p>
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
                            <LoadingScreen title="タチキャスト詳細を読み込み中" message="審査判断に必要な詳細情報を取得しています。" />
                        </section>
                    ) : detailProfile ? (
                        <section className="space-y-5">
                            <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">THERAPIST DETAIL</p>
                                        <h3 className="mt-2 text-2xl font-semibold text-[#17202b]">{displayTherapistName(detailProfile)}</h3>
                                        <p className="mt-2 text-sm text-[#68707a]">{detailProfile.account?.email ?? 'メール未設定'}</p>
                                        <p className="mt-1 text-xs text-[#7d6852]">{detailProfile.public_id}</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeTone(detailProfile.profile_status)}`}>
                                            {formatProfileStatus(detailProfile.profile_status)}
                                        </span>
                                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeTone(detailProfile.photo_review_status)}`}>
                                            写真 {formatProfileStatus(detailProfile.photo_review_status)}
                                        </span>
                                    </div>
                                </div>

                                <div className="mt-5 grid gap-3 md:grid-cols-2">
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">公開プロフィール</p>
                                        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#17202b]">
                                            {detailProfile.bio?.trim() || '自己紹介は未入力です。'}
                                        </p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">審査メモ</p>
                                        <p className="mt-1 text-sm font-semibold text-[#17202b]">{formatRejectionReason(detailProfile.rejected_reason_code)}</p>
                                        <p className="mt-1 text-xs text-[#68707a]">承認日時 {formatDateTime(detailProfile.approved_at)}</p>
                                    </div>
                                </div>
                            </article>

                            <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">REVIEW SIGNALS</p>
                                <div className="mt-4 grid gap-3">
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">本人確認</p>
                                        <p className="mt-1 font-semibold text-[#17202b]">
                                            {detailProfile.latest_identity_verification_status
                                                ? formatIdentityVerificationStatus(detailProfile.latest_identity_verification_status)
                                                : '未提出'}
                                        </p>
                                        {detailProfile.latest_identity_verification ? (
                                            <p className="mt-1 text-xs text-[#68707a]">
                                                提出 {formatDateTime(detailProfile.latest_identity_verification.submitted_at)}
                                                {' / '}
                                                審査 {formatDateTime(detailProfile.latest_identity_verification.reviewed_at)}
                                            </p>
                                        ) : null}
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">受取設定</p>
                                        <p className="mt-1 font-semibold text-[#17202b]">
                                            {detailProfile.stripe_connected_account_status
                                                ? formatStripeStatus(detailProfile.stripe_connected_account_status)
                                                : '未連携'}
                                        </p>
                                        {detailProfile.stripe_connected_account?.stripe_account_id ? (
                                            <p className="mt-1 text-xs text-[#68707a]">
                                                {detailProfile.stripe_connected_account.stripe_account_id}
                                            </p>
                                        ) : null}
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">位置・稼働</p>
                                        <p className="mt-1 font-semibold text-[#17202b]">
                                            {detailProfile.is_online ? 'オンライン' : 'オフライン'}
                                            {' / '}
                                            {detailProfile.has_searchable_location ? '検索可能位置あり' : '検索可能位置なし'}
                                        </p>
                                        <p className="mt-1 text-xs text-[#68707a]">
                                            最終更新 {formatDateTime(detailProfile.last_location_updated_at)}
                                        </p>
                                    </div>
                                </div>
                            </article>

                            <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">MENUS & PHOTOS</p>

                                <div className="mt-4 space-y-4">
                                    <div>
                                        <h4 className="text-sm font-semibold text-[#17202b]">メニュー</h4>
                                        <div className="mt-3 space-y-3">
                                            {detailProfile.menus.length > 0 ? detailProfile.menus.map((menu) => (
                                                <div key={menu.public_id} className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                                        <div>
                                                            <p className="font-semibold text-[#17202b]">{menu.name}</p>
                                                            <p className="mt-1 text-xs text-[#68707a]">{menu.duration_minutes}分 / {menu.base_price_amount.toLocaleString('ja-JP')}円</p>
                                                        </div>
                                                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${menu.is_active ? 'bg-[#e8f4ea] text-[#24553a]' : 'bg-[#f3efe7] text-[#55606d]'}`}>
                                                            {menu.is_active ? '有効' : '非公開'}
                                                        </span>
                                                    </div>
                                                    {menu.description ? (
                                                        <p className="mt-3 text-sm leading-7 text-[#48505a]">{menu.description}</p>
                                                    ) : null}
                                                </div>
                                            )) : (
                                                <div className="rounded-[18px] border border-dashed border-[#d9c9ae] px-4 py-5 text-sm text-[#68707a]">
                                                    メニューはまだ登録されていません。
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="text-sm font-semibold text-[#17202b]">写真メタデータ</h4>
                                        <div className="mt-3 space-y-3">
                                            {detailProfile.photos && detailProfile.photos.length > 0 ? detailProfile.photos.map((photo) => (
                                                <div key={photo.id} className="rounded-[18px] bg-[#f8f4ed] px-4 py-3 text-sm text-[#48505a]">
                                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                                        <p className="font-semibold text-[#17202b]">{photoUsageLabel(photo.usage_type)}</p>
                                                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeTone(photo.status)}`}>
                                                            {formatProfileStatus(photo.status)}
                                                        </span>
                                                    </div>
                                                    <p className="mt-2 text-xs text-[#68707a]">
                                                        並び順 {photo.sort_order} / 登録 {formatDateTime(photo.created_at)} / 審査 {formatDateTime(photo.reviewed_at)}
                                                    </p>
                                                    <p className="mt-1 text-xs text-[#68707a]">
                                                        差し戻し理由 {formatRejectionReason(photo.rejection_reason_code)}
                                                    </p>
                                                </div>
                                            )) : (
                                                <div className="rounded-[18px] border border-dashed border-[#d9c9ae] px-4 py-5 text-sm text-[#68707a]">
                                                    写真はまだありません。
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </article>

                            <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">MODERATION ACTION</p>
                                <div className="mt-4 space-y-4">
                                    {(detailProfile.available_actions.reject || detailProfile.available_actions.suspend) ? (
                                        <label className="block space-y-2">
                                            <span className="text-sm font-semibold text-[#17202b]">理由コード</span>
                                            <input
                                                value={moderationReason}
                                                onChange={(event) => setModerationReason(event.target.value)}
                                                placeholder="profile_policy_review"
                                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                            />
                                        </label>
                                    ) : null}

                                    <div className="flex flex-wrap gap-3">
                                        {detailProfile.available_actions.approve ? (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    void handleModeration('approve');
                                                }}
                                                disabled={isSubmitting}
                                                className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140] disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {isSubmitting ? '処理中...' : '承認する'}
                                            </button>
                                        ) : null}
                                        {detailProfile.available_actions.reject ? (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    void handleModeration('reject');
                                                }}
                                                disabled={isSubmitting || !moderationReason.trim()}
                                                className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#f8f4ed] disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {isSubmitting ? '処理中...' : '差し戻す'}
                                            </button>
                                        ) : null}
                                        {detailProfile.available_actions.suspend ? (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    void handleModeration('suspend');
                                                }}
                                                disabled={isSubmitting || !moderationReason.trim()}
                                                className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#f8f4ed] disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {isSubmitting ? '処理中...' : '停止する'}
                                            </button>
                                        ) : null}
                                        {detailProfile.available_actions.restore ? (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    void handleModeration('restore');
                                                }}
                                                disabled={isSubmitting}
                                                className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140] disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {isSubmitting ? '処理中...' : '下書きへ戻す'}
                                            </button>
                                        ) : null}
                                    </div>

                                    {!detailProfile.available_actions.approve
                                    && !detailProfile.available_actions.reject
                                    && !detailProfile.available_actions.suspend
                                    && !detailProfile.available_actions.restore ? (
                                        <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3 text-sm text-[#48505a]">
                                            現在の状態では追加の審査操作はありません。
                                        </div>
                                    ) : null}
                                </div>
                            </article>
                        </section>
                    ) : (
                        <section className="rounded-[28px] bg-white px-6 py-10 text-center shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                            <p className="text-sm leading-7 text-[#68707a]">
                                一覧からタチキャストを選ぶと、ここに審査判断と詳細情報が表示されます。
                            </p>
                        </section>
                    )}
                </aside>
            </div>
        </div>
    );
}
