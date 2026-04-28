import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BrandMark } from '../components/brand/BrandMark';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, getFieldError } from '../lib/api';
import type { ApiEnvelope } from '../lib/types';

export function ResetPasswordPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [password, setPassword] = useState('');
    const [passwordConfirmation, setPasswordConfirmation] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [requestError, setRequestError] = useState<unknown>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const token = searchParams.get('token') ?? '';
    const email = searchParams.get('email') ?? '';
    const hasValidParams = token !== '' && email !== '';

    usePageTitle('パスワード再設定');
    useToastOnMessage(error, 'error');
    useToastOnMessage(successMessage, 'success');

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!hasValidParams) {
            setError('再設定リンクが不完全です。メールからもう一度開いてください。');
            return;
        }

        setIsSubmitting(true);
        setError(null);
        setRequestError(null);
        setSuccessMessage(null);

        try {
            await apiRequest<ApiEnvelope<{ status: string }>>('/auth/reset-password', {
                method: 'POST',
                body: {
                    token,
                    email,
                    password,
                    password_confirmation: passwordConfirmation,
                },
            });

            setPassword('');
            setPasswordConfirmation('');
            setSuccessMessage('パスワードを再設定しました。新しいパスワードでログインできます。');
            navigate('/login', { replace: true });
        } catch (requestError) {
            const message = requestError instanceof ApiError ? requestError.message : 'パスワードの再設定に失敗しました。';
            setError(message);
            setRequestError(requestError);
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="mx-auto w-full max-w-6xl">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,0.85fr)]">
                <section className="rounded-[36px] bg-[linear-gradient(107deg,#17202b_3.49%,#1d2a39_53.96%,#27364a_93.62%)] p-8 text-white shadow-[0_30px_80px_rgba(23,32,43,0.18)] md:p-10">
                    <div className="flex h-full flex-col gap-8">
                        <BrandMark inverse />

                        <div className="space-y-4">
                            <div className="inline-flex items-center gap-2 rounded-full border border-[#e8d5b2]/45 bg-white/10 px-5 py-2 text-sm font-bold text-[#e8d5b2]">
                                <span className="inline-flex h-2 w-2 rounded-full bg-[#d2b179]" />
                                PASSWORD RESET
                            </div>

                            <div className="space-y-3">
                                <h1 className="max-w-[12ch] text-[2.35rem] font-semibold leading-[1.4] md:max-w-none md:text-[3rem]">
                                    新しいパスワードを設定
                                </h1>
                                <p className="max-w-2xl text-sm leading-7 text-[#d8d3ca] md:text-base md:leading-8">
                                    メールで受け取ったリンクから、新しいパスワードを設定します。設定後は、そのままログイン画面へ戻れます。
                                </p>
                            </div>
                        </div>

                        <div className="rounded-[24px] border border-white/10 bg-white/6 px-5 py-4 text-sm leading-7 text-[#d8d3ca]">
                            {hasValidParams
                                ? '新しいパスワードは 10 文字以上で設定してください。'
                                : 'リンクが不完全な場合は、アカウント設定からもう一度再設定メールを送ってください。'}
                        </div>
                    </div>
                </section>

                <section className="rounded-[36px] bg-[#fffdf8] p-7 text-[#17202b] shadow-[0_18px_36px_rgba(23,32,43,0.12)] md:p-8">
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">ACCOUNT</p>
                            <h2 className="text-2xl font-semibold">パスワード再設定</h2>
                            <p className="text-sm leading-7 text-[#68707a]">
                                登録メールアドレスに届いたリンクから、この画面を開いてください。
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="space-y-2">
                                <label htmlFor="reset-email" className="text-sm font-semibold text-[#17202b]">
                                    メールアドレス
                                </label>
                                <input
                                    id="reset-email"
                                    type="email"
                                    value={email}
                                    readOnly
                                    className="w-full rounded-[18px] border border-[#e4d7c2] bg-[#f6f1e7] px-4 py-3 text-sm text-[#5f6874] outline-none"
                                />
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="reset-password" className="text-sm font-semibold text-[#17202b]">
                                    新しいパスワード
                                </label>
                                <input
                                    id="reset-password"
                                    type="password"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    className="w-full rounded-[18px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm outline-none transition focus:border-[#c6a16a]"
                                    placeholder="10文字以上で入力"
                                    autoComplete="new-password"
                                    required
                                />
                                {getFieldError(requestError, 'password') ? (
                                    <p className="text-xs text-amber-700">{getFieldError(requestError, 'password')}</p>
                                ) : null}
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="reset-password-confirmation" className="text-sm font-semibold text-[#17202b]">
                                    新しいパスワード確認
                                </label>
                                <input
                                    id="reset-password-confirmation"
                                    type="password"
                                    value={passwordConfirmation}
                                    onChange={(event) => setPasswordConfirmation(event.target.value)}
                                    className="w-full rounded-[18px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm outline-none transition focus:border-[#c6a16a]"
                                    placeholder="もう一度入力"
                                    autoComplete="new-password"
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmitting || !hasValidParams}
                                className="inline-flex w-full items-center justify-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-6 py-3 text-sm font-bold text-[#1a2430] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                                {isSubmitting ? '再設定中...' : '新しいパスワードを設定'}
                            </button>
                        </form>

                        <div className="rounded-[24px] bg-[#f6f1e7] p-5">
                            <p className="text-sm font-semibold text-[#17202b]">ログイン画面へ戻る</p>
                            <p className="mt-2 text-sm leading-7 text-[#68707a]">
                                パスワードを設定し直したあと、そのままログイン画面から入り直せます。
                            </p>
                            <Link
                                to="/login"
                                className="mt-4 inline-flex items-center rounded-full border border-[#d9c9ae] px-4 py-2 text-sm font-semibold text-[#17202b] transition hover:bg-white"
                            >
                                ログインへ戻る
                            </Link>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
