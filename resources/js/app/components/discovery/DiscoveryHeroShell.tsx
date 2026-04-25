import { Link } from 'react-router-dom';
import { BrandMark } from '../brand/BrandMark';

interface DiscoveryHeroAction {
    label: string;
    to: string;
    variant?: 'primary' | 'secondary';
}

interface DiscoveryHeroShellProps {
    domain?: string | null;
    title: string;
    description: string;
    topBadge: string;
    bullets: string[];
    primaryAction: DiscoveryHeroAction;
    secondaryAction: DiscoveryHeroAction;
    children: React.ReactNode;
}

function actionClass(variant: 'primary' | 'secondary'): string {
    if (variant === 'secondary') {
        return 'bg-[#f2ebe0] text-[#1a2430] hover:bg-[#ebe0cf]';
    }

    return 'bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] text-[#1a2430] hover:brightness-105';
}

export function DiscoveryHeroShell({
    domain,
    title,
    description,
    topBadge,
    bullets,
    primaryAction,
    secondaryAction,
    children,
}: DiscoveryHeroShellProps) {
    return (
        <section className="space-y-4">
            <div className="rounded-[36px] bg-[linear-gradient(107deg,#17202b_3.49%,#1d2a39_53.96%,#27364a_93.62%)] px-6 py-8 shadow-[0_30px_80px_rgba(23,32,43,0.16)] md:rounded-[48px] md:px-10 md:py-10 xl:px-[60px] xl:py-[60px]">
                <div className="flex flex-col gap-8">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
                            <BrandMark domain={domain} inverse />
                            <nav className="flex flex-wrap items-center gap-5 text-sm text-[#e6e1d7]">
                                <Link to="/#how-it-works" className="transition hover:text-white">
                                    使い方
                                </Link>
                                <Link to="/#safety" className="transition hover:text-white">
                                    安心への取り組み
                                </Link>
                            </nav>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row">
                            <Link
                                to={primaryAction.to}
                                className={['inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-bold transition', actionClass(primaryAction.variant ?? 'primary')].join(' ')}
                            >
                                {primaryAction.label}
                            </Link>
                            <Link
                                to={secondaryAction.to}
                                className={['inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-bold transition', actionClass(secondaryAction.variant ?? 'secondary')].join(' ')}
                            >
                                {secondaryAction.label}
                            </Link>
                        </div>
                    </div>

                    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.95fr)] lg:items-end xl:gap-10">
                        <div className="space-y-6">
                            <div className="inline-flex items-center gap-2 rounded-full border border-[#e8d5b2]/45 bg-white/10 px-5 py-2 text-sm font-bold text-[#e8d5b2]">
                                <span className="inline-flex h-2 w-2 rounded-full bg-[#d2b179]" />
                                {topBadge}
                            </div>

                            <div className="space-y-4">
                                <h1 className="max-w-[12ch] text-[2.4rem] font-semibold leading-[1.18] text-white md:text-[3.25rem]">
                                    {title}
                                </h1>
                                <p className="max-w-2xl text-sm leading-7 text-[#d8d3ca] md:text-base md:leading-8">
                                    {description}
                                </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {bullets.map((bullet) => (
                                    <span
                                        key={bullet}
                                        className="inline-flex items-center gap-2 rounded-full bg-white/6 px-4 py-2 text-xs text-[#f4efe5] md:text-[13px]"
                                    >
                                        <span className="h-1.5 w-1.5 rounded-full bg-[#d2b179]" />
                                        {bullet}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {children}
                    </div>
                </div>
            </div>

            <div className="flex justify-center">
                <div className="h-6 w-6 rotate-45 rounded-[6px] bg-[#17202b]" />
            </div>
        </section>
    );
}
