import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatJstDateTime } from '../lib/datetime';
import { formatSupportCategory, notifySupportTicketsChanged } from '../lib/supportTickets';
import type { ApiEnvelope, SupportTicketMessageRecord, SupportTicketRecord } from '../lib/types';

function statusLabel(status: SupportTicketRecord['status']): string {
    return status === 'completed' ? '完了' : '進行中';
}

function bubbleClass(message: SupportTicketMessageRecord): string {
    return message.is_own
        ? 'ml-auto bg-[#17202b] text-white'
        : 'mr-auto border border-[#eadfca] bg-white text-[#17202b]';
}

export function SupportTicketPage() {
    const { publicId } = useParams();
    const { token, activeRole } = useAuth();
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [ticket, setTicket] = useState<SupportTicketRecord | null>(null);
    const [draft, setDraft] = useState('');
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSending, setIsSending] = useState(false);

    usePageTitle(ticket ? `${ticket.title} | サポートセンター` : 'サポートセンター');

    async function loadTicket() {
        if (!token || !publicId) {
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const payload = await apiRequest<ApiEnvelope<SupportTicketRecord>>(`/support/tickets/${publicId}`, { token });
            setTicket(unwrapData(payload));
            notifySupportTicketsChanged();
        } catch (loadError) {
            setError(loadError instanceof ApiError ? loadError.message : 'サポートチケットを取得できませんでした。');
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        void loadTicket();
    }, [publicId, token]);

    function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
        setSelectedImage(event.target.files?.[0] ?? null);
    }

    async function handleSend(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token || !ticket || (!draft.trim() && !selectedImage)) {
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

            await apiRequest<ApiEnvelope<SupportTicketMessageRecord>>(`/support/tickets/${ticket.public_id}/messages`, {
                method: 'POST',
                token,
                body,
            });

            setDraft('');
            setSelectedImage(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
            await loadTicket();
        } catch (sendError) {
            setError(sendError instanceof ApiError ? sendError.message : 'メッセージを送信できませんでした。');
        } finally {
            setIsSending(false);
        }
    }

    return (
        <div className="min-h-screen bg-[#f5efe4] px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <Link to={activeRole === 'therapist' ? '/therapist/dashboard?support=open' : '/user/dashboard?support=open'} className="text-sm font-semibold text-[#8f5c22]">
                        サポートセンターを開く
                    </Link>
                    <Link to="/help" className="text-sm font-semibold text-[#516072]">
                        FAQを見る
                    </Link>
                </div>

                {error ? (
                    <div className="rounded-[8px] border border-[#f0c7b8] bg-[#fff1ec] px-4 py-3 text-sm text-[#8a3d2c]">
                        {error}
                    </div>
                ) : null}

                {isLoading && !ticket ? <p className="text-sm text-[#68707a]">読み込み中です。</p> : null}

                {ticket ? (
                    <section className="overflow-hidden rounded-[8px] border border-[#eadfca] bg-[#fbf7ef] shadow-[0_18px_45px_rgba(23,32,43,0.08)]">
                        <header className="border-b border-[#eadfca] bg-white px-5 py-4">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-xs font-semibold tracking-wide text-[#8f5c22]">サポートチケット</p>
                                    <h1 className="mt-1 text-2xl font-semibold text-[#17202b]">{ticket.title}</h1>
                                    <p className="mt-2 text-sm text-[#68707a]">{formatSupportCategory(ticket.category)} / {statusLabel(ticket.status)}</p>
                                </div>
                                <span className="rounded-full border border-[#eadfca] bg-[#f5efe4] px-3 py-1 text-xs font-semibold text-[#516072]">
                                    {statusLabel(ticket.status)}
                                </span>
                            </div>
                        </header>

                        <div className="space-y-3 px-5 py-5">
                            {(ticket.messages ?? []).map((message) => (
                                <div key={message.id} className={['max-w-[82%] rounded-[8px] px-4 py-3 text-sm shadow-sm', bubbleClass(message)].join(' ')}>
                                    <p className="mb-1 text-[11px] font-semibold opacity-70">{message.sender?.display_name ?? (message.sender_role === 'admin' ? '運営' : 'あなた')}</p>
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
                            {ticket.can_send ? (
                                <form onSubmit={handleSend} className="space-y-3">
                                    {selectedImage ? (
                                        <div className="flex items-center justify-between rounded-[8px] border border-[#eadfca] bg-[#fbf7ef] px-3 py-2 text-sm text-[#516072]">
                                            <span className="truncate">{selectedImage.name}</span>
                                            <button type="button" onClick={() => setSelectedImage(null)} className="font-semibold text-[#8f5c22]">解除</button>
                                        </div>
                                    ) : null}
                                    <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} disabled={Boolean(selectedImage)} placeholder="メッセージを入力" className="w-full rounded-[8px] border border-[#eadfca] bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-[#d6b35a] disabled:bg-[#f5efe4]" />
                                    <div className="flex items-center gap-2">
                                        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageChange} className="hidden" />
                                        <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#eadfca] bg-white text-[#17202b] transition hover:bg-[#f5efe4]">＋</button>
                                        <button type="submit" disabled={isSending || (!draft.trim() && !selectedImage)} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-[#17202b] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#263445] disabled:opacity-60">
                                            {isSending ? '送信中...' : '送信'}
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <p className="rounded-[8px] border border-[#eadfca] bg-[#fbf7ef] px-4 py-3 text-sm text-[#68707a]">
                                    このチケットは完了済みです。閲覧のみできます。
                                </p>
                            )}
                        </footer>
                    </section>
                ) : null}
            </div>
        </div>
    );
}
