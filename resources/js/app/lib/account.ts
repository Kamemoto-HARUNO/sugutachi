import type { Account, RoleName } from './types';

export type { RoleName } from './types';

const ROLE_DISPLAY_ORDER: RoleName[] = ['user', 'therapist', 'admin'];

const ROLE_HOME_PATHS: Record<RoleName, string> = {
    user: '/user',
    therapist: '/therapist',
    admin: '/admin',
};

export function isRoleName(value: string | null | undefined): value is RoleName {
    return value === 'user' || value === 'therapist' || value === 'admin';
}

export function getActiveRoles(account: Account | null): RoleName[] {
    if (!account) {
        return [];
    }

    const roles = account.roles
        .flatMap((role) => (role.status === 'active' && isRoleName(role.role) ? [role.role] : []));

    return ROLE_DISPLAY_ORDER.filter((role) => roles.includes(role));
}

export function hasActiveRole(account: Account | null, role: RoleName): boolean {
    return getActiveRoles(account).includes(role);
}

export function getPreferredRole(account: Account | null): RoleName | null {
    if (!account) {
        return null;
    }

    if (isRoleName(account.last_active_role) && hasActiveRole(account, account.last_active_role)) {
        return account.last_active_role;
    }

    return getActiveRoles(account)[0] ?? null;
}

export function getRoleHomePath(role: RoleName): string {
    return ROLE_HOME_PATHS[role];
}

export function sanitizeAppPath(value: string | null | undefined): string | null {
    if (!value || !value.startsWith('/') || value.startsWith('//')) {
        return null;
    }

    return value;
}

export function inferRoleFromPath(path: string | null | undefined): RoleName | null {
    const normalizedPath = sanitizeAppPath(path);

    if (!normalizedPath) {
        return null;
    }

    if (normalizedPath === '/user' || normalizedPath.startsWith('/user/')) {
        return 'user';
    }

    if (normalizedPath === '/therapist' || normalizedPath.startsWith('/therapist/')) {
        return 'therapist';
    }

    if (normalizedPath === '/admin' || normalizedPath.startsWith('/admin/')) {
        return 'admin';
    }

    return null;
}

export function getPostAuthPath(account: Account | null, requestedRole?: RoleName | null): string {
    if (!account) {
        return '/login';
    }

    if (requestedRole && hasActiveRole(account, requestedRole)) {
        return getRoleHomePath(requestedRole);
    }

    const activeRoles = getActiveRoles(account);

    if (activeRoles.length === 1) {
        return getRoleHomePath(activeRoles[0]);
    }

    const preferredRole = getPreferredRole(account);

    return preferredRole ? '/role-select' : '/login';
}

export function formatRoleLabel(role: RoleName): string {
    switch (role) {
        case 'user':
            return '利用者';
        case 'therapist':
            return 'セラピスト';
        case 'admin':
            return '運営';
    }
}

export function roleBadgeClass(role: RoleName, isActive = false): string {
    const baseClass = 'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap transition';

    switch (role) {
        case 'user':
            return [
                baseClass,
                isActive
                    ? 'border-[#d6b35a] bg-[#f3dec0] text-[#17202b] shadow-[0_10px_24px_rgba(243,222,192,0.18)]'
                    : 'border-[#e6cf97] bg-[#fff7df] text-[#8a6516]',
            ].join(' ');
        case 'therapist':
            return [
                baseClass,
                isActive
                    ? 'border-[#4aa36d] bg-[#dff1e5] text-[#1f5e3b] shadow-[0_10px_24px_rgba(74,163,109,0.16)]'
                    : 'border-[#a8d2b7] bg-[#eff9f2] text-[#2d7048]',
            ].join(' ');
        case 'admin':
            return [
                baseClass,
                isActive
                    ? 'border-[#5c8ed9] bg-[#dfeeff] text-[#244f87] shadow-[0_10px_24px_rgba(92,142,217,0.16)]'
                    : 'border-[#b8d3f7] bg-[#f1f7ff] text-[#3c649a]',
            ].join(' ');
    }
}

export function getAccountDisplayName(account: Account | null): string {
    if (!account) {
        return 'ゲスト';
    }

    return account.display_name || account.email;
}
