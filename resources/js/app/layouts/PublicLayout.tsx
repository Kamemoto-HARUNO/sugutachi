import { useMemo } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { PublicHeaderBar, type PublicHeaderAction } from '../components/public/PublicHeaderBar';
import { getMyPageEntryPath } from '../lib/account';
import { publicNavItems } from '../lib/navigation';
import { useAuth } from '../hooks/useAuth';

function navLinkClass(isActive: boolean): string {
    return [
        'rounded-full px-3 py-2 text-sm transition',
        isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white',
    ].join(' ');
}

export function PublicLayout() {
    const { account, isAuthenticated } = useAuth();
    const location = useLocation();
    const returnTo = `${location.pathname}${location.search}`;
    const loginPath = location.pathname === '/login' ? '/login' : `/login?return_to=${encodeURIComponent(returnTo)}`;
    const registerPath = location.pathname === '/register' ? '/register' : `/register?return_to=${encodeURIComponent(returnTo)}`;
    const myPagePath = getMyPageEntryPath(account);
    const headerActions = useMemo<PublicHeaderAction[]>(() => {
        if (isAuthenticated) {
            return [
                {
                    label: 'マイページ',
                    to: myPagePath,
                    icon: 'mypage',
                },
            ];
        }

        return [
            {
                label: 'ログイン',
                to: loginPath,
                icon: 'login',
            },
            {
                label: '会員登録',
                to: registerPath,
                variant: 'secondary',
                icon: 'register',
            },
        ];
    }, [isAuthenticated, loginPath, myPagePath, registerPath]);

    return (
        <div className="min-h-screen">
            <header className="border-0">
                <div className="mx-auto w-full max-w-7xl px-6 py-5">
                    <PublicHeaderBar actions={headerActions} />
                    <div className="mt-4 pt-0" style={{ borderTop: 'none' }}>
                        <nav className="flex flex-wrap gap-2">
                            {publicNavItems.map((item) => (
                                <NavLink key={item.to} to={item.to} end={item.exact} className={({ isActive }) => navLinkClass(isActive)}>
                                    {item.label}
                                </NavLink>
                            ))}
                        </nav>
                    </div>
                </div>
            </header>

            <main className="mx-auto w-full max-w-7xl px-6 py-10">
                <Outlet />
            </main>
        </div>
    );
}
