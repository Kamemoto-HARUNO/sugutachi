import { useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { PasswordField } from '../components/forms/PasswordField';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import {
    getPostAuthPath,
    hasActiveRole,
    inferRoleFromPath,
    sanitizeAppPath,
    type RoleName,
} from '../lib/account';
import { ApiError, getFieldError } from '../lib/api';

interface LoginPageProps {
    targetRole?: RoleName;
}

interface LocationState {
    from?: string;
}

function resolveReturnTo(rawQueryValue: string | null, state: LocationState | null): string | null {
    return sanitizeAppPath(rawQueryValue) ?? sanitizeAppPath(state?.from);
}

export function LoginPage({ targetRole }: LoginPageProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const { login, logout, selectRole } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const title = targetRole === 'admin' ? '運営ログイン' : 'ログイン';
    const locationState = (location.state as LocationState | null) ?? null;
    const returnTo = useMemo(
        () => resolveReturnTo(searchParams.get('return_to'), locationState),
        [locationState, searchParams],
    );
    const returnRole = inferRoleFromPath(returnTo);
    const registerPath = returnTo ? `/register?return_to=${encodeURIComponent(returnTo)}` : '/register';

    usePageTitle(title);
    useToastOnMessage(error, 'error');

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        setIsSubmitting(true);

        try {
            const account = await login({
                email,
                password,
            });

            if (targetRole && !hasActiveRole(account, targetRole)) {
                await logout();
                setError('このアカウントは指定された画面へアクセスできません。');
                return;
            }

            const nextRole =
                (returnRole && hasActiveRole(account, returnRole) ? returnRole : null)
                ?? (targetRole && hasActiveRole(account, targetRole) ? targetRole : null);

            if (nextRole) {
                selectRole(nextRole);
            }

            navigate(
                targetRole === 'admin'
                    ? getPostAuthPath(account, targetRole)
                    : (returnTo ?? getPostAuthPath(account, nextRole ?? targetRole)),
                { replace: true },
            );
        } catch (requestError) {
            if (requestError instanceof ApiError) {
                setError(getFieldError(requestError, 'email') ?? requestError.message);
            } else {
                setError('ログインに失敗しました。');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="mx-auto w-full max-w-[560px]">
            <section className="rounded-[36px] bg-[#fffdf8] p-7 text-[#17202b] shadow-[0_18px_36px_rgba(23,32,43,0.12)] md:p-8">
                <div className="space-y-6">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">
                            {targetRole === 'admin' ? 'OPERATIONS' : 'ACCOUNT'}
                        </p>
                        <h1 className="text-2xl font-semibold">{title}</h1>
                        <p className="text-sm leading-7 text-[#68707a]">
                            メールアドレスとパスワードでログインします。
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-2">
                            <label htmlFor="email" className="text-sm font-semibold text-[#17202b]">
                                メールアドレス
                            </label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                className="w-full rounded-[18px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm outline-none transition focus:border-[#c6a16a]"
                                placeholder="you@example.com"
                                autoComplete="email"
                                required
                            />
                        </div>

                        <PasswordField
                            id="password"
                            label="パスワード"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="10文字以上"
                            autoComplete="current-password"
                            required
                        />

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="inline-flex w-full items-center justify-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-6 py-3 text-sm font-bold text-[#1a2430] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                            {isSubmitting ? 'ログイン中...' : 'ログイン'}
                        </button>
                    </form>

                    {targetRole !== 'admin' ? (
                        <div className="rounded-[24px] bg-[#f6f1e7] p-5">
                            <p className="text-sm font-semibold text-[#17202b]">まだアカウントがない場合</p>
                            <p className="mt-2 text-sm leading-7 text-[#68707a]">
                                利用規約とプライバシーポリシーに同意して、すぐに会員登録できます。
                            </p>
                            <Link
                                to={registerPath}
                                className="mt-4 inline-flex items-center rounded-full border border-[#d9c9ae] px-4 py-2 text-sm font-semibold text-[#17202b] transition hover:bg-white"
                            >
                                会員登録へ進む
                            </Link>
                        </div>
                    ) : null}
                </div>
            </section>
        </div>
    );
}
