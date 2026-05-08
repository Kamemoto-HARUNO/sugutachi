import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { ApiError } from '../../lib/api';
import { fetchSupportTickets, supportTicketRefreshEvent } from '../../lib/supportTickets';

interface SupportCenterButtonProps {
    className?: string;
    compact?: boolean;
    onClick: () => void;
}

function badgeLabel(unreadCount: number): string {
    return unreadCount > 99 ? '99+' : String(unreadCount);
}

export function SupportCenterButton({ className = '', compact = false, onClick }: SupportCenterButtonProps) {
    const { isAuthenticated, token } = useAuth();
    const [unreadCount, setUnreadCount] = useState(0);

    async function loadUnreadCount() {
        if (!isAuthenticated || !token) {
            setUnreadCount(0);
            return;
        }

        try {
            const tickets = await fetchSupportTickets(token, '?read_status=unread');
            setUnreadCount(tickets.reduce((total, ticket) => total + (ticket.unread_count ?? 0), 0));
        } catch (error) {
            if (error instanceof ApiError && [401, 403].includes(error.status)) {
                setUnreadCount(0);
            }
        }
    }

    useEffect(() => {
        void loadUnreadCount();

        const intervalId = window.setInterval(() => {
            void loadUnreadCount();
        }, 30_000);
        const handleRefresh = () => {
            void loadUnreadCount();
        };

        window.addEventListener(supportTicketRefreshEvent, handleRefresh);

        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener(supportTicketRefreshEvent, handleRefresh);
        };
    }, [isAuthenticated, token]);

    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={unreadCount > 0 ? `サポート ${unreadCount}件未読` : 'サポート'}
            className={[
                'relative inline-flex min-h-11 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] text-slate-100 transition hover:bg-white/8',
                compact ? 'h-11 w-11 px-0' : 'gap-2 px-4 py-2 text-sm font-semibold',
                className,
            ].join(' ').trim()}
        >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 4.5a7.5 7.5 0 0 0-7.5 7.5v1.5a3 3 0 0 0 3 3h1v-6h-1A2.5 2.5 0 0 0 5 12" />
                <path d="M12 4.5a7.5 7.5 0 0 1 7.5 7.5v1.5a3 3 0 0 1-3 3h-1v-6h1A2.5 2.5 0 0 1 19 12" />
                <path d="M15.5 18.5h-2.2a2.2 2.2 0 0 1-2.2-2.2" />
            </svg>
            {compact ? null : <span className="whitespace-nowrap">サポート</span>}
            {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#d67c7c] px-1.5 text-[11px] font-bold leading-none text-white shadow-[0_6px_14px_rgba(214,124,124,0.35)]">
                    {badgeLabel(unreadCount)}
                </span>
            ) : null}
        </button>
    );
}
