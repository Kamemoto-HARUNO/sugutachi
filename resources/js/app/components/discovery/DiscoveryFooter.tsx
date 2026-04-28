import { Link } from 'react-router-dom';
import { BrandMark } from '../brand/BrandMark';

interface DiscoveryFooterAction {
    label: string;
    to: string;
}

interface DiscoveryFooterProps {
    domain?: string | null;
    description: string;
    primaryAction: DiscoveryFooterAction;
    secondaryAction: DiscoveryFooterAction;
}

export function DiscoveryFooter({
    domain,
    description,
    primaryAction,
    secondaryAction,
}: DiscoveryFooterProps) {
    return (
        <footer className="mt-24 bg-[#17202b] px-6 py-16 md:px-10 md:py-20">
            <div className="mx-auto flex w-full max-w-[1280px] flex-col items-center gap-8">
                <BrandMark domain={domain} inverse compact />

                <div className="w-full max-w-4xl rounded-[32px] bg-[#fffdf8] p-8 md:p-10">
                    <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-3">
                            <h2 className="text-3xl font-semibold leading-tight text-[#17202b] md:text-5xl">
                                今すぐ会える、
                                <br />
                                近くで探せる。
                            </h2>
                            <p className="max-w-2xl text-sm leading-7 text-[#5b6470] md:text-base md:leading-8">
                                {description}
                            </p>
                        </div>

                        <div className="flex flex-col gap-3 md:min-w-[260px]">
                            <Link
                                to={primaryAction.to}
                                className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-6 py-3 text-sm font-bold text-[#1a2430] transition hover:brightness-105"
                            >
                                {primaryAction.label}
                            </Link>
                            <Link
                                to={secondaryAction.to}
                                className="inline-flex items-center justify-center rounded-full bg-[#f2ebe0] px-6 py-3 text-sm font-bold text-[#1a2430] transition hover:bg-[#ebe0cf]"
                            >
                                {secondaryAction.label}
                            </Link>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-[#e6e1d7]">
                    <Link to="/help" className="transition hover:text-white">
                        ヘルプ
                    </Link>
                    <Link to="/privacy" className="transition hover:text-white">
                        プライバシーポリシー
                    </Link>
                    <Link to="/terms" className="transition hover:text-white">
                        利用規約
                    </Link>
                    <Link to="/commerce" className="transition hover:text-white">
                        特商法に基づく表記
                    </Link>
                </div>
            </div>
        </footer>
    );
}
