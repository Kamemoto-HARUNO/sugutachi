import {
    createContext,
    useCallback,
    useEffect,
    useMemo,
    useState,
    type PropsWithChildren,
} from 'react';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import {
    getPreferredRole,
    hasActiveRole,
    isRoleName,
    type RoleName,
} from '../lib/account';
import { unsubscribeBrowserPushSubscription } from '../lib/push';
import type { Account, ApiEnvelope, LoginResponse } from '../lib/types';

interface LoginPayload {
    email: string;
    password: string;
}

interface RegisterPayload {
    email: string;
    phone_e164?: string;
    password: string;
    password_confirmation: string;
    display_name?: string;
    initial_role: 'user' | 'therapist';
    accepted_terms_version: string;
    accepted_privacy_version: string;
    is_over_18: boolean;
    relaxation_purpose_agreed: boolean;
}

interface AuthContextValue {
    account: Account | null;
    token: string | null;
    activeRole: RoleName | null;
    isAuthenticated: boolean;
    isBootstrapping: boolean;
    login: (payload: LoginPayload) => Promise<Account>;
    register: (payload: RegisterPayload) => Promise<Account>;
    addRole: (role: 'user' | 'therapist') => Promise<Account>;
    logout: () => Promise<void>;
    refreshAccount: () => Promise<void>;
    selectRole: (role: RoleName) => void;
    hasRole: (role: RoleName) => boolean;
}

const ACCESS_TOKEN_STORAGE_KEY = 'sugutachi.access-token';
const ACTIVE_ROLE_STORAGE_KEY = 'sugutachi.active-role';

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function resolveRole(account: Account, candidateRole?: RoleName | null): RoleName | null {
    if (candidateRole && hasActiveRole(account, candidateRole)) {
        return candidateRole;
    }

    const persistedRole = window.localStorage.getItem(ACTIVE_ROLE_STORAGE_KEY);

    if (isRoleName(persistedRole) && hasActiveRole(account, persistedRole)) {
        return persistedRole;
    }

    return getPreferredRole(account);
}

export function AuthProvider({ children }: PropsWithChildren) {
    const [account, setAccount] = useState<Account | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [activeRole, setActiveRole] = useState<RoleName | null>(null);
    const [isBootstrapping, setIsBootstrapping] = useState(true);

    const clearSession = useCallback(() => {
        setToken(null);
        setAccount(null);
        setActiveRole(null);
        window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
        window.localStorage.removeItem(ACTIVE_ROLE_STORAGE_KEY);
    }, []);

    const applySession = useCallback(
        (nextToken: string, nextAccount: Account, preferredRole?: RoleName | null) => {
            const resolvedRole = resolveRole(nextAccount, preferredRole);

            setToken(nextToken);
            setAccount(nextAccount);
            setActiveRole(resolvedRole);

            window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, nextToken);

            if (resolvedRole) {
                window.localStorage.setItem(ACTIVE_ROLE_STORAGE_KEY, resolvedRole);
            } else {
                window.localStorage.removeItem(ACTIVE_ROLE_STORAGE_KEY);
            }
        },
        [],
    );

    const refreshAccount = useCallback(async () => {
        const persistedToken = token ?? window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);

        if (!persistedToken) {
            clearSession();
            return;
        }

        try {
            const payload = await apiRequest<ApiEnvelope<Account>>('/me', {
                token: persistedToken,
            });

            applySession(persistedToken, unwrapData(payload));
        } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
                clearSession();
                return;
            }

            throw error;
        }
    }, [applySession, clearSession, token]);

    useEffect(() => {
        const persistedToken = window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);

        if (!persistedToken) {
            setIsBootstrapping(false);
            return;
        }

        void refreshAccount().finally(() => {
            setIsBootstrapping(false);
        });
    }, [refreshAccount]);

    const login = useCallback(
        async (payload: LoginPayload): Promise<Account> => {
            const response = await apiRequest<LoginResponse>('/auth/login', {
                method: 'POST',
                body: payload,
            });

            applySession(response.access_token, response.account);

            return response.account;
        },
        [applySession],
    );

    const register = useCallback(
        async (payload: RegisterPayload): Promise<Account> => {
            const response = await apiRequest<LoginResponse>('/auth/register', {
                method: 'POST',
                body: payload,
            });

            applySession(response.access_token, response.account, payload.initial_role);

            return response.account;
        },
        [applySession],
    );

    const logout = useCallback(async () => {
        const currentToken = token ?? window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
        const currentAccountPublicId = account?.public_id ?? null;

        try {
            if (currentToken) {
                await unsubscribeBrowserPushSubscription(currentToken, currentAccountPublicId, { rememberOptOut: false });
                await apiRequest<null>('/auth/logout', {
                    method: 'POST',
                    token: currentToken,
                });
            }
        } finally {
            clearSession();
        }
    }, [account?.public_id, clearSession, token]);

    const addRole = useCallback(
        async (role: 'user' | 'therapist'): Promise<Account> => {
            const currentToken = token ?? window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);

            if (!currentToken) {
                throw new Error('ログイン状態を確認できませんでした。');
            }

            const payload = await apiRequest<ApiEnvelope<Account>>('/me/roles', {
                method: 'POST',
                token: currentToken,
                body: { role },
            });

            const nextAccount = unwrapData(payload);

            applySession(currentToken, nextAccount, role);

            return nextAccount;
        },
        [applySession, token],
    );

    const selectRole = useCallback(
        (role: RoleName) => {
            if (!account || !hasActiveRole(account, role)) {
                return;
            }

            setActiveRole(role);
            window.localStorage.setItem(ACTIVE_ROLE_STORAGE_KEY, role);
        },
        [account],
    );

    const hasRole = useCallback(
        (role: RoleName) => {
            return hasActiveRole(account, role);
        },
        [account],
    );

    const value = useMemo<AuthContextValue>(
        () => ({
            account,
            token,
            activeRole,
            isAuthenticated: Boolean(account && token),
            isBootstrapping,
            login,
            register,
            addRole,
            logout,
            refreshAccount,
            selectRole,
            hasRole,
        }),
        [account, token, activeRole, isBootstrapping, login, register, addRole, logout, refreshAccount, selectRole, hasRole],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
