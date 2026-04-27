import { useEffect, useMemo, useState } from 'react';
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

    const groupedFaqs = useMemo(() => {
        return faqs.reduce<Record<string, HelpFaqItem[]>>((groups, faq) => {
            groups[faq.category] ??= [];
            groups[faq.category].push(faq);

            return groups;
        }, {});
    }, [faqs]);

    const categoryOrder = ['service', 'account', 'booking', 'payment', 'safety'];

    function categoryLabel(category: string): string {
        switch (category) {
            case 'service':
                return 'サービスについて';
            case 'account':
                return 'アカウント・本人確認';
            case 'booking':
                return '予約・当日の流れ';
            case 'payment':
                return '支払い・料金';
            case 'safety':
                return '安全・トラブル対応';
            default:
                return 'ご案内';
        }
    }

    return (
        <div className="space-y-8">
            <section className="space-y-4 rounded-[28px] border border-white/10 bg-white/5 p-6 md:p-8">
                <p className="text-sm font-medium tracking-wide text-rose-200">ヘルプ</p>
                <h1 className="text-4xl font-semibold text-white">よくある質問</h1>
                <p className="max-w-3xl text-sm leading-7 text-slate-300">
                    予約前の確認や、アカウント利用中に迷いやすい点をまとめています。
                    当てはまる答えが見つからない場合は、お問い合わせフォームからそのまま相談できます。
                </p>
                <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-[20px] border border-white/10 bg-[#111923] px-4 py-4">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">予約前に確認しやすいこと</p>
                        <p className="mt-2 text-sm leading-7 text-slate-300">本人確認、待ち合わせ場所、時間変更の提案、キャンセル料の考え方を先にまとめています。</p>
                    </div>
                    <div className="rounded-[20px] border border-white/10 bg-[#111923] px-4 py-4">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">支払いで迷いやすいこと</p>
                        <p className="mt-2 text-sm leading-7 text-slate-300">与信の確保、最終金額の確定タイミング、対応時間の計算方法を確認できます。</p>
                    </div>
                    <div className="rounded-[20px] border border-white/10 bg-[#111923] px-4 py-4">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">トラブル時の相談</p>
                        <p className="mt-2 text-sm leading-7 text-slate-300">未着、通報、安全面の困りごと、禁止行為への対応など、相談しやすい内容も案内しています。</p>
                    </div>
                </div>
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
                {categoryOrder
                    .filter((category) => (groupedFaqs[category]?.length ?? 0) > 0)
                    .map((category) => (
                        <section key={category} className="space-y-4 rounded-[28px] border border-white/10 bg-white/5 p-6 md:p-8">
                            <div className="space-y-2">
                                <p className="text-xs font-semibold tracking-wide text-rose-200">{categoryLabel(category)}</p>
                                <h2 className="text-2xl font-semibold text-white">{categoryLabel(category)}</h2>
                            </div>

                            <div className="grid gap-4">
                                {groupedFaqs[category].map((faq) => (
                                    <article key={faq.id} className="rounded-[22px] border border-white/10 bg-[#111923] p-5">
                                        <h3 className="text-lg font-semibold text-white">{faq.question}</h3>
                                        <p className="mt-3 text-sm leading-7 text-slate-300">{faq.answer}</p>
                                    </article>
                                ))}
                            </div>
                        </section>
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
