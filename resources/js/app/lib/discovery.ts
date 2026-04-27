import { buildCurrentJstDateTimeLocalValue, buildRoundedJstDateTimeLocalValue } from './datetime';
import type { PendingScheduledRequestSummary, ServiceAddress, TherapistMenu, TherapistSearchResult } from './types';

export type BookingStartType = 'now' | 'scheduled';
export type DiscoverySort = 'recommended' | 'soonest' | 'rating';
export type DiscoveryPriceRange = 'all' | 'under_12000' | 'between_12000_20000' | 'over_20000';

export const DISCOVERY_HERO_TITLE = '今すぐ会える、近くで探せる。';
export const DISCOVERY_TOP_BADGE = '本人確認済みタチのみ掲載';
export const DISCOVERY_HERO_BULLETS = ['18歳以上確認済み', '位置情報は概算表示', '直接取引禁止'] as const;
export const DISCOVERY_LOCATION_LABEL = '待ち合わせ場所';
export const DISCOVERY_BOOKING_TYPE_LABEL = '予約タイプ';
export const DISCOVERY_DURATION_OPTIONS = [60, 90, 120];
export const DEFAULT_DISCOVERY_DURATION = 60;
export const DISCOVERY_BOOKING_TYPE_OPTIONS = {
    now: '今すぐ',
    scheduled: '日時指定',
} as const;
export const DISCOVERY_SORT_OPTIONS: Array<{ value: DiscoverySort; label: string }> = [
    { value: 'recommended', label: 'おすすめ順' },
    { value: 'soonest', label: '徒歩が近い順' },
    { value: 'rating', label: '評価順' },
];
export const DISCOVERY_FILTER_LABELS = {
    training: '研修済み',
    rating: '星4.5以上',
    walking: '徒歩30分以内',
} as const;
export const DISCOVERY_DISPLAY_NOTE_LABEL = '表示について';
export const DISCOVERY_LOCATION_PRIVACY_NOTE = '表示されるのは徒歩目安レンジだけです。正確な位置や住所は公開されません。';

export interface DiscoverySearchQueryInput {
    serviceAddressId?: string | null;
    durationMinutes?: number | null;
    startType?: BookingStartType | null;
    scheduledStartAt?: string | null;
    sort?: DiscoverySort | null;
}

const WALKING_TIME_LABELS: Record<string, string> = {
    within_15_min: '徒歩15分以内',
    within_30_min: '徒歩30分以内',
    within_45_min: '徒歩45分以内',
    within_60_min: '徒歩60分以内',
    over_60_min: '徒歩60分超',
};

const WALKING_TIME_MAX_MINUTES: Record<string, number> = {
    within_15_min: 15,
    within_30_min: 30,
    within_45_min: 45,
    within_60_min: 60,
    over_60_min: 999,
};

const TRAINING_STATUS_LABELS: Record<string, string> = {
    completed: '研修済み',
    in_progress: '研修中',
    pending: '審査待ち',
};

export function formatCurrency(amount: number | null | undefined): string {
    if (amount == null) {
        return 'お問い合わせ';
    }

    return new Intl.NumberFormat('ja-JP', {
        style: 'currency',
        currency: 'JPY',
        maximumFractionDigits: 0,
    }).format(amount);
}

export function normalizeDiscoveryDuration(durationMinutes: number | null | undefined): number {
    return durationMinutes != null && DISCOVERY_DURATION_OPTIONS.includes(durationMinutes)
        ? durationMinutes
        : DEFAULT_DISCOVERY_DURATION;
}

export function buildDiscoverySearchParams(input: DiscoverySearchQueryInput): URLSearchParams {
    const params = new URLSearchParams();

    if (input.serviceAddressId) {
        params.set('service_address_id', input.serviceAddressId);
    }

    params.set('menu_duration_minutes', String(normalizeDiscoveryDuration(input.durationMinutes)));
    params.set('start_type', input.startType === 'scheduled' ? 'scheduled' : 'now');

    if (input.sort) {
        params.set('sort', input.sort);
    }

    if (input.startType === 'scheduled' && input.scheduledStartAt) {
        params.set('scheduled_start_at', input.scheduledStartAt);
    }

    return params;
}

export function buildDiscoverySearchPath(input: DiscoverySearchQueryInput, basePath = '/user/therapists'): string {
    const params = buildDiscoverySearchParams(input);
    const query = params.toString();

    return query ? `${basePath}?${query}` : basePath;
}

export function formatDiscoveryScheduledApiValue(value: string): string {
    if (!value) {
        return '';
    }

    return `${value.replace('T', ' ')}:00`;
}

export function buildDefaultDiscoveryScheduledStartAt(now = new Date()): string {
    return buildRoundedJstDateTimeLocalValue(now, 15) || buildCurrentJstDateTimeLocalValue(now);
}

export function formatWalkingTimeRange(range: string | null | undefined): string {
    if (!range) {
        return '徒歩目安は準備中';
    }

    return WALKING_TIME_LABELS[range] ?? '徒歩目安を確認';
}

export function getPendingScheduledRequestActionLabel(
    pendingRequest: PendingScheduledRequestSummary | null | undefined,
): string {
    if (pendingRequest?.status === 'payment_authorizing') {
        return '送信中の予約を確認';
    }

    return '承認待ちの予約を確認';
}

export function getPendingScheduledRequestNotice(
    pendingRequest: PendingScheduledRequestSummary | null | undefined,
): string {
    if (pendingRequest?.status === 'payment_authorizing') {
        return 'このセラピストには送信中の予約リクエストがあります。カード確認が完了するまでは、新しい予約リクエストを送れません。';
    }

    return 'このセラピストには承認待ちの予約リクエストがあります。承認・見送り・期限切れのあとに次の予約リクエストを送れます。';
}

export function sortTherapistSearchResults(
    therapists: TherapistSearchResult[],
    sort: DiscoverySort,
): TherapistSearchResult[] {
    const sorted = [...therapists];

    switch (sort) {
        case 'soonest':
            sorted.sort((left, right) => {
                return resolveWalkingTimeMaxMinutes(left.walking_time_range) - resolveWalkingTimeMaxMinutes(right.walking_time_range)
                    || right.rating_average - left.rating_average
                    || right.review_count - left.review_count;
            });
            return sorted;
        case 'rating':
            sorted.sort((left, right) => {
                return right.rating_average - left.rating_average
                    || right.review_count - left.review_count
                    || resolveWalkingTimeMaxMinutes(left.walking_time_range) - resolveWalkingTimeMaxMinutes(right.walking_time_range);
            });
            return sorted;
        default:
            return sorted;
    }
}

export function resolveWalkingTimeMaxMinutes(range: string | null | undefined): number {
    if (!range) {
        return Number.POSITIVE_INFINITY;
    }

    return WALKING_TIME_MAX_MINUTES[range] ?? Number.POSITIVE_INFINITY;
}

export function formatTrainingStatus(status: string | null | undefined): string {
    if (!status) {
        return '掲載審査済み';
    }

    return TRAINING_STATUS_LABELS[status] ?? status;
}

export function buildEstimatedPriceLabel(
    durationMinutes: number | null | undefined,
    amount: number | null | undefined,
): string {
    if (amount == null) {
        return '料金は詳細で確認';
    }

    if (!durationMinutes) {
        return `概算 ${formatCurrency(amount)}〜`;
    }

    return `${durationMinutes}分 ${formatCurrency(amount)}〜`;
}

type MenuPricingSummary = Pick<TherapistMenu, 'duration_minutes' | 'minimum_duration_minutes' | 'base_price_amount' | 'hourly_rate_amount'>;

export function getMenuMinimumDurationMinutes(menu: MenuPricingSummary | null | undefined): number {
    if (!menu) {
        return DEFAULT_DISCOVERY_DURATION;
    }

    return menu.minimum_duration_minutes ?? menu.duration_minutes;
}

export function getMenuHourlyRateAmount(menu: MenuPricingSummary | null | undefined): number | null {
    if (!menu) {
        return null;
    }

    if (menu.hourly_rate_amount != null) {
        return menu.hourly_rate_amount;
    }

    const minimumDurationMinutes = getMenuMinimumDurationMinutes(menu);

    if (!minimumDurationMinutes) {
        return menu.base_price_amount ?? null;
    }

    return Math.round((menu.base_price_amount * 60) / minimumDurationMinutes);
}

export function formatMenuMinimumDurationLabel(menu: MenuPricingSummary | null | undefined): string {
    return `最短 ${getMenuMinimumDurationMinutes(menu)}分`;
}

export function formatMenuHourlyRateLabel(menu: MenuPricingSummary | null | undefined): string {
    const hourlyRateAmount = getMenuHourlyRateAmount(menu);

    return hourlyRateAmount == null ? '60分料金は確認中' : `60分料金 ${formatCurrency(hourlyRateAmount)}`;
}

export function getDefaultServiceAddress(addresses: ServiceAddress[]): ServiceAddress | null {
    return addresses.find((address) => address.is_default) ?? addresses[0] ?? null;
}

export function getServiceAddressLabel(address: ServiceAddress | null | undefined): string {
    if (!address) {
        return '待ち合わせ場所を追加してください';
    }

    if (address.label) {
        return address.label;
    }

    const parts = [address.prefecture, address.city].filter(Boolean);

    if (parts.length > 0) {
        return parts.join('・');
    }

    return address.address_line ?? '待ち合わせ場所';
}

export function formatRelativeUpdatedAt(updatedAt: Date | null): string {
    if (!updatedAt) {
        return '未更新';
    }

    const diffMs = Date.now() - updatedAt.getTime();
    const diffMinutes = Math.max(0, Math.round(diffMs / 60000));

    if (diffMinutes <= 1) {
        return 'たった今';
    }

    if (diffMinutes < 60) {
        return `${diffMinutes}分前`;
    }

    const diffHours = Math.round(diffMinutes / 60);

    return `${diffHours}時間前`;
}

export function matchesPriceRange(
    amount: number | null | undefined,
    range: DiscoveryPriceRange,
): boolean {
    if (amount == null || range === 'all') {
        return true;
    }

    if (range === 'under_12000') {
        return amount < 12000;
    }

    if (range === 'between_12000_20000') {
        return amount >= 12000 && amount <= 20000;
    }

    return amount > 20000;
}
