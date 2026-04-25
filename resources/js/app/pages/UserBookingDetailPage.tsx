import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatCurrency, getServiceAddressLabel } from '../lib/discovery';
import type {
    ApiEnvelope,
    BookingConsentRecord,
    BookingDetailRecord,
    BookingHealthCheckRecord,
    BookingRefundRecord,
} from '../lib/types';

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
            return '施術中';
        case 'therapist_completed':
            return '完了確認待ち';
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
        case 'requested':
        case 'payment_authorizing':
        case 'therapist_completed':
            return 'bg-[#fff2dd] text-[#8b5a16]';
        case 'accepted':
        case 'moving':
        case 'arrived':
        case 'in_progress':
            return 'bg-[#eaf2ff] text-[#30527a]';
        case 'rejected':
        case 'expired':
        case 'payment_canceled':
        case 'canceled':
        case 'interrupted':
            return 'bg-[#f7e7e3] text-[#8c4738]';
        default:
            return 'bg-[#f1efe8] text-[#48505a]';
    }
}

function requestTypeLabel(value: BookingDetailRecord['request_type']): string {
    return value === 'scheduled' ? '予定予約' : '今すぐ';
}

function paymentStatusLabel(value: string | null | undefined): string {
    switch (value) {
        case 'requires_capture':
            return '与信確保済み';
        case 'succeeded':
            return '決済完了';
        case 'canceled':
            return '与信取消';
        default:
            return '未作成';
    }
}

function refundStatusLabel(status: string): string {
    switch (status) {
        case 'requested':
            return '申請中';
        case 'approved':
            return '承認済み';
        case 'processed':
            return '返金完了';
        case 'rejected':
            return '却下';
        default:
            return status;
    }
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
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

function formatBooleanLabel(value: boolean): string {
    return value ? 'あり' : 'なし';
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

function buildTimeline(booking: BookingDetailRecord): Array<{ key: string; label: string; value: string | null; isActive: boolean }> {
    return [
        { key: 'created', label: '予約作成', value: booking.created_at, isActive: true },
        { key: 'accepted', label: '予約確定', value: booking.accepted_at, isActive: Boolean(booking.accepted_at) },
        { key: 'moving', label: '移動中', value: booking.moving_at, isActive: Boolean(booking.moving_at) },
        { key: 'arrived', label: '到着', value: booking.arrived_at, isActive: Boolean(booking.arrived_at) },
        { key: 'started', label: '施術開始', value: booking.started_at, isActive: Boolean(booking.started_at) },
        { key: 'ended', label: '施術終了', value: booking.ended_at, isActive: Boolean(booking.ended_at) },
    ];
}

function isReviewableStatus(status: string): boolean {
    return status === 'therapist_completed' || status === 'completed';
}

function renderConsentLabel(consent: BookingConsentRecord): string {
    switch (consent.consent_type) {
        case 'terms':
            return '利用規約';
        case 'privacy':
            return 'プライバシーポリシー';
        case 'booking_safety':
            return '安全確認';
        default:
            return consent.consent_type;
    }
}

function renderHealthCheckSummary(check: BookingHealthCheckRecord): string {
    const parts = [
        `飲酒 ${check.drinking_status ?? '未回答'}`,
        `怪我 ${formatBooleanLabel(check.has_injury)}`,
        `発熱 ${formatBooleanLabel(check.has_fever)}`,
    ];

    return parts.join(' / ');
}

function renderRefundSummary(refund: BookingRefundRecord): string {
    const amount = refund.processed_amount || refund.approved_amount || refund.requested_amount || 0;
    return `${refundStatusLabel(refund.status)} ${formatCurrency(amount)}`;
}

export function UserBookingDetailPage() {
    const { publicId } = useParams();
    const { token } = useAuth();
    const [booking, setBooking] = useState<BookingDetailRecord | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    usePageTitle(booking ? `${booking.therapist_profile?.public_name ?? '予約'}の詳細` : '予約詳細');

    useEffect(() => {
        let isMounted = true;

        async function loadBooking() {
            if (!token || !publicId) {
                setIsLoading(false);
                return;
            }

            try {
                const payload = await apiRequest<ApiEnvelope<BookingDetailRecord>>(`/bookings/${publicId}`, {
                    token,
                });

                if (!isMounted) {
                    return;
                }

                setBooking(unwrapData(payload));
                setError(null);
            } catch (requestError) {
                if (!isMounted) {
                    return;
                }

                const message =
                    requestError instanceof ApiError
                        ? requestError.message
                        : '予約詳細の取得に失敗しました。';

                setError(message);
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        }

        void loadBooking();

        return () => {
            isMounted = false;
        };
    }, [publicId, token]);

    const timeline = useMemo(() => (booking ? buildTimeline(booking) : []), [booking]);

    if (isLoading) {
        return <LoadingScreen title="予約詳細を読み込み中" message="決済状態、返金、同意記録、安全確認をまとめています。" />;
    }

    if (!booking) {
        return (
            <div className="space-y-6">
                <section className="rounded-[28px] border border-[#f1d4b5] bg-[#fff4e8] px-6 py-5 text-sm text-[#9a4b35]">
                    {error ?? '予約詳細を表示できませんでした。'}
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
                            <span className="rounded-full bg-[#f5efe4] px-3 py-1 text-xs font-semibold text-[#48505a]">
                                {requestTypeLabel(booking.request_type)}
                            </span>
                        </div>
                        <div className="space-y-2">
                            <h1 className="text-3xl font-semibold">
                                {booking.therapist_profile?.public_name ?? booking.counterparty?.display_name ?? '予約詳細'}
                            </h1>
                            <p className="max-w-3xl text-sm leading-7 text-slate-300">
                                {booking.therapist_menu
                                    ? `${booking.therapist_menu.name} / ${booking.therapist_menu.duration_minutes}分`
                                    : 'メニュー情報を確認中'}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Link
                            to="/user/bookings"
                            className="inline-flex items-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8"
                        >
                            予約一覧へ戻る
                        </Link>
                        {isReviewableStatus(booking.status) ? (
                            <Link
                                to={`/user/bookings/${booking.public_id}/review`}
                                className="inline-flex items-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8"
                            >
                                レビューを書く
                            </Link>
                        ) : null}
                        <Link
                            to={`/user/bookings/${booking.public_id}/messages`}
                            className="inline-flex items-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:brightness-105"
                        >
                            メッセージを見る
                        </Link>
                    </div>
                </div>
            </section>

            {error ? (
                <section className="rounded-[24px] border border-[#f1d4b5] bg-[#fff4e8] px-5 py-4 text-sm text-[#9a4b35]">
                    {error}
                </section>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(340px,0.78fr)]">
                <section className="space-y-5">
                    <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-2">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">BOOKING SUMMARY</p>
                                <h2 className="text-2xl font-semibold text-[#17202b]">{buildPrimaryTime(booking)}</h2>
                                <p className="text-sm leading-7 text-[#68707a]">
                                    施術場所: {booking.service_address ? getServiceAddressLabel(booking.service_address) : '未設定'}
                                </p>
                            </div>

                            <div className="rounded-[22px] bg-[#f8f4ed] px-5 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">TOTAL</p>
                                <p className="mt-2 text-2xl font-semibold text-[#17202b]">{formatCurrency(booking.total_amount)}</p>
                            </div>
                        </div>

                        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <div>
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">決済状態</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                    {paymentStatusLabel(booking.current_payment_intent?.status)}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">未読メッセージ</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">{booking.unread_message_count}件</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">返金件数</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">{booking.refund_count}件</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">未解決通報</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">{booking.open_report_count}件</p>
                            </div>
                        </div>
                    </article>

                    <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">TIMELINE</p>
                        <div className="mt-5 grid gap-4">
                            {timeline.map((item) => (
                                <div key={item.key} className="flex items-start gap-4">
                                    <div className={`mt-1 h-3 w-3 rounded-full ${item.isActive ? 'bg-[#b5894d]' : 'bg-[#d9d3c8]'}`} />
                                    <div>
                                        <p className="text-sm font-semibold text-[#17202b]">{item.label}</p>
                                        <p className="mt-1 text-sm text-[#68707a]">{formatDateTime(item.value)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </article>

                    <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">PAYMENT & REFUND</p>
                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                            <div className="rounded-[22px] bg-[#f8f4ed] p-4">
                                <p className="text-sm font-semibold text-[#17202b]">決済</p>
                                <div className="mt-3 space-y-2 text-sm text-[#48505a]">
                                    <div className="flex items-center justify-between gap-4">
                                        <span>支払い予定額</span>
                                        <span className="font-semibold text-[#17202b]">{formatCurrency(booking.total_amount)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-4">
                                        <span>マッチング手数料</span>
                                        <span className="font-semibold text-[#17202b]">{formatCurrency(booking.matching_fee_amount)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-4">
                                        <span>プラットフォーム料</span>
                                        <span className="font-semibold text-[#17202b]">{formatCurrency(booking.platform_fee_amount)}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-[22px] bg-[#f8f4ed] p-4">
                                <p className="text-sm font-semibold text-[#17202b]">返金</p>
                                <div className="mt-3 space-y-2 text-sm text-[#48505a]">
                                    <div className="flex items-center justify-between gap-4">
                                        <span>件数</span>
                                        <span className="font-semibold text-[#17202b]">{booking.refund_breakdown?.refund_count ?? 0}件</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-4">
                                        <span>申請総額</span>
                                        <span className="font-semibold text-[#17202b]">
                                            {formatCurrency(booking.refund_breakdown?.requested_amount_total ?? 0)}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between gap-4">
                                        <span>処理済み総額</span>
                                        <span className="font-semibold text-[#17202b]">
                                            {formatCurrency(booking.refund_breakdown?.processed_amount_total ?? 0)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {booking.refunds.length > 0 ? (
                            <div className="mt-5 grid gap-3">
                                {booking.refunds.map((refund) => (
                                    <div key={refund.public_id} className="rounded-[20px] border border-[#ebe2d3] px-4 py-4">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-semibold text-[#17202b]">{renderRefundSummary(refund)}</p>
                                                <p className="mt-1 text-sm text-[#68707a]">理由: {refund.reason_code ?? '未設定'}</p>
                                            </div>
                                            <p className="text-sm text-[#68707a]">{formatDateTime(refund.processed_at ?? refund.created_at)}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : null}
                    </article>

                    {(booking.consents.length > 0 || booking.health_checks.length > 0) ? (
                        <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">SAFETY RECORDS</p>
                            <div className="mt-5 grid gap-5 md:grid-cols-2">
                                <div className="space-y-3">
                                    <h3 className="text-lg font-semibold text-[#17202b]">同意記録</h3>
                                    {booking.consents.length > 0 ? booking.consents.map((consent) => (
                                        <div key={consent.id} className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                            <p className="text-sm font-semibold text-[#17202b]">{renderConsentLabel(consent)}</p>
                                            <p className="mt-1 text-sm text-[#68707a]">{formatDateTime(consent.consented_at ?? consent.created_at)}</p>
                                        </div>
                                    )) : (
                                        <p className="text-sm text-[#68707a]">まだ同意記録はありません。</p>
                                    )}
                                </div>

                                <div className="space-y-3">
                                    <h3 className="text-lg font-semibold text-[#17202b]">体調確認</h3>
                                    {booking.health_checks.length > 0 ? booking.health_checks.map((check) => (
                                        <div key={check.id} className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                            <p className="text-sm font-semibold text-[#17202b]">{check.role === 'user' ? '利用者' : 'セラピスト'}</p>
                                            <p className="mt-1 text-sm text-[#68707a]">{renderHealthCheckSummary(check)}</p>
                                            {check.notes ? (
                                                <p className="mt-2 text-sm leading-7 text-[#68707a]">{check.notes}</p>
                                            ) : null}
                                        </div>
                                    )) : (
                                        <p className="text-sm text-[#68707a]">まだ体調確認はありません。</p>
                                    )}
                                </div>
                            </div>
                        </article>
                    ) : null}
                </section>

                <aside className="space-y-5">
                    <section className="rounded-[28px] bg-[#fffcf7] p-6 shadow-[0_18px_36px_rgba(23,32,43,0.1)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">DETAILS</p>
                        <div className="mt-4 space-y-4 text-sm text-[#48505a]">
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">相手</p>
                                <p className="mt-1 font-semibold text-[#17202b]">
                                    {booking.counterparty?.display_name ?? booking.therapist_profile?.public_name ?? '確認中'}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">施術場所</p>
                                <p className="mt-1 font-semibold text-[#17202b]">
                                    {booking.service_address ? getServiceAddressLabel(booking.service_address) : '未設定'}
                                </p>
                            </div>
                            {booking.request_expires_at ? (
                                <div>
                                    <p className="text-xs font-semibold text-[#7d6852]">応答期限</p>
                                    <p className="mt-1 font-semibold text-[#17202b]">
                                        {formatDateTime(booking.request_expires_at)}
                                    </p>
                                </div>
                            ) : null}
                            {booking.cancel_reason_note ? (
                                <div>
                                    <p className="text-xs font-semibold text-[#7d6852]">キャンセル理由</p>
                                    <p className="mt-1 text-sm leading-7 text-[#48505a]">{booking.cancel_reason_note}</p>
                                </div>
                            ) : null}
                        </div>

                        <div className="mt-6 space-y-3">
                            {isReviewableStatus(booking.status) ? (
                                <Link
                                    to={`/user/bookings/${booking.public_id}/review`}
                                    className="inline-flex w-full items-center justify-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                                >
                                    レビューを書く
                                </Link>
                            ) : null}
                            <Link
                                to={`/user/bookings/${booking.public_id}/messages`}
                                className="inline-flex w-full items-center justify-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:brightness-105"
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
