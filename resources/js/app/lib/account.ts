import type { Account, RoleName } from './types';

export type { RoleName } from './types';

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

    return account.roles
        .flatMap((role) => (role.status === 'active' && isRoleName(role.role) ? [role.role] : []));
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

export function getAccountDisplayName(account: Account | null): string {
    if (!account) {
        return 'ゲスト';
    }

    return account.display_name || account.email;
}
