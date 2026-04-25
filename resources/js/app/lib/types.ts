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
    is_active: boolean;
    sort_order: number;
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

export interface TherapistProfileRecord {
    public_id: string;
    public_name: string;
    bio: string | null;
    profile_status: string;
    training_status: string | null;
    photo_review_status: string;
    is_online: boolean;
    online_since: string | null;
    last_location_updated_at: string | null;
    rating_average: number;
    review_count: number;
    approved_at: string | null;
    rejected_reason_code: string | null;
    menus: TherapistMenu[];
}

export interface TherapistReviewRequirement {
    key: string;
    label: string;
    is_satisfied: boolean;
}

export interface TherapistReviewStatus {
    profile: TherapistProfileRecord;
    can_submit: boolean;
    active_menu_count: number;
    latest_identity_verification_status: string | null;
    requirements: TherapistReviewRequirement[];
}

export interface StripeConnectedAccountStatus {
    has_account: boolean;
    stripe_account_id: string | null;
    account_type: string | null;
    status: string | null;
    charges_enabled: boolean;
    payouts_enabled: boolean;
    details_submitted: boolean;
    requirements_currently_due: string[];
    requirements_past_due: string[];
    disabled_reason: string | null;
    onboarding_completed_at: string | null;
    last_synced_at: string | null;
}

export interface StripeAccountLink {
    url: string;
    expires_at: string | null;
    type: string;
}

export interface IdentityVerificationRecord {
    id: number;
    provider: string;
    status: string;
    birth_year: number | null;
    is_age_verified: boolean;
    self_declared_male: boolean;
    document_type: string | null;
    submitted_at: string | null;
    reviewed_at: string | null;
    rejection_reason_code: string | null;
    purge_after: string | null;
}

export interface TempFileRecord {
    file_id: string;
    purpose: string;
    original_name: string;
    mime_type: string;
    size_bytes: number;
    status: string;
    expires_at: string | null;
    used_at: string | null;
    created_at: string;
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

export interface BookingQuoteAmounts {
    base_amount: number;
    travel_fee_amount: number;
    night_fee_amount: number;
    demand_fee_amount: number;
    profile_adjustment_amount: number;
    matching_fee_amount: number;
    platform_fee_amount: number;
    total_amount: number;
    therapist_gross_amount: number;
    therapist_net_amount: number;
}

export interface BookingQuoteRecord {
    quote_id: string;
    expires_at: string | null;
    is_on_demand: boolean;
    requested_start_at: string | null;
    availability_slot_id: string | null;
    walking_time_range: string | null;
    amounts: BookingQuoteAmounts;
}

export interface BookingCounterparty {
    role: string;
    public_id: string;
    display_name: string | null;
    account_status: string | null;
    therapist_profile_public_id: string | null;
}

export interface BookingTherapistProfileSummary {
    public_id: string;
    public_name: string;
}

export interface BookingTherapistMenuSummary {
    public_id: string;
    name: string;
    duration_minutes: number;
    base_price_amount: number;
}

export interface PaymentIntentRecord {
    stripe_payment_intent_id: string;
    client_secret?: string | null;
    status: string;
    capture_method: string | null;
    currency: string;
    amount: number;
    application_fee_amount: number;
    transfer_amount: number;
    is_current: boolean;
    authorized_at: string | null;
    captured_at: string | null;
    canceled_at: string | null;
    last_stripe_event_id: string | null;
}

export interface BookingListRecord {
    public_id: string;
    status: string;
    request_type: 'on_demand' | 'scheduled';
    is_on_demand: boolean;
    availability_slot_id: string | null;
    requested_start_at: string | null;
    scheduled_start_at: string | null;
    scheduled_end_at: string | null;
    duration_minutes: number;
    buffer_before_minutes: number;
    buffer_after_minutes: number;
    request_expires_at: string | null;
    accepted_at: string | null;
    confirmed_at: string | null;
    moving_at: string | null;
    arrived_at: string | null;
    started_at: string | null;
    ended_at: string | null;
    canceled_at: string | null;
    interrupted_at: string | null;
    cancel_reason_code: string | null;
    interruption_reason_code: string | null;
    cancel_reason_note?: string | null;
    total_amount: number;
    therapist_net_amount: number;
    platform_fee_amount: number;
    matching_fee_amount: number;
    counterparty: BookingCounterparty | null;
    therapist_profile: BookingTherapistProfileSummary | null;
    therapist_menu: BookingTherapistMenuSummary | null;
    service_address: ServiceAddress | null;
    current_payment_intent: PaymentIntentRecord | null;
    unread_message_count: number;
    refund_count: number;
    open_report_count: number;
    latest_message_sent_at: string | null;
    created_at: string;
}

export interface BookingCanceledByAccount {
    public_id: string;
    display_name: string | null;
}

export interface BookingRefundBreakdown {
    refund_count: number;
    auto_refund_count: number;
    requested_amount_total: number;
    approved_amount_total: number;
    processed_amount_total: number;
}

export interface BookingRefundRecord {
    public_id: string;
    status: string;
    reason_code: string | null;
    is_auto: boolean;
    requested_amount: number | null;
    approved_amount: number | null;
    processed_amount: number;
    processed_at: string | null;
    created_at: string;
}

export interface BookingConsentRecord {
    id: number;
    booking_public_id: string | null;
    account_id: string | null;
    consent_type: string;
    legal_document_public_id: string | null;
    legal_document_type: string | null;
    consented_at: string | null;
    created_at: string;
}

export interface BookingHealthCheckRecord {
    id: number;
    booking_public_id: string | null;
    account_id: string | null;
    role: string;
    drinking_status: string | null;
    has_injury: boolean;
    has_fever: boolean;
    contraindications: string[];
    notes: string | null;
    checked_at: string | null;
    created_at: string;
}

export interface BookingDetailRecord extends BookingListRecord {
    cancel_reason_note: string | null;
    canceled_by_role: string | null;
    canceled_by_account: BookingCanceledByAccount | null;
    current_quote: BookingQuoteRecord | null;
    refund_breakdown: BookingRefundBreakdown | null;
    refunds: BookingRefundRecord[];
    consents: BookingConsentRecord[];
    health_checks: BookingHealthCheckRecord[];
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
