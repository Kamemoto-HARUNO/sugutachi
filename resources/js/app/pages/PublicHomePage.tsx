import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DiscoveryFooter } from '../components/discovery/DiscoveryFooter';
import { DiscoveryHeroShell } from '../components/discovery/DiscoveryHeroShell';
import { TherapistDiscoveryCard } from '../components/discovery/TherapistDiscoveryCard';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { getRoleHomePath } from '../lib/account';
import type { ApiEnvelope, ServiceMeta, TherapistSearchResult } from '../lib/types';

export function PublicHomePage() {
    const { account, activeRole, hasRole, isAuthenticated, token } = useAuth();
    const [serviceMeta, setServiceMeta] = useState<ServiceMeta | null>(null);
    const [previewTherapists, setPreviewTherapists] = useState<TherapistSearchResult[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [bookingType, setBookingType] = useState<'now' | 'scheduled'>('now');

    usePageTitle('ホーム');

    useEffect(() => {
        let isMounted = true;

        void Promise.all([
            apiRequest<ApiEnvelope<ServiceMeta>>('/service-meta'),
            apiRequest<ApiEnvelope<TherapistSearchResult[]>>('/public-therapists?limit=4', { token }),
        ])
            .then(([metaPayload, therapistPayload]) => {
                if (!isMounted) {
                    return;
                }

                setServiceMeta(unwrapData(metaPayload));
                setPreviewTherapists(unwrapData(therapistPayload));
            })
            .catch((requestError: unknown) => {
                if (!isMounted) {
                    return;
                }

                const message =
                    requestError instanceof ApiError ? requestError.message : '公開トップの読み込みに失敗しました。';

                setError(message);
            });

        return () => {
            isMounted = false;
        };
    }, [token]);

    const primaryAction = useMemo(() => {
        if (isAuthenticated && hasRole('user')) {
            return {
                label: 'セラピストを検索',
                to: '/user/therapists',
            };
        }

        if (isAuthenticated && activeRole) {
            return {
                label: 'マイページへ戻る',
                to: getRoleHomePath(activeRole),
            };
        }

        return {
            label: 'ログイン・無料登録',
            to: '/register',
        };
    }, [activeRole, hasRole, isAuthenticated]);

    const secondaryAction = useMemo(() => {
        if (isAuthenticated && hasRole('therapist')) {
            return {
                label: 'セラピスト画面へ',
                to: '/therapist',
            };
        }

        return {
            label: 'タチとして登録',
            to: '/register',
        };
    }, [hasRole, isAuthenticated]);

    const footerPrimaryAction = isAuthenticated && hasRole('user')
        ? { label: '利用者ダッシュボード', to: '/user' }
        : { label: 'ログイン・無料登録', to: '/register' };

    const footerSecondaryAction = isAuthenticated && activeRole
        ? { label: 'マイページへ戻る', to: getRoleHomePath(activeRole) }
        : { label: 'タチとして登録', to: '/register' };

    return (
        <div className="min-h-screen bg-[#f6f1e7] text-[#17202b]">
            <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-16 px-6 py-10 md:px-10 md:py-14 xl:gap-[60px] xl:px-0">
                <DiscoveryHeroShell
                    domain={serviceMeta?.domain}
                    title="今すぐ会える、近くで探せる。"
                    description="リラクゼーション / ボディケア / もみほぐし目的のマッチングサービスです。徒歩目安、料金、レビューを見ながら、自分に合う相手を落ち着いて探せます。"
                    topBadge="本人確認済みタチのみ掲載"
                    bullets={['18歳以上確認済み', '位置情報は概算表示', '直接取引禁止']}
                    primaryAction={primaryAction}
                    secondaryAction={secondaryAction}
                >
                    <div className="rounded-[32px] border border-white/12 bg-[linear-gradient(109deg,rgba(255,249,241,0.18)_2.98%,rgba(255,255,255,0.04)_101.1%)] p-6 text-white shadow-[0_24px_60px_rgba(0,0,0,0.16)] md:p-8">
                        <div className="space-y-1">
                            <h2 className="text-[1.35rem] font-semibold">条件を指定して探す</h2>
                            <p className="text-sm text-[#c8c2b6]">検索前に、近さと安心条件をまとめて確認できます。</p>
                        </div>

                        <div className="mt-5 space-y-3">
                            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                                <div className="rounded-[24px] bg-white px-5 py-3 text-[#121a23]">
                                    <p className="text-xs font-semibold text-[#69707a]">待ち合わせ場所</p>
                                    <p className="mt-1 text-lg font-semibold">
                                        {isAuthenticated && hasRole('user') ? 'デフォルトの施術場所を使う' : 'ログイン後に施術場所を選択'}
                                    </p>
                                </div>

                                <div className="rounded-[24px] bg-white px-5 py-3 text-[#121a23]">
                                    <p className="text-xs font-semibold text-[#69707a]">予約タイプ</p>
                                    <div className="mt-1 flex gap-2 text-sm font-semibold">
                                        <button
                                            type="button"
                                            onClick={() => setBookingType('now')}
                                            className={[
                                                'rounded-full px-3 py-1 transition',
                                                bookingType === 'now' ? 'bg-[#17202b] text-white' : 'bg-[#f3ede4] text-[#17202b]',
                                            ].join(' ')}
                                        >
                                            今すぐ
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setBookingType('scheduled')}
                                            className={[
                                                'rounded-full px-3 py-1 transition',
                                                bookingType === 'scheduled' ? 'bg-[#17202b] text-white' : 'bg-[#f3ede4] text-[#17202b]',
                                            ].join(' ')}
                                        >
                                            日時指定
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {['研修済みのみ', '評価4.5以上', '徒歩30分以内'].map((chip) => (
                                    <span
                                        key={chip}
                                        className="rounded-full border border-white/14 bg-white/8 px-4 py-2 text-xs font-bold text-[#f0e9de]"
                                    >
                                        {chip}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center">
                            <Link
                                to={primaryAction.to}
                                className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-6 py-3 text-sm font-bold text-[#1a2430] transition hover:brightness-105"
                            >
                                {isAuthenticated && hasRole('user') ? 'セラピストを検索' : 'ログインして検索'}
                            </Link>
                            <p className="text-xs text-[#c8c2b6]">正確な現在地や住所は、相手ユーザーに公開されません。</p>
                        </div>
                    </div>
                </DiscoveryHeroShell>

                <section id="how-it-works" className="grid gap-4 md:grid-cols-3">
                    {[
                        {
                            label: 'LISTING RULE',
                            title: '掲載条件',
                            body: '本人確認と審査を完了したセラピストのみ表示。安心感を損なうアカウントは掲載対象外です。',
                        },
                        {
                            label: 'DISTANCE',
                            title: '表示ロジック',
                            body: '位置情報は徒歩目安レンジで表示し、正確な地点は非公開。比較しやすさと安全性を両立します。',
                        },
                        {
                            label: 'SAFETY',
                            title: '禁止事項',
                            body: '医療・治療・性的サービスを想起させる表現は使わず、リラクゼーション目的としてご利用ください。',
                        },
                    ].map((card) => (
                        <article key={card.title} className="rounded-[24px] bg-[#fffdf8] p-6 shadow-[0_10px_24px_rgba(23,32,43,0.06)]">
                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">{card.label}</p>
                            <h2 className="mt-1 text-[1.35rem] font-semibold text-[#17202b]">{card.title}</h2>
                            <p className="mt-3 text-sm leading-7 text-[#5b6470]">{card.body}</p>
                        </article>
                    ))}
                </section>

                <section id="safety" className="space-y-6">
                    <div className="space-y-1">
                        <h2 className="text-[2rem] font-semibold text-[#17202b] md:text-[2.2rem]">
                            近くのセラピストをイメージしながら探せます。
                        </h2>
                        <p className="text-sm text-[#68707a] md:text-base">
                            ログイン後は、徒歩目安レンジ、料金、レビューを見ながら自分の条件で比較できます。
                        </p>
                    </div>

                    <div className="grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
                        <aside className="rounded-[32px] bg-[#fffcf7] p-6 shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                            <div className="space-y-5">
                                <div>
                                    <p className="text-sm font-semibold text-[#17202b]">ログイン後の検索</p>
                                    <p className="mt-2 text-sm leading-7 text-[#68707a]">
                                        施術場所を登録すると、近さと概算料金を見ながら一覧で比較できます。
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    {['今すぐ / 日時指定', '研修済みのみ', '評価4.5以上', '徒歩30分以内'].map((item) => (
                                        <div key={item} className="rounded-full bg-[#f5efe4] px-4 py-2 text-sm text-[#17202b]">
                                            {item}
                                        </div>
                                    ))}
                                </div>

                                <div className="rounded-[24px] bg-[#17202b] p-5 text-white">
                                    <p className="text-xs font-semibold tracking-wide text-[#d2b179]">SAFETY NOTE</p>
                                    <p className="mt-2 text-sm leading-7 text-[#d8d3ca]">
                                        直接取引の持ちかけや、リラクゼーション目的から外れる依頼は禁止です。
                                    </p>
                                </div>

                                <Link
                                    to={primaryAction.to}
                                    className="inline-flex w-full items-center justify-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-6 py-3 text-sm font-bold text-[#1a2430] transition hover:brightness-105"
                                >
                                    {isAuthenticated && hasRole('user') ? '検索を始める' : '登録して検索'}
                                </Link>
                            </div>
                        </aside>

                        <div className="grid gap-5 md:grid-cols-2">
                            {previewTherapists.length > 0 ? (
                                previewTherapists.map((therapist) => (
                                    <TherapistDiscoveryCard
                                        key={therapist.public_id}
                                        name={therapist.public_name}
                                        ratingAverage={therapist.rating_average}
                                        reviewCount={therapist.review_count}
                                        walkingTimeRange={therapist.walking_time_range}
                                        estimatedTotalAmount={therapist.estimated_total_amount}
                                        durationMinutes={60}
                                        trainingStatus={therapist.training_status}
                                        therapistCancellationCount={therapist.therapist_cancellation_count}
                                        bioExcerpt={therapist.bio_excerpt}
                                        photoUrl={therapist.photos[0]?.url ?? null}
                                        to={`/therapists/${therapist.public_id}`}
                                        footerHint="公開プロフィールを見る"
                                    />
                                ))
                            ) : (
                                <article className="rounded-[28px] bg-[#fffcf7] p-8 text-sm leading-7 text-[#5b6470] shadow-[0_10px_24px_rgba(23,32,43,0.08)] md:col-span-2">
                                    現在、公開中のプロフィールを準備しています。しばらくしてから再度ご確認ください。
                                </article>
                            )}
                        </div>
                    </div>
                </section>

                <section className="space-y-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                        <div>
                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">PUBLIC INFO</p>
                            <h2 className="mt-1 text-2xl font-semibold text-[#17202b]">公開導線と法務情報</h2>
                        </div>
                        {error ? <p className="text-sm text-[#9a4b35]">{error}</p> : null}
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        {(serviceMeta?.legal_documents ?? []).map((document) => (
                            <Link
                                key={document.public_id}
                                to={`/${document.document_type === 'terms' ? 'terms' : document.document_type === 'privacy' ? 'privacy' : 'commerce'}`}
                                className="rounded-[24px] bg-[#fffdf8] p-5 shadow-[0_10px_24px_rgba(23,32,43,0.06)] transition hover:-translate-y-0.5"
                            >
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">{document.document_type.toUpperCase()}</p>
                                <h3 className="mt-2 text-lg font-semibold text-[#17202b]">{document.title}</h3>
                                <p className="mt-3 text-sm text-[#68707a]">バージョン {document.version}</p>
                            </Link>
                        ))}
                    </div>
                </section>
            </div>

            <DiscoveryFooter
                domain={serviceMeta?.domain ?? 'sugutachi.com'}
                description="リラクゼーション目的の出張セラピストを、近さ・料金・レビューから比較できる公開トップです。ログイン後は一覧検索、予約、メッセージまでそのまま進めます。"
                primaryAction={footerPrimaryAction}
                secondaryAction={footerSecondaryAction}
                supportEmail={serviceMeta?.support_email ?? account?.email ?? null}
            />
        </div>
    );
}
