import type { BookingDetailRecord } from './types';

export type BookingTroubleActorRole = 'user' | 'therapist';

const NO_SHOW_ELIGIBLE_STATUSES = ['accepted', 'moving'] as const;

export function getBookingPlannedStartAt(
    booking: Pick<BookingDetailRecord, 'scheduled_start_at' | 'requested_start_at'>,
): string | null {
    return booking.scheduled_start_at ?? booking.requested_start_at ?? null;
}

export function canOpenBookingNoShowFlow(
    booking: Pick<BookingDetailRecord, 'status' | 'scheduled_start_at' | 'requested_start_at'>,
    _actorRole: BookingTroubleActorRole,
    now: Date = new Date(),
): boolean {
    if (!NO_SHOW_ELIGIBLE_STATUSES.includes(booking.status as (typeof NO_SHOW_ELIGIBLE_STATUSES)[number])) {
        return false;
    }

    const plannedStartAt = getBookingPlannedStartAt(booking);

    if (!plannedStartAt) {
        return booking.status === 'moving';
    }

    return new Date(plannedStartAt).getTime() <= now.getTime();
}

export function getBookingNoShowUnavailableReason(
    booking: Pick<BookingDetailRecord, 'status' | 'scheduled_start_at' | 'requested_start_at'>,
    actorRole: BookingTroubleActorRole,
    now: Date = new Date(),
): string {
    if (canOpenBookingNoShowFlow(booking, actorRole, now)) {
        return '';
    }

    if (NO_SHOW_ELIGIBLE_STATUSES.includes(booking.status as (typeof NO_SHOW_ELIGIBLE_STATUSES)[number])) {
        return '予定時刻になるまでは、この導線はまだ使えません。予定時刻を過ぎても会えないときに利用してください。';
    }

    return actorRole === 'user'
        ? 'この予約は、来ない・連絡が取れない導線の対象外です。必要に応じてキャンセル、返金申請、または通報をご利用ください。'
        : 'この予約は、来ない・連絡が取れない導線の対象外です。必要に応じて通常キャンセルやメッセージでの連絡をご利用ください。';
}
