import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatJstDate, formatJstDateTime } from '../lib/datetime';
import type { ApiEnvelope, ReviewSummary, TherapistProfileRecord } from '../lib/types';

type ReviewFilter = 'all' | 'with_comment' | 'high_rating';

function normalizeFilter(value: string | null): ReviewFilter {
    if (value === 'with_comment' || value === 'high_rating') {
        return value;
    }

    return 'all';
}

function formatDateTime(value: string | null): string {
    return formatJstDateTime(value, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }) ?? '未設定';
}

function formatDate(value: string | null): string {
    return formatJstDate(value, {
        month: 'numeric',
        day: 'numeric',
    }) ?? '未設定';
}

function renderStars(value: number): string {
    return `${'★'.repeat(value)}${'☆'.repeat(5 - value)}`;
}

function averageLabel(value: number | string | null | undefined): string {
    if (value === null || value === undefined) {
        return '-';
    }

    const numericValue = typeof value === 'number' ? value : Number(value);

    if (!Number.isFinite(numericValue)) {
        return '-';
    }

    return numericValue.toFixed(1);
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

function insightLabel(values: Array<{ label: string; value: number | null }>, mode: 'highest' | 'lowest'): string | null {
    const filtered = values.filter((item): item is { label: string; value: number } => typeof item.value === 'number');

    if (filtered.length === 0) {
        return null;
    }

    const sorted = [...filtered].sort((left, right) => (
        mode === 'highest'
            ? right.value - left.value
            : left.value - right.value
    ));

    return sorted[0]?.label ?? null;
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
    useToastOnMessage(error, 'error');

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

    const sortedReceivedReviews = useMemo(() => (
        [...receivedReviews].sort((left, right) => {
            const leftTime = new Date(left.created_at).getTime();
            const rightTime = new Date(right.created_at).getTime();

            return rightTime - leftTime;
        })
    ), [receivedReviews]);

    const filteredReviews = useMemo(() => (
        sortedReceivedReviews.filter((review) => {
            if (filter === 'with_comment') {
                return Boolean(review.public_comment?.trim());
            }

            if (filter === 'high_rating') {
                return review.rating_overall >= 4;
            }

            return true;
        })
    ), [filter, sortedReceivedReviews]);

    const metrics = useMemo(() => ({
        averageOverall: averageOf(sortedReceivedReviews.map((review) => review.rating_overall)),
        averageManners: averageOf(sortedReceivedReviews.map((review) => review.rating_manners)),
        averageSkill: averageOf(sortedReceivedReviews.map((review) => review.rating_skill)),
        averageCleanliness: averageOf(sortedReceivedReviews.map((review) => review.rating_cleanliness)),
        averageSafety: averageOf(sortedReceivedReviews.map((review) => review.rating_safety)),
        fiveStarCount: sortedReceivedReviews.filter((review) => review.rating_overall === 5).length,
        commentCount: sortedReceivedReviews.filter((review) => Boolean(review.public_comment?.trim())).length,
    }), [sortedReceivedReviews]);
    const categoryAverages = useMemo(() => ([
        { label: '接客', value: metrics.averageManners },
        { label: '対応', value: metrics.averageSkill },
        { label: '清潔感', value: metrics.averageCleanliness },
        { label: '安心感', value: metrics.averageSafety },
    ]), [metrics.averageCleanliness, metrics.averageManners, metrics.averageSafety, metrics.averageSkill]);
    const strongestCategory = useMemo(
        () => insightLabel(categoryAverages, 'highest'),
        [categoryAverages],
    );
    const weakestCategory = useMemo(
        () => insightLabel(categoryAverages, 'lowest'),
        [categoryAverages],
    );
    const latestReview = sortedReceivedReviews[0] ?? null;
    const latestThreeAverage = useMemo(() => (
        averageOf(sortedReceivedReviews.slice(0, 3).map((review) => review.rating_overall))
    ), [sortedReceivedReviews]);
    const commentRate = useMemo(() => {
        if (sortedReceivedReviews.length === 0) {
            return null;
        }

        return Math.round((metrics.commentCount / sortedReceivedReviews.length) * 100);
    }, [metrics.commentCount, sortedReceivedReviews.length]);
    const filterOptions = useMemo(() => ([
        { value: 'all' as const, label: 'すべて', count: sortedReceivedReviews.length },
        {
            value: 'with_comment' as const,
            label: 'コメントあり',
            count: sortedReceivedReviews.filter((review) => Boolean(review.public_comment?.trim())).length,
        },
        {
            value: 'high_rating' as const,
            label: '4点以上',
            count: sortedReceivedReviews.filter((review) => review.rating_overall >= 4).length,
        },
    ]), [sortedReceivedReviews]);

    const emptyStateTitle = useMemo(() => {
        if (filter === 'with_comment') {
            return 'まだコメント付きレビューはありません';
        }

        if (filter === 'high_rating') {
            return 'まだ4点以上のレビューはありません';
        }

        return 'まだレビューはありません';
    }, [filter]);

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
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">レビュー</p>
                        <h1 className="text-2xl font-semibold text-white sm:text-[2rem]">利用者から届いたレビュー</h1>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            公開コメントと評価の傾向をまとめて確認できます。プロフィールに反映される平均評価と、改善のヒントになる個別コメントをここで追えます。
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold whitespace-nowrap text-slate-200">
                                公開中の平均 {averageLabel(profile?.rating_average)}
                            </span>
                            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold whitespace-nowrap text-slate-200">
                                レビュー {sortedReceivedReviews.length}件
                            </span>
                            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold whitespace-nowrap text-slate-200">
                                コメント付き {metrics.commentCount}件
                            </span>
                            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold whitespace-nowrap text-slate-200">
                                最新 {latestReview ? formatDate(latestReview.created_at) : '未着'}
                            </span>
                        </div>
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


            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_14px_30px_rgba(2,6,23,0.12)]">
                    <p className="text-xs font-semibold tracking-wide text-[#d2b179]">公開中の平均</p>
                    <p className="mt-3 text-3xl font-semibold text-white">{averageLabel(profile?.rating_average)}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">プロフィールに表示される平均評価 / {profile?.review_count ?? 0}件</p>
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
                    <p className="mt-3 text-3xl font-semibold text-white">{sortedReceivedReviews.length}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">利用者から届いた公開対象レビュー</p>
                </article>
            </section>

            <section className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_360px]">
                <div className="space-y-4">
                    <article className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_14px_30px_rgba(2,6,23,0.12)]">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                            <div className="space-y-2">
                                <p className="text-xs font-semibold tracking-wide text-[#d2b179]">新着</p>
                                <h3 className="text-xl font-semibold text-white">レビュー一覧</h3>
                                <p className="text-sm leading-7 text-slate-300">
                                    コメント付きだけに絞ったり、高評価レビューだけをまとめて振り返れます。
                                </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {filterOptions.map((option) => (
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
                                        {option.label} {option.count}件
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="mt-4 rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                            <p className="text-sm text-slate-300">
                                {filteredReviews.length}件を表示中です。コメント付きレビューは、公開プロフィールの印象づくりや接客の振り返りに使えます。
                            </p>
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
                                            <span className={`rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap ${scoreTone(review.rating_overall)}`}>
                                                {renderStars(review.rating_overall)}
                                            </span>
                                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold whitespace-nowrap text-slate-300">
                                                {review.public_comment?.trim() ? 'コメントあり' : '評価のみ'}
                                            </span>
                                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold whitespace-nowrap text-slate-300">
                                                予約ID {review.booking_public_id ?? '-'}
                                            </span>
                                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold whitespace-nowrap text-slate-300">
                                                {formatDateTime(review.created_at)}
                                            </span>
                                        </div>

                                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                            {[
                                                { label: '総合', value: review.rating_overall },
                                                { label: '接客', value: review.rating_manners },
                                                { label: '対応', value: review.rating_skill },
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
                        <article className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] p-6">
                            <p className="text-sm font-semibold text-white">{error && sortedReceivedReviews.length === 0 ? 'レビューを読み込めませんでした' : emptyStateTitle}</p>
                            <p className="mt-3 text-sm leading-7 text-slate-300">
                                {error && sortedReceivedReviews.length === 0
                                    ? '通信状況を確認して、もう一度読み込み直してください。'
                                    : '利用後のレビューが増えると、ここで接客や対応の傾向を見返せるようになります。まずは進行中の予約やプロフィールの見え方を整えておくと、次の評価につながりやすくなります。'}
                            </p>
                            <div className="mt-5 flex flex-wrap gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        void loadData(true);
                                    }}
                                    className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
                                >
                                    もう一度読み込む
                                </button>
                                <Link
                                    to="/therapist/bookings"
                                    className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
                                >
                                    予約一覧を見る
                                </Link>
                                <Link
                                    to="/therapist/profile"
                                    className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
                                >
                                    プロフィールを見直す
                                </Link>
                            </div>
                        </article>
                    )}
                </div>

                <div className="space-y-4">
                    <article className="rounded-[24px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_14px_30px_rgba(2,6,23,0.12)]">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">公開プロフィール</p>
                        <h3 className="mt-2 text-xl font-semibold text-white">プロフィールに見える数字</h3>
                        <div className="mt-5 space-y-3">
                            <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                                <p className="text-sm font-semibold text-white">平均評価</p>
                                <p className="mt-2 text-sm text-slate-300">{averageLabel(profile?.rating_average)}</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                                <p className="text-sm font-semibold text-white">公開レビュー件数</p>
                                <p className="mt-2 text-sm text-slate-300">{profile?.review_count ?? 0}件</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                                <p className="text-sm font-semibold text-white">最新レビュー</p>
                                <p className="mt-2 text-sm text-slate-300">{latestReview ? formatDateTime(latestReview.created_at) : 'まだありません'}</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                                <p className="text-sm font-semibold text-white">直近3件の平均</p>
                                <p className="mt-2 text-sm text-slate-300">{averageLabel(latestThreeAverage)}</p>
                            </div>
                        </div>
                    </article>

                    <article className="rounded-[24px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_14px_30px_rgba(2,6,23,0.12)]">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">内訳</p>
                        <h3 className="mt-2 text-xl font-semibold text-white">評価の内訳</h3>
                        <div className="mt-5 space-y-3">
                            {[
                                { label: '接客', value: metrics.averageManners },
                                { label: '対応', value: metrics.averageSkill },
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
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">傾向</p>
                        <h3 className="mt-2 text-xl font-semibold text-white">届いている評価の傾向</h3>
                        <div className="mt-5 space-y-3">
                            <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-4">
                                <p className="text-sm font-semibold text-white">いちばん高い評価</p>
                                <p className="mt-2 text-sm leading-6 text-slate-300">
                                    {strongestCategory ? `${strongestCategory} が特に高く評価されています。` : 'まだ傾向を出せるほどレビューが集まっていません。'}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-4">
                                <p className="text-sm font-semibold text-white">見直し候補</p>
                                <p className="mt-2 text-sm leading-6 text-slate-300">
                                    {weakestCategory ? `${weakestCategory} は他の項目より低めです。コメントの文脈と合わせて振り返ると改善点を掴みやすいです。` : 'レビューが増えると、見直し候補もここで追えるようになります。'}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-4">
                                <p className="text-sm font-semibold text-white">コメントの付きやすさ</p>
                                <p className="mt-2 text-sm leading-6 text-slate-300">
                                    {commentRate === null ? 'まだレビューが集まっていません。' : `${commentRate}% のレビューにコメントが付いています。印象に残った体験ほどコメントにつながりやすいです。`}
                                </p>
                            </div>
                        </div>
                    </article>
                </div>
            </section>
        </div>
    );
}
