import { StickyHeroHeader } from './StickyHeroHeader';

interface DiscoveryHeroAction {
    label: string;
    to: string;
    variant?: 'primary' | 'secondary';
}

interface DiscoveryHeroShellProps {
    domain?: string | null;
    title: React.ReactNode;
    description: string;
    topBadge: string;
    bullets: string[];
    primaryAction: DiscoveryHeroAction;
    secondaryAction: DiscoveryHeroAction;
    children: React.ReactNode;
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
        <section className="pb-6">
            <div className="relative rounded-[36px] bg-[linear-gradient(107deg,#17202b_3.49%,#1d2a39_53.96%,#27364a_93.62%)] px-6 py-8 shadow-[0_30px_80px_rgba(23,32,43,0.16)] md:rounded-[48px] md:px-10 md:py-10 xl:px-[60px] xl:py-[60px]">
                <div className="flex flex-col gap-8">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                        <StickyHeroHeader
                            actions={[
                                primaryAction,
                                secondaryAction,
                            ]}
                        />
                    </div>

                    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.95fr)] lg:items-end xl:gap-10">
                        <div className="space-y-6">
                            <div className="inline-flex items-center gap-2 rounded-full border border-[#e8d5b2]/45 bg-white/10 px-5 py-2 text-sm font-bold text-[#e8d5b2]">
                                <span className="inline-flex h-2 w-2 rounded-full bg-[#d2b179]" />
                                {topBadge}
                            </div>

                            <div className="space-y-4">
                                <h1 className="max-w-[12ch] text-[2.4rem] font-semibold leading-[1.4] text-white md:text-[3.25rem]">
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
                <div
                    aria-hidden="true"
                    className="absolute left-1/2 top-full -translate-x-1/2 border-x-[18px] border-t-[18px] border-x-transparent border-t-[#243246] drop-shadow-[0_10px_20px_rgba(23,32,43,0.18)]"
                />
            </div>
        </section>
    );
}
