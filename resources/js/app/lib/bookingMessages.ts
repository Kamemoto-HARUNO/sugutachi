import type { RoleName } from './types';

export const bookingMessageSummaryRefreshEvent = 'booking-message-summary:refresh';

export function buildBookingMessagesIndexPath(role: Extract<RoleName, 'user' | 'therapist'>): string {
    return `/${role}/messages`;
}

export function buildBookingMessagesDetailPath(
    role: Extract<RoleName, 'user' | 'therapist'>,
    bookingPublicId: string,
): string {
    return `/${role}/bookings/${bookingPublicId}/messages`;
}

export function notifyBookingMessageSummaryChanged(): void {
    if (typeof window === 'undefined') {
        return;
    }

    window.dispatchEvent(new Event(bookingMessageSummaryRefreshEvent));
}
