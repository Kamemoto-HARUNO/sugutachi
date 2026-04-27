import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
    formatRoleLabel,
    getActiveRoles,
    getRoleHomePath,
    type RoleName,
} from '../../lib/account';

interface RoleModeSwitcherProps {
    className?: string;
}

export function RoleModeSwitcher({ className = '' }: RoleModeSwitcherProps) {
    const { account, activeRole, selectRole } = useAuth();
    const navigate = useNavigate();
    const availableRoles = useMemo(() => getActiveRoles(account), [account]);

    if (availableRoles.length === 0) {
        return null;
    }

    function handleSelect(role: RoleName) {
        selectRole(role);
        navigate(getRoleHomePath(role));
    }

    return (
        <div className={className}>
            <div className="flex flex-wrap items-center gap-2">
                {availableRoles.map((role) => {
                    const isCurrent = activeRole === role;
                    const toneClass = role === 'user'
                        ? 'border-[#d6b35a] bg-[#f3dec0] text-[#17202b]'
                        : role === 'therapist'
                            ? 'border-[#4aa36d] bg-[#dff1e5] text-[#1f5e3b]'
                            : 'border-[#5c8ed9] bg-[#dfeeff] text-[#244f87]';

                    return (
                        <button
                            key={role}
                            type="button"
                            onClick={() => handleSelect(role)}
                            aria-pressed={isCurrent}
                            className={[
                                'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap transition',
                                toneClass,
                                isCurrent
                                    ? 'opacity-100 shadow-[0_10px_24px_rgba(15,23,42,0.16)]'
                                    : 'opacity-30 hover:opacity-100',
                            ].join(' ')}
                        >
                            {formatRoleLabel(role)}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
