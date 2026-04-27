import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BrandMark } from '../components/brand/BrandMark';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { formatRoleLabel, getActiveRoles, getRoleHomePath, type RoleName } from '../lib/account';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import {
    formatDate,
    formatDateTime,
    formatIdentityVerificationStatus,
    formatRejectionReason,
} from '../lib/therapist';
import type {
    ApiEnvelope,
    IdentityVerificationRecord,
} from '../lib/types';

function statusTone(status: string | null | undefined): string {
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

function actionRoles(roles: RoleName[]): RoleName[] {
    return roles.filter((role) => role === 'user' || role === 'therapist');
}

function actionDescription(role: RoleName): string {
    switch (role) {
        case 'user':
            return '予約前の安全確認として本人確認・年齢確認を進めます。';
        case 'therapist':
            return '公開準備の前提として本人確認・年齢確認を進めます。';
        case 'admin':
            return '運営アカウントではこの画面から本人確認を進めません。';
    }
}

function actionLabel(role: RoleName, status: string | null | undefined): string {
    if (status === 'approved') {
        return `${formatRoleLabel(role)}の確認画面を開く`;
    }

    if (status === 'pending') {
        return `${formatRoleLabel(role)}の提出画面を開く`;
    }

    return `${formatRoleLabel(role)}として本人確認を進める`;
}

function actionPath(role: RoleName): string {
    switch (role) {
        case 'user':
            return '/user/identity-verification';
        case 'therapist':
            return '/therapist/identity-verification';
        case 'admin':
            return '/admin';
    }
}

export function AccountIdentityVerificationPage() {
    const { account, activeRole, token } = useAuth();
    const [latestVerification, setLatestVerification] = useState<IdentityVerificationRecord | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    usePageTitle('本人確認・年齢確認');
    useToastOnMessage(error, 'error');

    const roles = useMemo(() => getActiveRoles(account), [account]);
    const currentHomePath = activeRole ? getRoleHomePath(activeRole) : '/role-select';
    const availableActions = useMemo(() => actionRoles(roles), [roles]);

    const loadVerification = useCallback(async () => {
        if (!token) {
            return;
        }

        try {
            const payload = await apiRequest<ApiEnvelope<IdentityVerificationRecord>>('/me/identity-verification', { token });
            setLatestVerification(unwrapData(payload));
        } catch (requestError) {
            if (requestError instanceof ApiError && requestError.status === 404) {
                setLatestVerification(null);
                return;
            }

            throw requestError;
        }
    }, [token]);

    useEffect(() => {
        let isMounted = true;

        void loadVerification()
            .catch((requestError: unknown) => {
                if (!isMounted) {
                    return;
                }

                const message = requestError instanceof ApiError ? requestError.message : '本人確認情報の取得に失敗しました。';
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
    }, [loadVerification]);

    if (isLoading) {
        return <LoadingScreen title="本人確認を確認中" message="アカウント共通の提出状況を読み込んでいます。" />;
    }

    return (
        <div className="mx-auto w-full max-w-[1180px] space-y-10 px-4 py-8 sm:px-6 lg:px-8">
            <section className="grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_360px] lg:items-start">
                <div className="space-y-6">
                    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                        <BrandMark inverse compact />
                        <span className="text-slate-500">/</span>
                        <span>本人確認・年齢確認</span>
                    </div>

                    <div className="space-y-4">
                        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold tracking-wide text-slate-200">
                            共通設定
                        </span>
                        <div className="space-y-3">
                            <h1 className="max-w-[12ch] text-[2.4rem] font-semibold leading-[1.4] text-white sm:max-w-none sm:text-[3.2rem]">
                                本人確認は
                                <br />
                                アカウント全体で共通です
                            </h1>
                            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-[0.95rem]">
                                利用者として開いても、セラピストとして開いても、同じ提出状況が反映されます。
                                どちらのマイページから進めるかをここで選べます。
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
                            to="/profile"
                            className="inline-flex min-h-11 items-center rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/6"
                        >
                            アカウント情報を見る
                        </Link>
                    </div>


                    <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_60px_rgba(2,6,23,0.18)]">
                        <div className="space-y-2">
                            <p className="text-xs font-semibold tracking-wide text-[#f3dec0]">現在の提出状況</p>
                            <h2 className="text-2xl font-semibold text-white">アカウント共通の本人確認</h2>
                            <p className="text-sm leading-7 text-slate-300">
                                提出状況に応じて、この下から利用者またはセラピストの導線へ進めます。
                            </p>
                        </div>

                        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-[20px] border border-white/10 bg-[#111923] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-slate-400">状態</p>
                                <span className={`mt-3 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(latestVerification?.status)}`}>
                                    {formatIdentityVerificationStatus(latestVerification?.status)}
                                </span>
                            </div>
                            <div className="rounded-[20px] border border-white/10 bg-[#111923] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-slate-400">年齢確認</p>
                                <p className="mt-3 text-base font-semibold text-white">
                                    {latestVerification?.is_age_verified ? '確認済み' : '未確認'}
                                </p>
                            </div>
                            <div className="rounded-[20px] border border-white/10 bg-[#111923] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-slate-400">提出日</p>
                                <p className="mt-3 text-base font-semibold text-white">
                                    {formatDate(latestVerification?.submitted_at)}
                                </p>
                            </div>
                            <div className="rounded-[20px] border border-white/10 bg-[#111923] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-slate-400">最終更新</p>
                                <p className="mt-3 text-base font-semibold text-white">
                                    {formatDateTime(latestVerification?.reviewed_at ?? latestVerification?.submitted_at ?? null)}
                                </p>
                            </div>
                        </div>

                        {latestVerification?.status === 'rejected' ? (
                            <div className="mt-5 rounded-[22px] border border-rose-300/30 bg-rose-300/10 px-5 py-4 text-sm text-rose-100">
                                差し戻し理由: {formatRejectionReason(latestVerification.rejection_reason_code)}
                            </div>
                        ) : null}

                        {!latestVerification ? (
                            <div className="mt-5 rounded-[22px] border border-white/10 bg-[#111923] px-5 py-4 text-sm leading-7 text-slate-300">
                                まだ本人確認は提出されていません。予約や公開準備を進める前に、どちらかのマイページから提出を始めてください。
                            </div>
                        ) : null}
                    </section>

                    <section className="space-y-5">
                        <div className="space-y-2">
                            <p className="text-xs font-semibold tracking-wide text-slate-400">どこから進めるか選ぶ</p>
                            <h2 className="text-2xl font-semibold text-white">利用目的に合わせて開く</h2>
                        </div>

                        {availableActions.length > 0 ? (
                            <div className="grid gap-5 md:grid-cols-2">
                                {availableActions.map((role) => (
                                    <article key={role} className="flex h-full flex-col gap-4 rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_16px_34px_rgba(2,6,23,0.12)]">
                                        <div className="space-y-2">
                                            <p className="text-xs font-semibold tracking-wide text-[#f3dec0]">{formatRoleLabel(role)}</p>
                                            <h3 className="text-xl font-semibold text-white">{formatRoleLabel(role)}として進める</h3>
                                            <p className="text-sm leading-7 text-slate-300">{actionDescription(role)}</p>
                                        </div>
                                        <Link
                                            to={actionPath(role)}
                                            className="mt-auto inline-flex min-h-11 items-center rounded-full border border-white/10 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/6"
                                        >
                                            {actionLabel(role, latestVerification?.status)}
                                        </Link>
                                    </article>
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 text-sm leading-7 text-slate-300">
                                このアカウントでは、まだ利用者またはセラピストのマイページが追加されていません。
                                <Link to="/role-select" className="ml-2 font-semibold text-white underline decoration-white/30 underline-offset-4">
                                    マイページの追加画面を開く
                                </Link>
                            </div>
                        )}
                    </section>
                </div>

                <aside className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_60px_rgba(2,6,23,0.24)]">
                    <p className="text-xs font-semibold tracking-wide text-[#f3dec0]">確認メモ</p>
                    <div className="mt-4 space-y-4">
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

                        <div className="rounded-[20px] border border-white/10 bg-[#111923] px-4 py-4 text-sm leading-7 text-slate-300">
                            本人確認・年齢確認はアカウント単位で保存されます。セラピストとして活動する場合は、承認後に追加でプロフィールの必須情報入力と受取設定が必要です。
                        </div>

                        <div className="rounded-[20px] border border-white/10 bg-[#111923] px-4 py-4 text-sm leading-7 text-slate-300">
                            安全のため、提出した書類画像とセルフィーは審査用途に限定して扱います。
                        </div>
                    </div>
                </aside>
            </section>
        </div>
    );
}
