import type { Account, AppNotificationRecord, RoleName } from './types';

export type NotificationAudienceRole = RoleName | 'shared';

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
            return '対応開始';
        case 'booking_therapist_completed':
            return '対応終了確認';
        case 'booking_completion_window_updated':
            return '対応時間更新';
        case 'booking_completion_reminder':
            return '完了確認リマインド';
        case 'booking_auto_completed':
            return '予約自動完了';
        case 'booking_canceled':
            return '予約キャンセル';
        case 'booking_refunded':
            return '返金結果';
        case 'booking_interrupted':
            return '対応中断';
        case 'travel_request_received':
            return '出張リクエスト受信';
        case 'travel_request_warning':
            return '出張リクエスト注意';
        case 'travel_request_restricted':
            return '出張リクエスト制限';
        case 'identity_verification_submitted':
            return '本人確認提出';
        case 'contact_inquiry_received':
            return '問い合わせ受信';
        case 'refund_requested':
            return '返金申請受信';
        case 'payout_requested':
            return '出金申請受信';
        case 'report_created':
            return '通報受信';
        default:
            return 'アプリ通知';
    }
}

export function resolveNotificationRole(notification: AppNotificationRecord): NotificationAudienceRole {
    const explicitRole = readStringValue(notification.data?.['target_role']) ?? notification.target_role ?? null;

    if (explicitRole === 'user' || explicitRole === 'therapist' || explicitRole === 'admin') {
        return explicitRole;
    }

    const targetPath = readStringValue(notification.data?.['target_path']);

    if (targetPath?.startsWith('/user')) {
        return 'user';
    }

    if (targetPath?.startsWith('/therapist')) {
        return 'therapist';
    }

    if (targetPath?.startsWith('/admin')) {
        return 'admin';
    }

    switch (notification.notification_type) {
        case 'booking_requested':
        case 'booking_adjustment_accepted':
        case 'booking_no_show_confirmed':
        case 'booking_no_show_disputed':
        case 'travel_request_received':
            return 'therapist';
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
        case 'travel_request_warning':
        case 'travel_request_restricted':
            return 'user';
        default:
            return 'shared';
    }
}

export function formatNotificationRoleLabel(role: NotificationAudienceRole): string {
    switch (role) {
        case 'user':
            return '利用者';
        case 'therapist':
            return 'タチキャスト';
        case 'admin':
            return '運営';
        default:
            return '共通';
    }
}

export function notificationRoleBadgeClass(role: NotificationAudienceRole): string {
    switch (role) {
        case 'user':
            return 'border border-[#d6b35a] bg-[#f3dec0] text-[#17202b]';
        case 'therapist':
            return 'border border-[#4aa36d] bg-[#dff1e5] text-[#1f5e3b]';
        case 'admin':
            return 'border border-[#5c8ed9] bg-[#dfeeff] text-[#244f87]';
        default:
            return 'border border-[#d7d5cf] bg-[#f1eee8] text-[#516072]';
    }
}

export function notificationRoleCardClass(role: NotificationAudienceRole, isRead: boolean): string {
    switch (role) {
        case 'user':
            return isRead
                ? 'border-[#eadfca] bg-[#fffaf0]'
                : 'border-[#e4c98f] bg-[#fff7e7] shadow-[0_14px_35px_rgba(210,177,121,0.16)]';
        case 'therapist':
            return isRead
                ? 'border-[#d9e8df] bg-[#f6fbf8]'
                : 'border-[#95d0aa] bg-[#eef8f1] shadow-[0_14px_35px_rgba(74,163,109,0.14)]';
        case 'admin':
            return isRead
                ? 'border-[#dde5f0] bg-[#f6f9fe]'
                : 'border-[#a9c4eb] bg-[#edf5ff] shadow-[0_14px_35px_rgba(92,142,217,0.14)]';
        default:
            return isRead
                ? 'border-[#e6dfd4] bg-white/75'
                : 'border-[#f0d5cf] bg-white shadow-[0_14px_35px_rgba(23,32,43,0.08)]';
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
