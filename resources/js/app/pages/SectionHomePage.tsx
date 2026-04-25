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
        <div className="space-y-8">
            <section className="space-y-3 border-b border-white/10 pb-8">
                <p className="text-sm font-medium tracking-wide text-rose-200">{eyebrow}</p>
                <h1 className="text-4xl font-semibold text-white">{title}</h1>
                <p className="max-w-3xl text-sm leading-7 text-slate-300">{description}</p>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {actions.map((action) => (
                    <Link key={action.to} to={action.to} className="rounded-lg border border-white/10 bg-white/5 p-6 transition hover:bg-white/10">
                        <h2 className="text-lg font-medium text-white">{action.label}</h2>
                        <p className="mt-3 text-sm leading-7 text-slate-300">{action.description}</p>
                    </Link>
                ))}
            </section>
        </div>
    );
}
