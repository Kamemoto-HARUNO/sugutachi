import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
    formatRoleLabel,
    getActiveRoles,
    getRoleHomePath,
    roleBadgeClass,
    type RoleName,
} from '../../lib/account';

interface RoleModeSwitcherProps {
    className?: string;
}

export function RoleModeSwitcher({ className = '' }: RoleModeSwitcherProps) {
    const { account, activeRole, selectRole } = useAuth();
    const navigate = useNavigate();
    const availableRoles = useMemo(() => getActiveRoles(account), [account]);
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const handlePointerDown = (event: PointerEvent) => {
            if (!(event.target instanceof Node)) {
                return;
            }

            if (!containerRef.current?.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
        };
    }, [isOpen]);

    if (availableRoles.length === 0) {
        return null;
    }

    function handleSelect(role: RoleName) {
        selectRole(role);
        setIsOpen(false);
        navigate(getRoleHomePath(role));
    }

    return (
        <div ref={containerRef} className={`relative ${className}`.trim()}>
            <div className="flex items-center gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    {availableRoles.map((role) => (
                        <button
                            key={role}
                            type="button"
                            onClick={() => handleSelect(role)}
                            className={roleBadgeClass(role, activeRole === role)}
                            aria-pressed={activeRole === role}
                        >
                            {formatRoleLabel(role)}
                        </button>
                    ))}
                </div>

                {availableRoles.length > 1 ? (
                    <button
                        type="button"
                        onClick={() => setIsOpen((current) => !current)}
                        aria-label="モード切り替えメニューを開く"
                        aria-expanded={isOpen}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-slate-100 transition hover:bg-white/10"
                    >
                        <svg
                            aria-hidden="true"
                            viewBox="0 0 20 20"
                            className={`h-4 w-4 transition ${isOpen ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M5 7.5 10 12.5 15 7.5" />
                        </svg>
                    </button>
                ) : null}
            </div>

            {isOpen ? (
                <div className="absolute left-0 top-full z-20 mt-3 min-w-[220px] rounded-[22px] border border-white/12 bg-[rgba(23,32,43,0.96)] p-3 shadow-[0_18px_45px_rgba(23,32,43,0.28)] backdrop-blur">
                    <p className="px-2 text-xs font-semibold tracking-wide text-[#f3dec0]">マイページを切り替え</p>
                    <div className="mt-3 space-y-2">
                        {availableRoles.map((role) => {
                            const isCurrent = activeRole === role;

                            return (
                                <button
                                    key={`${role}-menu`}
                                    type="button"
                                    onClick={() => handleSelect(role)}
                                    className="flex w-full items-center justify-between rounded-[18px] border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm text-slate-100 transition hover:bg-white/[0.08]"
                                >
                                    <span className="flex items-center gap-2">
                                        <span className={roleBadgeClass(role, true)}>{formatRoleLabel(role)}</span>
                                    </span>
                                    <span className="text-xs font-semibold text-slate-300">
                                        {isCurrent ? '表示中' : '切り替える'}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
