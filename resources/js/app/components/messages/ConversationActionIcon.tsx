export const conversationActionClass =
    'flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#b5894d] disabled:opacity-50';

export function ConversationActionIcon({
    kind,
}: {
    kind: 'profile' | 'mute' | 'archive' | 'pause' | 'block' | 'report';
}) {
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5 shrink-0"
        >
            {kind === 'profile' && (
                <>
                    <rect x="4" y="5" width="16" height="15" rx="3" />
                    <path d="M8 3v4M16 3v4M4 10h16M9 15h6" />
                </>
            )}
            {kind === 'mute' && (
                <>
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
                </>
            )}
            {kind === 'archive' && (
                <>
                    <rect x="3" y="3" width="18" height="5" rx="1" />
                    <path d="M5 8v12h14V8M10 12h4" />
                </>
            )}
            {kind === 'pause' && (
                <>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M9 8v8M15 8v8" />
                </>
            )}
            {kind === 'block' && (
                <>
                    <circle cx="12" cy="12" r="9" />
                    <path d="m6 6 12 12" />
                </>
            )}
            {kind === 'report' && (
                <>
                    <path d="M5 21V4c5-4 9 4 14 0v10c-5 4-9-4-14 0" />
                </>
            )}
        </svg>
    );
}
