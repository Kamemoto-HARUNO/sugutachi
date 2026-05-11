import { apiRequest, unwrapData } from './api';
import type { ApiEnvelope, BlogCategoryRecord, BlogPostRecord, BlogTagRecord } from './types';

export const BLOG_STATUS_OPTIONS: Array<{ value: BlogPostRecord['status']; label: string }> = [
    { value: 'draft', label: '下書き' },
    { value: 'published', label: '公開' },
    { value: 'hidden', label: '非公開' },
    { value: 'scheduled', label: '予約' },
];

export interface BlogPostListMeta {
    current_page?: number;
    last_page?: number;
    per_page?: number;
    total?: number;
    categories?: BlogCategoryRecord[];
    tags?: BlogTagRecord[];
}

export interface BlogPostListResponse {
    posts: BlogPostRecord[];
    meta: BlogPostListMeta;
}

export async function fetchLatestBlogPosts(limit = 3): Promise<BlogPostRecord[]> {
    const payload = await apiRequest<ApiEnvelope<BlogPostRecord[]>>(`/blog-posts/latest?limit=${limit}`);

    return unwrapData(payload);
}

export async function fetchBlogPosts(path: string): Promise<BlogPostListResponse> {
    const payload = await apiRequest<ApiEnvelope<BlogPostRecord[]>>(path);
    const rawMeta = (payload.meta ?? {}) as BlogPostListMeta;

    return {
        posts: unwrapData(payload),
        meta: {
            ...rawMeta,
            categories: rawMeta.categories ?? [],
            tags: rawMeta.tags ?? [],
        },
    };
}

export async function fetchBlogPost(slug: string, token?: string | null): Promise<BlogPostRecord> {
    const payload = await apiRequest<ApiEnvelope<BlogPostRecord>>(`/blog-posts/${slug}`, { token });

    return unwrapData(payload);
}

export type BlogViewSource = 'search' | 'internal' | 'external' | 'direct';

export function resolveBlogViewSource(referrer: string): BlogViewSource {
    if (!referrer) {
        return 'direct';
    }

    try {
        const referrerUrl = new URL(referrer);

        if (referrerUrl.origin === window.location.origin) {
            return 'internal';
        }

        const host = referrerUrl.hostname.toLowerCase();

        if (
            host.includes('google.')
            || host.includes('bing.')
            || host.includes('yahoo.')
            || host.includes('duckduckgo.')
            || host.includes('baidu.')
            || host.includes('yandex.')
        ) {
            return 'search';
        }

        return 'external';
    } catch {
        return 'direct';
    }
}

export function trackBlogPostView(publicId: string, source: BlogViewSource): void {
    const body = JSON.stringify({ source });

    if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(`/api/blog-posts/${publicId}/views`, blob);
        return;
    }

    void fetch(`/api/blog-posts/${publicId}/views`, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body,
        credentials: 'same-origin',
        keepalive: true,
    });
}

export async function fetchAdminBlogMeta(token: string): Promise<{ categories: BlogCategoryRecord[]; tags: BlogTagRecord[] }> {
    const payload = await apiRequest<ApiEnvelope<{ categories: BlogCategoryRecord[]; tags: BlogTagRecord[] }>>('/admin/blog-posts/meta', { token });

    return unwrapData(payload);
}

export async function uploadBlogBodyImage(token: string, file: File): Promise<string> {
    const formData = new FormData();
    formData.append('image', file);

    const payload = await apiRequest<ApiEnvelope<{ url: string }>>('/admin/blog-images', {
        method: 'POST',
        token,
        body: formData,
    });

    return unwrapData(payload).url;
}

export function buildBlogFormData(input: Record<string, unknown>, coverImage?: File | null): FormData {
    const formData = new FormData();

    Object.entries(input).forEach(([key, value]) => {
        if (value == null) {
            return;
        }

        if (Array.isArray(value)) {
            value.forEach((item) => formData.append(`${key}[]`, String(item)));
            return;
        }

        if (typeof value === 'boolean') {
            formData.append(key, value ? '1' : '0');
            return;
        }

        formData.append(key, String(value));
    });

    if (coverImage) {
        formData.append('cover_image', coverImage);
    }

    return formData;
}

export function normalizeSlugInput(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-');
}

export function normalizeSlugDraft(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-{2,}/g, '-');
}

export function stripHtmlToText(html: string): string {
    const element = document.createElement('div');
    element.innerHTML = html;

    return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function buildBlogExcerpt(html: string, maxLength = 120): string {
    const text = stripHtmlToText(html);

    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}
