interface UnreadBadgeProps {
    count: number;
    className?: string;
}

export function UnreadBadge({ count, className = '' }: UnreadBadgeProps) {
    if (count <= 0) return null;
    return <span aria-label={`未読${count}件`} className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#d67c7c] px-1.5 text-[11px] font-bold leading-none text-white tabular-nums ${className}`}>
        {count > 99 ? '99+' : count}
    </span>;
}
