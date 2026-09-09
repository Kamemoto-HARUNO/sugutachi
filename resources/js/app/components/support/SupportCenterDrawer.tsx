import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { ApiError, apiRequest, getFieldError, unwrapData } from '../../lib/api';
import { formatJstDateTime } from '../../lib/datetime';
import {
    fetchSupportTickets,
    formatSupportCategory,
    notifySupportTicketsChanged,
    supportCategories,
} from '../../lib/supportTickets';
import type { ApiEnvelope, SupportTicketMessageRecord, SupportTicketRecord } from '../../lib/types';

interface SupportCenterDrawerProps {
    isOpen: boolean;
    initialTicketPublicId?: string | null;
    onClose: () => void;
}

type ViewMode = 'home' | 'new' | 'detail';

function statusLabel(status: SupportTicketRecord['status']): string {
    return status === 'completed' ? '完了' : '進行中';
}

function statusClass(status: SupportTicketRecord['status']): string {
    return status === 'completed'
        ? 'border-[#d7d5cf] bg-[#f1eee8] text-[#516072]'
        : 'border-[#8bc5a1] bg-[#eaf7ef] text-[#236241]';
}

function messageBubbleClass(message: SupportTicketMessageRecord): string {
    return message.is_own
        ? 'ml-auto bg-[#17202b] text-white'
        : 'mr-auto border border-[#eadfca] bg-white text-[#17202b]';
}

export function SupportCenterDrawer({ isOpen, initialTicketPublicId = null, onClose }: SupportCenterDrawerProps) {
    const { token, activeRole } = useAuth();
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('home');
    const [tickets, setTickets] = useState<SupportTicketRecord[]>([]);
    const [selectedTicket, setSelectedTicket] = useState<SupportTicketRecord | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [requestError, setRequestError] = useState<unknown>(null);
    const [title, setTitle] = useState('');
    const [category, setCategory] = useState('service');
    const [message, setMessage] = useState('');
    const [draft, setDraft] = useState('');
    const [selectedImage, setSelectedImage] = useState<File | null>(null);

    const openTickets = useMemo(
        () => tickets.filter((ticket) => ticket.status === 'open'),
        [tickets],
    );
    const completedTickets = useMemo(
        () => tickets.filter((ticket) => ticket.status === 'completed'),
        [tickets],
    );

    async function loadTickets() {
        if (!token) {
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const nextTickets = await fetchSupportTickets(token);
            setTickets(nextTickets);
        } catch (loadError) {
            setError(loadError instanceof ApiError ? loadError.message : 'サポートチケットを取得できませんでした。');
        } finally {
            setIsLoading(false);
        }
    }

    async function loadTicket(publicId: string) {
        if (!token) {
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const payload = await apiRequest<ApiEnvelope<SupportTicketRecord>>(`/support/tickets/${publicId}`, { token });
            const ticket = unwrapData(payload);
            setSelectedTicket(ticket);
            setViewMode('detail');
            notifySupportTicketsChanged();
            void loadTickets();
        } catch (loadError) {
            setError(loadError instanceof ApiError ? loadError.message : 'サポートチケットを取得できませんでした。');
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        void loadTickets();
        if (initialTicketPublicId) {
            void loadTicket(initialTicketPublicId);
            return;
        }

        setViewMode((current) => (current === 'detail' && selectedTicket ? 'detail' : 'home'));
    }, [initialTicketPublicId, isOpen, token]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    async function handleCreate(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token) {
            return;
        }

        setIsSending(true);
        setError(null);
        setRequestError(null);

        try {
            const payload = await apiRequest<ApiEnvelope<SupportTicketRecord>>('/support/tickets', {
                method: 'POST',
                token,
                body: {
                    requester_role: activeRole === 'user' || activeRole === 'therapist' ? activeRole : undefined,
                    title: title.trim(),
                    category,
                    message: message.trim(),
                },
            });
            const ticket = unwrapData(payload);
            setTitle('');
            setCategory('service');
            setMessage('');
            notifySupportTicketsChanged();
            navigate(`/help/tickets/${ticket.public_id}`, { replace: false });
            await loadTicket(ticket.public_id);
        } catch (createError) {
            setRequestError(createError);
            setError(createError instanceof ApiError ? createError.message : 'サポートチケットを作成できませんでした。');
        } finally {
            setIsSending(false);
        }
    }

    function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
        setSelectedImage(event.target.files?.[0] ?? null);
    }

    async function handleSend(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token || !selectedTicket || (!draft.trim() && !selectedImage)) {
            return;
        }

        setIsSending(true);
        setError(null);

        try {
            const body = selectedImage
                ? (() => {
                    const formData = new FormData();
                    formData.append('image', selectedImage);
                    return formData;
                })()
                : { body: draft.trim() };

            await apiRequest<ApiEnvelope<SupportTicketMessageRecord>>(`/support/tickets/${selectedTicket.public_id}/messages`, {
                method: 'POST',
                token,
                body,
            });

            setDraft('');
            setSelectedImage(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
            notifySupportTicketsChanged();
            await loadTicket(selectedTicket.public_id);
        } catch (sendError) {
            setError(sendError instanceof ApiError ? sendError.message : 'メッセージを送信できませんでした。');
        } finally {
            setIsSending(false);
        }
    }

    if (!isOpen) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-[130]">
            <button type="button" aria-label="サポートセンターを閉じる" onClick={onClose} className="absolute inset-0 bg-[#111923]/45 backdrop-blur-sm" />
            <aside className="absolute right-0 top-0 flex h-full w-full max-w-[520px] flex-col bg-[#fbf7ef] shadow-[0_30px_80px_rgba(17,24,39,0.32)]">
                <header className="border-b border-[#eadfca] px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold tracking-wide text-[#8f5c22]">サポートセンター</p>
                            <h2 className="text-xl font-semibold text-[#17202b]">困ったことを相談</h2>
                        </div>
                        <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#eadfca] bg-white text-xl text-[#516072] transition hover:bg-[#f5efe4]">
                            ×
                        </button>
                    </div>
                    {viewMode !== 'home' ? (
                        <button type="button" onClick={() => setViewMode('home')} className="mt-3 text-sm font-semibold text-[#8f5c22]">
                            一覧へ戻る
                        </button>
                    ) : null}
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                    {error ? (
                        <div className="mb-4 rounded-[8px] border border-[#f0c7b8] bg-[#fff1ec] px-4 py-3 text-sm text-[#8a3d2c]">
                            {error}
                        </div>
                    ) : null}

                    {viewMode === 'home' ? (
                        <div className="space-y-5">
                            <div className="flex gap-3">
                                <button type="button" onClick={() => setViewMode('new')} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-[#17202b] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#263445]">
                                    新規問い合わせ
                                </button>
                                <Link to="/help" onClick={onClose} className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#eadfca] bg-white px-4 py-2 text-sm font-semibold text-[#17202b] transition hover:bg-[#f5efe4]">
                                    FAQ
                                </Link>
                            </div>

                            {isLoading ? <p className="text-sm text-[#68707a]">読み込み中です。</p> : null}
                            {tickets.length === 0 && !isLoading ? (
                                <p className="rounded-[8px] border border-[#eadfca] bg-white px-4 py-4 text-sm leading-7 text-[#68707a]">
                                    まだサポートチケットはありません。
                                </p>
                            ) : null}

                            {[
                                { label: '進行中', group: openTickets },
                                { label: '完了', group: completedTickets },
                            ].map(({ label, group }) => (
                                group.length > 0 ? (
                                    <section key={label} className="space-y-2">
                                        <h3 className="text-sm font-semibold text-[#17202b]">{label}</h3>
                                        <div className="space-y-2">
                                            {group.map((ticket) => (
                                                <button
                                                    type="button"
                                                    key={ticket.public_id}
                                                    onClick={() => {
                                                        navigate(`/help/tickets/${ticket.public_id}`, { replace: false });
                                                        void loadTicket(ticket.public_id);
                                                    }}
                                                    className="w-full rounded-[8px] border border-[#eadfca] bg-white px-4 py-3 text-left transition hover:border-[#d6b35a]"
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-semibold text-[#17202b]">{ticket.title}</p>
                                                            <p className="mt-1 text-xs text-[#68707a]">{formatSupportCategory(ticket.category)} / {formatJstDateTime(ticket.last_message_at ?? ticket.created_at) ?? ''}</p>
                                                        </div>
                                                        <div className="flex shrink-0 items-center gap-2">
                                                            {ticket.unread_count > 0 ? (
                                                                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#d67c7c] px-1.5 text-[11px] font-bold text-white">{ticket.unread_count}</span>
                                                            ) : null}
                                                            <span className={['rounded-full px-2 py-1 text-[11px] font-semibold', statusClass(ticket.status)].join(' ')}>
                                                                {statusLabel(ticket.status)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    {ticket.last_message_excerpt ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#68707a]">{ticket.last_message_excerpt}</p> : null}
                                                </button>
                                            ))}
                                        </div>
                                    </section>
                                ) : null
                            ))}
                        </div>
                    ) : null}

                    {viewMode === 'new' ? (
                        <form onSubmit={handleCreate} className="space-y-4">
                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">タイトル</span>
                                <input value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-[8px] border border-[#eadfca] bg-white px-4 py-3 text-sm text-[#17202b] outline-none placeholder:text-[#8a8f97] focus:border-[#d6b35a]" required />
                                {getFieldError(requestError, 'title') ? <p className="text-xs text-[#8a3d2c]">{getFieldError(requestError, 'title')}</p> : null}
                            </label>
                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">種別</span>
                                <select value={category} onChange={(event) => setCategory(event.target.value)} className="w-full rounded-[8px] border border-[#eadfca] bg-white px-4 py-3 text-sm text-[#17202b] outline-none focus:border-[#d6b35a]">
                                    {supportCategories.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                </select>
                            </label>
                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">メッセージ</span>
                                <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={8} className="w-full rounded-[8px] border border-[#eadfca] bg-white px-4 py-3 text-sm leading-7 text-[#17202b] outline-none placeholder:text-[#8a8f97] focus:border-[#d6b35a]" required />
                                {getFieldError(requestError, 'message') ? <p className="text-xs text-[#8a3d2c]">{getFieldError(requestError, 'message')}</p> : null}
                            </label>
                            <button type="submit" disabled={isSending} className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#17202b] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#263445] disabled:opacity-60">
                                {isSending ? '作成中...' : 'チケットを作成'}
                            </button>
                        </form>
                    ) : null}

                    {viewMode === 'detail' && selectedTicket ? (
                        <div className="flex min-h-full flex-col gap-4">
                            <div className="rounded-[8px] border border-[#eadfca] bg-white px-4 py-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h3 className="text-base font-semibold text-[#17202b]">{selectedTicket.title}</h3>
                                        <p className="mt-1 text-xs text-[#68707a]">{formatSupportCategory(selectedTicket.category)}</p>
                                    </div>
                                    <span className={['rounded-full px-2 py-1 text-[11px] font-semibold', statusClass(selectedTicket.status)].join(' ')}>
                                        {statusLabel(selectedTicket.status)}
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {(selectedTicket.messages ?? []).map((ticketMessage) => (
                                    <div key={ticketMessage.id} className={['max-w-[82%] rounded-[8px] px-4 py-3 text-sm shadow-sm', messageBubbleClass(ticketMessage)].join(' ')}>
                                        <p className="mb-1 text-[11px] font-semibold opacity-70">{ticketMessage.sender?.display_name ?? (ticketMessage.sender_role === 'admin' ? '運営' : 'あなた')}</p>
                                        {ticketMessage.message_type === 'image' && ticketMessage.attachment_url ? (
                                            <a href={ticketMessage.attachment_url} target="_blank" rel="noreferrer" className="block">
                                                <img src={ticketMessage.attachment_url} alt={ticketMessage.attachment_original_name ?? '添付画像'} className="max-h-72 rounded-[8px] object-contain" />
                                            </a>
                                        ) : (
                                            <p className="whitespace-pre-wrap leading-7">{ticketMessage.body}</p>
                                        )}
                                        <p className="mt-2 text-[11px] opacity-60">{formatJstDateTime(ticketMessage.sent_at) ?? ''}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </div>

                {viewMode === 'detail' && selectedTicket ? (
                    <footer className="border-t border-[#eadfca] px-5 py-4">
                        {selectedTicket.can_send ? (
                            <form onSubmit={handleSend} className="space-y-3">
                                {selectedImage ? (
                                    <div className="flex items-center justify-between rounded-[8px] border border-[#eadfca] bg-white px-3 py-2 text-sm text-[#516072]">
                                        <span className="truncate">{selectedImage.name}</span>
                                        <button type="button" onClick={() => setSelectedImage(null)} className="font-semibold text-[#8f5c22]">解除</button>
                                    </div>
                                ) : null}
                                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} disabled={Boolean(selectedImage)} placeholder="メッセージを入力" className="w-full rounded-[8px] border border-[#eadfca] bg-white px-4 py-3 text-sm leading-6 text-[#17202b] outline-none placeholder:text-[#8a8f97] focus:border-[#d6b35a] disabled:bg-[#f5efe4]" />
                                <div className="flex items-center gap-2">
                                    <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageChange} className="hidden" />
                                    <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#eadfca] bg-white text-[#17202b] transition hover:bg-[#f5efe4]">＋</button>
                                    <button type="submit" disabled={isSending || (!draft.trim() && !selectedImage)} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-[#17202b] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#263445] disabled:opacity-60">
                                        {isSending ? '送信中...' : '送信'}
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <p className="rounded-[8px] border border-[#eadfca] bg-white px-4 py-3 text-sm text-[#68707a]">
                                このチケットは完了済みです。閲覧のみできます。
                            </p>
                        )}
                    </footer>
                ) : null}
            </aside>
        </div>
    );
}
