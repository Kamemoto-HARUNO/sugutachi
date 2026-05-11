import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { useSeoMeta } from '../hooks/useSeoMeta';
import { fetchBlogPost, resolveBlogViewSource, trackBlogPostView } from '../lib/blogs';
import { formatJstDate } from '../lib/datetime';
import type { BlogPostRecord } from '../lib/types';

export function BlogDetailPage() {
    const { slug } = useParams();
    const { token } = useAuth();
    const [post, setPost] = useState<BlogPostRecord | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const canonicalUrl = post?.canonical_url || (slug ? `${window.location.origin}/blog/${slug}` : window.location.href);

    const jsonLd = useMemo(() => post ? {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.meta_description ?? post.excerpt ?? undefined,
        image: post.cover_image_url ? [new URL(post.cover_image_url, window.location.origin).href] : undefined,
        datePublished: post.published_at ?? undefined,
        dateModified: post.updated_at,
        mainEntityOfPage: canonicalUrl,
        publisher: {
            '@type': 'Organization',
            name: 'すぐタチ',
        },
    } : null, [canonicalUrl, post]);

    useSeoMeta({
        title: post?.meta_title ?? post?.title ?? 'ブログ',
        description: post?.meta_description ?? post?.excerpt ?? undefined,
        canonicalUrl,
        ogImageUrl: post?.cover_image_url ? new URL(post.cover_image_url, window.location.origin).href : undefined,
        type: 'article',
        noindex: post?.noindex,
        jsonLd,
    });

    useEffect(() => {
        if (!slug) {
            return;
        }

        let isMounted = true;
        setIsLoading(true);

        void fetchBlogPost(slug, token)
            .then((nextPost) => {
                if (!isMounted) {
                    return;
                }

                setPost(nextPost);
                setError(null);
            })
            .catch(() => {
                if (!isMounted) {
                    return;
                }

                setPost(null);
                setError('記事が見つかりませんでした。');
            })
            .finally(() => {
                if (isMounted) {
                    setIsLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [slug, token]);

    useEffect(() => {
        if (!post?.is_public) {
            return;
        }

        const storageKey = `blog-viewed:${post.public_id}`;

        if (sessionStorage.getItem(storageKey)) {
            return;
        }

        sessionStorage.setItem(storageKey, '1');
        trackBlogPostView(post.public_id, resolveBlogViewSource(document.referrer));
    }, [post?.is_public, post?.public_id]);

    if (isLoading) {
        return <LoadingScreen title="ブログ" message="記事を読み込んでいます。" />;
    }

    if (!post || error) {
        return (
            <div className="rounded-[8px] bg-[#fffaf2] p-6 text-[#17202b] shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                <h1 className="text-3xl font-semibold">記事が見つかりません</h1>
                <p className="text-sm text-[#5b6470]">{error ?? '公開中の記事ではない可能性があります。'}</p>
                <Link to="/blog" className="inline-flex rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white">ブログ一覧へ</Link>
            </div>
        );
    }

    return (
        <article className="mx-auto max-w-4xl space-y-8 rounded-[8px] bg-[#fffaf2] p-5 text-[#17202b] shadow-[0_10px_24px_rgba(23,32,43,0.08)] md:p-8">
            <nav className="text-sm text-[#68707a]">
                <Link to="/" className="hover:text-[#8f5c22]">ホーム</Link>
                <span className="px-2">/</span>
                <Link to="/blog" className="hover:text-[#8f5c22]">ブログ</Link>
                <span className="px-2">/</span>
                <span>{post.title}</span>
            </nav>

            <header className="space-y-5">
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#8f5c22]">
                    {post.category ? <Link to={`/blog?category=${post.category.slug}`}>{post.category.name}</Link> : null}
                    {post.published_at ? <time dateTime={post.published_at}>{formatJstDate(post.published_at)}</time> : null}
                    {!post.is_public ? <span className="rounded-full bg-[#f4e9ff] px-3 py-1 text-xs text-[#6f4688]">運営プレビュー</span> : null}
                </div>
                <h1 className="text-[2.4rem] font-semibold leading-tight text-[#111827] md:text-[3.4rem]">{post.title}</h1>
                {post.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {post.tags.map((tag) => (
                            <Link key={tag.slug} to={`/blog?tag=${tag.slug}`} className="rounded-full bg-[#f2ebe0] px-3 py-1 text-xs font-semibold text-[#5b6470]">
                                #{tag.name}
                            </Link>
                        ))}
                    </div>
                ) : null}
            </header>

            {post.cover_image_url ? (
                <img src={post.cover_image_url} alt={post.cover_image_alt ?? post.title} className="aspect-[16/9] w-full rounded-[8px] object-cover" />
            ) : null}

            <div
                className="blog-content space-y-5 text-base leading-8 text-[#1f2937] [overflow-wrap:anywhere] [&_a]:font-semibold [&_a]:text-[#8f5c22] [&_blockquote]:border-l-4 [&_blockquote]:border-[#d2b179] [&_blockquote]:bg-white [&_blockquote]:p-4 [&_code]:rounded [&_code]:bg-[#f2ebe0] [&_code]:px-1.5 [&_h2]:pt-5 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-[#111827] [&_h3]:pt-4 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-[#111827] [&_iframe]:aspect-video [&_iframe]:w-full [&_iframe]:rounded-[8px] [&_img]:max-w-full [&_img]:rounded-[8px] [&_ol]:list-decimal [&_ol]:pl-6 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:rounded-[8px] [&_pre]:bg-[#17202b] [&_pre]:p-4 [&_pre]:text-white [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_td]:border [&_td]:border-[#d9c9ae] [&_td]:p-3 [&_th]:border [&_th]:border-[#d9c9ae] [&_th]:bg-[#f2ebe0] [&_th]:p-3 [&_ul]:list-disc [&_ul]:pl-6"
                dangerouslySetInnerHTML={{ __html: post.body_html ?? '' }}
            />
        </article>
    );
}
