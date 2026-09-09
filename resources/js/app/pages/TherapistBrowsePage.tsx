import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PublicHeaderBar } from '../components/public/PublicHeaderBar';
import { TherapistDiscoveryGrid } from '../components/discovery/TherapistDiscoveryGrid';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { getMyPageEntryPath } from '../lib/account';
import { apiRequest } from '../lib/api';
import type { TherapistSearchResult } from '../lib/types';

export function TherapistBrowsePage() {
    const { account, activeRole, token, isAuthenticated, hasRole, selectRole } = useAuth();
    const [params, setParams] = useSearchParams();
    const query = params.get('q') ?? '';
    const page = Math.max(1, Number(params.get('page')) || 1);
    const [input, setInput] = useState(query);
    const [results, setResults] = useState<TherapistSearchResult[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    usePageTitle('タチキャスト一覧');
    useEffect(() => {
        let alive = true;
        setLoading(true); setError('');
        apiRequest<{data: TherapistSearchResult[]; meta: {has_more: boolean}}>(`/public-therapists?limit=12&page=${page}&q=${encodeURIComponent(query)}`, { token })
            .then(data => { if (alive) { setResults(data.data); setHasMore(data.meta.has_more); } })
            .catch(() => { if (alive) setError('一覧を取得できませんでした。もう一度お試しください。'); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [token, page, query]);
    return <main className="min-h-screen bg-[#f3eee4] px-4 py-6 text-[#17202b]">
        <div className="mx-auto max-w-[1200px] space-y-6">
            <div className="rounded-3xl bg-[#17202b] p-5"><PublicHeaderBar actions={[{label: isAuthenticated ? 'マイページ' : 'ログイン', to: isAuthenticated ? getMyPageEntryPath(account, activeRole) : '/login'}]} /></div>
            <h1 className="text-3xl font-bold">タチキャスト一覧</h1>
            <p className="text-sm leading-7">プロフィール・レビューを見て、タチキャストを探せます。</p>
            {isAuthenticated && <div className="rounded-2xl border border-[#ddcfb4] bg-white p-5">
                <p className="text-sm leading-7">予約や事前の質問、待ち合わせ場所を使った検索は利用者モードで行います。</p>
                {hasRole('user') ? <button type="button" onClick={() => selectRole('user')} className="mt-3 min-h-11 rounded-full bg-[#17202b] px-5 text-sm font-semibold text-white">利用者モードに切り替えて探す</button> : <Link className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[#17202b] px-5 text-sm text-white" to="/role-select?add_role=user&return_to=%2Ftherapists">利用者モードを追加して探す</Link>}
            </div>}
            <form className="flex gap-2" onSubmit={event => { event.preventDefault(); setParams({q: input}); }}>
                <input aria-label="キャスト名で検索" value={input} maxLength={80} onChange={event => setInput(event.target.value)} placeholder="キャスト名で検索" className="min-w-0 flex-1 rounded-full border border-[#ddcfb4] bg-white px-4 py-3" />
                <button className="rounded-full bg-[#17202b] px-5 text-white">検索</button>
            </form>
            <Link to="/gay-massage" className="inline-flex min-h-11 items-center text-sm underline">地域から探す</Link>
            {error ? <p role="alert">{error}</p> : loading ? <p role="status">読み込み中...</p> : <TherapistDiscoveryGrid therapists={results} durationMinutes={60} footerHint="プロフィールを見る" buildLink={cast => `/therapists/${cast.public_id}`} hideTravelTimePlaceholder hideEstimatedPricePlaceholder emptyState={<p>該当するタチキャストはいません。</p>} />}
            <div className="flex justify-between gap-3">
                <button disabled={loading || page <= 1} onClick={() => setParams({q: query, page: String(page - 1)})} className="min-h-11 rounded-full border px-5 disabled:opacity-30">前へ</button>
                <button disabled={loading || !hasMore} onClick={() => setParams({q: query, page: String(page + 1)})} className="min-h-11 rounded-full border px-5 disabled:opacity-30">次へ</button>
            </div>
        </div>
    </main>;
}
