import { RoleBlocks } from "../components/messages/RoleBlocks";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { apiRequest } from "../lib/api";
import {
    dmBase,
    dmError,
    type DmSettings,
    type DmThread,
    type MessageRole,
} from "../lib/directMessages";

export function DirectMessagesPage({ role }: { role: MessageRole }) {
    const { token } = useAuth();
    const location = useLocation();
    const [search, setSearch] = useState("");
    const [settingsOpen, setSettingsOpen] = useState(false);
    const expanded = useRef(false);
    const [threads, setThreads] = useState<DmThread[]>([]);
    const [settings, setSettings] = useState<DmSettings | null>(null);
    const [filter, setFilter] = useState("all");
    const [cursor, setCursor] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const load = useCallback(
        async (signal?: AbortSignal, next?: string) => {
            if (!token) return;
            try {
                const [inbox, config] = await Promise.all([
                    apiRequest<{
                        data: DmThread[];
                        meta: { next_cursor: string | null };
                    }>(
                        `${dmBase(role)}?filter=${filter}${next ? `&cursor=${encodeURIComponent(next)}` : ""}`,
                        { token, signal },
                    ),
                    apiRequest<{ data: DmSettings }>(
                        `${dmBase(role)}/settings`,
                        { token, signal },
                    ),
                ]);
                if (signal?.aborted) return;
                setThreads((old) =>
                    next
                        ? [
                              ...old,
                              ...inbox.data.filter(
                                  (t) =>
                                      !old.some(
                                          (o) => o.public_id === t.public_id,
                                      ),
                              ),
                          ]
                        : expanded.current
                          ? [
                                ...inbox.data,
                                ...old.filter(
                                    (t) =>
                                        !inbox.data.some(
                                            (n) => n.public_id === t.public_id,
                                        ),
                                ),
                            ]
                          : inbox.data,
                );
                if (next || !expanded.current)
                    setCursor(inbox.meta.next_cursor);
                if (next) expanded.current = true;
                setSettings(config.data);
                setError("");
            } catch (e) {
                if (!signal?.aborted) setError(dmError(e));
            } finally {
                if (!signal?.aborted) setLoading(false);
            }
        },
        [token, role, filter],
    );
    useEffect(() => {
        const abort = new AbortController();
        expanded.current = false;
        setThreads([]);
        setLoading(true);
        void load(abort.signal);
        const timer = setInterval(() => {
            if (!document.hidden) void load(abort.signal);
        }, 30000);
        const refresh = () => {
            if (!document.hidden) void load(abort.signal);
        };
        window.addEventListener("booking-message-summary:refresh", refresh);
        return () => {
            window.removeEventListener(
                "booking-message-summary:refresh",
                refresh,
            );
            abort.abort();
            clearInterval(timer);
        };
    }, [load]);
    async function updateSettings(change: Partial<DmSettings>) {
        setSaving(true);
        setError("");
        try {
            setSettings(
                (
                    await apiRequest<{ data: DmSettings }>(
                        `${dmBase(role)}/settings`,
                        { token, method: "PATCH", body: change },
                    )
                ).data,
            );
        } catch (e) {
            setError(dmError(e));
        } finally {
            setSaving(false);
        }
    }
    return (
        <section className="text-slate-900">
            <div className="space-y-3 px-4 pb-3">
                <input
                    aria-label="会話を検索"
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="会話を検索"
                    className="min-h-11 w-full rounded-full border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#b5894d]"
                />
                <div className="flex items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm">
                        <span className="sr-only">表示</span>
                        <select
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            className="min-h-10 rounded-full border border-slate-200 bg-white px-3 text-xs text-slate-600"
                        >
                            <option value="all">すべて</option>
                            <option value="unread">未読</option>
                            <option value="archived">アーカイブ</option>
                        </select>
                    </label>{" "}
                    <button
                        type="button"
                        aria-expanded={settingsOpen}
                        onClick={() => setSettingsOpen(!settingsOpen)}
                        className="min-h-10 rounded-full px-3 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                    >
                        DMの設定
                    </button>
                </div>
                {settingsOpen && (
                    <div className="space-y-3 border-t border-slate-100 pt-3">
                        <p className="text-sm text-slate-600">
                            {role === "user"
                                ? "予約前の質問などを、キャストとやり取りできます。"
                                : "利用者から届いた相談に、キャストとして返信できます。"}
                        </p>
                        {settings && (
                            <div className="rounded-xl bg-[#faf5ee] p-4 text-sm">
                                {!settings.enabled && (
                                    <p>
                                        DMの新規受付・送信は現在停止しています。
                                    </p>
                                )}
                                {role === "therapist" && (
                                    <label className="mb-3 flex min-h-11 items-center gap-3">
                                        <input
                                            type="checkbox"
                                            checked={
                                                !!settings.consultation_enabled
                                            }
                                            disabled={
                                                saving || !settings.enabled
                                            }
                                            onChange={(e) =>
                                                void updateSettings({
                                                    consultation_enabled:
                                                        e.target.checked,
                                                })
                                            }
                                        />
                                        新しいDMの受付：
                                        {settings.consultation_enabled
                                            ? "ON"
                                            : "OFF"}
                                    </label>
                                )}
                                {role === "therapist" && (
                                    <p className="mb-3 text-xs text-slate-600">
                                        予約の受付とは別の設定です。OFFに戻しても、開始済みのDMは続けられます。
                                    </p>
                                )}
                                <label className="flex min-h-10 items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={settings.email_enabled}
                                        disabled={saving}
                                        onChange={(e) =>
                                            void updateSettings({
                                                email_enabled: e.target.checked,
                                            })
                                        }
                                    />
                                    この役割のDMをメールで知らせる
                                </label>
                                <label className="flex min-h-10 items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={settings.push_enabled}
                                        disabled={saving}
                                        onChange={(e) =>
                                            void updateSettings({
                                                push_enabled: e.target.checked,
                                            })
                                        }
                                    />
                                    この役割のDMをプッシュ通知する
                                </label>
                                <p className="mt-1 text-xs text-slate-500">
                                    通知に相手の名前・文章・画像は表示されません。
                                </p>
                            </div>
                        )}
                        <RoleBlocks role={role} />
                    </div>
                )}
            </div>
            {error && (
                <p role="alert" className="text-sm text-red-700">
                    {error}
                </p>
            )}
            {loading ? (
                <p>DMを読み込み中…</p>
            ) : threads.length === 0 ? (
                <div className="rounded-xl bg-slate-50 p-6 text-center">
                    <p>まだDMはありません。</p>
                    <p className="mt-2 text-sm text-slate-600">
                        {role === "user"
                            ? "キャストのプロフィールから「予約前に質問する」を選んでください。"
                            : "DM受付をONにすると、プロフィールから相談を受け付けられます。"}
                    </p>
                </div>
            ) : (
                <div className="divide-y divide-slate-100">
                    {search &&
                        !threads.some((t) =>
                            t.counterparty.display_name
                                .toLowerCase()
                                .includes(search.toLowerCase()),
                        ) && (
                            <p className="p-6 text-center text-sm text-slate-500">
                                一致する会話がありません。
                            </p>
                        )}
                    {threads
                        .filter((t) =>
                            t.counterparty.display_name
                                .toLowerCase()
                                .includes(search.toLowerCase()),
                        )
                        .map((t) => (
                            <Link
                                key={t.public_id}
                                to={`${dmBase(role)}/${t.public_id}`}
                                aria-current={
                                    location.pathname.endsWith(
                                        `/${t.public_id}`,
                                    )
                                        ? "page"
                                        : undefined
                                }
                                className={`flex gap-3 border-l-2 px-4 py-4 transition ${location.pathname.endsWith(`/${t.public_id}`) ? "border-[#b5894d] bg-[#faf5ee]" : "border-transparent hover:bg-slate-50"}`}
                            >
                                {t.counterparty.avatar_url ? (
                                    <img
                                        src={t.counterparty.avatar_url}
                                        alt=""
                                        className="h-12 w-12 shrink-0 rounded-full object-cover"
                                    />
                                ) : (
                                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#f3e5d1]">
                                        {t.counterparty.display_name.slice(
                                            0,
                                            1,
                                        )}
                                    </span>
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold">
                                        {t.counterparty.display_name}{" "}
                                        {t.unread_count > 0 && (
                                            <span className="text-sm text-red-700">
                                                未読 {t.unread_count}
                                            </span>
                                        )}
                                    </p>
                                    <p className="truncate text-sm text-slate-600">
                                        {t.preview ??
                                            "メッセージは削除されました"}
                                    </p>
                                    {!t.can_send && (
                                        <p className="text-xs text-slate-500">
                                            現在送信できません
                                        </p>
                                    )}
                                    {role === "therapist" &&
                                        !t.first_reply_at &&
                                        t.last_message_at &&
                                        Date.now() -
                                            Date.parse(t.last_message_at) >
                                            86400000 && (
                                            <p className="text-xs text-amber-700">
                                                初回の返信をお待ちです
                                            </p>
                                        )}
                                </div>
                                <time className="shrink-0 text-[11px] text-slate-400">
                                    {t.last_message_at
                                        ? new Date(
                                              t.last_message_at,
                                          ).toLocaleDateString("ja-JP")
                                        : ""}
                                </time>
                            </Link>
                        ))}
                </div>
            )}
            {cursor && (
                <button
                    type="button"
                    onClick={() => void load(undefined, cursor)}
                    className="min-h-11 underline"
                >
                    さらに表示
                </button>
            )}
        </section>
    );
}
