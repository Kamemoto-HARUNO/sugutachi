import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import type { ApiEnvelope, HelpFaqItem } from '../lib/types';

export function HelpPage() {
    const [faqs, setFaqs] = useState<HelpFaqItem[]>([]);
    const [error, setError] = useState<string | null>(null);

    usePageTitle('ヘルプ');
    useToastOnMessage(error, 'error');

    useEffect(() => {
        let isMounted = true;

        void apiRequest<ApiEnvelope<HelpFaqItem[]>>('/help/faqs')
            .then((payload) => {
                if (isMounted) {
                    setFaqs(unwrapData(payload));
                }
            })
            .catch((requestError: unknown) => {
                if (!isMounted) {
                    return;
                }

                const message = requestError instanceof ApiError ? requestError.message : 'FAQ の取得に失敗しました。';

                setError(message);
            });

        return () => {
            isMounted = false;
        };
    }, []);

    return (
        <div className="space-y-8">
            <section className="space-y-4 rounded-[28px] border border-white/10 bg-white/5 p-6 md:p-8">
                <p className="text-sm font-medium tracking-wide text-rose-200">ヘルプ</p>
                <h1 className="text-4xl font-semibold text-white">よくある質問</h1>
                <p className="max-w-3xl text-sm leading-7 text-slate-300">
                    予約前の確認や、アカウント利用中に迷いやすい点をまとめています。
                    当てはまる答えが見つからない場合は、お問い合わせフォームからそのまま相談できます。
                </p>
                <div className="flex flex-wrap gap-3">
                    <Link
                        to="/contact"
                        className="inline-flex items-center rounded-full bg-rose-300 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-rose-200"
                    >
                        お問い合わせ
                    </Link>
                    <Link
                        to="/"
                        className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                    >
                        ホームへ戻る
                    </Link>
                </div>
            </section>

            <section className="space-y-4">
                {faqs.map((faq) => (
                    <article key={faq.id} className="rounded-lg border border-white/10 bg-white/5 p-6">
                        <p className="text-xs uppercase tracking-wide text-slate-400">{faq.category}</p>
                        <h2 className="mt-3 text-xl font-medium text-white">{faq.question}</h2>
                        <p className="mt-4 text-sm leading-7 text-slate-300">{faq.answer}</p>
                    </article>
                ))}

                {!error && faqs.length === 0 ? (
                    <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-sm text-slate-300">
                        いま表示できるご案内はありません。急ぎの場合はお問い合わせをご利用ください。
                    </div>
                ) : null}
            </section>
        </div>
    );
}
