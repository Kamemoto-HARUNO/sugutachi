import { Link } from 'react-router-dom';
import type { MessageRole } from '../../lib/directMessages';
import {
    ConversationActionIcon,
    conversationActionClass,
} from './ConversationActionIcon';

export function BookingConversationDetails({
    role,
    bookingId,
    time,
    place,
    status,
    statusClass,
    chatStatus,
    unreadCount,
    stageHint,
    onRefresh,
    isRefreshing,
    onCloseThread,
    isClosingThread,
}: {
    role: MessageRole;
    bookingId: string;
    time: string;
    place: string;
    status: string;
    statusClass: string;
    chatStatus: string;
    unreadCount?: number;
    stageHint?: string;
    onRefresh: () => void;
    isRefreshing: boolean;
    onCloseThread?: () => void;
    isClosingThread?: boolean;
}) {
    const bookingPath = `/${role}/bookings/${bookingId}`;
    return (
        <>
            <div className="px-3 pb-3 pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-bold text-slate-900">
                        予約情報
                    </h2>
                    <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass}`}
                    >
                        {status}
                    </span>
                </div>
                <dl className="mt-3 space-y-3 text-xs leading-5">
                    {[
                        ['予約日時', time],
                        ['待ち合わせ場所', place],
                        ['チャット', chatStatus],
                        ...(unreadCount !== undefined
                            ? [['未読', `${unreadCount}件`]]
                            : []),
                    ].map(([label, value]) => (
                        <div
                            key={label}
                            className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3"
                        >
                            <dt className="text-slate-500">{label}</dt>
                            <dd className="min-w-0 break-words font-medium text-slate-800">
                                {value}
                            </dd>
                        </div>
                    ))}
                </dl>
                {stageHint ? (
                    <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
                        {stageHint}
                    </p>
                ) : null}
            </div>
            <div className="border-t border-slate-100 pt-1">
                <Link
                    to={bookingPath}
                    className={conversationActionClass}
                    data-close-conversation-menu
                >
                    <ConversationActionIcon kind="profile" />
                    予約詳細を見る
                </Link>
                <button
                    type="button"
                    onClick={onRefresh}
                    disabled={isRefreshing}
                    className={conversationActionClass}
                >
                    <ConversationActionIcon kind="refresh" />
                    {isRefreshing ? '更新中...' : '最新の状態に更新'}
                </button>
                {role === 'therapist' ? (
                    <Link
                        to="/therapist/bookings"
                        className={conversationActionClass}
                        data-close-conversation-menu
                    >
                        <ConversationActionIcon kind="list" />
                        予約一覧を見る
                    </Link>
                ) : (
                    <Link
                        to={`${bookingPath}/report`}
                        className={conversationActionClass}
                        data-close-conversation-menu
                    >
                        <ConversationActionIcon kind="report" />
                        運営へ通報
                    </Link>
                )}
            </div>
            {onCloseThread ? (
                <div className="mt-1 border-t border-slate-100 pt-1">
                    <button
                        type="button"
                        onClick={onCloseThread}
                        disabled={isClosingThread}
                        className={`${conversationActionClass} text-[#9a4b35]`}
                        data-close-conversation-menu
                    >
                        <ConversationActionIcon kind="block" />
                        {isClosingThread
                            ? 'クローズ中...'
                            : 'チャットをクローズ'}
                    </button>
                </div>
            ) : null}
        </>
    );
}
