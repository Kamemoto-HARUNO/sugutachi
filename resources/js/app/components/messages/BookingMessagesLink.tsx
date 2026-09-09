import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { apiRequest } from '../../lib/api';
import {
    bookingMessageSummaryRefreshEvent,
    countUnreadBookingInboxMessages,
    fetchBookingInboxThreads,
} from '../../lib/bookingMessages';
import type { MessageRole } from '../../lib/directMessages';

interface BookingMessagesLinkProps {
    className?: string;
    compact?: boolean;
    adaptive?: boolean;
}

export function BookingMessagesLink({
    className = '',
    compact = false,
    adaptive = false,
}: BookingMessagesLinkProps) {
    const { isAuthenticated, token, activeRole, hasRole } = useAuth();
    const selected = activeRole;
    const role: MessageRole | null =
        selected === 'user' || selected === 'therapist' ? selected : null;
    const [summary, setSummary] = useState<{
        role: MessageRole | null;
        count: number;
    }>({ role: null, count: 0 });
    useEffect(() => {
        if (!isAuthenticated || !token || !role) return;
        let active = true;
        let loading = false;
        const update = async () => {
            if (document.hidden || loading) return;
            loading = true;
            try {
                const [bookings, dm] = await Promise.allSettled([
                    fetchBookingInboxThreads(token, [role]),
                    apiRequest<{ data: { unread_count: number } }>(
                        `/${role}/direct-messages/summary`,
                        { token },
                    ),
                ]);
                if (active)
                    setSummary({
                        role,
                        count:
                            (bookings.status === 'fulfilled'
                                ? countUnreadBookingInboxMessages(
                                      bookings.value,
                                  )
                                : 0) +
                            (dm.status === 'fulfilled'
                                ? dm.value.data.unread_count
                                : 0),
                    });
            } finally {
                loading = false;
            }
        };
        void update();
        const timer = setInterval(() => void update(), 30000);
        window.addEventListener(bookingMessageSummaryRefreshEvent, update);
        window.addEventListener('focus', update);
        return () => {
            active = false;
            clearInterval(timer);
            window.removeEventListener(
                bookingMessageSummaryRefreshEvent,
                update,
            );
            window.removeEventListener('focus', update);
        };
    }, [token, role, isAuthenticated]);
    if (!isAuthenticated || (!hasRole('user') && !hasRole('therapist')))
        return null;
    const unread = role && summary.role === role ? summary.count : 0;
    return (
        <Link
            to={role ? `/${role}/messages` : '/messages'}
            aria-label={`${role === 'user' ? '利用者' : role === 'therapist' ? 'タチキャスト' : ''}メッセージ${unread ? ` ${unread}件未読` : ''}`}
            className={`relative inline-flex min-h-11 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] text-slate-100 transition hover:bg-white/8 ${adaptive ? 'h-11 w-11 md:w-auto md:gap-2 md:px-4' : compact ? 'h-11 w-11' : 'gap-2 px-4 py-2 text-sm font-semibold'} ${className}`}
        >
            <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-5 w-5 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15H11l-4.5 4v-4H7.5A2.5 2.5 0 0 1 5 12.5z" />
                <path d="M8.5 8.75h7M8.5 11.75h4.5" />
            </svg>
            {!compact && (
                <span
                    className={
                        adaptive
                            ? 'hidden whitespace-nowrap md:inline'
                            : 'whitespace-nowrap'
                    }
                >
                    メッセージ
                </span>
            )}
            {unread > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#d67c7c] px-1.5 text-[11px] font-bold text-white">
                    {unread > 99 ? '99+' : unread}
                </span>
            )}
        </Link>
    );
}
