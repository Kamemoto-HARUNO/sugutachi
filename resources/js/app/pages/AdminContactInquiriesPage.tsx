import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatDateTime } from '../lib/therapist';
import type {
    AdminContactInquiryRecord,
    ApiEnvelope,
} from '../lib/types';

type InquiryStatusFilter = 'all' | 'pending' | 'resolved';
type InquiryCategoryFilter = 'all' | 'service' | 'account' | 'booking' | 'payment' | 'safety' | 'other';
type SourceFilter = 'all' | 'authenticated' | 'guest';
type BooleanFilter = 'all' | '1' | '0';
type SortField = 'created_at' | 'resolved_at' | 'category';
type SortDirection = 'asc' | 'desc';

function normalizeStatusFilter(value: string | null): InquiryStatusFilter {
    if (value === 'pending' || value === 'resolved') {
        return value;
    }

    return 'all';
}

function normalizeCategoryFilter(value: string | null): InquiryCategoryFilter {
    if (value === 'service' || value === 'account' || value === 'booking' || value === 'payment' || value === 'safety' || value === 'other') {
        return value;
    }

    return 'all';
}

function normalizeSourceFilter(value: string | null): SourceFilter {
    if (value === 'authenticated' || value === 'guest') {
        return value;
    }

    return 'all';
}

function normalizeBooleanFilter(value: string | null): BooleanFilter {
    if (value === '1' || value === '0') {
        return value;
    }

    return 'all';
}

function normalizeSortField(value: string | null): SortField {
    if (value === 'resolved_at' || value === 'category') {
        return value;
    }

    return 'created_at';
}

function normalizeSortDirection(value: string | null): SortDirection {
    return value === 'asc' ? 'asc' : 'desc';
}

function categoryLabel(category: string): string {
    switch (category) {
        case 'service':
            return 'サービス';
        case 'account':
            return 'アカウント';
        case 'booking':
            return '予約';
        case 'payment':
            return '決済';
        case 'safety':
            return '安全';
        case 'other':
            return 'その他';
        default:
            return category;
    }
}

function sourceLabel(source: string): string {
    return source === 'guest' ? 'ゲスト' : 'ログイン中ユーザー';
}

function statusLabel(status: string): string {
    return status === 'resolved' ? '解決済み' : '対応待ち';
}

function statusTone(status: string): string {
    return status === 'resolved'
        ? 'bg-[#e8f4ea] text-[#24553a]'
        : 'bg-[#fff3e3] text-[#8f5c22]';
}

function displayInquiryName(inquiry: AdminContactInquiryRecord): string {
    return inquiry.name?.trim()
        || inquiry.account?.display_name?.trim()
        || inquiry.email
        || inquiry.public_id;
}

export function AdminContactInquiriesPage() {
    const { token } = useAuth();
    const { publicId } = useParams<{ publicId: string }>();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const [inquiries, setInquiries] = useState<AdminContactInquiryRecord[]>([]);
    const [selectedInquiry, setSelectedInquiry] = useState<AdminContactInquiryRecord | null>(null);
    const [pageError, setPageError] = useState<string | null>(null);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [noteInput, setNoteInput] = useState('');
    const [resolutionNote, setResolutionNote] = useState('');
    const [queryInput, setQueryInput] = useState(searchParams.get('q') ?? '');
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    const [isSubmittingNote, setIsSubmittingNote] = useState(false);
    const [isSubmittingResolve, setIsSubmittingResolve] = useState(false);

    const statusFilter = normalizeStatusFilter(searchParams.get('status'));
    const categoryFilter = normalizeCategoryFilter(searchParams.get('category'));
    const sourceFilter = normalizeSourceFilter(searchParams.get('source'));
    const hasNotesFilter = normalizeBooleanFilter(searchParams.get('has_notes'));
    const sortField = normalizeSortField(searchParams.get('sort'));
    const direction = normalizeSortDirection(searchParams.get('direction'));
    const query = searchParams.get('q')?.trim() ?? '';

    usePageTitle('問い合わせ管理');
    useToastOnMessage(successMessage, 'success');

    const selectedListInquiry = useMemo(
        () => inquiries.find((inquiry) => inquiry.public_id === publicId) ?? null,
        [inquiries, publicId],
    );

    const summary = useMemo(() => ({
        total: inquiries.length,
        pending: inquiries.filter((inquiry) => inquiry.status === 'pending').length,
        resolved: inquiries.filter((inquiry) => inquiry.status === 'resolved').length,
        withNotes: inquiries.filter((inquiry) => inquiry.admin_note_count > 0).length,
        guest: inquiries.filter((inquiry) => inquiry.source === 'guest').length,
    }), [inquiries]);

    const loadInquiries = useCallback(async (refresh = false) => {
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

        if (categoryFilter !== 'all') {
            params.set('category', categoryFilter);
        }

        if (sourceFilter !== 'all') {
            params.set('source', sourceFilter);
        }

        if (hasNotesFilter !== 'all') {
            params.set('has_notes', hasNotesFilter);
        }

        if (query) {
            params.set('q', query);
        }

        params.set('sort', sortField);
        params.set('direction', direction);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminContactInquiryRecord[]>>(`/admin/contact-inquiries?${params.toString()}`, { token });
            setInquiries(unwrapData(payload));
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '問い合わせ一覧の取得に失敗しました。';

            setPageError(message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [categoryFilter, direction, hasNotesFilter, query, sortField, sourceFilter, statusFilter, token]);

    const loadDetail = useCallback(async () => {
        if (!token || !publicId) {
            setSelectedInquiry(null);
            setDetailError(null);
            return;
        }

        setIsLoadingDetail(true);
        setDetailError(null);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminContactInquiryRecord>>(`/admin/contact-inquiries/${publicId}`, { token });
            setSelectedInquiry(unwrapData(payload));
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '問い合わせ詳細の取得に失敗しました。';

            setDetailError(message);
            setSelectedInquiry(null);
        } finally {
            setIsLoadingDetail(false);
        }
    }, [publicId, token]);

    useEffect(() => {
        void loadInquiries();
    }, [loadInquiries]);

    useEffect(() => {
        void loadDetail();
    }, [loadDetail]);

    function updateFilters(
        next: Partial<Record<'status' | 'category' | 'source' | 'has_notes' | 'sort' | 'direction' | 'q', string | null>>,
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

        if (!token || !selectedInquiry) {
            return;
        }

        setIsSubmittingNote(true);
        setActionError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminContactInquiryRecord>>(`/admin/contact-inquiries/${selectedInquiry.public_id}/notes`, {
                method: 'POST',
                token,
                body: { note: noteInput.trim() },
            });

            const updated = unwrapData(payload);
            setSelectedInquiry(updated);
            setInquiries((current) => current.map((inquiry) => inquiry.public_id === updated.public_id ? updated : inquiry));
            setNoteInput('');
            setSuccessMessage('運営メモを追加しました。');
            void loadInquiries(true);
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '運営メモの追加に失敗しました。';

            setActionError(message);
        } finally {
            setIsSubmittingNote(false);
        }
    }

    async function handleResolve(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token || !selectedInquiry) {
            return;
        }

        setIsSubmittingResolve(true);
        setActionError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminContactInquiryRecord>>(`/admin/contact-inquiries/${selectedInquiry.public_id}/resolve`, {
                method: 'POST',
                token,
                body: {
                    resolution_note: resolutionNote.trim() || null,
                },
            });

            const updated = unwrapData(payload);
            setSelectedInquiry(updated);
            setInquiries((current) => current.map((inquiry) => inquiry.public_id === updated.public_id ? updated : inquiry));
            setResolutionNote('');
            setSuccessMessage('問い合わせを解決済みにしました。');
            void loadInquiries(true);
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '問い合わせの解決に失敗しました。';

            setActionError(message);
        } finally {
            setIsSubmittingResolve(false);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="問い合わせ一覧を読み込み中" message="未解決案件と運営メモの状況をまとめています。" />;
    }

    const detailInquiry = selectedInquiry ?? selectedListInquiry;

    return (
        <div className="space-y-6">
            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_16px_34px_rgba(2,6,23,0.14)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">CONTACT INQUIRIES</p>
                        <h2 className="text-2xl font-semibold text-white sm:text-[2rem]">問い合わせ管理</h2>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            ゲスト・会員どちらの問い合わせもまとめて確認し、内部メモの追記から解決処理まで進められます。
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            void loadInquiries(true);
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

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                {[
                    { label: '総件数', value: summary.total, hint: '現在の表示対象' },
                    { label: '対応待ち', value: summary.pending, hint: '未解決' },
                    { label: '解決済み', value: summary.resolved, hint: '対応完了' },
                    { label: 'メモあり', value: summary.withNotes, hint: '内部記録あり' },
                    { label: 'ゲスト送信', value: summary.guest, hint: '非ログイン問い合わせ' },
                ].map((item) => (
                    <article key={item.label} className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">{item.label}</p>
                        <p className="mt-3 text-3xl font-semibold text-white">{item.value}</p>
                        <p className="mt-2 text-sm text-slate-400">{item.hint}</p>
                    </article>
                ))}
            </section>

            <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">状態</span>
                        <select
                            value={statusFilter}
                            onChange={(event) => updateFilters({ status: event.target.value })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="all">すべて</option>
                            <option value="pending">対応待ち</option>
                            <option value="resolved">解決済み</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">カテゴリ</span>
                        <select
                            value={categoryFilter}
                            onChange={(event) => updateFilters({ category: event.target.value })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="all">すべて</option>
                            <option value="service">サービス</option>
                            <option value="account">アカウント</option>
                            <option value="booking">予約</option>
                            <option value="payment">決済</option>
                            <option value="safety">安全</option>
                            <option value="other">その他</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">送信元</span>
                        <select
                            value={sourceFilter}
                            onChange={(event) => updateFilters({ source: event.target.value })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="all">すべて</option>
                            <option value="authenticated">ログイン中ユーザー</option>
                            <option value="guest">ゲスト</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">運営メモ</span>
                        <select
                            value={hasNotesFilter}
                            onChange={(event) => updateFilters({ has_notes: event.target.value })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="all">すべて</option>
                            <option value="1">あり</option>
                            <option value="0">なし</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">並び替え</span>
                        <select
                            value={sortField}
                            onChange={(event) => updateFilters({ sort: event.target.value })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="created_at">受付日時</option>
                            <option value="resolved_at">解決日時</option>
                            <option value="category">カテゴリ</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">順序</span>
                        <select
                            value={direction}
                            onChange={(event) => updateFilters({ direction: event.target.value })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="desc">新しい順</option>
                            <option value="asc">古い順</option>
                        </select>
                    </label>
                </div>

                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        updateFilters({ q: queryInput.trim() || null });
                    }}
                    className="mt-4 flex gap-2"
                >
                    <input
                        value={queryInput}
                        onChange={(event) => setQueryInput(event.target.value)}
                        placeholder="名前 / メール / public_id"
                        className="min-w-0 flex-1 rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                    />
                    <button
                        type="submit"
                        className="inline-flex items-center rounded-[18px] bg-[#17202b] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#243140]"
                    >
                        絞る
                    </button>
                </form>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(360px,0.9fr)]">
                <section className="space-y-4">
                    {inquiries.length > 0 ? inquiries.map((inquiry) => {
                        const isSelected = publicId === inquiry.public_id;
                        const detailPath = `/admin/contact-inquiries/${inquiry.public_id}${location.search}`;

                        return (
                            <Link
                                key={inquiry.public_id}
                                to={detailPath}
                                className={[
                                    'block rounded-[24px] border p-5 shadow-[0_16px_30px_rgba(23,32,43,0.08)] transition',
                                    isSelected
                                        ? 'border-[#d2b179] bg-[#fff8ee]'
                                        : 'border-[#efe5d7] bg-white hover:bg-[#fffdf8]',
                                ].join(' ')}
                            >
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="text-lg font-semibold text-[#17202b]">{displayInquiryName(inquiry)}</h3>
                                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(inquiry.status)}`}>
                                                {statusLabel(inquiry.status)}
                                            </span>
                                        </div>
                                        <p className="text-sm text-[#68707a]">{inquiry.email ?? inquiry.account?.email ?? 'メール未設定'}</p>
                                        <p className="text-xs text-[#7d6852]">{inquiry.public_id}</p>
                                    </div>

                                    <div className="text-right text-xs text-[#68707a]">
                                        <p>{categoryLabel(inquiry.category)}</p>
                                        <p className="mt-1">{sourceLabel(inquiry.source)}</p>
                                    </div>
                                </div>

                                <div className="mt-4 grid gap-3 md:grid-cols-3">
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">受付日時</p>
                                        <p className="mt-1 text-sm font-semibold text-[#17202b]">{formatDateTime(inquiry.submitted_at)}</p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">解決日時</p>
                                        <p className="mt-1 text-sm font-semibold text-[#17202b]">{formatDateTime(inquiry.resolved_at)}</p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">運営メモ</p>
                                        <p className="mt-1 text-sm font-semibold text-[#17202b]">{inquiry.admin_note_count}件</p>
                                    </div>
                                </div>
                            </Link>
                        );
                    }) : (
                        <section className="rounded-[28px] bg-white px-6 py-10 text-center shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                            <p className="text-sm leading-7 text-[#68707a]">条件に合う問い合わせはありません。</p>
                        </section>
                    )}
                </section>

                <aside className="space-y-5">
                    {actionError ? (
                        <section className="rounded-[24px] border border-[#f1d4b5] bg-[#fff4e8] px-5 py-4 text-sm text-[#9a4b35]">
                            {actionError}
                        </section>
                    ) : null}
                    {detailError ? (
                        <section className="rounded-[24px] border border-[#f1d4b5] bg-[#fff4e8] px-5 py-4 text-sm text-[#9a4b35]">
                            {detailError}
                        </section>
                    ) : null}

                    {isLoadingDetail && publicId ? (
                        <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                            <LoadingScreen title="問い合わせ詳細を読み込み中" message="本文と運営メモを取得しています。" />
                        </section>
                    ) : detailInquiry ? (
                        <section className="space-y-5">
                            <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">INQUIRY DETAIL</p>
                                        <h3 className="mt-2 text-2xl font-semibold text-[#17202b]">{displayInquiryName(detailInquiry)}</h3>
                                        <p className="mt-2 text-sm text-[#68707a]">{detailInquiry.email ?? detailInquiry.account?.email ?? 'メール未設定'}</p>
                                        <p className="mt-1 text-xs text-[#7d6852]">{detailInquiry.public_id}</p>
                                    </div>
                                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(detailInquiry.status)}`}>
                                        {statusLabel(detailInquiry.status)}
                                    </span>
                                </div>

                                <div className="mt-5 grid gap-3 md:grid-cols-2">
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3 text-sm text-[#48505a]">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">カテゴリ / 送信元</p>
                                        <p className="mt-1 font-semibold text-[#17202b]">{categoryLabel(detailInquiry.category)}</p>
                                        <p className="mt-1">{sourceLabel(detailInquiry.source)}</p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3 text-sm text-[#48505a]">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">会員情報</p>
                                        <p className="mt-1 font-semibold text-[#17202b]">{detailInquiry.account?.display_name ?? '未連携'}</p>
                                        <p className="mt-1 text-xs text-[#68707a]">{detailInquiry.account?.public_id ?? 'ゲスト問い合わせ'}</p>
                                    </div>
                                </div>

                                <div className="mt-4 rounded-[18px] bg-[#f8f4ed] px-4 py-4">
                                    <p className="text-xs font-semibold tracking-wide text-[#7d6852]">本文</p>
                                    <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#17202b]">
                                        {detailInquiry.message?.trim() || '本文はありません。'}
                                    </p>
                                </div>
                            </article>

                            <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">INTERNAL NOTES</p>
                                        <h4 className="mt-2 text-xl font-semibold text-[#17202b]">運営メモ</h4>
                                    </div>
                                    <span className="text-sm text-[#68707a]">{detailInquiry.notes?.length ?? detailInquiry.admin_note_count}件</span>
                                </div>

                                <div className="mt-4 space-y-3">
                                    {detailInquiry.notes && detailInquiry.notes.length > 0 ? detailInquiry.notes.map((note) => (
                                        <article key={note.id} className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <p className="text-sm font-semibold text-[#17202b]">{note.author?.display_name ?? note.author?.public_id ?? '運営'}</p>
                                                <p className="text-xs text-[#68707a]">{formatDateTime(note.created_at)}</p>
                                            </div>
                                            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#48505a]">{note.note}</p>
                                        </article>
                                    )) : (
                                        <div className="rounded-[18px] border border-dashed border-[#d9c9ae] px-4 py-5 text-sm text-[#68707a]">
                                            まだ内部メモはありません。
                                        </div>
                                    )}
                                </div>
                            </article>

                            <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                                <div className="grid gap-6 xl:grid-cols-2">
                                    <form onSubmit={handleAddNote} className="space-y-4 rounded-[24px] bg-[#f8f4ed] p-5">
                                        <div>
                                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">ADD NOTE</p>
                                            <h4 className="mt-2 text-lg font-semibold text-[#17202b]">運営メモを追加</h4>
                                        </div>

                                        <label className="space-y-2">
                                            <span className="text-sm font-semibold text-[#17202b]">メモ</span>
                                            <textarea
                                                value={noteInput}
                                                onChange={(event) => setNoteInput(event.target.value)}
                                                rows={6}
                                                placeholder="返信方針や調査メモを残します。"
                                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-white px-4 py-3 text-sm leading-7 text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                            />
                                        </label>

                                        <button
                                            type="submit"
                                            disabled={isSubmittingNote || !noteInput.trim()}
                                            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140] disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {isSubmittingNote ? '保存中...' : 'メモを追加'}
                                        </button>
                                    </form>

                                    <form onSubmit={handleResolve} className="space-y-4 rounded-[24px] bg-[#f8f4ed] p-5">
                                        <div>
                                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">RESOLVE INQUIRY</p>
                                            <h4 className="mt-2 text-lg font-semibold text-[#17202b]">問い合わせを解決する</h4>
                                        </div>

                                        <p className="text-sm leading-7 text-[#48505a]">
                                            回答や内部確認が済んだら解決済みに更新します。必要ならメモも同時に残せます。
                                        </p>

                                        <label className="space-y-2">
                                            <span className="text-sm font-semibold text-[#17202b]">解決メモ</span>
                                            <textarea
                                                value={resolutionNote}
                                                onChange={(event) => setResolutionNote(event.target.value)}
                                                rows={6}
                                                placeholder="回答完了、再発防止の観点、引き継ぎ事項など"
                                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-white px-4 py-3 text-sm leading-7 text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                            />
                                        </label>

                                        <button
                                            type="submit"
                                            disabled={isSubmittingResolve || detailInquiry.status === 'resolved'}
                                            className="inline-flex min-h-11 items-center justify-center rounded-full border border-emerald-300 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {detailInquiry.status === 'resolved'
                                                ? 'すでに解決済み'
                                                : isSubmittingResolve
                                                    ? '更新中...'
                                                    : '解決済みにする'}
                                        </button>
                                    </form>
                                </div>
                            </article>
                        </section>
                    ) : (
                        <section className="rounded-[28px] bg-white px-6 py-10 text-center shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                            <p className="text-sm leading-7 text-[#68707a]">
                                一覧から問い合わせを選ぶと、ここに本文と運営メモが表示されます。
                            </p>
                        </section>
                    )}
                </aside>
            </div>
        </div>
    );
}
