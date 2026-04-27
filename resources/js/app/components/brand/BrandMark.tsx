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
    const logoWidthClass = compact ? 'w-[108px] sm:w-[116px]' : 'w-[136px] sm:w-[148px]';

    return (
        <Link to="/" className="inline-flex items-center">
            <img
                src="/logo-horizontal.png"
                alt="すぐタチ ロゴ"
                className={['block h-auto shrink-0', logoWidthClass].join(' ')}
            />
        </Link>
    );
}
