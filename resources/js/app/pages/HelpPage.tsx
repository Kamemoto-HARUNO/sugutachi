import { useEffect, useState } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import type { ApiEnvelope, HelpFaqItem } from '../lib/types';

export function HelpPage() {
    const [faqs, setFaqs] = useState<HelpFaqItem[]>([]);
    const [error, setError] = useState<string | null>(null);

    usePageTitle('ヘルプ');

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
            <section className="space-y-3 border-b border-white/10 pb-8">
                <p className="text-sm font-medium tracking-wide text-rose-200">Help</p>
                <h1 className="text-4xl font-semibold text-white">よくある質問</h1>
                <p className="max-w-3xl text-sm leading-7 text-slate-300">
                    公開 API から FAQ を読み込む最初の画面です。後続でカテゴリ切替や問い合わせフォームへつなげやすい構成にしています。
                </p>
                {error ? <p className="text-sm text-amber-200">{error}</p> : null}
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
                        FAQ はこれから表示されます。
                    </div>
                ) : null}
            </section>
        </div>
    );
}
