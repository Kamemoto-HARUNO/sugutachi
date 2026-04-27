import { Navigate, useSearchParams } from 'react-router-dom';

export function UserBookingPaymentPage() {
    const [searchParams] = useSearchParams();
    const query = searchParams.toString();

    return <Navigate to={`/user/booking-request/quote${query ? `?${query}` : ''}`} replace />;
}
