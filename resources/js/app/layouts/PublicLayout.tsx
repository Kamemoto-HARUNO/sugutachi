import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { getAccountDisplayName, getRoleHomePath } from '../lib/account';
import { publicNavItems } from '../lib/navigation';
import { useAuth } from '../hooks/useAuth';

function navLinkClass(isActive: boolean): string {
    return [
        'rounded-full px-3 py-2 text-sm transition',
        isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white',
    ].join(' ');
}

export function PublicLayout() {
    const { account, activeRole, isAuthenticated, logout } = useAuth();
    const location = useLocation();
    const returnTo = `${location.pathname}${location.search}`;
    const loginPath = location.pathname === '/login' ? '/login' : `/login?return_to=${encodeURIComponent(returnTo)}`;
    const registerPath = location.pathname === '/register' ? '/register' : `/register?return_to=${encodeURIComponent(returnTo)}`;

    return (
        <div className="min-h-screen">
            <header className="border-b border-white/10">
                <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1">
                        <Link to="/" className="text-xl font-semibold tracking-tight text-white">
                            すぐタチ
                        </Link>
                        <p className="text-sm text-slate-300">
                            リラクゼーション / ボディケア / もみほぐしの予約プラットフォーム
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 lg:items-end">
                        <nav className="flex flex-wrap gap-2">
                            {publicNavItems.map((item) => (
                                <NavLink key={item.to} to={item.to} end={item.exact} className={({ isActive }) => navLinkClass(isActive)}>
                                    {item.label}
                                </NavLink>
                            ))}
                        </nav>

                        <div className="flex flex-wrap items-center gap-3">
                            {isAuthenticated ? (
                                <>
                                    <Link
                                        to="/role-select"
                                        className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                                    >
                                        モード管理
                                    </Link>
                                    <Link
                                        to={activeRole ? getRoleHomePath(activeRole) : '/role-select'}
                                        className="rounded-full border border-rose-300/40 px-4 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-300/10"
                                    >
                                        {getAccountDisplayName(account)}
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            void logout();
                                        }}
                                        className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                                    >
                                        ログアウト
                                    </button>
                                </>
                            ) : (
                                <>
                                    <Link
                                        to={loginPath}
                                        className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                                    >
                                        ログイン
                                    </Link>
                                    <Link
                                        to={registerPath}
                                        className="rounded-full bg-rose-300 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-rose-200"
                                    >
                                        無料ではじめる
                                    </Link>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            <main className="mx-auto w-full max-w-7xl px-6 py-10">
                <Outlet />
            </main>
        </div>
    );
}
