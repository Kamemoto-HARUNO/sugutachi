import { apiRequest, unwrapData, type ApiErrorPayload } from './api';
import type {
    AdminBannerRecord,
    ApiEnvelope,
    BannerPlacement,
    BannerPublicationState,
    BannerStatus,
    BannerViewerSegment,
    PublicBannerRecord,
} from './types';

export const BANNER_PLACEMENT_OPTIONS: Array<{ value: BannerPlacement; label: string }> = [
    { value: 'home', label: 'トップページ' },
    { value: 'therapist_detail', label: 'セラピスト詳細ページ' },
    { value: 'dashboard', label: 'ダッシュボード' },
];

export const BANNER_VIEWER_SEGMENT_OPTIONS: Array<{ value: BannerViewerSegment; label: string }> = [
    { value: 'guest', label: '未ログイン' },
    { value: 'user', label: '利用者' },
    { value: 'therapist', label: 'タチキャスト' },
];

export const BANNER_STATUS_OPTIONS: Array<{ value: BannerStatus; label: string }> = [
    { value: 'draft', label: '下書き' },
    { value: 'hidden', label: '非公開' },
    { value: 'published', label: '公開' },
];

export function formatBannerPlacementLabel(value: BannerPlacement): string {
    return BANNER_PLACEMENT_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function formatBannerViewerSegmentLabel(value: BannerViewerSegment): string {
    return BANNER_VIEWER_SEGMENT_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function formatBannerStatusLabel(value: BannerStatus): string {
    return BANNER_STATUS_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function formatBannerPublicationStateLabel(value: BannerPublicationState): string {
    switch (value) {
        case 'visible':
            return '表示中';
        case 'scheduled':
            return '開始待ち';
        case 'expired':
            return '終了済み';
        case 'draft':
            return '下書き';
        case 'hidden':
            return '非公開';
    }
}

export async function fetchVisibleBanners(
    placement: BannerPlacement,
    token?: string | null,
): Promise<PublicBannerRecord[]> {
    const path = token
        ? `/me/banners?placement=${encodeURIComponent(placement)}`
        : `/banners?placement=${encodeURIComponent(placement)}`;

    const payload = await apiRequest<ApiEnvelope<PublicBannerRecord[]>>(path, { token });

    return unwrapData(payload);
}

export async function fetchAdminBanners(
    token: string,
    params?: URLSearchParams,
): Promise<AdminBannerRecord[]> {
    const path = params?.toString() ? `/admin/banners?${params.toString()}` : '/admin/banners';
    const payload = await apiRequest<ApiEnvelope<AdminBannerRecord[]>>(path, { token });

    return unwrapData(payload);
}

function trackBannerEndpoint(path: string): void {
    if (typeof window === 'undefined') {
        return;
    }

    void fetch(path, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
        },
        keepalive: true,
    }).catch(() => undefined);
}

export function trackBannerImpression(publicId: string): void {
    trackBannerEndpoint(`/api/banners/${publicId}/impressions`);
}

export function trackBannerClick(publicId: string): void {
    trackBannerEndpoint(`/api/banners/${publicId}/clicks`);
}

export function buildBannerFormData(input: {
    title: string;
    linkUrl: string;
    placements: BannerPlacement[];
    viewerSegments: BannerViewerSegment[];
    status: BannerStatus;
    sortOrder: string;
    startsAt: string;
    endsAt: string;
    imageFile: File | null;
    method?: 'PATCH';
}): FormData {
    const formData = new FormData();

    if (input.method) {
        formData.append('_method', input.method);
    }

    formData.append('title', input.title);
    formData.append('link_url', input.linkUrl);
    formData.append('status', input.status);
    formData.append('sort_order', input.sortOrder);
    formData.append('starts_at', input.startsAt);
    formData.append('ends_at', input.endsAt);

    input.placements.forEach((placement) => {
        formData.append('placements[]', placement);
    });

    input.viewerSegments.forEach((viewerSegment) => {
        formData.append('viewer_segments[]', viewerSegment);
    });

    if (input.imageFile) {
        formData.append('image', input.imageFile);
    }

    return formData;
}

export function formatBannerFileSize(sizeBytes: number | null | undefined): string | null {
    if (!sizeBytes || sizeBytes <= 0) {
        return null;
    }

    if (sizeBytes >= 1024 * 1024) {
        return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
}

export function firstBannerErrorMessage(payload?: ApiErrorPayload | null): string | null {
    if (!payload?.errors) {
        return null;
    }

    for (const messages of Object.values(payload.errors)) {
        if (messages.length > 0) {
            return messages[0];
        }
    }

    return null;
}
