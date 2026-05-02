import { apiRequest, unwrapData } from './api';
import type { ApiEnvelope, BookingListRecord, RoleName } from './types';

export const bookingMessageSummaryRefreshEvent = 'booking-message-summary:refresh';

export type BookingInboxRole = Extract<RoleName, 'user' | 'therapist'>;

export type BookingInboxRecord = BookingListRecord & {
    inbox_role: BookingInboxRole;
};

export function buildBookingMessagesIndexPath(): string {
    return '/messages';
}

export function buildBookingMessagesDetailPath(
    role: BookingInboxRole,
    bookingPublicId: string,
): string {
    return `/${role}/bookings/${bookingPublicId}/messages`;
}

export function getBookingInboxRoles(roles: RoleName[]): BookingInboxRole[] {
    return roles.filter((role): role is BookingInboxRole => role === 'user' || role === 'therapist');
}

export async function fetchBookingInboxThreads(
    token: string,
    roles: BookingInboxRole[],
): Promise<BookingInboxRecord[]> {
    const responses = await Promise.all(roles.map(async (role) => {
        const payload = await apiRequest<ApiEnvelope<BookingListRecord[]>>(`/bookings?role=${role}&sort=updated_at&direction=desc`, {
            token,
        });

        return unwrapData(payload).map((booking) => ({
            ...booking,
            inbox_role: role,
        }));
    }));

    return responses.flat();
}

export function countUnreadBookingInboxMessages(threads: BookingInboxRecord[]): number {
    return threads.reduce(
        (total, booking) => total + (booking.message_thread.can_view ? booking.unread_message_count : 0),
        0,
    );
}

export function notifyBookingMessageSummaryChanged(): void {
    if (typeof window === 'undefined') {
        return;
    }

    window.dispatchEvent(new Event(bookingMessageSummaryRefreshEvent));
}
