import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { BrandMark } from '../components/brand/BrandMark';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { getPostAuthPath, inferRoleFromPath, sanitizeAppPath } from '../lib/account';
import { ApiError, apiRequest, getFieldError, unwrapData } from '../lib/api';
import { toDomesticDigits, toE164PhoneNumber } from '../lib/phone';
import type { ApiEnvelope, LegalDocumentSummary } from '../lib/types';

type InitialRole = 'user' | 'therapist';

interface LocationState {
    from?: string;
}

function resolveReturnTo(rawQueryValue: string | null, state: LocationState | null): string | null {
    return sanitizeAppPath(rawQueryValue) ?? sanitizeAppPath(state?.from);
}

export function RegisterPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const { register } = useAuth();
    const [documents, setDocuments] = useState<LegalDocumentSummary[]>([]);
    const [displayName, setDisplayName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [initialRole, setInitialRole] = useState<InitialRole>('user');
    const [password, setPassword] = useState('');
    const [passwordConfirmation, setPasswordConfirmation] = useState('');
    const [acceptTerms, setAcceptTerms] = useState(false);
    const [acceptPrivacy, setAcceptPrivacy] = useState(false);
    const [isOver18, setIsOver18] = useState(false);
    const [agreedRelaxationPurpose, setAgreedRelaxationPurpose] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isLoadingDocuments, setIsLoadingDocuments] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const locationState = (location.state as LocationState | null) ?? null;
    const returnTo = useMemo(
        () => resolveReturnTo(searchParams.get('return_to'), locationState),
        [locationState, searchParams],
    );
    const returnRole = inferRoleFromPath(returnTo);
    const loginPath = returnTo ? `/login?return_to=${encodeURIComponent(returnTo)}` : '/login';

    usePageTitle('会員登録');
    useToastOnMessage(error, 'error');

    useEffect(() => {
        let isMounted = true;

        void apiRequest<ApiEnvelope<LegalDocumentSummary[]>>('/legal-documents')
            .then((payload) => {
                if (!isMounted) {
                    return;
                }

                setDocuments(unwrapData(payload));
            })
            .catch((requestError: unknown) => {
                if (!isMounted) {
                    return;
                }

                const message =
                    requestError instanceof ApiError ? requestError.message : '規約情報の取得に失敗しました。';

                setError(message);
            })
            .finally(() => {
                if (isMounted) {
                    setIsLoadingDocuments(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, []);

    const termsDocument = useMemo(
        () => documents.find((document) => document.document_type === 'terms') ?? null,
        [documents],
    );
    const privacyDocument = useMemo(
        () => documents.find((document) => document.document_type === 'privacy') ?? null,
        [documents],
    );

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);

        if (!termsDocument || !privacyDocument) {
            setError('公開中の法務文書が見つからないため、登録を進められません。');
            return;
        }

        if (!acceptTerms || !acceptPrivacy || !isOver18 || !agreedRelaxationPurpose) {
            setError('同意項目を確認してください。');
            return;
        }

        const normalizedPhone = toE164PhoneNumber(phone);

        if (phone.trim() !== '' && !normalizedPhone) {
            setError('電話番号は 08012345678 のように、先頭の 0 を含む数字だけで入力してください。');
            return;
        }

        setIsSubmitting(true);

        try {
            const account = await register({
                email,
                phone_e164: normalizedPhone ?? undefined,
                password,
                password_confirmation: passwordConfirmation,
                display_name: displayName || undefined,
                initial_role: initialRole,
                accepted_terms_version: termsDocument.version,
                accepted_privacy_version: privacyDocument.version,
                is_over_18: isOver18,
                relaxation_purpose_agreed: agreedRelaxationPurpose,
            });

            if (returnTo && (!returnRole || returnRole === initialRole)) {
                navigate(returnTo, { replace: true });
                return;
            }

            navigate(getPostAuthPath(account, initialRole), { replace: true });
        } catch (requestError) {
            if (requestError instanceof ApiError) {
                setError(
                    getFieldError(requestError, 'email')
                    ?? getFieldError(requestError, 'phone_e164')
                    ?? getFieldError(requestError, 'password')
                    ?? requestError.message,
                );
            } else {
                setError('会員登録に失敗しました。');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="mx-auto w-full max-w-6xl">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(460px,0.95fr)]">
                <section className="rounded-[36px] bg-[linear-gradient(107deg,#17202b_3.49%,#1d2a39_53.96%,#27364a_93.62%)] p-8 text-white shadow-[0_30px_80px_rgba(23,32,43,0.18)] md:p-10">
                    <div className="flex h-full flex-col gap-8">
                        <BrandMark inverse />

                        <div className="space-y-4">
                            <div className="inline-flex items-center gap-2 rounded-full border border-[#e8d5b2]/45 bg-white/10 px-5 py-2 text-sm font-bold text-[#e8d5b2]">
                                <span className="inline-flex h-2 w-2 rounded-full bg-[#d2b179]" />
                                Create Account
                            </div>

                            <div className="space-y-3">
                                <h1 className="max-w-[9ch] text-[2.35rem] font-semibold leading-[1.4] md:text-[3rem]">
                                    まずは会員登録から
                                </h1>
                                <p className="max-w-2xl text-sm leading-7 text-[#d8d3ca] md:text-base md:leading-8">
                                    1つのアカウントで、利用者として探し始めることも、セラピストとして準備を始めることもできます。ここでは最初に使うモードを選び、もう片方はログイン後に追加できます。
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {[
                                {
                                    value: 'user' as const,
                                    label: '最初は利用者としてはじめる',
                                    body: '検索、公開プロフィール確認、空き時間選択、予約リクエストまで進めます。',
                                    active: initialRole === 'user',
                                },
                                {
                                    value: 'therapist' as const,
                                    label: '最初はセラピストとしてはじめる',
                                    body: '本人確認、受取口座設定、プロフィール入力、空き枠公開の準備へ進みます。',
                                    active: initialRole === 'therapist',
                                },
                            ].map((item) => (
                                <button
                                    key={item.label}
                                    type="button"
                                    onClick={() => setInitialRole(item.value)}
                                    className={[
                                        'w-full rounded-[24px] border p-5 text-left transition',
                                        item.active ? 'border-[#d2b179] bg-white/10' : 'border-white/10 bg-white/6 hover:bg-white/8',
                                    ].join(' ')}
                                >
                                    <p className="text-sm font-semibold text-[#f4efe5]">{item.label}</p>
                                    <p className="mt-2 text-sm leading-7 text-[#d8d3ca]">{item.body}</p>
                                </button>
                            ))}
                        </div>

                        {returnTo ? (
                            <div className="rounded-[24px] border border-white/10 bg-white/6 px-5 py-4 text-sm leading-7 text-[#d8d3ca]">
                                登録後は、さっき見ていた画面に戻ります。
                            </div>
                        ) : null}
                    </div>
                </section>

                <section className="rounded-[36px] bg-[#fffdf8] p-7 text-[#17202b] shadow-[0_18px_36px_rgba(23,32,43,0.12)] md:p-8">
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">ACCOUNT SETUP</p>
                            <h2 className="text-2xl font-semibold">会員登録</h2>
                            <p className="text-sm leading-7 text-[#68707a]">
                                最新の規約に同意した状態で、すぐに利用を始められます。
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="grid gap-4 md:grid-cols-2">
                                <label className="space-y-2">
                                    <span className="text-sm font-semibold">表示名</span>
                                    <input
                                        value={displayName}
                                        onChange={(event) => setDisplayName(event.target.value)}
                                        className="w-full rounded-[18px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm outline-none transition focus:border-[#c6a16a]"
                                        placeholder="ニックネーム"
                                    />
                                </label>
                                <label className="space-y-2">
                                    <span className="text-sm font-semibold">電話番号</span>
                                    <input
                                        type="tel"
                                        value={phone}
                                        onChange={(event) => setPhone(toDomesticDigits(event.target.value))}
                                        className="w-full rounded-[18px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm outline-none transition focus:border-[#c6a16a]"
                                        inputMode="numeric"
                                        autoComplete="tel-national"
                                        placeholder="08012345678"
                                    />
                                    <p className="text-xs leading-6 text-[#68707a]">数字のみ入力してください。国番号の入力は不要です。</p>
                                </label>
                            </div>

                            <label className="space-y-2">
                                <span className="text-sm font-semibold">メールアドレス</span>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    className="w-full rounded-[18px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm outline-none transition focus:border-[#c6a16a]"
                                    placeholder="you@example.com"
                                    autoComplete="email"
                                    required
                                />
                            </label>

                            <div className="grid gap-4 md:grid-cols-2">
                                <label className="space-y-2">
                                    <span className="text-sm font-semibold">パスワード</span>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(event) => setPassword(event.target.value)}
                                        className="w-full rounded-[18px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm outline-none transition focus:border-[#c6a16a]"
                                        placeholder="10文字以上"
                                        autoComplete="new-password"
                                        required
                                    />
                                </label>
                                <label className="space-y-2">
                                    <span className="text-sm font-semibold">パスワード確認</span>
                                    <input
                                        type="password"
                                        value={passwordConfirmation}
                                        onChange={(event) => setPasswordConfirmation(event.target.value)}
                                        className="w-full rounded-[18px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm outline-none transition focus:border-[#c6a16a]"
                                        placeholder="もう一度入力"
                                        autoComplete="new-password"
                                        required
                                    />
                                </label>
                            </div>

                            <div className="rounded-[24px] bg-[#f6f1e7] p-5">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-semibold text-[#17202b]">公開中の法務文書</p>
                                        <p className="mt-1 text-xs text-[#68707a]">
                                            利用規約とプライバシーポリシーの最新版に同意して登録します。
                                        </p>
                                    </div>
                                    {isLoadingDocuments ? (
                                        <span className="text-xs text-[#68707a]">読み込み中...</span>
                                    ) : null}
                                </div>

                                <div className="mt-4 space-y-3">
                                    <label className="flex items-start gap-3 text-sm text-[#17202b]">
                                        <input type="checkbox" checked={acceptTerms} onChange={(event) => setAcceptTerms(event.target.checked)} className="mt-1" />
                                        <span>
                                            <Link to="/terms" className="font-semibold text-[#9a7a49] underline underline-offset-4">
                                                利用規約
                                            </Link>
                                            {termsDocument ? `（v${termsDocument.version}）` : ' の最新版'} に同意します
                                        </span>
                                    </label>
                                    <label className="flex items-start gap-3 text-sm text-[#17202b]">
                                        <input type="checkbox" checked={acceptPrivacy} onChange={(event) => setAcceptPrivacy(event.target.checked)} className="mt-1" />
                                        <span>
                                            <Link to="/privacy" className="font-semibold text-[#9a7a49] underline underline-offset-4">
                                                プライバシーポリシー
                                            </Link>
                                            {privacyDocument ? `（v${privacyDocument.version}）` : ' の最新版'} に同意します
                                        </span>
                                    </label>
                                    <label className="flex items-start gap-3 text-sm text-[#17202b]">
                                        <input type="checkbox" checked={isOver18} onChange={(event) => setIsOver18(event.target.checked)} className="mt-1" />
                                        <span>18歳以上であることを確認しました</span>
                                    </label>
                                    <label className="flex items-start gap-3 text-sm text-[#17202b]">
                                        <input
                                            type="checkbox"
                                            checked={agreedRelaxationPurpose}
                                            onChange={(event) => setAgreedRelaxationPurpose(event.target.checked)}
                                            className="mt-1"
                                        />
                                        <span>本サービスがリラクゼーション / ボディケア / もみほぐし目的のサービスであることに同意します</span>
                                    </label>
                                </div>
                            </div>


                            <button
                                type="submit"
                                disabled={isSubmitting || isLoadingDocuments}
                                className="inline-flex w-full items-center justify-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-6 py-3 text-sm font-bold text-[#1a2430] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                                {isSubmitting ? '登録中...' : '会員登録する'}
                            </button>
                        </form>

                        <div className="rounded-[24px] bg-[#f6f1e7] p-5">
                            <p className="text-sm font-semibold text-[#17202b]">すでにアカウントがある場合</p>
                            <p className="mt-2 text-sm leading-7 text-[#68707a]">
                                既存アカウントでログインして、そのまま続きの画面へ戻れます。
                            </p>
                            <Link
                                to={loginPath}
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
