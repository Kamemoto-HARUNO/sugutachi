import type { ApiEnvelope, SupportTicketRecord } from './types';
import { apiRequest, unwrapData } from './api';

export const supportTicketRefreshEvent = 'support-ticket-summary:refresh';

export const supportCategories = [
    { value: 'service', label: 'サービス全般' },
    { value: 'account', label: 'アカウント' },
    { value: 'booking', label: '予約' },
    { value: 'payment', label: '決済' },
    { value: 'safety', label: '安全' },
    { value: 'other', label: 'その他' },
] as const;

export function formatSupportCategory(value: string | null | undefined): string {
    return supportCategories.find((category) => category.value === value)?.label ?? 'その他';
}

export function notifySupportTicketsChanged() {
    window.dispatchEvent(new CustomEvent(supportTicketRefreshEvent));
}

export async function fetchSupportTickets(token: string, query = ''): Promise<SupportTicketRecord[]> {
    const payload = await apiRequest<ApiEnvelope<SupportTicketRecord[]>>(`/support/tickets${query}`, { token });

    return unwrapData(payload);
}
