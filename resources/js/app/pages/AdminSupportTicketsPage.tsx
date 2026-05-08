import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ApiError, apiRequest, getFieldError, unwrapData } from '../lib/api';
import { formatJstDateTime } from '../lib/datetime';
import { formatSupportCategory, supportCategories } from '../lib/supportTickets';
import type { AdminAccountRecord, ApiEnvelope, SupportTicketMessageRecord, SupportTicketRecord } from '../lib/types';

function statusLabel(status: SupportTicketRecord['status']): string {
    return status === 'completed' ? '完了' : '進行中';
}

function roleLabel(role: string): string {
    switch (role) {
        case 'therapist':
            return 'タチキャスト';
        case 'admin':
            return '運営';
        default:
            return '利用者';
    }
}

function buildDetailPath(publicId: string, search: string): string {
    return `/admin/support-tickets/${publicId}${search}`;
}

const fieldClass = 'w-full rounded-[8px] border border-[#d7d5cf] bg-white px-3 py-2 text-sm text-[#17202b] outline-none placeholder:text-[#8a8f97] focus:border-[#b5894d]';
const inlineFieldClass = 'rounded-[8px] border border-[#d7d5cf] bg-white px-3 py-2 text-sm text-[#17202b] outline-none placeholder:text-[#8a8f97] focus:border-[#b5894d]';

export function AdminSupportTicketsPage() {
    const { token } = useAuth();
    const { publicId } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [tickets, setTickets] = useState<SupportTicketRecord[]>([]);
    const [selectedTicket, setSelectedTicket] = useState<SupportTicketRecord | null>(null);
    const [accounts, setAccounts] = useState<AdminAccountRecord[]>([]);
    const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? 'open');
    const [readFilter, setReadFilter] = useState(searchParams.get('read_status') ?? 'all');
    const [query, setQuery] = useState(searchParams.get('q') ?? '');
    const [accountQuery, setAccountQuery] = useState('');
    const [targetAccountId, setTargetAccountId] = useState('');
    const [targetRole, setTargetRole] = useState<'user' | 'therapist'>('user');
    const [newTitle, setNewTitle] = useState('');
    const [newCategory, setNewCategory] = useState('service');
    const [newMessage, setNewMessage] = useState('');
    const [reply, setReply] = useState('');
    const [replyImage, setReplyImage] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [requestError, setRequestError] = useState<unknown>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const selectedAccount = useMemo(
        () => accounts.find((account) => account.public_id === targetAccountId) ?? null,
        [accounts, targetAccountId],
    );

    async function loadTickets() {
        if (!token) {
            return;
        }

        setIsLoading(true);
        setError(null);

        const params = new URLSearchParams();
        if (statusFilter !== 'all') {
            params.set('status', statusFilter);
        }
        if (readFilter !== 'all') {
            params.set('read_status', readFilter);
        }
        if (query.trim()) {
            params.set('q', query.trim());
        }
        params.set('sort', 'last_message_at');
        params.set('direction', 'desc');

        try {
            const payload = await apiRequest<ApiEnvelope<SupportTicketRecord[]>>(`/admin/support-tickets?${params.toString()}`, { token });
            const nextTickets = unwrapData(payload);
            setTickets(nextTickets);
            const nextSearch = new URLSearchParams();
            if (statusFilter !== 'all') nextSearch.set('status', statusFilter);
            if (readFilter !== 'all') nextSearch.set('read_status', readFilter);
            if (query.trim()) nextSearch.set('q', query.trim());
            setSearchParams(nextSearch, { replace: true });

            if (!publicId && nextTickets.length > 0) {
                navigate(buildDetailPath(nextTickets[0].public_id, location.search), { replace: true });
            }
        } catch (loadError) {
            setError(loadError instanceof ApiError ? loadError.message : 'サポートチケットを取得できませんでした。');
        } finally {
            setIsLoading(false);
        }
    }

    async function loadTicket(id: string) {
        if (!token) {
            return;
        }

        try {
            const payload = await apiRequest<ApiEnvelope<SupportTicketRecord>>(`/admin/support-tickets/${id}`, { token });
            setSelectedTicket(unwrapData(payload));
        } catch (loadError) {
            setError(loadError instanceof ApiError ? loadError.message : 'サポートチケット詳細を取得できませんでした。');
        }
    }

    async function searchAccounts() {
        if (!token || !accountQuery.trim()) {
            setAccounts([]);
            return;
        }

        const params = new URLSearchParams({ q: accountQuery.trim(), sort: 'created_at', direction: 'desc' });
        const payload = await apiRequest<ApiEnvelope<AdminAccountRecord[]>>(`/admin/accounts?${params.toString()}`, { token });
        setAccounts(unwrapData(payload).slice(0, 8));
    }

    useEffect(() => {
        void loadTickets();
    }, [token, statusFilter, readFilter]);

    useEffect(() => {
        if (publicId) {
            void loadTicket(publicId);
        } else {
            setSelectedTicket(null);
        }
    }, [publicId, token]);

    async function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        await loadTickets();
    }

    async function handleCreate(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token) {
            return;
        }

        setIsSending(true);
        setError(null);
        setRequestError(null);

        try {
            const payload = await apiRequest<ApiEnvelope<SupportTicketRecord>>('/admin/support-tickets', {
                method: 'POST',
                token,
                body: {
                    account_id: targetAccountId,
                    requester_role: targetRole,
                    title: newTitle.trim(),
                    category: newCategory,
                    message: newMessage.trim(),
                },
            });
            const ticket = unwrapData(payload);
            setNewTitle('');
            setNewMessage('');
            setTargetAccountId('');
            setAccounts([]);
            setAccountQuery('');
            await loadTickets();
            navigate(buildDetailPath(ticket.public_id, location.search));
        } catch (createError) {
            setRequestError(createError);
            setError(createError instanceof ApiError ? createError.message : 'サポートチケットを作成できませんでした。');
        } finally {
            setIsSending(false);
        }
    }

    async function handleReply(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token || !selectedTicket || (!reply.trim() && !replyImage)) {
            return;
        }

        setIsSending(true);
        setError(null);

        try {
            const body = replyImage
                ? (() => {
                    const formData = new FormData();
                    formData.append('image', replyImage);
                    return formData;
                })()
                : { body: reply.trim() };

            await apiRequest<ApiEnvelope<SupportTicketMessageRecord>>(`/admin/support-tickets/${selectedTicket.public_id}/messages`, {
                method: 'POST',
                token,
                body,
            });
            setReply('');
            setReplyImage(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
            await loadTicket(selectedTicket.public_id);
            await loadTickets();
        } catch (replyError) {
            setError(replyError instanceof ApiError ? replyError.message : '返信を送信できませんでした。');
        } finally {
            setIsSending(false);
        }
    }

    function handleReplyImageChange(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0] ?? null;
        setReplyImage(file);
        if (file) {
            setReply('');
        }
    }

    async function handleComplete() {
        if (!token || !selectedTicket) {
            return;
        }

        setIsSending(true);
        setError(null);

        try {
            const payload = await apiRequest<ApiEnvelope<SupportTicketRecord>>(`/admin/support-tickets/${selectedTicket.public_id}/complete`, {
                method: 'POST',
                token,
            });
            setSelectedTicket(unwrapData(payload));
            await loadTickets();
        } catch (completeError) {
            setError(completeError instanceof ApiError ? completeError.message : '完了にできませんでした。');
        } finally {
            setIsSending(false);
        }
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[8px] border border-[#eadfca] bg-white p-5 shadow-[0_14px_35px_rgba(23,32,43,0.08)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-xs font-semibold tracking-wide text-[#8f5c22]">サポート対応</p>
                        <h1 className="mt-1 text-2xl font-semibold text-[#17202b]">サポートチケット</h1>
                    </div>
                    <form onSubmit={handleFilterSubmit} className="flex flex-wrap gap-2">
                        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={inlineFieldClass}>
                            <option value="open">進行中</option>
                            <option value="completed">完了</option>
                            <option value="all">すべて</option>
                        </select>
                        <select value={readFilter} onChange={(event) => setReadFilter(event.target.value)} className={inlineFieldClass}>
                            <option value="all">既読問わず</option>
                            <option value="unread">未読あり</option>
                            <option value="read">未読なし</option>
                        </select>
                        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ID/タイトル/アカウント" className={inlineFieldClass} />
                        <button type="submit" className="rounded-full bg-[#17202b] px-4 py-2 text-sm font-semibold text-white">絞り込み</button>
                    </form>
                </div>
            </section>

            {error ? <div className="rounded-[8px] border border-[#f0c7b8] bg-[#fff1ec] px-4 py-3 text-sm text-[#8a3d2c]">{error}</div> : null}

            <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
                <div className="space-y-4">
                    <article className="rounded-[8px] border border-[#eadfca] bg-white p-4">
                        <h2 className="text-base font-semibold text-[#17202b]">運営から新規発行</h2>
                        <form onSubmit={handleCreate} className="mt-4 space-y-3">
                            <div className="flex gap-2">
                                <input value={accountQuery} onChange={(event) => setAccountQuery(event.target.value)} placeholder="アカウント検索" className={`${inlineFieldClass} min-w-0 flex-1`} />
                                <button type="button" onClick={() => void searchAccounts()} className="rounded-full border border-[#d7d5cf] px-3 py-2 text-sm font-semibold">検索</button>
                            </div>
                            {accounts.length > 0 ? (
                                <select value={targetAccountId} onChange={(event) => setTargetAccountId(event.target.value)} className={fieldClass}>
                                    <option value="">対象を選択</option>
                                    {accounts.map((account) => (
                                        <option key={account.public_id} value={account.public_id}>
                                            {account.display_name || account.email || account.public_id}
                                        </option>
                                    ))}
                                </select>
                            ) : null}
                            <select value={targetRole} onChange={(event) => setTargetRole(event.target.value as 'user' | 'therapist')} className={fieldClass}>
                                <option value="user">利用者宛</option>
                                <option value="therapist">タチキャスト宛</option>
                            </select>
                            <input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="タイトル" className={fieldClass} />
                            <select value={newCategory} onChange={(event) => setNewCategory(event.target.value)} className={fieldClass}>
                                {supportCategories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
                            </select>
                            <textarea value={newMessage} onChange={(event) => setNewMessage(event.target.value)} rows={4} placeholder="メッセージ" className={`${fieldClass} leading-6`} />
                            {getFieldError(requestError, 'account_id') ? <p className="text-xs text-[#8a3d2c]">{getFieldError(requestError, 'account_id')}</p> : null}
                            <button type="submit" disabled={isSending || !selectedAccount} className="w-full rounded-full bg-[#17202b] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                                チケットを発行
                            </button>
                        </form>
                    </article>

                    <div className="space-y-2">
                        {isLoading ? <p className="text-sm text-[#68707a]">読み込み中です。</p> : null}
                        {tickets.map((ticket) => (
                            <button
                                type="button"
                                key={ticket.public_id}
                                onClick={() => navigate(buildDetailPath(ticket.public_id, location.search))}
                                className={[
                                    'w-full rounded-[8px] border bg-white px-4 py-3 text-left transition',
                                    selectedTicket?.public_id === ticket.public_id ? 'border-[#d6b35a]' : 'border-[#eadfca] hover:border-[#d6b35a]',
                                ].join(' ')}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-[#17202b]">{ticket.title}</p>
                                        <p className="mt-1 text-xs text-[#68707a]">{ticket.account?.display_name ?? ticket.account?.email ?? ticket.account?.public_id} / {formatSupportCategory(ticket.category)}</p>
                                    </div>
                                    {ticket.unread_count > 0 ? <span className="rounded-full bg-[#d67c7c] px-2 py-1 text-xs font-bold text-white">{ticket.unread_count}</span> : null}
                                </div>
                                <p className="mt-2 text-xs text-[#68707a]">{statusLabel(ticket.status)} / {formatJstDateTime(ticket.last_message_at ?? ticket.created_at) ?? ''}</p>
                            </button>
                        ))}
                    </div>
                </div>

                <article className="min-h-[620px] rounded-[8px] border border-[#eadfca] bg-[#fbf7ef]">
                    {selectedTicket ? (
                        <div className="flex min-h-[620px] flex-col">
                            <header className="border-b border-[#eadfca] bg-white px-5 py-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <h2 className="text-xl font-semibold text-[#17202b]">{selectedTicket.title}</h2>
                                        <p className="mt-1 text-sm text-[#68707a]">
                                            {selectedTicket.account?.display_name ?? selectedTicket.account?.email ?? selectedTicket.account?.public_id}
                                            {' '} / {roleLabel(selectedTicket.requester_role)} / {formatSupportCategory(selectedTicket.category)}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="rounded-full border border-[#eadfca] bg-[#f5efe4] px-3 py-1 text-xs font-semibold text-[#516072]">{statusLabel(selectedTicket.status)}</span>
                                        {selectedTicket.status === 'open' ? (
                                            <button type="button" onClick={() => void handleComplete()} disabled={isSending} className="rounded-full bg-[#8f5c22] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                                                完了
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            </header>

                            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-5">
                                {(selectedTicket.messages ?? []).map((message) => (
                                    <div key={message.id} className={['max-w-[78%] rounded-[8px] px-4 py-3 text-sm shadow-sm', message.sender_role === 'admin' ? 'ml-auto bg-[#17202b] text-white' : 'mr-auto border border-[#eadfca] bg-white text-[#17202b]'].join(' ')}>
                                        <p className="mb-1 text-[11px] font-semibold opacity-70">{message.sender?.display_name ?? roleLabel(message.sender_role)}</p>
                                        {message.message_type === 'image' && message.attachment_url ? (
                                            <a href={message.attachment_url} target="_blank" rel="noreferrer">
                                                <img src={message.attachment_url} alt={message.attachment_original_name ?? '添付画像'} className="max-h-96 rounded-[8px] object-contain" />
                                            </a>
                                        ) : (
                                            <p className="whitespace-pre-wrap leading-7">{message.body}</p>
                                        )}
                                        <p className="mt-2 text-[11px] opacity-60">{formatJstDateTime(message.sent_at) ?? ''}</p>
                                    </div>
                                ))}
                            </div>

                            <footer className="border-t border-[#eadfca] bg-white px-5 py-4">
                                {selectedTicket.can_send ? (
                                    <form onSubmit={handleReply} className="space-y-3">
                                        {replyImage ? (
                                            <div className="flex items-center justify-between gap-3 rounded-[8px] border border-[#eadfca] bg-[#f5efe4] px-3 py-2 text-xs text-[#516072]">
                                                <span className="truncate">{replyImage.name}</span>
                                                <button type="button" onClick={() => setReplyImage(null)} className="font-semibold text-[#8a3d2c]">解除</button>
                                            </div>
                                        ) : null}
                                        <textarea value={reply} onChange={(event) => setReply(event.target.value)} rows={4} disabled={Boolean(replyImage)} placeholder="運営として返信" className={`${fieldClass} leading-6 disabled:bg-[#f5efe4]`} />
                                        <div className="flex flex-wrap items-center gap-2">
                                            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleReplyImageChange} className="hidden" />
                                            <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-full border border-[#d7d5cf] px-4 py-2 text-sm font-semibold text-[#17202b]">
                                                画像添付
                                            </button>
                                            <button type="submit" disabled={isSending || (!reply.trim() && !replyImage)} className="rounded-full bg-[#17202b] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                                                返信を送信
                                            </button>
                                        </div>
                                    </form>
                                ) : (
                                    <p className="text-sm text-[#68707a]">完了済みのため閲覧のみです。</p>
                                )}
                            </footer>
                        </div>
                    ) : (
                        <div className="flex min-h-[620px] items-center justify-center p-6 text-sm text-[#68707a]">
                            チケットを選択してください。
                        </div>
                    )}
                </article>
            </section>
        </div>
    );
}
