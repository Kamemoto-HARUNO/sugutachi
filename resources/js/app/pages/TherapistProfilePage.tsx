import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatProfileStatus, formatRejectionReason } from '../lib/therapist';
import type {
    ApiEnvelope,
    TherapistMenu,
    TherapistProfileRecord,
    TherapistReviewStatus,
} from '../lib/types';

interface MenuDraft {
    public_id: string | null;
    name: string;
    description: string;
    duration_minutes: number;
    base_price_amount: number;
    is_active: boolean;
    sort_order: number;
}

const trainingOptions = [
    { value: 'none', label: '研修情報なし' },
    { value: 'in_progress', label: '研修中' },
    { value: 'completed', label: '研修済み' },
    { value: 'pending', label: '審査待ち' },
];

function createMenuDraft(menu?: TherapistMenu): MenuDraft {
    return {
        public_id: menu?.public_id ?? null,
        name: menu?.name ?? '',
        description: menu?.description ?? '',
        duration_minutes: menu?.duration_minutes ?? 60,
        base_price_amount: menu?.base_price_amount ?? 12000,
        is_active: menu?.is_active ?? true,
        sort_order: menu?.sort_order ?? 0,
    };
}

export function TherapistProfilePage() {
    const { token } = useAuth();
    const [profile, setProfile] = useState<TherapistProfileRecord | null>(null);
    const [reviewStatus, setReviewStatus] = useState<TherapistReviewStatus | null>(null);
    const [publicName, setPublicName] = useState('');
    const [bio, setBio] = useState('');
    const [trainingStatus, setTrainingStatus] = useState('none');
    const [menuDrafts, setMenuDrafts] = useState<MenuDraft[]>([]);
    const [newMenuDraft, setNewMenuDraft] = useState<MenuDraft>(createMenuDraft());
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [pendingMenuId, setPendingMenuId] = useState<string | null>(null);
    const [isSubmittingReview, setIsSubmittingReview] = useState(false);

    usePageTitle('セラピストプロフィール');

    const loadData = useCallback(async () => {
        if (!token) {
            return;
        }

        const [profilePayload, reviewPayload] = await Promise.all([
            apiRequest<ApiEnvelope<TherapistProfileRecord>>('/me/therapist-profile', { token }),
            apiRequest<ApiEnvelope<TherapistReviewStatus>>('/me/therapist-profile/review-status', { token }),
        ]);

        const nextProfile = unwrapData(profilePayload);
        const nextReviewStatus = unwrapData(reviewPayload);

        setProfile(nextProfile);
        setReviewStatus(nextReviewStatus);
        setPublicName(nextProfile.public_name ?? '');
        setBio(nextProfile.bio ?? '');
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
    const canSubmit = reviewStatus?.can_submit ?? false;

    function updateMenuDraft(publicId: string | null, patch: Partial<MenuDraft>) {
        setMenuDrafts((current) => current.map((draft) => (
            draft.public_id === publicId ? { ...draft, ...patch } : draft
        )));
    }

    async function refreshAfterMutation(nextSuccessMessage?: string) {
        await loadData();
        if (nextSuccessMessage) {
            setSuccessMessage(nextSuccessMessage);
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
                    duration_minutes: draft.duration_minutes,
                    base_price_amount: draft.base_price_amount,
                    is_active: draft.is_active,
                    sort_order: draft.sort_order,
                },
            });

            await refreshAfterMutation('メニューを更新しました。');
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : 'メニューの更新に失敗しました。';

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
                    duration_minutes: newMenuDraft.duration_minutes,
                    base_price_amount: newMenuDraft.base_price_amount,
                    sort_order: newMenuDraft.sort_order,
                },
            });

            setNewMenuDraft(createMenuDraft());
            await refreshAfterMutation('メニューを追加しました。');
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : 'メニューの追加に失敗しました。';

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

            await refreshAfterMutation('メニューを削除しました。');
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : 'メニューの削除に失敗しました。';

            setError(message);
        } finally {
            setPendingMenuId(null);
        }
    }

    async function submitReview() {
        if (!token || !canSubmit) {
            return;
        }

        setIsSubmittingReview(true);
        setError(null);
        setSuccessMessage(null);

        try {
            await apiRequest<ApiEnvelope<unknown>>('/me/therapist-profile/submit-review', {
                method: 'POST',
                token,
            });

            await refreshAfterMutation('プロフィールを審査へ提出しました。');
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '審査提出に失敗しました。';

            setError(message);
        } finally {
            setIsSubmittingReview(false);
        }
    }

    const activeMenuCount = useMemo(() => {
        return menuDrafts.filter((menu) => menu.is_active).length;
    }, [menuDrafts]);

    if (isLoading) {
        return <LoadingScreen title="プロフィールを読み込み中" message="公開プロフィールとメニュー情報を準備しています。" />;
    }

    return (
        <div className="space-y-8">
            <section className="space-y-4 rounded-[28px] border border-white/10 bg-white/5 p-6 md:p-8">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">PROFILE</p>
                        <h1 className="text-3xl font-semibold text-white">セラピストプロフィール</h1>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            公開名、紹介文、研修ステータス、メニューを整える画面です。承認済みプロフィールを変更すると、再確認のため下書きに戻ります。
                        </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#111923] px-5 py-4 text-sm text-slate-200">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">PROFILE STATUS</p>
                        <p className="mt-2 text-2xl font-semibold text-white">
                            {formatProfileStatus(profile?.profile_status)}
                        </p>
                        <p className="mt-2 text-xs text-slate-400">
                            有効メニュー {activeMenuCount}件 / 写真審査 {profile?.photo_review_status}
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
                    <Link
                        to="/therapist/photos"
                        className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                    >
                        写真審査へ
                    </Link>
                </div>

                {error ? (
                    <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                        {error}
                    </div>
                ) : null}

                {successMessage ? (
                    <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                        {successMessage}
                    </div>
                ) : null}

                {profile?.rejected_reason_code ? (
                    <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-7 text-amber-100">
                        差し戻し理由: {formatRejectionReason(profile.rejected_reason_code)}
                    </div>
                ) : null}
            </section>

            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <form onSubmit={handleProfileSave} className="space-y-5 rounded-[24px] border border-white/10 bg-white/5 p-6">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">BASIC INFO</p>
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

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-white">自己紹介</span>
                        <textarea
                            value={bio}
                            onChange={(event) => setBio(event.target.value)}
                            rows={6}
                            className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                            placeholder="施術の雰囲気や得意なケア、安心してもらうための自己紹介を入力"
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
                        <p className="text-xs font-semibold tracking-wide text-rose-200">REVIEW READINESS</p>
                        <h2 className="text-xl font-semibold text-white">審査提出の準備</h2>
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

                    <button
                        type="button"
                        onClick={() => {
                            void submitReview();
                        }}
                        disabled={!canSubmit || isSubmittingReview || profile?.profile_status === 'pending' || profile?.profile_status === 'approved'}
                        className="inline-flex items-center rounded-full bg-rose-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isSubmittingReview ? '提出中...' : profile?.profile_status === 'pending' ? '審査中です' : profile?.profile_status === 'approved' ? '承認済みです' : '審査へ提出する'}
                    </button>

                    <p className="text-sm leading-7 text-slate-300">
                        本人確認承認と有効メニューが揃うと審査提出できます。写真審査や Stripe Connect は公開準備としてこのあと続けて整えます。
                    </p>
                </article>
            </section>

            <section className="space-y-5 rounded-[24px] border border-white/10 bg-white/5 p-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">MENUS</p>
                        <h2 className="text-xl font-semibold text-white">提供メニュー</h2>
                        <p className="text-sm leading-7 text-slate-300">
                            公開審査には有効メニューが最低1件必要です。内容や料金を変えると、承認済みプロフィールでも再確認のため下書きに戻ります。
                        </p>
                    </div>
                </div>

                <div className="space-y-4">
                    {menuDrafts.map((draft) => (
                        <article key={draft.public_id ?? 'draft'} className="rounded-[22px] border border-white/10 bg-[#111923] p-5">
                            <div className="grid gap-4 md:grid-cols-2">
                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-white">メニュー名</span>
                                    <input
                                        value={draft.name}
                                        onChange={(event) => updateMenuDraft(draft.public_id, { name: event.target.value })}
                                        className="w-full rounded-[16px] border border-white/10 bg-transparent px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                    />
                                </label>
                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-white">所要時間（分）</span>
                                    <input
                                        type="number"
                                        min={30}
                                        max={240}
                                        step={15}
                                        value={draft.duration_minutes}
                                        onChange={(event) => updateMenuDraft(draft.public_id, { duration_minutes: Number(event.target.value) })}
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
                                    <span className="text-sm font-semibold text-white">基本料金（円）</span>
                                    <input
                                        type="number"
                                        min={1000}
                                        max={300000}
                                        step={500}
                                        value={draft.base_price_amount}
                                        onChange={(event) => updateMenuDraft(draft.public_id, { base_price_amount: Number(event.target.value) })}
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
                                    {pendingMenuId === draft.public_id ? '保存中...' : 'このメニューを保存'}
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
                            <p className="text-sm font-semibold text-white">新しいメニューを追加</p>
                            <p className="text-sm leading-7 text-slate-300">
                                時間と基本料金を決めて、まず1件目の有効メニューを作ると審査提出の条件に近づきます。
                            </p>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-white">メニュー名</span>
                                <input
                                    value={newMenuDraft.name}
                                    onChange={(event) => setNewMenuDraft((current) => ({ ...current, name: event.target.value }))}
                                    className="w-full rounded-[16px] border border-white/10 bg-transparent px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                    placeholder="例: ボディケア 60分"
                                />
                            </label>
                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-white">所要時間（分）</span>
                                <input
                                    type="number"
                                    min={30}
                                    max={240}
                                    step={15}
                                    value={newMenuDraft.duration_minutes}
                                    onChange={(event) => setNewMenuDraft((current) => ({ ...current, duration_minutes: Number(event.target.value) }))}
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
                                    placeholder="例: もみほぐし中心 / ゆったり会話OK"
                                />
                            </label>
                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-white">基本料金（円）</span>
                                <input
                                    type="number"
                                    min={1000}
                                    max={300000}
                                    step={500}
                                    value={newMenuDraft.base_price_amount}
                                    onChange={(event) => setNewMenuDraft((current) => ({ ...current, base_price_amount: Number(event.target.value) }))}
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
                            {pendingMenuId === 'new' ? '追加中...' : 'メニューを追加する'}
                        </button>
                    </div>
                </article>
            </section>
        </div>
    );
}
