import { usePageTitle } from '../hooks/usePageTitle';
import { Outlet, useLocation } from 'react-router-dom';
import { MessagesPage } from '../pages/MessagesPage';
import { useAuth } from '../hooks/useAuth';
import type { MessageRole } from '../lib/directMessages';
import { useMessageViewport } from '../hooks/useMessageViewport';

export function MessagesLayout({ role }: { role: MessageRole }) {
    const { account } = useAuth();
    const location = useLocation();
    const viewportRef = useMessageViewport();
    const isInbox = location.pathname === `/${role}/messages`;
    return (
        <main ref={viewportRef} className="message-viewport overflow-hidden bg-white text-[#17202b]">
            <div className="mx-auto flex h-full max-w-[1200px] border-x border-slate-200">
                <aside
                    aria-label="会話一覧"
                    className={`${isInbox ? 'flex' : 'hidden lg:flex'} h-full w-full shrink-0 flex-col border-r border-slate-200 lg:w-[360px]`}
                >
                    <MessagesPage
                        key={`${account?.public_id}:${role}`}
                        role={role}
                    />
                </aside>
                <div
                    className={`${isInbox ? 'hidden lg:block' : 'block'} min-w-0 flex-1 h-full`}
                >
                    <Outlet />
                </div>
            </div>
        </main>
    );
}

export function MessageEmptyPane() {
    usePageTitle('メッセージ');
    return (
        <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="mb-5 h-12 w-12 text-slate-300"
            >
                <path d="M4 4h16v12H8l-4 4V4Z" />
                <path d="M8 8h8M8 12h5" />
            </svg>
            <h2 className="text-xl font-bold">会話を選択</h2>
            <p className="mt-2 text-sm text-slate-500">
                左の一覧からメッセージを開いてください。
            </p>
        </div>
    );
}
