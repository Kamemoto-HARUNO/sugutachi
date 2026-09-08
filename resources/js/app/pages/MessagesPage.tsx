import { MessageSelect } from "../components/messages/MessageSelect";
import { useEffect, useState } from "react";
import {
    Link,
    useLocation,
    useNavigate,
    useSearchParams,
} from "react-router-dom";
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
    const { account, token, hasRole, selectRole } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const key = `messages-tab:${account?.public_id}:${role}`;
    const stored = localStorage.getItem(key);
    const detailTab = location.pathname.includes("/direct-messages/")
        ? "dm"
        : location.pathname.includes("/bookings/")
          ? "bookings"
          : null;
    const tab =
        detailTab ??
        ((params.get("tab") ?? stored ?? "dm") === "dm" ? "dm" : "bookings");
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
        <div className="flex h-full min-h-0 flex-col">
            <header className="flex min-h-[76px] shrink-0 items-center gap-2 px-3 py-2 sm:px-5">
                <Link
                    to={`/${role}/dashboard`}
                    aria-label="マイページに戻る"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-slate-100"
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
                <h2 className="min-w-0 flex-1 truncate text-lg font-bold sm:text-xl">
                    メッセージ
                </h2>
                <MessageSelect
                    aria-label="メッセージの役割"
                    value={role}
                    onChange={(e) => {
                        const next = e.target.value as MessageRole;
                        selectRole(next);
                        navigate(`/${next}/messages?tab=dm`);
                    }}
                    className="bg-slate-50 font-semibold"
                >
                    {hasRole("user") && <option value="user">利用者</option>}
                    {hasRole("therapist") && (
                        <option value="therapist">タチキャスト</option>
                    )}
                </MessageSelect>
            </header>
            <div
                className="mx-4 mb-3 flex shrink-0 gap-1 rounded-xl bg-slate-100 p-1"
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
                        onClick={() =>
                            navigate(`/${role}/messages?tab=${value}`)
                        }
                        className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5894d] ${tab === value ? "bg-white font-bold text-[#17202b] shadow-sm" : "font-medium text-slate-500 hover:text-slate-900"}`}
                    >
                        <span aria-hidden="true" className="h-4 w-4 shrink-0">
                            {tab === value && (
                                <svg
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                    className="h-4 w-4"
                                >
                                    <path
                                        fillRule="evenodd"
                                        d="M10 1a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm4.28 6.22a.75.75 0 0 1 0 1.06l-5 5a.75.75 0 0 1-1.06 0l-2.5-2.5a.75.75 0 1 1 1.06-1.06l1.97 1.97 4.47-4.47a.75.75 0 0 1 1.06 0Z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                            )}
                        </span>
                        <span>{label}</span>
                        {counts[value] > 0 && (
                            <span
                                className={`rounded-full px-2 py-0.5 text-xs font-bold ${tab === value ? "bg-[#17202b] text-white" : "bg-slate-200 text-slate-700"}`}
                            >
                                {counts[value]}
                            </span>
                        )}
                    </button>
                ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {tab === "dm" ? (
                    <DirectMessagesPage key={role} role={role} />
                ) : (
                    <BookingMessagesPage key={role} role={role} />
                )}
            </div>
        </div>
    );
}
