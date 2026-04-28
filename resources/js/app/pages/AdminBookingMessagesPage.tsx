import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatDateTime } from '../lib/therapist';
import type {
    AdminBookingDetailRecord,
    AdminBookingMessageRecord,
    AdminReportRecord,
    ApiEnvelope,
} from '../lib/types';

type ReadFilter = 'all' | 'read' | 'unread';
type ModerationFilter = 'all' | 'ok' | 'blocked' | 'reviewed' | 'escalated';
type BooleanFilter = 'all' | 'yes' | 'no';

function normalizeReadFilter(value: string | null): ReadFilter {
    if (value === 'read' || value === 'unread') {
        return value;
    }

    return 'all';
}

function normalizeModerationFilter(value: string | null): ModerationFilter {
    if (value === 'ok' || value === 'blocked' || value === 'reviewed' || value === 'escalated') {
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

function bookingStatusLabel(status: string): string {
    switch (status) {
        case 'payment_authorizing':
            return '与信処理中';
        case 'requested':
            return '承諾待ち';
        case 'accepted':
            return '承諾済み';
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
        case 'interrupted':
            return '中断';
        case 'canceled':
            return 'キャンセル';
        case 'rejected':
            return '辞退';
        case 'expired':
            return '期限切れ';
        case 'payment_canceled':
            return '与信取消';
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
        default:
            return 'bg-[#f3efe7] text-[#55606d]';
    }
}

function moderationLabel(status: string): string {
    switch (status) {
        case 'ok':
            return '問題なし';
        case 'blocked':
            return 'ブロック';
        case 'reviewed':
            return 'レビュー済み';
        case 'escalated':
            return 'エスカレーション';
        default:
            return status;
    }
}

function moderationTone(status: string): string {
    switch (status) {
        case 'ok':
            return 'bg-[#e8f4ea] text-[#205738]';
        case 'blocked':
            return 'bg-[#f8e6e3] text-[#8f4337]';
        case 'reviewed':
            return 'bg-[#eef4ff] text-[#30527a]';
        case 'escalated':
            return 'bg-[#fff1df] text-[#91571b]';
        default:
            return 'bg-[#f3efe7] text-[#55606d]';
    }
}

function displayName(account: { display_name: string | null; public_id?: string | null } | null): string {
    if (!account) {
        return '未設定';
    }

    return account.display_name?.trim() || account.public_id || '未設定';
}

function buildFlagValue(value: BooleanFilter): string | null {
    if (value === 'yes') {
        return '1';
    }

    if (value === 'no') {
        return '0';
    }

    return null;
}

export function AdminBookingMessagesPage() {
    const { token } = useAuth();
    const { publicId } = useParams<{ publicId: string }>();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();

    const [booking, setBooking] = useState<AdminBookingDetailRecord | null>(null);
    const [messages, setMessages] = useState<AdminBookingMessageRecord[]>([]);
    const [selectedMessage, setSelectedMessage] = useState<AdminBookingMessageRecord | null>(null);
    const [pageError, setPageError] = useState<string | null>(null);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [noteDraft, setNoteDraft] = useState('');
    const [moderationStatus, setModerationStatus] = useState<'ok' | 'blocked' | 'reviewed' | 'escalated'>('reviewed');
    const [moderationNote, setModerationNote] = useState('');
    const [reportCategory, setReportCategory] = useState('prohibited_contact_exchange');
    const [reportSeverity, setReportSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('high');
    const [reportDetail, setReportDetail] = useState('');
    const [reportNote, setReportNote] = useState('');
    const [suspensionReason, setSuspensionReason] = useState('policy_violation');
    const [suspensionNote, setSuspensionNote] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    const [isSubmittingNote, setIsSubmittingNote] = useState(false);
    const [isSubmittingModeration, setIsSubmittingModeration] = useState(false);
    const [isSubmittingReport, setIsSubmittingReport] = useState(false);
    const [isSubmittingSuspend, setIsSubmittingSuspend] = useState(false);

    const readFilter = normalizeReadFilter(searchParams.get('read_status'));
    const moderationFilter = normalizeModerationFilter(searchParams.get('moderation_status'));
    const contactExchangeFilter = normalizeBooleanFilter(searchParams.get('detected_contact_exchange'));
    const hasNotesFilter = normalizeBooleanFilter(searchParams.get('has_admin_notes'));
    const hasOpenReportFilter = normalizeBooleanFilter(searchParams.get('has_open_report'));
    const senderFilter = searchParams.get('sender_account_id') ?? '';
    const selectedMessageId = searchParams.get('message_id');

    usePageTitle(booking ? `${booking.public_id} のメッセージ監視` : '予約メッセージ監視');
    useToastOnMessage(successMessage, 'success');

    const loadMessages = useCallback(async (refresh = false) => {
        if (!token || !publicId) {
            return;
        }

        if (refresh) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }

        setPageError(null);

        const params = new URLSearchParams();

        if (senderFilter) {
            params.set('sender_account_id', senderFilter);
        }

        if (readFilter !== 'all') {
            params.set('read_status', readFilter);
        }

        if (moderationFilter !== 'all') {
            params.set('moderation_status', moderationFilter);
        }

        const contactExchangeValue = buildFlagValue(contactExchangeFilter);
        const hasNotesValue = buildFlagValue(hasNotesFilter);
        const hasOpenReportValue = buildFlagValue(hasOpenReportFilter);

        if (contactExchangeValue) {
            params.set('detected_contact_exchange', contactExchangeValue);
        }

        if (hasNotesValue) {
            params.set('has_admin_notes', hasNotesValue);
        }

        if (hasOpenReportValue) {
            params.set('has_open_report', hasOpenReportValue);
        }

        try {
            const [bookingPayload, messagesPayload] = await Promise.all([
                apiRequest<ApiEnvelope<AdminBookingDetailRecord>>(`/admin/bookings/${publicId}`, { token }),
                apiRequest<ApiEnvelope<AdminBookingMessageRecord[]>>(`/admin/bookings/${publicId}/messages?${params.toString()}`, { token }),
            ]);

            const nextBooking = unwrapData(bookingPayload);
            const nextMessages = unwrapData(messagesPayload);

            setBooking(nextBooking);
            setMessages(nextMessages);
            setPageError(null);

            if (nextMessages.length === 0) {
                setSelectedMessage(null);

                if (selectedMessageId) {
                    setSearchParams((previous) => {
                        const next = new URLSearchParams(previous);
                        next.delete('message_id');
                        return next;
                    }, { replace: true });
                }

                return;
            }

            const fallbackMessage = nextMessages.find((message) => String(message.id) === selectedMessageId) ?? nextMessages[0];

            setSelectedMessage(fallbackMessage);

            if (String(fallbackMessage.id) !== selectedMessageId) {
                setSearchParams((previous) => {
                    const next = new URLSearchParams(previous);
                    next.set('message_id', String(fallbackMessage.id));
                    return next;
                }, { replace: true });
            }
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '予約メッセージ一覧の取得に失敗しました。';

            setPageError(message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [
        contactExchangeFilter,
        hasNotesFilter,
        hasOpenReportFilter,
        moderationFilter,
        publicId,
        readFilter,
        selectedMessageId,
        senderFilter,
        setSearchParams,
        token,
    ]);

    const loadSelectedMessage = useCallback(async () => {
        if (!token || !publicId || !selectedMessageId) {
            return;
        }

        setIsLoadingDetail(true);
        setDetailError(null);

        try {
            const params = new URLSearchParams();

            if (senderFilter) {
                params.set('sender_account_id', senderFilter);
            }

            if (readFilter !== 'all') {
                params.set('read_status', readFilter);
            }

            if (moderationFilter !== 'all') {
                params.set('moderation_status', moderationFilter);
            }

            const contactExchangeValue = buildFlagValue(contactExchangeFilter);
            const hasNotesValue = buildFlagValue(hasNotesFilter);
            const hasOpenReportValue = buildFlagValue(hasOpenReportFilter);

            if (contactExchangeValue) {
                params.set('detected_contact_exchange', contactExchangeValue);
            }

            if (hasNotesValue) {
                params.set('has_admin_notes', hasNotesValue);
            }

            if (hasOpenReportValue) {
                params.set('has_open_report', hasOpenReportValue);
            }

            const payload = await apiRequest<ApiEnvelope<AdminBookingMessageRecord[]>>(`/admin/bookings/${publicId}/messages?${params.toString()}`, { token });
            const nextMessages = unwrapData(payload);
            const match = nextMessages.find((message) => String(message.id) === selectedMessageId);

            if (!match) {
                setDetailError('選択中のメッセージは現在の絞り込み条件では表示されません。');
                return;
            }

            setMessages(nextMessages);
            setSelectedMessage(match);
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '選択中メッセージの更新に失敗しました。';

            setDetailError(message);
        } finally {
            setIsLoadingDetail(false);
        }
    }, [
        contactExchangeFilter,
        hasNotesFilter,
        hasOpenReportFilter,
        moderationFilter,
        publicId,
        readFilter,
        selectedMessageId,
        senderFilter,
        token,
    ]);

    useEffect(() => {
        void loadMessages();
    }, [loadMessages]);

    useEffect(() => {
        if (!selectedMessageId) {
            return;
        }

        void loadSelectedMessage();
    }, [loadSelectedMessage, selectedMessageId]);

    const summary = useMemo(() => ({
        total: messages.length,
        blocked: messages.filter((message) => message.moderation_status === 'blocked').length,
        escalated: messages.filter((message) => message.moderation_status === 'escalated').length,
        withReports: messages.filter((message) => message.open_report_count > 0).length,
        withNotes: messages.filter((message) => message.admin_note_count > 0).length,
        contactExchange: messages.filter((message) => message.detected_contact_exchange).length,
    }), [messages]);

    const senderOptions = useMemo(() => {
        if (!booking) {
            return [];
        }

        const options: Array<{ value: string; label: string }> = [];

        if (booking.user_account?.public_id) {
            options.push({
                value: booking.user_account.public_id,
                label: `利用者: ${displayName(booking.user_account)}`,
            });
        }

        if (booking.therapist_account?.public_id) {
            options.push({
                value: booking.therapist_account.public_id,
                label: `タチキャスト: ${displayName(booking.therapist_account)}`,
            });
        }

        return options;
    }, [booking]);

    function updateFilters(
        next: Partial<Record<'sender_account_id' | 'read_status' | 'moderation_status' | 'detected_contact_exchange' | 'has_admin_notes' | 'has_open_report', string | null>>,
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

    async function handleAddNote(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token || !publicId || !selectedMessage || !noteDraft.trim()) {
            return;
        }

        setIsSubmittingNote(true);
        setActionError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminBookingMessageRecord>>(`/admin/bookings/${publicId}/messages/${selectedMessage.id}/notes`, {
                method: 'POST',
                token,
                body: {
                    note: noteDraft.trim(),
                },
            });

            const updated = unwrapData(payload);
            setSelectedMessage(updated);
            setMessages((current) => current.map((message) => message.id === updated.id ? updated : message));
            setNoteDraft('');
            setSuccessMessage('内部メモを追加しました。');
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '内部メモの追加に失敗しました。';

            setActionError(message);
        } finally {
            setIsSubmittingNote(false);
        }
    }

    async function handleModerate(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token || !publicId || !selectedMessage) {
            return;
        }

        setIsSubmittingModeration(true);
        setActionError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminBookingMessageRecord>>(`/admin/bookings/${publicId}/messages/${selectedMessage.id}/moderation`, {
                method: 'POST',
                token,
                body: {
                    moderation_status: moderationStatus,
                    note: moderationNote.trim() || null,
                },
            });

            const updated = unwrapData(payload);
            setSelectedMessage(updated);
            setMessages((current) => current.map((message) => message.id === updated.id ? updated : message));
            setModerationNote('');
            setSuccessMessage('モデレーション状態を更新しました。');
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : 'モデレーション更新に失敗しました。';

            setActionError(message);
        } finally {
            setIsSubmittingModeration(false);
        }
    }

    async function handleCreateReport(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token || !publicId || !selectedMessage) {
            return;
        }

        setIsSubmittingReport(true);
        setActionError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminReportRecord>>(`/admin/bookings/${publicId}/messages/${selectedMessage.id}/reports`, {
                method: 'POST',
                token,
                body: {
                    category: reportCategory,
                    severity: reportSeverity,
                    detail: reportDetail.trim() || null,
                    note: reportNote.trim() || null,
                },
            });

            const report = unwrapData(payload);
            setReportDetail('');
            setReportNote('');
            setSuccessMessage(`通報 ${report.public_id} を起票しました。`);
            await loadSelectedMessage();
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '通報起票に失敗しました。';

            setActionError(message);
        } finally {
            setIsSubmittingReport(false);
        }
    }

    async function handleSuspendSender(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token || !publicId || !selectedMessage) {
            return;
        }

        setIsSubmittingSuspend(true);
        setActionError(null);
        setSuccessMessage(null);

        try {
            await apiRequest(`/admin/bookings/${publicId}/messages/${selectedMessage.id}/suspend-sender`, {
                method: 'POST',
                token,
                body: {
                    reason_code: suspensionReason,
                    note: suspensionNote.trim() || null,
                },
            });

            setSuspensionNote('');
            setSuccessMessage('送信者アカウントを停止しました。');
            await loadSelectedMessage();
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '送信者アカウント停止に失敗しました。';

            setActionError(message);
        } finally {
            setIsSubmittingSuspend(false);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="予約メッセージを読み込み中" message="危険メッセージと内部メモを集約しています。" />;
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_16px_34px_rgba(2,6,23,0.14)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">MESSAGE MODERATION</p>
                        <h2 className="text-2xl font-semibold text-white sm:text-[2rem]">予約メッセージ監視</h2>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            連絡先交換検知、内部メモ、通報起票、送信者停止までを1画面で扱います。
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {booking ? (
                            <Link
                                to={`/admin/bookings/${booking.public_id}`}
                                className="inline-flex min-h-11 items-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
                            >
                                予約詳細へ戻る
                            </Link>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => {
                                void loadMessages(true);
                                void loadSelectedMessage();
                            }}
                            disabled={isRefreshing || isLoadingDetail}
                            className="inline-flex min-h-11 items-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isRefreshing ? '更新中...' : '最新化'}
                        </button>
                    </div>
                </div>
            </section>

            {pageError ? (
                <section className="rounded-[24px] border border-[#f1d4b5] bg-[#fff4e8] px-5 py-4 text-sm text-[#9a4b35]">
                    {pageError}
                </section>
            ) : null}

            {booking ? (
                <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_16px_34px_rgba(2,6,23,0.12)]">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className={['rounded-full px-2.5 py-1 text-xs font-semibold', bookingStatusTone(booking.status)].join(' ')}>
                                    {bookingStatusLabel(booking.status)}
                                </span>
                                <span className="rounded-full bg-[#f3efe7] px-2.5 py-1 text-xs font-semibold text-[#55606d]">
                                    {booking.is_on_demand ? '今すぐ' : '予定予約'}
                                </span>
                            </div>
                            <h3 className="text-lg font-semibold text-white">
                                {displayName(booking.user_account)} → {booking.therapist_profile?.public_name ?? displayName(booking.therapist_account)}
                            </h3>
                            <p className="text-sm text-slate-300">
                                予約番号 {booking.public_id} / {booking.therapist_menu?.name ?? 'メニュー未設定'} / {formatDateTime(booking.scheduled_start_at ?? booking.requested_start_at)}
                            </p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                            <article className="rounded-[20px] bg-[#101720] px-4 py-3">
                                <p className="text-xs font-semibold tracking-wide text-[#d2b179]">総メッセージ</p>
                                <p className="mt-2 text-2xl font-semibold text-white">{summary.total}</p>
                            </article>
                            <article className="rounded-[20px] bg-[#101720] px-4 py-3">
                                <p className="text-xs font-semibold tracking-wide text-[#d2b179]">危険検知</p>
                                <p className="mt-2 text-2xl font-semibold text-white">{summary.contactExchange}</p>
                            </article>
                            <article className="rounded-[20px] bg-[#101720] px-4 py-3">
                                <p className="text-xs font-semibold tracking-wide text-[#d2b179]">未解決通報</p>
                                <p className="mt-2 text-2xl font-semibold text-white">{summary.withReports}</p>
                            </article>
                        </div>
                    </div>
                </section>
            ) : null}

            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_16px_34px_rgba(2,6,23,0.12)]">
                <div className="grid gap-4 xl:grid-cols-[repeat(6,minmax(0,1fr))]">
                    <label className="space-y-2">
                        <span className="text-xs font-semibold tracking-wide text-slate-300">送信者</span>
                        <select
                            value={senderFilter}
                            onChange={(event) => updateFilters({ sender_account_id: event.target.value || null })}
                            className="w-full rounded-2xl border border-white/10 bg-[#121a24] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d2b179]/60"
                        >
                            <option value="">すべて</option>
                            {senderOptions.map((option) => (
                                <option key={option.value} value={option.value ?? ''}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-xs font-semibold tracking-wide text-slate-300">既読状態</span>
                        <select
                            value={readFilter}
                            onChange={(event) => updateFilters({ read_status: event.target.value })}
                            className="w-full rounded-2xl border border-white/10 bg-[#121a24] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d2b179]/60"
                        >
                            <option value="all">すべて</option>
                            <option value="unread">未読</option>
                            <option value="read">既読</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-xs font-semibold tracking-wide text-slate-300">モデレーション</span>
                        <select
                            value={moderationFilter}
                            onChange={(event) => updateFilters({ moderation_status: event.target.value })}
                            className="w-full rounded-2xl border border-white/10 bg-[#121a24] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d2b179]/60"
                        >
                            <option value="all">すべて</option>
                            <option value="ok">問題なし</option>
                            <option value="blocked">ブロック</option>
                            <option value="reviewed">レビュー済み</option>
                            <option value="escalated">エスカレーション</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-xs font-semibold tracking-wide text-slate-300">連絡先交換検知</span>
                        <select
                            value={contactExchangeFilter}
                            onChange={(event) => updateFilters({ detected_contact_exchange: event.target.value })}
                            className="w-full rounded-2xl border border-white/10 bg-[#121a24] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d2b179]/60"
                        >
                            <option value="all">すべて</option>
                            <option value="yes">あり</option>
                            <option value="no">なし</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-xs font-semibold tracking-wide text-slate-300">内部メモ</span>
                        <select
                            value={hasNotesFilter}
                            onChange={(event) => updateFilters({ has_admin_notes: event.target.value })}
                            className="w-full rounded-2xl border border-white/10 bg-[#121a24] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d2b179]/60"
                        >
                            <option value="all">すべて</option>
                            <option value="yes">あり</option>
                            <option value="no">なし</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-xs font-semibold tracking-wide text-slate-300">未解決通報</span>
                        <select
                            value={hasOpenReportFilter}
                            onChange={(event) => updateFilters({ has_open_report: event.target.value })}
                            className="w-full rounded-2xl border border-white/10 bg-[#121a24] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d2b179]/60"
                        >
                            <option value="all">すべて</option>
                            <option value="yes">あり</option>
                            <option value="no">なし</option>
                        </select>
                    </label>
                </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(400px,0.98fr)]">
                <div className="space-y-4">
                    {messages.length === 0 ? (
                        <section className="rounded-[28px] border border-dashed border-white/10 bg-white/[0.03] px-6 py-12 text-center text-sm text-slate-400">
                            条件に合うメッセージはありません。
                        </section>
                    ) : (
                        messages.map((message) => {
                            const isActive = selectedMessage?.id === message.id;
                            const nextParams = new URLSearchParams(searchParams);
                            nextParams.set('message_id', String(message.id));
                            const detailPath = `/admin/bookings/${publicId}/messages?${nextParams.toString()}`;

                            return (
                                <Link
                                    key={message.id}
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
                                                <span className={['rounded-full px-2.5 py-1 text-xs font-semibold', moderationTone(message.moderation_status)].join(' ')}>
                                                    {moderationLabel(message.moderation_status)}
                                                </span>
                                                {message.detected_contact_exchange ? (
                                                    <span className="rounded-full bg-[#fff1df] px-2.5 py-1 text-xs font-semibold text-[#91571b]">
                                                        連絡先交換検知
                                                    </span>
                                                ) : null}
                                                {message.open_report_count > 0 ? (
                                                    <span className="rounded-full bg-[#f8e6e3] px-2.5 py-1 text-xs font-semibold text-[#8f4337]">
                                                        未解決通報 {message.open_report_count}
                                                    </span>
                                                ) : null}
                                            </div>
                                            <h3 className="text-lg font-semibold text-white">{displayName(message.sender)}</h3>
                                            <p className="line-clamp-2 text-sm leading-7 text-slate-300">{message.body}</p>
                                        </div>

                                        <div className="text-right text-xs text-slate-400">
                                            <p>{formatDateTime(message.sent_at)}</p>
                                            <p className="mt-1">メモ {message.admin_note_count}件</p>
                                        </div>
                                    </div>
                                </Link>
                            );
                        })
                    )}
                </div>

                <div className="space-y-4">

                    {actionError ? (
                        <section className="rounded-[22px] border border-[#f1d4b5] bg-[#fff4e8] px-5 py-4 text-sm text-[#9a4b35]">
                            {actionError}
                        </section>
                    ) : null}

                    {detailError ? (
                        <section className="rounded-[22px] border border-[#f1d4b5] bg-[#fff4e8] px-5 py-4 text-sm text-[#9a4b35]">
                            {detailError}
                        </section>
                    ) : null}

                    {!selectedMessage ? (
                        <section className="rounded-[28px] border border-dashed border-white/10 bg-white/[0.03] px-6 py-12 text-center text-sm text-slate-400">
                            左の一覧からメッセージを選ぶと、本文確認と運営対応ができます。
                        </section>
                    ) : (
                        <>
                            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_16px_34px_rgba(2,6,23,0.12)]">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={['rounded-full px-2.5 py-1 text-xs font-semibold', moderationTone(selectedMessage.moderation_status)].join(' ')}>
                                                {moderationLabel(selectedMessage.moderation_status)}
                                            </span>
                                            {selectedMessage.detected_contact_exchange ? (
                                                <span className="rounded-full bg-[#fff1df] px-2.5 py-1 text-xs font-semibold text-[#91571b]">
                                                    連絡先交換検知
                                                </span>
                                            ) : null}
                                        </div>
                                        <h3 className="text-xl font-semibold text-white">{displayName(selectedMessage.sender)}</h3>
                                        <p className="text-sm text-slate-300">
                                            {selectedMessage.sender?.email ?? 'メール未設定'} / 送信 {formatDateTime(selectedMessage.sent_at)}
                                        </p>
                                    </div>

                                    <div className="text-right text-xs text-slate-400">
                                        <p>ステータス: {selectedMessage.sender?.status ?? '未設定'}</p>
                                        <p className="mt-1">既読: {formatDateTime(selectedMessage.read_at)}</p>
                                        <p className="mt-1">更新: {formatDateTime(selectedMessage.moderated_at)}</p>
                                    </div>
                                </div>

                                <article className="mt-5 rounded-[22px] bg-[#101720] p-5">
                                    <p className="text-xs font-semibold tracking-wide text-[#d2b179]">メッセージ本文</p>
                                    <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-100">{selectedMessage.body}</p>
                                </article>

                                <div className="mt-4 grid gap-4 md:grid-cols-3">
                                    <article className="rounded-[22px] bg-[#101720] p-4">
                                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">内部メモ</p>
                                        <p className="mt-2 text-2xl font-semibold text-white">{selectedMessage.admin_note_count}</p>
                                    </article>
                                    <article className="rounded-[22px] bg-[#101720] p-4">
                                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">未解決通報</p>
                                        <p className="mt-2 text-2xl font-semibold text-white">{selectedMessage.open_report_count}</p>
                                    </article>
                                    <article className="rounded-[22px] bg-[#101720] p-4">
                                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">停止状態</p>
                                        <p className="mt-2 text-sm font-semibold text-white">
                                            {selectedMessage.sender?.status === 'suspended' ? '停止中' : '稼働中'}
                                        </p>
                                        {selectedMessage.sender?.suspension_reason ? (
                                            <p className="mt-1 text-xs text-slate-400">{selectedMessage.sender.suspension_reason}</p>
                                        ) : null}
                                    </article>
                                </div>
                            </section>

                            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_16px_34px_rgba(2,6,23,0.12)]">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">内部メモ</p>
                                        <h4 className="mt-2 text-lg font-semibold text-white">運営メモ</h4>
                                    </div>
                                    <span className="text-sm text-slate-400">{selectedMessage.notes.length}件</span>
                                </div>

                                <div className="mt-4 space-y-3">
                                    {selectedMessage.notes.length === 0 ? (
                                        <div className="rounded-[22px] border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-400">
                                            まだ内部メモはありません。
                                        </div>
                                    ) : (
                                        selectedMessage.notes.map((note) => (
                                            <article key={note.id} className="rounded-[22px] bg-[#101720] p-4">
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div>
                                                        <p className="text-sm font-semibold text-white">{displayName(note.author)}</p>
                                                        <p className="mt-1 text-xs text-slate-400">{formatDateTime(note.created_at)}</p>
                                                    </div>
                                                </div>
                                                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-200">{note.note}</p>
                                            </article>
                                        ))
                                    )}
                                </div>
                            </section>

                            <section className="grid gap-4 xl:grid-cols-2">
                                <form onSubmit={handleAddNote} className="space-y-4 rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
                                    <div>
                                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">メモ追加</p>
                                        <h4 className="mt-2 text-lg font-semibold text-white">内部メモを追加</h4>
                                    </div>

                                    <textarea
                                        value={noteDraft}
                                        onChange={(event) => setNoteDraft(event.target.value)}
                                        rows={5}
                                        placeholder="運営確認メモを残します。"
                                        className="w-full rounded-2xl border border-white/10 bg-[#101720] px-4 py-3 text-sm leading-7 text-white outline-none transition placeholder:text-slate-500 focus:border-[#d2b179]/60"
                                    />

                                    <button
                                        type="submit"
                                        disabled={isSubmittingNote}
                                        className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#f3dec0] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#f7e7cd] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {isSubmittingNote ? '保存中...' : '内部メモを追加'}
                                    </button>
                                </form>

                                <form onSubmit={handleModerate} className="space-y-4 rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
                                    <div>
                                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">MODERATE</p>
                                        <h4 className="mt-2 text-lg font-semibold text-white">モデレーション更新</h4>
                                    </div>

                                    <label className="space-y-2">
                                        <span className="text-xs font-semibold tracking-wide text-slate-300">状態</span>
                                        <select
                                            value={moderationStatus}
                                            onChange={(event) => setModerationStatus(event.target.value as typeof moderationStatus)}
                                            className="w-full rounded-2xl border border-white/10 bg-[#101720] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d2b179]/60"
                                        >
                                            <option value="ok">問題なし</option>
                                            <option value="blocked">ブロック</option>
                                            <option value="reviewed">レビュー済み</option>
                                            <option value="escalated">エスカレーション</option>
                                        </select>
                                    </label>

                                    <textarea
                                        value={moderationNote}
                                        onChange={(event) => setModerationNote(event.target.value)}
                                        rows={4}
                                        placeholder="判断メモを残せます。"
                                        className="w-full rounded-2xl border border-white/10 bg-[#101720] px-4 py-3 text-sm leading-7 text-white outline-none transition placeholder:text-slate-500 focus:border-[#d2b179]/60"
                                    />

                                    <button
                                        type="submit"
                                        disabled={isSubmittingModeration}
                                        className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {isSubmittingModeration ? '更新中...' : 'モデレーションを更新'}
                                    </button>
                                </form>
                            </section>

                            <section className="grid gap-4 xl:grid-cols-2">
                                <form onSubmit={handleCreateReport} className="space-y-4 rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
                                    <div>
                                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">CREATE REPORT</p>
                                        <h4 className="mt-2 text-lg font-semibold text-white">通報を起票</h4>
                                    </div>

                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <label className="space-y-2">
                                            <span className="text-xs font-semibold tracking-wide text-slate-300">カテゴリ</span>
                                            <select
                                                value={reportCategory}
                                                onChange={(event) => setReportCategory(event.target.value)}
                                                className="w-full rounded-2xl border border-white/10 bg-[#101720] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d2b179]/60"
                                            >
                                                <option value="prohibited_contact_exchange">連絡先交換</option>
                                                <option value="boundary_violation">境界違反</option>
                                                <option value="violence">暴力・威圧</option>
                                                <option value="prohibited_request">禁止事項の依頼</option>
                                            </select>
                                        </label>
                                        <label className="space-y-2">
                                            <span className="text-xs font-semibold tracking-wide text-slate-300">重要度</span>
                                            <select
                                                value={reportSeverity}
                                                onChange={(event) => setReportSeverity(event.target.value as typeof reportSeverity)}
                                                className="w-full rounded-2xl border border-white/10 bg-[#101720] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d2b179]/60"
                                            >
                                                <option value="low">低</option>
                                                <option value="medium">中</option>
                                                <option value="high">高</option>
                                                <option value="critical">重大</option>
                                            </select>
                                        </label>
                                    </div>

                                    <textarea
                                        value={reportDetail}
                                        onChange={(event) => setReportDetail(event.target.value)}
                                        rows={4}
                                        placeholder="通報本文"
                                        className="w-full rounded-2xl border border-white/10 bg-[#101720] px-4 py-3 text-sm leading-7 text-white outline-none transition placeholder:text-slate-500 focus:border-[#d2b179]/60"
                                    />

                                    <textarea
                                        value={reportNote}
                                        onChange={(event) => setReportNote(event.target.value)}
                                        rows={3}
                                        placeholder="起票時メモ"
                                        className="w-full rounded-2xl border border-white/10 bg-[#101720] px-4 py-3 text-sm leading-7 text-white outline-none transition placeholder:text-slate-500 focus:border-[#d2b179]/60"
                                    />

                                    <button
                                        type="submit"
                                        disabled={isSubmittingReport || selectedMessage.open_report_count > 0}
                                        className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#f1d4b5]/40 bg-[#fff1df] px-5 py-3 text-sm font-semibold text-[#7f471d] transition hover:bg-[#ffe8cb] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {selectedMessage.open_report_count > 0
                                            ? '未解決通報あり'
                                            : isSubmittingReport
                                                ? '起票中...'
                                                : '通報を起票'}
                                    </button>
                                </form>

                                <form onSubmit={handleSuspendSender} className="space-y-4 rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
                                    <div>
                                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">SUSPEND SENDER</p>
                                        <h4 className="mt-2 text-lg font-semibold text-white">送信者アカウント停止</h4>
                                    </div>

                                    <label className="space-y-2">
                                        <span className="text-xs font-semibold tracking-wide text-slate-300">停止理由</span>
                                        <select
                                            value={suspensionReason}
                                            onChange={(event) => setSuspensionReason(event.target.value)}
                                            className="w-full rounded-2xl border border-white/10 bg-[#101720] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d2b179]/60"
                                        >
                                            <option value="policy_violation">ポリシー違反</option>
                                            <option value="safety_concern">安全上の懸念</option>
                                            <option value="prohibited_contact_exchange">連絡先交換</option>
                                        </select>
                                    </label>

                                    <textarea
                                        value={suspensionNote}
                                        onChange={(event) => setSuspensionNote(event.target.value)}
                                        rows={4}
                                        placeholder="停止判断メモ"
                                        className="w-full rounded-2xl border border-white/10 bg-[#101720] px-4 py-3 text-sm leading-7 text-white outline-none transition placeholder:text-slate-500 focus:border-[#d2b179]/60"
                                    />

                                    <button
                                        type="submit"
                                        disabled={isSubmittingSuspend || selectedMessage.sender?.status === 'suspended'}
                                        className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#f4b9b1]/40 bg-[#f8e6e3] px-5 py-3 text-sm font-semibold text-[#8f4337] transition hover:bg-[#f5ddd8] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {selectedMessage.sender?.status === 'suspended'
                                            ? 'すでに停止中'
                                            : isSubmittingSuspend
                                                ? '停止中...'
                                                : '送信者を停止'}
                                    </button>
                                </form>
                            </section>
                        </>
                    )}
                </div>
            </section>
        </div>
    );
}
