import { Link, NavLink, Outlet } from 'react-router-dom';
import { BrandMark } from '../components/brand/BrandMark';
import { NotificationBellLink } from '../components/notifications/NotificationBellLink';
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
        'inline-flex min-h-10 items-center rounded-full px-4 py-2 text-sm font-semibold transition',
        isActive
            ? 'bg-[#f5efe4] text-[#17202b] shadow-[0_8px_18px_rgba(245,239,228,0.18)]'
            : 'text-slate-300 hover:bg-white/6 hover:text-white',
    ].join(' ');
}

export function DashboardLayout({ role, title, description, navItems }: DashboardLayoutProps) {
    const { account, logout } = useAuth();
    const availableRoles = getActiveRoles(account);

    return (
        <div className="min-h-screen">
            <div className="mx-auto flex w-full max-w-[1380px] flex-col gap-8 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
                <header className="overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(118deg,rgba(23,32,43,0.96)_0%,rgba(31,45,61,0.94)_52%,rgba(42,59,79,0.96)_100%)] shadow-[0_30px_70px_rgba(2,6,23,0.34)]">
                    <div className="space-y-6 p-6 sm:p-7 lg:p-8">
                        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                            <div className="space-y-4">
                                <div className="flex flex-wrap items-center gap-3">
                                    <BrandMark inverse compact />
                                    <span className="rounded-full border border-[#e8d5b2]/30 bg-[#e8d5b2]/8 px-3 py-1 text-xs font-semibold tracking-wide text-[#f3dec0]">
                                        {formatRoleLabel(role)}
                                    </span>
                                </div>

                                <div className="space-y-3">
                                    <h1 className="max-w-[16ch] text-[2.2rem] font-semibold leading-[1.4] text-white sm:text-[2.5rem]">
                                        {title}
                                    </h1>
                                    <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-[0.95rem]">
                                        {description}
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 xl:max-w-[420px] xl:justify-end">
                                <NotificationBellLink />
                                {availableRoles.length > 0 ? (
                                    <Link
                                        to="/role-select"
                                        className="inline-flex min-h-11 items-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/6"
                                    >
                                        モード管理
                                    </Link>
                                ) : null}
                                <span className="inline-flex min-h-11 items-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-100">
                                    {getAccountDisplayName(account)}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        void logout();
                                    }}
                                    className="inline-flex min-h-11 items-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/6"
                                >
                                    ログアウト
                                </button>
                            </div>
                        </div>

                        <div className="overflow-x-auto pb-1">
                            <nav className="flex min-w-max flex-wrap gap-2 xl:min-w-0">
                                {navItems.map((item) => (
                                    <NavLink key={item.to} to={item.to} end={item.exact} className={({ isActive }) => navLinkClass(isActive)}>
                                        {item.label}
                                    </NavLink>
                                ))}
                            </nav>
                        </div>
                    </div>
                </header>

                <main className="w-full">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
