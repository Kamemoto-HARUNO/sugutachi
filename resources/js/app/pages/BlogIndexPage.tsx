import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useSeoMeta } from '../hooks/useSeoMeta';
import { fetchBlogPosts, type BlogPostListMeta } from '../lib/blogs';
import { formatJstDate } from '../lib/datetime';
import type { BlogPostRecord } from '../lib/types';

export function BlogIndexPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [posts, setPosts] = useState<BlogPostRecord[]>([]);
    const [meta, setMeta] = useState<BlogPostListMeta>({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const query = searchParams.get('q') ?? '';
    const category = searchParams.get('category') ?? '';
    const tag = searchParams.get('tag') ?? '';
    const page = Number(searchParams.get('page') ?? '1');

    useSeoMeta({
        title: 'ブログ',
        description: 'すぐタチの使い方、安全に利用するためのポイント、リラクゼーションに関する最新情報をお届けします。',
        canonicalUrl: `${window.location.origin}/blog`,
        type: 'website',
        jsonLd: {
            '@context': 'https://schema.org',
            '@type': 'Blog',
            name: 'すぐタチ ブログ',
            url: `${window.location.origin}/blog`,
        },
    });

    const requestPath = useMemo(() => {
        const params = new URLSearchParams(searchParams);
        return `/blog-posts?${params.toString()}`;
    }, [searchParams]);

    useEffect(() => {
        let isMounted = true;
        setIsLoading(true);

        void fetchBlogPosts(requestPath)
            .then((response) => {
                if (!isMounted) {
                    return;
                }

                setPosts(response.posts);
                setMeta(response.meta);
                setError(null);
            })
            .catch(() => {
                if (!isMounted) {
                    return;
                }

                setPosts([]);
                setError('ブログ記事の取得に失敗しました。');
            })
            .finally(() => {
                if (isMounted) {
                    setIsLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [requestPath]);

    const setParam = (key: string, value: string) => {
        setSearchParams((previous) => {
            const next = new URLSearchParams(previous);

            if (value) {
                next.set(key, value);
            } else {
                next.delete(key);
            }

            next.delete('page');
            return next;
        });
    };

    const setPage = (nextPage: number) => {
        setSearchParams((previous) => {
            const next = new URLSearchParams(previous);
            next.set('page', String(nextPage));
            return next;
        });
    };

    if (isLoading) {
        return <LoadingScreen title="ブログ" message="記事を読み込んでいます。" />;
    }

    return (
        <div className="space-y-10 rounded-[8px] bg-[#fffaf2] p-5 text-[#17202b] shadow-[0_10px_24px_rgba(23,32,43,0.08)] md:p-8">
            <header className="space-y-3">
                <p className="text-xs font-semibold tracking-[0.2em] text-[#9a7a49]">SUGUTACHI BLOG</p>
                <h1 className="text-[2.5rem] font-semibold leading-tight text-[#111827] md:text-[3.2rem]">ブログ</h1>
                <p className="max-w-3xl text-sm leading-7 text-[#5b6470] md:text-base md:leading-8">
                    はじめての利用前に知っておきたいこと、安心して予約するための考え方、サービスからのお知らせをまとめています。
                </p>
            </header>

            <section className="grid gap-4 rounded-[8px] bg-[#fffcf7] p-5 shadow-[0_10px_24px_rgba(23,32,43,0.08)] md:grid-cols-[minmax(0,1fr)_220px_220px]">
                <input
                    value={query}
                    onChange={(event) => setParam('q', event.target.value)}
                    placeholder="キーワードで検索"
                    className="rounded-[8px] border border-[#d9c9ae] bg-white px-4 py-3 text-sm outline-none focus:border-[#b5894d]"
                />
                <select value={category} onChange={(event) => setParam('category', event.target.value)} className="rounded-[8px] border border-[#d9c9ae] bg-white px-4 py-3 text-sm outline-none">
                    <option value="">すべてのカテゴリー</option>
                    {(meta.categories ?? []).map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
                </select>
                <select value={tag} onChange={(event) => setParam('tag', event.target.value)} className="rounded-[8px] border border-[#d9c9ae] bg-white px-4 py-3 text-sm outline-none">
                    <option value="">すべてのタグ</option>
                    {(meta.tags ?? []).map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
                </select>
            </section>

            {error ? <div className="rounded-[8px] bg-[#fff7ed] p-5 text-sm text-[#9a4b35]">{error}</div> : null}

            <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {posts.map((post) => (
                    <article key={post.public_id} className="overflow-hidden rounded-[8px] bg-white shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                        <Link to={`/blog/${post.slug}`}>
                            {post.cover_image_url ? (
                                <img src={post.cover_image_url} alt={post.cover_image_alt ?? post.title} className="aspect-[16/9] w-full object-cover" loading="lazy" />
                            ) : (
                                <div className="aspect-[16/9] bg-[#efe5d4]" />
                            )}
                        </Link>
                        <div className="space-y-4 p-6">
                            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#8f5c22]">
                                {post.category ? <span>{post.category.name}</span> : null}
                                {post.published_at ? <time dateTime={post.published_at}>{formatJstDate(post.published_at)}</time> : null}
                            </div>
                            <h2 className="text-xl font-semibold leading-snug">
                                <Link to={`/blog/${post.slug}`} className="text-[#111827] hover:text-[#8f5c22]">{post.title}</Link>
                            </h2>
                            {post.excerpt ? <p className="text-sm leading-7 text-[#5b6470]">{post.excerpt}</p> : null}
                            <Link to={`/blog/${post.slug}`} className="inline-flex text-sm font-semibold text-[#8f5c22]">続きを読む</Link>
                        </div>
                    </article>
                ))}
            </section>

            {posts.length === 0 && !error ? <div className="rounded-[8px] bg-[#fffcf7] p-8 text-sm text-[#5b6470]">条件に一致する記事はありません。</div> : null}

            {(meta.last_page ?? 1) > 1 ? (
                <nav className="flex items-center justify-center gap-3">
                    <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-full border border-[#d9c9ae] px-4 py-2 text-sm font-semibold disabled:opacity-40">
                        前へ
                    </button>
                    <span className="text-sm text-[#5b6470]">{page} / {meta.last_page}</span>
                    <button type="button" disabled={page >= (meta.last_page ?? 1)} onClick={() => setPage(page + 1)} className="rounded-full border border-[#d9c9ae] px-4 py-2 text-sm font-semibold disabled:opacity-40">
                        次へ
                    </button>
                </nav>
            ) : null}
        </div>
    );
}
