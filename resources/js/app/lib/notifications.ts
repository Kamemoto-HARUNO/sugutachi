import type { Account, AppNotificationRecord, RoleName } from './types';

function readStringValue(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function hasRole(account: Account | null | undefined, role: RoleName): boolean {
    return Boolean(account?.roles.some((assignment) => assignment.role === role && assignment.status === 'active'));
}

export function formatNotificationTypeLabel(type: string | null | undefined): string {
    switch (type) {
        case 'booking_requested':
            return '新しい予約リクエスト';
        case 'booking_accepted':
            return '予約承諾';
        case 'booking_adjustment_proposed':
            return '時間変更の提案';
        case 'booking_adjustment_accepted':
            return '時間変更の承認';
        case 'booking_no_show_reported':
            return '未着申告の確認';
        case 'booking_no_show_confirmed':
            return '未着申告の確定';
        case 'booking_no_show_disputed':
            return '未着申告への異議';
        case 'booking_moving':
            return '移動開始';
        case 'booking_arrived':
            return '到着';
        case 'booking_started':
            return '施術開始';
        case 'booking_therapist_completed':
            return '施術終了確認';
        case 'booking_completion_window_updated':
            return '施術時間更新';
        case 'booking_completion_reminder':
            return '完了確認リマインド';
        case 'booking_auto_completed':
            return '予約自動完了';
        case 'booking_canceled':
            return '予約キャンセル';
        case 'booking_refunded':
            return '返金結果';
        case 'booking_interrupted':
            return '施術中断';
        case 'travel_request_received':
            return '出張リクエスト受信';
        case 'travel_request_warning':
            return '出張リクエスト注意';
        case 'travel_request_restricted':
            return '出張リクエスト制限';
        default:
            return 'アプリ通知';
    }
}

export function resolveNotificationPath(
    notification: AppNotificationRecord,
    account: Account | null | undefined,
    activeRole: RoleName | null,
): string | null {
    const targetPath = readStringValue(notification.data?.['target_path']);

    if (targetPath) {
        return targetPath;
    }

    const bookingPublicId = readStringValue(notification.data?.['booking_public_id']);
    const travelRequestId = readStringValue(notification.data?.['travel_request_id']);

    switch (notification.notification_type) {
        case 'booking_requested':
            return bookingPublicId ? `/therapist/requests/${bookingPublicId}` : '/therapist/bookings?group=requested';
        case 'booking_adjustment_accepted':
            return bookingPublicId ? `/therapist/bookings/${bookingPublicId}` : '/therapist/bookings';
        case 'booking_accepted':
        case 'booking_adjustment_proposed':
        case 'booking_no_show_reported':
        case 'booking_moving':
        case 'booking_arrived':
        case 'booking_started':
        case 'booking_therapist_completed':
        case 'booking_completion_window_updated':
        case 'booking_completion_reminder':
        case 'booking_refunded':
            return bookingPublicId ? `/user/bookings/${bookingPublicId}` : '/user/bookings';
        case 'booking_no_show_confirmed':
        case 'booking_no_show_disputed':
            return bookingPublicId ? `/therapist/bookings/${bookingPublicId}` : '/therapist/bookings';
        case 'booking_auto_completed':
        case 'booking_canceled':
        case 'booking_interrupted':
            if (bookingPublicId) {
                if (activeRole === 'therapist') {
                    return `/therapist/bookings/${bookingPublicId}`;
                }

                if (activeRole === 'user') {
                    return `/user/bookings/${bookingPublicId}`;
                }

                if (hasRole(account, 'user')) {
                    return `/user/bookings/${bookingPublicId}`;
                }

                if (hasRole(account, 'therapist')) {
                    return `/therapist/bookings/${bookingPublicId}`;
                }
            }

            return hasRole(account, 'user') ? '/user/bookings' : (hasRole(account, 'therapist') ? '/therapist/bookings' : null);
        case 'travel_request_received':
            return travelRequestId ? `/therapist/travel-requests/${travelRequestId}` : '/therapist/travel-requests';
        case 'travel_request_warning':
        case 'travel_request_restricted':
            return '/contact';
        default:
            return null;
    }
}

export function buildNotificationPreview(notification: AppNotificationRecord): string {
    const message = notification.body.trim();

    if (message.length <= 100) {
        return message;
    }

    return `${message.slice(0, 100)}…`;
}
