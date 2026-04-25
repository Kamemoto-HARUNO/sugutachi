import { Link } from 'react-router-dom';

interface BrandMarkProps {
    domain?: string | null;
    inverse?: boolean;
    compact?: boolean;
}

export function BrandMark({
    domain = 'sugutachi.com',
    inverse = false,
    compact = false,
}: BrandMarkProps) {
    const titleClass = inverse ? 'text-white' : 'text-[#17202b]';
    const accentClass = inverse ? 'text-[#d2b179]' : 'text-[#9a7a49]';
    const markBackgroundClass = inverse ? 'bg-[#f6f1e7]/10 ring-1 ring-white/10' : 'bg-[#17202b]';
    const iconColorClass = inverse ? 'text-[#f6f1e7]' : 'text-[#f6f1e7]';

    return (
        <Link to="/" className="inline-flex items-center gap-3">
            <span
                className={[
                    'inline-flex shrink-0 items-center justify-center rounded-full',
                    compact ? 'h-9 w-9' : 'h-11 w-11',
                    markBackgroundClass,
                ].join(' ')}
            >
                <svg
                    viewBox="0 0 24 24"
                    className={[compact ? 'h-4 w-4' : 'h-5 w-5', iconColorClass].join(' ')}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                >
                    <path d="M12 21s-6-5.4-6-10.2A6 6 0 0 1 17.8 9" />
                    <path d="M12 6a2.6 2.6 0 1 0 0 5.2A2.6 2.6 0 0 0 12 6Z" />
                    <path d="m18.2 15.2 1.6 1.6 3-3" />
                </svg>
            </span>

            <span className="space-y-0.5">
                <span className={['block font-semibold tracking-tight', compact ? 'text-lg' : 'text-xl', titleClass].join(' ')}>
                    すぐタチ
                </span>
                <span className={['block text-xs', accentClass].join(' ')}>{domain}</span>
            </span>
        </Link>
    );
}
