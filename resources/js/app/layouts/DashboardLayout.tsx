import { Link, NavLink, Outlet } from 'react-router-dom';
import { getAccountDisplayName, getActiveRoles, formatRoleLabel } from '../lib/account';
import type { NavItem, RoleName } from '../lib/types';
import { useAuth } from '../hooks/useAuth';

interface DashboardLayoutProps {
    role: RoleName;
    title: string;
    description: string;
    navItems: NavItem[];
}

function navLinkClass(isActive: boolean): string {
    return [
        'rounded-md px-3 py-2 text-sm transition',
        isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white',
    ].join(' ');
}

export function DashboardLayout({ role, title, description, navItems }: DashboardLayoutProps) {
    const { account, logout } = useAuth();
    const availableRoles = getActiveRoles(account);

    return (
        <div className="space-y-8">
            <header className="space-y-5 border-b border-white/10 pb-8">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <Link to="/" className="text-sm font-medium text-slate-300 transition hover:text-white">
                                すぐタチ
                            </Link>
                            <span className="rounded-full border border-rose-300/30 px-3 py-1 text-xs font-medium tracking-wide text-rose-100">
                                {formatRoleLabel(role)}
                            </span>
                        </div>
                        <div className="space-y-2">
                            <h1 className="text-3xl font-semibold text-white">{title}</h1>
                            <p className="max-w-3xl text-sm leading-7 text-slate-300">{description}</p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {availableRoles.length > 0 ? (
                            <Link
                                to="/role-select"
                                className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                            >
                                モード管理
                            </Link>
                        ) : null}
                        <span className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200">
                            {getAccountDisplayName(account)}
                        </span>
                        <button
                            type="button"
                            onClick={() => {
                                void logout();
                            }}
                            className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                        >
                            ログアウト
                        </button>
                    </div>
                </div>

                <nav className="flex flex-wrap gap-2">
                    {navItems.map((item) => (
                        <NavLink key={item.to} to={item.to} end={item.exact} className={({ isActive }) => navLinkClass(isActive)}>
                            {item.label}
                        </NavLink>
                    ))}
                </nav>
            </header>

            <Outlet />
        </div>
    );
}
