import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';

export function TherapistSettingsPage() {
    usePageTitle('設定');

    return (
        <div className="space-y-8">
            <section className="space-y-4 rounded-[28px] border border-white/10 bg-white/5 p-6 md:p-8">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">SETTINGS</p>
                        <div className="space-y-2">
                            <h1 className="text-3xl font-semibold text-white">セラピスト設定</h1>
                            <p className="max-w-3xl text-sm leading-7 text-slate-300">
                                稼働導線、外部掲載、受取設定まわりの入口をここにまとめます。
                            </p>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#111923] px-5 py-4 text-sm text-slate-200">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">EXTERNAL</p>
                        <p className="mt-2 text-2xl font-semibold text-white">1件</p>
                        <p className="mt-2 text-xs text-slate-400">外部掲載連携の設定導線</p>
                    </div>
                </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                <article className="space-y-5 rounded-[24px] border border-white/10 bg-white/5 p-6">
                    <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                            <p className="text-xs font-semibold tracking-wide text-rose-200">EXTERNAL LISTING</p>
                            <h2 className="text-xl font-semibold text-white">ホットペッパー連携</h2>
                            <p className="text-sm leading-7 text-slate-300">
                                外部掲載や集客導線として扱うための設定入口です。連携情報の整理や今後の接続準備はここから進めます。
                            </p>
                        </div>

                        <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-100">
                            未設定
                        </span>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-4">
                        <p className="text-sm font-semibold text-white">表示する内容</p>
                        <p className="mt-2 text-sm leading-7 text-slate-300">
                            ホットペッパー側に出す導線や掲載情報の扱いを、この連携画面からまとめて管理する想定です。
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Link
                            to="/therapist/settings/hotpepper"
                            className="inline-flex items-center rounded-full bg-rose-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-rose-200"
                        >
                            ホットペッパー連携へ
                        </Link>
                        <Link
                            to="/therapist/profile"
                            className="inline-flex items-center rounded-full border border-white/10 px-5 py-3 text-sm text-slate-200 transition hover:bg-white/5"
                        >
                            プロフィールへ戻る
                        </Link>
                    </div>
                </article>

                <article className="space-y-4 rounded-[24px] border border-white/10 bg-white/5 p-6">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">QUICK LINKS</p>
                        <h2 className="text-xl font-semibold text-white">関連設定</h2>
                    </div>

                    <div className="grid gap-3">
                        <Link
                            to="/therapist/onboarding"
                            className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-4 text-sm text-slate-200 transition hover:bg-[#16212d]"
                        >
                            <p className="font-semibold text-white">準備状況</p>
                            <p className="mt-2 leading-7 text-slate-400">本人確認、写真、空き枠、Stripe の進み具合を確認します。</p>
                        </Link>
                        <Link
                            to="/therapist/availability"
                            className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-4 text-sm text-slate-200 transition hover:bg-[#16212d]"
                        >
                            <p className="font-semibold text-white">空き枠管理</p>
                            <p className="mt-2 leading-7 text-slate-400">予定予約の受付締切、拠点、公開枠を調整します。</p>
                        </Link>
                        <Link
                            to="/therapist/stripe-connect"
                            className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-4 text-sm text-slate-200 transition hover:bg-[#16212d]"
                        >
                            <p className="font-semibold text-white">Stripe Connect</p>
                            <p className="mt-2 leading-7 text-slate-400">売上受取の状態確認と追加提出へ進めます。</p>
                        </Link>
                    </div>
                </article>
            </section>
        </div>
    );
}
