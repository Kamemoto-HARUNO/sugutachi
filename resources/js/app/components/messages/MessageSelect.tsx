import type { SelectHTMLAttributes } from 'react';

export function MessageSelect({
    className = '',
    ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <span className="relative inline-flex shrink-0">
            <select
                {...props}
                className={`min-h-10 appearance-none rounded-full border border-slate-200 py-2 pl-3 pr-9 text-xs outline-none focus-visible:ring-2 focus-visible:ring-[#b5894d] ${className}`}
            />
            <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            >
                <path
                    d="m6 8 4 4 4-4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        </span>
    );
}
