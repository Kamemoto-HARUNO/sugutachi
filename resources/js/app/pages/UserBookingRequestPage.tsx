import { Navigate, useSearchParams } from 'react-router-dom';

export function UserBookingRequestPage() {
    const [searchParams] = useSearchParams();
    const therapistId = searchParams.get('therapist_id');
    const therapistMenuId = searchParams.get('therapist_menu_id');
    const serviceAddressId = searchParams.get('service_address_id');
    const availabilitySlotId = searchParams.get('availability_slot_id');
    const requestedStartAt = searchParams.get('requested_start_at');
    const startType = searchParams.get('start_type');
    const isOnDemandRequest = startType === 'now';

    if (
        !therapistId
        || !therapistMenuId
        || !serviceAddressId
        || (!isOnDemandRequest && (!availabilitySlotId || !requestedStartAt))
    ) {
        return <Navigate to="/user/therapists" replace />;
    }

    const query = searchParams.toString();

    return <Navigate to={`/user/booking-request/quote${query ? `?${query}` : ''}`} replace />;
}
