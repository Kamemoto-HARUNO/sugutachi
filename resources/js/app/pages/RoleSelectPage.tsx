import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import {
    formatRoleLabel,
    getActiveRoles,
    getRoleHomePath,
    inferRoleFromPath,
    sanitizeAppPath,
    type RoleName,
} from '../lib/account';
import { ApiError } from '../lib/api';

const candidateRoles: Array<'user' | 'therapist'> = ['user', 'therapist'];

export function RoleSelectPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { account, activeRole, addRole, selectRole } = useAuth();
    const [error, setError] = useState<string | null>(null);
    const [pendingRole, setPendingRole] = useState<RoleName | null>(null);
    const roles = getActiveRoles(account);
    const addRoleHint = searchParams.get('add_role');
    const requestedRole = addRoleHint === 'user' || addRoleHint === 'therapist' ? addRoleHint : null;
    const returnTo = sanitizeAppPath(searchParams.get('return_to'));
    const returnRole = inferRoleFromPath(returnTo);

    usePageTitle('利用モード管理');

    const addableRoles = useMemo(
        () => candidateRoles.filter((role) => !roles.includes(role)),
        [roles],
    );

    const descriptions: Record<RoleName, string> = {
        user: '検索、空き枠確認、予約、メッセージ、通報履歴を扱います。',
        therapist: 'プロフィール審査、空き枠、予約依頼、売上・出金を扱います。',
        admin: '審査、通報、監視、法務、料金ルール監視を扱います。',
    };

    function continuePath(role: RoleName, isNewRole = false): string {
        if (returnTo && (!returnRole || returnRole === role)) {
            return returnTo;
        }

        if (role === 'therapist' && isNewRole) {
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

    return (
        <div className="mx-auto max-w-5xl space-y-8">
            <section className="space-y-3 text-center">
                <p className="text-sm font-medium tracking-wide text-rose-200">Mode Manager</p>
                <h1 className="text-4xl font-semibold text-white">利用モードを切り替える</h1>
                <p className="mx-auto max-w-3xl text-sm leading-7 text-slate-300">
                    1つのアカウントで、利用者とセラピストの両方を使えます。最初に選んだモードとは別の使い方を始めたいときも、ここから追加できます。
                </p>
            </section>

            {returnTo ? (
                <section className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm leading-7 text-slate-300">
                    追加や切り替えが終わったら、さっき見ていた画面へ戻れます。
                </section>
            ) : null}

            {error ? (
                <section className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-5 py-4 text-sm text-amber-100">
                    {error}
                </section>
            ) : null}

            <section className="space-y-4">
                <div className="space-y-1">
                    <p className="text-xs font-semibold tracking-wide text-rose-200">ACTIVE ROLES</p>
                    <h2 className="text-2xl font-semibold text-white">現在使えるモード</h2>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                    {roles.map((role) => (
                        <button
                            key={role}
                            type="button"
                            onClick={() => {
                                selectRole(role);
                                navigate(continuePath(role), { replace: true });
                            }}
                            className={[
                                'rounded-lg border p-6 text-left transition',
                                activeRole === role
                                    ? 'border-rose-300/40 bg-rose-300/10'
                                    : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10',
                                requestedRole === role ? 'ring-1 ring-rose-200/60' : '',
                            ].join(' ')}
                        >
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-medium text-rose-200">{formatRoleLabel(role)}</p>
                                {activeRole === role ? (
                                    <span className="rounded-full bg-rose-300/20 px-3 py-1 text-xs font-semibold text-rose-100">
                                        現在選択中
                                    </span>
                                ) : null}
                            </div>
                            <h3 className="mt-3 text-xl font-semibold text-white">{getRoleHomePath(role)}</h3>
                            <p className="mt-3 text-sm leading-7 text-slate-300">{descriptions[role]}</p>
                            <p className="mt-5 text-sm font-semibold text-white">
                                {returnTo && (!returnRole || returnRole === role) ? 'このモードで続きを開く' : 'このモードへ移動'}
                            </p>
                        </button>
                    ))}
                </div>
            </section>

            <section className="space-y-4">
                <div className="space-y-1">
                    <p className="text-xs font-semibold tracking-wide text-rose-200">ADD MORE</p>
                    <h2 className="text-2xl font-semibold text-white">追加できるモード</h2>
                </div>

                {addableRoles.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2">
                        {addableRoles.map((role) => (
                            <article
                                key={role}
                                className={[
                                    'rounded-lg border p-6 transition',
                                    requestedRole === role
                                        ? 'border-rose-300/40 bg-rose-300/10'
                                        : 'border-white/10 bg-white/5',
                                ].join(' ')}
                            >
                                <p className="text-sm font-medium text-rose-200">{formatRoleLabel(role)}</p>
                                <h3 className="mt-3 text-xl font-semibold text-white">
                                    {role === 'user' ? '利用者モードを追加' : 'セラピストモードを追加'}
                                </h3>
                                <p className="mt-3 text-sm leading-7 text-slate-300">{descriptions[role]}</p>
                                <button
                                    type="button"
                                    onClick={() => {
                                        void handleAddRole(role);
                                    }}
                                    disabled={pendingRole === role}
                                    className="mt-5 inline-flex items-center rounded-full bg-rose-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {pendingRole === role ? '追加中...' : 'このモードを追加する'}
                                </button>
                            </article>
                        ))}
                    </div>
                ) : (
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm leading-7 text-slate-300">
                        利用者とセラピストの両方が利用可能です。必要に応じてこの画面から切り替えて使えます。
                    </div>
                )}
            </section>
        </div>
    );
}
