import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';

export function NotFoundPage() {
    usePageTitle('ページが見つかりません');

    return (
        <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center space-y-6 text-center">
            <p className="text-sm font-medium tracking-wide text-rose-200">404</p>
            <h1 className="text-4xl font-semibold text-white">ページが見つかりませんでした。</h1>
            <p className="text-sm leading-7 text-slate-300">URL は認識していますが、まだ画面が用意されていないか、存在しない可能性があります。</p>
            <div className="flex flex-wrap justify-center gap-3">
                <Link to="/" className="rounded-full bg-rose-300 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-rose-200">
                    ホームへ戻る
                </Link>
                <Link to="/role-select" className="rounded-full border border-white/10 px-5 py-3 text-sm text-slate-200 transition hover:bg-white/5">
                    モード選択
                </Link>
            </div>
        </div>
    );
}
