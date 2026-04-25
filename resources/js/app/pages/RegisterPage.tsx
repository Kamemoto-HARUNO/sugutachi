import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { getPostAuthPath } from '../lib/account';
import { ApiError, apiRequest, getFieldError, unwrapData } from '../lib/api';
import type { ApiEnvelope, LegalDocumentSummary } from '../lib/types';

export function RegisterPage() {
    const navigate = useNavigate();
    const { register } = useAuth();
    const [documents, setDocuments] = useState<LegalDocumentSummary[]>([]);
    const [displayName, setDisplayName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [initialRole, setInitialRole] = useState<'user' | 'therapist'>('user');
    const [password, setPassword] = useState('');
    const [passwordConfirmation, setPasswordConfirmation] = useState('');
    const [acceptTerms, setAcceptTerms] = useState(false);
    const [acceptPrivacy, setAcceptPrivacy] = useState(false);
    const [isOver18, setIsOver18] = useState(false);
    const [agreedRelaxationPurpose, setAgreedRelaxationPurpose] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    usePageTitle('会員登録');

    useEffect(() => {
        let isMounted = true;

        void apiRequest<ApiEnvelope<LegalDocumentSummary[]>>('/legal-documents')
            .then((payload) => {
                if (isMounted) {
                    setDocuments(unwrapData(payload));
                }
            })
            .catch((requestError: unknown) => {
                if (!isMounted) {
                    return;
                }

                const message =
                    requestError instanceof ApiError ? requestError.message : '規約情報の取得に失敗しました。';

                setError(message);
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

        setIsSubmitting(true);

        try {
            const account = await register({
                email,
                phone_e164: phone || undefined,
                password,
                password_confirmation: passwordConfirmation,
                display_name: displayName || undefined,
                initial_role: initialRole,
                accepted_terms_version: termsDocument.version,
                accepted_privacy_version: privacyDocument.version,
                is_over_18: isOver18,
                relaxation_purpose_agreed: agreedRelaxationPurpose,
            });

            navigate(getPostAuthPath(account, initialRole), { replace: true });
        } catch (requestError) {
            if (requestError instanceof ApiError) {
                setError(
                    getFieldError(requestError, 'email') ??
                        getFieldError(requestError, 'password') ??
                        requestError.message,
                );
            } else {
                setError('会員登録に失敗しました。');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="mx-auto w-full max-w-2xl space-y-8">
            <section className="space-y-3 text-center">
                <p className="text-sm font-medium tracking-wide text-rose-200">Get Started</p>
                <h1 className="text-4xl font-semibold text-white">会員登録</h1>
                <p className="text-sm leading-7 text-slate-300">
                    最新の利用規約・プライバシーポリシーに紐づいた状態で会員登録します。
                </p>
            </section>

            <form onSubmit={handleSubmit} className="space-y-6 rounded-lg border border-white/10 bg-white/5 p-6">
                <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                        <label htmlFor="display_name" className="text-sm font-medium text-slate-200">
                            表示名
                        </label>
                        <input
                            id="display_name"
                            value={displayName}
                            onChange={(event) => setDisplayName(event.target.value)}
                            className="w-full rounded-md border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                            placeholder="ニックネーム"
                        />
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="phone" className="text-sm font-medium text-slate-200">
                            電話番号
                        </label>
                        <input
                            id="phone"
                            type="tel"
                            value={phone}
                            onChange={(event) => setPhone(event.target.value)}
                            className="w-full rounded-md border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                            placeholder="+819012345678"
                        />
                    </div>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
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
                        <label htmlFor="initial_role" className="text-sm font-medium text-slate-200">
                            はじめる役割
                        </label>
                        <select
                            id="initial_role"
                            value={initialRole}
                            onChange={(event) => setInitialRole(event.target.value as 'user' | 'therapist')}
                            className="w-full rounded-md border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                        >
                            <option value="user">利用者としてはじめる</option>
                            <option value="therapist">セラピストとしてはじめる</option>
                        </select>
                    </div>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
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
                            autoComplete="new-password"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="password_confirmation" className="text-sm font-medium text-slate-200">
                            パスワード確認
                        </label>
                        <input
                            id="password_confirmation"
                            type="password"
                            value={passwordConfirmation}
                            onChange={(event) => setPasswordConfirmation(event.target.value)}
                            className="w-full rounded-md border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                            placeholder="もう一度入力"
                            autoComplete="new-password"
                            required
                        />
                    </div>
                </div>

                <div className="space-y-3 rounded-lg border border-white/10 bg-slate-950/40 p-5">
                    <label className="flex items-start gap-3 text-sm text-slate-200">
                        <input type="checkbox" checked={acceptTerms} onChange={(event) => setAcceptTerms(event.target.checked)} className="mt-1" />
                        <span>
                            <Link to="/terms" className="text-rose-200 underline underline-offset-4">
                                利用規約
                            </Link>
                            {termsDocument ? `（v${termsDocument.version}）` : ''} に同意します
                        </span>
                    </label>
                    <label className="flex items-start gap-3 text-sm text-slate-200">
                        <input type="checkbox" checked={acceptPrivacy} onChange={(event) => setAcceptPrivacy(event.target.checked)} className="mt-1" />
                        <span>
                            <Link to="/privacy" className="text-rose-200 underline underline-offset-4">
                                プライバシーポリシー
                            </Link>
                            {privacyDocument ? `（v${privacyDocument.version}）` : ''} に同意します
                        </span>
                    </label>
                    <label className="flex items-start gap-3 text-sm text-slate-200">
                        <input type="checkbox" checked={isOver18} onChange={(event) => setIsOver18(event.target.checked)} className="mt-1" />
                        <span>18歳以上であることを確認しました</span>
                    </label>
                    <label className="flex items-start gap-3 text-sm text-slate-200">
                        <input
                            type="checkbox"
                            checked={agreedRelaxationPurpose}
                            onChange={(event) => setAgreedRelaxationPurpose(event.target.checked)}
                            className="mt-1"
                        />
                        <span>本サービスがリラクゼーション / ボディケア / もみほぐし目的のサービスであることに同意します</span>
                    </label>
                </div>

                {error ? <p className="text-sm text-amber-200">{error}</p> : null}

                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full rounded-full bg-rose-300 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-70"
                >
                    {isSubmitting ? '登録中...' : '会員登録する'}
                </button>
            </form>
        </div>
    );
}
