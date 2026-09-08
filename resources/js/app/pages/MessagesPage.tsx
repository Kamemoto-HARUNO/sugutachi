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
                className="flex gap-2"
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
                        className={`min-h-11 rounded-full px-5 py-2 text-sm font-semibold ${tab === value ? "bg-[#17202b] text-white" : "border border-[#ddcfb4] bg-white text-slate-900"}`}
                    >
                        {label}
                        {counts[value] > 0 ? `（${counts[value]}）` : ""}
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
