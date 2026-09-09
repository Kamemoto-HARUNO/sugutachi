import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DiscoveryFooter } from '../components/discovery/DiscoveryFooter';
import { DiscoveryHeroShell } from '../components/discovery/DiscoveryHeroShell';
import { TherapistDiscoveryGrid } from '../components/discovery/TherapistDiscoveryGrid';
import { useAuth } from '../hooks/useAuth';
import { useSeoMeta } from '../hooks/useSeoMeta';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { getMyPageEntryPath } from '../lib/account';
import { DISCOVERY_HERO_BULLETS, DISCOVERY_TOP_BADGE } from '../lib/discovery';
import type { ApiEnvelope, GayMassageAreaDetailPayload, GayMassageAreaPayload } from '../lib/types';

function canonicalPath(path: string): string {
    return `${window.location.origin}${path}`;
}

function areaIntro(name: string): string {
    return `${name}で公開中のタチキャストを、写真・口コミ・プロフィールから確認できます。正確な拠点情報は公開せず、予約時も安心して比較できる情報に絞って掲載しています。`;
}

function usePublicActions() {
    const { account, activeRole, isAuthenticated } = useAuth();

    return useMemo(() => {
        const primaryAction = isAuthenticated
            ? { label: 'マイページ', to: getMyPageEntryPath(account, activeRole), icon: 'mypage' as const }
            : { label: 'ログイン', to: '/login', icon: 'login' as const };
        const secondaryAction = isAuthenticated
            ? { label: 'エリア一覧', to: '/gay-massage' }
            : { label: '会員登録', to: '/register', variant: 'secondary' as const, icon: 'register' as const };

        return { primaryAction, secondaryAction };
    }, [account, activeRole, isAuthenticated]);
}

export function GayMassageIndexPage() {
    const { primaryAction, secondaryAction } = usePublicActions();
    const [areas, setAreas] = useState<GayMassageAreaPayload['areas']>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useSeoMeta({
        title: 'ゲイマッサージ・男性向け出張マッサージを探す',
        description: '対応エリアからゲイマッサージを探せます。公開中のタチキャストがいる地域だけを掲載し、写真、口コミ、プロフィールを確認できます。',
        canonicalUrl: canonicalPath('/gay-massage'),
    });

    useEffect(() => {
        let isMounted = true;

        void apiRequest<ApiEnvelope<GayMassageAreaPayload>>('/gay-massage-areas')
            .then((payload) => {
                if (isMounted) {
                    setAreas(unwrapData(payload).areas);
                }
            })
            .catch((requestError: unknown) => {
                if (isMounted) {
                    setError(requestError instanceof ApiError ? requestError.message : 'エリア情報の読み込みに失敗しました。');
                }
            })
            .finally(() => {
                if (isMounted) {
                    setIsLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, []);

    return (
        <main className="min-h-screen bg-[#f6f1e7] text-[#17202b]">
            <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-16 px-6 py-10 md:px-10 md:py-14 xl:gap-[60px] xl:px-0">
                <DiscoveryHeroShell
                    title={(
                        <>
                            エリアで探す
                        </>
                    )}
                    description="公開中のタチキャストがいる地域だけを掲載しています。地域ページでは、写真・口コミ・プロフィールを見ながら候補を確認できます。"
                    topBadge={DISCOVERY_TOP_BADGE}
                    bullets={[...DISCOVERY_HERO_BULLETS]}
                    primaryAction={primaryAction}
                    secondaryAction={secondaryAction}
                >
                    <div className="rounded-[32px] bg-[#fffdf8] p-6 text-[#17202b] shadow-[0_18px_42px_rgba(0,0,0,0.14)] md:p-8">
                        <p className="text-xs font-semibold tracking-[0.2em] text-[#9a7a49]">AREA SEARCH</p>
                        <h2 className="mt-4 text-2xl font-semibold leading-tight md:text-3xl">
                            対応エリアからゲイマッサージを探す
                        </h2>
                        <p className="mt-4 text-sm leading-7 text-[#5b6470]">
                            掲載中のエリアから、公開プロフィールや口コミを確認できます。気になる地域を選んで、自分に合うタチキャストを探してください。
                        </p>
                        <div className="mt-6 flex flex-wrap gap-3">
                            <Link to="/first-time" className="rounded-full bg-[#17202b] px-5 py-3 text-sm font-bold text-white">
                                はじめての方へ
                            </Link>
                            <Link to="/register" className="rounded-full bg-[#e7d2ad] px-5 py-3 text-sm font-bold text-[#17202b]">
                                無料登録
                            </Link>
                        </div>
                    </div>
                </DiscoveryHeroShell>

                <section className="space-y-5">
                    <div className="flex items-end justify-between gap-4">
                        <div>
                            <h2 className="text-2xl font-semibold">掲載中のエリア</h2>
                            <p className="mt-2 text-sm text-[#68707a]">タチキャストがいない地域は表示していません。</p>
                        </div>
                        {!isLoading ? <p className="text-sm text-[#68707a]">{areas.length}件</p> : null}
                    </div>

                    {isLoading ? (
                        <div className="rounded-[28px] bg-[#fffcf7] p-6 text-sm text-[#5b6470] shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                            エリアを確認しています…
                        </div>
                    ) : null}

                    {error ? (
                        <div className="rounded-[28px] bg-[#fffcf7] p-6 text-sm text-[#9a4b35] shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                            {error}
                        </div>
                    ) : null}

                    {!isLoading && !error ? (
                        areas.length > 0 ? (
                            <div className="grid gap-4 md:grid-cols-2">
                                {areas.map((area) => (
                                    <Link
                                        key={area.slug}
                                        to={`/gay-massage/${area.slug}`}
                                        className="rounded-[28px] bg-[#fffcf7] p-6 shadow-[0_10px_24px_rgba(23,32,43,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(23,32,43,0.12)]"
                                    >
                                        <p className="text-xs font-semibold tracking-[0.18em] text-[#9a7a49]">{area.slug.toUpperCase()}</p>
                                        <h3 className="mt-3 text-2xl font-semibold">{area.name}のゲイマッサージ</h3>
                                        <p className="mt-3 text-sm leading-7 text-[#5b6470]">
                                            {area.name}で公開中のタチキャストを確認する
                                        </p>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-[28px] bg-[#fffcf7] p-6 text-sm leading-7 text-[#5b6470] shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                                現在、地域別に掲載できるタチキャストを準備しています。
                            </div>
                        )
                    ) : null}
                </section>
            </div>
            <DiscoveryFooter
                domain="sugutachi.com"
                description="地域別の公開ページから、写真・口コミ・プロフィールを見ながら候補を確認できます。掲載地域はタチキャストがいる地域だけに絞っています。"
                primaryAction={{ label: primaryAction.label, to: primaryAction.to }}
                secondaryAction={{ label: 'はじめての方へ', to: '/first-time' }}
            />
        </main>
    );
}

export function GayMassageAreaPage() {
    const { primaryAction, secondaryAction } = usePublicActions();
    const { slug } = useParams();
    const [payload, setPayload] = useState<GayMassageAreaDetailPayload | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const areaName = payload?.area.name ?? '';
    const title = areaName ? `${areaName}のゲイマッサージ・男性向け出張マッサージ` : 'ゲイマッサージ';
    const description = areaName ? areaIntro(areaName) : '地域別に公開中のタチキャストを確認できます。';
    const canonicalUrl = useMemo(() => canonicalPath(`/gay-massage/${slug ?? ''}`), [slug]);

    useSeoMeta({
        title,
        description,
        canonicalUrl,
        noindex: error !== null,
    });

    useEffect(() => {
        let isMounted = true;

        setIsLoading(true);
        setError(null);

        void apiRequest<ApiEnvelope<GayMassageAreaDetailPayload>>(`/gay-massage-areas/${slug ?? ''}`)
            .then((response) => {
                if (isMounted) {
                    setPayload(unwrapData(response));
                }
            })
            .catch((requestError: unknown) => {
                if (isMounted) {
                    setPayload(null);
                    setError(requestError instanceof ApiError && requestError.status === 404
                        ? 'この地域の掲載はまだありません。'
                        : '地域ページの読み込みに失敗しました。');
                }
            })
            .finally(() => {
                if (isMounted) {
                    setIsLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [slug]);

    return (
        <main className="min-h-screen bg-[#f6f1e7] text-[#17202b]">
            <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-16 px-6 py-10 md:px-10 md:py-14 xl:gap-[60px] xl:px-0">
                <DiscoveryHeroShell
                    title={areaName ? (
                        <>
                            {areaName}の
                            <span className="inline-block">ゲイマッサージ</span>
                        </>
                    ) : '地域ページ'}
                    description={description}
                    topBadge={DISCOVERY_TOP_BADGE}
                    bullets={[...DISCOVERY_HERO_BULLETS, '正確な拠点は非公開']}
                    primaryAction={primaryAction}
                    secondaryAction={secondaryAction}
                >
                    <div className="rounded-[32px] bg-[#fffdf8] p-6 text-[#17202b] shadow-[0_18px_42px_rgba(0,0,0,0.14)] md:p-8">
                        <Link to="/gay-massage" className="text-sm font-semibold text-[#8b6a37]">エリア一覧へ戻る</Link>
                        <p className="mt-6 text-xs font-semibold tracking-[0.2em] text-[#9a7a49]">AREA SEARCH</p>
                        <h2 className="mt-4 text-2xl font-semibold leading-tight md:text-3xl">
                            {areaName ? `${areaName}で掲載中のタチキャスト` : '掲載情報を確認中'}
                        </h2>
                        <p className="mt-4 text-sm leading-7 text-[#5b6470]">
                            {areaName ? `${areaName}に紐づく公開プロフィールのみを表示します。` : 'この地域に公開できるプロフィールがあるか確認しています。'}
                        </p>
                    </div>
                </DiscoveryHeroShell>

                {isLoading ? (
                    <div className="rounded-[28px] bg-[#fffcf7] p-6 text-sm text-[#5b6470] shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                        タチキャストを確認しています…
                    </div>
                ) : null}

                {error ? (
                    <div className="rounded-[28px] bg-[#fffcf7] p-8 text-sm leading-7 text-[#5b6470] shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                        {error}
                    </div>
                ) : null}

                {payload && !isLoading && !error ? (
                    <section className="space-y-6">
                        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                            <div>
                                <h2 className="text-2xl font-semibold">{payload.area.name}で掲載中のタチキャスト</h2>
                                <p className="mt-2 text-sm text-[#68707a]">正確な拠点情報は公開せず、プロフィール情報を中心に表示しています。</p>
                            </div>
                            <p className="text-sm text-[#68707a]">{payload.area.therapist_count}名を表示</p>
                        </div>

                        <TherapistDiscoveryGrid
                            therapists={payload.therapists}
                            durationMinutes={60}
                            footerHint="公開プロフィールを見る"
                            buildLink={(therapist) => `/therapists/${therapist.public_id}`}
                            hideTravelTimePlaceholder
                            hideEstimatedPricePlaceholder
                            showOfflineStatus
                        />
                    </section>
                ) : null}
            </div>
            <DiscoveryFooter
                domain="sugutachi.com"
                description={areaName ? `${areaName}で公開中のタチキャストを、写真・口コミ・プロフィールから確認できます。` : '地域別の公開ページから、条件に合う候補を確認できます。'}
                primaryAction={{ label: primaryAction.label, to: primaryAction.to }}
                secondaryAction={{ label: 'エリア一覧', to: '/gay-massage' }}
            />
        </main>
    );
}
