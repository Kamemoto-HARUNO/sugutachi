type AnalyticsValue = string | number | boolean | null | undefined;
type AnalyticsParams = Record<string, AnalyticsValue>;

declare global {
    interface Window {
        dataLayer?: Array<Record<string, unknown>>;
    }
}

function cleanParams(params: AnalyticsParams = {}): AnalyticsParams {
    return Object.fromEntries(
        Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    );
}

export function trackAnalyticsEvent(eventName: string, params: AnalyticsParams = {}) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
        event: eventName,
        ...cleanParams(params),
    });
}

export function trackVirtualPageView(params: {
    page_path: string;
    page_title?: string;
    user_type?: string | null;
    is_logged_in?: boolean;
}) {
    trackAnalyticsEvent('virtual_page_view', params);
}

export function trackSignUpComplete(params: { user_type: 'user' | 'therapist' }) {
    trackAnalyticsEvent('sign_up_complete', params);
}

export function trackBookingRequestComplete(params: {
    booking_id?: string;
    therapist_id?: string | null;
    menu_duration_minutes?: number;
    start_type?: string | null;
    is_free_booking?: boolean;
}) {
    trackAnalyticsEvent('booking_request_complete', params);
}

export function trackTravelRequestComplete(params: {
    therapist_id?: string | null;
    prefecture?: string;
}) {
    trackAnalyticsEvent('travel_request_complete', params);
}

export function trackContactSubmitComplete(params: {
    inquiry_id?: string;
    category?: string;
    is_logged_in?: boolean;
}) {
    trackAnalyticsEvent('contact_submit_complete', params);
}

export function trackMessageSendComplete(params: {
    booking_id?: string;
    message_type?: 'text' | 'image';
    user_type?: string | null;
}) {
    trackAnalyticsEvent('message_send_complete', params);
}
