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
    const accentClass = inverse ? 'text-[#d2b179]' : 'text-[#6b7280]';
    const shellClass = inverse
        ? 'bg-white/96 shadow-[0_18px_40px_rgba(15,23,42,0.2)] ring-1 ring-white/10'
        : 'bg-white shadow-[0_18px_40px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/6';
    const logoHeightClass = compact ? 'h-9' : 'h-11';
    const textGapClass = compact ? 'gap-2' : 'gap-3';

    return (
        <Link to="/" className={['inline-flex items-center', textGapClass].join(' ')}>
            <span className={['inline-flex shrink-0 items-center rounded-[18px] px-3 py-2', shellClass].join(' ')}>
                <img
                    src="/logo-horizontal.png"
                    alt="すぐタチ"
                    className={['block w-auto', logoHeightClass].join(' ')}
                />
            </span>

            <span className="space-y-0.5">
                <span className={['block font-semibold tracking-tight', compact ? 'text-base' : 'text-lg', titleClass].join(' ')}>
                    すぐタチ
                </span>
                <span className={['block text-xs', accentClass].join(' ')}>{domain}</span>
            </span>
        </Link>
    );
}
