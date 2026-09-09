import { apiRequest } from "./api";
export type MessageRole = "user" | "therapist";
export interface DmParticipant {
    public_id: string;
    display_name: string;
    avatar_url: string | null;
    profile_url: string | null;
    role: MessageRole;
}
export interface DmThread {
    public_id: string;
    role: MessageRole;
    self: DmParticipant;
    counterparty: DmParticipant;
    relationship_id: string;
    can_send: boolean;
    blocked_by_me: boolean;
    typing: boolean;
    preferences: { muted: boolean; archived: boolean; paused: boolean };
    unread_count: number;
    preview: string | null;
    search_preview?: string | null;
    last_message_at: string | null;
    first_reply_at: string | null;
}
export interface DmMessage {
    public_id: string;
    cursor: number;
    sender_role: MessageRole;
    is_own: boolean;
    message_type: "text" | "image";
    body: string | null;
    is_deleted: boolean;
    image_url: string | null;
    is_read: boolean;
    sent_at: string;
    expires_at: string;
}
export interface DmSettings {
    enabled: boolean;
    consultation_enabled: boolean | null;
    email_enabled: boolean;
    push_enabled: boolean;
}
export interface DmPage {
    data: DmMessage[];
    meta: {
        thread: DmThread;
        has_more: boolean;
        oldest_cursor: number | null;
        latest_cursor: number | null;
    };
}
export interface RelationshipPreview {
    public_id: string;
    blocked_by_me: boolean;
    contact_unavailable: boolean;
    affected_bookings: {
        public_id: string;
        status: string;
        scheduled_start_at: string | null;
        paid_amount_estimate: number;
        requires_review: boolean;
    }[];
}
export const dmChanged = () =>
    window.dispatchEvent(new Event("booking-message-summary:refresh"));
export const dmBase = (role: MessageRole) => `/${role}/direct-messages`;
export const dmError = (error: unknown) =>
    error instanceof Error
        ? error.message
        : "読み込みに失敗しました。もう一度お試しください。";
export function loadRelationship(token: string, role: MessageRole, id: string) {
    return apiRequest<{ data: RelationshipPreview }>(
        `/${role}/relationships/${id}`,
        { token },
    );
}
