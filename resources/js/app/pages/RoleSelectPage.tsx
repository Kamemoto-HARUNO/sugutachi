import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BrandMark } from '../components/brand/BrandMark';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
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
            eyebrow: 'User Mode',
            title: '近くのセラピストを探して、予約まで進む',
            description: '検索、空き時間確認、予約、メッセージ、レビュー、通報履歴までを利用者導線として扱います。',
            bullets: [
                '近くのセラピスト検索と公開プロフィール確認',
                '施術場所の管理、予定予約の見積もり確認',
                '予約一覧、メッセージ、レビュー、通報履歴の管理',
            ],
            addTitle: '利用者モードを追加',
            addDescription: '検索や予約を始めるためのモードです。公開プロフィールからの続きをそのまま開けます。',
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
            label: 'セラピスト',
            eyebrow: 'Therapist Mode',
            title: '公開プロフィールを整えて、依頼と売上を管理する',
            description: '提供プロフィール審査、空きスケジュール、予約依頼、レビュー受信、売上管理をセラピスト導線として扱います。',
            bullets: [
                'プロフィール、写真、料金ルール、空き枠の公開準備',
                '今すぐ依頼 / 予定予約の承諾、予約進行、メッセージ対応',
                'レビュー受信、残高確認、出金申請、Stripe Connect 設定',
            ],
            addTitle: 'セラピストモードを追加',
            addDescription: '提供側として稼働したいときのモードです。本人確認、プロフィール審査、受取設定へそのまま進めます。',
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
            eyebrow: 'Admin Mode',
            title: '審査・監視・運用管理をまとめて行う',
            description: '本人確認審査、通報管理、予約監視、法務文書、料金ルール監視などを扱います。',
            bullets: [
                '本人確認、写真、プロフィールの審査',
                '予約、通報、メッセージ監視、返金対応',
                '法務文書、料金ルール、出金申請の管理',
            ],
            addTitle: '運営モードは追加対象外',
            addDescription: '運営権限は管理者付与前提です。',
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

    const roles = getActiveRoles(account);
    const addRoleHint = searchParams.get('add_role');
    const requestedRole = addRoleHint === 'user' || addRoleHint === 'therapist' ? addRoleHint : null;
    const returnTo = sanitizeAppPath(searchParams.get('return_to'));
    const returnRole = inferRoleFromPath(returnTo);
    const guides = roleGuides();
    const identityStatus = account?.latest_identity_verification?.status ?? null;

    usePageTitle('利用モード管理');

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
            && therapistSnapshot.stripeStatus.details_submitted
            && (therapistSnapshot.stripeStatus.payouts_enabled || therapistSnapshot.stripeStatus.charges_enabled),
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
                return roleSetupReady(role) ? '予約準備OK' : '予約前の準備あり';
            case 'therapist':
                return roleSetupReady(role) ? '公開・受付可能' : '公開準備中';
            case 'admin':
                return '運用モード';
        }
    }

    function roleSummary(role: RoleName): string {
        if (isLoadingSnapshots && role !== 'admin') {
            return '関連する設定状況を読み込んでいます。';
        }

        switch (role) {
            case 'user':
                if (!userSnapshot) {
                    return '利用者プロフィールと施術場所の準備状況を確認できます。';
                }

                return `${userProfileStatusLabel(userSnapshot.profileStatus)} / 施術場所 ${userSnapshot.addressCount}件`;
            case 'therapist':
                return `${formatProfileStatus(therapistSnapshot?.reviewStatus?.profile.profile_status)} / Stripe ${formatStripeStatus(therapistSnapshot?.stripeStatus?.status)}`;
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
                    { label: '施術場所', value: userSnapshot ? `${userSnapshot.addressCount}件` : '確認中' },
                ];
            case 'therapist':
                return [
                    { label: '本人確認', value: formatIdentityVerificationStatus(identityStatus) },
                    { label: 'プロフィール', value: formatProfileStatus(therapistSnapshot?.reviewStatus?.profile.profile_status) },
                    { label: 'Stripe', value: formatStripeStatus(therapistSnapshot?.stripeStatus?.status) },
                ];
            case 'admin':
                return [
                    { label: '本人確認', value: formatIdentityVerificationStatus(identityStatus) },
                    { label: '有効ロール', value: `${roles.length}件` },
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
                setError('利用モードの追加に失敗しました。');
            }
        } finally {
            setPendingRole(null);
        }
    }

    const requestedRoleLabel = requestedRole ? formatRoleLabel(requestedRole) : null;
    const currentAccountName = getAccountDisplayName(account);
    const activeRoleLabel = activeRole ? formatRoleLabel(activeRole) : '未選択';

    return (
        <div className="mx-auto w-full max-w-[1180px] space-y-14 px-4 py-8 sm:px-6 lg:px-8">
            <section className="grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_360px] lg:items-start">
                <div className="space-y-6">
                    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                        <BrandMark inverse compact />
                        <span className="text-slate-500">/</span>
                        <span>利用モード管理</span>
                    </div>

                    <div className="space-y-4">
                        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold tracking-wide text-slate-200">
                            MODE SELECT
                        </span>
                        <div className="space-y-3">
                            <h1 className="max-w-[11ch] text-[2.4rem] font-semibold leading-[1.1] text-white sm:max-w-none sm:text-[3.2rem]">
                                1つのアカウントで
                                <br />
                                利用者にもセラピストにもなれます
                            </h1>
                            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-[0.95rem]">
                                要件どおり、1つのアカウントで「探す側」と「提供する側」の両方を持てます。最初に選んだロールとは別の使い方を始めたいときも、
                                この画面から不足ロールを追加して、そのまま必要な導線へ進めます。
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        {activeRole ? (
                            <Link
                                to={getRoleHomePath(activeRole)}
                                className="inline-flex min-h-11 items-center rounded-full bg-[#f3dec0] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#f7e7cd]"
                            >
                                現在の {activeRoleLabel} ダッシュボードへ
                            </Link>
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
                            <p className="text-xs font-semibold tracking-wide text-[#f3dec0]">REQUESTED FLOW</p>
                            <p className="mt-2 font-semibold text-white">
                                この続きには「{requestedRoleLabel}」モードが必要です。
                            </p>
                            <p className="mt-2 text-slate-300">
                                {returnTo
                                    ? 'ロール追加または切り替えが終わると、見ていた画面へ戻れます。'
                                    : '不足ロールを追加したら、そのまま必要なダッシュボードや準備画面へ進めます。'}
                            </p>
                        </div>
                    ) : null}

                    {error ? (
                        <div className="rounded-[22px] border border-amber-300/30 bg-amber-300/10 px-5 py-4 text-sm text-amber-100">
                            {error}
                        </div>
                    ) : null}

                    {snapshotError ? (
                        <div className="rounded-[22px] border border-white/10 bg-white/5 px-5 py-4 text-sm text-slate-200">
                            {snapshotError}
                        </div>
                    ) : null}
                </div>

                <aside className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_60px_rgba(2,6,23,0.24)]">
                    <p className="text-xs font-semibold tracking-wide text-[#f3dec0]">ACCOUNT SUMMARY</p>
                    <div className="mt-4 space-y-4">
                        <div>
                            <p className="text-sm text-slate-300">ログイン中アカウント</p>
                            <p className="mt-1 text-2xl font-semibold text-white">{currentAccountName}</p>
                            <p className="mt-1 break-all text-sm text-slate-400">{account?.email}</p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                            <div className="rounded-[20px] border border-white/10 bg-[#111923] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-slate-400">現在のモード</p>
                                <p className="mt-2 text-lg font-semibold text-white">{activeRoleLabel}</p>
                            </div>
                            <div className="rounded-[20px] border border-white/10 bg-[#111923] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-slate-400">本人確認</p>
                                <p className="mt-2 text-lg font-semibold text-white">{formatIdentityVerificationStatus(identityStatus)}</p>
                            </div>
                        </div>

                        <div className="rounded-[20px] border border-white/10 bg-[#111923] px-4 py-4">
                            <p className="text-xs font-semibold tracking-wide text-slate-400">有効ロール</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {roles.map((role) => (
                                    <span
                                        key={role}
                                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${guides[role].accent.badge}`}
                                    >
                                        {formatRoleLabel(role)}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-[20px] border border-white/10 bg-[#111923] px-4 py-4 text-sm leading-7 text-slate-300">
                            表示名、電話番号、本人確認・年齢確認はアカウント単位で保持します。セラピストとして稼働する場合のみ、
                            追加でプロフィール審査と Stripe Connect の設定が必要です。
                        </div>
                    </div>
                </aside>
            </section>

            <section className="space-y-5">
                <div className="space-y-2">
                    <p className="text-xs font-semibold tracking-wide text-slate-400">ACTIVE MODES</p>
                    <h2 className="text-2xl font-semibold text-white sm:text-[2rem]">現在使えるモード</h2>
                    <p className="max-w-3xl text-sm leading-7 text-slate-300">
                        いま使えるロールごとに、何ができるかと準備状況をまとめています。必要に応じて切り替え、そのまま該当の導線へ進めます。
                    </p>
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                    {roles.map((role) => {
                        const guide = guides[role];
                        const isReady = roleSetupReady(role);
                        const actionLabel = returnTo && (!returnRole || returnRole === role)
                            ? 'このモードで続きを開く'
                            : role === 'therapist' && !isReady
                                ? '準備状況を開く'
                                : 'このモードへ移動';

                        return (
                            <article
                                key={role}
                                className={[
                                    'flex h-full flex-col gap-6 rounded-[28px] border bg-white/[0.04] p-6 shadow-[0_24px_60px_rgba(2,6,23,0.2)]',
                                    guide.accent.border,
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
                                            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                                                現在選択中
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
                                </div>

                                {role === 'user' && userSnapshot?.defaultAddressLabel ? (
                                    <p className="text-sm text-slate-400">
                                        既定の施術場所: <span className="font-semibold text-slate-200">{userSnapshot.defaultAddressLabel}</span>
                                    </p>
                                ) : null}

                                {role === 'therapist' && therapistSnapshot?.reviewStatus ? (
                                    <p className="text-sm text-slate-400">
                                        有効メニュー {therapistSnapshot.reviewStatus.active_menu_count}件 / 写真審査 {formatProfileStatus(therapistSnapshot.reviewStatus.profile.photo_review_status)}
                                    </p>
                                ) : null}

                                <div className="mt-auto flex flex-wrap gap-3 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            selectRole(role);
                                            navigate(continuePath(role), { replace: true });
                                        }}
                                        className={`inline-flex min-h-11 items-center rounded-full px-5 py-3 text-sm font-semibold transition ${guide.accent.primaryButton}`}
                                    >
                                        {actionLabel}
                                    </button>
                                    <Link
                                        to={role === 'therapist' ? '/therapist/onboarding' : getRoleHomePath(role)}
                                        className={`inline-flex min-h-11 items-center rounded-full border px-5 py-3 text-sm font-semibold transition ${guide.accent.secondaryButton}`}
                                    >
                                        {role === 'therapist' ? '準備の全体像を見る' : 'ホームを見る'}
                                    </Link>
                                </div>
                            </article>
                        );
                    })}
                </div>
            </section>

            <section className="space-y-5">
                <div className="space-y-2">
                    <p className="text-xs font-semibold tracking-wide text-slate-400">ADD MORE</p>
                    <h2 className="text-2xl font-semibold text-white sm:text-[2rem]">追加できるモード</h2>
                    <p className="max-w-3xl text-sm leading-7 text-slate-300">
                        まだ持っていないロールは、ここから同じアカウントへ追加できます。別アカウントを作り直す必要はありません。
                    </p>
                </div>

                {addableRoles.length > 0 ? (
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

                                    <div className="mt-auto flex flex-wrap gap-3 pt-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                void handleAddRole(role);
                                            }}
                                            disabled={pendingRole === role}
                                            className={`inline-flex min-h-11 items-center rounded-full px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${guide.accent.primaryButton}`}
                                        >
                                            {pendingRole === role ? '追加中...' : 'このモードを追加する'}
                                        </button>
                                        {role === 'therapist' ? (
                                            <Link
                                                to="/therapist/onboarding"
                                                className={`inline-flex min-h-11 items-center rounded-full border px-5 py-3 text-sm font-semibold transition ${guide.accent.secondaryButton}`}
                                            >
                                                準備項目を見る
                                            </Link>
                                        ) : null}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                ) : (
                    <div className="rounded-[28px] border border-white/10 bg-white/[0.04] px-6 py-5 text-sm leading-7 text-slate-300">
                        利用者モードとセラピストモードの両方が有効です。必要なときにこの画面へ戻って、状況を確認しながら切り替えて使えます。
                    </div>
                )}
            </section>

            <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-4 rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
                    <p className="text-xs font-semibold tracking-wide text-slate-400">COMMON ACCOUNT RULES</p>
                    <h2 className="text-2xl font-semibold text-white">アカウント共通で持つ情報</h2>
                    <ul className="space-y-3 text-sm leading-7 text-slate-300">
                        <li className="flex gap-3">
                            <span className="mt-[0.7rem] h-1.5 w-1.5 shrink-0 rounded-full bg-white/55" />
                            <span>本人確認、年齢確認、電話番号確認はアカウント単位で保持します。</span>
                        </li>
                        <li className="flex gap-3">
                            <span className="mt-[0.7rem] h-1.5 w-1.5 shrink-0 rounded-full bg-white/55" />
                            <span>セラピストとして稼働する場合だけ、追加でプロフィール審査、写真審査、Stripe Connect 設定が必要です。</span>
                        </li>
                        <li className="flex gap-3">
                            <span className="mt-[0.7rem] h-1.5 w-1.5 shrink-0 rounded-full bg-white/55" />
                            <span>公開プロフィール閲覧はゲストでも可能ですが、予約、メッセージ、住所保存などの操作はログイン後の各モードで行います。</span>
                        </li>
                    </ul>
                </div>

                <div className="space-y-4 rounded-[28px] border border-white/10 bg-[#111923] p-6">
                    <p className="text-xs font-semibold tracking-wide text-[#f3dec0]">NEXT GUIDE</p>
                    <h2 className="text-2xl font-semibold text-white">次に進みやすい導線</h2>
                    <div className="space-y-3 text-sm leading-7 text-slate-300">
                        <p>
                            公開詳細やトップから来た場合は、まず必要なロールを追加してから元の画面へ戻すと流れが途切れません。
                        </p>
                        <p>
                            セラピストロールを追加した直後や、公開準備が途中のときは <span className="font-semibold text-white">セラピスト準備状況</span> へ進むのが最短です。
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-3 pt-2">
                        <Link
                            to={requestedRole ? continuePath(requestedRole) : activeRole ? continuePath(activeRole) : '/'}
                            className="inline-flex min-h-11 items-center rounded-full bg-[#f3dec0] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#f7e7cd]"
                        >
                            {requestedRole ? '今の続きを開く' : activeRole ? `${activeRoleLabel} に進む` : '公開トップへ戻る'}
                        </Link>
                        <Link
                            to="/"
                            className="inline-flex min-h-11 items-center rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/6"
                        >
                            公開トップへ
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
