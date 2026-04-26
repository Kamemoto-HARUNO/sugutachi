import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { formatRoleLabel, getActiveRoles } from '../lib/account';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import type {
    ApiEnvelope,
    MeProfileRecord,
    SelfProfilePhotoSummary,
    UserProfileRecord,
} from '../lib/types';

const ageOptions = [
    { value: '18_24', label: '18-24歳' },
    { value: '20s', label: '20代' },
    { value: '30s', label: '30代' },
    { value: '40s', label: '40代' },
    { value: '50s', label: '50代' },
    { value: '60_plus', label: '60代以上' },
];

const bodyTypeOptions = [
    { value: 'slim', label: '細身' },
    { value: 'average', label: '普通' },
    { value: 'muscular', label: '筋肉質' },
    { value: 'chubby', label: 'ぽっちゃり' },
    { value: 'large', label: '大柄' },
    { value: 'other', label: 'その他' },
];

const weightRangeOptions = [
    { value: '40_49', label: '40-49kg' },
    { value: '50_59', label: '50-59kg' },
    { value: '60_69', label: '60-69kg' },
    { value: '70_79', label: '70-79kg' },
    { value: '80_89', label: '80-89kg' },
    { value: '90_plus', label: '90kg以上' },
];

const orientationOptions = [
    { value: 'gay', label: 'ゲイ' },
    { value: 'bi', label: 'バイ' },
    { value: 'straight', label: 'ストレート' },
    { value: 'other', label: 'その他' },
    { value: 'no_answer', label: '回答しない' },
];

const genderIdentityOptions = [
    { value: 'cis_male', label: 'シス男性' },
    { value: 'trans_male', label: 'トランス男性' },
    { value: 'other', label: 'その他' },
    { value: 'no_answer', label: '回答しない' },
];

interface UserProfileFormState {
    age_range: string;
    body_type: string;
    height_cm: string;
    weight_range: string;
    preferencesText: string;
    touchNgText: string;
    health_notes: string;
    sexual_orientation: string;
    gender_identity: string;
    disclose_sensitive_profile_to_therapist: boolean;
}

function emptyUserProfileForm(): UserProfileFormState {
    return {
        age_range: '',
        body_type: '',
        height_cm: '',
        weight_range: '',
        preferencesText: '',
        touchNgText: '',
        health_notes: '',
        sexual_orientation: '',
        gender_identity: '',
        disclose_sensitive_profile_to_therapist: false,
    };
}

function normalizeListInput(value: string): string[] {
    return value
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function stringifyListInput(value: Record<string, string> | string[] | null | undefined): string {
    if (!value) {
        return '';
    }

    if (Array.isArray(value)) {
        return value.join('\n');
    }

    return Object.entries(value)
        .map(([key, entryValue]) => `${key}: ${entryValue}`)
        .join('\n');
}

function buildUserProfileForm(profile: UserProfileRecord | null): UserProfileFormState {
    if (!profile) {
        return emptyUserProfileForm();
    }

    return {
        age_range: profile.age_range ?? '',
        body_type: profile.body_type ?? '',
        height_cm: profile.height_cm ? String(profile.height_cm) : '',
        weight_range: profile.weight_range ?? '',
        preferencesText: stringifyListInput(profile.preferences),
        touchNgText: stringifyListInput(profile.touch_ng),
        health_notes: profile.health_notes ?? '',
        sexual_orientation: profile.sexual_orientation ?? '',
        gender_identity: profile.gender_identity ?? '',
        disclose_sensitive_profile_to_therapist: profile.disclose_sensitive_profile_to_therapist,
    };
}

function parsePreferences(value: string): Record<string, string> | string[] | null {
    const lines = value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);

    if (lines.length === 0) {
        return null;
    }

    const parsedEntries = lines
        .map((line) => {
            const separatorIndex = line.indexOf(':');

            if (separatorIndex === -1) {
                return null;
            }

            const key = line.slice(0, separatorIndex).trim();
            const entryValue = line.slice(separatorIndex + 1).trim();

            if (!key || !entryValue) {
                return null;
            }

            return [key, entryValue] as const;
        })
        .filter((entry): entry is readonly [string, string] => entry !== null);

    if (parsedEntries.length === lines.length) {
        return Object.fromEntries(parsedEntries);
    }

    return lines;
}

function profileStatusLabel(status: string | null): string {
    switch (status) {
        case 'active':
            return '入力完了';
        case 'incomplete':
            return '入力途中';
        default:
            return '未作成';
    }
}

function profileStatusTone(status: string | null): string {
    switch (status) {
        case 'active':
            return 'bg-[#e9f4ea] text-[#24553a]';
        case 'incomplete':
            return 'bg-[#fff2dd] text-[#8b5a16]';
        default:
            return 'bg-[#f1efe8] text-[#48505a]';
    }
}

function verificationLabel(status: string | null | undefined): string {
    switch (status) {
        case 'approved':
            return '承認済み';
        case 'pending':
            return '審査中';
        case 'rejected':
            return '差し戻し';
        default:
            return '未提出';
    }
}

function verificationTone(status: string | null | undefined): string {
    switch (status) {
        case 'approved':
            return 'bg-[#e9f4ea] text-[#24553a]';
        case 'pending':
            return 'bg-[#fff2dd] text-[#8b5a16]';
        case 'rejected':
            return 'bg-[#f7e7e3] text-[#8c4738]';
        default:
            return 'bg-[#f1efe8] text-[#48505a]';
    }
}

function formatDateTime(value: string | null): string {
    if (!value) {
        return '未設定';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '未設定';
    }

    return new Intl.DateTimeFormat('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

function PhotoStrip({ photos }: { photos: SelfProfilePhotoSummary[] }) {
    if (photos.length === 0) {
        return (
            <div className="rounded-[20px] border border-dashed border-[#d8c9b2] bg-[#fffaf3] px-4 py-5 text-sm leading-7 text-[#68707a]">
                まだプロフィール写真はありません。写真アップロード導線は次の画面でつないでいきます。
            </div>
        );
    }

    return (
        <div className="grid gap-3 sm:grid-cols-2">
            {photos.map((photo) => (
                <article
                    key={photo.id}
                    className="overflow-hidden rounded-[22px] border border-[#ebe2d3] bg-[#fffcf7]"
                >
                    <div className="aspect-[1.1] bg-[#efe7d9]">
                        {photo.url ? (
                            <img src={photo.url} alt="" className="h-full w-full object-cover" />
                        ) : (
                            <div className="flex h-full items-center justify-center text-sm font-semibold text-[#7a7066]">
                                画像を準備中
                            </div>
                        )}
                    </div>
                    <div className="space-y-2 px-4 py-4 text-sm text-[#48505a]">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-[#f5efe4] px-3 py-1 text-xs font-semibold text-[#48505a]">
                                {photo.usage_type === 'account_profile' ? '共通プロフィール' : 'セラピスト用'}
                            </span>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${profileStatusTone(photo.status)}`}>
                                {photo.status}
                            </span>
                        </div>
                        {photo.rejection_reason_code ? (
                            <p className="text-xs leading-6 text-[#9a4b35]">差し戻し理由: {photo.rejection_reason_code}</p>
                        ) : null}
                    </div>
                </article>
            ))}
        </div>
    );
}

export function UserProfilePage() {
    const { account, refreshAccount, token } = useAuth();
    const [meProfile, setMeProfile] = useState<MeProfileRecord | null>(null);
    const [userProfile, setUserProfile] = useState<UserProfileRecord | null>(null);
    const [displayName, setDisplayName] = useState('');
    const [phoneE164, setPhoneE164] = useState('');
    const [userForm, setUserForm] = useState<UserProfileFormState>(emptyUserProfileForm());
    const [pageError, setPageError] = useState<string | null>(null);
    const [commonError, setCommonError] = useState<string | null>(null);
    const [userError, setUserError] = useState<string | null>(null);
    const [commonSuccess, setCommonSuccess] = useState<string | null>(null);
    const [userSuccess, setUserSuccess] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSavingCommon, setIsSavingCommon] = useState(false);
    const [isSavingUser, setIsSavingUser] = useState(false);

    usePageTitle('利用者プロフィール');

    const loadData = useCallback(async () => {
        if (!token) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);

        try {
            const [meProfilePayload, userProfilePayload] = await Promise.all([
                apiRequest<ApiEnvelope<MeProfileRecord>>('/me/profile', { token }),
                apiRequest<ApiEnvelope<UserProfileRecord | null>>('/me/user-profile', { token }),
            ]);

            const nextMeProfile = unwrapData(meProfilePayload);
            const nextUserProfile = unwrapData(userProfilePayload);

            setMeProfile(nextMeProfile);
            setUserProfile(nextUserProfile);
            setDisplayName(nextMeProfile.display_name ?? '');
            setPhoneE164(nextMeProfile.phone_e164 ?? '');
            setUserForm(buildUserProfileForm(nextUserProfile));
            setPageError(null);
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : 'プロフィール情報の取得に失敗しました。';

            setPageError(message);
        } finally {
            setIsLoading(false);
        }
    }, [token]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const activeRoles = useMemo(() => getActiveRoles(account), [account]);

    function updateUserForm<K extends keyof UserProfileFormState>(key: K, value: UserProfileFormState[K]) {
        setUserForm((current) => ({
            ...current,
            [key]: value,
        }));
    }

    async function handleCommonSave(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token) {
            return;
        }

        setIsSavingCommon(true);
        setCommonError(null);
        setCommonSuccess(null);
        setPageError(null);

        try {
            const payload = await apiRequest<ApiEnvelope<MeProfileRecord>>('/me/profile', {
                method: 'PATCH',
                token,
                body: {
                    display_name: displayName.trim() || null,
                    phone_e164: phoneE164.trim() || null,
                },
            });

            const nextProfile = unwrapData(payload);
            setMeProfile(nextProfile);
            setDisplayName(nextProfile.display_name ?? '');
            setPhoneE164(nextProfile.phone_e164 ?? '');
            setCommonSuccess('共通プロフィールを更新しました。');
            await refreshAccount();
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '共通プロフィールの更新に失敗しました。';

            setCommonError(message);
        } finally {
            setIsSavingCommon(false);
        }
    }

    async function handleUserProfileSave(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token) {
            return;
        }

        setIsSavingUser(true);
        setUserError(null);
        setUserSuccess(null);
        setPageError(null);

        try {
            const payload = await apiRequest<ApiEnvelope<UserProfileRecord>>('/me/user-profile', {
                method: 'PUT',
                token,
                body: {
                    age_range: userForm.age_range || null,
                    body_type: userForm.body_type || null,
                    height_cm: userForm.height_cm ? Number(userForm.height_cm) : null,
                    weight_range: userForm.weight_range || null,
                    preferences: parsePreferences(userForm.preferencesText),
                    touch_ng: normalizeListInput(userForm.touchNgText),
                    health_notes: userForm.health_notes.trim() || null,
                    sexual_orientation: userForm.sexual_orientation || null,
                    gender_identity: userForm.gender_identity || null,
                    disclose_sensitive_profile_to_therapist: userForm.disclose_sensitive_profile_to_therapist,
                },
            });

            const nextUserProfile = unwrapData(payload);
            setUserProfile(nextUserProfile);
            setUserForm(buildUserProfileForm(nextUserProfile));
            setUserSuccess('利用者プロフィールを更新しました。');
            await refreshAccount();
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '利用者プロフィールの更新に失敗しました。';

            setUserError(message);
        } finally {
            setIsSavingUser(false);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="プロフィールを読み込み中" message="共通情報と利用者プロフィールをまとめています。" />;
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[32px] bg-[linear-gradient(117deg,#17202b_0%,#243447_52%,#2b4158_100%)] p-7 text-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${profileStatusTone(userProfile?.profile_status ?? null)}`}>
                                {profileStatusLabel(userProfile?.profile_status ?? null)}
                            </span>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${verificationTone(meProfile?.latest_identity_verification?.status)}`}>
                                本人確認 {verificationLabel(meProfile?.latest_identity_verification?.status)}
                            </span>
                        </div>
                        <div className="space-y-2">
                            <h1 className="text-3xl font-semibold">利用者プロフィール</h1>
                            <p className="max-w-3xl text-sm leading-7 text-slate-300">
                                共通アカウント情報と、見積もりやマッチングで使う利用者プロフィールをまとめて管理します。
                                センシティブ項目の開示設定もここで調整できます。
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Link
                            to="/user/service-addresses"
                            className="inline-flex items-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8"
                        >
                            施術場所を管理
                        </Link>
                        <Link
                            to="/role-select"
                            className="inline-flex items-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:brightness-105"
                        >
                            モード管理
                        </Link>
                    </div>
                </div>
            </section>

            {pageError ? (
                <section className="rounded-[24px] border border-[#f1d4b5] bg-[#fff4e8] px-5 py-4 text-sm text-[#9a4b35]">
                    {pageError}
                </section>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                <section className="space-y-6">
                    <form
                        onSubmit={handleCommonSave}
                        className="space-y-5 rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]"
                    >
                        <div className="space-y-2">
                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">ACCOUNT</p>
                            <h2 className="text-2xl font-semibold text-[#17202b]">共通アカウント情報</h2>
                        </div>

                        <div className="grid gap-5 md:grid-cols-2">
                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">表示名</span>
                                <input
                                    value={displayName}
                                    onChange={(event) => setDisplayName(event.target.value)}
                                    className="w-full rounded-[18px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#c6a16a]"
                                    placeholder="アプリ内に表示する名前"
                                />
                            </label>

                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">電話番号</span>
                                <input
                                    value={phoneE164}
                                    onChange={(event) => setPhoneE164(event.target.value)}
                                    className="w-full rounded-[18px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#c6a16a]"
                                    placeholder="+819012345678"
                                />
                                <p className="text-xs text-[#7a7066]">変更すると電話認証状態は未確認に戻ります。</p>
                            </label>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">メールアドレス</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b] break-all">{meProfile?.email ?? '未設定'}</p>
                            </div>
                            <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">電話認証</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                    {meProfile?.phone_verified_at ? '確認済み' : '未確認'}
                                </p>
                            </div>
                            <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">有効ロール</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {activeRoles.map((role) => (
                                        <span key={role} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#17202b]">
                                            {formatRoleLabel(role)}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">年齢確認</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                    {meProfile?.latest_identity_verification?.is_age_verified ? '確認済み' : '未確認'}
                                </p>
                            </div>
                        </div>

                        {commonError ? (
                            <div className="rounded-[20px] border border-[#f1d4b5] bg-[#fff4e8] px-4 py-3 text-sm text-[#9a4b35]">
                                {commonError}
                            </div>
                        ) : null}

                        {commonSuccess ? (
                            <div className="rounded-[20px] border border-[#cfe5d5] bg-[#edf8f0] px-4 py-3 text-sm text-[#24553a]">
                                {commonSuccess}
                            </div>
                        ) : null}

                        <button
                            type="submit"
                            disabled={isSavingCommon}
                            className="inline-flex items-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isSavingCommon ? '保存中...' : '共通情報を保存する'}
                        </button>
                    </form>

                    <form
                        onSubmit={handleUserProfileSave}
                        className="space-y-5 rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]"
                    >
                        <div className="space-y-2">
                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">USER PROFILE</p>
                            <h2 className="text-2xl font-semibold text-[#17202b]">利用者プロフィール</h2>
                            <p className="text-sm leading-7 text-[#68707a]">
                                動的料金やセラピストへの開示設定で使う項目です。必須項目がそろうとプロフィールは入力完了になります。
                            </p>
                        </div>

                        <div className="grid gap-5 md:grid-cols-2">
                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">年齢帯</span>
                                <select
                                    value={userForm.age_range}
                                    onChange={(event) => updateUserForm('age_range', event.target.value)}
                                    className="w-full rounded-[18px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#c6a16a]"
                                >
                                    <option value="">選択してください</option>
                                    {ageOptions.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </label>

                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">体型</span>
                                <select
                                    value={userForm.body_type}
                                    onChange={(event) => updateUserForm('body_type', event.target.value)}
                                    className="w-full rounded-[18px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#c6a16a]"
                                >
                                    <option value="">選択してください</option>
                                    {bodyTypeOptions.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </label>

                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">身長</span>
                                <input
                                    value={userForm.height_cm}
                                    onChange={(event) => updateUserForm('height_cm', event.target.value.replace(/[^\d]/g, ''))}
                                    inputMode="numeric"
                                    className="w-full rounded-[18px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#c6a16a]"
                                    placeholder="172"
                                />
                            </label>

                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">体重帯</span>
                                <select
                                    value={userForm.weight_range}
                                    onChange={(event) => updateUserForm('weight_range', event.target.value)}
                                    className="w-full rounded-[18px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#c6a16a]"
                                >
                                    <option value="">選択してください</option>
                                    {weightRangeOptions.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </label>

                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">性的指向</span>
                                <select
                                    value={userForm.sexual_orientation}
                                    onChange={(event) => updateUserForm('sexual_orientation', event.target.value)}
                                    className="w-full rounded-[18px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#c6a16a]"
                                >
                                    <option value="">選択してください</option>
                                    {orientationOptions.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </label>

                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">性自認</span>
                                <select
                                    value={userForm.gender_identity}
                                    onChange={(event) => updateUserForm('gender_identity', event.target.value)}
                                    className="w-full rounded-[18px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#c6a16a]"
                                >
                                    <option value="">選択してください</option>
                                    {genderIdentityOptions.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <div className="grid gap-5 md:grid-cols-2">
                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">希望条件</span>
                                <textarea
                                    value={userForm.preferencesText}
                                    onChange={(event) => updateUserForm('preferencesText', event.target.value)}
                                    rows={5}
                                    className="w-full rounded-[20px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm leading-7 text-[#17202b] outline-none transition focus:border-[#c6a16a]"
                                    placeholder={'pressure: normal\natmosphere: quiet'}
                                />
                                <p className="text-xs text-[#7a7066]">1行ごとに `項目: 値` で入力します。単語だけの行も保存できます。</p>
                            </label>

                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">NG部位・避けたいこと</span>
                                <textarea
                                    value={userForm.touchNgText}
                                    onChange={(event) => updateUserForm('touchNgText', event.target.value)}
                                    rows={5}
                                    className="w-full rounded-[20px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm leading-7 text-[#17202b] outline-none transition focus:border-[#c6a16a]"
                                    placeholder={'face\nneck'}
                                />
                                <p className="text-xs text-[#7a7066]">改行かカンマ区切りで入力できます。</p>
                            </label>
                        </div>

                        <label className="block space-y-2">
                            <span className="text-sm font-semibold text-[#17202b]">体調メモ</span>
                            <textarea
                                value={userForm.health_notes}
                                onChange={(event) => updateUserForm('health_notes', event.target.value)}
                                rows={4}
                                className="w-full rounded-[20px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm leading-7 text-[#17202b] outline-none transition focus:border-[#c6a16a]"
                                placeholder="腰に不安あり、強い圧は避けたい、など"
                            />
                        </label>

                        <label className="flex items-start gap-3 rounded-[20px] border border-[#ebe2d3] bg-[#fffcf7] px-4 py-4">
                            <input
                                type="checkbox"
                                checked={userForm.disclose_sensitive_profile_to_therapist}
                                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                    updateUserForm('disclose_sensitive_profile_to_therapist', event.target.checked)
                                }
                                className="mt-1 h-4 w-4 rounded border-[#ccb387] text-[#b5894d] focus:ring-[#b5894d]"
                            />
                            <div className="space-y-1">
                                <p className="text-sm font-semibold text-[#17202b]">センシティブ項目をセラピストへ開示する</p>
                                <p className="text-sm leading-7 text-[#68707a]">
                                    性的指向・性自認・体調メモなど、施術前に共有したい内容をセラピスト側に表示できるようにします。
                                </p>
                            </div>
                        </label>

                        {userError ? (
                            <div className="rounded-[20px] border border-[#f1d4b5] bg-[#fff4e8] px-4 py-3 text-sm text-[#9a4b35]">
                                {userError}
                            </div>
                        ) : null}

                        {userSuccess ? (
                            <div className="rounded-[20px] border border-[#cfe5d5] bg-[#edf8f0] px-4 py-3 text-sm text-[#24553a]">
                                {userSuccess}
                            </div>
                        ) : null}

                        <button
                            type="submit"
                            disabled={isSavingUser}
                            className="inline-flex items-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isSavingUser ? '保存中...' : '利用者プロフィールを保存する'}
                        </button>
                    </form>

                    <section className="space-y-5 rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <div className="space-y-2">
                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">PHOTOS</p>
                            <h2 className="text-2xl font-semibold text-[#17202b]">プロフィール写真</h2>
                        </div>
                        <PhotoStrip photos={meProfile?.photos ?? []} />
                    </section>
                </section>

                <aside className="space-y-5">
                    <section className="rounded-[28px] bg-[#fffcf7] p-6 shadow-[0_18px_36px_rgba(23,32,43,0.1)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">PROFILE STATUS</p>
                        <div className="mt-4 space-y-4 text-sm text-[#48505a]">
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">利用者プロフィール</p>
                                <p className="mt-1 font-semibold text-[#17202b]">{profileStatusLabel(userProfile?.profile_status ?? null)}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">本人確認</p>
                                <p className="mt-1 font-semibold text-[#17202b]">{verificationLabel(meProfile?.latest_identity_verification?.status)}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">年齢確認</p>
                                <p className="mt-1 font-semibold text-[#17202b]">
                                    {meProfile?.latest_identity_verification?.is_age_verified ? '確認済み' : '未確認'}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">最終提出</p>
                                <p className="mt-1 font-semibold text-[#17202b]">
                                    {formatDateTime(meProfile?.latest_identity_verification?.submitted_at ?? null)}
                                </p>
                            </div>
                        </div>

                        <div className="mt-6 space-y-3">
                            <Link
                                to="/identity-verification"
                                className="inline-flex w-full items-center justify-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                            >
                                本人確認へ
                            </Link>
                            <Link
                                to="/user/bookings"
                                className="inline-flex w-full items-center justify-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                            >
                                予約一覧を見る
                            </Link>
                        </div>
                    </section>
                </aside>
            </div>
        </div>
    );
}
