import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { BrandMark } from '../components/brand/BrandMark';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { formatRoleLabel, getActiveRoles, getRoleHomePath, type RoleName } from '../lib/account';
import { ApiError, apiRequest, getFieldError, unwrapData } from '../lib/api';
import { toDisplayPhoneNumber, toDomesticDigits, toE164PhoneNumber } from '../lib/phone';
import { formatDateTime, formatIdentityVerificationStatus } from '../lib/therapist';
import type {
    ApiEnvelope,
    MeProfileRecord,
} from '../lib/types';

function verificationTone(status: string | null | undefined): string {
    switch (status) {
        case 'approved':
            return 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100';
        case 'pending':
            return 'border-amber-300/30 bg-amber-300/10 text-amber-100';
        case 'rejected':
            return 'border-rose-300/30 bg-rose-300/10 text-rose-100';
        default:
            return 'border-white/10 bg-white/5 text-slate-200';
    }
}

function phoneStatusLabel(verifiedAt: string | null): string {
    return verifiedAt ? '確認済み' : '未確認';
}

function phoneStatusTone(verifiedAt: string | null): string {
    return verifiedAt
        ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100'
        : 'border-white/10 bg-white/5 text-slate-200';
}

function roleActionDescription(role: RoleName): string {
    switch (role) {
        case 'user':
            return '年齢層、体型、共有したいプロフィール情報を整えます。';
        case 'therapist':
            return '公開名、紹介文、対応内容、写真の準備を進めます。';
        case 'admin':
            return '審査、監視、問い合わせ対応などの運営画面を開きます。';
    }
}

function roleActionLabel(role: RoleName): string {
    switch (role) {
        case 'user':
            return '利用者プロフィールを開く';
        case 'therapist':
            return 'セラピストプロフィールを開く';
        case 'admin':
            return '運営マイページを開く';
    }
}

function roleActionPath(role: RoleName): string {
    switch (role) {
        case 'user':
            return '/user/profile';
        case 'therapist':
            return '/therapist/profile';
        case 'admin':
            return '/admin';
    }
}

export function AccountProfilePage() {
    const { account, activeRole, refreshAccount, token } = useAuth();
    const [profile, setProfile] = useState<MeProfileRecord | null>(null);
    const [displayName, setDisplayName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [nextEmail, setNextEmail] = useState('');
    const [emailPassword, setEmailPassword] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [passwordConfirmation, setPasswordConfirmation] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [commonRequestError, setCommonRequestError] = useState<unknown>(null);
    const [emailRequestError, setEmailRequestError] = useState<unknown>(null);
    const [passwordRequestError, setPasswordRequestError] = useState<unknown>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [isSavingEmail, setIsSavingEmail] = useState(false);
    const [isSavingPassword, setIsSavingPassword] = useState(false);

    usePageTitle('アカウント設定');
    useToastOnMessage(successMessage, 'success');
    useToastOnMessage(error, 'error');

    const roles = useMemo(() => getActiveRoles(account), [account]);
    const currentHomePath = activeRole ? getRoleHomePath(activeRole) : '/role-select';

    const loadProfile = useCallback(async () => {
        if (!token) {
            return;
        }

        const payload = await apiRequest<ApiEnvelope<MeProfileRecord>>('/me/profile', { token });
        const nextProfile = unwrapData(payload);

        setProfile(nextProfile);
        setDisplayName(nextProfile.display_name ?? '');
        setPhoneNumber(toDisplayPhoneNumber(nextProfile.phone_e164));
        setNextEmail(nextProfile.email ?? '');
    }, [token]);

    useEffect(() => {
        let isMounted = true;

        void loadProfile()
            .catch((requestError: unknown) => {
                if (!isMounted) {
                    return;
                }

                const message = requestError instanceof ApiError ? requestError.message : 'アカウント情報の取得に失敗しました。';
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
    }, [loadProfile]);

    async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token) {
            return;
        }

        const normalizedPhone = toE164PhoneNumber(phoneNumber);

        if (phoneNumber.trim() !== '' && normalizedPhone === null) {
            setError('電話番号は 08012345678 のように、先頭の 0 を含む数字だけで入力してください。');
            setCommonRequestError({
                errors: {
                    phone_e164: ['電話番号は 08012345678 のように、先頭の 0 を含む数字だけで入力してください。'],
                },
            });
            return;
        }

        setIsSavingProfile(true);
        setError(null);
        setCommonRequestError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<MeProfileRecord>>('/me/profile', {
                method: 'PATCH',
                token,
                body: {
                    display_name: displayName.trim() || null,
                    phone_e164: normalizedPhone,
                },
            });

            const nextProfile = unwrapData(payload);

            setProfile(nextProfile);
            setDisplayName(nextProfile.display_name ?? '');
            setPhoneNumber(toDisplayPhoneNumber(nextProfile.phone_e164));
            setSuccessMessage('共通プロフィールを更新しました。');

            await refreshAccount();
        } catch (requestError) {
            const message = requestError instanceof ApiError ? requestError.message : '共通プロフィールの更新に失敗しました。';
            setError(message);
            setCommonRequestError(requestError);
        } finally {
            setIsSavingProfile(false);
        }
    }

    async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token) {
            return;
        }

        setIsSavingEmail(true);
        setError(null);
        setEmailRequestError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<MeProfileRecord>>('/me/profile/email', {
                method: 'PATCH',
                token,
                body: {
                    email: nextEmail.trim(),
                    current_password: emailPassword,
                },
            });

            const nextProfile = unwrapData(payload);
            setProfile(nextProfile);
            setNextEmail(nextProfile.email ?? '');
            setEmailPassword('');
            setSuccessMessage('ログイン用メールアドレスを更新しました。');
            await refreshAccount();
        } catch (requestError) {
            const message = requestError instanceof ApiError ? requestError.message : 'メールアドレスの更新に失敗しました。';
            setError(message);
            setEmailRequestError(requestError);
        } finally {
            setIsSavingEmail(false);
        }
    }

    async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token) {
            return;
        }

        setIsSavingPassword(true);
        setError(null);
        setPasswordRequestError(null);
        setSuccessMessage(null);

        try {
            await apiRequest<ApiEnvelope<MeProfileRecord>>('/me/profile/password', {
                method: 'PATCH',
                token,
                body: {
                    current_password: currentPassword,
                    password: newPassword,
                    password_confirmation: passwordConfirmation,
                },
            });

            setCurrentPassword('');
            setNewPassword('');
            setPasswordConfirmation('');
            setSuccessMessage('パスワードを更新しました。次回ログインから新しいパスワードが使えます。');
        } catch (requestError) {
            const message = requestError instanceof ApiError ? requestError.message : 'パスワードの更新に失敗しました。';
            setError(message);
            setPasswordRequestError(requestError);
        } finally {
            setIsSavingPassword(false);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="アカウント設定を確認中" message="共通で使うプロフィール情報とログイン設定を読み込んでいます。" />;
    }

    return (
        <div className="mx-auto w-full max-w-[1180px] space-y-10 px-4 py-8 sm:px-6 lg:px-8">
            <section className="grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_360px] lg:items-start">
                <div className="space-y-6">
                    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                        <BrandMark inverse compact />
                        <span className="text-slate-500">/</span>
                        <span>アカウント設定</span>
                    </div>

                    <div className="space-y-4">
                        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold tracking-wide text-slate-200">
                            共通設定
                        </span>
                        <div className="space-y-3">
                            <h1 className="max-w-[11ch] text-[2.4rem] font-semibold leading-[1.4] text-white sm:max-w-none sm:text-[3.2rem]">
                                ログイン情報と
                                <br />
                                共通プロフィールをまとめて管理
                            </h1>
                            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-[0.95rem]">
                                ここで変更した表示名、電話番号、ログイン用メールアドレス、パスワードは、利用者とセラピストのどちらでも同じアカウント情報として使われます。
                                役割ごとの詳細プロフィールは、この下のボタンからそれぞれ開けます。
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Link
                            to={currentHomePath}
                            className="inline-flex min-h-11 items-center rounded-full bg-[#f3dec0] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#f7e7cd]"
                        >
                            マイページへ戻る
                        </Link>
                        <Link
                            to="/role-select"
                            className="inline-flex min-h-11 items-center rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/6"
                        >
                            モードを切り替える
                        </Link>
                    </div>

                    <form onSubmit={handleProfileSubmit} className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_60px_rgba(2,6,23,0.18)]">
                        <div className="space-y-2">
                            <p className="text-xs font-semibold tracking-wide text-[#f3dec0]">アカウント基本情報</p>
                            <h2 className="text-2xl font-semibold text-white">共通プロフィールを編集</h2>
                            <p className="text-sm leading-7 text-slate-300">
                                表示名と電話番号は、どのマイページでも共通で使われます。
                            </p>
                        </div>



                        <div className="mt-6 grid gap-4 md:grid-cols-2">
                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-white">表示名</span>
                                <input
                                    value={displayName}
                                    onChange={(event) => setDisplayName(event.target.value)}
                                    className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-[#f3dec0]/60"
                                    placeholder="山田"
                                />
                                {getFieldError(commonRequestError, 'display_name') ? (
                                    <p className="text-xs text-amber-200">{getFieldError(commonRequestError, 'display_name')}</p>
                                ) : null}
                            </label>

                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-white">電話番号</span>
                                <input
                                    type="tel"
                                    value={phoneNumber}
                                    onChange={(event) => setPhoneNumber(toDomesticDigits(event.target.value))}
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    maxLength={11}
                                    className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-[#f3dec0]/60"
                                    placeholder="08012345678"
                                />
                                <p className="text-xs text-slate-400">ハイフンなしの数字だけで入力してください。変更すると電話認証状態は未確認に戻ります。</p>
                                {getFieldError(commonRequestError, 'phone_e164') ? (
                                    <p className="text-xs text-amber-200">{getFieldError(commonRequestError, 'phone_e164')}</p>
                                ) : null}
                            </label>

                            <label className="space-y-2 md:col-span-2">
                                <span className="text-sm font-semibold text-white">メールアドレス</span>
                                <input
                                    value={profile?.email ?? ''}
                                    readOnly
                                    className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-slate-300 outline-none"
                                />
                                <p className="text-xs text-slate-400">ログイン用メールアドレスとパスワードは、この下のログイン設定から変更できます。</p>
                            </label>
                        </div>

                        <button
                            type="submit"
                            disabled={isSavingProfile}
                            className="mt-6 inline-flex min-h-11 items-center rounded-full bg-[#f3dec0] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#f7e7cd] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isSavingProfile ? '保存中...' : '共通プロフィールを保存'}
                        </button>
                    </form>

                    <div className="grid gap-6 xl:grid-cols-2">
                        <form onSubmit={handleEmailSubmit} className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_60px_rgba(2,6,23,0.18)]">
                            <div className="space-y-2">
                                <p className="text-xs font-semibold tracking-wide text-[#f3dec0]">ログイン設定</p>
                                <h2 className="text-2xl font-semibold text-white">メールアドレスを変更</h2>
                                <p className="text-sm leading-7 text-slate-300">
                                    次回からのログインに使うメールアドレスを更新します。変更時は現在のパスワード確認が必要です。
                                </p>
                            </div>

                            <div className="mt-6 space-y-4">
                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-white">新しいメールアドレス</span>
                                    <input
                                        type="email"
                                        value={nextEmail}
                                        onChange={(event) => setNextEmail(event.target.value)}
                                        autoComplete="email"
                                        className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-[#f3dec0]/60"
                                        placeholder="sample@example.com"
                                    />
                                    {getFieldError(emailRequestError, 'email') ? (
                                        <p className="text-xs text-amber-200">{getFieldError(emailRequestError, 'email')}</p>
                                    ) : null}
                                </label>

                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-white">現在のパスワード</span>
                                    <input
                                        type="password"
                                        value={emailPassword}
                                        onChange={(event) => setEmailPassword(event.target.value)}
                                        autoComplete="current-password"
                                        className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-[#f3dec0]/60"
                                        placeholder="現在のパスワードを入力"
                                    />
                                    {getFieldError(emailRequestError, 'current_password') ? (
                                        <p className="text-xs text-amber-200">{getFieldError(emailRequestError, 'current_password')}</p>
                                    ) : null}
                                </label>
                            </div>

                            <button
                                type="submit"
                                disabled={isSavingEmail}
                                className="mt-6 inline-flex min-h-11 items-center rounded-full bg-[#f3dec0] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#f7e7cd] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isSavingEmail ? '更新中...' : 'メールアドレスを更新'}
                            </button>
                        </form>

                        <form onSubmit={handlePasswordSubmit} className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_60px_rgba(2,6,23,0.18)]">
                            <div className="space-y-2">
                                <p className="text-xs font-semibold tracking-wide text-[#f3dec0]">ログイン設定</p>
                                <h2 className="text-2xl font-semibold text-white">パスワードを変更</h2>
                                <p className="text-sm leading-7 text-slate-300">
                                    現在のパスワードを確認したうえで、新しいパスワードに更新します。10文字以上で設定してください。
                                </p>
                            </div>

                            <div className="mt-6 space-y-4">
                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-white">現在のパスワード</span>
                                    <input
                                        type="password"
                                        value={currentPassword}
                                        onChange={(event) => setCurrentPassword(event.target.value)}
                                        autoComplete="current-password"
                                        className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-[#f3dec0]/60"
                                        placeholder="現在のパスワードを入力"
                                    />
                                    {getFieldError(passwordRequestError, 'current_password') ? (
                                        <p className="text-xs text-amber-200">{getFieldError(passwordRequestError, 'current_password')}</p>
                                    ) : null}
                                </label>

                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-white">新しいパスワード</span>
                                    <input
                                        type="password"
                                        value={newPassword}
                                        onChange={(event) => setNewPassword(event.target.value)}
                                        autoComplete="new-password"
                                        className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-[#f3dec0]/60"
                                        placeholder="10文字以上で入力"
                                    />
                                    {getFieldError(passwordRequestError, 'password') ? (
                                        <p className="text-xs text-amber-200">{getFieldError(passwordRequestError, 'password')}</p>
                                    ) : null}
                                </label>

                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-white">新しいパスワード確認</span>
                                    <input
                                        type="password"
                                        value={passwordConfirmation}
                                        onChange={(event) => setPasswordConfirmation(event.target.value)}
                                        autoComplete="new-password"
                                        className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-[#f3dec0]/60"
                                        placeholder="もう一度入力"
                                    />
                                </label>
                            </div>

                            <button
                                type="submit"
                                disabled={isSavingPassword}
                                className="mt-6 inline-flex min-h-11 items-center rounded-full bg-[#f3dec0] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#f7e7cd] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isSavingPassword ? '更新中...' : 'パスワードを更新'}
                            </button>
                        </form>
                    </div>

                    <section className="space-y-5">
                        <div className="space-y-2">
                            <p className="text-xs font-semibold tracking-wide text-slate-400">役割ごとの詳細プロフィール</p>
                            <h2 className="text-2xl font-semibold text-white">必要に応じて各マイページを開く</h2>
                            <p className="max-w-3xl text-sm leading-7 text-slate-300">
                                ここでは共通情報だけを管理しています。利用目的ごとの詳細設定は、それぞれのマイページで編集します。
                            </p>
                        </div>

                        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                            {roles.map((role) => (
                                <article key={role} className="flex h-full flex-col gap-4 rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_16px_34px_rgba(2,6,23,0.12)]">
                                    <div className="space-y-2">
                                        <p className="text-xs font-semibold tracking-wide text-[#f3dec0]">{formatRoleLabel(role)}</p>
                                        <h3 className="text-xl font-semibold text-white">
                                            {role === 'admin' ? '運営マイページ' : `${formatRoleLabel(role)}プロフィール`}
                                        </h3>
                                        <p className="text-sm leading-7 text-slate-300">{roleActionDescription(role)}</p>
                                    </div>
                                    <Link
                                        to={roleActionPath(role)}
                                        className="mt-auto inline-flex min-h-11 items-center rounded-full border border-white/10 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/6"
                                    >
                                        {roleActionLabel(role)}
                                    </Link>
                                </article>
                            ))}
                        </div>
                    </section>
                </div>

                <aside className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_60px_rgba(2,6,23,0.24)]">
                    <p className="text-xs font-semibold tracking-wide text-[#f3dec0]">アカウント概要</p>
                    <div className="mt-4 space-y-4">
                        <div>
                            <p className="text-sm text-slate-300">ログイン中アカウント</p>
                            <p className="mt-1 text-2xl font-semibold text-white">{profile?.display_name || account?.display_name || '表示名未設定'}</p>
                            <p className="mt-1 break-all text-sm text-slate-400">{profile?.email ?? account?.email}</p>
                        </div>

                        <div className="rounded-[20px] border border-white/10 bg-[#111923] px-4 py-4">
                            <p className="text-xs font-semibold tracking-wide text-slate-400">利用できるマイページ</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {roles.map((role) => (
                                    <span
                                        key={role}
                                        className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200"
                                    >
                                        {formatRoleLabel(role)}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-[20px] border border-white/10 bg-[#111923] px-4 py-4">
                            <p className="text-xs font-semibold tracking-wide text-slate-400">電話番号</p>
                            <div className="mt-3 flex items-center gap-3">
                                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${phoneStatusTone(profile?.phone_verified_at ?? null)}`}>
                                    {phoneStatusLabel(profile?.phone_verified_at ?? null)}
                                </span>
                                <p className="text-sm text-slate-300">{toDisplayPhoneNumber(profile?.phone_e164 ?? null) || '未設定'}</p>
                            </div>
                        </div>

                        <div className="rounded-[20px] border border-white/10 bg-[#111923] px-4 py-4">
                            <p className="text-xs font-semibold tracking-wide text-slate-400">本人確認</p>
                            <div className="mt-3 flex flex-wrap items-center gap-3">
                                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${verificationTone(profile?.latest_identity_verification?.status)}`}>
                                    {formatIdentityVerificationStatus(profile?.latest_identity_verification?.status)}
                                </span>
                                <p className="text-sm text-slate-300">
                                    {formatDateTime(profile?.latest_identity_verification?.reviewed_at ?? profile?.latest_identity_verification?.submitted_at ?? null)}
                                </p>
                            </div>
                        </div>

                        <div className="rounded-[20px] border border-white/10 bg-[#111923] px-4 py-4 text-sm leading-7 text-slate-300">
                            この画面で管理する情報はアカウント全体で共通です。セラピストとして公開する場合だけ、
                            別途プロフィールの必須情報入力、写真の登録、受取設定が必要です。
                        </div>
                    </div>
                </aside>
            </section>
        </div>
    );
}
