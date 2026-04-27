import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { buildJstDateValue, formatJstDateTime, formatJstDateTimeLocalValue } from '../lib/datetime';
import { formatCurrency, getServiceAddressLabel } from '../lib/discovery';
import { formatDateTime } from '../lib/therapist';
import type {
    ApiEnvelope,
    BookingDetailRecord,
    TherapistBookingRequestRecord,
} from '../lib/types';

function requestTypeLabel(value: 'on_demand' | 'scheduled'): string {
    return value === 'scheduled' ? '予定予約' : '今すぐ';
}

function placeTypeLabel(value: string | null | undefined): string {
    switch (value) {
        case 'home':
            return '自宅';
        case 'hotel':
            return 'ホテル';
        case 'office':
            return 'オフィス';
        case 'other':
            return 'その他';
        default:
            return '場所未設定';
    }
}

function countdownTone(minutes: number | null): string {
    if (minutes == null) {
        return 'border-white/10 bg-white/5 text-slate-200';
    }

    if (minutes <= 30) {
        return 'border-rose-300/40 bg-rose-300/10 text-rose-100';
    }

    if (minutes <= 90) {
        return 'border-amber-300/40 bg-amber-300/10 text-amber-100';
    }

    return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100';
}

function formatRemainingLabel(seconds: number | null): string {
    if (seconds == null) {
        return '期限なし';
    }

    if (seconds <= 0) {
        return '期限切れ';
    }

    const minutes = Math.ceil(seconds / 60);

    if (minutes < 60) {
        return `残り${minutes}分`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (remainingMinutes === 0) {
        return `残り${hours}時間`;
    }

    return `残り${hours}時間${remainingMinutes}分`;
}

function buildRequestDetailPath(publicId: string, search: string): string {
    return search ? `/therapist/requests/${publicId}${search}` : `/therapist/requests/${publicId}`;
}

function buildRequestListPath(search: string): string {
    const params = new URLSearchParams(search);
    params.set('group', 'requested');
    params.delete('request_type');

    const query = params.toString();

    return query ? `/therapist/bookings?${query}` : '/therapist/bookings?group=requested';
}

function buildRequestMeetingPlace(address: BookingDetailRecord['service_address']): string {
    if (!address) {
        return '未設定';
    }

    const parts = [address.prefecture, address.city].filter(Boolean);

    return parts.length > 0 ? parts.join(' ') : getServiceAddressLabel(address);
}

function formatRequestYear(value: string): string {
    const year = new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
    })
        .formatToParts(new Date(value))
        .find((part) => part.type === 'year')
        ?.value;

    return year ? `${year}年` : '';
}

function formatRequestDateLabel(value: string): string {
    const parts = new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo',
        month: 'numeric',
        day: 'numeric',
        weekday: 'short',
    }).formatToParts(new Date(value));

    const month = parts.find((part) => part.type === 'month')?.value ?? '';
    const day = parts.find((part) => part.type === 'day')?.value ?? '';
    const weekday = parts.find((part) => part.type === 'weekday')?.value ?? '';

    return `${month}月${day}日(${weekday})`;
}

function formatRequestTimeLabel(value: string): string {
    return new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(new Date(value));
}

function renderRequestTimeRange(request: TherapistBookingRequestRecord) {
    if (request.request_type === 'on_demand') {
        return (
            <>
                <span className="block">{formatRequestYear(request.created_at)}</span>
                <span className="mt-1 block">{formatRequestDateLabel(request.created_at)} {formatRequestTimeLabel(request.created_at)}</span>
            </>
        );
    }

    if (!request.scheduled_start_at || !request.scheduled_end_at) {
        return '開始時刻を確認中';
    }

    const sameDay = buildJstDateValue(request.scheduled_start_at) === buildJstDateValue(request.scheduled_end_at);
    const sameYear = formatRequestYear(request.scheduled_start_at) === formatRequestYear(request.scheduled_end_at);

    return (
        <>
            <span className="block">{formatRequestYear(request.scheduled_start_at)}</span>
            <span className="mt-1 block">
                {formatRequestDateLabel(request.scheduled_start_at)} {formatRequestTimeLabel(request.scheduled_start_at)} 〜
                {sameDay ? ` ${formatRequestTimeLabel(request.scheduled_end_at)}` : ''}
            </span>
            {!sameDay ? (
                <span className="block">
                    {sameYear ? '' : `${formatRequestYear(request.scheduled_end_at)} `}
                    {formatRequestDateLabel(request.scheduled_end_at)} {formatRequestTimeLabel(request.scheduled_end_at)}
                </span>
            ) : null}
        </>
    );
}

function renderScheduledTimeRange(startAt: string | null, endAt: string | null) {
    if (!startAt || !endAt) {
        return '開始時刻を確認中';
    }

    const sameDay = buildJstDateValue(startAt) === buildJstDateValue(endAt);
    const sameYear = formatRequestYear(startAt) === formatRequestYear(endAt);

    return (
        <>
            <span className="block">{formatRequestYear(startAt)}</span>
            <span className="mt-1 block">
                {formatRequestDateLabel(startAt)} {formatRequestTimeLabel(startAt)} 〜
                {sameDay ? ` ${formatRequestTimeLabel(endAt)}` : ''}
            </span>
            {!sameDay ? (
                <span className="block">
                    {sameYear ? '' : `${formatRequestYear(endAt)} `}
                    {formatRequestDateLabel(endAt)} {formatRequestTimeLabel(endAt)}
                </span>
            ) : null}
        </>
    );
}

function adjustmentTitle(booking: BookingDetailRecord): string {
    return booking.pending_adjustment_proposal ? '利用者の確認待ちです' : '時間を変更して提案';
}

function adjustmentDescription(booking: BookingDetailRecord): string {
    if (booking.pending_adjustment_proposal) {
        return '提案済みの開始時間・終了時間で利用者の返答を待っています。必要なら時間や予約前後の移動・準備時間を更新できます。';
    }

    return 'このままでは難しい場合だけ、開始時間と終了時間を調整して利用者へ提案できます。利用者が確認OKを押すまで予約は確定しません。';
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

export function TherapistRequestsPage() {
    const { token } = useAuth();
    const { publicId } = useParams<{ publicId: string }>();
    const location = useLocation();
    const navigate = useNavigate();
    const [requests, setRequests] = useState<TherapistBookingRequestRecord[]>([]);
    const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
    const [selectedBooking, setSelectedBooking] = useState<BookingDetailRecord | null>(null);
    const [bufferBeforeMinutes, setBufferBeforeMinutes] = useState('30');
    const [bufferAfterMinutes, setBufferAfterMinutes] = useState('30');
    const [proposedStartAt, setProposedStartAt] = useState('');
    const [proposedEndAt, setProposedEndAt] = useState('');
    const [isAdjustmentFormOpen, setIsAdjustmentFormOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isDetailLoading, setIsDetailLoading] = useState(false);
    const [isAccepting, setIsAccepting] = useState(false);
    const [isRejecting, setIsRejecting] = useState(false);
    const [isSubmittingAdjustment, setIsSubmittingAdjustment] = useState(false);
    const [now, setNow] = useState(Date.now());
    const proposedStartAtRef = useRef<HTMLInputElement | null>(null);
    const proposedEndAtRef = useRef<HTMLInputElement | null>(null);

    usePageTitle('予約依頼一覧');
    useToastOnMessage(error, 'error');
    useToastOnMessage(successMessage, 'success');

    useEffect(() => {
        const timer = window.setInterval(() => {
            setNow(Date.now());
        }, 30000);

        return () => {
            window.clearInterval(timer);
        };
    }, []);

    async function loadRequests(nextIsRefresh = false) {
        if (!token) {
            return;
        }

        if (nextIsRefresh) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }

        try {
            const payload = await apiRequest<ApiEnvelope<TherapistBookingRequestRecord[]>>('/me/therapist/booking-requests', {
                token,
            });
            const nextRequests = unwrapData(payload);

            setRequests(nextRequests);
            setError(null);
            setSelectedRequestId((current) => {
                const preferredId = publicId ?? current;

                if (preferredId && nextRequests.some((request) => request.public_id === preferredId)) {
                    return preferredId;
                }

                return nextRequests[0]?.public_id ?? null;
            });
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '予約依頼一覧の取得に失敗しました。';

            setError(message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }

    useEffect(() => {
        void loadRequests();
    }, [token]);

    useEffect(() => {
        if (isLoading) {
            return;
        }

        if (requests.length === 0) {
            setSelectedRequestId(null);

            if (publicId) {
                navigate(buildRequestListPath(location.search), { replace: true });
            }

            return;
        }

        if (publicId) {
            const matchedRequest = requests.find((request) => request.public_id === publicId);

            if (matchedRequest) {
                if (selectedRequestId !== matchedRequest.public_id) {
                    setSelectedRequestId(matchedRequest.public_id);
                }

                return;
            }

            const fallbackId = requests[0].public_id;
            setSelectedRequestId(fallbackId);
            navigate(buildRequestDetailPath(fallbackId, location.search), { replace: true });
            return;
        }

        if (!selectedRequestId || !requests.some((request) => request.public_id === selectedRequestId)) {
            setSelectedRequestId(requests[0].public_id);
        }
    }, [isLoading, location.search, navigate, publicId, requests, selectedRequestId]);

    useEffect(() => {
        let isMounted = true;

        async function loadSelectedBooking() {
            if (!token || !selectedRequestId) {
                setSelectedBooking(null);
                setIsDetailLoading(false);
                return;
            }

            setIsDetailLoading(true);

            try {
                const payload = await apiRequest<ApiEnvelope<BookingDetailRecord>>(`/bookings/${selectedRequestId}`, {
                    token,
                });

                if (!isMounted) {
                    return;
                }

                const nextBooking = unwrapData(payload);
                setSelectedBooking(nextBooking);
                const pendingAdjustment = nextBooking.pending_adjustment_proposal ?? null;
                const nextBufferBeforeMinutes = pendingAdjustment?.buffer_before_minutes
                    ?? nextBooking.buffer_before_minutes
                    ?? (nextBooking.request_type === 'scheduled' ? 30 : 0);
                const nextBufferAfterMinutes = pendingAdjustment?.buffer_after_minutes
                    ?? nextBooking.buffer_after_minutes
                    ?? (nextBooking.request_type === 'scheduled' ? 30 : 0);

                setBufferBeforeMinutes(String(nextBufferBeforeMinutes));
                setBufferAfterMinutes(String(nextBufferAfterMinutes));
                setProposedStartAt(formatJstDateTimeLocalValue(
                    pendingAdjustment?.scheduled_start_at
                    ?? nextBooking.scheduled_start_at
                    ?? nextBooking.requested_start_at,
                ));
                setProposedEndAt(formatJstDateTimeLocalValue(
                    pendingAdjustment?.scheduled_end_at
                    ?? nextBooking.scheduled_end_at,
                ));
                setIsAdjustmentFormOpen(false);
                setError(null);
            } catch (requestError) {
                if (!isMounted) {
                    return;
                }

                const message =
                    requestError instanceof ApiError
                        ? requestError.message
                        : '依頼詳細の取得に失敗しました。';

                setSelectedBooking(null);
                setError(message);
            } finally {
                if (isMounted) {
                    setIsDetailLoading(false);
                }
            }
        }

        void loadSelectedBooking();

        return () => {
            isMounted = false;
        };
    }, [selectedRequestId, token]);

    const summary = useMemo(() => {
        const expiringSoon = requests.filter((request) => {
            const seconds = request.request_expires_at
                ? Math.floor((new Date(request.request_expires_at).getTime() - now) / 1000)
                : null;

            return seconds !== null && seconds > 0 && seconds <= 30 * 60;
        }).length;

        return {
            total: requests.length,
            onDemand: requests.filter((request) => request.request_type === 'on_demand').length,
            scheduled: requests.filter((request) => request.request_type === 'scheduled').length,
            expiringSoon,
        };
    }, [now, requests]);

    const selectedRequest = useMemo(
        () => requests.find((request) => request.public_id === selectedRequestId) ?? null,
        [requests, selectedRequestId],
    );

    const selectedRemainingSeconds = selectedRequest?.request_expires_at
        ? Math.floor((new Date(selectedRequest.request_expires_at).getTime() - now) / 1000)
        : null;
    const selectedRemainingMinutes = selectedRemainingSeconds != null
        ? Math.max(0, Math.ceil(selectedRemainingSeconds / 60))
        : selectedRequest?.request_expires_in_minutes ?? null;
    const minimumProposalStartAt = formatJstDateTimeLocalValue(new Date(now).toISOString());
    const minimumProposalEndAt = proposedStartAt || minimumProposalStartAt;

    async function handleAccept() {
        if (!token || !selectedBooking || isAccepting) {
            return;
        }

        setIsAccepting(true);
        setError(null);
        setSuccessMessage(null);

        try {
            await apiRequest<ApiEnvelope<BookingDetailRecord>>(`/bookings/${selectedBooking.public_id}/accept`, {
                method: 'POST',
                token,
                body: selectedBooking.request_type === 'scheduled'
                    ? {
                        buffer_before_minutes: Number(bufferBeforeMinutes),
                        buffer_after_minutes: Number(bufferAfterMinutes),
                    }
                    : {},
            });

            const currentId = selectedBooking.public_id;
            const nextRequests = requests.filter((request) => request.public_id !== currentId);
            const nextSelectedId = nextRequests[0]?.public_id ?? null;

            setSuccessMessage('予約依頼を承諾しました。予約一覧側で進行状況を追える状態です。');
            setRequests(nextRequests);
            setSelectedRequestId(nextSelectedId);
            setSelectedBooking(null);

            if (publicId === currentId) {
                navigate(
                    nextSelectedId ? buildRequestDetailPath(nextSelectedId, location.search) : buildRequestListPath(location.search),
                    { replace: true },
                );
            }
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '予約依頼の承諾に失敗しました。';

            setError(message);
        } finally {
            setIsAccepting(false);
        }
    }

    async function handleSubmitAdjustment() {
        if (!token || !selectedBooking || isSubmittingAdjustment) {
            return;
        }

        setIsSubmittingAdjustment(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<BookingDetailRecord>>(`/bookings/${selectedBooking.public_id}/adjustment-proposal`, {
                method: 'POST',
                token,
                body: {
                    scheduled_start_at: proposedStartAt,
                    scheduled_end_at: proposedEndAt,
                    buffer_before_minutes: Number(bufferBeforeMinutes),
                    buffer_after_minutes: Number(bufferAfterMinutes),
                },
            });

            const nextBooking = unwrapData(payload);
            setSelectedBooking(nextBooking);
            setIsAdjustmentFormOpen(false);
            setSuccessMessage('利用者へ時間変更の提案を送りました。利用者が確認すると、この条件で予約が確定します。');
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '時間変更の提案に失敗しました。';

            setError(message);
        } finally {
            setIsSubmittingAdjustment(false);
        }
    }

    async function handleReject() {
        if (!token || !selectedBooking || isRejecting) {
            return;
        }

        const confirmed = window.confirm('この予約依頼を辞退しますか？ 与信確保済みの場合は自動で取消されます。');

        if (!confirmed) {
            return;
        }

        setIsRejecting(true);
        setError(null);
        setSuccessMessage(null);

        try {
            await apiRequest<ApiEnvelope<BookingDetailRecord>>(`/bookings/${selectedBooking.public_id}/reject`, {
                method: 'POST',
                token,
            });

            const currentId = selectedBooking.public_id;
            const nextRequests = requests.filter((request) => request.public_id !== currentId);
            const nextSelectedId = nextRequests[0]?.public_id ?? null;

            setSuccessMessage('予約依頼を辞退しました。必要なら空き枠やプロフィール条件も見直せます。');
            setRequests(nextRequests);
            setSelectedRequestId(nextSelectedId);
            setSelectedBooking(null);

            if (publicId === currentId) {
                navigate(
                    nextSelectedId ? buildRequestDetailPath(nextSelectedId, location.search) : buildRequestListPath(location.search),
                    { replace: true },
                );
            }
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '予約依頼の辞退に失敗しました。';

            setError(message);
        } finally {
            setIsRejecting(false);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="予約依頼を読み込み中" message="今すぐ予約と予定予約の承諾待ちをまとめています。" />;
    }

    return (
        <div className="space-y-8">
            <section className="rounded-[28px] bg-[linear-gradient(117deg,#17202b_0%,#243447_52%,#2b4158_100%)] p-7 text-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">依頼受信箱</p>
                        <div className="space-y-2">
                            <h1 className="text-3xl font-semibold">予約依頼一覧</h1>
                            <p className="max-w-3xl text-sm leading-7 text-slate-300">
                                承諾待ちの今すぐ予約と予定予約をここでまとめて確認します。
                                期限が近い依頼から順に見ながら、承諾時バッファや辞退判断までこの画面で進められます。
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                void loadRequests(true);
                            }}
                            disabled={isRefreshing}
                            className="inline-flex items-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isRefreshing ? '更新中...' : '最新状態に更新'}
                        </button>
                        <Link
                            to="/therapist/availability"
                            className="inline-flex items-center rounded-full bg-[#f6e7cb] px-5 py-3 text-sm font-semibold text-[#1d2733] transition hover:bg-[#f3ddb2]"
                        >
                            空き枠を見直す
                        </Link>
                    </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {[
                        { label: '承諾待ち', value: `${summary.total}件`, tone: 'text-white' },
                        { label: '今すぐ予約', value: `${summary.onDemand}件`, tone: 'text-slate-100' },
                        { label: '予定予約', value: `${summary.scheduled}件`, tone: 'text-slate-100' },
                        { label: '30分以内', value: `${summary.expiringSoon}件`, tone: 'text-rose-100' },
                    ].map((item) => (
                        <div key={item.label} className="rounded-2xl border border-white/10 bg-white/6 px-5 py-4">
                            <p className="text-xs font-semibold tracking-wide text-slate-300">{item.label}</p>
                            <p className={`mt-3 text-2xl font-semibold ${item.tone}`}>{item.value}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section className="space-y-4">
                {requests.length === 0 ? (
                    <div className="rounded-[28px] border border-dashed border-white/10 bg-white/5 px-6 py-10 text-center">
                        <p className="text-sm font-semibold text-white">承諾待ちの予約依頼はありません。</p>
                        <p className="mt-3 text-sm leading-7 text-slate-300">
                            空き枠を調整したり、プロフィールの写真や料金ルールを整えて次の依頼に備えられます。
                        </p>
                        <div className="mt-5 flex flex-wrap justify-center gap-3">
                            <Link
                                to="/therapist/availability"
                                className="inline-flex items-center rounded-full bg-[#f6e7cb] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#f3ddb2]"
                            >
                                空き枠を管理
                            </Link>
                            <Link
                                to="/therapist/profile"
                                className="inline-flex items-center rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/6"
                            >
                                プロフィールを確認
                            </Link>
                        </div>
                    </div>
                ) : isDetailLoading ? (
                    <div className="rounded-[28px] border border-white/10 bg-white/5 px-6 py-8">
                        <LoadingScreen title="依頼詳細を読み込み中" message="利用者情報、待ち合わせ場所、承諾条件を確認しています。" />
                    </div>
                ) : selectedBooking && selectedRequest ? (
                    <section className="space-y-5 rounded-[28px] border border-white/10 bg-white/5 p-6">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="space-y-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">
                                            {requestTypeLabel(selectedBooking.request_type)}
                                        </span>
                                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${countdownTone(selectedRemainingMinutes)}`}>
                                            {formatRemainingLabel(selectedRemainingSeconds)}
                                        </span>
                                    </div>
                                    <div className="space-y-1">
                                        <h2 className="text-2xl font-semibold text-white">
                                            {selectedBooking.counterparty?.display_name ?? '利用者情報を確認中'}
                                        </h2>
                                        <p className="text-sm text-slate-300">
                                            {selectedBooking.therapist_menu?.name ?? selectedRequest.menu.name ?? 'メニュー確認中'} / {selectedBooking.duration_minutes}分
                                        </p>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-white/10 bg-[#17202b] px-4 py-3 text-right">
                                    <p className="text-xs font-semibold tracking-wide text-slate-400">合計金額</p>
                                    <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(selectedBooking.total_amount)}</p>
                                    <p className="mt-1 text-xs text-slate-400">受取 {formatCurrency(selectedBooking.therapist_net_amount)}</p>
                                </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="rounded-2xl border border-white/10 bg-[#17202b] px-5 py-4">
                                    <p className="text-xs font-semibold tracking-wide text-slate-400">希望時間</p>
                                    <div className="mt-2 text-sm font-semibold leading-7 text-white">{renderRequestTimeRange(selectedRequest)}</div>
                                    {selectedBooking.request_expires_at ? (
                                        <p className="mt-2 text-xs text-slate-400">
                                            承諾期限 {formatDateTime(selectedBooking.request_expires_at)}
                                        </p>
                                    ) : null}
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-[#17202b] px-5 py-4">
                                    <p className="text-xs font-semibold tracking-wide text-slate-400">待ち合わせ場所</p>
                                    <p className="mt-2 text-sm font-semibold text-white">{buildRequestMeetingPlace(selectedBooking.service_address)}</p>
                                    <p className="mt-2 text-xs text-slate-400">
                                        {selectedBooking.service_address?.city ?? '市区町村未設定'} / {placeTypeLabel(selectedBooking.service_address?.place_type)}
                                    </p>
                                </div>
                            </div>

                            {selectedBooking.request_type === 'scheduled' ? (
                                <>
                                    {selectedBooking.pending_adjustment_proposal ? (
                                        <section className="rounded-[24px] border border-[#9ec5ff] bg-[#eef5ff] px-5 py-5 text-[#17202b]">
                                            <div className="space-y-2">
                                                <h3 className="text-lg font-semibold">提案中の時間変更</h3>
                                                <p className="text-sm leading-7 text-[#475569]">
                                                    利用者がこの提案を確認すると、そのまま予約確定に進みます。必要なら開始時間、終了時間、予約前後の移動・準備時間を更新できます。
                                                </p>
                                            </div>

                                            <div className="mt-4 grid gap-4 md:grid-cols-2">
                                                <div className="rounded-2xl border border-[#d3e3ff] bg-white px-4 py-4">
                                                    <p className="text-xs font-semibold tracking-wide text-[#5b6b7f]">提案中の時間</p>
                                                    <div className="mt-2 text-sm font-semibold leading-7 text-[#17202b]">
                                                        {renderScheduledTimeRange(
                                                            selectedBooking.pending_adjustment_proposal.scheduled_start_at,
                                                            selectedBooking.pending_adjustment_proposal.scheduled_end_at,
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="rounded-2xl border border-[#d3e3ff] bg-white px-4 py-4">
                                                    <p className="text-xs font-semibold tracking-wide text-[#5b6b7f]">提案後の金額</p>
                                                    <p className="mt-2 text-xl font-semibold text-[#17202b]">
                                                        {formatCurrency(selectedBooking.pending_adjustment_proposal.total_amount)}
                                                    </p>
                                                    <p className="mt-2 text-xs text-[#5b6b7f]">
                                                        受取 {formatCurrency(selectedBooking.pending_adjustment_proposal.therapist_net_amount)}
                                                    </p>
                                                </div>
                                            </div>
                                        </section>
                                    ) : null}

                                    <section className="rounded-[24px] border border-[#f0d6a4] bg-[#fff7e8] px-5 py-5 text-[#17202b]">
                                        <div className="space-y-2">
                                            <h3 className="text-lg font-semibold">{adjustmentTitle(selectedBooking)}</h3>
                                            <p className="text-sm leading-7 text-[#475569]">
                                                {adjustmentDescription(selectedBooking)}
                                            </p>
                                        </div>

                                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                            <label className="space-y-2">
                                                <span className="text-sm font-semibold text-[#17202b]">開始前の移動・準備時間（分）</span>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={360}
                                                    step={5}
                                                    value={bufferBeforeMinutes}
                                                    onChange={(event) => {
                                                        setBufferBeforeMinutes(event.target.value);
                                                    }}
                                                    className="w-full rounded-2xl border border-[#d8c39b] bg-white px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b38a44]"
                                                />
                                            </label>
                                            <label className="space-y-2">
                                                <span className="text-sm font-semibold text-[#17202b]">終了後の移動・準備時間（分）</span>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={360}
                                                    step={5}
                                                    value={bufferAfterMinutes}
                                                    onChange={(event) => {
                                                        setBufferAfterMinutes(event.target.value);
                                                    }}
                                                    className="w-full rounded-2xl border border-[#d8c39b] bg-white px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b38a44]"
                                                />
                                            </label>
                                        </div>

                                        {!isAdjustmentFormOpen ? (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsAdjustmentFormOpen(true);
                                                }}
                                                disabled={isAccepting || isRejecting || (selectedRemainingSeconds != null && selectedRemainingSeconds <= 0)}
                                                className="mt-5 inline-flex items-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140] disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {selectedBooking.pending_adjustment_proposal ? '提案内容を修正する' : '希望時間を変更して提案'}
                                            </button>
                                        ) : (
                                            <>
                                                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                                    <label className="space-y-2">
                                                        <span className="text-sm font-semibold text-[#17202b]">開始時間</span>
                                                        <div className="relative">
                                                            <input
                                                                ref={proposedStartAtRef}
                                                                type="datetime-local"
                                                                step={900}
                                                                min={minimumProposalStartAt}
                                                                max={proposedEndAt || undefined}
                                                                value={proposedStartAt}
                                                                onChange={(event) => {
                                                                    setProposedStartAt(event.target.value);
                                                                }}
                                                                className="w-full rounded-2xl border border-[#d8c39b] bg-white px-4 py-3 pr-12 text-sm text-[#17202b] outline-none transition focus:border-[#b38a44]"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => openDateTimePicker(proposedStartAtRef.current)}
                                                                className="absolute inset-y-0 right-3 inline-flex items-center justify-center text-[#7d6852] transition hover:text-[#17202b]"
                                                                aria-label="開始時間の日時ピッカーを開く"
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
                                                        <span className="text-sm font-semibold text-[#17202b]">終了時間</span>
                                                        <div className="relative">
                                                            <input
                                                                ref={proposedEndAtRef}
                                                                type="datetime-local"
                                                                step={900}
                                                                min={minimumProposalEndAt}
                                                                value={proposedEndAt}
                                                                onChange={(event) => {
                                                                    setProposedEndAt(event.target.value);
                                                                }}
                                                                className="w-full rounded-2xl border border-[#d8c39b] bg-white px-4 py-3 pr-12 text-sm text-[#17202b] outline-none transition focus:border-[#b38a44]"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => openDateTimePicker(proposedEndAtRef.current)}
                                                                className="absolute inset-y-0 right-3 inline-flex items-center justify-center text-[#7d6852] transition hover:text-[#17202b]"
                                                                aria-label="終了時間の日時ピッカーを開く"
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
                                                    <div className="space-y-2 sm:col-span-2">
                                                        <span className="text-sm font-semibold text-[#17202b]">変更後の開始時間と終了時間を確認してください</span>
                                                        <p className="rounded-2xl border border-dashed border-[#d8c39b] bg-white/70 px-4 py-3 text-sm leading-7 text-[#475569]">
                                                            ここで変更するのは時間だけです。予約前後の移動・準備時間は上の項目でそのまま設定できます。
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="mt-5 flex flex-wrap gap-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            void handleSubmitAdjustment();
                                                        }}
                                                        disabled={isSubmittingAdjustment || isAccepting || isRejecting || (selectedRemainingSeconds != null && selectedRemainingSeconds <= 0)}
                                                        className="inline-flex items-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140] disabled:cursor-not-allowed disabled:opacity-60"
                                                    >
                                                        {isSubmittingAdjustment
                                                            ? '提案を送信中...'
                                                            : selectedBooking.pending_adjustment_proposal
                                                                ? '提案内容を更新する'
                                                                : 'この条件で利用者へ提案する'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setIsAdjustmentFormOpen(false);
                                                        }}
                                                        disabled={isSubmittingAdjustment}
                                                        className="inline-flex items-center rounded-full border border-[#d8c39b] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-60"
                                                    >
                                                        閉じる
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </section>
                                </>
                            ) : (
                                <section className="rounded-[24px] border border-white/10 bg-[#17202b] px-5 py-5">
                                    <h3 className="text-lg font-semibold text-white">今すぐ予約メモ</h3>
                                    <p className="mt-3 text-sm leading-7 text-slate-300">
                                        今すぐ予約は承諾するとすぐ進行中導線に移ります。移動開始の前にメッセージで待ち合わせや入室方法を確認できます。
                                    </p>
                                </section>
                            )}

                            <section className="flex flex-wrap gap-3">
                                {!selectedBooking.pending_adjustment_proposal ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            void handleAccept();
                                        }}
                                        disabled={isAccepting || isRejecting || isSubmittingAdjustment || (selectedRemainingSeconds != null && selectedRemainingSeconds <= 0)}
                                        className="inline-flex items-center rounded-full bg-[#f6e7cb] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#f3ddb2] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {isAccepting ? '承諾中...' : 'この依頼を承諾'}
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    onClick={() => {
                                        void handleReject();
                                    }}
                                    disabled={isAccepting || isRejecting || isSubmittingAdjustment}
                                    className="inline-flex items-center rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isRejecting ? '辞退中...' : '辞退する'}
                                </button>
                                <Link
                                    to={`/therapist/bookings/${selectedBooking.public_id}/messages`}
                                    className="inline-flex items-center rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/6"
                                >
                                    メッセージを見る
                                </Link>
                            </section>
                    </section>
                ) : (
                    <section className="rounded-[28px] border border-dashed border-white/10 bg-white/5 px-6 py-10 text-center">
                        <p className="text-sm font-semibold text-white">対象の依頼を確認できません。</p>
                        <p className="mt-3 text-sm leading-7 text-slate-300">
                            依頼が取り下げられたか、承諾・辞退済みの可能性があります。予約管理へ戻って最新状態を確認してください。
                        </p>
                    </section>
                )}
            </section>
        </div>
    );
}
