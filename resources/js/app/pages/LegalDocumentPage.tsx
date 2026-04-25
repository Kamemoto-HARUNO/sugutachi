import { useEffect, useState } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import type { ApiEnvelope, LegalDocumentSummary } from '../lib/types';

interface LegalDocumentPageProps {
    documentType: 'terms' | 'privacy' | 'commerce';
    title: string;
}

export function LegalDocumentPage({ documentType, title }: LegalDocumentPageProps) {
    const [documentData, setDocumentData] = useState<LegalDocumentSummary | null>(null);
    const [error, setError] = useState<string | null>(null);

    usePageTitle(title);

    useEffect(() => {
        let isMounted = true;

        void apiRequest<ApiEnvelope<LegalDocumentSummary>>(`/legal-documents/${documentType}`)
            .then((payload) => {
                if (isMounted) {
                    setDocumentData(unwrapData(payload));
                }
            })
            .catch((requestError: unknown) => {
                if (!isMounted) {
                    return;
                }

                const message =
                    requestError instanceof ApiError ? requestError.message : '法務文書の読み込みに失敗しました。';

                setError(message);
            });

        return () => {
            isMounted = false;
        };
    }, [documentType]);

    return (
        <div className="space-y-8">
            <section className="space-y-3 border-b border-white/10 pb-8">
                <p className="text-sm font-medium tracking-wide text-rose-200">Legal</p>
                <h1 className="text-4xl font-semibold text-white">{title}</h1>
                <p className="text-sm leading-7 text-slate-300">
                    公開中の最新版を API から表示しています。登録画面の同意バージョンとも連動します。
                </p>
                {documentData ? (
                    <p className="text-sm text-slate-400">
                        バージョン {documentData.version}
                        {documentData.effective_at ? ` / 発効 ${new Date(documentData.effective_at).toLocaleDateString('ja-JP')}` : ''}
                    </p>
                ) : null}
                {error ? <p className="text-sm text-amber-200">{error}</p> : null}
            </section>

            <section className="rounded-lg border border-white/10 bg-white/5 p-6">
                <div className="whitespace-pre-wrap text-sm leading-8 text-slate-200">
                    {documentData?.body ?? '公開文書を読み込んでいます。'}
                </div>
            </section>
        </div>
    );
}
