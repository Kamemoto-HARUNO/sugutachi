import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import {
    formatDateTime,
    formatProfileStatus,
    formatRejectionReason,
} from '../lib/therapist';
import type {
    AdminProfilePhotoRecord,
    ApiEnvelope,
} from '../lib/types';

type PhotoStatusFilter = 'all' | 'pending' | 'approved' | 'rejected';
type SortField = 'created_at' | 'reviewed_at' | 'sort_order';
type SortDirection = 'asc' | 'desc';

function normalizeStatusFilter(value: string | null): PhotoStatusFilter {
    if (value === 'pending' || value === 'approved' || value === 'rejected') {
        return value;
    }

    return 'all';
}

function normalizeSortField(value: string | null): SortField {
    if (value === 'reviewed_at' || value === 'sort_order') {
        return value;
    }

    return 'created_at';
}

function normalizeSortDirection(value: string | null): SortDirection {
    return value === 'asc' ? 'asc' : 'desc';
}

function statusTone(status: string): string {
    switch (status) {
        case 'approved':
            return 'bg-[#e8f4ea] text-[#24553a]';
        case 'rejected':
            return 'bg-[#f8e8e5] text-[#8f4337]';
        default:
            return 'bg-[#fff3e3] text-[#8f5c22]';
    }
}

function statusLabel(status: string): string {
    switch (status) {
        case 'approved':
            return '公開中';
        case 'rejected':
            return '非公開';
        default:
            return '確認中';
    }
}

function usageTypeLabel(value: string): string {
    switch (value) {
        case 'therapist_profile':
            return 'プロフィール写真';
        case 'user_profile':
            return '利用者プロフィール';
        default:
            return value.replaceAll('_', ' ');
    }
}

function displayPhotoName(photo: AdminProfilePhotoRecord): string {
    return photo.therapist_profile?.public_name?.trim()
        || photo.account?.display_name?.trim()
        || photo.account?.email
        || `Photo #${photo.id}`;
}

function buildSelectedLink(searchParams: URLSearchParams, selectedId: number): string {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('selected', String(selectedId));
    const query = nextParams.toString();

    return query ? `/admin/profile-photos?${query}` : '/admin/profile-photos';
}

export function AdminProfilePhotosPage() {
    const { token } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [photos, setPhotos] = useState<AdminProfilePhotoRecord[]>([]);
    const [pageError, setPageError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [usageTypeInput, setUsageTypeInput] = useState(searchParams.get('usage_type') ?? '');
    const [accountInput, setAccountInput] = useState(searchParams.get('account_id') ?? '');
    const [therapistProfileInput, setTherapistProfileInput] = useState(searchParams.get('therapist_profile_id') ?? '');
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isDeletingPhotoId, setIsDeletingPhotoId] = useState<number | null>(null);

    const selectedId = searchParams.get('selected');
    const statusFilter = normalizeStatusFilter(searchParams.get('status'));
    const sortField = normalizeSortField(searchParams.get('sort'));
    const direction = normalizeSortDirection(searchParams.get('direction'));
    const usageType = searchParams.get('usage_type')?.trim() ?? '';
    const accountId = searchParams.get('account_id')?.trim() ?? '';
    const therapistProfileId = searchParams.get('therapist_profile_id')?.trim() ?? '';

    usePageTitle('写真監視');
    useToastOnMessage(successMessage, 'success');
    useToastOnMessage(actionError, 'error');

    const selectedPhoto = useMemo(
        () => photos.find((photo) => String(photo.id) === selectedId) ?? null,
        [photos, selectedId],
    );

    const summary = useMemo(() => ({
        total: photos.length,
        pending: photos.filter((photo) => photo.status === 'pending').length,
        approved: photos.filter((photo) => photo.status === 'approved').length,
        rejected: photos.filter((photo) => photo.status === 'rejected').length,
    }), [photos]);

    const loadPhotos = useCallback(async (refresh = false) => {
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

        if (usageType) {
            params.set('usage_type', usageType);
        }

        if (accountId) {
            params.set('account_id', accountId);
        }

        if (therapistProfileId) {
            params.set('therapist_profile_id', therapistProfileId);
        }

        params.set('sort', sortField);
        params.set('direction', direction);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminProfilePhotoRecord[]>>(`/admin/profile-photos?${params.toString()}`, { token });
            setPhotos(unwrapData(payload));
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '写真一覧の取得に失敗しました。';

            setPageError(message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [accountId, direction, sortField, statusFilter, therapistProfileId, token, usageType]);

    useEffect(() => {
        void loadPhotos();
    }, [loadPhotos]);

    function updateFilters(next: Partial<Record<'status' | 'sort' | 'direction' | 'usage_type' | 'account_id' | 'therapist_profile_id' | 'selected', string | null>>) {
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

    async function handleDeletePhoto() {
        if (!token || !selectedPhoto) {
            return;
        }

        setIsDeletingPhotoId(selectedPhoto.id);
        setActionError(null);
        setSuccessMessage(null);

        try {
            await apiRequest<null>(`/admin/profile-photos/${selectedPhoto.id}`, {
                method: 'DELETE',
                token,
            });

            setPhotos((current) => current.filter((photo) => photo.id !== selectedPhoto.id));
            updateFilters({ selected: null });
            setSuccessMessage('写真を削除しました。');
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '写真の削除に失敗しました。';

            setActionError(message);
        } finally {
            setIsDeletingPhotoId(null);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="写真監視を読み込み中" message="プロフィール写真の状況を集約しています。" />;
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_16px_34px_rgba(2,6,23,0.14)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">PHOTO MONITORING</p>
                        <h2 className="text-2xl font-semibold text-white sm:text-[2rem]">写真監視</h2>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            ユーザーが公開しているプロフィール写真を確認し、必要に応じて削除できます。
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            void loadPhotos(true);
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

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                    { label: '総件数', value: summary.total, hint: '現在の表示対象' },
                    { label: '確認中', value: summary.pending, hint: '旧データを含む' },
                    { label: '公開中', value: summary.approved, hint: '現在表示中' },
                    { label: '非公開', value: summary.rejected, hint: '手動で非公開にした写真' },
                ].map((item) => (
                    <article key={item.label} className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">{item.label}</p>
                        <p className="mt-3 text-3xl font-semibold text-white">{item.value}</p>
                        <p className="mt-2 text-sm text-slate-400">{item.hint}</p>
                    </article>
                ))}
            </section>

            <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">状態</span>
                        <select
                            value={statusFilter}
                            onChange={(event) => updateFilters({ status: event.target.value, selected: null })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="all">すべて</option>
                            <option value="pending">確認中</option>
                            <option value="approved">公開中</option>
                            <option value="rejected">非公開</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">用途</span>
                        <input
                            value={usageTypeInput}
                            onChange={(event) => setUsageTypeInput(event.target.value)}
                            onBlur={() => updateFilters({ usage_type: usageTypeInput.trim() || null, selected: null })}
                            placeholder="therapist_profile / account_profile"
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        />
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">アカウントID</span>
                        <input
                            value={accountInput}
                            onChange={(event) => setAccountInput(event.target.value)}
                            onBlur={() => updateFilters({ account_id: accountInput.trim() || null, selected: null })}
                            placeholder="acc_xxx または数値ID"
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        />
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">プロフィールID</span>
                        <input
                            value={therapistProfileInput}
                            onChange={(event) => setTherapistProfileInput(event.target.value)}
                            onBlur={() => updateFilters({ therapist_profile_id: therapistProfileInput.trim() || null, selected: null })}
                            placeholder="thp_xxx または数値ID"
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        />
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">並び替え</span>
                        <select
                            value={sortField}
                            onChange={(event) => updateFilters({ sort: event.target.value, selected: null })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="created_at">登録日時</option>
                            <option value="reviewed_at">更新日時</option>
                            <option value="sort_order">表示順</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">順序</span>
                        <select
                            value={direction}
                            onChange={(event) => updateFilters({ direction: event.target.value, selected: null })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="desc">新しい順</option>
                            <option value="asc">古い順</option>
                        </select>
                    </label>
                </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(360px,0.88fr)]">
                <section className="space-y-4">
                    {photos.length > 0 ? photos.map((photo) => {
                        const isSelected = String(photo.id) === selectedId;

                        return (
                            <Link
                                key={photo.id}
                                to={buildSelectedLink(searchParams, photo.id)}
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
                                            <h3 className="text-lg font-semibold text-[#17202b]">{displayPhotoName(photo)}</h3>
                                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(photo.status)}`}>
                                                {statusLabel(photo.status)}
                                            </span>
                                        </div>
                                        <p className="text-sm text-[#68707a]">{photo.account?.email ?? 'メール未設定'}</p>
                                        <p className="text-xs text-[#7d6852]">Photo #{photo.id}</p>
                                    </div>

                                    <div className="text-right text-xs text-[#68707a]">
                                        <p>{usageTypeLabel(photo.usage_type)}</p>
                                        <p className="mt-1">登録 {formatDateTime(photo.created_at)}</p>
                                    </div>
                                </div>

                                <div className="mt-4 grid gap-3 md:grid-cols-[96px_minmax(0,1fr)_1fr_1fr]">
                                    <div className="overflow-hidden rounded-[18px] bg-[#f1ece3]">
                                        {photo.url ? (
                                            <img src={photo.url} alt="" className="h-24 w-full object-cover" />
                                        ) : (
                                            <div className="flex h-24 items-center justify-center text-xs text-[#7d6852]">画像なし</div>
                                        )}
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">プロフィール状態</p>
                                        <p className="mt-1 text-sm font-semibold text-[#17202b]">{formatProfileStatus(photo.therapist_profile?.profile_status)}</p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">表示順</p>
                                        <p className="mt-1 text-sm font-semibold text-[#17202b]">{photo.sort_order}</p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">最終確認者</p>
                                        <p className="mt-1 text-sm font-semibold text-[#17202b]">{photo.reviewed_by?.display_name ?? photo.reviewed_by?.public_id ?? '未設定'}</p>
                                    </div>
                                </div>
                            </Link>
                        );
                    }) : (
                        <section className="rounded-[28px] bg-white px-6 py-10 text-center shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                            <p className="text-sm leading-7 text-[#68707a]">条件に合う写真はありません。</p>
                        </section>
                    )}
                </section>

                <aside className="space-y-5">
                    {actionError ? (
                        <section className="rounded-[24px] border border-[#f1d4b5] bg-[#fff4e8] px-5 py-4 text-sm text-[#9a4b35]">
                            {actionError}
                        </section>
                    ) : null}

                    {selectedPhoto ? (
                        <section className="space-y-5">
                            <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">写真詳細</p>
                                        <h3 className="mt-2 text-2xl font-semibold text-[#17202b]">{displayPhotoName(selectedPhoto)}</h3>
                                        <p className="mt-2 text-sm text-[#68707a]">{selectedPhoto.account?.email ?? 'メール未設定'}</p>
                                        <p className="mt-1 text-xs text-[#7d6852]">Photo #{selectedPhoto.id}</p>
                                    </div>
                                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(selectedPhoto.status)}`}>
                                        {statusLabel(selectedPhoto.status)}
                                    </span>
                                </div>

                                <div className="mt-5 grid gap-4">
                                    <div className="overflow-hidden rounded-[24px] bg-[#f1ece3]">
                                        {selectedPhoto.url ? (
                                            <img src={selectedPhoto.url} alt="" className="h-[320px] w-full object-cover" />
                                        ) : (
                                            <div className="flex h-[320px] items-center justify-center text-sm text-[#7d6852]">
                                                画像を表示できません
                                            </div>
                                        )}
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3 text-sm text-[#48505a]">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">写真メタデータ</p>
                                        <p className="mt-1 font-semibold text-[#17202b]">{usageTypeLabel(selectedPhoto.usage_type)}</p>
                                        <p className="mt-1">表示順 {selectedPhoto.sort_order}</p>
                                        <p className="mt-1">content hash {selectedPhoto.content_hash ?? '未設定'}</p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3 text-sm text-[#48505a]">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">紐づくプロフィール</p>
                                        <p className="mt-1 font-semibold text-[#17202b]">
                                            {selectedPhoto.therapist_profile?.public_name ?? selectedPhoto.therapist_profile?.public_id ?? '未連携'}
                                        </p>
                                        <p className="mt-1">
                                            プロフィール {formatProfileStatus(selectedPhoto.therapist_profile?.profile_status)}
                                            {' / '}
                                            写真 {statusLabel(selectedPhoto.therapist_profile?.photo_review_status ?? 'pending')}
                                        </p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3 text-sm text-[#48505a]">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">記録</p>
                                        <p className="mt-1 font-semibold text-[#17202b]">{selectedPhoto.reviewed_by?.display_name ?? selectedPhoto.reviewed_by?.public_id ?? '未設定'}</p>
                                        <p className="mt-1">登録日時 {formatDateTime(selectedPhoto.created_at)}</p>
                                        <p className="mt-1">最終更新 {formatDateTime(selectedPhoto.reviewed_at)}</p>
                                        <p className="mt-1">理由 {formatRejectionReason(selectedPhoto.rejection_reason_code)}</p>
                                    </div>
                                </div>
                            </article>

                            <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">監視アクション</p>
                                <div className="mt-4 space-y-4">
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3 text-sm leading-7 text-[#48505a]">
                                        ユーザーがアップロードした写真はそのまま公開されます。問題がある写真だけ、ここから削除して公開を止めてください。
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            void handleDeletePhoto();
                                        }}
                                        disabled={isDeletingPhotoId === selectedPhoto.id}
                                        className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#f8f4ed] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {isDeletingPhotoId === selectedPhoto.id ? '削除中...' : 'この写真を削除'}
                                    </button>
                                </div>
                            </article>
                        </section>
                    ) : (
                        <section className="rounded-[28px] bg-white px-6 py-10 text-center shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                            <p className="text-sm leading-7 text-[#68707a]">
                                一覧から写真を選ぶと、ここに監視用の詳細が表示されます。
                            </p>
                        </section>
                    )}
                </aside>
            </div>
        </div>
    );
}
