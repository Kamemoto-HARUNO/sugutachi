import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { apiRequest } from "../lib/api";
import {
    countUnreadBookingInboxMessages,
    fetchBookingInboxThreads,
} from "../lib/bookingMessages";
import type { MessageRole } from "../lib/directMessages";
import { BookingMessagesPage } from "./BookingMessagesPage";
import { DirectMessagesPage } from "./DirectMessagesPage";

export function MessagesPage({ role }: { role: MessageRole }) {
    const { account, token } = useAuth();
    const [params, setParams] = useSearchParams();
    const key = `messages-tab:${account?.public_id}:${role}`;
    const stored = localStorage.getItem(key);
    const tab = (params.get("tab") ?? stored) === "dm" ? "dm" : "bookings";
    const [counts, setCounts] = useState({ dm: 0, bookings: 0 });
    useEffect(() => {
        localStorage.setItem(key, tab);
    }, [key, tab]);
    useEffect(() => {
        if (!token) return;
        let active = true;
        const update = async () => {
            if (document.hidden) return;
            const [bookings, dm] = await Promise.allSettled([
                fetchBookingInboxThreads(token, [role]),
                apiRequest<{ data: { unread_count: number } }>(
                    `/${role}/direct-messages/summary`,
                    { token },
                ),
            ]);
            if (active)
                setCounts({
                    bookings:
                        bookings.status === "fulfilled"
                            ? countUnreadBookingInboxMessages(bookings.value)
                            : 0,
                    dm:
                        dm.status === "fulfilled"
                            ? dm.value.data.unread_count
                            : 0,
                });
        };
        void update();
        const timer = window.setInterval(() => void update(), 30000);
        window.addEventListener("booking-message-summary:refresh", update);
        return () => {
            active = false;
            clearInterval(timer);
            window.removeEventListener(
                "booking-message-summary:refresh",
                update,
            );
        };
    }, [role, token]);
    return (
        <div className="space-y-5">
            <h1 className="text-xl font-semibold">
                {role === "user" ? "利用者" : "タチキャスト"}としてのメッセージ
            </h1>
            <div
                className="flex gap-2 rounded-2xl border border-white/15 bg-white/5 p-1.5"
                role="tablist"
                aria-label="メッセージの種類"
            >
                {(
                    [
                        ["dm", "DM"],
                        ["bookings", "予約の連絡"],
                    ] as const
                ).map(([value, label]) => (
                    <button
                        key={value}
                        role="tab"
                        aria-selected={tab === value}
                        onClick={() => setParams({ tab: value })}
                        className={`inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e5c576] ${tab === value ? "border-[#e5c576] bg-[#f3dec0] font-bold text-[#17202b] shadow-sm" : "border-transparent bg-transparent font-medium text-slate-300 hover:bg-white/10 hover:text-white"}`}
                    >
                        <span aria-hidden="true" className="h-4 w-4 shrink-0">
                            {tab === value && (
                                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                                    <path fillRule="evenodd" d="M10 1a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm4.28 6.22a.75.75 0 0 1 0 1.06l-5 5a.75.75 0 0 1-1.06 0l-2.5-2.5a.75.75 0 1 1 1.06-1.06l1.97 1.97 4.47-4.47a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
                                </svg>
                            )}
                        </span>
                        <span>{label}</span>
                        {counts[value] > 0 && (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${tab === value ? "bg-[#17202b] text-white" : "bg-white/15 text-white"}`}>
                                {counts[value]}
                            </span>
                        )}
                    </button>
                ))}
            </div>
            {tab === "dm" ? (
                <DirectMessagesPage key={role} role={role} />
            ) : (
                <BookingMessagesPage key={role} role={role} />
            )}
        </div>
    );
}
