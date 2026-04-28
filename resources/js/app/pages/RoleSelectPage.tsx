import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BrandMark } from '../components/brand/BrandMark';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import {
    formatRoleLabel,
    getAccountDisplayName,
    getActiveRoles,
    getRoleHomePath,
    inferRoleFromPath,
    sanitizeAppPath,
    type RoleName,
} from '../lib/account';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatIdentityVerificationStatus, formatProfileStatus, formatStripeStatus } from '../lib/therapist';
import type {
    ApiEnvelope,
    ServiceAddress,
    StripeConnectedAccountStatus,
    TherapistReviewStatus,
    UserProfileRecord,
} from '../lib/types';

const candidateRoles: Array<'user' | 'therapist'> = ['user', 'therapist'];

interface UserModeSnapshot {
    profileStatus: string | null;
    addressCount: number;
    defaultAddressLabel: string | null;
}

interface TherapistModeSnapshot {
    reviewStatus: TherapistReviewStatus | null;
    stripeStatus: StripeConnectedAccountStatus | null;
}

interface RoleGuide {
    label: string;
    eyebrow: string;
    title: string;
    description: string;
    bullets: string[];
    addTitle: string;
    addDescription: string;
    accent: {
        badge: string;
        subtle: string;
        primaryButton: string;
        secondaryButton: string;
        border: string;
        highlight: string;
    };
}

function statusTone(kind: 'ready' | 'pending' | 'neutral'): string {
    switch (kind) {
        case 'ready':
            return 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100';
        case 'pending':
            return 'border-amber-300/30 bg-amber-300/10 text-amber-100';
        default:
            return 'border-white/10 bg-white/5 text-slate-200';
    }
}

function rolePageLabel(role: RoleName): string {
    switch (role) {
        case 'user':
            return '利用者マイページ';
        case 'therapist':
            return 'タチキャストマイページ';
        case 'admin':
            return '運営マイページ';
    }
}

function roleSwitchHint(role: RoleName): string {
    switch (role) {
        case 'user':
            return '検索・予約・住所管理を開きます。';
        case 'therapist':
            return '依頼対応・準備状況・売上管理を開きます。';
        case 'admin':
            return '審査・監視・運用管理を開きます。';
    }
}

function rolePageHint(role: RoleName, isReady: boolean): string {
    switch (role) {
        case 'user':
            return '検索、予約、住所管理は利用者マイページから確認できます。';
        case 'therapist':
            return isReady
                ? '依頼対応、レビュー確認、売上管理はタチキャストマイページから確認できます。'
                : '公開準備が残っている場合は、タチキャストマイページ内の「準備状況」から確認できます。';
        case 'admin':
            return '審査、監視、法務運用は運営マイページから確認できます。';
    }
}

function userProfileStatusLabel(status: string | null | undefined): string {
    switch (status) {
        case 'active':
            return '入力完了';
        case 'incomplete':
            return '要入力';
        default:
            return '未設定';
    }
}

function roleGuides(): Record<RoleName, RoleGuide> {
    return {
        user: {
            label: '利用者',
            eyebrow: '予約する側',
            title: '近くのタチキャストを探して、予約まで進む',
            description: 'タチキャスト探しから予約、やり取り、レビュー確認までを、このマイページからまとめて行えます。',
            bullets: [
                '近くのタチキャスト検索とプロフィール確認',
                '待ち合わせ場所の管理と予約前の料金確認',
                '予約一覧、メッセージ、レビュー、報告履歴の確認',
            ],
            addTitle: '利用者マイページを追加',
            addDescription: 'タチキャスト探しや予約を始めるためのページです。見ていた公開プロフィールからそのまま続けられます。',
            accent: {
                badge: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
                subtle: 'text-amber-100/90',
                primaryButton: 'bg-amber-200 text-[#17202b] hover:bg-amber-100',
                secondaryButton: 'border-amber-200/25 text-amber-100 hover:bg-amber-200/10',
                border: 'border-amber-300/25',
                highlight: 'ring-1 ring-amber-200/60',
            },
        },
        therapist: {
            label: 'タチキャスト',
            eyebrow: 'サービスを提供する側',
            title: '公開プロフィールを整えて、依頼と売上を管理する',
            description: 'プロフィール公開の準備から依頼対応、レビュー確認、売上管理までを、このマイページからまとめて行えます。',
            bullets: [
                'プロフィール、写真、料金、空き時間の公開準備',
                '依頼対応、予約の進行、メッセージ対応',
                'レビュー確認、売上確認、出金申請、受取設定',
            ],
            addTitle: 'タチキャストマイページを追加',
            addDescription: 'タチキャストとして活動を始めるためのページです。本人確認、プロフィール入力、受取設定へそのまま進めます。',
            accent: {
                badge: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100',
                subtle: 'text-emerald-100/90',
                primaryButton: 'bg-emerald-200 text-[#17202b] hover:bg-emerald-100',
                secondaryButton: 'border-emerald-200/25 text-emerald-100 hover:bg-emerald-200/10',
                border: 'border-emerald-300/25',
                highlight: 'ring-1 ring-emerald-200/60',
            },
        },
        admin: {
            label: '運営',
            eyebrow: '運営・サポート',
            title: '審査・監視・運用管理をまとめて行う',
            description: '審査、監視、各種設定の確認を、このマイページからまとめて行えます。',
            bullets: [
                '本人確認、写真、プロフィールの審査',
                '予約、通報、メッセージ監視、返金対応',
                '法務文書、料金ルール、出金申請の管理',
            ],
            addTitle: '運営マイページはここでは追加できません',
            addDescription: '運営マイページは管理者に設定されたアカウントだけ使えます。',
            accent: {
                badge: 'border-sky-300/30 bg-sky-300/10 text-sky-100',
                subtle: 'text-sky-100/90',
                primaryButton: 'bg-sky-200 text-[#17202b] hover:bg-sky-100',
                secondaryButton: 'border-sky-200/25 text-sky-100 hover:bg-sky-200/10',
                border: 'border-sky-300/25',
                highlight: 'ring-1 ring-sky-200/60',
            },
        },
    };
}

export function RoleSelectPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { account, activeRole, token, addRole, selectRole } = useAuth();
    const [error, setError] = useState<string | null>(null);
    const [snapshotError, setSnapshotError] = useState<string | null>(null);
    const [pendingRole, setPendingRole] = useState<RoleName | null>(null);
    const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(true);
    const [userSnapshot, setUserSnapshot] = useState<UserModeSnapshot | null>(null);
    const [therapistSnapshot, setTherapistSnapshot] = useState<TherapistModeSnapshot | null>(null);

    const roles = useMemo(() => getActiveRoles(account), [account]);
    const addRoleHint = searchParams.get('add_role');
    const requestedRole = addRoleHint === 'user' || addRoleHint === 'therapist' ? addRoleHint : null;
    const returnTo = sanitizeAppPath(searchParams.get('return_to'));
    const returnRole = inferRoleFromPath(returnTo);
    const guides = roleGuides();
    const identityStatus = account?.latest_identity_verification?.status ?? null;

    usePageTitle('マイページの切り替え');
    useToastOnMessage(error, 'error');

    const addableRoles = useMemo(
        () => candidateRoles.filter((role) => !roles.includes(role)),
        [roles],
    );

    const loadSnapshots = useCallback(async () => {
        if (!token || !account) {
            setIsLoadingSnapshots(false);
            return;
        }

        setSnapshotError(null);
        setIsLoadingSnapshots(true);

        const requests: Promise<void>[] = [];

        if (roles.includes('user')) {
            requests.push((async () => {
                const [profilePayload, addressesPayload] = await Promise.all([
                    apiRequest<ApiEnvelope<UserProfileRecord | null>>('/me/user-profile', { token }),
                    apiRequest<ApiEnvelope<ServiceAddress[]>>('/me/service-addresses', { token }),
                ]);

                const profile = unwrapData(profilePayload);
                const addresses = unwrapData(addressesPayload);

                setUserSnapshot({
                    profileStatus: profile?.profile_status ?? null,
                    addressCount: addresses.length,
                    defaultAddressLabel: addresses.find((address) => address.is_default)?.label ?? null,
                });
            })());
        } else {
            setUserSnapshot(null);
        }

        if (roles.includes('therapist')) {
            requests.push((async () => {
                const [reviewPayload, stripePayload] = await Promise.all([
                    apiRequest<ApiEnvelope<TherapistReviewStatus>>('/me/therapist-profile/review-status', { token }),
                    apiRequest<ApiEnvelope<StripeConnectedAccountStatus>>('/me/stripe-connect', { token }),
                ]);

                setTherapistSnapshot({
                    reviewStatus: unwrapData(reviewPayload),
                    stripeStatus: unwrapData(stripePayload),
                });
            })());
        } else {
            setTherapistSnapshot(null);
        }

        const results = await Promise.allSettled(requests);

        if (results.some((result) => result.status === 'rejected')) {
            setSnapshotError('一部の準備状況を更新できませんでした。あとで再読み込みすると最新化できます。');
        }

        setIsLoadingSnapshots(false);
    }, [account, roles, token]);

    useEffect(() => {
        void loadSnapshots();
    }, [loadSnapshots]);

    function isUserReady(): boolean {
        return identityStatus === 'approved'
            && userSnapshot?.profileStatus === 'active'
            && (userSnapshot.addressCount ?? 0) > 0;
    }

    function isTherapistReady(): boolean {
        const profileApproved = therapistSnapshot?.reviewStatus?.profile.profile_status === 'approved';
        const stripeReady = Boolean(
            therapistSnapshot?.stripeStatus?.has_account
            && therapistSnapshot.stripeStatus.is_payout_ready,
        );

        return identityStatus === 'approved' && profileApproved && stripeReady;
    }

    function roleSetupReady(role: RoleName): boolean {
        switch (role) {
            case 'user':
                return isUserReady();
            case 'therapist':
                return isTherapistReady();
            case 'admin':
                return true;
        }
    }

    function roleStatusLabel(role: RoleName): string {
        if (isLoadingSnapshots && role !== 'admin') {
            return '準備状況を確認中';
        }

        switch (role) {
            case 'user':
                return roleSetupReady(role) ? '予約を始められます' : '予約前の設定が残っています';
            case 'therapist':
                return roleSetupReady(role) ? '公開して依頼を受けられます' : '公開前の準備が残っています';
            case 'admin':
                return '運営ページを利用できます';
        }
    }

    function roleSummary(role: RoleName): string {
        if (isLoadingSnapshots && role !== 'admin') {
            return '関連する設定状況を読み込んでいます。';
        }

        switch (role) {
            case 'user':
                if (!userSnapshot) {
                    return 'プロフィールと待ち合わせ場所の準備状況を確認できます。';
                }

                return `${userProfileStatusLabel(userSnapshot.profileStatus)} / 待ち合わせ場所 ${userSnapshot.addressCount}件`;
            case 'therapist':
                return `${formatProfileStatus(therapistSnapshot?.reviewStatus?.profile.profile_status)} / 受取設定 ${formatStripeStatus(therapistSnapshot?.stripeStatus?.status)}`;
            case 'admin':
                return '審査、通報、予約監視、料金運用をまとめて扱えます。';
        }
    }

    function roleMetrics(role: RoleName): Array<{ label: string; value: string }> {
        switch (role) {
            case 'user':
                return [
                    { label: '本人確認', value: formatIdentityVerificationStatus(identityStatus) },
                    { label: 'プロフィール', value: userProfileStatusLabel(userSnapshot?.profileStatus) },
                    { label: '待ち合わせ場所', value: userSnapshot ? `${userSnapshot.addressCount}件` : '確認中' },
                ];
            case 'therapist':
                return [
                    { label: '本人確認', value: formatIdentityVerificationStatus(identityStatus) },
                    { label: 'プロフィール', value: formatProfileStatus(therapistSnapshot?.reviewStatus?.profile.profile_status) },
                    { label: '受取設定', value: formatStripeStatus(therapistSnapshot?.stripeStatus?.status) },
                ];
            case 'admin':
                return [
                    { label: '本人確認', value: formatIdentityVerificationStatus(identityStatus) },
                    { label: '使えるページ', value: `${roles.length}種類` },
                    { label: '共通情報', value: 'アカウント単位で保持' },
                ];
        }
    }

    function continuePath(role: RoleName, isNewRole = false): string {
        if (returnTo && (!returnRole || returnRole === role)) {
            return returnTo;
        }

        if (role === 'therapist' && (isNewRole || !roleSetupReady('therapist'))) {
            return '/therapist/onboarding';
        }

        return getRoleHomePath(role);
    }

    function openRole(role: RoleName, destination: 'home' | 'continue' = 'home') {
        selectRole(role);
        navigate(destination === 'continue' ? continuePath(role) : getRoleHomePath(role), { replace: true });
    }

    async function handleAddRole(role: 'user' | 'therapist') {
        setPendingRole(role);
        setError(null);

        try {
            await addRole(role);
            selectRole(role);
            navigate(continuePath(role, true), { replace: true });
        } catch (requestError) {
            if (requestError instanceof ApiError) {
                setError(requestError.message);
            } else if (requestError instanceof Error) {
                setError(requestError.message);
            } else {
                setError('マイページの追加に失敗しました。');
            }
        } finally {
            setPendingRole(null);
        }
    }

    const requestedRoleLabel = requestedRole ? formatRoleLabel(requestedRole) : null;
    const currentAccountName = getAccountDisplayName(account);
    const activeRoleLabel = activeRole ? rolePageLabel(activeRole) : '未選択';

    return (
        <div className="mx-auto w-full max-w-[1180px] space-y-14 px-4 py-8 sm:px-6 lg:px-8">
            <section className="grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_360px] lg:items-start">
                <div className="space-y-6">
                    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                        <BrandMark inverse compact />
                        <span className="text-slate-500">/</span>
                        <span>マイページの切り替え</span>
                    </div>

                    <div className="space-y-4">
                        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold tracking-wide text-slate-200">
                            マイページ切り替え
                        </span>
                        <div className="space-y-3">
                            <h1 className="max-w-[11ch] text-[2.4rem] font-semibold leading-[1.4] text-white sm:max-w-none sm:text-[3.2rem]">
                                1つのアカウントで
                                <br />
                                利用者にもタチキャストにもなれます
                            </h1>
                            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-[0.95rem]">
                                1つのアカウントで「探す側」と「提供する側」の両方を使えます。最初に選んだ使い方とは別のことを始めたいときも、
                                この画面から必要なマイページを追加して、そのまま続きへ進めます。
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        {requestedRole && roles.includes(requestedRole) ? (
                            <button
                                type="button"
                                onClick={() => {
                                    openRole(requestedRole, 'continue');
                                }}
                                className="inline-flex min-h-11 items-center rounded-full bg-[#f3dec0] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#f7e7cd]"
                            >
                                今の続きを開く
                            </button>
                        ) : null}
                        <Link
                            to="/help"
                            className="inline-flex min-h-11 items-center rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/6"
                        >
                            使い方を見る
                        </Link>
                    </div>

                    {requestedRole ? (
                        <div className="rounded-[24px] border border-white/10 bg-white/[0.04] px-5 py-5 text-sm leading-7 text-slate-200">
                            <p className="text-xs font-semibold tracking-wide text-[#f3dec0]">この先に進むには</p>
                            <p className="mt-2 font-semibold text-white">
                                この続きは「{requestedRoleLabel}」として開く必要があります。
                            </p>
                            <p className="mt-2 text-slate-300">
                                {returnTo
                                    ? '追加や切り替えが終わると、見ていた画面へ戻れます。'
                                    : '必要な使い方を追加すると、そのままマイページや準備画面へ進めます。'}
                            </p>
                            {roles.includes(requestedRole) ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        openRole(requestedRole, 'continue');
                                    }}
                                    className="mt-4 inline-flex min-h-11 items-center rounded-full bg-[#f3dec0] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#f7e7cd]"
                                >
                                    {requestedRoleLabel}として続きを開く
                                </button>
                            ) : null}
                        </div>
                    ) : null}


                    {snapshotError ? (
                        <div className="rounded-[22px] border border-white/10 bg-white/5 px-5 py-4 text-sm text-slate-200">
                            {snapshotError}
                        </div>
                    ) : null}
                </div>

                <aside className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_60px_rgba(2,6,23,0.24)]">
                    <p className="text-xs font-semibold tracking-wide text-[#f3dec0]">アカウント情報</p>
                    <div className="mt-4 space-y-4">
                        <div>
                            <p className="text-sm text-slate-300">ログイン中アカウント</p>
                            <p className="mt-1 text-2xl font-semibold text-white">{currentAccountName}</p>
                            <p className="mt-1 break-all text-sm text-slate-400">{account?.email}</p>
                        </div>

                        <div className="rounded-[20px] border border-white/10 bg-[#111923] px-4 py-4">
                            <div>
                                <p className="text-xs font-semibold tracking-wide text-slate-400">いま開いているマイページ</p>
                                <p className="mt-2 text-lg font-semibold text-white">{activeRoleLabel}</p>
                                <p className="mt-1 text-xs text-slate-400">下のボタンからすぐ切り替えられます。</p>
                            </div>

                            <div className="mt-4 grid gap-3">
                                {roles.map((role) => {
                                    const guide = guides[role];
                                    const isCurrent = activeRole === role;

                                    return (
                                        <button
                                            key={`switch-${role}`}
                                            type="button"
                                            onClick={() => {
                                                openRole(role);
                                            }}
                                            className={[
                                                'flex w-full items-center justify-between gap-4 rounded-[18px] border px-4 py-4 text-left transition',
                                                isCurrent
                                                    ? `bg-white/[0.08] ${guide.accent.border} ${guide.accent.highlight}`
                                                    : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]',
                                            ].join(' ')}
                                        >
                                            <div className="space-y-1">
                                                <p className="text-sm font-semibold text-white">{rolePageLabel(role)}</p>
                                                <p className="text-xs text-slate-400">{roleSwitchHint(role)}</p>
                                            </div>
                                            <span
                                                className={[
                                                    'inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-semibold',
                                                    isCurrent
                                                        ? guide.accent.primaryButton
                                                        : 'border border-white/10 bg-white/5 text-slate-200',
                                                ].join(' ')}
                                            >
                                                {isCurrent ? '表示中' : '切り替える'}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="rounded-[20px] border border-white/10 bg-[#111923] px-4 py-4">
                            <p className="text-xs font-semibold tracking-wide text-slate-400">本人確認</p>
                            <p className="mt-2 text-lg font-semibold text-white">{formatIdentityVerificationStatus(identityStatus)}</p>
                        </div>

                        <div className="rounded-[20px] border border-white/10 bg-[#111923] px-4 py-4 text-sm leading-7 text-slate-300">
                            表示名、電話番号、本人確認・年齢確認はアカウント単位で保持します。タチキャストとして活動する場合のみ、
                            追加でプロフィール入力と受取設定が必要です。
                        </div>
                    </div>
                </aside>
            </section>

            <section className="space-y-5">
                <div className="space-y-2">
                    <p className="text-xs font-semibold tracking-wide text-slate-400">利用できるマイページ</p>
                    <h2 className="text-2xl font-semibold text-white sm:text-[2rem]">今すぐ開けるマイページ</h2>
                    <p className="max-w-3xl text-sm leading-7 text-slate-300">
                        このアカウントで使える各マイページの準備状況と、ここからできることをまとめています。
                    </p>
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                    {roles.map((role) => {
                        const guide = guides[role];
                        const isReady = roleSetupReady(role);

                        return (
                            <article
                                key={role}
                                className={[
                                    'flex h-full flex-col gap-6 rounded-[28px] border bg-white/[0.04] p-6 shadow-[0_24px_60px_rgba(2,6,23,0.2)]',
                                    guide.accent.border,
                                    activeRole === role ? 'bg-white/[0.08] ring-2 ring-white/60' : '',
                                    requestedRole === role ? guide.accent.highlight : '',
                                ].join(' ')}
                            >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="space-y-3">
                                        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${guide.accent.badge}`}>
                                            {guide.eyebrow}
                                        </span>
                                        <div className="space-y-2">
                                            <h3 className="text-2xl font-semibold text-white">{guide.label}</h3>
                                            <p className="max-w-xl text-sm leading-7 text-slate-300">{guide.title}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-start gap-2">
                                        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(isReady ? 'ready' : 'pending')}`}>
                                            {roleStatusLabel(role)}
                                        </span>
                                        {activeRole === role ? (
                                            <span className="inline-flex items-center rounded-full bg-[#f3dec0] px-3 py-1 text-xs font-bold text-[#17202b] shadow-[0_10px_24px_rgba(243,222,192,0.18)]">
                                                現在表示中
                                            </span>
                                        ) : null}
                                    </div>
                                </div>

                                <p className="text-sm leading-7 text-slate-300">{guide.description}</p>

                                <div className="grid gap-3 sm:grid-cols-3">
                                    {roleMetrics(role).map((metric) => (
                                        <div key={`${role}-${metric.label}`} className="rounded-[20px] border border-white/10 bg-[#111923] px-4 py-4">
                                            <p className="text-xs font-semibold tracking-wide text-slate-400">{metric.label}</p>
                                            <p className="mt-2 text-base font-semibold text-white">{metric.value}</p>
                                        </div>
                                    ))}
                                </div>

                                <div className="space-y-3">
                                    <p className={`text-sm font-semibold ${guide.accent.subtle}`}>{roleSummary(role)}</p>
                                    <ul className="space-y-2 text-sm leading-7 text-slate-300">
                                        {guide.bullets.map((bullet) => (
                                            <li key={`${role}-${bullet}`} className="flex gap-3">
                                                <span className="mt-[0.7rem] h-1.5 w-1.5 shrink-0 rounded-full bg-white/55" />
                                                <span>{bullet}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    <p className="text-sm text-slate-400">{rolePageHint(role, isReady)}</p>
                                </div>

                                {role === 'user' && userSnapshot?.defaultAddressLabel ? (
                                    <p className="text-sm text-slate-400">
                                        いつも使う待ち合わせ場所: <span className="font-semibold text-slate-200">{userSnapshot.defaultAddressLabel}</span>
                                    </p>
                                ) : null}

                                {role === 'therapist' && therapistSnapshot?.reviewStatus ? (
                                    <p className="text-sm text-slate-400">
                                        公開中メニュー {therapistSnapshot.reviewStatus.active_menu_count}件 / 写真 {formatProfileStatus(therapistSnapshot.reviewStatus.profile.photo_review_status)}
                                    </p>
                                ) : null}

                                <div className="mt-auto pt-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            openRole(role);
                                        }}
                                        className={`inline-flex min-h-11 items-center rounded-full px-5 py-3 text-sm font-semibold transition ${guide.accent.primaryButton}`}
                                    >
                                        {rolePageLabel(role)}
                                    </button>
                                </div>
                            </article>
                        );
                    })}
                </div>
            </section>

            {addableRoles.length > 0 ? (
                <section className="space-y-5">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-slate-400">追加できる使い方</p>
                        <h2 className="text-2xl font-semibold text-white sm:text-[2rem]">今のアカウントに追加できるもの</h2>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            まだ使っていないマイページは、ここから今のアカウントに追加できます。別のアカウントを作る必要はありません。
                        </p>
                    </div>

                    <div className="grid gap-5 lg:grid-cols-2">
                        {addableRoles.map((role) => {
                            const guide = guides[role];

                            return (
                                <article
                                    key={role}
                                    className={[
                                        'flex h-full flex-col gap-5 rounded-[28px] border bg-white/[0.04] p-6 shadow-[0_24px_60px_rgba(2,6,23,0.16)]',
                                        guide.accent.border,
                                        requestedRole === role ? guide.accent.highlight : '',
                                    ].join(' ')}
                                >
                                    <div className="space-y-3">
                                        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${guide.accent.badge}`}>
                                            {guide.eyebrow}
                                        </span>
                                        <div className="space-y-2">
                                            <h3 className="text-2xl font-semibold text-white">{guide.addTitle}</h3>
                                            <p className="text-sm leading-7 text-slate-300">{guide.addDescription}</p>
                                        </div>
                                    </div>

                                    <ul className="space-y-2 text-sm leading-7 text-slate-300">
                                        {guide.bullets.map((bullet) => (
                                            <li key={`${role}-add-${bullet}`} className="flex gap-3">
                                                <span className="mt-[0.7rem] h-1.5 w-1.5 shrink-0 rounded-full bg-white/55" />
                                                <span>{bullet}</span>
                                            </li>
                                        ))}
                                    </ul>

                                    <div className="mt-auto pt-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                void handleAddRole(role);
                                            }}
                                            disabled={pendingRole === role}
                                            className={`inline-flex min-h-11 items-center rounded-full px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${guide.accent.primaryButton}`}
                                        >
                                            {pendingRole === role ? '追加中...' : 'この使い方を追加する'}
                                        </button>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </section>
            ) : null}

            <section className="space-y-4 rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
                <p className="text-xs font-semibold tracking-wide text-slate-400">共通で使う情報</p>
                <h2 className="text-2xl font-semibold text-white">どのマイページでも共通の情報</h2>
                <ul className="space-y-3 text-sm leading-7 text-slate-300">
                    <li className="flex gap-3">
                        <span className="mt-[0.7rem] h-1.5 w-1.5 shrink-0 rounded-full bg-white/55" />
                        <span>本人確認、年齢確認、電話番号確認はアカウント単位で保持します。</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="mt-[0.7rem] h-1.5 w-1.5 shrink-0 rounded-full bg-white/55" />
                        <span>タチキャストとして活動する場合だけ、追加でプロフィール入力、写真登録、受取設定が必要です。</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="mt-[0.7rem] h-1.5 w-1.5 shrink-0 rounded-full bg-white/55" />
                        <span>公開プロフィール閲覧はゲストでも可能ですが、予約、メッセージ、住所保存などの操作はログイン後の各マイページで行います。</span>
                    </li>
                </ul>
            </section>
        </div>
    );
}
