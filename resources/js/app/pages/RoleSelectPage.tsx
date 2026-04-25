import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { formatRoleLabel, getActiveRoles, getRoleHomePath, type RoleName } from '../lib/account';

export function RoleSelectPage() {
    const navigate = useNavigate();
    const { account, activeRole, selectRole } = useAuth();
    const roles = getActiveRoles(account);

    usePageTitle('利用モード選択');

    useEffect(() => {
        if (roles.length === 1) {
            navigate(getRoleHomePath(roles[0]), { replace: true });
        }
    }, [navigate, roles]);

    const descriptions: Record<RoleName, string> = {
        user: '検索、空き枠確認、予約、メッセージ、通報履歴を扱います。',
        therapist: 'プロフィール審査、空き枠、予約依頼、売上・出金を扱います。',
        admin: '審査、通報、監視、法務、料金ルール監視を扱います。',
    };

    return (
        <div className="mx-auto max-w-4xl space-y-8">
            <section className="space-y-3 text-center">
                <p className="text-sm font-medium tracking-wide text-rose-200">Mode Switch</p>
                <h1 className="text-4xl font-semibold text-white">利用モードを選択</h1>
                <p className="text-sm leading-7 text-slate-300">利用できる役割ごとに専用ダッシュボードへ進めます。</p>
            </section>

            <section className="grid gap-4 md:grid-cols-3">
                {roles.map((role) => (
                    <button
                        key={role}
                        type="button"
                        onClick={() => {
                            selectRole(role);
                            navigate(getRoleHomePath(role));
                        }}
                        className={[
                            'rounded-lg border p-6 text-left transition',
                            activeRole === role
                                ? 'border-rose-300/40 bg-rose-300/10'
                                : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10',
                        ].join(' ')}
                    >
                        <p className="text-sm font-medium text-rose-200">{formatRoleLabel(role)}</p>
                        <h2 className="mt-3 text-xl font-semibold text-white">{getRoleHomePath(role)}</h2>
                        <p className="mt-3 text-sm leading-7 text-slate-300">{descriptions[role]}</p>
                    </button>
                ))}
            </section>
        </div>
    );
}
