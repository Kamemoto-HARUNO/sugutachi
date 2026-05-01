import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { getActiveRoles } from '../../lib/account';
import { ApiError } from '../../lib/api';
import {
    bookingMessageSummaryRefreshEvent,
    buildBookingMessagesIndexPath,
    countUnreadBookingInboxMessages,
    fetchBookingInboxThreads,
    getBookingInboxRoles,
} from '../../lib/bookingMessages';

interface BookingMessagesLinkProps {
    className?: string;
    compact?: boolean;
    adaptive?: boolean;
}

function badgeLabel(unreadCount: number): string {
    if (unreadCount > 99) {
        return '99+';
    }

    return String(unreadCount);
}

export function BookingMessagesLink({
    className = '',
    compact = false,
    adaptive = false,
}: BookingMessagesLinkProps) {
    const { account, isAuthenticated, token } = useAuth();
    const [unreadCount, setUnreadCount] = useState(0);
    const inboxRoles = useMemo(
        () => getBookingInboxRoles(getActiveRoles(account)),
        [account],
    );

    async function loadSummary() {
        if (!isAuthenticated || !token || inboxRoles.length === 0) {
            setUnreadCount(0);
            return;
        }

        try {
            const threads = await fetchBookingInboxThreads(token, inboxRoles);

            setUnreadCount(countUnreadBookingInboxMessages(threads));
        } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
                setUnreadCount(0);
            }
        }
    }

    useEffect(() => {
        if (!isAuthenticated || !token || inboxRoles.length === 0) {
            setUnreadCount(0);
            return;
        }

        void loadSummary();

        const intervalId = window.setInterval(() => {
            void loadSummary();
        }, 30_000);
        const handleFocus = () => {
            void loadSummary();
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                void loadSummary();
            }
        };
        const handleSummaryRefresh = () => {
            void loadSummary();
        };

        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener(bookingMessageSummaryRefreshEvent, handleSummaryRefresh);

        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener(bookingMessageSummaryRefreshEvent, handleSummaryRefresh);
        };
    }, [inboxRoles, isAuthenticated, token]);

    return (
        <Link
            to={buildBookingMessagesIndexPath()}
            aria-label={unreadCount > 0 ? `メッセージ ${unreadCount}件未読` : 'メッセージ'}
            className={[
                'relative inline-flex min-h-11 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] text-slate-100 transition hover:bg-white/8',
                adaptive
                    ? 'h-11 w-11 px-0 md:w-auto md:gap-2 md:px-4 md:py-2 md:text-sm md:font-semibold'
                    : compact
                        ? 'h-11 w-11 px-0'
                        : 'gap-2 px-4 py-2 text-sm font-semibold',
                className,
            ].join(' ').trim()}
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
                <path d="M8.5 8.75h7" />
                <path d="M8.5 11.75h4.5" />
            </svg>
            {compact ? null : (
                <span className={adaptive ? 'hidden whitespace-nowrap md:inline' : 'whitespace-nowrap'}>
                    メッセージ
                </span>
            )}
            {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#d67c7c] px-1.5 text-[11px] font-bold leading-none text-white shadow-[0_6px_14px_rgba(214,124,124,0.35)]">
                    {badgeLabel(unreadCount)}
                </span>
            ) : null}
        </Link>
    );
}
