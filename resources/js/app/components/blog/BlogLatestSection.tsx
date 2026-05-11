import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchLatestBlogPosts } from '../../lib/blogs';
import { formatJstDate } from '../../lib/datetime';
import type { BlogPostRecord } from '../../lib/types';

export function BlogLatestSection({ className = '' }: { className?: string }) {
    const [posts, setPosts] = useState<BlogPostRecord[]>([]);

    useEffect(() => {
        let isMounted = true;

        void fetchLatestBlogPosts(3)
            .then((nextPosts) => {
                if (isMounted) {
                    setPosts(nextPosts);
                }
            })
            .catch(() => {
                if (isMounted) {
                    setPosts([]);
                }
            });

        return () => {
            isMounted = false;
        };
    }, []);

    if (posts.length === 0) {
        return null;
    }

    return (
        <section className={`space-y-6 ${className}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-xs font-semibold tracking-[0.2em] text-[#9a7a49]">BLOG</p>
                    <h2 className="mt-2 text-[2rem] font-semibold text-[#17202b] md:text-[2.2rem]">最新記事</h2>
                </div>
                <Link to="/blog" className="text-sm font-semibold text-[#8f5c22] hover:text-[#6f4718]">
                    すべての記事を見る
                </Link>
            </div>

            <div className="grid gap-5 md:grid-cols-3">
                {posts.map((post) => (
                    <Link
                        key={post.public_id}
                        to={`/blog/${post.slug}`}
                        className="overflow-hidden rounded-[8px] bg-[#fffcf7] shadow-[0_10px_24px_rgba(23,32,43,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_30px_rgba(23,32,43,0.12)]"
                    >
                        {post.cover_image_url ? (
                            <img src={post.cover_image_url} alt={post.cover_image_alt ?? post.title} className="aspect-[16/9] w-full object-cover" loading="lazy" />
                        ) : (
                            <div className="aspect-[16/9] bg-[#efe5d4]" />
                        )}
                        <div className="space-y-3 p-5">
                            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#8f5c22]">
                                {post.category ? <span>{post.category.name}</span> : null}
                                {post.published_at ? <time dateTime={post.published_at}>{formatJstDate(post.published_at)}</time> : null}
                            </div>
                            <h3 className="line-clamp-2 text-lg font-semibold leading-snug text-[#17202b]">{post.title}</h3>
                            {post.excerpt ? <p className="line-clamp-3 text-sm leading-6 text-[#5b6470]">{post.excerpt}</p> : null}
                        </div>
                    </Link>
                ))}
            </div>
        </section>
    );
}
