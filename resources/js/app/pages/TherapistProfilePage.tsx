import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatJstDateTime } from '../lib/datetime';
import { formatProfileStatus, formatRejectionReason } from '../lib/therapist';
import type {
    ApiEnvelope,
    MeProfileRecord,
    SelfProfilePhotoSummary,
    TempFileRecord,
    TherapistMenu,
    TherapistProfileRecord,
    TherapistReviewStatus,
} from '../lib/types';

interface MenuDraft {
    public_id: string | null;
    name: string;
    description: string;
    minimum_duration_minutes: number;
    hourly_rate_amount: number;
    is_active: boolean;
    sort_order: number;
}

async function uploadProfilePhotoTempFile(token: string, file: File): Promise<TempFileRecord> {
    const formData = new FormData();
    formData.append('purpose', 'profile_photo');
    formData.append('file', file);

    const payload = await apiRequest<ApiEnvelope<TempFileRecord>>('/temp-files', {
        method: 'POST',
        token,
        body: formData,
    });

    return unwrapData(payload);
}

function photoStatusLabel(status: string): string {
    switch (status) {
        case 'pending':
            return '確認中';
        case 'approved':
            return '公開中';
        case 'rejected':
            return '非公開';
        default:
            return status;
    }
}

function photoStatusTone(status: string): string {
    switch (status) {
        case 'approved':
            return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100';
        case 'pending':
            return 'border-amber-300/30 bg-amber-300/10 text-amber-100';
        case 'rejected':
            return 'border-rose-300/30 bg-rose-300/10 text-rose-100';
        default:
            return 'border-white/10 bg-white/5 text-slate-300';
    }
}

function formatFileSize(sizeBytes: number): string {
    if (sizeBytes < 1024 * 1024) {
        return `${Math.max(1, Math.round(sizeBytes / 1024))}KB`;
    }

    return `${(sizeBytes / (1024 * 1024)).toFixed(1)}MB`;
}

const trainingOptions = [
    { value: 'none', label: '研修情報なし' },
    { value: 'in_progress', label: '研修中' },
    { value: 'completed', label: '研修済み' },
    { value: 'pending', label: '確認中' },
];

function createMenuDraft(menu?: TherapistMenu): MenuDraft {
    return {
        public_id: menu?.public_id ?? null,
        name: menu?.name ?? '',
        description: menu?.description ?? '',
        minimum_duration_minutes: menu?.minimum_duration_minutes ?? menu?.duration_minutes ?? 60,
        hourly_rate_amount: menu?.hourly_rate_amount ?? 12000,
        is_active: menu?.is_active ?? true,
        sort_order: menu?.sort_order ?? 0,
    };
}

function toOptionalNumber(value: string): number | null {
    if (!value.trim()) {
        return null;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
}

function listingStatusLabel(profile: TherapistProfileRecord | null): string {
    if (!profile) {
        return '確認中';
    }

    if (profile.profile_status !== 'approved') {
        return '公開準備中';
    }

    return profile.is_listed ? '公開中' : '非公開';
}

function listingStatusTone(profile: TherapistProfileRecord | null): string {
    if (!profile) {
        return 'bg-[#f1efe8] text-[#48505a]';
    }

    if (profile.profile_status !== 'approved') {
        return 'bg-[#fff2dd] text-[#8b5a16]';
    }

    return profile.is_listed
        ? 'bg-[#e9f4ea] text-[#24553a]'
        : 'bg-[#f3ece4] text-[#6a5642]';
}

export function TherapistProfilePage() {
    const { token } = useAuth();
    const [meProfile, setMeProfile] = useState<MeProfileRecord | null>(null);
    const [profile, setProfile] = useState<TherapistProfileRecord | null>(null);
    const [reviewStatus, setReviewStatus] = useState<TherapistReviewStatus | null>(null);
    const [publicName, setPublicName] = useState('');
    const [bio, setBio] = useState('');
    const [heightCm, setHeightCm] = useState('');
    const [weightKg, setWeightKg] = useState('');
    const [pSizeCm, setPSizeCm] = useState('');
    const [trainingStatus, setTrainingStatus] = useState('none');
    const [menuDrafts, setMenuDrafts] = useState<MenuDraft[]>([]);
    const [newMenuDraft, setNewMenuDraft] = useState<MenuDraft>(createMenuDraft());
    const [error, setError] = useState<string | null>(null);
    const [photoError, setPhotoError] = useState<string | null>(null);
    const [photoSuccessMessage, setPhotoSuccessMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [isUpdatingListing, setIsUpdatingListing] = useState(false);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [isDeletingPhotoId, setIsDeletingPhotoId] = useState<number | null>(null);
    const [pendingMenuId, setPendingMenuId] = useState<string | null>(null);

    usePageTitle('セラピストプロフィール');
    useToastOnMessage(successMessage, 'success');
    useToastOnMessage(error, 'error');
    useToastOnMessage(photoSuccessMessage, 'success');
    useToastOnMessage(photoError, 'error');

    const loadData = useCallback(async () => {
        if (!token) {
            return;
        }

        const [meProfilePayload, profilePayload, reviewPayload] = await Promise.all([
            apiRequest<ApiEnvelope<MeProfileRecord>>('/me/profile', { token }),
            apiRequest<ApiEnvelope<TherapistProfileRecord>>('/me/therapist-profile', { token }),
            apiRequest<ApiEnvelope<TherapistReviewStatus>>('/me/therapist-profile/review-status', { token }),
        ]);

        const nextMeProfile = unwrapData(meProfilePayload);
        const nextProfile = unwrapData(profilePayload);
        const nextReviewStatus = unwrapData(reviewPayload);

        setMeProfile(nextMeProfile);
        setProfile(nextProfile);
        setReviewStatus(nextReviewStatus);
        setPublicName(nextProfile.public_name ?? '');
        setBio(nextProfile.bio ?? '');
        setHeightCm(nextProfile.height_cm != null ? String(nextProfile.height_cm) : '');
        setWeightKg(nextProfile.weight_kg != null ? String(nextProfile.weight_kg) : '');
        setPSizeCm(nextProfile.p_size_cm != null ? String(nextProfile.p_size_cm) : '');
        setTrainingStatus(nextProfile.training_status ?? 'none');
        setMenuDrafts(nextProfile.menus.map((menu) => createMenuDraft(menu)));
    }, [token]);

    useEffect(() => {
        let isMounted = true;

        void loadData()
            .catch((requestError: unknown) => {
                if (!isMounted) {
                    return;
                }

                const message =
                    requestError instanceof ApiError
                        ? requestError.message
                        : 'プロフィール情報の取得に失敗しました。';

                setError(message);
            })
            .finally(() => {
                if (isMounted) {
                    setIsLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [loadData]);

    const requirementList = reviewStatus?.requirements ?? [];
    const therapistPhotos = useMemo(
        () => (meProfile?.photos ?? []).filter((photo) => photo.usage_type === 'therapist_profile'),
        [meProfile],
    );
    const canListProfile = Boolean(profile?.profile_status === 'approved' && !profile.is_listed);
    const canHideProfile = Boolean(profile?.profile_status === 'approved' && profile.is_listed);
    const approvedOrPendingPhotoCount = useMemo(
        () => therapistPhotos.filter((photo) => photo.status === 'approved' || photo.status === 'pending').length,
        [therapistPhotos],
    );
    useEffect(() => {
        if (!photoFile) {
            setPhotoPreviewUrl((currentUrl) => {
                if (currentUrl) {
                    URL.revokeObjectURL(currentUrl);
                }

                return null;
            });

            return;
        }

        const nextPreviewUrl = URL.createObjectURL(photoFile);

        setPhotoPreviewUrl((currentUrl) => {
            if (currentUrl) {
                URL.revokeObjectURL(currentUrl);
            }

            return nextPreviewUrl;
        });

        return () => {
            URL.revokeObjectURL(nextPreviewUrl);
        };
    }, [photoFile]);

    useEffect(() => {
        if (isLoading || window.location.hash !== '#profile-photos') {
            return;
        }

        window.requestAnimationFrame(() => {
            document.getElementById('profile-photos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }, [isLoading]);

    function updateMenuDraft(publicId: string | null, patch: Partial<MenuDraft>) {
        setMenuDrafts((current) => current.map((draft) => (
            draft.public_id === publicId ? { ...draft, ...patch } : draft
        )));
    }

    async function updateListingState(isListed: boolean) {
        if (!token) {
            return;
        }

        setIsUpdatingListing(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<TherapistProfileRecord>>('/me/therapist/listing', {
                method: 'PUT',
                token,
                body: {
                    is_listed: isListed,
                },
            });

            setProfile(unwrapData(payload));
            setSuccessMessage(isListed
                ? 'プロフィールを公開しました。'
                : 'プロフィールを非公開にしました。');
            await loadData();
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '公開設定の更新に失敗しました。';

            setError(message);
        } finally {
            setIsUpdatingListing(false);
        }
    }

    function handlePhotoFileChange(event: ChangeEvent<HTMLInputElement>) {
        const nextFile = event.target.files?.[0] ?? null;

        if (!nextFile) {
            setPhotoFile(null);
            setPhotoError(null);
            return;
        }

        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];

        if (!allowedMimeTypes.includes(nextFile.type)) {
            setPhotoFile(null);
            setPhotoSuccessMessage(null);
            setPhotoError('jpg / png / webp の画像を選択してください。');
            return;
        }

        if (nextFile.size > 10 * 1024 * 1024) {
            setPhotoFile(null);
            setPhotoSuccessMessage(null);
            setPhotoError('画像サイズは10MB以下にしてください。');
            return;
        }

        setPhotoError(null);
        setPhotoSuccessMessage(null);
        setPhotoFile(nextFile);
    }

    async function refreshAfterMutation(nextSuccessMessage?: string) {
        await loadData();
        if (nextSuccessMessage) {
            setSuccessMessage(nextSuccessMessage);
        }
    }

    async function refreshAfterPhotoMutation(nextSuccessMessage?: string) {
        await loadData();
        if (nextSuccessMessage) {
            setPhotoSuccessMessage(nextSuccessMessage);
        }
    }

    async function handleProfileSave(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token) {
            return;
        }

        setIsSavingProfile(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<TherapistProfileRecord>>('/me/therapist-profile', {
                method: 'PUT',
                token,
                body: {
                    public_name: publicName,
                    bio,
                    height_cm: toOptionalNumber(heightCm),
                    weight_kg: toOptionalNumber(weightKg),
                    p_size_cm: toOptionalNumber(pSizeCm),
                    training_status: trainingStatus,
                },
            });

            const nextProfile = unwrapData(payload);
            setProfile(nextProfile);
            await refreshAfterMutation('プロフィールを保存しました。');
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : 'プロフィールの保存に失敗しました。';

            setError(message);
        } finally {
            setIsSavingProfile(false);
        }
    }

    async function handlePhotoUpload(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token || !photoFile) {
            return;
        }

        setIsUploadingPhoto(true);
        setError(null);
        setPhotoError(null);
        setPhotoSuccessMessage(null);
        setSuccessMessage(null);

        try {
            const tempFile = await uploadProfilePhotoTempFile(token, photoFile);

            await apiRequest<ApiEnvelope<SelfProfilePhotoSummary>>('/me/profile/photos', {
                method: 'POST',
                token,
                body: {
                    temp_file_id: tempFile.file_id,
                    usage_type: 'therapist_profile',
                },
            });

            setPhotoFile(null);
            await refreshAfterPhotoMutation('プロフィール写真を追加しました。公開プロフィールに反映されます。');
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : 'プロフィール写真の追加に失敗しました。';

            setPhotoError(message);
        } finally {
            setIsUploadingPhoto(false);
        }
    }

    async function deletePhoto(photoId: number) {
        if (!token) {
            return;
        }

        setIsDeletingPhotoId(photoId);
        setError(null);
        setPhotoError(null);
        setPhotoSuccessMessage(null);
        setSuccessMessage(null);

        try {
            await apiRequest<null>(`/me/profile/photos/${photoId}`, {
                method: 'DELETE',
                token,
            });

            await refreshAfterPhotoMutation('プロフィール写真を削除しました。');
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : 'プロフィール写真の削除に失敗しました。';

            setPhotoError(message);
        } finally {
            setIsDeletingPhotoId(null);
        }
    }

    async function saveMenu(draft: MenuDraft) {
        if (!token || !draft.public_id) {
            return;
        }

        setPendingMenuId(draft.public_id);
        setError(null);
        setSuccessMessage(null);

        try {
            await apiRequest<ApiEnvelope<TherapistMenu>>(`/me/therapist/menus/${draft.public_id}`, {
                method: 'PATCH',
                token,
                body: {
                    name: draft.name,
                    description: draft.description || null,
                    minimum_duration_minutes: draft.minimum_duration_minutes,
                    hourly_rate_amount: draft.hourly_rate_amount,
                    is_active: draft.is_active,
                    sort_order: draft.sort_order,
                },
            });

            await refreshAfterMutation('対応内容を更新しました。');
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '対応内容の更新に失敗しました。';

            setError(message);
        } finally {
            setPendingMenuId(null);
        }
    }

    async function createMenu() {
        if (!token) {
            return;
        }

        setPendingMenuId('new');
        setError(null);
        setSuccessMessage(null);

        try {
            await apiRequest<ApiEnvelope<TherapistMenu>>('/me/therapist/menus', {
                method: 'POST',
                token,
                body: {
                    name: newMenuDraft.name,
                    description: newMenuDraft.description || null,
                    minimum_duration_minutes: newMenuDraft.minimum_duration_minutes,
                    hourly_rate_amount: newMenuDraft.hourly_rate_amount,
                    sort_order: newMenuDraft.sort_order,
                },
            });

            setNewMenuDraft(createMenuDraft());
            await refreshAfterMutation('対応内容を追加しました。');
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '対応内容の追加に失敗しました。';

            setError(message);
        } finally {
            setPendingMenuId(null);
        }
    }

    async function deleteMenu(publicId: string) {
        if (!token) {
            return;
        }

        setPendingMenuId(publicId);
        setError(null);
        setSuccessMessage(null);

        try {
            await apiRequest<null>(`/me/therapist/menus/${publicId}`, {
                method: 'DELETE',
                token,
            });

            await refreshAfterMutation('対応内容を削除しました。');
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '対応内容の削除に失敗しました。';

            setError(message);
        } finally {
            setPendingMenuId(null);
        }
    }

    const activeMenuCount = useMemo(() => {
        return menuDrafts.filter((menu) => menu.is_active).length;
    }, [menuDrafts]);

    if (isLoading) {
        return <LoadingScreen title="プロフィールを読み込み中" message="公開プロフィールと対応内容を準備しています。" />;
    }

    return (
        <div className="space-y-8">
            <section className="space-y-4 rounded-[28px] border border-white/10 bg-white/5 p-6 md:p-8">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">プロフィール</p>
                        <h1 className="text-3xl font-semibold text-white">セラピストプロフィール</h1>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            公開名、紹介文、研修ステータス、対応内容を整える画面です。本人確認・年齢確認と必須情報が揃えば、このまま公開準備が整います。
                        </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#111923] px-5 py-4 text-sm text-slate-200">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">公開状況</p>
                        <p className="mt-2 text-2xl font-semibold text-white">
                            {formatProfileStatus(profile?.profile_status)}
                        </p>
                        <p className="mt-2 text-xs text-slate-400">
                            公開中の対応内容 {activeMenuCount}件 / 登録済み写真 {therapistPhotos.length}枚
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-3">
                    <Link
                        to="/therapist/onboarding"
                        className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                    >
                        準備状況へ戻る
                    </Link>
                    {profile?.public_id ? (
                        <Link
                            to={`/therapists/${profile.public_id}`}
                            className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                        >
                            自分のページを確認
                        </Link>
                    ) : null}
                    <a
                        href="#profile-photos"
                        className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                    >
                        写真を管理
                    </a>
                </div>
                {profile?.rejected_reason_code ? (
                    <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-7 text-amber-100">
                        差し戻し理由: {formatRejectionReason(profile.rejected_reason_code)}
                    </div>
                ) : null}
            </section>

            <section className="rounded-[24px] border border-white/10 bg-white/5 p-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">公開設定</p>
                        <h2 className="text-xl font-semibold text-white">プロフィールを公開するかここで切り替え</h2>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            利用者にこのプロフィールを見せるかどうかを、このページでもすぐ切り替えられます。オンライン受付や現在地の設定は「設定」タブで続けて調整できます。
                        </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#111923] px-5 py-4 text-sm text-slate-200">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">現在の公開状態</p>
                        <span className={['mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold', listingStatusTone(profile)].join(' ')}>
                            {listingStatusLabel(profile)}
                        </span>
                        <p className="mt-3 text-xs leading-6 text-slate-400">
                            {profile?.profile_status === 'approved'
                                ? profile.is_listed
                                    ? '公開中は検索結果や詳細ページに表示されます。'
                                    : '非公開中は検索結果や詳細ページに表示されません。'
                                : '本人確認・年齢確認と必須情報が揃うと公開できます。'}
                        </p>
                    </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                    <button
                        type="button"
                        onClick={() => {
                            void updateListingState(true);
                        }}
                        disabled={isUpdatingListing || !canListProfile}
                        className="inline-flex items-center rounded-full bg-rose-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isUpdatingListing && canListProfile ? '切り替え中...' : 'プロフィールを公開する'}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            void updateListingState(false);
                        }}
                        disabled={isUpdatingListing || !canHideProfile}
                        className="inline-flex items-center rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isUpdatingListing && canHideProfile ? '切り替え中...' : 'プロフィールを非公開にする'}
                    </button>
                    <Link
                        to="/therapist/settings"
                        className="inline-flex items-center rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
                    >
                        オンライン受付や現在地は設定で調整
                    </Link>
                </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <form onSubmit={handleProfileSave} className="space-y-5 rounded-[24px] border border-white/10 bg-white/5 p-6">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">基本情報</p>
                        <h2 className="text-xl font-semibold text-white">公開プロフィール</h2>
                    </div>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-white">公開名</span>
                        <input
                            value={publicName}
                            onChange={(event) => setPublicName(event.target.value)}
                            className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                            placeholder="公開用の表示名"
                            required
                        />
                    </label>

                    <div className="grid gap-4 md:grid-cols-2">
                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-white">年齢</span>
                            <input
                                value={profile?.age != null ? `${profile.age}歳` : ''}
                                readOnly
                                disabled
                                className="w-full rounded-[18px] border border-white/10 bg-[#0c141d] px-4 py-3 text-sm text-slate-300 outline-none"
                                placeholder="本人確認後に自動表示"
                            />
                            <p className="text-xs leading-6 text-slate-400">
                                本人確認で提出した生年月日から自動で計算されます。ここでは変更できません。
                            </p>
                        </label>

                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-white">身長（cm）</span>
                            <input
                                type="number"
                                min={100}
                                max={250}
                                value={heightCm}
                                onChange={(event) => setHeightCm(event.target.value)}
                                className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                placeholder="175"
                            />
                        </label>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-white">体重（kg）</span>
                            <input
                                type="number"
                                min={30}
                                max={250}
                                value={weightKg}
                                onChange={(event) => setWeightKg(event.target.value)}
                                className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                placeholder="68"
                            />
                        </label>

                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-white">Pサイズ（cm）</span>
                            <input
                                type="number"
                                min={1}
                                max={50}
                                value={pSizeCm}
                                onChange={(event) => setPSizeCm(event.target.value)}
                                className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                placeholder="15"
                            />
                        </label>
                    </div>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-white">自己紹介</span>
                        <textarea
                            value={bio}
                            onChange={(event) => setBio(event.target.value)}
                            rows={6}
                            className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                            placeholder="対応の雰囲気や得意なケア、安心してもらうための自己紹介を入力"
                        />
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-white">研修ステータス</span>
                        <select
                            value={trainingStatus}
                            onChange={(event) => setTrainingStatus(event.target.value)}
                            className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                        >
                            {trainingOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </label>

                    <button
                        type="submit"
                        disabled={isSavingProfile}
                        className="inline-flex items-center rounded-full bg-rose-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isSavingProfile ? '保存中...' : 'プロフィールを保存する'}
                    </button>

                </form>

                <article className="space-y-4 rounded-[24px] border border-white/10 bg-white/5 p-6">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">公開条件</p>
                        <h2 className="text-xl font-semibold text-white">公開前にそろえること</h2>
                    </div>

                    <div className="space-y-3">
                        {requirementList.map((requirement) => (
                            <div key={requirement.key} className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm font-semibold text-white">{requirement.label}</p>
                                    <span className={[
                                        'rounded-full border px-3 py-1 text-xs font-semibold',
                                        requirement.is_satisfied
                                            ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
                                            : 'border-amber-300/30 bg-amber-300/10 text-amber-100',
                                    ].join(' ')}>
                                        {requirement.is_satisfied ? 'OK' : '要対応'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <p className="text-sm leading-7 text-slate-300">
                        本人確認・年齢確認と公開中の対応内容が揃うと、プロフィールは自動で公開可能になります。実際に公開するかどうかは稼働設定で切り替えられます。
                    </p>
                    <p className="text-sm leading-7 text-slate-400">
                        保存のたびに運営承認を待つ必要はありません。不足項目が出たときだけ公開プロフィールから外れます。
                    </p>
                </article>
            </section>

            <section id="profile-photos" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <article className="space-y-5 rounded-[24px] border border-white/10 bg-white/5 p-6">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">写真</p>
                        <h2 className="text-xl font-semibold text-white">プロフィール写真</h2>
                        <p className="text-sm leading-7 text-slate-300">
                            顔や雰囲気が分かる写真を登録します。アップロードした写真はそのまま公開プロフィールに反映され、必要に応じて運営が監視・削除します。
                        </p>
                    </div>

                    <form onSubmit={handlePhotoUpload} className="space-y-4 rounded-[22px] border border-white/10 bg-[#111923] p-5">
                        <label className="block space-y-2">
                            <span className="text-sm font-semibold text-white">写真を追加</span>
                            <input
                                type="file"
                                accept=".jpg,.jpeg,.png,.webp"
                                onChange={handlePhotoFileChange}
                                className="block w-full rounded-[18px] border border-white/10 bg-transparent px-4 py-3 text-sm text-white"
                            />
                            <p className="text-xs text-slate-400">
                                {photoFile ? photoFile.name : 'jpg / png / webp の画像を選択'}
                            </p>
                        </label>

                        {photoFile && photoPreviewUrl ? (
                            <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                                    <div className="h-28 w-28 overflow-hidden rounded-[18px] bg-[#1d2a37]">
                                        <img src={photoPreviewUrl} alt="" className="h-full w-full object-cover" />
                                    </div>
                                    <div className="space-y-2 text-sm text-slate-300">
                                        <p className="font-semibold text-white">{photoFile.name}</p>
                                        <p>{formatFileSize(photoFile.size)}</p>
                                        <p className="text-xs leading-6 text-slate-400">
                                            明るくて見やすい写真ほど、公開後の安心感につながります。
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => setPhotoFile(null)}
                                            className="inline-flex items-center rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5"
                                        >
                                            選択を取り消す
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        <button
                            type="submit"
                            disabled={isUploadingPhoto || !photoFile}
                            className="inline-flex items-center rounded-full bg-rose-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isUploadingPhoto ? 'アップロード中...' : '写真を追加する'}
                        </button>
                    </form>

                    {therapistPhotos.length > 0 ? (
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {therapistPhotos.map((photo) => (
                                <article
                                    key={photo.id}
                                    className="overflow-hidden rounded-[22px] border border-white/10 bg-[#111923]"
                                >
                                    <div className="aspect-[1.05] bg-[#1d2a37]">
                                        {photo.url ? (
                                            <img src={photo.url} alt="" className="h-full w-full object-cover" />
                                        ) : (
                                            <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-400">
                                                画像を準備中
                                            </div>
                                        )}
                                    </div>
                                    <div className="space-y-3 px-4 py-4 text-sm text-slate-300">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${photoStatusTone(photo.status)}`}>
                                                {photoStatusLabel(photo.status)}
                                            </span>
                                        </div>

                                        {photo.rejection_reason_code ? (
                                            <p className="text-xs leading-6 text-rose-200">
                                                差し戻し理由: {formatRejectionReason(photo.rejection_reason_code)}
                                            </p>
                                        ) : (
                                            <p className="text-xs leading-6 text-slate-400">
                                                登録日時: {formatJstDateTime(photo.created_at, {
                                                    month: 'numeric',
                                                    day: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                }) ?? '未設定'}
                                            </p>
                                        )}

                                        <button
                                            type="button"
                                            onClick={() => {
                                                void deletePhoto(photo.id);
                                            }}
                                            disabled={isDeletingPhotoId === photo.id}
                                            className="inline-flex items-center rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {isDeletingPhotoId === photo.id ? '削除中...' : '削除'}
                                        </button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-[22px] border border-dashed border-white/15 bg-[#111923] px-4 py-5 text-sm leading-7 text-slate-300">
                            まだセラピスト用のプロフィール写真はありません。まず1枚追加すると、公開プロフィールの印象が伝わりやすくなります。
                        </div>
                    )}
                </article>

                <article className="space-y-4 rounded-[24px] border border-white/10 bg-white/5 p-6">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">写真</p>
                        <h2 className="text-xl font-semibold text-white">写真の公開状況</h2>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                        <p className="text-sm font-semibold text-white">現在の状態</p>
                        <p className="mt-2 text-sm text-slate-300">{therapistPhotos.length > 0 ? '写真を公開中' : '写真未登録'}</p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                        <p className="text-sm font-semibold text-white">登録済み写真</p>
                        <p className="mt-2 text-sm text-slate-300">{therapistPhotos.length}枚</p>
                        <p className="mt-2 text-xs text-slate-400">
                            公開中または確認中の写真: {approvedOrPendingPhotoCount}枚
                        </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                        <p className="text-sm font-semibold text-white">公開前の目安</p>
                        <p className="mt-2 text-sm leading-7 text-slate-300">
                            写真が1枚以上あると、公開プロフィールの雰囲気が伝わりやすくなります。
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-3 pt-2">
                        <Link
                            to="/therapist/onboarding"
                            className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                        >
                            準備状況を確認
                        </Link>
                        <Link
                            to="/therapist/availability"
                            className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                        >
                            空き枠へ進む
                        </Link>
                    </div>
                </article>
            </section>

            <section className="space-y-5 rounded-[24px] border border-white/10 bg-white/5 p-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">対応内容</p>
                        <h2 className="text-xl font-semibold text-white">提供内容と時間単価</h2>
                        <p className="text-sm leading-7 text-slate-300">
                            公開プロフィールには有効な対応内容が最低1件必要です。内容、最短時間、料金を整えると、そのまま公開条件に反映されます。
                        </p>
                    </div>
                </div>

                <div className="space-y-4">
                    {menuDrafts.map((draft) => (
                        <article key={draft.public_id ?? 'draft'} className="rounded-[22px] border border-white/10 bg-[#111923] p-5">
                            <div className="grid gap-4 md:grid-cols-2">
                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-white">対応内容名</span>
                                    <input
                                        value={draft.name}
                                        onChange={(event) => updateMenuDraft(draft.public_id, { name: event.target.value })}
                                        className="w-full rounded-[16px] border border-white/10 bg-transparent px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                    />
                                </label>
                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-white">最短時間（分）</span>
                                    <input
                                        type="number"
                                        min={30}
                                        max={240}
                                        step={15}
                                        value={draft.minimum_duration_minutes}
                                        onChange={(event) => updateMenuDraft(draft.public_id, { minimum_duration_minutes: Number(event.target.value) })}
                                        className="w-full rounded-[16px] border border-white/10 bg-transparent px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                    />
                                </label>
                            </div>

                            <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_140px]">
                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-white">説明</span>
                                    <input
                                        value={draft.description}
                                        onChange={(event) => updateMenuDraft(draft.public_id, { description: event.target.value })}
                                        className="w-full rounded-[16px] border border-white/10 bg-transparent px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                    />
                                </label>
                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-white">60分料金（円）</span>
                                    <input
                                        type="number"
                                        min={1000}
                                        max={300000}
                                        step={500}
                                        value={draft.hourly_rate_amount}
                                        onChange={(event) => updateMenuDraft(draft.public_id, { hourly_rate_amount: Number(event.target.value) })}
                                        className="w-full rounded-[16px] border border-white/10 bg-transparent px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                    />
                                </label>
                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-white">並び順</span>
                                    <input
                                        type="number"
                                        min={0}
                                        max={1000}
                                        value={draft.sort_order}
                                        onChange={(event) => updateMenuDraft(draft.public_id, { sort_order: Number(event.target.value) })}
                                        className="w-full rounded-[16px] border border-white/10 bg-transparent px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                    />
                                </label>
                            </div>

                            <div className="mt-4 flex flex-wrap items-center gap-3">
                                <label className="inline-flex items-center gap-3 rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200">
                                    <input
                                        type="checkbox"
                                        checked={draft.is_active}
                                        onChange={(event) => updateMenuDraft(draft.public_id, { is_active: event.target.checked })}
                                        className="h-4 w-4 rounded border-white/20 bg-transparent"
                                    />
                                    公開中
                                </label>

                                <button
                                    type="button"
                                    onClick={() => {
                                        void saveMenu(draft);
                                    }}
                                    disabled={pendingMenuId === draft.public_id}
                                    className="inline-flex items-center rounded-full bg-rose-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {pendingMenuId === draft.public_id ? '保存中...' : 'この内容を保存'}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        if (draft.public_id) {
                                            void deleteMenu(draft.public_id);
                                        }
                                    }}
                                    disabled={pendingMenuId === draft.public_id}
                                    className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    削除
                                </button>
                            </div>
                        </article>
                    ))}
                </div>

                <article className="rounded-[22px] border border-dashed border-white/15 bg-[#111923] p-5">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <p className="text-sm font-semibold text-white">新しい対応内容を追加</p>
                            <p className="text-sm leading-7 text-slate-300">
                                対応内容、最短時間、60分料金を決めて、まず1件目の公開内容を作ると公開条件が整いやすくなります。
                            </p>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-white">対応内容名</span>
                                <input
                                    value={newMenuDraft.name}
                                    onChange={(event) => setNewMenuDraft((current) => ({ ...current, name: event.target.value }))}
                                    className="w-full rounded-[16px] border border-white/10 bg-transparent px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                    placeholder="例: リラクゼーション / デート / ご飯"
                                />
                            </label>
                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-white">最短時間（分）</span>
                                <input
                                    type="number"
                                    min={30}
                                    max={240}
                                    step={15}
                                    value={newMenuDraft.minimum_duration_minutes}
                                    onChange={(event) => setNewMenuDraft((current) => ({ ...current, minimum_duration_minutes: Number(event.target.value) }))}
                                    className="w-full rounded-[16px] border border-white/10 bg-transparent px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                />
                            </label>
                        </div>

                        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_140px]">
                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-white">説明</span>
                                <input
                                    value={newMenuDraft.description}
                                    onChange={(event) => setNewMenuDraft((current) => ({ ...current, description: event.target.value }))}
                                    className="w-full rounded-[16px] border border-white/10 bg-transparent px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                    placeholder="例: もみほぐし中心 / ゆったり会話OK / 食事のみも可"
                                />
                            </label>
                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-white">60分料金（円）</span>
                                <input
                                    type="number"
                                    min={1000}
                                    max={300000}
                                    step={500}
                                    value={newMenuDraft.hourly_rate_amount}
                                    onChange={(event) => setNewMenuDraft((current) => ({ ...current, hourly_rate_amount: Number(event.target.value) }))}
                                    className="w-full rounded-[16px] border border-white/10 bg-transparent px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                />
                            </label>
                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-white">並び順</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={1000}
                                    value={newMenuDraft.sort_order}
                                    onChange={(event) => setNewMenuDraft((current) => ({ ...current, sort_order: Number(event.target.value) }))}
                                    className="w-full rounded-[16px] border border-white/10 bg-transparent px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                />
                            </label>
                        </div>

                        <button
                            type="button"
                            onClick={() => {
                                void createMenu();
                            }}
                            disabled={pendingMenuId === 'new'}
                            className="inline-flex items-center rounded-full bg-rose-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {pendingMenuId === 'new' ? '追加中...' : '対応内容を追加する'}
                        </button>
                    </div>
                </article>
            </section>
        </div>
    );
}
