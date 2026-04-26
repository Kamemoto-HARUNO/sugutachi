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
    const domainClass = inverse ? 'text-[#d2b179]' : 'text-[#6b7280]';
    const logoHeightClass = compact ? 'h-9' : 'h-11';
    const textGapClass = compact ? 'gap-2' : 'gap-3';

    return (
        <Link to="/" className={['inline-flex items-center', textGapClass].join(' ')}>
            <img
                src="/logo-horizontal.png"
                alt="すぐタチ ロゴ"
                className={['block h-auto w-auto shrink-0', logoHeightClass].join(' ')}
            />

            {domain ? (
                <span className={['block font-medium tracking-tight', compact ? 'text-xs' : 'text-sm', domainClass].join(' ')}>
                    {domain}
                </span>
            ) : null}
        </Link>
    );
}
