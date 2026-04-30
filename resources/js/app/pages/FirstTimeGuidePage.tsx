import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import type { ApiEnvelope, ServiceMeta } from '../lib/types';

interface GuideAction {
    label: string;
    to: string;
}

function formatYen(amount: number): string {
    return `${new Intl.NumberFormat('ja-JP').format(amount)}円`;
}

export function FirstTimeGuidePage() {
    const { hasRole, isAuthenticated } = useAuth();
    const [serviceMeta, setServiceMeta] = useState<ServiceMeta | null>(null);
    const [error, setError] = useState<string | null>(null);

    usePageTitle('はじめての方へ');
    useToastOnMessage(error, 'error');

    useEffect(() => {
        let isMounted = true;

        void apiRequest<ApiEnvelope<ServiceMeta>>('/service-meta')
            .then((payload) => {
                if (isMounted) {
                    setServiceMeta(unwrapData(payload));
                }
            })
            .catch((requestError: unknown) => {
                if (!isMounted) {
                    return;
                }

                const message = requestError instanceof ApiError ? requestError.message : 'ご案内情報の取得に失敗しました。';
                setError(message);
            });

        return () => {
            isMounted = false;
        };
    }, []);

    const minimumAge = serviceMeta?.booking.minimum_age ?? 18;
    const matchingFeeAmount = serviceMeta?.fees.matching_fee_amount ?? 300;
    const supportEmail = serviceMeta?.support_email ?? null;

    const primaryAction = useMemo<GuideAction>(() => {
        if (hasRole('user')) {
            return {
                label: 'タチキャストを探す',
                to: '/user/therapists',
            };
        }

        if (isAuthenticated) {
            return {
                label: '利用者モードを追加',
                to: '/role-select?add_role=user&return_to=%2Fuser%2Ftherapists',
            };
        }

        return {
            label: '無料登録してはじめる',
            to: '/register',
        };
    }, [hasRole, isAuthenticated]);

    const therapistAction = useMemo<GuideAction>(() => {
        if (hasRole('therapist')) {
            return {
                label: '公開準備を進める',
                to: '/therapist/onboarding',
            };
        }

        if (isAuthenticated) {
            return {
                label: 'タチキャストモードを追加',
                to: '/role-select?add_role=therapist&return_to=%2Ftherapist%2Fonboarding',
            };
        }

        return {
            label: 'タチキャスト登録はこちら',
            to: '/register?return_to=%2Ftherapist%2Fonboarding',
        };
    }, [hasRole, isAuthenticated]);

    const bookingWays = [
        {
            title: '今すぐ依頼する',
            description: '近くで対応できるタチキャストに、その場で予約リクエストを送れます。急に時間が空いたときにも使いやすい導線です。',
        },
        {
            title: '日時を決めて予約する',
            description: '公開されている空き時間から、希望の開始時刻を選んで依頼できます。予定を先に決めておきたい方に向いています。',
        },
        {
            title: '出張リクエストを送る',
            description: '今は予約できない相手にも、「このエリアで会いたい」という希望を届けられます。予約確定ではなく需要を伝えるための機能です。',
        },
    ] as const;

    const previewItems = [
        '写真',
        '自己紹介',
        '提供メニュー',
        '公開レビュー',
        'タチキャスト都合キャンセル回数',
        '公開エリア名',
        '料金の目安',
    ] as const;

    const usageSteps = [
        {
            title: '公開プロフィールを見る',
            description: '写真、自己紹介、メニュー、レビューを見ながら、自分に合いそうな相手を探します。',
        },
        {
            title: '登録して本人確認をする',
            description: '予約機能を使うには、会員登録と本人確認・年齢確認が必要です。',
        },
        {
            title: '場所・日時・メニューを選ぶ',
            description: '施術場所、希望時間、受けたい内容を選んで予約条件を決めます。',
        },
        {
            title: '総額を確認して予約リクエスト',
            description: '料金、手数料、必要に応じた交通費やキャンセル規定を確認して、カードで予約リクエストを送ります。',
        },
        {
            title: '承諾されると予約確定',
            description: 'タチキャストが内容を確認し、承諾すると予約が確定します。条件が合わない場合は拒否や時間調整になることもあります。',
        },
        {
            title: '当日の進行をアプリで確認',
            description: '移動開始、到着、施術開始、施術終了まで、予約の進行状況をアプリ内で確認できます。',
        },
        {
            title: '終了後にレビュー',
            description: '終了後は、マナーや安心感などについてレビューを残せます。',
        },
    ] as const;

    const safetyCards = [
        {
            title: '本人確認・年齢確認',
            body: '予約や主要機能の利用には、本人確認と年齢確認が必要です。',
        },
        {
            title: '掲載前の確認',
            body: '公開されるタチキャストは、本人確認や公開条件を満たした方に限られます。',
        },
        {
            title: '位置情報は守られます',
            body: '正確な住所や待機場所は公開されません。予約前は移動時間の目安だけを表示します。',
        },
        {
            title: 'アプリ外の直接取引は禁止',
            body: '現金払い、直接振込、外部連絡先の交換によるやり取りは禁止しています。',
        },
        {
            title: '通報・ブロックに対応',
            body: '困ったときは、通報、ブロック、中断、返金申請などの導線を用意しています。',
        },
        {
            title: '緊急時の案内',
            body: '身の危険や体調急変がある場合は、アプリ内通報よりも警察・救急への連絡を優先してください。',
        },
    ] as const;

    const faqItems = [
        '利用条件はありますか？',
        '予約はどのように進みますか？',
        '支払い方法は何ですか？',
        '禁止されている行為はありますか？',
        '困ったときはどこから相談できますか？',
    ] as const;

    return (
        <div className="space-y-8">
            <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(210,177,121,0.18),_transparent_36%),linear-gradient(135deg,#101826_0%,#182433_52%,#223047_100%)] p-6 shadow-[0_24px_70px_rgba(2,6,23,0.18)] md:rounded-[40px] md:p-8 lg:p-10">
                <div
                    aria-hidden="true"
                    className="absolute right-0 top-0 h-48 w-48 translate-x-12 -translate-y-10 rounded-full bg-[#d2b179]/10 blur-3xl"
                />
                <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_360px] lg:items-start">
                    <div className="space-y-6">
                        <div className="space-y-4">
                            <span className="inline-flex items-center rounded-full border border-[#e8d5b2]/30 bg-white/8 px-4 py-2 text-xs font-semibold tracking-[0.2em] text-[#e8d5b2]">
                                FIRST GUIDE
                            </span>
                            <div className="space-y-4">
                                <p className="text-sm font-semibold tracking-wide text-rose-100">はじめての方へ</p>
                                <h1 className="max-w-4xl text-4xl font-semibold leading-tight text-white md:text-5xl">
                                    近くで探せて、
                                    <br className="hidden sm:block" />
                                    落ち着いて予約できる。
                                </h1>
                                <p className="max-w-3xl text-sm leading-7 text-slate-300 md:text-base md:leading-8">
                                    すぐタチは、リラクゼーション、ボディケア、もみほぐしを受けたい方と、
                                    対応できるタチキャストをつなぐ予約サービスです。
                                    「今すぐ会いたい」と「日時を決めて予約したい」の両方に対応しています。
                                </p>
                            </div>
                        </div>

                        <div className="rounded-[24px] border border-rose-200/15 bg-[rgba(15,23,42,0.55)] p-5">
                            <p className="text-sm font-semibold text-rose-100">ご利用前の大切なお知らせ</p>
                            <p className="mt-2 text-sm leading-7 text-slate-300">
                                性的サービスや医療・治療を目的としたサービスではありません。
                                リラクゼーション目的の予約サービスとしてご利用ください。
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {[
                                `${minimumAge}歳以上確認`,
                                '本人確認あり',
                                '位置情報は概算表示',
                                '直接取引禁止',
                            ].map((item) => (
                                <span
                                    key={item}
                                    className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-4 py-2 text-xs font-medium text-slate-100"
                                >
                                    {item}
                                </span>
                            ))}
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <Link
                                to={primaryAction.to}
                                className="inline-flex items-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-bold text-[#1a2430] transition hover:brightness-105"
                            >
                                {primaryAction.label}
                            </Link>
                            <Link
                                to="/"
                                className="inline-flex items-center rounded-full border border-white/10 px-5 py-3 text-sm font-medium text-slate-100 transition hover:bg-white/8"
                            >
                                公開プロフィールを見る
                            </Link>
                        </div>

                        <div className="flex flex-wrap gap-2 text-sm text-slate-300">
                            <a href="#can-do" className="rounded-full border border-white/10 px-4 py-2 transition hover:bg-white/8">
                                できること
                            </a>
                            <a href="#flow" className="rounded-full border border-white/10 px-4 py-2 transition hover:bg-white/8">
                                利用の流れ
                            </a>
                            <a href="#safety" className="rounded-full border border-white/10 px-4 py-2 transition hover:bg-white/8">
                                安心の仕組み
                            </a>
                            <a href="#pricing" className="rounded-full border border-white/10 px-4 py-2 transition hover:bg-white/8">
                                料金と支払い
                            </a>
                        </div>
                    </div>

                    <aside className="rounded-[30px] bg-[#fff9f0] p-6 text-[#17202b] shadow-[0_18px_44px_rgba(15,23,42,0.22)]">
                        <p className="text-xs font-semibold tracking-[0.2em] text-[#9a7a49]">3 WAYS TO START</p>
                        <h2 className="mt-3 text-2xl font-semibold leading-tight">
                            自分のタイミングに合わせて、
                            予約の入り口を選べます。
                        </h2>
                        <div className="mt-6 space-y-4">
                            {bookingWays.map((way, index) => (
                                <article key={way.title} className="rounded-[22px] bg-[#f3eadb] p-4">
                                    <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">0{index + 1}</p>
                                    <h3 className="mt-2 text-lg font-semibold">{way.title}</h3>
                                    <p className="mt-2 text-sm leading-7 text-[#4a5563]">{way.description}</p>
                                </article>
                            ))}
                        </div>
                    </aside>
                </div>
            </section>

            <section
                id="can-do"
                className="rounded-[30px] border border-white/10 bg-white/5 p-6 shadow-[0_16px_34px_rgba(2,6,23,0.14)] md:p-8"
            >
                <div className="space-y-2">
                    <p className="text-xs font-semibold tracking-[0.2em] text-rose-100">WHAT YOU CAN DO</p>
                    <h2 className="text-3xl font-semibold text-white">すぐタチでできること</h2>
                    <p className="max-w-3xl text-sm leading-7 text-slate-300">
                        その場で呼びたいときも、予定を決めておきたいときも、予約できない時間帯の希望を伝えたいときも、
                        使い分けやすい3つの入口を用意しています。
                    </p>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-3">
                    {bookingWays.map((way, index) => (
                        <article
                            key={way.title}
                            className="rounded-[24px] border border-white/10 bg-[#111923] p-6 transition hover:-translate-y-0.5 hover:bg-[#152030]"
                        >
                            <p className="text-xs font-semibold tracking-[0.2em] text-[#d2b179]">0{index + 1}</p>
                            <h3 className="mt-3 text-2xl font-semibold text-white">{way.title}</h3>
                            <p className="mt-4 text-sm leading-7 text-slate-300">{way.description}</p>
                        </article>
                    ))}
                </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                <article className="rounded-[30px] border border-white/10 bg-white/5 p-6 shadow-[0_16px_34px_rgba(2,6,23,0.14)] md:p-8">
                    <p className="text-xs font-semibold tracking-[0.2em] text-rose-100">BEFORE YOU BOOK</p>
                    <h2 className="mt-2 text-3xl font-semibold text-white">予約前に確認できること</h2>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                        予約前でも、相手の雰囲気や提供内容をできるだけ確認できるようにしています。
                        条件を見比べてから、ログイン後に見積もりや予約へ進めます。
                    </p>

                    <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {previewItems.map((item) => (
                            <div
                                key={item}
                                className="rounded-[20px] border border-white/10 bg-[#111923] px-4 py-4 text-sm font-medium text-slate-100"
                            >
                                {item}
                            </div>
                        ))}
                    </div>
                </article>

                <aside className="rounded-[30px] bg-[#fff9f0] p-6 text-[#17202b] shadow-[0_16px_34px_rgba(2,6,23,0.14)]">
                    <p className="text-xs font-semibold tracking-[0.2em] text-[#9a7a49]">SAFETY NOTE</p>
                    <h3 className="mt-3 text-2xl font-semibold">位置情報は必要なぶんだけ。</h3>
                    <p className="mt-3 text-sm leading-7 text-[#4a5563]">
                        正確な現在地や住所は、予約前には表示されません。
                        位置情報は安全面を考慮して、移動時間の目安レンジで案内します。
                    </p>
                    <div className="mt-5 rounded-[22px] bg-[#f3eadb] p-4">
                        <p className="text-sm font-semibold">ログイン後に使える機能</p>
                        <p className="mt-2 text-sm leading-7 text-[#4a5563]">
                            空き時間の確認、見積もり、予約リクエスト、出張リクエスト送信はログイン後に利用できます。
                        </p>
                    </div>
                </aside>
            </section>

            <section
                id="flow"
                className="rounded-[30px] border border-white/10 bg-white/5 p-6 shadow-[0_16px_34px_rgba(2,6,23,0.14)] md:p-8"
            >
                <div className="space-y-2">
                    <p className="text-xs font-semibold tracking-[0.2em] text-rose-100">HOW IT WORKS</p>
                    <h2 className="text-3xl font-semibold text-white">はじめての利用の流れ</h2>
                    <p className="max-w-3xl text-sm leading-7 text-slate-300">
                        はじめての予約は、公開プロフィールの確認からレビュー投稿までこの流れで進みます。
                    </p>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                    {usageSteps.map((step, index) => (
                        <article
                            key={step.title}
                            className="flex gap-4 rounded-[24px] border border-white/10 bg-[#101826] p-5"
                        >
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#d2b179] text-sm font-bold text-[#17202b]">
                                {index + 1}
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-white">{step.title}</h3>
                                <p className="mt-2 text-sm leading-7 text-slate-300">{step.description}</p>
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            <section
                id="safety"
                className="rounded-[30px] border border-white/10 bg-white/5 p-6 shadow-[0_16px_34px_rgba(2,6,23,0.14)] md:p-8"
            >
                <div className="space-y-2">
                    <p className="text-xs font-semibold tracking-[0.2em] text-rose-100">SAFETY</p>
                    <h2 className="text-3xl font-semibold text-white">安心して利用するための仕組み</h2>
                    <p className="max-w-3xl text-sm leading-7 text-slate-300">
                        予約を取りやすくするだけでなく、トラブルを防ぎやすい導線もあわせて設計しています。
                    </p>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {safetyCards.map((card) => (
                        <article
                            key={card.title}
                            className="rounded-[24px] border border-white/10 bg-[#111923] p-5"
                        >
                            <h3 className="text-lg font-semibold text-white">{card.title}</h3>
                            <p className="mt-3 text-sm leading-7 text-slate-300">{card.body}</p>
                        </article>
                    ))}
                </div>
            </section>

            <section id="pricing" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
                <article className="rounded-[30px] border border-white/10 bg-white/5 p-6 shadow-[0_16px_34px_rgba(2,6,23,0.14)] md:p-8">
                    <p className="text-xs font-semibold tracking-[0.2em] text-rose-100">PRICING</p>
                    <h2 className="mt-2 text-3xl font-semibold text-white">料金と支払いについて</h2>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                        予約前に、支払い総額を確認できます。内容に納得した場合のみ、次のステップへ進めます。
                    </p>

                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                        <div className="rounded-[24px] bg-[#fff9f0] p-5 text-[#17202b]">
                            <p className="text-xs font-semibold tracking-[0.2em] text-[#9a7a49]">PRICE BREAKDOWN</p>
                            <ul className="mt-4 space-y-3 text-sm leading-7">
                                <li>施術料</li>
                                <li>マッチング手数料 {formatYen(matchingFeeAmount)}</li>
                                <li>必要に応じた交通費</li>
                                <li>必要に応じた深夜料金</li>
                            </ul>
                        </div>

                        <div className="rounded-[24px] border border-white/10 bg-[#111923] p-5">
                            <p className="text-xs font-semibold tracking-[0.2em] text-[#d2b179]">PAYMENT RULES</p>
                            <p className="mt-4 text-sm leading-7 text-slate-300">
                                支払い方法はクレジットカード決済のみです。
                                予約リクエスト時にカードの与信を確保し、施術完了時または規定のキャンセル時に金額が確定します。
                            </p>
                            <p className="mt-4 text-sm leading-7 text-slate-300">
                                現金払い、直接振込、アプリ外決済には対応していません。
                            </p>
                        </div>
                    </div>
                </article>

                <aside className="rounded-[30px] bg-[#fff9f0] p-6 text-[#17202b] shadow-[0_16px_34px_rgba(2,6,23,0.14)]">
                    <p className="text-xs font-semibold tracking-[0.2em] text-[#9a7a49]">CANCEL / SUPPORT</p>
                    <h3 className="mt-3 text-2xl font-semibold">困ったときの導線もまとめてあります。</h3>
                    <div className="mt-5 space-y-3 text-sm leading-7 text-[#4a5563]">
                        <p>承諾前のキャンセルは無料です。</p>
                        <p>直前キャンセルや無断キャンセルは、規定の料金対象になる場合があります。</p>
                        <p>タチキャスト都合のキャンセルは全額返金です。</p>
                        <p>困ったときは、通報、返金申請、お問い合わせから対応できます。</p>
                    </div>
                </aside>
            </section>

            <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                <article className="rounded-[30px] border border-white/10 bg-white/5 p-6 shadow-[0_16px_34px_rgba(2,6,23,0.14)] md:p-8">
                    <p className="text-xs font-semibold tracking-[0.2em] text-rose-100">FAQ</p>
                    <h2 className="mt-2 text-3xl font-semibold text-white">よくある質問</h2>
                    <div className="mt-6 grid gap-3">
                        {faqItems.map((item) => (
                            <div key={item} className="rounded-[20px] border border-white/10 bg-[#111923] px-4 py-4 text-sm text-slate-100">
                                {item}
                            </div>
                        ))}
                    </div>
                    <div className="mt-6 flex flex-wrap gap-3">
                        <Link
                            to="/help"
                            className="inline-flex items-center rounded-full bg-rose-300 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-rose-200"
                        >
                            FAQをもっと見る
                        </Link>
                        <Link
                            to="/contact"
                            className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                        >
                            お問い合わせする
                        </Link>
                    </div>
                </article>

                <aside className="rounded-[30px] bg-[#111923] p-6 shadow-[0_16px_34px_rgba(2,6,23,0.14)]">
                    <p className="text-xs font-semibold tracking-[0.2em] text-[#d2b179]">SUPPORT</p>
                    <h3 className="mt-3 text-2xl font-semibold text-white">迷ったら、サポートへ。</h3>
                    <p className="mt-3 text-sm leading-7 text-slate-300">
                        予約前の不安、アカウントの困りごと、安全面の相談まで、お問い合わせフォームから受け付けています。
                    </p>
                    {supportEmail ? (
                        <p className="mt-4 text-sm text-slate-300">
                            連絡先:
                            {' '}
                            <a
                                href={`mailto:${supportEmail}`}
                                className="font-semibold text-white underline decoration-white/30 underline-offset-4"
                            >
                                {supportEmail}
                            </a>
                        </p>
                    ) : null}
                </aside>
            </section>

            <section className="rounded-[32px] bg-[#fff9f0] p-6 text-[#17202b] shadow-[0_18px_40px_rgba(2,6,23,0.16)] md:p-8">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="max-w-3xl space-y-3">
                        <p className="text-xs font-semibold tracking-[0.2em] text-[#9a7a49]">FOR THERAPISTS</p>
                        <h2 className="text-3xl font-semibold">タチキャストとして参加したい方へ</h2>
                        <p className="text-sm leading-7 text-[#4a5563]">
                            提供側として利用したい方は、本人確認、受取口座設定、プロフィール登録、審査完了後に稼働を始められます。
                            働き方や準備の流れは、提供者向けの導線から順番に進められます。
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                        <Link
                            to={therapistAction.to}
                            className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-bold text-[#1a2430] transition hover:brightness-105"
                        >
                            {therapistAction.label}
                        </Link>
                        <Link
                            to="/contact"
                            className="inline-flex items-center justify-center rounded-full border border-[#d2b179]/40 px-5 py-3 text-sm font-medium text-[#17202b] transition hover:bg-[#f3eadb]"
                        >
                            まずは相談する
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
