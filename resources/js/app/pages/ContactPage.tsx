import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, getFieldError, unwrapData } from '../lib/api';
import type {
    ApiEnvelope,
    ContactInquirySubmissionRecord,
    ServiceMeta,
} from '../lib/types';

const inquiryCategories = [
    { value: 'service', label: 'サービス全般' },
    { value: 'account', label: 'アカウント' },
    { value: 'booking', label: '予約' },
    { value: 'payment', label: '支払い' },
    { value: 'safety', label: '安全・通報' },
    { value: 'other', label: 'その他' },
] as const;

function categoryLabel(value: string): string {
    return inquiryCategories.find((category) => category.value === value)?.label ?? 'お問い合わせ';
}

function replyChannelLabel(value: string | null | undefined): string {
    switch (value) {
        case 'email':
            return 'メール';
        default:
            return 'サポート窓口';
    }
}

export function ContactPage() {
    const { account, isAuthenticated, token } = useAuth();
    const [serviceMeta, setServiceMeta] = useState<ServiceMeta | null>(null);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [category, setCategory] = useState<(typeof inquiryCategories)[number]['value']>('service');
    const [message, setMessage] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [requestError, setRequestError] = useState<unknown>(null);
    const [metaError, setMetaError] = useState<string | null>(null);
    const [successRecord, setSuccessRecord] = useState<ContactInquirySubmissionRecord | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [lastSubmittedReplyEmail, setLastSubmittedReplyEmail] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    usePageTitle('お問い合わせ');
    useToastOnMessage(error, 'error');
    useToastOnMessage(successMessage, 'success');

    useEffect(() => {
        let isMounted = true;

        void apiRequest<ApiEnvelope<ServiceMeta>>('/service-meta')
            .then((payload) => {
                if (isMounted) {
                    setServiceMeta(unwrapData(payload));
                }
            })
            .catch((requestError: unknown) => {
                if (!isMounted) {
                    return;
                }

                const message = requestError instanceof ApiError ? requestError.message : 'サポート情報の取得に失敗しました。';
                setMetaError(message);
            });

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        if (!account) {
            return;
        }

        setName((current) => current || account.display_name || '');
        setEmail((current) => current || account.email || '');
    }, [account]);

    const replyChannel = useMemo(
        () => replyChannelLabel(serviceMeta?.contact.reply_channel),
        [serviceMeta?.contact.reply_channel],
    );
    const supportEmail = serviceMeta?.support_email ?? account?.email ?? '';
    const normalizedEmail = email.trim();
    const effectiveReplyEmail = normalizedEmail || account?.email || '未設定';
    const isFormEnabled = serviceMeta?.contact.form_enabled ?? true;

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        setIsSubmitting(true);
        setError(null);
        setRequestError(null);
        setSuccessRecord(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<ContactInquirySubmissionRecord>>('/contact', {
                method: 'POST',
                token,
                body: {
                    name: name.trim(),
                    email: normalizedEmail || undefined,
                    category,
                    message: message.trim(),
                },
            });

            const nextRecord = unwrapData(payload);
            setSuccessRecord(nextRecord);
            setLastSubmittedReplyEmail(effectiveReplyEmail);
            setSuccessMessage(`お問い合わせを受け付けました。受付番号: ${nextRecord.public_id}`);
            setName('');
            setEmail('');
            setCategory('service');
            setMessage('');
        } catch (requestError) {
            const message = requestError instanceof ApiError ? requestError.message : 'お問い合わせの送信に失敗しました。';
            setError(message);
            setRequestError(requestError);
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="space-y-8">
            <section className="space-y-4 rounded-[28px] border border-white/10 bg-white/5 p-6 md:p-8">
                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold tracking-wide text-rose-100">
                    サポート
                </span>
                <h1 className="text-4xl font-semibold text-white">お問い合わせ</h1>
                <p className="max-w-3xl text-sm leading-7 text-slate-300">
                    予約前の不明点、アカウントの困りごと、安全面の相談までここから受け付けています。
                    ログイン中ならアカウント情報を引き継いだまま送信できます。
                </p>
                <div className="flex flex-wrap gap-3">
                    <Link
                        to="/help"
                        className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                    >
                        よくある質問を見る
                    </Link>
                    <Link
                        to="/commerce"
                        className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                    >
                        特商法の表記を見る
                    </Link>
                </div>
                {metaError ? <p className="text-sm text-amber-200">{metaError}</p> : null}
            </section>

            <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                <article className="rounded-[28px] border border-white/10 bg-white/5 p-6 md:p-8">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-rose-100">フォーム送信</p>
                        <h2 className="text-2xl font-semibold text-white">内容を入力して送信</h2>
                        <p className="text-sm leading-7 text-slate-300">
                            返信が必要な場合は、通常 {replyChannel} でご連絡します。
                            {isAuthenticated ? ' ログイン中のメールアドレスは自動で反映されます。' : ' 返信先メールアドレスを忘れずに入力してください。'}
                        </p>
                    </div>

                    {!isFormEnabled ? (
                        <div className="mt-6 rounded-[24px] border border-white/10 bg-[#111923] px-5 py-4 text-sm leading-7 text-slate-300">
                            現在フォーム受付を一時停止しています。
                            {supportEmail ? (
                                <>
                                    {' '}お急ぎの場合は
                                    {' '}
                                    <a href={`mailto:${supportEmail}`} className="font-semibold text-white underline decoration-white/30 underline-offset-4">
                                        {supportEmail}
                                    </a>
                                    {' '}
                                    までご連絡ください。
                                </>
                            ) : null}
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                            <div className="grid gap-4 md:grid-cols-2">
                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-white">お名前</span>
                                    <input
                                        value={name}
                                        onChange={(event) => setName(event.target.value)}
                                        className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                        placeholder="山田 太郎"
                                        required
                                    />
                                    {getFieldError(requestError, 'name') ? (
                                        <p className="text-xs text-amber-200">{getFieldError(requestError, 'name')}</p>
                                    ) : null}
                                </label>

                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-white">返信先メールアドレス</span>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(event) => setEmail(event.target.value)}
                                        className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                        placeholder="name@example.com"
                                    />
                                    <p className="text-xs text-slate-400">
                                        {isAuthenticated
                                            ? '空欄にすると、ログイン中のメールアドレスを使います。'
                                            : '返信が必要な場合に使うアドレスです。'}
                                    </p>
                                    {getFieldError(requestError, 'email') ? (
                                        <p className="text-xs text-amber-200">{getFieldError(requestError, 'email')}</p>
                                    ) : null}
                                </label>
                            </div>

                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-white">お問い合わせ内容</span>
                                <select
                                    value={category}
                                    onChange={(event) => setCategory(event.target.value as (typeof inquiryCategories)[number]['value'])}
                                    className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                >
                                    {inquiryCategories.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                                {getFieldError(requestError, 'category') ? (
                                    <p className="text-xs text-amber-200">{getFieldError(requestError, 'category')}</p>
                                ) : null}
                            </label>

                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-white">詳細</span>
                                <textarea
                                    value={message}
                                    onChange={(event) => setMessage(event.target.value)}
                                    rows={8}
                                    className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm leading-7 text-white outline-none transition focus:border-rose-300/50"
                                    placeholder="困っていること、試したこと、予約番号などがあればご記入ください。"
                                    required
                                />
                                <p className="text-xs text-slate-400">10文字以上で入力してください。</p>
                                {getFieldError(requestError, 'message') ? (
                                    <p className="text-xs text-amber-200">{getFieldError(requestError, 'message')}</p>
                                ) : null}
                            </label>

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="inline-flex min-h-11 items-center rounded-full bg-rose-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isSubmitting ? '送信中...' : '送信する'}
                            </button>
                        </form>
                    )}
                </article>

                <aside className="space-y-4">
                    <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                        <p className="text-xs font-semibold tracking-wide text-slate-400">返信について</p>
                        <p className="mt-2 text-lg font-semibold text-white">{replyChannel}でご案内します</p>
                        <p className="mt-2 text-sm leading-7 text-slate-300">
                            送信後は運営の問い合わせ管理に入り、内容確認、メモ追加、解決対応が進みます。必要に応じて返信します。
                            {supportEmail ? ` 連絡先: ${supportEmail}` : ''}
                        </p>
                    </div>

                    {successRecord ? (
                        <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                            <p className="text-xs font-semibold tracking-wide text-slate-400">直近の受付</p>
                            <p className="mt-2 text-lg font-semibold text-white">{successRecord.public_id}</p>
                            <p className="mt-2 text-sm leading-7 text-slate-300">
                                {categoryLabel(successRecord.category)} として受け付けました。返信先は {lastSubmittedReplyEmail ?? '未設定'} です。
                            </p>
                        </div>
                    ) : null}

                    <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                        <p className="text-xs font-semibold tracking-wide text-slate-400">相談しやすい内容</p>
                        <ul className="mt-3 space-y-2 text-sm leading-7 text-slate-300">
                            <li>予約前の流れや料金の確認</li>
                            <li>ログイン、登録、本人確認の困りごと</li>
                            <li>支払い、返金、安全面の相談</li>
                        </ul>
                    </div>

                    {isAuthenticated ? (
                        <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                            <p className="text-xs font-semibold tracking-wide text-slate-400">ログイン中の情報</p>
                            <p className="mt-2 text-lg font-semibold text-white">{account?.display_name || '表示名未設定'}</p>
                            <p className="mt-1 break-all text-sm text-slate-300">{account?.email}</p>
                        </div>
                    ) : null}
                </aside>
            </section>
        </div>
    );
}
