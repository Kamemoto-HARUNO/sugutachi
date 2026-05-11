import { Link, useSearchParams } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import { formatJstDate } from '../lib/datetime';

interface BlogPreviewDraft {
    title: string;
    slug: string;
    body_html: string;
    category_name: string;
    tags: string[];
    published_at: string | null;
    cover_image_url: string | null;
    cover_image_alt: string;
}

export function AdminBlogPreviewPage() {
    const [searchParams] = useSearchParams();
    const draftKey = searchParams.get('draft') ?? '';
    const rawDraft = draftKey ? localStorage.getItem(draftKey) : null;
    const draft = rawDraft ? JSON.parse(rawDraft) as BlogPreviewDraft : null;

    usePageTitle('ブログプレビュー');

    if (!draft) {
        return (
            <div className="rounded-[8px] bg-[#fffaf2] p-6 text-[#17202b] shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                <h1 className="text-2xl font-semibold">プレビューを表示できません</h1>
                <p className="mt-3 text-sm text-[#5b6470]">編集画面からもう一度プレビューを開いてください。</p>
                <Link to="/admin/blog-posts" className="mt-5 inline-flex rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white">
                    ブログ管理へ
                </Link>
            </div>
        );
    }

    return (
        <article className="mx-auto max-w-4xl space-y-8 rounded-[8px] bg-[#fffaf2] p-5 text-[#17202b] shadow-[0_10px_24px_rgba(23,32,43,0.08)] md:p-8">
            <nav className="text-sm text-[#68707a]">
                <Link to="/admin/blog-posts" className="hover:text-[#8f5c22]">ブログ管理</Link>
                <span className="px-2">/</span>
                <span>プレビュー</span>
            </nav>

            <header className="space-y-5">
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#8f5c22]">
                    {draft.category_name ? <span>{draft.category_name}</span> : null}
                    {draft.published_at ? <time dateTime={draft.published_at}>{formatJstDate(draft.published_at)}</time> : null}
                    <span className="rounded-full bg-[#f4e9ff] px-3 py-1 text-xs text-[#6f4688]">保存前プレビュー</span>
                </div>
                <h1 className="text-[2.4rem] font-semibold leading-tight text-[#111827] md:text-[3.4rem]">
                    {draft.title || '無題の記事'}
                </h1>
                {draft.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {draft.tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-[#f2ebe0] px-3 py-1 text-xs font-semibold text-[#5b6470]">
                                #{tag}
                            </span>
                        ))}
                    </div>
                ) : null}
            </header>

            {draft.cover_image_url ? (
                <img src={draft.cover_image_url} alt={draft.cover_image_alt || draft.title} className="aspect-[16/9] w-full rounded-[8px] object-cover" />
            ) : null}

            <div
                className="blog-content space-y-5 text-base leading-8 text-[#1f2937] [overflow-wrap:anywhere] [&_a]:font-semibold [&_a]:text-[#8f5c22] [&_blockquote]:border-l-4 [&_blockquote]:border-[#d2b179] [&_blockquote]:bg-white [&_blockquote]:p-4 [&_code]:rounded [&_code]:bg-[#f2ebe0] [&_code]:px-1.5 [&_h2]:pt-5 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-[#111827] [&_h3]:pt-4 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-[#111827] [&_iframe]:aspect-video [&_iframe]:w-full [&_iframe]:rounded-[8px] [&_img]:max-w-full [&_img]:rounded-[8px] [&_ol]:list-decimal [&_ol]:pl-6 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:rounded-[8px] [&_pre]:bg-[#17202b] [&_pre]:p-4 [&_pre]:text-white [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_td]:border [&_td]:border-[#d9c9ae] [&_td]:p-3 [&_th]:border [&_th]:border-[#d9c9ae] [&_th]:bg-[#f2ebe0] [&_th]:p-3 [&_ul]:list-disc [&_ul]:pl-6"
                dangerouslySetInnerHTML={{ __html: draft.body_html || '<p></p>' }}
            />
        </article>
    );
}
