import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import type { ApiEnvelope, ReviewSummary, TherapistProfileRecord } from '../lib/types';

type ReviewFilter = 'all' | 'with_comment' | 'high_rating';

function normalizeFilter(value: string | null): ReviewFilter {
    if (value === 'with_comment' || value === 'high_rating') {
        return value;
    }

    return 'all';
}

function formatDateTime(value: string | null): string {
    if (!value) {
        return '未設定';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '未設定';
    }

    return new Intl.DateTimeFormat('ja-JP', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

function renderStars(value: number): string {
    return `${'★'.repeat(value)}${'☆'.repeat(5 - value)}`;
}

function averageLabel(value: number | null | undefined): string {
    if (value === null || value === undefined) {
        return '-';
    }

    return value.toFixed(1);
}

function scoreTone(value: number | null): string {
    if (value === null) {
        return 'bg-white/5 text-slate-400';
    }

    if (value >= 4.5) {
        return 'bg-emerald-400/10 text-emerald-100';
    }

    if (value >= 3.5) {
        return 'bg-[#e9f0ff] text-[#37527d]';
    }

    return 'bg-amber-300/10 text-amber-100';
}

function averageOf(values: Array<number | null | undefined>): number | null {
    const filtered = values.filter((value): value is number => typeof value === 'number');

    if (filtered.length === 0) {
        return null;
    }

    return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

export function TherapistReviewsPage() {
    const { account, token } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [reviews, setReviews] = useState<ReviewSummary[]>([]);
    const [profile, setProfile] = useState<TherapistProfileRecord | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const filter = normalizeFilter(searchParams.get('filter'));

    usePageTitle('セラピストレビュー');

    const loadData = useCallback(async (refresh = false) => {
        if (!token) {
            return;
        }

        if (refresh) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }

        try {
            const [reviewsPayload, profilePayload] = await Promise.all([
                apiRequest<ApiEnvelope<ReviewSummary[]>>('/me/reviews', { token }),
                apiRequest<ApiEnvelope<TherapistProfileRecord>>('/me/therapist-profile', { token }),
            ]);

            setReviews(unwrapData(reviewsPayload));
            setProfile(unwrapData(profilePayload));
            setError(null);
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : 'レビュー情報の取得に失敗しました。';

            setError(message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [token]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const receivedReviews = useMemo(() => (
        reviews.filter((review) => (
            review.reviewee_account_id === account?.public_id
            && review.reviewer_role === 'user'
        ))
    ), [account?.public_id, reviews]);

    const filteredReviews = useMemo(() => (
        receivedReviews.filter((review) => {
            if (filter === 'with_comment') {
                return Boolean(review.public_comment?.trim());
            }

            if (filter === 'high_rating') {
                return review.rating_overall >= 4;
            }

            return true;
        })
    ), [filter, receivedReviews]);

    const metrics = useMemo(() => ({
        averageOverall: averageOf(receivedReviews.map((review) => review.rating_overall)),
        averageManners: averageOf(receivedReviews.map((review) => review.rating_manners)),
        averageSkill: averageOf(receivedReviews.map((review) => review.rating_skill)),
        averageCleanliness: averageOf(receivedReviews.map((review) => review.rating_cleanliness)),
        averageSafety: averageOf(receivedReviews.map((review) => review.rating_safety)),
        fiveStarCount: receivedReviews.filter((review) => review.rating_overall === 5).length,
        commentCount: receivedReviews.filter((review) => Boolean(review.public_comment?.trim())).length,
    }), [receivedReviews]);

    function updateFilter(nextFilter: ReviewFilter) {
        const nextParams = new URLSearchParams(searchParams);

        if (nextFilter === 'all') {
            nextParams.delete('filter');
        } else {
            nextParams.set('filter', nextFilter);
        }

        setSearchParams(nextParams, { replace: true });
    }

    if (isLoading) {
        return <LoadingScreen title="レビューを読み込み中" message="利用者から届いた評価とコメントを確認しています。" />;
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_16px_34px_rgba(2,6,23,0.14)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">REVIEWS</p>
                        <h2 className="text-2xl font-semibold text-white sm:text-[2rem]">利用者から届いたレビュー</h2>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            公開コメントと評価の傾向をまとめて確認できます。プロフィールに反映される平均評価と、改善のヒントになる個別コメントをここで追えます。
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                void loadData(true);
                            }}
                            disabled={isRefreshing}
                            className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isRefreshing ? '更新中...' : '最新化'}
                        </button>
                        <Link
                            to="/therapist/profile"
                            className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
                        >
                            プロフィールへ戻る
                        </Link>
                    </div>
                </div>
            </section>

            {error ? (
                <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                    {error}
                </div>
            ) : null}

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_14px_30px_rgba(2,6,23,0.12)]">
                    <p className="text-xs font-semibold tracking-wide text-[#d2b179]">公開中の平均</p>
                    <p className="mt-3 text-3xl font-semibold text-white">{averageLabel(profile?.rating_average)}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">プロフィール表示中の評価 / {profile?.review_count ?? 0}件</p>
                </article>
                <article className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_14px_30px_rgba(2,6,23,0.12)]">
                    <p className="text-xs font-semibold tracking-wide text-[#d2b179]">5点レビュー</p>
                    <p className="mt-3 text-3xl font-semibold text-white">{metrics.fiveStarCount}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">高評価として届いた件数</p>
                </article>
                <article className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_14px_30px_rgba(2,6,23,0.12)]">
                    <p className="text-xs font-semibold tracking-wide text-[#d2b179]">公開コメント</p>
                    <p className="mt-3 text-3xl font-semibold text-white">{metrics.commentCount}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">本文つきのレビュー件数</p>
                </article>
                <article className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_14px_30px_rgba(2,6,23,0.12)]">
                    <p className="text-xs font-semibold tracking-wide text-[#d2b179]">受信レビュー総数</p>
                    <p className="mt-3 text-3xl font-semibold text-white">{receivedReviews.length}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">利用者から届いた visible レビュー</p>
                </article>
            </section>

            <section className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_360px]">
                <div className="space-y-4">
                    <article className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_14px_30px_rgba(2,6,23,0.12)]">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                            <div className="space-y-2">
                                <p className="text-xs font-semibold tracking-wide text-[#d2b179]">INBOX</p>
                                <h3 className="text-xl font-semibold text-white">レビュー一覧</h3>
                                <p className="text-sm leading-7 text-slate-300">
                                    コメント付きだけに絞ったり、高評価レビューを先に見たりできます。
                                </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {[
                                    { value: 'all', label: 'すべて' },
                                    { value: 'with_comment', label: 'コメントあり' },
                                    { value: 'high_rating', label: '4点以上' },
                                ].map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => updateFilter(option.value as ReviewFilter)}
                                        className={[
                                            'rounded-full px-4 py-2 text-sm font-semibold transition',
                                            filter === option.value
                                                ? 'bg-[#f5efe4] text-[#17202b]'
                                                : 'border border-white/10 text-slate-200 hover:bg-white/5',
                                        ].join(' ')}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </article>

                    {filteredReviews.length > 0 ? (
                        filteredReviews.map((review) => (
                            <article
                                key={review.id}
                                className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_14px_30px_rgba(2,6,23,0.12)]"
                            >
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="space-y-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${scoreTone(review.rating_overall)}`}>
                                                {renderStars(review.rating_overall)}
                                            </span>
                                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">
                                                予約 {review.booking_public_id ?? '-'}
                                            </span>
                                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">
                                                {formatDateTime(review.created_at)}
                                            </span>
                                        </div>

                                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                            {[
                                                { label: '総合', value: review.rating_overall },
                                                { label: '接客', value: review.rating_manners },
                                                { label: '施術', value: review.rating_skill },
                                                { label: '清潔感', value: review.rating_cleanliness },
                                                { label: '安心感', value: review.rating_safety },
                                            ].map((item) => (
                                                <div key={item.label} className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                                                    <p className="text-xs font-semibold tracking-wide text-slate-400">{item.label}</p>
                                                    <p className="mt-2 text-sm font-semibold text-white">
                                                        {typeof item.value === 'number' ? renderStars(item.value) : '未入力'}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-4">
                                            <p className="text-xs font-semibold tracking-wide text-slate-400">公開コメント</p>
                                            <p className="mt-3 text-sm leading-7 text-slate-200">
                                                {review.public_comment?.trim() || '公開コメントはありません。'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-3">
                                        {review.booking_public_id ? (
                                            <Link
                                                to={`/therapist/bookings/${review.booking_public_id}`}
                                                className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
                                            >
                                                予約詳細へ
                                            </Link>
                                        ) : null}
                                    </div>
                                </div>
                            </article>
                        ))
                    ) : (
                        <article className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] p-6 text-sm leading-7 text-slate-300">
                            まだ条件に合うレビューはありません。施術後のレビューが増えると、ここで接客や施術の傾向を見返せるようになります。
                        </article>
                    )}
                </div>

                <div className="space-y-4">
                    <article className="rounded-[24px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_14px_30px_rgba(2,6,23,0.12)]">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">BREAKDOWN</p>
                        <h3 className="mt-2 text-xl font-semibold text-white">評価の内訳</h3>
                        <div className="mt-5 space-y-3">
                            {[
                                { label: '接客', value: metrics.averageManners },
                                { label: '施術', value: metrics.averageSkill },
                                { label: '清潔感', value: metrics.averageCleanliness },
                                { label: '安心感', value: metrics.averageSafety },
                            ].map((item) => (
                                <div key={item.label} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                                    <p className="text-sm font-semibold text-white">{item.label}</p>
                                    <p className="text-sm font-semibold text-slate-200">{averageLabel(item.value)}</p>
                                </div>
                            ))}
                        </div>
                    </article>

                    <article className="rounded-[24px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_14px_30px_rgba(2,6,23,0.12)]">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">NEXT ACTION</p>
                        <h3 className="mt-2 text-xl font-semibold text-white">このあと見直すと効く場所</h3>
                        <div className="mt-5 space-y-3">
                            <Link
                                to="/therapist/profile"
                                className="block rounded-2xl border border-white/10 bg-[#111923] px-4 py-4 transition hover:bg-[#16202b]"
                            >
                                <p className="text-sm font-semibold text-white">プロフィールと写真を見直す</p>
                                <p className="mt-2 text-sm leading-6 text-slate-300">公開文言や写真の印象を、届いたレビューと照らして調整できます。</p>
                            </Link>
                            <Link
                                to="/therapist/requests"
                                className="block rounded-2xl border border-white/10 bg-[#111923] px-4 py-4 transition hover:bg-[#16202b]"
                            >
                                <p className="text-sm font-semibold text-white">予約依頼の対応速度を確認する</p>
                                <p className="mt-2 text-sm leading-6 text-slate-300">高評価を増やしやすい導線として、承諾待ちの処理速度も見直せます。</p>
                            </Link>
                            <Link
                                to="/therapist/bookings"
                                className="block rounded-2xl border border-white/10 bg-[#111923] px-4 py-4 transition hover:bg-[#16202b]"
                            >
                                <p className="text-sm font-semibold text-white">進行中予約を確認する</p>
                                <p className="mt-2 text-sm leading-6 text-slate-300">直近の施術体験に関係する予約やメッセージへ戻れます。</p>
                            </Link>
                        </div>
                    </article>
                </div>
            </section>
        </div>
    );
}
