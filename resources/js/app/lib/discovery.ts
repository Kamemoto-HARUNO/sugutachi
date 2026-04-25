import type { ServiceAddress } from './types';

export type BookingStartType = 'now' | 'scheduled';
export type DiscoverySort = 'recommended' | 'soonest' | 'rating';
export type DiscoveryPriceRange = 'all' | 'under_12000' | 'between_12000_20000' | 'over_20000';

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

export function formatWalkingTimeRange(range: string | null | undefined): string {
    if (!range) {
        return '徒歩目安は準備中';
    }

    return WALKING_TIME_LABELS[range] ?? '徒歩目安を確認';
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

export function getDefaultServiceAddress(addresses: ServiceAddress[]): ServiceAddress | null {
    return addresses.find((address) => address.is_default) ?? addresses[0] ?? null;
}

export function getServiceAddressLabel(address: ServiceAddress | null | undefined): string {
    if (!address) {
        return '施術場所を追加してください';
    }

    if (address.label) {
        return address.label;
    }

    const parts = [address.prefecture, address.city].filter(Boolean);

    if (parts.length > 0) {
        return parts.join('・');
    }

    return address.address_line ?? '施術場所';
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
