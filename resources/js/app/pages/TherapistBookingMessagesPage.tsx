import { MessageComposer } from '../components/messages/MessageComposer';
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { notifyBookingMessageSummaryChanged } from '../lib/bookingMessages';
import { prepareBookingMessageImage } from '../lib/bookingMessageImages';
import { formatJstDateTime } from '../lib/datetime';
import { getServiceAddressLabel } from '../lib/discovery';
import type {
    ApiEnvelope,
    BookingDetailRecord,
    BookingMessageRecord,
    BookingMessagesMeta,
} from '../lib/types';

type BookingMessagesResponse = ApiEnvelope<BookingMessageRecord[]> & {
    meta?: BookingMessagesMeta;
};

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
            return '対応中';
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

function formatDateTime(value: string | null): string {
    return formatJstDateTime(value, {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }) ?? '未設定';
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

function stageHint(status: string): string {
    switch (status) {
        case 'accepted':
            return '移動前の連絡を確認できる状態です。';
        case 'moving':
            return '到着前のやり取りが中心です。';
        case 'arrived':
            return '入室や開始前の確認に使います。';
        case 'in_progress':
            return '対応中の連絡履歴です。';
        case 'therapist_completed':
            return '利用者の完了確認待ちです。';
        case 'completed':
            return '完了後の履歴として確認できます。';
        default:
            return '予約状況に応じた連絡履歴を確認できます。';
    }
}

function CloseIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M6 6l12 12" />
            <path d="M18 6 6 18" />
        </svg>
    );
}

function TrashIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M4 7h16" />
            <path d="M9 7V5.8c0-.44.36-.8.8-.8h4.4c.44 0 .8.36.8.8V7" />
            <path d="M7.5 7.5v9.7c0 .99.81 1.8 1.8 1.8h5.4c.99 0 1.8-.81 1.8-1.8V7.5" />
            <path d="M10 11v4.5" />
            <path d="M14 11v4.5" />
        </svg>
    );
}

export function TherapistBookingMessagesPage() {
    const { publicId } = useParams();
    const { token } = useAuth();

    const [booking, setBooking] = useState<BookingDetailRecord | null>(null);
    const [messages, setMessages] = useState<BookingMessageRecord[]>([]);
    const [meta, setMeta] = useState<BookingMessagesMeta | null>(null);
    const [draft, setDraft] = useState('');
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [selectedImagePreviewUrl, setSelectedImagePreviewUrl] = useState<string | null>(null);
    const [selectedImageOriginalSizeBytes, setSelectedImageOriginalSizeBytes] = useState<number | null>(null);
    const [selectedImageWasOptimized, setSelectedImageWasOptimized] = useState(false);
    const [expandedImage, setExpandedImage] = useState<BookingMessageRecord | null>(null);
    const [imageDeleteCandidate, setImageDeleteCandidate] = useState<BookingMessageRecord | null>(null);
    const [pageError, setPageError] = useState<string | null>(null);
    const [composeError, setComposeError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [pendingReadIds, setPendingReadIds] = useState<number[]>([]);
    const [deletingImageMessageIds, setDeletingImageMessageIds] = useState<number[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isPreparingImage, setIsPreparingImage] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
    const [isClosingThread, setIsClosingThread] = useState(false);
    const isTypingRef = useRef(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const imagePreparationRequestRef = useRef(0);

    usePageTitle(
        booking
            ? `${booking.counterparty?.display_name ?? meta?.counterparty?.display_name ?? '予約'}とのメッセージ`
            : '予約メッセージ',
    );
    useToastOnMessage(successMessage, 'success');

    const loadData = useCallback(async (options: { refresh?: boolean; silent?: boolean; preserveSuccess?: boolean } = {}) => {
        if (!token || !publicId) {
            setIsLoading(false);
            return;
        }

        if (options.refresh && !options.silent) {
            setIsRefreshing(true);
        } else if (!options.silent) {
            setIsLoading(true);
        }

        if (!options.preserveSuccess) {
            setSuccessMessage(null);
        }

        try {
            const [bookingPayload, messagesPayload] = await Promise.all([
                apiRequest<ApiEnvelope<BookingDetailRecord>>(`/bookings/${publicId}`, {
                    token,
                }),
                apiRequest<BookingMessagesResponse>(`/bookings/${publicId}/messages`, {
                    token,
                }),
            ]);

            setBooking(unwrapData(bookingPayload));
            setMessages(unwrapData(messagesPayload));
            setMeta(messagesPayload.meta ?? null);
            setPageError(null);
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '予約メッセージの取得に失敗しました。';

            setPageError(message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [publicId, token]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    useEffect(() => {
        if (!token || !publicId) {
            return;
        }

        const intervalId = window.setInterval(() => {
            if (document.visibilityState !== 'visible') {
                return;
            }

            void loadData({ refresh: true, silent: true, preserveSuccess: true });
        }, 4000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [loadData, publicId, token]);

    const syncTypingState = useCallback(async (isTyping: boolean) => {
        if (!token || !publicId) {
            return;
        }

        try {
            await apiRequest<ApiEnvelope<{ booking_public_id: string; is_typing: boolean }>>(`/bookings/${publicId}/messages/typing`, {
                method: 'POST',
                token,
                body: {
                    is_typing: isTyping,
                },
            });
        } catch {
            // Typing indicators are best-effort only.
        }
    }, [publicId, token]);

    useEffect(() => () => {
        if (isTypingRef.current) {
            void syncTypingState(false);
        }
    }, [syncTypingState]);

    useEffect(() => {
        if (!expandedImage) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setExpandedImage(null);
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [expandedImage]);

    useEffect(() => {
        if (!imageDeleteCandidate) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setImageDeleteCandidate(null);
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [imageDeleteCandidate]);

    useEffect(() => {
        if (!selectedImage) {
            setSelectedImagePreviewUrl((current) => {
                if (current) {
                    URL.revokeObjectURL(current);
                }

                return null;
            });
            return;
        }

        const nextPreviewUrl = URL.createObjectURL(selectedImage);
        setSelectedImagePreviewUrl((current) => {
            if (current) {
                URL.revokeObjectURL(current);
            }

            return nextPreviewUrl;
        });

        return () => {
            URL.revokeObjectURL(nextPreviewUrl);
        };
    }, [selectedImage]);

    const counterpartyName = booking?.counterparty?.display_name
        ?? meta?.counterparty?.display_name
        ?? '利用者を確認中';
    const messageThread = booking?.message_thread ?? meta?.message_thread ?? null;
    const canSendMessages = messageThread?.can_send ?? true;
    const canCloseThread = messageThread?.can_close ?? false;
    const isThreadClosed = messageThread?.is_closed ?? false;
    const closedAtLabel = isThreadClosed ? formatDateTime(messageThread?.closed_at ?? null) : null;

    function clearSelectedImage() {
        imagePreparationRequestRef.current += 1;
        setSelectedImage(null);
        setSelectedImageOriginalSizeBytes(null);
        setSelectedImageWasOptimized(false);
        setIsPreparingImage(false);

        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }

    useEffect(() => {
        if (!canSendMessages) {
            if (draft) {
                setDraft('');
            }

            if (selectedImage) {
                clearSelectedImage();
            }

            if (isTypingRef.current) {
                isTypingRef.current = false;
                void syncTypingState(false);
            }

            setImageDeleteCandidate(null);
        }
    }, [canSendMessages, draft, selectedImage, syncTypingState]);

    async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
        if (!canSendMessages) {
            event.target.value = '';
            setComposeError('このチャットはクローズ済みのため新しいメッセージを送れません。');
            return;
        }

        const file = event.target.files?.[0];

        if (!file) {
            return;
        }
        const requestId = imagePreparationRequestRef.current + 1;
        imagePreparationRequestRef.current = requestId;
        setComposeError(null);
        setSelectedImage(null);
        setSelectedImageOriginalSizeBytes(null);
        setSelectedImageWasOptimized(false);
        setIsPreparingImage(true);

        try {
            const preparedImage = await prepareBookingMessageImage(file);

            if (imagePreparationRequestRef.current !== requestId) {
                return;
            }

            setSelectedImage(preparedImage.file);
            setSelectedImageOriginalSizeBytes(preparedImage.originalSizeBytes);
            setSelectedImageWasOptimized(preparedImage.wasOptimized);
        } catch (error) {
            if (imagePreparationRequestRef.current !== requestId) {
                return;
            }

            setComposeError(error instanceof Error ? error.message : '画像の準備に失敗しました。');
            event.target.value = '';
        } finally {
            if (imagePreparationRequestRef.current === requestId) {
                setIsPreparingImage(false);
            }
        }
    }

    async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const trimmedDraft = draft.trim();

        if (!canSendMessages) {
            setComposeError('このチャットはクローズ済みのため新しいメッセージを送れません。');
            return;
        }

        if (!token || !publicId || isPreparingImage || (!trimmedDraft && !selectedImage)) {
            return;
        }

        if (trimmedDraft && selectedImage) {
            setComposeError('画像とテキストは別々に送信してください。');
            return;
        }

        setIsSending(true);
        setComposeError(null);
        setPageError(null);
        setSuccessMessage(null);

        try {
            const isImageUpload = Boolean(selectedImage);
            const requestBody = selectedImage
                ? (() => {
                    const formData = new FormData();
                    formData.append('image', selectedImage);
                    return formData;
                })()
                : {
                    body: trimmedDraft,
                };

            const payload = await apiRequest<ApiEnvelope<BookingMessageRecord>>(`/bookings/${publicId}/messages`, {
                method: 'POST',
                token,
                body: requestBody,
            });

            const createdMessage = unwrapData(payload);
            setMessages((current) => current.some((message) => message.id === createdMessage.id)
                ? current
                : [...current, createdMessage]);
            setDraft('');
            clearSelectedImage();
            isTypingRef.current = false;
            setSuccessMessage(isImageUpload ? '画像を送信しました。' : 'メッセージを送信しました。');
            await loadData({ refresh: true, silent: true, preserveSuccess: true });
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : 'メッセージの送信に失敗しました。';

            setComposeError(message);
        } finally {
            setIsSending(false);
        }
    }

    async function handleCloseMessageThread() {
        if (!token || !publicId || !canCloseThread) {
            return;
        }

        setIsClosingThread(true);
        setComposeError(null);
        setPageError(null);
        setSuccessMessage(null);

        try {
            await apiRequest<ApiEnvelope<unknown>>(`/bookings/${publicId}/messages/close`, {
                method: 'POST',
                token,
            });

            setDraft('');
            clearSelectedImage();
            setExpandedImage(null);
            setImageDeleteCandidate(null);
            setIsCloseDialogOpen(false);
            isTypingRef.current = false;
            setSuccessMessage('チャットをクローズしました。以後は履歴の閲覧のみ可能です。');
            await loadData({ refresh: true, silent: true, preserveSuccess: true });
            notifyBookingMessageSummaryChanged();
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : 'チャットのクローズに失敗しました。';

            setPageError(message);
        } finally {
            setIsClosingThread(false);
        }
    }

    async function markAsRead(messageId: number) {
        if (!token || !publicId) {
            return;
        }

        setPendingReadIds((current) => [...current, messageId]);
        setPageError(null);
        setSuccessMessage(null);

        try {
            await apiRequest<ApiEnvelope<BookingMessageRecord>>(`/bookings/${publicId}/messages/${messageId}/read`, {
                method: 'POST',
                token,
            });

            await loadData({ refresh: true, silent: true, preserveSuccess: true });
            notifyBookingMessageSummaryChanged();
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '既読更新に失敗しました。';

            setPageError(message);
        } finally {
            setPendingReadIds((current) => current.filter((id) => id !== messageId));
        }
    }

    async function handleDeleteImage(messageId: number) {
        if (!token || !publicId) {
            return;
        }

        setDeletingImageMessageIds((current) => [...current, messageId]);
        setComposeError(null);
        setPageError(null);
        setSuccessMessage(null);
        setImageDeleteCandidate(null);

        try {
            const payload = await apiRequest<ApiEnvelope<BookingMessageRecord>>(`/bookings/${publicId}/messages/${messageId}/image`, {
                method: 'DELETE',
                token,
            });
            const deletedMessage = unwrapData(payload);

            setMessages((current) => current.map((message) => (
                message.id === deletedMessage.id ? deletedMessage : message
            )));
            setExpandedImage((current) => (current?.id === deletedMessage.id ? null : current));
            setSuccessMessage('画像を削除しました。');
            await loadData({ refresh: true, silent: true, preserveSuccess: true });
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '画像の削除に失敗しました。';

            setPageError(message);
        } finally {
            setDeletingImageMessageIds((current) => current.filter((id) => id !== messageId));
        }
    }

    useEffect(() => {
        const hasDraft = draft.trim().length > 0;

        if (!canSendMessages || !hasDraft) {
            if (isTypingRef.current) {
                isTypingRef.current = false;
                void syncTypingState(false);
            }
            return;
        }

        if (!isTypingRef.current) {
            isTypingRef.current = true;
            void syncTypingState(true);
        }

        const intervalId = window.setInterval(() => {
            void syncTypingState(true);
        }, 3000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [canSendMessages, draft, syncTypingState]);

    useEffect(() => {
        if (!isCloseDialogOpen) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !isClosingThread) {
                setIsCloseDialogOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isCloseDialogOpen, isClosingThread]);

    if (isLoading) {
        return <LoadingScreen title="予約メッセージを読み込み中" message="利用者との連絡内容と未読状況を確認しています。" />;
    }

    if (!booking) {
        return (
            <div className="space-y-6">
                <section className="rounded-[28px] border border-[#f1d4b5] bg-[#fff4e8] px-6 py-5 text-sm text-[#9a4b35]">
                    {pageError ?? '予約メッセージを表示できませんでした。'}
                </section>
                <div className="flex flex-wrap gap-3">
                    <Link
                        to="/therapist/bookings"
                        className="inline-flex items-center rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/6"
                    >
                        予約一覧へ戻る
                    </Link>
                </div>
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
                            {isThreadClosed ? (
                                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90">
                                    チャットクローズ済み
                                </span>
                            ) : null}
                            {canSendMessages && meta?.counterparty_typing ? (
                                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90">
                                    {counterpartyName}が入力中...
                                </span>
                            ) : null}
                        </div>
                        <div className="space-y-2">
                            <h1 className="text-3xl font-semibold">{counterpartyName}とのメッセージ</h1>
                            <p className="max-w-3xl text-sm leading-7 text-slate-300">
                                {booking.therapist_menu
                                    ? `${booking.therapist_menu.name} / ${booking.therapist_menu.duration_minutes}分`
                                    : 'メニュー情報を確認中'} ・ {buildPrimaryTime(booking)}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        {canCloseThread ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setIsCloseDialogOpen(true);
                                }}
                                disabled={isClosingThread}
                                className="inline-flex items-center rounded-full border border-[#f7d7ab] bg-[#fff4e8] px-5 py-3 text-sm font-semibold text-[#9a4b35] transition hover:bg-[#ffebd7] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isClosingThread ? 'クローズ中...' : 'チャットをクローズ'}
                            </button>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => {
                                void loadData({ refresh: true });
                            }}
                            disabled={isRefreshing}
                            className="inline-flex items-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isRefreshing ? '更新中...' : '更新'}
                        </button>
                        <Link
                            to={`/therapist/bookings/${booking.public_id}`}
                            className="inline-flex items-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8"
                        >
                            予約詳細へ戻る
                        </Link>
                    </div>
                </div>
            </section>

            {pageError ? (
                <section className="rounded-[24px] border border-[#f1d4b5] bg-[#fff4e8] px-5 py-4 text-sm text-[#9a4b35]">
                    {pageError}
                </section>
            ) : null}

            {isThreadClosed ? (
                <section className="rounded-[24px] border border-[#ead9bc] bg-[#fffaf1] px-5 py-4 text-sm leading-7 text-[#6f5a43]">
                    <p className="font-semibold text-[#17202b]">このチャットはクローズ済みです。</p>
                    <p>
                        利用者は履歴を見られず、新しいメッセージも送れません。タチキャスト側は履歴のみ確認できます。
                        {closedAtLabel ? ` クローズ日時: ${closedAtLabel}` : ''}
                    </p>
                </section>
            ) : null}


            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                    <div className="space-y-4">
                        {messages.length > 0 ? messages.map((message) => {
                            const isPendingRead = pendingReadIds.includes(message.id);
                            const isDeletingImage = deletingImageMessageIds.includes(message.id);
                            const isDeletedImageMessage = message.message_type === 'image' && message.is_deleted;
                            const isImageMessage = message.message_type === 'image' && Boolean(message.attachment_url);

                            return (
                                <article
                                    key={message.id}
                                    className={[
                                        'flex',
                                        message.is_own ? 'justify-end' : 'justify-start',
                                    ].join(' ')}
                                >
                                    <div className="max-w-[min(100%,38rem)] space-y-2">
                                        <div
                                            className={[
                                                'rounded-[24px] px-4 py-4 shadow-[0_10px_24px_rgba(23,32,43,0.08)]',
                                                message.is_own
                                                    ? 'bg-[#17202b] text-white'
                                                    : 'bg-[#f8f4ed] text-[#17202b]',
                                            ].join(' ')}
                                        >
                                            {isDeletedImageMessage ? (
                                                <p className="text-sm leading-[160%] opacity-80">（画像が削除されました）</p>
                                            ) : isImageMessage ? (
                                                <div className="space-y-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setExpandedImage(message);
                                                        }}
                                                        className="block w-full cursor-zoom-in"
                                                    >
                                                        <img
                                                            src={message.attachment_url ?? undefined}
                                                            alt={message.attachment_original_name ?? '送信画像'}
                                                            className="max-h-[26rem] w-full rounded-[18px] object-cover"
                                                        />
                                                    </button>
                                                    {message.body ? <p className="text-sm leading-[160%]">{message.body}</p> : null}
                                                </div>
                                            ) : (
                                                <p className="text-sm leading-[160%]">{message.body}</p>
                                            )}
                                        </div>

                                        <div className={`flex flex-wrap items-center gap-3 px-1 text-xs ${message.is_own ? 'justify-end text-slate-400' : 'text-[#7a7066]'}`}>
                                            <span>
                                                {message.sender?.display_name ?? (message.is_own ? 'あなた' : counterpartyName)}
                                            </span>
                                            <span>{formatDateTime(message.sent_at)}</span>
                                            <span>{message.is_read ? '既読' : '未読'}</span>
                                            {message.can_delete_image && canSendMessages ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setImageDeleteCandidate(message);
                                                    }}
                                                    disabled={isDeletingImage}
                                                    className="inline-flex items-center gap-1 rounded-full border border-current/20 px-3 py-1 font-semibold transition hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-60"
                                                >
                                                    <TrashIcon />
                                                    <span>{isDeletingImage ? '削除中...' : '画像を削除'}</span>
                                                </button>
                                            ) : null}
                                            {!message.is_own && !message.is_read ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        void markAsRead(message.id);
                                                    }}
                                                    disabled={isPendingRead}
                                                    className="rounded-full border border-[#d7c7ab] px-3 py-1 font-semibold text-[#17202b] transition hover:bg-[#fff8ee] disabled:cursor-not-allowed disabled:opacity-60"
                                                >
                                                    {isPendingRead ? '更新中...' : '既読にする'}
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>
                                </article>
                            );
                        }) : !meta?.counterparty_typing ? (
                            <div className="rounded-[24px] bg-[#f8f4ed] px-5 py-6 text-sm leading-7 text-[#68707a]">
                                {canSendMessages
                                    ? 'この予約ではまだメッセージがありません。必要な連絡があれば下のフォームから送れます。'
                                    : 'このチャットはクローズ済みです。必要な連絡が残っていても新しいメッセージは送れません。'}
                            </div>
                        ) : null}

                        {canSendMessages && meta?.counterparty_typing ? (
                            <article className="flex justify-start">
                                <div className="max-w-[min(100%,38rem)] space-y-2">
                                    <div className="rounded-[24px] bg-[#f8f4ed] px-4 py-4 text-[#17202b] shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center gap-1.5 text-[#7a7066]">
                                                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#c6a16a]" />
                                                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#d5b888] [animation-delay:120ms]" />
                                                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#e2cda8] [animation-delay:240ms]" />
                                            </div>
                                            <p className="text-sm leading-7 text-[#7a7066]">メッセージ入力中...</p>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-3 px-1 text-xs text-[#7a7066]">
                                        <span>{counterpartyName}</span>
                                    </div>
                                </div>
                            </article>
                        ) : null}
                    </div>

                    {canSendMessages ? (
                        <form onSubmit={handleSendMessage} className="mt-6 space-y-3 border-t border-[#efe5d7] pt-5">
                            <MessageComposer
                                draft={draft}
                                onDraftChange={setDraft}
                                placeholder="到着予定や入室方法などを入力"
                                fileInputRef={fileInputRef}
                                handleImageChange={handleImageChange}
                                selectedImage={selectedImage}
                                selectedImagePreviewUrl={selectedImagePreviewUrl}
                                selectedImageOriginalSizeBytes={selectedImageOriginalSizeBytes}
                                selectedImageWasOptimized={selectedImageWasOptimized}
                                clearSelectedImage={clearSelectedImage}
                                isSending={isSending}
                                isPreparingImage={isPreparingImage}
                            />

                            <div className="flex items-start gap-2 px-1 text-xs text-[#68707a]">
                                <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#f1e7d8] text-[10px] font-bold text-[#8b6a3e]">
                                    !
                                </span>
                                <span>連絡先交換につながる文言は送れません。待ち合わせや進行確認に必要な連絡だけに絞って使います。</span>
                            </div>

                            {composeError ? (
                                <p className="text-sm text-[#9a4b35]">{composeError}</p>
                            ) : null}
                        </form>
                    ) : (
                        <div className="mt-6 rounded-[24px] border border-[#ead9bc] bg-[#fffaf1] px-5 py-5 text-sm leading-7 text-[#6f5a43]">
                            <p className="font-semibold text-[#17202b]">新しいメッセージは送れません。</p>
                            <p>
                                チャットをクローズしたため、ここから先は履歴の確認のみ可能です。
                                {closedAtLabel ? ` クローズ日時: ${closedAtLabel}` : ''}
                            </p>
                        </div>
                    )}
                </section>

                <aside className="space-y-5">
                    <section className="rounded-[28px] bg-[#fffcf7] p-6 shadow-[0_18px_36px_rgba(23,32,43,0.1)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">予約情報</p>
                        <div className="mt-4 space-y-4 text-sm text-[#48505a]">
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">予約状況</p>
                                <p className="mt-1">
                                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(booking.status)}`}>
                                        {statusLabel(booking.status)}
                                    </span>
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">利用者</p>
                                <p className="mt-1 font-semibold text-[#17202b]">{counterpartyName}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">日時</p>
                                <p className="mt-1 font-semibold text-[#17202b]">{buildPrimaryTime(booking)}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">待ち合わせ場所</p>
                                <p className="mt-1 font-semibold text-[#17202b]">
                                    {booking.service_address ? getServiceAddressLabel(booking.service_address) : '未設定'}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">運用メモ</p>
                                <p className="mt-1 text-sm leading-7 text-[#48505a]">{stageHint(booking.status)}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#7d6852]">チャット状態</p>
                                <p className="mt-1 font-semibold text-[#17202b]">
                                    {isThreadClosed ? `クローズ済み${closedAtLabel ? `（${closedAtLabel}）` : ''}` : '送受信可能'}
                                </p>
                            </div>
                        </div>

                        <div className="mt-6 space-y-3">
                            <Link
                                to={`/therapist/bookings/${booking.public_id}`}
                                className="inline-flex w-full items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243447]"
                            >
                                予約詳細へ戻る
                            </Link>
                            <Link
                                to="/therapist/bookings"
                                className="inline-flex w-full items-center justify-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                            >
                                予約一覧へ戻る
                            </Link>
                        </div>
                    </section>
                </aside>
            </div>

            {expandedImage?.attachment_url ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(12,16,24,0.88)] px-4 py-6"
                    onClick={() => {
                        setExpandedImage(null);
                    }}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label="送信画像を拡大表示"
                        className="relative flex max-h-full w-full max-w-5xl items-center justify-center"
                        onClick={(event) => {
                            event.stopPropagation();
                        }}
                    >
                        <button
                            type="button"
                            onClick={() => {
                                setExpandedImage(null);
                            }}
                            className="absolute right-3 top-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white transition hover:bg-black/60"
                            aria-label="拡大表示を閉じる"
                        >
                            <CloseIcon />
                        </button>

                        <img
                            src={expandedImage.attachment_url}
                            alt={expandedImage.attachment_original_name ?? '送信画像'}
                            className="max-h-[88vh] w-auto max-w-full rounded-[24px] object-contain shadow-[0_24px_60px_rgba(0,0,0,0.35)]"
                        />
                    </div>
                </div>
            ) : null}

            {isCloseDialogOpen ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(12,16,24,0.72)] px-4 py-6"
                    onClick={() => {
                        if (!isClosingThread) {
                            setIsCloseDialogOpen(false);
                        }
                    }}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label="チャットクローズの確認"
                        className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.22)]"
                        onClick={(event) => {
                            event.stopPropagation();
                        }}
                    >
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">チャットクローズ</p>
                        <h2 className="mt-2 text-xl font-semibold text-[#17202b]">このチャットをクローズしますか？</h2>
                        <p className="mt-3 text-sm leading-7 text-[#68707a]">
                            クローズ後は利用者が履歴を見られなくなり、双方とも新しいメッセージを送れません。タチキャスト側では履歴のみ確認できます。
                        </p>

                        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsCloseDialogOpen(false);
                                }}
                                disabled={isClosingThread}
                                className="inline-flex items-center justify-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                キャンセル
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    void handleCloseMessageThread();
                                }}
                                disabled={isClosingThread}
                                className="inline-flex items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243447] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isClosingThread ? 'クローズ中...' : 'クローズする'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {imageDeleteCandidate ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(12,16,24,0.72)] px-4 py-6"
                    onClick={() => {
                        if (!deletingImageMessageIds.includes(imageDeleteCandidate.id)) {
                            setImageDeleteCandidate(null);
                        }
                    }}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label="画像削除の確認"
                        className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.22)]"
                        onClick={(event) => {
                            event.stopPropagation();
                        }}
                    >
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">画像削除</p>
                        <h2 className="mt-2 text-xl font-semibold text-[#17202b]">この画像を削除しますか？</h2>
                        <p className="mt-3 text-sm leading-7 text-[#68707a]">
                            削除すると相手ユーザーの画面からも非表示になり、あとから元に戻せません。
                        </p>

                        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => {
                                    setImageDeleteCandidate(null);
                                }}
                                disabled={deletingImageMessageIds.includes(imageDeleteCandidate.id)}
                                className="inline-flex items-center justify-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                キャンセル
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    void handleDeleteImage(imageDeleteCandidate.id);
                                }}
                                disabled={deletingImageMessageIds.includes(imageDeleteCandidate.id)}
                                className="inline-flex items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243447] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {deletingImageMessageIds.includes(imageDeleteCandidate.id) ? '削除中...' : '削除する'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
