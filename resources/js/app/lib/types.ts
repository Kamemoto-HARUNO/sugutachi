export type RoleName = 'user' | 'therapist' | 'admin';

export interface RoleAssignment {
    role: string;
    status: string;
    granted_at?: string | null;
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
    payment?: {
        stripe_publishable_key: string | null;
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

export interface SelfProfilePhotoSummary {
    id: number;
    usage_type: string;
    status: string;
    rejection_reason_code: string | null;
    sort_order: number;
    url: string | null;
    therapist_profile: {
        public_id: string | null;
        public_name: string | null;
        photo_review_status: string | null;
    } | null;
    created_at: string;
}

export interface MeProfileRecord {
    public_id: string;
    email: string;
    phone_e164: string | null;
    phone_verified_at: string | null;
    display_name: string | null;
    status: string;
    last_active_role: string | null;
    roles: RoleAssignment[];
    latest_identity_verification: {
        status: string;
        is_age_verified: boolean;
        submitted_at: string | null;
        reviewed_at: string | null;
    } | null;
    photos: SelfProfilePhotoSummary[];
    created_at: string;
    updated_at: string;
}

export interface ContactInquirySubmissionRecord {
    public_id: string;
    status: string;
    category: string;
    source: string;
    submitted_at: string;
}

export interface UserProfileRecord {
    profile_status: string;
    age_range: string | null;
    body_type: string | null;
    height_cm: number | null;
    weight_range: string | null;
    preferences: Record<string, string> | string[] | null;
    touch_ng: string[] | Record<string, string> | null;
    health_notes: string | null;
    sexual_orientation: string | null;
    gender_identity: string | null;
    disclose_sensitive_profile_to_therapist: boolean;
    created_at: string;
    updated_at: string;
}

export interface ReportAccountSummary {
    public_id: string;
    display_name: string | null;
    status: string | null;
}

export interface ReportSourceBookingMessage {
    id: number;
    sender: {
        public_id: string | null;
        display_name: string | null;
    } | null;
    moderation_status: string;
    detected_contact_exchange: boolean;
    sent_at: string | null;
}

export interface ReportRecord {
    public_id: string;
    booking_public_id: string | null;
    source_booking_message: ReportSourceBookingMessage | null;
    reporter_account_id: string | null;
    reporter_account: ReportAccountSummary | null;
    target_account_id: string | null;
    target_account: ReportAccountSummary | null;
    assigned_admin_account_id: string | null;
    category: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    status: 'open' | 'resolved';
    detail?: string | null;
    resolved_at: string | null;
    created_at: string;
}

export interface AdminReportSourceBookingMessage {
    id: number;
    message_type: string | null;
    sender_account_public_id: string | null;
    detected_contact_exchange: boolean;
    moderation_status: string;
    sent_at: string | null;
}

export interface AdminReportPartySummary {
    public_id: string | null;
    display_name: string | null;
    email: string | null;
}

export interface ReportActionRecord {
    id: number;
    action_type: string;
    note: string | null;
    metadata: Record<string, unknown> | null;
    admin: {
        public_id: string | null;
        display_name: string | null;
    } | null;
    created_at: string;
}

export interface AdminReportRecord {
    public_id: string;
    booking_public_id: string | null;
    source_booking_message: AdminReportSourceBookingMessage | null;
    reporter_account: AdminReportPartySummary | null;
    target_account: AdminReportPartySummary | null;
    assigned_admin: {
        public_id: string | null;
        display_name: string | null;
    } | null;
    category: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    detail: string | null;
    status: 'open' | 'resolved';
    resolved_at: string | null;
    actions: ReportActionRecord[];
    created_at: string;
}

export interface AdminBookingAccountSummary {
    public_id: string;
    display_name: string | null;
    email: string | null;
    status?: string | null;
}

export interface AdminBookingTherapistProfileSummary {
    public_id: string;
    public_name: string;
    profile_status?: string | null;
}

export interface AdminBookingTherapistMenuSummary {
    public_id: string;
    name: string;
    duration_minutes?: number | null;
    minimum_duration_minutes?: number | null;
    duration_step_minutes?: number | null;
    base_price_amount?: number | null;
    hourly_rate_amount?: number | null;
}

export interface AdminBookingServiceAddressRecord {
    public_id: string;
    label: string | null;
    place_type: string;
    prefecture: string | null;
    city: string | null;
    postal_code?: string | null;
    address_line?: string | null;
    building?: string | null;
    access_notes?: string | null;
    lat: number | string;
    lng: number | string;
    is_default: boolean;
}

export interface AdminBookingListRecord {
    public_id: string;
    status: string;
    is_on_demand: boolean;
    scheduled_start_at: string | null;
    scheduled_end_at: string | null;
    duration_minutes: number;
    actual_duration_minutes?: number | null;
    cancel_reason_code: string | null;
    interruption_reason_code: string | null;
    interrupted_at: string | null;
    cancel_reason_note: string | null;
    total_amount: number;
    therapist_net_amount: number;
    platform_fee_amount: number;
    matching_fee_amount: number;
    user_account: AdminBookingAccountSummary | null;
    therapist_account: AdminBookingAccountSummary | null;
    therapist_profile: AdminBookingTherapistProfileSummary | null;
    therapist_menu: AdminBookingTherapistMenuSummary | null;
    service_address: AdminBookingServiceAddressRecord | null;
    canceled_by_account: AdminBookingAccountSummary | null;
    current_payment_intent_status: string | null;
    refund_count: number;
    auto_refund_count: number;
    report_count: number;
    interruption_report_count: number;
    consent_count: number;
    health_check_count: number;
    open_dispute_count: number;
    flagged_message_count: number;
    created_at: string;
    updated_at: string;
}

export interface AdminBookingConsentRecord {
    id: number;
    booking_public_id: string | null;
    account: AdminBookingAccountSummary | null;
    consent_type: string;
    legal_document: {
        public_id: string | null;
        document_type: string | null;
        version: string | null;
        title: string | null;
    } | null;
    consented_at: string | null;
    created_at: string;
}

export interface AdminBookingHealthCheckRecord {
    id: number;
    booking_public_id: string | null;
    account: AdminBookingAccountSummary | null;
    role: string;
    drinking_status: string | null;
    has_injury: boolean;
    has_fever: boolean;
    contraindications: string[];
    notes: string | null;
    checked_at: string | null;
    created_at: string;
}

export interface AdminBookingStatusLogRecord {
    to_status: string;
    actor: {
        public_id: string | null;
        display_name: string | null;
    } | null;
    actor_role: string | null;
    reason_code: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
}

export interface AdminBookingDetailRecord extends AdminBookingListRecord {
    requested_start_at: string | null;
    request_expires_at: string | null;
    accepted_at: string | null;
    confirmed_at: string | null;
    moving_at: string | null;
    arrived_at: string | null;
    arrival_confirmation_code?: string | null;
    arrival_confirmation_code_generated_at?: string | null;
    started_at: string | null;
    ended_at: string | null;
    completed_at?: string | null;
    canceled_at: string | null;
    user_snapshot: Record<string, unknown> | null;
    therapist_snapshot: Record<string, unknown> | null;
    current_quote: BookingQuoteRecord | null;
    current_payment_intent: PaymentIntentRecord | null;
    auto_refund_count: number;
    interruption_report_count: number;
    refunds: RefundRequestRecord[];
    reports: ReportRecord[];
    consents: AdminBookingConsentRecord[];
    health_checks: AdminBookingHealthCheckRecord[];
    status_logs: AdminBookingStatusLogRecord[];
}

export interface AdminNoteRecord {
    id: number;
    author: {
        public_id: string | null;
        display_name: string | null;
    } | null;
    note: string;
    created_at: string;
}

export interface AdminBookingMessageSenderSummary {
    public_id: string | null;
    display_name: string | null;
    email: string | null;
    status: string | null;
    suspension_reason: string | null;
    suspended_at: string | null;
}

export interface AdminBookingMessageRecord {
    id: number;
    booking_public_id: string | null;
    sender: AdminBookingMessageSenderSummary | null;
    message_type: string;
    body: string;
    detected_contact_exchange: boolean;
    moderation_status: string;
    moderated_by_admin: {
        public_id: string | null;
        display_name: string | null;
    } | null;
    moderated_at: string | null;
    admin_note_count: number;
    open_report_count: number;
    notes: AdminNoteRecord[];
    sent_at: string | null;
    read_at: string | null;
}

export interface ReportListMeta {
    total_count: number;
    open_count: number;
    resolved_count: number;
    filters: {
        booking_id: string | null;
        target_account_id: string | null;
        status: 'open' | 'resolved' | null;
        category: string | null;
        severity: 'low' | 'medium' | 'high' | 'critical' | null;
        sort: 'created_at' | 'resolved_at';
        direction: 'asc' | 'desc';
    };
}

export interface PublicProfilePhoto {
    sort_order: number;
    url: string;
}

export interface TherapistSearchResult {
    public_id: string;
    public_name: string;
    bio_excerpt: string | null;
    age: number | null;
    height_cm: number | null;
    weight_kg: number | null;
    p_size_cm: number | null;
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
    minimum_duration_minutes: number;
    duration_step_minutes: number;
    base_price_amount: number;
    hourly_rate_amount: number;
    is_active: boolean;
    sort_order: number;
    estimated_total_amount: number | null;
}

export interface PendingScheduledRequestSummary {
    public_id: string;
    status: 'payment_authorizing' | 'requested';
    requested_start_at: string | null;
    scheduled_start_at: string | null;
    request_expires_at: string | null;
}

export interface TherapistDetail {
    public_id: string;
    public_name: string;
    bio: string | null;
    age: number | null;
    height_cm: number | null;
    weight_kg: number | null;
    p_size_cm: number | null;
    training_status: string | null;
    rating_average: number;
    review_count: number;
    therapist_cancellation_count: number;
    is_online: boolean;
    walking_time_range: string | null;
    lowest_estimated_total_amount: number | null;
    pending_scheduled_request: PendingScheduledRequestSummary | null;
    menus: TherapistMenu[];
    photos: PublicProfilePhoto[];
}

export interface TherapistProfileRecord {
    public_id: string;
    public_name: string;
    bio: string | null;
    age: number | null;
    height_cm: number | null;
    weight_kg: number | null;
    p_size_cm: number | null;
    profile_status: string;
    training_status: string | null;
    photo_review_status: string;
    is_online: boolean;
    is_listed: boolean;
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
    payout_method: string | null;
    stripe_account_id: string | null;
    account_type: string | null;
    status: string | null;
    charges_enabled: boolean;
    payouts_enabled: boolean;
    details_submitted: boolean;
    is_payout_ready: boolean;
    requirements_currently_due: string[];
    requirements_past_due: string[];
    disabled_reason: string | null;
    onboarding_completed_at: string | null;
    last_synced_at: string | null;
    bank_account: {
        bank_name: string | null;
        branch_name: string | null;
        account_type: string | null;
        account_number: string | null;
        account_number_masked: string | null;
        account_holder_name: string | null;
    } | null;
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

export interface TherapistBookingSettingRecord {
    booking_request_lead_time_minutes: number;
    has_scheduled_base_location: boolean;
    can_publish_scheduled_bookings: boolean;
    scheduled_base_location: {
        label: string | null;
        lat: number | null;
        lng: number | null;
        accuracy_m: number | null;
    } | null;
}

export interface TherapistAvailabilitySlotRecord {
    public_id: string;
    start_at: string;
    end_at: string;
    status: 'published' | 'hidden' | 'expired';
    dispatch_base_type: 'default' | 'custom';
    dispatch_area_label: string | null;
    custom_dispatch_base: {
        label: string | null;
        lat: number | null;
        lng: number | null;
        accuracy_m: number | null;
    } | null;
    has_blocking_booking: boolean;
    blocking_booking_count: number;
}

export interface TherapistPricingRuleRecord {
    id: number;
    therapist_menu_id: string | null;
    therapist_menu: {
        public_id: string;
        name: string;
    } | null;
    rule_type: string;
    condition: Record<string, unknown>;
    adjustment_type: string;
    adjustment_amount: number;
    min_price_amount: number | null;
    max_price_amount: number | null;
    priority: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface TherapistBookingRequestMenuSummary {
    public_id: string | null;
    name: string | null;
}

export interface TherapistBookingRequestServiceLocation {
    place_type: string | null;
    prefecture: string | null;
    city: string | null;
}

export interface TherapistBookingRequestAmounts {
    total_amount: number;
    therapist_net_amount: number;
    platform_fee_amount: number;
    matching_fee_amount: number;
}

export interface BookingPendingAdjustmentProposal {
    proposed_at: string | null;
    scheduled_start_at: string;
    scheduled_end_at: string;
    duration_minutes: number;
    total_amount: number;
    therapist_net_amount: number;
    platform_fee_amount: number;
    matching_fee_amount: number;
    buffer_before_minutes: number | null;
    buffer_after_minutes: number | null;
}

export interface BookingPendingNoShowReport {
    reported_at: string | null;
    reported_by_role: string | null;
    reason_code: string;
    reason_note: string | null;
}

export interface TherapistBookingRequestRecord {
    public_id: string;
    status: string;
    request_type: 'on_demand' | 'scheduled';
    is_on_demand: boolean;
    availability_slot_id: string | null;
    requested_start_at: string | null;
    scheduled_start_at: string | null;
    scheduled_end_at: string | null;
    duration_minutes: number;
    dispatch_area_label: string | null;
    request_expires_at: string | null;
    request_expires_in_seconds: number | null;
    request_expires_in_minutes: number | null;
    pending_adjustment_proposal: BookingPendingAdjustmentProposal | null;
    menu: TherapistBookingRequestMenuSummary;
    service_location: TherapistBookingRequestServiceLocation | null;
    amounts: TherapistBookingRequestAmounts;
    created_at: string;
}

export interface TherapistTravelRequestSenderSummary {
    public_id: string | null;
    display_name: string | null;
}

export interface TherapistTravelRequestRecord {
    public_id: string;
    prefecture: string;
    message: string | null;
    status: 'unread' | 'read' | 'archived';
    read_at: string | null;
    archived_at: string | null;
    sender: TherapistTravelRequestSenderSummary | null;
    therapist_profile_id: string | null;
    created_at: string;
}

export interface TherapistBalanceRecord {
    pending_amount: number;
    available_amount: number;
    payout_requested_amount: number;
    paid_amount: number;
    held_amount: number;
    requestable_amount: number;
    active_payout_request_count: number;
    next_scheduled_process_date: string | null;
}

export interface TherapistLedgerEntryRecord {
    id: number;
    booking_public_id: string | null;
    payout_request_id: string | null;
    entry_type: string;
    amount_signed: number;
    status: string;
    available_at: string | null;
    description: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
}

export interface TherapistLedgerPayload {
    summary: {
        pending_amount: number;
        available_amount: number;
        payout_requested_amount: number;
        paid_amount: number;
        held_amount: number;
    };
    entries: TherapistLedgerEntryRecord[];
}

export interface PayoutRequestRecord {
    public_id: string;
    status: string;
    requested_amount: number;
    fee_amount: number;
    net_amount: number;
    requested_at: string | null;
    scheduled_process_date: string | null;
    processed_at: string | null;
    stripe_payout_id: string | null;
    failure_reason: string | null;
    created_at: string;
}

export interface PublicTherapistAvailabilityWindow {
    availability_slot_id: string;
    slot_start_at: string;
    slot_end_at: string;
    start_at: string;
    end_at: string;
    booking_deadline_at: string;
    dispatch_area_label: string | null;
    walking_time_range: string | null;
    is_bookable: boolean;
    unavailable_reason: string | null;
}

export interface PublicTherapistAvailabilityDateOption {
    date: string;
    earliest_start_at: string;
    latest_end_at: string;
    window_count: number;
    bookable_window_count: number;
    is_bookable: boolean;
    unavailable_reason: string | null;
}

export interface PublicTherapistAvailabilityCalendarDate {
    date: string;
    earliest_start_at: string | null;
    latest_end_at: string | null;
    walking_time_range: string | null;
    estimated_total_amount_range: {
        min: number;
        max: number;
    } | null;
    window_count: number;
    bookable_window_count: number;
    is_bookable: boolean;
    unavailable_reason: string | null;
    windows: PublicTherapistAvailabilityWindow[];
}

export interface PublicTherapistAvailability {
    date: string;
    walking_time_range: string | null;
    estimated_total_amount_range: {
        min: number;
        max: number;
    } | null;
    pending_scheduled_request: PendingScheduledRequestSummary | null;
    available_dates: PublicTherapistAvailabilityDateOption[];
    calendar_dates: PublicTherapistAvailabilityCalendarDate[];
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
    user_profile?: BookingCounterpartyUserProfile | null;
}

export interface BookingCounterpartyUserProfile {
    profile_status: string | null;
    identity_verified: boolean;
    age_verified: boolean;
    age_range: string | null;
    body_type: string | null;
    height_cm: number | null;
    weight_range: string | null;
    disclose_sensitive_profile_to_therapist: boolean;
    preferences: Record<string, string> | string[] | null;
    touch_ng: string[] | Record<string, string> | null;
    health_notes: string | null;
    sexual_orientation: string | null;
    gender_identity: string | null;
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
    minimum_duration_minutes?: number | null;
    duration_step_minutes?: number | null;
    hourly_rate_amount?: number | null;
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
    actual_duration_minutes?: number | null;
    buffer_before_minutes: number;
    buffer_after_minutes: number;
    request_expires_at: string | null;
    pending_adjustment_proposal?: BookingPendingAdjustmentProposal | null;
    pending_no_show_report?: BookingPendingNoShowReport | null;
    accepted_at: string | null;
    confirmed_at: string | null;
    moving_at: string | null;
    arrived_at: string | null;
    arrival_confirmation_code?: string | null;
    arrival_confirmation_code_generated_at?: string | null;
    started_at: string | null;
    ended_at: string | null;
    service_completion_reported_at?: string | null;
    completed_at?: string | null;
    canceled_at: string | null;
    interrupted_at: string | null;
    cancel_reason_code: string | null;
    interruption_reason_code: string | null;
    cancel_reason_note?: string | null;
    total_amount: number;
    therapist_net_amount: number;
    platform_fee_amount: number;
    matching_fee_amount: number;
    settlement_total_amount?: number | null;
    settlement_therapist_net_amount?: number | null;
    settlement_platform_fee_amount?: number | null;
    settlement_matching_fee_amount?: number | null;
    uncaptured_extension_amount?: number | null;
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

export interface BookingCancellationPreview {
    cancel_fee_amount: number;
    refund_amount: number;
    policy_code: string;
    policy_label: string;
    payment_action: string;
}

export interface RefundRequestRecord {
    public_id: string;
    booking_public_id: string | null;
    requested_by_account_id: string | null;
    reviewed_by_account_id: string | null;
    status: string;
    reason_code: string | null;
    requested_amount: number | null;
    approved_amount: number | null;
    stripe_refund_id: string | null;
    reviewed_at: string | null;
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

export interface AccountBlockAccountSummary {
    public_id: string;
    display_name: string | null;
    status: string | null;
}

export interface AccountBlockRecord {
    id: number;
    blocker_account_id: string | null;
    blocker_account: AccountBlockAccountSummary | null;
    blocked_account_id: string | null;
    blocked_account: AccountBlockAccountSummary | null;
    reason_code: string | null;
    created_at: string;
}

export interface BookingMessageSender {
    public_id: string;
    display_name: string | null;
    status: string | null;
}

export interface BookingMessageRecord {
    id: number;
    booking_public_id: string | null;
    sender_account_id: string | null;
    sender: BookingMessageSender | null;
    sender_role: string | null;
    message_type: string;
    body: string;
    detected_contact_exchange: boolean;
    moderation_status: string;
    is_own: boolean | null;
    is_read: boolean;
    sent_at: string | null;
    read_at: string | null;
}

export interface AppNotificationRecord {
    id: number;
    notification_type: string;
    channel: string;
    title: string;
    body: string;
    data: Record<string, unknown> | null;
    status: string;
    is_read: boolean;
    sent_at: string | null;
    read_at: string | null;
    created_at: string;
}

export interface NotificationListMeta {
    unread_count: number;
    limit: number;
    filters: {
        notification_type: string | null;
        status: string | null;
        read_status: 'read' | 'unread' | null;
    };
}

export interface BookingMessagesMeta {
    booking_public_id: string;
    booking_status: string;
    unread_count: number;
    counterparty_typing: boolean;
    counterparty_typing_updated_at: string | null;
    counterparty: BookingCounterparty | null;
    filters: {
        read_status: 'read' | 'unread' | null;
    };
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

export interface AdminDashboardNavigationTarget {
    path: string;
    query: Record<string, string | number | boolean | null>;
}

export interface AdminDashboardRecord {
    accounts: {
        total: number;
        active: number;
        suspended: number;
    };
    reviews: {
        pending_identity_verifications: number;
        pending_therapist_profiles: number;
        suspended_therapist_profiles: number;
        pending_profile_photos: number;
    };
    operations: {
        open_reports: number;
        open_interruption_reports: number;
        open_message_origin_reports: number;
        pending_contact_inquiries: number;
        unread_travel_requests: number;
        flagged_travel_requests: number;
        pending_travel_request_reviews: number;
        open_stripe_disputes: number;
        requested_refunds: number;
        requested_payouts: number;
    };
    bookings: {
        requested: number;
        interrupted: number;
        in_progress: number;
        completed_today: number;
        needs_message_review: number;
    };
    pricing_rules: {
        total: number;
        active: number;
        inactive: number;
        active_profile_adjustments: number;
        active_demand_fees: number;
        needs_attention: number;
        pending_review: number;
        inactive_menu_rules: number;
        extreme_percentage_adjustments: number;
        menu_price_override_rules: number;
    };
    navigation: {
        accounts: Record<string, AdminDashboardNavigationTarget>;
        reviews: Record<string, AdminDashboardNavigationTarget>;
        operations: Record<string, AdminDashboardNavigationTarget>;
        bookings: Record<string, AdminDashboardNavigationTarget>;
        pricing_rules: Record<string, AdminDashboardNavigationTarget>;
    };
}

export interface AdminAccountRoleRecord {
    role: string;
    status: string;
    granted_at: string | null;
    revoked_at: string | null;
}

export interface AdminAccountIdentitySummary {
    status: string;
    is_age_verified: boolean;
    submitted_at: string | null;
    reviewed_at: string | null;
}

export interface AdminAccountUserProfileSummary {
    profile_status: string | null;
    age_range: string | null;
    body_type: string | null;
    height_cm: number | null;
    weight_range: string | null;
    sexual_orientation: string | null;
    gender_identity: string | null;
    disclose_sensitive_profile_to_therapist: boolean;
}

export interface AdminAccountTherapistProfileSummary {
    public_id: string;
    public_name: string | null;
    profile_status: string | null;
    photo_review_status: string | null;
    is_online: boolean;
}

export interface AdminAccountRecord {
    public_id: string;
    email: string;
    phone_e164: string | null;
    display_name: string | null;
    status: string;
    last_active_role: string | null;
    suspended_at: string | null;
    suspension_reason: string | null;
    travel_request_warning_count: number;
    travel_request_last_warned_at: string | null;
    travel_request_last_warning_reason: string | null;
    travel_request_restricted_until: string | null;
    travel_request_restriction_reason: string | null;
    roles?: AdminAccountRoleRecord[];
    latest_identity_verification?: AdminAccountIdentitySummary | null;
    user_profile?: AdminAccountUserProfileSummary | null;
    therapist_profile?: AdminAccountTherapistProfileSummary | null;
    created_at: string;
    updated_at: string;
}

export interface AdminTherapistMenuRecord {
    public_id: string;
    name: string;
    description: string | null;
    duration_minutes: number;
    minimum_duration_minutes?: number | null;
    duration_step_minutes?: number | null;
    base_price_amount: number;
    hourly_rate_amount?: number | null;
    is_active: boolean;
    sort_order: number;
}

export interface AdminProfilePhotoRecord {
    id: number;
    usage_type: string;
    content_hash: string | null;
    status: string;
    rejection_reason_code: string | null;
    sort_order: number;
    url: string | null;
    account?: {
        public_id: string | null;
        display_name: string | null;
        email: string | null;
    } | null;
    therapist_profile?: {
        public_id: string | null;
        public_name: string | null;
        profile_status: string | null;
        photo_review_status: string | null;
    } | null;
    reviewed_by?: {
        public_id: string | null;
        display_name: string | null;
    } | null;
    reviewed_at: string | null;
    created_at: string;
}

export interface AdminIdentityVerificationRecord {
    id: number;
    provider: string;
    status: string;
    account?: {
        public_id: string | null;
        display_name: string | null;
        email: string | null;
    } | null;
    birth_year: number | null;
    is_age_verified: boolean;
    self_declared_male: boolean;
    document_type: string | null;
    submitted_at: string | null;
    reviewed_by?: {
        public_id: string | null;
        display_name: string | null;
    } | null;
    reviewed_at: string | null;
    rejection_reason_code: string | null;
    purge_after: string | null;
}

export interface AdminTherapistProfileRecord {
    public_id: string;
    public_name: string | null;
    bio: string | null;
    profile_status: string;
    training_status: string | null;
    photo_review_status: string;
    latest_identity_verification_status: string | null;
    stripe_connected_account_status: string | null;
    account?: {
        public_id: string | null;
        display_name: string | null;
        email: string | null;
        status: string | null;
    } | null;
    latest_identity_verification?: IdentityVerificationRecord | null;
    is_online: boolean;
    online_since: string | null;
    last_location_updated_at: string | null;
    has_searchable_location: boolean | null;
    active_menu_count: number | null;
    location?: {
        lat: number | string;
        lng: number | string;
        accuracy_m: number | null;
        source: string | null;
        is_searchable: boolean;
        updated_at: string | null;
    } | null;
    rating_average: number;
    review_count: number;
    approved_at: string | null;
    approved_by?: {
        public_id: string | null;
        display_name: string | null;
    } | null;
    rejected_reason_code: string | null;
    menus: AdminTherapistMenuRecord[];
    photos?: AdminProfilePhotoRecord[];
    stripe_connected_account?: StripeConnectedAccountStatus | null;
    available_actions: {
        approve: boolean;
        reject: boolean;
        suspend: boolean;
        restore: boolean;
    };
    created_at: string;
    updated_at: string;
}

export interface AdminContactInquiryRecord {
    public_id: string;
    account?: {
        public_id: string | null;
        display_name: string | null;
        email: string | null;
    } | null;
    name: string | null;
    email: string | null;
    category: string;
    message: string | null;
    status: string;
    source: string;
    admin_note_count: number;
    resolved_at: string | null;
    notes?: AdminNoteRecord[];
    submitted_at: string;
    updated_at: string;
}

export interface AdminPricingRuleRecord {
    id: number;
    rule_type: string;
    adjustment_bucket: string;
    scope: 'profile' | 'menu';
    condition: Record<string, unknown> | null;
    condition_summary: string | null;
    adjustment_type: string;
    adjustment_amount: number;
    min_price_amount: number | null;
    max_price_amount: number | null;
    priority: number;
    is_active: boolean;
    monitoring_status: string;
    monitoring_flags: string[];
    has_monitoring_flags: boolean;
    monitored_by_admin?: {
        public_id: string | null;
        display_name: string | null;
    } | null;
    monitored_at: string | null;
    admin_note_count?: number;
    notes?: AdminNoteRecord[];
    therapist_profile?: {
        public_id: string | null;
        public_name: string | null;
        profile_status: string | null;
        training_status: string | null;
        account: {
            public_id: string | null;
            display_name: string | null;
            email: string | null;
            status: string | null;
        } | null;
    } | null;
    therapist_menu?: {
        public_id: string | null;
        name: string | null;
        duration_minutes: number | null;
        base_price_amount: number | null;
        is_active: boolean | null;
    } | null;
    created_at: string;
    updated_at: string;
}

export interface AdminRefundRequestRecord extends RefundRequestRecord {}

export interface AdminPayoutRequestRecord extends PayoutRequestRecord {
    therapist_account?: {
        public_id: string | null;
        display_name: string | null;
    } | null;
    stripe_connected_account?: {
        payout_method: string | null;
        stripe_account_id: string | null;
        status: string | null;
        payouts_enabled: boolean | null;
        bank_name: string | null;
        bank_branch_name: string | null;
        bank_account_type: string | null;
        bank_account_number: string | null;
        bank_account_number_masked: string | null;
        bank_account_holder_name: string | null;
    } | null;
    ledger_entries?: TherapistLedgerEntryRecord[];
}

export interface AdminTravelRequestRecord {
    public_id: string;
    prefecture: string;
    message: string | null;
    status: string;
    monitoring_status: string;
    detected_contact_exchange: boolean;
    read_at: string | null;
    archived_at: string | null;
    monitored_by_admin?: {
        public_id: string | null;
        display_name: string | null;
    } | null;
    monitored_at: string | null;
    admin_note_count?: number;
    notes?: AdminNoteRecord[];
    sender?: {
        public_id: string | null;
        display_name: string | null;
        email: string | null;
        status: string | null;
        suspended_at: string | null;
        suspension_reason: string | null;
        travel_request_warning_count: number | null;
        travel_request_last_warned_at: string | null;
        travel_request_last_warning_reason: string | null;
        travel_request_restricted_until: string | null;
        travel_request_restriction_reason: string | null;
    } | null;
    therapist_profile?: {
        public_id: string | null;
        public_name: string | null;
        profile_status: string | null;
        account: {
            public_id: string | null;
            display_name: string | null;
            email: string | null;
            status: string | null;
        } | null;
    } | null;
    created_at: string;
    updated_at: string;
}

export interface AdminStripeDisputeRecord {
    stripe_dispute_id: string;
    booking_public_id: string | null;
    payment_intent?: {
        stripe_payment_intent_id: string;
        status: string | null;
    } | null;
    user_account_id: string | null;
    therapist_account_id: string | null;
    status: string;
    reason: string | null;
    amount: number;
    currency: string;
    evidence_due_by: string | null;
    outcome: string | null;
    last_stripe_event_id: string | null;
    created_at: string;
    updated_at: string;
}

export interface AdminAuditLogRecord {
    id: number;
    actor_account?: {
        public_id: string | null;
        display_name: string | null;
        email: string | null;
    } | null;
    action: string;
    target_type: string;
    target_id: number | null;
    ip_hash: string | null;
    user_agent_hash: string | null;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    created_at: string;
}

export interface AdminLegalDocumentRecord {
    id: number;
    public_id: string;
    document_type: string;
    version: string;
    title: string;
    body: string;
    published_at: string | null;
    effective_at: string | null;
    is_published: boolean;
    acceptances_count?: number;
    created_at: string;
    updated_at: string;
}

export interface AdminPlatformFeeSettingRecord {
    id: number;
    setting_key: string;
    value_json: Record<string, unknown>;
    active_from: string | null;
    active_until: string | null;
    is_active: boolean;
    created_by_account?: {
        public_id: string | null;
        display_name: string | null;
        email: string | null;
    } | null;
    created_at: string;
    updated_at: string;
}
