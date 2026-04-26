import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatCurrency, getServiceAddressLabel } from '../lib/discovery';
import { formatDateTime } from '../lib/therapist';
import type {
    AccountBlockRecord,
    ApiEnvelope,
    BookingDetailRecord,
    ReportRecord,
} from '../lib/types';

const reportCategoryOptions = [
    { value: 'boundary_violation', label: '施術範囲・境界の違反' },
    { value: 'prohibited_request', label: '禁止行為の要求' },
    { value: 'prohibited_contact_exchange', label: '連絡先交換の誘導' },
    { value: 'violence', label: '暴力・威圧・脅し' },
    { value: 'safety_concern', label: '安全上の不安' },
    { value: 'other', label: 'その他' },
];

const severityOptions = [
    { value: 'medium', label: '通常' },
    { value: 'high', label: '高い' },
    { value: 'critical', label: '緊急' },
];

function blockReasonLabel(reasonCode: string | null | undefined): string {
    switch (reasonCode) {
        case 'unsafe':
            return '安全上の不安';
        case 'external_contact':
            return '連絡先交換の誘導';
        case 'boundary_violation':
            return '境界違反';
        default:
            return reasonCode ?? '未設定';
    }
}

export function UserBookingReportPage() {
    const { publicId } = useParams<{ publicId: string }>();
    const navigate = useNavigate();
    const { token } = useAuth();
    const [booking, setBooking] = useState<BookingDetailRecord | null>(null);
    const [existingBlocks, setExistingBlocks] = useState<AccountBlockRecord[]>([]);
    const [reportCategory, setReportCategory] = useState(reportCategoryOptions[0]?.value ?? 'boundary_violation');
    const [severity, setSeverity] = useState('medium');
    const [detail, setDetail] = useState('');
    const [blockAfterReport, setBlockAfterReport] = useState(false);
    const [pageError, setPageError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [successReport, setSuccessReport] = useState<ReportRecord | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isTogglingBlock, setIsTogglingBlock] = useState(false);

    usePageTitle('通報する');

    const loadPage = useCallback(async () => {
        if (!token || !publicId) {
            return;
        }

        setPageError(null);

        try {
            const [bookingPayload, blocksPayload] = await Promise.all([
                apiRequest<ApiEnvelope<BookingDetailRecord>>(`/bookings/${publicId}`, { token }),
                apiRequest<ApiEnvelope<AccountBlockRecord[]>>('/accounts/blocks', { token }),
            ]);

            setBooking(unwrapData(bookingPayload));
            setExistingBlocks(unwrapData(blocksPayload));
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '通報画面の準備に失敗しました。';

            setPageError(message);
        } finally {
            setIsLoading(false);
        }
    }, [publicId, token]);

    useEffect(() => {
        void loadPage();
    }, [loadPage]);

    const targetAccountId = booking?.counterparty?.public_id ?? null;
    const existingBlock = useMemo(
        () => existingBlocks.find((block) => block.blocked_account_id === targetAccountId) ?? null,
        [existingBlocks, targetAccountId],
    );

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token || !publicId || !booking || !targetAccountId) {
            return;
        }

        setIsSubmitting(true);
        setFormError(null);

        try {
            const reportPayload = await apiRequest<ApiEnvelope<ReportRecord>>('/reports', {
                method: 'POST',
                token,
                body: {
                    booking_id: publicId,
                    target_account_id: targetAccountId,
                    category: reportCategory,
                    severity,
                    detail: detail.trim() || null,
                },
            });

            const createdReport = unwrapData(reportPayload);

            if (blockAfterReport && !existingBlock) {
                const blockPayload = await apiRequest<ApiEnvelope<AccountBlockRecord>>(`/accounts/${targetAccountId}/block`, {
                    method: 'POST',
                    token,
                    body: {
                        reason_code: reportCategory === 'prohibited_contact_exchange'
                            ? 'external_contact'
                            : reportCategory === 'boundary_violation'
                                ? 'boundary_violation'
                                : 'unsafe',
                    },
                });

                const createdBlock = unwrapData(blockPayload);
                setExistingBlocks((current) => [createdBlock, ...current.filter((item) => item.id !== createdBlock.id)]);
            }

            setSuccessReport(createdReport);
            setDetail('');
            setBlockAfterReport(false);
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '通報の送信に失敗しました。';

            setFormError(message);
        } finally {
            setIsSubmitting(false);
        }
    }

    async function toggleBlock() {
        if (!token || !targetAccountId) {
            return;
        }

        setIsTogglingBlock(true);
        setFormError(null);

        try {
            if (existingBlock) {
                await apiRequest<null>(`/accounts/${targetAccountId}/block`, {
                    method: 'DELETE',
                    token,
                });

                setExistingBlocks((current) => current.filter((block) => block.id !== existingBlock.id));
            } else {
                const payload = await apiRequest<ApiEnvelope<AccountBlockRecord>>(`/accounts/${targetAccountId}/block`, {
                    method: 'POST',
                    token,
                    body: { reason_code: 'unsafe' },
                });

                const createdBlock = unwrapData(payload);
                setExistingBlocks((current) => [createdBlock, ...current.filter((block) => block.id !== createdBlock.id)]);
            }
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : 'ブロック状態の更新に失敗しました。';

            setFormError(message);
        } finally {
            setIsTogglingBlock(false);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="通報画面を準備中" message="予約情報と現在のブロック状態を確認しています。" />;
    }

    if (!booking || !targetAccountId) {
        return (
            <div className="space-y-6 rounded-[28px] bg-white p-6 text-[#17202b] shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                <p className="text-sm font-semibold text-[#9a7a49]">REPORT</p>
                <h1 className="text-3xl font-semibold">通報対象を確認できませんでした</h1>
                <p className="text-sm leading-7 text-[#68707a]">
                    {pageError ?? '予約相手の情報を確認できませんでした。予約詳細へ戻って状態を確認してください。'}
                </p>
                <div className="flex flex-wrap gap-3">
                    <Link
                        to={publicId ? `/user/bookings/${publicId}` : '/user/bookings'}
                        className="inline-flex min-h-11 items-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140]"
                    >
                        予約詳細へ戻る
                    </Link>
                    <Link
                        to="/user/reports"
                        className="inline-flex min-h-11 items-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                    >
                        通報履歴へ
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <section className="rounded-[32px] bg-[linear-gradient(140deg,#17202b_0%,#223245_100%)] p-6 text-white shadow-[0_24px_60px_rgba(15,23,42,0.28)] sm:p-8">
                <p className="text-xs font-semibold tracking-wide text-[#f3dec0]">SAFETY REPORT</p>
                <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-3">
                        <h1 className="text-3xl font-semibold">予約に関する通報</h1>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            安全上の不安や禁止行為の要求があったときは、ここから記録を残せます。送信後は通報履歴で対応状況を追えます。
                        </p>
                    </div>
                    <div className="rounded-[22px] border border-white/10 bg-white/5 px-5 py-4 text-sm text-slate-200">
                        <p className="text-xs font-semibold tracking-wide text-slate-400">対象</p>
                        <p className="mt-2 text-lg font-semibold text-white">
                            {booking.counterparty?.display_name ?? booking.therapist_profile?.public_name ?? '確認中'}
                        </p>
                    </div>
                </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_380px]">
                <section className="space-y-6">
                    <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">BOOKING CONTEXT</p>
                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                            <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#7d6852]">施術場所</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                    {booking.service_address ? getServiceAddressLabel(booking.service_address) : '未設定'}
                                </p>
                            </div>
                            <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#7d6852]">開始予定</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                    {formatDateTime(booking.scheduled_start_at ?? booking.requested_start_at)}
                                </p>
                            </div>
                            <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#7d6852]">コース</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                    {booking.therapist_menu?.name ?? '未設定'} / {booking.duration_minutes}分
                                </p>
                            </div>
                            <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#7d6852]">総額</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">{formatCurrency(booking.total_amount)}</p>
                            </div>
                        </div>
                    </article>

                    <form onSubmit={(event) => void handleSubmit(event)} className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">REPORT FORM</p>
                        <h2 className="mt-2 text-2xl font-semibold text-[#17202b]">内容を送る</h2>
                        <p className="mt-3 text-sm leading-7 text-[#68707a]">
                            事実ベースで落ち着いて記録してください。メッセージ内容や言動、日時、現場の状況などが分かると確認がしやすくなります。
                        </p>

                        <div className="mt-6 grid gap-5 md:grid-cols-2">
                            <label className="block space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">カテゴリ</span>
                                <select
                                    value={reportCategory}
                                    onChange={(event) => setReportCategory(event.target.value)}
                                    className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                >
                                    {reportCategoryOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="block space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">緊急度</span>
                                <select
                                    value={severity}
                                    onChange={(event) => setSeverity(event.target.value)}
                                    className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                >
                                    {severityOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <label className="mt-5 block space-y-2">
                            <span className="text-sm font-semibold text-[#17202b]">詳細</span>
                            <textarea
                                value={detail}
                                onChange={(event) => setDetail(event.target.value)}
                                rows={6}
                                placeholder="例: 待ち合わせ後に規約外の要求があり、不安を感じた"
                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm leading-7 text-[#17202b] outline-none transition focus:border-[#b5894d]"
                            />
                        </label>

                        <label className="mt-5 flex items-start gap-3 rounded-[20px] border border-[#ebe2d3] bg-[#f8f4ed] px-4 py-4">
                            <input
                                type="checkbox"
                                checked={blockAfterReport}
                                onChange={(event) => setBlockAfterReport(event.target.checked)}
                                className="mt-1 h-4 w-4 rounded border-[#cdb697] text-[#17202b] focus:ring-[#b5894d]"
                            />
                            <span className="text-sm leading-7 text-[#48505a]">
                                通報と同時にこの相手をブロックする。ブロックすると、今後の表示や予約導線から外れます。
                            </span>
                        </label>

                        {formError ? (
                            <div className="mt-5 rounded-[20px] border border-amber-300/40 bg-amber-50 px-4 py-3 text-sm text-[#8b5a16]">
                                {formError}
                            </div>
                        ) : null}

                        {successReport ? (
                            <div className="mt-5 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-[#24553a]">
                                通報を受け付けました。通報ID: {successReport.public_id}
                            </div>
                        ) : null}

                        <div className="mt-6 flex flex-wrap gap-3">
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="inline-flex min-h-11 items-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isSubmitting ? '送信中...' : '通報を送る'}
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate(`/user/bookings/${booking.public_id}`)}
                                className="inline-flex min-h-11 items-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                            >
                                予約詳細へ戻る
                            </button>
                        </div>
                    </form>
                </section>

                <aside className="space-y-5">
                    <section className="rounded-[28px] bg-[#fffcf7] p-6 shadow-[0_18px_36px_rgba(23,32,43,0.1)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">BLOCK STATUS</p>
                        <h2 className="mt-2 text-2xl font-semibold text-[#17202b]">ブロック管理</h2>
                        <div className="mt-4 space-y-4 text-sm leading-7 text-[#48505a]">
                            {existingBlock ? (
                                <>
                                    <p>この相手はすでにブロック済みです。</p>
                                    <p className="text-[#68707a]">理由: {blockReasonLabel(existingBlock.reason_code)}</p>
                                </>
                            ) : (
                                <p>まだブロックしていません。通報とは別に、今後表示したくない相手はここからブロックできます。</p>
                            )}
                        </div>
                        <div className="mt-6 space-y-3">
                            <button
                                type="button"
                                onClick={() => {
                                    void toggleBlock();
                                }}
                                disabled={isTogglingBlock}
                                className="inline-flex w-full items-center justify-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isTogglingBlock ? '更新中...' : existingBlock ? 'この相手のブロックを解除' : 'この相手をブロックする'}
                            </button>
                            <Link
                                to="/user/blocks"
                                className="inline-flex w-full items-center justify-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:brightness-105"
                            >
                                ブロック一覧を見る
                            </Link>
                        </div>
                    </section>

                    {successReport ? (
                        <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">NEXT</p>
                            <p className="mt-3 text-sm leading-7 text-[#68707a]">
                                対応状況は通報履歴で追えます。必要なら同じ予約詳細から返金申請やキャンセル状況の確認にも戻れます。
                            </p>
                            <div className="mt-6 space-y-3">
                                <Link
                                    to="/user/reports"
                                    className="inline-flex w-full items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140]"
                                >
                                    通報履歴へ
                                </Link>
                                <Link
                                    to={`/user/bookings/${booking.public_id}`}
                                    className="inline-flex w-full items-center justify-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                                >
                                    予約詳細へ戻る
                                </Link>
                            </div>
                        </section>
                    ) : null}
                </aside>
            </div>
        </div>
    );
}
