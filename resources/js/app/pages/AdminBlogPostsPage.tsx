import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { BLOG_STATUS_OPTIONS, buildBlogExcerpt, buildBlogFormData, fetchAdminBlogMeta, normalizeSlugDraft, normalizeSlugInput, uploadBlogBodyImage } from '../lib/blogs';
import { buildCurrentJstDateTimeLocalValue, formatJstDateTime, formatJstDateTimeLocalValue, parseJstDateTimeLocalInput } from '../lib/datetime';
import type { ApiEnvelope, BlogCategoryRecord, BlogPostRecord, BlogPostStatus, BlogTagRecord } from '../lib/types';

interface BlogFormState {
    title: string;
    slug: string;
    category_name: string;
    category_slug: string;
    tags_text: string;
    status: BlogPostStatus;
    published_at: string;
    excerpt: string;
    body_html: string;
    cover_image_alt: string;
    meta_title: string;
    meta_description: string;
    og_title: string;
    og_description: string;
    canonical_url: string;
    noindex: boolean;
}

function emptyForm(): BlogFormState {
    return {
        title: '',
        slug: '',
        category_name: '',
        category_slug: '',
        tags_text: '',
        status: 'draft',
        published_at: buildCurrentJstDateTimeLocalValue(),
        excerpt: '',
        body_html: '<p></p>',
        cover_image_alt: '',
        meta_title: '',
        meta_description: '',
        og_title: '',
        og_description: '',
        canonical_url: '',
        noindex: false,
    };
}

function formFromPost(post: BlogPostRecord): BlogFormState {
    return {
        title: post.title,
        slug: post.slug,
        category_name: post.category?.name ?? '',
        category_slug: post.category?.slug ?? '',
        tags_text: post.tags.map((tag) => tag.name).join(', '),
        status: post.status,
        published_at: formatJstDateTimeLocalValue(post.published_at),
        excerpt: post.excerpt ?? '',
        body_html: post.body_html ?? '<p></p>',
        cover_image_alt: post.cover_image_alt ?? '',
        meta_title: post.meta_title ?? '',
        meta_description: post.meta_description ?? '',
        og_title: post.og_title ?? '',
        og_description: post.og_description ?? '',
        canonical_url: post.canonical_url ?? '',
        noindex: post.noindex,
    };
}

function statusTone(status: BlogPostStatus): string {
    switch (status) {
        case 'published':
            return 'bg-[#e8f4ea] text-[#24553a]';
        case 'scheduled':
            return 'bg-[#edf4ff] text-[#34557f]';
        case 'hidden':
            return 'bg-[#f1efe8] text-[#48505a]';
        case 'draft':
            return 'bg-[#f4e9ff] text-[#6f4688]';
    }
}

const adminPageShellClass = 'rounded-[8px] bg-[#fffaf2] p-5 text-[#17202b] shadow-[0_10px_24px_rgba(23,32,43,0.08)] md:p-6';
const selectedEditorImageClass = 'is-editor-selected-image';
const editorContentClass = [
    'admin-blog-editor-content min-h-[320px] max-h-[min(58vh,620px)] overflow-y-auto rounded-b-[8px] border-x border-b border-[#d9c9ae] bg-white p-5 text-base leading-8 text-[#17202b] outline-none [overflow-wrap:anywhere]',
    '[&_a]:font-semibold [&_a]:text-[#8f5c22]',
    '[&_blockquote]:border-l-4 [&_blockquote]:border-[#d2b179] [&_blockquote]:bg-[#fff7ed] [&_blockquote]:p-4',
    '[&_code]:rounded [&_code]:bg-[#f2ebe0] [&_code]:px-1.5',
    '[&_h2]:mt-6 [&_h2]:text-2xl [&_h2]:font-semibold',
    '[&_h3]:mt-5 [&_h3]:text-xl [&_h3]:font-semibold',
    '[&_iframe]:aspect-video [&_iframe]:w-full [&_iframe]:rounded-[8px]',
    '[&_img]:my-4 [&_img]:max-w-full [&_img]:rounded-[8px]',
    '[&_ol]:list-decimal [&_ol]:pl-6',
    '[&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:rounded-[8px] [&_pre]:bg-[#17202b] [&_pre]:p-4 [&_pre]:text-white',
    '[&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_td]:border [&_td]:border-[#d9c9ae] [&_td]:p-3 [&_th]:border [&_th]:border-[#d9c9ae] [&_th]:bg-[#f2ebe0] [&_th]:p-3',
    '[&_ul]:list-disc [&_ul]:pl-6',
].join(' ');

function stripEditorOnlyHtml(html: string): string {
    const container = document.createElement('div');
    container.innerHTML = html;

    container.querySelectorAll(`img.${selectedEditorImageClass}`).forEach((image) => {
        image.classList.remove(selectedEditorImageClass);

        if (image.getAttribute('class') === '') {
            image.removeAttribute('class');
        }
    });

    return container.innerHTML;
}

export function AdminBlogPostsPage() {
    const { publicId } = useParams();
    const { token } = useAuth();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [posts, setPosts] = useState<BlogPostRecord[]>([]);
    const [categories, setCategories] = useState<BlogCategoryRecord[]>([]);
    const [tags, setTags] = useState<BlogTagRecord[]>([]);
    const [form, setForm] = useState<BlogFormState>(() => emptyForm());
    const [coverImage, setCoverImage] = useState<File | null>(null);
    const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
    const [tagDraft, setTagDraft] = useState('');
    const [editingPost, setEditingPost] = useState<BlogPostRecord | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const [isCanonicalHelpOpen, setIsCanonicalHelpOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const editorRef = useRef<HTMLDivElement | null>(null);
    const imageInputRef = useRef<HTMLInputElement | null>(null);
    const coverInputRef = useRef<HTMLInputElement | null>(null);
    const editorSelectionRef = useRef<Range | null>(null);
    const selectedEditorImageRef = useRef<HTMLImageElement | null>(null);
    const autoFieldsRef = useRef({
        excerpt: true,
        metaTitle: true,
        metaDescription: true,
        ogTitle: true,
        ogDescription: true,
    });

    const isCreateRoute = location.pathname.endsWith('/new');
    const isCreateMode = isCreateRoute && !editingPost;
    const isEditor = isCreateRoute || Boolean(publicId);

    usePageTitle(isEditor ? (isCreateMode ? 'ブログ新規作成' : 'ブログ編集') : 'ブログ管理');
    useToastOnMessage(error, 'error');
    useToastOnMessage(successMessage, 'success');

    useEffect(() => {
        if (!coverImage) {
            setCoverPreviewUrl(null);
            return;
        }

        const nextUrl = URL.createObjectURL(coverImage);
        setCoverPreviewUrl(nextUrl);

        return () => URL.revokeObjectURL(nextUrl);
    }, [coverImage]);

    useEffect(() => {
        if (!token) {
            return;
        }

        const authToken = token;
        let isMounted = true;

        async function bootstrap() {
            setIsLoading(true);

            try {
                const meta = await fetchAdminBlogMeta(authToken);

                if (!isMounted) {
                    return;
                }

                setCategories(meta.categories);
                setTags(meta.tags);

                if (isEditor) {
                    if (isCreateRoute) {
                        setForm(emptyForm());
                        setEditingPost(null);
                        setCoverImage(null);
                        setCoverPreviewUrl(null);
                        setTagDraft('');
                        autoFieldsRef.current = {
                            excerpt: true,
                            metaTitle: true,
                            metaDescription: true,
                            ogTitle: true,
                            ogDescription: true,
                        };
                    } else if (publicId) {
                        const payload = await apiRequest<ApiEnvelope<BlogPostRecord>>(`/admin/blog-posts/${publicId}`, { token: authToken });

                        if (!isMounted) {
                            return;
                        }

                        const post = unwrapData(payload);
                        setEditingPost(post);
                        setForm(formFromPost(post));
                        autoFieldsRef.current = {
                            excerpt: !post.excerpt,
                            metaTitle: !post.meta_title,
                            metaDescription: !post.meta_description,
                            ogTitle: !post.og_title,
                            ogDescription: !post.og_description,
                        };
                    }
                } else {
                    const payload = await apiRequest<ApiEnvelope<BlogPostRecord[]>>(`/admin/blog-posts?${searchParams.toString()}`, { token: authToken });

                    if (!isMounted) {
                        return;
                    }

                    setPosts(unwrapData(payload));
                }

                setError(null);
            } catch (requestError) {
                if (!isMounted) {
                    return;
                }

                setError(requestError instanceof ApiError ? requestError.message : 'ブログ情報の取得に失敗しました。');
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        }

        void bootstrap();

        return () => {
            isMounted = false;
        };
    }, [isCreateMode, isEditor, publicId, searchParams, token]);

    const coverUrl = coverPreviewUrl ?? editingPost?.cover_image_url ?? null;
    const selectedTags = useMemo(
        () => form.tags_text.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 5),
        [form.tags_text],
    );
    const tagSuggestions = useMemo(() => {
        const draft = tagDraft.trim().toLowerCase();
        const selected = new Set(selectedTags.map((tag) => tag.toLowerCase()));

        return tags
            .filter((tag) => !selected.has(tag.name.toLowerCase()))
            .filter((tag) => !draft || tag.name.toLowerCase().includes(draft))
            .slice(0, 5);
    }, [selectedTags, tagDraft, tags]);

    useEffect(() => {
        if (!editorRef.current) {
            return;
        }

        editorRef.current.innerHTML = form.body_html;
    }, [editingPost?.public_id, isCreateMode, isLoading]);

    const updateForm = (key: keyof BlogFormState, value: string | boolean) => {
        setForm((previous) => ({ ...previous, [key]: value }));
    };

    const saveEditorSelection = () => {
        const selection = window.getSelection();

        if (!selection || selection.rangeCount === 0 || !editorRef.current?.contains(selection.anchorNode)) {
            return;
        }

        editorSelectionRef.current = selection.getRangeAt(0).cloneRange();
    };

    const restoreEditorSelection = () => {
        const selection = window.getSelection();
        const range = editorSelectionRef.current;

        if (!selection || !range || !editorRef.current?.contains(range.commonAncestorContainer)) {
            editorRef.current?.focus();
            return;
        }

        selection.removeAllRanges();
        selection.addRange(range);
    };

    const clearSelectedEditorImage = () => {
        editorRef.current?.querySelectorAll(`img.${selectedEditorImageClass}`).forEach((image) => {
            image.classList.remove(selectedEditorImageClass);

            if (image.getAttribute('class') === '') {
                image.removeAttribute('class');
            }
        });
        selectedEditorImageRef.current = null;
    };

    const markSelectedEditorImage = (image: HTMLImageElement) => {
        clearSelectedEditorImage();
        image.classList.add(selectedEditorImageClass);
        selectedEditorImageRef.current = image;
    };

    const findEditorImage = (): HTMLImageElement | null => {
        if (selectedEditorImageRef.current && editorRef.current?.contains(selectedEditorImageRef.current)) {
            return selectedEditorImageRef.current;
        }

        const selection = window.getSelection();

        if (!selection || selection.rangeCount === 0 || !editorRef.current) {
            return null;
        }

        const range = selection.getRangeAt(0);
        const containers = [range.startContainer, range.commonAncestorContainer];

        for (const container of containers) {
            const element = container instanceof Element ? container : container.parentElement;
            const image = element?.closest('img');

            if (image instanceof HTMLImageElement && editorRef.current.contains(image)) {
                return image;
            }
        }

        const fragment = range.cloneContents();
        const image = fragment.querySelector('img');

        if (image) {
            const source = image.getAttribute('src');
            const alt = image.getAttribute('alt');
            const matchingImage = Array.from(editorRef.current.querySelectorAll('img')).find((candidate) => (
                candidate.getAttribute('src') === source && candidate.getAttribute('alt') === alt
            ));

            return matchingImage ?? null;
        }

        return null;
    };

    const syncAutoFields = (updates: Partial<BlogFormState>, nextTitle = form.title, nextBody = form.body_html) => {
        const nextExcerpt = buildBlogExcerpt(nextBody);

        setForm((previous) => ({
            ...previous,
            ...updates,
            excerpt: autoFieldsRef.current.excerpt ? nextExcerpt : (updates.excerpt as string | undefined) ?? previous.excerpt,
            meta_title: autoFieldsRef.current.metaTitle ? nextTitle.slice(0, 160) : (updates.meta_title as string | undefined) ?? previous.meta_title,
            og_title: autoFieldsRef.current.ogTitle ? nextTitle.slice(0, 160) : (updates.og_title as string | undefined) ?? previous.og_title,
            meta_description: autoFieldsRef.current.metaDescription ? nextExcerpt.slice(0, 220) : (updates.meta_description as string | undefined) ?? previous.meta_description,
            og_description: autoFieldsRef.current.ogDescription ? nextExcerpt.slice(0, 220) : (updates.og_description as string | undefined) ?? previous.og_description,
        }));
    };

    const updateBodyHtml = (html: string) => {
        const cleanHtml = stripEditorOnlyHtml(html);
        syncAutoFields({ body_html: cleanHtml }, form.title, cleanHtml);
    };

    const handleTitleChange = (title: string) => {
        const updates: Partial<BlogFormState> = { title };

        if (!editingPost && form.slug.trim() === '') {
            updates.slug = normalizeSlugDraft(title);
        }

        syncAutoFields(updates, title, form.body_html);
    };

    const applyEditorCommand = (command: string, value?: string) => {
        editorRef.current?.focus();
        document.execCommand(command, false, value);
        updateBodyHtml(editorRef.current?.innerHTML ?? '');
    };

    const applyImageLink = () => {
        const image = findEditorImage();

        if (!image || !editorRef.current) {
            window.alert('リンクを設定したい画像を本文内で選択してください。');
            return;
        }

        const currentAnchor = image.closest('a');
        const currentHref = currentAnchor instanceof HTMLAnchorElement && editorRef.current.contains(currentAnchor)
            ? currentAnchor.getAttribute('href') ?? ''
            : '';
        const nextHref = window.prompt('画像クリック時のリンクURLを入力してください。空欄でリンクを解除します。', currentHref);

        if (nextHref === null) {
            return;
        }

        const normalizedHref = nextHref.trim();
        const anchor = currentAnchor instanceof HTMLAnchorElement && editorRef.current.contains(currentAnchor)
            ? currentAnchor
            : document.createElement('a');

        if (normalizedHref === '') {
            if (currentAnchor instanceof HTMLAnchorElement && editorRef.current.contains(currentAnchor)) {
                currentAnchor.replaceWith(...Array.from(currentAnchor.childNodes));
            }
            updateBodyHtml(editorRef.current.innerHTML);
            return;
        }

        const shouldOpenNewTab = window.confirm('別タブで開きますか？\nOK: 別タブ / キャンセル: 同じタブ');
        anchor.setAttribute('href', normalizedHref);

        if (shouldOpenNewTab) {
            anchor.setAttribute('target', '_blank');
            anchor.setAttribute('rel', 'nofollow noopener noreferrer');
        } else {
            anchor.removeAttribute('target');
            anchor.removeAttribute('rel');
        }

        if (!currentAnchor || !editorRef.current.contains(currentAnchor)) {
            image.replaceWith(anchor);
            anchor.appendChild(image);
        }

        markSelectedEditorImage(image);
        updateBodyHtml(editorRef.current.innerHTML);
    };

    const insertHtml = (html: string) => {
        restoreEditorSelection();
        editorRef.current?.focus();
        document.execCommand('insertHTML', false, html);
        saveEditorSelection();
        updateBodyHtml(editorRef.current?.innerHTML ?? '');
    };

    const addTag = (tag: string) => {
        const normalized = tag.trim();

        if (!normalized || selectedTags.some((item) => item.toLowerCase() === normalized.toLowerCase()) || selectedTags.length >= 5) {
            setTagDraft('');
            return;
        }

        updateForm('tags_text', [...selectedTags, normalized].join(', '));
        setTagDraft('');
    };

    const removeTag = (tag: string) => {
        updateForm('tags_text', selectedTags.filter((item) => item !== tag).join(', '));
    };

    const openDraftPreview = async () => {
        const previewWindow = window.open('', '_blank', 'noopener,noreferrer');
        const draftKey = `blog-preview-${Date.now()}`;
        const bodyHtml = stripEditorOnlyHtml(editorRef.current?.innerHTML ?? form.body_html);
        let coverImageUrl = coverUrl;

        if (coverImage) {
            coverImageUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
                reader.onerror = () => resolve('');
                reader.readAsDataURL(coverImage);
            });
        }

        localStorage.setItem(draftKey, JSON.stringify({
            title: form.title,
            slug: form.slug,
            body_html: bodyHtml,
            category_name: form.category_name,
            tags: selectedTags,
            published_at: form.status === 'scheduled' && form.published_at
                ? parseJstDateTimeLocalInput(form.published_at)?.toISOString() ?? null
                : editingPost?.published_at ?? null,
            cover_image_url: coverImageUrl,
            cover_image_alt: form.cover_image_alt,
        }));

        const previewUrl = `/admin/blog-posts/preview?draft=${encodeURIComponent(draftKey)}`;

        if (previewWindow) {
            previewWindow.location.href = previewUrl;
            return;
        }

        window.open(previewUrl, '_blank', 'noopener,noreferrer');
    };

    const insertEmbed = () => {
        const rawUrl = window.prompt('YouTube / X / Instagram のURLを入力してください。');

        if (!rawUrl) {
            return;
        }

        const url = rawUrl.trim();
        let embedUrl = url;

        if (url.includes('youtube.com/watch')) {
            embedUrl = url.replace('/watch?v=', '/embed/').split('&')[0];
        } else if (url.includes('youtu.be/')) {
            embedUrl = `https://www.youtube.com/embed/${url.split('youtu.be/')[1]?.split('?')[0] ?? ''}`;
        }

        insertHtml(`<figure><iframe src="${embedUrl}" title="埋め込みコンテンツ" loading="lazy" allowfullscreen></iframe></figure>`);
    };

    const handleBodyImage = async (file: File | null) => {
        if (!token || !file) {
            return;
        }

        setIsUploadingImage(true);

        try {
            const url = await uploadBlogBodyImage(token, file);
            insertHtml(`<figure><img src="${url}" alt=""><figcaption></figcaption></figure>`);
        } catch (requestError) {
            setError(requestError instanceof ApiError ? requestError.message : '本文画像のアップロードに失敗しました。');
        } finally {
            setIsUploadingImage(false);
            if (imageInputRef.current) {
                imageInputRef.current.value = '';
            }
        }
    };

    const submitForm = async (event: FormEvent) => {
        event.preventDefault();

        if (!token) {
            return;
        }

        setIsSubmitting(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const bodyHtml = stripEditorOnlyHtml(editorRef.current?.innerHTML ?? form.body_html);
            const publishedAt = form.status === 'scheduled' && form.published_at
                ? parseJstDateTimeLocalInput(form.published_at)?.toISOString()
                : form.status === 'published'
                    ? editingPost?.published_at ?? ''
                    : '';
            const payload = buildBlogFormData({
                title: form.title,
                slug: normalizeSlugInput(form.slug),
                category_name: form.category_name,
                category_slug: normalizeSlugInput(form.category_slug || form.category_name),
                tags: selectedTags,
                status: form.status,
                published_at: publishedAt,
                excerpt: form.excerpt,
                body_html: bodyHtml,
                cover_image_alt: form.cover_image_alt,
                meta_title: form.meta_title,
                meta_description: form.meta_description,
                og_title: form.og_title,
                og_description: form.og_description,
                canonical_url: form.canonical_url,
                noindex: form.noindex,
            }, coverImage);

            if (!editingPost) {
                const response = await apiRequest<ApiEnvelope<BlogPostRecord>>('/admin/blog-posts', {
                    method: 'POST',
                    token,
                    body: payload,
                });
                const savedPost = unwrapData(response);
                setEditingPost(savedPost);
                setForm(formFromPost(savedPost));
                setCoverImage(null);
                navigate(`/admin/blog-posts/${savedPost.public_id}/edit`, { replace: true });
                setSuccessMessage('ブログ記事を保存しました。');
            } else if (editingPost) {
                payload.append('_method', 'PATCH');
                const response = await apiRequest<ApiEnvelope<BlogPostRecord>>(`/admin/blog-posts/${editingPost.public_id}`, {
                    method: 'POST',
                    token,
                    body: payload,
                });
                const savedPost = unwrapData(response);
                setEditingPost(savedPost);
                setForm(formFromPost(savedPost));
                setCoverImage(null);
                setSuccessMessage('ブログ記事を保存しました。');
            }
        } catch (requestError) {
            setError(requestError instanceof ApiError ? requestError.message : 'ブログ記事の保存に失敗しました。');
        } finally {
            setIsSubmitting(false);
        }
    };

    const deletePost = async () => {
        if (!token || !editingPost || !window.confirm('この記事を削除しますか？')) {
            return;
        }

        await apiRequest(`/admin/blog-posts/${editingPost.public_id}`, { method: 'DELETE', token });
        navigate('/admin/blog-posts');
    };

    const filterValue = (key: string) => searchParams.get(key) ?? '';
    const setFilter = (key: string, value: string) => {
        setSearchParams((previous) => {
            const next = new URLSearchParams(previous);
            if (value) {
                next.set(key, value);
            } else {
                next.delete(key);
            }
            return next;
        });
    };

    if (isLoading) {
        return <LoadingScreen title="ブログ管理" message="ブログ情報を読み込んでいます。" />;
    }

    if (!isEditor) {
        return (
            <div className="space-y-6 text-[#17202b]">
                <div className={`flex flex-col gap-4 md:flex-row md:items-end md:justify-between ${adminPageShellClass}`}>
                    <div>
                        <p className="text-xs font-semibold tracking-[0.2em] text-[#9a7a49]">BLOG</p>
                        <h1 className="mt-2 text-3xl font-semibold">ブログ管理</h1>
                    </div>
                    <Link to="/admin/blog-posts/new" className="inline-flex rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white">新規作成</Link>
                </div>

                {error ? <div className="rounded-[8px] bg-[#fff7ed] p-4 text-sm text-[#9a4b35]">{error}</div> : null}

                <section className="grid gap-3 rounded-[8px] bg-[#fffcf7] p-4 shadow-[0_10px_24px_rgba(23,32,43,0.08)] md:grid-cols-4">
                    <input value={filterValue('q')} onChange={(event) => setFilter('q', event.target.value)} placeholder="タイトル/スラッグ検索" className="rounded-[8px] border border-[#d9c9ae] px-3 py-2 text-sm" />
                    <select value={filterValue('status')} onChange={(event) => setFilter('status', event.target.value)} className="rounded-[8px] border border-[#d9c9ae] px-3 py-2 text-sm">
                        <option value="">すべてのステータス</option>
                        {BLOG_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <select value={filterValue('category')} onChange={(event) => setFilter('category', event.target.value)} className="rounded-[8px] border border-[#d9c9ae] px-3 py-2 text-sm">
                        <option value="">すべてのカテゴリー</option>
                        {categories.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
                    </select>
                    <select value={filterValue('tag')} onChange={(event) => setFilter('tag', event.target.value)} className="rounded-[8px] border border-[#d9c9ae] px-3 py-2 text-sm">
                        <option value="">すべてのタグ</option>
                        {tags.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
                    </select>
                </section>

                <section className="overflow-hidden rounded-[8px] bg-[#fffcf7] shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                    <div className="grid grid-cols-[minmax(0,1fr)_110px_180px_150px_150px_70px] gap-4 border-b border-[#eadfce] px-5 py-3 text-xs font-semibold text-[#68707a]">
                        <span>記事</span>
                        <span>ステータス</span>
                        <span>ビュー</span>
                        <span>公開日</span>
                        <span>最終更新者</span>
                        <span />
                    </div>
                    {posts.map((post) => (
                        <div key={post.public_id} className="grid grid-cols-[minmax(0,1fr)_110px_180px_150px_150px_70px] items-center gap-4 border-b border-[#f1e8d9] px-5 py-4 last:border-b-0">
                            <div>
                                <p className="font-semibold">{post.title}</p>
                                <p className="mt-1 text-xs text-[#68707a]">/blog/{post.slug} {post.category ? `・${post.category.name}` : ''}</p>
                            </div>
                            <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${statusTone(post.status)}`}>{post.status_label}</span>
                            <div className="text-xs leading-5 text-[#5b6470]">
                                <p className="font-semibold text-[#17202b]">合計 {post.view_count.toLocaleString()} PV</p>
                                <p>検索 {post.search_view_count.toLocaleString()} / 回遊 {post.internal_view_count.toLocaleString()}</p>
                                <p>外部 {post.external_view_count.toLocaleString()} / 直接 {post.direct_view_count.toLocaleString()}</p>
                            </div>
                            <span className="text-sm text-[#5b6470]">{formatJstDateTime(post.published_at) ?? '未設定'}</span>
                            <div className="text-xs leading-5 text-[#5b6470]">
                                <p className="font-semibold text-[#17202b]">
                                    {post.updated_by_account?.display_name ?? post.updated_by_account?.email ?? '未記録'}
                                </p>
                                <p>{formatJstDateTime(post.updated_at) ?? '-'}</p>
                            </div>
                            <Link to={`/admin/blog-posts/${post.public_id}/edit`} className="text-sm font-semibold text-[#8f5c22]">編集</Link>
                        </div>
                    ))}
                    {posts.length === 0 ? <div className="p-6 text-sm text-[#5b6470]">記事はまだありません。</div> : null}
                </section>
            </div>
        );
    }

    return (
        <form onSubmit={submitForm} className="space-y-6 text-[#17202b]">
            <div className={`flex flex-col gap-4 md:flex-row md:items-end md:justify-between ${adminPageShellClass}`}>
                <div>
                    <p className="text-xs font-semibold tracking-[0.2em] text-[#9a7a49]">BLOG</p>
                    <h1 className="mt-2 text-3xl font-semibold">{isCreateMode ? 'ブログ新規作成' : 'ブログ編集'}</h1>
                    {!isCreateMode && editingPost ? (
                        <p className="mt-2 text-xs text-[#68707a]">
                            最終更新者: {editingPost.updated_by_account?.display_name ?? editingPost.updated_by_account?.email ?? '未記録'}
                            {' / '}
                            {formatJstDateTime(editingPost.updated_at) ?? '-'}
                        </p>
                    ) : null}
                </div>
                <div className="flex flex-wrap gap-3">
                    <Link to="/admin/blog-posts" className="rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold">一覧へ</Link>
                    <button type="button" onClick={() => void openDraftPreview()} className="rounded-full border border-[#d9c9ae] bg-white px-5 py-3 text-sm font-semibold">
                        プレビュー
                    </button>
                    {!isCreateMode ? <button type="button" onClick={deletePost} className="rounded-full bg-[#fff2dd] px-5 py-3 text-sm font-semibold text-[#8b5a16]">削除</button> : null}
                    <button type="submit" disabled={isSubmitting} className="rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{isSubmitting ? '保存中' : '保存'}</button>
                </div>
            </div>

            {error ? <div className="rounded-[8px] bg-[#fff7ed] p-4 text-sm text-[#9a4b35]">{error}</div> : null}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                <section className="space-y-5 rounded-[8px] bg-[#fffcf7] p-5 shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                    <label className="block text-sm font-semibold">
                        タイトル
                        <input value={form.title} onChange={(event) => handleTitleChange(event.target.value)} required className="mt-2 w-full rounded-[8px] border border-[#d9c9ae] px-4 py-3 text-sm" />
                    </label>
                    <label className="block text-sm font-semibold">
                        本文
                        <div className="sticky top-0 z-10 mt-2 flex flex-wrap gap-2 rounded-t-[8px] border border-[#d9c9ae] bg-[#f7efe2] p-2 shadow-[0_8px_18px_rgba(23,32,43,0.08)]">
                            {[
                                ['formatBlock', '<p>', '段落'],
                                ['formatBlock', '<h2>', 'H2'],
                                ['formatBlock', '<h3>', 'H3'],
                                ['bold', '', 'B'],
                                ['italic', '', 'I'],
                                ['insertUnorderedList', '', '箇条書き'],
                                ['insertOrderedList', '', '番号'],
                                ['formatBlock', '<blockquote>', '引用'],
                                ['formatBlock', '<pre>', 'コード'],
                            ].map(([command, value, label]) => (
                                <button key={`${command}-${label}`} type="button" onClick={() => applyEditorCommand(command, value || undefined)} className="rounded-[8px] bg-white px-3 py-2 text-xs font-semibold">
                                    {label}
                                </button>
                            ))}
                            <button type="button" onClick={() => applyEditorCommand('createLink', window.prompt('リンクURL') ?? '')} className="rounded-[8px] bg-white px-3 py-2 text-xs font-semibold">リンク</button>
                            <button type="button" onMouseDown={saveEditorSelection} onClick={() => imageInputRef.current?.click()} className="rounded-[8px] bg-white px-3 py-2 text-xs font-semibold">{isUploadingImage ? '画像中' : '画像'}</button>
                            <button type="button" onClick={applyImageLink} className="rounded-[8px] bg-white px-3 py-2 text-xs font-semibold">画像リンク</button>
                            <button type="button" onClick={insertEmbed} className="rounded-[8px] bg-white px-3 py-2 text-xs font-semibold">埋め込み</button>
                            <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void handleBodyImage(event.target.files?.[0] ?? null)} className="hidden" />
                        </div>
                        <div
                            ref={editorRef}
                            contentEditable
                            suppressContentEditableWarning
                            onInput={(event) => {
                                saveEditorSelection();
                                updateBodyHtml(event.currentTarget.innerHTML);
                            }}
                            onKeyUp={saveEditorSelection}
                            onMouseUp={saveEditorSelection}
                            onClick={(event) => {
                                if (event.target instanceof HTMLImageElement) {
                                    markSelectedEditorImage(event.target);
                                } else {
                                    clearSelectedEditorImage();
                                }
                                saveEditorSelection();
                            }}
                            onFocus={saveEditorSelection}
                            className={editorContentClass}
                        />
                    </label>
                    <label className="block text-sm font-semibold">
                        HTML直接編集
                        <textarea
                            value={form.body_html}
                            onChange={(event) => {
                                updateBodyHtml(event.target.value);
                                if (editorRef.current) {
                                    editorRef.current.innerHTML = event.target.value;
                                }
                            }}
                            rows={10}
                            className="mt-2 w-full rounded-[8px] border border-[#d9c9ae] px-4 py-3 font-mono text-xs"
                        />
                    </label>
                </section>

                <aside className="space-y-5">
                    <section className="space-y-4 rounded-[8px] bg-[#fffcf7] p-5 shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                        <label className="block text-sm font-semibold">
                            ステータス
                            <select value={form.status} onChange={(event) => updateForm('status', event.target.value as BlogPostStatus)} className="mt-2 w-full rounded-[8px] border border-[#d9c9ae] px-4 py-3 text-sm">
                                {BLOG_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                        </label>
                        {form.status === 'scheduled' ? (
                            <label className="block text-sm font-semibold">
                                公開日時
                                <input type="datetime-local" value={form.published_at} onChange={(event) => updateForm('published_at', event.target.value)} className="mt-2 w-full rounded-[8px] border border-[#d9c9ae] px-4 py-3 text-sm" />
                            </label>
                        ) : null}
                        <label className="block text-sm font-semibold">
                            スラッグ
                            <input value={form.slug} onChange={(event) => updateForm('slug', normalizeSlugDraft(event.target.value))} required className="mt-2 w-full rounded-[8px] border border-[#d9c9ae] px-4 py-3 text-sm" />
                        </label>
                    </section>

                    <section className="space-y-4 rounded-[8px] bg-[#fffcf7] p-5 shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                        <label className="block text-sm font-semibold">
                            カテゴリー
                            <input list="blog-categories" value={form.category_name} onChange={(event) => updateForm('category_name', event.target.value)} className="mt-2 w-full rounded-[8px] border border-[#d9c9ae] px-4 py-3 text-sm" />
                            <datalist id="blog-categories">{categories.map((item) => <option key={item.slug} value={item.name} />)}</datalist>
                        </label>
                        <div className="text-sm font-semibold">
                            タグ
                            <div className="mt-2 rounded-[8px] border border-[#d9c9ae] bg-white p-2">
                                <div className="flex flex-wrap gap-2">
                                    {selectedTags.map((tag) => (
                                        <span key={tag} className="inline-flex items-center gap-2 rounded-full bg-[#f2ebe0] px-3 py-1 text-xs font-semibold text-[#17202b]">
                                            {tag}
                                            <button type="button" onClick={() => removeTag(tag)} className="text-[#8b5a16]">×</button>
                                        </span>
                                    ))}
                                    <input
                                        value={tagDraft}
                                        onChange={(event) => {
                                            const value = event.target.value;
                                            if (value.includes(',')) {
                                                value.split(',').forEach(addTag);
                                            } else {
                                                setTagDraft(value);
                                            }
                                        }}
                                        onKeyDown={(event) => {
                                            if (event.key === ',') {
                                                event.preventDefault();
                                                addTag(tagDraft);
                                            } else if (event.key === 'Enter') {
                                                event.preventDefault();
                                            } else if (event.key === 'Backspace' && tagDraft === '' && selectedTags.length > 0) {
                                                removeTag(selectedTags[selectedTags.length - 1]);
                                            }
                                        }}
                                        disabled={selectedTags.length >= 5}
                                        placeholder={selectedTags.length >= 5 ? '最大5件まで' : 'タグを入力'}
                                        className="min-w-[140px] flex-1 px-2 py-1 text-sm outline-none"
                                    />
                                </div>
                            </div>
                            {tagSuggestions.length > 0 && tagDraft ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {tagSuggestions.map((tag) => (
                                        <button key={tag.slug} type="button" onClick={() => addTag(tag.name)} className="rounded-full border border-[#d9c9ae] bg-white px-3 py-1 text-xs font-semibold text-[#5b6470]">
                                            {tag.name}
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    </section>

                    <section className="space-y-4 rounded-[8px] bg-[#fffcf7] p-5 shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                        {coverUrl ? <img src={coverUrl} alt="" className="aspect-[16/9] w-full rounded-[8px] object-cover" /> : null}
                        <div className="block text-sm font-semibold">
                            アイキャッチ画像
                            <input ref={coverInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setCoverImage(event.target.files?.[0] ?? null)} className="hidden" />
                            <button type="button" onClick={() => coverInputRef.current?.click()} className="mt-2 inline-flex w-full items-center justify-center rounded-[8px] border border-[#d9c9ae] bg-white px-4 py-3 text-sm font-semibold text-[#17202b]">
                                ファイルを選択
                            </button>
                            <p className="mt-2 text-xs text-[#68707a]">{coverImage?.name ?? editingPost?.cover_image_original_name ?? '未選択'}</p>
                        </div>
                        <label className="block text-sm font-semibold">
                            altテキスト
                            <input value={form.cover_image_alt} onChange={(event) => updateForm('cover_image_alt', event.target.value)} className="mt-2 w-full rounded-[8px] border border-[#d9c9ae] px-4 py-3 text-sm" />
                        </label>
                    </section>

                    <section className="space-y-4 rounded-[8px] bg-[#fffcf7] p-5 shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                        <label className="block text-sm font-semibold">抜粋<textarea value={form.excerpt} onChange={(event) => { autoFieldsRef.current.excerpt = false; updateForm('excerpt', event.target.value); }} rows={3} className="mt-2 w-full rounded-[8px] border border-[#d9c9ae] px-4 py-3 text-sm" /></label>
                        <label className="block text-sm font-semibold">meta title<input value={form.meta_title} onChange={(event) => { autoFieldsRef.current.metaTitle = false; updateForm('meta_title', event.target.value); }} className="mt-2 w-full rounded-[8px] border border-[#d9c9ae] px-4 py-3 text-sm" /></label>
                        <label className="block text-sm font-semibold">meta description<textarea value={form.meta_description} onChange={(event) => { autoFieldsRef.current.metaDescription = false; updateForm('meta_description', event.target.value); }} rows={3} className="mt-2 w-full rounded-[8px] border border-[#d9c9ae] px-4 py-3 text-sm" /></label>
                        <label className="block text-sm font-semibold">OGPタイトル<input value={form.og_title} onChange={(event) => { autoFieldsRef.current.ogTitle = false; updateForm('og_title', event.target.value); }} className="mt-2 w-full rounded-[8px] border border-[#d9c9ae] px-4 py-3 text-sm" /></label>
                        <label className="block text-sm font-semibold">OGP説明<textarea value={form.og_description} onChange={(event) => { autoFieldsRef.current.ogDescription = false; updateForm('og_description', event.target.value); }} rows={3} className="mt-2 w-full rounded-[8px] border border-[#d9c9ae] px-4 py-3 text-sm" /></label>
                        <label className="block text-sm font-semibold">
                            <span className="flex items-center gap-2">
                                canonical URL
                                <span className="relative inline-flex">
                                    <button
                                        type="button"
                                        aria-label="canonical URLの説明"
                                        aria-expanded={isCanonicalHelpOpen}
                                        onClick={() => setIsCanonicalHelpOpen((value) => !value)}
                                        onMouseEnter={() => setIsCanonicalHelpOpen(true)}
                                        onMouseLeave={() => setIsCanonicalHelpOpen(false)}
                                        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#d9c9ae] bg-white text-xs font-bold text-[#8f5c22]"
                                    >
                                        ?
                                    </button>
                                    {isCanonicalHelpOpen ? (
                                        <span
                                            role="tooltip"
                                            className="absolute right-0 top-7 z-20 w-72 rounded-[8px] border border-[#d9c9ae] bg-white p-3 text-xs font-normal leading-5 text-[#5b6470] shadow-[0_12px_28px_rgba(23,32,43,0.14)]"
                                        >
                                            同じ内容の記事ページが複数ある場合に、検索エンジンへ「正規のURL」を伝える設定です。通常は空欄で問題ありません。外部LPや旧URLを正規扱いしたい時だけ入力してください。
                                        </span>
                                    ) : null}
                                </span>
                            </span>
                            <input value={form.canonical_url} onChange={(event) => updateForm('canonical_url', event.target.value)} className="mt-2 w-full rounded-[8px] border border-[#d9c9ae] px-4 py-3 text-sm" />
                        </label>
                        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.noindex} onChange={(event) => updateForm('noindex', event.target.checked)} /> noindex</label>
                    </section>
                </aside>
            </div>
        </form>
    );
}
