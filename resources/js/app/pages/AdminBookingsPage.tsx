import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatDateTime, formatProfileStatus } from '../lib/therapist';
import type {
    AdminBookingDetailRecord,
    AdminBookingListRecord,
    ApiEnvelope,
} from '../lib/types';

type BookingStatusFilter =
    | 'all'
    | 'payment_authorizing'
    | 'requested'
    | 'accepted'
    | 'rejected'
    | 'expired'
    | 'payment_canceled'
    | 'canceled'
    | 'interrupted'
    | 'moving'
    | 'arrived'
    | 'in_progress'
    | 'therapist_completed'
    | 'completed';

type RequestTypeFilter = 'all' | 'on_demand' | 'scheduled';
type BooleanFilter = 'all' | 'yes' | 'no';
type BookingSortField = 'created_at' | 'updated_at' | 'scheduled_start_at' | 'total_amount';
type BookingSortDirection = 'asc' | 'desc';

function normalizeStatusFilter(value: string | null): BookingStatusFilter {
    const allowed: BookingStatusFilter[] = [
        'payment_authorizing',
        'requested',
        'accepted',
        'rejected',
        'expired',
        'payment_canceled',
        'canceled',
        'interrupted',
        'moving',
        'arrived',
        'in_progress',
        'therapist_completed',
        'completed',
    ];

    return allowed.includes(value as BookingStatusFilter) ? (value as BookingStatusFilter) : 'all';
}

function normalizeRequestTypeFilter(value: string | null): RequestTypeFilter {
    if (value === 'on_demand' || value === 'scheduled') {
        return value;
    }

    return 'all';
}

function normalizeBooleanFilter(value: string | null): BooleanFilter {
    if (value === 'yes' || value === 'no') {
        return value;
    }

    return 'all';
}

function normalizeSortField(value: string | null): BookingSortField {
    if (value === 'updated_at' || value === 'scheduled_start_at' || value === 'total_amount') {
        return value;
    }

    return 'created_at';
}

function normalizeSortDirection(value: string | null): BookingSortDirection {
    return value === 'asc' ? 'asc' : 'desc';
}

function bookingStatusLabel(status: string): string {
    switch (status) {
        case 'payment_authorizing':
            return '与信処理中';
        case 'requested':
            return '承諾待ち';
        case 'accepted':
            return '承諾済み';
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
        case 'moving':
            return '移動中';
        case 'arrived':
            return '到着';
        case 'in_progress':
            return '対応中';
        case 'therapist_completed':
            return '対応終了報告';
        case 'completed':
            return '完了';
        default:
            return status;
    }
}

function bookingStatusTone(status: string): string {
    switch (status) {
        case 'requested':
        case 'accepted':
        case 'moving':
        case 'arrived':
        case 'in_progress':
            return 'bg-[#eef4ff] text-[#30527a]';
        case 'completed':
        case 'therapist_completed':
            return 'bg-[#e8f4ea] text-[#205738]';
        case 'interrupted':
        case 'canceled':
        case 'rejected':
            return 'bg-[#f8e6e3] text-[#8f4337]';
        case 'expired':
        case 'payment_canceled':
            return 'bg-[#f3efe7] text-[#55606d]';
        default:
            return 'bg-[#fff1df] text-[#91571b]';
    }
}

function paymentStatusLabel(status: string | null | undefined): string {
    switch (status) {
        case 'requires_payment_method':
            return '支払い方法待ち';
        case 'requires_confirmation':
            return '確認待ち';
        case 'requires_capture':
            return '売上確定待ち';
        case 'succeeded':
            return '成功';
        case 'canceled':
            return '取消済み';
        case 'processing':
            return '処理中';
        default:
            return status ?? '未作成';
    }
}

function paymentStatusTone(status: string | null | undefined): string {
    switch (status) {
        case 'requires_capture':
        case 'processing':
            return 'bg-[#fff1df] text-[#91571b]';
        case 'succeeded':
            return 'bg-[#e8f4ea] text-[#205738]';
        case 'canceled':
            return 'bg-[#f3efe7] text-[#55606d]';
        default:
            return 'bg-[#eef4ff] text-[#30527a]';
    }
}

function placeTypeLabel(value: string): string {
    switch (value) {
        case 'home':
            return '自宅';
        case 'hotel':
            return 'ホテル';
        case 'office':
            return 'オフィス';
        default:
            return value;
    }
}

function formatCurrency(value: number | null | undefined): string {
    return new Intl.NumberFormat('ja-JP', {
        style: 'currency',
        currency: 'JPY',
        maximumFractionDigits: 0,
    }).format(value ?? 0);
}

function displayName(account: { display_name: string | null; public_id?: string | null } | null): string {
    if (!account) {
        return '未設定';
    }

    return account.display_name?.trim() || account.public_id || '未設定';
}

function buildFlagValue(filter: BooleanFilter): string | null {
    if (filter === 'yes') {
        return '1';
    }

    if (filter === 'no') {
        return '0';
    }

    return null;
}

export function AdminBookingsPage() {
    const { token } = useAuth();
    const { publicId } = useParams<{ publicId: string }>();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const [bookings, setBookings] = useState<AdminBookingListRecord[]>([]);
    const [selectedBooking, setSelectedBooking] = useState<AdminBookingDetailRecord | null>(null);
    const [pageError, setPageError] = useState<string | null>(null);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [queryInput, setQueryInput] = useState(searchParams.get('q') ?? '');
    const [paymentStatusInput, setPaymentStatusInput] = useState(searchParams.get('payment_status') ?? '');
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);

    const statusFilter = normalizeStatusFilter(searchParams.get('status'));
    const requestTypeFilter = normalizeRequestTypeFilter(searchParams.get('request_type'));
    const openReportFilter = normalizeBooleanFilter(searchParams.get('has_open_report'));
    const openDisputeFilter = normalizeBooleanFilter(searchParams.get('has_open_dispute'));
    const flaggedMessageFilter = normalizeBooleanFilter(searchParams.get('has_flagged_message'));
    const sortField = normalizeSortField(searchParams.get('sort'));
    const direction = normalizeSortDirection(searchParams.get('direction'));
    const query = searchParams.get('q')?.trim() ?? '';
    const paymentStatusFilter = searchParams.get('payment_status')?.trim() ?? '';

    usePageTitle('予約監視');

    const loadBookings = useCallback(async (refresh = false) => {
        if (!token) {
            return;
        }

        if (refresh) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }

        setPageError(null);

        const params = new URLSearchParams();

        if (statusFilter !== 'all') {
            params.set('status', statusFilter);
        }

        if (requestTypeFilter === 'on_demand') {
            params.set('is_on_demand', '1');
        } else if (requestTypeFilter === 'scheduled') {
            params.set('is_on_demand', '0');
        }

        if (query) {
            params.set('q', query);
        }

        if (paymentStatusFilter) {
            params.set('payment_intent_status', paymentStatusFilter);
        }

        const hasOpenReport = buildFlagValue(openReportFilter);
        const hasOpenDispute = buildFlagValue(openDisputeFilter);
        const hasFlaggedMessage = buildFlagValue(flaggedMessageFilter);

        if (hasOpenReport) {
            params.set('has_open_report', hasOpenReport);
        }

        if (hasOpenDispute) {
            params.set('has_open_dispute', hasOpenDispute);
        }

        if (hasFlaggedMessage) {
            params.set('has_flagged_message', hasFlaggedMessage);
        }

        params.set('sort', sortField);
        params.set('direction', direction);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminBookingListRecord[]>>(`/admin/bookings?${params.toString()}`, { token });
            setBookings(unwrapData(payload));
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '予約一覧の取得に失敗しました。';

            setPageError(message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [direction, flaggedMessageFilter, openDisputeFilter, openReportFilter, paymentStatusFilter, query, requestTypeFilter, sortField, statusFilter, token]);

    const loadDetail = useCallback(async () => {
        if (!token || !publicId) {
            setSelectedBooking(null);
            setDetailError(null);
            return;
        }

        setIsLoadingDetail(true);
        setDetailError(null);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminBookingDetailRecord>>(`/admin/bookings/${publicId}`, { token });
            setSelectedBooking(unwrapData(payload));
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '予約詳細の取得に失敗しました。';

            setDetailError(message);
            setSelectedBooking(null);
        } finally {
            setIsLoadingDetail(false);
        }
    }, [publicId, token]);

    useEffect(() => {
        void loadBookings();
    }, [loadBookings]);

    useEffect(() => {
        void loadDetail();
    }, [loadDetail]);

    const selectedListBooking = useMemo(
        () => bookings.find((booking) => booking.public_id === publicId) ?? null,
        [bookings, publicId],
    );

    const summary = useMemo(() => ({
        total: bookings.length,
        requested: bookings.filter((booking) => booking.status === 'requested').length,
        inProgress: bookings.filter((booking) => ['moving', 'arrived', 'in_progress'].includes(booking.status)).length,
        interrupted: bookings.filter((booking) => booking.status === 'interrupted').length,
        flagged: bookings.filter((booking) => booking.flagged_message_count > 0).length,
        disputed: bookings.filter((booking) => booking.open_dispute_count > 0).length,
    }), [bookings]);

    function updateFilters(
        next: Partial<Record<'status' | 'request_type' | 'has_open_report' | 'has_open_dispute' | 'has_flagged_message' | 'sort' | 'direction' | 'q' | 'payment_status', string | null>>,
    ) {
        const params = new URLSearchParams(searchParams);

        Object.entries(next).forEach(([key, value]) => {
            if (!value || value === 'all') {
                params.delete(key);
                return;
            }

            params.set(key, value);
        });

        setSearchParams(params, { replace: true });
    }

    if (isLoading) {
        return <LoadingScreen title="予約一覧を読み込み中" message="決済・返金・安全記録を横断集計しています。" />;
    }

    const detail = selectedBooking;

    return (
        <div className="space-y-6">
            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_16px_34px_rgba(2,6,23,0.14)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">BOOKING OPERATIONS</p>
                        <h2 className="text-2xl font-semibold text-white sm:text-[2rem]">予約管理</h2>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            承諾待ち、進行中、中断、返金、危険メッセージ、チャージバックまでを横断で監視します。
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            void loadBookings(true);
                            void loadDetail();
                        }}
                        disabled={isRefreshing || isLoadingDetail}
                        className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isRefreshing ? '更新中...' : '最新化'}
                    </button>
                </div>
            </section>

            {pageError ? (
                <section className="rounded-[24px] border border-[#f1d4b5] bg-[#fff4e8] px-5 py-4 text-sm text-[#9a4b35]">
                    {pageError}
                </section>
            ) : null}

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                {[
                    { label: '総件数', value: summary.total, hint: '現在の表示対象' },
                    { label: '承諾待ち', value: summary.requested, hint: 'セラピスト応答待ち' },
                    { label: '進行中', value: summary.inProgress, hint: '移動・到着・対応中' },
                    { label: '中断', value: summary.interrupted, hint: '安全確認が必要' },
                    { label: '要メッセージ確認', value: summary.flagged, hint: '危険メッセージあり' },
                    { label: 'チャージバック', value: summary.disputed, hint: '未解決 dispute あり' },
                ].map((item) => (
                    <article key={item.label} className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">{item.label}</p>
                        <p className="mt-3 text-3xl font-semibold text-white">{item.value}</p>
                        <p className="mt-2 text-sm text-slate-400">{item.hint}</p>
                    </article>
                ))}
            </section>

            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_16px_34px_rgba(2,6,23,0.12)]">
                <div className="grid gap-4 xl:grid-cols-[repeat(7,minmax(0,1fr))]">
                    <label className="space-y-2">
                        <span className="text-xs font-semibold tracking-wide text-slate-300">ステータス</span>
                        <select
                            value={statusFilter}
                            onChange={(event) => updateFilters({ status: event.target.value })}
                            className="w-full rounded-2xl border border-white/10 bg-[#121a24] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d2b179]/60"
                        >
                            <option value="all">すべて</option>
                            <option value="payment_authorizing">与信処理中</option>
                            <option value="requested">承諾待ち</option>
                            <option value="accepted">承諾済み</option>
                            <option value="moving">移動中</option>
                            <option value="arrived">到着</option>
                            <option value="in_progress">対応中</option>
                            <option value="therapist_completed">対応終了報告</option>
                            <option value="completed">完了</option>
                            <option value="interrupted">中断</option>
                            <option value="canceled">キャンセル</option>
                            <option value="rejected">辞退</option>
                            <option value="expired">期限切れ</option>
                            <option value="payment_canceled">与信取消</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-xs font-semibold tracking-wide text-slate-300">予約種別</span>
                        <select
                            value={requestTypeFilter}
                            onChange={(event) => updateFilters({ request_type: event.target.value })}
                            className="w-full rounded-2xl border border-white/10 bg-[#121a24] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d2b179]/60"
                        >
                            <option value="all">すべて</option>
                            <option value="on_demand">今すぐ</option>
                            <option value="scheduled">予定予約</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-xs font-semibold tracking-wide text-slate-300">通報</span>
                        <select
                            value={openReportFilter}
                            onChange={(event) => updateFilters({ has_open_report: event.target.value })}
                            className="w-full rounded-2xl border border-white/10 bg-[#121a24] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d2b179]/60"
                        >
                            <option value="all">すべて</option>
                            <option value="yes">未解決あり</option>
                            <option value="no">未解決なし</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-xs font-semibold tracking-wide text-slate-300">チャージバック</span>
                        <select
                            value={openDisputeFilter}
                            onChange={(event) => updateFilters({ has_open_dispute: event.target.value })}
                            className="w-full rounded-2xl border border-white/10 bg-[#121a24] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d2b179]/60"
                        >
                            <option value="all">すべて</option>
                            <option value="yes">未解決あり</option>
                            <option value="no">未解決なし</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-xs font-semibold tracking-wide text-slate-300">危険メッセージ</span>
                        <select
                            value={flaggedMessageFilter}
                            onChange={(event) => updateFilters({ has_flagged_message: event.target.value })}
                            className="w-full rounded-2xl border border-white/10 bg-[#121a24] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d2b179]/60"
                        >
                            <option value="all">すべて</option>
                            <option value="yes">検知あり</option>
                            <option value="no">検知なし</option>
                        </select>
                    </label>

                    <label className="space-y-2 xl:col-span-2">
                        <span className="text-xs font-semibold tracking-wide text-slate-300">検索</span>
                        <input
                            type="text"
                            value={queryInput}
                            onChange={(event) => setQueryInput(event.target.value)}
                            onBlur={() => updateFilters({ q: queryInput.trim() || null })}
                            placeholder="予約ID / メール / 表示名"
                            className="w-full rounded-2xl border border-white/10 bg-[#121a24] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-[#d2b179]/60"
                        />
                    </label>
                </div>

                <div className="mt-4 grid gap-4 border-t border-white/10 pt-4 xl:grid-cols-[minmax(0,220px)_minmax(0,180px)_minmax(0,180px)]">
                    <label className="space-y-2">
                        <span className="text-xs font-semibold tracking-wide text-slate-300">決済状態</span>
                        <input
                            type="text"
                            value={paymentStatusInput}
                            onChange={(event) => setPaymentStatusInput(event.target.value)}
                            onBlur={() => updateFilters({ payment_status: paymentStatusInput.trim() || null })}
                            placeholder="requires_capture"
                            className="w-full rounded-2xl border border-white/10 bg-[#121a24] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-[#d2b179]/60"
                        />
                    </label>

                    <label className="space-y-2">
                        <span className="text-xs font-semibold tracking-wide text-slate-300">並び順</span>
                        <select
                            value={sortField}
                            onChange={(event) => updateFilters({ sort: event.target.value })}
                            className="w-full rounded-2xl border border-white/10 bg-[#121a24] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d2b179]/60"
                        >
                            <option value="created_at">作成日時</option>
                            <option value="updated_at">更新日時</option>
                            <option value="scheduled_start_at">開始日時</option>
                            <option value="total_amount">総額</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-xs font-semibold tracking-wide text-slate-300">順序</span>
                        <select
                            value={direction}
                            onChange={(event) => updateFilters({ direction: event.target.value })}
                            className="w-full rounded-2xl border border-white/10 bg-[#121a24] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d2b179]/60"
                        >
                            <option value="desc">新しい順</option>
                            <option value="asc">古い順</option>
                        </select>
                    </label>
                </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(380px,0.95fr)]">
                <div className="space-y-4">
                    {bookings.length === 0 ? (
                        <section className="rounded-[28px] border border-dashed border-white/10 bg-white/[0.03] px-6 py-12 text-center text-sm text-slate-400">
                            条件に合う予約はありません。
                        </section>
                    ) : (
                        bookings.map((booking) => {
                            const isActive = booking.public_id === publicId;
                            const detailPath = `/admin/bookings/${booking.public_id}${location.search}`;

                            return (
                                <Link
                                    key={booking.public_id}
                                    to={detailPath}
                                    className={[
                                        'block rounded-[28px] border p-5 transition',
                                        isActive
                                            ? 'border-[#d2b179]/45 bg-[#17202b] shadow-[0_18px_38px_rgba(2,6,23,0.22)]'
                                            : 'border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.06]',
                                    ].join(' ')}
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="space-y-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={['rounded-full px-2.5 py-1 text-xs font-semibold', bookingStatusTone(booking.status)].join(' ')}>
                                                    {bookingStatusLabel(booking.status)}
                                                </span>
                                                <span className={['rounded-full px-2.5 py-1 text-xs font-semibold', paymentStatusTone(booking.current_payment_intent_status)].join(' ')}>
                                                    {paymentStatusLabel(booking.current_payment_intent_status)}
                                                </span>
                                                <span className="rounded-full bg-[#f3efe7] px-2.5 py-1 text-xs font-semibold text-[#55606d]">
                                                    {booking.is_on_demand ? '今すぐ' : '予定予約'}
                                                </span>
                                            </div>

                                            <h3 className="text-lg font-semibold text-white">
                                                {displayName(booking.user_account)} → {booking.therapist_profile?.public_name ?? displayName(booking.therapist_account)}
                                            </h3>
                                            <p className="text-sm text-slate-300">
                                                {booking.therapist_menu?.name ?? 'メニュー未設定'} / {booking.duration_minutes}分 / {formatCurrency(booking.total_amount)}
                                            </p>
                                        </div>

                                        <div className="text-right text-xs text-slate-400">
                                            <p>{formatDateTime(booking.scheduled_start_at ?? booking.created_at)}</p>
                                            <p className="mt-1">{booking.public_id}</p>
                                        </div>
                                    </div>

                                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                                        {booking.flagged_message_count > 0 ? (
                                            <span className="rounded-full bg-[#fff0e0] px-2.5 py-1 font-semibold text-[#9e5a27]">
                                                危険メッセージ {booking.flagged_message_count}
                                            </span>
                                        ) : null}
                                        {booking.report_count > 0 ? (
                                            <span className="rounded-full bg-[#f8e6e3] px-2.5 py-1 font-semibold text-[#8f4337]">
                                                通報 {booking.report_count}
                                            </span>
                                        ) : null}
                                        {booking.open_dispute_count > 0 ? (
                                            <span className="rounded-full bg-[#edf4ff] px-2.5 py-1 font-semibold text-[#30527a]">
                                                dispute {booking.open_dispute_count}
                                            </span>
                                        ) : null}
                                        {booking.refund_count > 0 ? (
                                            <span className="rounded-full bg-[#f3efe7] px-2.5 py-1 font-semibold text-[#55606d]">
                                                返金 {booking.refund_count}
                                            </span>
                                        ) : null}
                                    </div>

                                    <p className="mt-4 text-sm text-slate-400">
                                        待ち合わせ場所: {booking.service_address?.prefecture ?? '未設定'} {booking.service_address?.city ?? ''}
                                    </p>
                                </Link>
                            );
                        })
                    )}
                </div>

                <div className="space-y-4">
                    {detailError ? (
                        <section className="rounded-[22px] border border-[#f1d4b5] bg-[#fff4e8] px-5 py-4 text-sm text-[#9a4b35]">
                            {detailError}
                        </section>
                    ) : null}

                    {!publicId ? (
                        <section className="rounded-[28px] border border-dashed border-white/10 bg-white/[0.03] px-6 py-12 text-center text-sm text-slate-400">
                            左の一覧から予約を選ぶと、決済・返金・安全記録を確認できます。
                        </section>
                    ) : isLoadingDetail && !detail ? (
                        <LoadingScreen title="予約詳細を読み込み中" message="決済、返金、安全記録を確認しています。" />
                    ) : detail ? (
                        <>
                            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_16px_34px_rgba(2,6,23,0.12)]">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={['rounded-full px-2.5 py-1 text-xs font-semibold', bookingStatusTone(detail.status)].join(' ')}>
                                                {bookingStatusLabel(detail.status)}
                                            </span>
                                            <span className={['rounded-full px-2.5 py-1 text-xs font-semibold', paymentStatusTone(detail.current_payment_intent?.status)].join(' ')}>
                                                {paymentStatusLabel(detail.current_payment_intent?.status)}
                                            </span>
                                        </div>
                                        <h3 className="text-2xl font-semibold text-white">
                                            {displayName(detail.user_account)} → {detail.therapist_profile?.public_name ?? displayName(detail.therapist_account)}
                                        </h3>
                                        <p className="text-sm text-slate-300">
                                            予約ID: {detail.public_id} / {detail.is_on_demand ? '今すぐ予約' : '予定予約'}
                                        </p>
                                    </div>

                                    <div className="flex flex-col gap-2 sm:items-end">
                                        <Link
                                            to={`/admin/bookings/${detail.public_id}/messages`}
                                            className="inline-flex min-h-11 items-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/6"
                                        >
                                            メッセージ監視へ
                                        </Link>
                                        <p className="text-xs text-slate-400">最終更新: {formatDateTime(detail.updated_at)}</p>
                                    </div>
                                </div>

                                <div className="mt-5 grid gap-4 md:grid-cols-2">
                                    <article className="rounded-[22px] bg-[#101720] p-4">
                                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">利用者</p>
                                        <p className="mt-2 text-sm font-semibold text-white">{displayName(detail.user_account)}</p>
                                        <p className="mt-1 text-xs text-slate-400">{detail.user_account?.email ?? 'メール未設定'}</p>
                                    </article>
                                    <article className="rounded-[22px] bg-[#101720] p-4">
                                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">セラピスト</p>
                                        <p className="mt-2 text-sm font-semibold text-white">{detail.therapist_profile?.public_name ?? displayName(detail.therapist_account)}</p>
                                        <p className="mt-1 text-xs text-slate-400">
                                            {detail.therapist_profile?.public_id ?? detail.therapist_account?.public_id} / {formatProfileStatus(detail.therapist_profile?.profile_status)}
                                        </p>
                                    </article>
                                </div>

                                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                                    <article className="rounded-[22px] bg-[#101720] p-4">
                                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">料金</p>
                                        <p className="mt-2 text-sm text-slate-300">総額 {formatCurrency(detail.total_amount)}</p>
                                        <p className="mt-1 text-sm text-slate-300">受取予定 {formatCurrency(detail.therapist_net_amount)}</p>
                                        <p className="mt-1 text-sm text-slate-300">PF料 {formatCurrency(detail.platform_fee_amount)}</p>
                                    </article>
                                    <article className="rounded-[22px] bg-[#101720] p-4">
                                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">日時</p>
                                        <p className="mt-2 text-sm text-slate-300">開始 {formatDateTime(detail.scheduled_start_at ?? detail.requested_start_at)}</p>
                                        <p className="mt-1 text-sm text-slate-300">終了 {formatDateTime(detail.scheduled_end_at)}</p>
                                        <p className="mt-1 text-sm text-slate-300">承諾期限 {formatDateTime(detail.request_expires_at)}</p>
                                    </article>
                                    <article className="rounded-[22px] bg-[#101720] p-4">
                                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">安全 / 例外</p>
                                        <p className="mt-2 text-sm text-slate-300">通報 {detail.reports.length}</p>
                                        <p className="mt-1 text-sm text-slate-300">中断通報 {detail.interruption_report_count}</p>
                                        <p className="mt-1 text-sm text-slate-300">自動返金 {detail.auto_refund_count}</p>
                                    </article>
                                </div>

                                {detail.cancel_reason_note ? (
                                    <article className="mt-4 rounded-[22px] bg-[#101720] p-5">
                                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">キャンセル / 中断メモ</p>
                                        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-100">
                                            {detail.cancel_reason_note}
                                        </p>
                                        <p className="mt-3 text-xs text-slate-400">
                                            理由コード: {detail.cancel_reason_code ?? detail.interruption_reason_code ?? '未設定'}
                                        </p>
                                    </article>
                                ) : null}
                            </section>

                            <section className="grid gap-4 lg:grid-cols-2">
                                <article className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
                                    <p className="text-xs font-semibold tracking-wide text-[#d2b179]">決済情報</p>
                                    {detail.current_payment_intent ? (
                                        <div className="mt-4 space-y-2 text-sm text-slate-300">
                                            <p>状態: {paymentStatusLabel(detail.current_payment_intent.status)}</p>
                                            <p>金額: {formatCurrency(detail.current_payment_intent.amount)}</p>
                                            <p>Stripe PI: {detail.current_payment_intent.stripe_payment_intent_id}</p>
                                            <p>与信日時: {formatDateTime(detail.current_payment_intent.authorized_at)}</p>
                                            <p>売上確定: {formatDateTime(detail.current_payment_intent.captured_at)}</p>
                                        </div>
                                    ) : (
                                        <p className="mt-4 text-sm text-slate-400">決済情報はありません。</p>
                                    )}

                                    {detail.current_quote ? (
                                        <div className="mt-5 rounded-[22px] bg-[#101720] p-4 text-sm text-slate-300">
                                            <p className="font-semibold text-white">見積もり</p>
                                            <p className="mt-2">Quote ID: {detail.current_quote.quote_id}</p>
                                            <p className="mt-1">総額: {formatCurrency(detail.current_quote.amounts.total_amount)}</p>
                                            <p className="mt-1">徒歩目安: {detail.current_quote.walking_time_range ?? '未算出'}</p>
                                        </div>
                                    ) : null}
                                </article>

                                <article className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
                                    <p className="text-xs font-semibold tracking-wide text-[#d2b179]">待ち合わせ場所</p>
                                    {detail.service_address ? (
                                        <div className="mt-4 space-y-2 text-sm text-slate-300">
                                            <p>{placeTypeLabel(detail.service_address.place_type)}</p>
                                            <p>{detail.service_address.prefecture ?? ''} {detail.service_address.city ?? ''}</p>
                                            <p>{detail.service_address.address_line ?? '住所未設定'}</p>
                                            {detail.service_address.building ? <p>{detail.service_address.building}</p> : null}
                                            {detail.service_address.access_notes ? <p>備考: {detail.service_address.access_notes}</p> : null}
                                        </div>
                                    ) : (
                                        <p className="mt-4 text-sm text-slate-400">待ち合わせ場所はありません。</p>
                                    )}
                                </article>
                            </section>

                            <section className="grid gap-4 lg:grid-cols-2">
                                <article className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-xs font-semibold tracking-wide text-[#d2b179]">返金履歴</p>
                                            <h4 className="mt-2 text-lg font-semibold text-white">Refunds</h4>
                                        </div>
                                        <span className="text-sm text-slate-400">{detail.refunds.length}件</span>
                                    </div>
                                    <div className="mt-4 space-y-3">
                                        {detail.refunds.length === 0 ? (
                                            <div className="rounded-[22px] border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-400">
                                                返金履歴はありません。
                                            </div>
                                        ) : detail.refunds.map((refund) => (
                                            <article key={refund.public_id} className="rounded-[22px] bg-[#101720] p-4 text-sm text-slate-300">
                                                <p className="font-semibold text-white">{refund.public_id}</p>
                                                <p className="mt-2">理由: {refund.reason_code ?? '未設定'}</p>
                                                <p className="mt-1">申請額: {formatCurrency(refund.requested_amount)}</p>
                                                <p className="mt-1">承認額: {formatCurrency(refund.approved_amount)}</p>
                                                <p className="mt-1">処理日時: {formatDateTime(refund.processed_at)}</p>
                                            </article>
                                        ))}
                                    </div>
                                </article>

                                <article className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-xs font-semibold tracking-wide text-[#d2b179]">通報履歴</p>
                                            <h4 className="mt-2 text-lg font-semibold text-white">Reports</h4>
                                        </div>
                                        <span className="text-sm text-slate-400">{detail.reports.length}件</span>
                                    </div>
                                    <div className="mt-4 space-y-3">
                                        {detail.reports.length === 0 ? (
                                            <div className="rounded-[22px] border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-400">
                                                通報はありません。
                                            </div>
                                        ) : detail.reports.map((report) => (
                                            <Link
                                                key={report.public_id}
                                                to={`/admin/reports/${report.public_id}`}
                                                className="block rounded-[22px] bg-[#101720] p-4 text-sm text-slate-300 transition hover:bg-[#132031]"
                                            >
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <p className="font-semibold text-white">{report.public_id}</p>
                                                    <span className={['rounded-full px-2.5 py-1 text-xs font-semibold', bookingStatusTone(report.status === 'resolved' ? 'completed' : 'interrupted')].join(' ')}>
                                                        {report.status === 'resolved' ? '解決済み' : '未解決'}
                                                    </span>
                                                </div>
                                                <p className="mt-2">{report.category} / {report.severity}</p>
                                            </Link>
                                        ))}
                                    </div>
                                </article>
                            </section>

                            <section className="grid gap-4 lg:grid-cols-2">
                                <article className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-xs font-semibold tracking-wide text-[#d2b179]">同意記録</p>
                                            <h4 className="mt-2 text-lg font-semibold text-white">Consents</h4>
                                        </div>
                                        <span className="text-sm text-slate-400">{detail.consents.length}件</span>
                                    </div>
                                    <div className="mt-4 space-y-3">
                                        {detail.consents.length === 0 ? (
                                            <div className="rounded-[22px] border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-400">
                                                同意記録はありません。
                                            </div>
                                        ) : detail.consents.map((consent) => (
                                            <article key={consent.id} className="rounded-[22px] bg-[#101720] p-4 text-sm text-slate-300">
                                                <p className="font-semibold text-white">{consent.consent_type}</p>
                                                <p className="mt-2">対象: {displayName(consent.account)}</p>
                                                <p className="mt-1">文書: {consent.legal_document?.title ?? '未設定'}</p>
                                                <p className="mt-1">同意日時: {formatDateTime(consent.consented_at)}</p>
                                            </article>
                                        ))}
                                    </div>
                                </article>

                                <article className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-xs font-semibold tracking-wide text-[#d2b179]">体調確認</p>
                                            <h4 className="mt-2 text-lg font-semibold text-white">Health Checks</h4>
                                        </div>
                                        <span className="text-sm text-slate-400">{detail.health_checks.length}件</span>
                                    </div>
                                    <div className="mt-4 space-y-3">
                                        {detail.health_checks.length === 0 ? (
                                            <div className="rounded-[22px] border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-400">
                                                体調確認はありません。
                                            </div>
                                        ) : detail.health_checks.map((check) => (
                                            <article key={check.id} className="rounded-[22px] bg-[#101720] p-4 text-sm text-slate-300">
                                                <p className="font-semibold text-white">{displayName(check.account)} / {check.role}</p>
                                                <p className="mt-2">飲酒: {check.drinking_status ?? '未設定'}</p>
                                                <p className="mt-1">発熱: {check.has_fever ? 'あり' : 'なし'} / 怪我: {check.has_injury ? 'あり' : 'なし'}</p>
                                                {check.notes ? <p className="mt-1">備考: {check.notes}</p> : null}
                                            </article>
                                        ))}
                                    </div>
                                </article>
                            </section>

                            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">STATUS TIMELINE</p>
                                        <h4 className="mt-2 text-lg font-semibold text-white">状態遷移</h4>
                                    </div>
                                    <span className="text-sm text-slate-400">{detail.status_logs.length}件</span>
                                </div>

                                <div className="mt-4 space-y-3">
                                    {detail.status_logs.length === 0 ? (
                                        <div className="rounded-[22px] border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-400">
                                            状態遷移ログはありません。
                                        </div>
                                    ) : detail.status_logs.map((log, index) => (
                                        <article key={`${log.to_status}-${log.created_at}-${index}`} className="rounded-[22px] bg-[#101720] p-4">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-semibold text-white">{bookingStatusLabel(log.to_status)}</p>
                                                    <p className="mt-1 text-xs text-slate-400">
                                                        {displayName(log.actor)} / {log.actor_role ?? 'system'} / {formatDateTime(log.created_at)}
                                                    </p>
                                                </div>
                                                {log.reason_code ? (
                                                    <span className="rounded-full bg-[#f3efe7] px-2.5 py-1 text-xs font-semibold text-[#55606d]">
                                                        {log.reason_code}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            </section>
                        </>
                    ) : selectedListBooking ? (
                        <section className="rounded-[28px] border border-white/10 bg-white/[0.04] px-6 py-8 text-sm text-slate-300">
                            {selectedListBooking.public_id} の詳細を読み込めませんでした。
                        </section>
                    ) : null}
                </div>
            </section>
        </div>
    );
}
