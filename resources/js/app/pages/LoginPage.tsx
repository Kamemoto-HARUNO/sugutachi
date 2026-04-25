import { useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { BrandMark } from '../components/brand/BrandMark';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
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
        <div className="mx-auto w-full max-w-6xl">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,0.85fr)]">
                <section className="rounded-[36px] bg-[linear-gradient(107deg,#17202b_3.49%,#1d2a39_53.96%,#27364a_93.62%)] p-8 text-white shadow-[0_30px_80px_rgba(23,32,43,0.18)] md:p-10">
                    <div className="flex h-full flex-col gap-8">
                        <BrandMark inverse />

                        <div className="space-y-4">
                            <div className="inline-flex items-center gap-2 rounded-full border border-[#e8d5b2]/45 bg-white/10 px-5 py-2 text-sm font-bold text-[#e8d5b2]">
                                <span className="inline-flex h-2 w-2 rounded-full bg-[#d2b179]" />
                                {targetRole === 'admin' ? 'Admin Access' : 'Member Sign In'}
                            </div>

                            <div className="space-y-3">
                                <h1 className="max-w-[10ch] text-[2.35rem] font-semibold leading-[1.18] md:text-[3rem]">
                                    {targetRole === 'admin' ? '運営アカウントでログイン' : 'ログインして続きを確認'}
                                </h1>
                                <p className="max-w-2xl text-sm leading-7 text-[#d8d3ca] md:text-base md:leading-8">
                                    {targetRole === 'admin'
                                        ? '監視、審査、通報対応、法務管理へ進むための専用ログインです。'
                                        : '検索条件や公開プロフィールを引き継いだまま、空き時間確認や予約作成へ進めます。'}
                                </p>
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                            {[
                                { label: 'SAFE', body: '位置は概算表示のみ。正確な現在地や住所は相手へ公開しません。', tone: 'bg-white/8' },
                                { label: 'RULE', body: 'リラクゼーション / ボディケア / もみほぐし目的での利用に限定します。', tone: 'bg-white/8' },
                                { label: 'FLOW', body: '予定予約は空き時間確認からそのままリクエストへ進めます。', tone: 'bg-white/8' },
                            ].map((item) => (
                                <article key={item.label} className={`rounded-[24px] p-5 ${item.tone}`}>
                                    <p className="text-xs font-semibold tracking-wide text-[#d2b179]">{item.label}</p>
                                    <p className="mt-3 text-sm leading-7 text-[#f0ebe2]">{item.body}</p>
                                </article>
                            ))}
                        </div>

                        {returnTo ? (
                            <div className="rounded-[24px] border border-white/10 bg-white/6 px-5 py-4 text-sm leading-7 text-[#d8d3ca]">
                                ログイン後は、さっき見ていた画面に戻ります。
                            </div>
                        ) : null}
                    </div>
                </section>

                <section className="rounded-[36px] bg-[#fffdf8] p-7 text-[#17202b] shadow-[0_18px_36px_rgba(23,32,43,0.12)] md:p-8">
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">
                                {targetRole === 'admin' ? 'OPERATIONS' : 'ACCOUNT'}
                            </p>
                            <h2 className="text-2xl font-semibold">{title}</h2>
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

                            <div className="space-y-2">
                                <label htmlFor="password" className="text-sm font-semibold text-[#17202b]">
                                    パスワード
                                </label>
                                <input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    className="w-full rounded-[18px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm outline-none transition focus:border-[#c6a16a]"
                                    placeholder="10文字以上"
                                    autoComplete="current-password"
                                    required
                                />
                            </div>

                            {error ? (
                                <div className="rounded-[18px] border border-[#f1d4b5] bg-[#fff4e8] px-4 py-3 text-sm text-[#9a4b35]">
                                    {error}
                                </div>
                            ) : null}

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
        </div>
    );
}
