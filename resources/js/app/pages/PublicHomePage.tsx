import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import type { ApiEnvelope, ServiceMeta } from '../lib/types';

export function PublicHomePage() {
    const [serviceMeta, setServiceMeta] = useState<ServiceMeta | null>(null);
    const [error, setError] = useState<string | null>(null);

    usePageTitle('ホーム');

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

                const message =
                    requestError instanceof ApiError ? requestError.message : '公開情報の読み込みに失敗しました。';

                setError(message);
            });

        return () => {
            isMounted = false;
        };
    }, []);

    return (
        <div className="space-y-16">
            <section className="grid gap-10 lg:grid-cols-[1.4fr_0.9fr] lg:items-end">
                <div className="space-y-6">
                    <p className="text-sm font-medium tracking-wide text-rose-200">Frontend Foundation</p>
                    <div className="space-y-4">
                        <h1 className="max-w-4xl text-5xl font-semibold tracking-tight text-white">
                            {serviceMeta?.service_name ?? 'すぐタチ'} の画面実装を始められる土台を整えました。
                        </h1>
                        <p className="max-w-3xl text-base leading-8 text-slate-300">
                            公開ページ、利用者、セラピスト、運営の URL を SPA で受けられるようにして、認証・役割切替・法務文書表示・会員登録の入口まで
                            一続きで動く形にしています。
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <Link
                            to="/register"
                            className="rounded-full bg-rose-300 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-rose-200"
                        >
                            会員登録を試す
                        </Link>
                        <Link
                            to="/login"
                            className="rounded-full border border-white/10 px-5 py-3 text-sm text-slate-200 transition hover:bg-white/5"
                        >
                            ログイン
                        </Link>
                        <Link
                            to="/help"
                            className="rounded-full border border-white/10 px-5 py-3 text-sm text-slate-200 transition hover:bg-white/5"
                        >
                            ヘルプを見る
                        </Link>
                    </div>
                    {error ? <p className="text-sm text-amber-200">{error}</p> : null}
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                    <div className="rounded-lg border border-white/10 bg-white/5 p-5">
                        <p className="text-xs uppercase tracking-wide text-slate-400">決済</p>
                        <p className="mt-3 text-lg font-medium text-white">
                            {serviceMeta?.booking.payment_methods.join(', ') ?? 'card'}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-300">与信取得・返金・チャージバック監視まで API 側と接続済みです。</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/5 p-5">
                        <p className="text-xs uppercase tracking-wide text-slate-400">年齢基準</p>
                        <p className="mt-3 text-lg font-medium text-white">
                            {serviceMeta?.booking.minimum_age ?? 18}歳以上
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-300">会員登録と本人確認で成年利用前提を通す構成です。</p>
                    </div>
                </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
                <Link to="/user" className="rounded-lg border border-white/10 bg-white/5 p-6 transition hover:border-rose-300/40 hover:bg-white/10">
                    <p className="text-sm font-medium text-rose-200">利用者</p>
                    <h2 className="mt-3 text-xl font-semibold text-white">探す・予約する</h2>
                    <p className="mt-3 text-sm leading-7 text-slate-300">検索、詳細、空き枠、予約、メッセージまでをここからつないでいきます。</p>
                </Link>
                <Link
                    to="/therapist"
                    className="rounded-lg border border-white/10 bg-white/5 p-6 transition hover:border-amber-300/40 hover:bg-white/10"
                >
                    <p className="text-sm font-medium text-amber-200">セラピスト</p>
                    <h2 className="mt-3 text-xl font-semibold text-white">公開・稼働・売上管理</h2>
                    <p className="mt-3 text-sm leading-7 text-slate-300">プロフィール審査、空き枠、料金ルール、出金までの入り口です。</p>
                </Link>
                <Link to="/admin/login" className="rounded-lg border border-white/10 bg-white/5 p-6 transition hover:border-emerald-300/40 hover:bg-white/10">
                    <p className="text-sm font-medium text-emerald-200">運営</p>
                    <h2 className="mt-3 text-xl font-semibold text-white">監視・審査・運用</h2>
                    <p className="mt-3 text-sm leading-7 text-slate-300">ダッシュボード、通報、予約監視、料金ルール監視へつながります。</p>
                </Link>
            </section>

            <section className="space-y-5">
                <div className="space-y-2">
                    <p className="text-sm font-medium tracking-wide text-slate-300">公開導線</p>
                    <h2 className="text-2xl font-semibold text-white">法務文書とサポートページも SPA から辿れます。</h2>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                    {(serviceMeta?.legal_documents ?? []).map((document) => (
                        <Link key={document.public_id} to={`/${document.document_type === 'terms' ? 'terms' : document.document_type === 'privacy' ? 'privacy' : 'commerce'}`} className="rounded-lg border border-white/10 bg-white/5 p-5 transition hover:bg-white/10">
                            <p className="text-xs uppercase tracking-wide text-slate-400">{document.document_type}</p>
                            <h3 className="mt-3 text-lg font-medium text-white">{document.title}</h3>
                            <p className="mt-2 text-sm text-slate-300">バージョン {document.version}</p>
                        </Link>
                    ))}
                </div>
            </section>
        </div>
    );
}
