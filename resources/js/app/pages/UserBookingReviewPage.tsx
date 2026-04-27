import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatJstDateTime } from '../lib/datetime';
import { getServiceAddressLabel } from '../lib/discovery';
import type {
    ApiEnvelope,
    BookingDetailRecord,
    ReviewSummary,
} from '../lib/types';

type OptionalRating = number | null;

const reviewableStatuses = new Set(['therapist_completed', 'completed']);

const ratingOptions = [
    { value: 1, label: '1' },
    { value: 2, label: '2' },
    { value: 3, label: '3' },
    { value: 4, label: '4' },
    { value: 5, label: '5' },
];

function statusLabel(status: string): string {
    switch (status) {
        case 'payment_authorizing':
            return '与信確認中';
        case 'requested':
            return '承諾待ち';
        case 'accepted':
            return '予約確定';
        case 'moving':
            return '移動中';
        case 'arrived':
            return '到着';
        case 'in_progress':
            return '対応中';
        case 'therapist_completed':
            return 'あなたの完了確認待ち';
        case 'completed':
            return '完了';
        case 'rejected':
            return '辞退';
        case 'expired':
            return '期限切れ';
        case 'payment_canceled':
            return '与信取消';
        case 'canceled':
            return 'キャンセル';
        case 'interrupted':
            return '中断';
        default:
            return status;
    }
}

function statusTone(status: string): string {
    switch (status) {
        case 'completed':
            return 'bg-[#e9f4ea] text-[#24553a]';
        case 'therapist_completed':
            return 'bg-[#fff2dd] text-[#8b5a16]';
        default:
            return 'bg-[#f1efe8] text-[#48505a]';
    }
}

function formatDateTime(value: string | null): string {
    return formatJstDateTime(value, {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }) ?? '未設定';
}

function buildPrimaryTime(booking: BookingDetailRecord): string {
    if (booking.request_type === 'on_demand') {
        return booking.accepted_at
            ? `確定 ${formatDateTime(booking.accepted_at)}`
            : `受付 ${formatDateTime(booking.created_at)}`;
    }

    if (!booking.scheduled_start_at) {
        return '開始時刻を確認中';
    }

    return `${formatDateTime(booking.scheduled_start_at)} - ${formatDateTime(booking.scheduled_end_at)}`;
}

function renderStars(value: number): string {
    return `${'★'.repeat(value)}${'☆'.repeat(5 - value)}`;
}

function RatingField({
    label,
    required = false,
    value,
    onChange,
}: {
    label: string;
    required?: boolean;
    value: OptionalRating;
    onChange: (value: OptionalRating) => void;
}) {
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[#17202b]">{label}</p>
                <p className="text-xs text-[#7a7066]">{required ? '必須' : '任意'}</p>
            </div>
            <div className="flex flex-wrap gap-2">
                {!required ? (
                    <button
                        type="button"
                        onClick={() => onChange(null)}
                        className={[
                            'rounded-full px-3 py-2 text-sm font-semibold transition',
                            value === null
                                ? 'bg-[#17202b] text-white'
                                : 'bg-[#f5efe4] text-[#48505a] hover:bg-[#ebe2d3]',
                        ].join(' ')}
                    >
                        未入力
                    </button>
                ) : null}
                {ratingOptions.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => onChange(option.value)}
                        className={[
                            'min-w-[3rem] rounded-full px-3 py-2 text-sm font-semibold transition',
                            value === option.value
                                ? 'bg-[#17202b] text-white'
                                : 'bg-[#f5efe4] text-[#48505a] hover:bg-[#ebe2d3]',
                        ].join(' ')}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
            <p className="text-xs text-[#7a7066]">
                {value ? renderStars(value) : 'まだ選択されていません。'}
            </p>
        </div>
    );
}

export function UserBookingReviewPage() {
    const { publicId } = useParams();
    const { account, token } = useAuth();
    const [booking, setBooking] = useState<BookingDetailRecord | null>(null);
    const [existingReview, setExistingReview] = useState<ReviewSummary | null>(null);
    const [ratingOverall, setRatingOverall] = useState<OptionalRating>(5);
    const [ratingManners, setRatingManners] = useState<OptionalRating>(null);
    const [ratingSkill, setRatingSkill] = useState<OptionalRating>(null);
    const [ratingCleanliness, setRatingCleanliness] = useState<OptionalRating>(null);
    const [ratingSafety, setRatingSafety] = useState<OptionalRating>(null);
    const [publicComment, setPublicComment] = useState('');
    const [privateFeedback, setPrivateFeedback] = useState('');
    const [pageError, setPageError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    usePageTitle(
        booking
            ? `${booking.therapist_profile?.public_name ?? booking.counterparty?.display_name ?? '予約'}のレビュー`
            : 'レビュー投稿',
    );

    const loadData = useCallback(async () => {
        if (!token || !publicId) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setSuccessMessage(null);

        try {
            const [bookingPayload, reviewsPayload] = await Promise.all([
                apiRequest<ApiEnvelope<BookingDetailRecord>>(`/bookings/${publicId}`, {
                    token,
                }),
                apiRequest<ApiEnvelope<ReviewSummary[]>>('/me/reviews', {
                    token,
                }),
            ]);

            const nextBooking = unwrapData(bookingPayload);
            const reviews = unwrapData(reviewsPayload);
            const myReview = reviews.find((review) => (
                review.booking_public_id === publicId
                && review.reviewer_account_id === account?.public_id
                && review.reviewer_role === 'user'
            )) ?? null;

            setBooking(nextBooking);
            setExistingReview(myReview);
            setPageError(null);

            if (myReview) {
                setRatingOverall(myReview.rating_overall);
                setRatingManners(myReview.rating_manners);
                setRatingSkill(myReview.rating_skill);
                setRatingCleanliness(myReview.rating_cleanliness);
                setRatingSafety(myReview.rating_safety);
                setPublicComment(myReview.public_comment ?? '');
            }
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : 'レビュー情報の取得に失敗しました。';

            setPageError(message);
        } finally {
            setIsLoading(false);
        }
    }, [account?.public_id, publicId, token]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const isReviewable = booking ? reviewableStatuses.has(booking.status) : false;
    const counterpartyName = booking?.therapist_profile?.public_name ?? booking?.counterparty?.display_name ?? '相手を確認中';

    const readinessMessage = useMemo(() => {
        if (existingReview) {
            return 'この予約のレビューはすでに送信済みです。内容を確認できます。';
        }

        if (!booking) {
            return null;
        }

        if (isReviewable) {
            return booking.status === 'therapist_completed'
                ? 'レビューを送ると、この予約はそのまま完了になります。'
                : '利用後の感想を共有して、今後の利用者の判断材料にできます。';
        }

        return 'レビューは対応終了後に送信できます。完了確認前はまだ投稿できません。';
    }, [booking, existingReview, isReviewable]);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token || !publicId || existingReview || !ratingOverall || !isReviewable) {
            return;
        }

        const shouldCompleteBooking = booking?.status === 'therapist_completed';

        setIsSubmitting(true);
        setFormError(null);
        setPageError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<ReviewSummary>>(`/bookings/${publicId}/reviews`, {
                method: 'POST',
                token,
                body: {
                    rating_overall: ratingOverall,
                    rating_manners: ratingManners,
                    rating_skill: ratingSkill,
                    rating_cleanliness: ratingCleanliness,
                    rating_safety: ratingSafety,
                    public_comment: publicComment.trim() || null,
                    private_feedback: privateFeedback.trim() || null,
                },
            });

            const review = unwrapData(payload);
            setExistingReview(review);
            setPrivateFeedback('');
            await loadData();
            setSuccessMessage(shouldCompleteBooking ? 'レビューを送信し、予約を完了しました。' : 'レビューを送信しました。');
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : 'レビューの送信に失敗しました。';

            setFormError(message);
        } finally {
            setIsSubmitting(false);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="レビュー画面を読み込み中" message="予約状態と投稿履歴を確認しています。" />;
    }

    if (!booking) {
        return (
            <div className="space-y-6">
                <section className="rounded-[28px] border border-[#f1d4b5] bg-[#fff4e8] px-6 py-5 text-sm text-[#9a4b35]">
                    {pageError ?? 'レビュー画面を表示できませんでした。'}
                </section>
                <Link
                    to="/user/bookings"
                    className="inline-flex items-center rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/6"
                >
                    予約一覧へ戻る
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[32px] bg-[linear-gradient(117deg,#17202b_0%,#243447_52%,#2b4158_100%)] p-7 text-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(booking.status)}`}>
                                {statusLabel(booking.status)}
                            </span>
                            {existingReview ? (
                                <span className="rounded-full bg-[#e9f4ea] px-3 py-1 text-xs font-semibold text-[#24553a]">
                                    投稿済み
                                </span>
                            ) : null}
                        </div>
                        <div className="space-y-2">
                            <h1 className="text-3xl font-semibold">{counterpartyName}のレビュー</h1>
                            <p className="max-w-3xl text-sm leading-7 text-slate-300">
                                {booking.therapist_menu
                                    ? `${booking.therapist_menu.name} / ${booking.therapist_menu.duration_minutes}分`
                                    : 'メニュー情報を確認中'} ・ {buildPrimaryTime(booking)}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Link
                            to={`/user/bookings/${booking.public_id}`}
                            className="inline-flex items-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8"
                        >
                            予約詳細へ戻る
                        </Link>
                        <Link
                            to="/user/bookings"
                            className="inline-flex items-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8"
                        >
                            予約一覧へ戻る
                        </Link>
                    </div>
                </div>
            </section>

            {pageError ? (
                <section className="rounded-[24px] border border-[#f1d4b5] bg-[#fff4e8] px-5 py-4 text-sm text-[#9a4b35]">
                    {pageError}
                </section>
            ) : null}


            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                <section className="space-y-5">
                    <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <div className="space-y-2">
                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">REVIEW READINESS</p>
                            <h2 className="text-2xl font-semibold text-[#17202b]">投稿状態</h2>
                            <p className="text-sm leading-7 text-[#68707a]">
                                {readinessMessage}
                            </p>
                        </div>
                    </article>

                    {existingReview ? (
                        <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">SUBMITTED REVIEW</p>
                            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                {[
                                    ['総合', existingReview.rating_overall],
                                    ['やり取り', existingReview.rating_manners],
                                    ['対応', existingReview.rating_skill],
                                    ['清潔感', existingReview.rating_cleanliness],
                                    ['安心感', existingReview.rating_safety],
                                ].map(([label, value]) => (
                                    <div key={label} className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">{label}</p>
                                        <p className="mt-2 text-lg font-semibold text-[#17202b]">
                                            {typeof value === 'number' ? renderStars(value) : '未入力'}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-5 rounded-[20px] border border-[#ebe2d3] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">公開コメント</p>
                                <p className="mt-2 text-sm leading-7 text-[#48505a]">
                                    {existingReview.public_comment ?? '公開コメントはありません。'}
                                </p>
                                <p className="mt-3 text-xs text-[#7a7066]">投稿日時: {formatDateTime(existingReview.created_at)}</p>
                            </div>
                        </article>
                    ) : (
                        <form
                            onSubmit={handleSubmit}
                            className="space-y-5 rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]"
                        >
                            <div className="space-y-2">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">REVIEW FORM</p>
                                <h2 className="text-2xl font-semibold text-[#17202b]">レビューを送る</h2>
                                <p className="text-sm leading-7 text-[#68707a]">
                                    公開コメントは他の利用者にも見える前提で、落ち着いた表現で記入します。
                                </p>
                            </div>

                            <RatingField
                                label="総合評価"
                                required
                                value={ratingOverall}
                                onChange={setRatingOverall}
                            />

                            <div className="grid gap-5 md:grid-cols-2">
                                <RatingField label="やり取りのしやすさ" value={ratingManners} onChange={setRatingManners} />
                                <RatingField label="対応の満足度" value={ratingSkill} onChange={setRatingSkill} />
                                <RatingField label="清潔感" value={ratingCleanliness} onChange={setRatingCleanliness} />
                                <RatingField label="安心感" value={ratingSafety} onChange={setRatingSafety} />
                            </div>

                            <label className="block space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">公開コメント</span>
                                <textarea
                                    value={publicComment}
                                    onChange={(event) => setPublicComment(event.target.value)}
                                    rows={5}
                                    maxLength={500}
                                    className="w-full rounded-[20px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm leading-7 text-[#17202b] outline-none transition focus:border-[#c6a16a]"
                                    placeholder="待ち合わせのしやすさや安心感など、次の利用者の参考になる内容を記入"
                                />
                                <div className="text-right text-xs text-[#7a7066]">{publicComment.length}/500</div>
                            </label>

                            <label className="block space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">運営向けメモ</span>
                                <textarea
                                    value={privateFeedback}
                                    onChange={(event) => setPrivateFeedback(event.target.value)}
                                    rows={4}
                                    maxLength={2000}
                                    className="w-full rounded-[20px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm leading-7 text-[#17202b] outline-none transition focus:border-[#c6a16a]"
                                    placeholder="公開しない補足があればこちらへ"
                                />
                                <div className="text-right text-xs text-[#7a7066]">{privateFeedback.length}/2000</div>
                            </label>

                            {formError ? (
                                <div className="rounded-[20px] border border-[#f1d4b5] bg-[#fff4e8] px-4 py-3 text-sm text-[#9a4b35]">
                                    {formError}
                                </div>
                            ) : null}

                            <button
                                type="submit"
                                disabled={isSubmitting || !isReviewable || !ratingOverall}
                                className="inline-flex w-full items-center justify-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isSubmitting ? '送信中...' : booking.status === 'therapist_completed' ? 'レビューを送信して完了する' : 'レビューを送信する'}
                            </button>
                        </form>
                    )}
                </section>

                <aside className="space-y-5">
                    <section className="rounded-[28px] bg-[#fffcf7] p-6 shadow-[0_18px_36px_rgba(23,32,43,0.1)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">BOOKING CONTEXT</p>
                        <div className="mt-4 space-y-4 text-sm text-[#48505a]">
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">予約日時</p>
                                <p className="mt-1 font-semibold text-[#17202b]">{buildPrimaryTime(booking)}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">待ち合わせ場所</p>
                                <p className="mt-1 font-semibold text-[#17202b]">
                                    {booking.service_address ? getServiceAddressLabel(booking.service_address) : '未設定'}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">予約ステータス</p>
                                <p className="mt-1 font-semibold text-[#17202b]">{statusLabel(booking.status)}</p>
                            </div>
                        </div>

                        <div className="mt-6 space-y-3">
                            <Link
                                to={`/user/bookings/${booking.public_id}/messages`}
                                className="inline-flex w-full items-center justify-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                            >
                                メッセージを見る
                            </Link>
                            <Link
                                to={`/user/bookings/${booking.public_id}/report`}
                                className="inline-flex w-full items-center justify-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                            >
                                通報する
                            </Link>
                        </div>
                    </section>
                </aside>
            </div>
        </div>
    );
}
