import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { getPostAuthPath, hasActiveRole, type RoleName } from '../lib/account';
import { ApiError, getFieldError } from '../lib/api';

interface LoginPageProps {
    targetRole?: RoleName;
}

export function LoginPage({ targetRole }: LoginPageProps) {
    const navigate = useNavigate();
    const { login, logout, selectRole } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const title = targetRole === 'admin' ? '運営ログイン' : 'ログイン';

    usePageTitle(title);

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
                setError('このアカウントは指定された管理画面へアクセスできません。');
                return;
            }

            if (targetRole) {
                selectRole(targetRole);
            }

            navigate(getPostAuthPath(account, targetRole), { replace: true });
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
        <div className="mx-auto w-full max-w-xl space-y-8">
            <section className="space-y-3 text-center">
                <p className="text-sm font-medium tracking-wide text-rose-200">{targetRole === 'admin' ? 'Admin Access' : 'Welcome Back'}</p>
                <h1 className="text-4xl font-semibold text-white">{title}</h1>
                <p className="text-sm leading-7 text-slate-300">
                    {targetRole === 'admin'
                        ? '運営アカウントでログインしてダッシュボードへ進みます。'
                        : '利用者・セラピスト・運営アカウント共通のログイン画面です。'}
                </p>
            </section>

            <form onSubmit={handleSubmit} className="space-y-6 rounded-lg border border-white/10 bg-white/5 p-6">
                <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium text-slate-200">
                        メールアドレス
                    </label>
                    <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        className="w-full rounded-md border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                        placeholder="you@example.com"
                        autoComplete="email"
                        required
                    />
                </div>

                <div className="space-y-2">
                    <label htmlFor="password" className="text-sm font-medium text-slate-200">
                        パスワード
                    </label>
                    <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="w-full rounded-md border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                        placeholder="10文字以上"
                        autoComplete="current-password"
                        required
                    />
                </div>

                {error ? <p className="text-sm text-amber-200">{error}</p> : null}

                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full rounded-full bg-rose-300 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-70"
                >
                    {isSubmitting ? 'ログイン中...' : 'ログイン'}
                </button>

                {targetRole !== 'admin' ? (
                    <p className="text-center text-sm text-slate-300">
                        まだアカウントがない場合は <Link to="/register" className="text-rose-200 underline underline-offset-4">会員登録</Link>
                    </p>
                ) : null}
            </form>
        </div>
    );
}
