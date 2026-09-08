import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { MessageRole } from '../../lib/directMessages';

export function ConversationHeader({
    role,
    name,
    avatar,
    kind,
    subtitle,
    profileUrl,
    children,
}: {
    role: MessageRole;
    name: string;
    avatar?: ReactNode;
    kind: 'dm' | 'bookings';
    subtitle?: string;
    profileUrl?: string | null;
    children: ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLElement>(null);
    const panelId = useId();
    const dropdown = kind === 'dm';
    useEffect(() => {
        if (!open || !dropdown) return;
        const frame = requestAnimationFrame(() =>
            panelRef.current
                ?.querySelector<HTMLElement>('a, button')
                ?.focus({ preventScroll: true }),
        );
        const outside = (event: PointerEvent | FocusEvent) => {
            if (
                event.target instanceof Node &&
                !panelRef.current?.contains(event.target) &&
                !triggerRef.current?.contains(event.target)
            )
                setOpen(false);
        };
        const escape = (event: KeyboardEvent) => {
            // A confirmation dialog handles its own Escape before the menu does.
            if (
                event.key !== 'Escape' ||
                panelRef.current?.querySelector('dialog[open]')
            )
                return;
            event.preventDefault();
            setOpen(false);
            triggerRef.current?.focus({ preventScroll: true });
        };
        document.addEventListener('pointerdown', outside);
        document.addEventListener('focusin', outside);
        document.addEventListener('keydown', escape);
        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener('pointerdown', outside);
            document.removeEventListener('focusin', outside);
            document.removeEventListener('keydown', escape);
        };
    }, [open, dropdown]);
    const identity = (
        <>
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
        </>
    );
    return (
        <div className="relative z-20 shrink-0 border-b border-slate-200 bg-white">
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
                {profileUrl ? (
                    <Link
                        to={profileUrl}
                        aria-label={`${name}のプロフィールを見る`}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl outline-none transition hover:opacity-75 focus-visible:ring-2 focus-visible:ring-[#b5894d]"
                    >
                        {identity}
                    </Link>
                ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                        {identity}
                    </div>
                )}
                <button
                    type="button"
                    ref={triggerRef}
                    aria-label={open ? '会話の詳細を閉じる' : '会話の詳細'}
                    aria-controls={panelId}
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
                        {open ? (
                            <path
                                d="m6 6 12 12M18 6 6 18"
                                strokeLinecap="round"
                            />
                        ) : (
                            <>
                                <circle cx="12" cy="12" r="9" />
                                <path d="M12 11v6M12 7v1" />
                            </>
                        )}
                    </svg>
                </button>
            </header>
            {open && (
                <section
                    ref={panelRef}
                    id={panelId}
                    aria-label="会話の詳細"
                    onClick={(event) => {
                        if (
                            dropdown &&
                            event.target instanceof Element &&
                            event.target.closest(
                                '[data-close-conversation-menu]',
                            )
                        ) {
                            setOpen(false);
                            triggerRef.current?.focus({ preventScroll: true });
                        }
                    }}
                    className={
                        dropdown
                            ? 'absolute right-3 top-[calc(100%+8px)] z-30 max-h-[calc(100dvh-100px)] w-[288px] max-w-[calc(100vw-32px)] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-1.5 text-sm shadow-[0_12px_40px_rgba(15,23,42,0.16)] sm:right-5'
                            : 'max-h-[45dvh] space-y-3 overflow-y-auto border-t border-slate-100 bg-slate-50 p-4 text-sm'
                    }
                >
                    {children}
                </section>
            )}
        </div>
    );
}
