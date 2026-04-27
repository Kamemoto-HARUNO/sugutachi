import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { canOpenBookingNoShowFlow } from '../lib/bookingTrouble';
import {
    formatJstDateTime,
    formatJstDateTimeLocalValue,
    parseJstDateTimeLocalInput,
} from '../lib/datetime';
import { formatCurrency, getServiceAddressLabel } from '../lib/discovery';
import type {
    ApiEnvelope,
    BookingConsentRecord,
    BookingDetailRecord,
    BookingHealthCheckRecord,
    BookingRefundRecord,
} from '../lib/types';

interface BookingCancellationPreview {
    cancel_fee_amount: number;
    refund_amount: number;
    policy_code: string;
    policy_label: string;
    payment_action: string;
}

const cancelReasonOptions = [
    { value: 'schedule_conflict', label: '予定の都合がつかない' },
    { value: 'location_issue', label: '場所の都合で対応できない' },
    { value: 'health_issue', label: '体調不良' },
    { value: 'safety_concern', label: '安全上の懸念' },
    { value: 'emergency', label: '急な事情' },
    { value: 'other', label: 'その他' },
];

function statusLabel(
    booking: Pick<BookingDetailRecord, 'status' | 'pending_no_show_report'>,
): string {
    if (booking.pending_no_show_report?.reported_by_role === 'therapist') {
        return '利用者の返答待ち';
    }

    const status = booking.status;

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
            return '利用者の完了確認待ち';
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

function statusTone(booking: Pick<BookingDetailRecord, 'status' | 'pending_no_show_report'>): string {
    if (booking.pending_no_show_report?.reported_by_role === 'therapist') {
        return 'bg-[#fff2dd] text-[#8b5a16]';
    }

    const status = booking.status;

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

function therapistRewardAmount(
    booking: Pick<BookingDetailRecord, 'therapist_net_amount' | 'platform_fee_amount'>,
): number {
    return Math.max(0, booking.therapist_net_amount + booking.platform_fee_amount);
}

function therapistRewardFormulaLabel(
    booking: Pick<BookingDetailRecord, 'actual_duration_minutes' | 'duration_minutes' | 'therapist_menu'>,
): string | null {
    const hourlyRateAmount = booking.therapist_menu?.hourly_rate_amount;

    if (hourlyRateAmount == null) {
        return null;
    }

    const minutes = booking.actual_duration_minutes ?? booking.duration_minutes;
    const durationLabel = booking.actual_duration_minutes != null ? `実働${minutes}分` : `予約${minutes}分`;

    return `時間単価${formatCurrency(hourlyRateAmount)} × ${durationLabel}`;
}

function legacyAuthorizationNotice(
    booking: Pick<BookingDetailRecord, 'uncaptured_extension_amount'>,
): string | null {
    const uncapturedAmount = booking.uncaptured_extension_amount ?? 0;

    if (uncapturedAmount <= 0) {
        return null;
    }

    return `旧仕様の予約のため、延長ぶん ${formatCurrency(uncapturedAmount)} は今回の与信上限を超えるため請求していません。`;
}

function formatNegativeCurrency(amount: number): string {
    return `-${formatCurrency(amount)}`;
}

function parseCoordinate(value: number | string | null | undefined): number | null {
    if (value == null || value === '') {
        return null;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
}

function buildDetailedServiceAddress(address: BookingDetailRecord['service_address']): string | null {
    if (!address) {
        return null;
    }

    const parts = [
        address.postal_code ? `〒${address.postal_code}` : null,
        address.prefecture,
        address.city,
        address.address_line,
        address.building,
    ].filter((part): part is string => Boolean(part));

    return parts.length > 0 ? parts.join(' ') : null;
}

function buildServiceAddressMapEmbedUrl(address: BookingDetailRecord['service_address']): string | null {
    const latitude = parseCoordinate(address?.lat);
    const longitude = parseCoordinate(address?.lng);

    if (latitude === null || longitude === null) {
        return null;
    }

    const lngDelta = 0.008;
    const latDelta = 0.006;
    const params = new URLSearchParams({
        bbox: [
            longitude - lngDelta,
            latitude - latDelta,
            longitude + lngDelta,
            latitude + latDelta,
        ].join(','),
        layer: 'mapnik',
        marker: `${latitude},${longitude}`,
    });

    return `https://www.openstreetmap.org/export/embed.html?${params.toString()}`;
}

function buildServiceAddressGoogleMapUrl(address: BookingDetailRecord['service_address']): string | null {
    const latitude = parseCoordinate(address?.lat);
    const longitude = parseCoordinate(address?.lng);

    if (latitude !== null && longitude !== null) {
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
    }

    const detailedAddress = buildDetailedServiceAddress(address);

    if (!detailedAddress) {
        return null;
    }

    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(detailedAddress)}`;
}

function formatBufferSummary(booking: Pick<BookingDetailRecord, 'buffer_before_minutes' | 'buffer_after_minutes'>): string {
    const beforeMinutes = booking.buffer_before_minutes;
    const afterMinutes = booking.buffer_after_minutes;

    if (beforeMinutes === 0 && afterMinutes === 0) {
        return '予約前後の調整時間は設定されていません。';
    }

    if (beforeMinutes === afterMinutes) {
        return `予約の前後にそれぞれ ${beforeMinutes}分 の移動・準備時間を確保しています。`;
    }

    return `開始前 ${beforeMinutes}分 / 終了後 ${afterMinutes}分 の移動・準備時間を確保しています。`;
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
    return formatJstDateTime(value, {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }) ?? '未設定';
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
        { key: 'moving', label: '移動開始', value: booking.moving_at, isActive: Boolean(booking.moving_at) },
        { key: 'arrived', label: '到着', value: booking.arrived_at, isActive: Boolean(booking.arrived_at) },
        { key: 'started', label: '施術開始', value: booking.started_at, isActive: Boolean(booking.started_at) },
        { key: 'ended', label: '施術終了', value: booking.ended_at, isActive: Boolean(booking.ended_at) },
        { key: 'completed', label: '完了', value: booking.completed_at ?? null, isActive: Boolean(booking.completed_at) },
    ];
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

function nextStageAction(booking: BookingDetailRecord): { label: string; path: string } | null {
    switch (booking.status) {
        case 'accepted':
            return { label: '移動開始を記録', path: 'moving' };
        case 'moving':
            return { label: '到着を記録', path: 'arrived' };
        case 'arrived':
            return { label: '施術開始を記録', path: 'start' };
        default:
            return null;
    }
}

function canManageCompletionWindow(status: string): boolean {
    return ['arrived', 'in_progress', 'therapist_completed'].includes(status);
}

function completionActionLabel(status: string): string {
    return status === 'therapist_completed' ? '施術時間を更新する' : '施術完了を記録';
}

function formatDateTimeLocalValue(value: string | null): string {
    return formatJstDateTimeLocalValue(value);
}

function parseDateTimeInputValue(value: string): Date | null {
    if (value.trim().length === 0) {
        return null;
    }

    return parseJstDateTimeLocalInput(value);
}

function floorDateToMinute(date: Date): Date {
    return new Date(Math.floor(date.getTime() / 60_000) * 60_000);
}

function openDateTimePicker(input: HTMLInputElement | null) {
    if (!input) {
        return;
    }

    input.focus();

    if (typeof input.showPicker === 'function') {
        try {
            input.showPicker();
            return;
        } catch {
            // Fall back to the native click behavior when showPicker is unavailable.
        }
    }

    input.click();
}

function validateCompletionWindowInputs(
    booking: BookingDetailRecord,
    startedAtInput: string,
    endedAtInput: string,
): string | null {
    const startedAt = parseDateTimeInputValue(startedAtInput);
    const endedAt = parseDateTimeInputValue(endedAtInput);

    if (!startedAt || !endedAt) {
        return '開始時刻と終了時刻を正しく入力してください。';
    }

    if (booking.arrived_at) {
        const arrivedAt = floorDateToMinute(new Date(booking.arrived_at));

        if (floorDateToMinute(startedAt) < arrivedAt) {
            return '開始時刻は到着時刻より前にできません。';
        }
    }

    const completionUpperBound = new Date(
        booking.status === 'therapist_completed'
            ? booking.service_completion_reported_at ?? booking.ended_at ?? new Date().toISOString()
            : new Date().toISOString(),
    );

    if (startedAt > completionUpperBound) {
        return '開始時刻は施術完了を記録した時刻より後にできません。';
    }

    if (endedAt > completionUpperBound) {
        return booking.status === 'therapist_completed'
            ? '終了時刻は、最初に施術終了を記録した時刻より後にできません。'
            : '終了時刻は現在時刻より後にできません。';
    }

    if (endedAt <= startedAt) {
        return '終了時刻は開始時刻より後にしてください。';
    }

    return null;
}

function canTherapistCancel(status: string): boolean {
    return ['accepted', 'moving', 'arrived'].includes(status);
}

function paymentActionLabel(action: string | null | undefined): string {
    switch (action) {
        case 'void_authorization':
            return 'カード与信を取消';
        case 'capture_full_amount':
            return '全額を決済';
        case 'capture_cancel_fee_and_refund_remaining':
            return 'キャンセル料を確定して差額返金';
        default:
            return '未設定';
    }
}

export function TherapistBookingDetailPage() {
    const { publicId } = useParams();
    const { token } = useAuth();
    const [booking, setBooking] = useState<BookingDetailRecord | null>(null);
    const [cancellationPreview, setCancellationPreview] = useState<BookingCancellationPreview | null>(null);
    const [cancelReasonCode, setCancelReasonCode] = useState('schedule_conflict');
    const [cancelReasonNote, setCancelReasonNote] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmittingStage, setIsSubmittingStage] = useState(false);
    const [isSubmittingCompletionWindow, setIsSubmittingCompletionWindow] = useState(false);
    const [arrivalConfirmationCode, setArrivalConfirmationCode] = useState('');
    const [completionStartedAtInput, setCompletionStartedAtInput] = useState('');
    const [completionEndedAtInput, setCompletionEndedAtInput] = useState('');
    const [isLoadingCancelPreview, setIsLoadingCancelPreview] = useState(false);
    const [isCanceling, setIsCanceling] = useState(false);
    const completionStartedAtRef = useRef<HTMLInputElement | null>(null);
    const completionEndedAtRef = useRef<HTMLInputElement | null>(null);

    usePageTitle(booking ? `${booking.counterparty?.display_name ?? '予約'}の詳細` : 'セラピスト予約詳細');
    useToastOnMessage(successMessage, 'success');
    useToastOnMessage(error, 'error');

    const loadBooking = useCallback(async () => {
        if (!token || !publicId) {
            setIsLoading(false);
            return;
        }

        const payload = await apiRequest<ApiEnvelope<BookingDetailRecord>>(`/bookings/${publicId}`, {
            token,
        });

        setBooking(unwrapData(payload));
    }, [publicId, token]);

    useEffect(() => {
        let isMounted = true;

        void loadBooking()
            .catch((requestError: unknown) => {
                if (!isMounted) {
                    return;
                }

                const message =
                    requestError instanceof ApiError
                        ? requestError.message
                        : '予約詳細の取得に失敗しました。';

                setError(message);
            })
            .finally(() => {
                if (isMounted) {
                    setIsLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [loadBooking]);

    useEffect(() => {
        let isMounted = true;

        async function loadCancelPreview() {
            if (!token || !booking || !canTherapistCancel(booking.status) || booking.pending_no_show_report) {
                setCancellationPreview(null);
                return;
            }

            setIsLoadingCancelPreview(true);

            try {
                const payload = await apiRequest<ApiEnvelope<BookingCancellationPreview>>(`/bookings/${booking.public_id}/cancel-preview`, {
                    method: 'POST',
                    token,
                });

                if (!isMounted) {
                    return;
                }

                setCancellationPreview(unwrapData(payload));
            } catch (requestError) {
                if (!isMounted) {
                    return;
                }

                const message =
                    requestError instanceof ApiError
                        ? requestError.message
                        : 'キャンセル条件の取得に失敗しました。';

                setError(message);
                setCancellationPreview(null);
            } finally {
                if (isMounted) {
                    setIsLoadingCancelPreview(false);
                }
            }
        }

        void loadCancelPreview();

        return () => {
            isMounted = false;
        };
    }, [booking, token]);

    const timeline = useMemo(() => (booking ? buildTimeline(booking) : []), [booking]);
    const pendingTherapistNoShowReport = useMemo(
        () => (booking?.pending_no_show_report?.reported_by_role === 'therapist' ? booking.pending_no_show_report : null),
        [booking],
    );
    const canOpenNoShowFlow = useMemo(
        () => (booking ? canOpenBookingNoShowFlow(booking, 'therapist') : false),
        [booking],
    );
    const nextAction = booking ? nextStageAction(booking) : null;
    const canEditCompletionWindow = booking ? canManageCompletionWindow(booking.status) : false;
    const completionWindowBounds = useMemo(() => {
        if (!booking || !canManageCompletionWindow(booking.status)) {
            return null;
        }

        const lowerBound = booking.arrived_at ? formatDateTimeLocalValue(booking.arrived_at) : '';
        const upperBound = formatDateTimeLocalValue(
            booking.status === 'therapist_completed'
                ? booking.service_completion_reported_at ?? booking.ended_at ?? new Date().toISOString()
                : new Date().toISOString(),
        );

        return {
            startedAtMin: lowerBound || undefined,
            startedAtMax: completionEndedAtInput.trim() || upperBound || undefined,
            endedAtMin: completionStartedAtInput.trim() || lowerBound || undefined,
            endedAtMax: upperBound || undefined,
        };
    }, [
        booking,
        completionEndedAtInput,
        completionStartedAtInput,
    ]);

    useEffect(() => {
        if (!booking || !canManageCompletionWindow(booking.status)) {
            return;
        }

        const upperBound = booking.service_completion_reported_at
            ?? booking.ended_at
            ?? new Date().toISOString();

        setCompletionStartedAtInput(formatDateTimeLocalValue(
            booking.started_at
            ?? booking.arrived_at
            ?? booking.scheduled_start_at
            ?? upperBound,
        ));
        setCompletionEndedAtInput(formatDateTimeLocalValue(
            booking.ended_at ?? upperBound,
        ));
    }, [
        booking?.public_id,
        booking?.status,
        booking?.started_at,
        booking?.ended_at,
        booking?.arrived_at,
        booking?.scheduled_start_at,
        booking?.service_completion_reported_at,
    ]);

    async function reloadAfterMutation(message: string) {
        await loadBooking();
        setSuccessMessage(message);
        setError(null);
    }

    async function handleStageAction() {
        if (!token || !booking || !nextAction || isSubmittingStage) {
            return;
        }

        setIsSubmittingStage(true);
        setError(null);
        setSuccessMessage(null);

        try {
            await apiRequest<ApiEnvelope<BookingDetailRecord>>(`/bookings/${booking.public_id}/${nextAction.path}`, {
                method: 'POST',
                token,
                body: nextAction.path === 'arrived'
                    ? { arrival_confirmation_code: arrivalConfirmationCode.trim() }
                    : undefined,
            });

            const messageMap: Record<string, string> = {
                moving: '移動開始を記録しました。利用者の画面に到着確認コードを表示しています。',
                arrived: '到着を記録しました。',
                start: '施術開始を記録しました。',
                complete: '施術完了を記録しました。利用者の確認待ちになります。',
            };

            await reloadAfterMutation(messageMap[nextAction.path] ?? '予約状態を更新しました。');
            setArrivalConfirmationCode('');
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '予約状態の更新に失敗しました。';

            setError(message);
        } finally {
            setIsSubmittingStage(false);
        }
    }

    async function handleCompletionWindowSubmit() {
        if (!token || !booking || !canManageCompletionWindow(booking.status) || isSubmittingCompletionWindow) {
            return;
        }

        if (completionStartedAtInput.trim().length === 0 || completionEndedAtInput.trim().length === 0) {
            setError('開始時刻と終了時刻を入力してください。');
            return;
        }

        const validationMessage = validateCompletionWindowInputs(
            booking,
            completionStartedAtInput,
            completionEndedAtInput,
        );

        if (validationMessage) {
            setError(validationMessage);
            return;
        }

        setIsSubmittingCompletionWindow(true);
        setError(null);
        setSuccessMessage(null);

        try {
            if (booking.status === 'therapist_completed') {
                await apiRequest<ApiEnvelope<BookingDetailRecord>>(`/bookings/${booking.public_id}/completion-window`, {
                    method: 'PATCH',
                    token,
                    body: {
                        started_at: completionStartedAtInput,
                        ended_at: completionEndedAtInput,
                    },
                });

                await reloadAfterMutation('施術時間を更新しました。利用者へ最新の金額を通知しています。');
            } else {
                await apiRequest<ApiEnvelope<BookingDetailRecord>>(`/bookings/${booking.public_id}/complete`, {
                    method: 'POST',
                    token,
                    body: {
                        started_at: completionStartedAtInput,
                        ended_at: completionEndedAtInput,
                    },
                });

                await reloadAfterMutation('施術完了を記録しました。利用者の確認待ちになります。');
            }
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '施術時間の更新に失敗しました。';

            setError(message);
        } finally {
            setIsSubmittingCompletionWindow(false);
        }
    }

    async function handleCancel() {
        if (!token || !booking || !canTherapistCancel(booking.status) || isCanceling) {
            return;
        }

        setIsCanceling(true);
        setError(null);
        setSuccessMessage(null);

        try {
            await apiRequest<{ data: { booking: BookingDetailRecord; cancellation: BookingCancellationPreview } }>(
                `/bookings/${booking.public_id}/cancel`,
                {
                    method: 'POST',
                    token,
                    body: {
                        reason_code: cancelReasonCode,
                        reason_note: cancelReasonNote,
                    },
                },
            );

            await reloadAfterMutation('セラピスト都合キャンセルを処理しました。利用者へ理由通知も送信されています。');
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : 'キャンセル処理に失敗しました。';

            setError(message);
        } finally {
            setIsCanceling(false);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="予約詳細を読み込み中" message="進行状況、決済、返金、安全記録をまとめています。" />;
    }

    if (!booking) {
        return (
            <div className="space-y-6">
                <section className="rounded-[28px] border border-[#f1d4b5] bg-[#fff4e8] px-6 py-5 text-sm text-[#9a4b35]">
                    {error ?? '予約詳細を表示できませんでした。'}
                </section>
                <Link
                    to="/therapist/bookings"
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
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(booking)}`}>
                                {statusLabel(booking)}
                            </span>
                        </div>
                        <div className="space-y-2">
                            <h1 className="text-3xl font-semibold">
                                {booking.counterparty?.display_name ?? '利用者情報を確認中'}
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
                            to="/therapist/bookings"
                            className="inline-flex items-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8"
                        >
                            予約一覧へ戻る
                        </Link>
                        <Link
                            to={`/therapist/bookings/${booking.public_id}/messages`}
                            className="inline-flex items-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:brightness-105"
                        >
                            メッセージを見る
                        </Link>
                    </div>
                </div>
            </section>



            <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.82fr)]">
                <section className="space-y-5">
                    <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-2">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">予約サマリー</p>
                                <h2 className="text-2xl font-semibold text-[#17202b]">{buildPrimaryTime(booking)}</h2>
                                <p className="text-sm leading-7 text-[#68707a]">
                                    待ち合わせ場所: {booking.service_address
                                        ? buildDetailedServiceAddress(booking.service_address) ?? getServiceAddressLabel(booking.service_address)
                                        : '未設定'}
                                </p>
                            </div>

                            <div className="rounded-[22px] bg-[#f8f4ed] px-5 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">受取見込み</p>
                                <p className="mt-2 text-2xl font-semibold text-[#17202b]">{formatCurrency(booking.therapist_net_amount)}</p>
                            </div>
                        </div>
                    </article>

                    <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">進行状況</p>
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

                    {(booking.consents.length > 0 || booking.health_checks.length > 0) ? (
                        <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">安全記録</p>
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
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">進行アクション</p>
                        <div className="mt-4 space-y-4">
                            {nextAction ? (
                                <>
                                    <div className="rounded-[22px] bg-[#f8f4ed] px-4 py-4">
                                        <p className="text-sm font-semibold text-[#17202b]">{nextAction.label}</p>
                                        <p className="mt-2 text-sm leading-7 text-[#68707a]">
                                            {nextAction.path === 'arrived'
                                                ? '利用者の画面に表示されている4桁コードを入力すると、到着ステータスに進めます。'
                                                : '進行ステータスを更新すると、予約一覧や相手側の表示もすぐに追従します。'}
                                        </p>
                                        {nextAction.path === 'arrived' ? (
                                            <label className="mt-4 block space-y-2">
                                                <span className="text-xs font-semibold tracking-wide text-[#7d6852]">到着確認コード</span>
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    pattern="[0-9]*"
                                                    maxLength={4}
                                                    value={arrivalConfirmationCode}
                                                    onChange={(event) => setArrivalConfirmationCode(event.target.value.replace(/\D/g, '').slice(0, 4))}
                                                    className="w-full rounded-[18px] border border-[#e4d7c2] bg-white px-4 py-3 text-lg font-semibold tracking-[0.3em] text-[#17202b] outline-none transition focus:border-[#c6a16a]"
                                                    placeholder="0000"
                                                />
                                            </label>
                                        ) : null}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            void handleStageAction();
                                        }}
                                        disabled={isSubmittingStage || (nextAction.path === 'arrived' && arrivalConfirmationCode.trim().length !== 4)}
                                        className="inline-flex w-full items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243447] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {isSubmittingStage ? '更新中...' : nextAction.label}
                                    </button>
                                </>
                            ) : (
                                <div className="rounded-[22px] bg-[#f8f4ed] px-4 py-4">
                                    <p className="text-sm font-semibold text-[#17202b]">この予約の進行アクションはありません。</p>
                                    <p className="mt-2 text-sm leading-7 text-[#68707a]">
                                        進行が完了したか、キャンセル・終了済みの状態です。必要ならメッセージや返金状況を確認します。
                                    </p>
                                </div>
                            )}

                            {canEditCompletionWindow ? (
                                <div className="rounded-[22px] bg-[#f8f4ed] px-4 py-4">
                                    <p className="text-sm font-semibold text-[#17202b]">
                                        {booking.status === 'therapist_completed' ? '施術時間を見直す' : '施術完了を記録する'}
                                    </p>
                                    <p className="mt-2 text-sm leading-7 text-[#68707a]">
                                        開始時刻と終了時刻から15分単位で切り捨てて最終金額を計算します。延長は予約時間に対して最大60分までです。
                                    </p>

                                    <div className="mt-4 grid gap-3">
                                        <label className="space-y-2">
                                            <span className="text-xs font-semibold tracking-wide text-[#7d6852]">開始時刻</span>
                                            <div className="relative">
                                                <input
                                                    ref={completionStartedAtRef}
                                                    type="datetime-local"
                                                    value={completionStartedAtInput}
                                                    min={completionWindowBounds?.startedAtMin}
                                                    max={completionWindowBounds?.startedAtMax}
                                                    onChange={(event) => setCompletionStartedAtInput(event.target.value)}
                                                    className="w-full rounded-[16px] border border-[#e4d7c2] bg-white px-4 py-3 pr-12 text-sm text-[#17202b] outline-none transition focus:border-[#c6a16a]"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => openDateTimePicker(completionStartedAtRef.current)}
                                                    className="absolute inset-y-0 right-3 inline-flex items-center justify-center text-[#7d6852] transition hover:text-[#17202b]"
                                                    aria-label="開始時刻の日時ピッカーを開く"
                                                >
                                                    <svg
                                                        aria-hidden="true"
                                                        viewBox="0 0 24 24"
                                                        className="h-5 w-5"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth="1.8"
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                    >
                                                        <path d="M8 2v4" />
                                                        <path d="M16 2v4" />
                                                        <rect x="3" y="5" width="18" height="16" rx="3" />
                                                        <path d="M3 10h18" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </label>
                                        <label className="space-y-2">
                                            <span className="text-xs font-semibold tracking-wide text-[#7d6852]">終了時刻</span>
                                            <div className="relative">
                                                <input
                                                    ref={completionEndedAtRef}
                                                    type="datetime-local"
                                                    value={completionEndedAtInput}
                                                    min={completionWindowBounds?.endedAtMin}
                                                    max={completionWindowBounds?.endedAtMax}
                                                    onChange={(event) => setCompletionEndedAtInput(event.target.value)}
                                                    className="w-full rounded-[16px] border border-[#e4d7c2] bg-white px-4 py-3 pr-12 text-sm text-[#17202b] outline-none transition focus:border-[#c6a16a]"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => openDateTimePicker(completionEndedAtRef.current)}
                                                    className="absolute inset-y-0 right-3 inline-flex items-center justify-center text-[#7d6852] transition hover:text-[#17202b]"
                                                    aria-label="終了時刻の日時ピッカーを開く"
                                                >
                                                    <svg
                                                        aria-hidden="true"
                                                        viewBox="0 0 24 24"
                                                        className="h-5 w-5"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth="1.8"
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                    >
                                                        <path d="M8 2v4" />
                                                        <path d="M16 2v4" />
                                                        <rect x="3" y="5" width="18" height="16" rx="3" />
                                                        <path d="M3 10h18" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </label>
                                    </div>

                                    <p className="mt-3 text-xs leading-6 text-[#7d6852]">
                                        入力欄右のカレンダーから日時を選べます。開始時刻は到着時刻より前にできません。終了時刻は、最初に施術終了を記録した時刻より後にはできません。
                                    </p>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            void handleCompletionWindowSubmit();
                                        }}
                                        disabled={
                                            isSubmittingCompletionWindow
                                            || completionStartedAtInput.trim().length === 0
                                            || completionEndedAtInput.trim().length === 0
                                        }
                                        className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243447] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {isSubmittingCompletionWindow ? '更新中...' : completionActionLabel(booking.status)}
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    </section>

                    <section className="rounded-[28px] bg-[#fffcf7] p-6 shadow-[0_18px_36px_rgba(23,32,43,0.1)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">決済と返金</p>
                        <div className="mt-5 grid gap-4">
                            <div className="rounded-[22px] bg-[#f8f4ed] p-4">
                                <p className="text-sm font-semibold text-[#17202b]">決済</p>
                                <div className="mt-3 space-y-3">
                                    <div className="rounded-[18px] bg-white/70 px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">受取予定額</p>
                                        <p className="mt-2 text-2xl font-semibold text-[#17202b]">
                                            {formatCurrency(booking.therapist_net_amount)}
                                        </p>
                                    </div>
                                    <div className="space-y-2 text-sm text-[#48505a]">
                                        <div className="flex items-center justify-between gap-4">
                                            <div>
                                                <span>セラピスト謝礼</span>
                                                {therapistRewardFormulaLabel(booking) ? (
                                                    <p className="mt-1 text-xs text-[#68707a]">（{therapistRewardFormulaLabel(booking)}）</p>
                                                ) : null}
                                                {legacyAuthorizationNotice(booking) ? (
                                                    <p className="mt-1 text-xs text-[#9a4b35]">{legacyAuthorizationNotice(booking)}</p>
                                                ) : null}
                                            </div>
                                            <span className="font-semibold text-[#17202b]">{formatCurrency(therapistRewardAmount(booking))}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-4">
                                            <span>プラットフォーム料金</span>
                                            <span className="font-semibold text-[#9a4b35]">{formatNegativeCurrency(booking.platform_fee_amount)}</span>
                                        </div>
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
                    </section>

                    <section className="rounded-[28px] bg-[#fffcf7] p-6 shadow-[0_18px_36px_rgba(23,32,43,0.1)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">詳細情報</p>
                        <div className="mt-4 space-y-4 text-sm text-[#48505a]">
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">利用者</p>
                                <p className="mt-1 font-semibold text-[#17202b]">
                                    {booking.counterparty?.display_name ?? '確認中'}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">待ち合わせ場所</p>
                                <p className="mt-1 font-semibold text-[#17202b]">
                                    {booking.service_address ? getServiceAddressLabel(booking.service_address) : '未設定'}
                                </p>
                                {buildDetailedServiceAddress(booking.service_address) ? (
                                    <p className="mt-2 text-sm leading-7 text-[#48505a]">
                                        {buildDetailedServiceAddress(booking.service_address)}
                                    </p>
                                ) : null}
                                {booking.service_address?.access_notes ? (
                                    <p className="mt-2 text-sm leading-7 text-[#48505a]">補足: {booking.service_address.access_notes}</p>
                                ) : null}
                                {buildServiceAddressGoogleMapUrl(booking.service_address) ? (
                                    <a
                                        href={buildServiceAddressGoogleMapUrl(booking.service_address) ?? undefined}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="mt-3 inline-flex items-center rounded-full border border-[#d9c9ae] px-4 py-2 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                                    >
                                        マップで開く
                                    </a>
                                ) : null}
                                {buildServiceAddressMapEmbedUrl(booking.service_address) ? (
                                    <div className="mt-3 overflow-hidden rounded-[20px] border border-[#e6dccd] bg-[#f8f4ed]">
                                        <iframe
                                            title="待ち合わせ場所の地図"
                                            src={buildServiceAddressMapEmbedUrl(booking.service_address) ?? undefined}
                                            className="h-48 w-full border-0"
                                            loading="lazy"
                                            referrerPolicy="no-referrer-when-downgrade"
                                        />
                                    </div>
                                ) : null}
                            </div>
                            {booking.request_type === 'scheduled' ? (
                                <div>
                                    <p className="text-xs font-semibold text-[#7d6852]">予約前後の移動・準備時間</p>
                                    <p className="mt-1 font-semibold text-[#17202b]">{formatBufferSummary(booking)}</p>
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
                            {pendingTherapistNoShowReport ? (
                                <div className="rounded-[20px] border border-[#ead8b8] bg-[#fff9ef] px-4 py-4 text-sm text-[#48505a]">
                                    <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">未着申告の確認待ち</p>
                                    <p className="mt-2 leading-7">
                                        利用者へ未着申告を送信済みです。返答があるまで請求は確定しません。
                                    </p>
                                    {pendingTherapistNoShowReport.reason_note ? (
                                        <p className="mt-2 text-sm leading-7 text-[#48505a]">
                                            送信したメモ: {pendingTherapistNoShowReport.reason_note}
                                        </p>
                                    ) : null}
                                </div>
                            ) : null}
                            {canOpenNoShowFlow ? (
                                <Link
                                    to={`/therapist/bookings/${booking.public_id}/no-show`}
                                    className="inline-flex w-full items-center justify-center rounded-full border border-[#e6b36d] bg-[#fff8ee] px-5 py-3 text-sm font-semibold text-[#8c5b19] transition hover:bg-[#fff1d9]"
                                >
                                    来ない・連絡が取れない
                                </Link>
                            ) : null}
                            <Link
                                to={`/therapist/bookings/${booking.public_id}/messages`}
                                className="inline-flex w-full items-center justify-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:brightness-105"
                            >
                                メッセージを見る
                            </Link>
                            <Link
                                to="/therapist/bookings"
                                className="inline-flex w-full items-center justify-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                            >
                                予約一覧へ戻る
                            </Link>
                        </div>
                    </section>

                    {canTherapistCancel(booking.status) && !pendingTherapistNoShowReport ? (
                        <section className="rounded-[28px] border border-[#f0d6a4] bg-[#fff7e8] p-6">
                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">セラピスト都合キャンセル</p>
                            <div className="mt-4 space-y-4">
                                <div>
                                    <h2 className="text-xl font-semibold text-[#17202b]">セラピスト都合キャンセル</h2>
                                    <p className="mt-2 text-sm leading-7 text-[#475569]">
                                        利用者へ理由を通知し、状況に応じた返金処理を自動で進めます。キャンセル回数はプロフィール側の運用指標にも反映されます。
                                    </p>
                                </div>

                                {isLoadingCancelPreview ? (
                                    <div className="rounded-[20px] border border-[#e0cda8] bg-white px-4 py-4 text-sm text-[#475569]">
                                        キャンセル条件を確認中...
                                    </div>
                                ) : cancellationPreview ? (
                                    <div className="rounded-[20px] border border-[#e0cda8] bg-white px-4 py-4 text-sm text-[#48505a]">
                                        <div className="flex items-center justify-between gap-4">
                                            <span>ポリシー</span>
                                            <span className="font-semibold text-[#17202b]">{cancellationPreview.policy_label}</span>
                                        </div>
                                        <div className="mt-2 flex items-center justify-between gap-4">
                                            <span>利用者への返金額</span>
                                            <span className="font-semibold text-[#17202b]">{formatCurrency(cancellationPreview.refund_amount)}</span>
                                        </div>
                                        <div className="mt-2 flex items-center justify-between gap-4">
                                            <span>決済処理</span>
                                            <span className="font-semibold text-[#17202b]">{paymentActionLabel(cancellationPreview.payment_action)}</span>
                                        </div>
                                    </div>
                                ) : null}

                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-[#17202b]">理由カテゴリ</span>
                                    <select
                                        value={cancelReasonCode}
                                        onChange={(event) => {
                                            setCancelReasonCode(event.target.value);
                                        }}
                                        className="w-full rounded-[16px] border border-[#d8c39b] bg-white px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b38a44]"
                                    >
                                        {cancelReasonOptions.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-[#17202b]">利用者へ伝える理由</span>
                                    <textarea
                                        value={cancelReasonNote}
                                        onChange={(event) => {
                                            setCancelReasonNote(event.target.value);
                                        }}
                                        rows={5}
                                        placeholder="例: 体調不良のため本日の対応が難しくなりました。ご迷惑をおかけして申し訳ありません。"
                                        className="w-full rounded-[18px] border border-[#d8c39b] bg-white px-4 py-3 text-sm leading-7 text-[#17202b] outline-none transition focus:border-[#b38a44]"
                                    />
                                </label>

                                <button
                                    type="button"
                                    onClick={() => {
                                        void handleCancel();
                                    }}
                                    disabled={isCanceling || cancelReasonNote.trim().length === 0}
                                    className="inline-flex w-full items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243447] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isCanceling ? 'キャンセル処理中...' : 'この予約をキャンセルする'}
                                </button>
                            </div>
                        </section>
                    ) : null}
                </aside>
            </div>
        </div>
    );
}
