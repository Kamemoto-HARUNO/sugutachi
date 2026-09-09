import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { formatRoleLabel, getActiveRoles, getRoleDashboardPath, inferRoleFromPath, type RoleName } from '../../lib/account';

export function ModeBar() {
    const { account, activeRole, isAuthenticated, selectRole } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const menu = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const visible = isAuthenticated && activeRole !== null;
    useLayoutEffect(() => {
        document.documentElement.style.setProperty('--mode-bar-height', visible ? '44px' : '0px');
        return () => { document.documentElement.style.removeProperty('--mode-bar-height'); };
    }, [visible]);
    useEffect(() => setOpen(false), [location.pathname, location.search, activeRole]);
    useEffect(() => {
        if (!open) return;
        const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) setOpen(false); };
        const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
        document.addEventListener('pointerdown', outside);
        document.addEventListener('keydown', escape);
        return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
    }, [open]);
    if (!visible) return null;
    const roles = getActiveRoles(account);
    function switchMode(next: RoleName) {
        if (next === activeRole) { setOpen(false); return; }
        const routeRole = inferRoleFromPath(location.pathname);
        const messages = /\/(messages|direct-messages)(\/|$)/.test(location.pathname);
        selectRole(next);
        // Public browsing stays on the same page; role-specific tasks go to a safe entry.
        if (routeRole && location.pathname !== '/user/therapists') {
            navigate(messages && next !== 'admin' ? `/${next}/messages` : getRoleDashboardPath(next));
        }
        setOpen(false);
    }
    return <div className={`mode-bar ${activeRole === 'therapist' ? 'bg-[#e6f2e9] text-[#245b3a]' : activeRole === 'user' ? 'bg-[#f5ead6] text-[#735529]' : 'bg-blue-50 text-blue-900'}`}>
        <div ref={menu} className="relative mx-auto flex h-11 max-w-[1380px] items-center justify-between px-4 sm:px-6">
            <button ref={trigger} type="button" aria-expanded={open} aria-controls="mode-options" onClick={() => setOpen(!open)} className="flex min-h-11 items-center gap-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-[-3px]">
                <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
                {formatRoleLabel(activeRole)}モード
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true"><path d={open ? 'm5 12 5-5 5 5' : 'm5 8 5 5 5-5'} /></svg>
            </button>
            <span className="text-xs">{activeRole === 'therapist' ? 'サービスを提供する側' : activeRole === 'user' ? '予約する側' : '運営管理'}</span>
            {open && <div id="mode-options" className="absolute left-4 top-full mt-1 w-[min(300px,calc(100vw-32px))] rounded-2xl border border-slate-200 bg-white p-2 text-slate-900 shadow-xl">
                <p className="px-3 py-2 text-xs text-slate-500">利用するモード</p>
                {roles.map(role => <button key={role} type="button" aria-pressed={activeRole === role} onClick={() => switchMode(role)} className="flex min-h-12 w-full items-center justify-between rounded-xl px-3 py-3 text-sm hover:bg-slate-100 focus-visible:outline-2">
                    {formatRoleLabel(role)}<span>{role === activeRole ? '選択中 ✓' : '切り替え'}</span>
                </button>)}
                {(['user', 'therapist'] as const).filter(role => !roles.includes(role)).map(role => <Link key={role} to={`/role-select?add_role=${role}&return_to=${encodeURIComponent(location.pathname + location.search)}`} onClick={() => setOpen(false)} className="flex min-h-12 items-center rounded-xl px-3 text-sm hover:bg-slate-100">{formatRoleLabel(role)}モードを追加</Link>)}
            </div>}
        </div>
    </div>;
}
