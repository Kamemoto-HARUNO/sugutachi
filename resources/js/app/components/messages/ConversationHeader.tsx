import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { MessageRole } from '../../lib/directMessages';

export function ConversationHeader({
    role,
    name,
    avatar,
    kind,
    subtitle,
    children,
}: {
    role: MessageRole;
    name: string;
    avatar?: ReactNode;
    kind: 'dm' | 'bookings';
    subtitle?: string;
    children: ReactNode;
}) {
    const [open, setOpen] = useState(false);
    return (
        <div className="shrink-0 border-b border-slate-200 bg-white">
            <header className="flex min-h-[76px] items-center gap-3 px-3 py-2 sm:px-5">
                <Link
                    to={`/${role}/messages?tab=${kind}`}
                    aria-label="メッセージ一覧に戻る"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-slate-100 lg:hidden"
                >
                    <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="h-5 w-5"
                    >
                        <path d="m12 5-7 7 7 7M5 12h15" />
                    </svg>
                </Link>
                {avatar ?? (
                    <span
                        aria-hidden="true"
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#f3e5d1] font-semibold text-[#6f4b26]"
                    >
                        {name.slice(0, 1)}
                    </span>
                )}
                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-base font-bold">{name}</h1>
                    <p className="truncate text-xs text-slate-500">
                        {role === 'user' ? '利用者' : 'タチキャスト'}として・
                        {kind === 'dm' ? 'DM' : '予約の連絡'}
                        {subtitle ? ` · ${subtitle}` : ''}
                    </p>
                </div>
                <button
                    type="button"
                    aria-label="会話の詳細"
                    aria-expanded={open}
                    onClick={() => setOpen(!open)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-slate-100"
                >
                    <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        className="h-5 w-5"
                    >
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 11v6M12 7v1" />
                    </svg>
                </button>
            </header>
            {open && (
                <section
                    aria-label="会話の詳細"
                    className="max-h-[45dvh] space-y-3 overflow-y-auto border-t border-slate-100 bg-slate-50 p-4 text-sm"
                >
                    {children}
                </section>
            )}
        </div>
    );
}
