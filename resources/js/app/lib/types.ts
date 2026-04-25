export type RoleName = 'user' | 'therapist' | 'admin';

export interface RoleAssignment {
    role: string;
    status: string;
}

export interface IdentityVerificationSummary {
    status: string;
    is_age_verified: boolean;
    submitted_at: string | null;
}

export interface Account {
    public_id: string;
    email: string;
    phone_e164: string | null;
    display_name: string | null;
    status: string;
    last_active_role: string | null;
    roles: RoleAssignment[];
    latest_identity_verification?: IdentityVerificationSummary | null;
    created_at: string;
}

export interface LoginResponse {
    token_type: string;
    access_token: string;
    account: Account;
}

export interface ApiEnvelope<T> {
    data: T;
    meta?: Record<string, unknown>;
}

export interface LegalDocumentSummary {
    public_id: string;
    document_type: string;
    version: string;
    title: string;
    body: string;
    path: string;
    accept_path: string;
    published_at: string | null;
    effective_at: string | null;
}

export interface ServiceMeta {
    service_name: string;
    domain: string;
    base_url: string;
    support_email: string;
    contact: {
        form_enabled: boolean;
        reply_channel: string;
    };
    fees: {
        currency: string;
        matching_fee_amount: number;
        platform_fee_rate: number;
    };
    booking: {
        minimum_age: number;
        payment_methods: string[];
        walking_time_estimation: {
            base_minutes?: number;
            minutes_per_km?: number;
            minimum_minutes?: number;
            maximum_minutes?: number;
        };
    };
    commerce_notice: {
        operator_name: string | null;
        representative_name: string | null;
        business_address: string | null;
        phone_number: string | null;
        contact_email: string | null;
        inquiry_hours: string | null;
        payment_timing: string | null;
        service_delivery_timing: string | null;
        cancellation_policy_summary: string | null;
        refund_policy_summary: string | null;
        supported_payment_methods: string[];
        legal_document_type: string;
        legal_document: LegalDocumentSummary | null;
    };
    legal_document_types: string[];
    legal_documents: LegalDocumentSummary[];
}

export interface HelpFaqItem {
    id: string;
    category: string;
    question: string;
    answer: string;
    sort_order: number;
}

export interface ServiceAddress {
    public_id: string;
    label: string | null;
    place_type: 'home' | 'hotel' | 'office' | 'other';
    postal_code: string | null;
    prefecture: string | null;
    city: string | null;
    address_line: string | null;
    building: string | null;
    access_notes: string | null;
    lat: number | string;
    lng: number | string;
    is_default: boolean;
    created_at: string;
    updated_at: string;
}

export interface PublicProfilePhoto {
    sort_order: number;
    url: string;
}

export interface TherapistSearchResult {
    public_id: string;
    public_name: string;
    bio_excerpt: string | null;
    training_status: string | null;
    rating_average: number;
    review_count: number;
    therapist_cancellation_count: number;
    walking_time_range: string | null;
    estimated_total_amount: number | null;
    photos: PublicProfilePhoto[];
}

export interface TherapistMenu {
    public_id: string;
    name: string;
    description: string | null;
    duration_minutes: number;
    base_price_amount: number;
    estimated_total_amount: number | null;
}

export interface TherapistDetail {
    public_id: string;
    public_name: string;
    bio: string | null;
    training_status: string | null;
    rating_average: number;
    review_count: number;
    therapist_cancellation_count: number;
    is_online: boolean;
    walking_time_range: string | null;
    lowest_estimated_total_amount: number | null;
    menus: TherapistMenu[];
    photos: PublicProfilePhoto[];
}

export interface PublicTherapistAvailabilityWindow {
    availability_slot_id: string;
    start_at: string;
    end_at: string;
    booking_deadline_at: string;
    dispatch_area_label: string | null;
}

export interface PublicTherapistAvailability {
    date: string;
    walking_time_range: string | null;
    estimated_total_amount_range: {
        min: number;
        max: number;
    } | null;
    windows: PublicTherapistAvailabilityWindow[];
}

export interface ReviewSummary {
    id: number;
    booking_public_id: string | null;
    reviewer_account_id: string | null;
    reviewee_account_id: string | null;
    reviewer_role: string;
    rating_overall: number;
    rating_manners: number | null;
    rating_skill: number | null;
    rating_cleanliness: number | null;
    rating_safety: number | null;
    public_comment: string | null;
    status: string;
    created_at: string;
}

export interface NavItem {
    label: string;
    to: string;
    exact?: boolean;
}

export interface PlaceholderRouteDefinition {
    path: string;
    title: string;
    description: string;
    apiPath?: string;
}
