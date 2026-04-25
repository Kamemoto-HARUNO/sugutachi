import { useLocation } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';

interface PlaceholderScreenProps {
    title: string;
    description: string;
    apiPath?: string;
}

export function PlaceholderScreen({ title, description, apiPath }: PlaceholderScreenProps) {
    const location = useLocation();

    usePageTitle(title);

    return (
        <div className="space-y-8">
            <section className="space-y-4 border-b border-white/10 pb-8">
                <p className="text-sm font-medium tracking-wide text-rose-200">画面シェル準備済み</p>
                <div className="space-y-3">
                    <h1 className="text-3xl font-semibold text-white">{title}</h1>
                    <p className="max-w-3xl text-sm leading-7 text-slate-300">{description}</p>
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-white/5 p-5">
                    <p className="text-xs uppercase tracking-wide text-slate-400">現在の URL</p>
                    <p className="mt-3 break-all text-sm font-medium text-white">{location.pathname}</p>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/5 p-5">
                    <p className="text-xs uppercase tracking-wide text-slate-400">想定 API</p>
                    <p className="mt-3 break-all text-sm font-medium text-white">{apiPath ?? 'これから接続します。'}</p>
                </div>
            </section>

            <section className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-5">
                <p className="text-sm leading-7 text-amber-100">
                    ルートと認証制御は通してあり、この画面から個別 UI 実装へそのまま進める状態です。
                </p>
            </section>
        </div>
    );
}
