import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';

interface SectionAction {
    label: string;
    to: string;
    description: string;
}

interface SectionHomePageProps {
    title: string;
    description: string;
    eyebrow: string;
    actions: SectionAction[];
}

export function SectionHomePage({ title, description, eyebrow, actions }: SectionHomePageProps) {
    usePageTitle(title);

    return (
        <div className="space-y-6">
            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_16px_34px_rgba(2,6,23,0.14)]">
                <div className="space-y-3">
                    <p className="text-xs font-semibold tracking-wide text-[#d2b179]">{eyebrow}</p>
                    <h2 className="text-2xl font-semibold text-white sm:text-[2rem]">{title}</h2>
                    <p className="max-w-3xl text-sm leading-7 text-slate-300">{description}</p>
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {actions.map((action) => (
                    <Link
                        key={action.to}
                        to={action.to}
                        className="rounded-[24px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_16px_34px_rgba(2,6,23,0.12)] transition hover:-translate-y-0.5 hover:bg-white/[0.07] hover:shadow-[0_22px_42px_rgba(2,6,23,0.18)]"
                    >
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">よく使う操作</p>
                        <h3 className="mt-3 text-xl font-semibold text-white">{action.label}</h3>
                        <p className="mt-3 text-sm leading-7 text-slate-300">{action.description}</p>
                        <p className="mt-5 text-sm font-semibold text-white">開く</p>
                    </Link>
                ))}
            </section>
        </div>
    );
}
