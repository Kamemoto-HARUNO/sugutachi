import { Link } from 'react-router-dom';
import { useNotifications } from '../../hooks/useNotifications';

interface NotificationBellLinkProps {
    className?: string;
    compact?: boolean;
}

function badgeLabel(unreadCount: number): string {
    if (unreadCount > 99) {
        return '99+';
    }

    return String(unreadCount);
}

export function NotificationBellLink({ className = '', compact = false }: NotificationBellLinkProps) {
    const { unreadCount } = useNotifications();

    return (
        <Link
            to="/notifications"
            aria-label={unreadCount > 0 ? `通知 ${unreadCount}件未読` : '通知'}
            className={[
                'relative inline-flex min-h-11 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] text-slate-100 transition hover:bg-white/8',
                compact ? 'h-11 w-11 px-0' : 'gap-2 px-4 py-2 text-sm font-semibold',
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
                <path d="M6.6 8.2a5.4 5.4 0 1 1 10.8 0v3.2c0 .9.3 1.7.8 2.4l1 1.2H5.8l1-1.2c.5-.7.8-1.5.8-2.4z" />
                <path d="M9.8 18.5a2.2 2.2 0 0 0 4.4 0" />
            </svg>
            {compact ? null : <span className="whitespace-nowrap">通知</span>}
            {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#d67c7c] px-1.5 text-[11px] font-bold leading-none text-white shadow-[0_6px_14px_rgba(214,124,124,0.35)]">
                    {badgeLabel(unreadCount)}
                </span>
            ) : null}
        </Link>
    );
}
